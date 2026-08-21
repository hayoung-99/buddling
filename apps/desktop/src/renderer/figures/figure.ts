/**
 * 피규어 빌더.
 *
 * `specs.ts` 의 스펙 하나를 받아 Three.js 그룹을 만든다. 앱의 `pet/critter.ts` 와는
 * **별개의 리그**다 — 그쪽은 팔이 몸통에 붙은 돌기이고 다리가 발만 있는데, 여기는
 * 어깨·골반에 피벗이 있는 진짜 팔다리가 있다. 그래서 손 흔들기가 어깨를 옮기는 꼼수
 * 없이 팔을 들어 올리는 것만으로 읽힌다.
 *
 * 좌표 규약은 앱 캐릭터와 같게 둔다 (미리보기가 같은 조명·카메라 도구를 쓰기 때문이다).
 *   - 발바닥이 y = 0
 *   - +Z(카메라)를 바라본다. x 가 +인 쪽이 화면 오른쪽이고, 부위 이름의 `L` 이 그쪽이다
 *   - 움직이는 부위는 모두 자기 회전축 위치에 놓인 Group(피벗)에 담긴다
 *
 * 리그
 *   root ─ torso(몸통 기울기) ─ head(고개)
 *        │                     ├ eyeL·eyeR(깜빡임) · earL·earR(있는 종만)
 *        │                     └ 주둥이·코·입·무늬
 *        ├ armL·armR(어깨 피벗, 아래로 팔이 늘어진다) ─ handL·handR(손끝 표시)
 *        ├ legL·legR(골반 피벗) ─ 다리·발
 *        └ tail(있는 종만)
 */

import * as THREE from 'three'
import type { FigureBuild, FigurePaletteKey, FigureSpec } from './specs'

/** 무광 점토 질감. 컨셉 시트의 재질이 이것이다. */
const CLAY = { roughness: 0.55, metalness: 0.0 }

export type FigureParts = Record<string, THREE.Object3D>
export type FigureMaterials = Record<string, THREE.MeshStandardMaterial>

export interface Figure {
  root: THREE.Group
  parts: FigureParts
  spec: FigureSpec
  materials: FigureMaterials
  /** 실제로 차지하는 높이(월드 단위). 귀 때문에 종마다 다르다 */
  height: number
  /** 팔이 가만히 늘어져 있을 때의 바깥 기울기(라디안). 애니메이터가 여기에 더한다 */
  armRest: number
}

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true

function clay(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, ...CLAY, ...extra })
}

function ball(radius: number, material: THREE.Material, segments = 32) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.7)),
    material,
  )
}

function capsule(radius: number, length: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 10, 24), material)
}

function cone(radius: number, height: number, material: THREE.Material, segments = 24) {
  return new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material)
}

function pivot(x = 0, y = 0, z = 0) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  return group
}

/**
 * 머리 타원체 표면의 한 점. x·y 를 주면 앞면(+z)의 z 를 돌려준다.
 * 눈·코·주둥이를 "얼굴에 붙어 있게" 놓는 데 쓴다.
 */
function faceZ(headR: number, scale: [number, number, number], x: number, y: number) {
  const [a, b, c] = [headR * scale[0], headR * scale[1], headR * scale[2]]
  return c * Math.sqrt(Math.max(1 - (x / a) ** 2 - (y / b) ** 2, 0))
}

export function createFigure(spec: FigureSpec): Figure {
  const { palette, build } = spec
  const parts: FigureParts = {}

  const color = (name: FigurePaletteKey) => palette[name] ?? palette.body
  const materials: FigureMaterials = {
    body: clay(color('body')),
    torso: clay(color('torso')),
    belly: clay(color('belly')),
    muzzle: clay(color('muzzle')),
    nose: clay(color('nose'), { roughness: 0.45 }),
    eye: clay(color('eye'), { roughness: 0.3 }),
    highlight: clay(0xffffff, { roughness: 0.2 }),
    innerEar: clay(color('innerEar')),
    foot: clay(color('foot')),
    limb: clay(color('limb')),
    beak: clay(color('beak'), { roughness: 0.4 }),
    beakLower: clay(color('beakLower'), { roughness: 0.4 }),
    markA: clay(color('markA')),
    markB: clay(color('markB')),
    markC: clay(color('markC')),
  }
  const limbMaterial = build.limbColor === 'limb' ? materials.limb : materials.body

  const R = build.bodyRadius
  const L = build.bodyLength
  const headR = build.headRadius
  const legLength = build.legLength

  // 다리는 몸통 아래 둥근 부분 안쪽에서 나온다. 그래서 몸통을 골반보다 조금 내려 앉힌다.
  const hipY = legLength
  const torsoY = hipY + R + L / 2 - R * 0.3
  const torsoTop = torsoY + L / 2 + R
  // 머리는 목 없이 몸통 위에 바로 얹히고 살짝 파묻힌다
  const headY = torsoTop + headR * build.headScale[1] - headR * 0.24

  // ── root: 점프(y)와 찌부러짐(scale)이 걸리는 최상위 ──
  const root = new THREE.Group()
  parts.root = root

  // ── 몸통 ──
  const torso = pivot(0, torsoY, 0)
  root.add(torso)
  parts.torso = torso

  const trunk = capsule(R, L, materials.torso)
  trunk.scale.set(1, 1, 0.9)
  torso.add(trunk)

  // 배: 납작한 무늬를 몸통에 겹치면 교차선이 너덜거린다. 앞으로 불룩한 부피로 만든다.
  if (palette.belly !== undefined) {
    const belly = ball(R * 0.74, materials.belly)
    belly.scale.set(1.0, 1.2, 0.5)
    belly.position.set(0, -L * 0.1, R * 0.9 * 0.66)
    torso.add(belly)
  }

  // ── 머리 ──
  const head = pivot(0, headY - torsoY, 0)
  torso.add(head)
  parts.head = head
  const skull = ball(headR, materials.body, 40)
  skull.scale.set(...build.headScale)
  head.add(skull)

  if (build.marks.includes('calicoHead')) buildCalicoHead(head, materials, headR, build.headScale)
  if (build.marks.includes('pandaEyes')) buildPandaEyes(head, materials, headR, build.headScale)
  buildFace(head, parts, materials, headR, build)
  buildEars(head, parts, materials, headR, build)

  // ── 팔 (어깨 피벗. 팔은 피벗 아래로 늘어지므로 rotation.z 만 주면 옆으로 들린다) ──
  const armRest = build.arms === 'wing' ? 0.22 : 0.12
  for (const side of [-1, 1]) {
    // 어깨는 몸통 윗둥근 부분 옆에 붙는다. 팔 위쪽이 살짝 솟아 어깨처럼 보인다.
    const shoulder = pivot(side * R * 0.96, torsoY + L / 2 + R * 0.2, 0)
    root.add(shoulder)
    parts[side < 0 ? 'armR' : 'armL'] = shoulder
    // 바깥으로 살짝 벌어진 채 늘어진다. 애니메이터는 이 값 위에 자기 각도를 더한다.
    // (아래로 늘어진 것을 z 로 돌리면 양의 각도가 손끝을 +x 로 보낸다)
    shoulder.rotation.z = side * armRest

    const length = build.armLength
    if (build.arms === 'wing') {
      const wing = ball(length * 0.5, limbMaterial)
      wing.scale.set(0.5, 1.0, 0.72)
      wing.position.y = -length * 0.48
      shoulder.add(wing)
    } else {
      const radius = length * 0.2
      const limb = capsule(radius, length - radius * 2, limbMaterial)
      limb.position.y = -length / 2
      shoulder.add(limb)
    }
    // 손끝. 테스트가 "손이 머리보다 높이 올라갔나" 를 월드 좌표로 재는 데 쓴다.
    const hand = pivot(0, -length, 0)
    shoulder.add(hand)
    parts[side < 0 ? 'handR' : 'handL'] = hand
  }

  // ── 다리 (골반 피벗) ──
  const webbed = build.feet === 'webbed'
  const footR = R * 0.4
  const footScale: [number, number, number] = webbed ? [1.5, 0.32, 1.9] : [1.1, 0.5, 1.35]
  for (const side of [-1, 1]) {
    const hip = pivot(side * R * 0.46, hipY, 0)
    root.add(hip)
    parts[side < 0 ? 'legR' : 'legL'] = hip

    const legR = R * 0.3
    const straight = Math.max(legLength - legR, 0.02)
    const leg = capsule(legR, straight, limbMaterial)
    // 다리 아래 끝은 발 속에 묻힌다 — 발바닥이 바닥(y=0)을 정하는 유일한 면이어야 한다
    const footHalf = footR * footScale[1]
    leg.position.y = -legLength + footHalf * 0.6 + straight / 2 + legR
    hip.add(leg)

    const foot = ball(footR, materials.foot)
    foot.scale.set(...footScale)
    foot.position.set(0, -legLength + footHalf, footR * (webbed ? 0.5 : 0.3))
    hip.add(foot)
  }

  if (build.marks.includes('calicoBody')) buildCalicoBody(torso, materials, R, L)
  if (build.marks.includes('sparkle')) buildSparkle(torso, materials, R)

  // ── 꼬리 ──
  const tail = buildTail(materials, build.tail, R)
  if (tail) {
    tail.position.set(0, -L * 0.2, -R * 0.9)
    torso.add(tail)
    parts.tail = tail
  }

  root.traverse((object) => {
    if (isMesh(object)) {
      object.castShadow = true
      object.receiveShadow = false
    }
  })

  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const height = bounds.max.y - bounds.min.y

  return { root, parts, spec, materials, height, armRest }
}

/**
 * 어떤 종이든 화면에서 차지할 높이(월드 단위). 앱 캐릭터의 `STANDARD_HEIGHT` 와 같은 값이라
 * 같은 카메라 구도에 세우면 같은 크기로 보인다.
 */
export const FIGURE_STANDARD_HEIGHT = 2.0

/** 캐릭터를 담은 그룹에 걸 배율. `root.scale` 은 찌부러짐이 쓰므로 부모에 건다. */
export function scaleFigureToStandardHeight(figure: { height: number }): number {
  return FIGURE_STANDARD_HEIGHT / figure.height
}

/** 피규어를 버릴 때 GPU 자원을 되돌려준다. */
export function disposeFigure(figure: Figure) {
  figure.root.traverse((object) => {
    if (isMesh(object)) object.geometry.dispose()
  })
  for (const material of Object.values(figure.materials)) material.dispose()
  figure.root.removeFromParent()
}

// ────────────────────────────────────────────────────────────
// 얼굴
// ────────────────────────────────────────────────────────────

function buildFace(
  head: THREE.Object3D,
  parts: FigureParts,
  materials: FigureMaterials,
  headR: number,
  build: FigureBuild,
) {
  const scale = build.headScale

  // ── 눈: 작은 점 둘. 컨셉 시트의 눈은 아주 작고 세로로 살짝 길다 ──
  const eyeR = headR * 0.085
  const eyeX = headR * 0.37
  const eyeY = headR * 0.04
  // 판다는 눈 무늬 위에 눈이 얹히므로 그만큼 앞으로 뺀다
  const eyeLift = build.marks.includes('pandaEyes') ? headR * 0.06 : 0
  for (const side of [-1, 1]) {
    const eye = pivot(side * eyeX, eyeY, faceZ(headR, scale, side * eyeX, eyeY) - eyeR * 0.35 + eyeLift)
    head.add(eye)
    parts[side < 0 ? 'eyeR' : 'eyeL'] = eye

    const pupil = ball(eyeR, materials.eye, 20)
    pupil.scale.set(1, 1.15, 0.75)
    eye.add(pupil)

    const highlight = ball(eyeR * 0.28, materials.highlight, 12)
    highlight.position.set(side * eyeR * 0.3, eyeR * 0.4, eyeR * 0.7)
    eye.add(highlight)
  }

  if (build.face === 'beak') {
    // 납작한 부리 두 장. 아랫장이 조금 작고 어둡다.
    const upper = ball(headR * 0.34, materials.beak)
    upper.scale.set(1.35, 0.42, 1.5)
    upper.position.set(0, -headR * 0.12, faceZ(headR, scale, 0, -headR * 0.12) * 0.7)
    head.add(upper)
    parts.snout = upper

    const lower = ball(headR * 0.3, materials.beakLower)
    lower.scale.set(1.2, 0.3, 1.35)
    lower.position.set(0, -headR * 0.22, faceZ(headR, scale, 0, -headR * 0.22) * 0.66)
    head.add(lower)
    return
  }

  // ── 주둥이: 크림색 타원이 아랫얼굴에 얹힌다 (강아지·토끼) ──
  let noseZ: number
  const noseY = -headR * 0.2
  if (build.face === 'muzzle') {
    const muzzleY = -headR * 0.27
    const muzzle = ball(headR * 0.36, materials.muzzle)
    muzzle.scale.set(1.4, 1.0, 0.5)
    muzzle.position.set(0, muzzleY, faceZ(headR, scale, 0, muzzleY) * 0.9)
    head.add(muzzle)
    parts.snout = muzzle
    noseZ = muzzle.position.z + headR * 0.36 * 0.5
  } else {
    noseZ = faceZ(headR, scale, 0, noseY)
  }

  // ── 코와 입. 코 아래로 짧은 세로줄, 그 끝에 짧은 가로줄 ──
  const plain = build.face === 'plain'
  const noseR = headR * (plain ? 0.07 : 0.1)
  const nose = ball(noseR, materials.nose, 18)
  nose.scale.set(1.35, 0.85, 0.8)
  nose.position.set(0, noseY, noseZ - noseR * 0.2)
  head.add(nose)
  if (!parts.snout) parts.snout = nose

  const lineR = headR * 0.014
  const stem = capsule(lineR, headR * 0.06, materials.nose)
  stem.position.set(0, noseY - noseR * 0.85 - headR * 0.04, noseZ - headR * 0.01)
  head.add(stem)

  const lip = capsule(lineR, headR * 0.12, materials.nose)
  lip.rotation.z = Math.PI / 2
  lip.position.set(0, stem.position.y - headR * 0.05, noseZ - headR * 0.015)
  head.add(lip)
}

// ────────────────────────────────────────────────────────────
// 무늬
// ────────────────────────────────────────────────────────────

/**
 * 머리보다 아주 조금 큰 구의 조각. 방향 `direction` 을 가운데로 삼아 `spread` 라디안만큼
 * 덮는다. 납작한 무늬를 겹치면 교차선이 너덜거리는데, 같은 중심의 조각은 경계가 깨끗한
 * 원호로 떨어진다. 반지름을 1.2% 키우는 것은 머리 면과 겹쳐 번쩍이는 것을 피하려는 것이다.
 */
function headCap(
  headR: number,
  scale: [number, number, number],
  material: THREE.Material,
  direction: THREE.Vector3,
  spread: number,
) {
  const geometry = new THREE.SphereGeometry(headR, 40, 28, 0, Math.PI * 2, 0, spread)
  // 조각은 +Y 를 가운데로 만들어지므로, 머리 배율을 걸기 전에 기하 자체를 돌려 둔다
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  )
  geometry.applyQuaternion(quaternion)
  const cap = new THREE.Mesh(geometry, material)
  cap.scale.set(scale[0] * 1.012, scale[1] * 1.012, scale[2] * 1.012)
  return cap
}

/** 삼색 고양이 — 왼쪽 위는 검정, 오른쪽 위는 주황 */
function buildCalicoHead(
  head: THREE.Object3D,
  materials: FigureMaterials,
  headR: number,
  scale: [number, number, number],
) {
  // 무대가 +x 쪽을 카메라로 살짝 돌려 세우므로(-0.2 rad), 검정은 앞으로 조금 더 끌어오고
  // 주황은 옆으로 물려야 정면에서 그림과 같은 자리에 보인다
  head.add(headCap(headR, scale, materials.markA, new THREE.Vector3(-0.7, 0.5, 0.38), 0.82))
  head.add(headCap(headR, scale, materials.markB, new THREE.Vector3(0.8, 0.52, 0.02), 0.56))
}

/** 판다 — 바깥 위로 기울어진 타원 두 개. 눈은 이 위에 얹힌다. */
function buildPandaEyes(
  head: THREE.Object3D,
  materials: FigureMaterials,
  headR: number,
  scale: [number, number, number],
) {
  for (const side of [-1, 1]) {
    const x = side * headR * 0.37
    const y = headR * 0.03
    const z = faceZ(headR, scale, x, y)
    const holder = new THREE.Group()
    holder.position.set(x, y, z)
    holder.lookAt(x * 2, y * 2, z * 2) // +Z 가 얼굴 바깥(법선)을 향하게
    head.add(holder)

    const patch = ball(headR * 0.2, materials.markA, 24)
    patch.scale.set(1.0, 1.35, 0.45)
    patch.rotation.z = -side * 0.38
    holder.add(patch)
  }
}

/** 몸통 표면에 붙는 납작한 점. `direction` 은 몸통 중심에서 본 방향이다. */
function bodyDecal(
  torso: THREE.Object3D,
  material: THREE.Material,
  radius: number,
  R: number,
  y: number,
  direction: [number, number],
  flatten = 0.4,
) {
  const [dx, dz] = direction
  const length = Math.hypot(dx, dz) || 1
  const nx = dx / length
  const nz = (dz / length) * 0.9 // 몸통은 앞뒤로 0.9 눌려 있다
  const holder = new THREE.Group()
  holder.position.set(nx * R, y, nz * R)
  holder.lookAt(nx * R * 2, y, nz * R * 2)
  torso.add(holder)
  const spot = ball(radius, material, 22)
  spot.scale.set(1, 1, flatten)
  holder.add(spot)
  return holder
}

/** 삼색 고양이 — 왼쪽 어깨의 노란 점, 오른쪽 엉덩이의 검은 점 */
function buildCalicoBody(torso: THREE.Object3D, materials: FigureMaterials, R: number, L: number) {
  bodyDecal(torso, materials.markC, R * 0.2, R, L * 0.42, [-0.85, 0.55])
  bodyDecal(torso, materials.markA, R * 0.25, R, -L * 0.5 - R * 0.25, [0.8, 0.45])
}

/** 토끼 — 오른쪽 옆구리의 네 꼭지 반짝이 */
function buildSparkle(torso: THREE.Object3D, materials: FigureMaterials, R: number) {
  const outer = R * 0.3
  const inner = outer * 0.32
  const shape = new THREE.Shape()
  for (let index = 0; index < 8; index += 1) {
    const radius = index % 2 === 0 ? outer : inner
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()

  const star = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: R * 0.05, bevelEnabled: false }),
    materials.markA,
  )
  const holder = new THREE.Group()
  // 몸통 오른쪽(+x), 조금 앞쪽. 옆모습에서 잘 보이고 정면에서도 가장자리가 걸린다.
  const nx = 0.96
  const nz = 0.28 * 0.9
  holder.position.set(nx * R, R * 0.05, nz * R)
  holder.lookAt(nx * R * 2, R * 0.05, nz * R * 2)
  holder.add(star)
  star.position.z = -R * 0.04 // 표면에 살짝 박힌다
  torso.add(holder)
}

// ────────────────────────────────────────────────────────────
// 귀 · 꼬리
// ────────────────────────────────────────────────────────────

function buildEars(
  head: THREE.Object3D,
  parts: FigureParts,
  materials: FigureMaterials,
  headR: number,
  build: FigureBuild,
) {
  if (build.ears === 'none') return
  const [sx, sy] = build.headScale

  for (const side of [-1, 1]) {
    const key = side < 0 ? 'earR' : 'earL'

    if (build.ears === 'triangle') {
      // 삼색 고양이는 귀 색이 그쪽 무늬를 따라간다 — 왼쪽 검정, 오른쪽 주황
      const calico = build.marks.includes('calicoHead')
      const outerMaterial = calico ? (side < 0 ? materials.markA : materials.markB) : materials.body
      const ear = pivot(side * headR * sx * 0.6, headR * sy * 0.74, -headR * 0.02)
      head.add(ear)
      parts[key] = ear

      const outer = cone(headR * 0.3, headR * 0.6, outerMaterial)
      outer.scale.z = 0.55
      outer.position.y = headR * 0.24
      outer.rotation.z = -side * 0.3
      ear.add(outer)

      const inner = cone(headR * 0.17, headR * 0.38, materials.innerEar)
      inner.scale.z = 0.4
      inner.position.set(side * headR * 0.02, headR * 0.2, headR * 0.1)
      inner.rotation.z = -side * 0.3
      ear.add(inner)
    } else if (build.ears === 'floppy') {
      // 머리 옆에 길게 늘어진다. 피벗은 귀 뿌리(위)라 아래가 흔들린다.
      const ear = pivot(side * headR * sx * 0.86, headR * sy * 0.42, -headR * 0.06)
      head.add(ear)
      parts[key] = ear

      const flap = capsule(headR * 0.24, headR * 0.96, materials.body)
      flap.scale.set(1, 1, 0.5)
      flap.position.y = -headR * 0.56
      flap.rotation.z = side * 0.06
      ear.add(flap)
    } else if (build.ears === 'round') {
      const ear = pivot(side * headR * sx * 0.66, headR * sy * 0.8, -headR * 0.06)
      head.add(ear)
      parts[key] = ear

      const disc = ball(headR * 0.27, materials.markA, 24)
      disc.scale.z = 0.7
      ear.add(disc)
    } else {
      // long — 위로 길게 선 귀. 피벗은 뿌리(아래)
      const ear = pivot(side * headR * sx * 0.4, headR * sy * 0.82, -headR * 0.02)
      head.add(ear)
      parts[key] = ear

      const outer = capsule(headR * 0.19, headR * 1.02, materials.body)
      outer.scale.z = 0.62
      outer.position.y = headR * 0.6
      outer.rotation.z = -side * 0.1
      ear.add(outer)

      const inner = capsule(headR * 0.1, headR * 0.74, materials.innerEar)
      inner.scale.z = 0.5
      inner.position.set(-side * headR * 0.05, headR * 0.62, headR * 0.11)
      inner.rotation.z = -side * 0.1
      ear.add(inner)
    }
  }
}

function buildTail(materials: FigureMaterials, tail: FigureBuild['tail'], R: number) {
  if (tail === 'none') return null
  const group = new THREE.Group()

  if (tail === 'puff') {
    const puff = ball(R * 0.36, materials.belly, 20)
    puff.position.z = -R * 0.12
    group.add(puff)
  } else {
    // feather — 위로 살짝 들린 짧은 꽁지 깃 둘
    for (const side of [-1, 1]) {
      const feather = cone(R * 0.16, R * 0.6, materials.body, 14)
      feather.position.set(side * R * 0.14, R * 0.22, -R * 0.22)
      feather.rotation.x = -0.9
      feather.rotation.z = side * 0.18
      group.add(feather)
    }
  }
  return group
}
