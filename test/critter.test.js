import { describe, it, expect } from 'vitest'
import { Box3, Group } from 'three'
import { CHARACTERS, getCharacter } from '../src/shared/characters.js'
import {
  createCritter,
  disposeCritter,
  scaleToStandardHeight,
  STANDARD_HEIGHT,
} from '../src/renderer/pet/critter.js'

const build = (key) => createCritter(getCharacter(key))

describe('createCritter', () => {
  it.each(CHARACTERS)('$key 는 애니메이션에 필요한 피벗을 모두 만든다', (spec) => {
    const { parts } = createCritter(spec)
    for (const name of ['root', 'body', 'head', 'eyeL', 'eyeR', 'armL', 'armR', 'legL', 'legR']) {
      expect(parts[name], `${spec.key}.${name}`).toBeDefined()
    }
  })

  it('귀가 있는 종만 귀 피벗을 갖는다', () => {
    expect(build('cat').parts.earL).toBeDefined()
    expect(build('bunny').parts.earR).toBeDefined()
    // 오리는 귀가 없다
    expect(build('duck').parts.earL).toBeUndefined()
    expect(build('duck').parts.earR).toBeUndefined()
  })

  it.each(CHARACTERS)('$key 의 발바닥이 바닥(y=0)에 닿아 있다', (spec) => {
    // squash & stretch가 바닥을 향해 눌리려면 원점이 발밑이어야 한다
    const { root } = createCritter(spec)
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    expect(box.min.y).toBeGreaterThan(-0.02)
    expect(box.min.y).toBeLessThan(0.06)
  })

  it.each(CHARACTERS)('$key 는 좌우 대칭이다', (spec) => {
    const { parts } = createCritter(spec)
    expect(parts.armL.position.x).toBeCloseTo(-parts.armR.position.x, 6)
    expect(parts.eyeL.position.x).toBeCloseTo(-parts.eyeR.position.x, 6)
  })

  it('캐릭터는 카메라(+Z)를 향하도록 눈이 앞면에 붙는다', () => {
    const { parts } = build('cat')
    expect(parts.eyeL.position.z).toBeGreaterThan(0)
    expect(parts.snout.position.z).toBeGreaterThan(0)
  })

  it('종마다 실제 키가 다르다 — 토끼는 귀 때문에 오리보다 훨씬 크다', () => {
    expect(build('bunny').height).toBeGreaterThan(build('duck').height * 1.2)
  })

  it('배율을 적용하면 5종이 모두 같은 높이가 된다', () => {
    // 화면에서 크기가 들쭉날쭉하면 말풍선 자리가 없어지거나 캐릭터가 잘린다
    for (const spec of CHARACTERS) {
      const critter = createCritter(spec)
      const stand = new Group()
      stand.scale.setScalar(scaleToStandardHeight(critter))
      stand.add(critter.root)
      stand.updateMatrixWorld(true)

      const box = new Box3().setFromObject(critter.root)
      expect(box.max.y - box.min.y, spec.key).toBeCloseTo(STANDARD_HEIGHT, 5)
    }
  })

  it('키를 맞춰도 발바닥은 여전히 바닥에 있다', () => {
    const critter = build('bunny')
    const stand = new Group()
    stand.scale.setScalar(scaleToStandardHeight(critter))
    stand.add(critter.root)
    stand.updateMatrixWorld(true)

    const box = new Box3().setFromObject(critter.root)
    expect(box.min.y).toBeGreaterThan(-0.02)
    expect(box.min.y).toBeLessThan(0.06)
  })

  it('교체할 때 씬에서 빠져나온다', () => {
    const critter = build('panda')
    const stand = new Group()
    stand.add(critter.root)
    expect(stand.children).toHaveLength(1)

    disposeCritter(critter)
    expect(stand.children).toHaveLength(0)
  })
})

describe('볼따구 빗금', () => {
  it.each(CHARACTERS)('$key 는 양 볼에 빗금 3개씩 있다', (spec) => {
    const { parts } = createCritter(spec)
    expect(parts.cheekL).toBeDefined()
    expect(parts.cheekR).toBeDefined()
    expect(parts.cheekL.children).toHaveLength(3)
    expect(parts.cheekR.children).toHaveLength(3)
  })

  it.each(CHARACTERS)('$key 의 빗금이 얼굴 곡면에 얹혀 있다', (spec) => {
    // 얼굴은 구면이라 평평하게 붙이면 가장자리가 파묻힌다.
    // 볼 그룹이 머리 반지름만큼 떨어진 표면 위에 있어야 한다.
    const critter = createCritter(spec)
    const headR = spec.build.headRadius
    for (const key of ['cheekL', 'cheekR']) {
      expect(critter.parts[key].position.length()).toBeCloseTo(headR, 5)
    }
  })

  it('좌우 볼이 대칭이다 — 빗금 기울기도 서로 반대', () => {
    const { parts } = createCritter(getCharacter('cat'))
    expect(parts.cheekL.position.x).toBeCloseTo(-parts.cheekR.position.x, 6)
    expect(parts.cheekL.position.y).toBeCloseTo(parts.cheekR.position.y, 6)
    expect(parts.cheekL.children[0].rotation.z).toBeCloseTo(
      -parts.cheekR.children[0].rotation.z,
      6,
    )
  })

  it('가운데 빗금이 가장 길다', () => {
    const { parts } = createCritter(getCharacter('cat'))

    /*
     * geometry.parameters 를 읽지 않고 실제 크기를 잰다.
     *
     * 예전에는 parameters.length 를 봤는데, Three.js 가 CapsuleGeometry 의 그 칸을
     * height 로 이름만 바꾸면서 undefined 가 되어 검사가 깨졌다. 우리가 알고 싶은 것은
     * "가운데가 더 길다"이지 그 값이 어느 이름으로 담겨 있는가가 아니다.
     */
    const lengths = parts.cheekL.children.map((stroke) => {
      stroke.geometry.computeBoundingBox()
      const box = stroke.geometry.boundingBox
      return box.max.y - box.min.y
    })

    expect(lengths[1]).toBeGreaterThan(lengths[0])
    expect(lengths[1]).toBeGreaterThan(lengths[2])
  })
})
