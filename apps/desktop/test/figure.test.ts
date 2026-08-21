import { describe, it, expect } from 'vitest'
import { Box3, Group, Vector3 } from 'three'
import type { Mesh } from 'three'
import { FIGURES, getFigure } from '../src/renderer/figures/specs'
import {
  createFigure,
  disposeFigure,
  scaleFigureToStandardHeight,
  FIGURE_STANDARD_HEIGHT,
} from '../src/renderer/figures/figure'

const build = (key: string) => createFigure(getFigure(key))

describe('createFigure', () => {
  it.each(FIGURES)('$key 는 동작에 필요한 피벗을 모두 만든다', (spec) => {
    const { parts } = createFigure(spec)
    for (const name of [
      'root',
      'torso',
      'head',
      'eyeL',
      'eyeR',
      'armL',
      'armR',
      'handL',
      'handR',
      'legL',
      'legR',
      'snout',
    ]) {
      expect(parts[name], `${spec.key}.${name}`).toBeDefined()
    }
  })

  it('귀와 꼬리는 있는 종만 갖는다', () => {
    expect(build('calico').parts.earL).toBeDefined()
    expect(build('puppy').parts.earR).toBeDefined()
    expect(build('panda').parts.earL).toBeDefined()
    expect(build('bunny').parts.earL).toBeDefined()
    expect(build('duck').parts.earL).toBeUndefined()
    expect(build('duck').parts.earR).toBeUndefined()

    expect(build('bunny').parts.tail).toBeDefined()
    expect(build('duck').parts.tail).toBeDefined()
    expect(build('calico').parts.tail).toBeUndefined()
    expect(build('puppy').parts.tail).toBeUndefined()
    expect(build('panda').parts.tail).toBeUndefined()
  })

  it.each(FIGURES)('$key 의 발바닥이 바닥(y=0)에 닿아 있다', (spec) => {
    // 찌부러짐이 바닥을 향해 눌리려면 원점이 발밑이어야 한다
    const { root } = createFigure(spec)
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    expect(box.min.y).toBeGreaterThan(-0.02)
    expect(box.min.y).toBeLessThan(0.06)
  })

  it.each(FIGURES)('$key 는 좌우 대칭이다', (spec) => {
    const { parts } = createFigure(spec)
    expect(parts.armL.position.x).toBeCloseTo(-parts.armR.position.x, 6)
    expect(parts.legL.position.x).toBeCloseTo(-parts.legR.position.x, 6)
    expect(parts.eyeL.position.x).toBeCloseTo(-parts.eyeR.position.x, 6)
    expect(parts.armL.position.x).toBeGreaterThan(0)
  })

  it.each(FIGURES)('$key 는 카메라(+Z)를 향한다 — 눈과 주둥이가 앞면에 붙는다', (spec) => {
    const { parts } = createFigure(spec)
    expect(parts.eyeL.position.z).toBeGreaterThan(0)
    expect(parts.snout.position.z).toBeGreaterThan(0)
  })

  it.each(FIGURES)('$key 의 팔은 어깨에서 아래로 늘어진다', (spec) => {
    // 피벗이 어깨에 있어야 z 회전만으로 팔이 들린다. 손끝이 어깨보다 낮으면 그렇게 된 것이다
    const { root, parts } = createFigure(spec)
    root.updateMatrixWorld(true)
    const shoulder = new Vector3()
    const hand = new Vector3()
    parts.armL.getWorldPosition(shoulder)
    parts.handL.getWorldPosition(hand)
    expect(hand.y).toBeLessThan(shoulder.y - 0.2)
    // 가만히 있을 때 팔은 바깥으로 살짝 벌어진다
    expect(hand.x).toBeGreaterThan(shoulder.x)
  })

  it.each(FIGURES)('$key 는 머리가 몸통보다 크다 — 이 세트의 비율', (spec) => {
    const { parts } = createFigure(spec)
    const headBox = new Box3().setFromObject(parts.head)
    const torsoOnly = parts.torso.children.find((child) => child !== parts.head)
    expect(torsoOnly).toBeDefined()
    const torsoBox = new Box3().setFromObject(torsoOnly as Group)
    const headWidth = headBox.max.x - headBox.min.x
    const torsoWidth = torsoBox.max.x - torsoBox.min.x
    expect(headWidth).toBeGreaterThan(torsoWidth * 1.4)
  })

  it('종마다 실제 키가 다르다 — 토끼는 귀 때문에 가장 크다', () => {
    const heights = Object.fromEntries(FIGURES.map((spec) => [spec.key, createFigure(spec).height]))
    for (const key of ['calico', 'puppy', 'panda', 'duck']) {
      expect(heights.bunny).toBeGreaterThan(heights[key])
    }
  })

  it('배율을 적용하면 5종이 모두 같은 높이가 된다', () => {
    for (const spec of FIGURES) {
      const figure = createFigure(spec)
      const stand = new Group()
      stand.scale.setScalar(scaleFigureToStandardHeight(figure))
      stand.add(figure.root)
      stand.updateMatrixWorld(true)
      const box = new Box3().setFromObject(stand)
      expect(box.max.y - box.min.y).toBeCloseTo(FIGURE_STANDARD_HEIGHT, 3)
    }
  })

  it('삼색 고양이의 두 귀는 그쪽 머리 무늬 색을 따라간다', () => {
    const { parts, materials } = build('calico')
    // 왼쪽(화면 왼쪽, -x) 귀는 검정, 오른쪽은 주황
    const earR = parts.earR.children[0] as unknown as Mesh
    const earL = parts.earL.children[0] as unknown as Mesh
    expect(earR.material).toBe(materials.markA)
    expect(earL.material).toBe(materials.markB)
  })

  it('판다는 팔다리가 검고 머리는 희다', () => {
    const { parts, materials } = build('panda')
    const arm = parts.armL.children[0] as unknown as Mesh
    const leg = parts.legL.children[0] as unknown as Mesh
    const skull = parts.head.children[0] as unknown as Mesh
    expect(arm.material).toBe(materials.limb)
    expect(leg.material).toBe(materials.limb)
    expect(skull.material).toBe(materials.body)
  })

  it('버리면 부모에서 떨어진다', () => {
    const figure = build('duck')
    const stand = new Group()
    stand.add(figure.root)
    disposeFigure(figure)
    expect(figure.root.parent).toBeNull()
  })
})
