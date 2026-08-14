/**
 * 종료 직전에 캐릭터 창을 걷어내는 일.
 *
 * 캐릭터 창은 `closable: false` 다 (`windows.js`). 맥에서 ⌘W 로 캐릭터가 영영 사라지는
 * 것을 막으려고 일부러 건 값인데, 이 값은 ⌘W 만 막는 것이 아니라 **종료까지 함께
 * 막는다.**
 *
 * `app.quit()` 은 창들에게 차례로 `close()` 를 부른다. 그런데 Electron 의
 * `NativeWindowMac::Close()` 와 `NativeWindowViews::Close()` 는 첫 줄이 똑같이
 *
 *     if (!IsClosable()) { WindowList::WindowCloseCancelled(this); return; }
 *
 * 이고, 그 취소가 `Browser::OnWindowCloseCancelled()` 로 이어져 진행 중이던 종료 표시
 * (`is_quitting_`)를 도로 내려 버린다. 즉 **닫을 수 없는 창이 하나라도 있으면 종료가
 * 통째로 취소된다.** 세 플랫폼이 모두 같다.
 *
 * 그래서 팀이 하나라도 있으면(=캐릭터가 떠 있으면) 트레이의 종료도 우클릭의 종료도
 * 듣지 않았다. 팀이 없을 때만 멀쩡히 꺼져서 간헐적인 고장처럼 보였다.
 *
 * `destroy()` 는 `close()` 가 아니라 `CloseImmediately()` 로 가기 때문에 그 검사를
 * 지나간다. 그래서 종료가 창 목록을 훑기 전에 여기서 먼저 걷어낸다.
 *
 * (같은 이유로 `app.exit()` 은 이 벽에 걸리지 않는다 — 그쪽은 `DestroyAllWindows()` 를
 * 쓴다. `dev-capture.js` 가 멀쩡히 끝나는 것이 그 덕이다.)
 */

/**
 * 넘겨받은 캐릭터 창을 없앤다. 이미 사라진 것은 건드리지 않는다.
 *
 * @param {Iterable<{ window: { isDestroyed: () => boolean, destroy: () => void } }>} pets
 * @returns {number} 실제로 없앤 창 수
 */
function releaseUnclosableWindows(pets) {
  let released = 0
  for (const { window } of pets) {
    if (window.isDestroyed()) continue
    window.destroy()
    released += 1
  }
  return released
}

module.exports = { releaseUnclosableWindows }
