/**
 * 팀 상세 창. 팀 하나만 담당한다 (`teamApi.teamId`).
 *
 * 초대코드·팀원 목록·이 팀에서 쓸 내 캐릭터·나가기를 모아 놓았다.
 * 팀에서 나가면 메인 프로세스가 이 창을 닫는다.
 */

import { useState } from 'react'
import { CHARACTERS, getCharacter } from '@buddling/shared/characters'
import { SIGNALS, toSignal } from '@buddling/shared/signals'
import type { SignalKind } from '@buddling/shared/signals'
import { createTranslator } from '@buddling/shared/i18n'
import type { Translate } from '@buddling/shared/i18n'
import type { Membership, Team } from '@buddling/shared/state'
import { characterThumbnails } from './thumbnails'
import { inviteStatus } from './invite'
import { useAppState, useMinuteTick, useRunner, useToast } from './hooks'
import * as ui from '../ui'

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
    <div className="flex items-center gap-[6px] mt-[10px]">
      <input
        type="text"
        className={`${ui.inputCompact} flex-1 min-w-0`}
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
      <button className={ui.buttonTiny} onClick={onSave}>
        {t('form.save')}
      </button>
      <button className={ui.buttonTinyGhost} onClick={onCancel}>
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
    <div
      className={`flex items-center gap-[12px] bg-card border-[1.5px] border-dashed rounded-card
        px-[16px] py-[14px] ${invite.expired ? 'border-[rgba(180,82,58,0.4)]' : 'border-line'}`}
    >
      <div className="flex-1 min-w-0">
        <code
          className={`flex-1 font-code text-[24px] font-bold tracking-[0.22em] select-text
            ${invite.expired ? 'line-through opacity-40' : ''}`}
        >
          {team.inviteCode}
        </code>
        <span
          className={`block mt-[2px] text-[11px] font-bold
            ${invite.expired ? 'text-danger' : 'text-ink-soft'}`}
        >
          {invite.text}
        </span>
      </div>
      {invite.expired ? null : (
        <button
          className={ui.buttonTiny}
          onClick={async () => {
            await navigator.clipboard.writeText(team.inviteCode)
            toast(t('toast.copied'))
          }}
        >
          {t('detail.copy')}
        </button>
      )}
      <button
        className={ui.buttonTinyGhost}
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
  // 방장은 칸이 아니라 순서다 — 그 방에 아직 남아 있는 것 중 가장 먼저 들어온
  // 멤버가 방장이고, `members` 는 늘 그 순서로 온다(schema.sql 의 `membership_json`).
  const hostId = members[0]?.id
  const viewerIsHost = member.id === hostId

  return (
    <ul className="bg-card rounded-card overflow-hidden">
      {members.map((person) => {
        const spec = getCharacter(person.characterKey)
        const isMe = person.id === member.id
        const isOnline = isMe || online.has(person.id)
        const isHost = person.id === hostId

        return (
          <li
            key={person.id}
            className="flex items-center gap-[12px] px-[14px] py-[10px]
              [&+li]:border-t [&+li]:border-line"
          >
            <img
              className="w-[40px] h-[44px] object-contain flex-none"
              src={characterThumbnails().get(spec.key)}
              alt={t(`character.${spec.key}`)}
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold flex items-center gap-[7px]">
                <span>{person.nickname}</span>
                {isMe ? (
                  <span className="text-[11px] font-bold text-accent">{t('detail.me')}</span>
                ) : null}
                {isHost ? (
                  <span
                    className="text-[10px] font-bold text-ink-soft bg-line rounded-full
                      px-[7px] py-[1px]"
                  >
                    {t('detail.hostBadge')}
                  </span>
                ) : null}
              </div>
              <div className="text-[12px] text-ink-soft flex items-center gap-[5px]">
                <span
                  className={`w-[7px] h-[7px] rounded-full flex-none ${
                    isOnline ? 'bg-online' : 'bg-line'
                  }`}
                />
                <span>
                  {t('detail.memberStatus', {
                    character: t(`character.${spec.key}`),
                    presence: isOnline ? t('detail.online') : t('detail.away'),
                  })}
                </span>
              </div>
            </div>
            {isMe ? (
              <button className={ui.buttonTinyGhost} onClick={() => onRename(person.nickname)}>
                {t('detail.rename')}
              </button>
            ) : (
              <div className="flex gap-[6px] flex-none">
                <button
                  className={ui.buttonTinyGhost}
                  onClick={() =>
                    run(async () => {
                      const sent = await window.teamApi.tapMember(team.id, person.id)
                      toast(
                        sent ? t('toast.poked', { name: person.nickname }) : t('toast.tooFast'),
                      )
                    })
                  }
                >
                  {t('detail.poke')}
                </button>
                {viewerIsHost ? (
                  <button
                    className={`${ui.buttonTinyGhost} text-danger border-[rgba(180,82,58,0.4)]`}
                    onClick={() => {
                      if (!window.confirm(t('detail.kickConfirm', { name: person.nickname }))) {
                        return
                      }
                      void run(async () => {
                        await window.teamApi.kickMember(team.id, person.id)
                        toast(t('toast.kicked', { name: person.nickname }))
                      })
                    }}
                  >
                    {t('detail.kick')}
                  </button>
                ) : null}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 이 방에서 내가 보낼 신호를 고른다.
 *
 * 누르는 동작은 하나로 두고 **평소에 나갈 신호를 미리 골라 두는 것**이 기획서가 정한
 * 방식이다. 메뉴에서 그때그때 고르게 하면 캐릭터를 톡 누르는 0.2초짜리 동작이
 * 사라지고, 신호가 시그니처가 되지도 않는다.
 */
function SignalPicker({
  teamId,
  selected,
  t,
  run,
}: {
  teamId: string
  selected: SignalKind
  t: Translate
  run: (action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    // 2열 격자다. 신호가 다섯이 되면서 가로 한 줄로는 한 칸이 66px 밖에 안 되어,
    // 이름은 접히고 설명은 서너 줄이 된다. 여섯째가 생겨도 3+3 으로 버틴다.
    <div className="grid grid-cols-2 gap-[7px]">
      {SIGNALS.map((kind) => (
        <button
          key={kind}
          className="flex-1 bg-card border-2 border-transparent rounded-pick px-[10px] py-[9px]
            flex flex-col items-start gap-[2px] text-ink cursor-pointer text-left
            aria-pressed:border-accent"
          aria-pressed={kind === selected}
          onClick={() => run(() => window.teamApi.setSignal(teamId, kind))}
        >
          <span className="text-[12px] font-bold">{t(`signal.${kind}`)}</span>
          {/* 신호가 셋이 되며 칸이 좁아졌다. `break-keep` 이 없으면 한국어가 글자 단위로
              끊겨 "흔들어 / 요" 처럼 조사만 다음 줄로 떨어진다. */}
          <span className="text-[11px] text-ink-soft leading-[1.3] break-keep">
            {t(`signal.${kind}.hint`)}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * 이 방을 재우고 깨운다.
 *
 * **받는 쪽 이야기다.** 재워도 내 신호는 그대로 나가고, 방의 다른 멤버에게는 평소와
 * 똑같이 보인다. 그래서 문구도 "알림 끄기" 가 아니라 재우고 깨우는 말이다 — 화면에
 * 보이는 그림이 곧 껐다는 표시라, 껐다는 것을 잊고 "왜 아무도 안 찌르지" 하는 일이
 * 생기지 않는다.
 *
 * 여기 말고 트레이 메뉴와 캐릭터 우클릭 메뉴에도 같은 것이 있다. 재우고 싶어지는
 * 순간이 이 창 앞이 아니기 때문이다.
 */
function SleepRow({
  teamId,
  asleep,
  t,
  run,
  toast,
}: {
  teamId: string
  asleep: boolean
  t: Translate
  run: (action: () => Promise<unknown>) => Promise<void>
  toast: (message: string) => void
}) {
  return (
    <div className="flex items-center gap-[12px] bg-card rounded-card px-[14px] py-[12px]">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[13px]">
          {asleep ? t('detail.sleeping') : t('detail.awake')}
        </div>
        <div className="text-[12px] text-ink-soft leading-[1.4] break-keep">
          {asleep ? t('detail.sleepingHint') : t('detail.awakeHint')}
        </div>
      </div>
      <button
        className={asleep ? ui.buttonTiny : ui.buttonTinyGhost}
        onClick={() =>
          run(async () => {
            await window.teamApi.setAsleep(teamId, !asleep)
            toast(t(asleep ? 'toast.woke' : 'toast.slept'))
          })
        }
      >
        {asleep ? t('detail.wake') : t('detail.sleep')}
      </button>
    </div>
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
    <div className="grid grid-cols-5 gap-[7px]">
      {CHARACTERS.map((spec) => (
        <button
          key={spec.key}
          className="bg-card border-2 border-transparent rounded-pick pt-[6px] px-[2px] pb-[8px]
            flex flex-col items-center gap-[1px] text-ink cursor-pointer
            aria-pressed:border-accent"
          aria-pressed={spec.key === selectedKey}
          onClick={() => run(() => window.teamApi.setCharacter(teamId, spec.key))}
        >
          <img
            className="w-full max-w-[52px] h-[58px] object-contain"
            src={characterThumbnails().get(spec.key)}
            alt={t(`character.${spec.key}`)}
          />
          <span className="text-[10px] font-bold text-center leading-[1.25]">
            {t(`character.${spec.key}`)}
          </span>
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

  if (!state) return <div className={ui.loading}>···</div>

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
      <h1 className={ui.h1}>{t('detail.gone')}</h1>
      <p className={ui.lead}>{t('detail.goneHint')}</p>
    </>
  ) : (
    <>
      <div className="flex items-baseline justify-between gap-[10px]">
        <div className="flex items-center gap-[8px] min-w-0">
          <h1 className={`${ui.h1} min-w-0 overflow-hidden text-ellipsis whitespace-nowrap`}>
            {entry.team.name}
          </h1>
          <button
            className={`${ui.buttonTinyGhost} flex-none whitespace-nowrap`}
            onClick={() => startEdit('team', entry.team.name)}
          >
            {t('detail.rename')}
          </button>
        </div>
        <span className={`${ui.quota} flex-none whitespace-nowrap`}>
          {`${entry.members.length} / ${state.maxMembers}`}
        </span>
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

      <p className={ui.lead}>{t('detail.lead')}</p>

      {entry.connection !== 'connected' ? (
        <div
          className="mt-[14px] bg-warn text-warn-ink rounded-field px-[14px] py-[9px]
            text-[12px] font-bold"
        >
          {entry.connection === 'error' ? t('connection.lost') : t('connection.connecting')}
        </div>
      ) : null}

      <section className={ui.section}>
        <h2 className={ui.h2}>{t('detail.invite')}</h2>
        <InviteRow team={entry.team} t={t} run={run} toast={show} />
        {entry.members.length >= state.maxMembers ? (
          <p className={ui.quotaNote}>{t('detail.teamFull', { max: state.maxMembers })}</p>
        ) : null}
      </section>

      <section className={ui.section}>
        <h2 className={ui.h2}>{t('detail.members')}</h2>
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

      <section className={ui.section}>
        <h2 className={ui.h2}>{t('detail.myCharacter')}</h2>
        <CharacterPicker
          teamId={teamId}
          selectedKey={entry.member.characterKey}
          t={t}
          run={run}
        />
      </section>

      <section className={ui.section}>
        <h2 className={ui.h2}>{t('detail.mySignal')}</h2>
        <p className={ui.hint}>{t('detail.mySignalHint')}</p>
        <SignalPicker teamId={teamId} selected={toSignal(entry.pet.signal)} t={t} run={run} />
      </section>

      <section className={ui.section}>
        <h2 className={ui.h2}>{t('detail.sleepSection')}</h2>
        <SleepRow
          teamId={teamId}
          asleep={Boolean(entry.pet.asleep)}
          t={t}
          run={run}
          toast={show}
        />
      </section>

      <div className={ui.errorLine}>{error}</div>

      <div className={ui.footer}>
        <button
          className={ui.buttonQuiet}
          onClick={() => run(() => window.teamApi.leaveTeam(teamId))}
        >
          {t('detail.leave')}
        </button>
      </div>
    </>
  )

  return (
    <>
      <header className={ui.titlebar}>
        <span>{t('app.name')}</span>
      </header>
      <main className={ui.main}>{body}</main>
      <div
        className={`fixed left-1/2 bottom-[22px] -translate-x-1/2 bg-ink text-cream text-[13px]
          font-bold px-[18px] py-[9px] rounded-full pointer-events-none
          transition-[opacity,transform] duration-150
          ${message ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[12px]'}`}
      >
        {message}
      </div>
    </>
  )
}
