/**
 * 절차적 동물 캐릭터 빌더.
 *
 * `characters.js`의 스펙 하나를 받아 Three.js 그룹을 만든다.
 * 외부 모델 파일 없이 구·캡슐·원뿔만 조합하고, 부드러운 재질과 그림자로
 * 3D 장난감 같은 질감을 낸다.
 *
 * 좌표 규약
 *   - 발바닥이 y = 0 (그래야 squash & stretch가 바닥을 향해 눌린다)
 *   - 캐릭터는 +Z(카메라)를 바라본다
 *   - 움직이는 부위는 모두 자기 회전축 위치에 놓인 Group(피벗)에 담긴다
 */

import * as THREE from 'three'
import { EAR, TAIL, SNOUT, ARM } from '@doran-doran/shared/characters'
import type { CharacterBuild, CharacterSpec, PaletteKey } from '@doran-doran/shared/characters'

const TOY_SURFACE = { roughness: 0.62, metalness: 0.0 }

/** 부위 이름 → 그 부위를 움직이는 피벗. 애니메이션이 이 이름으로 찾아 쓴다. */
export type CritterParts = Record<string, THREE.Object3D>

/** 팔레트 칸마다 하나씩. 캐릭터를 버릴 때 전부 되돌려준다. */
export type CritterMaterials = Record<string, THREE.MeshStandardMaterial>

export interface Critter {
  root: THREE.Group
  parts: CritterParts
  spec: CharacterSpec
  materials: CritterMaterials
  /** 실제로 차지하는 높이(월드 단위). 종마다 다르다. */
  height: number
}

/** `traverse` 는 Object3D 를 주는데 형상은 Mesh 에만 있다 */
const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true

function toyMaterial(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, ...TOY_SURFACE, ...extra })
}

function ball(radius: number, material: THREE.Material, segments = 30) {
  const geometry = new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.7))
  return new THREE.Mesh(geometry, material)
}

function capsule(radius: number, length: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 22), material)
}

function cone(radius: number, height: number, material: THREE.Material, segments = 22) {
  return new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material)
}

function pivot(x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

/** 스펙으로부터 캐릭터를 만든다. */
export function createCritter(spec: CharacterSpec): Critter {
  const { palette, build } = spec
  const parts: CritterParts = {}

  const color = (name: PaletteKey) => palette[name] ?? palette.body
  const materials: CritterMaterials = {
    body: toyMaterial(color('body')),
    belly: toyMaterial(color('belly')),
    accent: toyMaterial(color('accent')),
    snout: toyMaterial(color('snout')),
    nose: toyMaterial(color('nose')),
    eye: toyMaterial(color('eye'), { roughness: 0.25 }),
    cheek: toyMaterial(color('cheek'), { transparent: true, opacity: 0.92 }),
    foot: toyMaterial(color('foot')),
    highlight: toyMaterial(0xffffff, { roughness: 0.15 }),
  }

  const R = build.bodyRadius
  const [sx, sy, sz] = build.bodyShape
  const headR = build.headRadius
  const legLength = build.legLength

  const bodyCenterY = legLength + R * sy
  const headCenterY = bodyCenterY + (R * sy + headR) * build.headLift

  // ── root: 점프(y 이동)와 squash & stretch(scale)가 적용되는 최상위 ──
  const root = new THREE.Group()
  parts.root = root

  // ── body: 몸통 기울임·회전용 피벗. 원점은 몸통 중심 ──
  const body = pivot(0, bodyCenterY, 0)
  root.add(body)
  parts.body = body

  const torso = ball(R, materials.body)
  torso.scale.set(sx, sy, sz)
  body.add(torso)

  // 배: 납작한 무늬를 몸통에 겹치면 교차선이 너덜너덜해 보인다.
  // 대신 앞으로 불룩 나온 진짜 부피로 만들어 "통통함"을 살린다.
  const belly = ball(R * 0.62, materials.belly)
  belly.scale.set(1.02, 0.94, 0.92)
  belly.position.set(0, -R * sy * 0.3, R * sz * 0.46)
  body.add(belly)

  // ── head ──
  const head = pivot(0, headCenterY - bodyCenterY, 0)
  body.add(head)
  parts.head = head
  head.add(ball(headR, materials.body))

  buildSnout(head, parts, materials, headR, build.snout)
  if (build.patches.includes('pandaEyes')) buildPandaEyePatches(head, materials, headR)
  buildEyes(head, parts, materials, headR)
  // 눈 무늬가 있는 종은 볼을 비켜 놓는다 — 아래 buildCheeks 주석 참고
  buildCheeks(head, parts, materials, headR, build.patches.includes('pandaEyes'))
  buildEars(head, parts, materials, headR, build.ears)

  // ── 팔 (실루엣 밖으로 확실히 나오게 어깨를 몸통 옆면에 붙인다) ──
  const armMaterial = build.arms.color ? materials[build.arms.color] : materials.body
  for (const side of [-1, 1]) {
    const arm = pivot(side * R * sx * 0.84, R * sy * 0.14, R * sz * 0.26)
    body.add(arm)
    parts[side < 0 ? 'armR' : 'armL'] = arm

    const size = build.arms.size
    if (build.arms.type === ARM.WING) {
      const wing = ball(size, armMaterial)
      wing.scale.set(0.38, 1.05, 0.78)
      wing.position.set(side * size * 0.1, -size * 0.6, 0)
      wing.rotation.z = -side * 0.16
      arm.add(wing)
    } else {
      const limb = capsule(size * 0.52, size * 0.95, armMaterial)
      limb.position.set(side * size * 0.22, -size * 0.82, 0)
      limb.rotation.z = -side * 0.34
      arm.add(limb)
    }
  }

  // ── 다리 (몸통 아래로 살짝 삐져나온 짧은 발) ──
  const webbed = build.feet === 'webbed'
  const footR = R * 0.28
  const footScaleY = webbed ? 0.3 : 0.56
  const footScaleZ = webbed ? 1.8 : 1.35
  for (const side of [-1, 1]) {
    const leg = pivot(side * R * sx * 0.34, legLength - bodyCenterY, R * sz * 0.32)
    body.add(leg)
    parts[side < 0 ? 'legR' : 'legL'] = leg

    const foot = ball(footR, materials.foot)
    foot.scale.set(1.0, footScaleY, footScaleZ)
    foot.position.y = -legLength + footR * footScaleY
    leg.add(foot)
  }

  // ── 꼬리 (정면 시점에서도 보이도록 옆으로 살짝 빼둔다) ──
  const tail = buildTail(materials, build.tail, R)
  if (tail) {
    const sideways = build.tail.type === TAIL.CURL ? R * sx * 0.55 : 0
    const height = build.tail.type === TAIL.FEATHER ? R * sy * 0.5 : R * sy * 0.02
    tail.position.set(sideways, height, -R * sz * 0.82)
    body.add(tail)
    parts.tail = tail
  }

  root.traverse((object) => {
    if (isMesh(object)) {
      object.castShadow = true
      object.receiveShadow = false
    }
  })

  // 종마다 키가 제각각이다 (토끼는 귀 때문에 오리보다 40% 크다).
  // 화면에서는 다 같은 크기로 보여야 하므로 실제 높이를 재서 알려준다.
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const height = bounds.max.y - bounds.min.y

  return { root, parts, spec, materials, height }
}

/**
 * 어떤 종이든 화면에서 차지할 높이(월드 단위).
 * 뛰어올랐을 때와 그 위 말풍선까지 창 안에 들어오도록 정한 값이다.
 */
export const STANDARD_HEIGHT = 2.0

/**
 * 캐릭터를 담은 그룹에 적용할 배율.
 * root.scale 은 점프의 squash & stretch 가 쓰므로 부모에 걸어야 한다.
 */
export function scaleToStandardHeight(critter: { height: number }): number {
  return STANDARD_HEIGHT / critter.height
}

// ────────────────────────────────────────────────────────────
// 부위별 빌더
// ────────────────────────────────────────────────────────────

function buildSnout(
  head: THREE.Object3D,
  parts: CritterParts,
  materials: CritterMaterials,
  headR: number,
  snout: CharacterBuild['snout'],
) {
  if (snout.type === SNOUT.BEAK) {
    const beak = ball(headR * snout.size, materials.snout)
    beak.scale.set(1.3, 0.44, 1.55)
    beak.position.set(0, -headR * 0.1, headR * 0.72)
    head.add(beak)
    parts.snout = beak

    const lowerBill = ball(headR * snout.size * 0.86, materials.nose)
    lowerBill.scale.set(1.2, 0.2, 1.45)
    lowerBill.position.set(0, -headR * 0.19, headR * 0.7)
    head.add(lowerBill)
    return
  }

  const muzzle = ball(headR * snout.size, materials.snout)
  muzzle.scale.set(1.34, 0.8, 0.7)
  muzzle.position.set(0, -headR * 0.26, headR * 0.72)
  head.add(muzzle)
  parts.snout = muzzle

  const nose = ball(headR * 0.115, materials.nose)
  nose.scale.set(1.4, 0.92, 1.0)
  nose.position.set(0, -headR * 0.17, headR * 0.72 + headR * snout.size * 0.68)
  head.add(nose)
}

function buildEyes(
  head: THREE.Object3D,
  parts: CritterParts,
  materials: CritterMaterials,
  headR: number,
) {
  const eyeR = headR * 0.15
  for (const side of [-1, 1]) {
    const eye = pivot(side * headR * 0.41, headR * 0.08, headR * 0.8)
    head.add(eye)
    parts[side < 0 ? 'eyeR' : 'eyeL'] = eye

    eye.add(ball(eyeR, materials.eye, 20))

    const highlight = ball(eyeR * 0.4, materials.highlight, 14)
    highlight.position.set(-side * eyeR * 0.3, eyeR * 0.36, eyeR * 0.68)
    eye.add(highlight)
  }
}

/**
 * 판다의 눈 둘레 검은 무늬.
 *
 * **얼굴에 납작한 공을 얹으면 안 된다.** 예전에는 그렇게 했는데, 무늬가 머리 구면
 * 안쪽에 파묻혀 가장자리 몇 조각만 삐져나왔다. 화면에서는 무늬가 아니라 눈가에 낀
 * 검은 얼룩처럼 보였다.
 *
 * 그래서 머리보다 아주 조금 큰 구의 **일부만 잘라** 씌운다. 무늬가 구면을 그대로
 * 따라가므로 어느 각도에서 봐도 파묻히지 않고, 가장자리도 얼굴에 딱 붙는다.
 *
 * 타원으로 만드는 것은 잘라낸 조각을 옆으로 눌러서 한다. 반지름을 머리보다 2% 크게
 * 잡아 두어 눌러도 얼굴 밖에 남는다.
 */
function buildPandaEyePatches(
  head: THREE.Object3D,
  materials: CritterMaterials,
  headR: number,
) {
  /**
   * 무늬가 덮는 각도(라디안). 눈보다는 넉넉하고 볼보다는 좁아야 한다 —
   * 더 키우면 볼의 분홍 빗금을 덮어 검은 바탕에 분홍이 떠 있는 꼴이 된다.
   */
  const SPREAD = 0.31

  for (const side of [-1, 1]) {
    // 눈이 있는 쪽을 바라보게 — 눈 피벗과 거의 같은 방향이라 눈이 무늬 가운데 온다
    const toward = new THREE.Vector3(side * 0.41, 0.09, 0.8).normalize()

    const aim = new THREE.Group()
    aim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toward)
    head.add(aim)

    const patch = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.02, 28, 18, 0, Math.PI * 2, 0, SPREAD),
      materials.accent,
    )
    patch.scale.set(0.88, 1, 1.16) // 세로로 조금 길쭉한 타원
    patch.rotation.y = side * 0.55 // 눈꼬리가 바깥으로 살짝 눕는다
    aim.add(patch)
  }
}

/**
 * 볼따구: 타원 하나 대신 '///' 모양 빗금 세 개.
 *
 * 얼굴이 구면이라 그냥 평평하게 붙이면 가장자리가 얼굴 속으로 파묻힌다.
 * 볼 위치를 구 표면에서 잡고, 그 지점의 법선 방향으로 세운 뒤 그 위에 빗금을 얹는다.
 */
function buildCheeks(
  head: THREE.Object3D,
  parts: CritterParts,
  materials: CritterMaterials,
  headR: number,
  makeRoomForPatches = false,
) {
  const STROKES = 3
  const middleIndex = (STROKES - 1) / 2

  // 눈에서 볼까지는 0.33(반지름 단위)뿐인데 눈알이 0.15, 빗금 무리가 0.11 을 쓴다.
  // 그 사이에 검은 무늬가 들어갈 자리가 0.07 밖에 없어서, 무늬를 눈에 맞춰 그리면
  // 빗금 위를 덮어 분홍이 뭉개진다. 그래서 무늬가 있는 종만 볼을 아래·바깥으로
  // 비켜 놓는다 — 무늬를 줄이는 대신 자리를 내주는 쪽이다.
  const spread = makeRoomForPatches ? 0.62 : 0.58
  const drop = makeRoomForPatches ? 0.28 : 0.2

  for (const side of [-1, 1]) {
    const x = side * headR * spread
    const y = -headR * drop
    const z = Math.sqrt(Math.max(headR * headR - x * x - y * y, 0))

    const cheek = new THREE.Group()
    cheek.position.set(x, y, z)
    // 부모에 넣기 전에 방향을 잡아야 head 의 위치가 섞이지 않는다
    cheek.lookAt(x * 2, y * 2, z * 2) // +Z 가 얼굴 바깥(법선)을 향하게
    head.add(cheek)
    parts[side < 0 ? 'cheekR' : 'cheekL'] = cheek

    for (let index = 0; index < STROKES; index += 1) {
      const isMiddle = index === middleIndex
      const stroke = new THREE.Mesh(
        new THREE.CapsuleGeometry(headR * 0.021, headR * (isMiddle ? 0.12 : 0.09), 4, 10),
        materials.cheek,
      )
      stroke.scale.z = 0.5 // 얼굴에 납작하게 눕힌다
      stroke.position.set((index - middleIndex) * headR * 0.085, 0, headR * 0.018)
      stroke.rotation.z = -side * 0.5 // 빗금 기울기
      cheek.add(stroke)
    }
  }
}

function buildEars(
  head: THREE.Object3D,
  parts: CritterParts,
  materials: CritterMaterials,
  headR: number,
  ears: CharacterBuild['ears'],
) {
  if (ears.type === EAR.NONE) return

  const outerMaterial = ears.color ? materials[ears.color] : materials.body
  const size = ears.size

  for (const side of [-1, 1]) {
    const key = side < 0 ? 'earR' : 'earL'

    if (ears.type === EAR.FLOPPY) {
      const ear = pivot(side * headR * ears.spread, headR * 0.3, headR * 0.04)
      head.add(ear)
      parts[key] = ear

      const flap = capsule(size * 0.36, size * 0.78, outerMaterial)
      flap.scale.set(1.0, 1.0, 0.5)
      flap.position.y = -size * 0.54
      flap.rotation.z = side * ears.tilt
      ear.add(flap)
      continue
    }

    const ear = pivot(side * headR * ears.spread, headR * 0.68, headR * 0.02)
    head.add(ear)
    parts[key] = ear

    if (ears.type === EAR.TRIANGLE) {
      const outer = cone(size * 0.52, size * 1.15, outerMaterial)
      outer.scale.z = 0.58
      outer.position.y = size * 0.5
      outer.rotation.z = -side * ears.tilt
      ear.add(outer)

      const inner = cone(size * 0.3, size * 0.74, materials.accent)
      inner.scale.z = 0.42
      inner.position.set(0, size * 0.42, size * 0.14)
      inner.rotation.z = -side * ears.tilt
      ear.add(inner)
    } else if (ears.type === EAR.LONG) {
      const outer = capsule(size * 0.24, size * 0.84, outerMaterial)
      outer.scale.z = 0.6
      outer.position.y = size * 0.56
      outer.rotation.z = -side * ears.tilt
      ear.add(outer)

      const inner = capsule(size * 0.13, size * 0.6, materials.accent)
      inner.scale.z = 0.5
      inner.position.set(-side * size * 0.02, size * 0.56, size * 0.1)
      inner.rotation.z = -side * ears.tilt
      ear.add(inner)
    } else {
      // EAR.ROUND
      const outer = ball(size, outerMaterial, 22)
      outer.scale.z = 0.72
      ear.add(outer)
    }
  }
}

function buildTail(
  materials: CritterMaterials,
  tail: CharacterBuild['tail'],
  R: number,
): THREE.Group | null {
  const group = new THREE.Group()

  switch (tail.type) {
    case TAIL.CURL: {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, R * 0.34, -tail.size * 0.42),
        new THREE.Vector3(0, R * 0.86, -tail.size * 0.5),
        new THREE.Vector3(0, R * 1.14, -tail.size * 0.16),
        new THREE.Vector3(0, R * 1.1, tail.size * 0.16),
      ])
      const geometry = new THREE.TubeGeometry(curve, 28, R * 0.12, 14, false)
      group.add(new THREE.Mesh(geometry, materials.body))
      // 꼬리 끝 마감
      const tip = ball(R * 0.12, materials.body, 16)
      tip.position.set(0, R * 1.1, tail.size * 0.16)
      group.add(tip)
      break
    }
    case TAIL.WAG: {
      const stub = capsule(tail.size * 0.24, tail.size * 0.6, materials.body)
      stub.position.set(0, tail.size * 0.42, -tail.size * 0.18)
      stub.rotation.x = -0.5
      group.add(stub)
      break
    }
    case TAIL.PUFF: {
      const puff = ball(tail.size, materials.belly, 20)
      puff.position.set(0, 0, -tail.size * 0.4)
      group.add(puff)
      break
    }
    case TAIL.FEATHER: {
      for (const [index, side] of [-1, 0, 1].entries()) {
        const feather = cone(tail.size * 0.22, tail.size * 0.9, materials.accent, 14)
        feather.position.set(side * tail.size * 0.26, tail.size * 0.24, -tail.size * 0.28)
        feather.rotation.x = -0.75
        feather.rotation.z = side * 0.22
        feather.scale.setScalar(index === 1 ? 1 : 0.85)
        group.add(feather)
      }
      break
    }
    default:
      return null
  }

  return group
}

/** 캐릭터를 교체할 때 GPU 자원을 되돌려준다. */
export function disposeCritter(critter: Critter) {
  critter.root.traverse((object) => {
    if (isMesh(object)) object.geometry.dispose()
  })
  for (const material of Object.values(critter.materials)) material.dispose()
  critter.root.removeFromParent()
}
