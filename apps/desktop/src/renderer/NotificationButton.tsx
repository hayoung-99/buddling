/**
 * 제목줄 오른쪽의 알림 아이콘. 헤더가 있는 창마다 붙는다 — 팀 목록 · 팀 상세 · 설정
 * (기획서 "알림 화면"). 알림 창 자기 자신에는 붙지 않는다.
 *
 * `no-drag-region` 이 없으면 눌리지 않는다 — macOS 의 `hiddenInset` 제목줄은 줄 전체가
 * 창을 끄는 손잡이라, 이 안에서 누를 수 있는 것은 일부러 표시해 줘야 한다.
 */

import { BellIcon } from './icons'
import type { Translate } from '@buddling/shared/i18n'
import type { AppState } from '@buddling/shared/state'

export function NotificationButton({
  state,
  t,
  onOpen,
}: {
  state: AppState
  t: Translate
  onOpen: () => void
}) {
  return (
    <button
      className="no-drag-region absolute right-[8px] top-1/2 -translate-y-1/2
        w-[28px] h-[28px] flex items-center justify-center rounded-full
        bg-transparent text-ink-soft cursor-pointer hover:text-ink hover:bg-line"
      aria-label={t('notifications.title')}
      onClick={onOpen}
    >
      <BellIcon width={16} height={16} />
      {state.hasUnreadNotifications ? (
        <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] rounded-full bg-danger" />
      ) : null}
    </button>
  )
}
