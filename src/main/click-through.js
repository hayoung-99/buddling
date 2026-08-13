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

const { screen } = require('electron')

const FOLLOW_INTERVAL = 16 // 약 60fps

function attachPointerControl(window, { onDragEnd } = {}) {
  let interactive = false
  let drag = null

  function apply() {
    // 끄는 중에는 커서가 캐릭터를 벗어나도 계속 마우스를 잡고 있어야 한다
    const shouldReceive = interactive || drag !== null
    window.setIgnoreMouseEvents(!shouldReceive, { forward: true })
  }

  function setInteractive(next) {
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
    }
    apply()
  }

  function endDrag() {
    if (!drag) return
    clearInterval(drag.timer)
    drag = null
    apply()
    if (window.isDestroyed()) return
    const [x, y] = window.getPosition()
    onDragEnd?.({ x, y })
  }

  window.on('closed', () => {
    if (drag) clearInterval(drag.timer)
    drag = null
  })

  return { setInteractive, startDrag, endDrag }
}

module.exports = { attachPointerControl }
