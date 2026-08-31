import { describe, it, expect } from 'vitest'
import {
  PET_BASE_SIZE,
  MIN_SCALE,
  MAX_SCALE,
  clampScale,
  petSizeFor,
  nextPetBounds,
  sizePanelPosition,
} from '../src/main/pet-size'
import type { Rect } from '../src/main/pet-size'

/** 넉넉한 가상 모니터 하나 */
const WIDE = { x: 0, y: 0, width: 2560, height: 1440 }

const boundsFor = (scale: number, { x = 1000, y = 700 } = {}) => ({
  x,
  y,
  ...petSizeFor(scale),
})
const bottomCenter = (b: Rect) => ({ x: b.x + b.width / 2, y: b.y + b.height })

describe('clampScale', () => {
  it('허용 범위를 벗어난 값을 잘라낸다', () => {
    expect(clampScale(5)).toBe(MAX_SCALE)
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(1.25)).toBe(1.25)
  })

  it('숫자가 아니면 기본 크기로 되돌린다 — 저장 파일이 깨져도 앱이 뜬다', () => {
    // 일부러 잘못된 값을 먹인다 — 저장 파일이 깨졌을 때를 흉내 내는 것이 이 검사의 요지다
    for (const bad of [undefined, null, NaN, 'big']) {
      expect(clampScale(bad as number)).toBe(1)
    }
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

describe('sizePanelPosition', () => {
  const PANEL = { width: 244, height: 56 }
  // pet-size.ts 의 상수와 같은 값. 창의 raw 위/아랫변이 아니라 이 비율로 재야
  // 스케일이 달라도 캐릭터와의 간격이 그대로인지 검증할 수 있다.
  const HEAD_TOP_FRACTION = 0.317
  const FEET_BOTTOM_FRACTION = 0.7985

  it(
    '아래에 자리가 있으면 발밑 바로 아래 8px 간격에 붙는다 — ' +
      '창의 raw 아랫변이 아니다(그 아래로 그림자용 여백이 더 있다)',
    () => {
      // 스케일이 달라도(발밑 위치가 창 raw 아랫변과 얼마나 떨어져 있는지가 창
      // 크기에 비례해 달라져도) 발밑에서부터의 간격은 늘 8px 이어야 한다.
      const gaps = [0.25, 1, 2].map((scale) => {
        const pet = boundsFor(scale, { x: 1000, y: 200 })
        const { y } = sizePanelPosition({ pet, panel: PANEL, workArea: WIDE })
        const feetBottom = pet.y + pet.height * FEET_BOTTOM_FRACTION
        return y - feetBottom
      })

      for (const gap of gaps) expect(gap).toBeCloseTo(8, 0)
    },
  )

  it(
    '아래에 자리가 없어 위로 옮길 때, 스케일이 달라도 캐릭터(머리)와의 간격이 그대로다 — ' +
      '창 맨 꼭대기를 기준으로 삼으면 스케일이 클수록 카메라 구도의 머리 위 여백까지 ' +
      '함께 늘어나 패널이 캐릭터와 멀어져 보인다',
    () => {
      // 발밑 바로 아래(gap 포함)조차 들어갈 자리가 없도록 화면을 발밑 높이에
      // 딱 맞춰 잘라 둔다 — 스케일이 달라도 늘 위로 튕기게 만든다.
      const gaps = [0.25, 1, 2].map((scale) => {
        const size = petSizeFor(scale)
        const pet = { x: 1000, y: 200, ...size }
        const feetBottom = pet.y + pet.height * FEET_BOTTOM_FRACTION
        const workArea = {
          x: 0,
          y: 0,
          width: 2560,
          height: Math.floor(feetBottom + 8 + PANEL.height) - 1,
        }
        const { y } = sizePanelPosition({ pet, panel: PANEL, workArea })
        // 머리 위 끝(HEAD_TOP_FRACTION 만큼 창 위에서 내려온 지점)과 패널 아랫변 사이 간격
        const headTop = pet.y + pet.height * HEAD_TOP_FRACTION
        return headTop - (y + PANEL.height)
      })

      for (const gap of gaps) expect(gap).toBeCloseTo(8, 0)
    },
  )

  it('화면 가장자리를 넘지 않도록 되민다', () => {
    const pet = { x: 0, y: 0, ...PET_BASE_SIZE }
    const { x, y } = sizePanelPosition({ pet, panel: PANEL, workArea: WIDE })
    expect(x).toBeGreaterThanOrEqual(WIDE.x)
    expect(y).toBeGreaterThanOrEqual(WIDE.y)
  })
})
