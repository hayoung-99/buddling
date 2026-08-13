/**
 * 캐릭터 선택용 썸네일.
 *
 * 5개의 WebGL 캔버스를 동시에 띄우면 무겁기 때문에, 렌더러 하나로 5종을
 * 차례대로 그려 PNG 데이터 URL로 뽑아 쓴다. 캐릭터 창은 그 이미지를 보여줄 뿐이다.
 */

import * as THREE from 'three'
import { CHARACTERS } from '../../shared/characters.js'
import { createCritter, disposeCritter, scaleToStandardHeight } from '../pet/critter.js'
import { addLighting } from '../pet/scene.js'

/**
 * @returns {Map<string, string>} 캐릭터 키 → PNG data URL
 */
export function renderCharacterThumbnails({ width = 132, height = 148 } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(2)
  renderer.setSize(width, height, false)

  const scene = new THREE.Scene()
  addLighting(scene)

  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 40)
  camera.position.set(0, 1.5, 6.6)
  camera.lookAt(0, 0.95, 0)

  const stand = new THREE.Group()
  stand.rotation.y = -0.3
  scene.add(stand)

  const thumbnails = new Map()

  for (const spec of CHARACTERS) {
    const critter = createCritter(spec)
    stand.scale.setScalar(scaleToStandardHeight(critter))
    stand.add(critter.root)
    renderer.render(scene, camera)
    thumbnails.set(spec.key, renderer.domElement.toDataURL('image/png'))
    disposeCritter(critter)
  }

  renderer.dispose()
  renderer.forceContextLoss()
  return thumbnails
}
