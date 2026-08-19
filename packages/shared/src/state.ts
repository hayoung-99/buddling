/**
 * 메인 프로세스가 창들에게 보내는 상태의 모양.
 *
 * `src/main/session.js` 의 `snapshot()` 이 만드는 것과 같아야 한다. 메인은 아직
 * 자바스크립트라 컴파일러가 두 쪽을 맞대어 보지는 못하므로, 저쪽을 고치면 여기도
 * 함께 고쳐야 한다. 그래도 적어 두는 편이 낫다 — 화면 쪽 실수는 여기서 다 걸린다.
 */

export interface Team {
  id: string
  name: string
  inviteCode: string
  inviteExpiresAt: string | null
}

export interface Member {
  id: string
  nickname: string
  characterKey: string
  joinedAt?: string
}

/** 캐릭터 창의 자리와 크기. 팀마다 따로이고 내 화면에만 적용된다. */
export interface PetSettings {
  position: { x: number; y: number } | null
  scale: number
}

/** 실시간 채널이 지금 어떤 상태인가 */
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export interface Membership {
  team: Team
  member: Member
  members: Member[]
  onlineIds: string[]
  connection: ConnectionState
  pet: PetSettings
}

/**
 * 새 버전 소식.
 * `ready` 면 이미 받아 둔 것이라 곧바로 적용할 수 있고, 아니면 받으러 가야 한다.
 */
export interface UpdateInfo {
  version: string
  ready: boolean
  url: string | null
}

export interface AppState {
  /** Supabase 접속 정보가 있는가. 없으면 팀 창이 설정 방법을 안내한다. */
  configured: boolean
  configError: string | null
  nickname: string
  language: string
  power: string | null
  maxTeams: number
  maxMembers: number
  update: UpdateInfo | null
  memberships: Membership[]
}

/** 콕 찔렸을 때 캐릭터 창으로 오는 것 */
export interface TapPayload {
  teamId: string
  fromMemberId: string
  fromNickname: string
  toMemberId: string | null
}
