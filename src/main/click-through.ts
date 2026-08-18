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
    window.setPosition(Math.round(cursor.x - drag.offsetX), Math.round(cursor.y - drag.offsetY))
  }

  function startDrag() {
    if (drag) return
    const cursor = screen.getCursorScreenPoint()
    const [x, y] = window.getPosition()
    drag = {
      offsetX: cursor.x - x,
      offsetY: cursor.y - y,
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
