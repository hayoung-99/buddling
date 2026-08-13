/**
 * 랜딩 페이지에 넣을 그림을 만든다.
 *
 *   npm run site-images
 *
 * 앱과 같은 캐릭터 코드로 그리므로(`src/renderer/site-assets/`), 캐릭터가 바뀌면
 * 다시 돌리기만 하면 랜딩 페이지의 그림도 따라온다. 산출물은 커밋한다.
 *
 * 팀 창 스크린샷은 여기서 만들지 않는다. 진짜 앱을 띄워서 찍어야 하므로
 * 아래 명령으로 따로 뜬 뒤 site/assets/ 로 옮긴다.
 *
 *   TAPTAP_FAKE_NET=1 TAPTAP_PROFILE=shot TAPTAP_CAPTURE=.preview/site \
 *     TAPTAP_SEED="디자인팀:나영" TAPTAP_LANG=ko npm start
 */

const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const ROOT = path.join(__dirname, '..')
const PAGE = path.join(ROOT, 'src', 'renderer', 'site-assets', 'index.html')
const OUT_DIR = path.join(ROOT, 'site', 'assets')

const READY_TIMEOUT_MS = 15000

/** 어떤 그림을 어느 크기로 뜰지. 2배로 떠서 화면에서 또렷하게 보이게 한다. */
const SHOTS = [
  { shot: 'hero', file: 'hero-cat.png', width: 760, height: 900, transparent: true },
  { shot: 'characters', file: 'characters.png', width: 1760, height: 460, transparent: true },
  { shot: 'og', file: 'og.png', width: 1200, height: 630, transparent: false },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForReady(window) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `document.body.getAttribute('data-ready') === 'true'`,
    )
    if (ready) return
    await wait(120)
  }
  throw new Error('그림이 준비됐다고 알려오지 않았습니다 (렌더 실패?)')
}

async function capture({ shot, file, width, height, transparent }) {
  const window = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: true,
    frame: false,
    transparent,
    backgroundColor: transparent ? '#00000000' : '#f5efe1',
    resizable: false,
    webPreferences: { backgroundThrottling: false },
  })

  await window.loadFile(PAGE, { search: `shot=${shot}` })
  await waitForReady(window)
  // 창이 화면에 실제로 합성될 틈을 준다. 이게 없으면 빈 화면이 찍히는 때가 있다.
  await wait(400)

  const image = await window.capturePage()
  window.destroy()

  if (image.isEmpty()) throw new Error(`${shot} 캡처가 비어 있습니다`)

  // 창을 띄운 화면의 배율과 무관하게 늘 같은 크기로 저장한다
  const normalized = image.resize({ width, height, quality: 'best' })
  const target = path.join(OUT_DIR, file)
  fs.writeFileSync(target, normalized.toPNG())
  console.log(`wrote ${path.relative(ROOT, target)}  (${width}x${height})`)
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    for (const spec of SHOTS) await capture(spec)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})

app.on('window-all-closed', () => {})
