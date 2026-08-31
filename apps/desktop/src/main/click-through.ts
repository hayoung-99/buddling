/**
 * 캐릭터 창의 포인터 처리.
 *
 * 캐릭터 창은 화면을 가리는 투명한 사각형이라, 기본값은 "클릭 통과"다.
 * 커서가 실제 캐릭터 위에 올라왔을 때만 렌더러가 알려주고 그때만 마우스를 받는다.
 * 그래서 캐릭터 옆 빈 공간을 누르면 바탕화면 아이콘이 그대로 선택된다.
 *
 * 끌어서 옮기기는 창 밖으로 커서가 튀어나가도 끊기지 않도록,
 * 렌더러의 mousemove 대신 메인 프로세스가 실제 커서 좌표를 따라간다.
 */

import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { dragPosition } from './pet-size'

const FOLLOW_INTERVAL = 16 // 약 60fps

/**
 * 끌기가 저절로 끝나는 시간(ms).
 *
 * 끝을 알리는 길은 렌더러의 mouseup 하나뿐인데, 창이 그 사이 숨겨지거나 포커스를
 * 빼앗기면 그 신호가 영영 안 온다. 그러면 커서를 좇는 타이머가 계속 돈다.
 * 실제로 이만큼 오래 끄는 사람은 없으므로, 여기까지 오면 끝난 것으로 본다.
 */
const DRAG_TIMEOUT = 10000

/** 끄는 중에만 있는 것. 커서와 창 왼쪽 위 모서리의 거리를 들고 따라다닌다. */
interface Drag {
  offsetX: number
  offsetY: number
  /**
   * 창 높이. 세로 위치를 캐릭터가 실제로 보이는 범위(머리~발) 기준으로 화면 안에
   * 되밀 때 쓴다 (`clampPetY`). 드래그 중에는 크기가 바뀌지 않으므로 시작 때 한
   * 번만 잰다 — **작업 영역(`workArea`)은 이렇게 캐싱하지 않는다**, 바로 아래 참고.
   */
  height: number
  timer: ReturnType<typeof setInterval>
  watchdog: ReturnType<typeof setTimeout>
}

export interface PointerControl {
  /** 커서가 캐릭터 위에 있는 동안만 true. false 면 클릭이 바탕화면으로 통과된다. */
  setInteractive(next: boolean): void
  startDrag(): void
  endDrag(): void
}

function attachPointerControl(
  window: BrowserWindow,
  { onDragEnd }: { onDragEnd?: (position: { x: number; y: number }) => void } = {},
): PointerControl {
  let interactive = false
  let drag: Drag | null = null

  function apply() {
    // 끄는 중에는 커서가 캐릭터를 벗어나도 계속 마우스를 잡고 있어야 한다
    const shouldReceive = interactive || drag !== null
    window.setIgnoreMouseEvents(!shouldReceive, { forward: true })
  }

  function setInteractive(next: boolean) {
    if (next === interactive) return
    interactive = next
    apply()
  }

  function follow() {
    if (!drag || window.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    // 커서가 지금 있는 모니터의 작업 영역을 매 프레임 다시 구한다 — 드래그를
    // 시작한 모니터 것을 캐싱해 두면, 세로 위치가 서로 다른 모니터 여러 대를 쓰는
    // 사람이 커서를 다른 모니터로 넘기는 순간 `dragPosition()` 이 엉뚱한(원래
    // 모니터의) 화면 범위로 y 를 붙잡아 캐릭터가 커서에서 세로로 떨어져 보인다.
    // `getDisplayMatching()` 은 사각형이 필요해 창의 bounds 를 넘기게 되는데, 그건
    // "커서가 어디 있는지"가 아니라 "창이 지금 어디 있는지"라 한 프레임 뒤처진다 —
    // 그래서 커서 좌표로 바로 매칭하는 `getDisplayNearestPoint()` 를 쓴다.
    const { workArea } = screen.getDisplayNearestPoint(cursor)
    const { x, y } = dragPosition({
      cursor,
      offsetX: drag.offsetX,
      offsetY: drag.offsetY,
      height: drag.height,
      workArea,
    })
    window.setPosition(x, y)
  }

  function startDrag() {
    if (drag) return
    const cursor = screen.getCursorScreenPoint()
    const bounds = window.getBounds()
    drag = {
      offsetX: cursor.x - bounds.x,
      offsetY: cursor.y - bounds.y,
      height: bounds.height,
      timer: setInterval(follow, FOLLOW_INTERVAL),
      watchdog: setTimeout(endDrag, DRAG_TIMEOUT),
    }
    apply()
  }

  function stopFollowing() {
    if (!drag) return
    clearInterval(drag.timer)
    clearTimeout(drag.watchdog)
    drag = null
  }

  function endDrag() {
    if (!drag) return
    stopFollowing()
    apply()
    if (window.isDestroyed()) return
    const [x, y] = window.getPosition()
    onDragEnd?.({ x, y })
  }

  window.on('closed', stopFollowing)

  return { setInteractive, startDrag, endDrag }
}

export { attachPointerControl }
