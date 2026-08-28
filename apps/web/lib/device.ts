import { headers } from 'next/headers'

/**
 * `/download` 를 폰으로 열었는지 서버에서 가른다.
 *
 * 자바스크립트 없는 화면이라(`DownloadPage.tsx` 참고) 브라우저의 `userAgentData` 를
 * 못 쓴다 — 요청 헤더의 User-Agent 문자열만 본다. 히어로의 `canRunDesktopApp()`
 * 과 같은 규칙을 쓴다. 아이패드는 데스크톱 사파리인 척해서 여기 안 걸리는데, 그
 * 정도는 받아들인다 — 이 화면이 막으려는 건 "손가락으로 열어 본 폰"이 가장 흔한
 * 경우이고, 아이패드까지 완벽하게 가리려면 클라이언트 코드가 다시 필요해진다.
 *
 * **검색엔진 로봇은 언제나 통과시킨다.** 구글의 모바일 크롤러 User-Agent 에도
 * `Android` 가 들어 있어서, 이 예외가 없으면 검색엔진이 실제 목록 대신 이 안내
 * 화면만 읽어 간다.
 *
 * `headers()` 를 부르는 순간 이 라우트는 요청마다 다시 그려진다(정적으로 미리
 * 굽지 않는다) — 이 화면 하나만 그렇고 랜딩은 그대로 정적이다.
 */
export async function isMobileRequest(): Promise<boolean> {
  const ua = (await headers()).get('user-agent') ?? ''
  if (/bot|crawler|spider/i.test(ua)) return false
  return /Android|iPhone|iPod/i.test(ua)
}
