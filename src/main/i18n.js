/**
 * 메인 프로세스(트레이·우클릭 메뉴·오류 메시지)용 번역기.
 *
 * 렌더러와 같은 JSON 을 읽는다. 언어는 앱 전체가 하나이므로 여기 담아 두고,
 * 설정이 바뀌면 `setLanguage()` 로 갈아끼운다.
 */

const ko = require('../shared/i18n/ko.json')
const en = require('../shared/i18n/en.json')
const ja = require('../shared/i18n/ja.json')
const zh = require('../shared/i18n/zh.json')

const DICTIONARIES = { ko, en, ja, zh }
const DEFAULT_LANGUAGE = 'en'

const LANGUAGES = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
]

/** 이미 고른 값 → 운영체제 로캘 → 영어 순으로 쓸 언어를 정한다 */
function resolveLanguage(preference, osLocale = '') {
  if (preference && DICTIONARIES[preference]) return preference
  const head = String(osLocale).toLowerCase().split(/[-_]/)[0]
  return DICTIONARIES[head] ? head : DEFAULT_LANGUAGE
}

let current = DEFAULT_LANGUAGE

function setLanguage(language) {
  current = DICTIONARIES[language] ? language : DEFAULT_LANGUAGE
  return current
}

const getLanguage = () => current

function t(key, params) {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    params[name] === undefined ? whole : String(params[name]),
  )
}

module.exports = { t, setLanguage, getLanguage, resolveLanguage, LANGUAGES, DEFAULT_LANGUAGE }
