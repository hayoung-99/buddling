import { describe, it, expect } from 'vitest'
import { nextDefaultName } from '../src/main/default-name'
import { createTranslator, DICTIONARIES } from '@tap-tap/shared/i18n'

const CODES = Object.keys(DICTIONARIES)

/** 한국어 사전과 같은 모양의 형식기 */
const ko = (n: number) => `이름없음 ${n}`

describe('이름 없이 만든 방의 이름', () => {
  it('아무 방도 없으면 1번이다', () => {
    expect(nextDefaultName(ko, [])).toBe('이름없음 1')
  })

  it('이미 1번이 있으면 2번을 준다', () => {
    expect(nextDefaultName(ko, ['이름없음 1'])).toBe('이름없음 2')
  })

  it('사용자가 지은 이름은 번호를 밀지 않는다', () => {
    expect(nextDefaultName(ko, ['디자인', '나오리와 친구들'])).toBe('이름없음 1')
  })

  // 방을 나가면 그 번호가 비는데, 그 자리를 다시 쓰는 편이 번호가 끝없이 커지는 것보다 낫다.
  it('가운데가 비면 그 번호를 먼저 쓴다', () => {
    expect(nextDefaultName(ko, ['이름없음 1', '이름없음 3'])).toBe('이름없음 2')
  })

  it('앞뒤 공백은 같은 이름으로 본다', () => {
    expect(nextDefaultName(ko, ['  이름없음 1  '])).toBe('이름없음 2')
  })

  it('언어가 달라도 규칙은 같다 — 형식만 갈아끼운다', () => {
    const en = (n: number) => `Untitled ${n}`
    expect(nextDefaultName(en, ['Untitled 1'])).toBe('Untitled 2')
  })

  it.each(CODES)('%s 사전으로도 번호가 붙는다', (code) => {
    const t = createTranslator(code)
    const format = (n: number) => t('form.teamNameDefault', { n })

    const first = nextDefaultName(format, [])
    // 열쇠를 그대로 돌려받았다면 사전에 문장이 없다는 뜻이다
    expect(first).not.toBe('form.teamNameDefault')
    expect(first).toContain('1')
    expect(nextDefaultName(format, [first])).not.toBe(first)
  })
})
