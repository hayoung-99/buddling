/**
 * 신호의 종류.
 *
 * 내 캐릭터를 누르면 상대 화면에서 캐릭터가 움직이는데, **무엇을 하는가**가 이것이다.
 * 누르는 동작은 하나로 두고 평소에 나갈 신호를 미리 골라 두므로, 신호는 표현의
 * 목록이라기보다 **그 사람의 시그니처**에 가깝다 (기획서 3단계).
 *
 * 고른 값은 방마다 따로이고 **내 기기에만 저장된다** — 캐릭터·크기·위치와 같은 결이다.
 * 남이 미리 알 필요가 없어서, 보낼 때 페이로드에 실어 보내는 것으로 충분하다.
 *
 * 이름을 `poke` 로 둔 것은 이 저장소가 이미 콕 찌르기를 그 낱말로 부르기 때문이다
 * (`detail.poke` · `toast.poked`). 동작 이름인 `dance` 와는 일부러 다르게 둔다 —
 * 신호는 뜻이고 동작은 그것을 어떻게 보이느냐라서, 나중에 같은 뜻을 다른 동작으로
 * 바꿀 수 있어야 한다.
 */

export const SIGNALS = ['poke', 'hop'] as const

export type SignalKind = (typeof SIGNALS)[number]

/** 아무것도 고르지 않았을 때, 그리고 알 수 없는 값을 받았을 때 */
export const DEFAULT_SIGNAL: SignalKind = 'poke'

/**
 * 받은 값을 아는 신호로 좁힌다. **모르는 값은 기본 춤으로 떨어뜨린다.**
 *
 * 옛 버전이 보낸 것에는 이 필드가 아예 없고, 반대로 새 버전이 신호를 더하면 아직
 * 업데이트하지 않은 쪽은 처음 보는 이름을 받는다. 그때 아무 일도 일어나지 않는 것보다
 * **뜻이 조금 어긋나더라도 무언가 움직이는 편이 낫다** — 보낸 사람은 자기 신호가
 * 갔는지 알 길이 없기 때문이다.
 */
export function toSignal(value: unknown): SignalKind {
  return SIGNALS.includes(value as SignalKind) ? (value as SignalKind) : DEFAULT_SIGNAL
}
