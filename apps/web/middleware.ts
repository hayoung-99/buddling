import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 요청마다 nonce 를 만들어 CSP 에 싣는다.
 *
 * 예전 `vercel.json` 이 들고 있던 헤더가 이리로 왔다. 달라진 것은 `script-src` 하나뿐이다 —
 * Next 가 넣는 인라인 스크립트를 `'unsafe-inline'` 대신 **이 nonce 로** 허용한다.
 * `'strict-dynamic'` 을 함께 둬서, 그 스크립트가 불러오는 것까지만 이어서 허용된다.
 *
 * 이 파일이 없으면 페이지가 통째로 하얗게 뜬다. 지우지 마세요.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    "default-src 'none'",
    "img-src 'self'",
    "style-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // 받기 버튼이 최신 릴리스를 물어보는 곳
    'connect-src https://api.github.com',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  // Next 는 **요청** 헤더의 CSP 에서 nonce 를 찾아 자기가 넣는 스크립트에 붙인다.
  // 응답에만 달면 페이지가 통째로 막힌다.
  headers.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return response
}

export const config = {
  // 자산과 Next 내부 파일은 지난다 — 헤더를 붙일 이유가 없고 매 요청마다 도는 비용만 든다.
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico).*)'],
}
