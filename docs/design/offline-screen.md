# 인터넷이 없을 때 — 개발 설계

**근거 문서** [PRODUCT.md](../PRODUCT.md) 의 **"앞으로 → 인터넷이 없을 때"** 절.
이 문서는 그 정의를 **어떻게 만들지**만 적습니다. 왜 그렇게 정했는지는 기획서에 있고,
둘이 어긋나 보이면 **기획서가 이깁니다.**

읽는 순서는 [CLAUDE.md](../../CLAUDE.md) → [DEVELOPMENT.md](../DEVELOPMENT.md) →
[PRODUCT.md](../PRODUCT.md) → 이 문서입니다.

짝이 되는 문서가 하나 있습니다 — [notifications-screen.md](notifications-screen.md).
**알림 창만은 이 정책을 받지 않습니다.** 그 이유가 그쪽 6.3 에 적혀 있습니다.

---

## 한 줄

**`net.getMyTeams()` 가 잇달아 두 번 실패하면 `AppState.offline` 이 켜지고, 창 셋이
`<main>` 안을 공유 컴포넌트 하나로 갈아 끼웁니다.** 제목줄과 알림 아이콘은 그대로
남습니다.

```
        net.getMyTeams()              ← "서버에 닿는가" 의 유일한 기준
              │
     성공 ────┼──→ unreachableStreak = 0    → offline = false (즉시)
     실패 ────┴──→ unreachableStreak += 1   → 2 이상이면 offline = true
                   scheduleRetry()  (5 · 15 · 30 · 60초)
                          │
                   AppState.offline ──broadcast('state')──┐
                                                          │
   TeamList · TeamDetail · Settings ──── <main> 안을 <OfflineScreen/> 으로
   Notifications · Pet · Size · Tray ─── 이 값을 보지 않는다
```

---

## 지금 어떻게 되어 있나

- **"앱이 오프라인이다" 라는 값이 없습니다.** 있는 것은 방마다의 실시간 채널 상태
  뿐입니다 (`session.ts` 의 `connections`, `Membership.connection`).
- 그 방별 상태는 지금도 화면에 나옵니다 — `TeamList.tsx` 의 방 줄
  (`list.disconnected` · `list.connecting`)과 `TeamDetail.tsx` 의 한 줄
  (`connection.lost` · `connection.connecting`). **이 방식은 그대로 둡니다.**
- `session.ts` 의 재시도는 `RETRY_DELAYS = [5000, 15000, 30000, 60000]` 이고
  `scheduleRetry()` 가 `retryStep` 을 올려 가며 뒤로 미룹니다.
- `syncConnections()` 의 `everythingWorked` 는 **`getMyTeams()` 실패와 방 채널 하나의
  실패를 구별하지 않습니다.**
- `refresh()` 도 `getMyTeams()` 를 부르지만 **실패해도 `scheduleRetry()` 를 부르지
  않습니다.**
- `services/supabase-net.ts` 의 `connect()` 는 **방 하나당 최대 15초** 기다립니다.
  방이 셋이면 `syncConnections()` 하나가 45초까지 걸릴 수 있습니다.
- `configured: net !== null` 이고, `net` 이 없으면 `syncConnections()` 가 첫 줄에서
  되돌아 나옵니다 (`if (!net || disposed) return`).

### 창 셋의 생김새가 똑같습니다 — 이것이 설계를 쉽게 만듭니다

`TeamList` · `TeamDetail` · `Settings` 셋 다 **글자 하나 다르지 않은 뼈대**입니다.

```tsx
<>
  <header className={ui.titlebar}>… <NotificationButton …/></header>
  <main className={ui.main}>{본문}</main>
</>
```

기획서가 *"덮는 것은 창의 내용이지 제목줄이 아니다"* · *"알림 아이콘과 빨간 점은 그대로
있어야 한다"* 라고 한 것이 **`<main>` 안만 바꾸면 저절로 지켜진다**는 뜻입니다. 알림
아이콘이 붙는 창 셋과 덮이는 창 셋이 똑같다는 기획서의 지적이 여기서 나옵니다.

---

## 만들 것

### 1. 판정 — `main/session.ts`

#### 1.1 어느 신호로 정하나

| 후보 | 왜 아닌가 |
|---|---|
| `syncConnections()` 의 `everythingWorked` | **방 채널 하나만 실패해도 false 입니다.** 기획서의 *"방 하나가 말썽인 것은 오프라인이 아닙니다"* 와 정면으로 어긋납니다 |
| `retryStep` (재시도 단계) | 같은 이유입니다 — 채널 실패로도 올라갑니다 |
| 방들의 `connection` 상태를 모아 보기 | **방이 하나도 없는 사람은 영영 판정할 수 없습니다.** 기획서가 그 경우를 짚어 두었습니다 |
| **`net.getMyTeams()` 의 성공 여부** (**고름**) | 방 수와 무관하고 실시간 채널과도 무관한 **순수한 "서버에 닿는가" 신호**입니다. 이미 앱을 켤 때·다시 붙을 때·roster 마다 부르고 있어 **새 왕복이 하나도 안 늡니다** |

#### 1.2 세는 자리를 한 곳으로 모읍니다

지금 `getMyTeams()` 를 부르는 곳이 `refresh()` 와 `syncConnections()` 둘입니다.
**각자 세면 반드시 어긋납니다.**

```ts
/**
 * 서버에서 내 소속을 받아 온다. **이 호출 하나가 "서버에 닿는가" 의 기준이다**
 * (기획서 "인터넷이 없을 때"). 방 채널이 붙는지는 보지 않는다 — 방 하나가 말썽인
 * 것은 오프라인이 아니고, 방이 하나도 없는 사람도 오프라인일 수 있다.
 *
 * 실패하면 곧바로 다시 붙어 보기를 예약한다. **오프라인 화면이 "저절로 다시 붙는다"
 * 고 약속하므로, 닿지 못한 상태에는 반드시 예약이 걸려 있어야 한다.** 예전에는
 * `refresh()` 가 실패해도 예약하지 않아서 그 자리가 비어 있었다.
 */
async function fetchTeams(): Promise<NetMembership[]> {
  try {
    const list = await requireNet().getMyTeams()
    unreachableStreak = 0
    return list
  } catch (error) {
    unreachableStreak += 1
    scheduleRetry()
    throw error
  }
}
```

`refresh()` 와 `syncConnections()` 의 `net.getMyTeams()` 를 `fetchTeams()` 로 바꿉니다.

`scheduleRetry()` 는 이미 `if (disposed || retryTimer || !net) return` 로 막혀 있어
`syncConnections()` 가 끝에서 한 번 더 불러도 아무 일도 일어나지 않습니다.

#### 1.3 뜸 들이기 — 숫자 하나와 그 짝

```ts
/**
 * 몇 번 잇달아 닿지 못해야 "오프라인" 으로 보는가.
 *
 * **2 는 곧 `RETRY_DELAYS[0]` 이다** — 처음 실패하고, 5초 뒤 다시 붙어 보기가 한 번
 * 더 실패하면 그때 덮는다(기획서 "인터넷이 없을 때"). 첫 실패에 곧바로 덮으면
 * 노트북이 잠깐씩 끊길 때마다 창 셋이 통째로 뒤집히는데, **끊긴 것보다 그 깜빡임이
 * 더 성가시다.**
 *
 * **이 숫자와 `RETRY_DELAYS` 는 짝이다** — 재시도 일정을 바꾸면 덮이는 시점도 함께
 * 움직인다. 기획서가 그것을 알고 묶어 두었고, 여기가 그 사실을 적어 두는 자리다.
 */
const OFFLINE_AFTER_FAILURES = 2

/** 서버에 잇달아 닿지 못한 횟수. 닿으면 0으로 돌아간다. */
let unreachableStreak = 0
```

`snapshot()` 이 내보내는 값:

```ts
offline: unreachableStreak >= OFFLINE_AFTER_FAILURES
```

**이 상수를 `CLAUDE.md` 의 "같은 숫자가 세 곳에 있다" 표에 올리지 않습니다.** 그 표는
*파일을 건너뛰어* 흩어진 짝을 위한 자리인데, 이 둘은 `session.ts` 안에 나란히 있습니다.
한 파일 안의 짝까지 올리면 표가 흐려집니다 — 대신 위 주석이 그 일을 합니다.

#### 1.4 돌아오는 것은 즉시입니다

성공하면 `unreachableStreak = 0` 이 되고, 곧이어 `applyTeams()` → `commit()` →
`publish()` 가 **방 채널이 붙기를 기다리기 전에** 상태를 내보냅니다.

```
await applyTeams(await fetchTeams())   ← 여기서 publish 된다. 화면이 돌아온다.
await syncEvents()
for (…) await net.connect(…)           ← 최대 15초 × 방 수. 화면은 이미 돌아와 있다.
```

그래서 화면은 **RPC 한 번이 성공하는 순간** 돌아오고, 방별 연결은 그 뒤 방 줄에
"연결 중" 으로 이어집니다. **기획서가 나눠 둔 두 층이 그대로 나타납니다.**

#### 1.5 `cancelRetry()` 는 `unreachableStreak` 을 건드리지 않습니다

절전에서 깨어날 때 `recover()` 가 `cancelRetry()` 를 부릅니다. **거기서 함께 0으로
되돌리면, 아직 오프라인인데 화면이 잠깐 정상으로 돌아왔다 다시 덮이는 깜빡임이
생깁니다** — 기획서가 없애려던 바로 그 깜빡임입니다. **되돌리는 것은 성공뿐입니다.**

#### 1.6 접속 정보가 없는 앱은 저절로 갈라집니다

`syncConnections()` 가 첫 줄에서 `if (!net) return` 로 나오므로 `unreachableStreak` 이
0에 머물고 `offline` 은 늘 false 입니다.

**새 갈래를 만들 필요가 없습니다.** 기획서의 *"오프라인이라고 부르지 않습니다.
새 화면도 새 문구도 만들지 않습니다"* 가 코드에서 공짜로 지켜집니다.

#### 1.7 "다시 해 보기" — 무엇을 기다리나

**`session.recover()` 를 그대로 쓰면 안 됩니다.** `syncConnections()` 는 방마다
`net.connect()` 를 **차례로 기다리는데 방 하나에 최대 15초**입니다. 방이 셋이면
**단추가 45초 동안 눌린 채**로 있습니다.

```ts
/**
 * 사람이 "다시 해 보기" 를 눌렀다 (기획서 "인터넷이 없을 때").
 *
 * **닿는지만 확인하고 돌아온다.** 방 채널을 다시 붙이는 일은 기다리지 않는다 —
 * 채널 하나에 최대 15초라(`services/supabase-net.ts`) 그것까지 기다리면 단추가
 * 몇십 초씩 눌린 채로 남는다. 오프라인인지는 `getMyTeams()` 하나로 정해지므로
 * 그것만 기다리면 화면은 이미 정확하다.
 *
 * `cancelRetry()` 로 백오프를 처음(5초)으로 되돌린다 — 사람이 기다림을 끝낸 것이라
 * 그다음 자동 재시도도 촘촘한 쪽에서 다시 시작하는 것이 맞다.
 */
async retryNow() {
  cancelRetry()
  try {
    await applyTeams(await fetchTeams())   // 성공하면 여기서 publish 되어 화면이 돌아온다
  } catch {
    publish()                              // 실패해도 offline 값은 갱신해 내보낸다
  }
  void syncConnections()                   // 채널 붙이기·알림 받기는 뒤에서
  return snapshot()
}
```

**치르는 값** — 성공한 경우 `getMyTeams()` 가 곧이어 `syncConnections()` 안에서 한 번
더 불립니다. **일부러 그대로 둡니다.** 사람이 일부러 누른 단추에 RPC 하나가 더 드는
것과, 잘 도는 `syncConnections()` 를 둘로 쪼개는 것 중에 앞쪽이 쌉니다.

**`void` 를 빠뜨리지 마세요** — `no-floating-promises` 에 걸립니다. 그리고 그 `void`
가 "여기는 일부러 안 기다린다" 는 표시이기도 합니다.

---

### 2. 상태 전달 — `packages/shared/src/state.ts`

`AppState` 에 칸 하나를 더합니다.

```ts
/**
 * 지금 서버에 닿지 못하는가 (기획서 "인터넷이 없을 때").
 *
 * 방마다의 `Membership.connection` 과 **다른 층이다** — 저쪽은 그 방의 실시간
 * 채널이고, 이것은 앱 전체가 서버에 닿는지다. 방 하나가 말썽인 것은 오프라인이
 * 아니고, 방이 하나도 없는 사람도 오프라인일 수 있다.
 *
 * 접속 정보가 아예 없는 빌드는 여기서 **false 다.** 그건 인터넷 문제가 아니라 앱이
 * 완성되지 않은 것이라 `configured` 가 따로 가른다.
 *
 * **알림 창은 이 값을 보지 않는다** (기획서 "알림 화면").
 */
offline: boolean
```

**새 IPC 채널도 새 방송도 만들지 않습니다.** 이미 있는 `broadcast('state', snapshot)`
에 얹혀 창 넷에 그대로 갑니다.

---

### 3. 화면 — `renderer/OfflineScreen.tsx` (새 파일 하나)

**자리는 `renderer/` 바로 아래**입니다. `NotificationButton.tsx` 가 이미 거기서 창
셋에 공유되고 있어 **그 선례를 그대로 따릅니다.** 새 폴더가 아니므로 oxlint 설정의
`overrides` 에 더할 줄도 없습니다.

```tsx
export function OfflineScreen({
  t,
  onRetry,
}: {
  t: Translate
  onRetry: () => Promise<unknown>
})
```

- **창을 채웁니다** — `min-h-[calc(100vh-78px)]`(제목줄 44px + `ui.main` 의 위아래
  6·28px)에 `flex flex-col items-center justify-center text-center`. 창 셋의 높이가
  700 · 820 · 560 으로 제각각이라 **고정 높이가 아니라 뷰포트 기준**이어야 합니다.
- 기획서가 정한 **셋만** 둡니다.

  | 무엇 | 열쇠 | 어떤 유틸리티로 |
  |---|---|---|
  | 지금 인터넷에 닿지 못한다는 말 | `offline.title` | `ui.h1` |
  | 저절로 다시 붙는다는 말 | `offline.lead` | `ui.lead` |
  | 다시 해 보기 단추 | `offline.retry` | `ui.buttonGhost` |

- **방을 만들거나 코드를 넣는 입력칸을 두지 않습니다** (기획서: *"눌러도 되지 않는
  단추는 벽보다 나쁩니다"*).
- **아이콘이나 그림을 넣지 않습니다.** 기획서가 셋으로 못박았고, 창 셋의 높이가
  제각각이라 그림이 들어가면 세 창에서 각각 맞춰야 합니다.
- **`theme.css` 도 새 `.css` 파일도 건드리지 않습니다.** 위 넷 다 `ui.ts` 에 이미
  있습니다.
- 단추는 누르는 동안 `disabled` 이고 글자가 `offline.retrying` 으로 바뀝니다 —
  `form.creating` · `form.joining` 이 이미 쓰는 방식입니다.

```tsx
const [busy, setBusy] = useState(false)
…
<button
  className={ui.buttonGhost}
  disabled={busy}
  onClick={async () => {
    setBusy(true)
    try { await onRetry() } finally { setBusy(false) }
  }}
>
  {busy ? t('offline.retrying') : t('offline.retry')}
</button>
```

> 닿는 데 성공하면 이 컴포넌트가 `finally` 보다 먼저 사라질 수 있습니다. React 18
> 부터는 경고도 없고 아무 일도 일어나지 않습니다 — 알고 두는 자리입니다.

#### 3.1 창 셋에 끼우는 자리

셋 다 **`<main>` 안 본문을 통째로** 가립니다. `<header>` 는 **손대지 않습니다.**

```tsx
// TeamList.tsx — 설정이 없는 것이 오프라인보다 먼저다 (기획서).
// 실제로는 configured 가 false 면 offline 이 true 가 될 수 없지만(1.6),
// 순서로 그 우선순위를 적어 둔다.
{!state.configured
  ? setupNeeded
  : state.offline
    ? offlineScreen
    : state.memberships.length > 0 ? list : onboarding}

// TeamDetail.tsx / Settings.tsx
<main className={ui.main}>{state.offline ? offlineScreen : body}</main>
```

**제목줄을 안 건드리는 것이 곧 요구사항을 지키는 것입니다.** 기획서가
*"알림 아이콘이 붙은 창 셋이 덮이는 창 셋과 똑같아서, 함께 가리면 오프라인에는 볼 수
있는 알림 창으로 가는 길이 앱 안에서 사라진다"* 고 짚은 자리인데, `<main>` 안만 바꾸는
이 설계에서는 **빠뜨릴 수가 없습니다.**

#### 3.2 함께 덮이는 것 — 새 버전 배너와 '설정…' 길

`TeamList` 의 `UpdateBanner` 와 맨 아래 '설정…' 단추도 `<main>` 안에 있어 함께
덮입니다. **이미 받아 둔 새 버전을 적용하는 것은 오프라인에도 되는 일이지만 예외를
두지 않습니다** — 기획서가 설정 창을 두고 편 논리(*"창마다 되는 것과 안 되는 것이
다르면 그 규칙을 사람이 외워야 한다"*)가 그대로 걸립니다. **급한 길은 트레이에
있습니다.**

같은 이유로 **초대코드도 오프라인에는 읽을 수 없게 됩니다.** 기획서가
*"만료되는 값이라 덮는 쪽이 맞다"* 로 이미 판단한 손실입니다.

#### 3.3 건드리지 않는 것

| | 왜 |
|---|---|
| **캐릭터 창** (`renderer/pet/`) | 기획서: *"연결이 끊겼다고 캐릭터가 사라지면 사람이 잃는 것은 소식이 아니라 앱 자체"*. `AppState.offline` 을 읽지 않습니다 |
| **크기 조절 창** | 내 기기 안의 일이라 낡지 않습니다 |
| **트레이 메뉴** (`main/tray.ts`) | 창이 아닙니다. 잠재우기처럼 인터넷이 필요 없는 일은 오프라인에도 되어야 합니다 |
| **알림 창** | 지나간 일이라 낡지 않습니다 ([notifications-screen.md](notifications-screen.md) 6.3) |
| **방별 연결 표시** (`connection.lost` · `list.disconnected`) | 다른 층입니다. 방 하나가 말썽인 것은 오프라인이 아닙니다 |

---

### 4. IPC — "다시 해 보기" 를 잇는 길

| 파일 | 무엇을 |
|---|---|
| `packages/shared/src/ipc.ts` | `TeamApi` 와 `SettingsApi` **양쪽**에 `retryConnection: () => Promise<AppState>` |
| `apps/desktop/src/main/ipc.ts` | `handle('app:retry', () => session.retryNow())` 한 줄 |
| `apps/desktop/src/preload/team.ts` | `retryConnection: () => call<AppState>('app:retry')` |
| `apps/desktop/src/preload/settings.ts` | 같음 |

**`NotificationsApi` 에는 더하지 않습니다** — 그 창은 이 정책을 아예 받지 않습니다.

`handle()` 을 쓰므로 오류는 `{ ok, value, error }` 봉투로 돌아옵니다. 다만
`retryNow()` 는 스스로 삼키므로 실제로 던질 일이 없습니다 — **화면은 봉투가 아니라
다음 `state` 방송으로 답을 받습니다.**

---

### 5. 네 언어 사전 — `packages/shared/src/i18n/{ko,en,ja,zh}.json`

**넷을 함께 고칩니다** (`CLAUDE.md` 규칙 2). `apps/desktop/test/i18n.test.ts` 가 빠진
열쇠·남는 열쇠·`{빈칸}` 불일치·빈 문장을 잡습니다. **`{빈칸}` 이 하나도 없는 열쇠
넷이라 자리표시자 검사에 걸릴 것이 없습니다.**

| 열쇠 | ko | en | ja | zh |
|---|---|---|---|---|
| `offline.title` | 인터넷에 닿지 못했어요 | Can't reach the internet | インターネットに接続できません | 无法连接到网络 |
| `offline.lead` | 연결이 돌아오면 저절로 다시 이어져요 | It'll reconnect on its own once you're back online | 接続が戻れば自動でつながります | 网络恢复后会自动重新连接 |
| `offline.retry` | 다시 해 보기 | Try again | もう一度試す | 重试 |
| `offline.retrying` | 다시 해 보는 중… | Trying… | 試しています… | 正在重试… |

**기존 `connection.lost` · `connection.connecting` 은 그대로 둡니다** — 그건 방 하나의
이야기라 없어지지 않습니다.

**말투는 일상어입니다** — "네트워크 연결 실패" 가 아니라 "인터넷에 닿지 못했어요".
그리고 **`offline.lead` 가 무엇을 하라고 시키지 않는 것**이 중요합니다. 기획서가
단추를 둔 이유가 *"눌러야만 되는 것은 아니다"* 라서, 문장도 기다리면 된다고 말합니다.

---

### 6. 테스트 — `apps/desktop/test/session.test.ts`

지금 있는 `failOnce(net, method, predicate)` 옆에 **`failEvery(net, method)`** 를 하나
더합니다 (같은 모양, 횟수 제한만 없음).

1. **한 번 실패로는 오프라인이 아니다** — 뜸 들이기가 실제로 걸리는지
2. **잇달아 두 번 실패하면 오프라인이다** — `vi.useFakeTimers()` 로 5초 넘기기
3. **다시 닿으면 즉시 풀린다** — **채널이 붙기를 기다리지 않고** 풀려야 한다
4. ★ **방 채널만 실패하는 것은 오프라인이 아니다** (`failEvery(net, 'connect')`)
5. **접속 정보가 없으면 오프라인이 아니다** (`net: null` 로 만든 세션)
6. **`recover()` 는 오프라인을 되돌리지 않는다** — 깨어났는데 아직 안 닿으면 그대로
7. **`retryNow()` 가 닿으면 오프라인이 풀린다**
8. **오프라인이면 재시도가 예약되어 있다** — `refresh()` 로 실패했을 때도 (1.2)

**★ 4번이 이 기능의 핵심 테스트입니다.** 기획서가 갈라 놓은 두 층(앱이 서버에 닿는가 /
방 하나가 붙는가)이 코드에서 합쳐지지 않았음을 지키는 유일한 자리입니다. 이 둘을
합치는 것이 이 기능에서 가장 저지르기 쉬운 실수입니다.

---

## 엣지케이스와 사이드이펙트

- **앱을 켠 직후 5초 남짓은 오프라인이어도 평소 화면이 보입니다.** 뜸 들이기가 그렇게
  정해졌습니다. 창을 다 닫고 트레이에 사는 앱이라 그 순간 창이 떠 있는 일 자체가
  드뭅니다.
- **`refresh()` 는 지금 실패해도 재시도를 예약하지 않습니다.** 오프라인 화면이
  *"저절로 다시 붙어요"* 라고 약속하는 이상 그 구멍을 막아야 합니다 — `fetchTeams()`
  의 catch 가 그 답입니다 (1.2). **이것을 빼면 화면이 거짓말을 합니다.**
- **오류 토스트가 오프라인 화면 뒤에 가려집니다.** `syncConnections()` 가
  `retryStep === 0` 일 때 한 번 내보내는 `error` 는 `ui.errorLine` 에 그려지는데, 그
  줄이 덮이는 본문 안에 있습니다. **덮개가 같은 말을 더 크게 하고 있으므로 문제가
  아닙니다.** 토스트 쪽 코드를 건드리지 않습니다.
- **`AppState` 가 한 칸 커져 창마다 실려 나갑니다.** boolean 하나입니다.
- **기존 테스트는 깨지지 않습니다.** `session.test.ts` 의 "끊긴 연결 되살리기" 다섯
  건은 `failOnce` 라 **두 번째 시도가 성공**하므로 `unreachableStreak` 이 2에 닿지
  않습니다.
- **`memoryStore()` 는 이 기능 때문에 고칠 것이 없습니다** — 저장소에 남기는 값이
  아닙니다. 오프라인은 이번 실행의 상태이지 기억해 둘 것이 아닙니다.
- **`supabase/schema.sql` 을 건드리지 않습니다.** 통째로 클라이언트 쪽이라 **사람이
  콘솔에서 실행할 것이 없습니다.**
- **`CLAUDE.md` 의 "같은 숫자가 세 곳에 있다" 표에 더할 줄이 없습니다** (1.3).
- **네 언어 사전이 걸립니다** — 5장이 넷을 다 적어 두었습니다.
- **oxlint `overrides` 에 더할 것이 없습니다** — 새 폴더를 만들지 않습니다
  (`renderer/OfflineScreen.tsx` 는 이미 `renderer/**` 에 걸립니다).
- **나중에 "방 이름은 각자 부른다" 가 오면 이 자리를 다시 볼 것이 없습니다** —
  오프라인 화면에는 방 이름이 하나도 나오지 않습니다.

---

## 만드는 쪽에게 — 함께 고쳐야 하는 문서

- 이 문서의 인덱스 줄(`docs/DEVELOPMENT.md`)의 상태를 **구현을 마치면 "구현 완료
  (리뷰 대기)" 로** 바꿔 주세요.
- **`docs/PRODUCT.md` 는 고치지 않습니다.** 다만 그 절의 *"아직 만들지 않았습니다"*
  한 줄은 구현이 나간 뒤 기획 쪽에서 걷어낼 자리입니다 — 구현이 기획서를 고치지
  않습니다.
- **`CLAUDE.md` 도 고치지 않습니다.**

---

## 검증

```bash
npm test           # session 테스트 여덟 건 추가 + i18n 열쇠 검사(새 열쇠 넷)
npm run typecheck  # AppState · TeamApi · SettingsApi 가 preload·화면과 다 맞는지
npm run lint       # retryNow() 안의 void 자리
npm run build
```

**`npm run check`(실제 Supabase)는 필요하지 않습니다** — 서버가 하나도 안 바뀝니다.

오프라인은 **닿지 않는 주소**로 흉내 냅니다. `SUPABASE_URL=` 로 비우는 것은 소용이
없습니다 — `main/config.ts` 가 환경변수 → `.env` → 구운 값 순으로 찾아서 저장소 루트의
`config.generated.json` 이 이깁니다 (`CLAUDE.md` 의 함정 목록).

```bash
# 창 셋이 5초쯤 뒤에 덮여야 한다. 제목줄과 알림 아이콘은 남아 있어야 한다.
SUPABASE_URL=https://127.0.0.1:9 BUDDLING_PROFILE=off npm start
```

**눈으로 반드시 볼 것 넷**입니다.

1. 창 셋(방 목록 · 방 상세 · 설정)이 다 덮이는가
2. **제목줄의 알림 아이콘이 남아 있고, 눌러서 알림 창으로 갈 수 있는가**
3. **알림 창은 안 덮이고 사본이 평소 모습 그대로 보이는가**
4. 캐릭터가 그대로 책상에 있고 트레이 메뉴가 동작하는가 (잠재우기까지)

네 언어로 캡처합니다 — `offline.lead` 가 길어 **줄바꿈과 창 셋의 높이 차이**를 봅니다.

```bash
BUDDLING_PROFILE=shot BUDDLING_CAPTURE=.preview/offline BUDDLING_LANG=ja npm start
```

**깜빡임도 손으로 확인합니다.** wifi 를 껐다 5초 안에 다시 켜면 **창이 뒤집히지 않아야
합니다.** 이 기능에서 사람이 실제로 겪는 값어치는 거기 있습니다.
