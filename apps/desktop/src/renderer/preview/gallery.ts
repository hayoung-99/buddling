/**
 * 나란히 보기 — 캐릭터 5종을 한 줄로 세우고 비율·색·애니메이션을 눈으로 확인한다.
 *
 * 예전 `preview.ts` 가 하던 일이 그대로 여기로 왔다. **캡처 스크립트가 이 화면에
 * 기대고 있다** — `scripts/preview.js --shot --dance` 가 아래 `window.__danceAll()` 을
 * 불러 한 장에 동작의 여러 단계를 담는다. 그래서 편집기를 붙이면서도 이 화면을
 * 없애지 않았다.
 */

import * as THREE from 'three'
import { CHARACTERS } from '@buddling/shared/characters'
import { createCritter, disposeCritter, scaleToStandardHeight } from '../pet/critter'
import { addLighting, createShadowCatcher } from '../pet/scene'
import { createAnimator } from '../pet/animations'

/** 캡처 스크립트가 밖에서 불러 쓴다 (`scripts/preview.js`) */
declare global {
  interface Window {
    __hopAll: (stagger?: number) => void
    __danceAll: (stagger?: number) => void
    __waveAll: (stagger?: number) => void
  }
}

const SPACING = 2.35

export function startGallery({
  canvas,
  labels,
}: {
  canvas: HTMLCanvasElement
  labels: HTMLElement
}): {
  play: (motion: 'hop' | 'dance' | 'wave') => void
  toggleSpin: () => boolean
  dispose: () => void
} {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  addLighting(scene)
  scene.add(createShadowCatcher(30))

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)

  const critters = CHARACTERS.map((spec) => createCritter(spec))
  const stands: THREE.Group[] = []
  const animators = critters.map((critter, index) => {
    const stand = new THREE.Group()
    stand.position.x = (index - (CHARACTERS.length - 1) / 2) * SPACING
    stand.rotation.y = -0.2
    stand.scale.setScalar(scaleToStandardHeight(critter))
    stand.add(critter.root)
    scene.add(stand)
    stands.push(stand)
    return createAnimator(critter)
  })

  // `c.label` 이라고 적혀 있었는데 그런 속성이 없어서 늘 `undefined` 로 찍히고 있었다.
  // 스펙에서 그 자리에 해당하는 것은 캐릭터 키다.
  labels.innerHTML = CHARACTERS.map(
    (c) => `<div><div class="name">${c.name}</div><div class="cry">${c.key} · ${c.cry}</div></div>`,
  ).join('')

  let spinning = false

  /** 5마리를 시간차로 움직이게 한다. 한 장에 동작의 여러 단계를 담아 볼 수 있다. */
  function playAll(motion: 'hop' | 'dance' | 'wave', stagger = 90) {
    animators.forEach((animator, index) => {
      setTimeout(() => animator[motion](), index * stagger)
    })
  }

  window.__hopAll = (stagger) => playAll('hop', stagger)
  window.__danceAll = (stagger) => playAll('dance', stagger)
  window.__waveAll = (stagger) => playAll('wave', stagger)

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // 5마리가 가로로 다 들어오도록 카메라를 뒤로 뺀다
    const spanX = SPACING * CHARACTERS.length
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
    if (spinning) stands.forEach((stand) => (stand.rotation.y = elapsed * 0.8))
    animators.forEach((animator) => animator.update(delta))
    renderer.render(scene, camera)
  })

  // 스크린샷 캡처를 위해 첫 프레임이 그려졌음을 알린다
  requestAnimationFrame(() => document.body.setAttribute('data-ready', 'true'))

  return {
    play: (motion: 'hop' | 'dance' | 'wave') => playAll(motion),
    /** `회전 보기` — 다섯을 천천히 돌려 뒷모습·옆모습까지 본다 */
    toggleSpin: () => {
      spinning = !spinning
      return spinning
    },
    dispose() {
      renderer.setAnimationLoop(null)
      window.removeEventListener('resize', resize)
      critters.forEach(disposeCritter)
      renderer.dispose()
      renderer.forceContextLoss()
      labels.innerHTML = ''
    },
  }
}

export type Gallery = ReturnType<typeof startGallery>
