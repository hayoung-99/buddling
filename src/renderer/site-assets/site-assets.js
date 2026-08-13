/**
 * 랜딩 페이지에 넣을 그림을 앱과 같은 캐릭터로 그린다.
 * `scripts/make-site-images.js` 가 이 화면을 띄워 캡처한다. 배포본에는 들어가지 않는다.
 *
 *   ?shot=hero        고양이 한 마리, 배경 없음
 *   ?shot=characters  5종 나란히, 배경 없음
 *   ?shot=og          공유 카드 (글 + 5종)
 */

import * as THREE from 'three'
import { CHARACTERS, getCharacter } from '../../shared/characters.js'
import { createCritter, scaleToStandardHeight } from '../pet/critter.js'
import { addLighting, createShadowCatcher } from '../pet/scene.js'

const shot = new URLSearchParams(location.search).get('shot') ?? 'hero'
document.body.dataset.shot = shot

/** 화면마다 캐릭터를 어떻게 세우고 어디를 볼지 */
const LAYOUT = {
  hero: { specs: [getCharacter('cat')], spacing: 0, headroom: 1.35, lift: 0.0, yaw: -0.24 },
  characters: { specs: CHARACTERS, spacing: 2.3, headroom: 1.28, lift: 0.0, yaw: -0.2 },
  // 공유 카드는 캔버스 자체가 오른쪽 아래로 밀려 있다 (index.html 참고)
  og: { specs: CHARACTERS, spacing: 2.3, headroom: 1.24, lift: 0.0, yaw: -0.2 },
}[shot]

const canvas = document.getElementById('stage')
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
renderer.setClearColor(0x000000, 0)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
addLighting(scene)
scene.add(createShadowCatcher(30))

LAYOUT.specs.forEach((spec, index) => {
  const critter = createCritter(spec)
  const stand = new THREE.Group()
  stand.position.x = (index - (LAYOUT.specs.length - 1) / 2) * LAYOUT.spacing
  stand.rotation.y = LAYOUT.yaw
  stand.scale.setScalar(scaleToStandardHeight(critter))
  stand.add(critter.root)
  scene.add(stand)
})

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60)

/**
 * 가로로 다 들어오면서 위아래로도 잘리지 않게 카메라를 뒤로 뺀다.
 * 창 비율이 바뀌어도 캐릭터 크기가 일정하도록 두 조건 중 먼 쪽을 쓴다.
 */
function frame() {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / height

  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2)
  const spanX = Math.max(LAYOUT.spacing * LAYOUT.specs.length, 2.6)
  const spanY = 2.0 * LAYOUT.headroom // 캐릭터 키는 2.0 (STANDARD_HEIGHT)

  const forWidth = spanX / 2 / (Math.tan(halfFov) * camera.aspect)
  const forHeight = spanY / 2 / Math.tan(halfFov)

  camera.position.set(0, 1.05 + LAYOUT.lift, Math.max(forWidth, forHeight) + 1)
  camera.lookAt(0, 0.95 + LAYOUT.lift, 0)
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)
}

frame()

requestAnimationFrame(() => {
  frame()
  requestAnimationFrame(() => document.body.setAttribute('data-ready', 'true'))
})
