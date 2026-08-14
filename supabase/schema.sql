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

-- 누가 나인지는 Supabase 익명 로그인이 정한다.
--
-- 예전에는 클라이언트가 만든 device_id 문자열을 그대로 믿었다. 서버가 그게 진짜인지
-- 물어볼 방법이 없어서, 남의 값을 알아내면 그 사람 행세를 할 수 있었고 값을 새로
-- 지어내면 팀 개수 제한도 무의미했다. auth.uid() 는 서버가 발급하고 서버가 검증한다.
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  nickname      text not null check (char_length(nickname) between 1 and 20),
  character_key text not null default 'cat'
                check (character_key in ('cat', 'dog', 'panda', 'duck', 'bunny')),
  user_id       uuid not null references auth.users(id) on delete cascade,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (team_id, nickname)
);

-- device_id 시절에서 넘어오는 데이터베이스를 정리한다.
--
-- 옮겨 담지 않고 지운다. device_id 에 대응하는 계정이 없어서 되살릴 방법이 없기
-- 때문이다. 아직 쓰는 사람이 없을 때만 할 수 있는 일이고, 그래서 지금 한다.
alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
delete from public.members where user_id is null;
alter table public.members alter column user_id set not null;
alter table public.members drop column if exists device_id;

-- 한 사람이 여러 팀에 속할 수 있다.
alter table public.members drop constraint if exists members_device_id_key;
drop index if exists public.members_team_device_idx;
drop index if exists public.members_device_id_idx;
create unique index if not exists members_team_user_idx on public.members (team_id, user_id);
create index if not exists members_team_id_idx on public.members (team_id);
create index if not exists members_user_id_idx on public.members (user_id);

-- 정책을 하나도 만들지 않는다 = anon 키로 테이블에 직접 접근 불가.
-- 모든 읽기/쓰기는 아래 security definer 함수를 통해서만 이루어진다.
alter table public.teams   enable row level security;
alter table public.members enable row level security;

-- ────────────────────────────────────────────────────────────
-- 공통
-- ────────────────────────────────────────────────────────────

/** 한 사람이 동시에 속할 수 있는 팀 수 */
create or replace function public.max_teams_per_user()
returns int language sql immutable as $$ select 3 $$;

-- 기기 단위로 세던 시절의 이름
drop function if exists public.max_teams_per_device();

/** 팀 하나에 들어갈 수 있는 사람 수 */
create or replace function public.max_members_per_team()
returns int language sql immutable as $$ select 5 $$;

/** 초대코드가 살아있는 시간. 지나면 그 코드로는 아무도 못 들어온다. */
create or replace function public.invite_ttl()
returns interval language sql immutable as $$ select interval '24 hours' $$;

-- 초대코드: 혼동하기 쉬운 0/O/1/I 를 뺀 32자에서 8자리
--
-- random() 을 쓰지 않는다. 세션마다 시드되는 예측 가능한 PRNG 라서, 남이 맞히면 안 되는
-- 값을 만드는 데 쓸 것이 아니다. pgcrypto 는 맨 위에서 이미 켜 뒀다.
--
-- 8자리인 이유는 이 코드가 팀에 들어오는 유일한 문이고 시도 횟수를 세는 곳이 없기
-- 때문이다. 6자리(30비트)는 초당 1000번 두드리면 몇 시간이면 뚫린다. 24시간 만료는
-- 두드릴 수 있는 창을 줄일 뿐 속도를 줄이지 못한다. 8자리면 40비트가 되어 같은 속도로
-- 수십 년이 걸린다.
--
-- 알파벳이 32자, 즉 2의 거듭제곱이라 바이트를 5비트로 잘라 써도 특정 글자가 더 자주
-- 나오지 않는다. (32가 아니었다면 나머지 연산에서 편향이 생긴다)
--
-- search_path 에 extensions 를 함께 적는 이유: gen_random_bytes 는 pgcrypto 함수인데
-- Supabase 는 확장을 public 이 아니라 extensions 스키마에 두는 구성이 많다. 이 함수를
-- 부르는 create_team·refresh_invite 는 `set search_path = public` 이라, 여기서 다시
-- 잡아 주지 않으면 "함수가 없다"로 넘어진다. 없는 스키마를 적어 두는 것은 무해하다.
create or replace function public.gen_invite_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes    constant bytea := gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) & 31), 1);
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

-- 시그니처가 바뀐 예전 함수들을 정리한다.
--
-- create or replace 로는 인자를 없앨 수 없다 — 이름이 같아도 인자가 다르면 새 함수가
-- 하나 더 생길 뿐이라, device_id 를 받던 옛 함수가 그대로 살아남는다. 그러면 그쪽으로
-- 부르는 것만으로 이번 변경이 통째로 우회된다. 반드시 지우고 다시 만든다.
drop function if exists public.get_my_team(text);
drop function if exists public.set_character(text, text);
drop function if exists public.leave_team(text);

drop function if exists public.create_team(text, text, text, text);
drop function if exists public.join_team(text, text, text, text);
drop function if exists public.get_my_teams(text);
drop function if exists public.set_character(text, uuid, text);
drop function if exists public.set_nickname(text, uuid, text);
drop function if exists public.rename_team(text, uuid, text);
drop function if exists public.refresh_invite(text, uuid);
drop function if exists public.leave_team(text, uuid);

-- ────────────────────────────────────────────────────────────
-- RPC: 팀 만들기
-- ────────────────────────────────────────────────────────────

create or replace function public.create_team(
  p_name          text,
  p_nickname      text,
  p_character_key text default 'cat'
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_code   text;
  v_team   public.teams;
  v_member public.members;
  v_try    int := 0;
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(trim(p_nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;

  if (select count(*) from members where user_id = v_user) >= max_teams_per_user() then
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

  insert into members (team_id, nickname, character_key, user_id)
  values (v_team.id, trim(p_nickname), coalesce(p_character_key, 'cat'), v_user)
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
  p_character_key text default 'cat'
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_team     public.teams;
  v_member   public.members;
  v_nickname text := trim(p_nickname);
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(v_nickname, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;

  select * into v_team from teams where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'INVALID_INVITE_CODE'; end if;

  if v_team.invite_expires_at is null or v_team.invite_expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;

  -- 같은 팀 안에 같은 닉네임이 이미 있는데 내가 아니면 거절
  if exists (
    select 1 from members
    where team_id = v_team.id and nickname = v_nickname and user_id <> v_user
  ) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  select * into v_member from members where team_id = v_team.id and user_id = v_user;

  if found then
    -- 이미 들어와 있는 팀이면 닉네임·캐릭터만 새로 맞춘다
    update members
       set nickname = v_nickname,
           character_key = coalesce(p_character_key, character_key)
     where id = v_member.id
    returning * into v_member;
  else
    if (select count(*) from members where user_id = v_user) >= max_teams_per_user() then
      raise exception 'TEAM_LIMIT_REACHED';
    end if;

    if (select count(*) from members where team_id = v_team.id) >= max_members_per_team() then
      raise exception 'TEAM_FULL';
    end if;

    insert into members (team_id, nickname, character_key, user_id)
    values (v_team.id, v_nickname, coalesce(p_character_key, 'cat'), v_user)
    returning * into v_member;
  end if;

  return membership_json(v_team, v_member);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: 내가 속한 팀 전부 (앱 시작 시 복귀용)
-- ────────────────────────────────────────────────────────────

create or replace function public.get_my_teams()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_result json;
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;

  -- 읽기 함수인데 쓰기를 한 줄 한다. 앱이 얼마나 쓰이는지 재는 유일한 흔적이라
  -- 남겨 둔다 (지금은 읽는 곳이 없지만 어드민이 생기면 여기가 그 자리다).
  update members set last_seen_at = now() where user_id = v_user;

  select coalesce(json_agg(entry order by joined), '[]'::json)
  into v_result
  from (
    select membership_json(t, m) as entry, m.created_at as joined
      from members m
      join teams t on t.id = m.team_id
     where m.user_id = v_user
  ) s;

  return v_result;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: 캐릭터 변경 / 팀 나가기
-- ────────────────────────────────────────────────────────────

create or replace function public.set_character(
  p_team_id       uuid,
  p_character_key text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_member public.members;
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;

  update members set character_key = p_character_key
   where user_id = v_user and team_id = p_team_id
  returning * into v_member;

  if not found then raise exception 'NOT_A_MEMBER'; end if;
  return member_json(v_member);
end;
$$;

/** 이 팀에서 쓰는 내 닉네임을 바꾼다 */
create or replace function public.set_nickname(
  p_team_id   uuid,
  p_nickname  text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_member public.members;
  v_name   text := trim(p_nickname);
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(v_name, '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;

  if exists (
    select 1 from members
    where team_id = p_team_id and nickname = v_name and user_id <> v_user
  ) then
    raise exception 'NICKNAME_TAKEN';
  end if;

  update members set nickname = v_name
   where user_id = v_user and team_id = p_team_id
  returning * into v_member;

  if not found then raise exception 'NOT_A_MEMBER'; end if;
  return member_json(v_member);
end;
$$;

/** 팀 이름을 바꾼다. 그 팀 멤버면 누구나 바꿀 수 있다. */
create or replace function public.rename_team(
  p_team_id   uuid,
  p_name      text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams;
  v_name text := trim(p_name);
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;

  if not exists (
    select 1 from members where team_id = p_team_id and user_id = v_user
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
create or replace function public.refresh_invite(p_team_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams;
  v_code text;
  v_try  int := 0;
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;

  if not exists (
    select 1 from members where team_id = p_team_id and user_id = v_user
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

create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;

  delete from members where user_id = v_user and team_id = p_team_id;

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
-- 안 쓰는 익명 계정 정리
-- ────────────────────────────────────────────────────────────
--
-- 익명 계정은 앱을 설치할 때마다, 그리고 세션을 잃을 때마다 하나씩 늘어난다.
-- 대부분은 팀에 들어가지 않고 버려지는 것들이라 그냥 두면 계속 쌓인다.
--
-- 지우는 기준이 중요하다. members.user_id 가 `on delete cascade` 라서, 아직 쓰는
-- 사람을 잘못 지우면 그 사람의 팀 소속까지 함께 사라진다. 그래서 두 겹으로 막는다.
--
--   1) 어느 팀에도 속하지 않은 계정만  → 쓰는 사람은 반드시 members 에 줄이 있다
--   2) 만든 지 유예기간이 지난 계정만  → 지금 막 로그인하고 팀을 만드는 중인 사람을
--                                        쓸어가지 않기 위해서다
--
-- 1번만으로도 데이터를 잃지는 않지만(팀이 없으면 잃을 것도 없다), 2번이 없으면
-- 가입과 팀 생성 사이의 짧은 틈에 걸려 "팀 만들기"가 이유 없이 실패할 수 있다.
create or replace function public.cleanup_anonymous_users(
  p_grace interval default interval '7 days'
) returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted int;
begin
  delete from auth.users u
   where u.is_anonymous
     and greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at)) < now() - p_grace
     and not exists (select 1 from public.members m where m.user_id = u.id);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- 하루 한 번, 한국 시간으로 새벽 3시(UTC 18시)에 돌린다.
--
-- 이 앱 규모에서는 쌓이는 속도가 느려 더 자주 돌 이유가 없고, 반대로 주 단위로 미루면
-- 그만큼 안 쓰는 계정이 MAU 에 잡힌 채 남는다. 지우는 일 자체는 인덱스를 탄 삭제
-- 한 번이라 사람이 쓰는 시간에 돌아도 상관없지만, 굳이 한가한 때로 잡았다.
-- 예약을 거는 일은 이 파일 맨 끝에 있다. pg_cron 은 프로젝트마다 켜져 있기도 없기도
-- 한데, 그걸 여기서 건드리다 넘어지면 뒤에 오는 실시간 정책과 권한이 통째로 안 만들어진다.
-- 잠그는 일이 먼저고, 청소는 나중이다.

-- ────────────────────────────────────────────────────────────
-- 실시간 채널: 팀원만 자기 팀 채널에 붙는다
-- ────────────────────────────────────────────────────────────
--
-- 예전에는 public 채널이었다. 서버가 접근을 전혀 심사하지 않아서, 팀 UUID 만 알면
-- 누구나 붙어 "누가 콕 찔렀다"를 엿듣고 가짜 신호까지 넣을 수 있었다. 팀에서 빼도
-- 계속 들렸다 — public 채널에는 "나가기"라는 개념 자체가 없다.
--
-- 이 정책이 그 문을 닫는다. 심사는 JWT 를 보고 하므로, 익명 로그인으로 auth.uid()
-- 가 생긴 지금에서야 쓸 수 있게 됐다.
--
-- 판단을 security definer 함수에 맡기는 이유가 중요하다. 정책은 **접속하는 사람의
-- 권한으로** 평가된다. 그런데 members 는 RLS 가 켜져 있고 정책이 하나도 없어서(맨 위
-- 참고), 정책 안에서 members 를 직접 조회하면 언제나 0행이 나온다. 그러면 팀원까지
-- 포함해 아무도 못 붙는다. security definer 로 한 겹 감싸야 그 벽을 넘어 읽는다.
--
-- 토픽을 uuid 로 캐스팅하지 않고 문자열로 맞춰 보는 것도 일부러다. 이 정책은 team:
-- 으로 시작하지 않는 토픽에도 걸리는데, 거기서 캐스팅하면 판단 대신 오류가 난다.
create or replace function public.can_join_topic(p_topic text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and p_topic = 'team:' || m.team_id::text
  );
$$;

drop policy if exists "team members read own channel"  on realtime.messages;
drop policy if exists "team members write own channel" on realtime.messages;

create policy "team members read own channel"
on realtime.messages for select to authenticated
using (public.can_join_topic(realtime.topic()));

create policy "team members write own channel"
on realtime.messages for insert to authenticated
with check (public.can_join_topic(realtime.topic()));

-- ────────────────────────────────────────────────────────────
-- 로그인한 사람이 호출할 수 있는 함수 목록
-- ────────────────────────────────────────────────────────────
--
-- 먼저 전부 회수하는 이유: PostgreSQL 은 함수를 만들 때 EXECUTE 를 PUBLIC 에
-- 자동으로 준다. 그래서 "grant 를 안 했으니 안 열렸다"는 착각이 성립하지 않는다.
-- 예전 스키마는 gen_invite_code 하나만 회수해 두고 나머지는 grant 줄에 기대고
-- 있었는데, 그 줄들은 사실 전부 있으나 마나였다.
--
-- anon 에게는 이제 아무것도 주지 않는다. 로그인하지 않고 할 수 있는 일이 없다.
revoke all on all functions in schema public from public, anon;

grant execute on function public.create_team(text, text, text)  to authenticated;
grant execute on function public.join_team(text, text, text)    to authenticated;
grant execute on function public.get_my_teams()                 to authenticated;
grant execute on function public.set_character(uuid, text)      to authenticated;
grant execute on function public.leave_team(uuid)               to authenticated;
grant execute on function public.refresh_invite(uuid)           to authenticated;
grant execute on function public.set_nickname(uuid, text)       to authenticated;
grant execute on function public.rename_team(uuid, text)        to authenticated;
grant execute on function public.invite_ttl()                   to authenticated;
grant execute on function public.max_teams_per_user()           to authenticated;
grant execute on function public.max_members_per_team()         to authenticated;

-- 실시간 정책이 접속자 권한으로 부르는 함수라 여기 있어야 한다. 빠뜨리면 정책이
-- 함수를 실행하지 못해 팀원까지 전부 채널에서 막힌다.
-- (알려 주는 것은 "내가 그 팀 멤버인가" 하나뿐이고, 그건 본인이 이미 아는 사실이다)
grant execute on function public.can_join_topic(text)           to authenticated;

-- cleanup_anonymous_users 는 일부러 이 목록에 없다. 계정을 지우는 함수라 앱이 부를 일이
-- 없고, 위 일괄 회수에 걸려 아무 역할도 실행할 수 없다. 예약된 작업은 이 함수의 주인
-- 권한으로 돌기 때문에 그것만으로 충분하다. (빠진 줄이 아니다 — 넣지 마세요)

-- ────────────────────────────────────────────────────────────
-- 안 쓰는 익명 계정 정리 예약 (맨 마지막)
-- ────────────────────────────────────────────────────────────
--
-- 여기가 파일의 끝인 것은 일부러다. pg_cron 은 프로젝트마다 켜져 있기도 없기도 하고,
-- 켜는 데 실패하면 그 자리에서 스크립트가 멈춘다. 앞쪽에 뒀다가는 잠금 정책과 권한이
-- 통째로 안 걸린 채 "실행됨"으로 끝나 버린다 — 조용히 열려 있는 상태가 제일 나쁘다.
--
-- 그래서 실패해도 나머지를 이미 다 끝낸 뒤이고, 예외를 삼켜 안내만 남긴다.
do $$
begin
  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice '[tap-tap] pg_cron 을 켜지 못해 자동 정리를 걸지 않았습니다 (%). 대시보드 Database → Extensions 에서 켠 뒤 이 파일을 다시 실행하세요. 나머지 설정은 모두 적용됐습니다.', sqlerrm;
    return;
  end;

  if exists (select 1 from cron.job where jobname = 'tap-tap-cleanup-anonymous') then
    perform cron.unschedule('tap-tap-cleanup-anonymous');
  end if;

  -- 하루 한 번, 한국 시간 새벽 3시 (UTC 18시)
  perform cron.schedule(
    'tap-tap-cleanup-anonymous',
    '0 18 * * *',
    $cron$select public.cleanup_anonymous_users()$cron$
  );

  raise notice '[tap-tap] 익명 계정 자동 정리를 매일 UTC 18시에 걸었습니다.';
end;
$$;
