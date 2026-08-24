/**
 * 캐릭터 주위로 두둥실 떠오르는 것들 — **음표와 하트**.
 *
 * 콕(춤)에는 음표가, 하트 신호에는 하트가 뜬다. 떠오르는 방식은 둘이 같아서
 * (아래에서 위로 오르며 좌우로 살랑이다 사라진다) 만드는 틀 하나를 나눠 쓰고
 * **모양만 갈아 끼운다.** 예전에는 이 파일이 음표 전용이었는데, 하트를 더하면서
 * 떠오르는 규칙을 두 벌로 두면 한쪽만 고쳐져 조용히 어긋날 자리가 되어 합쳤다.
 *
 * 캐릭터와 같은 장난감 질감으로 만들고, 캐릭터가 담긴 그룹에 붙이므로 크기 조절
 * (25~200%)을 그대로 따라간다.
 */

import * as THREE from 'three'

/**
 * `traverse` 는 Object3D 를 주는데 재질과 형상은 Mesh 에만 있다.
 * 아래 정리·투명도 조절이 전부 이 좁히기를 거친다.
 */
const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true

/** 이 파일이 만드는 재질은 전부 하나짜리다 (배열이 아니다) */
const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial

const NOTE_COLOR = 0xf0cf58
const BEAM_COLOR = 0xe8c247

/**
 * 하트의 붉은 분홍.
 *
 * 고양이 코(`0xff8fa3`)와 같은 계열이되 한 단계 짙다. 볼과 코가 이미 분홍이라
 * 옅게 두면 얼굴 옆을 지나갈 때 몸에 묻히고, 특히 몸이 분홍인 홉 버니에서 사라진다.
 */
const HEART_COLOR = 0xf4667f

/** 음표 하나가 떠 있는 시간(초) */
const LIFE = 1.6
/** 떠오르는 높이 (캐릭터 키 기준 비율) */
const RISE = 0.55
/** 좌우로 살랑이는 폭 */
const SWAY = 0.08

function material(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    opacity: 1,
  })
}

/** 음표 머리: 살짝 기울어진 납작한 타원 */
function head(size: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size * 0.34, 18, 12), mat)
  mesh.scale.set(1.2, 0.92, 0.7)
  mesh.rotation.z = 0.35
  return mesh
}

function stem(size: number, mat: THREE.Material) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 0.15, size * 0.95, size * 0.15), mat)
  return bar
}

/** 8분음표 하나 (머리 + 기둥 + 꼬리) */
function buildEighth(size: number) {
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
function buildBeamed(size: number) {
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
 * 하트 하나.
 *
 * 처음에는 공 둘과 뒤집은 고깔로 만들어 봤다. 캐릭터가 구와 캡슐로만 이루어져 있으니
 * 같은 재료가 어울릴 줄 알았는데, **깔때기처럼 보였다** — 공 둘 사이가 벌어져 위가
 * 뚫리고, 고깔의 둥근 면이 하트의 뾰족한 아래를 뭉개기 때문이다.
 *
 * 그래서 하트 윤곽을 곡선으로 그려 얇게 밀어낸다. 모서리를 둥글려(`bevel`) 다른
 * 부위와 같은 장난감 질감을 낸다. 실루엣이 보장되므로 작게 떠 있어도 하트로 읽힌다.
 */
function buildHeart(size: number) {
  const shape = new THREE.Shape()
  // 아래 숫자는 가로 2.2 · 세로 1.9 짜리 하트다. 마지막에 크기를 맞춰 줄인다.
  shape.moveTo(0.5, 0.5)
  shape.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0)
  shape.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7)
  shape.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9)
  shape.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7)
  shape.bezierCurveTo(1.6, 0.7, 1.6, 0, 1.0, 0)
  shape.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 3,
    curveSegments: 12,
  })
  geometry.center()
  // 그린 하트는 뾰족한 끝이 위를 보고 있다
  geometry.rotateZ(Math.PI)
  const scale = size / 2.2
  geometry.scale(scale, scale, scale)

  return new THREE.Mesh(geometry, material(HEART_COLOR))
}

/** 떠 있는 것 하나 */
interface Note {
  object: THREE.Object3D
  origin: THREE.Vector3
  /** 음수인 동안은 아직 나오지 않은 상태 */
  age: number
  swayPhase: number
  swayDir: number
  spin: number
  tilt: number
}

/**
 * @param parent 캐릭터가 담긴 그룹
 * @param unit 캐릭터 키 (월드 단위) — 크기·높이를 여기에 맞춘다
 * @param templates 떠오를 모양들. 낱개마다 이 중 하나를 골라 복제한다
 */
function createFloaters(parent: THREE.Object3D, unit: number, templates: THREE.Object3D[]) {
  const live: Note[] = []

  /**
   * 한 마리 주위로 몇 개를 시간차로 띄운다.
   *
   * `out` 은 몸통 중심에서 얼마나 비켜서 뜨는지다. **속이 찬 하트는 음표보다 멀리
   * 세운다** — 음표는 가늘어서 얼굴에 겹쳐도 뒤가 비치지만, 하트는 눈을 통째로 가린다.
   */
  function burst({ count = 5, spread = 0.55, stagger = 0.18, out = 0.28 } = {}) {
    for (let index = 0; index < count; index += 1) {
      const template = templates[Math.floor(Math.random() * templates.length)]
      const object = template.clone(true)
      // clone 은 재질을 공유하므로, 개별로 흐려지게 하려면 따로 떼어 준다
      object.traverse((child) => {
        if (isMesh(child)) child.material = materialOf(child).clone()
      })

      const side = Math.random() < 0.5 ? -1 : 1
      const origin = new THREE.Vector3(
        // 몸통 옆으로 확실히 비켜서 떠오른다
        side * unit * (out + Math.random() * spread * 0.45),
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

  function release(entry: Note) {
    entry.object.removeFromParent()
    entry.object.traverse((child) => {
      if (isMesh(child)) materialOf(child).dispose()
    })
  }

  function update(delta: number) {
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
        if (isMesh(child)) materialOf(child).opacity = fade
      })
    }
  }

  function dispose() {
    for (const entry of live) release(entry)
    live.length = 0
    for (const template of templates) {
      template.traverse((child) => {
        if (isMesh(child)) {
          child.geometry.dispose()
          materialOf(child).dispose()
        }
      })
    }
  }

  return {
    burst,
    update,
    dispose,
    get count() {
      return live.length
    },
  }
}

/** 콕 찔렸을 때 춤과 함께 뜨는 음표 */
export function createNotes(parent: THREE.Object3D, unit = 2) {
  return createFloaters(parent, unit, [buildEighth(unit * 0.21), buildBeamed(unit * 0.21)])
}

/** 하트 신호를 받았을 때 뜨는 하트 */
export function createHearts(parent: THREE.Object3D, unit = 2) {
  return createFloaters(parent, unit, [buildHeart(unit * 0.17)])
}
