/**
 * 주소와 저장소처럼 페이지·구조화 데이터·robots·sitemap 이 함께 보는 값.
 *
 * **도메인을 바꿀 때 고칠 곳은 여기 하나입니다.** 예전에는 같은 주소가 두 HTML 과
 * sitemap · robots · llms.txt 에 흩어져 있어서 한 곳을 빠뜨리기 쉬웠고,
 * canonical 이 어긋나면 검색엔진이 색인을 둘로 나눠 잡는다는 이유로
 * `check-site.js` 가 그걸 검사하고 있었다.
 */

export const SITE_URL = 'https://tap-tap-desktop.vercel.app'

export const REPO = 'hayoung-99/tap-tap'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASES_PAGE = `${REPO_URL}/releases`
export const RELEASES_LATEST = `${RELEASES_PAGE}/latest`
export const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
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
export const MODIFIED = '2026-08-19'

/** 앱 버전. `apps/desktop/package.json` 이 진짜이고 여기는 구조화 데이터용 사본이다. */
export const APP_VERSION = '0.4.0'

/** 나라말별 주소 (hreflang · sitemap · canonical 이 함께 쓴다) */
export const LOCALE_PATHS = { ko: '/', en: '/en/' } as const

export const absolute = (path: string) => new URL(path, SITE_URL).toString()
