/**
 * 팀 상세 창. 팀 하나만 담당한다 (`teamApi.teamId`).
 *
 * 초대코드·팀원 목록·이 팀에서 쓸 내 캐릭터·나가기를 모아 놓았다.
 * 팀에서 나가면 메인 프로세스가 이 창을 닫는다.
 */

import { CHARACTERS, getCharacter } from '../../shared/characters.js'
import { createTranslator } from '../../shared/i18n/index.js'
import { renderCharacterThumbnails } from './thumbnails.js'
import { el, createToast, createRenderer, createRunner, inviteStatus } from './ui.js'

const thumbnails = renderCharacterThumbnails()
const render = createRenderer(document.getElementById('app'))
const toast = createToast(document.getElementById('toast'))
const { status, run } = createRunner({ onChange: () => draw() })

const teamId = window.teamApi.teamId
let state = null
/** 지금 언어로 문장을 만드는 함수. 상태가 올 때마다 새로 만든다. */
let t = createTranslator('en')
/** 지금 무엇을 고쳐 쓰는 중인지: null | 'team' | 'nickname' */
let editing = null
let editValue = ''

function startEdit(what, current) {
  editing = what
  editValue = current
  draw()
}

function stopEdit() {
  editing = null
  draw()
}

/**
 * 제자리에서 고쳐 쓰는 칸.
 * 팀 이름과 내 닉네임은 나중에 바꿀 일이 생기는데, 예전에는 바꿀 방법이 없었다.
 */
function editRow({ toastKey, placeholder, maxlength, onSave }) {
  const input = el('input', {
    type: 'text',
    maxlength: String(maxlength),
    placeholder,
    value: editValue,
    oninput: (event) => {
      editValue = event.target.value
    },
    onkeydown: (event) => {
      if (event.key === 'Enter') save()
      if (event.key === 'Escape') stopEdit()
    },
  })

  const save = () =>
    run(async () => {
      await onSave(editValue)
      editing = null
      toast.show(t(toastKey))
    })

  return el('div', { class: 'edit-row' }, [
    input,
    el('button', { class: 'tiny', text: t('form.save'), onclick: save }),
    el('button', { class: 'tiny ghost', text: t('form.cancel'), onclick: stopEdit }),
  ])
}

const membership = () => state?.memberships?.find((entry) => entry.team.id === teamId) ?? null

// ────────────────────────────────────────────────────────────

/**
 * 초대코드 줄.
 * 코드는 24시간 뒤 만료된다 — 모르는 사람이 코드를 찍어 맞히지 못하게 하기 위해서다.
 * 유출이 걱정되면 '새 코드'로 다시 발급하면 예전 코드는 즉시 죽는다.
 */
function inviteRow(team) {
  const invite = inviteStatus(team.inviteExpiresAt, t)

  return el('div', { class: `invite${invite.expired ? ' is-expired' : ''}` }, [
    el('div', { class: 'invite-main' }, [
      el('code', { text: team.inviteCode }),
      el('span', { class: 'ttl', text: invite.text }),
    ]),
    invite.expired
      ? null
      : el('button', {
          class: 'tiny',
          text: t('detail.copy'),
          onclick: async () => {
            await navigator.clipboard.writeText(team.inviteCode)
            toast.show(t('toast.copied'))
          },
        }),
    el('button', {
      class: 'tiny ghost',
      text: t('detail.newCode'),
      title: t('detail.newCodeHint'),
      onclick: () =>
        run(async () => {
          await window.teamApi.refreshInvite(teamId)
          toast.show(t('toast.newCode'))
        }),
    }),
  ])
}

function memberList(entry) {
  const { team, member, members, onlineIds } = entry
  const online = new Set(onlineIds)

  return el(
    'ul',
    { class: 'members' },
    members.map((person) => {
      const spec = getCharacter(person.characterKey)
      const isMe = person.id === member.id
      const isOnline = isMe || online.has(person.id)

      return el('li', {}, [
        el('img', { src: thumbnails.get(spec.key), alt: t(`character.${spec.key}`) }),
        el('div', { class: 'who' }, [
          el('div', { class: 'name' }, [
            el('span', { text: person.nickname }),
            isMe ? el('span', { class: 'me', text: t('detail.me') }) : null,
          ]),
          el('div', { class: 'status' }, [
            el('span', { class: `dot${isOnline ? ' on' : ''}` }),
            el('span', {
              text: t('detail.memberStatus', {
                character: t(`character.${spec.key}`),
                presence: isOnline ? t('detail.online') : t('detail.away'),
              }),
            }),
          ]),
        ]),
        isMe
          ? el('button', {
              class: 'tiny ghost',
              text: t('detail.rename'),
              onclick: () => startEdit('nickname', person.nickname),
            })
          : el('button', {
              class: 'tiny ghost',
              text: t('detail.poke'),
              onclick: () =>
                run(async () => {
                  const sent = await window.teamApi.tapMember(team.id, person.id)
                  toast.show(
                    sent ? t('toast.poked', { name: person.nickname }) : t('toast.tooFast'),
                  )
                }),
            }),
      ])
    }),
  )
}

function characterPicker(selectedKey) {
  return el(
    'div',
    { class: 'picker' },
    CHARACTERS.map((spec) =>
      el(
        'button',
        {
          'aria-pressed': String(spec.key === selectedKey),
          onclick: () => run(() => window.teamApi.setCharacter(teamId, spec.key)),
        },
        [
          el('img', { src: thumbnails.get(spec.key), alt: t(`character.${spec.key}`) }),
          el('span', { class: 'label', text: t(`character.${spec.key}`) }),
        ],
      ),
    ),
  )
}

// ────────────────────────────────────────────────────────────

function goneView() {
  return [
    el('h1', { text: t('detail.gone') }),
    el('p', { class: 'lead', text: t('detail.goneHint') }),
  ]
}

function detailView(entry) {
  const { team, member, members, connection } = entry
  const full = members.length >= state.maxMembers

  return [
    el('div', { class: 'top' }, [
      el('div', { class: 'title-line' }, [
        el('h1', { text: team.name }),
        el('button', {
          class: 'tiny ghost',
          text: t('detail.rename'),
          onclick: () => startEdit('team', team.name),
        }),
      ]),
      el('span', { class: 'quota', text: `${members.length} / ${state.maxMembers}` }),
    ]),

    editing === 'team'
      ? editRow({
          toastKey: 'toast.renamedTeam',
          placeholder: t('form.teamName'),
          maxlength: 40,
          onSave: (value) => window.teamApi.renameTeam(teamId, value),
        })
      : null,
    el('p', {
      class: 'lead',
      text: t('detail.lead'),
    }),

    connection !== 'connected'
      ? el('div', {
          class: 'banner',
          text: connection === 'error' ? t('connection.lost') : t('connection.connecting'),
        })
      : null,

    el('section', {}, [
      el('h2', { text: t('detail.invite') }),
      inviteRow(team),
      full
        ? el('p', {
            class: 'quota-note',
            text: t('detail.teamFull', { max: state.maxMembers }),
          })
        : null,
    ]),

    el('section', {}, [
      el('h2', { text: t('detail.members') }),
      memberList(entry),
      editing === 'nickname'
        ? editRow({
            toastKey: 'toast.renamedNickname',
            placeholder: t('form.nicknamePlaceholder'),
            maxlength: 20,
            onSave: (value) => window.teamApi.setNickname(teamId, value),
          })
        : null,
    ]),

    el('section', {}, [
      el('h2', { text: t('detail.myCharacter') }),
      characterPicker(member.characterKey),
    ]),

    el('div', { class: 'error', text: status.error }),

    el('div', { class: 'footer' }, [
      el('button', {
        text: t('detail.leave'),
        onclick: () => run(() => window.teamApi.leaveTeam(teamId)),
      }),
    ]),
  ]
}

function draw() {
  if (!state) return
  t = createTranslator(state.language)
  const entry = membership()
  render(entry ? detailView(entry) : goneView())
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

// 초대코드 남은 시간이 창을 열어둔 채로 굳지 않도록 1분마다 다시 그린다
setInterval(() => {
  if (membership()) draw()
}, 60000)
