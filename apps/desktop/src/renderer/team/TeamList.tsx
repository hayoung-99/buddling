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

import { useState } from 'react'
import { getCharacter } from '@buddling/shared/characters'
import { createTranslator } from '@buddling/shared/i18n'
import type { Translate } from '@buddling/shared/i18n'
import type { AppState, Membership } from '@buddling/shared/state'
import { characterThumbnails } from './thumbnails'
import { useAppState, useRunner } from './hooks'
import * as ui from '../ui'
import { GearIcon, KeyIcon, PawIcon, PeopleIcon } from '../icons'
import { NotificationButton } from '../NotificationButton'
import { OfflineScreen } from '../OfflineScreen'

/** 사용자가 입력 중인 값. 화면이 다시 그려져도 날아가지 않게 여기 붙잡아 둔다. */
interface Draft {
  nickname: string
  teamName: string
  inviteCode: string
}

const EMPTY_DRAFT: Draft = { nickname: '', teamName: '', inviteCode: '' }

/** 팀 만들기 / 초대코드로 참여 — 첫 팀에서도, 팀 추가에서도 같은 폼을 쓴다 */
function JoinForms({
  t,
  draft,
  setDraft,
  busy,
  run,
  onDone,
  nickname,
}: {
  t: Translate
  draft: Draft
  setDraft: (update: (draft: Draft) => Draft) => void
  busy: boolean
  run: (action: () => Promise<unknown>) => Promise<void>
  onDone: () => void
  /** 실제로 서버에 보낼 닉네임. `NicknameField` 가 화면에 보여주는 값과 같아야 한다
   * (draft.nickname || state.nickname) — 입력창을 안 건드리고 바로 제출해도
   * 화면에 보이는 이전 닉네임이 그대로 전송되게 하기 위함이다. */
  nickname: string
}) {
  return (
    <>
      <section className={ui.section}>
        <div className={ui.sectionHeading}>
          <span className={`${ui.iconChip} bg-chip-people`}>
            <PeopleIcon />
          </span>
          <h2 className={ui.sectionLabel}>{t('form.createSection')}</h2>
        </div>
        <p className={ui.sectionDescription}>{t('form.createDescription')}</p>
        <div>
          <label className={ui.label}>{t('form.teamName')}</label>
          <input
            type="text"
            className={ui.input}
            maxLength={40}
            placeholder={t('form.teamNamePlaceholder')}
            value={draft.teamName}
            onChange={(event) => setDraft((d) => ({ ...d, teamName: event.target.value }))}
          />
        </div>
        <div className="flex gap-[10px] mt-[16px]">
          <button
            className={`${ui.button} flex-1 w-full`}
            disabled={busy || !draft.teamName.trim()}
            onClick={() =>
              run(async () => {
                await window.teamApi.createTeam({ name: draft.teamName, nickname })
                setDraft((d) => ({ ...d, teamName: '' }))
                onDone()
              })
            }
          >
            {busy ? t('form.creating') : t('form.create')}
          </button>
        </div>
      </section>

      <div className="flex items-center gap-[10px] my-[4px]">
        <div className="flex-1 border-t border-line" />
        <span className="text-[12px] text-ink-soft">{t('form.or')}</span>
        <div className="flex-1 border-t border-line" />
      </div>

      <section className={ui.section}>
        <div className={ui.sectionHeading}>
          <span className={`${ui.iconChip} bg-chip-key`}>
            <KeyIcon />
          </span>
          <h2 className={ui.sectionLabel}>{t('form.joinSection')}</h2>
        </div>
        <p className={ui.sectionDescription}>{t('form.joinDescription')}</p>
        <label className={ui.label}>{t('form.inviteCode')}</label>
        <input
          type="text"
          className={`${ui.input} uppercase tracking-[0.28em] font-bold text-center`}
          maxLength={8}
          placeholder="XXXXXXXX"
          value={draft.inviteCode}
          onChange={(event) =>
            setDraft((d) => ({ ...d, inviteCode: event.target.value.toUpperCase() }))
          }
        />
        <div className="flex gap-[10px] mt-[16px]">
          <button
            className={`${ui.buttonGhost} flex-1 w-full`}
            disabled={busy || !draft.inviteCode.trim()}
            onClick={() =>
              run(async () => {
                await window.teamApi.joinTeam({
                  inviteCode: draft.inviteCode,
                  nickname,
                })
                setDraft((d) => ({ ...d, inviteCode: '' }))
                onDone()
              })
            }
          >
            {busy ? t('form.joining') : t('form.join')}
          </button>
        </div>
      </section>
    </>
  )
}

function NicknameField({
  t,
  state,
  draft,
  setDraft,
}: {
  t: Translate
  state: AppState
  draft: Draft
  setDraft: (update: (draft: Draft) => Draft) => void
}) {
  return (
    <div>
      <label className={ui.label}>{t('form.myName')}</label>
      <input
        type="text"
        className={ui.input}
        maxLength={20}
        placeholder={t('form.nicknamePlaceholder')}
        value={draft.nickname || state.nickname || ''}
        onChange={(event) => setDraft((d) => ({ ...d, nickname: event.target.value }))}
      />
    </div>
  )
}

/** 팀 한 줄. 누르면 그 팀의 상세 창이 열린다. */
function TeamRow({ entry, state, t }: { entry: Membership; state: AppState; t: Translate }) {
  const { team, member, members, onlineIds, connection } = entry
  const spec = getCharacter(member.characterKey)
  const online = new Set(onlineIds).size

  const presence =
    connection === 'connected'
      ? t('list.online', { count: Math.max(1, online) })
      : // 실패를 "연결하는 중"으로 뭉뚱그리면 영원히 로딩하는 것처럼 보인다.
        connection === 'error'
        ? t('list.disconnected')
        : t('list.connecting')

  return (
    <button className={ui.row} onClick={() => window.teamApi.openTeam(team.id)}>
      <img
        className="w-[42px] h-[46px] object-contain flex-none"
        src={characterThumbnails().get(spec.key)}
        alt={t(`character.${spec.key}`)}
      />
      <span className={ui.rowMain}>
        <span className={ui.rowName}>{team.name}</span>
        <span className={ui.rowSub}>
          {[t('list.members', { count: members.length, max: state.maxMembers }), presence].join(
            ' · ',
          )}
        </span>
      </span>
      <span className={ui.rowArrow}>›</span>
    </button>
  )
}

/**
 * 새 버전이 있을 때만 맨 위에 한 줄. 두 가지 얼굴이 있다.
 *
 *   이미 받아 뒀다 → "받았어요 · 지금 적용하기"  누르면 다시 시작하며 갈아끼운다
 *   아직 못 받았다 → "나왔어요 · 받으러 가기"    누르면 받는 곳을 브라우저로 연다
 *
 * 어느 쪽인지는 메인이 정해서 `update.ready` 로 알려준다. 화면은 플랫폼을
 * 알 필요가 없다. (src/main/updates.js 참고)
 */
function UpdateBanner({ state, t }: { state: AppState; t: Translate }) {
  if (!state.update) return null

  const { version, ready } = state.update
  const label = ready ? t('update.restart') : t('update.action')

  return (
    // 눈에 띄되 화면을 가로채지는 않는다 — 하던 일이 우선이다
    <button
      className="w-full mb-[16px] px-[14px] py-[10px] rounded-field bg-notice text-ink
        border-[1.5px] border-[rgba(224,138,92,0.35)] text-[13px] font-semibold text-left
        cursor-pointer"
      title={label}
      onClick={() => (ready ? window.teamApi.installUpdate() : window.teamApi.openDownloadPage())}
    >
      {`${t(ready ? 'update.ready' : 'update.available', { version })} · ${label} ›`}
    </button>
  )
}

export function TeamList() {
  const { state, error, setError } = useAppState()
  const { busy, run } = useRunner(setError)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  /** 팀이 있는 화면에서 "팀 추가하기"를 펼쳤는지 */
  const [adding, setAdding] = useState(false)

  if (!state) return <div className={ui.loading}>···</div>

  const t = createTranslator(state.language)

  // NicknameField 가 입력창에 보여주는 값과 똑같은 규칙으로 계산한다. 그래야
  // 이전 닉네임이 화면에 채워져 보이는데 손대지 않고 바로 제출해도, 보이는 값
  // 그대로가 서버에 전송된다 (빈 문자열이 몰래 나가지 않는다).
  const nickname = draft.nickname || state.nickname || ''

  const setupNeeded = (
    <>
      <h1 className={ui.h1}>{t('setup.title')}</h1>
      <p className={ui.lead}>{t('setup.lead')}</p>
      <div className="bg-notice rounded-card p-[16px] text-[13px]">
        <strong className="block mb-[6px]">{state.configError ?? t('error.missingConfig')}</strong>
        <ol className="list-decimal mt-[8px] ml-[18px]">
          <li>{t('setup.step1')}</li>
          <li>
            {t('setup.step2a')}
            <code className={ui.code}>supabase/schema.sql</code>
            {t('setup.step2b')}
          </li>
          <li>
            {t('setup.step3a')}
            <code className={ui.code}>.env</code>
            {t('setup.step3b')}
          </li>
          <li>{t('setup.step4')}</li>
        </ol>
        <p>{t('setup.more')}</p>
      </div>
    </>
  )

  const onboarding = (
    <>
      <h1 className={ui.h1}>{t('onboarding.title')}</h1>
      <p className={ui.lead}>{t('onboarding.lead')}</p>
      <section className={ui.section}>
        <NicknameField t={t} state={state} draft={draft} setDraft={setDraft} />
      </section>
      <JoinForms
        t={t}
        draft={draft}
        setDraft={setDraft}
        busy={busy}
        run={run}
        onDone={() => setAdding(false)}
        nickname={nickname}
      />
      <div className={ui.errorLine}>{error}</div>
    </>
  )

  const full = state.memberships.length >= state.maxTeams

  const list = (
    <>
      <div className="flex items-baseline justify-between gap-[10px]">
        <h1 className={ui.h1}>{t('list.title')}</h1>
        <span className={ui.quota}>{`${state.memberships.length} / ${state.maxTeams}`}</span>
      </div>
      <p className={ui.lead}>{t('list.lead')}</p>

      <div className={ui.rowList}>
        {state.memberships.map((entry) => (
          <TeamRow key={entry.team.id} entry={entry} state={state} t={t} />
        ))}
      </div>

      <div className={ui.errorLine}>{error}</div>

      {full ? (
        <p className={ui.quotaNote}>{t('list.full', { max: state.maxTeams })}</p>
      ) : adding ? (
        <div
          className="mt-[18px] p-[14px] rounded-adding border-[1.5px] border-dashed border-line
            [&_section:first-of-type]:mt-[16px]"
        >
          <NicknameField t={t} state={state} draft={draft} setDraft={setDraft} />
          <JoinForms
            t={t}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            run={run}
            onDone={() => setAdding(false)}
            nickname={nickname}
          />
          <div className={ui.footer}>
            <button className={ui.buttonQuiet} onClick={() => setAdding(false)}>
              {t('form.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-[10px] mt-[16px]">
          <button
            className={`${ui.buttonGhost} flex-1 w-full`}
            onClick={() => setAdding(true)}
          >
            {t('list.addTeam')}
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      <header className={ui.titlebar}>
        <PawIcon className="mr-[4px]" />
        <span>{t('app.name')}</span>
        <NotificationButton state={state} t={t} onOpen={() => window.teamApi.openNotifications()} />
      </header>
      <main className={ui.main}>
        {/* 설정이 없는 것이 오프라인보다 먼저다 (기획서). 실제로는 configured 가
            false 면 offline 이 true 가 될 수 없지만, 순서로 그 우선순위를 적어 둔다. */}
        {!state.configured ? (
          setupNeeded
        ) : state.offline ? (
          <OfflineScreen t={t} onRetry={() => window.teamApi.retryConnection()} />
        ) : (
          <>
            <UpdateBanner state={state} t={t} />
            {state.memberships.length > 0 ? list : onboarding}
            {/* 언어와 절전 강도는 설정 창에 모여 있다. 여기서는 그리로 가는 길만 둔다. */}
            <div className={ui.footer}>
              <button
                className={`${ui.buttonQuiet} inline-flex items-center gap-[4px]`}
                onClick={() => window.teamApi.openSettings()}
              >
                <GearIcon width={13} height={13} />
                {t('app.settings')}
              </button>
            </div>
          </>
        )}
      </main>
    </>
  )
}
