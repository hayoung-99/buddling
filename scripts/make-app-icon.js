/**
 * 앱 아이콘을 코드로 만든다.
 *
 *   npm run app-icon
 *
 * 앱에서 쓰는 캐릭터를 그대로 렌더해서(`src/renderer/icon/`) 한 장을 뜨고,
 * 거기서 플랫폼별 아이콘 파일을 파생시킨다. 이미지 편집기가 필요 없고,
 * 캐릭터 색이나 비율을 바꾸면 아이콘도 다시 만들면 그대로 따라온다.
 *
 * 만드는 것
 *   build/icon.icns          macOS 앱 아이콘 (iconutil, macOS 에서만)
 *   build/icon.ico           Windows 앱 아이콘
 *   build/icon.png           Linux 앱 아이콘 (512)
 *   site/assets/icon-*.png   랜딩 페이지 파비콘 (32 · 180)
 *   site/favicon.ico         랜딩 페이지 파비콘 (구형 브라우저)
 *
 * 산출물은 저장소에 커밋한다. CI 러너에서 Electron 렌더링을 돌리는 것보다
 * 훨씬 안정적이고, 빌드가 그림 그리는 일에 기대지 않게 된다.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { app, BrowserWindow } = require('electron')

const ROOT = path.join(__dirname, '..')
const PAGE = path.join(ROOT, 'dist-renderer', 'icon', 'index.html')
const BUILD_DIR = path.join(ROOT, 'build')
const SITE_ASSETS = path.join(ROOT, 'site', 'assets')

const CANVAS = 1024
const READY_TIMEOUT_MS = 15000

/** macOS 가 .icns 안에 기대하는 이름과 크기 */
const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const FAVICON_SIZES = [16, 32, 48]

// ── 렌더 ──────────────────────────────────────────────────

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 화면이 다 그려졌다고 알릴 때까지 기다린다 */
async function waitForReady(window) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `document.body.getAttribute('data-ready') === 'true'`,
    )
    if (ready) return
    await wait(120)
  }
  throw new Error('아이콘 화면이 준비됐다고 알려오지 않았습니다 (렌더 실패?)')
}

/**
 * 아이콘 한 장을 1024×1024 로 뜬다.
 * 창은 투명해야 한다 — 판(둥근 사각형) 바깥이 비어 있어야 아이콘이 제 모양이 된다.
 */
async function shoot(platform) {
  const window = new BrowserWindow({
    width: CANVAS,
    height: CANVAS,
    useContentSize: true,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    webPreferences: { backgroundThrottling: false },
  })

  await window.loadFile(PAGE, { search: `platform=${platform}` })
  await waitForReady(window)

  const captured = await window.capturePage()
  window.destroy()

  const image = captured.resize({ width: CANVAS, height: CANVAS, quality: 'best' })
  if (image.isEmpty()) throw new Error(`${platform} 아이콘 캡처가 비어 있습니다`)
  return image
}

/** 판 바깥이 정말 투명한지 왼쪽 위 구석 한 점으로 확인한다 */
function assertTransparentCorner(image, platform) {
  const bitmap = image.getBitmap() // BGRA
  const alpha = bitmap[3]
  if (alpha !== 0) {
    throw new Error(
      `${platform} 아이콘의 모서리가 불투명합니다(alpha=${alpha}). ` +
        '투명 창 캡처가 실패한 것으로 보입니다.',
    )
  }
}

const resize = (image, size) =>
  image.resize({ width: size, height: size, quality: 'best' }).toPNG()

// ── ICO 만들기 ────────────────────────────────────────────

/**
 * ICO 파일을 만든다.
 *
 * Vista 이후의 ICO 는 PNG 를 그대로 품을 수 있다. 그래서 헤더(6바이트)와
 * 항목(16바이트씩)만 앞에 붙이면 끝이고, 비트맵을 직접 인코딩할 필요가 없다.
 */
function encodeIco(pngsBySize) {
  const entries = [...pngsBySize.entries()].sort((a, b) => a[0] - b[0])

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // 예약
  header.writeUInt16LE(1, 2) // 1 = 아이콘
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach(([size, png], index) => {
    const at = index * 16
    directory[at] = size >= 256 ? 0 : size // 256 은 0 으로 적는 것이 규칙이다
    directory[at + 1] = size >= 256 ? 0 : size
    directory[at + 2] = 0 // 팔레트 색 수 (트루컬러라 0)
    directory[at + 3] = 0 // 예약
    directory.writeUInt16LE(1, at + 4) // 색 평면
    directory.writeUInt16LE(32, at + 6) // 픽셀당 비트
    directory.writeUInt32LE(png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...entries.map(([, png]) => png)])
}

const icoFrom = (image, sizes) =>
  encodeIco(new Map(sizes.map((size) => [size, resize(image, size)])))

// ── 실행 ──────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  fs.mkdirSync(SITE_ASSETS, { recursive: true })

  const mac = await shoot('mac')
  const win = await shoot('win')
  assertTransparentCorner(mac, 'mac')

  const written = []
  const write = (file, data) => {
    fs.writeFileSync(file, data)
    written.push(path.relative(ROOT, file))
  }

  // macOS — iconutil 은 macOS 에만 있다
  if (process.platform === 'darwin') {
    const iconset = path.join(BUILD_DIR, 'icon.iconset')
    fs.rmSync(iconset, { recursive: true, force: true })
    fs.mkdirSync(iconset)
    for (const [name, size] of ICONSET) {
      fs.writeFileSync(path.join(iconset, name), resize(mac, size))
    }
    const icns = path.join(BUILD_DIR, 'icon.icns')
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns])
    fs.rmSync(iconset, { recursive: true, force: true })
    written.push(path.relative(ROOT, icns))
  } else {
    console.warn('건너뜀: build/icon.icns 는 macOS 에서만 만들 수 있습니다 (iconutil)')
  }

  // Windows / Linux
  write(path.join(BUILD_DIR, 'icon.ico'), icoFrom(win, ICO_SIZES))
  write(path.join(BUILD_DIR, 'icon.png'), resize(mac, 512))

  // 랜딩 페이지 — 파비콘은 작게 쓰이므로 여백 없는 win 판이 또렷하다
  write(path.join(SITE_ASSETS, 'icon-180.png'), resize(win, 180)) // apple-touch-icon
  write(path.join(SITE_ASSETS, 'icon-32.png'), resize(win, 32))
  write(path.join(ROOT, 'site', 'favicon.ico'), icoFrom(win, FAVICON_SIZES))

  for (const file of written) console.log(`wrote ${file}`)
}

void app.whenReady().then(async () => {
  try {
    await main()
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})

app.on('window-all-closed', () => {})
