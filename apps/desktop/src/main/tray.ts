/**
 * 메뉴바(트레이) 아이콘. 캐릭터를 숨겨도 앱으로 돌아올 길을 남겨둔다.
 * 아이콘 PNG는 `node scripts/make-tray-icon.js` 로 생성한다.
 *
 * 왼쪽을 누르면 팀 목록 창이 열리고, 오른쪽을 누르면 메뉴가 뜬다.
 *
 * 이 둘을 나누려면 메뉴를 트레이에 **걸어 두면 안 된다.** `setContextMenu()` 로 걸어
 * 두면 맥에서는 왼쪽 클릭에도 그 메뉴가 뜨고 `click` 은 묻혀 버려서, 무엇을 눌러도
 * 메뉴만 나온다. 그래서 메뉴는 손에 들고 있다가 오른쪽 클릭 때 직접 띄운다.
 */

import path from 'node:path'
import { Tray, Menu, nativeImage } from 'electron'
import { t } from './i18n'
import type { AppState } from '@buddling/shared/state'

const ICON = path.join(__dirname, '..', '..', 'assets', 'trayTemplate.png')

/**
 * 리눅스만 예외다.
 *
 * `right-click` 이벤트가 맥과 윈도우에만 있고, `click` 은 "활성화" 라는 더 흐릿한 뜻이라
 * 데스크탑 환경에 따라 왼쪽 클릭일 수도 더블클릭일 수도 있다. 그래서 리눅스에서는
 * 나누려 들지 않고 예전처럼 메뉴를 걸어 둔다 — 나누려다 아무것도 안 열리는 것보다
 * 메뉴 하나라도 확실히 열리는 편이 낫다.
 */
const SPLITS_CLICKS = process.platform !== 'linux'

/** 트레이가 부리는 것들. `main.ts` 의 `app` 껍데기가 이 모양을 만족한다. */
export interface TrayHost {
  session: { snapshot(): AppState } | null
  openTeamWindow(): void
  openTeamDetail(teamId: string): void
  openSizePanel(teamId: string): void
  openSettings(): void
  openNotifications(): void
  isAsleep(teamId: string): boolean
  setAsleep(teamId: string, asleep: boolean): void
  isPetVisible(): boolean
  setPetVisible(visible: boolean): void
  quit(): void
}

export interface TrayHandle {
  tray: Tray
  /** 팀 목록이나 언어가 바뀌면 메뉴를 새로 짓는다 */
  refresh(): void
}

function createTray(app: TrayHost): TrayHandle {
  const image = nativeImage.createFromPath(ICON)
  image.setTemplateImage(true)

  const tray = new Tray(image)
  // 테스트용 두 번째 인스턴스는 트레이 아이콘이 하나 더 생기므로 이름을 붙여 구분한다
  tray.setToolTip(
    process.env.BUDDLING_PROFILE ? `${t('app.name')} (${process.env.BUDDLING_PROFILE})` : t('app.name'),
  )

  /** 오른쪽 클릭 때 띄울 메뉴. 팀 목록이나 언어가 바뀌면 `refresh()` 가 새로 짓는다. */
  let menu: Menu | null = null

  function refresh() {
    // 트레이는 세션보다 먼저 만들어질 수 있다. 그때는 팀이 없는 것으로 그린다.
    const state = app.session?.snapshot()
    const memberships = state?.memberships ?? []
    const teamItems = memberships.length
      ? memberships.map((entry) => {
          const asleep = app.isAsleep(entry.team.id)
          return {
            label: t('app.teamSummary', { name: entry.team.name, count: entry.members.length }),
            submenu: [
              { label: t('app.detail'), click: () => app.openTeamDetail(entry.team.id) },
              { label: t('app.resize'), click: () => app.openSizePanel(entry.team.id) },
              // 회의가 막 시작돼 지금 당장 조용히 하고 싶을 때 창을 찾아 여는 것은 늦다
              {
                label: asleep ? t('app.wake') : t('app.sleep'),
                click: () => app.setAsleep(entry.team.id, !asleep),
              },
            ],
          }
        })
      : [{ label: t('app.noTeams'), enabled: false }]

    menu = Menu.buildFromTemplate([
      ...teamItems,
      { type: 'separator' },
      { label: t('app.openList'), click: () => app.openTeamWindow() },
      { label: t('notifications.title'), click: () => app.openNotifications() },
      { label: t('app.settings'), click: () => app.openSettings() },
      {
        label: app.isPetVisible() ? t('app.hideAll') : t('app.showAll'),
        click: () => app.setPetVisible(!app.isPetVisible()),
      },
      { type: 'separator' },
      { label: t('app.quit'), click: () => app.quit() },
    ])

    // 리눅스에서는 이렇게 걸어 두는 것 말고 메뉴를 띄울 길이 없다.
    // 항목이 바뀌면 매번 다시 걸어야 반영된다.
    if (!SPLITS_CLICKS) tray.setContextMenu(menu)
  }

  refresh()

  if (SPLITS_CLICKS) {
    tray.on('click', () => app.openTeamWindow())
    // 메뉴는 창이 열려 있든 말든 그 자리에서 뜬다 — 창을 거치지 않는 길이다
    tray.on('right-click', () => tray.popUpContextMenu(menu ?? undefined))
  }

  return { tray, refresh }
}

export { createTray }
