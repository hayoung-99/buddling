/**
 * 신호 종류.
 *
 * 여기서 지키는 것은 **모르는 값이 들어와도 아무 일도 안 일어나지는 않는다**는 약속이다.
 * 옛 버전이 보낸 것에는 신호 필드가 없고, 반대로 신호를 더하고 나면 아직 업데이트하지
 * 않은 쪽은 처음 보는 이름을 받는다. 그때 조용히 멈춰 버리면 보낸 사람은 자기 신호가
 * 갔는지 알 길이 없다.
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_SIGNAL, SIGNALS, toSignal } from '@buddling/shared/signals'

describe('아는 신호', () => {
  it.each(SIGNALS)('%s 는 그대로 지나간다', (kind) => {
    expect(toSignal(kind)).toBe(kind)
  })

  it('기본 신호는 콕이다 — 아무것도 고르지 않은 사람이 보내는 것', () => {
    expect(DEFAULT_SIGNAL).toBe('poke')
    expect(SIGNALS).toContain(DEFAULT_SIGNAL)
  })
})

describe('모르는 값은 기본 춤으로 떨어뜨린다', () => {
  it.each([
    ['없음(옛 버전이 보낸 것)', undefined],
    ['빈 값', null],
    ['빈 문자열', ''],
    ['아직 없는 신호', 'flop'],
    ['오타', 'Hop'],
    ['엉뚱한 타입', 42],
    ['객체', { kind: 'hop' }],
  ])('%s', (_label, value) => {
    expect(toSignal(value)).toBe(DEFAULT_SIGNAL)
  })
})
