/**
 * 알림 화면.
 *
 * 내 소속이 바뀐 일이 쌓이는 곳이다 — 지금은 *내보내졌다* 하나뿐이다. 방마다 따로가
 * 아니라 창 하나에 모든 방의 사건이 모인다(기획서 "알림 화면"). 방을 나간 것은 여기
 * 오지 않는다 — 방금 내가 한 일이고, 그 자리에서 창이 닫히는 것을 이미 본다.
 *
 * 안읽음 기준(`unreadBefore`)은 이 창이 열릴 때 **한 번만** 받아 오고, 창이 떠 있는
 * 동안 다시 받지 않는다. 그래야 보고 있던 안읽음 색이 눈앞에서 읽음으로 바뀌지 않는다.
 */

import { useEffect, useState } from 'react'
import { createTranslator } from '@buddling/shared/i18n'
import type { AppState } from '@buddling/shared/state'
import * as ui from '../ui'

function Row({
  unread,
  label,
  dismissLabel,
  onDismiss,
}: {
  unread: boolean
  label: string
  dismissLabel: string
  onDismiss: () => void
}) {
  return (
    <li
      className={`flex items-center gap-[10px] px-[14px] py-[12px] rounded-card
        border-[1.5px] ${unread ? 'bg-card border-line' : 'bg-transparent border-transparent'}`}
    >
      <span
        className={`flex-1 min-w-0 text-[13px] leading-[1.5] ${
          unread ? 'font-bold text-ink' : 'text-ink-soft'
        }`}
      >
        {label}
      </span>
      <button
        className="flex-none px-[6px] bg-transparent text-ink-soft text-[18px] leading-none
          cursor-pointer hover:text-ink"
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        ×
      </button>
    </li>
  )
}

export function Notifications() {
  const [state, setState] = useState<AppState | null>(null)
  const [unreadBefore, setUnreadBefore] = useState<number | null>(null)

  useEffect(() => {
    window.notificationsApi.onState(setState)
    void window.notificationsApi.getState().then(setState)
    void window.notificationsApi.getUnreadBefore().then(setUnreadBefore)
  }, [])

  const t = createTranslator(state?.language)

  useEffect(() => {
    document.title = t('notifications.title')
  }, [t])

  if (!state || unreadBefore === null) return <div className={ui.loading}>···</div>

  return (
    <>
      <header className={ui.titlebar}>
        <span>{t('app.name')}</span>
      </header>
      <main className={ui.main}>
        <h1 className={ui.h1}>{t('notifications.title')}</h1>
        {state.notifications.length === 0 ? (
          <p className={ui.lead}>{t('notifications.empty')}</p>
        ) : (
          <ul className="mt-[16px] flex flex-col gap-[6px]">
            {state.notifications.map((entry) => (
              <Row
                key={entry.id}
                unread={entry.at > unreadBefore}
                label={t('kicked.message', { teamName: entry.teamName })}
                dismissLabel={t('notifications.dismiss')}
                onDismiss={() => void window.notificationsApi.dismiss(entry.id)}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
