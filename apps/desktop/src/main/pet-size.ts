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
 */
const PET_BASE_SIZE = { width: 280, height: 320 }
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

export { PET_BASE_SIZE, MIN_SCALE, MAX_SCALE, clampScale, petSizeFor, nextPetBounds }
