/**
 * "얼마나 지났는지" 를 문구로 만드는 순수 함수(CLAUDE.md 규칙 1 — Electron·브라우저 없이 돈다).
 *
 * 기획서 "알림 화면"이 **시각이 아니라 얼마나 지났는지로 적는다** 고 못박았다. 알림
 * 창은 최근 7일치만 보이므로 눈금 하나(방금 · 분 전 · 시간 전 · 어제 · 일 전)로 끝까지
 * 덮이고, 달력 날짜로 가르면 기기 시간대·서버 시각·자정 경계를 함께 다뤄야 한다.
 */

import type { Translate } from '@buddling/shared/i18n'

/**
 * @param at 그 줄이 일어난 시각(epoch ms) — 서버 줄은 서버가 적은 시각, `kicked-me` 는
 *   앱이 알아챈 시각이다.
 * @param now 지금(epoch ms). 테스트가 고정하기 쉽도록 인자로 받는다.
 */
export function ago(at: number, now: number, t: Translate): string {
  const elapsedMs = now - at
  const minutes = Math.floor(elapsedMs / 60000)

  // 기기 시계가 서버보다 뒤처져 있으면 음수가 된다. 익명 계정이라 시계를 맞춰 달라고
  // 할 자리가 없으므로 "방금" 으로 적는다(기획서 "알림 화면").
  if (minutes < 1) return t('notifications.ago.now')

  const hours = Math.floor(minutes / 60)
  if (hours < 1) return t('notifications.ago.minutes', { minutes })

  const days = Math.floor(hours / 24)
  if (days < 1) return t('notifications.ago.hours', { hours })
  if (days < 2) return t('notifications.ago.yesterday')

  return t('notifications.ago.days', { days })
}
