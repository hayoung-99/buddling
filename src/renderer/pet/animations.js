/**
 * 캐릭터 애니메이션.
 *
 * 모든 동작은 순수한 키프레임 데이터이고, `createAnimator()`가 그 결과를
 * Three.js 오브젝트에 바른다. 그래서 브라우저 없이 테스트할 수 있다.
 *
 * 동작은 여러 겹으로 나뉘어 서로 겹칠 수 있다.
 *   idle   — 늘 돌아간다 (호흡·눈깜빡임·귀 쫑긋·꼬리)
 *   dance  — 팀원이 콕 찔렀을 때. 좌우로 흔들며 춤춘다.
 *   twitch — 내가 눌렀을 때. 제자리에서 움찔한다.
 *   hop    — 폴짝 뛰기. 지금 앱에서는 쓰지 않고 미리보기에서 비교용으로 남겨 두었다.
 *
 * 살아있어 보이게 만드는 장치:
 *   1) squash & stretch — 웅크렸다 늘어나고 딛을 때 찌부러진다
 *   2) 지연 — 귀·꼬리·머리가 몸통보다 한 박자 늦게 따라온다 (스프링)
 *   3) 반대 방향 — 몸이 기울면 머리는 덜 기울어 중심을 잡는다
 */

import { sampleTrack, createSpring, clamp } from './tween.js'
import { TAIL } from '../../shared/characters.js'

/** 폴짝 한 번(0.64초)의 키프레임. y는 최고점 기준 0~1 비율. */
const HOP_UNIT = [
  { t: 0.0, y: 0.0, sx: 1.0, sy: 1.0, ease: 'linear' },
  { t: 0.09, y: 0.0, sx: 1.13, sy: 0.81, ease: 'easeOutQuad' }, // 웅크림(예비동작)
  { t: 0.19, y: 0.26, sx: 0.92, sy: 1.16, ease: 'easeOutCubic' }, // 차고 오르며 늘어남
  { t: 0.34, y: 1.0, sx: 1.0, sy: 1.03, ease: 'easeOutQuad' }, // 정점
  { t: 0.46, y: 0.2, sx: 0.95, sy: 1.11, ease: 'easeInQuad' }, // 낙하 가속
  { t: 0.52, y: 0.0, sx: 1.18, sy: 0.76, ease: 'easeInQuad' }, // 착지 찌부러짐
  { t: 0.64, y: 0.0, sx: 1.0, sy: 1.0, ease: 'easeOutBack' }, // 탄성 복원
]

/**
 * 춤 한 바퀴(0.84초) — 왼쪽으로 한 번, 오른쪽으로 한 번.
 *
 *   x      좌우 이동 (-1 ~ 1)
 *   y      통통 튀는 높이 (0 ~ 1)
 *   tilt   몸통 기울기 (라디안)
 *   arm    두 팔이 같은 쪽으로 휩쓸리는 각도
 *   spread 두 팔이 양옆으로 벌어지는 각도
 *   step   드는 발 (+1 왼발 / -1 오른발)
 *
 * 시작과 끝이 모두 중립이라 몇 바퀴든 이어 붙여도 이음매가 튀지 않는다.
 */
const DANCE_UNIT = [
  { t: 0.0, x: 0.0, y: 0.0, tilt: 0.0, arm: 0.0, spread: 0.0, step: 0.0, sx: 1.0, sy: 1.0, ease: 'linear' },
  // ── 왼쪽으로 ──
  { t: 0.06, x: -0.15, y: 0.0, tilt: 0.07, arm: 0.28, spread: 0.18, step: 0.0, sx: 1.07, sy: 0.93, ease: 'easeOutQuad' },
  { t: 0.16, x: -0.72, y: 1.0, tilt: 0.2, arm: 0.92, spread: 0.32, step: 1.0, sx: 0.95, sy: 1.07, ease: 'easeOutCubic' },
  { t: 0.26, x: -1.0, y: 0.0, tilt: 0.24, arm: 0.7, spread: 0.26, step: 0.2, sx: 1.09, sy: 0.9, ease: 'easeInQuad' },
  { t: 0.36, x: -0.52, y: 0.12, tilt: 0.09, arm: 0.25, spread: 0.22, step: 0.0, sx: 1.0, sy: 1.01, ease: 'easeOutQuad' },
  { t: 0.42, x: 0.0, y: 0.0, tilt: 0.0, arm: 0.0, spread: 0.2, step: 0.0, sx: 1.03, sy: 0.98, ease: 'easeInOutQuad' },
  // ── 오른쪽으로 (좌우 대칭) ──
  { t: 0.48, x: 0.15, y: 0.0, tilt: -0.07, arm: -0.28, spread: 0.18, step: 0.0, sx: 1.07, sy: 0.93, ease: 'easeOutQuad' },
  { t: 0.58, x: 0.72, y: 1.0, tilt: -0.2, arm: -0.92, spread: 0.32, step: -1.0, sx: 0.95, sy: 1.07, ease: 'easeOutCubic' },
  { t: 0.68, x: 1.0, y: 0.0, tilt: -0.24, arm: -0.7, spread: 0.26, step: -0.2, sx: 1.09, sy: 0.9, ease: 'easeInQuad' },
  { t: 0.78, x: 0.52, y: 0.12, tilt: -0.09, arm: -0.25, spread: 0.22, step: 0.0, sx: 1.0, sy: 1.01, ease: 'easeOutQuad' },
  { t: 0.84, x: 0.0, y: 0.0, tilt: 0.0, arm: 0.0, spread: 0.0, step: 0.0, sx: 1.0, sy: 1.0, ease: 'easeInOutQuad' },
]

/**
 * 움찔 한 번(0.46초). 제자리에서 몸을 좌우로 떨며 눌린 느낌을 낸다.
 * 뛰지 않으므로 y는 없고, 몸통을 기울이는 tilt 가 흔들림을 만든다.
 */
const TWITCH_UNIT = [
  { t: 0.0, sx: 1.0, sy: 1.0, tilt: 0.0, ease: 'linear' },
  { t: 0.06, sx: 1.09, sy: 0.91, tilt: 0.07, ease: 'easeOutQuad' }, // 화들짝
  { t: 0.14, sx: 0.95, sy: 1.06, tilt: -0.08, ease: 'easeInOutQuad' },
  { t: 0.22, sx: 1.05, sy: 0.96, tilt: 0.05, ease: 'easeInOutQuad' },
  { t: 0.3, sx: 0.98, sy: 1.02, tilt: -0.03, ease: 'easeInOutQuad' },
  { t: 0.38, sx: 1.01, sy: 0.99, tilt: 0.014, ease: 'easeInOutQuad' },
  { t: 0.46, sx: 1.0, sy: 1.0, tilt: 0.0, ease: 'easeOutQuad' },
]

const HOP_FIELDS = ['y', 'sx', 'sy']
const DANCE_FIELDS = ['x', 'y', 'tilt', 'arm', 'spread', 'step', 'sx', 'sy']
const TWITCH_FIELDS = ['sx', 'sy', 'tilt']

const TWITCH_DURATION = TWITCH_UNIT[TWITCH_UNIT.length - 1].t
const DANCE_CYCLE = DANCE_UNIT[DANCE_UNIT.length - 1].t

const HEIGHT_FALLOFF = 0.66 // 폴짝마다 높이 감쇠
const SPEED_STEP = 0.1 // 폴짝마다 조금씩 빨라짐
const BLINK_DURATION = 0.14

/** 콕 찔렸을 때 추는 바퀴 수. 2바퀴 ≈ 1.7초로 예전 점프와 비슷한 길이다. */
const DANCE_CYCLES = 2

/** 아래는 모두 "캐릭터 키의 몇 배" 단위라, 종·크기가 달라도 같은 비율로 움직인다. */
const HOP_RATIO = 0.26 // 첫 폴짝 높이
const DANCE_SWAY = 0.22 // 좌우로 벌어지는 폭
const DANCE_BOB = 0.12 // 춤추며 통통 튀는 높이
const STEP_LIFT = 0.035 // 발을 드는 높이

/** 폴짝 n번을 하나의 키프레임 트랙으로 이어붙인다. */
export function buildHopTimeline(hops = 3) {
  const unitEnd = HOP_UNIT[HOP_UNIT.length - 1].t
  const keys = []
  let offset = 0

  for (let index = 0; index < hops; index += 1) {
    const height = HEIGHT_FALLOFF ** index
    const speed = 1 + index * SPEED_STEP

    HOP_UNIT.forEach((key, keyIndex) => {
      // 두 번째 폴짝부터는 첫 키가 직전 폴짝의 마지막 키와 같으므로 건너뛴다
      if (index > 0 && keyIndex === 0) return
      keys.push({ ...key, t: offset + key.t / speed, y: key.y * height })
    })

    offset += unitEnd / speed
  }

  return { keys, duration: offset }
}

/**
 * 춤 n바퀴를 이어붙인다.
 * 점프와 달리 힘이 빠지지 않는다 — 끝까지 같은 세기로 추다가 중립에서 멈춘다.
 */
export function buildDanceTimeline(cycles = DANCE_CYCLES) {
  const keys = []

  for (let index = 0; index < cycles; index += 1) {
    DANCE_UNIT.forEach((key, keyIndex) => {
      if (index > 0 && keyIndex === 0) return
      keys.push({ ...key, t: index * DANCE_CYCLE + key.t })
    })
  }

  return { keys, duration: cycles * DANCE_CYCLE }
}

/** 폴짝 타임라인을 시각 t에서 샘플링한다. → { y, sx, sy } */
export function sampleHop(timeline, t) {
  return sampleTrack(timeline.keys, HOP_FIELDS, t)
}

/** 춤 타임라인을 시각 t에서 샘플링한다. → { x, y, tilt, arm, spread, step, sx, sy } */
export function sampleDance(timeline, t) {
  return sampleTrack(timeline.keys, DANCE_FIELDS, t)
}

/** 움찔 동작을 시각 t에서 샘플링한다. → { sx, sy, tilt } */
export function sampleTwitch(t) {
  return sampleTrack(TWITCH_UNIT, TWITCH_FIELDS, t)
}

export { TWITCH_DURATION, DANCE_CYCLE }

const randomBetween = (min, max) => min + Math.random() * (max - min)

/** 아무 동작도 없을 때의 기본값 */
const REST_HOP = { y: 0, sx: 1, sy: 1 }
const REST_DANCE = { x: 0, y: 0, tilt: 0, arm: 0, spread: 0, step: 0, sx: 1, sy: 1 }
const REST_TWITCH = { sx: 1, sy: 1, tilt: 0 }

/**
 * 타이머를 delta 만큼 진행시키고 이번 프레임의 값을 돌려준다.
 * 끝났으면 타이머를 끄고(null) 기본 자세를 돌려준다.
 * @returns {[number|null, object]} [다음 타이머, 이번 프레임 값]
 */
function advance(time, delta, duration, sample, rest) {
  if (time === null) return [null, rest]
  const next = time + delta
  if (next >= duration) return [null, rest]
  return [next, sample(next)]
}

/**
 * 캐릭터에 애니메이션을 입힌다.
 * @param {{ root: object, parts: Record<string, object>, spec: object, height: number }} critter
 */
export function createAnimator(critter, { hops = 3, cycles = DANCE_CYCLES } = {}) {
  const { root, parts, spec, height } = critter
  const hopTimeline = buildHopTimeline(hops)
  const danceTimeline = buildDanceTimeline(cycles)
  const wags = spec.build.tail.type === TAIL.WAG

  const hopHeight = height * HOP_RATIO
  const swayWidth = height * DANCE_SWAY
  const bobHeight = height * DANCE_BOB
  const stepLift = height * STEP_LIFT

  // 다리는 원래 자리에서 위로만 살짝 들 것이므로 기준 높이를 기억해 둔다
  const legBaseY = parts.legL ? parts.legL.position.y : 0

  const earLag = createSpring({ stiffness: 170, damping: 15 })
  const headLag = createSpring({ stiffness: 240, damping: 20 })
  const earSway = createSpring({ stiffness: 130, damping: 13 })

  let elapsed = 0
  let hopTime = null
  let danceTime = null
  let twitchTime = null
  let previousY = 0
  let previousX = 0

  let untilBlink = randomBetween(1.5, 4)
  let blinkTime = null
  // 아래 셋은 가만히 있을 때 이따금 한쪽 귀만 쫑긋하는 연출용이다 (몸 움찔과 별개)
  let untilEarTwitch = randomBetween(3, 8)
  let earTwitchTime = null
  let earTwitchSide = 1

  function hop() {
    hopTime = 0
    previousY = 0
  }

  /** 좌우로 흔들며 춤춘다. 팀원이 콕 찔렀을 때 나오는 반응. */
  function dance() {
    danceTime = 0
    previousY = 0
    previousX = 0
  }

  /** 제자리에서 움찔한다. 다른 동작과 겹쳐도 서로 방해하지 않는다. */
  function twitch() {
    twitchTime = 0
  }

  function update(delta) {
    elapsed += delta

    let frameHop
    let frameDance
    let frameTwitch
    ;[hopTime, frameHop] = advance(
      hopTime,
      delta,
      hopTimeline.duration,
      (t) => sampleHop(hopTimeline, t),
      REST_HOP,
    )
    ;[danceTime, frameDance] = advance(
      danceTime,
      delta,
      danceTimeline.duration,
      (t) => sampleDance(danceTimeline, t),
      REST_DANCE,
    )
    ;[twitchTime, frameTwitch] = advance(
      twitchTime,
      delta,
      TWITCH_DURATION,
      sampleTwitch,
      REST_TWITCH,
    )

    const settled = hopTime === null && danceTime === null && twitchTime === null

    // ── 호흡 (다른 동작 중에는 거의 죽인다) ──
    const breathAmount = settled ? 1 : 0.2
    const breath = Math.sin(elapsed * 2.1) * 0.022 * breathAmount

    // ── 위치와 부피 (여러 동작이 곱해지고 더해진다) ──
    const x = frameDance.x * swayWidth
    const y = frameHop.y * hopHeight + frameDance.y * bobHeight
    const wide = frameHop.sx * frameDance.sx * frameTwitch.sx * (1 - breath * 0.5)

    root.position.set(x, y, 0)
    root.scale.set(wide, frameHop.sy * frameDance.sy * frameTwitch.sy * (1 + breath), wide)

    // ── 몸통 ──
    const tilt = frameDance.tilt + frameTwitch.tilt
    parts.body.rotation.z = Math.sin(elapsed * 1.05) * 0.018 * breathAmount + tilt

    // ── 속도로부터 지연(lag) 계산 ──
    const dt = Math.max(delta, 1 / 240)
    const lagTarget = clamp(((y - previousY) / dt) * 0.055, -0.75, 0.75)
    const swayTarget = clamp(((x - previousX) / dt) * 0.13, -0.9, 0.9)
    previousY = y
    previousX = x
    earLag.update(lagTarget, delta)
    headLag.update(lagTarget, delta)
    earSway.update(swayTarget, delta)

    // ── 머리 (몸이 기울면 머리는 덜 기운다 — 중심을 잡으려는 느낌) ──
    parts.head.rotation.x =
      Math.sin(elapsed * 2.1 + 0.5) * 0.026 * breathAmount - headLag.value * 0.16
    parts.head.rotation.z = -tilt * 0.45

    // ── 팔 (춤출 때만 움직인다) ──
    if (parts.armL) parts.armL.rotation.z = frameDance.spread + frameDance.arm
    if (parts.armR) parts.armR.rotation.z = -frameDance.spread + frameDance.arm

    // ── 다리 (춤출 때 번갈아 발을 든다) ──
    if (parts.legL) parts.legL.position.y = legBaseY + Math.max(0, frameDance.step) * stepLift
    if (parts.legR) parts.legR.position.y = legBaseY + Math.max(0, -frameDance.step) * stepLift

    // ── 귀 (가끔 한쪽만 쫑긋) ──
    if (earTwitchTime !== null) {
      earTwitchTime += delta
      if (earTwitchTime > 0.28) {
        earTwitchTime = null
        untilEarTwitch = randomBetween(3, 8)
      }
    } else {
      untilEarTwitch -= delta
      if (untilEarTwitch <= 0 && settled) {
        earTwitchTime = 0
        earTwitchSide = Math.random() < 0.5 ? -1 : 1
      }
    }

    for (const [key, side] of [
      ['earL', 1],
      ['earR', -1],
    ]) {
      const ear = parts[key]
      if (!ear) continue
      let flick = 0
      if (earTwitchTime !== null && earTwitchSide === side) {
        const fade = 1 - earTwitchTime / 0.28
        flick = Math.sin(earTwitchTime * 52) * 0.16 * fade
      }
      ear.rotation.x = -earLag.value
      // 좌우로 흔들 때 귀가 한 박자 늦게 따라 흔들린다
      ear.rotation.z =
        Math.sin(elapsed * 1.3 + side) * 0.026 * breathAmount + flick - earSway.value * 0.5
    }

    // ── 꼬리 ──
    if (parts.tail) {
      const speed = wags ? 6.2 : 1.7
      const amount = wags ? 0.42 : 0.13
      parts.tail.rotation.y = Math.sin(elapsed * speed) * amount - earSway.value * 0.6
      parts.tail.rotation.x = earLag.value * 0.5
    }

    // ── 눈 깜빡임 ──
    if (blinkTime !== null) {
      blinkTime += delta
      if (blinkTime > BLINK_DURATION) {
        blinkTime = null
        untilBlink = randomBetween(2.2, 6)
      }
    } else {
      untilBlink -= delta
      if (untilBlink <= 0) blinkTime = 0
    }
    const lids =
      blinkTime === null ? 1 : 1 - Math.sin((Math.PI * blinkTime) / BLINK_DURATION) * 0.92
    if (parts.eyeL) parts.eyeL.scale.y = lids
    if (parts.eyeR) parts.eyeR.scale.y = lids
  }

  return {
    hop,
    dance,
    twitch,
    update,
    get isHopping() {
      return hopTime !== null
    },
    get isDancing() {
      return danceTime !== null
    },
    get isTwitching() {
      return twitchTime !== null
    },
    get danceDuration() {
      return danceTimeline.duration
    },
  }
}
