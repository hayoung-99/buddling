/**
 * 캐릭터 창 크기 계산.
 *
 * 캐릭터 크기는 창 크기로 표현한다. 카메라 구도는 가로세로 비율만 따르기 때문에,
 * 창을 같은 비율로 키우면 캐릭터도 그대로 커진다.
 *
 * Electron 을 쓰지 않는 순수 계산만 모아 두어 테스트할 수 있게 했다.
 */

/**
 * 크기 100% 일 때의 캐릭터 창 크기.
 *
 * **가로가 캐릭터보다 넉넉한 것은 일부러다.** 손 흔들기처럼 팔을 실루엣 밖으로 내는
 * 동작이 있어서, 폭을 캐릭터에 딱 맞추면 팔 끝이 잘린다. 세로 화각이 고정이라
 * (`renderer/pet/scene.ts` 의 `PET_CAMERA`) 폭을 늘려도 캐릭터는 그대로 있고 양옆
 * 자리만 늘어난다. 남는 자리는 클릭이 바탕화면으로 통과하므로 가리지도 않는다.
 *
 * 얼마나 넉넉해야 하는지는 눈이 아니라 `test/wave.test.ts` 가 정한다 — 다섯 종을
 * 실제 구도로 재어 하나라도 창 밖으로 나가면 빨개진다. 새 동작을 넣다 그 검사가
 * 걸리면 **동작을 줄이지 말고 이 폭을 늘린다.**
 *
 * **세로는 화각과 짝으로 움직인다.** 세로 화각이 고정이라
 * (`renderer/pet/scene.ts` 의 `PET_CAMERA.fov`) 높이만 늘리면 보이는 범위는 그대로인
 * 채 캐릭터만 커진다. 그래서 앙탈로 주저앉는 자세가 아래로 넘칠 때
 * (`test/sulk.test.ts`) 높이를 320 에서 384 로 키우면서 화각도 26 에서 31 로 함께
 * 넓혔다. **폭은 그대로 두는 것이 맞다** — 둘을 같은 비율로 움직이면 좌우로 보이는
 * 범위도, 캐릭터의 화면 크기도 그대로이고 위아래 자리만 늘어난다.
 *
 * **한쪽만 고치지 않는다.** 높이만 키우면 캐릭터가 커지고, 화각만 넓히면 작아진다.
 */
const PET_BASE_SIZE = { width: 280, height: 384 }
const MIN_SCALE = 0.25
const MAX_SCALE = 2.0

/** 화면이나 창의 네모. Electron 의 `Rectangle` 과 같은 모양이다. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Size = Pick<Rect, 'width' | 'height'>

const between = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

function clampScale(scale: number): number {
  return between(Number.isFinite(scale) ? scale : 1, MIN_SCALE, MAX_SCALE)
}

function petSizeFor(scale: number): Size {
  const safe = clampScale(scale)
  return {
    width: Math.round(PET_BASE_SIZE.width * safe),
    height: Math.round(PET_BASE_SIZE.height * safe),
  }
}

/**
 * 크기를 바꿨을 때 창이 놓일 자리.
 *
 * 발밑(아래 가운데)을 붙박아 두어야 크기를 바꿔도 캐릭터가 제자리에서 자란다.
 * 다만 화면 가장자리에서 키우면 그대로는 밖으로 삐져나가므로 화면 안으로 되민다.
 *
 */
function nextPetBounds({
  bounds,
  scale,
  workArea,
}: {
  bounds: Rect
  scale: number
  workArea: Rect
}): Rect {
  const size = petSizeFor(scale)
  const anchorX = bounds.x + bounds.width / 2
  const anchorY = bounds.y + bounds.height

  return {
    x: between(
      Math.round(anchorX - size.width / 2),
      workArea.x,
      workArea.x + workArea.width - size.width,
    ),
    y: between(
      Math.round(anchorY - size.height),
      workArea.y,
      workArea.y + workArea.height - size.height,
    ),
    ...size,
  }
}

/**
 * 캐릭터 머리 위쪽 끝이 창 안에서 위에서부터 몇 % 지점인지 (0 이 창 맨 위, 1 이 맨 아래).
 *
 * `renderer/pet/scene.ts` 의 `PET_CAMERA` 가 세로 화각을 고정해 두었고, 다섯 종 모두
 * `renderer/pet/critter.ts` 의 `scaleToStandardHeight` 로 같은 키(`STANDARD_HEIGHT`)로
 * 맞춰지므로, 이 비율은 **캐릭터 종류와 창 크기(scale)에 상관없이 항상 같다** — 원근
 * 투영에서 세로 방향은 세로 화각에만 좌우되고 창 높이가 스케일에 정비례해 늘어도
 * 카메라·타깃·화각은 그대로이기 때문이다.
 *
 * 값을 다시 재려면 `test/wave.test.ts` 의 `widestReach` 와 같은 방법(Three.js
 * `PerspectiveCamera` + `Box3().setFromObject()` + `Vector3.project(camera)`)으로,
 * 다섯 종 아무 캐릭터나 `critter.root` 를 `scaleToStandardHeight` 로 세운 뒤
 * `(0, STANDARD_HEIGHT, 0)`(머리 위 끝)을 `PET_CAMERA` 로 투영해 NDC y 를 구하고
 * `(1 - ndcY) / 2` 로 환산하면 된다. 다섯 종 전부 같은 값(0.317)이 나온다.
 */
const HEAD_TOP_FRACTION = 0.317

/**
 * 캐릭터 발밑이 창 안에서 위에서부터 몇 % 지점인지 (0 이 창 맨 위, 1 이 맨 아래).
 *
 * **창의 맨 아래가 곧 발밑이 아니다.** `critter.ts` 의 좌표 규약대로 발밑은 월드 y=0
 * 이지만, 카메라가 발밑 아래로도 그림자 자리를 넉넉히 남겨 두어서(원점을 그대로
 * `PET_CAMERA` 로 투영해 보면 창 맨 아래보다 한참 위에 찍힌다) 그 사이에 빈 여백이
 * 남는다. `HEAD_TOP_FRACTION` 과 마찬가지로 창 크기에 정비례해 커지는 여백이라,
 * 크기 패널을 "창 아래" 에 놓을 때 이 값 대신 창의 raw 아랫변을 기준으로 삼으면
 * 스케일이 클수록 패널이 발과 멀어져 보인다 — 처음엔 이 자리에 그런 가정이 있었다.
 *
 * `HEAD_TOP_FRACTION` 과 같은 방법으로 쟀다. 다섯 종 전부 발밑이 월드 y=0 으로
 * 정규화되므로(`scaleToStandardHeight`), 원점 `(0, 0, 0)` 을 그대로 `PET_CAMERA` 로
 * 투영해 NDC y 를 구하고 `(1 - ndcY) / 2` 로 환산하면 다섯 종 전부 같은 값(0.7985)이
 * 나온다.
 */
const FEET_BOTTOM_FRACTION = 0.7985

/**
 * 크기 패널을 캐릭터 창 기준으로 놓을 자리.
 *
 * 기본은 캐릭터 발밑 바로 아래다. 화면 아래쪽에 자리가 없으면 위로 옮기는데, 그때는
 * 캐릭터 머리 위쪽 끝을 기준으로 삼는다. **어느 쪽도 창의 raw 위/아랫변을 그대로 쓰지
 * 않는다** — 카메라 구도(`renderer/pet/scene.ts` 의 `PET_CAMERA`)가 머리 위로는 폴짝
 * 뛸 때와 말풍선을 위해, 발밑 아래로는 그림자 자리를 위해 여백을 남겨 두는데, 이
 * 여백이 창 크기에 정비례해 커진다. 창 변을 그대로 쓰면 스케일이 클수록 패널이
 * 캐릭터와 멀어져 보인다.
 */
function sizePanelPosition({
  pet,
  panel,
  workArea,
  gap = 8,
}: {
  pet: Rect
  panel: Size
  workArea: Rect
  gap?: number
}): { x: number; y: number } {
  let x = Math.round(pet.x + pet.width / 2 - panel.width / 2)
  const feetBottom = pet.y + pet.height * FEET_BOTTOM_FRACTION
  let y = Math.round(feetBottom + gap)
  if (y + panel.height > workArea.y + workArea.height) {
    const headTop = pet.y + pet.height * HEAD_TOP_FRACTION
    y = Math.round(headTop - panel.height - gap)
  }

  x = between(x, workArea.x + 8, workArea.x + workArea.width - panel.width - 8)
  y = between(y, workArea.y + 8, workArea.y + workArea.height - panel.height - 8)
  return { x, y }
}

/**
 * 드래그 중인 캐릭터 창의 세로 위치를 화면 안으로 되민다.
 *
 * 창 자체(투명 여백 포함)가 화면 밖으로 나가는 것은 상관없다 — 실제로 보이는 머리
 * 위 끝과 발밑만 `workArea` 안에 있으면 된다. 창의 raw 위/아랫변을 기준으로 막으면
 * `HEAD_TOP_FRACTION`·`FEET_BOTTOM_FRACTION` 이 설명하는 여백이 창 크기(스케일)에
 * 비례해 커지는 탓에, 큰 캐릭터는 화면 가장자리에 닿기 한참 전에 드래그가 막히고
 * 작은 캐릭터는 화면 끝까지 끌리는 것으로 보인다 — 실제로 신고된 증상이 이것이다.
 */
function clampPetY({
  y,
  height,
  workArea,
}: {
  y: number
  height: number
  workArea: Rect
}): number {
  let next = y
  const headTop = next + height * HEAD_TOP_FRACTION
  if (headTop < workArea.y) next += workArea.y - headTop
  const feetBottom = next + height * FEET_BOTTOM_FRACTION
  if (feetBottom > workArea.y + workArea.height) next -= feetBottom - (workArea.y + workArea.height)
  return Math.round(next)
}

/**
 * 드래그 중 매 프레임 창이 옮겨 갈 위치.
 *
 * `click-through.ts` 의 `follow()` 가 매 프레임 부르는 계산을 Electron 없이 테스트할
 * 수 있게 뽑아 두었다. **`workArea` 는 반드시 그 프레임에서 새로 구해 넘겨야 한다** —
 * 드래그를 시작한 모니터의 것을 캐싱해 재사용하면, 세로 위치가 서로 다른 모니터
 * 여러 대를 쓰는 사람이 커서를 다른 모니터로 넘기는 순간 `clampPetY()` 가 엉뚱한(원래
 * 모니터의) 범위로 y 를 붙잡아 캐릭터가 커서에서 세로로 떨어져 보인다 — 실제로
 * 그렇게 캐싱해 두었다가 걷어낸 적이 있다.
 */
function dragPosition({
  cursor,
  offsetX,
  offsetY,
  height,
  workArea,
}: {
  cursor: { x: number; y: number }
  offsetX: number
  offsetY: number
  height: number
  workArea: Rect
}): { x: number; y: number } {
  const x = Math.round(cursor.x - offsetX)
  const rawY = Math.round(cursor.y - offsetY)
  const y = clampPetY({ y: rawY, height, workArea })
  return { x, y }
}

export {
  PET_BASE_SIZE,
  MIN_SCALE,
  MAX_SCALE,
  clampScale,
  petSizeFor,
  nextPetBounds,
  sizePanelPosition,
  clampPetY,
  dragPosition,
}
