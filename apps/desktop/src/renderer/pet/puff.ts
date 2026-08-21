/**
 * 폴짝 뛸 때 땅을 박차며 발밑에서 피어나는 먼지 구름 — 만화의 `=3` 이다.
 *
 * 콕(춤)에는 음표가 뜨고 폴짝에는 이것이 뜬다. **신호마다 자기 연출을 갖는 것**이라,
 * 무엇이 왔는지 동작을 끝까지 보지 않아도 눈에 먼저 들어온다.
 *
 * 처음에는 만화의 속도선처럼 가느다란 줄기로 만들었는데, 이 캐릭터들이 구와 캡슐로만
 * 이루어진 동글동글한 몸이라 **선이 혼자 날카로워 겉돌았다.** 그래서 작은 구 여럿을
 * 겹친 구름 덩어리로 바꿨다 — 같은 손으로 만든 것처럼 보인다.
 *
 * 만드는 방식은 `notes.ts` 와 같다. 캐릭터가 담긴 그룹에 붙이므로 크기 조절
 * (25~200%)을 그대로 따라가고, 낱개마다 재질을 떼어 내 따로 흐려지게 하며, 수명이
 * 끝나면 되돌려 준다.
 */

import * as THREE from 'three'

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial

/**
 * 먼지의 잿빛.
 *
 * 캐릭터도 바탕도 따뜻한 크림색이라, 같은 계열로 두면 무엇이 피어났는지 안 읽힌다.
 * 채도를 뺀 회색이어야 발밑에서 확실히 도드라진다.
 */
const PUFF_COLOR = 0xa9a49c

/** 구름 하나가 살아 있는 시간(초). 박차는 순간의 것이라 짧고 빨라야 한다. */
const LIFE = 0.46

/**
 * 한쪽 발에서 피어나는 구름의 시작 자리 [바깥으로, 위로] (캐릭터 키 기준 비율).
 *
 * **두 덩이가 겹치지 않게 갈라 놓는다.** 같은 자리에서 띄웠더니 하나로 보여서
 * 뭉게뭉게한 맛이 없었다.
 */
const CLOUD_SPOTS: [number, number][] = [
  [0.11, 0.03],
  [0.24, 0.1],
]

/** 나가는 거리 (캐릭터 키 기준 비율) */
const TRAVEL = 0.28

/** 다 자란 구름 한 덩이의 크기 (캐릭터 키 기준 비율) */
const CLOUD_SIZE = 0.12

interface Cloud {
  object: THREE.Object3D
  side: number
  from: THREE.Vector3
  /** 이 덩이가 나가는 거리와 떠오르는 정도 */
  reach: number
  lift: number
  spin: number
  /** 다 자랐을 때의 크기 */
  size: number
  age: number
  strength: number
}

/**
 * 작은 구 몇 개를 겹쳐 놓은 구름 한 덩이.
 *
 * 크기와 자리를 조금씩 어긋나게 두어야 매끈한 공이 아니라 뭉친 덩어리로 보인다.
 */
function buildCloud(size: number) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: PUFF_COLOR,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 1,
  })

  /**
   * x, y, z, 반지름 배율.
   *
   * **덩이끼리 넉넉히 겹쳐야 한 구름으로 보인다.** 처음에는 서로 닿을락 말락 하게
   * 띄워 두었더니 자갈 몇 개를 늘어놓은 것처럼 보였다.
   */
  const lobes: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [-0.44, 0.14, 0.05, 0.82],
    [0.43, 0.08, -0.04, 0.78],
    [-0.06, 0.42, -0.02, 0.72],
    [0.24, -0.26, 0.06, 0.62],
  ]

  for (const [x, y, z, scale] of lobes) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(size * scale, 10, 8), material)
    lobe.position.set(size * x, size * y, size * z)
    group.add(lobe)
  }

  return group
}

/**
 * @param parent 캐릭터가 담긴 그룹
 * @param unit 캐릭터 키 (월드 단위)
 */
export function createPuff(parent: THREE.Object3D, unit = 2) {
  const template = buildCloud(unit * CLOUD_SIZE)
  const live: Cloud[] = []

  /**
   * 양쪽 발밑에서 한 번 피어오른다.
   *
   * @param strength 0~1. 세게 박찰수록 크고 멀리 퍼진다. 폴짝은 뒤로 갈수록 낮게
   *   뛰므로 이 값이 저절로 작아지고, 먼지도 함께 옅어진다.
   */
  function burst(strength = 1) {
    const amount = Math.min(1, Math.max(0.3, strength))

    for (const side of [-1, 1]) {
      for (const [index, [outward, up]] of CLOUD_SPOTS.entries()) {
        const object = template.clone(true)
        // clone 은 재질을 공유하므로, 개별로 흐려지게 하려면 따로 떼어 준다
        object.traverse((child) => {
          if (isMesh(child)) child.material = materialOf(child).clone()
        })
        object.visible = false
        parent.add(object)

        live.push({
          object,
          side,
          from: new THREE.Vector3(side * unit * outward, unit * up, unit * 0.1),
          reach: (1 - index * 0.3) * (0.85 + Math.random() * 0.3),
          lift: 0.3 + index * 0.45 + Math.random() * 0.2,
          spin: (Math.random() - 0.5) * 1.6,
          // 바깥쪽 덩이가 조금 작아야 안쪽에서 밀려 나온 것처럼 보인다
          size: (1 - index * 0.22) * (0.85 + Math.random() * 0.3),
          age: -index * 0.035,
          strength: amount,
        })
      }
    }
  }

  function release(entry: Cloud) {
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

      // 밖으로 밀려 나가며 살짝 떠오른다. 처음이 빠르고 끝에서 느려진다.
      const eased = 1 - (1 - t) ** 2
      const distance = unit * TRAVEL * entry.reach * entry.strength * eased
      entry.object.position.set(
        entry.from.x + entry.side * distance,
        entry.from.y + distance * entry.lift,
        entry.from.z,
      )

      // 톡 터지듯 부풀었다가 끝에서 조금 사그라든다. 처음부터 어느 정도 커야
      // 박찬 순간이 보인다 — 0에서 자라게 두면 가장 볼 때 아직 점이다.
      const swell = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) * 0.2
      entry.object.scale.setScalar(entry.size * entry.strength * (0.62 + swell * 0.55))
      entry.object.rotation.z = entry.spin * t

      /*
       * **거의 불투명하게 두고 끝에서만 걷는다.**
       *
       * 옅게 두었더니 겹쳐 놓은 구가 서로 비쳐, 뭉게구름이 아니라 유리구슬 몇 개로
       * 보였다. 불투명하면 앞 덩이가 뒤 덩이를 가려 실루엣 하나로 합쳐진다.
       */
      const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45
      const opacity = fade * entry.strength
      entry.object.traverse((child) => {
        if (isMesh(child)) materialOf(child).opacity = opacity
      })
    }
  }

  function dispose() {
    for (const entry of live) release(entry)
    live.length = 0
    template.traverse((child) => {
      if (isMesh(child)) {
        child.geometry.dispose()
        materialOf(child).dispose()
      }
    })
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
