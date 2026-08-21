/**
 * 개발용 캐릭터 미리보기 실행기.
 *
 *   npm run preview            창을 띄운다 (나란히 보기)
 *   npm run preview -- --editor  키프레임 편집기로 바로 연다
 *   npm run preview -- --shot    .preview/characters.png 로 캡처하고 종료
 */

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow } = require('electron')

const CAPTURE = process.argv.includes('--shot')
const EDITOR = process.argv.includes('--editor')
const HOP = process.argv.includes('--hop')
const DANCE = process.argv.includes('--dance')
const WAVE = process.argv.includes('--wave')
const OUTPUT = path.join(
  __dirname,
  '..',
  '.preview',
  EDITOR ? 'editor.png' : WAVE ? 'wave.png' : DANCE ? 'dance.png' : HOP ? 'hop.png' : 'characters.png',
)

void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    // 편집기는 오른쪽에 패널이 붙으므로 나란히 보기보다 넓고 높아야 한다
    width: EDITOR ? 1500 : 1360,
    height: EDITOR ? 820 : 560,
    backgroundColor: '#f5efe1',
    title: 'Buddling 캐릭터 미리보기',
  })

  await window.loadFile(path.join(__dirname, '..', 'dist-renderer', 'preview', 'index.html'), {
    hash: EDITOR ? 'editor' : '',
  })

  if (!CAPTURE) return

  // 첫 프레임이 그려지고 idle 애니메이션이 자리를 잡을 때까지 잠시 기다린다
  await new Promise((resolve) => setTimeout(resolve, 1500))

  if (HOP || DANCE || WAVE) {
    // 시간차로 움직이게 한 뒤 한 장에 동작의 여러 단계를 담는다
    const call = WAVE
      ? 'window.__waveAll(150)'
      : DANCE
        ? 'window.__danceAll(140)'
        : 'window.__hopAll(130)'
    await window.webContents.executeJavaScript(call)
    await new Promise((resolve) => setTimeout(resolve, WAVE ? 820 : DANCE ? 760 : 620))
  }
  const image = await window.capturePage()
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, image.toPNG())
  console.log(`captured → ${OUTPUT}`)
  app.quit()
})

app.on('window-all-closed', () => app.quit())
