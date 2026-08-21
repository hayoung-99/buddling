/**
 * 개발용 피규어 미리보기 실행기. 앱 캐릭터의 `preview.js` 와 같은 꼴이고 따로 둔다.
 *
 *   npm run preview:figures                 창을 띄운다
 *   npm run preview:figures -- --shot       .preview/figures.png 로 정면을 캡처하고 종료
 *   npm run preview:figures -- --shot --side   왼쪽 옆모습
 *   npm run preview:figures -- --shot --hop    폴짝 (--wave · --dance 도 같다)
 */

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')

const CAPTURE = process.argv.includes('--shot')
const SIDE = process.argv.includes('--side')
const MOTION = ['hop', 'wave', 'dance'].find((name) => process.argv.includes(`--${name}`))
const OUTPUT = path.join(
  __dirname,
  '..',
  '.preview',
  `figures${SIDE ? '-side' : ''}${MOTION ? `-${MOTION}` : ''}.png`,
)

/** 다섯이 시간차로 움직이므로, 동작마다 가장 많은 단계가 한 장에 담기는 순간이 다르다 */
const HOLD_MS = { hop: 640, wave: 900, dance: 760 }

void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1360,
    height: 560,
    backgroundColor: '#f5efe1',
    title: 'Buddling 피규어 미리보기',
  })

  await window.loadFile(
    path.join(__dirname, '..', 'dist-renderer', 'figures-preview', 'index.html'),
  )

  if (!CAPTURE) return

  // 첫 프레임이 그려지고 호흡이 자리를 잡을 때까지 잠시 기다린다
  await new Promise((resolve) => setTimeout(resolve, 1500))

  if (SIDE) {
    await window.webContents.executeJavaScript('window.__figures.setYaw(-Math.PI / 2)')
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  if (MOTION) {
    await window.webContents.executeJavaScript(`window.__figures.play('${MOTION}', 150)`)
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS[MOTION]))
  }
  const image = await window.capturePage()
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, image.toPNG())
  console.log(`captured → ${OUTPUT}`)
  app.quit()
})

app.on('window-all-closed', () => app.quit())
