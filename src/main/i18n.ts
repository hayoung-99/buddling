/**
 * 메인 프로세스(트레이·우클릭 메뉴·오류 메시지)용 번역기.
 *
 * **로직은 여기 없다.** 사전을 읽고 문장을 만드는 일은 `shared/i18n` 한 곳에만 있고,
 * 이 파일은 "앱이 지금 쓰는 언어" 하나를 들고 있을 뿐이다. 화면은 창마다 번역기를
 * 따로 만들지만 메인은 하나로 족하기 때문이다.
 *
 * 예전에는 같은 로직이 여기에도 한 벌 있었다. 메인이 CommonJS 라 ESM 인 shared 를
 * 부를 수 없었기 때문인데, 한쪽만 고치면 조용히 어긋나는 자리였다. 메인도 ESM 이 된
 * 지금은 그럴 이유가 없다.
 */

import { createTranslator, resolveLanguage, DEFAULT_LANGUAGE, LANGUAGES } from '../shared/i18n'
import type { Translate } from '../shared/i18n'

let current: string = DEFAULT_LANGUAGE
let translate: Translate = createTranslator(current)

/** @returns 실제로 정해진 언어. 모르는 값을 주면 기본 언어로 떨어진다. */
function setLanguage(language: string | null | undefined): string {
  current = resolveLanguage(language)
  translate = createTranslator(current)
  return current
}

const getLanguage = (): string => current

/** 사전이 갈릴 수 있으므로 부를 때마다 지금 번역기에게 묻는다 */
const t: Translate = (key, params) => translate(key, params)

export { t, setLanguage, getLanguage, resolveLanguage, LANGUAGES, DEFAULT_LANGUAGE }
