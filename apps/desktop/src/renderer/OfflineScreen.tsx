/**
 * 인터넷에 닿지 못할 때 창 셋(방 목록 · 방 상세 · 설정)의 `<main>` 안을 통째로 가는
 * 화면 (기획서 "인터넷이 없을 때"). 제목줄과 알림 아이콘은 이 컴포넌트 밖에 있어
 * 그대로 남는다 — 알림 창으로 가는 길이 오프라인에도 사라지지 않아야 하기 때문이다.
 *
 * 방을 만들거나 코드를 넣는 입력칸을 두지 않는다 — 눌러도 되지 않는 단추는 벽보다
 * 나쁘다. 아이콘이나 그림도 넣지 않는다 — 창 셋의 높이가 700 · 820 · 560 으로 제각각
 * 이라 넣으면 세 창에서 각각 맞춰야 한다.
 */

import { useState } from 'react'
import type { Translate } from '@buddling/shared/i18n'
import type { AppState } from '@buddling/shared/state'
import * as ui from './ui'

export function OfflineScreen({ t, onRetry }: { t: Translate; onRetry: () => Promise<AppState> }) {
  const [busy, setBusy] = useState(false)

  return (
    // 제목줄(44px) + ui.main 의 위아래 여백(6·28px)을 뺀 만큼 채운다. 창 셋의 높이가
    // 700 · 820 · 560 으로 제각각이라 고정 높이가 아니라 뷰포트 기준이어야 한다.
    <div className="min-h-[calc(100vh-78px)] flex flex-col items-center justify-center text-center">
      <h1 className={ui.h1}>{t('offline.title')}</h1>
      <p className={ui.lead}>{t('offline.lead')}</p>
      <button
        className={`${ui.buttonGhost} mt-[20px]`}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onRetry()
          } finally {
            // 닿는 데 성공하면 이 컴포넌트가 여기보다 먼저 사라질 수 있다. React 18
            // 부터는 경고도 없고 아무 일도 일어나지 않는다 — 알고 두는 자리다.
            setBusy(false)
          }
        }}
      >
        {busy ? t('offline.retrying') : t('offline.retry')}
      </button>
    </div>
  )
}
