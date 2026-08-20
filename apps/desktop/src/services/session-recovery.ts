/**
 * 죽은 세션에서 스스로 일어나기.
 *
 * 이 앱에는 로그인 화면이 없다. 기기마다 익명 계정을 하나 만들어 그걸로 자신을
 * 증명하는데, **그 계정이 서버에서 사라지는 길이 하나 있다** — 팀이 하나도 없는 익명
 * 계정은 `cleanup_anonymous_users()` 가 유예 뒤 지운다.
 *
 * 지워져도 이미 발급된 JWT 는 서명이 유효해서 만료 전까지(최대 한 시간) 서버를 그대로
 * 통과한다. 그 창 안에 팀을 만들거나 초대코드로 들어가려 하면 서버가
 * `error.SESSION_EXPIRED` 로 돌려보낸다 (`supabase/schema.sql` 의 `account_exists`).
 *
 * 그때 할 일은 사람에게 말을 거는 것이 아니라 **조용히 새 신원을 얻어 다시 해 보는
 * 것**이다. 잃을 것도 없다 — 그 계정은 팀이 없었기에 지워진 것이라, 되살릴 데이터가
 * 애초에 없다.
 *
 * `supabase-net.ts` 안에 두지 않고 떼어낸 이유는 **딱 한 번**이라는 성질을 테스트로
 * 붙잡아 두기 위해서다. 재시도는 조건이 안 풀리면 영영 도는 쪽으로 잘못 쓰기 쉽고,
 * 그렇게 되면 서버를 두드리는 고리가 된다. 여기서는 고리 자체가 없다.
 */
export const SESSION_EXPIRED = 'error.SESSION_EXPIRED'

export async function withSessionRecovery<T>(
  /** 실제로 하려던 일. 세션이 없으면 스스로 만들어 쓴다 */
  call: () => Promise<T>,
  /** 쓸모없어진 세션을 버린다. 다음 `call()` 이 새 신원을 만든다 */
  forget: () => Promise<void>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if ((error as Error)?.message !== SESSION_EXPIRED) throw error

    await forget()
    // 여기서 한 번만 더 한다. 두 번째도 같은 답이면 그대로 올려보낸다 —
    // 방금 만든 계정까지 없다는 뜻이라, 더 해 봐야 같은 답만 돌아온다.
    return await call()
  }
}
