/**
 * 캐릭터 창 크기 계산.
 *
 * 캐릭터 크기는 창 크기로 표현한다. 카메라 구도는 가로세로 비율만 따르기 때문에,
 * 창을 같은 비율로 키우면 캐릭터도 그대로 커진다.
 *
 * Electron 을 쓰지 않는 순수 계산만 모아 두어 테스트할 수 있게 했다.
 */

/** 크기 100% 일 때의 캐릭터 창 크기 */
const PET_BASE_SIZE = { width: 260, height: 320 }
const MIN_SCALE = 0.25
const MAX_SCALE = 2.0

const between = (value, min, max) => Math.max(min, Math.min(value, max))

function clampScale(scale) {
  return between(Number.isFinite(scale) ? scale : 1, MIN_SCALE, MAX_SCALE)
}

function petSizeFor(scale) {
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
 * @param {{bounds: {x,y,width,height}, scale: number, workArea: {x,y,width,height}}} input
 */
function nextPetBounds({ bounds, scale, workArea }) {
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

module.exports = { PET_BASE_SIZE, MIN_SCALE, MAX_SCALE, clampScale, petSizeFor, nextPetBounds }
