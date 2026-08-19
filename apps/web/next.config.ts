import type { NextConfig } from 'next'

/**
 * 정적 export(`output: 'export'`)를 쓰지 않는다.
 *
 * 어드민(`/admin`)에는 서버 경계가 필요하고, 미들웨어로 붙이는 보안 헤더도 정적
 * export 로는 나가지 않기 때문이다. 페이지 자체는 여전히 빌드 시점에 구워진다 —
 * 랜딩은 사람마다 다를 것이 없다.
 *
 * **한때 여기 "정적 export 를 피하면 CSP 에 `'unsafe-inline'` 을 열지 않아도 된다"고
 * 적혀 있었는데 그건 틀린 말이었다.** export 를 안 쓰더라도 페이지를 빌드 때 구워
 * 두는 이상 요청마다 다른 nonce 를 붙일 자리가 없다. 그래서 랜딩의 자바스크립트가
 * 통째로 막혀 있었다. 자세한 사정은 `middleware.ts` 에 있다.
 *
 * `vercel.json` 에 남은 것은 자산 캐시처럼 요청과 무관한 것뿐이다. 그 사정을 저기가
 * 아니라 여기 적는 이유는, **`vercel.json` 에 주석을 넣을 수 없기 때문이다.** 스키마가
 * `additionalProperties: false` 라, 이 저장소가 다른 JSON 설정에 즐겨 쓰는 `"//"` 키를
 * 하나만 넣어도 빌드가 시작조차 못 하고 설정 오류로 끝난다. 실제로 그렇게 운영 배포를
 * 한 번 떨어뜨렸고, 그때 preview 는 멀쩡히 초록이었다.
 */
const config: NextConfig = {
  // 지금 주소를 그대로 지킨다. 예전 vercel.json 의 cleanUrls · trailingSlash 와 같은 뜻이다.
  trailingSlash: true,

  // 그림은 손으로 뽑아 `public/assets` 에 둔 것을 그대로 쓴다. 최적화 계층을 끼우면
  // 파일 이름이 바뀌어 예전 주소를 잃고, CSP 도 넓혀야 한다.
  images: { unoptimized: true },
}

export default config
