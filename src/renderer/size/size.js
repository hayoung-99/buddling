/**
 * 캐릭터 크기 조절 패널.
 *
 * 슬라이더를 움직이는 동안 바탕화면의 캐릭터가 곧바로 커지고 작아진다.
 * 창 자체는 발밑을 기준으로 커지므로 캐릭터는 제자리에 선 채 자란다.
 */

const range = document.getElementById('range')
const value = document.getElementById('value')
const reset = document.getElementById('reset')
const caption = document.querySelector('.cap')

const DEFAULT_PERCENT = 100

function show(percent) {
  range.value = String(percent)
  value.textContent = `${percent}%`
}

function apply(percent) {
  show(percent)
  window.sizeApi.setScale(percent / 100)
}

range.addEventListener('input', () => apply(Number(range.value)))
reset.addEventListener('click', () => apply(DEFAULT_PERCENT))

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.sizeApi.close()
})

/** 패널은 닫혔다 다시 열려도 같은 창을 재사용하므로, 열릴 때마다 값을 새로 읽는다 */
async function refresh() {
  const { scale, teamName, caption: label, resetHint } = (await window.sizeApi.getScale()) ?? {}
  show(Math.round((scale ?? 1) * 100))
  // 팀이 여러 개면 지금 어느 캐릭터를 조절하는 중인지 알려줘야 한다
  caption.textContent = teamName || label || ''
  if (resetHint) reset.title = resetHint
}

window.addEventListener('focus', refresh)
refresh()
