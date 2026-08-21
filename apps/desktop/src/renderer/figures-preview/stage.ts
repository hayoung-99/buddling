/**
 * 피규어 미리보기 무대 — 5종을 한 줄로 세우고 동작을 눌러 본다.
 *
 * 기존 미리보기(`preview/gallery.ts`)와 같은 꼴이지만 따로 둔다. 피규어는 앱 캐릭터와
 * 별개의 세트라, 한 화면에 섞어 두면 어느 쪽을 보고 있는지부터 헷갈린다.
 *
 * 조명과 그림자 받이는 앱 캐릭터의 것(`pet/scene.ts`)을 그대로 쓴다 — 같은 빛 아래서
 * 봐야 두 세트의 질감을 견줄 수 있다. 다만 그 그림자 카메라는 한 마리용(±3)이라
 * 다섯을 세우면 양끝 그림자가 잘리므로 여기서 범위만 넓힌다.
 *
 * 캡처 스크립트(`scripts/preview-figures.js`)가 `window.__figures` 로 동작을 걸고
 * 방향을 돌린다.
 */

import * as THREE from 'three'
import { addLighting, createShadowCatcher } from '../pet/scene'
import { FIGURES } from '../figures/specs'
import { createFigure, disposeFigure, scaleFigureToStandardHeight } from '../figures/figure'
import { createFigureAnimator } from '../figures/motions'
import type { FigureMotion } from '../figures/motions'

declare global {
  interface Window {
    __figures: {
      play: (motion: FigureMotion, stagger?: number) => void
      setYaw: (yaw: number) => void
    }
  }
}

const SPACING = 2.35
/** 앱 캐릭터 창과 같은 각도로 살짝 비스듬히 세운다 */
const FRONT_YAW = -0.2

export interface FigureStage {
  /** 다섯이 시간차로 동작한다. 한 화면에 여러 단계가 보인다 */
  play: (motion: FigureMotion, stagger?: number) => void
  /** 한 마리만 */
  playOne: (index: number, motion: FigureMotion) => void
  /** 정면(0)·왼쪽 옆모습(-π/2) 같은 고정 방향 */
  setYaw: (yaw: number) => void
  toggleSpin: () => boolean
  dispose: () => void
}

export function startFigureStage({
  canvas,
  labels,
  onPick,
}: {
  canvas: HTMLCanvasElement
  labels: HTMLElement
  /** 캔버스에서 캐릭터 하나를 눌렀을 때. 몇 번째인지 준다 */
  onPick: (index: number) => void
}): FigureStage {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const lights = addLighting(scene)
  const shadowCamera = lights.key.shadow.camera as THREE.OrthographicCamera
  shadowCamera.left = -7
  shadowCamera.right = 7
  shadowCamera.top = 5
  shadowCamera.bottom = -5
  shadowCamera.updateProjectionMatrix()
  lights.key.shadow.mapSize.set(1024, 1024)
  scene.add(createShadowCatcher(30))

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)

  const figures = FIGURES.map((spec) => createFigure(spec))
  const stands: THREE.Group[] = []
  let yaw = FRONT_YAW
  const animators = figures.map((figure, index) => {
    const stand = new THREE.Group()
    stand.position.x = (index - (FIGURES.length - 1) / 2) * SPACING
    stand.rotation.y = yaw
    stand.scale.setScalar(scaleFigureToStandardHeight(figure))
    stand.add(figure.root)
    scene.add(stand)
    stands.push(stand)
    return createFigureAnimator(figure)
  })

  labels.innerHTML = FIGURES.map(
    (spec) => `<div><div class="name">${spec.name}</div><div class="cry">${spec.key}</div></div>`,
  ).join('')

  let spinning = false

  function play(motion: FigureMotion, stagger = 110) {
    animators.forEach((animator, index) => {
      setTimeout(() => animator.play(motion), index * stagger)
    })
  }

  function setYaw(next: number) {
    yaw = next
    spinning = false
    stands.forEach((stand) => (stand.rotation.y = yaw))
  }

  window.__figures = { play, setYaw }

  // ── 누른 캐릭터 찾기. 레이캐스트가 맞힌 메시에서 위로 올라가 몇 번째 무대인지 본다 ──
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(stands, true)[0]
    if (!hit) return
    const index = stands.findIndex((stand) => {
      let node: THREE.Object3D | null = hit.object
      while (node && node !== stand) node = node.parent
      return node === stand
    })
    if (index >= 0) onPick(index)
  }
  canvas.addEventListener('pointerdown', pick)

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // 다섯이 가로로 다 들어오도록 카메라를 뒤로 뺀다
    const spanX = SPACING * FIGURES.length
    const halfFovY = THREE.MathUtils.degToRad(camera.fov / 2)
    const distanceForWidth = spanX / 2 / (Math.tan(halfFovY) * camera.aspect)
    camera.position.set(0, 1.75, Math.max(7, distanceForWidth + 1.2))
    camera.lookAt(0, 1.0, 0)
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta()
    const elapsed = clock.getElapsedTime()
    if (spinning) stands.forEach((stand) => (stand.rotation.y = yaw + elapsed * 0.8))
    animators.forEach((animator) => animator.update(delta))
    renderer.render(scene, camera)
  })

  requestAnimationFrame(() => document.body.setAttribute('data-ready', 'true'))

  return {
    play,
    playOne: (index, motion) => animators[index]?.play(motion),
    setYaw,
    toggleSpin: () => {
      spinning = !spinning
      if (!spinning) stands.forEach((stand) => (stand.rotation.y = yaw))
      return spinning
    },
    dispose() {
      renderer.setAnimationLoop(null)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', pick)
      figures.forEach(disposeFigure)
      renderer.dispose()
      renderer.forceContextLoss()
      labels.innerHTML = ''
    },
  }
}
