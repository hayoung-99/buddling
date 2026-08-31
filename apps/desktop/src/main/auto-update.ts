/**
 * 새 버전을 **받아서 설치까지** 한다. electron-updater 를 감싼 얇은 껍데기다.
 *
 * 흐름
 *   1. 조용히 확인하고 조용히 내려받는다 (사용자는 아무것도 보지 않는다)
 *   2. 다 받으면 알린다 → 팀 창에 "새 버전을 받았어요 · 지금 적용하기" 가 뜬다
 *   3. 그걸 누르면 `install()` 이 앱을 다시 띄우며 갈아끼운다
 *   4. 안 눌러도 다음에 앱을 종료할 때 알아서 적용된다 (autoInstallOnAppQuit)
 *
 * 어디서 받아오는지는 여기 적지 않는다. `package.json` 의 `build.publish` 로
 * 빌드할 때 `app-update.yml` 이 앱 안에 들어가고, electron-updater 가 그걸 읽는다.
 * 저장소를 옮기면 그 한 곳만 고치면 된다.
 *
 * 받은 파일이 진짜인지는 릴리스의 `latest.yml` 에 적힌 SHA512 로 대조한다.
 * 코드 서명이 없어도 "받다가 깨졌거나 바뀐 파일"은 걸러진다.
 */

import { autoUpdater } from 'electron-updater'

/**
 * 언제 볼지는 `update-schedule.js` 가 정한다 — 아침에 하루 한 번이다.
 * 받아 두는 일이라 더 자주 봐도 되지만, 일하는 도중에 "받았어요" 줄이 불쑥
 * 뜨는 편보다 하루를 시작할 때 한 번 뜨는 편이 낫다.
 *
 */
export interface AutoUpdateOptions {
  onReady: (info: { version: string }) => void
  onFailure: () => void
  /** 언제 볼지를 정해 주는 쪽. 부르면 그때마다 확인한다. */
  schedule: (check: () => void) => { stop: () => void }
}

function startAutoUpdate({ onReady, onFailure, schedule }: AutoUpdateOptions) {

  let stopped = false
  let downloaded = false
  let failureReported = false
  let installAttempted = false

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // 앱이 스스로 오류창을 띄우지 않게 한다. 실패는 아래에서 우리가 처리한다.
  autoUpdater.logger = null

  autoUpdater.on('update-downloaded', (info) => {
    if (stopped) return
    downloaded = true
    onReady({ version: String(info?.version ?? '').replace(/^v/i, '') })
  })

  autoUpdater.on('error', () => {
    if (stopped || failureReported) return
    /*
     * 받아 둔 뒤에 그냥 난 오류는 무시한다 — 적용은 여전히 할 수 있다.
     * 다만 **적용을 눌렀다가 난 오류는 버리면 안 된다.** 리눅스의 doInstall 은
     * 이 프로세스 안에서 파일을 직접 지우고 옮기므로(권한·디스크) 실패할 수 있고,
     * 그대로 두면 사람이 "지금 적용하기" 를 눌러도 아무 일이 없는 것처럼 보인다.
     */
    if (downloaded && !installAttempted) return
    failureReported = true
    onFailure()
  })

  const scheduled = schedule(() => {
    if (stopped || downloaded) return
    // checkForUpdates 는 실패하면 위의 'error' 로도 알려주지만,
    // 반환된 약속이 거부되는 경로도 있어 여기서도 삼켜 준다.
    autoUpdater.checkForUpdates()?.catch(() => {})
  })

  return {
    stop() {
      stopped = true
      scheduled.stop()
    },

    /** 지금 갈아끼운다. 앱이 꺼졌다가 새 버전으로 다시 뜬다. */
    install() {
      if (!downloaded) return
      // 이 뒤로 오는 오류는 "적용 실패" 다. 위 처리기가 알림 길로 갈아탄다
      installAttempted = true
      // (조용히 설치, 끝나면 다시 실행)
      autoUpdater.quitAndInstall(true, true)
    },
  }
}

export { startAutoUpdate }
