/**
 * 개발용 캐릭터 미리보기 실행기.
 *
 *   npm run preview          창을 띄운다
 *   npm run preview -- --shot  .preview/characters.png 로 캡처하고 종료
 */

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')

const CAPTURE = process.argv.includes('--shot')
const HOP = process.argv.includes('--hop')
const DANCE = process.argv.includes('--dance')
const OUTPUT = path.join(
  __dirname,
  '..',
  '.preview',
  DANCE ? 'dance.png' : HOP ? 'hop.png' : 'characters.png',
)

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1360,
    height: 560,
    backgroundColor: '#f5efe1',
    title: 'tap-tap 캐릭터 미리보기',
  })

  await window.loadFile(path.join(__dirname, '..', 'dist-renderer', 'preview', 'index.html'))

  if (!CAPTURE) return

  // 첫 프레임이 그려지고 idle 애니메이션이 자리를 잡을 때까지 잠시 기다린다
  await new Promise((resolve) => setTimeout(resolve, 1500))

  if (HOP || DANCE) {
    // 시간차로 움직이게 한 뒤 한 장에 동작의 여러 단계를 담는다
    const call = DANCE ? 'window.__danceAll(140)' : 'window.__hopAll(130)'
    await window.webContents.executeJavaScript(call)
    await new Promise((resolve) => setTimeout(resolve, DANCE ? 760 : 620))
  }
  const image = await window.capturePage()
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, image.toPNG())
  console.log(`captured → ${OUTPUT}`)
  app.quit()
})

app.on('window-all-closed', () => app.quit())
