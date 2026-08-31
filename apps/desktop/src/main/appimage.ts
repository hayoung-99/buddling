/**
 * 지금 프로세스가 **갈아끼울 수 있는 AppImage** 로 떠 있는지 본다.
 *
 * 왜 미리 보는가: electron-updater 는 AppImage 가 아닐 때 오류를 내지 않고
 * `checkForUpdates()` 에서 조용히 null 을 돌려준다(AppUpdater.js:253). 그래서
 * "일단 해 보고 실패하면 알림으로 갈아탄다" 는 길이 리눅스에서는 통하지 않는다 —
 * 갈아탈 신호 자체가 오지 않아 매일 아침 아무 일도 일어나지 않는다.
 * 기획서가 금지한 "조용히 아무 일도 하지 않는 상태" 가 바로 이것이다.
 *
 * 판정 기준은 electron-updater 쪽과 **일부러 똑같이** 맞춰 두었다.
 * 우리가 통과시킨 것을 저쪽이 throw 하면 다시 조용한 실패가 되기 때문이다.
 */

import { accessSync, constants } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

export interface AppImageEnvironment {
  /** `process.env.APPIMAGE` — AppImage 로 떴을 때만 런타임이 넣어 준다 */
  appImagePath?: string
  /** `process.env.SNAP` — snap 으로 떴으면 electron-updater 가 스스로 꺼진다 */
  snapPath?: string
  /** 그 폴더에 쓸 수 있는가. 테스트가 갈아 끼운다 */
  canWriteDir: (dir: string) => boolean
}

/** 진짜 환경을 읽는다. 이 함수만 바깥세상을 안다. */
function readAppImageEnvironment(): AppImageEnvironment {
  return {
    appImagePath: process.env.APPIMAGE,
    snapPath: process.env.SNAP,
    canWriteDir(dir) {
      try {
        accessSync(dir, constants.W_OK)
        return true
      } catch {
        // 없는 폴더 · 권한 없음 · 읽기 전용 마운트 — 어느 쪽이든 갈아끼울 수 없다
        return false
      }
    },
  }
}

function canReplaceAppImage(env: AppImageEnvironment): boolean {
  // snap 은 스토어가 갱신을 맡는다. electron-updater 도 여기서 스스로 꺼진다
  if (env.snapPath) return false

  const path = env.appImagePath
  // 압축을 풀어 AppRun 을 직접 실행했거나, AppImage 가 아예 아니다
  if (!path) return false

  // doInstall() 이 똑같은 검사를 하고 던진다 (AppImageUpdater.js:77)
  if (!isAbsolute(path) || path.includes('\0')) return false

  /*
   * **파일이 아니라 폴더의 권한을 본다.** doInstall() 은 기존 파일을
   * `unlinkSync` 로 지운 뒤 새 파일을 `mv` 로 그 자리에 놓는데, 둘 다 대상 파일이
   * 아니라 담긴 디렉터리에 쓰기 권한을 요구한다. 파일 권한을 보면 /opt 에 root
   * 소유로 놓인 AppImage 를 "된다" 고 잘못 판정한다.
   */
  return env.canWriteDir(dirname(path))
}

export { canReplaceAppImage, readAppImageEnvironment }
