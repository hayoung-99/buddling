/**
 * tap-tap 진입점.
 *
 * 속한 팀마다 캐릭터 창이 하나씩 뜬다. 팀에 들어가고 나갈 때마다
 * `syncPetWindows()` 가 창 목록을 소속과 맞춰 준다.
 *
 * 두 번째 인스턴스를 띄워 혼자서 테스트하려면:
 *   TAPTAP_PROFILE=second npm start
 * userData 경로가 갈라지므로 다른 기기처럼 취급된다.
 */

const { app: electronApp, BrowserWindow, dialog, powerMonitor } = require('electron')

const { loadConfig } = require('./config')
const { setLanguage, resolveLanguage } = require('./i18n')
const store = require('./store')
const {
  createPetWindow,
  createTeamWindow,
  createTeamDetailWindow,
  createSizeWindow,
  createSettingsWindow,
  placeSizeWindow,
  resizePetWindow,
  clampScale,
} = require('./windows')
const { attachPointerControl } = require('./click-through')
const { createSession } = require('./session')
const { createTray } = require('./tray')
const { registerIpc } = require('./ipc')
const { startUpdates } = require('./updates')

// 프로필을 나누면 같은 컴퓨터에서 여러 인스턴스를 띄울 수 있다
if (process.env.TAPTAP_PROFILE) {
  electronApp.setPath('userData', `${electronApp.getPath('userData')}-${process.env.TAPTAP_PROFILE}`)
}

if (!electronApp.requestSingleInstanceLock()) {
  electronApp.quit()
}

/** 창·세션·트레이를 서로 이어주는 얇은 껍데기 */
const app = {
  /** teamId → { window, pointer } */
  pets: new Map(),
  teamWindow: null,
  /** teamId → 팀 상세 창 */
  teamDetails: new Map(),
  sizeWindow: null,
  sizePanelTeamId: null,
  settingsWindow: null,
  session: null,
  tray: null,
  /** 새 버전 좇기. `{ stop, install }` — 개발 중에는 null 이다. */
  updates: null,
  /** 앱을 끄는 중인가. 창이 닫혀도 다시 세우지 않게 하려고 본다. */
  quitting: false,
  /** 컴퓨터가 깨어 있는가. 잠들었거나 화면이 잠겼으면 false. */
  awake: true,

  petWindow(teamId) {
    return app.pets.get(teamId)?.window ?? null
  },

  /** 소속 팀 목록에 맞춰 캐릭터 창과 상세 창을 만들고 지운다 */
  syncPetWindows() {
    const teamIds = app.session.snapshot().memberships.map((entry) => entry.team.id)

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
  openTeamDetail(teamId) {
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

  setPetVisible(visible) {
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
  openSizePanel(teamId) {
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
  setPetScale(teamId, scale, { live = false } = {}) {
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
   * @param {import('electron').BrowserWindow} [only] 방금 만들어진 창 하나에만 알릴 때
   */
  setRendering(only = null) {
    const active = app.awake && app.isPetVisible()
    const targets = only ? [only] : [...app.pets.values()].map((pet) => pet.window)
    for (const window of targets) {
      if (!window.isDestroyed()) window.webContents.send('render', active)
    }
  },

  quit() {
    electronApp.quit()
  },
}

electronApp.on('second-instance', () => app.openTeamWindow())

/**
 * 잠들고 깨어나기.
 *
 * 며칠씩 켜두는 앱이라 뚜껑을 여닫는 일이 수없이 일어난다. 잠든 동안에는 그리지 않고,
 * 깨어나면 다시 그리는 동시에 그 사이 끊겼을 연결과 팀 목록을 맞춘다.
 */
for (const event of ['suspend', 'lock-screen']) {
  powerMonitor.on(event, () => {
    app.awake = false
    app.setRendering()
  })
}
for (const event of ['resume', 'unlock-screen']) {
  powerMonitor.on(event, () => {
    app.awake = true
    app.setRendering()
    app.session?.recover()
  })
}

electronApp.whenReady().then(async () => {
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
    app.updates = startUpdates({
      currentVersion: electronApp.getVersion(),
      platform: process.platform,
      onUpdate: (info) => app.session.setUpdate(info),
      // 앱을 껐다 켜도 "아침에 하루 한 번"을 지키려면 어제 봤는지가 남아 있어야 한다
      readLastDay: () => store.get('lastUpdateCheck'),
      writeLastDay: (day) => store.set({ lastUpdateCheck: day }),
    })
  }

  if (process.env.TAPTAP_METRICS) require('./metrics').startMetrics(electronApp)

  // 캐시된 소속으로 먼저 띄우고, 서버 응답이 오면 알아서 맞춰진다
  app.syncPetWindows()
  await app.session.restore()

  const state = app.session.snapshot()
  // 아직 팀이 없거나 설정이 안 끝났으면 무엇을 해야 하는지 바로 보여준다
  if (state.memberships.length === 0 || !state.configured) app.openTeamWindow()

  await require('./dev-capture').captureIfRequested(app, electronApp)
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

electronApp.on('before-quit', async () => {
  app.quitting = true
  app.updates?.stop()
  // 미뤄 둔 저장부터 끝낸다. Electron 은 이 처리기의 await 을 기다려 주지 않으므로,
  // 아래 dispose 뒤로 미루면 마지막 위치나 크기를 잃을 수 있다.
  store.flush()
  await app.session?.dispose()
})

process.on('unhandledRejection', (reason) => {
  console.error('[tap-tap] 처리되지 않은 오류', reason)
  if (process.env.TAPTAP_DEBUG) {
    dialog.showErrorBox('tap-tap 오류', String(reason?.message ?? reason))
  }
})
