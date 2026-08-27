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
 *   doze   — 이 방을 잠재웠을 때. 웅크린 자세까지 갔다가 **거기서 멈춰 있는다.**
 *   wake   — 깨웠을 때. 웅크린 자세에서 기지개를 켜며 중립으로 돌아온다.
 *
 * **앞의 것들과 doze 는 성질이 다르다.** 다른 트랙은 한 번 재생하고 원래 자세로
 * 돌아오지만, doze 는 마지막 키가 중립이 아니고 그 자세가 유지된다 — 자는 것은
 * 동작이 아니라 상태이기 때문이다.
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
 * 수줍음(1.7초) — 두 팔이 배 앞으로 모이고 몸이 살랑인다.
 *
 *   armIn    두 팔이 **안쪽·아래로** 도는 각도 (라디안). 손 흔들기의 `armOne` 과 자리는
 *            같지만 뜻이 달라 따로 둔다 — 저쪽은 바깥으로 뻗어 흔들고 이쪽은 손끝이
 *            배 앞으로 모인다 (`\ /`)
 *   shoulder 두 어깨를 옮기는 양. 위로 들면서 **앞으로 밀고** 가운데로 조금 모은다
 *   sway     몸통이 좌우로 살랑이는 폭 (춤의 절반이 안 되게 쓴다)
 *   tilt     살랑이는 쪽으로 몸이 기운다
 *   blush    볼이 붉어지는 정도 (0~1)
 *
 * **한 팔이 아니라 두 팔이다.** 한쪽만 올려 봤더니 손 흔들기의 어중간한 변주로 읽혔다.
 * 볼을 감싸려는 몸짓은 좌우가 대칭이어야 그 뜻이 되고, 거기에 몸통이 살랑이고 볼이
 * 붉어져야 비로소 그 감정이 된다.
 *
 * **손은 실제로 맞잡히지 않는다.** 관절이 없어서 잡는 대신 배 앞에서 만나는 데서
 * 멈춘다. 거기까지가 이 리그로 되는 것이고, 리그를 고쳐서까지 맞추지는 않는다.
 *
 * 팔을 얼굴까지 들어 볼 앞을 가리는 안도 만들어 나란히 재생해 보고 이쪽으로 정했다.
 * 들어 올린 팔은 붉어진 볼을 가려서, 정작 수줍음을 말해 주는 것이 동작 내내 반쯤
 * 가려져 있었다.
 *
 * 길이는 콕(1.7초)과 같다. 신호끼리 무게가 같아야 한다.
 */
export const SHY_UNIT: Keyframe[] = [
  { t: 0.0, armIn: 0.0, shoulder: 0.0, sway: 0.0, tilt: 0.0, blush: 0.0, ease: 'easeOutQuad' },
  { t: 0.22, armIn: 0.32, shoulder: 0.45, sway: -0.16, tilt: 0.04, blush: 0.3, ease: 'easeOutQuad' }, // 팔이 모이기 시작
  { t: 0.44, armIn: 0.78, shoulder: 0.95, sway: 0.3, tilt: -0.07, blush: 0.62, ease: 'easeOutBack' }, // 두 손이 배 앞에서 만났다
  { t: 0.72, armIn: 0.84, shoulder: 1.0, sway: -0.32, tilt: 0.08, blush: 0.88, ease: 'easeInOutQuad' }, // ── 살랑살랑 ──
  { t: 1.0, armIn: 0.8, shoulder: 0.96, sway: 0.31, tilt: -0.08, blush: 1.0, ease: 'easeInOutQuad' },
  { t: 1.28, armIn: 0.84, shoulder: 1.0, sway: -0.24, tilt: 0.06, blush: 0.94, ease: 'easeInOutQuad' },
  { t: 1.5, armIn: 0.34, shoulder: 0.45, sway: 0.08, tilt: -0.02, blush: 0.52, ease: 'easeInQuad' }, // 푼다
  { t: 1.7, armIn: 0.0, shoulder: 0.0, sway: 0.0, tilt: 0.0, blush: 0.0, ease: 'easeOutQuad' },
]

/**
 * 앙탈(1.7초) — 털썩 주저앉아 두 팔을 번갈아 휘젓는다.
 *
 *   sit    몸이 내려앉는 정도 (0~1). 발은 바닥에 그대로 두고 몸통만 내린다
 *   feet   발이 앞으로 나가는 정도 (0~1). 앞으로 뻗은 다리의 실루엣을 만든다
 *   armAlt 두 팔이 번갈아 젓는 각도 (라디안). 부호가 뒤집힐 때마다 한 번이다
 *   legAlt 앉은 두 발이 번갈아 차올라가는 정도 (-1~1). 팔과 **반대 박자**로 움직인다
 *   tilt   젓는 쪽으로 몸이 살짝 기운다
 *   sx·sy  닿는 순간의 찌부러짐. 다른 트랙의 것과 곱해진다
 *   squint 눈을 꽉 감는 정도 (0~1). 눈알이 줄어들면서 `> <` 가 커진다
 *
 * **털썩 앉는 것이 이 동작의 무게를 만든다.** 스르륵 미끄러지듯 앉으면 앙탈이 아니라
 * 늘어짐이 된다. 그래서 앉기 직전에 아주 잠깐 웅크렸다가(예비동작) 한 번에 떨어지고,
 * 닿는 순간 한 번 찌부러졌다 돌아온다.
 *
 * **다리는 여전히 발뿐이다.** 앞으로 뻗은 다리는 발을 앞으로 옮기고 몸을 낮춰 만드는
 * 실루엣이지 관절을 더하는 것이 아니다.
 *
 * 소품은 없다. 콕에는 음표, 폴짝에는 먼지, 손 흔들기에는 짝대기, 하트에는 말풍선이
 * 붙지만 **앙탈은 몸짓만으로 말한다.**
 */
export const SULK_UNIT: Keyframe[] = [
  { t: 0.0, sit: 0.0, feet: 0.0, armAlt: 0.0, legAlt: 0.0, tilt: 0.0, sx: 1.0, sy: 1.0, squint: 0.0, ease: 'easeOutQuad' },
  { t: 0.1, sit: 0.16, feet: 0.08, armAlt: 0.0, legAlt: 0.0, tilt: 0.0, sx: 1.02, sy: 0.97, squint: 0.4, ease: 'easeOutQuad' }, // 웅크리며 눈을 감기 시작
  { t: 0.24, sit: 1.0, feet: 0.82, armAlt: 0.0, legAlt: 0.0, tilt: 0.0, sx: 1.13, sy: 0.87, squint: 1.0, ease: 'easeInQuad' }, // 털썩 — 이때 눈이 꽉 감긴다
  { t: 0.33, sit: 0.95, feet: 1.0, armAlt: 1.0, legAlt: -0.78, tilt: 0.06, sx: 0.97, sy: 1.05, squint: 1.0, ease: 'easeOutQuad' }, // 튕겨 오른다
  { t: 0.46, sit: 1.0, feet: 1.0, armAlt: -1.28, legAlt: 1.0, tilt: -0.06, sx: 1.01, sy: 0.99, squint: 1.0, ease: 'easeInOutQuad' }, // ── 휘젓기 넷 ──
  { t: 0.6, sit: 1.0, feet: 1.0, armAlt: 1.28, legAlt: -1.0, tilt: 0.06, sx: 1.0, sy: 1.0, squint: 1.0, ease: 'easeInOutQuad' },
  { t: 0.74, sit: 1.0, feet: 1.0, armAlt: -1.28, legAlt: 1.0, tilt: -0.06, sx: 1.0, sy: 1.0, squint: 1.0, ease: 'easeInOutQuad' },
  { t: 0.88, sit: 1.0, feet: 1.0, armAlt: 1.28, legAlt: -1.0, tilt: 0.06, sx: 1.0, sy: 1.0, squint: 1.0, ease: 'easeInOutQuad' },
  { t: 1.02, sit: 1.0, feet: 1.0, armAlt: 0.0, legAlt: 0.0, tilt: 0.0, sx: 1.0, sy: 1.0, squint: 1.0, ease: 'easeOutQuad' }, // 멈춘다
  { t: 1.3, sit: 1.0, feet: 1.0, armAlt: 0.0, legAlt: 0.0, tilt: 0.0, sx: 1.0, sy: 1.0, squint: 1.0, ease: 'easeInOutQuad' }, // 잠깐 그대로
  { t: 1.7, sit: 0.0, feet: 0.0, armAlt: 0.0, legAlt: 0.0, tilt: 0.0, sx: 1.0, sy: 1.0, squint: 0.0, ease: 'easeInOutQuad' }, // 스르르 일어나며 눈을 뜬다
]

/**
 * 잠들기(1.1초) — 스르르 웅크려 공처럼 앉는다.
 *
 *   curl  몸이 내려앉아 둥글어지는 정도 (0~1)
 *   duck  고개를 묻는 정도 (0~1). 기지개에서는 음수가 되어 고개를 젖힌다
 *   ears  귀를 눕히는 정도 (0~1). 기지개에서는 음수가 되어 쫑긋 선다
 *   shut  눈이 감기는 정도 (0~1). 깜빡임과 같은 자리를 쓴다
 *   reach 두 팔을 위로 뻗는 정도 (0~1). 기지개에만 쓰인다
 *   sx·sy 부피. 웅크리면 옆으로 퍼지고 기지개에서는 위로 늘어난다
 *
 * **마지막 키가 중립이 아니다.** 다른 트랙은 전부 시작과 끝이 같은 자세라 몇 번을
 * 이어 붙여도 이음매가 없는데, 이것은 웅크린 자세에서 **멈춰 그대로 있는다.** 자는
 * 것은 한 번 하고 마는 동작이 아니라 깨울 때까지 이어지는 상태라서다.
 *
 * **고개가 먼저 내려온다.** 몸과 고개가 같이 내려가면 통째로 가라앉는 것처럼 보여서
 * 졸음이 아니라 힘이 빠진 것으로 읽힌다. 고개와 귀가 먼저 처지고 몸이 뒤따라야
 * "잠이 온다" 가 된다.
 *
 * 소품은 없다. 기획서가 잠재우기를 **그리는 양이 가장 적은 상태**로 정해 두었고,
 * `zzz` 같은 것을 띄우면 그 자체가 매 프레임 도는 일이 된다.
 */
export const DOZE_UNIT: Keyframe[] = [
  { t: 0.0, curl: 0.0, duck: 0.0, ears: 0.0, shut: 0.0, reach: 0.0, sx: 1.0, sy: 1.0, ease: 'easeInOutQuad' },
  { t: 0.26, curl: 0.18, duck: 0.24, ears: 0.38, shut: 0.45, reach: 0.0, sx: 1.0, sy: 1.01, ease: 'easeInOutQuad' }, // 고개와 귀가 먼저 처진다
  { t: 0.62, curl: 0.72, duck: 0.74, ears: 0.84, shut: 0.9, reach: 0.0, sx: 1.05, sy: 0.95, ease: 'easeInOutQuad' }, // 몸이 뒤따라 내려앉는다
  { t: 0.88, curl: 1.0, duck: 1.0, ears: 1.0, shut: 1.0, reach: 0.0, sx: 1.15, sy: 0.85, ease: 'easeOutQuad' }, // 다 웅크렸다 — 조금 지나쳐서
  { t: 1.1, curl: 1.0, duck: 1.0, ears: 1.0, shut: 1.0, reach: 0.0, sx: 1.12, sy: 0.88, ease: 'easeInOutQuad' }, // 자리를 잡는다. **여기서 멈춘다**
]

/**
 * 깨어나기(1.25초) — 웅크린 자세에서 기지개를 켜며 일어난다.
 *
 * 필드는 `DOZE_UNIT` 과 같다. 한 벌의 코드로 부위에 바르기 위해서다.
 *
 * **첫 키가 웅크린 자세다.** 잠들기의 마지막 키와 같은 값이라야 깨우는 순간 자세가
 * 튀지 않는다. 잠들기를 다듬을 때는 이쪽 첫 키도 함께 옮겨야 한다.
 *
 * **기지개가 이 동작의 전부다.** 그냥 되감아 펴면 일어난 것이 아니라 되돌린 것으로
 * 보인다. 몸이 중립보다 위로 한 번 늘어나고, 두 팔이 올라가고, 고개가 젖혀지고,
 * 귀가 쫑긋 서야 비로소 "깼다" 가 된다. 그 정점에서 눈을 다시 조금 찡그리는 것도
 * 같은 이유다 — 기지개를 켤 때 눈을 뜨고 있는 사람은 없다.
 */
export const WAKE_UNIT: Keyframe[] = [
  { t: 0.0, curl: 1.0, duck: 1.0, ears: 1.0, shut: 1.0, reach: 0.0, sx: 1.12, sy: 0.88, ease: 'easeInOutQuad' },
  { t: 0.2, curl: 0.94, duck: 0.86, ears: 0.7, shut: 0.72, reach: 0.08, sx: 1.13, sy: 0.87, ease: 'easeInOutQuad' }, // 꿈틀 — 귀가 먼저 산다
  { t: 0.52, curl: 0.24, duck: 0.08, ears: 0.1, shut: 0.3, reach: 0.78, sx: 0.95, sy: 1.09, ease: 'easeOutQuad' }, // 몸을 펴며 팔을 올린다
  { t: 0.74, curl: 0.0, duck: -0.22, ears: -0.28, shut: 0.46, reach: 1.0, sx: 0.89, sy: 1.2, ease: 'easeOutQuad' }, // ── 기지개 정점 ──
  { t: 1.0, curl: 0.0, duck: 0.0, ears: 0.0, shut: 0.06, reach: 0.3, sx: 1.05, sy: 0.96, ease: 'easeInOutQuad' }, // 풀며 살짝 눌린다
  { t: 1.25, curl: 0.0, duck: 0.0, ears: 0.0, shut: 0.0, reach: 0.0, sx: 1.0, sy: 1.0, ease: 'easeOutQuad' },
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
const SULK_FIELDS = ['sit', 'feet', 'armAlt', 'legAlt', 'tilt', 'sx', 'sy', 'squint']
/** 잠들기와 깨어나기는 필드가 같다 — 한 벌의 코드로 부위에 바르기 위해서다 */
const SLEEP_FIELDS = ['curl', 'duck', 'ears', 'shut', 'reach', 'sx', 'sy']

/** 갈아끼울 수 있는 트랙 이름 */
export type TrackName = 'hop' | 'dance' | 'twitch' | 'wave' | 'shy' | 'sulk' | 'doze' | 'wake'

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
  sulk: SULK_FIELDS,
  doze: SLEEP_FIELDS,
  wake: SLEEP_FIELDS,
}

export const TRACK_UNITS: Record<TrackName, Keyframe[]> = {
  hop: HOP_UNIT,
  dance: DANCE_UNIT,
  twitch: TWITCH_UNIT,
  wave: WAVE_UNIT,
  shy: SHY_UNIT,
  sulk: SULK_UNIT,
  doze: DOZE_UNIT,
  wake: WAKE_UNIT,
}

/** 유닛 트랙의 길이 — 마지막 키의 시각이 곧 그 동작의 길이다. */
export const trackDuration = (keys: Keyframe[]): number => keys[keys.length - 1].t

const TWITCH_DURATION = trackDuration(TWITCH_UNIT)
const WAVE_DURATION = trackDuration(WAVE_UNIT)
const SHY_DURATION = trackDuration(SHY_UNIT)
const SULK_DURATION = trackDuration(SULK_UNIT)
const DOZE_DURATION = trackDuration(DOZE_UNIT)
const WAKE_DURATION = trackDuration(WAKE_UNIT)
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
/** 앙탈로 주저앉을 때 몸통이 내려가는 깊이 (캐릭터 키 기준 비율) */
const SIT_DROP = 0.17
/**
 * 그때 발이 앞으로 나가는 거리 — **몸통 깊이에 대한 비율이다.**
 *
 * 팔을 앞으로 밀 때와 같은 이유다(`SHOULDER_FORWARD`). 넘어야 하는 것은 키가 아니라
 * 배의 두께라, 키를 기준으로 잡으면 몸통이 깊은 종에서 발이 배 밑에 그대로 남는다.
 */
const FEET_FORWARD = 0.62
/**
 * 팔을 휘저을 때 앞으로 나오는 거리 — 이것도 몸통 깊이 기준이다.
 *
 * 각도만 주면 짧은 팔이 몸통 옆면을 따라 오르내려 실루엣 안에 묻힌다. 손 흔들기가
 * 어깨를 바깥으로 밀어 푼 것과 같은 문제이고, 여기서는 앞으로 밀어 푼다.
 */
const FLAIL_FORWARD = 0.5
/** 앉은 채로 발을 차올리는 높이 (캐릭터 키 기준 비율) */
const KICK_LIFT = 0.13
const SHOULDER_REACH = 0.075 // 손 흔들 때 어깨가 바깥으로 나가는 거리
const SHOULDER_LIFT = 0.055 // 그때 어깨가 올라가는 높이
/**
 * 수줍을 때 두 팔이 **앞으로** 밀려 나가는 거리 — **몸통 깊이에 대한 비율이다.**
 *
 * 각도만으로는 팔이 몸통 옆면을 벗어나지 못한다. 팔은 어깨를 축으로 몸통과 같은
 * 평면에서만 도니까, 앞으로 밀어 주는 수밖에 없다.
 *
 * **키가 아니라 몸통 깊이를 기준으로 잡는다.** 처음에는 키의 몇 배로 두었는데, 그러면
 * 몸통이 깊은 종(코지 판다·크레이지 독)에서 팔이 배 속에 파묻혀 반쯤만 보였다. 넘어야
 * 하는 것은 키가 아니라 배의 두께다.
 */
const SHOULDER_FORWARD = 0.85
/** 그때 두 어깨가 가운데로 조금 모인다. 팔이 벌어진 채 올라가면 만세가 된다. */
const SHOULDER_TUCK = 0.028

/**
 * 웅크릴 때 몸통이 내려가는 깊이 (캐릭터 키 기준 비율).
 *
 * 앙탈로 주저앉는 것(`SIT_DROP`)보다 얕다. 저쪽은 발을 앞으로 뻗어 **앉은** 자세라
 * 몸이 그만큼 더 내려가야 하는데, 이쪽은 발을 안으로 말아 넣고 **웅크리는** 자세라
 * 같은 깊이로 내리면 몸통이 발을 삼켜 버린다.
 */
const CURL_DROP = 0.15
/**
 * 그때 발이 앞으로 나가는 거리 — **몸통 깊이 기준이다.**
 *
 * 앙탈의 `FEET_FORWARD` 와 같은 값이고, 같은 이유로 키가 아니라 배의 두께를 기준으로
 * 잡는다 — 넘어야 하는 것은 키가 아니라 배의 두께라서, 키를 기준으로 잡으면 몸통이
 * 깊은 종에서 발이 배 밑에 그대로 남는다.
 *
 * 처음에는 이보다 훨씬 짧게(0.22) 두었다. 웅크리는 것은 발을 몸 밑으로 접어 넣는
 * 일이라고 봤기 때문인데, 그렇게 하면 **내려앉은 몸통이 발을 통째로 삼킨다.** 발이
 * 한 짝도 안 보이면 웅크린 것이 아니라 몸통만 남은 덩어리가 된다. 앙탈이 앞으로 뻗어
 * 푼 것과 같은 문제이고, 같은 거리로 풀었다.
 */
const CURL_TUCK = 0.62
/**
 * 고개를 숙이는 각도(라디안).
 *
 * **더 숙이면 얼굴이 사라진다.** 0.62 로 두어 봤더니 정수리만 보이고 감은 눈이 턱
 * 아래로 넘어가, 자는 것이 아니라 고장 난 것처럼 보였다. 고개를 **묻는** 일은 각도가
 * 아니라 아래 `HEAD_SINK` 가 맡는다.
 */
const HEAD_TUCK = 0.34
/**
 * 그때 머리가 몸통 쪽으로 가라앉는 깊이 (캐릭터 키 기준 비율).
 *
 * **이것이 웅크린 실루엣을 만든다.** 이 캐릭터들은 머리와 몸통이 비슷한 크기의 공
 * 둘이라, 가라앉히지 않으면 아무리 숙여도 몸통 위에 머리를 얹은 모양 그대로다.
 * 겹쳐야 비로소 덩어리 하나가 된다.
 */
const HEAD_SINK = 0.1
/**
 * 귀를 뒤로 눕히는 각도(라디안). 귀가 서 있으면 자는 것으로 안 보인다.
 *
 * 고개를 숙인 만큼은 아래에서 따로 되돌리므로, 이 값은 **화면에서 실제로 눕는
 * 각도**다 (약 45도).
 */
const EAR_FOLD = 0.8
/**
 * 그때 귀가 바깥으로 벌어지는 각도(라디안).
 *
 * **뒤로만 눕히면 정면에서 안 읽힌다.** 카메라가 거의 정면이라 뒤로 넘어간 귀는
 * 각도가 아니라 길이가 짧아진 것으로만 보인다. 저스트 버니의 긴 귀에서 특히 그랬다 —
 * 45도나 눕혔는데 화면에서는 여전히 쫑긋 서 있었다. 옆으로 함께 벌려야 "귀를
 * 낮췄다" 가 정면에서도 보인다.
 */
const EAR_SPLAY = 0.4
/**
 * 기지개를 켤 때 두 팔이 올라가는 각도(라디안).
 *
 * 손 흔들기의 정점(2.72)과 비슷하게 둔다. 팔이 짧고 뭉툭해서 각도를 아끼면 화면에서
 * 그냥 옆으로 벌린 것으로 보인다 — 2.35 로 두어 봤더니 딱 그랬다.
 */
const ARM_REACH = 2.8
/** 웅크릴 때 두 팔이 몸쪽으로 조금 접힌다. 팔이 늘어져 있으면 자는 게 아니라 쓰러진 것이다 */
const ARM_TUCK = 0.3
/**
 * 잘 때 가만히 있는 것들이 느려지는 비율.
 *
 * **주기를 바꾸는 것이 아니라 시계를 늦춘다.** 호흡·몸 흔들림·꼬리는 전부 흐른 시간에
 * 대한 사인파라, `sin(elapsed * 느린주기)` 로 바꾸면 주기가 달라지는 순간 위상이
 * 통째로 건너뛰어 캐릭터가 움찔한다. 대신 `elapsed` 자체를 천천히 흐르게 하면 위상이
 * 이어지고, 가만히 있는 것들이 **한꺼번에 같은 비율로** 느려진다.
 */
const SLEEP_TIME_SCALE = 0.42
/** 잘 때 숨이 더 깊어지는 정도. 느려지기만 하면 숨을 쉬는지 알 수 없다 */
const SLEEP_BREATH_DEPTH = 0.6
/** 잘 때 꼬리가 잦아드는 정도 (1이면 완전히 멈춘다) */
const SLEEP_TAIL_STILL = 0.85

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

/** 앙탈을 시각 t에서 샘플링한다. → { sit, feet, armAlt, tilt, sx, sy } */
export function sampleSulk(t: number): Sampled {
  return sampleTrack(SULK_UNIT, SULK_FIELDS, t)
}

/** 잠들기를 시각 t에서 샘플링한다. → { curl, duck, ears, shut, reach, sx, sy } */
export function sampleDoze(t: number): Sampled {
  return sampleTrack(DOZE_UNIT, SLEEP_FIELDS, t)
}

/** 깨어나기를 시각 t에서 샘플링한다. 필드는 잠들기와 같다. */
export function sampleWake(t: number): Sampled {
  return sampleTrack(WAKE_UNIT, SLEEP_FIELDS, t)
}

export {
  TWITCH_DURATION,
  WAVE_DURATION,
  SHY_DURATION,
  SULK_DURATION,
  DOZE_DURATION,
  WAKE_DURATION,
  DANCE_CYCLE,
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

/** 아무 동작도 없을 때의 기본값 */
const REST_HOP: Sampled = { y: 0, sx: 1, sy: 1 }
const REST_DANCE: Sampled = { x: 0, y: 0, tilt: 0, arm: 0, spread: 0, step: 0, sx: 1, sy: 1 }
const REST_TWITCH: Sampled = { sx: 1, sy: 1, tilt: 0 }
const REST_WAVE: Sampled = { armOne: 0, shoulder: 0, tilt: 0 }
const REST_SHY: Sampled = { armIn: 0, shoulder: 0, sway: 0, tilt: 0, blush: 0 }
/** 자지도 깨지도 않은 상태 — 서 있는 자세 */
const REST_SLEEP: Sampled = { curl: 0, duck: 0, ears: 0, shut: 0, reach: 0, sx: 1, sy: 1 }
const REST_SULK: Sampled = {
  sit: 0,
  feet: 0,
  armAlt: 0,
  legAlt: 0,
  tilt: 0,
  sx: 1,
  sy: 1,
  squint: 0,
}

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
  /*
   * 유닛 하나의 길이. 폴짝과 춤은 유닛을 여러 번 이어 붙여 쓰므로 여기 값이 아니라
   * 위 타임라인의 길이를 본다 (`durationOf`).
   *
   * 트랙마다 `let` 을 하나씩 두던 것을 표 하나로 모았다. 트랙이 여덟이 되면서
   * "이름 → 길이" 를 고르는 삼항 사슬이 읽을 수 없게 길어졌기 때문이다.
   */
  const unitDuration = Object.fromEntries(
    (Object.keys(units) as TrackName[]).map((name) => [name, trackDuration(units[name])]),
  ) as Record<TrackName, number>
  const wags = spec.build.tail.type === TAIL.WAG

  const hopHeight = height * HOP_RATIO
  const swayWidth = height * DANCE_SWAY
  const shySwayWidth = height * SHY_SWAY
  const bobHeight = height * DANCE_BOB
  const stepLift = height * STEP_LIFT
  const sitDrop = height * SIT_DROP
  const curlDrop = height * CURL_DROP
  const headSink = height * HEAD_SINK

  // 고개를 묻을 때 머리를 몸통 쪽으로 가라앉혀야 해서 원래 높이를 기억해 둔다
  const headBaseY = parts.head.position.y

  // 다리는 원래 자리에서 위로만 살짝 들 것이므로 기준 높이를 기억해 둔다
  const legBaseY = parts.legL ? parts.legL.position.y : 0
  // 주저앉을 때는 앞으로도 내보내야 해서 기준 깊이도 함께 들고 있는다
  const legBaseZ = parts.legL ? parts.legL.position.z : 0
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
  // 몸통은 반지름에 x·y·z 스케일을 곱한 타원체다. 앞으로 얼마나 나와야 배를 벗어나는지는
  // 그 z 쪽 반지름이 정한다.
  const bodyDepth = spec.build.bodyRadius * spec.build.bodyShape[2]
  const shoulderForward = bodyDepth * SHOULDER_FORWARD
  const feetForward = bodyDepth * FEET_FORWARD
  const flailForward = bodyDepth * FLAIL_FORWARD
  const kickLift = height * KICK_LIFT
  const curlTuck = bodyDepth * CURL_TUCK
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
  let sulkTime: number | null = null
  /**
   * 자는 상태인가. 아래 `dozeTime` 과 짝이다.
   *
   * 이것이 참인 동안 `dozeTime` 은 길이에서 멈춰 **계속 그 자세를 샘플링한다.**
   * 다른 트랙처럼 끝나면 null 로 꺼 버리면 자세가 풀려 캐릭터가 벌떡 일어난다.
   */
  let sleeping = false
  let dozeTime: number | null = null
  let wakeTime: number | null = null
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

  /** 두 팔을 배 앞으로 모으고 몸을 살랑이며 볼을 붉힌다. '하트' 신호의 반응. */
  function shy() {
    shyTime = 0
  }

  /** 털썩 주저앉아 팔을 휘젓는다. '앙탈' 신호의 반응. */
  function sulk() {
    sulkTime = 0
  }

  /**
   * 스르르 웅크려 잔다. 깨울 때까지 그 자세로 있는다.
   *
   * @param instant 웅크리는 과정을 건너뛰고 처음부터 자고 있는 것으로 둔다.
   *   앱을 켰을 때와 캐릭터를 갈아 끼웠을 때 쓴다 — 그때마다 스르르 웅크리면 방금
   *   누가 재운 것으로 읽히는데, 사실은 어제 재워 둔 방이다.
   */
  function doze({ instant = false }: { instant?: boolean } = {}) {
    sleeping = true
    wakeTime = null
    dozeTime = instant ? unitDuration.doze : 0
  }

  /**
   * 기지개를 켜며 일어난다.
   *
   * 자고 있지 않을 때 불러도 기지개는 재생된다. 미리보기의 편집기가 이 동작만 따로
   * 돌려 볼 수 있어야 하기 때문이고, 앱 쪽은 재워 둔 방을 깨울 때만 부른다.
   */
  function wake() {
    sleeping = false
    dozeTime = null
    wakeTime = 0
  }

  const durationOf = (name: TrackName): number =>
    name === 'hop'
      ? hopTimeline.duration
      : name === 'dance'
        ? danceTimeline.duration
        : unitDuration[name]

  /**
   * 유닛 트랙을 갈아끼운다. 미리보기의 키프레임 편집기만 부른다.
   *
   * 폴짝과 춤은 유닛을 여러 번 이어 붙여 쓰므로(3번·2바퀴) 타임라인을 다시 만든다.
   */
  function setTrack(name: TrackName, keys: Keyframe[]) {
    units[name] = keys
    unitDuration[name] = trackDuration(keys)
    if (name === 'hop') hopTimeline = buildHopTimeline(hops, keys)
    else if (name === 'dance') danceTimeline = buildDanceTimeline(cycles, keys)
  }

  /** 재생 중인 것을 전부 끄고 기본 자세로 돌아간다. 자던 중이면 깨어난 채로 선다. */
  function stop() {
    hopTime = danceTime = twitchTime = waveTime = shyTime = sulkTime = null
    sleeping = false
    dozeTime = wakeTime = null
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
    else if (name === 'shy') shyTime = at
    else if (name === 'sulk') sulkTime = at
    else if (name === 'doze') {
      sleeping = true
      dozeTime = at
    } else wakeTime = at
    update(0)
  }

  function update(delta: number) {
    let frameHop: Sampled
    let frameDance: Sampled
    let frameTwitch: Sampled
    let frameWave: Sampled
    let frameShy: Sampled
    let frameSulk: Sampled
    let frameWake: Sampled
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
      unitDuration.twitch,
      (t) => sampleTrack(units.twitch, TWITCH_FIELDS, t),
      REST_TWITCH,
    )
    ;[waveTime, frameWave] = advance(
      waveTime,
      delta,
      unitDuration.wave,
      (t) => sampleTrack(units.wave, WAVE_FIELDS, t),
      REST_WAVE,
    )
    ;[shyTime, frameShy] = advance(
      shyTime,
      delta,
      unitDuration.shy,
      (t) => sampleTrack(units.shy, SHY_FIELDS, t),
      REST_SHY,
    )
    ;[sulkTime, frameSulk] = advance(
      sulkTime,
      delta,
      unitDuration.sulk,
      (t) => sampleTrack(units.sulk, SULK_FIELDS, t),
      REST_SULK,
    )
    ;[wakeTime, frameWake] = advance(
      wakeTime,
      delta,
      unitDuration.wake,
      (t) => sampleTrack(units.wake, SLEEP_FIELDS, t),
      REST_SLEEP,
    )

    /*
     * 잠들기만 `advance` 를 쓰지 않는다.
     *
     * 저쪽은 길이에 닿으면 타이머를 끄고 기본 자세를 돌려주는데, 그러면 다 웅크린
     * 순간 캐릭터가 벌떡 일어난다. 여기서는 시각을 길이에서 **멈춰 두고** 그 자리를
     * 계속 샘플링해 자세를 유지한다.
     */
    if (sleeping && dozeTime !== null) {
      dozeTime = Math.min(dozeTime + delta, unitDuration.doze)
    }
    const frameSleep =
      sleeping && dozeTime !== null
        ? sampleTrack(units.doze, SLEEP_FIELDS, dozeTime)
        : frameWake

    /*
     * 잘 때는 시계가 천천히 흐른다.
     *
     * 가만히 있을 때의 것들(호흡·몸 흔들림·귀·꼬리)이 전부 `elapsed` 에 대한 사인파라,
     * 시계 하나만 늦추면 **한꺼번에 같은 비율로** 느려지면서 위상도 이어진다.
     * 주기를 바꿔 끼우면 그 순간 위상이 건너뛰어 캐릭터가 움찔한다.
     */
    elapsed += delta * (1 - frameSleep.curl * (1 - SLEEP_TIME_SCALE))

    const settled =
      hopTime === null &&
      danceTime === null &&
      twitchTime === null &&
      waveTime === null &&
      shyTime === null &&
      sulkTime === null &&
      wakeTime === null &&
      // 다 웅크리고 잠든 뒤는 "가만히 있는" 쪽이다 — 그래야 느린 숨쉬기가 온전히 산다
      (!sleeping || dozeTime === unitDuration.doze)

    // ── 호흡 (다른 동작 중에는 거의 죽인다) ──
    const breathAmount = settled ? 1 : 0.2
    // 잘 때는 시계가 느려진 만큼 숨이 얕아 보여서, 대신 깊이를 조금 키운다
    const breath =
      Math.sin(elapsed * 2.1) *
      0.022 *
      breathAmount *
      (1 + frameSleep.curl * SLEEP_BREATH_DEPTH)

    // ── 위치와 부피 (여러 동작이 곱해지고 더해진다) ──
    const x = frameDance.x * swayWidth + frameShy.sway * shySwayWidth
    const y =
      frameHop.y * hopHeight +
      frameDance.y * bobHeight -
      frameSulk.sit * sitDrop -
      frameSleep.curl * curlDrop
    const wide =
      frameHop.sx *
      frameDance.sx *
      frameTwitch.sx *
      frameSulk.sx *
      frameSleep.sx *
      (1 - breath * 0.5)

    root.position.set(x, y, 0)
    root.scale.set(
      wide,
      frameHop.sy * frameDance.sy * frameTwitch.sy * frameSulk.sy * frameSleep.sy * (1 + breath),
      wide,
    )

    // ── 몸통 ──
    const tilt =
      frameDance.tilt + frameTwitch.tilt + frameWave.tilt + frameShy.tilt + frameSulk.tilt
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
      Math.sin(elapsed * 2.1 + 0.5) * 0.026 * breathAmount -
      headLag.value * 0.16 +
      frameSleep.duck * HEAD_TUCK
    parts.head.rotation.z = -tilt * 0.45
    // 숙이기만 하면 고개만 까딱한 것으로 보인다. 머리가 몸통 쪽으로 가라앉아야 묻힌다.
    parts.head.position.y = headBaseY - frameSleep.duck * headSink

    /*
     * ── 팔 ──
     *
     * 춤은 두 팔이 함께, 손 흔들기는 왼팔만, 수줍음은 두 팔이 대칭으로 움직인다.
     * 겹쳐서 재생되는 일이 없으므로 그냥 더해 두면 서로를 지우지 않는다.
     *
     * 각도만으로는 짧은 팔이 몸통 옆면에 묻히므로 어깨를 밀어 실루엣 밖으로 뺀다.
     * 수줍음은 거기에 더해 **앞으로** 밀고 가운데로 조금 모은다 — 그래야 팔이 몸통
     * 옆면에 묻히지 않고 배 앞으로 나온다.
     */
    if (parts.armL && armBase.L) {
      parts.armL.rotation.z =
        frameDance.spread +
        frameDance.arm +
        frameWave.armOne -
        frameShy.armIn +
        frameSulk.armAlt +
        frameSleep.reach * ARM_REACH -
        frameSleep.curl * ARM_TUCK
      parts.armL.position.x =
        armBase.L.x +
        (frameWave.shoulder + frameSleep.reach) * shoulderReach -
        frameShy.shoulder * shoulderTuck
      parts.armL.position.y =
        armBase.L.y + (frameWave.shoulder + frameShy.shoulder + frameSleep.reach) * shoulderLift
      parts.armL.position.z =
        armBase.L.z + frameShy.shoulder * shoulderForward + Math.abs(frameSulk.armAlt) * flailForward
    }
    if (parts.armR && armBase.R) {
      // 두 팔에 **같은 부호**를 주면 좌우가 거울이라 하나가 오를 때 다른 하나가 내려간다
      parts.armR.rotation.z =
        -frameDance.spread +
        frameDance.arm +
        frameShy.armIn +
        frameSulk.armAlt -
        frameSleep.reach * ARM_REACH +
        frameSleep.curl * ARM_TUCK
      parts.armR.position.x =
        armBase.R.x + frameShy.shoulder * shoulderTuck - frameSleep.reach * shoulderReach
      parts.armR.position.y =
        armBase.R.y + (frameShy.shoulder + frameSleep.reach) * shoulderLift
      parts.armR.position.z =
        armBase.R.z + frameShy.shoulder * shoulderForward + Math.abs(frameSulk.armAlt) * flailForward
    }

    /*
     * ── 다리 (춤출 때 번갈아 발을 들고, 앙탈로 앉을 때 앞으로 뻗는다) ──
     *
     * 앉을 때 **발은 바닥에 그대로 둔다.** 몸통 전체가 `sit` 만큼 내려가므로, 발은
     * 몸통 안에서 같은 만큼 도로 올라와야 제자리에 남는다. 안 그러면 발이 바닥을
     * 뚫고 내려가 캐릭터가 땅에 박힌 것처럼 보인다.
     */
    // 몸통이 내려간 만큼 발은 도로 올라와야 제자리에 남는다 (앙탈·웅크림 둘 다)
    const sitBack = frameSulk.sit * sitDrop + frameSleep.curl * curlDrop
    const legZ = legBaseZ + frameSulk.feet * feetForward + frameSleep.curl * curlTuck
    /*
     * 앉은 채로 두 발을 번갈아 **차올린다.**
     *
     * 한쪽이 오를 때 다른 쪽은 내려가는 것이 아니라 바닥에 그대로 있는다
     * (`Math.max(0, …)`). 부호를 그대로 뒤집으면 내려가는 발이 바닥을 뚫고 몸통에
     * 묻히는데, 배가 넓은 코지 판다에서는 발이 한 짝도 안 보이게 된다.
     * 춤출 때 발을 번갈아 드는 것과 같은 방식이다.
     */
    const kick = frameSulk.legAlt
    if (parts.legL) {
      parts.legL.position.y =
        legBaseY + Math.max(0, frameDance.step) * stepLift + sitBack + Math.max(0, kick) * kickLift
      parts.legL.position.z = legZ
    }
    if (parts.legR) {
      parts.legR.position.y =
        legBaseY + Math.max(0, -frameDance.step) * stepLift + sitBack + Math.max(0, -kick) * kickLift
      parts.legR.position.z = legZ
    }

    // ── 귀 (가끔 한쪽만 쫑긋) ──
    if (earTwitchTime !== null) {
      earTwitchTime += delta
      if (earTwitchTime > 0.28) {
        earTwitchTime = null
        untilEarTwitch = randomBetween(3, 8)
      }
    } else {
      untilEarTwitch -= delta
      // 자는 동안에는 쫑긋하지 않는다. 귀를 눕혀 놓고 그 위에서 떠는 것으로 보인다.
      if (untilEarTwitch <= 0 && settled && !sleeping) {
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
      /*
       * 웅크리면 귀를 뒤로 눕힌다. 귀가 서 있으면 자는 것으로 안 읽힌다.
       *
       * **고개를 숙인 만큼을 먼저 되돌린다.** 귀는 머리에 달려 있어서 머리가 앞으로
       * 기울면 귀도 함께 기우는데, 그 위에 뒤로 눕히는 각도를 그냥 더하면 둘이
       * 상쇄된다. 실제로 그렇게 나왔다 — 다 웅크렸는데 귀만 쫑긋 서 있었다.
       */
      ear.rotation.x =
        -earLag.value - frameSleep.ears * EAR_FOLD - frameSleep.duck * HEAD_TUCK
      // 좌우로 흔들 때 귀가 한 박자 늦게 따라 흔들린다
      ear.rotation.z =
        Math.sin(elapsed * 1.3 + side) * 0.026 * breathAmount +
        flick -
        earSway.value * 0.5 -
        side * frameSleep.ears * EAR_SPLAY
    }

    // ── 꼬리 ──
    if (parts.tail) {
      const speed = wags ? 6.2 : 1.7
      // 잘 때는 꼬리도 잦아든다. 시계가 느려진 위에 폭까지 줄여야 몸에 붙은 것으로 보인다.
      const amount = (wags ? 0.42 : 0.13) * (1 - frameSleep.curl * SLEEP_TAIL_STILL)
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

    /*
     * 앙탈을 부리는 동안에는 눈알을 줄이고 `> <` 를 키워 바꿔 끼운다.
     *
     * 깜빡임(`lids`)은 그대로 곱해 두므로, 감기는 도중에 앙탈이 시작돼도 서로 싸우지
     * 않는다. 0 까지 줄이지 않고 아주 작은 값을 남기는 것은 크기가 0 인 것에는 법선이
     * 없어 그리는 쪽이 싫어하기 때문이다.
     */
    const open = Math.max(0.001, 1 - frameSulk.squint)
    /*
     * 자는 눈은 `> <` 가 아니라 **눌린 눈**이다.
     *
     * 꺾인 획 두 개는 힘줘 감은 것이라 떼쓰는 얼굴이고, 눈알을 위아래로 눌러 만든
     * 가로 선 하나가 자는 얼굴이다 (`critter.ts` 의 `buildSquint` 주석). 그래서 앙탈이
     * 쓰는 자리가 아니라 깜빡임과 같은 자리를 쓰고, **둘 중 더 감긴 쪽**을 택한다 —
     * 감기는 도중에 깜빡임이 끼어도 서로 싸우지 않는다.
     */
    const lidsShut = Math.min(lids, 1 - frameSleep.shut * 0.94)
    for (const eye of [parts.eyeL, parts.eyeR]) {
      if (!eye) continue
      eye.scale.set(open, lidsShut * open, open)
    }
    for (const shut of [parts.squintL, parts.squintR]) {
      if (shut) shut.scale.setScalar(frameSulk.squint)
    }
  }

  return {
    hop,
    dance,
    twitch,
    wave,
    shy,
    sulk,
    doze,
    wake,
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
    get isSulking() {
      return sulkTime !== null
    },
    /** 재워 둔 상태인가. 웅크리는 중과 다 웅크리고 자는 중을 모두 포함한다. */
    get isAsleep() {
      return sleeping
    },
    /** 아직 웅크리는 중인가 (다 웅크린 뒤에는 false 다) */
    get isDozing() {
      return sleeping && dozeTime !== null && dozeTime < unitDuration.doze
    },
    get isWaking() {
      return wakeTime !== null
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
      return { ...unitDuration, hop: hopTimeline.duration, dance: danceTimeline.duration }
    },
  }
}
