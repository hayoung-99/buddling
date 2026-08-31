# 종료가 앱을 완전히 끝내게 — 개발 설계

**근거 문서** [PRODUCT.md](../PRODUCT.md) 의 **"알고 둔 선택 → 접속 중과 자리 비움"** 절,
그중에서도 *"끄는 것은 진짜로 끄는 것입니다"* 와 맨 아래 네 줄짜리 비교표. 그리고
**"일부러 하지 않은 것"** 표의 *"내가 골라서 내거는 상태"* 항목(앱을 켜 놨는지는 예외로
명시됨). 이 문서는 그 정의를 **어떻게 만들지**만 적습니다. 왜 그렇게 정했는지는
기획서에 있고, 둘이 어긋나 보이면 **기획서가 이깁니다.**

읽는 순서는 [CLAUDE.md](../../CLAUDE.md) → [DEVELOPMENT.md](../DEVELOPMENT.md) →
[PRODUCT.md](../PRODUCT.md) → 이 문서입니다.

---

## 한 줄

**캐릭터 창을 "못 닫는 창"(`closable: false`)으로 만드는 것을 그만두고, "평소에는 닫지
않는 창"(`close` 를 `preventDefault`)으로 바꿉니다.** 그리고 **네이티브 메뉴가 화면에서
사라진 뒤에** 종료를 시작하고, 그래도 안 끝나면 **몇 초 뒤에 강제로 끝냅니다.**

```
  트레이 '종료' ─┐
                 ├─→ quitGate.request()
  캐릭터 '종료' ─┘        │
                          │  메뉴가 떠 있나?
                 ┌────────┴────────┐
             떠 있다              아니다
                 │                  │
      menu-will-close 를 기다림      │
                 └────────┬─────────┘
                          ↓
                   electronApp.quit()
                          ↓
                  before-quit → shutdown()
                          │   quitting = true
                          │   updates.stop()
                          │   store.flush()
                          │   session.dispose()   (기다리지 않음)
                          │   armWatchdog()  ← 2초 뒤에도 살아 있으면 app.exit(0)
                          ↓
              Electron 이 창을 하나씩 닫는다
                          ↓
        캐릭터 창의 close 가드가 quitting 을 보고 순순히 비켜 준다
                          ↓
                     will-quit → quit
```

---

## 1. 무엇이 고장 났는지 — 재현해서 확인한 것

추측이 아니라 **실제로 돌려 보고 확인한 것들**입니다. Electron 43.4.1, macOS.
확인 방법은 [7장](#7-어떻게-확인했나-재현-방법)에 적어 두었습니다.

### 1.1 `closable: false` 는 지금도 종료를 통째로 취소시킨다 — 확인됨

`quit.ts` 맨 위 주석이 설명하는 그 동작은 **여전히 사실입니다.** 닫을 수 없는 창을
그대로 둔 채 `app.quit()` 을 부르면, `before-quit` · 창 닫기까지 갔다가 종료가 취소되고
프로세스가 그대로 남습니다. 그래서 지금의 `releaseUnclosableWindows()` 는 **없어도 되는
장치가 아니라 반드시 있어야 하는 장치**입니다. 걷어내려면 그것을 대신할 것이 있어야
합니다.

### 1.2 그런데 지금 코드의 순서 자체는 멀쩡하다 — 확인됨

**진짜 앱을 띄워서** `app.quit()` 을 직접 불러 봤습니다. 아래 세 가지 상황 모두
**깨끗하게 종료됩니다.**

| 상황 | 결과 |
|---|---|
| 캐시된 소속 1개 + 서버에 못 닿는 상태, 캐릭터 창 1개 | 프로세스까지 사라짐 |
| `BUDDLING_FAKE_NET=1`, 캐릭터 창 1개 + 방 목록 창 | 프로세스까지 사라짐 |
| `BUDDLING_FAKE_NET=1`, 캐릭터 창 3개 + 방 목록 창 | 프로세스까지 사라짐 |

즉 **예전 수정(#27)이 풀린 것이 아닙니다.** `shutdown()` 의
`quitting = true` → `releaseUnclosableWindows()` 순서는 지금도 제 일을 합니다.
"어딘가에서 다시 풀렸을 것" 이라는 짐작은 **틀렸습니다.**

### 1.3 진짜 원인 — 네이티브 메뉴가 떠 있는 동안 종료하면 프로세스가 얼어붙는다

**이것이 새로 찾은 것입니다.** 네이티브 팝업 메뉴(트레이의 `popUpContextMenu()` 든
창의 `Menu.popup()` 이든)가 아직 화면에 있는 동안 `app.quit()` 을 부르면:

- `before-quit` · `will-quit` · `quit` 이 **전부 정상으로 발생하고**
- 캐릭터 창도 **정상으로 사라지고**
- 그런데 **프로세스가 끝나지 않습니다.** 그 뒤로는 JS 타이머조차 돌지 않습니다 —
  미리 걸어 둔 `setTimeout` 도, `process.exit(0)` 도 듣지 않습니다.

까닭은 메뉴 추적이 **중첩된 실행 루프**라서입니다. `Browser::Shutdown()` 이 종료시키는
것은 **가장 바깥 루프**인데, 지금 서 있는 자리는 그 안쪽 루프입니다. 안쪽이 끝나야
바깥으로 돌아가는데, 메뉴가 닫히지 않으면 안쪽이 끝나지 않습니다.

**이 앱에서 종료로 가는 길은 둘뿐이고 둘 다 메뉴입니다** (`tray.ts:96`,
`ipc.ts:153`). 그래서 늘 이 함정 위를 지나갑니다.

> **2026-08-31 낡음.** 이 문서가 구현되고 리뷰까지 끝난 뒤, 캐릭터 우클릭 메뉴의
> 종료 항목이 빠졌습니다 — 이제 buddling 종료(프로세스 완전 종료)로 가는 길은
> **트레이 메뉴 하나뿐**입니다. 이 장이 설명하는 "메뉴가 떠 있는 동안 종료하면
> 얼어붙는다" 는 원리와 [3장](#3-메뉴가-사라진-뒤에-종료한다)의 `quitGate` 설계는
> 여전히 유효합니다 — 캐릭터 우클릭 메뉴가 열려 있는 동안 트레이에서 종료해도 같은
> 방어가 걸려야 하므로, `ipc.ts` 의 `pet:menu` 는 여전히 `app.menuOpened(menu)` 를
> 부릅니다.

> 사람이 항목을 클릭하면 macOS 가 메뉴를 닫아 주므로, 클릭 콜백이 메뉴가 닫히기 전에
> 도는지 후에 도는지에 따라 재수가 갈립니다. 실제로 "고른 직후 메뉴를 닫아 준" 흉내를
> 낸 경우에는 정상 종료했습니다. **이 앱이 간헐적으로 안 꺼지는 것처럼 보이는 이유가
> 이 경계입니다.** 어느 쪽으로 갈지 운에 맡기지 않는 것이 이번 설계의 핵심입니다.

### 1.4 범위 2("연결하는 중…")는 1.3 의 결과다 — 별도 원인이 아니다

1.3 으로 프로세스가 남으면 그 앱은 이런 상태입니다.

- `shutdown()` 을 이미 지났으므로 `session.dispose()` 가 돌아 **`disposed = true`** 입니다.
  `scheduleRetry()` 와 `syncConnections()` 는 첫 줄에서 되돌아 나오므로
  (`session.ts:392`, `session.ts:410`) **다시는 방에 붙지 않습니다.**
- 그런데 `requestSingleInstanceLock()`(`main.ts:55`)의 잠금은 그대로 쥐고 있습니다.
- 그래서 사용자가 앱을 다시 켜면 **새 프로세스는 조용히 물러나고**, 좀비가
  `second-instance` 를 받아 **자기 방 목록 창**을 엽니다. 그 창의 `connection` 은
  영영 `connected` 가 되지 않고, `TeamList.tsx:177` 의 갈래에 따라
  **"연결하는 중…" 으로만 보입니다.**
- 채널은 이미 내려갔으므로 **남의 화면에서 나는 자리 비움**입니다.

증상 넷이 하나의 원인에서 그대로 따라 나옵니다. **범위 2 에 따로 손댈 곳은
없습니다.** 다만 "종료 절차를 밟았는데 살아 있는 앱" 이라는 상태 자체가 다시는 생기지
않도록 [4장](#4-안전망--강제-종료-워치독)의 워치독을 둡니다.

---

## 2. 캐릭터 창 — `closable: false` 를 걷어낸다

### 2.1 무엇을 바꾸나

**`apps/desktop/src/main/windows.ts`** `createPetWindow()` 에서 `closable: false`
(88번째 줄)를 **지웁니다.** 함께 있던 주석도 아래 사실에 맞게 다시 씁니다.

**`apps/desktop/src/main/main.ts`** `syncPetWindows()` 에서 창을 만든 직후,
지금 `closed` 처리기를 다는 자리 바로 위에 **`close` 가드**를 답니다.

```ts
// 캐릭터를 없애는 길은 트레이의 "숨기기" 와 방 나가기뿐이다. 그래서 평소에는 닫히지
// 않게 막는다 (맥의 ⌘W 가 여기로 온다).
//
// **종료 중에는 막지 않는다.** 여기서 막으면 Electron 이 "닫지 못한 창" 으로 보고
// 종료를 통째로 취소한다 — `closable: false` 가 일으키던 것과 똑같은 고장이다
// (까닭은 `quit.ts` 맨 위에 적어 두었다).
window.on('close', (event) => {
  if (app.quitting) return
  event.preventDefault()
})
```

### 2.2 왜 이 방법인가 (트레이드오프)

| | **지금 방법** — 못 닫는 창 + 나가기 직전에 `destroy()` | **새 방법** — 평소에만 닫기를 거절 |
|---|---|---|
| ⌘W 를 막나 | 막는다 | **막는다** (`preventDefault`) |
| 종료가 되나 | 된다, **단 순서가 정확할 때만** | 된다, **순서라는 것이 없다** |
| 무엇이 깨지면 고장 나나 | `quitting = true` 가 `releaseUnclosableWindows()` 보다 **먼저** 와야 하고, 그 사이에 캐릭터 창이 **하나도 새로 생기면 안 된다** | 없음. Electron 이 자기 방식대로 창을 닫고 나간다 |
| 종료 중에 캐릭터가 되살아나면 | **영영 안 꺼진다** (되살아난 창은 이미 훑고 지나간 목록에 없다) | 그 창도 그냥 닫힌다 |
| 검사할 수 있나 | `destroy()` 를 불렀는지만 | **가드가 언제 비켜 주는지**를 검사 |

새 방법을 고른 이유는 **"순서" 라는 것이 아예 없어지기 때문**입니다. 지금 방법은 앞으로
누가 `shutdown()` 에 한 줄을 더하거나 세션이 종료 도중에 `teams` 를 한 번 더 쏘기만 해도
같은 고장이 되살아나는 자리인데, 그것이 **배포본에서만, 그것도 간헐적으로** 드러납니다.
새 방법은 그 가능성 자체를 없앱니다.

**대신 잃는 것 하나** — `closable: false` 는 맥의 Window 메뉴에서 "Close" 항목을
회색으로 만들어 주었는데, 이제는 **눌러도 아무 일이 없는** 항목이 됩니다. 캐릭터 창은
`frame: false` 라 닫기 단추가 없고, 이 항목이 눈에 띄는 경로도 아니라서 받아들입니다.

### 2.3 함께 정리하는 것

- **`releaseUnclosableWindows()` 를 지웁니다.** 부르는 곳도 `shutdown()` 한 곳뿐입니다.
  `quit.ts` 는 [3장](#3-메뉴가-사라진-뒤에-종료한다)의 새 내용으로 통째로 다시 씁니다.
- **`syncPetWindows()` 첫 줄에 `if (app.quitting) return` 을 답니다.** 종료 중에 어떤
  경로로든(`session.on('teams')` 포함) 캐릭터 창이 새로 생기지 않게 하는 마지막
  울타리입니다. 새 방법에서는 창이 하나 더 생겨도 그냥 닫히지만, **끄는 중에 캐릭터를
  새로 그리는 것 자체가 낭비**이므로 막습니다.
- **`closed` 처리기(`main.ts:117-123`)는 그대로 둡니다.** ⌘W 로 창이 닫히는 일은 이제
  없지만, Map 정리와 크기 패널 닫기는 우리가 `destroy()` 하는 길(방을 나갈 때)에서도
  필요합니다. 주석의 "운영체제 단축키(맥의 ⌘W)로도 닫힌다" 는 대목만 사실에 맞게
  고칩니다 — **이제 그 길은 `close` 가드가 막습니다.**

---

## 3. 메뉴가 사라진 뒤에 종료한다

### 3.1 규칙

**네이티브 메뉴가 화면에 있는 동안에는 절대로 `app.quit()` 을 부르지 않습니다.**
[1.3](#13-진짜-원인--네이티브-메뉴가-떠-있는-동안-종료하면-프로세스가-얼어붙는다)에서
확인한 대로, 그 자리에서 얼어붙으면 **되돌릴 방법이 없습니다** — 미리 걸어 둔 타이머도
`process.exit()` 도 듣지 않습니다. 그러므로 이것은 "웬만하면" 이 아니라 규칙입니다.

### 3.2 `main/quit.ts` — 통째로 다시 씀

`releaseUnclosableWindows()` 를 지우고 **종료로 가는 문 하나**를 둡니다. Electron 없이
테스트할 수 있도록 필요한 것을 전부 인자로 받습니다 (CLAUDE.md "지켜야 할 규칙 1").

```ts
/** Menu 에서 우리가 쓰는 것만. 테스트에서는 작은 emitter 를 꽂는다. */
export interface WatchableMenu {
  on(event: 'menu-will-close', listener: () => void): void
  off?(event: 'menu-will-close', listener: () => void): void
}

export interface QuitGateOptions {
  /** 실제 종료 (`electronApp.quit`) */
  quit: () => void
  /** 마지막 수단 (`electronApp.exit`) */
  exit: (code: number) => void
  /** 워치독이 기다리는 시간. 기본 QUIT_WATCHDOG_MS */
  watchdogMs?: number
  /** 테스트에서 갈아 끼운다 */
  setTimer?: (fn: () => void, ms: number) => unknown
  /** 메뉴가 닫힌 것을 확인한 뒤 한 틱 물러나 부르기 위해 */
  defer?: (fn: () => void) => void
}

export interface QuitGate {
  /** 메뉴를 띄우기 직전에 부른다. 그 메뉴가 닫힐 때까지 종료를 미룬다. */
  menuOpened(menu: WatchableMenu): void
  /** 사용자가 '종료' 를 골랐다. 메뉴가 떠 있으면 닫힌 뒤에 나간다. */
  request(): void
  /** `shutdown()` 이 부른다. 시간 안에 안 끝나면 강제로 끝낸다. */
  armWatchdog(): void
}

export const QUIT_WATCHDOG_MS = 2000

export function createQuitGate(options: QuitGateOptions): QuitGate
```

**동작**

- `menuOpened(menu)` — `openMenu = menu` 로 두고 `menu.on('menu-will-close', …)` 를
  겁니다. 그 이벤트가 오면 `openMenu` 를 비우고, **그때까지 종료 요청이 들어와 있었으면
  그제야** `defer(quit)` 합니다. `defer` 는 기본이 `queueMicrotask` 가 아니라
  `setTimeout(fn, 0)` 입니다 — 메뉴 자신의 이벤트 처리 안에서 나가지 않게 한 틱
  물러섭니다.
- `request()` — 이미 요청된 적이 있으면 아무 일도 하지 않습니다(두 번 눌러도 한 번).
  `openMenu` 가 없으면 **곧바로** `quit()`, 있으면 **표시만 남기고 기다립니다.**
- `armWatchdog()` — [4장](#4-안전망--강제-종료-워치독).

**타임아웃을 두지 않습니다.** "메뉴가 안 닫히면 그냥 나가자" 는 안전망처럼 보이지만,
그렇게 나가면 **되돌릴 수 없게 얼어붙습니다.** 반면 기다리는 쪽의 최악은 "메뉴가 아직
떠 있고 앱이 안 꺼졌다" 인데, 그건 사용자가 아무 데나 눌러 메뉴를 닫으면 그 순간
종료됩니다. **못 끄는 것보다 얼어붙는 것이 훨씬 나쁩니다.**

### 3.3 부르는 쪽

`main.ts` 의 껍데기에 게이트를 하나 만들어 두고, `app.quit()` 을 그 게이트로 바꿉니다.

```ts
// main.ts
const quitGate = createQuitGate({
  quit: () => electronApp.quit(),
  exit: (code) => electronApp.exit(code),
})

const app = {
  …
  /** 사용자가 '종료' 를 골랐다. 메뉴가 닫힌 뒤에 실제로 나간다 (`quit.ts`). */
  quit() {
    quitGate.request()
  },
  /** 메뉴를 띄우기 직전에 알린다 */
  menuOpened(menu: Menu) {
    quitGate.menuOpened(menu)
  },
  …
}
```

- **`tray.ts`** — `TrayHost` 에 `menuOpened(menu): void` 를 더하고,
  `tray.on('right-click', …)` 에서 `popUpContextMenu` **직전에** `app.menuOpened(menu)`
  를 부릅니다. 리눅스 갈래(`tray.setContextMenu(menu)`)는 우리가 띄우는 것이 아니므로,
  `refresh()` 가 메뉴를 새로 지을 때 한 번 `app.menuOpened(menu)` 를 불러 둡니다 —
  게이트는 `menu-will-close` 만 보므로 미리 알려 두어도 탈이 없습니다.
- **`ipc.ts`** `pet:menu` — `Menu.buildFromTemplate(...)` 의 결과를 변수에 담고,
  `popup()` 직전에 `app.menuOpened(menu)` 를 부릅니다. `registerIpc` 가 받는 `app` 은
  `AppShell` 이므로 타입은 저절로 맞습니다.
- `{ label: t('app.quit'), click: () => app.quit() }` 는 **양쪽 다 그대로 둡니다** —
  `app.quit()` 의 속뜻만 바뀌었습니다.

> **⌘Q 와 Dock.** 기본 애플리케이션 메뉴가 그대로 살아 있어서 ⌘Q 는 지금도 듭니다
> (`role: 'quit'`). 키보드로 누르면 메뉴가 열리지 않으므로 이 함정을 밟지 않고, 실제로
> 확인했을 때도 잘 꺼집니다. 메뉴 막대에서 손으로 "Quit Buddling" 을 고르는 길은
> 함정 위를 지나지만, 그쪽은 우리가 만든 메뉴가 아니라 손댈 자리가 없습니다 —
> 워치독이 받습니다. **Dock 아이콘은 `dock.hide()` 로 숨겨 두어 Dock 으로 끄는 길은
> 애초에 없습니다.**

---

## 4. 안전망 — 강제 종료 워치독

`shutdown()` 안, `quitting = true` 를 세운 직후에 `quitGate.armWatchdog()` 을 부릅니다.
`QUIT_WATCHDOG_MS`(2000) 뒤에도 프로세스가 살아 있으면 `electronApp.exit(0)` 으로
끝냅니다.

**무엇을 막나 / 못 막나 — 솔직하게.**

| 상황 | 워치독이 받나 |
|---|---|
| 어떤 이유로든 종료가 **취소**되어 프로세스가 남는 경우 | **받습니다.** 실행 루프가 살아 있어 타이머가 돕니다 |
| [1.3](#13-진짜-원인--네이티브-메뉴가-떠-있는-동안-종료하면-프로세스가-얼어붙는다)의 얼어붙음 | **못 받습니다.** 그 뒤로는 타이머가 아예 돌지 않습니다 — 확인했습니다 |

그래서 워치독은 3장을 **대신하는 것이 아니라 보태는 것**입니다. 3장이 얼어붙음을 막고,
워치독이 그 밖의 모든 "안 꺼짐" 을 받습니다.

**안전한가.** `armWatchdog()` 이 도는 시점에는 `store.flush()` 가 이미 끝나 있어
디스크에 미룬 것이 없습니다. 그리고 이 2초는 덤으로 **`session.dispose()` 가 채널을
정리할 시간**이 되어 줍니다 — 지금은 종료가 그것을 기다리지 않고 프로세스를 끝내므로,
서버가 소켓이 끊긴 것을 알아챌 때까지 남의 화면에서 내가 접속 중으로 남아 있습니다.

**`exit` 이지 `quit` 이 아닙니다.** `app.exit()` 은 `DestroyAllWindows()` 로 가서
"닫지 못하는 창" 검사를 지나가지 않습니다 (`quit.ts` 옛 주석이 적어 두었던 그대로이고,
`dev-capture.ts` 가 그 길로 잘 끝나는 것이 증거입니다).

---

## 5. 메뉴 막대의 앱 이름을 `Buddling` 으로

### 5.1 무엇이 문제인가

기본 애플리케이션 메뉴의 첫 항목이 **`buddling`** 으로 나옵니다 — "About buddling",
"Hide buddling", **"Quit buddling"**. 다른 자리는 전부 `Buddling` 입니다.

까닭은 `app.getName()` 이 보는 것이 `apps/desktop/package.json` 의 **최상위 `name`**
(`"buddling"`)이기 때문입니다. `productName: "Buddling"` 은 `build` 블록 **안**에 있어
electron-builder 만 봅니다 — Electron 은 거기를 보지 않습니다.

### 5.2 밟으면 안 되는 함정 — 이름이 저장 폴더를 정한다

**`app.setName()` 은 겉모습만 바꾸는 함수가 아닙니다.** Electron 은
`app.getPath('userData')` 를 **앱 이름으로** 잡습니다. 그냥 이름을 바꾸면 저장 폴더가
통째로 옮겨가고, 그 안의 **세션 = 신원**을 잃습니다. 방과 남남이 되고 되찾는 길은
초대코드로 다시 들어오는 것뿐입니다 — `legacy-store.ts` 가 존재하는 이유가 정확히
그 사고입니다.

- macOS·Windows 는 파일 이름의 대소문자를 구별하지 않아 `buddling` 과 `Buddling` 이
  같은 폴더입니다. **표는 안 납니다.**
- **리눅스는 구별합니다.** 그리고 이 저장소는 AppImage 를 실제로 만듭니다
  (`package.json` 의 `build.linux`). 그대로 두면 **리눅스 사용자만 조용히 방을
  잃습니다.**

### 5.3 그래서 이렇게 합니다 — 폴더를 먼저 못 박고 이름을 바꾼다

`main.ts` 맨 위의 `BUDDLING_PROFILE` 처리 자리를 이렇게 바꿉니다.

```ts
// Electron 은 userData 폴더를 **앱 이름으로** 잡는다. 그래서 이름만 고쳐도 저장 폴더가
// 통째로 옮겨가고, 그 안의 세션(=신원)을 잃는다. 맥·윈도우는 대소문자를 구별하지 않아
// 표가 안 나지만 **리눅스는 구별한다** (AppImage 를 실제로 낸다).
//
// 그래서 이름을 바꾸기 **전에** 지금 폴더를 그대로 못 박아 둔다. 프로필을 나누면 같은
// 컴퓨터에서 여러 인스턴스를 띄울 수 있다.
const userDataDir = electronApp.getPath('userData')
electronApp.setPath(
  'userData',
  process.env.BUDDLING_PROFILE ? `${userDataDir}-${process.env.BUDDLING_PROFILE}` : userDataDir,
)

// 메뉴 막대와 About 창에 보이는 이름. package.json 의 `name` 이 소문자라 그대로 두면
// "Quit buddling" 이 된다. `build.productName` 은 electron-builder 만 보는 값이라
// Electron 의 `app.getName()` 에는 닿지 않는다. **위에서 폴더를 못 박은 뒤라야 한다.**
electronApp.setName('Buddling')
```

**`package.json` 은 건드리지 않습니다.** 최상위에 `productName` 을 더하는 길도 있지만,
그러면 저장 폴더가 함께 움직여 5.2 의 사고가 그대로 일어납니다. 그리고 `name` 은 npm
workspaces 가 워크스페이스를 부르는 이름(`-w buddling`)이라 바꿀 수 없습니다.

**맥 배포본은 원래 맞게 나옵니다** — 그쪽은 Electron 이 `CFBundleName`(= `productName`)
을 읽습니다. 이 한 줄은 **개발 중과 윈도우·리눅스 배포본**을 나머지와 맞추는 일이고,
어느 쪽이든 이제 한 자리에서 정해집니다.

---

## 6. 하지 않는 것

- **두 번째 인스턴스가 조용히 물러나는 것은 그대로 둡니다.** 지금은 좀비가 잠금을 쥐고
  있을 때 새 실행이 아무 말 없이 사라지는데, 이 설계가 좀비를 없애므로 그 상황 자체가
  생기지 않습니다. 안 생기는 일에 안내 문구를 만들지 않습니다.
- **`session.dispose()` 를 기다리지 않습니다.** `before-quit` 은 동기로 불리므로
  `await` 을 걸어도 Electron 이 보지 않습니다(#27 에서 이미 확인된 것). 대신 워치독의
  2초가 사실상의 여유가 됩니다.
- **점(접속 중/자리 비움)의 계산은 손대지 않습니다.** 이미 `session.ts` 의 `onlineIds` →
  `Membership.onlineIds` → `TeamDetail.tsx`·`TeamList.tsx` 로 다 이어져 있고, 기획서가
  정한 모양 그대로입니다. **이번 고장은 점을 잘못 계산해서가 아니라 앱이 안 꺼져서**
  생긴 것입니다.
- **트레이의 '숨기기' 와 '종료' 는 둘 다 그대로 둡니다.** 헷갈리지 않는다고 결론이
  났습니다 (2026-08-29). 기획서 "접속 중과 자리 비움" 의 네 줄짜리 비교표가 이 둘을
  서로 다른 일로 정의하고 있고, 그대로 갑니다. `docs/BACKLOG.md` 에서도 열린 질문이
  아닌 것으로 정리해 두었습니다.
- **새 문구가 없으므로 네 언어 사전은 건드리지 않습니다.** 앱 이름은 번역하지 않습니다.
- **새 의존성 없음. 스키마 변경 없음.** Supabase 콘솔에서 돌릴 것이 없습니다.

---

## 7. 어떻게 확인했나 (재현 방법)

이 설계의 근거가 된 실험입니다. 구현 뒤에 **같은 방법으로 다시 확인**하세요.

**(가) 최소 Electron 으로 종료 동작만 떼어 보기** — 임시 폴더에 `main.js` 하나를 두고
저장소의 electron 바이너리로 띄웁니다. `closable: false` 창 하나만 두고 `app.quit()`
을 부르면 안 꺼지는 것( [1.1](#11-closable-false-는-지금도-종료를-통째로-취소시킨다--확인됨) ),
`close` 가드로 바꾸면 ⌘W 는 막히고 종료는 되는 것( [2.2](#22-왜-이-방법인가-트레이드오프) ),
메뉴를 띄운 채 종료하면 얼어붙는 것( [1.3](#13-진짜-원인--네이티브-메뉴가-떠-있는-동안-종료하면-프로세스가-얼어붙는다) )을
각각 여기서 봤습니다.

**(나) 진짜 앱에 붙어서 종료시키기** — 네이티브 메뉴를 코드로 클릭할 수 없어서,
메인 프로세스에 디버거를 붙여 `app.quit()` 을 직접 불렀습니다.

```bash
BUDDLING_PROFILE=quitprobe BUDDLING_FAKE_NET=1 \
  SUPABASE_URL=https://127.0.0.1:9 SUPABASE_ANON_KEY=dummy.dummy.dummy \
  ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --inspect=9229 apps/desktop
# 다른 셸에서 http://127.0.0.1:9229/json/list 의 webSocketDebuggerUrl 로 붙어
# Runtime.evaluate 로 require('electron').app.quit() 을 부른다
```

방을 만드는 것도 같은 통로로 합니다 —
`webContents.executeJavaScript("window.teamApi.createTeam({…})")`.
**끝나면 `~/Library/Application Support/Buddling-quitprobe` 를 지우세요.**

**(다) 손으로 눌러 봐야만 아는 것.** 위 둘로도 **메뉴를 사람이 클릭하는 순간**은 흉내
낼 수 없습니다 (보조 기능 권한이 없어 `osascript` 로 메뉴 막대를 누를 수 없습니다).
**구현을 마친 뒤 반드시 손으로 확인하세요.**

---

## 8. 무엇을 검사하나

### 8.1 새 단위 테스트 — `test/quit.test.ts` (통째로 다시 씀)

옛 테스트(`releaseUnclosableWindows`)는 검사할 대상이 사라지므로 지웁니다. 대신
`createQuitGate` 를 검사합니다. Electron 없이 돌아야 하므로 `quit`·`exit`·`setTimer`·
`defer` 를 전부 꽂고, 메뉴는 `menu-will-close` 만 쏘는 작은 흉내로 만듭니다.

| 검사 | 기대 |
|---|---|
| 메뉴가 떠 있지 않을 때 `request()` | `quit()` 이 곧바로 한 번 |
| 메뉴가 떠 있을 때 `request()` | **`quit()` 이 아직 안 불린다** |
| 그 뒤 `menu-will-close` | 그때 `quit()` 이 한 번 |
| `menu-will-close` 가 안 오면 | **영영 `quit()` 을 부르지 않는다** (타임아웃 없음이 설계다) |
| `request()` 두 번 | `quit()` 은 한 번 |
| 종료를 고르지 않고 메뉴만 닫히면 | `quit()` 을 부르지 않는다 |
| 메뉴가 열렸다 닫힌 뒤 `request()` | 곧바로 `quit()` (닫힌 메뉴에 발목 잡히지 않는다) |
| `armWatchdog()` 뒤 `QUIT_WATCHDOG_MS` 경과 | `exit(0)` 이 한 번 |
| `armWatchdog()` 을 두 번 | 타이머는 하나 |

### 8.2 그 밖

- `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` 넷 다 초록이어야
  합니다. `AppShell` 에 `menuOpened` 가 붙으므로 `tray.ts` 의 `TrayHost` 와
  `dev-capture.ts` 쪽 타입이 함께 맞아야 합니다.
- **`dev-capture.ts` 는 손대지 않습니다.** 그쪽은 `app.shutdown()` 을 직접 부르고
  `app.exit()` 으로 나가므로 이번 변경과 겹치지 않습니다. 다만 `shutdown()` 이
  워치독을 걸게 되었으니, 캡처가 2초 안에 끝나지 않아도 **워치독이 먼저 끝내 줄 뿐**
  결과는 같습니다.

### 8.3 손으로 하는 확인 — 이것 없이는 끝난 것이 아닙니다

1. 방이 하나 이상 있는 상태에서 **트레이 우클릭 → 종료.** 캐릭터가 사라지고
   `ps` 에 프로세스가 남지 않아야 합니다.
2. **캐릭터 우클릭 → 종료.** 같습니다.
3. **⌘Q**(방 목록 창에 포커스를 준 뒤). 같습니다.
4. 메뉴 막대의 앱 이름이 **`Buddling`** 으로 보이는지 (About/Hide/Quit 세 항목).
5. 캐릭터 창에 포커스를 주고 **⌘W** — 캐릭터가 사라지지 않아야 합니다.
6. **끄고 나서 다시 켜기.** 방과 사람이 그대로이고 "연결하는 중…" 에 갇히지 않아야
   합니다.
7. **두 프로필을 동시에 켜고**(`npm run start:both`) 한쪽을 끕니다. 다른 쪽 방 상세
   창의 점이 **회색으로 바뀌고**, 다시 켜면 **초록으로 돌아와야** 합니다. 기획서가
   초 단위를 정하지 않았으므로 숫자를 재는 것이 아니라 **낡은 값에 갇히지 않는지**를
   봅니다.

---

## 9. 함께 고칠 문서

- **`CLAUDE.md` 의 "밟기 쉬운 함정"** — *"캐릭터 창은 `closable: false` 입니다"* 줄이
  이번 변경으로 사실이 아니게 됩니다. **"평소에는 `close` 를 막지만 종료 중에는 비켜
  준다"** 로 고치고, **"종료로 가는 길에서는 네이티브 메뉴가 닫힌 뒤에 나간다"** 를
  한 줄 더합니다. (앞으로 이 자리를 건드릴 사람이 가장 먼저 읽는 문서입니다.)
- **`docs/DEVELOPMENT.md`** — "기능별 설계 문서" 표에 이 문서를 한 줄 더합니다.
  구현을 마치면 상태를 *구현 완료 (리뷰 대기)* 로 바꿉니다.
