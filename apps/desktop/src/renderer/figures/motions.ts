/**
 * 피규어의 동작 세 가지 — 폴짝 · 손 흔들기 · 춤.
 *
 * 앱 캐릭터의 `pet/animations.ts` 와는 **별개**다. 그쪽 키프레임은 팔이 돌기인 리그에
 * 맞춰져 있어 여기에 쓸 수 없고, 반대로 여기 값을 그쪽에 바르면 팔이 몸통에 묻힌다.
 * 보간 도구(`pet/tween.ts` 의 `sampleTrack`·`createSpring`)만 같이 쓴다 — 그건 리그를
 * 모르는 순수 계산이다.
 *
 * 구조는 그쪽과 같게 둔다. 동작은 순수한 키프레임 데이터이고 `createFigureAnimator()` 가
 * 그 값을 부위에 바른다. 세 겹이 동시에 돌 수 있고(곱하고 더한다), 가만히 있을 때는
 * 호흡과 눈 깜빡임만 돈다. 그래서 브라우저 없이 테스트할 수 있다.
 */

import { sampleTrack, createSpring, clamp } from '../pet/tween'
import type { Keyframe, Sampled } from '../pet/tween'
import type { Figure } from './figure'

export type FigureMotion = 'hop' | 'wave' | 'dance'

export interface FigureTimeline {
  keys: Keyframe[]
  duration: number
}

/**
 * 폴짝 한 번(0.66초).
 *
 *   y     높이 (최고점 기준 0~1)
 *   sx·sy 찌부러짐
 *   arms  두 팔이 옆으로 들리는 정도 (0~1). 공중에서 만세하듯 올라간다
 *   legs  다리가 뒤로 접히는 정도 (0~1). 관절이 있어서 가능한 표현이다
 */
export const FIGURE_HOP_UNIT: Keyframe[] = [
  { t: 0.0, y: 0.0, sx: 1.0, sy: 1.0, arms: 0.0, legs: 0.0, ease: 'linear' },
  { t: 0.1, y: 0.0, sx: 1.1, sy: 0.84, arms: -0.15, legs: 0.0, ease: 'easeOutQuad' }, // 웅크림 — 팔이 살짝 뒤로
  { t: 0.2, y: 0.32, sx: 0.94, sy: 1.12, arms: 0.55, legs: 0.35, ease: 'easeOutCubic' }, // 차고 오른다
  { t: 0.34, y: 1.0, sx: 1.0, sy: 1.02, arms: 1.0, legs: 1.0, ease: 'easeOutQuad' }, // 정점 — 팔을 들고 다리를 접는다
  { t: 0.46, y: 0.25, sx: 0.97, sy: 1.08, arms: 0.7, legs: 0.5, ease: 'easeInQuad' }, // 낙하
  { t: 0.53, y: 0.0, sx: 1.14, sy: 0.8, arms: 0.1, legs: 0.0, ease: 'easeInQuad' }, // 착지 찌부러짐
  { t: 0.66, y: 0.0, sx: 1.0, sy: 1.0, arms: 0.0, legs: 0.0, ease: 'easeOutBack' }, // 탄성 복원
]

/**
 * 손 흔들기(1.5초) — 한쪽 팔을 어깨에서 옆·위로 들어 손끝을 좌우로 흔든다.
 *
 * 머리가 몸보다 커서 팔을 아무리 들어도 손이 머리 꼭대기에는 닿지 않는다. 대신 팔을
 * 2.2 라디안쯤 들면 손이 턱 옆, 머리 실루엣 바로 바깥에 온다 — 거기서 흔들어야 얼굴을
 * 가리지도 머리를 뚫지도 않으면서 정면에서 또렷이 읽힌다.
 *
 *   lift 팔이 옆으로 들리는 각도 (라디안)
 *   wag  든 채로 좌우로 흔드는 각도 (라디안, lift 에 더해진다)
 *   tilt 몸통이 그 팔 쪽으로 기우는 각도
 *   nod  고개가 그쪽으로 갸웃하는 각도
 */
export const FIGURE_WAVE_UNIT: Keyframe[] = [
  { t: 0.0, lift: 0.0, wag: 0.0, tilt: 0.0, nod: 0.0, ease: 'easeOutQuad' },
  { t: 0.14, lift: 1.0, wag: 0.0, tilt: 0.03, nod: 0.02, ease: 'easeOutQuad' }, // 올라간다
  { t: 0.3, lift: 2.2, wag: 0.12, tilt: 0.07, nod: 0.07, ease: 'easeOutBack' }, // 턱 옆까지
  { t: 0.45, lift: 2.2, wag: -0.18, tilt: 0.07, nod: 0.07, ease: 'easeInOutQuad' }, // ── 흔들기 ──
  { t: 0.6, lift: 2.2, wag: 0.18, tilt: 0.07, nod: 0.07, ease: 'easeInOutQuad' },
  { t: 0.75, lift: 2.2, wag: -0.18, tilt: 0.07, nod: 0.07, ease: 'easeInOutQuad' },
  { t: 0.9, lift: 2.2, wag: 0.18, tilt: 0.07, nod: 0.07, ease: 'easeInOutQuad' },
  { t: 1.05, lift: 2.15, wag: -0.1, tilt: 0.06, nod: 0.06, ease: 'easeInOutQuad' },
  { t: 1.25, lift: 0.9, wag: 0.0, tilt: 0.03, nod: 0.02, ease: 'easeInQuad' }, // 내린다
  { t: 1.5, lift: 0.0, wag: 0.0, tilt: 0.0, nod: 0.0, ease: 'easeOutQuad' },
]

/**
 * 춤 한 바퀴(0.9초) — 왼쪽으로 한 스텝, 오른쪽으로 한 스텝.
 *
 *   x      좌우 이동 (-1 ~ 1)
 *   y      통통 튀는 높이 (0 ~ 1)
 *   tilt   몸통 기울기 (라디안)
 *   swing  두 팔이 번갈아 앞뒤로 흔들리는 정도 (+1 이면 왼팔 앞·오른팔 뒤)
 *   spread 두 팔이 양옆으로 벌어지는 각도
 *   step   드는 발 (+1 왼발 / -1 오른발)
 *   nod    고개 끄덕임 (라디안)
 *
 * 시작과 끝이 모두 중립이라 몇 바퀴든 이어 붙여도 이음매가 튀지 않는다.
 */
export const FIGURE_DANCE_UNIT: Keyframe[] = [
  { t: 0.0, x: 0.0, y: 0.0, tilt: 0.0, swing: 0.0, spread: 0.0, step: 0.0, nod: 0.0, sx: 1.0, sy: 1.0, ease: 'linear' },
  // ── 왼쪽으로 ──
  { t: 0.08, x: -0.2, y: 0.0, tilt: 0.06, swing: 0.3, spread: 0.15, step: 0.0, nod: 0.06, sx: 1.06, sy: 0.94, ease: 'easeOutQuad' },
  { t: 0.18, x: -0.75, y: 1.0, tilt: 0.18, swing: 1.0, spread: 0.35, step: 1.0, nod: -0.1, sx: 0.96, sy: 1.06, ease: 'easeOutCubic' },
  { t: 0.28, x: -1.0, y: 0.0, tilt: 0.22, swing: 0.7, spread: 0.25, step: 0.2, nod: 0.08, sx: 1.08, sy: 0.92, ease: 'easeInQuad' },
  { t: 0.38, x: -0.5, y: 0.1, tilt: 0.08, swing: 0.2, spread: 0.2, step: 0.0, nod: 0.0, sx: 1.0, sy: 1.01, ease: 'easeOutQuad' },
  { t: 0.45, x: 0.0, y: 0.0, tilt: 0.0, swing: 0.0, spread: 0.2, step: 0.0, nod: 0.05, sx: 1.03, sy: 0.98, ease: 'easeInOutQuad' },
  // ── 오른쪽으로 (좌우 대칭) ──
  { t: 0.53, x: 0.2, y: 0.0, tilt: -0.06, swing: -0.3, spread: 0.15, step: 0.0, nod: 0.06, sx: 1.06, sy: 0.94, ease: 'easeOutQuad' },
  { t: 0.63, x: 0.75, y: 1.0, tilt: -0.18, swing: -1.0, spread: 0.35, step: -1.0, nod: -0.1, sx: 0.96, sy: 1.06, ease: 'easeOutCubic' },
  { t: 0.73, x: 1.0, y: 0.0, tilt: -0.22, swing: -0.7, spread: 0.25, step: -0.2, nod: 0.08, sx: 1.08, sy: 0.92, ease: 'easeInQuad' },
  { t: 0.83, x: 0.5, y: 0.1, tilt: -0.08, swing: -0.2, spread: 0.2, step: 0.0, nod: 0.0, sx: 1.0, sy: 1.01, ease: 'easeOutQuad' },
  { t: 0.9, x: 0.0, y: 0.0, tilt: 0.0, swing: 0.0, spread: 0.0, step: 0.0, nod: 0.0, sx: 1.0, sy: 1.0, ease: 'easeInOutQuad' },
]

export const FIGURE_MOTION_FIELDS: Record<FigureMotion, string[]> = {
  hop: ['y', 'sx', 'sy', 'arms', 'legs'],
  wave: ['lift', 'wag', 'tilt', 'nod'],
  dance: ['x', 'y', 'tilt', 'swing', 'spread', 'step', 'nod', 'sx', 'sy'],
}

export const FIGURE_MOTION_UNITS: Record<FigureMotion, Keyframe[]> = {
  hop: FIGURE_HOP_UNIT,
  wave: FIGURE_WAVE_UNIT,
  dance: FIGURE_DANCE_UNIT,
}

/** 아무 동작도 없을 때의 값. 트랙의 첫 키와 마지막 키가 이것과 같아야 이음매가 안 튄다. */
export const FIGURE_MOTION_REST: Record<FigureMotion, Sampled> = {
  hop: { y: 0, sx: 1, sy: 1, arms: 0, legs: 0 },
  wave: { lift: 0, wag: 0, tilt: 0, nod: 0 },
  dance: { x: 0, y: 0, tilt: 0, swing: 0, spread: 0, step: 0, nod: 0, sx: 1, sy: 1 },
}

/** 마지막 키의 시각이 곧 그 트랙의 길이다. */
export const motionDuration = (keys: Keyframe[]): number => keys[keys.length - 1].t

/** 한 번 뛰면 몇 번 튀는지. 두 번째는 낮고 조금 빠르다. */
export const FIGURE_HOP_COUNT = 2
/** 춤을 몇 바퀴 도는지. */
export const FIGURE_DANCE_CYCLES = 2

const HOP_FALLOFF = 0.7
const HOP_SPEED_STEP = 0.12

/** 폴짝 유닛을 n번 이어 붙인다. 뒤로 갈수록 낮아지고 빨라진다. */
export function buildFigureHop(hops = FIGURE_HOP_COUNT, unit = FIGURE_HOP_UNIT): FigureTimeline {
  const unitEnd = motionDuration(unit)
  const keys: Keyframe[] = []
  let offset = 0
  for (let index = 0; index < hops; index += 1) {
    const height = HOP_FALLOFF ** index
    const speed = 1 + index * HOP_SPEED_STEP
    unit.forEach((key, keyIndex) => {
      // 두 번째부터는 첫 키가 직전 폴짝의 마지막 키와 같으므로 건너뛴다
      if (index > 0 && keyIndex === 0) return
      keys.push({
        ...key,
        t: offset + key.t / speed,
        y: (key.y as number) * height,
        legs: (key.legs as number) * height,
      })
    })
    offset += unitEnd / speed
  }
  return { keys, duration: offset }
}

/** 춤 유닛을 n바퀴 이어 붙인다. 끝까지 같은 세기로 춘다. */
export function buildFigureDance(
  cycles = FIGURE_DANCE_CYCLES,
  unit = FIGURE_DANCE_UNIT,
): FigureTimeline {
  const cycle = motionDuration(unit)
  const keys: Keyframe[] = []
  for (let index = 0; index < cycles; index += 1) {
    unit.forEach((key, keyIndex) => {
      if (index > 0 && keyIndex === 0) return
      keys.push({ ...key, t: index * cycle + key.t })
    })
  }
  return { keys, duration: cycles * cycle }
}

/** 아래는 모두 "캐릭터 키의 몇 배" 라, 종·크기가 달라도 같은 비율로 움직인다. */
const HOP_RATIO = 0.3
const DANCE_SWAY = 0.2
const DANCE_BOB = 0.1
/** 폴짝 정점에서 팔이 옆으로 들리는 각도 · 다리가 뒤로 접히는 각도 */
const HOP_ARM_LIFT = 1.1
const HOP_LEG_TUCK = 0.9
/** 춤출 때 팔이 앞뒤로 흔들리는 각도 · 발을 앞으로 드는 각도 */
const SWING_ANGLE = 0.8
const STEP_ANGLE = 0.7
const BLINK_DURATION = 0.14

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

function advance(
  time: number | null,
  delta: number,
  duration: number,
  sample: (t: number) => Sampled,
  rest: Sampled,
): [number | null, Sampled] {
  if (time === null) return [null, rest]
  const next = time + delta
  if (next >= duration) return [null, rest]
  return [next, sample(next)]
}

export function createFigureAnimator(
  figure: Figure,
  { hops = FIGURE_HOP_COUNT, cycles = FIGURE_DANCE_CYCLES }: { hops?: number; cycles?: number } = {},
) {
  const { root, parts, height, armRest, spec } = figure
  const hop = buildFigureHop(hops)
  const dance = buildFigureDance(cycles)
  const waveDuration = motionDuration(FIGURE_WAVE_UNIT)
  const floppy = spec.build.ears === 'floppy'
  const long = spec.build.ears === 'long'

  const hopHeight = height * HOP_RATIO
  const swayWidth = height * DANCE_SWAY
  const bobHeight = height * DANCE_BOB

  const earLag = createSpring({ stiffness: 160, damping: 14 })
  const earSway = createSpring({ stiffness: 120, damping: 12 })
  const headLag = createSpring({ stiffness: 240, damping: 20 })

  let elapsed = 0
  let hopTime: number | null = null
  let waveTime: number | null = null
  let danceTime: number | null = null
  let previousY = 0
  let previousX = 0
  let untilBlink = randomBetween(1.5, 4)
  let blinkTime: number | null = null

  const durations: Record<FigureMotion, number> = {
    hop: hop.duration,
    wave: waveDuration,
    dance: dance.duration,
  }

  function start(motion: FigureMotion, at = 0) {
    if (motion === 'hop') hopTime = at
    else if (motion === 'wave') waveTime = at
    else danceTime = at
  }

  function stop() {
    hopTime = waveTime = danceTime = null
  }

  /**
   * 재생하지 않고 그 시각의 정지 포즈로 고정한다. 테스트가 정점의 자세를 재는 데 쓴다.
   * `delta` 0 으로 한 번만 돌리므로 호흡도 스프링도 움직이지 않는다.
   */
  function scrub(motion: FigureMotion, t: number) {
    stop()
    // 끝에 정확히 닿으면 `advance` 가 타이머를 끄고 기본 자세를 주므로 살짝 앞에 세운다
    start(motion, clamp(t, 0, durations[motion] - 1e-4))
    update(0)
  }

  function update(delta: number) {
    elapsed += delta

    let frameHop: Sampled
    let frameWave: Sampled
    let frameDance: Sampled
    ;[hopTime, frameHop] = advance(
      hopTime,
      delta,
      hop.duration,
      (t) => sampleTrack(hop.keys, FIGURE_MOTION_FIELDS.hop, t),
      FIGURE_MOTION_REST.hop,
    )
    ;[waveTime, frameWave] = advance(
      waveTime,
      delta,
      waveDuration,
      (t) => sampleTrack(FIGURE_WAVE_UNIT, FIGURE_MOTION_FIELDS.wave, t),
      FIGURE_MOTION_REST.wave,
    )
    ;[danceTime, frameDance] = advance(
      danceTime,
      delta,
      dance.duration,
      (t) => sampleTrack(dance.keys, FIGURE_MOTION_FIELDS.dance, t),
      FIGURE_MOTION_REST.dance,
    )

    const settled = hopTime === null && waveTime === null && danceTime === null

    // ── 호흡 (다른 동작 중에는 거의 죽인다) ──
    const breathAmount = settled ? 1 : 0.2
    const breath = Math.sin(elapsed * 2.0) * 0.02 * breathAmount

    // ── 위치와 부피 (여러 동작이 곱해지고 더해진다) ──
    const x = frameDance.x * swayWidth
    const y = frameHop.y * hopHeight + frameDance.y * bobHeight
    const wide = frameHop.sx * frameDance.sx * (1 - breath * 0.5)
    root.position.set(x, y, 0)
    root.scale.set(wide, frameHop.sy * frameDance.sy * (1 + breath), wide)

    // ── 몸통. 손 흔들 때는 흔드는 팔(+x) 쪽으로 기운다 — 그쪽은 음의 회전이다 ──
    const tilt = frameDance.tilt - frameWave.tilt
    parts.torso.rotation.z = Math.sin(elapsed * 1.0) * 0.015 * breathAmount + tilt

    // ── 속도로부터 지연(lag) ──
    const dt = Math.max(delta, 1 / 240)
    const lagTarget = clamp(((y - previousY) / dt) * 0.05, -0.7, 0.7)
    const swayTarget = clamp(((x - previousX) / dt) * 0.12, -0.9, 0.9)
    previousY = y
    previousX = x
    earLag.update(lagTarget, delta)
    earSway.update(swayTarget, delta)
    headLag.update(lagTarget, delta)

    // ── 머리 (몸이 기울면 머리는 덜 기운다. 손 흔들 때는 그쪽으로 갸웃) ──
    parts.head.rotation.x =
      Math.sin(elapsed * 2.0 + 0.5) * 0.02 * breathAmount - headLag.value * 0.15 + frameDance.nod
    parts.head.rotation.z = -tilt * 0.4 - frameWave.nod

    // ── 팔. 피벗이 어깨라 z 회전이 곧 "옆으로 들기", x 회전이 "앞뒤로 흔들기".
    //    아래로 늘어진 팔은 양의 z 회전이 손끝을 +x 로 보내므로 왼팔(+x)은 양, 오른팔은 음이다 ──
    const lift = armRest + frameHop.arms * HOP_ARM_LIFT + frameDance.spread
    parts.armL.rotation.z = lift + frameWave.lift + frameWave.wag
    parts.armR.rotation.z = -lift
    // 손 흔들 때는 팔을 앞으로도 내민다. 머리가 커서 옆으로만 들면 손이 머리 뒤에
    // 가려지는데, 앞으로 내면 뺨 옆 앞쪽에 와서 정면에서 또렷이 보인다
    parts.armL.rotation.x = -frameDance.swing * SWING_ANGLE - frameWave.lift * 0.28
    parts.armR.rotation.x = frameDance.swing * SWING_ANGLE

    // ── 다리. 양의 x 회전이 발을 뒤로 보낸다 (접기), 음이 앞으로 (발 들기) ──
    const tuck = frameHop.legs * HOP_LEG_TUCK
    parts.legL.rotation.x = tuck - Math.max(0, frameDance.step) * STEP_ANGLE
    parts.legR.rotation.x = tuck - Math.max(0, -frameDance.step) * STEP_ANGLE

    // ── 귀. 늘어진 귀는 몸이 튈 때 한 박자 늦게 출렁이고, 선 귀는 뒤로 젖혀진다 ──
    for (const [key, side] of [
      ['earL', 1],
      ['earR', -1],
    ] as const) {
      const ear = parts[key]
      if (!ear) continue
      const idle = Math.sin(elapsed * 1.3 + side) * 0.02 * breathAmount
      if (floppy) {
        // 뿌리가 위라, 몸이 올라가면 귀는 뒤로·바깥으로 펄럭인다
        ear.rotation.x = earLag.value * 0.8
        ear.rotation.z = side * Math.max(0, earLag.value) * 0.6 + idle - earSway.value * 0.4
      } else {
        ear.rotation.x = -earLag.value * (long ? 0.5 : 0.3)
        ear.rotation.z = idle - earSway.value * 0.35
      }
    }

    // ── 꼬리 ──
    if (parts.tail) {
      parts.tail.rotation.y = Math.sin(elapsed * 1.8) * 0.12 - earSway.value * 0.5
      parts.tail.rotation.x = earLag.value * 0.4
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
    parts.eyeL.scale.y = lids
    parts.eyeR.scale.y = lids
  }

  return {
    hop: () => start('hop'),
    wave: () => start('wave'),
    dance: () => start('dance'),
    play: (motion: FigureMotion) => start(motion),
    update,
    stop,
    scrub,
    durations,
    get isBusy() {
      return hopTime !== null || waveTime !== null || danceTime !== null
    },
  }
}

export type FigureAnimator = ReturnType<typeof createFigureAnimator>
