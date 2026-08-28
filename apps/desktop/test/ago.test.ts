import { describe, it, expect } from 'vitest'
import { ago } from '../src/renderer/notifications/ago'
import { createTranslator } from '@buddling/shared/i18n'

const t = createTranslator('ko')
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('ago — 알림 줄의 경과 시각', () => {
  it('음수(기기 시계가 서버보다 뒤처짐)는 방금으로 적는다', () => {
    expect(ago(1000, 0, t)).toBe('방금')
  })

  it('1분 미만은 방금으로 적는다', () => {
    expect(ago(0, 30_000, t)).toBe('방금')
  })

  it('1분 ~ 1시간은 분 단위로 적는다', () => {
    expect(ago(0, 12 * MIN, t)).toBe('12분 전')
  })

  it('1시간 ~ 24시간은 시간 단위로 적는다', () => {
    expect(ago(0, 3 * HOUR, t)).toBe('3시간 전')
  })

  it('24시간 ~ 48시간은 어제로 적는다', () => {
    expect(ago(0, 30 * HOUR, t)).toBe('어제')
    expect(ago(0, 24 * HOUR, t)).toBe('어제')
  })

  it('48시간 이상은 일 단위로 적는다 (floor(시간 / 24))', () => {
    expect(ago(0, 48 * HOUR, t)).toBe('2일 전')
    expect(ago(0, 5 * DAY + HOUR, t)).toBe('5일 전')
  })

  it('7일이 다 되어도 일 단위로 적는다 — 최대가 이레라 이 눈금 하나로 끝까지 덮인다', () => {
    expect(ago(0, 7 * DAY - 1, t)).toBe('6일 전')
  })
})
