import { ASSET_MATCHERS } from './assets'
import { RELEASES_LIST_API } from './site'

/**
 * `/download` 가 보여줄 버전 목록을 깃허브에서 가져온다.
 *
 * 서버 컴포넌트 안에서만 부른다 — 브라우저로는 안 나가므로 토큰 없이 부르는
 * 공개 API 로도 충분하다(분당 60회 한도, 이 화면 하나가 쓰는 정도로는 넉넉하다).
 * `next: { revalidate }` 로 일정 시간마다만 다시 물어서, 열어 볼 때마다 깃허브를
 * 두드리지 않는다.
 */
const REVALIDATE_SECONDS = 1800

/** 보여줄 최대 버전 수. 참고한 화면(사설 앱의 받기 페이지)도 다섯 안팎이었다. */
const MAX_VERSIONS = 6

interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
}

interface GitHubRelease {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
  published_at?: string | null
  html_url?: string
  assets?: GitHubAsset[]
}

export interface ReleaseAssetMatch {
  url: string
  size: number
}

export interface ReleaseEntry {
  /** 'v' 를 뗀 버전. 예: '0.5.0' */
  version: string
  publishedAt: string | null
  /** 그 버전의 깃허브 릴리스 쪽으로 가는 링크 */
  releaseUrl: string
  /** 자산 열쇠('mac-arm64' 등) → 그 파일. 이 릴리스에 없으면 키 자체가 없다 */
  matches: Partial<Record<string, ReleaseAssetMatch>>
}

/**
 * 깃허브가 아무 답이 없을 때(사설 API 한도·네트워크 오류) 빈 목록을 준다.
 *
 * **화면이 텅 비는 것으로 실패를 알린다.** `copy.download.pending` 문구가 그 자리를
 * 채우므로, 여기서 오류를 던져 페이지 전체를 죽이지 않는다.
 */
export async function fetchReleases(): Promise<ReleaseEntry[]> {
  let releases: GitHubRelease[]
  try {
    const response = await fetch(RELEASES_LIST_API, {
      headers: { accept: 'application/vnd.github+json' },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!response.ok) return []
    releases = (await response.json()) as GitHubRelease[]
  } catch {
    return []
  }

  const entries: ReleaseEntry[] = []

  for (const release of releases) {
    if (release.draft || release.prerelease || !release.tag_name) continue

    const matches: Partial<Record<string, ReleaseAssetMatch>> = {}
    for (const [key, test] of Object.entries(ASSET_MATCHERS)) {
      const asset = (release.assets ?? []).find((item) => test(item.name))
      if (asset) matches[key] = { url: asset.browser_download_url, size: asset.size }
    }
    // 파일이 하나도 안 붙은 릴리스(초안이 공개로 바뀌기 직전 같은 순간)는 건너뛴다
    if (Object.keys(matches).length === 0) continue

    entries.push({
      version: release.tag_name.replace(/^v/i, ''),
      publishedAt: release.published_at ?? null,
      releaseUrl: release.html_url ?? '',
      matches,
    })

    if (entries.length >= MAX_VERSIONS) break
  }

  return entries
}
