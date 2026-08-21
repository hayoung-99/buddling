/**
 * 폴짝이 **땅을 박차는 순간**을 잡는다.
 *
 * 시간표를 짜지 않고 캐릭터 높이가 0에서 위로 넘어가는 지점을 본다. 그래야 폴짝
 * 횟수나 속도를 나중에 바꿔도 저절로 따라오고, 세기를 그때의 솟는 속도에 비례시키면
 * 뒤로 갈수록 낮게 뛰는 만큼 먼지도 함께 옅어지는 것이 공짜로 나온다.
 *
 * 캐릭터 창과 미리보기의 편집기가 **같은 것을 써야 한다.** 편집기에서 다듬은 동작이
 * 앱에서 다르게 터지면 도구를 믿을 수 없다. 그래서 규칙을 여기 한 곳에 두고 양쪽이
 * 불러 쓴다 (지침서 규칙 1 — Electron 도 브라우저도 없이 테스트된다).
 */

/**
 * 세기 1로 치는 솟는 속도(월드 단위/초). 이보다 빠르면 전부 1로 본다.
 *
 * 첫 폴짝이 여기 가깝게 나오도록 잡은 값이다 — 첫 번째가 가장 세고, 뒤로 갈수록
 * 낮게 뛰므로 저절로 작아진다.
 */
export const FULL_KICK_SPEED = 2.4

export interface Takeoff {
  /** 다시 처음부터 보게 한다 (동작을 갈아탈 때) */
  reset: () => void
  /**
   * @param lift 지금 캐릭터 높이 (월드 단위)
   * @param step 이번 프레임 간격(초)
   * @param hopping 지금 폴짝이 재생 중인가
   */
  watch: (lift: number, step: number, hopping: boolean) => void
}

/**
 * @param onKick 박차는 순간에 불린다. 인자는 세기 0~1.
 */
export function createTakeoff(onKick: (strength: number) => void): Takeoff {
  /**
   * 직전 프레임의 높이. `null` 은 **아직 한 번도 못 봤다**는 뜻이다.
   *
   * 0으로 시작하지 않는 이유가 있다. 그러면 지켜보기 시작한 첫 프레임에 캐릭터가
   * 이미 떠 있을 때 "0에서 올라왔다" 로 읽혀 헛되이 터진다. 첫 표본은 기록만 하고
   * 넘어가야 한다 — 발이 땅에 닿아 있는 것을 한 번은 보고 나서 세는 것이 맞다.
   */
  let previous: number | null = null

  return {
    reset() {
      previous = null
    },

    watch(lift, step, hopping) {
      // **춤도 통통 튀느라 높이가 오르내린다.** 이 조건이 없으면 콕을 받을 때마다
      // 발밑에서 먼지가 샌다.
      if (!hopping) {
        previous = null
        return
      }

      const before = previous
      previous = lift
      if (before === null) return

      const rising = (lift - before) / Math.max(step, 1 / 240)
      if (before <= 0 && lift > 0 && rising > 0) {
        onKick(Math.min(1, rising / FULL_KICK_SPEED))
      }
    },
  }
}
