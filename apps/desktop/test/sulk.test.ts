/**
 * 앙탈.
 *
 * 이 동작만 몸이 **아래로** 내려간다. 그래서 여기서 걸리는 것도 다른 신호와 다르다 —
 * 손 흔들기는 팔이 옆으로 나가 가로가, 하트는 말풍선이 얹혀 위가 문제였고, 앙탈은
 * 주저앉아 발을 뻗느라 **아래**가 문제다.
 *
 * 그리고 이 파일에만 있는 검사가 하나 있다. **이름표가 따라 내려가지 않는지**다.
 * 이름표 자리는 `updateHotZone()` 이 기본 자세로 되돌려 놓고 재기 때문에 몸이 낮아져도
 * 제자리인데, 지금까지 몸이 내려가는 동작이 없어서 한 번도 확인된 적이 없었다.
 */

import { describe, it, expect } from 'vitest'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import { CHARACTERS } from '@buddling/shared/characters'
import { createCritter, scaleToStandardHeight } from '../src/renderer/pet/critter'
import { PET_CAMERA } from '../src/renderer/pet/scene'
import { createAnimator, sampleSulk, SULK_DURATION, SULK_UNIT } from '../src/renderer/pet/animations'
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

/** 앉아 있는 동안의 시각. 이때가 가장 낮고 발이 가장 앞에 나와 있다. */
const SEATED = 0.9

describe('앙탈 타임라인', () => {
  it('시작과 끝은 중립이다 — 앉지도 팔을 젓지도 않은 자세', () => {
    for (const t of [0, SULK_DURATION]) {
      const frame = sampleSulk(t)
      expect(frame.sit).toBeCloseTo(0, 5)
      expect(frame.feet).toBeCloseTo(0, 5)
      expect(frame.armAlt).toBeCloseTo(0, 5)
      expect(frame.sx).toBeCloseTo(1, 5)
      expect(frame.sy).toBeCloseTo(1, 5)
    }
  })

  it('다른 신호와 무게가 같다 — 1.5~2초', () => {
    expect(SULK_DURATION).toBeGreaterThan(1.5)
    expect(SULK_DURATION).toBeLessThan(2)
  })

  it('앉기 전에 잠깐 웅크린다 — 예비동작이 없으면 그냥 내려앉는 것으로 보인다', () => {
    const crouch = sampleSulk(0.1)
    expect(crouch.sit).toBeGreaterThan(0)
    expect(crouch.sit).toBeLessThan(0.4)
    expect(crouch.sy).toBeLessThan(1) // 눌린다
  })

  it('닿는 순간 찌부러졌다 돌아온다 — 이 한 번이 털썩의 무게를 만든다', () => {
    const landing = sampleSulk(0.24)
    expect(landing.sit).toBeCloseTo(1, 1)
    expect(landing.sx).toBeGreaterThan(1.05)
    expect(landing.sy).toBeLessThan(0.95)

    // 부피는 대략 보존된다 — 눌릴 때 옆으로 퍼진다
    expect(landing.sx * landing.sy * landing.sx).toBeGreaterThan(0.9)

    const after = sampleSulk(0.33)
    expect(after.sy).toBeGreaterThan(1) // 되튄다
  })

  it('팔을 네 번 젓는다 — 두세 번이면 보채는 것으로 안 읽힌다', () => {
    let reversals = 0
    let previous = 0
    for (let t = 0.33; t <= 1.02; t += 0.01) {
      const armAlt = sampleSulk(t).armAlt
      if (previous !== 0 && Math.sign(armAlt) !== 0 && Math.sign(armAlt) !== Math.sign(previous)) {
        reversals += 1
      }
      if (armAlt !== 0) previous = armAlt
    }
    expect(reversals).toBeGreaterThanOrEqual(4)
  })

  it('젓기를 마치고 잠깐 그대로 있다가 일어난다', () => {
    // 팔은 멈췄는데 아직 앉아 있는 구간이 있어야 한다
    expect(sampleSulk(1.2).armAlt).toBeCloseTo(0, 2)
    expect(sampleSulk(1.2).sit).toBeCloseTo(1, 1)
    // 그리고 마지막에 일어선다
    expect(sampleSulk(SULK_DURATION).sit).toBeCloseTo(0, 5)
  })

  it('앉는 동안 팔을 젓는다 — 앉기와 젓기가 겹쳐야 한 동작으로 보인다', () => {
    const swinging = SULK_UNIT.filter((key) => Math.abs(Number(key.armAlt ?? 0)) > 0.5)
    for (const key of swinging) expect(Number(key.sit)).toBeGreaterThan(0.9)
  })
})

describe('앙탈을 캐릭터에 입혔을 때', () => {
  it.each(CHARACTERS)('$key — 몸이 내려앉았다가 정확히 제자리로 돌아온다', (spec) => {
    const { critter, animator } = stage(spec)
    const restY = critter.root.position.y

    animator.sulk()
    run(animator, SEATED)
    expect(critter.root.position.y).toBeLessThan(restY - 0.1)

    run(animator, SULK_DURATION + 0.5)
    expect(animator.isSulking).toBe(false)
    expect(critter.root.position.y).toBeCloseTo(restY, 5)
  })

  it.each(CHARACTERS)('$key — 발이 앞으로 나갔다가 정확히 제자리로 돌아온다', (spec) => {
    const { critter, animator } = stage(spec)
    const { legL, legR } = critter.parts
    if (!legL || !legR) return
    const base = { z: legL.position.z, y: legL.position.y }

    animator.sulk()
    run(animator, SEATED)
    expect(legL.position.z).toBeGreaterThan(base.z)
    expect(legR.position.z).toBeGreaterThan(base.z)
    // 몸이 내려간 만큼 발은 몸통 안에서 되올라와 바닥에 남는다
    expect(legL.position.y).toBeGreaterThan(base.y)

    run(animator, SULK_DURATION + 0.5)
    expect(legL.position.z).toBeCloseTo(base.z, 6)
    expect(legL.position.y).toBeCloseTo(base.y, 6)
  })

  it('두 팔이 번갈아 젓는다 — 같이 움직이면 만세가 된다', () => {
    const { critter, animator } = stage(CHARACTERS[0])
    const { armL, armR } = critter.parts
    const restL = armL.rotation.z
    const restR = armR.rotation.z

    animator.sulk()
    run(animator, 0.6)
    // 좌우가 거울이라 같은 각도를 더해도 하나는 오르고 하나는 내려간다
    const movedL = armL.rotation.z - restL
    const movedR = armR.rotation.z - restR
    expect(Math.abs(movedL)).toBeGreaterThan(0.5)
    expect(movedL).toBeCloseTo(movedR, 5)
  })

  it('발이 없는 캐릭터에서도 터지지 않는다', () => {
    const bare = createCritter(CHARACTERS[0])
    delete bare.parts.legL
    delete bare.parts.legR
    const animator = createAnimator(bare)
    animator.sulk()
    expect(() => run(animator, SULK_DURATION + 0.2)).not.toThrow()
  })
})

describe('앉은 자세가 캐릭터 창 안에 들어온다', () => {
  /** 창 비율 그대로의 카메라로 재어, 아래로 가장 많이 내려간 만큼을 돌려준다 (-1 이 창 아래 가장자리) */
  function lowestReach(spec: (typeof CHARACTERS)[number]): number {
    const { critter, stand, animator } = stage(spec)
    animator.sulk()
    run(animator, SEATED)
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
    let lowest = 0
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          lowest = Math.min(lowest, new Vector3(x, y, z).project(camera).y)
        }
      }
    }
    return lowest
  }

  it.each(CHARACTERS)('$key — 뻗은 발이 잘리지 않는다', (spec) => {
    // -1 이 창 아래 가장자리다. 이름표가 그 아래 붙으므로 여유를 넉넉히 둔다.
    expect(lowestReach(spec)).toBeGreaterThan(-0.9)
  })
})
