/**
 * 새 버전을 어떻게 가져다줄지 정하는 곳.
 *
 * 플랫폼마다 할 수 있는 일이 다르다.
 *
 *   Windows   언제나 받아서 설치까지 한다                  → auto-update.js
 *   Linux     AppImage 로 떠 있고 그 자리를 손댈 수 있을 때만 → auto-update.js
 *             (아니면 macOS 와 같은 알림 길)
 *   macOS     새 버전이 나왔다고 알리기만 한다              → update-check.js
 *
 * **macOS 가 자동 설치를 하지 않는 것은 게을러서가 아니다.** Squirrel.Mac 이 실행 중인
 * 앱의 서명과 새로 받은 앱의 서명을 대조하기 때문에, 코드 서명이 없으면 설치가 반드시
 * 실패한다. electron-builder 문서도 못을 박아 두었다 — "Code signing is a mandatory
 * requirement for auto-updating on macOS." 그래서 맥에서는 자동 설치를 아예
 * 시도하지 않는다. 되는 척하다 실패하는 것이 제일 나쁘다.
 *
 * **Linux 가 조건부인 이유는 electron-updater 쪽 사정이다.** AppImage 로 뜨지 않았을
 * 때는 `checkForUpdates()` 가 오류 없이 조용히 null 을 돌려주므로(AppUpdater.js:253),
 * "일단 해 보고 실패하면 알림으로 갈아탄다" 가 통하지 않는다 — 갈아탈 신호 자체가
 * 안 온다. 그래서 시작하기 전에 `appimage.ts` 로 미리 판정한다 (자세한 근거는
 * docs/design/linux-build-pipeline.md 1.1).
 *
 * 서명을 붙이는 날 `canAutoInstall()` 에서 `platform === 'darwin'` 이면 항상 true 를
 * 돌려주게 고치면 그날부터 맥도 자동이 된다. 나머지 코드는 손댈 곳이 없다.
 */

import { canReplaceAppImage, readAppImageEnvironment } from './appimage'
import { startUpdateCheck } from './update-check'
import { startMorningSchedule } from './update-schedule'
import type { UpdateInfo } from '@buddling/shared/state'

/** 이 플랫폼에서 받아서 설치까지 할 수 있는가 */
function canAutoInstall(platform: string, canReplaceHere: () => boolean): boolean {
  if (platform === 'win32') return true
  // 리눅스는 "AppImage 로 떠 있고 그 자리를 손댈 수 있을 때만" 이다 (appimage.ts)
  if (platform === 'linux') return canReplaceHere()
  return false
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
 * **`async` 인 이유**: 자동 설치 쪽은 `electron-updater` 를 늦게 읽는다. 배포본에 그
 * 꾸러미가 빠져 있으면 읽는 순간 터지는데, 그걸 아래 try 안에서 잡아 알림 길로 갈아타야
 * 한다. 파일 맨 위에서 정적으로 읽으면 그 실패가 메인 프로세스를 통째로 죽인다.
 */
export interface UpdatesOptions {
  currentVersion: string
  /** `process.platform` 을 그대로 받는다 */
  platform: string
  onUpdate: (info: UpdateInfo) => void
  readLastDay: () => string | null
  writeLastDay: (day: string) => void
  /**
   * 리눅스에서 지금 자리를 갈아끼울 수 있는지. 리눅스가 아니면 불리지 않는다.
   * 테스트가 갈아 끼운다.
   */
  canReplaceHere?: () => boolean
}

export interface Updates {
  stop: () => void
  /** 이미 받아 둔 새 버전을 지금 적용한다. 받아 두는 길이 아니면 아무것도 하지 않는다. */
  install: () => void
}

async function startUpdates({
  currentVersion,
  platform,
  onUpdate,
  readLastDay,
  writeLastDay,
  canReplaceHere = () => canReplaceAppImage(readAppImageEnvironment()),
}: UpdatesOptions): Promise<Updates> {
  const schedule = (check: () => void) =>
    startMorningSchedule({ onDue: check, readLastDay, writeLastDay })

  /**
   * 알림만 하는 길. 자동 설치가 안 되거나, 되다 실패했을 때 쓴다.
   * 실패해서 갈아탄 경우에는 기다리지 않고 바로 한 번 본다.
   */
  const startNotifying = (immediate = false) =>
    startUpdateCheck({ currentVersion, onUpdate, schedule, immediate })

  if (!canAutoInstall(platform, canReplaceHere)) {
    const watcher = startNotifying()
    return { stop: watcher.stop, install() {} }
  }

  /** 내려받기가 실패했을 때 갈아탈 알림 감시자 */
  let fallback: { stop: () => void } | null = null

  let updater: ReturnType<typeof import('./auto-update').startAutoUpdate>
  try {
    // 여기서 읽는다 — 실패하면 아래 catch 가 알림 길로 갈아탄다
    const { startAutoUpdate } = await import('./auto-update')
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
    console.error('[buddling] 자동 업데이트를 쓸 수 없어 알림으로 대신합니다', error)
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

export { canAutoInstall, startUpdates }
