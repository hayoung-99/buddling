/**
 * 창을 만든다.
 *
 *  pet  — 바탕화면 위에 떠 있는 투명 캐릭터. 속한 팀마다 하나씩 뜬다.
 *  team — 내 팀 목록 창. 팀을 고르면 팀별 상세 창이 따로 열린다.
 *  size — 캐릭터 크기를 조절하는 작은 슬라이더 패널.
 *
 * 캐릭터 크기는 창 크기로 표현한다. 카메라 구도가 가로세로 비율만 따르기 때문에,
 * 창을 그대로 키우면 캐릭터도 같은 비율로 커진다.
 */

const path = require('node:path')
const { BrowserWindow, screen } = require('electron')
const store = require('./store')
const { clampScale, petSizeFor, nextPetBounds, PET_BASE_SIZE } = require('./pet-size')

const ROOT = path.join(__dirname, '..', '..')

const SIZE_PANEL = { width: 244, height: 56 }

/**
 * 화면 오른쪽 아래부터 왼쪽으로 차례차례.
 *
 * 팀이 여러 개면 캐릭터도 여러 마리라 같은 자리에 겹치면 안 된다.
 * 혼자서 두 명인 척 테스트할 때(TAPTAP_PROFILE)도 한 칸 더 비켜 세운다.
 */
function defaultPetPosition(size, index = 0) {
  const { workArea } = screen.getPrimaryDisplay()
  const slot = index + (process.env.TAPTAP_PROFILE ? 1 : 0)
  const shift = slot * (PET_BASE_SIZE.width + 40)
  return {
    x: Math.round(workArea.x + workArea.width - size.width - 40 - shift),
    y: Math.round(workArea.y + workArea.height - size.height - 20),
  }
}

/** 저장된 위치가 지금 연결된 모니터 안에 있는지 확인한다 (모니터를 뺐을 수도 있다) */
function isOnScreen(position, size) {
  if (!position) return false
  return screen.getAllDisplays().some(({ workArea }) => {
    const centerX = position.x + size.width / 2
    const centerY = position.y + size.height / 2
    return (
      centerX >= workArea.x &&
      centerX <= workArea.x + workArea.width &&
      centerY >= workArea.y &&
      centerY <= workArea.y + workArea.height
    )
  })
}

/**
 * 팀 하나의 캐릭터 창.
 * 렌더러·preload 는 `--team-id=` 인자로 자기가 어느 팀 것인지 알게 된다.
 */
function createPetWindow({ teamId, index = 0 }) {
  const pet = store.pet(teamId)
  const size = petSizeFor(pet.scale)
  const position = isOnScreen(pet.position, size) ? pet.position : defaultPetPosition(size, index)

  const window = new BrowserWindow({
    ...size,
    ...position,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    title: 'tap-tap',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'pet.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--team-id=${teamId}`],
    },
  })

  // 전체화면 앱 위에서도 보이고, 데스크탑을 전환해도 따라다닌다
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 기본은 클릭 통과. 커서가 캐릭터 위에 올라오면 렌더러가 알려준다.
  // forward: true 라야 통과 상태에서도 mousemove 를 계속 받을 수 있다.
  window.setIgnoreMouseEvents(true, { forward: true })

  window.loadFile(path.join(ROOT, 'src', 'renderer', 'pet', 'index.html'))
  return window
}

/**
 * 캐릭터 창을 새 크기로 바꾼다.
 * @returns {{x: number, y: number}} 실제로 적용된 창 위치 (저장용)
 */
function resizePetWindow(window, scale) {
  const bounds = window.getBounds()
  const { workArea } = screen.getDisplayMatching(bounds)
  window.setBounds(nextPetBounds({ bounds, scale, workArea }))

  // OS가 요청을 조정했을 수 있으니 실제 결과를 읽어서 저장한다
  const actual = window.getBounds()
  return { x: actual.x, y: actual.y }
}

function createSizeWindow() {
  const window = new BrowserWindow({
    ...SIZE_PANEL,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    title: 'tap-tap 크기',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'size.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.loadFile(path.join(ROOT, 'src', 'renderer', 'size', 'index.html'))
  return window
}

/** 크기 패널을 캐릭터 바로 아래에 붙인다. 자리가 없으면 위에 붙인다. */
function placeSizeWindow(sizeWindow, petWindow) {
  if (!sizeWindow || sizeWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) return

  const pet = petWindow.getBounds()
  const { workArea } = screen.getDisplayMatching(pet)
  const gap = 8

  let x = Math.round(pet.x + pet.width / 2 - SIZE_PANEL.width / 2)
  let y = pet.y + pet.height + gap
  if (y + SIZE_PANEL.height > workArea.y + workArea.height) {
    y = pet.y - SIZE_PANEL.height - gap // 아래에 자리가 없으면 위로
  }

  x = Math.min(Math.max(x, workArea.x + 8), workArea.x + workArea.width - SIZE_PANEL.width - 8)
  y = Math.min(Math.max(y, workArea.y + 8), workArea.y + workArea.height - SIZE_PANEL.height - 8)

  sizeWindow.setBounds({ x, y, ...SIZE_PANEL })
}

/** 내 팀 목록 창 */
function createTeamWindow() {
  const window = new BrowserWindow({
    width: 400,
    // 언어 고르는 칸이 맨 아래에 있어서, 스크롤하지 않고도 보이도록 넉넉히 잡는다
    height: 780,
    minWidth: 360,
    minHeight: 520,
    title: 'tap-tap',
    backgroundColor: '#f5efe1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'team.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.loadFile(path.join(ROOT, 'src', 'renderer', 'team', 'index.html'))
  window.once('ready-to-show', () => window.show())
  return window
}

/**
 * 팀 하나의 상세 창. 팀마다 따로 뜬다.
 * 렌더러는 `--team-id=` 인자로 자기가 어느 팀 것인지 알게 된다.
 */
function createTeamDetailWindow(teamId, index = 0) {
  const offset = index * 26 // 여러 개 열면 조금씩 어긋나게 쌓인다
  const window = new BrowserWindow({
    width: 430,
    height: 820,
    minWidth: 380,
    minHeight: 520,
    title: 'tap-tap',
    backgroundColor: '#f5efe1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'team.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--team-id=${teamId}`],
    },
  })

  const [x, y] = window.getPosition()
  window.setPosition(x + offset, y + offset)
  window.loadFile(path.join(ROOT, 'src', 'renderer', 'team', 'detail.html'))
  window.once('ready-to-show', () => window.show())
  return window
}

module.exports = {
  createPetWindow,
  createTeamWindow,
  createTeamDetailWindow,
  createSizeWindow,
  placeSizeWindow,
  resizePetWindow,
  clampScale,
}
