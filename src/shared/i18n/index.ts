/**
 * 여러 나라 말 지원.
 *
 * 문자열은 언어별 JSON 한 벌씩이고, 열쇠(key)는 네 언어가 똑같아야 한다.
 * 그래야 어느 하나가 빠졌을 때 테스트가 잡아낸다.
 *
 * 이 파일은 렌더러(ESM)용이고, 메인 프로세스는 같은 JSON 을 읽는 `src/main/i18n.js` 를 쓴다.
 */

import ko from './ko.json' with { type: 'json' }
import en from './en.json' with { type: 'json' }
import ja from './ja.json' with { type: 'json' }
import zh from './zh.json' with { type: 'json' }

/** 사전 한 벌. 열쇠는 네 언어가 같아야 하고, 어긋나면 `test/i18n.test.js` 가 잡는다. */
export type Dictionary = Record<string, string>

export const DICTIONARIES: Record<string, Dictionary> = { ko, en, ja, zh }

export type LanguageCode = 'ko' | 'en' | 'ja' | 'zh'

/** 고를 수 있는 언어. 이름은 그 언어로 적는다 — 못 읽는 말로 적혀 있으면 고를 수 없다. */
export const LANGUAGES: ReadonlyArray<{ code: LanguageCode; name: string }> = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

/** 열쇠와 `{빈칸}` 을 받아 지금 언어의 문장을 만든다 */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * 쓸 언어를 정한다.
 * 이미 고른 값이 있으면 그대로, 없으면 운영체제 로캘(ko-KR, zh-Hans-CN …)을 보고,
 * 그마저 지원하지 않는 말이면 영어로 간다.
 */
export function resolveLanguage(
  preference: string | null | undefined,
  osLocale: string = '',
): string {
  if (preference && DICTIONARIES[preference]) return preference

  const head = String(osLocale).toLowerCase().split(/[-_]/)[0]
  return DICTIONARIES[head] ? head : DEFAULT_LANGUAGE
}

/**
 * 번역기를 만든다.
 * 없는 열쇠는 열쇠 그대로 돌려준다 — 화면에서 바로 눈에 띄어 빠뜨린 걸 찾기 쉽다.
 */
export function createTranslator(language: string | null | undefined): Translate {
  const dictionary = DICTIONARIES[language ?? ''] ?? DICTIONARIES[DEFAULT_LANGUAGE]

  return function t(key, params) {
    const template = dictionary[key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (whole, name) =>
      params[name] === undefined ? whole : String(params[name]),
    )
  }
}
