/**
 * 앱 아이콘 한 장을 그리는 화면. `scripts/make-app-icon.js` 가 이걸 띄워 캡처한다.
 * 앱 동작과는 무관하다 — 배포본에는 들어가지 않는다(package.json 의 files 참고).
 *
 *   ?platform=mac   1024 캔버스 안에 824 판 (애플 아이콘 규격의 여백)
 *   ?platform=win   판이 캔버스를 꽉 채운다
 *
 * 캐릭터를 새로 모델링하지 않는다. 앱에서 쓰는 `createCritter()` 를 그대로 불러
 * 샤이 캣의 얼굴을 클로즈업한다. 캐릭터 스펙이 바뀌면 아이콘도 같이 바뀐다.
 */

import * as THREE from 'three'
import { getCharacter } from '@buddling/shared/characters'
import { createCritter, scaleToStandardHeight } from '../pet/critter'
import { addLighting } from '../pet/scene'

const CANVAS = 1024

const params = new URLSearchParams(location.search)
const platform = params.get('platform') === 'win' ? 'win' : 'mac'

/**
 * 판의 크기와 모서리.
 *
 * macOS 는 아이콘을 알아서 둥글게 깎아 주지 않는다 — 우리가 직접 그려야 하고,
 * 도크에서 다른 아이콘과 크기가 맞으려면 1024 안에 824 로 그려야 한다.
 * Windows 는 여백 규격이 없어 꽉 채우는 편이 작은 크기에서 또렷하다.
 */
const PLATE = {
  mac: { size: 824, exponent: 5 }, // 애플의 연속 곡률에 가까운 초타원
  win: { size: 1024, exponent: 4.6 },
}[platform]

const plateFraction = PLATE.size / CANVAS

// ── 판 그리기 ──────────────────────────────────────────────

/**
 * 초타원(superellipse) 경로. |x|^n + |y|^n = 1.
 * n=4 는 모서리가 둥근 사각형, n 이 커질수록 사각형에 가까워진다.
 */
function squirclePath(size: number, exponent: number, offset: number) {
  const radius = size / 2
  const STEPS = 360
  const points: string[] = []

  for (let index = 0; index <= STEPS; index += 1) {
    const theta = (index / STEPS) * Math.PI * 2
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const x = Math.sign(cos) * Math.abs(cos) ** (2 / exponent) * radius + radius + offset
    const y = Math.sign(sin) * Math.abs(sin) ** (2 / exponent) * radius + radius + offset
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }

  return `M${points.join('L')}Z`
}

const plate = document.getElementById('plate')
const offset = (CANVAS - PLATE.size) / 2
const path = squirclePath(PLATE.size, PLATE.exponent, offset)

/*
 * 판 색은 진하게 간다. 캐릭터가 거의 흰색이라, 배경이 옅으면 16px 파비콘에서
 * 형태가 뭉개진다. 따뜻한 살구 → 코럴 → 분홍으로 떨어뜨려 대비를 만든다.
 */
;(plate as HTMLElement).innerHTML = `
  <defs>
    <linearGradient id="warm" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0%" stop-color="#ffcf8f" />
      <stop offset="46%" stop-color="#ff9f8c" />
      <stop offset="100%" stop-color="#f9749d" />
    </linearGradient>
    <radialGradient id="glow" cx="0.36" cy="0.1" r="0.5">
      <stop offset="0%" stop-color="#fff3d8" stop-opacity="0.34" />
      <stop offset="100%" stop-color="#fff3d8" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="footShadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#8c3557" stop-opacity="0.34" />
      <stop offset="100%" stop-color="#8c3557" stop-opacity="0" />
    </radialGradient>
    <clipPath id="plateClip"><path d="${path}" /></clipPath>
  </defs>

  <path d="${path}" fill="url(#warm)" />
  <path d="${path}" fill="url(#glow)" />

  <!-- 캐릭터가 판 위에 놓여 있는 느낌을 주는 바닥 그늘 -->
  <g clip-path="url(#plateClip)">
    <ellipse
      cx="${CANVAS / 2}"
      cy="${offset + PLATE.size * 0.9}"
      rx="${PLATE.size * 0.34}"
      ry="${PLATE.size * 0.1}"
      fill="url(#footShadow)"
    />
  </g>

  <!-- 안쪽 테두리 한 줄: 판이 살짝 볼록해 보이게 한다 -->
  <path
    d="${path}"
    fill="none"
    stroke="#ffffff"
    stroke-opacity="0.45"
    stroke-width="5"
    clip-path="url(#plateClip)"
  />
`

// ── 캐릭터 ────────────────────────────────────────────────

const canvas = document.getElementById('stage') as HTMLCanvasElement

// 판이 곧 아이콘의 실루엣이다. 캐릭터가 판 밖으로 삐져나오면 안 되므로
// 3D 를 그리는 캔버스를 판과 똑같은 모양으로 잘라낸다.
canvas.style.clipPath = `path('${path}')`

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
renderer.setClearColor(0x000000, 0)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(CANVAS, CANVAS, false)

const scene = new THREE.Scene()
addLighting(scene)

const critter = createCritter(getCharacter('cat'))
const stand = new THREE.Group()
stand.scale.setScalar(scaleToStandardHeight(critter))
stand.rotation.y = -0.26 // 몸은 살짝 돌아서고
stand.add(critter.root)
scene.add(stand)

critter.parts.head.rotation.y = 0.19 // 얼굴은 보는 사람 쪽으로
critter.parts.head.rotation.z = 0.05 // 고개를 조금 갸웃

scene.updateMatrixWorld(true)

// ── 얼굴이 판을 채우도록 카메라를 맞춘다 ──────────────────

const FOV = 26
/**
 * 판 높이에서 머리(귀 포함)가 차지할 비율.
 * 가로가 아니라 세로를 기준으로 잡는다 — 귀가 옆으로 벌어진 종이라도
 * 화면에서 보이는 크기가 일정해야 하기 때문이다.
 */
const HEAD_FRACTION = 0.74 * plateFraction

const headBox = new THREE.Box3().setFromObject(critter.parts.head)
const headSize = headBox.getSize(new THREE.Vector3())
const headCenter = headBox.getCenter(new THREE.Vector3())

const visibleHeight = headSize.y / HEAD_FRACTION
const distance = visibleHeight / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))

// 머리 중심보다 아래를 보면 머리가 위로 올라가고 아래에 어깨가 걸린다
const aimY = headCenter.y - headSize.y * 0.22

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60)
camera.position.set(0, aimY, distance)
camera.lookAt(0, aimY, 0)
camera.updateProjectionMatrix()

renderer.render(scene, camera)

// 캡처 쪽에서 "다 그려졌다"를 기다릴 수 있게 알린다
requestAnimationFrame(() => {
  renderer.render(scene, camera)
  requestAnimationFrame(() => document.body.setAttribute('data-ready', 'true'))
})
