import { NextResponse } from 'next/server'

/**
 * 보안 헤더를 붙인다.
 *
 * 예전 `vercel.json` 이 들고 있던 것이 이리로 왔다. 여기 있으면 `next start` 로 띄운
 * 것에도 똑같이 붙으므로, `scripts/check-site.js` 가 실제 응답에서 검사할 수 있다.
 * `vercel.json` 에 두면 Vercel 위에서만 붙어서 검사할 방법이 없다.
 *
 * ## `script-src` 에 `'unsafe-inline'` 이 있는 이유
 *
 * 한동안 여기서 요청마다 nonce 를 만들어 CSP 에 실었다. **그런데 그 페이지들은 빌드
 * 때 구워 둔 것이라, Next 가 nonce 를 붙일 기회가 아예 없었다.** Next 는 요청을
 * 그리는 도중에 자기 스크립트에 nonce 를 다는데, 구워 둔 HTML 에는 그릴 순간이
 * 없다. 그래서 헤더에는 nonce 가 있고 HTML 에는 없는 상태가 되어 **랜딩의 자바스크립트가
 * 통째로 막혀 있었다** — 빼꼼 캐릭터가 영영 나오지 않고 받기 단추도 갱신되지 않았다.
 * 화면은 멀쩡해 보이고 콘솔에만 남아서, 올린 사람도 모르고 지나갔다.
 *
 * 고르는 길은 둘뿐이었다.
 *
 * 1. 페이지를 요청마다 그린다. 그러면 nonce 가 붙지만 **HTML 을 캐시할 수 없다** —
 *    캐시된 nonce 는 모두에게 같은 값이라 `'unsafe-inline'` 과 다를 바가 없다.
 *    즉 *캐시되는 페이지와 요청마다 다른 nonce 는 동시에 가질 수 없다.*
 * 2. 구워 둔 채로 두고 인라인을 허용한다.
 *
 * 랜딩은 사람마다 다를 것이 없고 첫인상이 빠른 편이 나으므로 2를 골랐다. 이 페이지에
 * 들어오는 바깥 값이 하나도 없다는 점도 근거다 — 문구도 구조화 데이터도 전부 빌드
 * 때 정해진 상수라, 인라인을 허용한다고 해서 새로 열리는 구멍이 없다.
 *
 * **어드민(`/admin`)이 생기면 그때는 이야기가 다르다.** 그쪽은 어차피 요청마다 그려야
 * 하므로 nonce 가 제값을 한다. 그때 이 함수에서 경로를 보고 갈라 주면 된다.
 *
 * 나머지 지시는 그대로 좁게 남는다 — `default-src 'none'` 에서 시작해서 필요한 것만
 * 하나씩 연다.
 */
export function middleware() {
  const csp = [
    "default-src 'none'",
    "img-src 'self'",
    "style-src 'self'",
    // 구워 둔 HTML 안의 인라인 스크립트(Next 의 RSC 페이로드)를 허용한다. 위 주석 참고.
    "script-src 'self' 'unsafe-inline'",
    // 받기 버튼이 최신 릴리스를 물어보는 곳
    'connect-src https://api.github.com',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return response
}

export const config = {
  // 자산과 Next 내부 파일은 지난다 — 헤더를 붙일 이유가 없고 매 요청마다 도는 비용만 든다.
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico).*)'],
}
