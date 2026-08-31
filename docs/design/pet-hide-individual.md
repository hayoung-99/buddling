# 캐릭터를 한 마리씩 숨기기 — 개발 설계

**근거 문서** [PRODUCT.md](../PRODUCT.md) 의 **"알고 둔 선택 → 숨기기는 한 마리씩,
모으는 것은 트레이가 한다"** 절 전체, 그리고 같은 문서 **"접속 중과 자리 비움"** 맨
아래의 다섯 줄짜리 비교표(`캐릭터 하나 숨기기` · `모두 숨기기` 두 줄이 새로 생겼습니다).
이 문서는 그 정의를 **어떻게 만들지**만 적습니다. 왜 그렇게 정했는지는 기획서에 있고,
둘이 어긋나 보이면 **기획서가 이깁니다.**

읽는 순서는 [CLAUDE.md](../../CLAUDE.md) → [DEVELOPMENT.md](../DEVELOPMENT.md) →
[PRODUCT.md](../PRODUCT.md) → 이 문서입니다.

---

## 한 줄

**전역 boolean 하나(`store.petVisible`)를 걷어내고, 세션이 들고 있는 런타임
`Set<string>`(숨어 있는 teamId 들)으로 바꿉니다.** 그 집합은 **저장 파일에 남지
않으므로** 앱을 껐다 켜면 캐릭터가 전부 나옵니다. 창을 실제로 감추고 되살리는 일은
메인 프로세스의 **한 함수(`applyPetVisibility()`)** 가 전담하고, 숨기기를 부르는 네
자리는 전부 그 함수로 흘러듭니다.

```
  캐릭터 우클릭 '숨기기' ─┐
  트레이 방별 '숨기기'   ─┤
  방 창의 숨기기 칸      ─┼─→ app.setPetHidden(teamId, hidden)
                          │        │
  트레이 '모두 숨기기'   ─┴─→ app.setAllPetsHidden(hidden)
                                   │
                                   ├─ session.setHidden() / setAllHidden()
                                   │     hiddenTeams(Set) 갱신 → publish()
                                   │        └→ 'teams' → 모든 창의 AppState 갱신
                                   │           (방 창의 숨기기 칸이 여기서 다시 그려진다)
                                   ↓
                            app.applyPetVisibility()
                                   │  숨은 것: pointer.endDrag() + window.hide()
                                   │  보일 것: window.showInactive()
                                   │  숨은 방의 크기 조절 창이면 closeSizePanel()
                                   │  setRendering()  ← 방마다 따로 껐다 켠다
                                   │  tray.refresh()  ← '모두' 글자를 다시 센다
                                   ↓
                              화면에 반영
```

---

## 1. 숨김 상태를 어디에 둘 것인가 (트레이드오프)

이 기능의 유일한 갈림길입니다. 세 후보를 놓고 **(다)** 를 고릅니다.

| 후보 | 어떻게 | 왜 안 되나 / 왜 되나 |
|---|---|---|
| (가) `PetSettings.hidden` (저장) | `asleep` 옆에 한 칸 더. `store.setPet(teamId, { hidden })` | **저장됩니다.** 기획서가 "다음에 켤 때까지 남지 않는다" 를 못 박았습니다. 그리고 `asleep` 바로 옆자리라, 다음 사람이 "왜 얘만 안 남지" 하고 되살릴 위험이 큽니다 |
| (나) `main.ts` 의 앱 껍데기에 `Set` | 창을 다루는 쪽이 상태도 든다 | 방 창(렌더러)이 이 값을 알 길이 없습니다. `AppState` 는 세션이 만들기 때문에, 새 IPC 채널과 새 브로드캐스트와 새 렌더러 훅이 통째로 하나씩 더 필요해집니다 |
| **(다) `session.ts` 의 런타임 `Set`** | `onlineIds`·`connections` 와 같은 자리 | 세션에는 **이미 저장하지 않고 `snapshot()` 으로만 나가는 런타임 상태가 넷 있습니다**(`onlineIds` · `connections` · `update` · `unreachableStreak`). 여기 하나 더 두면 저장할 자리가 아예 없어 실수로 남길 수가 없고, `publish()` 한 번으로 모든 창이 갱신되며, `session.test.ts` 의 메모리 저장소 + `fake-net` 으로 그대로 테스트됩니다 |

**(다)를 고르는 결정적인 이유는 "저장할 방법이 없다" 는 것입니다.** 기획서가 정한
성질(껐다 켜면 사라진다)이 코드 구조 자체로 보장됩니다.

**대신 `Membership.hidden` 은 `PetSettings` 안에 넣지 않습니다.** `PetSettings` 는
저장 파일에 그대로 적히는 칸이라, 그 안에 두면 (가)와 사실상 같아집니다. `onlineIds`·
`connection` 처럼 **`Membership` 최상위**에 둡니다 — 그 자리가 곧 "서버나 런타임에서
와서 저장되지 않는 것" 이라는 뜻입니다.

---

## 2. `packages/shared/src/state.ts`

`Membership` 에 칸 하나를 더합니다.

```ts
export interface Membership {
  team: Team
  member: Member
  members: Member[]
  onlineIds: string[]
  connection: ConnectionState
  pet: PetSettings
  /**
   * 그 방 캐릭터가 지금 화면에서 치워져 있는가 (기획서 "숨기기는 한 마리씩").
   *
   * **`PetSettings` 안에 두지 않는다.** 저쪽은 저장 파일에 그대로 적히는 칸인데, 이
   * 값은 앱이 켜져 있는 동안만 산다 — 껐다 켜면 캐릭터가 전부 나온다. 같은 자리에
   * 두면 다음 사람이 자연스럽게 저장하게 되고, 그때 고장은 "지난주에 숨긴 캐릭터가
   * 오늘 안 나온다" 로 나타난다.
   *
   * **`asleep` 과 아무 관계가 없다.** 재우기는 받는 것을, 숨기기는 보이는 것을
   * 다룬다. 한쪽을 건드려 다른 쪽이 따라 바뀌는 자리는 없다.
   */
  hidden: boolean
}
```

`?` 를 붙이지 않습니다 — 저장 파일에서 오는 값이 아니라 `snapshot()` 이 매번 채우는
값이라 "옛 파일에는 없다" 는 경우가 없습니다.

---

## 3. `apps/desktop/src/main/pet-hiding.ts` (새 파일) — 순수 함수

트레이의 '모두' 항목이 **매번 세어서** 얼굴을 정하는 규칙만 떼어냅니다
(`CLAUDE.md` 규칙 1).

```ts
/**
 * 트레이 맨 아래 '모두' 항목의 얼굴을 정한다.
 *
 * **저장된 스위치를 읽지 않고 지금 보이는 캐릭터를 센다**(기획서 "숨기기는 한
 * 마리씩"). 그래서 한 마리씩 숨기다 마지막 한 마리가 숨는 순간 글자가 저절로
 * '모두 보이기' 로 바뀐다.
 */

/** 세는 데 필요한 것은 이것뿐이다 — 방 목록의 순서도 이름도 보지 않는다 */
export interface RoomVisibility {
  hidden: boolean
}

export interface AllToggle {
  /** 'hide' 면 '모두 숨기기', 'show' 면 '모두 보이기' */
  action: 'hide' | 'show'
  /** 방이 하나도 없으면 눌러도 할 일이 없다 */
  enabled: boolean
}

export function allToggle(rooms: readonly RoomVisibility[]): AllToggle {
  // 방이 없을 때 '모두 보이기' 로 떨어지면, 숨긴 것이 하나도 없는데 부르는 단추가
  // 놓이게 된다. 그래서 글자는 '모두 숨기기' 로 두고 누르지 못하게 한다.
  if (rooms.length === 0) return { action: 'hide', enabled: false }
  return { action: rooms.some((room) => !room.hidden) ? 'hide' : 'show', enabled: true }
}
```

### 3.1 `apps/desktop/test/pet-hiding.test.ts` (새 파일)

| 무엇 | 기대 |
|---|---|
| 방이 없다 | `{ action: 'hide', enabled: false }` |
| 셋 다 보인다 | `{ action: 'hide', enabled: true }` |
| **하나라도 보인다** (숨김 2 · 보임 1) | `{ action: 'hide', enabled: true }` |
| 셋 다 숨었다 | `{ action: 'show', enabled: true }` |
| 방이 하나뿐이고 숨었다 | `{ action: 'show', enabled: true }` |

---

## 4. `apps/desktop/src/main/session.ts`

### 4.1 런타임 집합

`onlineIds`(115행) 근처에 나란히 둡니다.

```ts
/**
 * 지금 화면에서 치워 둔 방들 (기획서 "숨기기는 한 마리씩").
 *
 * **저장소에 남기지 않는다.** 이 파일의 다른 런타임 상태(`onlineIds`·`connections`)와
 * 같은 자리에 두는 이유가 그것이다 — 저장할 방법이 아예 없어야 실수로 남지 않는다.
 * 앱을 껐다 켜면 캐릭터가 전부 나온다.
 */
const hiddenTeams = new Set<string>()
```

### 4.2 `forget()` 에 한 줄

```ts
function forget(teamId: string) {
  onlineIds.delete(teamId)
  connections.delete(teamId)
  lastTapAt.delete(teamId)
  // 안 지우면, 숨겨 둔 방을 나갔다가 **같은 방에 다시 들어왔을 때** 캐릭터가 숨은
  // 채로 태어난다. 그 사람에게는 캐릭터가 안 나오는 고장으로 보인다.
  hiddenTeams.delete(teamId)
}
```

`forget()` 은 내가 나갈 때(`leaveTeam`)와 내보내졌을 때(`applyTeams`) 양쪽에서
불리므로 이 한 줄이면 두 경우가 모두 덮입니다.

### 4.3 `snapshot()`

`memberships` 를 만드는 자리(215행)에 한 줄:

```ts
memberships: [...memberships.values()].map((entry) => ({
  ...entry,
  onlineIds: onlineIds.get(entry.team.id) ?? [],
  connection: connections.get(entry.team.id) ?? 'idle',
  pet: store.pet(entry.team.id),
  hidden: hiddenTeams.has(entry.team.id),
})),
```

### 4.4 새 메서드 셋 — `isAsleep`/`setAsleep` 바로 아래

```ts
/**
 * 캐릭터 한 마리를 숨기거나 다시 부른다.
 *
 * **창을 실제로 감추는 것은 여기가 아니다** — 여기는 상태만 바꾸고 알린다. 창을
 * 만지는 일은 메인 프로세스의 `applyPetVisibility()` 가 한다. 그래서 이것만 직접
 * 부르면 상태는 바뀌는데 캐릭터는 그대로 있는 어긋남이 생긴다. 부르는 자리는
 * 언제나 `app.setPetHidden()` 이다.
 */
setHidden(teamId: string, hidden: boolean) {
  if (!memberships.has(teamId)) return snapshot()
  if (hidden) hiddenTeams.add(teamId)
  else hiddenTeams.delete(teamId)
  publish()
  return snapshot()
},

/**
 * 트레이의 '모두' 하나뿐 (기획서: 캐릭터 우클릭 메뉴에는 '모두' 가 없다).
 *
 * **'모두 보이기' 는 한 마리씩 숨겨 둔 기억까지 지운다.** '모두' 라고 적어 두고 몇을
 * 남겨 두면 고장으로 읽힌다.
 */
setAllHidden(hidden: boolean) {
  hiddenTeams.clear()
  if (hidden) for (const teamId of memberships.keys()) hiddenTeams.add(teamId)
  publish()
  return snapshot()
},

/** 그 방 캐릭터가 지금 숨어 있는가 (트레이·메뉴가 글자를 고를 때 본다) */
isHidden(teamId: string) {
  return hiddenTeams.has(teamId)
},
```

`commit()` 이 아니라 `publish()` 를 부릅니다 — `commit()` 은 소속을 저장소에 적는
일까지 하는데, 여기서는 저장할 것이 없습니다.

### 4.5 `session.test.ts` 에 더할 것

`memoryStore()` 의 `petVisible: true` 줄을 **지웁니다**(6절에서 그 칸이 없어집니다).
`Store` 타입을 만족시켜야 하므로 안 지우면 컴파일이 깨지고, 그게 이 저장소가 노리는
안전장치입니다.

새 테스트:

| 무엇 | 기대 |
|---|---|
| `setHidden(a, true)` | `snapshot().memberships` 에서 a 만 `hidden: true`, 나머지는 false |
| 같은 상황에서 `store.peek()` | `pets[a]` 에 `hidden` 이 **없다** (저장되지 않았다) |
| `setAllHidden(true)` → `setAllHidden(false)` | 개별로 숨겨 둔 것까지 전부 `hidden: false` |
| `setHidden(a, true)` 뒤 `leaveTeam(a)` | `isHidden(a)` 가 false (4.2) |
| 없는 teamId 로 `setHidden` | 아무 일도 없다 |
| `setHidden` 이 `asleep` 을 건드리지 않는다 | 재운 방을 숨겼다 불러도 `pet.asleep` 그대로 |

---

## 5. `apps/desktop/src/main/main.ts`

### 5.1 `isPetVisible` · `setPetVisible` 를 걷어내고 셋으로 나눈다

```ts
isPetHidden(teamId: string) {
  return Boolean(app.session?.isHidden(teamId))
},

/** 캐릭터 한 마리를 숨기거나 다시 부른다 (세 자리에서 온다) */
setPetHidden(teamId: string, hidden: boolean) {
  app.session?.setHidden(teamId, hidden)
  app.applyPetVisibility()
},

/** 트레이의 '모두' 하나뿐 */
setAllPetsHidden(hidden: boolean) {
  app.session?.setAllHidden(hidden)
  app.applyPetVisibility()
},

/**
 * 지금의 숨김 상태를 창에 그대로 반영한다.
 *
 * **몇 번을 불러도 결과가 같다.** 그래서 숨기기를 부른 자리와 `syncPetWindows()`
 * 양쪽에서 부담 없이 부른다. 실제로 두 번 불리는 길이 있다 — `session.setHidden()`
 * 이 `publish()` 하면 `session.on('teams')` 가 `syncPetWindows()` 를 부르고, 그
 * 안에서 한 번, 위 `setPetHidden()` 에서 또 한 번이다. 그 순서에 기대지 않으려고
 * 일부러 양쪽 모두에서 부른다.
 */
applyPetVisibility() {
  for (const [teamId, { window, pointer }] of app.pets) {
    if (window.isDestroyed()) continue
    if (app.isPetHidden(teamId)) {
      // 끌던 중에 창이 사라지면 커서를 좇던 타이머가 갈 곳을 잃는다
      pointer.endDrag()
      window.hide()
    } else if (!window.isVisible()) {
      window.showInactive()
    }
  }
  // 숨은 캐릭터 옆에 크기 조절 창만 덩그러니 남지 않게 한다
  if (app.sizePanelTeamId && app.isPetHidden(app.sizePanelTeamId)) app.closeSizePanel()
  app.setRendering()
  app.tray?.refresh()
},
```

**여기서 `pointer.setInteractive(false)` 를 부르지 마세요.** 그럴듯해 보이지만
어긋납니다 — 렌더러(`pet/pet.ts` 의 `setInteractive`)가 자기 쪽 값을 캐시해 두고
같은 값이면 IPC 를 보내지 않기 때문에, 메인만 몰래 false 로 돌려놓으면 다시 보인 뒤
커서를 캐릭터 위에 올려도 렌더러가 "이미 true 인데" 하고 넘어가 **캐릭터를 누를 수
없게 됩니다.** 숨긴 창은 애초에 마우스 이벤트를 받지 않으므로 이 호출은 필요도
없습니다. `endDrag()` 는 `if (!drag) return` 으로 시작해 여러 번 불려도 안전합니다.

### 5.2 `setRendering` 을 방 단위로

```ts
/**
 * 캐릭터 창들에게 지금 그려도 되는지 알린다.
 *
 * 아무도 안 보는 그림을 그릴 이유가 없다. 숨긴 창도, 잠든 컴퓨터도 마찬가지다.
 * 숨긴 창은 브라우저가 알아서 멈춰 줄 것 같지만 실제로는 그렇지 않다.
 *
 * **이제 판단이 방마다 다르다** — 한 마리만 숨기면 그 창만 멈추고 나머지는 계속
 * 그린다.
 *
 * @param onlyTeamId 방금 만들어진 창 하나에만 알릴 때
 */
setRendering(onlyTeamId: string | null = null) {
  const teamIds = onlyTeamId ? [onlyTeamId] : [...app.pets.keys()]
  for (const teamId of teamIds) {
    const window = app.petWindow(teamId)
    if (!window || window.isDestroyed()) continue
    window.webContents.send('render', app.awake && !app.isPetHidden(teamId))
  }
},
```

부르는 쪽 두 곳을 고칩니다.

- `did-finish-load` (164행): `() => app.setRendering(window)` → `() => app.setRendering(teamId)`
  (그 자리에 `teamId` 가 클로저로 있고, `app.pets.set()` 이 그보다 앞줄이라 이미 등록돼 있습니다)
- `sleep()` · `wake()`: 인자 없이 그대로

### 5.3 `syncPetWindows()`

- **166행 `if (!store.get('petVisible')) window.hide()` 를 지웁니다.** 새로 태어나는
  캐릭터는 언제나 보입니다 — '모두 숨기기' 를 눌러 둔 채로 새 방에 들어가도 그 방
  캐릭터는 나옵니다(승인된 결정). 한 번도 숨긴 적 없는 방이라 `hiddenTeams` 에 그
  id 가 있을 수 없고, 그래서 아래 `applyPetVisibility()` 도 그 창을 건드리지 않습니다.
- 맨 끝의 `app.tray?.refresh()` 를 **`app.applyPetVisibility()` 로 바꿉니다**
  (그 함수가 트레이도 새로 짓습니다).

### 5.4 `openSizePanel(teamId)`

첫머리에 한 줄 더합니다.

```ts
// 숨어 있는 캐릭터 옆에는 놓을 자리가 없다. 트레이 방별 메뉴에서 '크기 조절' 을
// 흐려 두지만(7절), 그 메뉴가 뜬 사이에 상태가 바뀔 수 있어 여기서도 막는다.
if (app.isPetHidden(teamId)) return
```

---

## 6. `apps/desktop/src/main/store.ts`

- `StoredState` 에서 **`petVisible: boolean`(71행)을 지웁니다.**
- `DEFAULTS` 에서 **`petVisible: true`(106행)를 지웁니다.**

파일 맨 위의 "저장하는 것" 목록에는 원래 이 칸이 없으므로 손댈 것이 없습니다.

**옛 저장 파일에 남아 있는 `petVisible` 키는 그냥 둡니다.** `load()` 가
`{ ...DEFAULTS, ...JSON.parse(...) }` 로 읽어 그 키가 메모리에 그대로 실려 다음 저장
때 다시 적히지만, **읽는 곳이 한 군데도 없으므로 아무 일도 하지 않습니다.** 지우는
마이그레이션을 따로 쓰지 않는 이유는, 그 코드가 하는 일이 파일을 몇 바이트 줄이는
것뿐이면서 저장 파일을 건드리는 위험(세션이 곧 신원입니다)은 그대로 지기 때문입니다.

**이것이 곧 "예전에 모두 숨기기를 눌러 둔 채 껐던 사람" 의 답입니다** — 새 버전은 그
값을 읽지 않으므로 캐릭터가 전부 나옵니다. 기획서가 정한 그대로입니다.

---

## 7. `apps/desktop/src/main/tray.ts`

### 7.1 `TrayHost`

```ts
isPetHidden(teamId: string): boolean
setPetHidden(teamId: string, hidden: boolean): void
setAllPetsHidden(hidden: boolean): void
```

`isPetVisible` · `setPetVisible` 는 지웁니다.

### 7.2 방별 서브메뉴

```ts
const teamItems = memberships.length
  ? memberships.map((entry) => {
      const asleep = app.isAsleep(entry.team.id)
      const hidden = app.isPetHidden(entry.team.id)
      return {
        label: t('app.teamSummary', { name: entry.team.name, count: entry.members.length }),
        submenu: [
          { label: t('app.detail'), click: () => app.openTeamDetail(entry.team.id) },
          // 숨어 있는 캐릭터 옆에는 크기 조절 창을 놓을 자리가 없다
          { label: t('app.resize'), enabled: !hidden, click: () => app.openSizePanel(entry.team.id) },
          {
            label: asleep ? t('app.wake') : t('app.sleep'),
            click: () => app.setAsleep(entry.team.id, !asleep),
          },
          // 숨은 캐릭터를 다시 부르는 두 자리 중 하나. 나머지 하나는 방 창이다
          // (우클릭 메뉴에는 둘 수 없다 — 숨은 캐릭터는 우클릭할 자리가 없다)
          {
            label: hidden ? t('app.show') : t('app.hide'),
            click: () => app.setPetHidden(entry.team.id, !hidden),
          },
        ],
      }
    })
  : [{ label: t('app.noTeams'), enabled: false }]
```

### 7.3 최상위 '모두' 항목

```ts
import { allToggle } from './pet-hiding'
...
const toggle = allToggle(
  memberships.map((entry) => ({ hidden: app.isPetHidden(entry.team.id) })),
)
...
{
  label: toggle.action === 'hide' ? t('app.hideAll') : t('app.showAll'),
  enabled: toggle.enabled,
  click: () => app.setAllPetsHidden(toggle.action === 'hide'),
},
```

메뉴는 `refresh()` 때 새로 지어지고, `applyPetVisibility()` 가 그것을 부르므로
글자는 언제나 방금 센 결과입니다.

---

## 8. `apps/desktop/src/main/ipc.ts`

### 8.1 캐릭터 우클릭 메뉴 (`pet:menu`)

152행을 **바꿔 끼웁니다.** '모두 숨기기' 는 여기서 **사라집니다** — 기획서가 '모두'
를 트레이 한 곳으로 못 박았습니다.

```ts
// 숨기는 세 자리 중 하나. 여기에는 '다시 부르기' 가 없다 — 숨은 캐릭터는 우클릭할
// 자리가 없어서 이 메뉴 자체를 열 수 없다. 되돌리는 길은 트레이 방별 메뉴와 방 창이다.
// '모두 숨기기' 도 여기 두지 않는다 (기획서: '모두' 는 트레이 한 곳뿐).
{ label: t('app.hide'), click: () => app.setPetHidden(teamId, true) },
```

### 8.2 방 창이 부르는 통로 (새 채널)

`sleep:set` 바로 아래에 둡니다.

```ts
// **`session.setHidden()` 을 직접 부르지 않는다.** 그러면 상태만 바뀌고 창은
// 그대로 있다. 창을 감추는 일까지 하는 것은 `app.setPetHidden()` 이다.
handle('hidden:set', ({ teamId, hidden }: { teamId: string; hidden: boolean }) => {
  app.setPetHidden(teamId, Boolean(hidden))
  return session.snapshot()
})
```

---

## 9. 통로의 모양 — `packages/shared/src/ipc.ts` · `apps/desktop/src/preload/team.ts`

`TeamApi` 에 한 줄 (`setAsleep` 바로 아래):

```ts
/** 이 방 캐릭터를 화면에서 치우거나 다시 부른다 (앱을 껐다 켜면 전부 나온다) */
setHidden: (teamId: string, hidden: boolean) => Promise<AppState>
```

preload:

```ts
setHidden: (id, hidden) => call<AppState>('hidden:set', { teamId: id, hidden }),
```

`PetApi` 는 손대지 않습니다 — 캐릭터 창은 우클릭 메뉴(메인이 만듭니다)로만 숨기므로
새 통로가 필요 없습니다.

---

## 10. 방 창 — `apps/desktop/src/renderer/team/TeamDetail.tsx`

`SleepRow` 를 그대로 본뜬 `HideRow` 를 더하고, **재우기 섹션 바로 아래**에 같은 모양의
섹션으로 놓습니다(승인된 결정).

```tsx
/**
 * 이 방 캐릭터를 화면에서 치우고 다시 부른다.
 *
 * **보이는 것 이야기다.** 재우기(위 `SleepRow`)와 아무 관계가 없다 — 숨겨도 방의
 * 신호는 그대로 오가고, 남에게 나는 여전히 '접속 중' 이다(기획서 "숨기기는 한
 * 마리씩").
 *
 * 여기 말고 트레이의 방별 메뉴에도 같은 것이 있다. 캐릭터 우클릭 메뉴에는 숨기기만
 * 있다 — 숨은 캐릭터는 우클릭할 자리가 없기 때문이다. 그래서 **되돌릴 수 있는 두
 * 자리 중 하나가 여기다.** 이 칸을 없애면 한 마리를 숨긴 사람이 그 한 마리만 부르는
 * 길을 잃는다.
 */
function HideRow({
  teamId,
  hidden,
  t,
  run,
  toast,
}: {
  teamId: string
  hidden: boolean
  t: Translate
  run: (action: () => Promise<unknown>) => Promise<void>
  toast: (message: string) => void
}) {
  return (
    <div className="flex items-center gap-[12px] bg-card rounded-card px-[14px] py-[12px]">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[13px]">
          {hidden ? t('detail.hidden') : t('detail.shown')}
        </div>
        <div className="text-[12px] text-ink-soft leading-[1.4] break-keep">
          {hidden ? t('detail.hiddenHint') : t('detail.shownHint')}
        </div>
      </div>
      <button
        className={hidden ? ui.buttonTiny : ui.buttonTinyGhost}
        onClick={() =>
          run(async () => {
            await window.teamApi.setHidden(teamId, !hidden)
            toast(t(hidden ? 'toast.unhid' : 'toast.hid'))
          })
        }
      >
        {hidden ? t('detail.show') : t('detail.hide')}
      </button>
    </div>
  )
}
```

붙이는 자리 (재우기 섹션 바로 다음, `errorLine` 앞):

```tsx
<section className={ui.section}>
  <h2 className={ui.h2}>{t('detail.hideSection')}</h2>
  <HideRow teamId={teamId} hidden={entry.hidden} t={t} run={run} toast={show} />
</section>
```

**`TeamList.tsx` 는 손대지 않습니다.** 목록의 한 줄은 통째로 "그 방 열기" 단추라
(`<button className={ui.row}>`) 그 안에 또 다른 단추를 넣을 수 없고, 기획서가 정한
자리는 "방 창" 이지 "방 목록" 이 아닙니다.

---

## 11. 네 언어 사전 — `packages/shared/src/i18n/{ko,en,ja,zh}.json`

**네 파일을 전부 고칩니다** (`CLAUDE.md` 규칙 2). `apps/desktop/test/i18n.test.ts` 가
빠진 열쇠·남는 열쇠·빈 문장을 잡습니다.

### 11.1 고치는 것 하나 — `app.showAll`

기획서가 라벨을 **'캐릭터 모두 보이기'** 로 못 박았습니다. 지금 문구에는 '모두' 가
빠져 있어 '모두 숨기기' 와 짝이 맞지 않습니다.

| 열쇠 | 지금 | 바꿀 것 |
|---|---|---|
| `app.showAll` (ko) | 캐릭터 보이기 | **캐릭터 모두 보이기** |
| `app.showAll` (en) | Show characters | **Show all characters** |
| `app.showAll` (ja) | キャラクターを表示 | **キャラクターをすべて表示** |
| `app.showAll` (zh) | 显示角色 | **显示所有角色** |

`app.hideAll` 은 그대로 둡니다.

### 11.2 새로 넣는 것 — 메뉴용 (`app.hideAll` · `app.showAll` 다음 줄)

| 열쇠 | ko | en | ja | zh |
|---|---|---|---|---|
| `app.hide` | 이 캐릭터 숨기기 | Hide this character | このキャラクターを隠す | 隐藏这个角色 |
| `app.show` | 이 캐릭터 보이기 | Show this character | このキャラクターを表示 | 显示这个角色 |

### 11.3 새로 넣는 것 — 방 창용 (`detail.wake` 다음 줄)

| 열쇠 | ko | en |
|---|---|---|
| `detail.hideSection` | 화면에서 숨기기 | Hide from the screen |
| `detail.shown` | 화면에 있어요 | On screen |
| `detail.shownHint` | 숨기면 이 방 캐릭터만 사라져요. 다른 방 캐릭터는 그대로 있어요. | Hiding takes away only this team's character. The others stay. |
| `detail.hidden` | 숨어 있어요 | Hidden |
| `detail.hiddenHint` | 다시 부르기 전까지 화면에 없어요. 방의 신호는 그대로 오고 가요. | It's off the screen until you bring it back. Signals still come and go. |
| `detail.hide` | 숨기기 | Hide |
| `detail.show` | 보이기 | Show |

| 열쇠 | ja | zh |
|---|---|---|
| `detail.hideSection` | 画面から隠す | 从屏幕上隐藏 |
| `detail.shown` | 画面にいます | 在屏幕上 |
| `detail.shownHint` | 隠すとこのルームのキャラクターだけが消えます。ほかのルームはそのままです。 | 隐藏后只有这个房间的角色会消失，其他房间的角色照旧。 |
| `detail.hidden` | 隠れています | 已隐藏 |
| `detail.hiddenHint` | 呼び戻すまで画面に出てきません。合図はいつもどおり届きます。 | 在你把它叫回来之前不会出现。信号照常收发。 |
| `detail.hide` | 隠す | 隐藏 |
| `detail.show` | 表示 | 显示 |

### 11.4 새로 넣는 것 — 토스트 (`toast.woke` 다음 줄)

| 열쇠 | ko | en | ja | zh |
|---|---|---|---|---|
| `toast.hid` | 이 방 캐릭터를 숨겼어요 | This character is hidden now | このルームのキャラクターを隠しました | 已隐藏这个房间的角色 |
| `toast.unhid` | 이 방 캐릭터를 다시 불렀어요 | This character is back | このルームのキャラクターを呼び戻しました | 已让这个房间的角色回来 |

ja 는 방을 `ルーム`, zh 는 `房间` 으로 부릅니다 — 그 파일들의 기존 문구를 따랐습니다.

---

## 12. 함께 고칠 주석

옛 동작을 설명하는 주석이 셋 남아 있습니다. **문구만 고치고 코드는 건드리지 않습니다.**

| 자리 | 지금 | 고칠 것 |
|---|---|---|
| `main/main.ts` 141행 | "캐릭터를 없애는 길은 트레이의 '숨기기' 와 방 나가기뿐이다" | 숨기는 자리가 셋이 되었으므로 "숨기기(세 자리)와 방 나가기뿐이다" 로 |
| `main/windows.ts` 86행 | 같은 문장 | 같음 |
| `CLAUDE.md` 698행 | "없애는 길은 트레이의 '숨기기'와 팀 나가기뿐입니다" | 같음 |

---

## 13. 하지 않는 것

- **`TeamList.tsx`(방 목록)에는 숨기기를 두지 않습니다** — 10절.
- **캐릭터 우클릭 메뉴에 '모두' 를 두지 않습니다** — 기획서가 트레이 한 곳으로 못
  박았습니다.
- **숨김 상태를 저장하지 않습니다** — 1절·6절.
- **재우기와 엮지 않습니다.** `setHidden` 은 `asleep` 을 읽지도 쓰지도 않고, `setAsleep`
  도 마찬가지입니다. 기획서가 "한쪽을 건드려 다른 쪽이 따라 바뀌는 자리는 없다" 고
  적었습니다.
- **눈으로 확인하는 도구에 숨김 스위치를 만들지 않습니다.** `BUDDLING_ASLEEP` 같은
  `BUDDLING_HIDDEN` 을 `dev-capture.ts` 에 더하면 편하겠지만, 숨긴 캐릭터는 찍을
  그림이 없어서(창이 사라집니다) 캡처로 확인할 것이 남는 캐릭터의 유무뿐입니다.
  `docs/BACKLOG.md` 에 적어 둡니다.
- **`petVisible` 을 저장 파일에서 지우는 마이그레이션을 쓰지 않습니다** — 6절.

---

## 14. 무엇을 검사하나

### 14.1 자동

```bash
npm test          # pet-hiding.test.ts(새것) · session.test.ts(추가) · i18n.test.ts
npm run typecheck # Membership.hidden · TeamApi.setHidden · TrayHost · memoryStore
npm run lint
npm run build
```

`i18n.test.ts` 는 따로 고칠 것이 없습니다 — 열쇠를 네 파일에 넣기만 하면 통과하고,
한 파일이라도 빠뜨리면 그 자리에서 걸립니다.

### 14.2 손으로 하는 확인 — 이것 없이는 끝난 것이 아닙니다

방 셋을 만들어 놓고(`npm run start:both` 또는 `BUDDLING_SEED="가족:나영;동아리:나영;스터디:나영"`)
아래를 순서대로 봅니다.

1. 가운데 캐릭터를 우클릭 → '이 캐릭터 숨기기' → **그 한 마리만** 사라지고 나머지 둘은 논다
2. 트레이 → 그 방의 메뉴 → '이 캐릭터 보이기' → 다시 나온다. **나온 캐릭터를 클릭하면
   신호가 나가야 한다** (5.1 의 `setInteractive` 함정 확인)
3. 방 창을 열어 '숨기기' → 사라지고, 그 칸이 '숨어 있어요' 로 바뀐다 → '보이기' → 돌아온다
4. 한 마리씩 셋을 다 숨긴다 → 트레이 최상위 글자가 **저절로** '캐릭터 모두 보이기' 로 바뀐다
5. '캐릭터 모두 보이기' → 셋 다 나온다
6. 한 마리를 숨긴 뒤 '캐릭터 모두 숨기기' → '캐릭터 모두 보이기' → **셋 다** 나온다
7. 어떤 캐릭터의 크기 조절 창을 열어 둔 채 **그 캐릭터**를 숨긴다 → 크기 조절 창도 닫힌다.
   **다른 캐릭터**를 숨긴다 → 크기 조절 창은 그대로 있다
8. 숨긴 상태에서 트레이의 그 방 메뉴를 연다 → '크기 조절…' 이 흐려져 있다
9. 한 마리를 숨긴 채 앱을 끄고 다시 켠다 → **셋 다 나온다.** 방 목록 창도 평소처럼 뜬다
10. 한 방을 재운 뒤 그 캐릭터를 숨겼다 다시 부른다 → 여전히 자고 있다(웅크린 자세).
    자는 방을 깨워도 숨긴 캐릭터가 저절로 나오지 않는다
11. 방이 하나도 없는 상태에서 트레이를 연다 → '캐릭터 모두 숨기기' 가 흐려져 있다
12. 세 마리를 다 숨긴 뒤 새 방에 참여한다 → **그 방 캐릭터는 나온다**(승인된 결정)
13. `BUDDLING_METRICS=5 npm start` 로, 한 마리를 숨긴 뒤 CPU 가 실제로 내려가는지 본다
    (5.2 의 방별 `render` 가 도는지)

---

## 15. 함께 고칠 문서

- `docs/DEVELOPMENT.md` 의 "기능별 설계 문서" 표에 이 문서 한 줄
- `docs/BACKLOG.md` 에 캡처 스위치 한 줄 (13절)
- `CLAUDE.md` 698행 주석 문구 (12절)
