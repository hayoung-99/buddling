/**
 * 개발용: 실행 중인 창을 PNG로 떠서 눈으로 확인한다.
 *
 *   TAPTAP_CAPTURE=.preview npm start
 *
 * 지정한 폴더에 pet.png(캐릭터가 여럿이면 pet-2.png…) / team.png / size.png 를 남기고
 * 앱을 종료한다. 환경변수가 없으면 아무 일도 하지 않는다.
 *
 * 함께 쓸 수 있는 환경변수
 *   TAPTAP_SEED="팀이름:닉네임"    팀을 만들어 놓고 찍는다 (`;` 로 이어 붙이면 여러 팀)
 *   TAPTAP_JOIN="초대코드:닉네임"  이미 있는 팀에 참여시킨다
 *   TAPTAP_CHARACTER="bunny"      캐릭터를 바꾼다 (`,` 로 이어 붙이면 팀 순서대로)
 *   TAPTAP_SCALE="1.5"            첫 캐릭터 크기를 바꾼다
 *   TAPTAP_SIZE_PANEL=1           크기 조절 패널을 띄운다
 *   TAPTAP_SELF_TAP=1             내가 캐릭터를 클릭한 것과 같은 경로를 태운다
 *   TAPTAP_POKE="민수,수진"       팀원들이 콕 찌른 것처럼 만든다
 *   TAPTAP_POKE_TEAM="2"          그 순서의 팀만 찌른다 (없으면 전부)
 *   TAPTAP_POKE_DELAY="175"       찌른 뒤 몇 ms 지난 순간을 찍을지
 *   TAPTAP_DETAIL="1"             그 순서의 팀 상세 창을 열어 함께 찍는다
 *   TAPTAP_SETTINGS=1             설정 창을 열어 함께 찍는다 (목록 화면)
 *   TAPTAP_SETTINGS="power"       그 항목의 상세 화면까지 들어가서 찍는다 ("language" 도)
 *   TAPTAP_POWER="saver"          절전 강도를 바꿔 놓고 찍는다
 *   TAPTAP_FAIL="create"|"join"   실패했을 때 사용자에게 보이는 문구를 확인한다
 *   TAPTAP_LANG="ja"              그 언어로 바꿔 놓고 찍는다
 *   TAPTAP_SWITCH_LANG="zh"       화면에서 언어를 바꾼 것처럼 IPC 로 전환한다
 *   TAPTAP_SCROLL="1"             팀 창을 아래로 굴려 놓고 찍는다 (고정 헤더 확인용)
 *   TAPTAP_UPDATE="0.2.0"         새 버전이 나온 것처럼 만든다 ("받으러 가기")
 *   TAPTAP_UPDATE="0.2.0:ready"   이미 받아 둔 것처럼 만든다 ("지금 적용하기")
 */

const fs = require('node:fs')
const path = require('node:path')

const DELAY_MS = 2500
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function captureIfRequested(app, electronApp) {
  const directory = process.env.TAPTAP_CAPTURE
  if (!directory) return

  await wait(DELAY_MS)

  if (process.env.TAPTAP_LANG) {
    app.session.setLanguage(process.env.TAPTAP_LANG)
    app.applyLanguage()
    await wait(500)
  }

  // 실제로 GitHub 을 보지 않고 "새 버전이 있다" 상태만 만들어 본다
  if (process.env.TAPTAP_UPDATE) {
    const [version, state] = process.env.TAPTAP_UPDATE.split(':')
    const ready = state === 'ready'
    app.session.setUpdate({
      version,
      ready,
      url: ready ? null : 'https://example.com/download',
    })
    await wait(400)
  }

  const teamWindow = () => app.teamWindow
  const petWindows = () => [...app.pets.entries()]
  const firstTeamId = () => app.session.snapshot().memberships[0]?.team.id ?? null

  if (process.env.TAPTAP_SEED && teamWindow()) {
    for (const pair of process.env.TAPTAP_SEED.split(';')) {
      const [name, nickname] = pair.split(':')
      await teamWindow().webContents.executeJavaScript(
        `window.teamApi.createTeam(${JSON.stringify({ name, nickname })})`,
      )
      await wait(1200)
    }
  }

  if (process.env.TAPTAP_JOIN && teamWindow()) {
    const [inviteCode, nickname] = process.env.TAPTAP_JOIN.split(':')
    await teamWindow().webContents.executeJavaScript(
      `window.teamApi.joinTeam(${JSON.stringify({ inviteCode, nickname })})`,
    )
    await wait(1500)
  }

  if (process.env.TAPTAP_CHARACTER && teamWindow()) {
    const teams = app.session.snapshot().memberships
    for (const [index, key] of process.env.TAPTAP_CHARACTER.split(',').entries()) {
      const teamId = teams[index]?.team.id
      if (!teamId) continue
      await teamWindow().webContents.executeJavaScript(
        `window.teamApi.setCharacter(${JSON.stringify(teamId)}, ${JSON.stringify(key.trim())})`,
      )
      await wait(500)
    }
  }

  if (process.env.TAPTAP_DETAIL) {
    const teams = app.session.snapshot().memberships
    const target = teams[Number(process.env.TAPTAP_DETAIL) - 1]
    if (target) {
      app.openTeamDetail(target.team.id)
      await wait(1200)
    }
  }

  if (process.env.TAPTAP_POWER) {
    app.session.setPower(process.env.TAPTAP_POWER)
    await wait(400)
  }

  if (process.env.TAPTAP_SETTINGS) {
    app.openSettings()
    await wait(1200)

    // 설정 창은 목록에서 시작하므로, 상세 화면은 그 줄을 눌러 봐야 찍을 수 있다
    const item = process.env.TAPTAP_SETTINGS
    if (item !== '1' && app.settingsWindow && !app.settingsWindow.isDestroyed()) {
      await app.settingsWindow.webContents.executeJavaScript(
        `document.querySelector('[data-item="${item}"]')?.click()`,
      )
      await wait(400)
    }
  }

  if (process.env.TAPTAP_SCALE && firstTeamId()) {
    app.setPetScale(firstTeamId(), Number(process.env.TAPTAP_SCALE))
    await wait(500)
  }

  if (process.env.TAPTAP_SIZE_PANEL && firstTeamId()) {
    app.openSizePanel(firstTeamId())
    await wait(700)
  }

  if (process.env.TAPTAP_SELF_TAP && petWindows().length) {
    await petWindows()[0][1].window.webContents.executeJavaScript(`
      (() => {
        const x = innerWidth / 2
        const y = innerHeight * 0.6 // 캐릭터 몸통 언저리
        for (const type of ['mousemove', 'mousedown', 'mouseup']) {
          window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0 }))
        }
      })()
    `)
    await wait(80) // 움찔이 가장 큰 순간
  }

  if (process.env.TAPTAP_POKE) {
    // TAPTAP_POKE_TEAM="2" 처럼 주면 그 순서의 팀만 찌른다 (없으면 전부)
    const only = process.env.TAPTAP_POKE_TEAM ? Number(process.env.TAPTAP_POKE_TEAM) : null
    for (const [index, [teamId, pet]] of petWindows().entries()) {
      if (only !== null && index + 1 !== only) continue
      for (const nickname of process.env.TAPTAP_POKE.split(',')) {
        pet.window.webContents.send('tap', { teamId, fromNickname: nickname.trim() })
      }
    }
    await wait(Number(process.env.TAPTAP_POKE_DELAY ?? 175))
  }

  // TAPTAP_FAIL="create" / "join" 으로 오류 화면을 재현해 본다
  if (process.env.TAPTAP_FAIL && teamWindow()) {
    const call =
      process.env.TAPTAP_FAIL === 'join'
        ? `window.teamApi.joinTeam({ inviteCode: 'ZZZZZZ', nickname: '나영' })`
        : `window.teamApi.createTeam({ name: '넘침', nickname: '나영' })`
    await teamWindow().webContents.executeJavaScript(
      `(async () => { try { await ${call} } catch (e) { window.__lastError = e.message } })()`,
    )
    await wait(1200)
    console.log(
      'FAIL_MESSAGE:',
      await teamWindow().webContents.executeJavaScript('window.__lastError'),
    )
  }

  // 사용자가 언어 칸을 고른 것과 같은 경로(IPC)를 태워 본다
  if (process.env.TAPTAP_SWITCH_LANG && teamWindow()) {
    await teamWindow().webContents.executeJavaScript(
      `window.teamApi.setLanguage(${JSON.stringify(process.env.TAPTAP_SWITCH_LANG)})`,
    )
    await wait(900)
  }

  if (process.env.TAPTAP_SCROLL) {
    for (const window of [teamWindow(), ...app.teamDetails.values()]) {
      if (!window || window.isDestroyed()) continue
      await window.webContents.executeJavaScript('scrollTo(0, document.body.scrollHeight)')
    }
    await wait(400)
  }

  fs.mkdirSync(directory, { recursive: true })

  const targets = [
    ...petWindows().map(([, pet], index) => [index === 0 ? 'pet' : `pet-${index + 1}`, pet.window]),
    ['team', teamWindow()],
    ...[...app.teamDetails.entries()].map(([, window], index) => [
      index === 0 ? 'detail' : `detail-${index + 1}`,
      window,
    ]),
    ['size', app.sizeWindow],
    ['settings', app.settingsWindow],
  ]

  for (const [name, window] of targets) {
    if (!window || window.isDestroyed()) continue
    const image = await window.capturePage()
    const file = path.join(directory, `${name}.png`)
    fs.writeFileSync(file, image.toPNG())
    console.log(`captured → ${file}`)
  }

  electronApp.exit(0)
}

module.exports = { captureIfRequested }
