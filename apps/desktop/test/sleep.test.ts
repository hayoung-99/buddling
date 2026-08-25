/**
 * 잠재우기.
 *
 * 다른 동작과 성질이 다른 것이 하나 있고, 이 파일의 검사 대부분이 그것을 지킨다 —
 * **자는 것은 한 번 재생하고 마는 동작이 아니라 상태**라서, 잠들기 트랙은 마지막 키가
 * 중립이 아니고 거기서 멈춰 그 자세를 유지한다. 다른 트랙들이 "끝나면 제자리로
 * 돌아오는가" 를 확인하는 자리에서, 이쪽은 **끝나도 안 돌아오는가**를 확인한다.
 *
 * 그리고 이 파일에만 있는 검사가 하나 더 있다. **기지개가 창 위로 넘치지 않는지**다.
 * 지금까지 위가 문제였던 것은 하트 말풍선뿐이었고 그건 캐릭터가 아니라 곁들이는
 * 것이었는데, 기지개는 캐릭터 자신이 중립보다 위로 늘어나는 첫 동작이다.
 */

import { describe, it, expect } from 'vitest'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import { CHARACTERS } from '@buddling/shared/characters'
import { POWER_LEVELS, powerProfile, SLEEP_FPS } from '@buddling/shared/power'
import { createCritter, scaleToStandardHeight } from '../src/renderer/pet/critter'
import { PET_CAMERA } from '../src/renderer/pet/scene'
import {
  createAnimator,
  sampleDoze,
  sampleWake,
  DOZE_DURATION,
  DOZE_UNIT,
  WAKE_DURATION,
  WAKE_UNIT,
} from '../src/renderer/pet/animations'
import { PET_BASE_SIZE } from '../src/main/pet-size'

function stage(spec: (typeof CHARACTERS)[number]) {
  const critter = createCritter(spec)
  const stand = new Group()
  stand.rotation.y = PET_CAMERA.yaw
  stand.scale.setScalar(scaleToStandardHeight(critter))
  stand.add(critter.root)
  return { critter, stand, animator: createAnimator(critter) }
}

function run(animator: { update: (delta: number) => void }, seconds: number, step = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) animator.update(step)
}

/** 기지개가 가장 크게 펴진 순간 */
const STRETCH_PEAK = 0.74

describe('잠들기 타임라인', () => {
  it('중립에서 시작한다 — 서 있던 자세에서 이어져야 한다', () => {
    const frame = sampleDoze(0)
    expect(frame.curl).toBeCloseTo(0, 5)
    expect(frame.duck).toBeCloseTo(0, 5)
    expect(frame.shut).toBeCloseTo(0, 5)
    expect(frame.sx).toBeCloseTo(1, 5)
    expect(frame.sy).toBeCloseTo(1, 5)
  })

  it('끝은 중립이 아니다 — 웅크린 자세에서 멈춰야 자는 것이 된다', () => {
    const frame = sampleDoze(DOZE_DURATION)
    expect(frame.curl).toBeCloseTo(1, 2)
    expect(frame.duck).toBeCloseTo(1, 2)
    expect(frame.ears).toBeCloseTo(1, 2)
    expect(frame.shut).toBeCloseTo(1, 2)
  })

  it('고개와 귀가 몸보다 먼저 처진다 — 같이 내려가면 힘이 빠진 것으로 보인다', () => {
    const early = sampleDoze(0.26)
    expect(early.duck).toBeGreaterThan(early.curl)
    expect(early.ears).toBeGreaterThan(early.curl)
  })

  it('웅크리는 데 1초 안팎이 걸린다 — 즉시 갈아 끼우지 않는다', () => {
    expect(DOZE_DURATION).toBeGreaterThan(0.7)
    expect(DOZE_DURATION).toBeLessThan(1.6)
  })

  it('기지개는 잠들기가 멈춘 그 자세에서 시작한다', () => {
    // 두 트랙이 어긋나면 깨우는 순간 자세가 통째로 튄다
    const asleep = DOZE_UNIT[DOZE_UNIT.length - 1]
    const waking = WAKE_UNIT[0]
    for (const field of ['curl', 'duck', 'ears', 'shut', 'sx', 'sy']) {
      expect(Number(waking[field]), field).toBeCloseTo(Number(asleep[field]), 5)
    }
  })

  it('기지개는 중립으로 끝난다 — 깨어난 뒤에는 평소 자세여야 한다', () => {
    const frame = sampleWake(WAKE_DURATION)
    for (const field of ['curl', 'duck', 'ears', 'shut', 'reach']) {
      expect(frame[field], field).toBeCloseTo(0, 5)
    }
    expect(frame.sx).toBeCloseTo(1, 5)
    expect(frame.sy).toBeCloseTo(1, 5)
  })

  it('기지개는 중립보다 위로 한 번 늘어난다 — 되감기만 하면 일어난 것으로 안 보인다', () => {
    const peak = sampleWake(STRETCH_PEAK)
    expect(peak.sy).toBeGreaterThan(1.1)
    expect(peak.sx).toBeLessThan(1) // 늘어나면서 홀쭉해진다
    expect(peak.reach).toBeCloseTo(1, 2) // 두 팔이 다 올라갔다
    expect(peak.duck).toBeLessThan(0) // 고개를 젖힌다
    expect(peak.ears).toBeLessThan(0) // 귀가 쫑긋 선다
  })
})

describe('재운 캐릭터', () => {
  it.each(CHARACTERS)('$key — 다 웅크린 뒤에도 그 자세로 있는다', (spec) => {
    const { critter, animator } = stage(spec)
    const restY = critter.root.position.y

    animator.doze()
    run(animator, DOZE_DURATION + 3) // 한참 더 돌려 본다
    expect(animator.isAsleep).toBe(true)
    expect(animator.isDozing).toBe(false) // 웅크리는 것은 끝났고
    expect(critter.root.position.y).toBeLessThan(restY - 0.05) // 자세는 그대로다
  })

  it('instant 로 재우면 전환 없이 곧바로 자는 자세다', () => {
    const slow = stage(CHARACTERS[0])
    const instant = stage(CHARACTERS[0])

    instant.animator.doze({ instant: true })
    instant.animator.update(0)
    expect(instant.animator.isDozing).toBe(false)

    slow.animator.doze()
    run(slow.animator, DOZE_DURATION + 0.5)
    expect(instant.critter.root.position.y).toBeCloseTo(slow.critter.root.position.y, 2)
  })

  it.each(CHARACTERS)('$key — 눈은 감기되 `> <` 는 나오지 않는다', (spec) => {
    const { critter, animator } = stage(spec)
    const { eyeL, squintL } = critter.parts
    const openEye = eyeL.scale.y

    animator.doze()
    run(animator, DOZE_DURATION + 0.2)
    expect(eyeL.scale.y).toBeLessThan(openEye * 0.2)
    // 꺾인 획 두 개는 힘줘 감은 것이라 떼쓰는 얼굴이다 (`critter.ts` 의 buildSquint)
    expect(squintL.scale.x).toBeCloseTo(0, 5)
  })

  it.each(CHARACTERS)('$key — 발이 몸통 앞으로 나오고 바닥에 남는다', (spec) => {
    const { critter, animator } = stage(spec)
    const { legL, legR } = critter.parts
    if (!legL || !legR) return
    const base = { y: legL.position.y, z: legL.position.z }

    animator.doze()
    run(animator, DOZE_DURATION + 0.2)
    /*
     * 앙탈과 같은 거리만큼 앞으로 나와야 한다.
     *
     * 처음에는 그 3분의 1만 내보냈는데, **내려앉은 몸통이 발을 통째로 삼켰다.** 발이
     * 한 짝도 안 보이면 웅크린 것이 아니라 몸통만 남은 덩어리로 보인다.
     */
    expect(legL.position.z).toBeGreaterThan(base.z)
    expect(legR.position.z).toBeGreaterThan(base.z)
    // 몸통이 내려간 만큼 발은 몸통 안에서 되올라와야 땅에 박힌 것처럼 보이지 않는다
    expect(legL.position.y).toBeGreaterThan(base.y)

    animator.wake()
    run(animator, WAKE_DURATION + 0.5)
    expect(legL.position.z).toBeCloseTo(base.z, 6)
    expect(legL.position.y).toBeCloseTo(base.y, 6)
  })

  it('귀를 눕힌다 — 귀가 서 있으면 자는 것으로 안 읽힌다', () => {
    // 홉 버니는 귀가 길어 이 차이가 가장 잘 드러난다
    const bunny = CHARACTERS.find((spec) => spec.key === 'bunny')!
    const { critter, animator } = stage(bunny)
    const rest = critter.parts.earL.rotation.x

    animator.doze()
    run(animator, DOZE_DURATION + 0.2)
    expect(critter.parts.earL.rotation.x).toBeLessThan(rest - 0.3)
  })

  it('깨우면 기지개를 켜고 정확히 제자리로 돌아온다', () => {
    const { critter, animator } = stage(CHARACTERS[0])
    const restY = critter.root.position.y

    animator.doze()
    run(animator, DOZE_DURATION + 0.2)
    animator.wake()
    expect(animator.isAsleep).toBe(false)

    run(animator, STRETCH_PEAK)
    expect(critter.root.scale.y).toBeGreaterThan(1.05) // 늘어나는 중

    run(animator, WAKE_DURATION)
    expect(animator.isWaking).toBe(false)
    expect(critter.root.position.y).toBeCloseTo(restY, 2)
    expect(critter.root.scale.y).toBeCloseTo(1, 1)
  })

  it('기지개를 켤 때 두 팔이 함께 올라간다 — 한쪽만 오르면 손 흔들기가 된다', () => {
    const { critter, animator } = stage(CHARACTERS[0])
    const { armL, armR } = critter.parts
    const restL = armL.rotation.z
    const restR = armR.rotation.z

    animator.doze()
    run(animator, DOZE_DURATION + 0.2)
    animator.wake()
    run(animator, STRETCH_PEAK)

    // 좌우가 거울이라 부호가 반대여야 둘 다 바깥·위로 올라간다
    expect(armL.rotation.z - restL).toBeGreaterThan(1.5)
    expect(armR.rotation.z - restR).toBeLessThan(-1.5)
  })

  it('stop() 은 자던 것도 깨워 세운다 — 편집기가 포즈를 갈아 끼울 수 있어야 한다', () => {
    const { critter, animator } = stage(CHARACTERS[0])
    const restY = critter.root.position.y

    animator.doze({ instant: true })
    animator.update(0)
    animator.stop()
    animator.update(0)
    expect(animator.isAsleep).toBe(false)
    expect(critter.root.position.y).toBeCloseTo(restY, 5)
  })

  it('부위가 없는 캐릭터에서도 터지지 않는다', () => {
    const bare = createCritter(CHARACTERS[0])
    for (const part of ['earL', 'earR', 'armL', 'armR', 'legL', 'legR', 'eyeL', 'eyeR']) {
      delete bare.parts[part]
    }
    const animator = createAnimator(bare)
    animator.doze()
    expect(() => run(animator, DOZE_DURATION + 0.5)).not.toThrow()
    animator.wake()
    expect(() => run(animator, WAKE_DURATION + 0.5)).not.toThrow()
  })
})

describe('그리는 양', () => {
  it('절전 단계 어느 것보다도 적게 그린다 — 남은 것이 느린 숨쉬기뿐이다', () => {
    for (const level of POWER_LEVELS) {
      expect(SLEEP_FPS, level).toBeLessThan(powerProfile(level).idleFps)
    }
  })
})

describe('자는 자세와 기지개가 캐릭터 창 안에 들어온다', () => {
  /**
   * 창 비율 그대로의 카메라로 재어 캐릭터 상자의 여덟 모서리를 화면 좌표로 돌려준다.
   * ±1 이 창 가장자리다.
   */
  function cornersAt(spec: (typeof CHARACTERS)[number], pose: 'asleep' | 'stretch'): Vector3[] {
    const { critter, stand, animator } = stage(spec)

    animator.doze()
    run(animator, DOZE_DURATION + 0.2)
    if (pose === 'stretch') {
      animator.wake()
      run(animator, STRETCH_PEAK)
    }
    stand.updateMatrixWorld(true)

    const camera = new PerspectiveCamera(
      PET_CAMERA.fov,
      PET_BASE_SIZE.width / PET_BASE_SIZE.height,
      0.1,
      50,
    )
    camera.position.set(...PET_CAMERA.position)
    camera.lookAt(...PET_CAMERA.target)
    camera.updateMatrixWorld(true)

    const box = new Box3().setFromObject(critter.root)
    const corners: Vector3[] = []
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corners.push(new Vector3(x, y, z).project(camera))
        }
      }
    }
    return corners
  }

  it.each(CHARACTERS)('$key — 웅크린 몸이 아래로 잘리지 않는다', (spec) => {
    const lowest = Math.min(...cornersAt(spec, 'asleep').map((point) => point.y))
    // -1 이 창 아래 가장자리다. 이름표가 그 아래 붙으므로 여유를 넉넉히 둔다.
    expect(lowest).toBeGreaterThan(-0.9)
  })

  it.each(CHARACTERS)('$key — 기지개로 올린 팔이 위로 잘리지 않는다', (spec) => {
    const highest = Math.max(...cornersAt(spec, 'stretch').map((point) => point.y))
    // 1 이 창 위 가장자리다. **걸리면 동작을 줄이지 말고 창 높이와 화각을 함께 키운다**
    // (`main/pet-size.ts` 의 PET_BASE_SIZE 와 `renderer/pet/scene.ts` 의 PET_CAMERA.fov).
    expect(highest).toBeLessThan(0.94)
  })

  it.each(CHARACTERS)('$key — 기지개가 옆으로도 잘리지 않는다', (spec) => {
    const widest = Math.max(...cornersAt(spec, 'stretch').map((point) => Math.abs(point.x)))
    expect(widest).toBeLessThan(0.94)
  })
})
