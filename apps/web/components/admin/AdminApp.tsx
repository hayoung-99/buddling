'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from '../../lib/supabase'
import { fetchIsAdmin } from '../../lib/admin'
import { Dashboard } from './Dashboard'
import { TeamList } from './TeamList'

/**
 * 어드민의 문지기.
 *
 * 화면은 넷 중 하나다 — 설정 없음 · 로그인 전 · 권한 없음 · 숫자판.
 *
 * **여기서 감추는 것은 편의일 뿐이다.** 실제로 막는 것은 DB 다. 집계를 내주는 함수가
 * 전부 첫 줄에서 `is_admin()` 을 확인하므로, 이 화면을 우회해 RPC 를 직접 불러도
 * `FORBIDDEN` 만 돌아온다.
 */

type Gate = 'loading' | 'anonymous' | 'denied' | 'admin'

export function AdminApp() {
  const [gate, setGate] = useState<Gate>('loading')
  const [session, setSession] = useState<Session | null>(null)

  /** 로그인 상태가 바뀔 때마다 "이 사람이 어드민인가" 를 서버에 다시 묻는다 */
  const evaluate = useCallback(async (next: Session | null) => {
    setSession(next)
    if (!next) {
      setGate('anonymous')
      return
    }
    try {
      setGate((await fetchIsAdmin()) ? 'admin' : 'denied')
    } catch {
      setGate('denied')
    }
  }, [])

  useEffect(() => {
    if (!isConfigured) return

    void supabase()
      .auth.getSession()
      .then(({ data }) => evaluate(data.session))

    // 로그인과 로그아웃이 여기로 알려온다
    const { data } = supabase().auth.onAuthStateChange((_event, next) => {
      void evaluate(next)
    })
    return () => data.subscription.unsubscribe()
  }, [evaluate])

  if (!isConfigured) return <NotConfigured />

  return (
    <main className="admin">
      <header className="admin-top">
        <h1>Buddling 어드민</h1>
        {session && (
          <button
            type="button"
            className="admin-plain"
            onClick={() => void supabase().auth.signOut()}
          >
            {session.user.email} · 로그아웃
          </button>
        )}
      </header>

      {gate === 'loading' && <p className="admin-note">확인하는 중이에요…</p>}
      {gate === 'anonymous' && <SignIn />}
      {gate === 'denied' && (
        <p className="admin-note">
          이 계정에는 어드민 권한이 없어요. 다른 계정으로 로그인하거나, Supabase 의{' '}
          <code>admins</code> 표에 이 주소를 넣어 주세요.
        </p>
      )}
      {/*
        숫자판과 방 목록을 여기서 나란히 얹는다. 서로 아무것도 주고받지 않고 각자
        자기 것을 받아 오므로, 한쪽이 실패해도 다른 쪽은 그대로 보인다.
      */}
      {gate === 'admin' && (
        <>
          <Dashboard />
          <TeamList />
        </>
      )}
    </main>
  )
}

/**
 * 로그인.
 *
 * 메일 주소와 비밀번호 두 칸이 전부다. **가입하는 길은 여기 없다** — 계정은 Supabase
 * 대시보드에서 손으로 만든다. 혼자 보는 화면이라 문이 하나뿐인 편이 지키기 쉽다.
 *
 * 한동안은 매직링크였다. 숫자 한 번 보려고 메일함을 왕복하는 것이 번거로워 비밀번호로
 * 옮겼고, **`autoComplete` 를 달아 두는 이유가 그것이다** — 비밀번호 관리자가 두 칸을
 * 한 번에 채우지 못하면 옮겨서 얻는 것이 없다.
 *
 * **잊었을 때 되찾는 길도 여기 없다.** 대시보드에서 재설정한다. 이 화면이 읽기 전용
 * 이라는 성질은 로그인 방식이 바뀌어도 그대로다.
 */

/**
 * Supabase 가 돌려주는 말을 일상어로 옮긴다.
 *
 * 그대로 보여 주면 영어 기술 문장이 뜬다. 자주 만날 셋만 손으로 옮기고 나머지는
 * 원문을 남긴다 — 모르는 오류를 "알 수 없는 오류" 로 뭉개면 알아볼 방법이 없어진다.
 *
 * **메일 확인이 안 된 계정을 따로 옮겨 두는 이유가 있다.** 대시보드에서 계정을 만들 때
 * Auto Confirm 을 빠뜨리면 여기 걸리는데, 그 사정을 모르면 원인을 찾을 단서가 없다.
 */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return '메일 주소나 비밀번호가 맞지 않아요.'
  }
  if (/email not confirmed/i.test(message)) {
    return '이 계정은 메일 확인이 안 되어 있어요. Supabase 대시보드에서 확인 처리해 주세요.'
  }
  if (/rate limit|too many requests/i.test(message)) {
    return '너무 여러 번 시도했어요. 잠시 뒤에 다시 해 주세요.'
  }
  return message
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSigning(true)
    setError(null)
    const { error: failed } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    // 성공하면 onAuthStateChange 가 이 폼을 걷어내므로 여기서 되돌릴 것이 없다.
    // 실패했을 때만 단추를 다시 살린다.
    if (failed) {
      setError(friendly(failed.message))
      setSigning(false)
    }
  }

  return (
    <form className="admin-signin" onSubmit={submit}>
      <label htmlFor="admin-email">메일 주소</label>
      <input
        id="admin-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />
      <label htmlFor="admin-password">비밀번호</label>
      <input
        id="admin-password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit" disabled={signing}>
        {signing ? '들어가는 중…' : '들어가기'}
      </button>
      {error && <p className="admin-error">{error}</p>}
    </form>
  )
}

/*
 * 환경변수 없이 빌드하면 여기로 온다. 랜딩은 Supabase 를 전혀 쓰지 않으므로 이 상태에서도
 * 멀쩡하다 — 어드민만 이 안내를 띄운다.
 */
function NotConfigured() {
  return (
    <main className="admin">
      <h1>Buddling 어드민</h1>
      <p className="admin-note">
        Supabase 접속 정보가 없습니다. Vercel 프로젝트에{' '}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> 과 <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를
        넣고 <strong>다시 배포</strong>해 주세요. 이 값은 빌드할 때 코드 안으로 들어가서,
        환경변수만 바꾸면 반영되지 않습니다.
      </p>
    </main>
  )
}
