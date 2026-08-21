/**
 * 네트워크 계층의 인터페이스와 팩토리.
 *
 * 앱의 나머지 부분은 Supabase 를 직접 알지 못하고 이 인터페이스만 쓴다.
 * 나중에 계정 로그인으로 옮기거나 자체 서버로 바꿔도 구현만 갈아끼우면 된다.
 *
 * 한 기기가 여러 팀(최대 3개)에 속할 수 있으므로, 팀을 다루는 모든 함수는 teamId 를 받고
 * 밖으로 나가는 이벤트에는 teamId 가 붙는다 — 어느 팀에서 온 신호인지 알아야 하기 때문이다.
 *
 * 예전에는 이 모양이 JSDoc `@typedef` 로만 적혀 있었다. 이제 타입이라, `fake-net` 과
 * `supabase-net` 이 서로 어긋나면 **테스트를 돌리기 전에** 컴파일러가 잡는다.
 */

import { randomUUID } from 'node:crypto'
import { createFakeServer, createFakeNet } from './fake-net'
import { createSupabaseNet } from './supabase-net'
import type { Emitter } from './emitter'
import type { Member, TapPayload, Team } from '@buddling/shared/state'

// 함께 쓰는 것들은 따로 산다 (고리를 만들지 않으려고). 부르는 쪽이 바뀌지 않도록 여기서 다시 내보낸다.
export { createEmitter } from './emitter'
export { toFriendlyError } from './errors'
export type { Emitter, EventMap } from './emitter'
export type { Member, Team } from '@buddling/shared/state'

/** 서버가 아는 소속. 화면이 보는 것(`shared/state.ts` 의 `Membership`)보다 좁다. */
export interface NetMembership {
  team: Team
  member: Member
  members: Member[]
}

/** 실시간 채널이 알려 오는 상태 문자열 (Supabase Realtime 이 그대로 준다) */
export type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'

/** Net 이 밖으로 내보내는 것들 */
export type NetEvents = {
  /** 누군가 나(또는 우리 팀 전원)를 콕 찔렀다 */
  tap: TapPayload
  /** 팀원이 들어오거나 나갔다 — 명단을 다시 받아야 한다 */
  roster: { teamId: string }
  presence: { teamId: string; onlineIds: string[] }
  status: { teamId: string; status: ChannelStatus }
}

export interface Net {
  /** `characterKey` 를 주지 않으면 구현이 기본 캐릭터로 채운다 */
  createTeam(payload: {
    name: string
    nickname: string
    characterKey?: string
  }): Promise<NetMembership>
  joinTeam(payload: {
    inviteCode: string
    nickname: string
    characterKey?: string
  }): Promise<NetMembership>
  getMyTeams(): Promise<NetMembership[]>

  /**
   * "아직 쓰고 있다" 는 흔적만 남긴다.
   *
   * `getMyTeams()` 도 같은 일을 하지만 그건 앱을 켤 때와 다시 붙을 때뿐이라, 켜 두고
   * 쓰는 사람은 며칠이고 흔적이 갱신되지 않는다. 어드민의 활동자 수가 거꾸로 기울지
   * 않게 하려고 따로 둔다.
   */
  touch(): Promise<void>

  setCharacter(teamId: string, characterKey: string): Promise<Member>
  setNickname(teamId: string, nickname: string): Promise<Member>
  renameTeam(teamId: string, name: string): Promise<Team>
  refreshInvite(teamId: string): Promise<Team>
  leaveTeam(teamId: string): Promise<void>

  connect(team: Team, member: Member): Promise<void>
  /** teamId 를 주면 그 팀만, 없으면 전부 끊는다 */
  disconnect(teamId?: string): Promise<void>
  connectedTeamIds(): string[]

  /** toMemberId 가 없거나 null 이면 그 팀 전원에게 */
  sendTap(payload: { teamId: string; toMemberId?: string | null }): Promise<void>
  announceRosterChange(teamId: string): Promise<void>
  onlineIn(teamId: string): string[]

  on: Emitter<NetEvents>['on']
}

export interface NetConfig {
  url?: string
  anonKey?: string
  /** Supabase 가 세션을 넣어 둘 자리 (`main/store.ts` 의 authStorage) */
  storage?: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }
}

/** 설정에 맞는 Net 구현을 만든다 */
export function createNet(config: NetConfig): Net {
  // 개발용: Supabase 없이 UI 전체를 눌러보고 싶을 때 (같은 프로세스 안에서만 통한다)
  if (process.env.BUDDLING_FAKE_NET) {
    // 진짜 쪽은 익명 로그인이 신원을 만들어 준다. 여기서는 흉내만 내면 된다.
    return createFakeNet({ server: createFakeServer(), userId: randomUUID() })
  }

  if (!config.url || !config.anonKey) {
    throw new Error('error.missingConfig')
  }
  return createSupabaseNet({ url: config.url, anonKey: config.anonKey, storage: config.storage })
}
