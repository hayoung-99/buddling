import { describe, it, expect } from 'vitest'
import {
  DICTIONARIES,
  LANGUAGES,
  DEFAULT_LANGUAGE,
  resolveLanguage,
  createTranslator,
} from '@tap-tap/shared/i18n'
import { CHARACTER_KEYS } from '@tap-tap/shared/characters'

const CODES = Object.keys(DICTIONARIES)

describe('사전', () => {
  it('고르는 칸에는 실제 언어만 있다 — 시스템 설정 같은 항목은 없다', () => {
    expect(LANGUAGES.every((l) => DICTIONARIES[l.code])).toBe(true)
    expect(LANGUAGES.map((l) => l.code)).not.toContain('auto')
  })

  it('고를 수 있는 언어가 모두 사전을 갖고 있다', () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(CODES.sort())
    expect(CODES).toContain(DEFAULT_LANGUAGE)
  })

  it.each(CODES)('%s 사전에 빠진 열쇠가 없다', (code) => {
    // 기본 언어를 기준으로 삼는다. 하나라도 빠지면 그 자리에 열쇠가 그대로 보인다.
    const missing = Object.keys(DICTIONARIES[DEFAULT_LANGUAGE]).filter(
      (key) => !(key in DICTIONARIES[code]),
    )
    expect(missing).toEqual([])
  })

  it.each(CODES)('%s 사전에 남는 열쇠가 없다', (code) => {
    const extra = Object.keys(DICTIONARIES[code]).filter(
      (key) => !(key in DICTIONARIES[DEFAULT_LANGUAGE]),
    )
    expect(extra).toEqual([])
  })

  it.each(CODES)('%s 사전의 빈칸({이름})이 기본 언어와 같다', (code) => {
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, base] of Object.entries(DICTIONARIES[DEFAULT_LANGUAGE])) {
      expect(slots(DICTIONARIES[code][key]), `${code} / ${key}`).toEqual(slots(base))
    }
  })

  it.each(CODES)('%s 사전에 빈 문장이 없다', (code) => {
    const blank = Object.entries(DICTIONARIES[code])
      .filter(([, value]) => !String(value).trim())
      .map(([key]) => key)
    expect(blank).toEqual([])
  })

  it.each(CODES)('%s 에 캐릭터 이름이 다 있다', (code) => {
    for (const key of CHARACTER_KEYS) {
      expect(DICTIONARIES[code][`character.${key}`], `${code} / ${key}`).toBeTruthy()
    }
  })
})

describe('처음 실행할 때 쓸 언어 정하기', () => {
  it.each([
    ['ko-KR', 'ko'],
    ['en-US', 'en'],
    ['ja-JP', 'ja'],
    ['zh-Hans-CN', 'zh'],
    ['zh_TW', 'zh'],
  ])('%s → %s', (locale, expected) => {
    expect(resolveLanguage(null, locale)).toBe(expected)
  })

  it('지원하지 않는 말이면 영어로 간다', () => {
    expect(DEFAULT_LANGUAGE).toBe('en')
    expect(resolveLanguage(null, 'fr-FR')).toBe('en')
    expect(resolveLanguage(null, 'de-DE')).toBe('en')
    expect(resolveLanguage(null, '')).toBe('en')
  })

  it('아직 안 골랐을 때만 운영체제 언어를 본다', () => {
    expect(resolveLanguage(null, 'ja-JP')).toBe('ja')
    expect(resolveLanguage(undefined, 'ko-KR')).toBe('ko')
  })

  it('한 번 고른 뒤에는 운영체제 설정을 무시한다', () => {
    expect(resolveLanguage('ja', 'ko-KR')).toBe('ja')
    expect(resolveLanguage('en', 'zh-CN')).toBe('en')
  })

  it('저장된 값이 이상하면 운영체제 설정으로 돌아간다', () => {
    expect(resolveLanguage('kl', 'ko-KR')).toBe('ko')
    expect(resolveLanguage('kl', 'fr-FR')).toBe('en')
  })
})

describe('번역기', () => {
  it('빈칸을 채운다', () => {
    const t = createTranslator('ko')
    expect(t('list.members', { count: 2, max: 5 })).toBe('멤버 2/5명')
  })

  it.each(CODES)('%s 에서도 빈칸이 남지 않는다', (code) => {
    const t = createTranslator(code)
    expect(t('list.members', { count: 2, max: 5 })).not.toContain('{')
    expect(t('error.TEAM_LIMIT_REACHED', { maxTeams: 3 })).not.toContain('{')
  })

  it('없는 열쇠는 열쇠 그대로 돌려준다 — 빠뜨린 걸 화면에서 바로 알아채려고', () => {
    expect(createTranslator('ko')('없는.열쇠')).toBe('없는.열쇠')
  })

  it('모르는 언어를 주면 기본 언어로 답한다', () => {
    expect(createTranslator('xx')('list.title')).toBe(DICTIONARIES[DEFAULT_LANGUAGE]['list.title'])
  })
})
