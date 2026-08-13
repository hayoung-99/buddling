/**
 * 새 버전을 어떻게 가져다줄지 정하는 곳.
 *
 * 플랫폼마다 할 수 있는 일이 다르다.
 *
 *   Windows   받아서 설치까지 한다        → auto-update.js
 *   그 밖     새 버전이 나왔다고 알린다   → update-check.js
 *
 * **macOS 가 빠진 것은 게을러서가 아니다.** Squirrel.Mac 이 실행 중인 앱의 서명과
 * 새로 받은 앱의 서명을 대조하기 때문에, 코드 서명이 없으면 설치가 반드시 실패한다.
 * electron-builder 문서도 못을 박아 두었다 — "Code signing is a mandatory
 * requirement for auto-updating on macOS." 그래서 맥에서는 자동 설치를 아예
 * 시도하지 않는다. 되는 척하다 실패하는 것이 제일 나쁘다.
 *
 * 서명을 붙이는 날 `canAutoInstall()` 에 'darwin' 을 더하면 그날부터 맥도 자동이 된다.
 * 나머지 코드는 손댈 곳이 없다.
 */

const { startUpdateCheck } = require('./update-check')
const { startAutoUpdate } = require('./auto-update')
const { startMorningSchedule } = require('./update-schedule')

/** 이 플랫폼에서 받아서 설치까지 할 수 있는가 */
function canAutoInstall(platform) {
  return platform === 'win32'
}

/**
 * 상황에 맞는 길을 골라 새 버전을 좇기 시작한다.
 *
 * 화면에 전해지는 모양은 어느 길로 왔든 똑같다.
 *   { version, ready, url }
 *   ready=true  이미 받아 뒀다   → "지금 적용하기" (install 을 부른다)
 *   ready=false 아직 못 받았다   → "받으러 가기"   (url 을 연다)
 *
 * 언제 확인할지는 두 길이 똑같다 — 아침에 하루 한 번(`update-schedule.js`).
 * 그 일정을 여기서 만들어 넘긴다. 어느 길로 가든 같은 시각에 움직여야
 * 사람이 겪는 모습이 플랫폼마다 달라지지 않는다.
 *
 * @param {{
 *   currentVersion: string,
 *   platform: string,
 *   onUpdate: (info: { version: string, ready: boolean, url: string|null }) => void,
 *   readLastDay: () => string|null,
 *   writeLastDay: (day: string) => void,
 * }} options
 * @returns {{ stop: () => void, install: () => void }}
 */
function startUpdates({ currentVersion, platform, onUpdate, readLastDay, writeLastDay }) {
  const schedule = (check) => startMorningSchedule({ onDue: check, readLastDay, writeLastDay })

  /**
   * 알림만 하는 길. 자동 설치가 안 되거나, 되다 실패했을 때 쓴다.
   * 실패해서 갈아탄 경우에는 기다리지 않고 바로 한 번 본다.
   */
  const startNotifying = (immediate = false) =>
    startUpdateCheck({ currentVersion, onUpdate, schedule, immediate })

  if (!canAutoInstall(platform)) {
    const watcher = startNotifying()
    return { stop: watcher.stop, install() {} }
  }

  /** 내려받기가 실패했을 때 갈아탈 알림 감시자 */
  let fallback = null

  let updater
  try {
    updater = startAutoUpdate({
      schedule,
      onReady: ({ version }) => onUpdate({ version, ready: true, url: null }),
      onFailure: () => {
        // 받지 못했으니 사람이 직접 받게 한다. 조용히 넘어가면
        // 키를 갈았을 때 왜 연결이 끊겼는지 알 길이 없다.
        if (!fallback) fallback = startNotifying(true)
      },
    })
  } catch (error) {
    /*
     * electron-updater 를 불러오지 못했다 — 거의 언제나 배포본에 그 꾸러미가
     * 안 들어간 경우다. electron-updater 는 자신의 의존성(fs-extra 등)을
     * 함께 필요로 하는데, 그것들이 devDependencies 와 겹쳐 있으면
     * electron-builder 가 빼 버리는 일이 있다. package.json 의 build.files 에
     * 하나하나 적어 둔 이유가 그것이다.
     *
     * 여기서 앱을 죽이지는 않는다. 업데이트는 곁다리 기능이고,
     * 알림만이라도 되면 사람이 직접 받을 수 있다.
     */
    console.error('[tap-tap] 자동 업데이트를 쓸 수 없어 알림으로 대신합니다', error)
    const watcher = startNotifying()
    return { stop: watcher.stop, install() {} }
  }

  return {
    stop() {
      updater.stop()
      fallback?.stop()
    },
    install: updater.install,
  }
}

module.exports = { canAutoInstall, startUpdates }
