/**
 * 땅을 박차는 순간 잡기.
 *
 * 캐릭터 창과 미리보기의 편집기가 이 규칙을 함께 쓴다. 한쪽에만 있으면 편집기에서
 * 다듬은 동작이 앱에서 다르게 터지는데, 그건 도구를 못 믿게 만드는 종류의 어긋남이다.
 */

import { describe, it, expect, vi } from 'vitest'
import { createTakeoff, FULL_KICK_SPEED } from '../src/renderer/pet/takeoff'

const STEP = 1 / 60

describe('박차는 순간', () => {
  it('땅에 붙어 있는 동안에는 터지지 않는다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    for (let index = 0; index < 10; index += 1) takeoff.watch(0, STEP, true)
    expect(kick).not.toHaveBeenCalled()
  })

  it('높이가 0에서 위로 넘어갈 때 한 번 터진다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    takeoff.watch(0, STEP, true)
    takeoff.watch(0.03, STEP, true)
    expect(kick).toHaveBeenCalledTimes(1)
  })

  it('떠 있는 동안에는 다시 터지지 않는다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    for (const lift of [0, 0.03, 0.1, 0.2, 0.3, 0.25, 0.1]) takeoff.watch(lift, STEP, true)
    expect(kick).toHaveBeenCalledTimes(1)
  })

  it('착지했다가 다시 뛰면 또 터진다 — 폴짝 세 번이면 세 번', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    for (let hop = 0; hop < 3; hop += 1) {
      for (const lift of [0, 0.04, 0.2, 0.04, 0]) takeoff.watch(lift, STEP, true)
    }
    expect(kick).toHaveBeenCalledTimes(3)
  })

  it('이미 떠 있는 채로 지켜보기 시작하면 터지지 않는다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    // 첫 표본이 공중이다. 0에서 올라온 것이 아니므로 박찬 것이 아니다.
    for (const lift of [0.25, 0.3, 0.28]) takeoff.watch(lift, STEP, true)
    expect(kick).not.toHaveBeenCalled()
  })

  it('내려오는 길에는 터지지 않는다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    for (const lift of [0.3, 0.2, 0.1, 0]) takeoff.watch(lift, STEP, true)
    expect(kick).not.toHaveBeenCalled()
  })
})

describe('폴짝일 때만 본다', () => {
  it('춤처럼 통통 튀는 것에는 터지지 않는다 — 여기서 새기 가장 쉽다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (const lift of [0, 0.05, 0.12, 0.05, 0]) takeoff.watch(lift, STEP, false)
    }
    expect(kick).not.toHaveBeenCalled()
  })

  it('춤 도중에 폴짝으로 갈아타도 첫 박참을 놓치지 않는다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    // 춤추다 공중에 떠 있는 채로 갈아탄다
    for (const lift of [0, 0.05, 0.12]) takeoff.watch(lift, STEP, false)
    // 갈아탄 뒤 폴짝은 0에서 시작한다
    takeoff.watch(0, STEP, true)
    takeoff.watch(0.04, STEP, true)
    expect(kick).toHaveBeenCalledTimes(1)
  })
})

describe('세기', () => {
  it('빠르게 솟을수록 세다', () => {
    const seen: number[] = []
    const takeoff = createTakeoff((strength) => seen.push(strength))

    takeoff.watch(0, STEP, true)
    takeoff.watch(FULL_KICK_SPEED * STEP * 0.5, STEP, true)
    takeoff.reset()
    takeoff.watch(0, STEP, true)
    takeoff.watch(FULL_KICK_SPEED * STEP, STEP, true)

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBeCloseTo(0.5, 4)
    expect(seen[1]).toBeCloseTo(1, 4)
  })

  it('아무리 빨라도 1을 넘지 않는다', () => {
    const seen: number[] = []
    const takeoff = createTakeoff((strength) => seen.push(strength))
    takeoff.watch(0, STEP, true)
    takeoff.watch(FULL_KICK_SPEED * STEP * 9, STEP, true)
    expect(seen[0]).toBe(1)
  })

  it('프레임이 크게 밀려도 세기가 튀지 않는다', () => {
    const seen: number[] = []
    const takeoff = createTakeoff((strength) => seen.push(strength))
    // 창이 잠깐 멈췄다가 돌아온 것처럼 큰 step 이 들어온다
    takeoff.watch(0, 0.5, true)
    takeoff.watch(0.4, 0.5, true)
    expect(seen[0]).toBeLessThanOrEqual(1)
    expect(seen[0]).toBeGreaterThan(0)
  })

  it('reset 뒤에는 땅에 닿는 것을 다시 한 번 보고서야 센다', () => {
    const kick = vi.fn()
    const takeoff = createTakeoff(kick)
    for (const lift of [0, 0.04, 0.2]) takeoff.watch(lift, STEP, true)
    expect(kick).toHaveBeenCalledTimes(1)

    takeoff.reset()
    takeoff.watch(0.2, STEP, true) // 첫 표본은 기록만 한다
    expect(kick).toHaveBeenCalledTimes(1)

    for (const lift of [0, 0.04]) takeoff.watch(lift, STEP, true)
    expect(kick).toHaveBeenCalledTimes(2)
  })
})
