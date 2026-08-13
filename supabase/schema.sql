-- tap-tap 데이터베이스 스키마
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전하고, 이미 만든 팀·멤버는 그대로 유지됩니다.

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 테이블
-- ────────────────────────────────────────────────────────────

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

-- 초대코드는 발급 후 일정 시간이 지나면 만료된다 (무차별 대입을 막기 위해)
alter table public.teams add column if not exists invite_expires_at timestamptz;
update public.teams
   set invite_expires_at = now() + interval '24 hours'
 where invite_expires_at is null;

create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  nickname      text not null check (char_length(nickname) between 1 and 20),
  character_key text not null default 'cat'
                check (character_key in ('cat', 'dog', 'panda', 'duck', 'bunny')),
  device_id     text not null,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (team_id, nickname)
);

-- 한 기기가 여러 팀에 속할 수 있다.
-- (예전 스키마는 device_id 자체가 유일해서 한 팀만 가능했다 — 그 제약을 푼다)
alter table public.members drop constraint if exists members_device_id_key;
create unique index if not exists members_team_device_idx on public.members (team_id, device_id);
create index if not exists members_team_id_idx on public.members (team_id);
create index if not exists members_device_id_idx on public.members (device_id);

-- 정책을 하나도 만들지 않는다 = anon 키로 테이블에 직접 접근 불가.
-- 모든 읽기/쓰기는 아래 security definer 함수를 통해서만 이루어진다.
alter table public.teams   enable row level security;
alter table public.members enable row level security;

-- ────────────────────────────────────────────────────────────
-- 공통
-- ────────────────────────────────────────────────────────────

/** 한 기기가 동시에 속할 수 있는 팀 수 */
create or replace function public.max_teams_per_device()
returns int language sql immutable as $$ select 3 $$;

/** 팀 하나에 들어갈 수 있는 사람 수 */
create or replace function public.max_members_per_team()
returns int language sql immutable as $$ select 5 $$;

/** 초대코드가 살아있는 시간. 지나면 그 코드로는 아무도 못 들어온다. */
create or replace function public.invite_ttl()
returns interval language sql immutable as $$ select interval '24 hours' $$;

-- 초대코드: 혼동하기 쉬운 0/O/1/I 를 뺀 32자에서 6자리
create or replace function public.gen_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.team_json(p_team public.teams)
returns json language sql immutable as $$
  select json_build_object(
    'id', p_team.id,
    'name', p_team.name,
    'inviteCode', p_team.invite_code,
    'inviteExpiresAt', p_team.invite_expires_at
  );
$$;

create or replace function public.member_json(p_member public.members)
returns json language sql immutable as $$
  select json_build_object(
    'id', p_member.id,
    'nickname', p_member.nickname,
    'characterKey', p_member.character_key,
    'joinedAt', p_member.created_at
  );
$$;

/** 팀 하나에 대한 내 소속 정보 + 그 팀의 전체 멤버 */
create or replace function public.membership_json(p_team public.teams, p_member public.members)
returns json language sql stable as $$
  select json_build_object(
    'team', public.team_json(p_team),
    'member', public.member_json(p_member),
    'members', coalesce(
      (select json_agg(public.member_json(o) order by o.created_at)
         from public.members o where o.team_id = p_team.id),
      '[]'::json
    )
  );
$$;

-- 시그니처가 바뀐 예전 함수들을 정리한다 (한 기기 = 한 팀 시절)
drop function if exists public.get_my_team(text);
drop function if exists public.set_character(text, text);
drop function if exists public.leave_team(text);

-- ────────────────────────────────────────────────────────────
-- RPC: 팀 만들기
-- ────────────────────────────────────────────────────────────

create or replace function public.create_team(
  p_name          text,
  p_nickname      text,
  p_device_id     text,
  p_character_key text default 'cat'
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text;
  v_team   public.teams;
  v_member public.members;
  v_try    int := 0;
begin
  if coalesce(trim(p_nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  if coalesce(trim(p_device_id), '') = '' then raise exception 'DEVICE_ID_REQUIRED'; end if;

  if (select count(*) from members where device_id = p_device_id) >= max_teams_per_device() then
    raise exception 'TEAM_LIMIT_REACHED';
  end if;

  loop
    v_try := v_try + 1;
    v_code := gen_invite_code();
    exit when not exists (select 1 from teams where invite_code = v_code);
    if v_try > 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
  end loop;

  insert into teams (name, invite_code, invite_expires_at)
  values (coalesce(nullif(trim(p_name), ''), '우리 팀'), v_code, now() + invite_ttl())
  returning * into v_team;

  insert into members (team_id, nickname, character_key, device_id)
  values (v_team.id, trim(p_nickname), coalesce(p_character_key, 'cat'), p_device_id)
  returning * into v_member;

  return membership_json(v_team, v_member);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: 초대코드로 참여
-- ────────────────────────────────────────────────────────────

create or replace function public.join_team(
  p_invite_code   text,
  p_nickname      text,
  p_device_id     text,
  p_character_key text default 'cat'
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team     public.teams;
  v_member   public.members;
  v_nickname text := trim(p_nickname);
begin
  if coalesce(v_nickname, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  if coalesce(trim(p_device_id), '') = '' then raise exception 'DEVICE_ID_REQUIRED'; end if;

  select * into v_team from teams where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'INVALID_INVITE_CODE'; end if;

  if v_team.invite_expires_at is null or v_team.invite_expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;

  -- 같은 팀 안에 같은 닉네임이 이미 있는데 내 기기가 아니면 거절
  if exists (
    select 1 from members
    where team_id = v_team.id and nickname = v_nickname and device_id <> p_device_id
  ) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  select * into v_member from members where team_id = v_team.id and device_id = p_device_id;

  if found then
    -- 이미 들어와 있는 팀이면 닉네임·캐릭터만 새로 맞춘다
    update members
       set nickname = v_nickname,
           character_key = coalesce(p_character_key, character_key)
     where id = v_member.id
    returning * into v_member;
  else
    if (select count(*) from members where device_id = p_device_id) >= max_teams_per_device() then
      raise exception 'TEAM_LIMIT_REACHED';
    end if;

    if (select count(*) from members where team_id = v_team.id) >= max_members_per_team() then
      raise exception 'TEAM_FULL';
    end if;

    insert into members (team_id, nickname, character_key, device_id)
    values (v_team.id, v_nickname, coalesce(p_character_key, 'cat'), p_device_id)
    returning * into v_member;
  end if;

  return membership_json(v_team, v_member);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: 내가 속한 팀 전부 (앱 시작 시 복귀용)
-- ────────────────────────────────────────────────────────────

create or replace function public.get_my_teams(p_device_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  update members set last_seen_at = now() where device_id = p_device_id;

  select coalesce(json_agg(entry order by joined), '[]'::json)
  into v_result
  from (
    select membership_json(t, m) as entry, m.created_at as joined
      from members m
      join teams t on t.id = m.team_id
     where m.device_id = p_device_id
  ) s;

  return v_result;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: 캐릭터 변경 / 팀 나가기
-- ────────────────────────────────────────────────────────────

create or replace function public.set_character(
  p_device_id     text,
  p_team_id       uuid,
  p_character_key text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
begin
  update members set character_key = p_character_key
   where device_id = p_device_id and team_id = p_team_id
  returning * into v_member;

  if not found then raise exception 'NOT_A_MEMBER'; end if;
  return member_json(v_member);
end;
$$;

/** 이 팀에서 쓰는 내 닉네임을 바꾼다 */
create or replace function public.set_nickname(
  p_device_id text,
  p_team_id   uuid,
  p_nickname  text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_name   text := trim(p_nickname);
begin
  if coalesce(v_name, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;

  if exists (
    select 1 from members
    where team_id = p_team_id and nickname = v_name and device_id <> p_device_id
  ) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  update members set nickname = v_name
   where device_id = p_device_id and team_id = p_team_id
  returning * into v_member;

  if not found then raise exception 'NOT_A_MEMBER'; end if;
  return member_json(v_member);
end;
$$;

/** 팀 이름을 바꾼다. 그 팀 멤버면 누구나 바꿀 수 있다. */
create or replace function public.rename_team(
  p_device_id text,
  p_team_id   uuid,
  p_name      text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams;
  v_name text := trim(p_name);
begin
  if not exists (
    select 1 from members where team_id = p_team_id and device_id = p_device_id
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if coalesce(v_name, '') = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;

  update teams set name = v_name where id = p_team_id returning * into v_team;
  return team_json(v_team);
end;
$$;

/**
 * 초대코드를 새로 발급한다. 예전 코드는 그 즉시 못 쓰게 된다.
 * 그 팀 멤버만 부를 수 있다.
 */
create or replace function public.refresh_invite(p_device_id text, p_team_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams;
  v_code text;
  v_try  int := 0;
begin
  if not exists (
    select 1 from members where team_id = p_team_id and device_id = p_device_id
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  loop
    v_try := v_try + 1;
    v_code := gen_invite_code();
    exit when not exists (select 1 from teams where invite_code = v_code);
    if v_try > 20 then raise exception 'CODE_GENERATION_FAILED'; end if;
  end loop;

  update teams
     set invite_code = v_code,
         invite_expires_at = now() + invite_ttl()
   where id = p_team_id
  returning * into v_team;

  return team_json(v_team);
end;
$$;

create or replace function public.leave_team(p_device_id text, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from members where device_id = p_device_id and team_id = p_team_id;

  -- 마지막 사람이 나갔으면 빈 팀은 남겨둘 이유가 없다.
  -- (초대코드도 함께 사라져 다시 쓸 수 없게 된다)
  if not exists (select 1 from members where team_id = p_team_id) then
    delete from teams where id = p_team_id;
  end if;
end;
$$;

-- 예전에 남아 있던 빈 팀 정리 (아무도 없는 팀은 되살릴 방법이 없다)
delete from public.teams t
 where not exists (select 1 from public.members m where m.team_id = t.id);

-- ────────────────────────────────────────────────────────────
-- anon 키가 호출할 수 있는 함수 목록
-- ────────────────────────────────────────────────────────────

revoke all on function public.gen_invite_code() from public, anon;

grant execute on function public.create_team(text, text, text, text)   to anon, authenticated;
grant execute on function public.join_team(text, text, text, text)     to anon, authenticated;
grant execute on function public.get_my_teams(text)                    to anon, authenticated;
grant execute on function public.set_character(text, uuid, text)       to anon, authenticated;
grant execute on function public.leave_team(text, uuid)                to anon, authenticated;
grant execute on function public.refresh_invite(text, uuid)            to anon, authenticated;
grant execute on function public.set_nickname(text, uuid, text)        to anon, authenticated;
grant execute on function public.rename_team(text, uuid, text)         to anon, authenticated;
grant execute on function public.invite_ttl()                          to anon, authenticated;
grant execute on function public.max_teams_per_device()                to anon, authenticated;
grant execute on function public.max_members_per_team()                to anon, authenticated;
