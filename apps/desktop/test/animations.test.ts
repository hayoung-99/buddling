import { describe, it, expect } from 'vitest'
import {
  buildHopTimeline,
  buildDanceTimeline,
  sampleHop,
  sampleDance,
  sampleTwitch,
  createAnimator,
  TWITCH_DURATION,
  DANCE_CYCLE,
} from '../src/renderer/pet/animations'
import { sampleTrack, createSpring, easing, clamp } from '../src/renderer/pet/tween'
import type { Keyframe } from '../src/renderer/pet/tween'
import { createCritter, scaleToStandardHeight } from '../src/renderer/pet/critter'
import { CHARACTERS, getCharacter } from '@buddling/shared/characters'

describe('sampleTrack', () => {
  const keys = [
    { t: 0, v: 0 },
    { t: 1, v: 10, ease: 'linear' },
  ] satisfies Keyframe[]

  it('구간 밖에서는 양 끝 값으로 고정된다', () => {
    expect(sampleTrack(keys, ['v'], -5).v).toBe(0)
    expect(sampleTrack(keys, ['v'], 99).v).toBe(10)
  })

  it('구간 안에서는 지정한 곡선으로 보간한다', () => {
    expect(sampleTrack(keys, ['v'], 0.5).v).toBeCloseTo(5)
  })
})

describe('easing', () => {
  it.each(Object.entries(easing))('%s 는 0에서 시작해 1에서 끝난다', (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 5)
    expect(fn(1)).toBeCloseTo(1, 5)
  })

  it('easeOutBack 은 목표를 살짝 넘었다가 돌아온다', () => {
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => easing.easeOutBack(i / 49)))
    expect(peak).toBeGreaterThan(1)
  })
})

describe('createSpring', () => {
  it('시간이 지나면 목표값에 수렴한다', () => {
    const spring = createSpring({ value: 0 })
    for (let i = 0; i < 200; i += 1) spring.update(1, 1 / 60)
    expect(spring.value).toBeCloseTo(1, 2)
  })

  it('목표에 곧바로 도달하지 않는다 — 이 지연이 귀·꼬리를 살아있게 만든다', () => {
    const spring = createSpring({ value: 0 })
    spring.update(1, 1 / 60)
    expect(spring.value).toBeGreaterThan(0)
    expect(spring.value).toBeLessThan(1)
  })
})

describe('폴짝 타임라인', () => {
  const timeline = buildHopTimeline(3)

  it('폴짝 3번이 1.5~2초 안에 끝난다', () => {
    expect(timeline.duration).toBeGreaterThan(1.4)
    expect(timeline.duration).toBeLessThan(2.0)
  })

  it('시작과 끝은 바닥에서 원래 자세다', () => {
    const start = sampleHop(timeline, 0)
    const end = sampleHop(timeline, timeline.duration)
    for (const frame of [start, end]) {
      expect(frame.y).toBeCloseTo(0, 5)
      expect(frame.sx).toBeCloseTo(1, 5)
      expect(frame.sy).toBeCloseTo(1, 5)
    }
  })

  it('뛰기 직전에 웅크린다 (예비동작)', () => {
    const crouch = sampleHop(timeline, 0.09)
    expect(crouch.sy).toBeLessThan(0.9) // 세로로 눌리고
    expect(crouch.sx).toBeGreaterThan(1.1) // 가로로 퍼진다
    expect(crouch.y).toBeCloseTo(0, 5) // 아직 바닥
  })

  it('정점에서 가장 높이 뜨고, 그때는 몸이 늘어나 있지 않다', () => {
    const apex = sampleHop(timeline, 0.34)
    expect(apex.y).toBeCloseTo(1, 2)
    expect(apex.sy).toBeCloseTo(1, 1)
  })

  it('착지 순간 찌부러진다', () => {
    const land = sampleHop(timeline, 0.52)
    expect(land.y).toBeCloseTo(0, 5)
    expect(land.sy).toBeLessThan(0.85)
    expect(land.sx).toBeGreaterThan(1.1)
  })

  it('공중에 있는 동안은 항상 바닥보다 위에 있다', () => {
    for (let t = 0.2; t < 0.45; t += 0.01) {
      expect(sampleHop(timeline, t).y).toBeGreaterThan(0)
    }
  })

  it('폴짝마다 높이가 낮아진다 (감쇠)', () => {
    const peaks = []
    let current = 0
    for (let t = 0; t <= timeline.duration; t += 0.005) {
      const { y } = sampleHop(timeline, t)
      current = Math.max(current, y)
      if (y < 0.001 && current > 0.01) {
        peaks.push(current)
        current = 0
      }
    }
    expect(peaks).toHaveLength(3)
    expect(peaks[1]).toBeLessThan(peaks[0])
    expect(peaks[2]).toBeLessThan(peaks[1])
  })

  it('부피는 대략 보존된다 — 눌릴 때 옆으로 퍼진다', () => {
    for (let t = 0; t <= timeline.duration; t += 0.01) {
      const { sx, sy } = sampleHop(timeline, t)
      expect(sx * sx * sy).toBeGreaterThan(0.85)
      expect(sx * sx * sy).toBeLessThan(1.15)
    }
  })
})

describe('createAnimator', () => {
  const makeAnimator = () => createAnimator(createCritter(getCharacter('bunny')))

  it('평소에는 점프 중이 아니고 바닥에 붙어 있다', () => {
    const critter = createCritter(getCharacter('bunny'))
    const animator = createAnimator(critter)
    animator.update(1 / 60)
    expect(animator.isHopping).toBe(false)
    expect(critter.root.position.y).toBeCloseTo(0, 5)
  })

  it('hop() 을 부르면 실제로 떠오른다', () => {
    const critter = createCritter(getCharacter('bunny'))
    const animator = createAnimator(critter)
    animator.hop()
    for (let i = 0; i < 20; i += 1) animator.update(1 / 60) // 약 0.33초 = 정점 부근
    expect(animator.isHopping).toBe(true)
    expect(critter.root.position.y).toBeGreaterThan(0.1)
  })

  it('점프가 끝나면 원래 자세로 돌아온다', () => {
    const critter = createCritter(getCharacter('bunny'))
    const animator = createAnimator(critter)
    animator.hop()
    for (let i = 0; i < 140; i += 1) animator.update(1 / 60) // 2.3초
    expect(animator.isHopping).toBe(false)
    expect(critter.root.position.y).toBeCloseTo(0, 5)
    expect(critter.root.scale.y).toBeCloseTo(1, 1)
  })

  it('귀가 없는 캐릭터에서도 터지지 않는다', () => {
    const critter = createCritter(getCharacter('duck'))
    const animator = createAnimator(critter)
    animator.hop()
    expect(() => {
      for (let i = 0; i < 140; i += 1) animator.update(1 / 60)
    }).not.toThrow()
  })

  it('눈 깜빡임은 눈을 완전히 감기지 않고 되돌린다', () => {
    const animator = makeAnimator()
    expect(() => {
      for (let i = 0; i < 1200; i += 1) animator.update(1 / 60) // 20초
    }).not.toThrow()
  })
})

describe('clamp', () => {
  it('범위를 벗어난 값을 잘라낸다', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('종마다 뛰는 높이', () => {
  it('화면에서 보이는 점프 높이가 5종 모두 같다', () => {
    // 캐릭터는 모두 같은 키로 축소·확대되어 놓이므로, 점프도 그 배율을 거쳐
    // 화면에 나타난다. 종마다 다르면 머리 위 말풍선이 겹치거나 멀어진다.
    const peaks = CHARACTERS.map((spec) => {
      const critter = createCritter(spec)
      const animator = createAnimator(critter)
      const scale = scaleToStandardHeight(critter)
      animator.hop()

      let peak = 0
      for (let i = 0; i < 40; i += 1) {
        animator.update(1 / 60)
        peak = Math.max(peak, critter.root.position.y * scale)
      }
      return peak
    })

    for (const peak of peaks) expect(peak).toBeCloseTo(peaks[0], 4)
    expect(peaks[0]).toBeGreaterThan(0.4)
  })
})

describe('움찔 (내가 클릭했을 때)', () => {
  it('시작과 끝은 원래 자세다', () => {
    for (const t of [0, TWITCH_DURATION]) {
      const frame = sampleTwitch(t)
      expect(frame.sx).toBeCloseTo(1, 5)
      expect(frame.sy).toBeCloseTo(1, 5)
      expect(frame.tilt).toBeCloseTo(0, 5)
    }
  })

  it('한쪽으로 기우는 게 아니라 좌우로 떤다', () => {
    const tilts = Array.from({ length: 60 }, (_, i) => sampleTwitch((i / 59) * TWITCH_DURATION).tilt)
    expect(Math.max(...tilts)).toBeGreaterThan(0.03)
    expect(Math.min(...tilts)).toBeLessThan(-0.03)
  })

  it('흔들림이 점점 잦아든다', () => {
    const early = Math.abs(sampleTwitch(0.06).tilt)
    const late = Math.abs(sampleTwitch(0.38).tilt)
    expect(late).toBeLessThan(early)
  })

  it('0.5초 안에 끝난다 — 클릭할 때마다 나오므로 짧아야 한다', () => {
    expect(TWITCH_DURATION).toBeLessThan(0.5)
  })

  it('움찔은 제자리에서만 일어난다 (뛰지 않는다)', () => {
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)
    animator.twitch()
    for (let i = 0; i < 30; i += 1) {
      animator.update(1 / 60)
      expect(critter.root.position.y).toBeCloseTo(0, 5)
    }
  })

  it('twitch() 후 잠깐 움찔했다가 원래 자세로 돌아온다', () => {
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)
    animator.twitch()
    expect(animator.isTwitching).toBe(true)

    animator.update(0.06)
    expect(critter.root.scale.x).toBeGreaterThan(1.03) // 옆으로 퍼졌다

    for (let i = 0; i < 60; i += 1) animator.update(1 / 60)
    expect(animator.isTwitching).toBe(false)
    expect(critter.root.scale.x).toBeCloseTo(1, 1)
    expect(critter.root.scale.y).toBeCloseTo(1, 1)
  })

  it('점프와 움찔이 동시에 일어나도 서로를 지우지 않는다', () => {
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)
    animator.hop()
    animator.twitch()

    for (let i = 0; i < 20; i += 1) animator.update(1 / 60)
    expect(animator.isHopping).toBe(true)
    expect(critter.root.position.y).toBeGreaterThan(0.1) // 뛰고 있고

    for (let i = 0; i < 120; i += 1) animator.update(1 / 60)
    expect(animator.isHopping).toBe(false)
    expect(animator.isTwitching).toBe(false)
    expect(critter.root.scale.y).toBeCloseTo(1, 1) // 둘 다 깔끔하게 끝난다
  })
})

describe('연달아 찔릴 때', () => {
  it('추는 도중 dance()를 다시 부르면 처음부터 다시 시작한다', () => {
    // 그래서 pet.js 는 "이미 추는 중이면 무시" 로 막는다.
    // 여러 명이 동시에 찔러도 춤이 매번 튕겨 되감기지 않고 한 번으로 보인다.
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)

    animator.dance()
    for (let i = 0; i < 16; i += 1) animator.update(1 / 60) // 왼쪽 끝 부근
    const swung = Math.abs(critter.root.position.x)
    expect(swung).toBeGreaterThan(0.05)

    animator.dance()
    animator.update(1 / 60)
    expect(Math.abs(critter.root.position.x)).toBeLessThan(swung) // 가운데서 다시 시작
  })
})

describe('춤 (팀원이 찔렀을 때)', () => {
  const timeline = buildDanceTimeline(2)

  it('2바퀴가 예전 점프와 비슷한 1.7초쯤 걸린다', () => {
    expect(timeline.duration).toBeCloseTo(2 * DANCE_CYCLE, 5)
    expect(timeline.duration).toBeGreaterThan(1.4)
    expect(timeline.duration).toBeLessThan(2.0)
  })

  it('시작과 끝은 제자리·중립 자세다', () => {
    for (const t of [0, timeline.duration]) {
      const frame = sampleDance(timeline, t)
      expect(frame.x).toBeCloseTo(0, 5)
      expect(frame.y).toBeCloseTo(0, 5)
      expect(frame.tilt).toBeCloseTo(0, 5)
      expect(frame.arm).toBeCloseTo(0, 5)
      expect(frame.spread).toBeCloseTo(0, 5)
      expect(frame.sx).toBeCloseTo(1, 5)
      expect(frame.sy).toBeCloseTo(1, 5)
    }
  })

  it('왼쪽과 오른쪽으로 고르게 오간다', () => {
    const xs = []
    for (let t = 0; t <= timeline.duration; t += 0.01) xs.push(sampleDance(timeline, t).x)
    expect(Math.min(...xs)).toBeLessThan(-0.9)
    expect(Math.max(...xs)).toBeGreaterThan(0.9)
    // 한쪽으로 치우쳐 흘러가지 않는다
    expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(0.1)
  })

  it('바퀴가 반복돼도 세기가 줄지 않는다 — 끝까지 신나게 춘다', () => {
    const firstPeak = sampleDance(timeline, 0.26).x
    const secondPeak = sampleDance(timeline, DANCE_CYCLE + 0.26).x
    expect(secondPeak).toBeCloseTo(firstPeak, 5)
  })

  it('몸이 기우는 방향과 도는 방향이 짝을 이룬다', () => {
    // 왼쪽으로 갈 때와 오른쪽으로 갈 때 기울기 부호가 반대여야 흔들림으로 보인다
    const left = sampleDance(timeline, 0.26)
    const right = sampleDance(timeline, 0.68)
    expect(Math.sign(left.tilt)).toBe(-Math.sign(right.tilt))
    expect(Math.sign(left.arm)).toBe(-Math.sign(right.arm))
    expect(Math.sign(left.step)).toBe(-Math.sign(right.step))
  })

  it('땅을 딛는 순간마다 몸이 눌린다', () => {
    for (const t of [0.26, 0.68]) {
      const frame = sampleDance(timeline, t)
      expect(frame.y).toBeCloseTo(0, 5) // 바닥에 닿아 있고
      expect(frame.sy).toBeLessThan(0.95) // 세로로 눌린다
      expect(frame.sx).toBeGreaterThan(1.05)
    }
  })

  it('부피는 대략 보존된다', () => {
    for (let t = 0; t <= timeline.duration; t += 0.01) {
      const { sx, sy } = sampleDance(timeline, t)
      expect(sx * sx * sy).toBeGreaterThan(0.9)
      expect(sx * sx * sy).toBeLessThan(1.1)
    }
  })
})

describe('춤을 실제로 캐릭터에 입혔을 때', () => {
  const play = (frames: number, prepare: (animator: ReturnType<typeof createAnimator>) => void) => {
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)
    prepare(animator)
    for (let i = 0; i < frames; i += 1) animator.update(1 / 60)
    return { critter, animator }
  }

  it('dance() 를 부르면 좌우로 실제로 움직인다', () => {
    const { critter, animator } = play(16, (a) => a.dance())
    expect(animator.isDancing).toBe(true)
    expect(Math.abs(critter.root.position.x)).toBeGreaterThan(0.05)
  })

  it('그동안 팔이 벌어지고 한쪽 발이 들린다', () => {
    const { critter } = play(10, (a) => a.dance()) // 왼쪽으로 튀어오르는 중
    expect(Math.abs(critter.parts.armL.rotation.z)).toBeGreaterThan(0.1)
    expect(critter.parts.legL.position.y).toBeGreaterThan(critter.parts.legR.position.y)
  })

  it('춤이 끝나면 정확히 제자리로 돌아온다 — 계속 찔려도 캐릭터가 흘러가지 않는다', () => {
    const { critter, animator } = play(140, (a) => a.dance())
    expect(animator.isDancing).toBe(false)
    expect(critter.root.position.x).toBeCloseTo(0, 5)
    expect(critter.root.position.y).toBeCloseTo(0, 5)
    expect(critter.parts.armL.rotation.z).toBeCloseTo(0, 5)
    expect(critter.parts.legL.position.y).toBeCloseTo(critter.parts.legR.position.y, 5)
  })

  it('여러 번 이어서 춰도 원점이 밀리지 않는다', () => {
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)
    for (let round = 0; round < 3; round += 1) {
      animator.dance()
      for (let i = 0; i < 140; i += 1) animator.update(1 / 60)
      expect(critter.root.position.x).toBeCloseTo(0, 5)
    }
  })

  it('춤과 움찔이 동시에 일어나도 서로를 지우지 않는다', () => {
    const critter = createCritter(getCharacter('cat'))
    const animator = createAnimator(critter)
    animator.dance()
    animator.twitch()

    animator.update(0.06)
    expect(animator.isDancing).toBe(true)
    expect(animator.isTwitching).toBe(true)

    for (let i = 0; i < 140; i += 1) animator.update(1 / 60)
    expect(animator.isDancing).toBe(false)
    expect(animator.isTwitching).toBe(false)
    expect(critter.root.position.x).toBeCloseTo(0, 5)
    expect(critter.root.scale.y).toBeCloseTo(1, 1)
  })

  it('팔·다리가 없는 캐릭터에서도 터지지 않는다', () => {
    expect(() => play(140, (a) => a.dance())).not.toThrow()
    const duck = createCritter(getCharacter('duck'))
    const animator = createAnimator(duck)
    animator.dance()
    expect(() => {
      for (let i = 0; i < 140; i += 1) animator.update(1 / 60)
    }).not.toThrow()
  })
})
