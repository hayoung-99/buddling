# 알림 화면 — 개발 설계

**근거 문서** [PRODUCT.md](../PRODUCT.md) 의 **"앞으로 → 알림 화면"** 절.
이 문서는 그 정의를 **어떻게 만들지**만 적습니다. 왜 그렇게 정했는지는 기획서에 있고,
둘이 어긋나 보이면 **기획서가 이깁니다.**

읽는 순서는 [CLAUDE.md](../../CLAUDE.md) → [DEVELOPMENT.md](../DEVELOPMENT.md) →
[PRODUCT.md](../PRODUCT.md) → 이 문서입니다.

---

## 한 줄

**들고 나는 일은 서버 표(`team_events`)에 한 줄씩 쌓고, 앱은 그것을 받아 그리기만
합니다.** 예외는 *내보내진 나 자신의 줄* 하나뿐이고, 그건 앱이 뺄셈으로 알아내 기기에
둡니다.

목록을 견주는 방식을 쓰지 않는 이유가 둘입니다. **스스로 나간 것과 내보내진 것을 가릴 수
없고**, 꺼져 있는 사이 들어왔다 나간 사람이 서로 상쇄되어 **아무 일도 없었던 것처럼**
보입니다.

```
누가 들어옴 / 나감 / 내보내짐
      │
      ├─ (같은 트랜잭션) team_events 에 한 줄            ← 서버가 사실을 적는다
      └─ roster 브로드캐스트 (이미 있는 통로)
                 │
       남아 있는 사람들 ── session.refresh()
                            ├─ net.getMyTeams()      (지금도 한다)
                            └─ net.getMyEvents()     (새로)
                                     │
                          get_my_events() RPC 가 거른다
                            · 내가 지금 멤버인 방만
                            · 내 members.created_at 보다 나중 줄만
                            · 내가 주인공인 줄은 빼고
                            · 최근 7일만
                                     │
                        AppState.notifications (서버 줄 + 내 강퇴 줄, 최신순)
```

---

## 이미 되어 있는 것 — 손대지 않습니다

브랜치 `feat/notifications-screen` 의 커밋 넷(`4fc1c89` · `8676655` · `ef77312` ·
`5a6a174`)이 만들어 둔 것입니다. **"아직 안 됐네" 로 읽고 다시 만들지 마세요.**

| 스펙 항목 | 어디에 |
|---|---|
| 별도 창 하나 (설정 창과 같은 꼴) | `main/windows.ts` 의 `createNotificationsWindow` · `renderer/notifications/` |
| 헤더가 있는 세 창의 아이콘 (`TeamList`·`TeamDetail`·`Settings`) | `renderer/NotificationButton.tsx` · `theme.css` 의 `no-drag-region` |
| 트레이 메뉴 진입점 | `main/tray.ts` — 리눅스(`SPLITS_CLICKS=false`)에서도 같은 메뉴에 들어갑니다 |
| 트레이 **아이콘 자체**에는 빨간 점 없음 | 붙이는 코드가 아예 없습니다 |
| 빨간 점 = 숫자 없이 있다/없다 | `AppState.hasUnreadNotifications` |
| 읽음·안읽음을 **창을 연 시점**으로 가름 | `store.notificationsSeenAt` · `app.notificationsUnreadBefore` |
| 기준 시각은 **닫혀 있다 열릴 때만** 갱신 | `main.ts` 의 `openNotifications()` — 새로 만드는 갈래에서만 `markNotificationsSeen()` |
| 최신이 위 | `session.snapshot()` |
| 같은 방에서 두 번 내보내지면 줄도 둘 | 줄마다 `id`, 방 단위로 묶지 않음 |
| 내보내진 것을 **뺄셈**으로 알아냄 | `session.applyTeams()` |
| 운영체제 알림 걷어내기 | `main/ipc.ts` 에 `Notification` 호출 없음 |
| 나가기 확인 · 마지막 사람일 때 다른 문구 | `TeamDetail.tsx` + `detail.leaveConfirm{,Last}` |
| 캡처 도구 지원 | `BUDDLING_NOTIFICATIONS=1` |

---

## 만들 것

### 1. 서버 — `supabase/schema.sql`

> **이 파일은 사람이 Supabase 콘솔에 붙여넣어 실행합니다.** 에이전트가 대신 실행할 수
> 없습니다. 준비해 주고 실행을 부탁하세요.

#### 1.1 표 하나

```sql
create table if not exists public.team_events (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  team_name          text not null,
  kind               text not null check (kind in ('joined','left','kicked')),
  subject_user_id    uuid,
  subject_nickname   text not null,
  next_host_user_id  uuid,
  next_host_nickname text,
  created_at         timestamptz not null default now()
);

create index if not exists team_events_team_idx
  on public.team_events (team_id, created_at desc);

alter table public.team_events enable row level security;   -- 정책 없음 = RPC 로만
```

열마다 이유가 있습니다.

- **`team_name` · `subject_nickname` 은 가리키지 않고 값으로 박습니다.** 나간 사람의
  `members` 줄은 그 자리에서 사라지고, 방 이름은 나중에 바뀔 수 있습니다. 그 줄은
  **그때 무엇이 있었는지** 말하는 것이라 지금의 이름으로 고쳐 쓸 것이 아닙니다.
- **`subject_user_id` 에는 `auth.users` 외래키를 달지 않습니다.** 달면 익명 계정 청소가
  그 계정을 지울 때 **남은 사람들이 아직 못 본 줄까지 함께 사라집니다.** 이 열은 "내
  줄인가" 를 가리는 데만 쓰고, 사람에게 보이는 이름은 이미 값으로 박혀 있습니다.
- 반대로 **`team_id` 에는 `on delete cascade` 를 답니다.** 마지막 사람이 나가면 방과 함께
  사라지는 것이 맞습니다 — 읽을 사람이 남아 있지 않습니다.
- **`next_host_*` 는 방장이 나간 줄에만 찹니다.** 다음 방장이 누구인지는 그 순간 서버만
  알고, 앱에는 나가기 전 목록이 없습니다.

#### 1.2 줄을 남기는 자리 셋

**전부 이미 있는 RPC 안이고, 멤버를 고치는 것과 같은 트랜잭션입니다.** 따로 떼면 사이에서
끊길 때 사람은 빠졌는데 소식은 없는 상태가 남습니다.

| RPC | 언제 | 무엇을 |
|---|---|---|
| `join_team` | **새 `members` 줄이 생기는 갈래에서만** | `kind='joined'` |
| `leave_team` | 지우기 **직전**에 닉네임을 붙잡고, 지운 **뒤**에 다음 방장을 계산 | `kind='left'` (+ 계승) |
| `kick_member` | 대상을 지우기 직전 | `kind='kicked'`, 주인공은 **내보내진 사람** |
| `create_team` | — | **남기지 않습니다** |

**`join_team` 의 재참여 갈래를 반드시 가려내세요.** 이미 들어와 있는 사람이 닉네임을
바꾸려고 코드를 다시 넣는 길이 있습니다(`if found then update … end if`). 거기서도 줄을
남기면 **닉네임을 고칠 때마다 "들어왔어요" 가 뜹니다.**

**`create_team` 에 남기지 않는 이유** — 그 순간 방에는 나뿐이고 내 줄은 나에게 오지
않습니다. 남겨도 필터에 걸려 아무에게도 안 가지만, 방 하나마다 죽은 줄이 하나씩 쌓입니다.

**방장 계승은 `leave_team` 에서만 일어납니다.** 내보내기는 방장만 할 수 있고 자기 자신은
대상이 아니라(`CANNOT_KICK_SELF`) 자리가 넘어갈 일이 없습니다.

```sql
-- leave_team 안. 지우기 전에 "내가 방장이었나" 를 재고, 지운 뒤에 다음 사람을 찾는다.
select * into v_member from members where user_id = v_user and team_id = p_team_id;
if not found then return; end if;                     -- 지금 동작을 바꾸지 않는다
select * into v_team from teams where id = p_team_id;

v_was_host := (v_member.id = (select id from members
                               where team_id = p_team_id
                               order by created_at asc limit 1));

delete from members where id = v_member.id;

if v_was_host then
  select * into v_next from members
   where team_id = p_team_id order by created_at asc limit 1;
end if;

insert into team_events (team_id, team_name, kind,
                         subject_user_id, subject_nickname,
                         next_host_user_id, next_host_nickname)
values (p_team_id, v_team.name, 'left',
        v_user, v_member.nickname,
        v_next.user_id, v_next.nickname);
```

`v_next` 가 없으면(마지막 사람이 나간 경우) `next_host_*` 는 null 이고, 뒤이어 방이
지워지면서 이 줄도 cascade 로 함께 사라집니다.

**순서를 지키세요.** `account_traces` 를 남기는 지금의 줄은 그대로 두고, 빈 팀을 지우는
줄은 이 insert **뒤에** 와야 합니다 — 먼저 지우면 외래키에 걸립니다.

#### 1.3 읽는 RPC 하나 — `get_my_events()`

```sql
create or replace function public.get_my_events()
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

  select coalesce(json_agg(entry order by at desc), '[]'::json)
    into v_result
    from (
      select json_build_object(
               'id',        e.id,
               'teamId',    e.team_id,
               'teamName',  e.team_name,
               'kind',      e.kind,
               'nickname',  e.subject_nickname,
               -- 다음 방장이 나일 때만 이름을 내보낸다.
               -- 남에게는 null 이라 평소의 "나갔어요" 가 된다.
               'newHostNickname', case when e.next_host_user_id = v_user
                                       then e.next_host_nickname end,
               'at',        e.created_at
             ) as entry,
             e.created_at as at
        from team_events e
        join members m on m.team_id = e.team_id and m.user_id = v_user
       where e.created_at > m.created_at
         and e.subject_user_id is distinct from v_user
         and e.created_at > now() - interval '7 days'
    ) s;

  return v_result;
end;
$$;
```

- **거르는 자리를 화면에 두지 않습니다.** 화면에서 거르면 "받아 오기는 다 받아 온 것"
  이 됩니다.
- **`subject_user_id` 도 `next_host_user_id` 도 밖으로 나가지 않습니다.** 나가는 것은
  닉네임과 "그게 나였는가" 의 결과뿐입니다. 계정 식별자는 화면에서 쓸 일이 없습니다.
- **`is distinct from` 입니다.** `<> ` 를 쓰면 `subject_user_id` 가 null 인 줄이 통째로
  빠집니다.
- **7일 조건을 RPC 안에도 둡니다.** 청소(pg_cron)는 프로젝트에 따라 안 걸릴 수 있는데,
  그때도 화면은 정확해야 합니다.
- **나갔다 다시 들어오면** `members.created_at` 이 새 값이라 **다시 들어온 때부터**
  보입니다. 따로 처리할 것이 없습니다.

#### 1.4 오래된 줄 지우기

```sql
create or replace function public.cleanup_team_events(
  p_keep interval default interval '7 days'
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted int;
begin
  delete from team_events where created_at < now() - p_keep;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
```

**`grant` 하지 않습니다.** 앱이 부를 일이 없고, 예약된 작업은 함수 주인 권한으로 돕니다
(`cleanup_anonymous_users` 와 같은 판단입니다).

#### 1.5 예약 작업 이름을 `buddling-` 으로 옮깁니다

> **`CLAUDE.md` 의 "이름을 바꿔도 그대로 둔 것" 표는 이 이름을 바꾸지 말라고 적어 두고
> 있습니다.** 그 경고와 위험(옛 작업을 못 찾아 정리가 둘로 늘거나 아예 사라지는 것, 그리고
> 그것이 하루 한 번 조용히 도는 일이라 한참 뒤에도 아무도 모른다는 것)을 알린 뒤에도
> **바꾸는 쪽으로 정해졌습니다.** 그래서 "새 이름을 하나 더 거는 것" 이 아니라
> **이름 옮기기**로 적습니다.

옮긴 뒤 걸리는 작업은 **정확히 둘**이고, 이름 규칙으로 서로 구별됩니다.

| 이름 | 무엇을 | 언제 |
|---|---|---|
| `buddling-cleanup-anonymous` | `cleanup_anonymous_users()` — 안 쓰는 익명 계정 | `0 18 * * *` |
| `buddling-cleanup-team-events` | `cleanup_team_events()` — 7일 지난 알림 줄 | `0 18 * * *` |

파일 맨 끝 `do $$ … $$` 블록 안, `create extension` 을 지난 자리입니다.

```sql
-- 1) 옛 이름을 먼저 걷어낸다. 안 걷어내면 옛 작업과 새 작업이 둘 다 남아
--    같은 정리가 하루에 두 번 돈다.
if exists (select 1 from cron.job where jobname = 'tap-tap-cleanup-anonymous') then
  perform cron.unschedule('tap-tap-cleanup-anonymous');
end if;

-- 2) 새 이름들도 먼저 걷어낸다 (이 파일은 여러 번 실행해도 안전해야 한다)
if exists (select 1 from cron.job where jobname = 'buddling-cleanup-anonymous') then
  perform cron.unschedule('buddling-cleanup-anonymous');
end if;
if exists (select 1 from cron.job where jobname = 'buddling-cleanup-team-events') then
  perform cron.unschedule('buddling-cleanup-team-events');
end if;

-- 3) 새 이름으로 다시 건다. 도는 SQL 과 시각은 그대로다 — 바뀌는 것은 이름뿐이다.
perform cron.schedule('buddling-cleanup-anonymous',   '0 18 * * *',
                      $cron$select public.cleanup_anonymous_users()$cron$);
perform cron.schedule('buddling-cleanup-team-events', '0 18 * * *',
                      $cron$select public.cleanup_team_events()$cron$);
```

이 순서가 안전한 이유가 셋입니다.

1. **`do $$ … $$` 블록 하나가 곧 트랜잭션 하나입니다.** `cron.schedule` 과
   `cron.unschedule` 은 `cron.job` 표를 고치는 일이라 함께 되감깁니다. 지우고 나서 거는
   도중에 넘어져도 **옛 작업이 그대로 살아남습니다** — "지웠는데 못 걸어서 정리가 통째로
   멈춘" 상태가 되지 않습니다.
2. **두 번 실행해도 작업이 늘지 않습니다.** 2번 줄이 그것을 지킵니다.
3. **혹시 옛 스키마 파일을 다시 실행해 옛 작업이 되살아나도 데이터를 잃지 않습니다.**
   두 정리 함수 모두 "조건에 맞는 것을 지운다" 뿐이라 하루에 두 번 돌아도 결과가 같습니다.
   그래도 어긋난 상태이므로 아래 질의로 봅니다.

**적용한 뒤 콘솔에서 한 번 봅니다. 두 줄만 나와야 하고 `tap-tap` 은 없어야 합니다.**

```sql
select jobname, schedule, command from cron.job where jobname like '%cleanup%';
```

#### 1.6 권한

```sql
grant execute on function public.get_my_events() to authenticated;
```

파일 맨 위의 `revoke all on all functions in schema public from public, anon;` 이
먼저 돌기 때문에 **이 줄이 없으면 앱이 부를 수 없습니다.**

---

### 2. 실시간 — 새 채널 이벤트를 만들지 않습니다

**이미 있는 `roster` 브로드캐스트에 얹습니다.** 참여·나가기·내보내기는 지금도 그 순간
`announceRosterChange()` 로 방에 알리고, 받은 쪽은 `session.refresh()` 를 부릅니다.
거기에 `net.getMyEvents()` 한 번을 더하면 끝입니다. 채널은 이미 `private: true` 이고
`realtime.messages` 정책이 `can_join_topic()` 으로 심사하므로 **따로 막을 것이 없습니다.**

고른 이유입니다.

| 새 broadcast 이벤트를 따로 만들기 | 기존 `roster` 에 얹기 (**고름**) |
|---|---|
| 왕복 한 번을 아낀다 | 사건마다 사람당 RPC 가 한 번 더 든다 (사람이 드나드는 일은 드물다) |
| **거르는 일이 화면으로 내려온다** — 페이로드에 실린 것을 앱이 판단해야 하고, 그러려면 내 `user_id` 와 들어온 시각을 앱이 들고 있어야 한다 | **거르는 자리가 RPC 한 곳** |
| 내보내기는 방장이 보내는데 방장 자신도 받아야 한다(`self: false`) — 로컬로 한 번 더 넣어야 한다 | 방장은 `kickMember()` 뒤 스스로 `refresh()` 를 부르므로 저절로 같은 길로 받는다 |
| 놓친 브로드캐스트를 메울 길을 따로 만들어야 한다 | **켤 때 밀린 것이 오는 길과 같은 길** — 코드가 한 벌 |

기획서의 *"신호가 오가는 그 채널을 씁니다"* 를 이 통로로 읽었습니다.

**치르는 값** — 닉네임 변경·초대코드 재발급처럼 사람이 안 바뀌는 `roster` 에도 이벤트
조회가 한 번 딸려 나갑니다. 드물게 일어나는 일이라 받아들입니다.

**행위자 본인은 `self: false` 때문에 자기 roster 를 못 받지만**, `enterTeam` ·
`leaveTeam` · `kickMember` 가 각각 끝에서 `refresh()` 를 부르므로 같은 길로 받습니다.

---

### 3. 공유 — `packages/shared/src`

#### 3.1 `state.ts`

```ts
export type NotificationKind = 'kicked-me' | 'joined' | 'left' | 'kicked'

export interface NotificationEntry {
  id: string
  kind: NotificationKind
  teamId: string
  /** 그때 그 방을 부르던 이름 — 값으로 박혀 있다 */
  teamName: string
  /** 그 줄의 주인공. 'kicked-me' 에는 없다 (주인공이 나다) */
  nickname?: string
  /** 방장이 나가서 내가 방장이 된 줄에만. 그 방에서의 내 닉네임 */
  newHostNickname?: string | null
  /** epoch ms. 서버 줄은 서버가 적은 때, 'kicked-me' 는 앱이 알아챈 때 */
  at: number
}

/**
 * 알림이 살아 있는 기간.
 *
 * **`supabase/schema.sql` 의 `cleanup_team_events` · `get_my_events` 와 짝이다.**
 * SQL 은 이 상수를 읽지 못하므로 한쪽만 고치면 조용히 어긋난다.
 */
export const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
```

**7일을 shared 에 두는 이유**는 `main/session.ts` 와 `services/fake-net.ts` 가 같은 값을
봐야 하기 때문입니다. 이러면 손으로 적힌 자리가 **shared 와 `schema.sql` 둘**로 끝납니다.

#### 3.2 `ipc.ts`

`NotificationsApi` 에서 **`dismiss` 를 뺍니다.** 기획서가 *"치우는 단추를 두지 않습니다"*
라고 정했습니다.

#### 3.3 사전 네 벌 — `i18n/{ko,en,ja,zh}.json`

**넷을 함께 고칩니다.** `apps/desktop/test/i18n.test.ts` 가 빠진 열쇠·남는 열쇠·
`{빈칸}` 불일치·빈 문장을 잡습니다.

| 열쇠 | 한국어 |
|---|---|
| `notifications.kickedMe` | `'{teamName}' 방 방장이 나를 내보냈어요` |
| `notifications.joined` | `{nickname}님이 '{teamName}' 방에 들어왔어요` |
| `notifications.left` | `{nickname}님이 '{teamName}' 방에서 나갔어요` |
| `notifications.kicked` | `'{teamName}' 방 방장이 {nickname}님을 내보냈어요` |
| `notifications.leftHost` | `{nickname}님이 '{teamName}' 방에서 나갔어요. 이제 {hostNickname}님이 방장이에요` |
| `notifications.ago.now` | `방금` |
| `notifications.ago.minutes` | `{minutes}분 전` |
| `notifications.ago.hours` | `{hours}시간 전` |
| `notifications.ago.yesterday` | `어제` |
| `notifications.ago.days` | `{days}일 전` |
| `notifications.empty` | `아직 온 소식이 없어요` (지금 문구에서 결을 맞춥니다) |

**빼는 것 둘** — `notifications.dismiss`(단추가 없어집니다) ·
`kicked.message`(부르는 곳이 알림 화면 한 곳뿐이라 `notifications.kickedMe` 로 갈아탑니다).

**영어만 `team`·`teammate` 를 씁니다.** 나머지 셋은 방·멤버 계열입니다.
**'님' 이 없는 말에서는 그 자리를 억지로 만들지 않습니다** — 그 언어에서 자연스러운 대로
씁니다.

---

### 4. 앱 — `apps/desktop/src`

| 파일 | 무엇을 |
|---|---|
| `services/net.ts` | `NetEvent` 타입(RPC 가 돌려주는 모양, `at` 은 ISO 문자열)과 `Net.getMyEvents(): Promise<NetEvent[]>` 를 더합니다 |
| `services/supabase-net.ts` | `getMyEvents()` → `rpc('get_my_events', {})`, 없으면 `[]` |
| `services/fake-net.ts` | 서버 안에 이벤트 목록을 두고, `createTeam` 을 뺀 셋에서 같은 규칙으로 한 줄씩 남깁니다. `getMyEvents({userId})` 가 **RPC 와 똑같이** 넷을 거릅니다 |
| `main/session.ts` | 서버 줄을 메모리에 들고, `snapshot()` 에서 기기 줄과 합칩니다. `dismissNotification()` 을 지웁니다 |
| `main/store.ts` | 타입은 그대로, 주석만 고칩니다 |
| `main/ipc.ts` | `notifications:dismiss` 처리기를 지웁니다 |
| `preload/notifications.ts` | `dismiss` 를 지웁니다 |
| `renderer/notifications/ago.ts` | **새 파일 · 순수 함수** |
| `renderer/notifications/Notifications.tsx` | 종류별 문구 · 경과 시각 · × 단추 제거 · 1분마다 다시 그리기 |
| `renderer/use-minute-tick.ts` | `team/hooks.ts` 의 `useMinuteTick` 을 여기로 **옮깁니다** |

#### 4.1 `services/fake-net.ts`

`StoredMember` 에 `createdAt` 한 칸을 더합니다(진짜 쪽의 `members.created_at` 자리).
`membersOf` 가 도는 순서가 곧 들어온 순서라는 지금의 규칙은 그대로 둡니다.

**거르는 규칙 넷을 RPC 와 똑같이 흉내 냅니다** — 내가 지금 멤버인 방 · 내 `createdAt`
이후 · 내가 주인공인 줄 제외 · `NOTIFICATION_TTL_MS` 이내.

> 이 파일의 맨 위 주석은 "앱이 그 규칙에 따라 갈라지는 것만 흉내 낸다" 고 적어 두고
> 있습니다. **이건 갈라집니다** — 화면에 무엇이 뜨는지가 이 필터로 정해지므로, 여기는
> 흉내 낼 값어치가 있는 자리입니다.

#### 4.2 `main/session.ts`

1. **`serverEvents: NetEvent[]` 를 메모리에** 들고 `syncEvents()` 로 채웁니다.
   `refresh()` 와 `syncConnections()` 에서 부릅니다.
2. **실패는 조용히 삼켜 마지막 값을 지킵니다.**

   ```ts
   async function syncEvents() {
     if (!net) return
     try {
       serverEvents = await net.getMyEvents()
     } catch {
       // 스키마는 사람이 콘솔에서 실행한다. 앱이 먼저 나가고 스키마가 늦으면 이 함수가
       // 서버에 아직 없다. 그때 여기서 던지면 팀 목록 갱신까지 통째로 막히므로,
       // 알림만 비어 보이게 두고 나머지는 멀쩡하게 굴린다.
     }
   }
   ```
3. **`snapshot()` 이 두 갈래를 합칩니다.**

   ```ts
   const cutoff = now() - NOTIFICATION_TTL_MS
   const mine = store.get('notifications')
     .filter((entry) => entry.at > cutoff)
     .map((entry) => ({ ...entry, kind: 'kicked-me' as const }))
   const theirs = serverEvents.map((event) => ({
     ...event, at: new Date(event.at).getTime(),
   }))
   const notifications = [...mine, ...theirs].sort((a, b) => b.at - a.at)
   ```

   **기기 줄의 저장 모양은 바뀌지 않습니다.** `{ id, teamId, teamName, at }` 그대로이고
   `kind` 는 내보낼 때 붙습니다 — 그래서 **이미 저장된 것을 옮겨 담을 일이 없습니다.**
4. **`addNotification()`** 은 그대로 두되, 이제 그 표가 담는 것이 *내보내진 나 자신의 줄*
   하나뿐이라는 사실을 주석에 적습니다. 7일 지난 줄은 저장할 때 함께 걸러 냅니다.
5. **`dismissNotification()` 을 지웁니다.**
6. **`markNotificationsSeen()` 이 시계 어긋남을 클램프합니다.**

   ```ts
   markNotificationsSeen() {
     // 서버 줄의 `at` 은 서버 시각이고 이 값은 기기 시각이다. 기기 시계가 뒤처져 있으면
     // 방금 눈으로 본 줄이 계속 안읽음으로 남는다. 맨 위 줄까지는 반드시 읽음이 되게 한다.
     const newest = snapshot().notifications[0]?.at ?? 0
     store.set({ notificationsSeenAt: Math.max(now(), newest) })
     publish()
     return snapshot()
   }
   ```

#### 4.3 `renderer/notifications/ago.ts` — 새 파일

**Electron 도 브라우저도 없이 도는 순수 함수**입니다 (CLAUDE.md 규칙 1).

```ts
export function ago(at: number, now: number, t: Translate): string
```

기획서가 *"시각이 아니라 얼마나 지났는지로 적습니다"* 라고 못박았으므로 **달력 날짜가
아니라 흐른 시간**으로 가릅니다. 달력으로 가르면 기기 시간대·서버 시각·자정 경계를 함께
다뤄야 합니다.

| 흐른 시간 | 문구 |
|---|---|
| 음수(기기 시계가 서버보다 뒤처짐) 또는 1분 미만 | `ago.now` |
| 1분 ~ 1시간 | `ago.minutes` |
| 1시간 ~ 24시간 | `ago.hours` |
| 24 ~ 48시간 | `ago.yesterday` |
| 48시간 이상 | `ago.days` (`floor(시간 / 24)`) |

**음수를 "방금" 으로 두는 것은 기획서가 지정한 처리입니다.** 익명 계정이라 시계를
맞춰 달라고 할 자리가 없습니다.

#### 4.4 `renderer/notifications/Notifications.tsx`

**줄 하나를 그리는 규칙**입니다.

```
kicked-me                      → notifications.kickedMe  {teamName}
joined                         → notifications.joined    {nickname, teamName}
kicked                         → notifications.kicked    {nickname, teamName}
left  + newHostNickname 없음   → notifications.left      {nickname, teamName}
left  + newHostNickname 있음   → notifications.leftHost  {nickname, teamName, hostNickname}
```

- 문구 **아래 작은 글씨**로 `ago(entry.at, Date.now(), t)`.
- **× 단추와 `Row` 의 `dismissLabel`·`onDismiss` 를 지웁니다.**
- **1분마다 다시 그립니다** — `useMinuteTick()`. 안 그리면 "방금" 이 영영 "방금" 입니다.
- 안읽음 색(`unread` 갈래)은 지금 것을 그대로 씁니다.
- 빈 목록이면 `notifications.empty` 를 그대로 둡니다 — **빈 화면은 "아직 안 불러온 것"
  과 구별되지 않습니다.**

#### 4.5 `renderer/use-minute-tick.ts` — 옮기기

`team/hooks.ts` 의 `useMinuteTick` 을 여기로 옮기고, `team/hooks.ts` 는 그것을 다시
내보냅니다. **`TeamDetail.tsx` 는 손대지 않습니다** — 두 창이 각자 60000 을 적어 두는
자리를 만들지 않으려는 것뿐입니다.

---

### 5. 테스트

- **새로 `test/ago.test.ts`** — 경계 다섯과 음수.
- **`test/session.test.ts`**
  - **지웁니다**: `'알림을 지우면 목록에서 빠진다'` · `'같은 방의 다른 줄까지 함께 지우지
    않는다'` 두 건. 기능을 없애는 것이라 일부러입니다.
  - **더합니다**:
    - 남은 사람에게 *들어왔다 · 나갔다 · 내보내졌다* 가 간다
    - **내가 만든 줄은 나에게 오지 않는다**
    - 들어오기 **전**의 줄은 오지 않는다
    - 방장이 나가면 **다음 사람에게만** 계승이 붙는다
    - 방장이 아닌 사람이 나가면 아무에게도 계승이 안 붙는다
    - 나갔다 다시 들어오면 그 전 줄이 다시 보이지 않는다
    - 7일 지난 줄은 빠진다
    - **내보낸 방장도 그 줄을 받는다**
- **`scripts/e2e-check.js`** — 단계 둘을 더합니다 (`join_team` 뒤 상대의
  `get_my_events()` 에 `joined` 가 있다 / 내 줄은 나에게 오지 않는다).
  **RPC 는 단위 테스트가 닿지 못하는 곳**이라 여기가 유일한 검증 자리입니다.

---

## 엣지케이스와 사이드이펙트

- **같은 숫자가 두 곳에 있습니다** — 알림 7일이 `packages/shared/src/state.ts` 의
  `NOTIFICATION_TTL_MS` 와 `supabase/schema.sql` 의 `cleanup_team_events` ·
  `get_my_events` 에 있습니다. SQL 은 그 상수를 읽지 못합니다.
  **익명 계정 청소의 유예 7일과는 다른 7일입니다** — 우연히 같은 숫자일 뿐이라 묶지
  않습니다.
- **스키마는 사람이 콘솔에서 실행합니다.** 앱이 먼저 나가고 스키마가 늦으면
  `get_my_events()` 가 없어 실패합니다. `syncEvents()` 가 오류를 삼켜 팀 목록 갱신을
  절대 막지 않습니다 (4.2-②).
- **오프라인이면 서버 줄이 안 보입니다. 알고 받아들입니다.** 서버 줄은 메모리에만 있어서
  앱을 켠 채로는 창을 여닫아도 그대로이지만, **인터넷 없이 다시 켜면 목록이 비어
  "소식 없음"** 이 됩니다(내 강퇴 줄만 남습니다). 기기에 쌓기 시작하면 서버 줄과 기기
  줄이 어긋날 자리가 생기고 **7일 소멸을 양쪽에서 맞춰야** 하는데, 사람이 드나드는 일
  자체가 드물어 그 복잡도가 얻는 것보다 큽니다.
- **빨간 점과 시계 어긋남** — 4.2-⑥ 의 클램프가 지킵니다.
- **"처음 받는 목록을 사건으로 읽지 마세요" 는 이 설계에서 저절로 지켜집니다.** 목록을
  견주지 않고 서버가 적어 둔 사건만 받으며, RPC 가 `members.created_at` 으로 잘라 주므로
  **막 들어온 사람에게는 아무것도 오지 않습니다.** 뺄셈이 남아 있는 곳은 *내가
  내보내졌다* 하나뿐입니다.
- **익명 계정 청소가 방장의 `members` 줄을 지우면 계승 알림이 나가지 않습니다.** 서버가
  그 순간을 사건으로 알지 못하기 때문입니다. **여기서 풀지 않습니다** — 기획서
  "방장과 강퇴" 가 *"지금 서버 구조로는 이 정의가 아직 성립하지 않습니다"* 로 이미
  미해결로 적어 둔 자리이고, 그 매듭(오래 흔적 없는 멤버 정리)은 이 기능의 범위 밖입니다.
- **`AppState` 가 커져 창마다 실려 나갑니다.** 최대 7일치라 수십 줄이고, 받는 창은
  `ipc.ts` 의 `broadcast()` 가 부르는 넷뿐입니다(캐릭터 창은 안 받습니다).
- **나중에 "방 이름은 각자 부른다" 가 오면 이 자리를 다시 봅니다.** 서버 줄의 방 이름을
  화면에서 내 이름으로 겹쳐 줘야 합니다 — **아직 그 방에 남아 있는 줄에 한해서**입니다.
  이미 떠난 방의 줄과 `kicked-me` 줄은 박아 둔 이름 그대로 두어야 합니다.
  **이번에는 하지 않습니다** — 그 기능이 없는 지금은 공용 이름이 곧 내가 부르는 이름입니다.
- **`kicked.message` 열쇠가 없어집니다.** 부르는 곳이 알림 화면 한 곳뿐인 것을 확인했습니다.
- **oxlint `overrides` 에 더할 것이 없습니다** — 새 폴더를 만들지 않습니다
  (`renderer/notifications/` 는 이미 `renderer/**` 에 걸립니다).

---

## 만드는 쪽에게 — 함께 고쳐야 하는 문서

- **`CLAUDE.md` 의 "이름을 바꿔도 그대로 둔 것" 표에서 `tap-tap-cleanup-anonymous` 줄을
  빼세요.** 1.5 에서 실제로 이름을 옮기므로 그 표가 낡습니다. 그 표는 **"바꾸면 안 된다"
  의 근거로 읽히는 자리**라, 두면 다음에 오는 사람이 옛 이름을 되살리려 듭니다. 남는 것은
  둘(`appId` · `apps/desktop/CHANGELOG.md`)입니다.
- **`CLAUDE.md` 의 "같은 숫자가 세 곳에 있다" 표에 알림 7일 한 줄을 더하세요** —
  `packages/shared/src/state.ts` 의 `NOTIFICATION_TTL_MS` 와 `supabase/schema.sql` 의
  두 함수가 짝입니다.
- **`docs/PRODUCT.md` 는 고치지 않습니다.** 다만 알고 계세요 — 그 절의 표에 있는
  *"어디에 남나 — 내 기기에만. 서버로 나가지 않습니다"* 한 줄은 같은 절의 본문·
  "만드는 쪽에게" 와 어긋나고, **본문 쪽을 따르기로 정해졌습니다.** 기획서를 고치는 일은
  구현이 아니라 기획에서 시작합니다.
- 이 문서의 인덱스 줄(`docs/DEVELOPMENT.md`)의 상태를 **구현을 마치면 "완료" 로**
  바꿔 주세요.

---

## 검증

```bash
npm test          # ago.test.ts + 새 session 테스트 + i18n 열쇠 검사
npm run typecheck # Net 인터페이스가 fake/supabase 양쪽과 맞는지
npm run lint
npm run build
npm run check     # ★ 스키마를 콘솔에서 먼저 실행한 뒤. RPC 는 여기서만 검증된다
```

스키마를 실행한 **직후** 예약 작업을 눈으로 봅니다 (1.5). **두 줄만 나와야 하고
`tap-tap` 은 없어야 합니다.**

```sql
select jobname, schedule, command from cron.job where jobname like '%cleanup%';
```

화면은 네 언어로 찍어 봅니다.

```bash
BUDDLING_PROFILE=shot BUDDLING_FAKE_NET=1 BUDDLING_CAPTURE=.preview/noti \
  BUDDLING_LANG=ko BUDDLING_SEED="디자인팀:나영" BUDDLING_NOTIFICATIONS=1 npm start
```

손으로는 `npm run start:both` 로 A·B 를 띄워 셋을 봅니다.

1. **B 가 들어올 때 A 에게 줄이 뜨는가**
2. **B 를 내보냈을 때 A(방장) 에게도 줄이 남는가** — 토스트는 사라져도 알림은 남습니다
3. **A(방장)가 나가면 B 에게 계승 줄이 붙는가**
