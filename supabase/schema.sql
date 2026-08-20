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

-- 계정이 마지막으로 팀에서 나온 때.
--
-- **팀을 나가면 흔적이 통째로 사라진다.** `leave_team()` 이 `members` 줄을 지우고,
-- 마지막 사람이었으면 팀까지 지운다. 그래서 "언제 나갔나" 를 물어볼 곳이 없었다.
--
-- 그 한 가지를 알아야 하는 곳이 `cleanup_anonymous_users()` 다. 예전에는 유예 7일을
-- **계정을 만든 때**에서 쟀는데, 그러면 오래된 계정이 마지막 팀을 나가는 순간 두 번째
-- 조건이 진작에 참이라 **그날 밤 바로 지워졌다.** 유예가 하루도 없었던 셈이다.
--
-- `members` 에 `left_at` 을 더해 소프트 삭제하는 길은 택하지 않았다. 그러면 지금
-- `members` 를 세는 모든 곳(팀 인원 제한 · 팀 크기 · 활동자 집계 · 닉네임 유일성)이
-- "살아 있는 줄만" 을 따로 걸러야 하고, **한 곳만 빠뜨려도 조용히 틀린다.** 표를 따로
-- 두면 기존 질의를 하나도 건드리지 않는다.
--
-- `on delete cascade` 를 다는 이유는 계정이 지워질 때 이 줄도 함께 사라지게 하기
-- 위해서다. 안 달면 주인 없는 줄이 영영 쌓인다.
create table if not exists public.account_traces (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_left_at timestamptz not null default now()
);

-- 정책을 하나도 만들지 않는다 = anon 키로 테이블에 직접 접근 불가.
-- 모든 읽기/쓰기는 아래 security definer 함수를 통해서만 이루어진다.
alter table public.teams           enable row level security;
alter table public.members         enable row level security;
alter table public.account_traces  enable row level security;

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
-- 지워진 계정으로 들어오는 요청
-- ────────────────────────────────────────────────────────────
--
-- `cleanup_anonymous_users()` 가 지운 계정의 JWT 는 **서명이 그대로 유효하다.** 계정이
-- 사라져도 이미 발급된 토큰은 만료 전까지(최대 한 시간) 서버를 통과하고, `auth.uid()`
-- 는 이제 없는 UUID 를 돌려준다.
--
-- 그 상태로 `members` 에 줄을 넣으려 하면 `user_id` 외래키에 걸려 넘어지는데, 사람에게는
-- **이유를 알 수 없는 오류**로 보인다. 그래서 넣기 전에 미리 보고 열쇠로 바꾼다.
-- 앱은 그 열쇠를 받으면 세션을 버리고 다시 로그인한 뒤 한 번 다시 시도한다
-- (`services/session-recovery.ts`).
--
-- **외래키 오류를 통째로 잡아 이 열쇠로 바꾸지 않는 이유가 있다.** `members` 에는
-- `team_id` 외래키도 걸려 있어서, 팀이 그 사이 지워진 경우까지 "세션이 죽었다"로
-- 읽히게 된다. 그러면 앱이 멀쩡한 세션을 버리고 **그 사람의 팀 소속을 통째로 잃는다.**
-- 무엇이 없는지 정확히 짚어야 한다.
create or replace function public.account_exists(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$ select exists (select 1 from auth.users where id = p_user) $$;

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
  if not account_exists(v_user) then raise exception 'SESSION_EXPIRED'; end if;
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
  if not account_exists(v_user) then raise exception 'SESSION_EXPIRED'; end if;
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

  /*
   * 나온 시각을 남긴다. 이 줄이 없으면 `cleanup_anonymous_users()` 가 유예를 잴
   * 곳이 없어, 오래된 계정이 나가는 순간 그날 밤 바로 지워진다.
   *
   * 나갈 때마다 덮어쓴다. 여러 팀에 속한 사람이 그중 하나만 나가도 갱신되지만,
   * `members` 에 다른 줄이 남아 있으면 청소 대상이 아니라 아무 영향이 없다. 결국
   * **마지막 팀을 나가는 순간의 값**이 판단에 쓰인다.
   */
  insert into account_traces (user_id, last_left_at)
  values (v_user, now())
  on conflict (user_id) do update set last_left_at = excluded.last_left_at;

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
--   2) 마지막으로 팀에서 나온 지 유예기간이 지난 계정만
--      (팀에 한 번도 들어간 적이 없으면 계정을 만든 때부터 잰다)
--
-- 1번만으로도 데이터를 잃지는 않지만(팀이 없으면 잃을 것도 없다), 2번이 없으면
-- 가입과 팀 생성 사이의 짧은 틈에 걸려 "팀 만들기"가 이유 없이 실패할 수 있다.
--
-- **2번을 나온 때에서 재는 이유.** 예전에는 계정을 만든 때에서만 쟀다. 그러면 오래된
-- 계정이 마지막 팀을 나가는 순간 두 번째 조건은 진작에 참이라 **유예 없이 그날 밤
-- 바로 지워졌다.** 나가자마자 지우는 것과 다르지 않았던 셈이다. 데이터를 잃지는
-- 않지만(나갈 때 members 줄이 이미 사라졌다) 돌아올 사람에게 줄 여유가 없었다.
-- 그 시각을 `account_traces` 가 들고 있다 — `leave_team()` 이 남긴다.
--
-- 없는 사람에게는 `greatest(created_at, last_sign_in_at)` 으로 되돌아간다. 계정을
-- 만든 때보다 뒤로 미루기만 하는 값이라, 실수로 일찍 지우는 쪽으로는 기울지 않는다.
--
-- **소급 적용되지 않는다.** 이 표는 오늘부터 쌓이므로, 이미 나가 있는 계정들은
-- 여전히 만든 때로 판정되어 다음 청소에 지워진다. 새 기준은 앞으로 나가는 사람부터다.
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
     and not exists (select 1 from public.members m where m.user_id = u.id)
     and coalesce(
           (select t.last_left_at from public.account_traces t where t.user_id = u.id),
           greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at))
         ) < now() - p_grace;

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
-- 흔적 남기기 (얼마나 쓰이는지 재는 유일한 근거)
-- ────────────────────────────────────────────────────────────
--
-- `get_my_teams()` 도 `last_seen_at` 을 갱신하지만 그건 앱을 켤 때와 다시 붙을 때뿐이다.
-- **이 앱은 컴퓨터를 켜 두는 동안 계속 떠 있는 앱이라**, 껐다 켜지 않는 사람은 며칠이고
-- 갱신되지 않는다. 그러면 가장 오래 쓰는 사람이 가장 활동 없어 보이는, 방향이 거꾸로인
-- 오차가 생긴다. 그래서 앱이 **30분마다** 이 함수를 부른다
-- (`apps/desktop/src/main/session.ts` 의 `TOUCH_INTERVAL_MS`).
--
-- **그 주기와 어드민의 측정 창은 1:2 로 묶인 짝이다.** 어드민이 "지금 켜 둔 사람"을
-- 최근 1시간으로 세므로 주기가 그 절반이어야 켜 둔 사람의 흔적이 반드시 창 안에
-- 하나는 들어온다. 창과 같은 간격으로 남기면 경계에 걸린 사람이 셀 때마다 들락날락한다.
-- 한쪽만 고치면 숫자가 조용히 틀어지니 반드시 함께 본다.
create or replace function public.touch_member()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;
  update members set last_seen_at = now() where user_id = v_user;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 어드민 (읽기 전용)
-- ────────────────────────────────────────────────────────────
--
-- 표와 함수를 한 절에 모아 둔다. 이것들은 서로만 보고, 앱은 전혀 부르지 않는다.
--
-- **경계는 "이름은 나가고 열쇠는 나가지 않는다" 이다.**
--
-- 한동안은 집계만 내보냈다. 지금은 팀 이름과 닉네임까지 나간다 — 어느 팀이 활발한지
-- 숫자만으로는 알 수 없어서 그렇게 정했다. 대신 **초대코드는 여전히 나가지 않는다.**
-- 그것은 이름이 아니라 팀에 들어가는 열쇠라서, 새면 남의 팀에 그대로 들어갈 수 있다.
-- 계정 식별자(`user_id`)도 화면에서 쓸 일이 없으므로 내보내지 않는다.
--
-- **고치거나 지우는 함수는 여기 없다.** 읽기 전용이라는 것은 그대로다.

-- 어드민은 이메일로 정한다. **계정이 생기기 전에 미리 넣어 둘 수 있다** — 매직링크로
-- 처음 로그인하는 순간 그 계정이 이 표와 이어진다.
--
--   insert into public.admins (email) values ('you@example.com');
--
-- 정책을 하나도 만들지 않으므로 anon 키로는 이 표를 읽지도 쓰지도 못한다.
-- 비워 두면 아무도 못 들어간다. 그게 맞는 기본값이다.
create table if not exists public.admins (
  email      text primary key check (email = lower(email) and email like '%@%'),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

/**
 * 어드민이 아닌 주소로는 **계정이 아예 만들어지지 않게** 한다.
 *
 * Supabase Auth 의 `Before User Created` 훅으로 걸어 두는 함수다. 대시보드에서
 * **Authentication → Hooks → Before User Created** 에 이 함수를 지정해야 동작한다
 * (지정하지 않으면 아무 일도 하지 않는다).
 *
 * 이건 **벽이 아니라 소음 차단기다.** 진짜 벽은 `is_admin()` 이고, 훅이 없어도 남의
 * 계정으로는 숫자를 한 글자도 못 봅니다. 이 훅이 막는 것은 그 앞단이다 — 모르는 사람이
 * 어드민 화면에서 아무 주소나 넣어 링크를 요청하면, 그때마다 계정이 하나씩 생기고
 * **시간당 두 통뿐인 메일 한도를 남이 써 버린다.** 그걸 막는다.
 *
 * ## 반드시 지켜야 하는 두 가지
 *
 * **하나, 익명 로그인을 막으면 안 된다.** 이 훅은 이 프로젝트의 *모든* 계정 생성에
 * 걸리고, 앱은 익명 로그인으로 돌아간다. 익명 계정에는 메일이 없으므로 그때는 무조건
 * 통과시킨다. 여기를 잘못 건드리면 **앱 전체가 로그인하지 못한다.**
 *
 * **둘, 어떤 오류가 나도 통과시킨다.** 훅이 오류를 내면 Supabase 는 그 로그인 요청을
 * 실패로 끝낸다. 즉 여기서 실수하면 아무도 앱을 못 쓴다. 그래서 예외를 잡아 무조건
 * 통과로 떨어뜨린다 — **막지 못하는 것보다 못 들어가게 하는 것이 훨씬 나쁘다.**
 * 안전하게 이렇게 둘 수 있는 이유가 위의 "벽이 아니다" 이다.
 *
 * `admins` 가 비어 있을 때도 통과시킨다. 훅을 먼저 켜고 주소를 나중에 넣는 순서로 하면
 * 자기 계정조차 만들 수 없게 되는데, 그 상태는 원인을 짐작하기가 아주 어렵다.
 */
create or replace function public.restrict_admin_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := lower(nullif(trim(event -> 'user' ->> 'email'), ''));

  -- 앱의 익명 로그인. 메일이 없다.
  if v_email is null then return '{}'::jsonb; end if;

  -- 아직 아무도 등록하지 않았다 (위 주석 참고)
  if not exists (select 1 from public.admins) then return '{}'::jsonb; end if;

  if exists (select 1 from public.admins a where a.email = v_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', '등록된 어드민 주소가 아니에요.')
  );
exception
  when others then
    return '{}'::jsonb;
end;
$$;

/**
 * 지금 부르는 사람이 어드민인가.
 *
 * 익명 계정과 메일 확인이 안 된 계정은 거른다. 매직링크로 들어오면 그 순간
 * `email_confirmed_at` 이 채워지므로, 남의 주소를 적어 넣어도 그 메일함을 못 열면
 * 통과하지 못한다.
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from auth.users u
      join public.admins a on a.email = lower(u.email)
     where u.id = auth.uid()
       and coalesce(u.is_anonymous, false) = false
       and u.email_confirmed_at is not null
  )
$$;

/**
 * 지금 이 순간의 총계.
 *
 * 어드민 화면이 묻는 세 가지를 그대로 세 묶음으로 내보낸다 — `now`(지금 켜 두고 있나) ·
 * `live`·`total`(실제로 얼마나 쓰이나) · `fresh`(얼마나 새로 들어오나). 화면이 숫자를
 * 다시 짜맞추지 않아도 되도록 여기서 모양을 맞춰 준다.
 *
 * **사람과 팀은 세는 자가 다르다.** 사람은 흔적으로 세고(`last_seen_at`), 팀은 존재로
 * 센다. `leave_team()` 이 마지막 사람이 나갈 때 팀도 함께 지우므로 **남아 있는 팀이
 * 곧 쓰는 팀**이라, 팀에는 "살아 있는 팀" 을 따로 셀 것이 없다.
 *
 * `people` 과 `accounts` 는 다른 숫자다. 익명 계정은 앱을 다시 깔거나 세션을 잃을
 * 때마다 하나씩 늘어나므로 사람 수가 아니다 (그래서 `cleanup_anonymous_users` 가
 * 떠도는 것을 7일마다 지운다). **사람 수로 읽어야 하는 것은 `people` 이다.**
 *
 * `solo` 는 혼자만 있는 팀이다. 이 앱은 팀원 화면에 캐릭터가 뜨는 것이 전부라
 * 1인팀 비율이 높으면 핵심 가치가 전달되지 않고 있다는 뜻이다.
 */
create or replace function public.admin_overview()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_result json;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  -- 한 사람이 처음 팀에 들어온 때. "신규 유입"은 members 줄 수가 아니라 이것으로 센다 —
  -- 한 사람이 두 팀에 들면 줄은 둘이지만 새로 들어온 사람은 하나다.
  with firsts as (
    select user_id, min(created_at) as first_join from members group by user_id
  )
  select json_build_object(
    -- ① 지금. 앱이 30분마다 흔적을 남기므로(session.ts 의 TOUCH_INTERVAL_MS) 1시간
    -- 창이면 켜 둔 사람의 흔적이 반드시 하나는 들어온다. **이 둘은 짝이다** — 한쪽을
    -- 좁히면 다른 쪽도 좁혀야 하고, 안 그러면 켜 둔 사람이 셀 때마다 들락날락한다.
    'now', json_build_object(
      'people', (select count(distinct user_id) from members where last_seen_at > now() - interval '1 hour'),
      'teams',  (select count(distinct team_id) from members where last_seen_at > now() - interval '1 hour')
    ),

    -- ② 실제 사용
    'live', json_build_object(
      'people', (select count(distinct user_id) from members where last_seen_at > now() - interval '30 days')
    ),
    'total', json_build_object(
      'teams',   (select count(*) from teams),
      'members', (select count(*) from members),
      'people',  (select count(distinct user_id) from members)
    ),

    -- 마지막 흔적이 얼마나 최근인가
    'active', json_build_object(
      'd1',  (select count(distinct user_id) from members where last_seen_at > now() - interval '1 day'),
      'd7',  (select count(distinct user_id) from members where last_seen_at > now() - interval '7 days'),
      'd30', (select count(distinct user_id) from members where last_seen_at > now() - interval '30 days')
    ),

    -- ③ 신규 유입. `today` 의 날짜 경계는 한국 시간이다 — `admin_daily` 의 막대와 같은
    -- 자로 재야 카드와 막대가 서로 다른 말을 하지 않는다.
    'fresh', json_build_object(
      'teams', json_build_object(
        'today', (select count(*) from teams where (created_at at time zone 'Asia/Seoul')::date = v_today),
        'd7',    (select count(*) from teams where created_at > now() - interval '7 days'),
        'd30',   (select count(*) from teams where created_at > now() - interval '30 days')
      ),
      'people', json_build_object(
        'today', (select count(*) from firsts where (first_join at time zone 'Asia/Seoul')::date = v_today),
        'd7',    (select count(*) from firsts where first_join > now() - interval '7 days'),
        'd30',   (select count(*) from firsts where first_join > now() - interval '30 days')
      )
    ),

    'accounts', json_build_object(
      'total',     (select count(*) from auth.users),
      'anonymous', (select count(*) from auth.users where coalesce(is_anonymous, false)),
      -- 깔았지만 팀까지 가지 못한 사람 = 온보딩 이탈. **누적이 아니라 최근 일주일치다** —
      -- 팀 없는 익명 계정은 7일이 지나면 cleanup_anonymous_users() 가 지우기 때문이다.
      'stranded',  (select count(*) from auth.users u
                     where coalesce(u.is_anonymous, false)
                       and not exists (select 1 from members m where m.user_id = u.id))
    ),

    'solo', (select count(*) from (
      select team_id from members group by team_id having count(*) = 1
    ) s),
    'generatedAt', now()
  ) into v_result;

  return v_result;
end;
$$;

/**
 * 날짜별로 새로 생긴 팀과, 그날 처음 팀에 들어온 사람.
 *
 * **`newPeople` 은 `members` 줄 수가 아니다.** 한 사람이 두 팀에 들면 줄은 둘이지만
 * 새로 들어온 사람은 하나다. `admin_overview` 의 `fresh.people` 과 **같은 자로 재야**
 * 카드의 "30일 신규" 와 이 막대의 30일 합계가 서로 다른 말을 하지 않는다.
 *
 * **일별 활동자 이력은 여기서 만들 수 없다.** `last_seen_at` 은 마지막 한 번만 남는
 * 값이라 과거 어느 날 누가 왔는지는 기록이 없다. 있지도 않은 숫자를 그럴듯하게 짓느니
 * 만들 수 있는 것만 돌려준다. "지금 활동자"는 `admin_overview`, "언제 마지막으로
 * 왔나"는 `admin_distribution` 이 각각 답한다.
 *
 * 날짜 경계는 한국 시간이다. UTC 로 자르면 저녁에 만든 팀이 다음 날로 넘어간다.
 */
create or replace function public.admin_daily(p_days int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days   int := least(greatest(coalesce(p_days, 30), 1), 180);
  v_result json;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  with firsts as (
    select user_id, min(created_at) as first_join from members group by user_id
  )
  select coalesce(json_agg(json_build_object(
           'date',      to_char(d.day, 'YYYY-MM-DD'),
           'newTeams',  coalesce(t.n, 0),
           'newPeople', coalesce(p.n, 0)
         ) order by d.day), '[]'::json)
    into v_result
    from (
      select generate_series(
               (now() at time zone 'Asia/Seoul')::date - (v_days - 1),
               (now() at time zone 'Asia/Seoul')::date,
               interval '1 day'
             )::date as day
    ) d
    left join (
      select (created_at at time zone 'Asia/Seoul')::date as day, count(*) as n
        from teams group by 1
    ) t on t.day = d.day
    left join (
      select (first_join at time zone 'Asia/Seoul')::date as day, count(*) as n
        from firsts group by 1
    ) p on p.day = d.day;

  return v_result;
end;
$$;

/**
 * 세 가지 분포 — 팀 크기, 캐릭터, 마지막 흔적.
 *
 * 마지막 흔적 분포가 유지율 대신이다. 앱이 30분마다 흔적을 남기므로 `today` 는 지금
 * 쓰는 사람이고, 뒤로 갈수록 떠난 사람이다.
 */
create or replace function public.admin_distribution()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select json_build_object(
    'teamSizes', coalesce((
      select json_agg(json_build_object('size', size, 'teams', teams) order by size)
        from (
          select size, count(*) as teams
            from (select team_id, count(*) as size from members group by team_id) per_team
           group by size
        ) s
    ), '[]'::json),
    'characters', coalesce((
      select json_agg(json_build_object('key', character_key, 'members', n) order by n desc, character_key)
        from (select character_key, count(*) as n from members group by character_key) c
    ), '[]'::json),
    'lastSeen', json_build_object(
      'today',  (select count(distinct user_id) from members where last_seen_at > now() - interval '1 day'),
      'week',   (select count(distinct user_id) from members where last_seen_at <= now() - interval '1 day'  and last_seen_at > now() - interval '7 days'),
      'month',  (select count(distinct user_id) from members where last_seen_at <= now() - interval '7 days' and last_seen_at > now() - interval '30 days'),
      'older',  (select count(distinct user_id) from members where last_seen_at <= now() - interval '30 days')
    )
  ) into v_result;

  return v_result;
end;
$$;

/**
 * 팀 목록 — 이름과 팀원 닉네임까지.
 *
 * **이 함수는 이 파일의 다른 어드민 함수와 성격이 다르다.** 나머지 셋은 집계만
 * 돌려주지만 이것은 **사람이 손으로 적은 이름**을 그대로 내보낸다. 팀 이름과 닉네임에는
 * 본명·회사·부서가 들어 있을 수 있다.
 *
 * 그래서 무엇을 빼는지가 무엇을 넣는지만큼 중요하다.
 *
 *   - `invite_code` 를 넣지 않는다. **이것은 이름이 아니라 열쇠다** — 팀 이름과 함께
 *     새어 나가면 `join_team()` 으로 남의 팀에 그대로 들어갈 수 있다
 *   - `user_id` 를 넣지 않는다. 화면에서 쓸 일이 없다
 *
 * 팀 UUID(`id`)는 내보낸다. 화면에서 줄을 구별하는 데 필요하고(팀 이름은 유일하지
 * 않다), 표는 RLS 로 잠겨 있어 이 값만으로는 아무것도 열지 못한다. 팀에 들어가는
 * 문은 초대코드 하나뿐이다.
 *
 * 막는 일은 여전히 `is_admin()` 이 한다. 이 변경으로 넓어지는 것은 어드민에게뿐이고,
 * 대신 **어드민 계정이 뚫렸을 때 잃는 것이 커진다.** 그 계정의 메일함이 이 데이터의
 * 자물쇠라는 뜻이다.
 *
 * 정렬은 마지막 흔적이 최근인 순이다. 어드민이 열었을 때 먼저 보고 싶은 것은 지금
 * 쓰고 있는 팀이다.
 */
create or replace function public.admin_teams(p_limit int default 200)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_result json;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select json_build_object(
    'total', (select count(*) from teams),
    -- 몇 개까지 담았는지 함께 알려 준다. 말없이 자르면 화면이 "이게 전부"로 읽힌다.
    'limit', v_limit,
    'teams', coalesce((
      select json_agg(t order by t.last_seen desc nulls last)
        from (
          select json_build_object(
                   'id',        tm.id,
                   'name',      tm.name,
                   'createdAt', tm.created_at,
                   'lastSeen',  (select max(m.last_seen_at) from members m where m.team_id = tm.id),
                   'members',   coalesce((
                     select json_agg(json_build_object(
                              'nickname',  m.nickname,
                              'character', m.character_key,
                              'joinedAt',  m.created_at,
                              'lastSeen',  m.last_seen_at
                            ) order by m.created_at)
                       from members m where m.team_id = tm.id
                   ), '[]'::json)
                 ) as t,
                 (select max(m.last_seen_at) from members m where m.team_id = tm.id) as last_seen
            from teams tm
           order by last_seen desc nulls last
           limit v_limit
        ) rows
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

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
grant execute on function public.touch_member()                 to authenticated;

-- account_exists 는 **일부러 주지 않는다.** 위 함수들이 자기 안에서 부르는 것이고,
-- 그 호출은 security definer 권한으로 도므로 grant 가 필요 없다. 열어 두면 남의 계정
-- UUID 를 넣어 "그 계정이 있나"를 물어볼 수 있게 되는데, 알려 줄 이유가 없는 것이다.

-- 어드민용. 넷 다 첫 줄에서 is_admin() 을 확인하고 아니면 FORBIDDEN 으로 끝난다.
-- 그래서 anon 키가 브라우저에 그대로 실려 있어도 아무것도 새지 않는다.
-- is_admin() 자체는 열어 둔다 — 알려 주는 것은 "내가 어드민인가" 하나뿐이고, 어드민
-- 화면이 "로그인은 됐지만 권한 없음"을 구별해 안내하려면 이게 필요하다.
--
-- **admin_teams 는 이름을 내보낸다.** 나머지 셋과 달리 집계가 아니므로, 이 줄을
-- 더할 때는 무엇이 나가는지 함수 주석을 먼저 읽으세요.
grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.admin_overview()               to authenticated;
grant execute on function public.admin_daily(int)               to authenticated;
grant execute on function public.admin_distribution()           to authenticated;
grant execute on function public.admin_teams(int)               to authenticated;

-- 가입 제한 훅. **부르는 것은 Supabase Auth 이지 앱이 아니다.**
-- 이 두 줄이 없으면 훅을 대시보드에 걸어도 실행되지 않는다.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.restrict_admin_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.restrict_admin_signup(jsonb) from authenticated, anon, public;

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
