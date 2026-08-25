/**
 * 개발용: 실행 중인 창을 PNG로 떠서 눈으로 확인한다.
 *
 *   BUDDLING_CAPTURE=.preview npm start
 *
 * 지정한 폴더에 pet.png(캐릭터가 여럿이면 pet-2.png…) / team.png / size.png 를 남기고
 * 앱을 종료한다. 환경변수가 없으면 아무 일도 하지 않는다.
 *
 * 함께 쓸 수 있는 환경변수
 *   BUDDLING_SEED="팀이름:닉네임"    팀을 만들어 놓고 찍는다 (`;` 로 이어 붙이면 여러 팀)
 *   BUDDLING_JOIN="초대코드:닉네임"  이미 있는 팀에 참여시킨다
 *   BUDDLING_CHARACTER="bunny"      캐릭터를 바꾼다 (`,` 로 이어 붙이면 팀 순서대로)
 *   BUDDLING_SCALE="1.5"            첫 캐릭터 크기를 바꾼다
 *   BUDDLING_SIZE_PANEL=1           크기 조절 패널을 띄운다
 *   BUDDLING_SELF_TAP=1             내가 캐릭터를 클릭한 것과 같은 경로를 태운다
 *   BUDDLING_ASLEEP=1               방을 재워 놓고 찍는다 (`,` 로 이어 붙이면 팀 순서대로)
 *   BUDDLING_WAKE_DELAY="740"       재운 방을 깨운 뒤 몇 ms 지난 순간을 찍을지 (기지개 확인용)
 *   BUDDLING_POKE="민수,수진"       팀원들이 콕 찌른 것처럼 만든다
 *   BUDDLING_POKE_TEAM="2"          그 순서의 팀만 찌른다 (없으면 전부)
 *   BUDDLING_POKE_DELAY="175"       찌른 뒤 몇 ms 지난 순간을 찍을지
 *   BUDDLING_POKE_SIGNAL="hop"      무슨 신호로 찌를지 (없으면 콕). 모르는 값은 콕으로 떨어진다
 *   BUDDLING_DETAIL="1"             그 순서의 팀 상세 창을 열어 함께 찍는다
 *   BUDDLING_SETTINGS=1             설정 창을 열어 함께 찍는다 (목록 화면)
 *   BUDDLING_SETTINGS="power"       그 항목의 상세 화면까지 들어가서 찍는다 ("language" 도)
 *   BUDDLING_POWER="saver"          절전 강도를 바꿔 놓고 찍는다
 *   BUDDLING_FAIL="create"|"join"   실패했을 때 사용자에게 보이는 문구를 확인한다
 *   BUDDLING_LANG="ja"              그 언어로 바꿔 놓고 찍는다
 *   BUDDLING_SWITCH_LANG="zh"       화면에서 언어를 바꾼 것처럼 IPC 로 전환한다
 *   BUDDLING_SCROLL="1"             팀 창을 아래로 굴려 놓고 찍는다 (고정 헤더 확인용)
 *   BUDDLING_UPDATE="0.2.0"         새 버전이 나온 것처럼 만든다 ("받으러 가기")
 *   BUDDLING_UPDATE="0.2.0:ready"   이미 받아 둔 것처럼 만든다 ("지금 적용하기")
 */

import fs from 'node:fs'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import type { AppShell } from './main'

const DELAY_MS = 2500
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function captureIfRequested(app: AppShell, electronApp: Electron.App) {
  const directory = process.env.BUDDLING_CAPTURE
  if (!directory) return

  await wait(DELAY_MS)

  // 이 함수는 `whenReady` 맨 끝에서만 불린다. 그때는 세션이 이미 있다.
  const session = app.session
  if (!session) return

  if (process.env.BUDDLING_LANG) {
    session.setLanguage(process.env.BUDDLING_LANG)
    app.applyLanguage()
    await wait(500)
  }

  // 실제로 GitHub 을 보지 않고 "새 버전이 있다" 상태만 만들어 본다
  if (process.env.BUDDLING_UPDATE) {
    const [version, state] = process.env.BUDDLING_UPDATE.split(':')
    const ready = state === 'ready'
    session.setUpdate({
      version,
      ready,
      url: ready ? null : 'https://example.com/download',
    })
    await wait(400)
  }

  /** 팀 창. 없으면 그 단계는 건너뛴다. */
  const teamWindow = () => app.teamWindow
  const petWindows = () => [...app.pets.entries()]
  const firstTeamId = () => session.snapshot().memberships[0]?.team.id ?? null

  if (process.env.BUDDLING_SEED && teamWindow()) {
    for (const pair of process.env.BUDDLING_SEED.split(';')) {
      const [name, nickname] = pair.split(':')
      await teamWindow()!.webContents.executeJavaScript(
        `window.teamApi.createTeam(${JSON.stringify({ name, nickname })})`,
      )
      await wait(1200)
    }
  }

  if (process.env.BUDDLING_JOIN && teamWindow()) {
    const [inviteCode, nickname] = process.env.BUDDLING_JOIN.split(':')
    await teamWindow()!.webContents.executeJavaScript(
      `window.teamApi.joinTeam(${JSON.stringify({ inviteCode, nickname })})`,
    )
    await wait(1500)
  }

  if (process.env.BUDDLING_CHARACTER && teamWindow()) {
    const teams = session.snapshot().memberships
    for (const [index, key] of process.env.BUDDLING_CHARACTER.split(',').entries()) {
      const teamId = teams[index]?.team.id
      if (!teamId) continue
      await teamWindow()!.webContents.executeJavaScript(
        `window.teamApi.setCharacter(${JSON.stringify(teamId)}, ${JSON.stringify(key.trim())})`,
      )
      await wait(500)
    }
  }

  if (process.env.BUDDLING_DETAIL) {
    const teams = session.snapshot().memberships
    const target = teams[Number(process.env.BUDDLING_DETAIL) - 1]
    if (target) {
      app.openTeamDetail(target.team.id)
      await wait(1200)
    }
  }

  if (process.env.BUDDLING_POWER) {
    session.setPower(process.env.BUDDLING_POWER)
    await wait(400)
  }

  if (process.env.BUDDLING_SETTINGS) {
    app.openSettings()
    await wait(1200)

    // 설정 창은 목록에서 시작하므로, 상세 화면은 그 줄을 눌러 봐야 찍을 수 있다
    const item = process.env.BUDDLING_SETTINGS
    if (item !== '1' && app.settingsWindow && !app.settingsWindow.isDestroyed()) {
      await app.settingsWindow.webContents.executeJavaScript(
        `document.querySelector('[data-item="${item}"]')?.click()`,
      )
      await wait(400)
    }
  }

  if (process.env.BUDDLING_SCALE && firstTeamId()) {
    app.setPetScale(firstTeamId(), Number(process.env.BUDDLING_SCALE))
    await wait(500)
  }

  if (process.env.BUDDLING_SIZE_PANEL && firstTeamId()) {
    app.openSizePanel(firstTeamId())
    await wait(700)
  }

  /*
   * 재워 놓고 찍는다. 자는 자세는 눈으로 볼 길이 이것뿐이다.
   *
   * `BUDDLING_WAKE_DELAY` 를 함께 주면 재운 뒤 곧바로 깨워, **기지개를 켜는 도중**을
   * 잡는다. 그 자세가 창 위로 넘치는지는 테스트가 보지만, 실제로 어떻게 보이는지는
   * 찍어 봐야 안다.
   */
  if (process.env.BUDDLING_ASLEEP) {
    const flags = process.env.BUDDLING_ASLEEP.split(',')
    for (const [index, [teamId]] of petWindows().entries()) {
      if (flags[index] === '0') continue
      if (flags.length > 1 && flags[index] === undefined) continue
      session.setAsleep(teamId, true)
    }
    await wait(1400) // 다 웅크릴 때까지

    if (process.env.BUDDLING_WAKE_DELAY) {
      for (const [teamId] of petWindows()) session.setAsleep(teamId, false)
      await wait(Number(process.env.BUDDLING_WAKE_DELAY))
    }
  }

  if (process.env.BUDDLING_SELF_TAP && petWindows().length) {
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

  if (process.env.BUDDLING_POKE) {
    // BUDDLING_POKE_TEAM="2" 처럼 주면 그 순서의 팀만 찌른다 (없으면 전부)
    const only = process.env.BUDDLING_POKE_TEAM ? Number(process.env.BUDDLING_POKE_TEAM) : null
    for (const [index, [teamId, pet]] of petWindows().entries()) {
      if (only !== null && index + 1 !== only) continue
      for (const nickname of process.env.BUDDLING_POKE.split(',')) {
        pet.window.webContents.send('tap', {
          teamId,
          fromNickname: nickname.trim(),
          signal: process.env.BUDDLING_POKE_SIGNAL,
        })
      }
    }
    await wait(Number(process.env.BUDDLING_POKE_DELAY ?? 175))
  }

  // BUDDLING_FAIL="create" / "join" 으로 오류 화면을 재현해 본다
  if (process.env.BUDDLING_FAIL && teamWindow()) {
    const call =
      process.env.BUDDLING_FAIL === 'join'
        ? `window.teamApi.joinTeam({ inviteCode: 'ZZZZZZ', nickname: '나영' })`
        : `window.teamApi.createTeam({ name: '넘침', nickname: '나영' })`
    await teamWindow()!.webContents.executeJavaScript(
      `(async () => { try { await ${call} } catch (e) { window.__lastError = e.message } })()`,
    )
    await wait(1200)
    console.log(
      'FAIL_MESSAGE:',
      await teamWindow()!.webContents.executeJavaScript('window.__lastError'),
    )
  }

  // 사용자가 언어 칸을 고른 것과 같은 경로(IPC)를 태워 본다
  if (process.env.BUDDLING_SWITCH_LANG && teamWindow()) {
    await teamWindow()!.webContents.executeJavaScript(
      `window.teamApi.setLanguage(${JSON.stringify(process.env.BUDDLING_SWITCH_LANG)})`,
    )
    await wait(900)
  }

  if (process.env.BUDDLING_SCROLL) {
    for (const window of [teamWindow(), ...app.teamDetails.values()]) {
      if (!window || window.isDestroyed()) continue
      await window.webContents.executeJavaScript('scrollTo(0, document.body.scrollHeight)')
    }
    await wait(400)
  }

  fs.mkdirSync(directory, { recursive: true })

  type Target = [name: string, window: BrowserWindow | null]

  const targets: Target[] = [
    ...petWindows().map(([, pet], index): Target => [
      index === 0 ? 'pet' : `pet-${index + 1}`,
      pet.window,
    ]),
    ['team', teamWindow()],
    ...[...app.teamDetails.entries()].map(([, window], index): Target => [
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

  // `exit()` 은 `before-quit` 을 거치지 않는다. 그래서 끄기 전 정리를 여기서 직접
  // 부른다 — 이걸 빠뜨리면 캐릭터 창이 파괴되자마자 다시 세워져 앱이 남는다.
  app.shutdown()
  electronApp.exit(0)
}

export { captureIfRequested }
