/**
 * 팀 창·설정 창이 함께 쓰는 갈고리들.
 *
 * 예전에는 `ui.js` 가 화면을 통째로 다시 조립하면서 입력 중이던 칸의 포커스와 캐럿을
 * 손으로 되돌려 놓았다. React 는 바뀐 곳만 손대므로 그 일이 필요 없어졌다 — 대신
 * 입력 칸을 제어 컴포넌트로 두는 것이 그 자리를 대신한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '@buddling/shared/state'

/** 알림 화면과 함께 쓰는 갈고리라 거기로 옮겼다. 여기서는 자리만 지키며 다시 내보낸다. */
export { useMinuteTick } from '../use-minute-tick'

/**
 * 메인 프로세스가 보내 주는 상태를 따라간다.
 *
 * preload 의 `onState` 는 한 번 걸면 떼는 길이 없다. 그래서 이 갈고리는 창 하나에
 * 한 번만 쓰고, `StrictMode` 로 감싸지 않는다 (감싸면 개발 중에 두 번 걸린다).
 */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.teamApi.onState(setState)
    window.teamApi.onError(setError)
    void window.teamApi.getState().then(setState)
  }, [])

  return { state, error, setError }
}

/**
 * 비동기 동작 중에는 버튼을 잠그고, 실패하면 메시지를 남기는 실행기.
 *
 * `busy` 를 ref 로도 들고 있는 이유는, 연달아 눌렀을 때 아직 반영되지 않은 상태 대신
 * 지금 값을 봐야 두 번 나가는 것을 막을 수 있기 때문이다.
 */
export function useRunner(setError: (message: string) => void) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError('')
      try {
        await action()
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [setError],
  )

  return { busy, run }
}

/** 잠깐 떴다 사라지는 알림 한 줄 */
export function useToast() {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback((next: string) => {
    setMessage(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), 1600)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { message, show }
}
