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
import { getCharacter } from '../../shared/characters'
import { createTranslator } from '../../shared/i18n'
import type { Translate } from '../../shared/i18n'
import type { AppState, Membership } from '../../shared/state'
import { characterThumbnails } from './thumbnails'
import { useAppState, useRunner } from './hooks'

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
}: {
  t: Translate
  draft: Draft
  setDraft: (update: (draft: Draft) => Draft) => void
  busy: boolean
  run: (action: () => Promise<unknown>) => Promise<void>
  onDone: () => void
}) {
  return (
    <>
      <section>
        <h2>{t('form.createSection')}</h2>
        <div className="field">
          <label>{t('form.teamName')}</label>
          <input
            type="text"
            maxLength={40}
            placeholder={t('form.teamNamePlaceholder')}
            value={draft.teamName}
            onChange={(event) => setDraft((d) => ({ ...d, teamName: event.target.value }))}
          />
        </div>
        <div className="buttons">
          <button
            className="block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await window.teamApi.createTeam({ name: draft.teamName, nickname: draft.nickname })
                setDraft((d) => ({ ...d, teamName: '' }))
                onDone()
              })
            }
          >
            {busy ? t('form.creating') : t('form.create')}
          </button>
        </div>
      </section>

      <section>
        <h2>{t('form.joinSection')}</h2>
        <input
          type="text"
          className="code"
          maxLength={8}
          placeholder="XXXXXXXX"
          value={draft.inviteCode}
          onChange={(event) =>
            setDraft((d) => ({ ...d, inviteCode: event.target.value.toUpperCase() }))
          }
        />
        <div className="buttons">
          <button
            className="block ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await window.teamApi.joinTeam({
                  inviteCode: draft.inviteCode,
                  nickname: draft.nickname,
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
    <div className="field">
      <label>{t('form.myName')}</label>
      <input
        type="text"
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
    <button className="team-row" onClick={() => window.teamApi.openTeam(team.id)}>
      <img src={characterThumbnails().get(spec.key)} alt={t(`character.${spec.key}`)} />
      <span className="row-main">
        <span className="row-name">{team.name}</span>
        <span className="row-sub">
          {[t('list.members', { count: members.length, max: state.maxMembers }), presence].join(
            ' · ',
          )}
        </span>
      </span>
      <span className="row-arrow">›</span>
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
    <button
      className="update-banner"
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

  if (!state) return <div className="loading">···</div>

  const t = createTranslator(state.language)

  const setupNeeded = (
    <>
      <h1>{t('setup.title')}</h1>
      <p className="lead">{t('setup.lead')}</p>
      <div className="notice">
        <strong>{state.configError ?? t('error.missingConfig')}</strong>
        <ol>
          <li>{t('setup.step1')}</li>
          <li>
            {t('setup.step2a')}
            <code>supabase/schema.sql</code>
            {t('setup.step2b')}
          </li>
          <li>
            {t('setup.step3a')}
            <code>.env</code>
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
      <h1>{t('onboarding.title')}</h1>
      <p className="lead">{t('onboarding.lead')}</p>
      <section>
        <NicknameField t={t} state={state} draft={draft} setDraft={setDraft} />
      </section>
      <JoinForms
        t={t}
        draft={draft}
        setDraft={setDraft}
        busy={busy}
        run={run}
        onDone={() => setAdding(false)}
      />
      <div className="error">{error}</div>
    </>
  )

  const full = state.memberships.length >= state.maxTeams

  const list = (
    <>
      <div className="top">
        <h1>{t('list.title')}</h1>
        <span className="quota">{`${state.memberships.length} / ${state.maxTeams}`}</span>
      </div>
      <p className="lead">{t('list.lead')}</p>

      <div className="team-list">
        {state.memberships.map((entry) => (
          <TeamRow key={entry.team.id} entry={entry} state={state} t={t} />
        ))}
      </div>

      <div className="error">{error}</div>

      {full ? (
        <p className="quota-note">{t('list.full', { max: state.maxTeams })}</p>
      ) : adding ? (
        <div className="adding">
          <NicknameField t={t} state={state} draft={draft} setDraft={setDraft} />
          <JoinForms
            t={t}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            run={run}
            onDone={() => setAdding(false)}
          />
          <div className="footer">
            <button onClick={() => setAdding(false)}>{t('form.cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="buttons">
          <button className="block ghost" onClick={() => setAdding(true)}>
            {t('list.addTeam')}
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      <header className="titlebar">
        <span>TAP TAP!</span>
      </header>
      <main id="app">
        <UpdateBanner state={state} t={t} />
        {!state.configured ? setupNeeded : state.memberships.length > 0 ? list : onboarding}
        {/* 언어와 절전 강도는 설정 창에 모여 있다. 여기서는 그리로 가는 길만 둔다. */}
        <div className="footer">
          <button onClick={() => window.teamApi.openSettings()}>{t('app.settings')}</button>
        </div>
      </main>
    </>
  )
}
