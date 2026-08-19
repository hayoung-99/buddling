/**
 * 캐릭터 머리 위 말풍선.
 * 컨셉아트의 "YAY! / WOW! / HOORAY!" 를 3D 캐릭터 위에 얹는 역할이다.
 *
 * 창이 작아서 그냥 머리 위에 두면 잘리기 쉽다. 위·좌우 모두 창 안쪽으로 밀어 넣고,
 * 캐릭터 크기를 줄이면 말풍선도 같이 줄여 캐릭터를 덮지 않게 한다.
 */

const SHOW_MS = 1400
const EDGE = 6 // 창 가장자리와 띄울 최소 거리(px)
const GAP = 12 // 머리 끝과 말풍선 사이 간격(px)

/** 캐릭터 머리 위 좌표 */
export interface BubbleAnchor {
  centerX: number
  top: number
}

export interface Bubble {
  show: (text: string) => void
  placeAbove: (anchor: BubbleAnchor) => void
  setLift: (pixels: number) => void
  setScale: (next: number) => void
}

export function createBubble(element: HTMLElement): Bubble {
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let anchor: BubbleAnchor = { centerX: 0, top: 0 }
  let lift = 0
  let scale = 1

  /** 실제 크기를 재서 창 밖으로 나가지 않도록 자리를 잡는다 */
  function apply() {
    // offsetWidth/Height 는 확대·축소 전 크기라 눈에 보이는 크기로 환산해서 쓴다
    const width = element.offsetWidth * scale
    const height = element.offsetHeight * scale

    // transform: translate(-50%, -100%) 이므로 top 은 말풍선의 아래쪽 꼭짓점이다
    const top = Math.max(height + EDGE, anchor.top - GAP * scale - lift)
    const half = width / 2
    const centerX = Math.min(
      Math.max(anchor.centerX, half + EDGE),
      window.innerWidth - half - EDGE,
    )

    element.style.left = `${centerX}px`
    element.style.top = `${top}px`
  }

  function show(text: string) {
    element.textContent = text
    // 보임 여부는 `data-visible` 로 알린다. 모양은 `main.tsx` 의 유틸리티가 정하고
    // 여기서는 언제 보일지만 정하므로, 두 곳이 클래스 이름으로 얽히지 않는다.
    element.dataset.visible = 'false'
    // 연달아 호출돼도 애니메이션이 다시 시작되도록 리플로우를 강제한다
    void element.offsetWidth
    apply() // 글자가 바뀌면 크기도 달라지므로 다시 잡는다
    element.dataset.visible = 'true'

    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      element.dataset.visible = 'false'
    }, SHOW_MS)
  }

  /** 캐릭터 머리 위 좌표를 알려준다 */
  function placeAbove(next: BubbleAnchor) {
    anchor = next
    apply()
  }

  /** 점프하는 동안 말풍선도 같이 떠오르게 한다 (창 위에 닿으면 거기서 멈춘다) */
  function setLift(pixels: number) {
    const next = Math.round(pixels)
    if (next === lift) return
    lift = next
    apply()
  }

  /** 캐릭터 크기 배율에 맞춰 말풍선도 키우거나 줄인다 */
  function setScale(next: number) {
    if (next === scale) return
    scale = next
    element.style.setProperty('--bubble-scale', String(next))
    apply()
  }

  return { show, placeAbove, setLift, setScale }
}
