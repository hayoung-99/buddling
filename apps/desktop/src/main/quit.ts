/**
 * 종료로 가는 문 하나.
 *
 * **네이티브 팝업 메뉴(트레이 메뉴, 캐릭터 우클릭 메뉴)가 화면에 떠 있는 동안
 * `app.quit()` 을 부르면 프로세스가 영구히 얼어붙는다.** 메뉴 추적이 중첩된 실행
 * 루프라서, `Browser::Shutdown()` 이 끝내려는 가장 바깥 루프로 돌아가지 못한다.
 * 그 뒤로는 `setTimeout` 도 `process.exit()` 도 듣지 않는다 — 실제로 디버거를 붙여
 * 확인했다 (자세한 재현은 설계 문서 1.3, 7장 참고).
 *
 * 이 앱에서 종료로 가는 길은 둘뿐이고(`tray.ts`, `ipc.ts`) 둘 다 메뉴다. 그래서
 * "메뉴가 닫힌 뒤에 나간다" 는 웬만하면이 아니라 규칙이다. 타임아웃을 두지 않는
 * 이유도 같다 — 안 닫히면 그냥 나가는 안전망은 **되돌릴 수 없는 얼어붙음**으로
 * 이어질 수 있다. 반면 기다리는 쪽의 최악은 "메뉴가 아직 떠 있고 앱이 안 꺼졌다"
 * 뿐이라, 사용자가 아무 데나 눌러 메뉴를 닫으면 그 순간 종료된다.
 */

/** `Menu` 에서 우리가 쓰는 것만. 테스트에서는 작은 emitter 를 꽂는다. */
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
  /** 테스트에서 갈아 끼운다. 기본 `setTimeout` */
  setTimer?: (fn: () => void, ms: number) => unknown
  /** 메뉴가 닫힌 것을 확인한 뒤 한 틱 물러나 부르기 위해. 기본 `setTimeout(fn, 0)` */
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

/** [4장] 이 시간 안에 프로세스가 안 끝나면 `exit(0)` 으로 강제로 끝낸다. */
export const QUIT_WATCHDOG_MS = 2000

export function createQuitGate(options: QuitGateOptions): QuitGate {
  const setTimer = options.setTimer ?? setTimeout
  // 메뉴 자신의 `menu-will-close` 처리 안에서 곧바로 나가지 않도록 한 틱 물러선다.
  const defer = options.defer ?? ((fn: () => void) => setTimeout(fn, 0))

  let openMenu: WatchableMenu | null = null
  let requested = false
  let watchdogArmed = false

  return {
    menuOpened(menu) {
      openMenu = menu
      const onMenuWillClose = () => {
        openMenu = null
        menu.off?.('menu-will-close', onMenuWillClose)
        if (requested) defer(() => options.quit())
      }
      menu.on('menu-will-close', onMenuWillClose)
    },

    request() {
      // 두 번 눌러도 한 번만 — 트레이와 캐릭터 메뉴 양쪽에서 연달아 고를 수 있다
      if (requested) return
      requested = true
      if (!openMenu) options.quit()
      // 메뉴가 떠 있으면 `onMenuWillClose` 가 이어받는다
    },

    armWatchdog() {
      // `shutdown()` 이 두 번 불릴 수 있다 (개발용 캡처가 직접 부르는 경로 등) —
      // 그때마다 타이머를 새로 걸면 시간이 계속 미뤄진다.
      if (watchdogArmed) return
      watchdogArmed = true
      setTimer(() => options.exit(0), options.watchdogMs ?? QUIT_WATCHDOG_MS)
    },
  }
}
