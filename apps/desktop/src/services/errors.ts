/**
 * DB 가 던진 오류를 번역 열쇠로 바꾼다.
 *
 * **여기서 문장을 만들지 않는다.** 앱이 네 나라 말을 지원하는데 이 계층은 지금 어떤 말을
 * 쓰는지 모른다. 열쇠(`error.TEAM_FULL`)만 넘기고 문장은 `main/ipc.ts` 가 만든다.
 *
 * `net.ts` 가 아니라 여기 있는 이유는 `emitter.ts` 와 같다 — 구현들이 이걸 쓰고 `net.ts`
 * 는 구현들을 쓰므로, 한 파일에 두면 서로를 부르는 고리가 된다.
 */

const ERROR_KEYS = [
  'INVALID_INVITE_CODE',
  'INVITE_EXPIRED',
  'NICKNAME_TAKEN',
  'NICKNAME_REQUIRED',
  'TEAM_NAME_REQUIRED',
  'NOT_SIGNED_IN',
  'NOT_A_MEMBER',
  'TEAM_LIMIT_REACHED',
  'TEAM_FULL',
  'CODE_GENERATION_FAILED',
] as const

export function toFriendlyError(error: unknown): Error {
  const raw = (error as { message?: string })?.message ?? String(error)

  for (const code of ERROR_KEYS) {
    if (raw.includes(code)) return new Error(`error.${code}`)
  }
  if (raw.startsWith('error.')) return error instanceof Error ? error : new Error(raw)
  if (raw.includes('does not exist') || raw.includes('Could not find the function')) {
    return new Error('error.schemaStale')
  }
  if (raw.includes('Invalid API key') || raw.includes('JWT')) {
    return new Error('error.invalidKey')
  }
  return new Error(raw)
}
