/**
 * 네트워크 계층의 인터페이스와 팩토리.
 *
 * 앱의 나머지 부분은 Supabase를 직접 알지 못하고 이 인터페이스만 쓴다.
 * 나중에 계정 로그인(Supabase Auth + private channel)으로 옮기거나
 * 자체 서버로 바꿔도 이 파일 뒤쪽만 갈아끼우면 된다.
 *
 * 한 기기가 여러 팀(최대 3개)에 속할 수 있으므로, 팀을 다루는 모든 함수는 teamId 를 받고
 * 밖으로 나가는 이벤트(tap·presence·roster·status)에는 teamId 가 붙는다.
 *
 * @typedef {object} Team        { id, name, inviteCode, inviteExpiresAt }
 * @typedef {object} Member      { id, nickname, characterKey }
 * @typedef {object} Membership  { team: Team, member: Member, members: Member[] }
 *
 * @typedef {object} Net
 * @property {(payload: {name: string, nickname: string, characterKey: string}) => Promise<Membership>} createTeam
 * @property {(payload: {inviteCode: string, nickname: string, characterKey: string}) => Promise<Membership>} joinTeam
 * @property {() => Promise<Membership[]>} getMyTeams
 * @property {(teamId: string, characterKey: string) => Promise<Member>} setCharacter
 * @property {(teamId: string, nickname: string) => Promise<Member>} setNickname
 * @property {(teamId: string, name: string) => Promise<Team>} renameTeam
 * @property {(teamId: string) => Promise<Team>} refreshInvite
 * @property {(teamId: string) => Promise<void>} leaveTeam
 * @property {(team: Team, member: Member) => Promise<void>} connect
 * @property {(teamId?: string) => Promise<void>} disconnect
 * @property {(payload: {teamId: string, toMemberId: string|null}) => Promise<void>} sendTap
 * @property {(teamId: string) => Promise<void>} announceRosterChange
 * @property {(teamId: string) => string[]} onlineIn
 * @property {(event: string, handler: Function) => () => void} on
 */

/** 아주 작은 이벤트 방출기. Net 구현들이 공유한다. */
function createEmitter() {
  const handlers = new Map()

  return {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
      return () => handlers.get(event)?.delete(handler)
    },
    emit(event, payload) {
      for (const handler of handlers.get(event) ?? []) {
        try {
          handler(payload)
        } catch (error) {
          console.error(`[net] ${event} 처리 중 오류`, error)
        }
      }
    },
    clear() {
      handlers.clear()
    },
  }
}

/**
 * 설정에 맞는 Net 구현을 만든다.
 * @param {{ url?: string, anonKey?: string, deviceId: string }} config
 */
function createNet(config) {
  // 개발용: Supabase 없이 UI 전체를 눌러보고 싶을 때 (같은 프로세스 안에서만 통한다)
  if (process.env.TAPTAP_FAKE_NET) {
    const { createFakeServer, createFakeNet } = require('./fake-net')
    return createFakeNet({ server: createFakeServer(), deviceId: config.deviceId })
  }

  if (!config.url || !config.anonKey) {
    throw new Error('error.missingConfig')
  }
  const { createSupabaseNet } = require('./supabase-net')
  return createSupabaseNet(config)
}

/**
 * DB 가 던진 오류 코드를 번역 열쇠로 바꾼다.
 *
 * 여기서 문장을 만들지 않는 이유: 앱이 네 나라 말을 지원하는데, 이 계층은
 * 지금 어떤 말을 쓰는지 모른다. 열쇠만 넘기고 문장은 보여주는 쪽에서 만든다.
 */
const ERROR_KEYS = [
  'INVALID_INVITE_CODE',
  'INVITE_EXPIRED',
  'NICKNAME_TAKEN',
  'NICKNAME_REQUIRED',
  'TEAM_NAME_REQUIRED',
  'DEVICE_ID_REQUIRED',
  'NOT_A_MEMBER',
  'TEAM_LIMIT_REACHED',
  'TEAM_FULL',
  'CODE_GENERATION_FAILED',
]

function toFriendlyError(error) {
  const raw = error?.message ?? String(error)

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

module.exports = { createNet, createEmitter, toFriendlyError }
