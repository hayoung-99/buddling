/**
 * 이름을 바꾸기 전(tap-tap)에 쓰던 저장 파일이 어디 있었는지.
 *
 * Electron 은 userData 폴더를 **앱 이름으로** 잡는다. 그래서 이름을 바꾸면 폴더가
 * 통째로 새로 생기고, 그 안에 있던 것들 — 무엇보다 **세션** — 을 못 찾는다. 이 앱에서
 * 세션은 곧 신원이라, 잃으면 속해 있던 방과 남남이 되고 되찾는 길은 초대코드로 다시
 * 들어오는 것뿐이다. 이름 하나 바꾼 것치고는 너무 큰 값이다.
 *
 * 그래서 새 파일이 아직 없을 때 **딱 한 번** 옛 파일을 읽어 새 자리에 옮겨 적는다.
 * 그 뒤로는 새 파일만 본다.
 *
 * 개발용 프로필(`DORAN_PROFILE`)로 띄운 것은 `app.setPath` 로 아예 다른 자리를 쓰므로
 * 옮겨 올 것이 없다. 그때는 `null` 을 돌려준다.
 */

import path from 'node:path'

/** 이름을 바꾸기 전의 폴더와 파일 이름. 둘 다 앱 이름에서 나왔다. */
const LEGACY_DIRECTORY = 'tap-tap'
const LEGACY_FILE = 'tap-tap.json'

/**
 * @param appDataDir 운영체제가 앱마다 폴더를 만들어 주는 자리 (`app.getPath('appData')`)
 * @param profile 개발용 프로필 이름. 있으면 옮겨 올 것이 없다
 */
export function legacyStorePath(appDataDir: string, profile?: string | null): string | null {
  if (!appDataDir) return null
  if (profile) return null

  return path.join(appDataDir, LEGACY_DIRECTORY, LEGACY_FILE)
}
