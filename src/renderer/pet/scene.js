/**
 * Three.js 무대 구성.
 *
 * 배경은 완전히 투명하고 바닥 그림자만 남는다. 그래서 바탕화면 위에 캐릭터가
 * 실제로 "놓여 있는" 것처럼 보인다.
 */

import * as THREE from 'three'

/** 따뜻한 키 라이트 + 시원한 필 라이트 = 장난감 같은 입체감 */
export function addLighting(scene) {
  const ambient = new THREE.HemisphereLight(0xffffff, 0xcbb9a4, 1.15)
  scene.add(ambient)

  const key = new THREE.DirectionalLight(0xfff4e2, 2.1)
  key.position.set(2.6, 5.4, 4.2)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.radius = 4
  key.shadow.bias = -0.0015
  const cam = key.shadow.camera
  cam.near = 1
  cam.far = 16
  cam.left = -3
  cam.right = 3
  cam.top = 3
  cam.bottom = -3
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xcfe2ff, 0.55)
  fill.position.set(-3.4, 2.2, -2.6)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0xffffff, 0.45)
  rim.position.set(0, 1.4, -4.5)
  scene.add(rim)

  return { ambient, key, fill, rim }
}

/** 그림자만 받고 자기 자신은 보이지 않는 바닥판 */
export function createShadowCatcher(size = 12) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShadowMaterial({ opacity: 0.24 }),
  )
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  return plane
}

/**
 * 캐릭터 한 마리를 보여주는 무대를 만든다.
 * @param {{ canvas: HTMLCanvasElement, yaw?: number }} options
 */
export function createStage({ canvas, yaw = -0.2 }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  addLighting(scene)
  scene.add(createShadowCatcher())

  // 위쪽에 여백을 넉넉히 둔다 — 폴짝 뛸 때 머리가 잘리면 안 되고,
  // 그 위로 말풍선도 떠야 한다.
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50)
  camera.position.set(0, 1.85, 7.4)
  camera.lookAt(0, 1.25, 0)

  /** 캐릭터가 들어가는 자리. 교체할 때 이 그룹의 자식만 갈아끼운다. */
  const stand = new THREE.Group()
  stand.rotation.y = yaw
  scene.add(stand)

  function resize() {
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function render() {
    renderer.render(scene, camera)
  }

  resize()

  return { renderer, scene, camera, stand, resize, render }
}
