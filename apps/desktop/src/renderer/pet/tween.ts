/**
 * 애니메이션 보조 함수들. 외부 의존성 없이 순수 함수로만 이루어져 있어
 * 브라우저 없이도 테스트할 수 있다.
 */

export type EasingFn = (t: number) => number

export const easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  /** 목표를 살짝 넘었다가 돌아온다. 착지 후 복원에 쓴다. */
  easeOutBack: (t: number) => {
    const c = 1.7
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
  },
} satisfies Record<string, EasingFn>

export type EasingName = keyof typeof easing

/**
 * 키프레임 하나. `t` 는 시각(초), `ease` 는 이전 키에서 여기로 넘어올 때 쓰는 곡선,
 * 나머지는 보간할 값들이다.
 */
export interface Keyframe {
  t: number
  ease?: EasingName
  [field: string]: number | EasingName | undefined
}

/** 샘플링 결과 — 요청한 필드마다 그 시각의 값 */
export type Sampled = Record<string, number>

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * 키프레임 트랙을 시각 t에서 샘플링한다.
 *
 * @param keys 시간 순으로 정렬된 키프레임
 * @param fields 보간할 필드 이름
 * @param t 시각(초)
 */
export function sampleTrack(keys: Keyframe[], fields: string[], t: number): Sampled {
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (t <= first.t) return pick(first, fields)
  if (t >= last.t) return pick(last, fields)

  let index = 1
  while (index < keys.length - 1 && keys[index].t <= t) index += 1

  const from = keys[index - 1]
  const to = keys[index]
  const span = to.t - from.t
  const raw = span <= 0 ? 1 : (t - from.t) / span
  const curve = (to.ease && easing[to.ease]) ?? easing.easeInOutQuad
  const eased = curve(raw)

  const result: Sampled = {}
  for (const field of fields) {
    result[field] = lerp(from[field] as number, to[field] as number, eased)
  }
  return result
}

function pick(key: Keyframe, fields: string[]): Sampled {
  const result: Sampled = {}
  for (const field of fields) result[field] = key[field] as number
  return result
}

export interface Spring {
  readonly value: number
  reset: (next?: number) => void
  update: (target: number, delta: number) => number
}

/**
 * 값이 목표를 향해 탄성 있게 따라가는 1차 스프링.
 * 귀·꼬리가 몸통보다 한 박자 늦게 따라오게 만드는 데 쓴다.
 */
export function createSpring({
  stiffness = 120,
  damping = 14,
  value = 0,
}: { stiffness?: number; damping?: number; value?: number } = {}): Spring {
  let current = value
  let velocity = 0

  return {
    get value() {
      return current
    },
    reset(next = 0) {
      current = next
      velocity = 0
    },
    update(target: number, delta: number) {
      // 큰 프레임 드랍에서 발산하지 않도록 잘라준다
      const step = Math.min(delta, 1 / 30)
      const acceleration = (target - current) * stiffness - velocity * damping
      velocity += acceleration * step
      current += velocity * step
      return current
    },
  }
}
