/**
 * 애니메이션 보조 함수들. 외부 의존성 없이 순수 함수로만 이루어져 있어
 * 브라우저 없이도 테스트할 수 있다.
 */

export const easing = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  /** 목표를 살짝 넘었다가 돌아온다. 착지 후 복원에 쓴다. */
  easeOutBack: (t) => {
    const c = 1.7
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
  },
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const lerp = (a, b, t) => a + (b - a) * t

/**
 * 키프레임 트랙을 시각 t에서 샘플링한다.
 *
 * 각 키는 `{ t, ...값들 }` 이고, 선택적으로 `ease`(easing 이름)를 가진다.
 * ease는 "이전 키에서 이 키로 넘어올 때" 쓰는 곡선이다.
 *
 * @param {Array<object>} keys 시간 순으로 정렬된 키프레임
 * @param {string[]} fields 보간할 필드 이름
 * @param {number} t 시각(초)
 */
export function sampleTrack(keys, fields, t) {
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
  const curve = easing[to.ease] ?? easing.easeInOutQuad
  const eased = curve(raw)

  const result = {}
  for (const field of fields) result[field] = lerp(from[field], to[field], eased)
  return result
}

function pick(key, fields) {
  const result = {}
  for (const field of fields) result[field] = key[field]
  return result
}

/**
 * 값이 목표를 향해 탄성 있게 따라가는 1차 스프링.
 * 귀·꼬리가 몸통보다 한 박자 늦게 따라오게 만드는 데 쓴다.
 */
export function createSpring({ stiffness = 120, damping = 14, value = 0 } = {}) {
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
    update(target, delta) {
      // 큰 프레임 드랍에서 발산하지 않도록 잘라준다
      const step = Math.min(delta, 1 / 30)
      const acceleration = (target - current) * stiffness - velocity * damping
      velocity += acceleration * step
      current += velocity * step
      return current
    },
  }
}
