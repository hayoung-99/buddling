/**
 * 도란도란 진입점.
 *
 * 속한 팀마다 캐릭터 창이 하나씩 뜬다. 팀에 들어가고 나갈 때마다
 * `syncPetWindows()` 가 창 목록을 소속과 맞춰 준다.
 *
 * 두 번째 인스턴스를 띄워 혼자서 테스트하려면:
 *   DORAN_PROFILE=second npm start
 * userData 경로가 갈라지므로 다른 기기처럼 취급된다.
 */

import { app as electronApp, BrowserWindow, dialog, powerMonitor } from 'electron'

import { loadConfig } from './config'
import { setLanguage, resolveLanguage } from './i18n'
import store from './store'
import {
  createPetWindow,
  createTeamWindow,
  createTeamDetailWindow,
  createSizeWindow,
  createSettingsWindow,
  placeSizeWindow,
  resizePetWindow,
  clampScale,
} from './windows'
import { attachPointerControl } from './click-through'
import { releaseUnclosableWindows } from './quit'
import { createSession } from './session'
import { createTray } from './tray'
import { registerIpc } from './ipc'
import { startUpdates } from './updates'
import type { PointerControl } from './click-through'
import type { Session } from './session'
import type { TrayHandle } from './tray'
import type { Updates } from './updates'

// 프로필을 나누면 같은 컴퓨터에서 여러 인스턴스를 띄울 수 있다
if (process.env.DORAN_PROFILE) {
  electronApp.setPath('userData', `${electronApp.getPath('userData')}-${process.env.DORAN_PROFILE}`)
}

/**
 * 이 프로세스가 처음 뜬 인스턴스인가.
 *
 * 아니라면 물러나야 하는데, `quit()` 은 **예약일 뿐**이라 그것만으로는 아래가 그대로
 * 이어 돈다. `ready` 가 종료보다 먼저 오면 두 번째 인스턴스가 트레이와 캐릭터 창을
 * 만들기 시작하고, 먼저 뜬 인스턴스와 같은 저장 파일을 두고 다투게 된다.
 *
 * 예전에는 여기서 최상위 `return` 으로 끊었다 — CommonJS 모듈은 함수로 감싸여 실행되므로
 * 그게 먹혔다. ESM 에는 그 길이 없으므로, 부수효과가 있는 등록을 전부 맨 아래 `start()`
 * 안으로 모으고 **이 값이 참일 때만 부른다.**
 */
const isFirstInstance = electronApp.requestSingleInstanceLock()

/** 한 팀의 캐릭터 창과 그 창의 포인터 처리 */
export interface Pet {
  window: BrowserWindow
  pointer: PointerControl
}

/** 창·세션·트레이를 서로 이어주는 얇은 껍데기 */
const app = {
  pets: new Map<string, Pet>(),
  teamWindow: null as BrowserWindow | null,
  teamDetails: new Map<string, BrowserWindow>(),
  sizeWindow: null as BrowserWindow | null,
  sizePanelTeamId: null as string | null,
  settingsWindow: null as BrowserWindow | null,
  /** `whenReady` 전에는 아직 없다 */
  session: null as Session | null,
  tray: null as TrayHandle | null,
  /** 새 버전 좇기. 개발 중에는(패키징하지 않았으면) null 이다. */
  updates: null as Updates | null,
  /** 앱을 끄는 중인가. 창이 닫혀도 다시 세우지 않게 하려고 본다. */
  quitting: false,
  /** 컴퓨터가 깨어 있는가. 잠들었거나 화면이 잠겼으면 false. */
  awake: true,

  petWindow(teamId: string) {
    return app.pets.get(teamId)?.window ?? null
  },

  /** 소속 팀 목록에 맞춰 캐릭터 창과 상세 창을 만들고 지운다 */
  syncPetWindows() {
    const teamIds = (app.session?.snapshot().memberships ?? []).map((entry) => entry.team.id)

    for (const [teamId, pet] of app.pets) {
      if (teamIds.includes(teamId)) continue
      app.pets.delete(teamId)
      if (!pet.window.isDestroyed()) pet.window.destroy()
      if (app.sizePanelTeamId === teamId) app.closeSizePanel()
    }

    // 나간 팀의 상세 창도 함께 닫는다
    for (const [teamId, window] of app.teamDetails) {
      if (teamIds.includes(teamId)) continue
      app.teamDetails.delete(teamId)
      if (!window.isDestroyed()) window.close()
    }

    teamIds.forEach((teamId, index) => {
      if (app.pets.has(teamId)) return
      const window = createPetWindow({ teamId, index })
      const pointer = attachPointerControl(window, {
        onDragEnd: (position) => store.setPet(teamId, { position }),
      })
      app.pets.set(teamId, { window, pointer })

      // 창은 우리가 지울 때만 사라지는 게 맞지만, 운영체제 단축키(맥의 ⌘W)로도 닫힌다.
      // 그때 Map 에 죽은 창이 남으면 아래 `has(teamId)` 때문에 캐릭터가 영영 안 돌아온다.
      window.on('closed', () => {
        if (app.pets.get(teamId)?.window !== window) return
        app.pets.delete(teamId)
        if (app.sizePanelTeamId === teamId) app.closeSizePanel()
        // 아직 그 팀에 속해 있다면 여기서 다시 세운다 (앱을 끄는 중이면 그냥 둔다)
        if (!app.quitting && app.session) app.syncPetWindows()
      })

      // 창이 다 뜬 뒤라야 알아듣는다. 숨은 채로 태어난 창은 여기서 곧바로 멈춘다.
      window.webContents.on('did-finish-load', () => app.setRendering(window))

      if (!store.get('petVisible')) window.hide()
    })

    app.tray?.refresh()
  },

  openTeamWindow() {
    if (app.teamWindow && !app.teamWindow.isDestroyed()) {
      app.teamWindow.show()
      app.teamWindow.focus()
    } else {
      app.teamWindow = createTeamWindow()
      app.teamWindow.on('closed', () => {
        app.teamWindow = null
      })
    }
    electronApp.focus({ steal: true })
  },

  /** 팀 상세 창을 연다 (이미 열려 있으면 앞으로 가져온다) */
  openTeamDetail(teamId: string) {
    const existing = app.teamDetails.get(teamId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
    } else {
      const window = createTeamDetailWindow(teamId, app.teamDetails.size)
      app.teamDetails.set(teamId, window)
      window.on('closed', () => {
        if (app.teamDetails.get(teamId) === window) app.teamDetails.delete(teamId)
      })
    }
    electronApp.focus({ steal: true })
  },

  /** 절전 강도와 언어를 고르는 창 */
  openSettings() {
    if (app.settingsWindow && !app.settingsWindow.isDestroyed()) {
      app.settingsWindow.show()
      app.settingsWindow.focus()
    } else {
      app.settingsWindow = createSettingsWindow()
      app.settingsWindow.on('closed', () => {
        app.settingsWindow = null
      })
    }
    electronApp.focus({ steal: true })
  },

  isPetVisible() {
    return Boolean(store.get('petVisible'))
  },

  setPetVisible(visible: boolean) {
    store.set({ petVisible: visible })
    for (const { window, pointer } of app.pets.values()) {
      if (window.isDestroyed()) continue
      // 끄는 도중에 창이 사라지면 커서를 좇던 타이머가 갈 곳을 잃는다
      if (!visible) pointer.endDrag()
      if (visible) window.showInactive()
      else window.hide()
    }
    if (!visible) app.closeSizePanel()
    app.setRendering()
    app.tray?.refresh()
  },

  /** 캐릭터 크기 조절 패널을 그 캐릭터 옆에 띄운다 */
  openSizePanel(teamId: string) {
    const petWindow = app.petWindow(teamId)
    if (!petWindow || petWindow.isDestroyed()) return

    app.sizePanelTeamId = teamId
    if (!app.sizeWindow || app.sizeWindow.isDestroyed()) {
      app.sizeWindow = createSizeWindow()
      // 다른 곳을 누르면 조용히 닫힌다
      app.sizeWindow.on('blur', () => app.closeSizePanel())
      app.sizeWindow.on('closed', () => {
        app.sizeWindow = null
      })
    }
    placeSizeWindow(app.sizeWindow, petWindow)
    app.sizeWindow.show()
    app.sizeWindow.focus()
  },

  closeSizePanel() {
    app.sizePanelTeamId = null
    if (app.sizeWindow && !app.sizeWindow.isDestroyed()) app.sizeWindow.hide()
  },

  /**
   * @param {boolean} live 슬라이더를 아직 끄는 중인가.
   *   끄는 동안에는 창들에 알리지 않는다 — 매 틱마다 트레이 메뉴를 새로 짓고
   *   모든 창을 다시 그리게 되어 정작 슬라이더가 뻑뻑해진다. 손을 뗄 때 한 번만 알린다.
   */
  setPetScale(teamId: string, scale: number, { live = false }: { live?: boolean } = {}) {
    const petWindow = app.petWindow(teamId)
    if (!petWindow || petWindow.isDestroyed()) return
    const next = clampScale(scale)
    const position = resizePetWindow(petWindow, next)
    store.setPet(teamId, { scale: next, position })
    if (app.sizePanelTeamId === teamId) placeSizeWindow(app.sizeWindow, petWindow)
    if (!live) app.session?.publish()
  },

  /**
   * 쓸 언어를 정해 앱 전체(트레이·메뉴·창)에 적용한다.
   *
   * 아직 고른 적이 없으면 운영체제 언어를 보고 한 번 정해서 저장한다.
   * 지원하지 않는 언어면 영어로 간다. 한 번 정해진 뒤로는 고른 값만 쓴다.
   */
  applyLanguage() {
    const stored = store.get('language')
    const chosen = resolveLanguage(stored, electronApp.getLocale())
    if (stored !== chosen) store.set({ language: chosen })
    setLanguage(chosen)
    app.tray?.refresh()
  },

  /**
   * 캐릭터 창들에게 지금 그려도 되는지 알린다.
   *
   * 아무도 안 보는 그림을 그릴 이유가 없다. 숨긴 창도, 잠든 컴퓨터도 마찬가지다.
   * 숨긴 창은 브라우저가 알아서 멈춰 줄 것 같지만 실제로는 그렇지 않다 — 재보니
   * 숨겨 놓아도 CPU 가 그대로였다. 그래서 여기서 직접 껐다 켠다.
   *
   * @param only 방금 만들어진 창 하나에만 알릴 때
   */
  setRendering(only: BrowserWindow | null = null) {
    const active = app.awake && app.isPetVisible()
    const targets = only ? [only] : [...app.pets.values()].map((pet) => pet.window)
    for (const window of targets) {
      if (!window.isDestroyed()) window.webContents.send('render', active)
    }
  },

  quit() {
    electronApp.quit()
  },

  /**
   * 끄기 전에 해 둘 일.
   *
   * **앱을 끄는 문이 둘이라 한곳에 모아 둔다.** 사람이 종료를 누르면 `before-quit` 이
   * 오지만, 개발용 캡처(`dev-capture.js`)는 `app.exit()` 으로 곧장 나간다. 그 길에는
   * `before-quit` 이 오지 않아서, 여기 있는 것들을 저쪽에서 직접 불러 줘야 한다.
   *
   * 특히 `quitting` 을 세우는 일이 중요하다. 이 표시가 없으면 캐릭터 창이 파괴되는
   * 순간 `closed` 처리기가 `syncPetWindows()` 로 **새 창을 다시 세우고**, 그 창은
   * Electron 이 이미 훑어 둔 목록에 없어서 아무도 닫지 않는다. 그러면 앱이 영영 남는다.
   */
  shutdown() {
    if (app.quitting) return
    app.quitting = true
    app.updates?.stop()

    // 캐릭터 창을 걷어낸다. `closable: false` 라서 그냥 두면 Electron 이 이 창을 닫지
    // 못하고, 그 실패가 종료를 통째로 취소시킨다 (까닭은 `quit.js` 에 적어 두었다).
    // 위 `quitting` 을 세운 뒤라야 한다 — 순서가 바뀌면 캐릭터가 되살아난다.
    releaseUnclosableWindows(app.pets.values())

    // 미뤄 둔 저장을 끝낸다. Electron 은 종료 처리기를 기다려 주지 않으므로 뒤로
    // 미룰수록 마지막 위치나 크기를 잃기 쉽다.
    store.flush()

    // 기다리지 않는다. `before-quit` 을 async 로 만들어 await 을 걸어도 Electron 은
    // 돌려주는 약속을 보지 않는다 (`HandleBeforeQuit()` 이 동기로 부른다).
    //
    // 채널을 미처 닫지 못한 채 프로세스가 죽지만, 소켓이 끊기면 서버가 알아서 접속을
    // 내려 준다. 반대로 여기서 종료를 붙잡았다가 정리가 늦어지면 그것이 그대로 "앱이
    // 안 꺼진다" 가 된다 — 고쳐 놓은 것과 똑같은 고장을 새로 심는 셈이다.
    app.session?.dispose().catch(() => {
      // 끄는 길에 할 수 있는 일이 없다. 여기서 새어 나가면 오류창만 뜬다.
    })
  },
}

/**
 * 창·세션·트레이를 잇는 껍데기의 모양.
 *
 * `ipc.ts` 와 `dev-capture.ts` 가 이 타입만 보고 일한다. 타입만 가져가므로(`import type`)
 * 실행 시점에 서로를 부르는 고리는 생기지 않는다.
 */
export type AppShell = typeof app

/**
 * 부수효과가 있는 등록을 전부 모아 둔 곳.
 *
 * 맨 아래에서 **처음 뜬 인스턴스일 때만** 부른다. 두 번째 인스턴스가 여기까지 오면
 * 트레이와 캐릭터 창을 만들기 시작해 먼저 뜬 쪽과 저장 파일을 두고 다투게 된다.
 */
function start() {
  electronApp.on('second-instance', () => app.openTeamWindow())

  /**
   * 잠들고 깨어나기.
   *
   * 며칠씩 켜두는 앱이라 뚜껑을 여닫는 일이 수없이 일어난다. 잠든 동안에는 그리지 않고,
   * 깨어나면 다시 그리는 동시에 그 사이 끊겼을 연결과 팀 목록을 맞춘다.
   */
  const sleep = () => {
    app.awake = false
    app.setRendering()
  }

  const wake = () => {
    app.awake = true
    app.setRendering()
    void app.session?.recover()
  }

  // 하나씩 거는 이유: `powerMonitor.on` 은 이벤트마다 오버로드가 따로라 배열로 돌리면
  // 이름이 유니온이 되어 어느 오버로드에도 맞지 않는다.
  powerMonitor.on('suspend', sleep)
  powerMonitor.on('lock-screen', sleep)
  powerMonitor.on('resume', wake)
  powerMonitor.on('unlock-screen', wake)

  void electronApp.whenReady().then(async () => {
    store.load()

    // 캐릭터가 바탕화면 위젯처럼 느껴지도록 Dock 아이콘은 숨긴다 (트레이로 접근)
    electronApp.dock?.hide()

    app.session = createSession(loadConfig())

    // 처음 실행이면 운영체제 언어를 보고 한 번 정한다
    app.applyLanguage()

    registerIpc({ session: app.session, app })
    app.tray = createTray(app)
    app.session.on('teams', () => app.syncPetWindows())

    // 개발 중에는 확인하지 않는다 — 저장소의 버전이 늘 더 높게 보이고,
    // 패키징하지 않은 앱은 electron-updater 가 갈아끼울 수도 없다
    if (electronApp.isPackaged) {
      app.updates = await startUpdates({
        currentVersion: electronApp.getVersion(),
        platform: process.platform,
        onUpdate: (info) => app.session?.setUpdate(info),
        // 앱을 껐다 켜도 "아침에 하루 한 번"을 지키려면 어제 봤는지가 남아 있어야 한다
        readLastDay: () => store.get('lastUpdateCheck'),
        writeLastDay: (day) => store.set({ lastUpdateCheck: day }),
      })
    }

    // 켜졌을 때만 읽는다 — 늘 도는 것이 아니라 재 볼 때만 쓰는 도구다
    if (process.env.DORAN_METRICS) {
      const { startMetrics } = await import('./metrics')
      startMetrics(electronApp)
    }

    // 캐시된 소속으로 먼저 띄우고, 서버 응답이 오면 알아서 맞춰진다
    app.syncPetWindows()
    await app.session.restore()

    const state = app.session.snapshot()
    // 아직 팀이 없거나 설정이 안 끝났으면 무엇을 해야 하는지 바로 보여준다
    if (state.memberships.length === 0 || !state.configured) app.openTeamWindow()

    const { captureIfRequested } = await import('./dev-capture')
    await captureIfRequested(app, electronApp)
  })

  electronApp.on('window-all-closed', () => {
    // 캐릭터만 남고 창을 다 닫아도 앱은 계속 살아 있어야 한다 (트레이 앱)
  })

  electronApp.on('activate', () => {
    // 맥에서 Dock 아이콘을 눌러 앱을 *켤* 때는 이 이벤트가 `whenReady` 보다 먼저 온다.
    // 그때 창을 만들려 하면 "Cannot create BrowserWindow before app is ready" 로 메인
    // 프로세스가 죽고, 사용자에게는 오류창만 뜨거나 Dock 에서 튀기만 한다.
    // 흘려보내도 잃는 것은 없다 — 준비가 끝나면 위 `whenReady` 가 캐릭터 창과
    // (팀이 없을 때는) 팀 창까지 알아서 세운다.
    if (!electronApp.isReady()) return
    if (BrowserWindow.getAllWindows().length === 0) app.openTeamWindow()
  })

  electronApp.on('before-quit', () => app.shutdown())
}

if (isFirstInstance) {
  start()
} else {
  // 이미 떠 있는 인스턴스가 있으니 이 프로세스는 물러난다. 위 `start()` 를 부르지
  // 않았으므로, `quit()` 이 예약일 뿐이어도 창이 만들어지는 일은 없다.
  electronApp.quit()
}

process.on('unhandledRejection', (reason) => {
  console.error('[doran-doran] 처리되지 않은 오류', reason)
  if (process.env.DORAN_DEBUG) {
    dialog.showErrorBox('도란도란 오류', String((reason as Error)?.message ?? reason))
  }
})
