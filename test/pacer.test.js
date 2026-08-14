import { describe, it, expect } from 'vitest'
import { createPacer, MAX_STEP } from '../src/renderer/pet/pacer'

/** 화면이 fps 로 delta 를 주는 상황을 흉내 낸다 */
const frame = (hz) => 1 / hz

/** count 번 기회를 주고, 실제로 그린 횟수와 넘어간 시간의 합을 센다 */
function run(pacer, { hz, fps, frames }) {
  let drawn = 0
  let total = 0
  for (let index = 0; index < frames; index += 1) {
    const step = pacer.tick(frame(hz), fps)
    if (step !== null) {
      drawn += 1
      total += step
    }
  }
  return { drawn, total }
}

describe('createPacer', () => {
  it('60Hz 화면에서 30프레임을 목표하면 절반만 그린다', () => {
    const { drawn } = run(createPacer(), { hz: 60, fps: 30, frames: 60 })
    expect(drawn).toBe(30)
  })

  it('120Hz 화면에서도 목표한 30프레임만 그린다 — 주사율이 높다고 더 일하지 않는다', () => {
    const { drawn } = run(createPacer(), { hz: 120, fps: 30, frames: 120 })
    expect(drawn).toBe(30)
  })

  it('가장 아끼는 10프레임에서는 60Hz 화면의 여섯 번 중 한 번만 그린다', () => {
    const { drawn } = run(createPacer(), { hz: 60, fps: 10, frames: 60 })
    expect(drawn).toBe(10)
  })

  it('Infinity 면 기회가 올 때마다 전부 그린다', () => {
    const { drawn } = run(createPacer(), { hz: 60, fps: Infinity, frames: 60 })
    expect(drawn).toBe(60)
  })

  it('건너뛴 시간을 모아서 넘기므로 애니메이션 속도가 느려지지 않는다', () => {
    const { total } = run(createPacer(), { hz: 60, fps: 30, frames: 60 })
    // 60Hz 로 60번이면 1초. 30프레임으로 줄여도 흘려보낸 시간의 합은 그대로 1초여야 한다.
    expect(total).toBeCloseTo(1, 5)
  })

  it('절전에서 깨어나 delta 가 몇 시간이어도 한 번에 넘기는 시간은 잘린다', () => {
    const pacer = createPacer()
    expect(pacer.tick(3 * 60 * 60, 30)).toBe(MAX_STEP)
  })

  it('reset 하면 쌓아 둔 시간이 사라져 다음 프레임이 곧바로 나가지 않는다', () => {
    const pacer = createPacer()
    pacer.tick(frame(60), 30) // 아직 모자라서 건너뜀
    pacer.reset()
    expect(pacer.tick(frame(60), 30)).toBeNull()
  })

  it('첫 기회부터 목표 간격을 넘겼으면 바로 그린다', () => {
    expect(createPacer().tick(frame(10), 30)).toBeCloseTo(frame(10), 5)
  })

  it('fps 를 도중에 바꾸면 그 다음 기회부터 새 간격을 따른다', () => {
    const pacer = createPacer()
    run(pacer, { hz: 60, fps: 10, frames: 6 }) // 여기까지 1번 그림
    const { drawn } = run(pacer, { hz: 60, fps: Infinity, frames: 6 })
    expect(drawn).toBe(6)
  })
})
