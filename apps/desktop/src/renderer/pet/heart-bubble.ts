/**
 * 수줍어할 때 머리 위에 뜨는 **하트가 든 말풍선**.
 *
 * 글자를 띄우는 `bubble.ts` 와는 다른 것이다. 저쪽은 화면 위에 얹은 평면(DOM)이고
 * *내가* 캐릭터를 누를 때 *내* 화면에 뜨는 "콕콕!" 이다. 이것은 **받는 쪽** 연출이라
 * 캐릭터와 **같은 세상에** 있어야 붙어 보인다 — 그래서 3D 이고, 캐릭터와 같은
 * 장난감 질감이며, 캐릭터가 담긴 그룹에 붙어 크기 조절을 그대로 따라간다.
 *
 * **말풍선 안에 무엇을 넣을지 고르는 틀은 만들지 않는다.** 지금 필요한 것은 하트
 * 하나뿐이고, 쓰지도 않을 자리를 미리 파 두면 그게 곧 잘못된 모양으로 굳는다.
 *
 * 나타났다 사라지는 규칙은 `greet.ts`·`puff.ts` 와 같다. 다만 이것은 한 번에 하나만
 * 뜨므로 여럿을 들고 있지 않고 하나를 켰다 껐다 한다.
 */

import * as THREE from 'three'

/** 말풍선 판의 크림색. 캐릭터 뒤에서도 하트가 또렷하게 보이는 바탕이 되어야 한다. */
const PLATE_COLOR = 0xfffaf2
/** 하트의 붉은 분홍. 볼에 번지는 붉음(`critter.ts` 의 `BLUSH_COLOR`)과 같은 계열이다. */
const HEART_COLOR = 0xf4667f

/** 말풍선이 떠 있는 시간(초). 수줍음(1.7초)보다 먼저 사라지지 않아야 한다. */
const LIFE = 1.34
/**
 * 팔이 올라오기 시작한 뒤에 뜬다(초).
 *
 * `SHY_UNIT` 은 0.22초에 팔이 모이기 시작해 0.44초에 배 앞에서 만난다. 그 사이에
 * 떠야 **팔을 모은 것 때문에 말풍선이 생긴 것**으로 읽힌다. 처음부터 띄우면 둘이
 * 따로 노는 두 가지 일이 된다.
 */
const DELAY = 0.3

/**
 * 말풍선이 뜨는 자리 [옆으로, 가운데 높이] (캐릭터 키 기준 비율).
 *
 * **머리 한가운데가 아니라 한쪽으로 비켜 세운다.** 가운데에 두었더니 귀가 긴
 * 저스트 버니에서 두 귀 사이에 끼어, 떠 있는 말풍선이 아니라 귀에 붙은 판으로
 * 보였다. 비켜 세우면 다섯 종 모두 머리 곁에 뜬다. 머리 한쪽이 비고 반대쪽이 차면
 * 창 안이 좌우로 균형을 잡는다 (인사 짝대기와 같은 판단이다).
 */
const SPOT: [number, number] = [-0.32, 1.16]
/** 말풍선 판의 지름 (캐릭터 키 기준 비율) */
const PLATE_SIZE = 0.34

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true

const materialOf = (mesh: THREE.Mesh) => mesh.material as THREE.MeshStandardMaterial

function toy(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
    transparent: true,
    opacity: 1,
  })
}

/**
 * 하트.
 *
 * 공 둘과 뒤집은 고깔로 만들어 봤더니 **깔때기**로 보였다 — 공 사이가 벌어져 위가
 * 뚫리고, 고깔의 둥근 면이 하트의 뾰족한 아래를 뭉갠다. 그래서 윤곽을 곡선으로 그려
 * 얇게 밀어내고 모서리를 둥글린다. 실루엣이 보장되니 작게 있어도 하트로 읽힌다.
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
    depth: 0.3,
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

  return new THREE.Mesh(geometry, toy(HEART_COLOR))
}

/**
 * 둥근 판 하나와 아래로 뻗는 꼬리.
 *
 * 만화식 구름(∘∘∘)이 아니라 판이다 — 280px 짜리 창에서 구름은 덩어리로 뭉개져
 * 무엇인지 알아볼 수 없다.
 */
function buildPlate(size: number) {
  const group = new THREE.Group()
  const mat = toy(PLATE_COLOR)

  const plate = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 22, 16), mat)
  plate.scale.set(1.12, 1, 0.34) // 납작한 알약
  group.add(plate)

  // 꼬리: 판 아래에서 머리 쪽으로 떨어지는 작은 방울
  const tail = new THREE.Mesh(new THREE.SphereGeometry(size * 0.13, 14, 10), mat)
  tail.scale.set(1, 1.1, 0.34)
  // 꼬리는 머리 쪽(안쪽)을 향해 떨어진다
  tail.position.set(size * 0.2, -size * 0.44, 0)
  group.add(tail)

  return group
}

/**
 * @param parent 캐릭터가 담긴 그룹
 * @param unit 캐릭터 키 (월드 단위)
 *
 * **자리를 종마다 따로 재지 않는다.** 다섯 종을 같은 높이로 맞춰 세우기 때문에
 * (`scaleToStandardHeight`) 발바닥이 0, 꼭대기가 `unit` 이다. 그래서 키 기준 비율
 * 하나면 다섯 종에 모두 맞는다.
 */
export function createHeartBubble(parent: THREE.Object3D, unit: number) {
  const size = unit * PLATE_SIZE
  const group = new THREE.Group()
  group.add(buildPlate(size))

  const heart = buildHeart(size * 0.52)
  heart.position.z = size * 0.14
  group.add(heart)

  group.position.set(unit * SPOT[0], unit * SPOT[1], unit * 0.12)
  group.visible = false
  parent.add(group)

  const baseY = group.position.y

  /** 음수인 동안은 아직 나오지 않은 상태. null 이면 떠 있지 않다. */
  let age: number | null = null

  function burst() {
    age = -DELAY
  }

  function update(delta: number) {
    if (age === null) return
    age += delta

    if (age < 0) return
    if (age >= LIFE) {
      age = null
      group.visible = false
      return
    }

    const t = age / LIFE
    group.visible = true

    // 톡 튀어나왔다가 끝에서 흐려진다. 뜨는 동안 아주 조금 오르내려 살아 있게 둔다.
    const pop = t < 0.16 ? t / 0.16 : 1
    const fade = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28
    const overshoot = pop < 1 ? Math.sin(pop * Math.PI) * 0.12 : 0
    group.scale.setScalar(0.35 + pop * 0.65 + overshoot)
    group.position.y = baseY + Math.sin(t * Math.PI * 3) * unit * 0.012

    group.traverse((child) => {
      if (isMesh(child)) materialOf(child).opacity = fade
    })
  }

  function dispose() {
    group.removeFromParent()
    group.traverse((child) => {
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
    /** 말풍선 덩어리. 창에 들어오는지 재는 검사가 쓴다 */
    object: group,
    /** 지금 떠 있는지. 절전 판정이 쓴다 */
    get showing() {
      return age !== null
    },
    /** 말풍선까지 포함한 꼭대기 높이 (월드 단위). 창에 들어오는지 재는 검사가 쓴다 */
    get top() {
      return baseY + size * 0.5
    },
  }
}
