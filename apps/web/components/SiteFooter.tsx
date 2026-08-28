import type { Copy } from '../lib/copy'
import { RELEASES_PAGE } from '../lib/site'

/**
 * 창 꼬리말 — 랜딩과 `/download` 가 똑같이 쓴다.
 *
 * 언어 바꾸기는 여기 없다. 제목줄에 이미 있어서, 아래에 또 두면 같은 일을 하는
 * 링크가 한 화면에 둘이 된다.
 */

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  )
}

/** 깃허브 릴리스는 태그를 붙여 나가므로, 태그 모양으로 그린다 */
function ReleasesIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none">
      <path
        d="M9.5 1.5H6.83a1 1 0 0 0-.71.29l-4.33 4.33a1 1 0 0 0 0 1.41l6.17 6.17a1 1 0 0 0 1.41 0l4.33-4.33a1 1 0 0 0 .29-.71V6.5L9.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
    </svg>
  )
}

export function SiteFooter({ copy }: { copy: Copy }) {
  return (
    <footer>
      <nav>
        <a href="https://github.com/hayoung-99/buddling">
          <GitHubIcon />
          {copy.footer.github}
        </a>
        <a href={RELEASES_PAGE}>
          <ReleasesIcon />
          {copy.footer.releases}
        </a>
      </nav>
    </footer>
  )
}
