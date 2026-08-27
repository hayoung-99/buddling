/**
 * '받기' 단추가 어느 파일을 가리키는지 알아보는 규칙.
 *
 * 히어로의 스마트 받기 단추(`DownloadButtons.tsx`, 브라우저에서 돈다)와 버전 히스토리
 * 화면(`releases.ts`, 서버에서 돈다)이 **같은 파일 이름 규칙**을 봐야 한다. 예전에는
 * 이 규칙이 `DownloadButtons.tsx` 안에만 있어서, 서버 쪽이 따로 만들면 이름 규칙이
 * 바뀔 때 한쪽만 고치고 넘어가기 쉬웠다.
 */
export const ASSET_MATCHERS: Record<string, (name: string) => boolean> = {
  'mac-arm64': (name) => name.endsWith('-arm64.dmg'),
  'mac-x64': (name) => name.endsWith('-x64.dmg'),
  windows: (name) => name.endsWith('.exe'),
}

/** 자산 열쇠 → 화면에 보일 OS 이름. 나라말을 안 타는 고유 명사라 사전에 넣지 않는다. */
export const ASSET_OS_LABELS: Record<string, string> = {
  'mac-arm64': 'macOS',
  'mac-x64': 'macOS',
  windows: 'Windows',
}
