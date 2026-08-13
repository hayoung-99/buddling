import { describe, it, expect } from 'vitest'
import {
  PET_BASE_SIZE,
  MIN_SCALE,
  MAX_SCALE,
  clampScale,
  petSizeFor,
  nextPetBounds,
} from '../src/main/pet-size.js'

/** 넉넉한 가상 모니터 하나 */
const WIDE = { x: 0, y: 0, width: 2560, height: 1440 }

const boundsFor = (scale, { x = 1000, y = 700 } = {}) => ({ x, y, ...petSizeFor(scale) })
const bottomCenter = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height })

describe('clampScale', () => {
  it('허용 범위를 벗어난 값을 잘라낸다', () => {
    expect(clampScale(5)).toBe(MAX_SCALE)
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(1.25)).toBe(1.25)
  })

  it('숫자가 아니면 기본 크기로 되돌린다 — 저장 파일이 깨져도 앱이 뜬다', () => {
    for (const bad of [undefined, null, NaN, 'big']) expect(clampScale(bad)).toBe(1)
  })
})

describe('petSizeFor', () => {
  it('100%는 기준 크기 그대로다', () => {
    expect(petSizeFor(1)).toEqual(PET_BASE_SIZE)
  })

  it('가로세로 비율이 유지된다 — 비율이 틀어지면 카메라 구도가 깨진다', () => {
    const base = PET_BASE_SIZE.width / PET_BASE_SIZE.height
    for (const scale of [0.5, 0.75, 1.35, 2]) {
      const size = petSizeFor(scale)
      expect(size.width / size.height).toBeCloseTo(base, 2)
    }
  })

  it('키울수록 커지고 줄일수록 작아진다', () => {
    expect(petSizeFor(2).width).toBeGreaterThan(petSizeFor(1).width)
    expect(petSizeFor(0.5).width).toBeLessThan(petSizeFor(1).width)
  })
})

describe('nextPetBounds', () => {
  it('발밑(아래 가운데)이 그대로 있다 — 캐릭터가 제자리에서 자란다', () => {
    const before = boundsFor(1)
    for (const scale of [0.5, 0.8, 1.4, 2]) {
      const after = nextPetBounds({ bounds: before, scale, workArea: WIDE })
      expect(bottomCenter(after).x).toBeCloseTo(bottomCenter(before).x, 0)
      expect(bottomCenter(after).y).toBeCloseTo(bottomCenter(before).y, 0)
    }
  })

  it('키웠다 되돌리면 원래 자리로 돌아온다', () => {
    const start = boundsFor(1)
    const grown = nextPetBounds({ bounds: start, scale: 2, workArea: WIDE })
    const back = nextPetBounds({ bounds: grown, scale: 1, workArea: WIDE })
    expect(back.x).toBe(start.x)
    expect(back.y).toBe(start.y)
  })

  it('화면 오른쪽 끝에서 키워도 밖으로 나가지 않는다', () => {
    // 오른쪽 가장자리에 딱 붙여 둔 상태에서 두 배로 키운다
    const atEdge = { x: WIDE.width - PET_BASE_SIZE.width, y: 700, ...PET_BASE_SIZE }
    const grown = nextPetBounds({ bounds: atEdge, scale: 2, workArea: WIDE })

    expect(grown.x).toBeGreaterThanOrEqual(WIDE.x)
    expect(grown.x + grown.width).toBeLessThanOrEqual(WIDE.x + WIDE.width)
  })

  it('화면 아래 끝에서 키워도 밖으로 나가지 않는다', () => {
    const atBottom = { x: 1000, y: WIDE.height - PET_BASE_SIZE.height, ...PET_BASE_SIZE }
    const grown = nextPetBounds({ bounds: atBottom, scale: 2, workArea: WIDE })

    expect(grown.y).toBeGreaterThanOrEqual(WIDE.y)
    expect(grown.y + grown.height).toBeLessThanOrEqual(WIDE.y + WIDE.height)
  })

  it('원점이 (0,0)이 아닌 보조 모니터에서도 그 모니터 안에 머문다', () => {
    const secondary = { x: 2560, y: -200, width: 1920, height: 1080 }
    const bounds = { x: 2560 + 1920 - PET_BASE_SIZE.width, y: 0, ...PET_BASE_SIZE }
    const grown = nextPetBounds({ bounds, scale: 2, workArea: secondary })

    expect(grown.x).toBeGreaterThanOrEqual(secondary.x)
    expect(grown.x + grown.width).toBeLessThanOrEqual(secondary.x + secondary.width)
    expect(grown.y).toBeGreaterThanOrEqual(secondary.y)
    expect(grown.y + grown.height).toBeLessThanOrEqual(secondary.y + secondary.height)
  })

  it('범위 밖 배율을 줘도 허용 크기 안에서 처리한다', () => {
    const huge = nextPetBounds({ bounds: boundsFor(1), scale: 99, workArea: WIDE })
    expect(huge.width).toBe(petSizeFor(MAX_SCALE).width)
  })
})
