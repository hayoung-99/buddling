import type { ReactNode } from 'react'
import type { Copy, DownloadRow } from '../lib/copy'
import type { ReleaseEntry } from '../lib/releases'
import { BRAND } from '../lib/site'
import { SiteFooter } from './SiteFooter'

/**
 * `/download`(영어는 `/en/download`) — 버전 히스토리로 받는 화면.
 *
 * **자바스크립트가 없다.** 파일 주소·크기·버전은 서버(`app/download/page.tsx`)가
 * 요청을 받을 때 깃허브에서 가져와 이미 굳혀서 내보낸다. 옛 버전을 펼치고 접는
 * 것도 `<details>` 하나로 돈다 — 랜딩의 히어로 받기 단추처럼 브라우저에서 다시
 * 추측할 것이 없다(그건 "지금 이 컴퓨터에 맞는 것"을 골라야 해서 다르다).
 *
 * 폰으로 열었을 때는 이 목록 대신 `DownloadMobileGate` 가 뜬다 — 어느 쪽을 낼지는
 * `app/download/page.tsx` 가 `lib/device.ts` 로 미리 가른다.
 */

/** 창 크롬(제목줄·꼬리말)은 목록 화면과 폰 안내 화면이 똑같이 쓴다 */
function Chrome({
  copy,
  homeHref,
  other,
  children,
}: {
  copy: Copy
  homeHref: string
  other: Copy['other']
  children: ReactNode
}) {
  return (
    <div className="stage">
      <div className="window">
        <header className="titlebar">
          <svg className="lights" viewBox="0 0 56 12" aria-hidden="true" focusable="false">
            <circle cx="6" cy="6" r="6" fill="#ff5f57" />
            <circle cx="26" cy="6" r="6" fill="#febc2e" />
            <circle cx="46" cy="6" r="6" fill="#28c840" />
          </svg>
          <span className="title">{BRAND}</span>
          <nav>
            <a href={homeHref}>{copy.download.backHome}</a>
            <a className="lang" href={other.href} hrefLang={other.lang} lang={other.lang}>
              {other.short}
            </a>
          </nav>
        </header>

        <main id="main">{children}</main>

        <SiteFooter copy={copy} />
      </div>
    </div>
  )
}

/** 나란한 줄끼리 묶는다 — `rows` 는 이미 OS 별로 붙어 있어서 라벨이 바뀌는 자리가 경계다 */
function groupByLabel(rows: DownloadRow[]): { label: string; items: DownloadRow[] }[] {
  const groups: { label: string; items: DownloadRow[] }[] = []
  for (const row of rows) {
    const last = groups.at(-1)
    if (last && last.label === row.label) last.items.push(row)
    else groups.push({ label: row.label, items: [row] })
  }
  return groups
}

/**
 * 줄 오른쪽의 받기 단추 — 이름표 없이 화살표 하나로만 말한다.
 * 화면엔 글자가 없으니 스크린리더에게는 `label` 로 무엇을 받는지 알려 준다.
 */
function DownloadIcon({ href, label }: { href: string; label: string }) {
  return (
    <a className="dl-icon-btn" href={href} aria-label={label}>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
        <path d="M10 3v10m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </a>
  )
}

function VersionRows({ copy, entry }: { copy: Copy; entry: ReleaseEntry }) {
  const groups = groupByLabel(copy.download.rows)
    .map((group) => ({
      label: group.label,
      items: group.items.filter((row) => entry.matches[row.asset]),
    }))
    // 이 버전에 아직 없던 OS(예: 윈도우가 나오기 전 버전)는 카드째로 뺀다
    .filter((group) => group.items.length > 0)

  return (
    <div className="dl-groups">
      {groups.map((group) => (
        <div className="dl-group" key={group.label}>
          <h3>{group.label}</h3>
          <div className="dl-list">
            {group.items.map((row) => {
              const match = entry.matches[row.asset]
              if (!match) return null
              return (
                <div className="dl-row" key={row.asset}>
                  <span className="name">{row.name}</span>
                  <DownloadIcon href={match.url} label={`${copy.download.button} ${row.name}`} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function DownloadPage({
  copy,
  releases,
  homeHref,
  other,
}: {
  copy: Copy
  releases: ReleaseEntry[]
  /** 창 제목줄의 '돌아가기' 가 향하는 곳 — 그 나라말의 랜딩 */
  homeHref: string
  /** 언어 바꾸기 — 이 화면(다운로드)의 반대쪽 나라말 주소로, 라벨은 `copy.other` 그대로 */
  other: Copy['other']
}) {
  const [latest, ...older] = releases

  return (
    <Chrome copy={copy} homeHref={homeHref} other={other}>
      <section className="pane">
        <p className="label">{copy.download.label}</p>
        <h1>{copy.download.heading}</h1>
        <p className="sub">{copy.download.sub}</p>

        {latest ? (
          <div className="versions">
            <div className="pane-head">
              <h2>{latest.version}</h2>
              <span className="tag">{copy.download.latest}</span>
            </div>
            <VersionRows copy={copy} entry={latest} />
            <a className="release-notes" href={latest.releaseUrl}>
              {copy.download.releaseNotes} →
            </a>

            {older.map((entry) => (
              <details className="version-older" key={entry.version}>
                <summary>{entry.version}</summary>
                <div className="version-body">
                  <VersionRows copy={copy} entry={entry} />
                  <a className="release-notes" href={entry.releaseUrl}>
                    {copy.download.releaseNotes} →
                  </a>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="hint">{copy.download.pending}</p>
        )}
      </section>
    </Chrome>
  )
}

/**
 * 폰으로 `/download` 를 열었을 때 목록 대신 뜨는 안내.
 *
 * 목록을 보여줘도 어차피 받은 파일을 열 수 없으니(데스크톱 앱), 아예 다른 화면을
 * 낸다 — `app/download/page.tsx` 가 `lib/device.ts` 로 미리 가른 뒤 이걸 그린다.
 */
export function DownloadMobileGate({
  copy,
  homeHref,
  other,
}: {
  copy: Copy
  homeHref: string
  other: Copy['other']
}) {
  return (
    <Chrome copy={copy} homeHref={homeHref} other={other}>
      <section className="pane gate">
        <p className="label">{copy.download.label}</p>
        <h1>{copy.download.mobileGateHeading}</h1>
        <p className="sub">{copy.download.mobileGateBody}</p>
      </section>
    </Chrome>
  )
}
