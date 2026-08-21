/**
 * 초대코드가 얼마나 남았는지 사람이 읽는 말로 바꾼다.
 *
 * 화면과 떨어져 있어야 하는 계산이라 컴포넌트 밖에 둔다.
 */

import type { Translate } from '@doran-doran/shared/i18n'

export interface InviteStatus {
  expired: boolean
  text: string
}

export function inviteStatus(expiresAt: string | null | undefined, t: Translate): InviteStatus {
  const left = new Date(expiresAt ?? 0).getTime() - Date.now()
  if (!Number.isFinite(left) || left <= 0) return { expired: true, text: t('invite.expired') }

  const hours = Math.floor(left / 3600000)
  if (hours >= 1) return { expired: false, text: t('invite.hoursLeft', { hours }) }
  const minutes = Math.max(1, Math.floor(left / 60000))
  return { expired: false, text: t('invite.minutesLeft', { minutes }) }
}
