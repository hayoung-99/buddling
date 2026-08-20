import { describe, it, expect } from 'vitest'
import { withSessionRecovery, SESSION_EXPIRED } from '../src/services/session-recovery'

/*
 * 이 회복이 지켜야 하는 것은 세 가지다 — 멀쩡할 때는 아무 일도 하지 않을 것,
 * 세션이 죽었을 때만 버리고 딱 한 번 다시 해 볼 것, 그리고 **영영 돌지 않을 것.**
 *
 * 마지막이 이 파일이 있는 이유다. 재시도는 조건이 안 풀리면 서버를 두드리는 고리가
 * 되기 쉬운데, 그런 고리는 사람이 앱을 끄기 전까지 아무도 눈치채지 못한다.
 */

/** 미리 정해 둔 답을 순서대로 내놓는 가짜 호출 */
function callThatReturns(...answers: (string | Error)[]) {
  const calls: number[] = []
  const call = async () => {
    calls.push(calls.length)
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (answer instanceof Error) throw answer
    return answer
  }
  return { call, count: () => calls.length }
}

const expired = () => new Error(SESSION_EXPIRED)

describe('withSessionRecovery', () => {
  it('멀쩡하면 세션을 건드리지 않는다', async () => {
    const { call, count } = callThatReturns('된다')
    let forgot = 0

    expect(await withSessionRecovery(call, async () => void forgot++)).toBe('된다')
    expect(count()).toBe(1)
    expect(forgot).toBe(0)
  })

  it('세션이 죽었으면 버리고 한 번 더 해서 살아난다', async () => {
    const { call, count } = callThatReturns(expired(), '된다')
    let forgot = 0

    expect(await withSessionRecovery(call, async () => void forgot++)).toBe('된다')
    expect(count()).toBe(2)
    expect(forgot).toBe(1)
  })

  /*
   * 새로 만든 계정까지 없다는 뜻이라 더 해 봐야 같은 답만 돌아온다. 여기서 멈추지
   * 않으면 그 자리가 곧 무한 재시도가 된다.
   */
  it('두 번째도 같은 답이면 그대로 올려보내고 멈춘다', async () => {
    const { call, count } = callThatReturns(expired())
    let forgot = 0

    await expect(withSessionRecovery(call, async () => void forgot++)).rejects.toThrow(
      SESSION_EXPIRED,
    )
    expect(count()).toBe(2)
    expect(forgot).toBe(1)
  })

  /* 다른 오류까지 세션 탓으로 돌리면 멀쩡한 신원을 버리게 된다 */
  it('다른 오류에는 세션을 버리지 않는다', async () => {
    const { call, count } = callThatReturns(new Error('error.TEAM_FULL'))
    let forgot = 0

    await expect(withSessionRecovery(call, async () => void forgot++)).rejects.toThrow(
      'error.TEAM_FULL',
    )
    expect(count()).toBe(1)
    expect(forgot).toBe(0)
  })

  /* 인터넷이 없어 오류 객체가 아닌 것이 올라올 수도 있다 */
  it('Error 가 아닌 것이 올라와도 넘어지지 않는다', async () => {
    const { call, count } = callThatReturns()
    const throwing = async () => {
      await call()
      throw 'OFFLINE'
    }

    await expect(withSessionRecovery(throwing, async () => {})).rejects.toBe('OFFLINE')
    expect(count()).toBe(1)
  })
})
