/**
 * 알림 화면.
 *
 * 내 소속이 바뀐 일이 쌓이는 곳이다 — *내가 내보내졌다* · *누가 들어왔다* · *누가
 * 나갔다* · *누가 내보내졌다* 넷이다. 방마다 따로가 아니라 창 하나에 모든 방의 사건이
 * 모인다(기획서 "알림 화면"). 내가 들어온 것은 여기 오지 않는다 — 방금 내가 한
 * 일이고, 그 자리에서 화면이 바뀌는 것을 이미 본다.
 *
 * 안읽음 기준(`unreadBefore`)은 이 창이 열릴 때 **한 번만** 받아 오고, 창이 떠 있는
 * 동안 다시 받지 않는다. 그래야 보고 있던 안읽음 색이 눈앞에서 읽음으로 바뀌지 않는다.
 *
 * **치우는 단추가 없다.** 기획서가 그렇게 정했다 — 지우는 단추가 있으면 이 화면이
 * "치워야 하는 목록"이 된다. 대신 최근 7일치가 저절로 정리된다.
 */

import { useEffect, useState } from 'react'
import { createTranslator } from '@buddling/shared/i18n'
import type { AppState, NotificationEntry } from '@buddling/shared/state'
import { ago } from './ago'
import { useMinuteTick } from '../use-minute-tick'
import * as ui from '../ui'

/** 종류별로 다른 문구를 고른다. 문구 아래 작은 글씨로 "얼마나 지났는지"를 함께 적는다. */
function labelFor(entry: NotificationEntry, t: ReturnType<typeof createTranslator>): string {
  switch (entry.kind) {
    case 'kicked-me':
      return t('notifications.kickedMe', { teamName: entry.teamName })
    case 'joined':
      return t('notifications.joined', { nickname: entry.nickname ?? '', teamName: entry.teamName })
    case 'kicked':
      return t('notifications.kicked', { nickname: entry.nickname ?? '', teamName: entry.teamName })
    case 'left':
      // 나간 사람이 방장이었으면 새 방장에게만 이 줄이 붙는다(기획서 "알림 화면").
      return entry.newHostNickname
        ? t('notifications.leftHost', {
            nickname: entry.nickname ?? '',
            teamName: entry.teamName,
            hostNickname: entry.newHostNickname,
          })
        : t('notifications.left', { nickname: entry.nickname ?? '', teamName: entry.teamName })
  }
}

function Row({
  unread,
  label,
  agoLabel,
}: {
  unread: boolean
  label: string
  agoLabel: string
}) {
  return (
    <li
      className={`flex flex-col gap-[2px] px-[14px] py-[12px] rounded-card
        border-[1.5px] ${unread ? 'bg-card border-line' : 'bg-transparent border-transparent'}`}
    >
      <span
        className={`text-[13px] leading-[1.5] ${unread ? 'font-bold text-ink' : 'text-ink-soft'}`}
      >
        {label}
      </span>
      <span className="text-[11px] leading-[normal] text-ink-soft">{agoLabel}</span>
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

  // "3분 전" 이 창을 열어둔 채로 굳지 않게 1분마다 다시 그린다.
  useMinuteTick()

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
                label={labelFor(entry, t)}
                agoLabel={ago(entry.at, Date.now(), t)}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
