/**
 * Three.js 무대 구성.
 *
 * 배경은 완전히 투명하고 바닥 그림자만 남는다. 그래서 바탕화면 위에 캐릭터가
 * 실제로 "놓여 있는" 것처럼 보인다.
 */

import * as THREE from 'three'

/** 따뜻한 키 라이트 + 시원한 필 라이트 = 장난감 같은 입체감 */
export function addLighting(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight(0xffffff, 0xcbb9a4, 1.15)
  scene.add(ambient)

  const key = new THREE.DirectionalLight(0xfff4e2, 2.1)
  key.position.set(2.6, 5.4, 4.2)
  key.castShadow = true
  // 창이 260×320 라 1024 는 과하다. 512 로도 흐릿한 바닥 그림자는 똑같이 나오면서
  // 그림자 패스가 4분의 1로 줄어든다 — 늘 켜져 있는 앱이라 이 차이가 크다.
  key.shadow.mapSize.set(512, 512)
  key.shadow.radius = 4
  key.shadow.bias = -0.0015
  const cam = key.shadow.camera as THREE.OrthographicCamera
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

/** 캐릭터 한 마리를 보여주는 무대를 만든다. */
/**
 * 캐릭터 창의 카메라 구도.
 *
 * 세로 화각(`fov`)이 고정이라 **창을 넓혀도 캐릭터는 그대로 있고 양옆 자리만 늘어난다.**
 * 동작이 실루엣 밖으로 나가 잘릴 때 창을 넓히면 되는 이유가 이것이다.
 *
 * 위쪽에 여백을 넉넉히 둔다 — 폴짝 뛸 때 머리가 잘리면 안 되고, 그 위로 말풍선도 떠야 한다.
 *
 * 테스트가 같은 구도로 재어 보므로(`animations.test.ts` 의 "창 안에 들어온다") 여기
 * 값을 바꾸면 그쪽이 함께 움직인다.
 */
export const PET_CAMERA = {
  fov: 26,
  position: [0, 1.85, 7.4] as [number, number, number],
  target: [0, 1.25, 0] as [number, number, number],
  /** 캐릭터를 세워 두는 각도. `createStage` 의 기본값과 같다 */
  yaw: -0.2,
}

export function createStage({
  canvas,
  yaw = PET_CAMERA.yaw,
}: {
  canvas: HTMLCanvasElement
  yaw?: number
}) {
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
  const lights = addLighting(scene)
  scene.add(createShadowCatcher())

  const camera = new THREE.PerspectiveCamera(PET_CAMERA.fov, 1, 0.1, 50)
  camera.position.set(...PET_CAMERA.position)
  camera.lookAt(...PET_CAMERA.target)

  /** 캐릭터가 들어가는 자리. 교체할 때 이 그룹의 자식만 갈아끼운다. */
  const stand = new THREE.Group()
  stand.rotation.y = yaw
  scene.add(stand)

  /** 지금 쓰는 화면 배율 상한. 절전 단계가 바꾼다. */
  let pixelRatioCap = 2

  function resize(cap = pixelRatioCap) {
    pixelRatioCap = cap
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  /**
   * 그림자를 매 프레임 다시 그릴지 정한다.
   *
   * 캐릭터가 가만히 서서 숨만 쉬는 동안 그림자는 사실상 변하지 않는다. 그런데도
   * 매 프레임 그림자 패스를 한 번 더 도는 것은 순전한 낭비다. 끌 때는 마지막
   * 한 장을 최신으로 갱신해 두고 멈춘다.
   */
  function setShadowsLive(live: boolean) {
    if (lights.key.shadow.autoUpdate === live) return
    lights.key.shadow.autoUpdate = live
    if (!live) lights.key.shadow.needsUpdate = true
  }

  function render() {
    renderer.render(scene, camera)
  }

  resize()

  return { renderer, scene, camera, stand, lights, resize, setShadowsLive, render }
}
