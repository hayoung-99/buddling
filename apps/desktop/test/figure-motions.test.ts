import { describe, it, expect } from 'vitest'
import { Box3, Vector3 } from 'three'
import { FIGURES, getFigure } from '../src/renderer/figures/specs'
import { createFigure } from '../src/renderer/figures/figure'
import {
  FIGURE_MOTION_FIELDS,
  FIGURE_MOTION_REST,
  FIGURE_MOTION_UNITS,
  FIGURE_HOP_COUNT,
  FIGURE_DANCE_CYCLES,
  buildFigureHop,
  buildFigureDance,
  createFigureAnimator,
  motionDuration,
} from '../src/renderer/figures/motions'
import type { FigureMotion } from '../src/renderer/figures/motions'

const MOTIONS = Object.keys(FIGURE_MOTION_UNITS) as FigureMotion[]

describe('피규어 동작 트랙', () => {
  it.each(MOTIONS)('%s 의 키는 시간 순이고 모든 필드를 채운다', (motion) => {
    const keys = FIGURE_MOTION_UNITS[motion]
    const fields = FIGURE_MOTION_FIELDS[motion]
    for (let index = 1; index < keys.length; index += 1) {
      expect(keys[index].t).toBeGreaterThan(keys[index - 1].t)
    }
    for (const key of keys) {
      for (const field of fields) expect(typeof key[field], `${motion} t=${key.t} ${field}`).toBe('number')
    }
  })

  it.each(MOTIONS)('%s 는 중립에서 시작해 중립으로 끝난다 — 이어 붙여도 이음매가 안 튄다', (motion) => {
    const keys = FIGURE_MOTION_UNITS[motion]
    const rest = FIGURE_MOTION_REST[motion]
    for (const [field, value] of Object.entries(rest)) {
      expect(keys[0][field]).toBeCloseTo(value, 6)
      expect(keys[keys.length - 1][field]).toBeCloseTo(value, 6)
    }
  })

  it('폴짝은 두 번째가 더 낮고 조금 빠르다', () => {
    const timeline = buildFigureHop(FIGURE_HOP_COUNT)
    const unitEnd = motionDuration(FIGURE_MOTION_UNITS.hop)
    expect(timeline.duration).toBeGreaterThan(unitEnd)
    expect(timeline.duration).toBeLessThan(unitEnd * FIGURE_HOP_COUNT)
    const peaks = timeline.keys.map((key) => key.y as number).filter((y) => y > 0.5)
    expect(peaks).toHaveLength(FIGURE_HOP_COUNT)
    expect(peaks[0]).toBe(1)
    expect(peaks[1]).toBeLessThan(1)
  })

  it('춤은 바퀴 수만큼 길어지고 힘이 빠지지 않는다', () => {
    const timeline = buildFigureDance(FIGURE_DANCE_CYCLES)
    expect(timeline.duration).toBeCloseTo(motionDuration(FIGURE_MOTION_UNITS.dance) * FIGURE_DANCE_CYCLES, 6)
    const farLeft = timeline.keys.filter((key) => key.x === -1)
    expect(farLeft.length).toBe(FIGURE_DANCE_CYCLES)
  })
})

describe('createFigureAnimator', () => {
  const make = (key = 'calico') => {
    const figure = createFigure(getFigure(key))
    return { figure, animator: createFigureAnimator(figure) }
  }

  it('동작이 끝나면 기본 자세로 돌아온다', () => {
    const { figure, animator } = make()
    for (const motion of MOTIONS) {
      animator.play(motion)
      expect(animator.isBusy).toBe(true)
      for (let t = 0; t < animator.durations[motion] + 0.2; t += 1 / 60) animator.update(1 / 60)
      expect(animator.isBusy).toBe(false)
      expect(figure.root.position.x).toBeCloseTo(0, 6)
      expect(figure.root.position.y).toBeCloseTo(0, 6)
      expect(figure.root.scale.y).toBeCloseTo(1, 1)
    }
  })

  it('폴짝 정점에서는 떠 있고 다리가 뒤로 접힌다', () => {
    const { figure, animator } = make()
    animator.scrub('hop', 0.34)
    expect(figure.root.position.y).toBeGreaterThan(figure.height * 0.2)
    expect(figure.parts.legL.rotation.x).toBeGreaterThan(0.5)
    animator.scrub('hop', animator.durations.hop - 0.001)
    expect(figure.root.position.y).toBeCloseTo(0, 2)
  })

  it.each(FIGURES)('$key 가 손을 흔들면 손이 턱보다 높이, 머리를 뚫지 않고 올라간다', (spec) => {
    // 관절 있는 팔의 값어치가 이것이다 — 어깨를 옮기지 않아도 팔이 실루엣 밖으로 나온다.
    // 머리가 몸보다 커서 꼭대기까지는 못 가지만, 턱 옆 실루엣 바깥에는 와야 읽힌다.
    const figure = createFigure(spec)
    const animator = createFigureAnimator(figure)
    figure.root.updateMatrixWorld(true)
    const shoulder = new Vector3()
    figure.parts.armL.getWorldPosition(shoulder)
    const headCenter = new Vector3()
    figure.parts.head.getWorldPosition(headCenter)
    const skull = figure.parts.head.children[0]
    const headBox = new Box3().setFromObject(skull)
    const [a, b] = [(headBox.max.x - headBox.min.x) / 2, (headBox.max.y - headBox.min.y) / 2]

    const hand = new Vector3()
    // 흔드는 내내(들린 뒤부터 내리기 전까지) 확인한다
    for (const t of [0.3, 0.45, 0.6, 0.75, 0.9]) {
      animator.scrub('wave', t)
      figure.root.updateMatrixWorld(true)
      figure.parts.handL.getWorldPosition(hand)
      expect(hand.y, `${spec.key} t=${t}`).toBeGreaterThan(headBox.min.y)
      expect(hand.y, `${spec.key} t=${t}`).toBeGreaterThan(shoulder.y + 0.15)
      // 머리 타원 밖에 있다 (정규화 거리 > 1)
      const distance = Math.hypot((hand.x - headCenter.x) / a, (hand.y - headCenter.y) / b)
      expect(distance, `${spec.key} t=${t}`).toBeGreaterThan(1)
    }
    // 흔드는 팔은 오른팔이 아니라 왼팔(+x)이다
    expect(figure.parts.armR.rotation.z).toBeCloseTo(-figure.armRest, 3)
  })

  it('춤추는 동안 좌우로 움직이고 팔은 서로 반대로 흔들린다', () => {
    const { figure, animator } = make()
    animator.scrub('dance', 0.18)
    expect(figure.root.position.x).toBeLessThan(0)
    expect(figure.parts.armL.rotation.x).toBeLessThan(0)
    expect(figure.parts.armR.rotation.x).toBeGreaterThan(0)
    expect(figure.parts.legL.rotation.x).toBeLessThan(0) // 왼발을 앞으로 든다
    expect(figure.parts.legR.rotation.x).toBeCloseTo(0, 6)

    animator.scrub('dance', 0.63)
    expect(figure.root.position.x).toBeGreaterThan(0)
    expect(figure.parts.legR.rotation.x).toBeLessThan(0)
  })

  it('가만히 있을 때도 호흡으로 부피가 아주 조금 변한다', () => {
    const { figure, animator } = make('puppy')
    const seen = new Set<string>()
    for (let index = 0; index < 120; index += 1) {
      animator.update(1 / 60)
      seen.add(figure.root.scale.y.toFixed(3))
    }
    expect(seen.size).toBeGreaterThan(1)
    // 그래도 숨은 눈에 띄지 않을 만큼 얕다
    expect(Math.abs(figure.root.scale.y - 1)).toBeLessThan(0.05)
  })
})
