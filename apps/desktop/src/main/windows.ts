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

import path from 'node:path'
import { BrowserWindow, screen } from 'electron'
import store from './store'
import { clampScale, petSizeFor, nextPetBounds, PET_BASE_SIZE } from './pet-size'
import type { Size } from './pet-size'
import type { PetSettings } from '@buddling/shared/state'

const ROOT = path.join(__dirname, '..', '..')

/**
 * 창에 얹을 화면과 preload 는 이제 빌드해서 쓴다 (`npm run build`).
 *
 * 소스가 아니라 산출물을 가리키는 것이 중요하다. 렌더러는 타입스크립트·JSX 라
 * 브라우저가 그대로 읽지 못하고, preload 는 sandbox 때문에 CommonJS 로 묶여 있어야
 * 한다. 경로를 여기 두 함수로 모아 둔 이유는, 전에는 다섯 군데에 흩어져 있어서
 * 한 곳만 고치고 나머지를 빠뜨리기 쉬웠기 때문이다.
 */
const rendererPage = (...parts: string[]) => path.join(ROOT, 'dist-renderer', ...parts)
const preloadScript = (name: string) => path.join(ROOT, 'dist-preload', `${name}.cjs`)

const SIZE_PANEL = { width: 244, height: 56 }

/**
 * 화면 오른쪽 아래부터 왼쪽으로 차례차례.
 *
 * 팀이 여러 개면 캐릭터도 여러 마리라 같은 자리에 겹치면 안 된다.
 * 혼자서 두 명인 척 테스트할 때(BUDDLING_PROFILE)도 한 칸 더 비켜 세운다.
 */
function defaultPetPosition(size: Size, index = 0) {
  const { workArea } = screen.getPrimaryDisplay()
  const slot = index + (process.env.BUDDLING_PROFILE ? 1 : 0)
  const shift = slot * (PET_BASE_SIZE.width + 40)
  return {
    x: Math.round(workArea.x + workArea.width - size.width - 40 - shift),
    y: Math.round(workArea.y + workArea.height - size.height - 20),
  }
}

/** 저장된 위치가 지금 연결된 모니터 안에 있는지 확인한다 (모니터를 뺐을 수도 있다) */
function isOnScreen(position: PetSettings['position'], size: Size): boolean {
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
function createPetWindow({ teamId, index = 0 }: { teamId: string; index?: number }) {
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
    // 캐릭터를 없애는 길은 트레이의 "숨기기"와 팀 나가기뿐이다. 맥에서 ⌘W 로 캐릭터가
    // 닫혀 버리는 것을 막는 것은 여기가 아니라 `main.ts` 의 `close` 가드다 —
    // `closable: false` 로 두면 종료 자체가 통째로 취소된다 (`quit.ts` 참고).
    title: 'Buddling',
    webPreferences: {
      preload: preloadScript('pet'),
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

  void window.loadFile(rendererPage('pet', 'index.html'))
  return window
}

/**
 * 캐릭터 창을 새 크기로 바꾼다.
 * @returns 실제로 적용된 창 위치 (저장용)
 */
function resizePetWindow(window: BrowserWindow, scale: number): { x: number; y: number } {
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
    title: 'Buddling 크기',
    webPreferences: {
      preload: preloadScript('size'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  void window.loadFile(rendererPage('size', 'index.html'))
  return window
}

/** 크기 패널을 캐릭터 바로 아래에 붙인다. 자리가 없으면 위에 붙인다. */
function placeSizeWindow(sizeWindow: BrowserWindow | null, petWindow: BrowserWindow | null) {
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

/** 절전 강도와 언어를 고르는 창 */
function createSettingsWindow() {
  const window = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 380,
    minHeight: 440,
    title: 'Buddling',
    backgroundColor: '#f5efe1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: preloadScript('settings'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  void window.loadFile(rendererPage('settings', 'index.html'))
  window.once('ready-to-show', () => window.show())
  return window
}

/** 알림 화면. 방마다 따로가 아니라 하나뿐이다(기획서 "알림 화면"). */
function createNotificationsWindow() {
  const window = new BrowserWindow({
    width: 380,
    height: 520,
    minWidth: 340,
    minHeight: 400,
    title: 'Buddling',
    backgroundColor: '#f5efe1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: preloadScript('notifications'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  void window.loadFile(rendererPage('notifications', 'index.html'))
  window.once('ready-to-show', () => window.show())
  return window
}

/** 내 팀 목록 창 */
function createTeamWindow() {
  const window = new BrowserWindow({
    width: 400,
    height: 700,
    minWidth: 360,
    minHeight: 520,
    title: 'Buddling',
    backgroundColor: '#f5efe1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: preloadScript('team'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  void window.loadFile(rendererPage('team', 'index.html'))
  window.once('ready-to-show', () => window.show())
  return window
}

/**
 * 팀 하나의 상세 창. 팀마다 따로 뜬다.
 * 렌더러는 `--team-id=` 인자로 자기가 어느 팀 것인지 알게 된다.
 */
function createTeamDetailWindow(teamId: string, index = 0) {
  const offset = index * 26 // 여러 개 열면 조금씩 어긋나게 쌓인다
  const window = new BrowserWindow({
    width: 430,
    height: 820,
    minWidth: 380,
    minHeight: 520,
    title: 'Buddling',
    backgroundColor: '#f5efe1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: preloadScript('team'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--team-id=${teamId}`],
    },
  })

  const [x, y] = window.getPosition()
  window.setPosition(x + offset, y + offset)
  void window.loadFile(rendererPage('team', 'detail.html'))
  window.once('ready-to-show', () => window.show())
  return window
}

export {
  createPetWindow,
  createTeamWindow,
  createTeamDetailWindow,
  createSizeWindow,
  createSettingsWindow,
  createNotificationsWindow,
  placeSizeWindow,
  resizePetWindow,
  clampScale,
}
