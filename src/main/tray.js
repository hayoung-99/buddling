/**
 * 메뉴바(트레이) 아이콘. 캐릭터를 숨겨도 앱으로 돌아올 길을 남겨둔다.
 * 아이콘 PNG는 `node scripts/make-tray-icon.js` 로 생성한다.
 */

const path = require('node:path')
const { Tray, Menu, nativeImage } = require('electron')
const { t } = require('./i18n')

const ICON = path.join(__dirname, '..', '..', 'assets', 'trayTemplate.png')

function createTray(app) {
  const image = nativeImage.createFromPath(ICON)
  image.setTemplateImage(true)

  const tray = new Tray(image)
  // 테스트용 두 번째 인스턴스는 트레이 아이콘이 하나 더 생기므로 이름을 붙여 구분한다
  tray.setToolTip(
    process.env.TAPTAP_PROFILE ? `tap-tap (${process.env.TAPTAP_PROFILE})` : 'tap-tap',
  )

  function refresh() {
    const state = app.session.snapshot()
    const teams = state.memberships

    const teamItems = teams.length
      ? teams.map((entry) => ({
          label: t('app.teamSummary', { name: entry.team.name, count: entry.members.length }),
          submenu: [
            { label: t('app.detail'), click: () => app.openTeamDetail(entry.team.id) },
            { label: t('app.resize'), click: () => app.openSizePanel(entry.team.id) },
          ],
        }))
      : [{ label: t('app.noTeams'), enabled: false }]

    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...teamItems,
        { type: 'separator' },
        { label: t('app.openList'), click: () => app.openTeamWindow() },
        { label: t('app.settings'), click: () => app.openSettings() },
        {
          label: app.isPetVisible() ? t('app.hideAll') : t('app.showAll'),
          click: () => app.setPetVisible(!app.isPetVisible()),
        },
        { type: 'separator' },
        { label: t('app.quit'), click: () => app.quit() },
      ]),
    )
  }

  refresh()
  tray.on('click', () => app.openTeamWindow())

  return { tray, refresh }
}

module.exports = { createTray }
