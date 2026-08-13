/**
 * 렌더러 ↔ 세션 사이의 유일한 통로.
 *
 * 렌더러는 Supabase도 store도 알지 못한다. 여기 있는 채널 이름만 안다.
 * 캐릭터 창은 여러 개일 수 있으므로, 캐릭터 쪽에서 오는 요청에는 늘 teamId 가 붙는다.
 *
 * 오류는 던지지 않고 `{ ok, value, error }` 로 되돌린다.
 * ipcMain.handle 이 던진 오류는 Electron 이 "Error invoking remote method '...'" 라는
 * 껍데기를 씌워 버려서, 그대로 두면 그 문구가 사용자 화면에 그대로 보인다.
 */

const { ipcMain, Menu, shell } = require('electron')
const { toFriendlyError } = require('../services/net')
const { t } = require('./i18n')

function registerIpc({ session, app }) {
  const send = (window, channel, payload) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }

  const broadcast = (channel, payload) => {
    for (const { window } of app.pets.values()) send(window, channel, payload)
    for (const window of app.teamDetails.values()) send(window, channel, payload)
    send(app.teamWindow, channel, payload)
  }

  // ── 세션 → 렌더러 ──
  session.on('teams', (snapshot) => broadcast('state', snapshot))
  session.on('error', (message) => broadcast('app-error', describe(new Error(message))))

  // 캐릭터 관련 이벤트는 그 팀의 캐릭터 창에만 보낸다
  session.on('character', ({ teamId, characterKey }) =>
    send(app.petWindow(teamId), 'character', characterKey),
  )
  session.on('tap', (payload) => send(app.petWindow(payload.teamId), 'tap', payload))

  /** 오류 열쇠를 지금 언어의 문장으로 바꿔 값으로 돌려준다 */
  const describe = (error) => {
    const { maxTeams, maxMembers } = session.snapshot()
    return t(toFriendlyError(error).message, { maxTeams, maxMembers })
  }

  const handle = (channel, run) =>
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        return { ok: true, value: await run(payload) }
      } catch (error) {
        return { ok: false, error: describe(error) }
      }
    })

  // ── 렌더러 → 세션 ──
  handle('app:state', () => session.snapshot())
  handle('team:create', (payload) => session.createTeam(payload))
  handle('team:join', (payload) => session.joinTeam(payload))
  handle('team:leave', (teamId) => session.leaveTeam(teamId))
  handle('team:refresh-invite', (teamId) => session.refreshInvite(teamId))
  handle('team:rename', ({ teamId, name }) => session.renameTeam(teamId, name))
  handle('member:nickname', ({ teamId, nickname }) => session.setNickname(teamId, nickname))
  handle('character:set', ({ teamId, characterKey }) => session.setCharacter(teamId, characterKey))
  handle('team:tap', (payload) => session.tap(payload))
  handle('settings:language', (preference) => {
    // 순서가 중요하다: 저장 → 번역기 교체 → 그다음에 창들에 알린다
    session.setLanguage(preference)
    app.applyLanguage()
    session.publish()
    return session.snapshot()
  })

  // ── 캐릭터 창 전용 ──
  ipcMain.on('pet:tap', (_event, { teamId }) => {
    session.tap({ teamId, toMemberId: null })
  })

  ipcMain.on('pet:interactive', (_event, { teamId, interactive }) => {
    app.pets.get(teamId)?.pointer.setInteractive(Boolean(interactive))
  })

  ipcMain.on('pet:drag-start', (_event, { teamId }) => app.pets.get(teamId)?.pointer.startDrag())
  ipcMain.on('pet:drag-end', (_event, { teamId }) => app.pets.get(teamId)?.pointer.endDrag())

  ipcMain.on('pet:menu', (_event, { teamId }) => {
    const entry = session.snapshot().memberships.find((m) => m.team.id === teamId)
    Menu.buildFromTemplate([
      { label: entry ? entry.team.name : 'tap-tap', enabled: false },
      { type: 'separator' },
      { label: t('app.openDetail'), click: () => app.openTeamDetail(teamId) },
      { label: t('app.openList'), click: () => app.openTeamWindow() },
      { label: t('app.resize'), click: () => app.openSizePanel(teamId) },
      { type: 'separator' },
      { label: t('app.hideAll'), click: () => app.setPetVisible(false) },
      { label: t('app.quit'), click: () => app.quit() },
    ]).popup({ window: app.petWindow(teamId) })
  })

  ipcMain.on('window:team', () => app.openTeamWindow())
  ipcMain.on('window:team-detail', (_event, teamId) => app.openTeamDetail(teamId))

  /**
   * 새 버전 안내를 눌렀을 때 받는 곳 페이지를 연다.
   *
   * 주소는 렌더러에서 받지 않는다 — 브라우저로 여는 주소를 화면 쪽이 정하게 두면
   * 아무 곳이나 열 수 있는 통로가 된다. 우리가 알아낸 값만 쓴다.
   */
  ipcMain.on('window:open-download', () => {
    const url = session.snapshot().update?.url
    if (url) shell.openExternal(url)
  })

  // ── 크기 조절 패널 ──
  handle('size:get', () => {
    const entry = session
      .snapshot()
      .memberships.find((m) => m.team.id === app.sizePanelTeamId)
    return {
      scale: entry?.pet.scale ?? 1,
      teamName: entry?.team.name ?? '',
      caption: t('size.caption'),
      resetHint: t('size.reset'),
    }
  })
  ipcMain.on('size:set', (_event, scale) => {
    if (app.sizePanelTeamId) app.setPetScale(app.sizePanelTeamId, scale)
  })
  ipcMain.on('size:close', () => app.closeSizePanel())
}

module.exports = { registerIpc }
