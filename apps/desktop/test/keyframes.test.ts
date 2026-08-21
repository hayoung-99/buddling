/**
 * 키프레임 편집기의 계산 부분.
 *
 * 이 파일의 첫 묶음("왕복")이 이 도구의 값어치를 지킨다. 소스의 트랙을 불러와 손대지
 * 않고 다시 뽑았을 때 **원본과 글자까지 같아야** 한다. 어긋난다면 뽑아낸 것을 붙여
 * 넣는 순간 아무도 의도하지 않은 변경이 함께 들어간다는 뜻이고, 그건 눈으로
 * 알아채기 가장 어려운 종류다.
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  HOP_UNIT,
  DANCE_UNIT,
  TWITCH_UNIT,
  WAVE_UNIT,
  TRACK_FIELDS,
  TRACK_UNITS,
  trackDuration,
  createAnimator,
} from '../src/renderer/pet/animations'
import {
  MIN_GAP,
  formatNumber,
  insertKeyAt,
  neutralOf,
  neutralWarnings,
  normalizeKeys,
  removeKey,
  serializeTrack,
  timeBounds,
} from '../src/renderer/preview/keyframes'
import { sampleTrack } from '../src/renderer/pet/tween'
import type { Keyframe } from '../src/renderer/pet/tween'
import { getCharacter } from '@buddling/shared/characters'
import { createCritter } from '../src/renderer/pet/critter'

/** 소스에 적혀 있는 네 트랙. 이름은 뽑아낸 소스의 상수 이름이 된다. */
const TRACKS = [
  ['HOP_UNIT', HOP_UNIT, TRACK_FIELDS.hop],
  ['DANCE_UNIT', DANCE_UNIT, TRACK_FIELDS.dance],
  ['TWITCH_UNIT', TWITCH_UNIT, TRACK_FIELDS.twitch],
  ['WAVE_UNIT', WAVE_UNIT, TRACK_FIELDS.wave],
] as const

describe('왕복 — 불러왔다 그대로 뽑으면 원본이 나온다', () => {
  it.each(TRACKS)('%s', (name, unit, fields) => {
    const source = serializeTrack(name, unit, [...fields])

    // 소스가 실제로 적어 둔 모양 — 한 줄에 { t: …, …, ease: '…' },
    expect(source.split('\n')).toHaveLength(unit.length + 2)
    expect(source.startsWith(`const ${name}: Keyframe[] = [`)).toBe(true)

    // 다시 읽어 들여 값이 하나도 안 바뀌었는지 본다
    for (const [index, key] of unit.entries()) {
      const line = source.split('\n')[index + 1]
      expect(line).toContain(`t: ${formatNumber(key.t)}`)
      for (const field of fields) {
        expect(line).toContain(`${field}: ${formatNumber(key[field] as number)}`)
      }
      expect(line).toContain(`ease: '${key.ease}'`)
    }
  })

  it('메모를 적으면 그 줄 뒤에 주석으로 붙는다', () => {
    const source = serializeTrack('WAVE_UNIT', WAVE_UNIT, TRACK_FIELDS.wave, {
      2: '손이 머리 위로 올라왔다',
    })
    expect(source.split('\n')[3]).toContain('}, // 손이 머리 위로 올라왔다')
    // 메모가 없는 줄에는 주석이 붙지 않는다
    expect(source.split('\n')[1]).not.toContain('//')
  })

  it('구간을 나누는 홀로 선 주석 줄은 뽑아내지 못한다 — 손으로 다시 붙여야 한다', () => {
    const source = serializeTrack('DANCE_UNIT', DANCE_UNIT, TRACK_FIELDS.dance)
    // 키 개수 + 여는 줄 + 닫는 줄. 그 사이에 낄 자리가 없다.
    expect(source.split('\n')).toHaveLength(DANCE_UNIT.length + 2)
    expect(source).not.toContain('──')
  })

  it('메모가 빈칸뿐이면 주석을 붙이지 않는다', () => {
    const source = serializeTrack('WAVE_UNIT', WAVE_UNIT, TRACK_FIELDS.wave, { 1: '   ' })
    expect(source.split('\n')[2]).not.toContain('//')
  })
})

describe('왕복 — 뽑아낸 소스가 파일에 적힌 것과 같다', () => {
  /**
   * 위 묶음은 메모리에 올라온 배열과 견주지만, 이 묶음은 **소스 파일의 글자**와 견준다.
   * 자릿수를 찍는 방식이나 필드 순서가 어긋나면 여기서 걸린다 — 그런 어긋남은 값이
   * 멀쩡해 보여서 눈으로는 알아채기 가장 어렵다.
   */
  const source = readFileSync(
    new URL('../src/renderer/pet/animations.ts', import.meta.url),
    'utf8',
  )

  /** `const NAME: Keyframe[] = [ … ]` 한 덩어리를 소스에서 떼어 온다 */
  function blockOf(name: string): string {
    const start = source.indexOf(`const ${name}: Keyframe[] = [`)
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf('\n]', start)
    return source.slice(start, end + 2)
  }

  it.each(TRACKS)('%s', (name, unit, fields) => {
    // 소스에는 주석이 두 가지로 붙어 있다 — 줄 끝에 붙는 것과, `// ── 왼쪽으로 ──`
    // 처럼 구간을 나누며 홀로 서는 줄이다. 앞의 것은 편집기의 메모 칸이 되살리지만
    // **뒤의 것은 되살리지 못한다**(`serializeTrack` 참고). 견주기 전에 둘 다 떼어 낸다.
    const fromSource = blockOf(name)
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .map((line) => line.replace(/,\s*\/\/.*$/, ','))
      .join('\n')

    expect(serializeTrack(name, unit, [...fields])).toBe(fromSource)
  })
})

describe('숫자 찍기', () => {
  it('정수에도 소수점을 붙인다 — 소스가 그렇게 적혀 있다', () => {
    expect(formatNumber(0)).toBe('0.0')
    expect(formatNumber(1)).toBe('1.0')
    expect(formatNumber(-2)).toBe('-2.0')
  })

  it('있는 자릿수는 그대로 둔다', () => {
    expect(formatNumber(2.5)).toBe('2.5')
    expect(formatNumber(0.014)).toBe('0.014')
    expect(formatNumber(-0.07)).toBe('-0.07')
  })

  it('슬라이더가 만드는 긴 꼬리는 넷째 자리에서 자른다', () => {
    expect(formatNumber(0.1234567)).toBe('0.1235')
    expect(formatNumber(1 / 3)).toBe('0.3333')
  })

  it('-0 은 0으로 찍는다', () => {
    expect(formatNumber(-0)).toBe('0.0')
    expect(formatNumber(-0.00001)).toBe('0.0')
  })
})

describe('키 옮기기', () => {
  const keys: Keyframe[] = [
    { t: 0, y: 0, ease: 'linear' },
    { t: 0.3, y: 1, ease: 'linear' },
    { t: 0.6, y: 0, ease: 'linear' },
  ]

  it('가운데 키는 양옆 사이에서만 움직인다', () => {
    expect(timeBounds(keys, 1)).toEqual({ min: 0.01, max: 0.59 })
  })

  it('첫 키는 0 아래로 못 간다', () => {
    expect(timeBounds(keys, 0).min).toBe(0)
  })

  it('마지막 키는 뒤로 늘릴 수 있다 — 그 시각이 곧 동작의 길이다', () => {
    expect(timeBounds(keys, 2).max).toBeGreaterThan(0.6)
  })

  it('정렬은 시간순이고 음수 시각은 0으로 잡아 준다', () => {
    const messy: Keyframe[] = [
      { t: 0.5, y: 1 },
      { t: -0.2, y: 0 },
      { t: 0.1, y: 0.5 },
    ]
    expect(normalizeKeys(messy).map((key) => key.t)).toEqual([0, 0.1, 0.5])
  })
})

describe('키 꽂기와 지우기', () => {
  const fields = ['y']
  const keys: Keyframe[] = [
    { t: 0, y: 0, ease: 'linear' },
    { t: 1, y: 1, ease: 'linear' },
  ]

  it('꽂은 자리의 값은 그 시각의 보간값이다', () => {
    const next = insertKeyAt(keys, fields, 0.25)
    expect(next).toHaveLength(3)
    expect(next[1].t).toBe(0.25)
    expect(next[1].y).toBeCloseTo(0.25, 4)
  })

  it('linear 구간에서는 꽂아도 모양이 그대로다', () => {
    const next = insertKeyAt(keys, fields, 0.4)
    for (const t of [0.1, 0.4, 0.7, 0.95]) {
      expect(sampleTrack(next, fields, t).y).toBeCloseTo(sampleTrack(keys, fields, t).y, 6)
    }
  })

  it('꽂은 키는 뒤쪽 키의 곡선을 물려받는다', () => {
    const curved: Keyframe[] = [
      { t: 0, y: 0, ease: 'linear' },
      { t: 1, y: 1, ease: 'easeOutBack' },
    ]
    expect(insertKeyAt(curved, fields, 0.5)[1].ease).toBe('easeOutBack')
  })

  it('양끝 밖이나 너무 붙은 자리에는 꽂지 않는다', () => {
    expect(insertKeyAt(keys, fields, 0)).toHaveLength(2)
    expect(insertKeyAt(keys, fields, 1.5)).toHaveLength(2)
    expect(insertKeyAt(keys, fields, MIN_GAP / 2)).toHaveLength(2)
    expect(insertKeyAt(keys, fields, 1 - MIN_GAP / 2)).toHaveLength(2)
  })

  it('첫 키와 마지막 키는 지워지지 않는다', () => {
    const three = insertKeyAt(keys, fields, 0.5)
    expect(removeKey(three, 0)).toHaveLength(3)
    expect(removeKey(three, 2)).toHaveLength(3)
    expect(removeKey(three, 1)).toHaveLength(2)
  })
})

describe('중립 경고', () => {
  it('sx·sy 의 중립은 1이고 나머지는 0이다', () => {
    expect(neutralOf('sx')).toBe(1)
    expect(neutralOf('sy')).toBe(1)
    expect(neutralOf('tilt')).toBe(0)
    expect(neutralOf('armOne')).toBe(0)
  })

  it('소스의 네 트랙은 전부 양끝이 중립이다', () => {
    for (const [name, unit, fields] of TRACKS) {
      expect({ [name]: neutralWarnings(unit, [...fields]) }).toEqual({ [name]: [] })
    }
  })

  it('양끝이 어긋난 필드만 집어낸다', () => {
    const keys: Keyframe[] = [
      { t: 0, tilt: 0, sx: 1 },
      { t: 1, tilt: 0.3, sx: 1 },
    ]
    expect(neutralWarnings(keys, ['tilt', 'sx'])).toEqual(['tilt'])
  })
})

describe('애니메이터에 갈아끼우기', () => {
  const critter = () => createCritter(getCharacter('cat'))

  it('갈아끼우면 그 동작의 길이가 따라 바뀐다', () => {
    const animator = createAnimator(critter())
    expect(animator.durations.wave).toBeCloseTo(trackDuration(WAVE_UNIT), 6)

    animator.setTrack('wave', [
      { t: 0, armOne: 0, shoulder: 0, tilt: 0, ease: 'linear' },
      { t: 2, armOne: 0, shoulder: 0, tilt: 0, ease: 'linear' },
    ])
    expect(animator.durations.wave).toBeCloseTo(2, 6)
  })

  it('폴짝과 춤은 유닛을 이어 붙인 길이가 나온다', () => {
    const animator = createAnimator(critter(), { hops: 3, cycles: 2 })
    // 춤은 유닛 그대로 2바퀴다
    expect(animator.durations.dance).toBeCloseTo(trackDuration(DANCE_UNIT) * 2, 6)
    // 폴짝은 뒤로 갈수록 빨라지므로 단순히 3배가 아니라 그보다 짧다
    expect(animator.durations.hop).toBeLessThan(trackDuration(HOP_UNIT) * 3)
    expect(animator.durations.hop).toBeGreaterThan(trackDuration(HOP_UNIT))
  })

  it('한 애니메이터를 갈아끼워도 다른 애니메이터는 그대로다', () => {
    const mine = createAnimator(critter())
    const yours = createAnimator(critter())
    mine.setTrack('twitch', [
      { t: 0, sx: 1, sy: 1, tilt: 0, ease: 'linear' },
      { t: 9, sx: 1, sy: 1, tilt: 0, ease: 'linear' },
    ])
    expect(yours.durations.twitch).toBeCloseTo(trackDuration(TWITCH_UNIT), 6)
    // 소스의 상수 자체도 건드리지 않는다
    expect(trackDuration(TRACK_UNITS.twitch)).toBeCloseTo(trackDuration(TWITCH_UNIT), 6)
  })

  it('스크럽은 그 시각의 포즈로 고정하고 재생하지 않는다', () => {
    const animator = createAnimator(critter())
    animator.scrub('wave', 0.28)
    expect(animator.isWaving).toBe(true)

    // 여러 번 스크럽해도 시간이 흘러가지 않는다
    animator.scrub('wave', 0.28)
    animator.scrub('wave', 0.28)
    expect(animator.isWaving).toBe(true)

    animator.stop()
    expect(animator.isWaving).toBe(false)
  })

  it('스크럽 위치가 다르면 포즈도 다르다', () => {
    const one = critter()
    const animator = createAnimator(one)
    animator.scrub('wave', 0.02)
    const early = one.parts.armL?.rotation.z ?? 0
    animator.scrub('wave', 0.28)
    const peak = one.parts.armL?.rotation.z ?? 0
    expect(peak).toBeGreaterThan(early)
  })

  it('동작 길이 밖으로 스크럽해도 마지막 포즈에 머문다', () => {
    const animator = createAnimator(critter())
    animator.scrub('wave', 999)
    expect(animator.isWaving).toBe(true)
  })
})
