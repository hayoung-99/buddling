/**
 * 메인 프로세스가 창들에게 보내는 상태의 모양.
 *
 * `src/main/session.js` 의 `snapshot()` 이 만드는 것과 같아야 한다. 메인은 아직
 * 자바스크립트라 컴파일러가 두 쪽을 맞대어 보지는 못하므로, 저쪽을 고치면 여기도
 * 함께 고쳐야 한다. 그래도 적어 두는 편이 낫다 — 화면 쪽 실수는 여기서 다 걸린다.
 */

import type { SignalKind } from './signals'

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

/**
 * 캐릭터 창의 자리와 크기, 그리고 이 방에서 내가 보낼 신호.
 * 팀마다 따로이고 **내 화면에만 적용되는 개인 설정**이다 (서버로 나가지 않는다).
 */
export interface PetSettings {
  position: { x: number; y: number } | null
  scale: number
  /** 옛 저장 파일에는 없다. 없으면 기본 신호(콕)로 본다. */
  signal?: SignalKind
  /**
   * 이 방을 잠재워 두었는가.
   *
   * 재우면 그 방 캐릭터가 웅크려 자고 **오는 신호에 아무 반응도 하지 않는다.** 대신
   * 보내는 것은 막지 않는다 — 조용히 하고 싶은 것은 내 화면이지 상대의 화면이 아니다.
   *
   * 신호와 같은 자리에 두는 것은 성질이 같아서다. 방마다 따로이고, 내 기기에만 남고,
   * 서버로 나가지 않는다. 옛 저장 파일에는 없으므로 없으면 깨어 있는 것으로 본다.
   */
  asleep?: boolean
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

/**
 * 알림 화면에 쌓이는 사건 한 줄. 지금은 내보내진 것 하나뿐이다(기획서 "알림 화면").
 *
 * **방마다 하나로 묶지 않는다.** 같은 방에서 두 번 내보내지면 줄도 둘이다 — 서로
 * 다른 두 번의 일이고, 뒤의 것으로 앞의 것을 덮으면 아직 보지 못한 줄이 사라질 수
 * 있다. `id` 가 있어야 그 여러 줄 중 하나만 지울 수 있다.
 */
export interface NotificationEntry {
  id: string
  teamId: string
  /** 내보내질 당시 내가 부르던 이름 — 그때 무엇을 잃었는지 말하는 값이라, 나중에
   *  팀 이름이 바뀌거나 같은 방에서 또 내보내져도 이 줄은 그대로다 */
  teamName: string
  /** epoch ms. 정렬(최신이 위)과 안읽음 판정에 쓴다 */
  at: number
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
  /** 최신이 앞. 알림 창이 그대로 늘어놓는다 */
  notifications: NotificationEntry[]
  /** 지난번 알림 창을 연 뒤로 새로 온 것이 있는가 — 제목줄 아이콘의 빨간 점 */
  hasUnreadNotifications: boolean
}

/** 신호를 받았을 때 캐릭터 창으로 오는 것 */
export interface TapPayload {
  teamId: string
  fromMemberId: string
  fromNickname: string
  toMemberId: string | null
  /** 무슨 신호인가. 옛 버전이 보낸 것에는 없으므로 받는 쪽이 기본값으로 채운다. */
  signal?: SignalKind
}
