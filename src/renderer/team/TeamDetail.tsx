/**
 * 팀 상세 창. 팀 하나만 담당한다 (`teamApi.teamId`).
 *
 * 초대코드·팀원 목록·이 팀에서 쓸 내 캐릭터·나가기를 모아 놓았다.
 * 팀에서 나가면 메인 프로세스가 이 창을 닫는다.
 */

import { useState } from 'react'
import { CHARACTERS, getCharacter } from '../../shared/characters'
import { createTranslator } from '../../shared/i18n'
import type { Translate } from '../../shared/i18n'
import type { Membership, Team } from '../../shared/state'
import { characterThumbnails } from './thumbnails'
import { inviteStatus } from './invite'
import { useAppState, useMinuteTick, useRunner, useToast } from './hooks'

/** 지금 무엇을 고쳐 쓰는 중인가 */
type Editing = null | 'team' | 'nickname'

/**
 * 제자리에서 고쳐 쓰는 칸.
 * 팀 이름과 내 닉네임은 나중에 바꿀 일이 생기는데, 예전에는 바꿀 방법이 없었다.
 */
function EditRow({
  t,
  placeholder,
  maxLength,
  value,
  onValue,
  onSave,
  onCancel,
}: {
  t: Translate
  placeholder: string
  maxLength: number
  value: string
  onValue: (next: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="edit-row">
      <input
        type="text"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        autoFocus
        onChange={(event) => onValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave()
          if (event.key === 'Escape') onCancel()
        }}
      />
      <button className="tiny" onClick={onSave}>
        {t('form.save')}
      </button>
      <button className="tiny ghost" onClick={onCancel}>
        {t('form.cancel')}
      </button>
    </div>
  )
}

/**
 * 초대코드 줄.
 * 코드는 24시간 뒤 만료된다 — 모르는 사람이 코드를 찍어 맞히지 못하게 하기 위해서다.
 * 유출이 걱정되면 '새 코드'로 다시 발급하면 예전 코드는 즉시 죽는다.
 */
function InviteRow({
  team,
  t,
  run,
  toast,
}: {
  team: Team
  t: Translate
  run: (action: () => Promise<unknown>) => Promise<void>
  toast: (message: string) => void
}) {
  const invite = inviteStatus(team.inviteExpiresAt, t)

  return (
    <div className={`invite${invite.expired ? ' is-expired' : ''}`}>
      <div className="invite-main">
        <code>{team.inviteCode}</code>
        <span className="ttl">{invite.text}</span>
      </div>
      {invite.expired ? null : (
        <button
          className="tiny"
          onClick={async () => {
            await navigator.clipboard.writeText(team.inviteCode)
            toast(t('toast.copied'))
          }}
        >
          {t('detail.copy')}
        </button>
      )}
      <button
        className="tiny ghost"
        title={t('detail.newCodeHint')}
        onClick={() =>
          run(async () => {
            await window.teamApi.refreshInvite(team.id)
            toast(t('toast.newCode'))
          })
        }
      >
        {t('detail.newCode')}
      </button>
    </div>
  )
}

function MemberList({
  entry,
  t,
  run,
  toast,
  onRename,
}: {
  entry: Membership
  t: Translate
  run: (action: () => Promise<unknown>) => Promise<void>
  toast: (message: string) => void
  onRename: (nickname: string) => void
}) {
  const { team, member, members, onlineIds } = entry
  const online = new Set(onlineIds)

  return (
    <ul className="members">
      {members.map((person) => {
        const spec = getCharacter(person.characterKey)
        const isMe = person.id === member.id
        const isOnline = isMe || online.has(person.id)

        return (
          <li key={person.id}>
            <img src={characterThumbnails().get(spec.key)} alt={t(`character.${spec.key}`)} />
            <div className="who">
              <div className="name">
                <span>{person.nickname}</span>
                {isMe ? <span className="me">{t('detail.me')}</span> : null}
              </div>
              <div className="status">
                <span className={`dot${isOnline ? ' on' : ''}`} />
                <span>
                  {t('detail.memberStatus', {
                    character: t(`character.${spec.key}`),
                    presence: isOnline ? t('detail.online') : t('detail.away'),
                  })}
                </span>
              </div>
            </div>
            {isMe ? (
              <button className="tiny ghost" onClick={() => onRename(person.nickname)}>
                {t('detail.rename')}
              </button>
            ) : (
              <button
                className="tiny ghost"
                onClick={() =>
                  run(async () => {
                    const sent = await window.teamApi.tapMember(team.id, person.id)
                    toast(sent ? t('toast.poked', { name: person.nickname }) : t('toast.tooFast'))
                  })
                }
              >
                {t('detail.poke')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CharacterPicker({
  teamId,
  selectedKey,
  t,
  run,
}: {
  teamId: string
  selectedKey: string
  t: Translate
  run: (action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <div className="picker">
      {CHARACTERS.map((spec) => (
        <button
          key={spec.key}
          aria-pressed={spec.key === selectedKey}
          onClick={() => run(() => window.teamApi.setCharacter(teamId, spec.key))}
        >
          <img src={characterThumbnails().get(spec.key)} alt={t(`character.${spec.key}`)} />
          <span className="label">{t(`character.${spec.key}`)}</span>
        </button>
      ))}
    </div>
  )
}

export function TeamDetail() {
  const { state, error, setError } = useAppState()
  const { run } = useRunner(setError)
  const { message, show } = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [editValue, setEditValue] = useState('')

  // 초대코드 남은 시간이 창을 열어둔 채로 굳지 않게 한다
  useMinuteTick()

  const teamId = window.teamApi.teamId ?? ''

  if (!state) return <div className="loading">···</div>

  const t = createTranslator(state.language)
  const entry = state.memberships.find((candidate) => candidate.team.id === teamId) ?? null

  const startEdit = (what: Exclude<Editing, null>, current: string) => {
    setEditing(what)
    setEditValue(current)
  }

  const saveEdit = (toastKey: string, save: (value: string) => Promise<unknown>) =>
    run(async () => {
      await save(editValue)
      setEditing(null)
      show(t(toastKey))
    })

  const body = !entry ? (
    <>
      <h1>{t('detail.gone')}</h1>
      <p className="lead">{t('detail.goneHint')}</p>
    </>
  ) : (
    <>
      <div className="top">
        <div className="title-line">
          <h1>{entry.team.name}</h1>
          <button className="tiny ghost" onClick={() => startEdit('team', entry.team.name)}>
            {t('detail.rename')}
          </button>
        </div>
        <span className="quota">{`${entry.members.length} / ${state.maxMembers}`}</span>
      </div>

      {editing === 'team' ? (
        <EditRow
          t={t}
          placeholder={t('form.teamName')}
          maxLength={40}
          value={editValue}
          onValue={setEditValue}
          onCancel={() => setEditing(null)}
          onSave={() =>
            saveEdit('toast.renamedTeam', (value) => window.teamApi.renameTeam(teamId, value))
          }
        />
      ) : null}

      <p className="lead">{t('detail.lead')}</p>

      {entry.connection !== 'connected' ? (
        <div className="banner">
          {entry.connection === 'error' ? t('connection.lost') : t('connection.connecting')}
        </div>
      ) : null}

      <section>
        <h2>{t('detail.invite')}</h2>
        <InviteRow team={entry.team} t={t} run={run} toast={show} />
        {entry.members.length >= state.maxMembers ? (
          <p className="quota-note">{t('detail.teamFull', { max: state.maxMembers })}</p>
        ) : null}
      </section>

      <section>
        <h2>{t('detail.members')}</h2>
        <MemberList
          entry={entry}
          t={t}
          run={run}
          toast={show}
          onRename={(nickname) => startEdit('nickname', nickname)}
        />
        {editing === 'nickname' ? (
          <EditRow
            t={t}
            placeholder={t('form.nicknamePlaceholder')}
            maxLength={20}
            value={editValue}
            onValue={setEditValue}
            onCancel={() => setEditing(null)}
            onSave={() =>
              saveEdit('toast.renamedNickname', (value) =>
                window.teamApi.setNickname(teamId, value),
              )
            }
          />
        ) : null}
      </section>

      <section>
        <h2>{t('detail.myCharacter')}</h2>
        <CharacterPicker
          teamId={teamId}
          selectedKey={entry.member.characterKey}
          t={t}
          run={run}
        />
      </section>

      <div className="error">{error}</div>

      <div className="footer">
        <button onClick={() => run(() => window.teamApi.leaveTeam(teamId))}>
          {t('detail.leave')}
        </button>
      </div>
    </>
  )

  return (
    <>
      <header className="titlebar">
        <span>TAP TAP!</span>
      </header>
      <main id="app">{body}</main>
      <div id="toast" className={`toast${message ? ' is-visible' : ''}`}>
        {message}
      </div>
    </>
  )
}
