import { describe, it, expect } from 'vitest'
import { allToggle } from '../src/main/pet-hiding'

describe('트레이 "모두" 항목 — allToggle()', () => {
  it('방이 없으면 모두 숨기기로 두되 누르지 못하게 한다', () => {
    expect(allToggle([])).toEqual({ action: 'hide', enabled: false })
  })

  it('셋 다 보이면 모두 숨기기를 내놓는다', () => {
    expect(allToggle([{ hidden: false }, { hidden: false }, { hidden: false }])).toEqual({
      action: 'hide',
      enabled: true,
    })
  })

  it('하나라도 보이면 여전히 모두 숨기기다', () => {
    expect(allToggle([{ hidden: true }, { hidden: true }, { hidden: false }])).toEqual({
      action: 'hide',
      enabled: true,
    })
  })

  it('셋 다 숨었으면 모두 보이기를 내놓는다', () => {
    expect(allToggle([{ hidden: true }, { hidden: true }, { hidden: true }])).toEqual({
      action: 'show',
      enabled: true,
    })
  })

  it('방이 하나뿐이고 숨었으면 모두 보이기다', () => {
    expect(allToggle([{ hidden: true }])).toEqual({ action: 'show', enabled: true })
  })
})
