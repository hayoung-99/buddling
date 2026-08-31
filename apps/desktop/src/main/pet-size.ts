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
 * 크기 패널을 캐릭터 창 기준으로 놓을 자리.
 *
 * 기본은 캐릭터 창 바로 아래다 — 창 아랫변이 곧 캐릭터 발밑이라 그대로 붙여도 된다.
 * 화면 아래쪽에 자리가 없으면 위로 옮기는데, 이때는 **창의 맨 꼭대기가 아니라 캐릭터
 * 머리 위쪽 끝**(`HEAD_TOP_FRACTION`)을 기준으로 삼는다. 카메라 구도가 폴짝 뛸 때와
 * 말풍선을 위해 머리 위에 넉넉한 여백을 두므로(`renderer/pet/scene.ts` 의 `PET_CAMERA`
 * 주석), 창 top 을 그대로 쓰면 그 여백까지 창 크기에 비례해 커져서 스케일이 클수록
 * 패널이 캐릭터와 멀어져 보인다.
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
  let y = pet.y + pet.height + gap
  if (y + panel.height > workArea.y + workArea.height) {
    const headTop = pet.y + pet.height * HEAD_TOP_FRACTION
    y = Math.round(headTop - panel.height - gap)
  }

  x = between(x, workArea.x + 8, workArea.x + workArea.width - panel.width - 8)
  y = between(y, workArea.y + 8, workArea.y + workArea.height - panel.height - 8)
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
}
