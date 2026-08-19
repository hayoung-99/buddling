/**
 * 프레임 조절기.
 *
 * 화면은 초당 60번(ProMotion 맥이면 120번) 그릴 기회를 준다. 하지만 아무도
 * 캐릭터를 찌르지 않는 동안 그렇게 자주 그릴 이유가 없다. 이 조절기가 "이번 기회에
 * 그릴지 말지"를 정해서, 목표한 초당 프레임 수만큼만 실제로 그리게 한다.
 *
 * 그릴 때는 **그동안 흘러간 시간을 모아서** 넘긴다. 그래야 30프레임으로 낮춰도
 * 호흡과 눈깜빡임이 느려지지 않고 같은 속도로 흐른다.
 */

/**
 * 한 번에 넘길 수 있는 최대 시간(초).
 *
 * 노트북 뚜껑을 닫았다 열면 그 사이 몇 시간이 지나 있다. 그 시간을 그대로 넘기면
 * 캐릭터가 순간이동하고 스프링이 발산한다. 여기서 잘라 낸다.
 */
export const MAX_STEP = 0.1

/**
 * 경계에서의 반올림 오차를 봐주는 여유(초).
 *
 * 60Hz 화면에서 1/60 을 여섯 번 더하면 0.1 이 아니라 0.09999999999999999 이 된다.
 * 이걸 그대로 "아직 모자라다"고 판정하면 한 주기를 통째로 놓쳐서, 10프레임을
 * 목표했는데 8프레임만 나온다. 1마이크로초의 여유가 그걸 막는다.
 */
const EPSILON = 1e-6

export function createPacer() {
  /** 목표 간격을 채웠는지 재는 저울. 그릴 때마다 간격만큼 덜어 낸다. */
  let gate = 0
  /** 마지막으로 그린 뒤 실제로 흐른 시간(초) */
  let elapsed = 0

  return {
    /**
     * @param delta 지난 기회로부터 흐른 시간(초)
     * @param fps 목표 초당 프레임 수. Infinity 면 기회가 올 때마다 그린다.
     * @returns 이번에 그릴 때 쓸 시간. null 이면 이번 기회는 건너뛴다.
     */
    tick(delta: number, fps: number): number | null {
      gate += delta
      elapsed += delta

      const interval = Number.isFinite(fps) && fps > 0 ? 1 / fps : 0
      if (gate + EPSILON < interval) return null

      // 우수리는 다음 기회로 넘겨 장기적으로 목표 프레임 수를 정확히 맞춘다.
      // 다만 한 칸을 넘게는 넘기지 않는다 — 오래 밀렸다가 몰아서 그리면 의미가 없다.
      gate = Math.min(gate - interval, interval)

      const step = Math.min(elapsed, MAX_STEP)
      elapsed = 0
      return step
    },

    /** 멈췄다 다시 시작할 때 — 멈춰 있던 시간이 한꺼번에 밀려들지 않게 한다 */
    reset() {
      gate = 0
      elapsed = 0
    },
  }
}
