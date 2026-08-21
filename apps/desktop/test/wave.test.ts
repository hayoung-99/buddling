/**
 * 손 흔들기.
 *
 * 이 파일의 마지막 묶음("창 안에 들어온다")이 특히 값을 한다. 이 캐릭터들의 팔은
 * 관절 없는 짧은 돌기라 팔을 읽히게 하려면 어깨를 실루엣 밖으로 밀어야 하는데,
 * 그러면 **캐릭터 창 밖으로 나가 잘릴 수 있다.** 눈으로만 보면 다섯 종 가운데
 * 하나가 잘리는 것을 놓치기 쉬워서, 실제 카메라 구도로 재어 본다.
 *
 * 잘리면 동작을 줄이는 것이 아니라 **창을 넓힌다**(`main/pet-size.ts`). 신호를
 * 전하는 것은 동작 자체이고, 캐릭터 옆 빈 자리는 어차피 클릭이 통과한다.
 */

import { describe, it, expect } from 'vitest'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import { CHARACTERS } from '@tap-tap/shared/characters'
import { createCritter, scaleToStandardHeight } from '../src/renderer/pet/critter'
import { PET_CAMERA } from '../src/renderer/pet/scene'
import { createAnimator, sampleWave, WAVE_DURATION } from '../src/renderer/pet/animations'
import { PET_BASE_SIZE } from '../src/main/pet-size'

/** 캐릭터를 세우고 애니메이터를 붙인 판. 실제 창과 같은 구도다. */
function stage(spec: (typeof CHARACTERS)[number]) {
  const critter = createCritter(spec)
  const stand = new Group()
  stand.rotation.y = PET_CAMERA.yaw
  stand.scale.setScalar(scaleToStandardHeight(critter))
  stand.add(critter.root)
  return { critter, stand, animator: createAnimator(critter) }
}

/** delta 초씩 잘게 나누어 t 까지 진행시킨다 */
function run(animator: { update: (delta: number) => void }, seconds: number, step = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) animator.update(step)
}

describe('손 흔들기 타임라인', () => {
  it('시작과 끝은 중립이다 — 팔도 어깨도 제자리', () => {
    for (const t of [0, WAVE_DURATION]) {
      const frame = sampleWave(t)
      expect(frame.armOne).toBeCloseTo(0, 5)
      expect(frame.shoulder).toBeCloseTo(0, 5)
      expect(frame.tilt).toBeCloseTo(0, 5)
    }
  })

  it('1.5초 안에 끝난다 — 콕 찌르기와 비슷한 길이여야 한다', () => {
    expect(WAVE_DURATION).toBeGreaterThan(0.8)
    expect(WAVE_DURATION).toBeLessThan(1.5)
  })

  it('팔을 다 든 뒤에 흔든다 — 올리는 도중에 흔들면 무슨 동작인지 안 읽힌다', () => {
    const peak = sampleWave(0.28)
    expect(peak.shoulder).toBeCloseTo(1, 1)

    // 흔드는 구간에서는 어깨가 거의 그대로이고 각도만 오간다
    const swings = [0.44, 0.6, 0.76, 0.92].map((t) => sampleWave(t))
    for (const swing of swings) expect(swing.shoulder).toBeGreaterThan(0.9)
    expect(Math.max(...swings.map((s) => s.armOne))).toBeGreaterThan(
      Math.min(...swings.map((s) => s.armOne)) + 0.3,
    )
  })

  it('어깨는 각도보다 먼저 자리를 잡는다 — 팔이 묻히지 않게', () => {
    // 팔을 절반쯤 들었을 때 어깨는 이미 절반 넘게 나가 있어야 한다
    const early = sampleWave(0.12)
    expect(early.shoulder).toBeGreaterThan(early.armOne / 2.5)
  })
})

describe('손 흔들기를 캐릭터에 입혔을 때', () => {
  it.each(CHARACTERS)('$key — 왼팔만 올라간다', (spec) => {
    const { critter, animator } = stage(spec)
    const { armL, armR } = critter.parts
    if (!armL || !armR) return // 팔이 없는 종은 건너뛴다

    const restL = armL.rotation.z
    const restR = armR.rotation.z

    animator.wave()
    run(animator, 0.3)

    expect(armL.rotation.z).toBeGreaterThan(restL + 1)
    expect(armR.rotation.z).toBeCloseTo(restR, 5)
  })

  it.each(CHARACTERS)('$key — 어깨가 밀렸다가 정확히 제자리로 돌아온다', (spec) => {
    const { critter, animator } = stage(spec)
    const arm = critter.parts.armL
    if (!arm) return

    const baseX = arm.position.x
    const baseY = arm.position.y

    animator.wave()
    run(animator, 0.3)
    expect(arm.position.x).toBeGreaterThan(baseX)
    expect(arm.position.y).toBeGreaterThan(baseY)

    run(animator, WAVE_DURATION + 0.5)
    expect(animator.isWaving).toBe(false)
    expect(arm.position.x).toBeCloseTo(baseX, 6)
    expect(arm.position.y).toBeCloseTo(baseY, 6)
  })

  it('춤과 손 흔들기가 겹쳐도 서로를 지우지 않는다', () => {
    const { critter, animator } = stage(CHARACTERS[0])
    const arm = critter.parts.armL!

    animator.dance()
    run(animator, 0.2)
    const dancing = arm.rotation.z

    animator.wave()
    run(animator, 0.3)
    // 손 흔들기가 얹히므로 춤만 출 때보다 더 올라가 있다
    expect(arm.rotation.z).toBeGreaterThan(dancing)
  })

  it('팔이 없는 캐릭터에서도 터지지 않는다', () => {
    const bare = createCritter(CHARACTERS[0])
    delete bare.parts.armL
    delete bare.parts.armR
    const animator = createAnimator(bare)
    animator.wave()
    expect(() => run(animator, WAVE_DURATION + 0.2)).not.toThrow()
  })
})

describe('손 흔드는 팔이 캐릭터 창 안에 들어온다', () => {
  /** 창 비율 그대로의 카메라로 재어, 가로로 가장 많이 삐져나간 만큼을 돌려준다 (1 이 창 가장자리) */
  function widestReach(spec: (typeof CHARACTERS)[number], at: number): number {
    const { critter, stand, animator } = stage(spec)
    animator.wave()
    run(animator, at)
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
    let widest = 0
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          widest = Math.max(widest, Math.abs(new Vector3(x, y, z).project(camera).x))
        }
      }
    }
    return widest
  }

  it.each(CHARACTERS)('$key — 팔을 다 들었을 때도 잘리지 않는다', (spec) => {
    // 1 이 창 가장자리다. 0.94 로 두어 그림자와 반올림에 여유를 남긴다.
    expect(widestReach(spec, 0.3)).toBeLessThan(0.94)
  })

  it.each(CHARACTERS)('$key — 흔드는 내내 잘리지 않는다', (spec) => {
    for (const at of [0.44, 0.6, 0.76, 0.92]) {
      expect(widestReach(spec, at), `${spec.key} @ ${at}s`).toBeLessThan(0.94)
    }
  })
})
