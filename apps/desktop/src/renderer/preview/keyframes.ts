/**
 * 키프레임 편집기의 계산 부분.
 *
 * Three.js 도 DOM 도 부르지 않는 순수 함수만 둔다. 편집기 화면은 이 결과를 그리기만
 * 하므로, **도구가 맞게 구는지는 브라우저 없이 `test/keyframes.test.ts` 가 지킨다.**
 *
 * 가장 값을 하는 것은 `serializeTrack()` 이다. 뽑아낸 소스가 `animations.ts` 에 지금
 * 적혀 있는 것과 **글자까지 같아야** 이 도구를 믿고 쓸 수 있다 — 불러왔다 그대로
 * 다시 뽑았을 때 원본이 나오지 않으면, 다듬은 결과도 어딘가 어긋나 있다는 뜻이다.
 */

import { sampleTrack, easing } from '../pet/tween'
import type { Keyframe, EasingName } from '../pet/tween'

/** 키와 키 사이의 최소 간격(초). 두 키가 같은 시각에 겹치면 보간할 구간이 없어진다. */
export const MIN_GAP = 0.01

/**
 * 기본값이 1인 필드들. 나머지는 전부 0이 중립이다.
 *
 * `sx`·`sy` 는 부피 배율이라 1이 "안 늘어나고 안 찌부러진 상태" 다.
 */
const NEUTRAL_ONE = new Set(['sx', 'sy'])

export const neutralOf = (field: string): number => (NEUTRAL_ONE.has(field) ? 1 : 0)

/** 소수점 넷째 자리까지만 남긴다. 슬라이더가 만드는 긴 꼬리를 자르는 용도다. */
export const round4 = (value: number): number => Math.round(value * 10000) / 10000

/**
 * 소스에 적히는 모양 그대로 숫자를 찍는다.
 *
 * `animations.ts` 는 정수도 `1.0` 처럼 소수점을 달아 두었다. 한 줄 안에서 자릿수가
 * 들쭉날쭉하면 열이 어긋나 읽기 나빠지기 때문이라, 뽑을 때도 그 결을 따른다.
 */
export function formatNumber(value: number): string {
  const rounded = round4(value)
  // -0 은 그냥 0으로 찍는다. `-0.0` 이 소스에 남으면 눈에 걸린다.
  const text = String(Object.is(rounded, -0) ? 0 : rounded)
  return text.includes('.') ? text : `${text}.0`
}

/** 시간순으로 세우고 음수 시각을 막는다. */
export function normalizeKeys(keys: Keyframe[]): Keyframe[] {
  return keys
    .map((key) => ({ ...key, t: Math.max(0, round4(key.t as number)) }))
    .sort((a, b) => (a.t as number) - (b.t as number))
}

/**
 * 키 하나를 옮길 수 있는 시간 범위 — 양옆 키 사이.
 *
 * 편집기가 이 값으로 슬라이더를 잠근다. 순서가 뒤집히는 것을 **막는 쪽**이 나중에
 * 정렬해 주는 것보다 낫다. 정렬은 사용자가 방금 끌던 키를 말없이 다른 자리로
 * 보내 버리는데, 그러면 무엇을 만지고 있었는지 놓친다.
 */
export function timeBounds(keys: Keyframe[], index: number): { min: number; max: number } {
  const previous = keys[index - 1]
  const next = keys[index + 1]
  return {
    min: previous ? round4((previous.t as number) + MIN_GAP) : 0,
    // 마지막 키에는 뒤 이웃이 없다. 마지막 키의 시각이 곧 동작의 길이라 늘릴 수 있어야 한다.
    max: next ? round4((next.t as number) - MIN_GAP) : round4((keys[index].t as number) + 5),
  }
}

/**
 * 지금 스크럽 위치에 키를 하나 꽂는다. 값은 그 시각의 보간값으로 채운다.
 *
 * **모양이 아주 조금 바뀐다.** 값은 그대로지만 한 구간이 두 구간으로 갈리면서 곡선이
 * 다시 나뉘기 때문이다 — `linear` 일 때만 정확히 같고, `easeOutBack` 처럼 휘는 곡선은
 * 반씩 나뉘어 원래보다 완만해진다. 꽂고 나서 눈으로 한 번 보는 편이 좋다.
 */
export function insertKeyAt(keys: Keyframe[], fields: string[], t: number): Keyframe[] {
  const at = round4(t)
  const index = keys.findIndex((key) => (key.t as number) > at)
  if (index <= 0) return keys // 첫 키 앞이나 마지막 키 뒤에는 꽂지 않는다
  // 양옆에 너무 붙으면 보간할 구간이 없어진다
  if (at - (keys[index - 1].t as number) < MIN_GAP) return keys
  if ((keys[index].t as number) - at < MIN_GAP) return keys

  const sampled = sampleTrack(keys, fields, at)
  const fresh: Keyframe = { t: at, ease: keys[index].ease }
  for (const field of fields) fresh[field] = round4(sampled[field])

  return [...keys.slice(0, index), fresh, ...keys.slice(index)]
}

/**
 * 키를 지운다. **첫 키와 마지막 키는 지우지 못한다.**
 *
 * 양끝이 있어야 동작의 시작과 끝이 정해지고, 폴짝·춤처럼 유닛을 이어 붙이는 것은
 * 그 양끝이 맞물려야 이음매가 튀지 않는다.
 */
export function removeKey(keys: Keyframe[], index: number): Keyframe[] {
  if (index <= 0 || index >= keys.length - 1) return keys
  return [...keys.slice(0, index), ...keys.slice(index + 1)]
}

/** 양끝이 중립이 아닌 필드 이름들. 편집기는 막지 않고 **경고만** 띄운다. */
export function neutralWarnings(keys: Keyframe[], fields: string[]): string[] {
  const first = keys[0]
  const last = keys[keys.length - 1]
  return fields.filter((field) => {
    const neutral = neutralOf(field)
    return (
      Math.abs((first[field] as number) - neutral) > 1e-6 ||
      Math.abs((last[field] as number) - neutral) > 1e-6
    )
  })
}

export const EASING_NAMES = Object.keys(easing) as EasingName[]

/**
 * `animations.ts` 에 그대로 붙여 넣을 소스를 만든다.
 *
 * 필드 순서는 `t` → 그 동작의 필드들 → `ease` 다. 소스가 이미 그 순서라, 불러왔다
 * 그대로 뽑으면 원본과 같은 글자가 나온다.
 *
 * **되살리지 못하는 것이 하나 있다.** `DANCE_UNIT` 의 `// ── 왼쪽으로 ──` 처럼 키와
 * 키 사이에 홀로 서서 구간을 나누는 주석 줄이다. 편집기는 소스를 파싱하지 않고 모듈을
 * 불러 값만 가져오므로 그런 줄이 있었다는 사실 자체를 모른다. 줄 끝 주석은 메모 칸이
 * 대신하지만, 구간 주석은 붙여 넣은 뒤 손으로 다시 적어야 한다.
 */
export function serializeTrack(
  name: string,
  keys: Keyframe[],
  fields: string[],
  memos: Record<number, string> = {},
): string {
  const lines = keys.map((key, index) => {
    const pairs = [
      `t: ${formatNumber(key.t as number)}`,
      ...fields.map((field) => `${field}: ${formatNumber(key[field] as number)}`),
      `ease: '${key.ease ?? 'easeInOutQuad'}'`,
    ]
    const memo = memos[index]?.trim()
    return `  { ${pairs.join(', ')} },${memo ? ` // ${memo}` : ''}`
  })

  return [`const ${name}: Keyframe[] = [`, ...lines, ']'].join('\n')
}
