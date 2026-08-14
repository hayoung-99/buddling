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

/** 캐릭터 발밑 좌표 */
export interface NameplateAnchor {
  centerX: number
  bottom: number
}

export interface Nameplate {
  show: (nickname: string, anchor: NameplateAnchor) => void
  setScale: (next: number) => void
}

export function createNameplate(container: HTMLElement): Nameplate {
  let scale = 1
  /** 이름표 → 지울 시각을 재는 타이머. 이름표가 사라지면 항목도 함께 사라진다. */
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()

  /**
   * @param nickname 찌른 사람
   * @param anchor 캐릭터 발밑 좌표
   */
  function show(nickname: string, anchor: NameplateAnchor) {
    const name = String(nickname ?? '').trim()
    if (!name) return

    container.style.left = `${anchor.centerX}px`
    // 발밑에 두되 창 아래로 잘리지 않도록 안쪽으로 당긴다.
    // 캐릭터를 아주 작게 줄이면 창도 작아지므로 여백도 같이 줄인다.
    const room = window.innerHeight - 26 * scale
    container.style.top = `${Math.min(anchor.bottom - 6 * scale, room)}px`

    // CSS 애니메이션이 끝나면 알아서 사라지지만, 창이 가려져 있으면 그 신호가 안 온다.
    // 그래서 시간이 다 되면 지우는 보조 타이머를 하나씩 달아 둔다.
    const arm = (chip: HTMLElement) => {
      clearTimeout(timers.get(chip))
      timers.set(chip, setTimeout(() => chip.remove(), LIFE_MS + 400))
    }

    // 같은 사람이 연달아 찌르면 새로 띄우지 않고 시간만 늘려준다
    const existing = [...container.children].find(
      (chip): chip is HTMLElement => chip.textContent === name,
    )
    if (existing) {
      existing.classList.remove('chip')
      void existing.offsetWidth
      existing.classList.add('chip')
      arm(existing) // 애니메이션만 되감고 타이머를 그대로 두면 늘린 만큼 살지 못한다
      return
    }

    while (container.childElementCount >= MAX_VISIBLE) container.firstElementChild?.remove()

    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.textContent = name
    chip.addEventListener('animationend', () => chip.remove())
    arm(chip)
    container.append(chip)
  }

  /** 캐릭터 크기에 맞춰 이름표도 같이 조절한다 */
  function setScale(next: number) {
    scale = next
    container.style.setProperty('--nscale', String(next))
  }

  return { show, setScale }
}
