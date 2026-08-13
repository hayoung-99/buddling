/**
 * 설정 창.
 *
 * 지금 여기 있는 것은 둘이다 — 절전 강도와 언어.
 *
 * 절전 강도를 사용자에게 맡기는 이유: 이 앱은 컴퓨터를 켠 순간부터 끌 때까지 떠 있다.
 * 그래서 "가만히 있을 때 얼마나 게으르게 굴 것인가"가 곧 배터리와 팬 소리를 정하는데,
 * 그 균형점은 사람마다 다르다. 데스크톱에서는 부드러운 쪽이, 이동 중인 노트북에서는
 * 아끼는 쪽이 맞다.
 */

import { createTranslator, LANGUAGES } from '../../shared/i18n/index.js'
import { POWER_LEVELS, resolvePower } from '../../shared/power.js'
import { el, createRenderer, languagePicker } from '../team/ui.js'

const render = createRenderer(document.getElementById('app'))

let state = null
/** 지금 언어로 문장을 만드는 함수. 상태가 올 때마다 새로 만든다. */
let t = createTranslator('en')

/** 라디오 한 줄. 이름표 전체가 눌리는 카드다. */
function choice({ level, current }) {
  return el('label', { class: 'choice' }, [
    el('input', {
      type: 'radio',
      name: 'power',
      value: level,
      checked: level === current ? '' : null,
      onchange: () => window.settingsApi.setPower(level),
    }),
    el('div', { class: 'text' }, [
      el('div', { class: 'name', text: t(`power.${level}`) }),
      el('div', { class: 'desc', text: t(`power.${level}Hint`) }),
    ]),
  ])
}

function powerSection() {
  const current = resolvePower(state.power)
  return el('section', {}, [
    el('h2', { text: t('settings.power') }),
    el('p', { class: 'hint', text: t('settings.powerHint') }),
    el('div', { class: 'choices' }, POWER_LEVELS.map((level) => choice({ level, current }))),
  ])
}

function languageSection() {
  const picker = languagePicker({
    languages: LANGUAGES,
    current: state.language,
    label: t('language.label'),
    onPick: (code) => window.settingsApi.setLanguage(code),
  })
  // 고르는 칸이 자기 이름표를 함께 그리므로 여기서 제목을 또 붙이지 않는다
  picker.classList.add('settings-language')
  return el('section', {}, [picker])
}

function draw() {
  if (!state) return
  t = createTranslator(state.language)
  document.title = t('settings.title')
  render([el('h1', { text: t('settings.title') }), powerSection(), languageSection()])
}

window.settingsApi.onState((next) => {
  state = next
  draw()
})

window.settingsApi.getState().then((next) => {
  state = next
  draw()
})
