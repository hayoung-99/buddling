import type { NextConfig } from 'next'

/**
 * 정적 export(`output: 'export'`)를 쓰지 않는다.
 *
 * Next 는 RSC 페이로드를 인라인 `<script>` 로 넣기 때문에, 정적으로 뽑으면 CSP 의
 * `script-src` 에 `'unsafe-inline'` 을 열어 줘야 한다. 지금 랜딩은 `default-src 'none'`
 * 에서 시작하는 CSP 를 갖고 있고 그게 자산이라, 그걸 깎느니 서버에서 요청마다 nonce 를
 * 발급하는 편을 골랐다 (`middleware.ts`). 어드민에 서버 경계가 필요하다는 점과도 맞는다.
 *
 * 페이지 자체는 여전히 빌드 시점에 생성된다 — 랜딩은 사람마다 다를 것이 없다.
 */
const config: NextConfig = {
  // 지금 주소를 그대로 지킨다. 예전 vercel.json 의 cleanUrls · trailingSlash 와 같은 뜻이다.
  trailingSlash: true,

  // 그림은 손으로 뽑아 `public/assets` 에 둔 것을 그대로 쓴다. 최적화 계층을 끼우면
  // 파일 이름이 바뀌어 예전 주소를 잃고, CSP 도 넓혀야 한다.
  images: { unoptimized: true },
}

export default config
