/**
 * 손을 흔들 때 **반대쪽 얼굴 옆**에서 튀어나오는 노란 짝대기 셋 — 만화의 인사 표시다.
 *
 * 콕에는 음표(`notes.ts`), 폴짝에는 발밑 먼지(`puff.ts`)가 뜨고 손 흔들기에는 이것이
 * 뜬다. **신호마다 자기 연출을 갖는 것**이라, 무엇이 왔는지 동작을 끝까지 보지 않아도
 * 눈에 먼저 들어온다.
 *
 * **팔을 든 쪽의 반대편에 둔다.** 흔드는 팔 옆에 겹쳐 놓으면 팔이 지나가며 짝대기를
 * 가려 둘 다 안 읽힌다. 반대편에 두면 얼굴을 사이에 두고 팔과 짝대기가 마주 보게 되어
 * 창 안이 좌우로 균형을 잡는다.
 *
 * 짝대기는 **끝이 둥근 캡슐**이다. 먼지를 만들 때 만화 속도선처럼 날카로운 줄기를
 * 써 봤다가 동글동글한 몸에서 혼자 겉돌아 접었는데(`puff.ts` 참고), 캡슐은 이
 * 캐릭터들의 팔·다리를 만드는 바로 그 형상이라 같은 손으로 만든 것으로 보인다.
 *
 * 만드는 방식은 `notes.ts` 와 같다. 캐릭터가 담긴 그룹에 붙으므로 크기 조절
 * (25~200%)을 그대로 따라가고, 낱개마다 재질을 떼어 내며, 수명이 끝나면 되돌려 준다.
 */

import * as THREE from 'three'

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial

/**
 * 음표와 같은 계열의 노랑.
 *
 * 음표(`0xf0cf58`)보다 한 톤 밝게 둔다. 짝대기는 음표와 달리 가늘어서 같은 색을
 * 주면 빛을 받는 면이 좁아 칙칙하게 가라앉는다.
 */
const GREET_COLOR = 0xffd75e

/** 짝대기 하나가 살아 있는 시간(초) */
const LIFE = 0.86

/**
 * 팔이 올라간 뒤에야 나온다(초).
 *
 * `WAVE_UNIT` 은 0.28초에 손이 머리 위로 올라오고 그다음부터 흔든다. 처음부터 띄우면
 * 팔이 아직 몸통 옆에 있는데 옆에서 인사 표시만 먼저 터진다.
 */
const DELAY = 0.24

/** 짝대기 셋이 모여 있는 자리 [옆으로, 위로] (캐릭터 키 기준 비율) */
const FAN_ORIGIN: [number, number] = [0.42, 0.76]

/**
 * 짝대기 셋 [기울기(라디안), 길이, 위아래 자리] — 길이와 자리는 키 기준 비율.
 *
 * **한 점에서 퍼져 나오게 두지 않는다.** 처음에는 부챗살처럼 안쪽 끝을 한 점에 모았는데
 * 쐐기(▷) 하나로 뭉쳐 보였다. 셋을 나란히 세워 놓고 위아래만 반대로 기울이면 인사할
 * 때의 그 표시로 읽힌다.
 *
 * 가운데가 가장 짧다. 셋 다 같은 길이로 두면 그냥 빗금 세 개다.
 */
const STROKES: [number, number, number][] = [
  [-0.38, 0.17, 0.115],
  [0, 0.135, 0.015],
  [0.3, 0.15, -0.09],
]

/** 짝대기 굵기 (캐릭터 키 기준 비율) */
const THICKNESS = 0.014

/** 흔들 때마다 바깥으로 밀려 나가는 폭 (캐릭터 키 기준 비율) */
const PUSH = 0.035

interface Stroke {
  object: THREE.Object3D
  /** -1 이면 왼쪽. 부채를 통째로 뒤집는 데에도 쓴다 */
  side: number
  age: number
}

/**
 * 짝대기 하나. 캡슐을 눕혀 제 가운데를 축으로 기울이고, 셋이 공유하는 자리에서
 * 위아래로만 어긋나게 놓는다. 밀어내는 연출은 그룹의 x 만 만지면 된다.
 */
function buildStroke(unit: number, tilt: number, length: number, drop: number) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: GREET_COLOR,
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    opacity: 1,
  })

  const bar = new THREE.Mesh(
    new THREE.CapsuleGeometry(unit * THICKNESS, unit * length, 4, 10),
    material,
  )
  // 캡슐은 세로로 서 있는 것이 기본이라 눕힌 뒤 제자리에서 기울인다
  bar.rotation.z = Math.PI / 2 + tilt
  bar.position.y = unit * drop
  // 캐릭터보다 앞에 세워 머리에 묻히지 않게 한다
  bar.position.z = unit * 0.18
  group.add(bar)

  return group
}

/**
 * @param parent 캐릭터가 담긴 그룹
 * @param unit 캐릭터 키 (월드 단위)
 */
export function createGreet(parent: THREE.Object3D, unit = 2) {
  const templates = STROKES.map(([tilt, length, drop]) => buildStroke(unit, tilt, length, drop))
  const live: Stroke[] = []

  /**
   * 얼굴 옆에서 셋이 차례로 튀어나온다.
   *
   * @param side -1 이면 왼쪽. 손 흔드는 팔이 오른쪽(`armL`)이라 기본이 왼쪽이다.
   */
  function burst(side = -1) {
    for (const [index, template] of templates.entries()) {
      const object = template.clone(true)
      // clone 은 재질을 공유하므로, 개별로 흐려지게 하려면 따로 떼어 준다
      object.traverse((child) => {
        if (isMesh(child)) child.material = materialOf(child).clone()
      })

      object.position.set(side * unit * FAN_ORIGIN[0], unit * FAN_ORIGIN[1], 0)
      object.visible = false
      parent.add(object)

      live.push({ object, side, age: -DELAY - index * 0.04 })
    }
  }

  function release(entry: Stroke) {
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

      // 손을 흔드는 박자에 맞춰 두 번 바깥으로 밀려 나갔다 돌아온다
      const push = Math.max(0, Math.sin(t * Math.PI * 4)) * unit * PUSH
      entry.object.position.x = entry.side * (unit * FAN_ORIGIN[0] + push)

      // 톡 튀어나왔다가 끝에서 흐려진다. 짧게 머무는 것이라 자라는 구간도 짧다.
      const pop = t < 0.12 ? t / 0.12 : 1
      const fade = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38
      const grown = 0.55 + pop * 0.45
      /*
       * 짝대기는 **왼쪽(-x)으로 뻗도록** 만들어 두었다. 그러니 왼쪽에 놓을 때는 그대로
       * 두고, 오른쪽에 놓을 때만 x 를 뒤집는다. 부호를 그대로 곱했더니 왼쪽에서 부채가
       * 뒤집혀 얼굴 쪽으로 뻗었고, 머리에 파묻혀 끝만 점처럼 보였다.
       */
      entry.object.scale.set(-entry.side * grown, grown, grown)

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
