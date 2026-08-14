/**
 * 팀 목록 창.
 *
 * 내가 속한 팀을 줄줄이 보여주고, 하나를 고르면 그 팀의 상세 창이 따로 열린다.
 * 팀은 최대 3개, 팀 하나에는 최대 5명이다.
 *
 * 화면은 세 가지뿐이다.
 *   1) Supabase 설정이 아직 안 됐을 때 → 무엇을 해야 하는지 알려준다
 *   2) 팀이 하나도 없을 때            → 이름 정하고 첫 팀을 만들거나 참여한다
 *   3) 팀이 있을 때                   → 팀 목록 + 아래에 팀 추가하기
 */

import { getCharacter } from '../../shared/characters.js'
import { createTranslator } from '../../shared/i18n/index.js'
import { renderCharacterThumbnails } from './thumbnails.js'
import { el, createToast, createRenderer, createRunner } from './ui.js'

const thumbnails = renderCharacterThumbnails()
const render = createRenderer(document.getElementById('app'))
const toast = createToast(document.getElementById('toast'))
const { status, run } = createRunner({ onChange: () => draw() })

let state = null
/** 지금 언어로 문장을 만드는 함수. 상태가 올 때마다 새로 만든다. */
let t = createTranslator('en')
/** 사용자가 입력 중인 값. 다시 그릴 때 날아가지 않도록 여기 붙잡아 둔다. */
const draft = { nickname: '', teamName: '', inviteCode: '' }
/** 팀이 있는 화면에서 "팀 추가하기"를 펼쳤는지 */
let adding = false

// ────────────────────────────────────────────────────────────

function nicknameField() {
  return el('input', {
    type: 'text',
    maxlength: '20',
    placeholder: t('form.nicknamePlaceholder'),
    value: draft.nickname || state.nickname || '',
    oninput: (event) => {
      draft.nickname = event.target.value
    },
  })
}

/** 팀 만들기 / 초대코드로 참여 — 첫 팀에서도, 팀 추가에서도 같은 폼을 쓴다 */
function joinForms() {
  const teamName = el('input', {
    type: 'text',
    maxlength: '40',
    placeholder: t('form.teamNamePlaceholder'),
    value: draft.teamName,
    oninput: (event) => {
      draft.teamName = event.target.value
    },
  })

  const inviteCode = el('input', {
    type: 'text',
    class: 'code',
    maxlength: '8',
    placeholder: 'XXXXXXXX',
    value: draft.inviteCode,
    oninput: (event) => {
      draft.inviteCode = event.target.value.toUpperCase()
      event.target.value = draft.inviteCode
    },
  })

  return [
    el('section', {}, [
      el('h2', { text: t('form.createSection') }),
      el('div', { class: 'field' }, [el('label', { text: t('form.teamName') }), teamName]),
      el('div', { class: 'buttons' }, [
        el('button', {
          class: 'block',
          text: status.busy ? t('form.creating') : t('form.create'),
          disabled: status.busy ? '' : null,
          onclick: () =>
            run(async () => {
              await window.teamApi.createTeam({ name: draft.teamName, nickname: draft.nickname })
              draft.teamName = ''
              adding = false
            }),
        }),
      ]),
    ]),

    el('section', {}, [
      el('h2', { text: t('form.joinSection') }),
      inviteCode,
      el('div', { class: 'buttons' }, [
        el('button', {
          class: 'block ghost',
          text: status.busy ? t('form.joining') : t('form.join'),
          disabled: status.busy ? '' : null,
          onclick: () =>
            run(async () => {
              await window.teamApi.joinTeam({
                inviteCode: draft.inviteCode,
                nickname: draft.nickname,
              })
              draft.inviteCode = ''
              adding = false
            }),
        }),
      ]),
    ]),
  ]
}

// ────────────────────────────────────────────────────────────
// 화면들
// ────────────────────────────────────────────────────────────

function setupNeededView() {
  return [
    el('h1', { text: t('setup.title') }),
    el('p', { class: 'lead', text: t('setup.lead') }),
    el('div', { class: 'notice' }, [
      el('strong', { text: state.configError ?? t('error.missingConfig') }),
      el('ol', {}, [
        el('li', { text: t('setup.step1') }),
        el('li', {}, [
          document.createTextNode(t('setup.step2a')),
          el('code', { text: 'supabase/schema.sql' }),
          document.createTextNode(t('setup.step2b')),
        ]),
        el('li', {}, [
          document.createTextNode(t('setup.step3a')),
          el('code', { text: '.env' }),
          document.createTextNode(t('setup.step3b')),
        ]),
        el('li', { text: t('setup.step4') }),
      ]),
      el('p', { text: t('setup.more') }),
    ]),
  ]
}

function onboardingView() {
  return [
    el('h1', { text: t('onboarding.title') }),
    el('p', { class: 'lead', text: t('onboarding.lead') }),
    el('section', {}, [
      el('div', { class: 'field' }, [el('label', { text: t('form.myName') }), nicknameField()]),
    ]),
    ...joinForms(),
    el('div', { class: 'error', text: status.error }),
  ]
}

/** 팀 한 줄. 누르면 그 팀의 상세 창이 열린다. */
function teamRow(entry) {
  const { team, member, members, onlineIds, connection } = entry
  const spec = getCharacter(member.characterKey)
  const online = new Set(onlineIds).size

  return el(
    'button',
    {
      class: 'team-row',
      onclick: () => window.teamApi.openTeam(team.id),
    },
    [
      el('img', { src: thumbnails.get(spec.key), alt: t(`character.${spec.key}`) }),
      el('span', { class: 'row-main' }, [
        el('span', { class: 'row-name', text: team.name }),
        el('span', {
          class: 'row-sub',
          text: [
            t('list.members', { count: members.length, max: state.maxMembers }),
            connection === 'connected'
              ? t('list.online', { count: Math.max(1, online) })
              : t('list.connecting'),
          ].join(' · '),
        }),
      ]),
      el('span', { class: 'row-arrow', text: '›' }),
    ],
  )
}

function listView() {
  const { memberships, maxTeams } = state
  const full = memberships.length >= maxTeams

  return [
    el('div', { class: 'top' }, [
      el('h1', { text: t('list.title') }),
      el('span', { class: 'quota', text: `${memberships.length} / ${maxTeams}` }),
    ]),
    el('p', {
      class: 'lead',
      text: t('list.lead'),
    }),

    el('div', { class: 'team-list' }, memberships.map(teamRow)),

    el('div', { class: 'error', text: status.error }),

    full
      ? el('p', { class: 'quota-note', text: t('list.full', { max: maxTeams }) })
      : adding
        ? el('div', { class: 'adding' }, [
            el('div', { class: 'field' }, [el('label', { text: t('form.myName') }), nicknameField()]),
            ...joinForms(),
            el('div', { class: 'footer' }, [
              el('button', {
                text: t('form.cancel'),
                onclick: () => {
                  adding = false
                  draw()
                },
              }),
            ]),
          ])
        : el('div', { class: 'buttons' }, [
            el('button', {
              class: 'block ghost',
              text: t('list.addTeam'),
              onclick: () => {
                adding = true
                draw()
              },
            }),
          ]),
  ]
}

// ────────────────────────────────────────────────────────────

/**
 * 새 버전이 있을 때만 맨 위에 한 줄. 두 가지 얼굴이 있다.
 *
 *   이미 받아 뒀다 → "받았어요 · 지금 적용하기"  누르면 다시 시작하며 갈아끼운다
 *   아직 못 받았다 → "나왔어요 · 받으러 가기"    누르면 받는 곳을 브라우저로 연다
 *
 * 어느 쪽인지는 메인이 정해서 `update.ready` 로 알려준다. 화면은 플랫폼을
 * 알 필요가 없다. (src/main/updates.js 참고)
 */
function updateBanner() {
  if (!state.update) return []

  const { version, ready } = state.update
  const label = ready ? t('update.restart') : t('update.action')

  return [
    el('button', {
      class: 'update-banner',
      title: label,
      text: `${t(ready ? 'update.ready' : 'update.available', { version })} · ${label} ›`,
      onclick: () => (ready ? window.teamApi.installUpdate() : window.teamApi.openDownloadPage()),
    }),
  ]
}

/** 언어와 절전 강도는 설정 창에 모여 있다. 여기서는 그리로 가는 길만 둔다. */
function settingsRow() {
  return el('div', { class: 'footer' }, [
    el('button', { text: t('app.settings'), onclick: () => window.teamApi.openSettings() }),
  ])
}

function draw() {
  if (!state) return
  t = createTranslator(state.language)

  const view = !state.configured
    ? setupNeededView()
    : state.memberships.length > 0
      ? listView()
      : onboardingView()

  render([...updateBanner(), ...view, settingsRow()])
}

window.teamApi.onState((next) => {
  state = next
  draw()
})

window.teamApi.onError((message) => {
  status.error = message
  draw()
})

window.teamApi.getState().then((next) => {
  state = next
  draw()
})
