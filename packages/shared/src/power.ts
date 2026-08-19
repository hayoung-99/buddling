/**
 * 절전 강도.
 *
 * 이 앱은 컴퓨터를 켠 순간부터 끌 때까지 바탕화면에 떠 있다. 그래서 "가만히 있을 때
 * 얼마나 게으르게 굴 것인가"가 곧 배터리와 팬 소리를 정한다. 사용자가 세 단계 중
 * 하나를 고르고, 캐릭터 창이 그 값에 맞춰 프레임 수와 그림자·해상도를 조절한다.
 *
 *   idleFps        아무도 안 찔렀을 때 초당 몇 번 그릴지 (Infinity = 화면 주사율 그대로)
 *   activeFps      춤추거나 움찔하는 동안 초당 몇 번 그릴지
 *   idleShadows    가만히 있을 때도 그림자를 다시 그릴지
 *   pixelRatioCap  화면 배율 상한. 레티나에서 1 로 두면 그리는 픽셀이 1/4 로 준다.
 *
 * 해상도는 활동 여부와 무관하게 단계에 고정한다 — 춤출 때만 올리면 화질이 눈에 띄게 튄다.
 */

/** 화면에 보여줄 순서이기도 하다 (왼쪽이 가장 부드럽고 오른쪽이 가장 아낀다) */
export const POWER_LEVELS = ['smooth', 'balanced', 'saver'] as const

export type PowerLevel = (typeof POWER_LEVELS)[number]

export interface PowerProfile {
  idleFps: number
  activeFps: number
  idleShadows: boolean
  pixelRatioCap: number
}

export const DEFAULT_POWER: PowerLevel = 'balanced'

const PROFILES: Record<PowerLevel, PowerProfile> = {
  smooth: { idleFps: Infinity, activeFps: Infinity, idleShadows: true, pixelRatioCap: 2 },
  balanced: { idleFps: 30, activeFps: 60, idleShadows: false, pixelRatioCap: 2 },
  saver: { idleFps: 10, activeFps: 60, idleShadows: false, pixelRatioCap: 1 },
}

/** 고른 값이 없거나 알 수 없으면 기본 단계로 간다 (저장 파일이 깨져도 앱은 뜬다) */
export function resolvePower(level: string | null | undefined): PowerLevel {
  return level != null && level in PROFILES ? (level as PowerLevel) : DEFAULT_POWER
}

export function powerProfile(level: string | null | undefined): PowerProfile {
  return PROFILES[resolvePower(level)]
}
