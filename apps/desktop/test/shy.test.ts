/**
 * 수줍음.
 *
 * 이 신호는 움직이는 것이 넷이다 — 팔, 몸통, 볼, 그리고 머리 위 말풍선. 넷 다
 * 제자리로 돌아오는지, 그리고 **말풍선까지 창 안에 들어오는지**가 여기서 걸린다.
 *
 * 마지막 묶음("창 안에 들어온다")은 `wave.test.ts` 의 것과 같은 방식인데, 손 흔들기가
 * **가로**만 보면 됐던 것과 달리 여기서는 가로세로를 다 본다. 말풍선이 머리 옆 위에
 * 뜨기 때문이다.
 *
 * 실제로 이 검사가 한 번 걸렸다. 말풍선을 머리 한가운데에 얹었더니 덤 덕에서 위가
 * 0.98 까지 차서, 창 높이와 화각을 함께 키워 봤다(둘은 짝이다 — `main/pet-size.ts`).
 * 그런데 **말풍선을 옆으로 비켜 세우니 지금 창에 들어와서** 창은 그대로 두었다.
 * 다음에 정말 모자라면 그때는 동작을 줄이지 말고 창을 키울 것.
 */

import { describe, it, expect } from 'vitest'
import { Box3, Group, PerspectiveCamera, Vector3 } from 'three'
import type * as THREE from 'three'
import { CHARACTERS } from '@buddling/shared/characters'
import { createCritter, scaleToStandardHeight } from '../src/renderer/pet/critter'
import { PET_CAMERA } from '../src/renderer/pet/scene'
import { createAnimator, sampleShy, SHY_DURATION, SHY_UNIT } from '../src/renderer/pet/animations'
import { createHeartBubble } from '../src/renderer/pet/heart-bubble'
import { PET_BASE_SIZE } from '../src/main/pet-size'

/** 캐릭터를 세우고 애니메이터를 붙인 판. 실제 창과 같은 구도다. */
function stage(spec: (typeof CHARACTERS)[number]) {
  const critter = createCritter(spec)
  const stand = new Group()
  stand.rotation.y = PET_CAMERA.yaw
  stand.scale.setScalar(scaleToStandardHeight(critter))
  stand.add(critter.root)
  const unit = critter.height * scaleToStandardHeight(critter)
  return { critter, stand, unit, animator: createAnimator(critter) }
}

/** delta 초씩 잘게 나누어 t 까지 진행시킨다 */
function run(thing: { update: (delta: number) => void }, seconds: number, step = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) thing.update(step)
}

const opacityOf = (mesh: THREE.Object3D) =>
  ((mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity

describe('수줍음 타임라인', () => {
  it('시작과 끝은 중립이다 — 팔도 어깨도 볼도 제자리', () => {
    for (const t of [0, SHY_DURATION]) {
      const frame = sampleShy(t)
      expect(frame.armIn).toBeCloseTo(0, 5)
      expect(frame.shoulder).toBeCloseTo(0, 5)
      expect(frame.sway).toBeCloseTo(0, 5)
      expect(frame.tilt).toBeCloseTo(0, 5)
      expect(frame.blush).toBeCloseTo(0, 5)
    }
  })

  it('콕과 무게가 같다 — 1.5~2초', () => {
    // 신호끼리 길이가 크게 다르면 어떤 것은 가볍고 어떤 것은 무거운 신호가 된다
    expect(SHY_DURATION).toBeGreaterThan(1.5)
    expect(SHY_DURATION).toBeLessThan(2)
  })

  it('팔을 다 모은 뒤에 살랑인다 — 모으는 도중에 흔들면 무슨 동작인지 안 읽힌다', () => {
    const gathered = sampleShy(0.44)
    expect(gathered.armIn).toBeGreaterThan(0.7)

    // 살랑이는 구간에서는 팔이 거의 그대로이고 몸통만 오간다
    const swings = [0.72, 1.0, 1.28].map((t) => sampleShy(t))
    for (const swing of swings) expect(swing.armIn).toBeGreaterThan(0.7)
  })

  it('몸이 좌우로 세 번 넘게 오간다 — 한 번만 기울면 살랑임이 아니다', () => {
    let reversals = 0
    let previous = 0
    for (let t = 0; t <= SHY_DURATION; t += 0.02) {
      const sway = sampleShy(t).sway
      if (previous !== 0 && Math.sign(sway) !== 0 && Math.sign(sway) !== Math.sign(previous)) {
        reversals += 1
      }
      if (sway !== 0) previous = sway
    }
    expect(reversals).toBeGreaterThanOrEqual(3)
  })

  it('볼은 가운데서 가장 붉고 끝에서 가신다', () => {
    const middle = Math.max(...SHY_UNIT.map((key) => Number(key.blush ?? 0)))
    expect(middle).toBeCloseTo(1, 5)
    expect(sampleShy(SHY_DURATION * 0.5).blush).toBeGreaterThan(0.5)
    expect(sampleShy(SHY_DURATION).blush).toBeCloseTo(0, 5)
  })
})

describe('수줍음을 캐릭터에 입혔을 때', () => {
  it.each(CHARACTERS)('$key — 볼이 붉어졌다가 완전히 사라진다', (spec) => {
    const { critter, animator } = stage(spec)
    const { blushL, blushR } = critter.parts

    expect(opacityOf(blushL)).toBe(0)
    expect(opacityOf(blushR)).toBe(0)

    animator.shy()
    run(animator, SHY_DURATION * 0.6)
    expect(opacityOf(blushL)).toBeGreaterThan(0.2)
    expect(opacityOf(blushR)).toBeGreaterThan(0.2)

    run(animator, SHY_DURATION)
    expect(animator.isShying).toBe(false)
    // 붉음이 남으면 그 캐릭터는 영영 수줍은 얼굴로 서 있게 된다
    expect(opacityOf(blushL)).toBe(0)
    expect(opacityOf(blushR)).toBe(0)
  })

  it.each(CHARACTERS)('$key — 어깨가 올라가고 모였다가 정확히 제자리로 돌아온다', (spec) => {
    const { critter, animator } = stage(spec)
    const { armL, armR } = critter.parts
    if (!armL || !armR) return

    const base = { lx: armL.position.x, ly: armL.position.y, rx: armR.position.x }

    animator.shy()
    run(animator, 0.5)
    expect(armL.position.y).toBeGreaterThan(base.ly)
    // 두 어깨가 가운데로 모인다 — 벌어진 채 올라가면 만세가 된다
    expect(armL.position.x).toBeLessThan(base.lx)
    expect(armR.position.x).toBeGreaterThan(base.rx)

    run(animator, SHY_DURATION + 0.5)
    expect(armL.position.x).toBeCloseTo(base.lx, 6)
    expect(armL.position.y).toBeCloseTo(base.ly, 6)
    expect(armR.position.x).toBeCloseTo(base.rx, 6)
  })

  it('두 팔이 대칭으로 안쪽을 향한다 — 한쪽만 모으면 손 흔들기의 변주로 읽힌다', () => {
    const { critter, animator } = stage(CHARACTERS[0])
    const { armL, armR } = critter.parts
    const restL = armL.rotation.z
    const restR = armR.rotation.z

    animator.shy()
    run(animator, 0.5)
    // 왼팔(화면 오른쪽)은 안쪽으로 돌므로 각도가 줄어든다
    expect(armL.rotation.z - restL).toBeLessThan(-0.6)
    // 오른팔은 거울처럼 반대로 돈다
    expect(armR.rotation.z - restR).toBeCloseTo(-(armL.rotation.z - restL), 5)
  })

  it.each(CHARACTERS)('$key — 두 팔이 앞으로 나왔다가 제자리로 돌아온다', (spec) => {
    const { critter, animator } = stage(spec)
    const { armL, armR } = critter.parts
    if (!armL || !armR) return

    const baseZ = [armL.position.z, armR.position.z]

    animator.shy()
    run(animator, 0.5)
    // 배 앞으로 나오려면 앞으로 밀려 있어야 한다 — 각도만으로는 몸통 옆면에 묻힌다
    expect(armL.position.z).toBeGreaterThan(baseZ[0])
    expect(armR.position.z).toBeGreaterThan(baseZ[1])

    run(animator, SHY_DURATION + 0.5)
    expect(armL.position.z).toBeCloseTo(baseZ[0], 6)
    expect(armR.position.z).toBeCloseTo(baseZ[1], 6)
  })

  it.each(CHARACTERS)('$key — 빗금이 밝아졌다가 원래 색으로 정확히 돌아온다', (spec) => {
    // 붉은 볼 위에서는 분홍 빗금이 배경에 묻히므로 밝은 자국으로 넘어간다.
    // 돌아오지 않으면 그 캐릭터는 영영 흰 빗금을 달고 서 있게 된다.
    const critter = createCritter(spec)
    const animator = createAnimator(critter)
    const material = critter.materials.cheek as THREE.MeshStandardMaterial
    const rest = material.color.getHex()

    animator.shy()
    run(animator, SHY_DURATION * 0.6)
    expect(material.color.getHex()).not.toBe(rest)

    run(animator, SHY_DURATION)
    expect(material.color.getHex()).toBe(rest)
  })

  it('볼이 없는 캐릭터에서도 터지지 않는다', () => {
    const bare = createCritter(CHARACTERS[0])
    delete bare.parts.blushL
    delete bare.parts.blushR
    const animator = createAnimator(bare)
    animator.shy()
    expect(() => run(animator, SHY_DURATION + 0.2)).not.toThrow()
  })
})

describe('말풍선이 캐릭터 창 안에 들어온다', () => {
  /**
   * 창 비율 그대로의 카메라로 재어, 그 덩어리를 감싼 상자의 여덟 꼭짓점을 화면
   * 좌표로 돌려준다.
   *
   * **말풍선과 캐릭터를 따로 잰다.** 둘을 한 상자에 담으면 축에 나란한 상자라 아무것도
   * 없는 모서리까지 생긴다 — 팔을 앞으로 더 밀었더니 그 빈 모서리가 카메라에 가까워져
   * 말풍선이 잘린다고 잘못 걸렸다.
   */
  function cornersOf(spec: (typeof CHARACTERS)[number], which: 'bubble' | 'critter'): Vector3[] {
    const { critter, stand, unit, animator } = stage(spec)
    const bubble = createHeartBubble(stand, unit)

    /*
     * 말풍선이 가장 크게 부풀어 오른 순간(튀어나오는 연출의 정점)을 잡되, **캐릭터도
     * 함께 그 시각까지 움직여 둔다.** 기본 자세로 세워 놓고 재면 올라간 팔이 상자에
     * 안 들어와서, 정작 창 밖으로 나갈 만한 것을 빼고 재게 된다.
     */
    animator.shy()
    run(animator, 0.48)
    run(bubble, 0.48)
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

    const box = new Box3().setFromObject(which === 'bubble' ? bubble.object : critter.root)
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

  const highestReach = (spec: (typeof CHARACTERS)[number]) =>
    Math.max(...cornersOf(spec, 'bubble').map((point) => point.y))

  const widestReach = (spec: (typeof CHARACTERS)[number]) =>
    Math.max(
      ...[...cornersOf(spec, 'bubble'), ...cornersOf(spec, 'critter')].map((point) =>
        Math.abs(point.x),
      ),
    )

  it.each(CHARACTERS)('$key — 말풍선 꼭대기가 잘리지 않는다', (spec) => {
    // 1 이 창 위 가장자리다. 0.94 로 두어 반올림에 여유를 남긴다.
    expect(highestReach(spec)).toBeLessThan(0.94)
  })

  it.each(CHARACTERS)('$key — 옆으로 비켜 세운 말풍선도 잘리지 않는다', (spec) => {
    // 머리 한가운데가 아니라 옆에 뜨므로 가로도 함께 재야 한다
    expect(widestReach(spec)).toBeLessThan(0.94)
  })
})
