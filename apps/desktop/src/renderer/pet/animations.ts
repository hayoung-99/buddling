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
 *   hop    — '폴짝' 신호를 받았을 때. 제자리에서 통통 뛴다.
 *   wave   — '손 흔들기' 신호를 받았을 때. 한쪽 팔을 들어 흔든다.
 *
 * 살아있어 보이게 만드는 장치:
 *   1) squash & stretch — 웅크렸다 늘어나고 딛을 때 찌부러진다
 *   2) 지연 — 귀·꼬리·머리가 몸통보다 한 박자 늦게 따라온다 (스프링)
 *   3) 반대 방향 — 몸이 기울면 머리는 덜 기울어 중심을 잡는다
 */

import type * as THREE from 'three'
import { sampleTrack, createSpring, clamp } from './tween'
import type { Keyframe, Sampled } from './tween'
import { TAIL } from '@buddling/shared/characters'
import type { Critter } from './critter'

/** 이어 붙인 키프레임 한 벌과 그 전체 길이(초) */
export interface Timeline {
  keys: Keyframe[]
  duration: number
}

/** 폴짝 한 번(0.64초)의 키프레임. y는 최고점 기준 0~1 비율. */
export const HOP_UNIT: Keyframe[] = [
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
export const DANCE_UNIT: Keyframe[] = [
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
 * 손 흔들기(1.3초) — 한쪽 팔만 든다.
 *
 *   armOne   그 팔만 더 드는 각도 (라디안). 두 팔이 함께 움직이는 arm·spread 위에 얹힌다
 *   shoulder 그 팔의 어깨를 바깥·위로 옮기는 양 (0~1, 캐릭터 키에 대한 비율로 쓰인다)
 *   tilt     몸통이 그 팔 쪽으로 살짝 기운다
 *
 * **어깨를 옮기지 않으면 읽히지 않는다.** 이 캐릭터들의 팔은 관절 없는 짧은 돌기이고
 * 어깨가 몸통 옆면에 붙박여 있어서, 각도만 주면 팔이 몸통 옆면을 따라 올라가 실루엣
 * 안에 묻힌다. 어깨를 잠깐 바깥으로 밀어야 팔이 실루엣 밖으로 나온다. 동작이 끝나면
 * 0으로 돌아오는 값이라 다른 동작에는 영향이 없다.
 *
 * 리그(비율·관절)는 건드리지 않는다 — 팔다리를 늘리면 인형이 피규어가 된다.
 */
export const WAVE_UNIT: Keyframe[] = [
  { t: 0.0, armOne: 0.0, shoulder: 0.0, tilt: 0.0, ease: 'easeOutQuad' },
  { t: 0.12, armOne: 0.95, shoulder: 0.55, tilt: -0.03, ease: 'easeOutQuad' }, // 팔이 올라가며 어깨가 따라 나간다
  { t: 0.28, armOne: 2.5, shoulder: 1.0, tilt: -0.07, ease: 'easeOutBack' }, // 손이 머리 위로 올라왔다
  { t: 0.44, armOne: 1.98, shoulder: 0.92, tilt: -0.04, ease: 'easeInOutQuad' }, // ── 흔들기 ──
  { t: 0.6, armOne: 2.72, shoulder: 1.0, tilt: -0.09, ease: 'easeInOutQuad' },
  { t: 0.76, armOne: 1.98, shoulder: 0.92, tilt: -0.04, ease: 'easeInOutQuad' },
  { t: 0.92, armOne: 2.72, shoulder: 1.0, tilt: -0.09, ease: 'easeInOutQuad' },
  { t: 1.1, armOne: 0.85, shoulder: 0.52, tilt: -0.02, ease: 'easeInQuad' }, // 내린다
  { t: 1.3, armOne: 0.0, shoulder: 0.0, tilt: 0.0, ease: 'easeOutQuad' },
]

/**
 * 수줍음(1.7초) — 팔 하나가 얼굴 옆으로 올라오고 몸이 살랑인다.
 *
 *   armIn    두 팔이 안쪽·위로 도는 각도 (라디안). 손 흔들기의 `armOne` 과 자리는 같지만
 *            뜻이 달라 따로 둔다 — 저쪽은 바깥으로 뻗어 흔들고 이쪽은 볼 앞에서 멈춘다
 *   shoulder 두 어깨를 옮기는 양. 위로 들면서 **앞으로 밀고** 가운데로 조금 모은다
 *   sway     몸통이 좌우로 살랑이는 폭 (춤의 절반이 안 되게 쓴다)
 *   tilt     살랑이는 쪽으로 몸이 기운다
 *   blush    볼이 붉어지는 정도 (0~1)
 *
 * **한 팔이 아니라 두 팔이다.** 한쪽만 올려 봤더니 손 흔들기의 어중간한 변주로 읽혔다.
 * 볼을 감싸려는 몸짓은 좌우가 대칭이어야 그 뜻이 되고, 거기에 몸통이 살랑이고 볼이
 * 붉어져야 비로소 그 감정이 된다.
 *
 * **팔은 볼에 닿지 않는다.** 관절이 없어서 감싸는 대신 볼 앞을 지나는 데서 멈춘다.
 * 거기까지가 이 리그로 되는 것이고, 리그를 고쳐서까지 맞추지는 않는다.
 *
 * 길이는 콕(1.7초)과 같다. 신호끼리 무게가 같아야 한다.
 */
export const SHY_UNIT: Keyframe[] = [
  { t: 0.0, armIn: 0.0, shoulder: 0.0, sway: 0.0, tilt: 0.0, blush: 0.0, ease: 'easeOutQuad' },
  { t: 0.22, armIn: 1.15, shoulder: 0.42, sway: -0.16, tilt: 0.04, blush: 0.3, ease: 'easeOutQuad' }, // 팔이 올라오기 시작
  { t: 0.44, armIn: 2.62, shoulder: 0.95, sway: 0.3, tilt: -0.07, blush: 0.62, ease: 'easeOutBack' }, // 볼 앞까지 올라왔다
  { t: 0.72, armIn: 2.72, shoulder: 1.0, sway: -0.32, tilt: 0.08, blush: 0.88, ease: 'easeInOutQuad' }, // ── 살랑살랑 ──
  { t: 1.0, armIn: 2.64, shoulder: 0.96, sway: 0.31, tilt: -0.08, blush: 1.0, ease: 'easeInOutQuad' },
  { t: 1.28, armIn: 2.72, shoulder: 1.0, sway: -0.24, tilt: 0.06, blush: 0.94, ease: 'easeInOutQuad' },
  { t: 1.5, armIn: 1.25, shoulder: 0.42, sway: 0.08, tilt: -0.02, blush: 0.52, ease: 'easeInQuad' }, // 내린다
  { t: 1.7, armIn: 0.0, shoulder: 0.0, sway: 0.0, tilt: 0.0, blush: 0.0, ease: 'easeOutQuad' },
]

/**
 * 움찔 한 번(0.46초). 제자리에서 몸을 좌우로 떨며 눌린 느낌을 낸다.
 * 뛰지 않으므로 y는 없고, 몸통을 기울이는 tilt 가 흔들림을 만든다.
 */
export const TWITCH_UNIT: Keyframe[] = [
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
const WAVE_FIELDS = ['armOne', 'shoulder', 'tilt']
const SHY_FIELDS = ['armIn', 'shoulder', 'sway', 'tilt', 'blush']

/** 갈아끼울 수 있는 트랙 이름 */
export type TrackName = 'hop' | 'dance' | 'twitch' | 'wave' | 'shy'

/**
 * 트랙마다 보간하는 필드와 지금 소스에 적혀 있는 유닛.
 *
 * 미리보기의 키프레임 편집기가 이 둘을 읽어 슬라이더를 만들고 초기값을 채운다.
 * **편집기가 자기 나름대로 캐릭터를 움직이면 거기서 다듬은 숫자가 앱에서 다르게
 * 보이므로**, 값을 부위에 바르는 일은 아래 `createAnimator` 하나만 한다.
 */
export const TRACK_FIELDS: Record<TrackName, string[]> = {
  hop: HOP_FIELDS,
  dance: DANCE_FIELDS,
  twitch: TWITCH_FIELDS,
  wave: WAVE_FIELDS,
  shy: SHY_FIELDS,
}

export const TRACK_UNITS: Record<TrackName, Keyframe[]> = {
  hop: HOP_UNIT,
  dance: DANCE_UNIT,
  twitch: TWITCH_UNIT,
  wave: WAVE_UNIT,
  shy: SHY_UNIT,
}

/** 유닛 트랙의 길이 — 마지막 키의 시각이 곧 그 동작의 길이다. */
export const trackDuration = (keys: Keyframe[]): number => keys[keys.length - 1].t

const TWITCH_DURATION = trackDuration(TWITCH_UNIT)
const WAVE_DURATION = trackDuration(WAVE_UNIT)
const SHY_DURATION = trackDuration(SHY_UNIT)
const DANCE_CYCLE = trackDuration(DANCE_UNIT)

const HEIGHT_FALLOFF = 0.66 // 폴짝마다 높이 감쇠
const SPEED_STEP = 0.1 // 폴짝마다 조금씩 빨라짐
const BLINK_DURATION = 0.14

/** 콕 찔렸을 때 추는 바퀴 수. 2바퀴 ≈ 1.7초로 예전 점프와 비슷한 길이다. */
export const DANCE_CYCLES = 2

/** 한 번 뛰면 몇 번 튀는지. 뒤로 갈수록 낮아지고 빨라진다. */
export const HOP_COUNT = 3

/** 아래는 모두 "캐릭터 키의 몇 배" 단위라, 종·크기가 달라도 같은 비율로 움직인다. */
const HOP_RATIO = 0.26 // 첫 폴짝 높이
const DANCE_SWAY = 0.22 // 좌우로 벌어지는 폭
/** 수줍을 때 살랑이는 폭. 춤보다 훨씬 좁아야 '들썩임'이 아니라 '살랑임'이 된다. */
const SHY_SWAY = 0.075

/**
 * 볼이 가장 붉을 때의 진하기.
 *
 * 1로 두면 붉은 판이 얼굴에 붙은 것처럼 보인다. 볼이 붉어지는 것은 살갗이 비치는
 * 것이라 얼굴색이 조금 남아 있어야 한다.
 */
const BLUSH_PEAK = 0.76

/**
 * 볼이 붉을 때 빗금이 넘어가는 색.
 *
 * 종마다 빗금 색이 다르지만 넘어가는 곳은 하나다 — 붉은 바탕 위의 밝은 자국은
 * 어느 얼굴에서나 같은 것으로 읽힌다.
 */
const CHEEK_ON_BLUSH = 0xffe3e6
const DANCE_BOB = 0.12 // 춤추며 통통 튀는 높이
const STEP_LIFT = 0.035 // 발을 드는 높이
const SHOULDER_REACH = 0.075 // 손 흔들 때 어깨가 바깥으로 나가는 거리
const SHOULDER_LIFT = 0.055 // 그때 어깨가 올라가는 높이
/**
 * 수줍을 때 두 팔이 **앞으로** 밀려 나가는 거리.
 *
 * 각도만으로는 팔이 얼굴 *옆* 에서 멈춘다 — 팔은 어깨를 축으로 몸통과 같은 평면에서만
 * 도니까. 볼 앞을 지나게 하려면 앞으로 밀어 주는 수밖에 없다.
 */
const SHOULDER_FORWARD = 0.135
/** 그때 두 어깨가 가운데로 조금 모인다. 팔이 벌어진 채 올라가면 만세가 된다. */
const SHOULDER_TUCK = 0.028

/** 폴짝 n번을 하나의 키프레임 트랙으로 이어붙인다. */
export function buildHopTimeline(hops = HOP_COUNT, unit: Keyframe[] = HOP_UNIT): Timeline {
  const unitEnd = trackDuration(unit)
  const keys: Keyframe[] = []
  let offset = 0

  for (let index = 0; index < hops; index += 1) {
    const height = HEIGHT_FALLOFF ** index
    const speed = 1 + index * SPEED_STEP

    unit.forEach((key, keyIndex) => {
      // 두 번째 폴짝부터는 첫 키가 직전 폴짝의 마지막 키와 같으므로 건너뛴다
      if (index > 0 && keyIndex === 0) return
      keys.push({ ...key, t: offset + key.t / speed, y: (key.y as number) * height })
    })

    offset += unitEnd / speed
  }

  return { keys, duration: offset }
}

/**
 * 춤 n바퀴를 이어붙인다.
 * 점프와 달리 힘이 빠지지 않는다 — 끝까지 같은 세기로 추다가 중립에서 멈춘다.
 */
export function buildDanceTimeline(
  cycles = DANCE_CYCLES,
  unit: Keyframe[] = DANCE_UNIT,
): Timeline {
  const cycle = trackDuration(unit)
  const keys: Keyframe[] = []

  for (let index = 0; index < cycles; index += 1) {
    unit.forEach((key, keyIndex) => {
      if (index > 0 && keyIndex === 0) return
      keys.push({ ...key, t: index * cycle + key.t })
    })
  }

  return { keys, duration: cycles * cycle }
}

/** 폴짝 타임라인을 시각 t에서 샘플링한다. → { y, sx, sy } */
export function sampleHop(timeline: Timeline, t: number): Sampled {
  return sampleTrack(timeline.keys, HOP_FIELDS, t)
}

/** 춤 타임라인을 시각 t에서 샘플링한다. → { x, y, tilt, arm, spread, step, sx, sy } */
export function sampleDance(timeline: Timeline, t: number): Sampled {
  return sampleTrack(timeline.keys, DANCE_FIELDS, t)
}

/** 움찔 동작을 시각 t에서 샘플링한다. → { sx, sy, tilt } */
export function sampleTwitch(t: number): Sampled {
  return sampleTrack(TWITCH_UNIT, TWITCH_FIELDS, t)
}

/** 손 흔들기를 시각 t에서 샘플링한다. → { armOne, shoulder, tilt } */
export function sampleWave(t: number): Sampled {
  return sampleTrack(WAVE_UNIT, WAVE_FIELDS, t)
}

/** 수줍음을 시각 t에서 샘플링한다. → { armIn, shoulder, sway, tilt, blush } */
export function sampleShy(t: number): Sampled {
  return sampleTrack(SHY_UNIT, SHY_FIELDS, t)
}

export { TWITCH_DURATION, WAVE_DURATION, SHY_DURATION, DANCE_CYCLE }

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

/** 아무 동작도 없을 때의 기본값 */
const REST_HOP: Sampled = { y: 0, sx: 1, sy: 1 }
const REST_DANCE: Sampled = { x: 0, y: 0, tilt: 0, arm: 0, spread: 0, step: 0, sx: 1, sy: 1 }
const REST_TWITCH: Sampled = { sx: 1, sy: 1, tilt: 0 }
const REST_WAVE: Sampled = { armOne: 0, shoulder: 0, tilt: 0 }
const REST_SHY: Sampled = { armIn: 0, shoulder: 0, sway: 0, tilt: 0, blush: 0 }

/**
 * 타이머를 delta 만큼 진행시키고 이번 프레임의 값을 돌려준다.
 * 끝났으면 타이머를 끄고(null) 기본 자세를 돌려준다.
 *
 * @returns [다음 타이머, 이번 프레임 값]
 */
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

/** 캐릭터에 애니메이션을 입힌다. */
export function createAnimator(
  critter: Critter,
  { hops = HOP_COUNT, cycles = DANCE_CYCLES }: { hops?: number; cycles?: number } = {},
) {
  const { root, parts, spec, height } = critter

  // 유닛은 애니메이터마다 따로 들고 있다. 미리보기의 편집기가 `setTrack()` 으로
  // 갈아끼워도 다른 캐릭터 창이나 테스트가 함께 흔들리지 않게 하려는 것이다.
  const units: Record<TrackName, Keyframe[]> = { ...TRACK_UNITS }
  let hopTimeline = buildHopTimeline(hops, units.hop)
  let danceTimeline = buildDanceTimeline(cycles, units.dance)
  let twitchDuration = trackDuration(units.twitch)
  let waveDuration = trackDuration(units.wave)
  let shyDuration = trackDuration(units.shy)
  const wags = spec.build.tail.type === TAIL.WAG

  const hopHeight = height * HOP_RATIO
  const swayWidth = height * DANCE_SWAY
  const shySwayWidth = height * SHY_SWAY
  const bobHeight = height * DANCE_BOB
  const stepLift = height * STEP_LIFT

  // 다리는 원래 자리에서 위로만 살짝 들 것이므로 기준 높이를 기억해 둔다
  const legBaseY = parts.legL ? parts.legL.position.y : 0
  /*
   * 옮겼다가 되돌려 놓아야 하는 어깨 자리.
   *
   * 손 흔들기는 왼팔 하나만 쓰지만 수줍음은 **두 팔**을 쓰므로 양쪽을 다 기억한다.
   * 앞으로 미는 것도 수줍음에만 있어서 z 까지 들고 있어야 한다.
   */
  const armBase = {
    L: parts.armL ? parts.armL.position.clone() : null,
    R: parts.armR ? parts.armR.position.clone() : null,
  }
  const shoulderReach = height * SHOULDER_REACH
  const shoulderLift = height * SHOULDER_LIFT
  const shoulderForward = height * SHOULDER_FORWARD
  const shoulderTuck = height * SHOULDER_TUCK

  /**
   * 볼에 번지는 붉음. 재질을 미리 잡아 두고 투명도만 만진다.
   *
   * 매 프레임 `traverse` 로 찾으면 캐릭터 하나에 그 비용이 초당 60번씩 붙는다.
   * 이 앱은 켜 둔 채로 쓰는 것이라 그런 것 하나가 곧 배터리다.
   */
  const blushes = [parts.blushL, parts.blushR]
    .filter(Boolean)
    .map((mesh) => (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial)

  /*
   * 볼 빗금은 붉음이 번지는 동안 **밝은 쪽으로 넘어간다.**
   *
   * 평소에는 하얀 얼굴 위의 분홍 빗금이라 분홍이 어두운 쪽이다. 그런데 그 아래가
   * 붉게 물들면 같은 분홍이 배경에 묻혀 빗금이 사라져 버린다. 붉은 볼 위에서는
   * 빗금이 **밝은 자국**이어야 보인다.
   *
   * 이 재질은 볼 빗금만 쓴다(`critter.ts` 의 `materials.cheek`). 캐릭터마다 따로
   * 만들어지므로 여기서 만져도 다른 캐릭터가 함께 변하지 않는다.
   */
  const cheekMaterial = critter.materials.cheek as THREE.MeshStandardMaterial | undefined
  const cheekRest = cheekMaterial?.color.clone() ?? null
  const cheekLit = cheekRest?.clone().setHex(CHEEK_ON_BLUSH) ?? null

  const earLag = createSpring({ stiffness: 170, damping: 15 })
  const headLag = createSpring({ stiffness: 240, damping: 20 })
  const earSway = createSpring({ stiffness: 130, damping: 13 })

  let elapsed = 0
  let hopTime: number | null = null
  let danceTime: number | null = null
  let twitchTime: number | null = null
  let waveTime: number | null = null
  let shyTime: number | null = null
  let previousY = 0
  let previousX = 0

  let untilBlink = randomBetween(1.5, 4)
  let blinkTime: number | null = null
  // 아래 셋은 가만히 있을 때 이따금 한쪽 귀만 쫑긋하는 연출용이다 (몸 움찔과 별개)
  let untilEarTwitch = randomBetween(3, 8)
  let earTwitchTime: number | null = null
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

  /** 한쪽 팔을 들어 흔든다. '손 흔들기' 신호를 받았을 때 나오는 반응. */
  function wave() {
    waveTime = 0
  }

  /** 팔을 얼굴 옆으로 올리고 몸을 살랑이며 볼을 붉힌다. '하트' 신호의 반응. */
  function shy() {
    shyTime = 0
  }

  const durationOf = (name: TrackName): number =>
    name === 'hop'
      ? hopTimeline.duration
      : name === 'dance'
        ? danceTimeline.duration
        : name === 'twitch'
          ? twitchDuration
          : name === 'wave'
            ? waveDuration
            : shyDuration

  /**
   * 유닛 트랙을 갈아끼운다. 미리보기의 키프레임 편집기만 부른다.
   *
   * 폴짝과 춤은 유닛을 여러 번 이어 붙여 쓰므로(3번·2바퀴) 타임라인을 다시 만든다.
   */
  function setTrack(name: TrackName, keys: Keyframe[]) {
    units[name] = keys
    if (name === 'hop') hopTimeline = buildHopTimeline(hops, keys)
    else if (name === 'dance') danceTimeline = buildDanceTimeline(cycles, keys)
    else if (name === 'twitch') twitchDuration = trackDuration(keys)
    else if (name === 'wave') waveDuration = trackDuration(keys)
    else shyDuration = trackDuration(keys)
  }

  /** 재생 중인 것을 전부 끄고 기본 자세로 돌아간다. */
  function stop() {
    hopTime = danceTime = twitchTime = waveTime = shyTime = null
  }

  /**
   * 재생하지 않고 **그 시각의 정지 포즈**로 고정한다. 편집기가 키를 고를 때 쓴다.
   *
   * `delta` 를 0으로 한 번만 돌리므로 호흡도 스프링도 눈 깜빡임도 움직이지 않는다.
   * 시각은 이어 붙인 타임라인 기준이다 — 폴짝 3번이면 0 부터 세 번째 착지까지다.
   */
  function scrub(name: TrackName, t: number) {
    stop()
    // 끝에 정확히 닿으면 `advance` 가 타이머를 끄고 기본 자세를 주므로 살짝 앞에 세운다
    const at = clamp(t, 0, durationOf(name) - 1e-4)
    if (name === 'hop') hopTime = at
    else if (name === 'dance') danceTime = at
    else if (name === 'twitch') twitchTime = at
    else if (name === 'wave') waveTime = at
    else shyTime = at
    update(0)
  }

  function update(delta: number) {
    elapsed += delta

    let frameHop: Sampled
    let frameDance: Sampled
    let frameTwitch: Sampled
    let frameWave: Sampled
    let frameShy: Sampled
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
      twitchDuration,
      (t) => sampleTrack(units.twitch, TWITCH_FIELDS, t),
      REST_TWITCH,
    )
    ;[waveTime, frameWave] = advance(
      waveTime,
      delta,
      waveDuration,
      (t) => sampleTrack(units.wave, WAVE_FIELDS, t),
      REST_WAVE,
    )
    ;[shyTime, frameShy] = advance(
      shyTime,
      delta,
      shyDuration,
      (t) => sampleTrack(units.shy, SHY_FIELDS, t),
      REST_SHY,
    )

    const settled =
      hopTime === null &&
      danceTime === null &&
      twitchTime === null &&
      waveTime === null &&
      shyTime === null

    // ── 호흡 (다른 동작 중에는 거의 죽인다) ──
    const breathAmount = settled ? 1 : 0.2
    const breath = Math.sin(elapsed * 2.1) * 0.022 * breathAmount

    // ── 위치와 부피 (여러 동작이 곱해지고 더해진다) ──
    const x = frameDance.x * swayWidth + frameShy.sway * shySwayWidth
    const y = frameHop.y * hopHeight + frameDance.y * bobHeight
    const wide = frameHop.sx * frameDance.sx * frameTwitch.sx * (1 - breath * 0.5)

    root.position.set(x, y, 0)
    root.scale.set(wide, frameHop.sy * frameDance.sy * frameTwitch.sy * (1 + breath), wide)

    // ── 몸통 ──
    const tilt = frameDance.tilt + frameTwitch.tilt + frameWave.tilt + frameShy.tilt
    parts.body.rotation.z = Math.sin(elapsed * 1.05) * 0.018 * breathAmount + tilt

    // ── 볼 (수줍을 때만 붉어지고, 그 위에서 빗금이 밝아진다) ──
    for (const blush of blushes) blush.opacity = frameShy.blush * BLUSH_PEAK
    if (cheekMaterial && cheekRest && cheekLit) {
      cheekMaterial.color.copy(cheekRest).lerp(cheekLit, frameShy.blush)
    }

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

    /*
     * ── 팔 ──
     *
     * 춤은 두 팔이 함께, 손 흔들기는 왼팔만, 수줍음은 두 팔이 대칭으로 움직인다.
     * 겹쳐서 재생되는 일이 없으므로 그냥 더해 두면 서로를 지우지 않는다.
     *
     * 각도만으로는 짧은 팔이 몸통 옆면에 묻히므로 어깨를 밀어 실루엣 밖으로 뺀다.
     * 수줍음은 거기에 더해 **앞으로** 밀고 가운데로 조금 모은다 — 그래야 팔이 얼굴
     * 옆이 아니라 볼 앞을 지난다.
     */
    if (parts.armL && armBase.L) {
      parts.armL.rotation.z =
        frameDance.spread + frameDance.arm + frameWave.armOne + frameShy.armIn
      parts.armL.position.x =
        armBase.L.x + frameWave.shoulder * shoulderReach - frameShy.shoulder * shoulderTuck
      parts.armL.position.y =
        armBase.L.y + (frameWave.shoulder + frameShy.shoulder) * shoulderLift
      parts.armL.position.z = armBase.L.z + frameShy.shoulder * shoulderForward
    }
    if (parts.armR && armBase.R) {
      parts.armR.rotation.z = -frameDance.spread + frameDance.arm - frameShy.armIn
      parts.armR.position.x = armBase.R.x + frameShy.shoulder * shoulderTuck
      parts.armR.position.y = armBase.R.y + frameShy.shoulder * shoulderLift
      parts.armR.position.z = armBase.R.z + frameShy.shoulder * shoulderForward
    }

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
    ] as const) {
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
    wave,
    shy,
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
    get isWaving() {
      return waveTime !== null
    },
    get isShying() {
      return shyTime !== null
    },
    get danceDuration() {
      return danceTimeline.duration
    },

    // ── 아래 넷은 미리보기의 키프레임 편집기만 쓴다 ──
    setTrack,
    scrub,
    stop,
    /** 이어 붙인 뒤의 길이. 편집기의 스크럽 바가 이 값을 눈금으로 쓴다. */
    get durations(): Record<TrackName, number> {
      return {
        hop: hopTimeline.duration,
        dance: danceTimeline.duration,
        twitch: twitchDuration,
        wave: waveDuration,
        shy: shyDuration,
      }
    },
  }
}
