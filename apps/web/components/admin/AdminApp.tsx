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

    // 매직링크를 눌러 돌아오면 여기로 알려온다
    const { data } = supabase().auth.onAuthStateChange((_event, next) => {
      void evaluate(next)
    })
    return () => data.subscription.unsubscribe()
  }, [evaluate])

  if (!isConfigured) return <NotConfigured />

  return (
    <main className="admin">
      <header className="admin-top">
        <h1>tap-tap 어드민</h1>
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
        숫자판과 팀 목록을 여기서 나란히 얹는다. 서로 아무것도 주고받지 않고 각자
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
 * 매직링크 보내기.
 *
 * 비밀번호를 두지 않는 이유는 하나 더 관리할 것이 늘기 때문이다. 메일함을 못 열면
 * 들어올 수 없다는 점에서 확인 절차 노릇도 함께 한다.
 *
 * **어드민이 아닌 주소에는 메일이 아예 나가지 않는다.** 그 판단은 여기가 아니라 서버가
 * 한다 — `supabase/schema.sql` 의 `restrict_admin_signup` 훅이 계정 생성 단계에서
 * 막고, 그 사정이 아래 오류로 돌아온다. 화면에서 미리 걸러 보려 해도 브라우저는
 * 어드민 목록을 읽을 수 없다 (그래야 목록이 새지 않는다).
 */

/**
 * Supabase 가 돌려주는 말을 일상어로 옮긴다.
 *
 * 그대로 보여 주면 영어 기술 문장이 뜬다. 자주 만날 둘만 손으로 옮기고 나머지는
 * 원문을 남긴다 — 모르는 오류를 "알 수 없는 오류" 로 뭉개면 알아볼 방법이 없어진다.
 */
function friendly(message: string): string {
  if (/rate limit/i.test(message)) {
    return '메일을 너무 자주 보냈어요. 잠시 뒤에 다시 해 주세요 (시간당 두 통까지예요).'
  }
  if (/not allowed|signups? not allowed|403/i.test(message)) {
    return '등록된 어드민 주소가 아니에요.'
  }
  return message
}
function SignIn() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setState('sending')
    setError(null)
    const { error: failed } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/admin/` },
    })
    if (failed) {
      setError(friendly(failed.message))
      setState('idle')
      return
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <p className="admin-note">
        <strong>{email}</strong> 으로 링크를 보냈어요. 메일에서 링크를 누르면 들어옵니다.
      </p>
    )
  }

  return (
    <form className="admin-signin" onSubmit={send}>
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
      <button type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? '보내는 중…' : '링크 받기'}
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
      <h1>tap-tap 어드민</h1>
      <p className="admin-note">
        Supabase 접속 정보가 없습니다. Vercel 프로젝트에{' '}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> 과 <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를
        넣고 <strong>다시 배포</strong>해 주세요. 이 값은 빌드할 때 코드 안으로 들어가서,
        환경변수만 바꾸면 반영되지 않습니다.
      </p>
    </main>
  )
}
