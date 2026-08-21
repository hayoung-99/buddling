/**
 * 폴짝 뛸 때 땅을 박차며 발밑에서 옆으로 퍼지는 바람 자국 — 만화의 `=3` 이다.
 *
 * 콕(춤)에는 음표가 뜨고 폴짝에는 이것이 뜬다. **신호마다 자기 연출을 갖는 것**이라,
 * 무엇이 왔는지 동작을 끝까지 보지 않아도 눈에 먼저 들어온다.
 *
 * 만드는 방식은 `notes.ts` 와 같다 — 캐릭터가 담긴 그룹에 붙이므로 크기 조절
 * (25~200%)을 그대로 따라가고, 낱개마다 재질을 떼어 내 따로 흐려지게 하며, 수명이
 * 끝나면 되돌려 준다.
 */

import * as THREE from 'three'

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial

/** 바탕색과 어우러지는 옅은 크림빛. 먼지라기보다 밀려난 공기에 가깝게. */
const PUFF_COLOR = 0xe4d8c2

/** 자국 하나가 살아 있는 시간(초). 박차는 순간의 것이라 짧고 빨라야 한다. */
const LIFE = 0.4

/**
 * 한쪽 발에서 나가는 줄기 수와 각각의 시작 높이.
 *
 * **두 줄이 위아래로 갈라져 있어야 `=` 로 읽힌다.** 처음에 같은 높이에서 출발하게
 * 두었더니 겹쳐 보여서 한 덩어리가 됐다. 나가면서 벌어지기 전에 이미 갈라져 있어야 한다.
 */
const STREAK_HEIGHTS = [0.02, 0.085]

/** 시작 거리와 나가는 거리 (캐릭터 키 기준 비율) */
const FOOT_X = 0.13
const TRAVEL = 0.44

interface Streak {
  object: THREE.Mesh
  side: number
  /** 이 줄기가 나가는 거리와 출발 높이 */
  reach: number
  base: number
  /** 나가면서 떠오르는 정도 */
  lift: number
  age: number
  strength: number
}

/**
 * @param parent 캐릭터가 담긴 그룹
 * @param unit 캐릭터 키 (월드 단위)
 */
export function createPuff(parent: THREE.Object3D, unit = 2) {
  // 눕혀 놓은 가느다란 캡슐 하나를 본으로 두고 복제해 쓴다
  const template = new THREE.Mesh(
    // 가늘고 짧게. 두꺼우면 바람이 아니라 판자로 보인다.
    new THREE.CapsuleGeometry(unit * 0.013, unit * 0.12, 3, 8),
    new THREE.MeshStandardMaterial({
      color: PUFF_COLOR,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 1,
    }),
  )
  template.rotation.z = Math.PI / 2 // 옆으로 눕힌다

  const live: Streak[] = []

  /**
   * 양쪽 발밑에서 한 번 터뜨린다.
   *
   * @param strength 0~1. 세게 박찰수록 멀리 길게 나간다. 폴짝은 뒤로 갈수록 낮게
   *   뛰므로 이 값이 저절로 작아지고, 자국도 함께 옅어진다.
   */
  function burst(strength = 1) {
    const amount = Math.min(1, Math.max(0.25, strength))

    for (const side of [-1, 1]) {
      for (const [index, height] of STREAK_HEIGHTS.entries()) {
        const object = template.clone()
        // clone 은 재질을 공유하므로, 개별로 흐려지게 하려면 따로 떼어 준다
        object.material = materialOf(template).clone()
        object.visible = false
        parent.add(object)

        live.push({
          object,
          side,
          // 위쪽 줄기가 조금 덜 나가야 부채꼴로 벌어진다
          reach: (1 - index * 0.22) * (0.9 + Math.random() * 0.2),
          base: height,
          lift: 0.5 + index * 0.7,
          age: -index * 0.025,
          strength: amount,
        })
      }
    }
  }

  function release(entry: Streak) {
    entry.object.removeFromParent()
    materialOf(entry.object).dispose()
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
        entry.side * (unit * FOOT_X + distance),
        unit * entry.base + distance * entry.lift * 0.3,
        unit * 0.12,
      )

      // 나가면서 길게 늘어나고 가늘어진다 — 속도가 보이게 하는 장치다
      entry.object.scale.set(1 - t * 0.6, 1 + t * 2.6 * entry.strength, 1 - t * 0.6)
      // 바깥쪽으로 살짝 휘어 오른다
      entry.object.rotation.z = Math.PI / 2 - entry.side * t * 0.5 * entry.lift

      // 끝에서만 흐려진다. 처음부터 옅으면 박찬 순간이 눈에 안 들어온다.
      const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55
      materialOf(entry.object).opacity = fade * 0.9 * entry.strength
    }
  }

  function dispose() {
    for (const entry of live) release(entry)
    live.length = 0
    template.geometry.dispose()
    materialOf(template).dispose()
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
