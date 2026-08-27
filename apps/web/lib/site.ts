/**
 * 주소와 저장소처럼 페이지·구조화 데이터·robots·sitemap 이 함께 보는 값.
 *
 * **도메인을 바꿀 때 고칠 곳은 여기 하나입니다.** 예전에는 같은 주소가 두 HTML 과
 * sitemap · robots · llms.txt 에 흩어져 있어서 한 곳을 빠뜨리기 쉬웠고,
 * canonical 이 어긋나면 검색엔진이 색인을 둘로 나눠 잡는다는 이유로
 * `check-site.js` 가 그걸 검사하고 있었다.
 */

/**
 * 화면에 보이는 서비스 이름.
 *
 * 만들어 낸 한 낱말이라 나라말마다 갈리지 않는다. 갈라 두면 구조화 데이터와
 * `og:site_name` 에서 같은 것을 가리키는 이름이 페이지마다 달라지고, 검색엔진이
 * 그걸 둘로 잡는다.
 */
export const BRAND = 'Buddling'

export const SITE_URL = 'https://buddling.vercel.app'

export const REPO = 'hayoung-99/buddling'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASES_PAGE = `${REPO_URL}/releases`
export const RELEASES_LATEST = `${RELEASES_PAGE}/latest`
export const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
/** 버전 히스토리 화면이 보는 목록. 최신 하나뿐인 `LATEST_API` 와 다르다. */
export const RELEASES_LIST_API = `https://api.github.com/repos/${REPO}/releases`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`

export const AUTHOR = { name: 'hayoung-99', url: 'https://github.com/hayoung-99' }

/** 링크를 공유했을 때 뜨는 그림 */
export const OG_IMAGE = { path: '/assets/og.png', width: 1200, height: 630 }

/**
 * 구조화 데이터가 밝히는 날짜.
 *
 * 릴리스 버전과 달리 이 값은 "페이지가 언제 손질됐나" 이고, 랜딩을 실제로 고칠 때만
 * 올린다. 자동으로 오늘 날짜를 넣지 않는다 — 아무것도 안 바뀐 날에도 바뀐 척하게 된다.
 */
export const PUBLISHED = '2026-08-13'
export const MODIFIED = '2026-08-21'

/** 앱 버전. `apps/desktop/package.json` 이 진짜이고 여기는 구조화 데이터용 사본이다. */
export const APP_VERSION = '0.4.0'

/** 나라말별 주소 (hreflang · sitemap · canonical 이 함께 쓴다) */
export const LOCALE_PATHS = { ko: '/', en: '/en/' } as const

/**
 * 버전 히스토리 화면의 나라말별 주소.
 *
 * 한국어가 기본(접두어 없음)·영어만 `/en/` 을 붙이는 `LOCALE_PATHS` 규칙을
 * 그대로 따른다 — 이 화면만 다른 규칙을 쓰면 hreflang·canonical 이 한 곳만
 * 어긋난다. **끝의 `/` 도 빠뜨리면 안 된다** — `next.config.ts` 의
 * `trailingSlash: true` 때문에 슬래시 없는 주소는 308 로 리다이렉트되고,
 * canonical·sitemap 이 리다이렉트 전 주소를 그대로 내보내면 실제 서빙 주소와
 * 어긋난다.
 */
export const DOWNLOAD_PATHS = { ko: '/download/', en: '/en/download/' } as const

export const absolute = (path: string) => new URL(path, SITE_URL).toString()
