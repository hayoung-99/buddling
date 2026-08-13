/**
 * 찌른 사람 이름표.
 *
 * 예전에는 이름이 발밑에서 위로 떠올랐는데, 춤출 때 음표가 같은 자리를 지나가면서
 * 서로 겹쳐 읽기 어려워졌다. 그래서 이름은 **발밑에 가만히 붙어** 있고,
 * 떠오르는 연출은 음표에게 넘겼다.
 *
 * 화면의 역할이 셋으로 갈린다.
 *   머리 위 — 내가 눌렀을 때의 말풍선
 *   좌우    — 춤출 때 떠오르는 음표
 *   발밑    — 누가 찔렀는지 (여기)
 */

/** CSS 애니메이션 길이와 맞춰야 한다 */
const LIFE_MS = 2000
/** 동시에 보여줄 이름 수. 넘치면 오래된 것부터 걷어낸다. */
const MAX_VISIBLE = 3

export function createNameplate(container) {
  let scale = 1

  /**
   * @param {string} nickname 찌른 사람
   * @param {{centerX: number, bottom: number}} anchor 캐릭터 발밑 좌표
   */
  function show(nickname, anchor) {
    const name = String(nickname ?? '').trim()
    if (!name) return

    container.style.left = `${anchor.centerX}px`
    // 발밑에 두되 창 아래로 잘리지 않도록 안쪽으로 당긴다.
    // 캐릭터를 아주 작게 줄이면 창도 작아지므로 여백도 같이 줄인다.
    const room = window.innerHeight - 26 * scale
    container.style.top = `${Math.min(anchor.bottom - 6 * scale, room)}px`

    // 같은 사람이 연달아 찌르면 새로 띄우지 않고 시간만 늘려준다
    const existing = [...container.children].find((chip) => chip.textContent === name)
    if (existing) {
      existing.classList.remove('chip')
      void existing.offsetWidth
      existing.classList.add('chip')
      return
    }

    while (container.childElementCount >= MAX_VISIBLE) container.firstElementChild.remove()

    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.textContent = name
    chip.addEventListener('animationend', () => chip.remove())
    setTimeout(() => chip.remove(), LIFE_MS + 400)
    container.append(chip)
  }

  /** 캐릭터 크기에 맞춰 이름표도 같이 조절한다 */
  function setScale(next) {
    scale = next
    container.style.setProperty('--nscale', String(next))
  }

  return { show, setScale }
}
