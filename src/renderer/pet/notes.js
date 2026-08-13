/**
 * 춤출 때 캐릭터 주위로 두둥실 떠오르는 3D 음표.
 *
 * 캐릭터와 같은 장난감 질감(부드러운 노란 재질)으로 만들고,
 * 아래에서 위로 떠오르며 좌우로 살랑이다가 서서히 사라진다.
 *
 * 캐릭터가 담긴 그룹에 붙이므로 크기 조절(50~200%)을 그대로 따라간다.
 */

import * as THREE from 'three'

const NOTE_COLOR = 0xf0cf58
const BEAM_COLOR = 0xe8c247

/** 음표 하나가 떠 있는 시간(초) */
const LIFE = 1.6
/** 떠오르는 높이 (캐릭터 키 기준 비율) */
const RISE = 0.55
/** 좌우로 살랑이는 폭 */
const SWAY = 0.08

function material(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    opacity: 1,
  })
}

/** 음표 머리: 살짝 기울어진 납작한 타원 */
function head(size, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size * 0.34, 18, 12), mat)
  mesh.scale.set(1.2, 0.92, 0.7)
  mesh.rotation.z = 0.35
  return mesh
}

function stem(size, mat) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 0.15, size * 0.95, size * 0.15), mat)
  return bar
}

/** 8분음표 하나 (머리 + 기둥 + 꼬리) */
function buildEighth(size) {
  const group = new THREE.Group()
  const mat = material(NOTE_COLOR)

  const noteHead = head(size, mat)
  noteHead.position.set(-size * 0.24, -size * 0.42, 0)
  group.add(noteHead)

  const bar = stem(size, mat)
  bar.position.set(size * 0.05, 0.0, 0)
  group.add(bar)

  // 꼬리: 기둥 끝에서 아래로 흘러내리는 깃발
  const flag = new THREE.Mesh(new THREE.CapsuleGeometry(size * 0.1, size * 0.32, 4, 10), mat)
  flag.scale.set(1, 1, 0.5)
  flag.position.set(size * 0.2, size * 0.28, 0)
  flag.rotation.z = -0.55
  group.add(flag)

  return group
}

/** 이어진 8분음표 둘 (머리 둘 + 기둥 둘 + 잇는 대들보) */
function buildBeamed(size) {
  const group = new THREE.Group()
  const mat = material(NOTE_COLOR)
  const beamMat = material(BEAM_COLOR)

  for (const side of [-1, 1]) {
    const noteHead = head(size, mat)
    noteHead.position.set(side * size * 0.34 - size * 0.24, -size * 0.42, 0)
    group.add(noteHead)

    const bar = stem(size, mat)
    bar.position.set(side * size * 0.34 + size * 0.05, 0, 0)
    group.add(bar)
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(size * 0.86, size * 0.24, size * 0.15), beamMat)
  beam.position.set(size * 0.05, size * 0.4, 0)
  group.add(beam)

  return group
}

/**
 * @param {THREE.Object3D} parent 캐릭터가 담긴 그룹
 * @param {number} unit 캐릭터 키 (월드 단위) — 음표 크기·높이를 여기에 맞춘다
 */
export function createNotes(parent, unit = 2) {
  const templates = [buildEighth(unit * 0.21), buildBeamed(unit * 0.21)]
  const live = []

  /** 한 마리 주위로 음표 몇 개를 시간차로 띄운다 */
  function burst({ count = 5, spread = 0.55, stagger = 0.18 } = {}) {
    for (let index = 0; index < count; index += 1) {
      const template = templates[Math.floor(Math.random() * templates.length)]
      const object = template.clone(true)
      // clone 은 재질을 공유하므로, 개별로 흐려지게 하려면 따로 떼어 준다
      object.traverse((child) => {
        if (child.isMesh) child.material = child.material.clone()
      })

      const side = Math.random() < 0.5 ? -1 : 1
      const origin = new THREE.Vector3(
        // 몸통 옆으로 확실히 비켜서 떠오른다
        side * unit * (0.28 + Math.random() * spread * 0.45),
        unit * (0.18 + Math.random() * 0.18),
        unit * (0.24 + Math.random() * 0.16),
      )

      object.position.copy(origin)
      object.visible = false
      parent.add(object)

      live.push({
        object,
        origin,
        age: -index * stagger, // 음수인 동안은 아직 나오지 않은 상태
        swayPhase: Math.random() * Math.PI * 2,
        swayDir: side,
        spin: (Math.random() - 0.5) * 1.2,
        tilt: (Math.random() - 0.5) * 0.5,
      })
    }
  }

  function release(entry) {
    entry.object.removeFromParent()
    entry.object.traverse((child) => {
      if (child.isMesh) child.material.dispose()
    })
  }

  function update(delta) {
    for (let index = live.length - 1; index >= 0; index -= 1) {
      const entry = live[index]
      entry.age += delta

      if (entry.age < 0) continue
      if (entry.age >= LIFE) {
        release(entry)
        live.splice(index, 1)
        continue
      }

      const t = entry.age / LIFE
      entry.object.visible = true

      entry.object.position.set(
        entry.origin.x + Math.sin(entry.swayPhase + t * 5) * unit * SWAY * entry.swayDir,
        entry.origin.y + t * unit * RISE,
        entry.origin.z,
      )

      // 나올 때 통 튀어나오고, 끝에서는 작아지며 흐려진다
      const pop = t < 0.16 ? t / 0.16 : 1
      const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45
      entry.object.scale.setScalar(0.6 + pop * 0.4 * (0.7 + fade * 0.3))
      entry.object.rotation.set(0, entry.spin * t, entry.tilt + Math.sin(t * 4) * 0.12)

      entry.object.traverse((child) => {
        if (child.isMesh) child.material.opacity = fade
      })
    }
  }

  function dispose() {
    for (const entry of live) release(entry)
    live.length = 0
    for (const template of templates) {
      template.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose()
          child.material.dispose()
        }
      })
    }
  }

  return { burst, update, dispose, get count() {
    return live.length
  } }
}
