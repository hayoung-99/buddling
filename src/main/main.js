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

const { app: electronApp, BrowserWindow, dialog } = require('electron')

const { loadConfig } = require('./config')
const { setLanguage, resolveLanguage } = require('./i18n')
const store = require('./store')
const {
  createPetWindow,
  createTeamWindow,
  createTeamDetailWindow,
  createSizeWindow,
  placeSizeWindow,
  resizePetWindow,
  clampScale,
} = require('./windows')
const { attachPointerControl } = require('./click-through')
const { createSession } = require('./session')
const { createTray } = require('./tray')
const { registerIpc } = require('./ipc')
const { startUpdateCheck } = require('./update-check')

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
  session: null,
  tray: null,
  updateCheck: null,

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

  isPetVisible() {
    return Boolean(store.get('petVisible'))
  },

  setPetVisible(visible) {
    store.set({ petVisible: visible })
    for (const { window } of app.pets.values()) {
      if (window.isDestroyed()) continue
      if (visible) window.showInactive()
      else window.hide()
    }
    if (!visible) app.closeSizePanel()
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

  setPetScale(teamId, scale) {
    const petWindow = app.petWindow(teamId)
    if (!petWindow || petWindow.isDestroyed()) return
    const next = clampScale(scale)
    const position = resizePetWindow(petWindow, next)
    store.setPet(teamId, { scale: next, position })
    if (app.sizePanelTeamId === teamId) placeSizeWindow(app.sizeWindow, petWindow)
    app.session?.publish()
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

  quit() {
    electronApp.quit()
  },
}

electronApp.on('second-instance', () => app.openTeamWindow())

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

  // 개발 중에는 확인하지 않는다 — 저장소의 버전이 늘 더 높게 보이기 때문이다
  if (electronApp.isPackaged) {
    app.updateCheck = startUpdateCheck({
      currentVersion: electronApp.getVersion(),
      onUpdate: (info) => app.session.setUpdate(info),
    })
  }

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
  if (BrowserWindow.getAllWindows().length === 0) app.openTeamWindow()
})

electronApp.on('before-quit', async () => {
  app.updateCheck?.stop()
  await app.session?.dispose()
})

process.on('unhandledRejection', (reason) => {
  console.error('[tap-tap] 처리되지 않은 오류', reason)
  if (process.env.TAPTAP_DEBUG) {
    dialog.showErrorBox('tap-tap 오류', String(reason?.message ?? reason))
  }
})
