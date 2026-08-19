import type { ReactNode } from 'react'
import type { Copy } from '../lib/copy'
import { buildJsonLd } from '../lib/jsonld'

/**
 * 나라말 한 벌의 `<html>` 껍데기.
 *
 * 레이아웃이 둘인 이유: `lang` 이 한국어판과 영어판에서 달라야 하는데 Next 의 루트
 * 레이아웃은 정적이다. 그래서 `app/(ko)` 와 `app/(en)` 이 각자 루트 레이아웃을 갖고,
 * 겹치는 부분은 이 컴포넌트 하나로 모았다.
 *
 * **여기서 `headers()` 를 읽지 않는다.** 읽는 순간 페이지가 요청마다 그려지는 것으로
 * 바뀌는데, 랜딩은 사람마다 다를 것이 없으므로 빌드 때 한 번 그려 두는 편이 맞다.
 *
 * 아래 `<script type="application/ld+json">` 은 실행되는 스크립트가 아니라 데이터
 * 덩어리라 CSP 의 `script-src` 가 보지 않는다. 진짜 스크립트를 CSP 가 어떻게
 * 허용하는지는 `middleware.ts` 에 적어 두었다 — 한때 여기에 nonce 를 붙이려 했다가
 * 구워 둔 페이지에는 붙일 자리가 없다는 것을 뒤늦게 알았다.
 */
export function RootHtml({ copy, children }: { copy: Copy; children: ReactNode }) {
  const jsonLd = buildJsonLd(copy)

  return (
    <html lang={copy.locale}>
      <body>
        {children}
        <script
          type="application/ld+json"
          // 우리가 만든 객체를 그대로 직렬화한 것이라 바깥 값이 섞이지 않는다
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  )
}
