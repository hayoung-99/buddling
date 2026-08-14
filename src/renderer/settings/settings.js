/**
 * 설정 창.
 *
 * 지금 여기 있는 것은 둘이다 — 절전 강도와 언어.
 *
 * 화면은 목록과 상세로 나뉘어 있고, 창은 하나다. 설정 하나하나가 짧지 않은 설명을 달고
 * 다니는데(절전은 세 갈래마다 한 줄씩 붙는다) 그걸 한 화면에 다 펼쳐 두면 항목이 늘 때마다
 * 창이 아래로만 길어진다. 그래서 목록에는 이름과 지금 고른 값만 두고, 고르는 일은
 * 눌러서 들어간 화면에서 한다.
 *
 * 절전 강도를 사용자에게 맡기는 이유: 이 앱은 컴퓨터를 켠 순간부터 끌 때까지 떠 있다.
 * 그래서 "가만히 있을 때 얼마나 게으르게 굴 것인가"가 곧 배터리와 팬 소리를 정하는데,
 * 그 균형점은 사람마다 다르다. 데스크톱에서는 부드러운 쪽이, 이동 중인 노트북에서는
 * 아끼는 쪽이 맞다.
 */

import { createTranslator, LANGUAGES } from '../../shared/i18n/index.js'
import { POWER_LEVELS, resolvePower } from '../../shared/power.js'
import { el, createRenderer } from '../team/ui.js'

const root = document.getElementById('app')
const render = createRenderer(root)

let state = null
/** 지금 언어로 문장을 만드는 함수. 상태가 올 때마다 새로 만든다. */
let t = createTranslator('en')
/** 지금 보고 있는 화면. null 이면 목록이고, 아니면 그 설정 하나만 보고 있다. */
let screen = null

/** 라디오 한 줄. 이름표 전체가 눌리는 카드다. */
function choice({ group, value, name, desc, current, onPick }) {
  return el('label', { class: 'choice' }, [
    el('input', {
      type: 'radio',
      name: group,
      value,
      checked: value === current ? '' : null,
      onchange: () => onPick(value),
    }),
    el('div', { class: 'text' }, [
      el('div', { class: 'name', text: name }),
      desc ? el('div', { class: 'desc', text: desc }) : null,
    ]),
  ])
}

function powerView() {
  const current = resolvePower(state.power)
  return [
    el('p', { class: 'hint', text: t('settings.powerHint') }),
    el(
      'div',
      { class: 'choices' },
      POWER_LEVELS.map((level) =>
        choice({
          group: 'power',
          value: level,
          name: t(`power.${level}`),
          desc: t(`power.${level}Hint`),
          current,
          onPick: (next) => window.settingsApi.setPower(next),
        }),
      ),
    ),
  ]
}

function languageView() {
  return [
    el('p', { class: 'hint', text: t('settings.languageHint') }),
    el(
      'div',
      { class: 'choices' },
      LANGUAGES.map((option) =>
        choice({
          group: 'language',
          value: option.code,
          // 이름은 그 언어로 적혀 있다 — 못 읽는 말로 적혀 있으면 되돌아올 수가 없다
          name: option.name,
          current: state.language,
          onPick: (code) => window.settingsApi.setLanguage(code),
        }),
      ),
    ),
  ]
}

/**
 * 설정 항목. 목록의 한 줄과 상세 화면이 한자리에 있다 —
 * 항목이 늘어날 때 두 군데를 따로 고치다 어긋나는 일이 없게.
 */
const ITEMS = [
  {
    key: 'power',
    name: () => t('settings.power'),
    value: () => t(`power.${resolvePower(state.power)}`),
    view: powerView,
  },
  {
    key: 'language',
    name: () => t('language.label'),
    value: () => LANGUAGES.find((option) => option.code === state.language)?.name ?? state.language,
    view: languageView,
  },
]

function go(key) {
  screen = key
  draw()
}

/** 목록 화면. 한 줄의 생김새는 팀 목록(team.css 의 .team-row)에서 그대로 빌려 쓴다. */
function listView() {
  return [
    el('h1', { text: t('settings.title') }),
    el(
      'div',
      { class: 'team-list' },
      ITEMS.map((item) =>
        el(
          'button',
          {
            class: 'team-row',
            // 개발용 스크린샷(dev-capture.js)이 이 표식으로 항목을 눌러 상세를 찍는다
            'data-item': item.key,
            onclick: () => go(item.key),
          },
          [
            el('span', { class: 'row-main' }, [
              el('span', { class: 'row-name', text: item.name() }),
              el('span', { class: 'row-sub', text: item.value() }),
            ]),
            el('span', { class: 'row-arrow', text: '›' }),
          ],
        ),
      ),
    ),
  ]
}

/** 설정 하나만 보는 화면. 뒤로가기는 타이틀바가 아니라 제목 왼쪽에 붙는다 (settings.css 참고) */
function detailView(item) {
  return [
    el('div', { class: 'detail-head' }, [
      el('button', {
        class: 'back',
        text: '‹',
        // 홑화살괄호 하나뿐이라 어디로 가는지 소리로는 알 수 없다
        'aria-label': t('settings.title'),
        onclick: () => go(null),
      }),
      el('h1', { text: item.name() }),
    ]),
    ...item.view(),
  ]
}

function draw() {
  if (!state) return
  t = createTranslator(state.language)
  document.title = t('settings.title')

  const item = ITEMS.find((candidate) => candidate.key === screen)
  if (!item) screen = null

  // 다시 그리면 라디오가 통째로 새로 만들어져 포커스가 몸통으로 떨어진다. 그대로 두면
  // 키보드 화살표로 항목을 훑는 도중 한 칸 옮길 때마다 처음으로 되돌아간다.
  const group = document.activeElement?.matches?.('input[type="radio"]')
    ? document.activeElement.getAttribute('name')
    : null

  render(item ? detailView(item) : listView())

  if (group) root.querySelector(`input[name="${group}"]:checked`)?.focus()
}

// 상세에서 Escape 를 누르면 목록으로 돌아간다 (팀 상세 창이 고쳐 쓰기를 접는 것과 같은 버릇)
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && screen) go(null)
})

window.settingsApi.onState((next) => {
  state = next
  draw()
})

window.settingsApi.getState().then((next) => {
  state = next
  draw()
})
