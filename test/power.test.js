import { describe, it, expect } from 'vitest'
import { POWER_LEVELS, DEFAULT_POWER, resolvePower, powerProfile } from '../src/shared/power'

describe('절전 단계 목록', () => {
  it('부드러운 것부터 아끼는 것까지 세 단계다', () => {
    expect(POWER_LEVELS).toEqual(['smooth', 'balanced', 'saver'])
  })

  it('기본값은 균형이고, 목록 안에 있다', () => {
    expect(DEFAULT_POWER).toBe('balanced')
    expect(POWER_LEVELS).toContain(DEFAULT_POWER)
  })

  it('모든 단계에 프로필이 있다', () => {
    for (const level of POWER_LEVELS) {
      const profile = powerProfile(level)
      expect(profile.idleFps).toBeGreaterThan(0)
      expect(profile.activeFps).toBeGreaterThan(0)
      expect(typeof profile.idleShadows).toBe('boolean')
      expect(profile.pixelRatioCap).toBeGreaterThan(0)
    }
  })
})

describe('resolvePower', () => {
  it('아는 단계는 그대로 돌려준다', () => {
    for (const level of POWER_LEVELS) expect(resolvePower(level)).toBe(level)
  })

  it('모르는 값은 기본 단계로 떨어뜨린다 — 저장 파일이 깨져도 앱이 뜬다', () => {
    for (const bad of [undefined, null, '', 'turbo', 42, {}]) {
      expect(resolvePower(bad)).toBe(DEFAULT_POWER)
    }
  })
})

describe('단계마다 실제로 덜 그린다', () => {
  const smooth = powerProfile('smooth')
  const balanced = powerProfile('balanced')
  const saver = powerProfile('saver')

  it('아낄수록 가만히 있을 때 프레임이 줄어든다', () => {
    expect(smooth.idleFps).toBeGreaterThan(balanced.idleFps)
    expect(balanced.idleFps).toBeGreaterThan(saver.idleFps)
  })

  it('부드럽게 단계만 화면 주사율을 그대로 따른다', () => {
    expect(smooth.idleFps).toBe(Infinity)
    expect(Number.isFinite(balanced.idleFps)).toBe(true)
    expect(Number.isFinite(saver.idleFps)).toBe(true)
  })

  it('찔렸을 때는 어느 단계에서도 넉넉하게 그린다 — 반응이 굼떠 보이면 안 된다', () => {
    for (const level of POWER_LEVELS) {
      expect(powerProfile(level).activeFps).toBeGreaterThanOrEqual(60)
    }
  })

  it('부드럽게 단계에서만 가만히 있을 때도 그림자를 다시 그린다', () => {
    expect(smooth.idleShadows).toBe(true)
    expect(balanced.idleShadows).toBe(false)
    expect(saver.idleShadows).toBe(false)
  })

  it('절약 단계만 해상도를 낮춘다', () => {
    expect(smooth.pixelRatioCap).toBe(balanced.pixelRatioCap)
    expect(saver.pixelRatioCap).toBeLessThan(balanced.pixelRatioCap)
  })
})
