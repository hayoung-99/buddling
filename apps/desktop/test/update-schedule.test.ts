import { describe, it, expect, vi } from 'vitest'
import { CHECK_HOUR, dayKey, isDue, startMorningSchedule } from '../src/main/update-schedule'

/** 그날 그 시각의 로컬 시간 */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, day, hour, minute)

describe('dayKey', () => {
  it('로컬 날짜를 YYYY-MM-DD 로 적는다', () => {
    expect(dayKey(at(3, 9))).toBe('2026-08-03')
    expect(dayKey(at(31, 23, 59))).toBe('2026-08-31')
  })

  it('같은 날이면 시각이 달라도 같은 값이다', () => {
    expect(dayKey(at(13, 9))).toBe(dayKey(at(13, 23)))
  })

  it('UTC 가 아니라 로컬 날짜를 쓴다 — 아침인지 아닌지는 쓰는 사람 시계로 정해진다', () => {
    // toISOString().slice(0,10) 을 썼다면 시간대에 따라 하루 어긋난다
    const lateNight = at(13, 23, 30)
    expect(dayKey(lateNight)).toBe('2026-08-13')
  })
})

describe('isDue', () => {
  it('아침 전에는 보지 않는다', () => {
    expect(isDue(at(13, CHECK_HOUR - 1), null)).toBe(false)
    expect(isDue(at(13, 0), null)).toBe(false)
  })

  it('아침이 되고 오늘 아직 안 봤으면 본다', () => {
    expect(isDue(at(13, CHECK_HOUR), null)).toBe(true)
    expect(isDue(at(13, CHECK_HOUR), '2026-08-12')).toBe(true)
  })

  it('오늘 이미 봤으면 다시 보지 않는다', () => {
    expect(isDue(at(13, CHECK_HOUR), '2026-08-13')).toBe(false)
    expect(isDue(at(13, 23), '2026-08-13')).toBe(false)
  })

  it('아침을 놓치고 밤에 켜도 본다 — 건너뛰면 영영 확인하지 않는 사람이 생긴다', () => {
    expect(isDue(at(13, 22), '2026-08-11')).toBe(true)
  })

  it('날이 바뀌면 다시 본다', () => {
    expect(isDue(at(14, CHECK_HOUR), '2026-08-13')).toBe(true)
  })
})

describe('startMorningSchedule', () => {
  /** 시각을 마음대로 옮길 수 있는 가짜 시계와 저장소 */
  function harness(startAt: Date, lastDay: string | null = null) {
    let clock = startAt
    let stored: string | null = lastDay
    const onDue = vi.fn()

    const schedule = startMorningSchedule({
      onDue,
      readLastDay: () => stored,
      writeLastDay: (day) => {
        stored = day
      },
      now: () => clock,
      tickMs: 60_000,
    })

    return {
      onDue,
      schedule,
      get stored() {
        return stored
      },
      moveTo(next: Date) {
        clock = next
        schedule.tick()
      },
    }
  }

  it('켤 때 이미 아침이 지났으면 바로 한 번 본다', () => {
    const h = harness(at(13, 10))
    expect(h.onDue).toHaveBeenCalledTimes(1)
    expect(h.stored).toBe('2026-08-13')
    h.schedule.stop()
  })

  it('아침 전에 켜면 기다렸다가 아침에 본다', () => {
    const h = harness(at(13, 7))
    expect(h.onDue).not.toHaveBeenCalled()

    h.moveTo(at(13, 8, 59))
    expect(h.onDue).not.toHaveBeenCalled()

    h.moveTo(at(13, CHECK_HOUR))
    expect(h.onDue).toHaveBeenCalledTimes(1)
    h.schedule.stop()
  })

  it('하루에 한 번만 본다 — 몇 번을 깨어나도', () => {
    const h = harness(at(13, 9))
    expect(h.onDue).toHaveBeenCalledTimes(1)

    for (const hour of [10, 13, 17, 22]) h.moveTo(at(13, hour))
    expect(h.onDue).toHaveBeenCalledTimes(1)
    h.schedule.stop()
  })

  it('날이 바뀌면 다시 본다', () => {
    const h = harness(at(13, 9))
    h.moveTo(at(14, 9))
    expect(h.onDue).toHaveBeenCalledTimes(2)
    h.schedule.stop()
  })

  it('어제 봤다고 저장돼 있으면 오늘 아침에 다시 본다 (앱을 껐다 켠 경우)', () => {
    const h = harness(at(13, 9, 30), '2026-08-12')
    expect(h.onDue).toHaveBeenCalledTimes(1)
    h.schedule.stop()
  })

  it('오늘 봤다고 저장돼 있으면 다시 켜도 보지 않는다', () => {
    const h = harness(at(13, 14), '2026-08-13')
    expect(h.onDue).not.toHaveBeenCalled()
    h.schedule.stop()
  })

  it('부르기 전에 날짜를 적는다 — 확인이 실패해도 오늘은 더 조르지 않는다', () => {
    let stored: string | null = null
    const seen: (string | null)[] = []
    const schedule = startMorningSchedule({
      onDue: () => seen.push(stored),
      readLastDay: () => stored,
      writeLastDay: (day) => {
        stored = day
      },
      now: () => at(13, 9),
      tickMs: 60_000,
    })

    expect(seen).toEqual(['2026-08-13'])
    schedule.stop()
  })

  it('멈춘 뒤에는 보지 않는다', () => {
    const h = harness(at(13, 7))
    h.schedule.stop()
    h.moveTo(at(13, 12))
    expect(h.onDue).not.toHaveBeenCalled()
  })
})
