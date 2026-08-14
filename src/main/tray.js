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

const path = require('node:path')
const { Tray, Menu, nativeImage } = require('electron')
const { t } = require('./i18n')

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

function createTray(app) {
  const image = nativeImage.createFromPath(ICON)
  image.setTemplateImage(true)

  const tray = new Tray(image)
  // 테스트용 두 번째 인스턴스는 트레이 아이콘이 하나 더 생기므로 이름을 붙여 구분한다
  tray.setToolTip(
    process.env.TAPTAP_PROFILE ? `tap-tap (${process.env.TAPTAP_PROFILE})` : 'tap-tap',
  )

  /** 오른쪽 클릭 때 띄울 메뉴. 팀 목록이나 언어가 바뀌면 `refresh()` 가 새로 짓는다. */
  let menu = null

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

    menu = Menu.buildFromTemplate([
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
    ])

    // 리눅스에서는 이렇게 걸어 두는 것 말고 메뉴를 띄울 길이 없다.
    // 항목이 바뀌면 매번 다시 걸어야 반영된다.
    if (!SPLITS_CLICKS) tray.setContextMenu(menu)
  }

  refresh()

  if (SPLITS_CLICKS) {
    tray.on('click', () => app.openTeamWindow())
    // 메뉴는 창이 열려 있든 말든 그 자리에서 뜬다 — 창을 거치지 않는 길이다
    tray.on('right-click', () => tray.popUpContextMenu(menu))
  }

  return { tray, refresh }
}

module.exports = { createTray }
