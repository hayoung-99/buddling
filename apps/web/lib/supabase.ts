import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * 어드민이 쓰는 Supabase 접속.
 *
 * **여기 실리는 것은 anon 키뿐이다.** 브라우저에 그대로 나가지만 그래도 되는 이유는,
 * 테이블이 전부 RLS 로 잠겨 있고 어드민 집계는 `is_admin()` 을 확인하는 함수를 통해서만
 * 나오기 때문이다 (`supabase/schema.sql`). **service role 키는 이 저장소 어디에도 두지
 * 않는다** — 그 키는 RLS 를 통째로 지나가므로 웹에 실리면 그것으로 끝이다.
 *
 * 값은 빌드할 때 코드 안으로 박힌다(`NEXT_PUBLIC_` 이 그런 뜻이다). 그래서 **Vercel 에서
 * 환경변수를 바꾸면 다시 배포해야** 반영된다.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** 접속 정보가 있는가. 없으면 어드민만 안내 화면을 띄운다 — 랜딩은 Supabase 를 안 쓴다. */
export const isConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error('SUPABASE_NOT_CONFIGURED')
  // 한 번 만든 것을 계속 쓴다. 두 개를 만들면 로그인 상태를 서로 모르는 채로 갈린다.
  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 매직링크는 주소에 붙어서 돌아온다. 이걸 켜 둬야 그걸 읽어 로그인으로 바꾼다.
      detectSessionInUrl: true,
    },
  })
  return client
}
