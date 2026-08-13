/**
 * 바탕화면 위 캐릭터.
 *
 * 창은 투명한 사각형이라 기본적으로 클릭이 통과된다. 커서가 실제 캐릭터
 * 실루엣 위에 올라왔을 때만 메인 프로세스에 알려 마우스를 받는다.
 *
 * 이 창은 팀 하나를 담당한다 (`petApi.teamId`). 여러 팀에 속해 있으면
 * 같은 화면에 이런 창이 팀 수만큼 뜨고, 각자 자기 팀 신호에만 반응한다.
 *
 * 화면에 나타나는 신호는 서로 다르다.
 *   내가 클릭  → 움찔 + "TAP TAP!" 말풍선 (그리고 팀에 신호를 보낸다)
 *   팀원이 찌름 → 좌우로 흔드는 춤 + 떠오르는 음표 + 발밑에 찌른 사람 이름표
 *   둘이 겹치면 → 춤추면서 움찔하고 말풍선·이름이 다 보인다
 *
 * 셋을 따로 두었기 때문에 "겹칠 때"를 위한 별도 처리가 필요 없다.
 */

import * as THREE from 'three'
import { getCharacter } from '../../shared/characters.js'
import { createCritter, disposeCritter, scaleToStandardHeight } from './critter.js'
import { createStage } from './scene.js'
import { createAnimator } from './animations.js'
import { createBubble } from './bubble.js'
import { createNameplate } from './nameplate.js'
import { createNotes } from './notes.js'

const canvas = document.getElementById('stage')
const bubble = createBubble(document.getElementById('bubble'))
const nameplate = createNameplate(document.getElementById('nameplate'))
const stage = createStage({ canvas })

/** 내가 눌렀을 때 뜨는 말풍선 문구 */
const TAP_TEXT = 'TAP TAP!'

/** 클릭으로 인정할 최대 이동 거리(px). 이보다 많이 움직이면 "옮기기"다. */
const DRAG_THRESHOLD = 4

/** 크기 100% 일 때의 창 너비. 창 너비를 나누면 지금 배율을 알 수 있다. */
const BASE_WIDTH = 260
/** 말풍선 배율 한계 — 너무 작으면 글씨가 안 읽히고, 너무 크면 화면을 가린다 */
const BUBBLE_SCALE_RANGE = [0.55, 1.3]

/** 창 크기로부터 지금 캐릭터 배율을 구해 말풍선·이름표에 알려준다 */
function syncOverlayScale() {
  const [min, max] = BUBBLE_SCALE_RANGE
  const petScale = (canvas.clientWidth || BASE_WIDTH) / BASE_WIDTH
  const scale = Math.min(max, Math.max(min, petScale))
  bubble.setScale(scale)
  nameplate.setScale(scale)
}

let spec = getCharacter('cat')
let critter = null
let animator = null
let hotZone = { left: 0, top: 0, right: 0, bottom: 0, centerX: 0 }
let interactive = false
let pixelsPerUnit = 0
let notes = null

function setCharacter(key) {
  const next = getCharacter(key)
  if (critter && next.key === spec.key) return
  spec = next

  if (critter) disposeCritter(critter)
  critter = createCritter(spec)
  // 종마다 키가 달라도 화면에서는 같은 크기로 보이게 맞춘다.
  // (토끼는 귀 때문에 오리보다 훨씬 커서, 안 맞추면 말풍선 자리가 없어진다)
  stage.stand.scale.setScalar(scaleToStandardHeight(critter))
  stage.stand.add(critter.root)
  animator = createAnimator(critter)
  notes?.dispose()
  notes = createNotes(stage.stand, critter.height * scaleToStandardHeight(critter))
  updateHotZone()
}

/**
 * 캐릭터가 화면에서 차지하는 사각형을 구한다.
 * 이 영역 안에서만 마우스를 받으므로, 정확할수록 옆 바탕화면을 안 가린다.
 */
function updateHotZone() {
  if (!critter) return
  // 춤추는 중이면 옆으로 나가 있으므로, 기본 자세로 되돌려 놓고 잰다
  critter.root.position.set(0, 0, 0)
  critter.root.scale.set(1, 1, 1)
  stage.stand.updateMatrixWorld(true)
  // 첫 프레임을 그리기 전에도 불리므로 카메라 행렬을 직접 최신화한다.
  // (안 하면 화면 좌표 변환이 어긋나 클릭 영역이 캐릭터와 따로 논다)
  stage.camera.updateMatrixWorld()

  const box = new THREE.Box3().setFromObject(critter.root)
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity

  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(stage.camera)
        const screenX = ((point.x + 1) / 2) * width
        const screenY = ((1 - point.y) / 2) * height
        left = Math.min(left, screenX)
        right = Math.max(right, screenX)
        top = Math.min(top, screenY)
        bottom = Math.max(bottom, screenY)
      }
    }
  }

  const padding = 6
  hotZone = {
    left: left - padding,
    top: top - padding,
    right: right + padding,
    bottom: bottom + padding,
    centerX: (left + right) / 2,
  }
  bubble.placeAbove({ centerX: hotZone.centerX, top: hotZone.top })

  // 월드 좌표 1단위가 화면 몇 px인지. 점프 높이를 말풍선 위치로 옮길 때 쓴다.
  const project = (worldY) =>
    ((1 - new THREE.Vector3(0, worldY, 0).project(stage.camera).y) / 2) * height
  pixelsPerUnit = Math.abs(project(box.max.y) - project(box.max.y + 1))
}

const isInside = (x, y) =>
  x >= hotZone.left && x <= hotZone.right && y >= hotZone.top && y <= hotZone.bottom

function setInteractive(next) {
  if (next === interactive) return
  interactive = next
  document.body.style.cursor = next ? 'pointer' : 'default'
  window.petApi.setInteractive(next)
}

// ── 클릭 / 끌어서 옮기기 ──
let drag = null

window.addEventListener('mousemove', (event) => {
  if (drag) {
    drag.moved = Math.max(
      drag.moved,
      Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY),
    )
    return
  }
  setInteractive(isInside(event.clientX, event.clientY))
})

window.addEventListener('mouseleave', () => {
  if (!drag) setInteractive(false)
})

window.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !isInside(event.clientX, event.clientY)) return
  drag = { startX: event.screenX, startY: event.screenY, moved: 0 }
  window.petApi.dragStart()
})

window.addEventListener('mouseup', (event) => {
  if (!drag) return
  const wasClick = drag.moved < DRAG_THRESHOLD
  drag = null
  window.petApi.dragEnd()
  setInteractive(isInside(event.clientX, event.clientY))
  if (wasClick) tapSelf()
})

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  if (isInside(event.clientX, event.clientY)) window.petApi.openMenu()
})

/** 내 캐릭터를 클릭했을 때 — 움찔하며 말풍선을 띄우고, 팀원들에게 신호를 보낸다 */
function tapSelf() {
  animator?.twitch()
  bubble.show(TAP_TEXT)
  window.petApi.tap()
}

/**
 * 팀원이 나를 콕 찔렀을 때.
 *
 * 춤은 이미 추는 중이면 그냥 넘긴다. 다섯 명이 동시에 찔러도 다섯 번이 아니라
 * 한 번만 춰야 "지금 누군가 찔렀다"가 한 번의 동작으로 읽힌다.
 * 이름은 반대로 찌른 사람마다 하나씩 띄워 누가 찔렀는지 다 보이게 한다.
 */
function tapReceived({ fromNickname } = {}) {
  if (!animator?.isDancing) {
    animator?.dance()
    notes?.burst({ count: 6 })
  }
  nameplate.show(fromNickname, { centerX: hotZone.centerX, bottom: hotZone.bottom })
}

// 크기 조절 패널로 창 크기가 바뀌면 여기로 들어온다
window.addEventListener('resize', () => {
  stage.resize()
  syncOverlayScale()
  updateHotZone()
})

// ── 메인 프로세스와 연결 ──
/** 전체 상태에서 이 창이 맡은 팀의 소속 정보만 뽑는다 */
function myMembership(state) {
  return state?.memberships?.find((entry) => entry.team.id === window.petApi.teamId) ?? null
}

function applyState(state) {
  const mine = myMembership(state)
  if (mine) setCharacter(mine.member.characterKey)
}

window.petApi.onCharacter((key) => setCharacter(key))
window.petApi.onState(applyState)
window.petApi.onTap((payload) => tapReceived(payload))

window.petApi.getState().then(applyState)
setCharacter('cat')
syncOverlayScale()

// ── 렌더 루프 ──
const clock = new THREE.Clock()
stage.renderer.setAnimationLoop(() => {
  const delta = clock.getDelta()
  if (animator) {
    animator.update(delta)
    // 말풍선도 같이 떠오른다. 창 위에 닿으면 bubble 쪽에서 알아서 멈춘다.
    bubble.setLift(critter.root.position.y * stage.stand.scale.y * pixelsPerUnit)
    notes?.update(delta)
  }
  stage.render()
})
