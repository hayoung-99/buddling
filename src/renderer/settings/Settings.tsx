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

import { useEffect, useState } from 'react'
import { createTranslator, LANGUAGES } from '../../shared/i18n'
import type { Translate } from '../../shared/i18n'
import { POWER_LEVELS, resolvePower } from '../../shared/power'
import type { AppState } from '../../shared/state'

/** 라디오 한 줄. 이름표 전체가 눌리는 카드다. */
function Choice({
  group,
  value,
  name,
  desc,
  current,
  onPick,
}: {
  group: string
  value: string
  name: string
  desc?: string
  current: string
  onPick: (value: string) => void
}) {
  return (
    <label className="choice">
      <input
        type="radio"
        name={group}
        value={value}
        checked={value === current}
        onChange={() => onPick(value)}
      />
      <div className="text">
        <div className="name">{name}</div>
        {desc ? <div className="desc">{desc}</div> : null}
      </div>
    </label>
  )
}

function PowerView({ state, t }: { state: AppState; t: Translate }) {
  const current = resolvePower(state.power)
  return (
    <>
      <p className="hint">{t('settings.powerHint')}</p>
      <div className="choices">
        {POWER_LEVELS.map((level) => (
          <Choice
            key={level}
            group="power"
            value={level}
            name={t(`power.${level}`)}
            desc={t(`power.${level}Hint`)}
            current={current}
            onPick={(next) => void window.settingsApi.setPower(next)}
          />
        ))}
      </div>
    </>
  )
}

function LanguageView({ state, t }: { state: AppState; t: Translate }) {
  return (
    <>
      <p className="hint">{t('settings.languageHint')}</p>
      <div className="choices">
        {LANGUAGES.map((option) => (
          <Choice
            key={option.code}
            group="language"
            value={option.code}
            // 이름은 그 언어로 적혀 있다 — 못 읽는 말로 적혀 있으면 되돌아올 수가 없다
            name={option.name}
            current={state.language}
            onPick={(code) => void window.settingsApi.setLanguage(code)}
          />
        ))}
      </div>
    </>
  )
}

/**
 * 설정 항목. 목록의 한 줄과 상세 화면이 한자리에 있다 —
 * 항목이 늘어날 때 두 군데를 따로 고치다 어긋나는 일이 없게.
 */
const ITEMS = [
  {
    key: 'power',
    name: (t: Translate) => t('settings.power'),
    value: (t: Translate, state: AppState) => t(`power.${resolvePower(state.power)}`),
    View: PowerView,
  },
  {
    key: 'language',
    name: (t: Translate) => t('language.label'),
    value: (_t: Translate, state: AppState) =>
      LANGUAGES.find((option) => option.code === state.language)?.name ?? state.language,
    View: LanguageView,
  },
]

export function Settings() {
  const [state, setState] = useState<AppState | null>(null)
  /** 지금 보고 있는 화면. null 이면 목록이고, 아니면 그 설정 하나만 보고 있다. */
  const [screen, setScreen] = useState<string | null>(null)

  useEffect(() => {
    window.settingsApi.onState(setState)
    void window.settingsApi.getState().then(setState)
  }, [])

  // 상세에서 Escape 를 누르면 목록으로 돌아간다
  // (팀 상세 창이 고쳐 쓰기를 접는 것과 같은 버릇)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScreen(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const t = createTranslator(state?.language)

  useEffect(() => {
    document.title = t('settings.title')
  }, [t])

  if (!state) return <div className="loading">···</div>

  const item = ITEMS.find((candidate) => candidate.key === screen) ?? null

  return (
    <>
      <header className="titlebar">
        <span>TAP TAP!</span>
      </header>
      <main id="app">
        {item ? (
          <>
            {/* 뒤로가기는 타이틀바가 아니라 제목 왼쪽에 붙는다 (settings.css 참고) */}
            <div className="detail-head">
              <button
                className="back"
                // 홑화살괄호 하나뿐이라 어디로 가는지 소리로는 알 수 없다
                aria-label={t('settings.title')}
                onClick={() => setScreen(null)}
              >
                ‹
              </button>
              <h1>{item.name(t)}</h1>
            </div>
            <item.View state={state} t={t} />
          </>
        ) : (
          <>
            <h1>{t('settings.title')}</h1>
            {/* 한 줄의 생김새는 팀 목록(team.css 의 .team-row)에서 그대로 빌려 쓴다 */}
            <div className="team-list">
              {ITEMS.map((entry) => (
                <button
                  key={entry.key}
                  className="team-row"
                  // 개발용 스크린샷(dev-capture.js)이 이 표식으로 항목을 눌러 상세를 찍는다
                  data-item={entry.key}
                  onClick={() => setScreen(entry.key)}
                >
                  <span className="row-main">
                    <span className="row-name">{entry.name(t)}</span>
                    <span className="row-sub">{entry.value(t, state)}</span>
                  </span>
                  <span className="row-arrow">›</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  )
}
