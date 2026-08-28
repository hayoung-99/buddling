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

import { ipcMain, Menu, shell } from 'electron'
import { toFriendlyError } from '../services/net'
import { t } from './i18n'
import { nextDefaultName } from './default-name'
import type { BrowserWindow } from 'electron'
import type { IpcResult } from '@buddling/shared/ipc'
import type { AppShell } from './main'
import type { Session } from './session'

function registerIpc({ session, app }: { session: Session; app: AppShell }) {
  const send = (window: BrowserWindow | null, channel: string, payload?: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }

  const broadcast = (channel: string, payload?: unknown) => {
    for (const { window } of app.pets.values()) send(window, channel, payload)
    for (const window of app.teamDetails.values()) send(window, channel, payload)
    send(app.teamWindow, channel, payload)
    send(app.settingsWindow, channel, payload)
    send(app.notificationsWindow, channel, payload)
  }

  // ── 세션 → 렌더러 ──
  session.on('teams', (snapshot) => broadcast('state', snapshot))
  session.on('error', (message) => broadcast('app-error', describe(new Error(message))))

  // `kicked` 자체는 아무도 듣지 않는다 — 알림 화면은 강퇴가 감지된 그 순간이 아니라
  // `AppState.notifications`(세션이 이미 저장소에 남긴 것)를 그대로 보여 준다. 운영체제
  // 알림은 걷어냈다(macOS 는 이 앱이 코드 서명이 없어 권한이 거부되곤 했다).

  // 캐릭터 관련 이벤트는 그 팀의 캐릭터 창에만 보낸다
  session.on('character', ({ teamId, characterKey }) =>
    send(app.petWindow(teamId), 'character', characterKey),
  )
  session.on('tap', (payload) => send(app.petWindow(payload.teamId), 'tap', payload))

  /** 오류 열쇠를 지금 언어의 문장으로 바꿔 값으로 돌려준다 */
  const describe = (error: unknown): string => {
    const { maxTeams, maxMembers } = session.snapshot()
    return t(toFriendlyError(error).message, { maxTeams, maxMembers })
  }

  /**
   * 렌더러가 부르는 통로 하나.
   *
   * 실려 오는 것(`P`)은 **부르는 자리마다 손으로 적는다.** 화면에서 오는 값이라
   * 믿을 수 없기도 하고, 여기 적힌 모양이 곧 그 채널의 약속이기 때문이다.
   */
  const handle = <P, T>(channel: string, run: (payload: P) => T | Promise<T>) =>
    ipcMain.handle(channel, async (_event, payload: P): Promise<IpcResult<Awaited<T>>> => {
      try {
        return { ok: true, value: await run(payload) }
      } catch (error) {
        return { ok: false, error: describe(error) }
      }
    })

  // ── 렌더러 → 세션 ──
  handle('app:state', () => session.snapshot())
  handle('team:create', (payload: { name: string; nickname: string }) => {
    // 이름을 비워 두는 것은 막지 않는다 — 이름 짓기가 첫 관문이 되면 거기서 그만두는
    // 사람이 생긴다. 대신 지금 쓰는 말로 "이름없음 1" 처럼 붙여 준다.
    const taken = session.snapshot().memberships.map((entry) => entry.team.name)
    const name =
      payload.name?.trim() || nextDefaultName((n) => t('form.teamNameDefault', { n }), taken)
    return session.createTeam({ ...payload, name })
  })
  handle('team:join', (payload: { inviteCode: string; nickname: string }) =>
    session.joinTeam(payload),
  )
  handle('team:leave', (teamId: string) => session.leaveTeam(teamId))
  handle('team:refresh-invite', (teamId: string) => session.refreshInvite(teamId))
  handle('team:rename', ({ teamId, name }: { teamId: string; name: string }) =>
    session.renameTeam(teamId, name),
  )
  handle('team:kick', ({ teamId, memberId }: { teamId: string; memberId: string }) =>
    session.kickMember(teamId, memberId),
  )
  handle('member:nickname', ({ teamId, nickname }: { teamId: string; nickname: string }) =>
    session.setNickname(teamId, nickname),
  )
  handle('character:set', ({ teamId, characterKey }: { teamId: string; characterKey: string }) =>
    session.setCharacter(teamId, characterKey),
  )
  handle('signal:set', ({ teamId, signal }: { teamId: string; signal: string }) =>
    session.setSignal(teamId, signal),
  )
  handle('sleep:set', ({ teamId, asleep }: { teamId: string; asleep: boolean }) =>
    session.setAsleep(teamId, Boolean(asleep)),
  )

  handle('team:tap', (payload: { teamId: string; toMemberId?: string | null }) =>
    session.tap(payload),
  )
  handle('settings:language', (preference: string) => {
    // 순서가 중요하다: 저장 → 번역기 교체 → 그다음에 창들에 알린다
    session.setLanguage(preference)
    app.applyLanguage()
    session.publish()
    return session.snapshot()
  })
  handle('settings:power', (level: string) => session.setPower(level))

  // 알림 창이 이번에 열릴 때 붙잡아 둔 컷오프. `app.openNotifications()` 참고.
  handle('notifications:unread-before', () => app.notificationsUnreadBefore)

  // 오프라인 화면의 "다시 해 보기". 방 채널을 다시 붙이는 일은 기다리지 않는다
  // (기획서 "인터넷이 없을 때", `session.retryNow()` 참고).
  handle('app:retry', () => session.retryNow())

  // ── 캐릭터 창 전용 ──
  ipcMain.on('pet:tap', (_event, { teamId }) => {
    void session.tap({ teamId, toMemberId: null })
  })

  ipcMain.on('pet:interactive', (_event, { teamId, interactive }) => {
    app.pets.get(teamId)?.pointer.setInteractive(Boolean(interactive))
  })

  ipcMain.on('pet:drag-start', (_event, { teamId }) => app.pets.get(teamId)?.pointer.startDrag())
  ipcMain.on('pet:drag-end', (_event, { teamId }) => app.pets.get(teamId)?.pointer.endDrag())

  ipcMain.on('pet:menu', (_event, { teamId }) => {
    const entry = session.snapshot().memberships.find((m) => m.team.id === teamId)
    const asleep = session.isAsleep(teamId)
    Menu.buildFromTemplate([
      { label: entry ? entry.team.name : t('app.name'), enabled: false },
      { type: 'separator' },
      { label: t('app.openDetail'), click: () => app.openTeamDetail(teamId) },
      { label: t('app.openList'), click: () => app.openTeamWindow() },
      { label: t('app.resize'), click: () => app.openSizePanel(teamId) },
      { label: t('app.settings'), click: () => app.openSettings() },
      { type: 'separator' },
      // 재우고 싶어지는 순간이 방 창 앞이 아니라서 여기에도 둔다 (기획서 "잠재우기")
      {
        label: asleep ? t('app.wake') : t('app.sleep'),
        click: () => {
          session.setAsleep(teamId, !asleep)
        },
      },
      { label: t('app.hideAll'), click: () => app.setPetVisible(false) },
      { label: t('app.quit'), click: () => app.quit() },
    ]).popup({ window: app.petWindow(teamId) ?? undefined })
  })

  ipcMain.on('window:team', () => app.openTeamWindow())
  ipcMain.on('window:team-detail', (_event, teamId) => app.openTeamDetail(teamId))
  ipcMain.on('window:settings', () => app.openSettings())
  ipcMain.on('window:notifications', () => app.openNotifications())

  /**
   * 새 버전 안내를 눌렀을 때 받는 곳 페이지를 연다.
   *
   * 주소는 렌더러에서 받지 않는다 — 브라우저로 여는 주소를 화면 쪽이 정하게 두면
   * 아무 곳이나 열 수 있는 통로가 된다. 우리가 알아낸 값만 쓴다.
   */
  ipcMain.on('window:open-download', () => {
    const url = session.snapshot().update?.url
    if (url) void shell.openExternal(url)
  })

  /**
   * 이미 받아 둔 새 버전을 지금 적용한다. 앱이 꺼졌다가 새 버전으로 다시 뜬다.
   * 받아 둔 것이 없으면 아무 일도 일어나지 않는다.
   */
  ipcMain.on('update:install', () => {
    if (session.snapshot().update?.ready) app.updates?.install()
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
  // 끄는 동안(live)에는 창 크기만 바꾸고, 손을 뗐을 때 한 번만 창들에 알린다
  ipcMain.on('size:set', (_event, { scale, live = false } = {}) => {
    if (app.sizePanelTeamId) app.setPetScale(app.sizePanelTeamId, scale, { live })
  })
  ipcMain.on('size:close', () => app.closeSizePanel())
}

export { registerIpc }
