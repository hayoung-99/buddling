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
  /**
   * 그 방 캐릭터가 지금 화면에서 치워져 있는가 (기획서 "숨기기는 한 마리씩").
   *
   * **`PetSettings` 안에 두지 않는다.** 저쪽은 저장 파일에 그대로 적히는 칸인데, 이
   * 값은 앱이 켜져 있는 동안만 산다 — 껐다 켜면 캐릭터가 전부 나온다. 같은 자리에
   * 두면 다음 사람이 자연스럽게 저장하게 되고, 그때 고장은 "지난주에 숨긴 캐릭터가
   * 오늘 안 나온다" 로 나타난다.
   *
   * **`asleep` 과 아무 관계가 없다.** 재우기는 받는 것을, 숨기기는 보이는 것을
   * 다룬다. 한쪽을 건드려 다른 쪽이 따라 바뀌는 자리는 없다.
   */
  hidden: boolean
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
 * 알림 화면에 쌓이는 사건 한 줄의 종류(기획서 "알림 화면").
 *
 * `kicked-me` 만 내 기기에 남는다 — 내가 내보내진 방은 이미 그 방의 멤버가 아니라
 * 서버에서 읽을 수 없다. 나머지 셋은 서버가 적어 둔 줄을 그대로 받아 그린다.
 */
export type NotificationKind = 'kicked-me' | 'joined' | 'left' | 'kicked'

/**
 * 알림 화면에 쌓이는 사건 한 줄.
 *
 * **방마다 하나로 묶지 않는다.** 같은 방에서 두 번 내보내지면 줄도 둘이다 — 서로
 * 다른 두 번의 일이고, 뒤의 것으로 앞의 것을 덮으면 아직 보지 못한 줄이 사라질 수
 * 있다. `id` 가 있어야 그 여러 줄 중 하나만 지울 수 있다.
 */
export interface NotificationEntry {
  id: string
  kind: NotificationKind
  teamId: string
  /** 그때 그 방을 부르던 이름 — 그때 무엇이 있었는지 말하는 값이라, 나중에
   *  팀 이름이 바뀌거나 같은 방에서 또 내보내져도 이 줄은 그대로다 */
  teamName: string
  /** 그 줄의 주인공. `kicked-me` 에는 없다 — 주인공이 나이기 때문이다 */
  nickname?: string
  /** 방장이 나가서 내가 방장이 된 줄에만 붙는다. 그 방에서의 내 닉네임 */
  newHostNickname?: string | null
  /** epoch ms. 서버 줄은 서버가 적은 때, `kicked-me` 는 앱이 알아챈 때. 정렬(최신이
   *  위)과 안읽음 판정에 쓴다 */
  at: number
}

/**
 * 알림이 살아 있는 기간.
 *
 * **`supabase/schema.sql` 의 `cleanup_team_events` · `get_my_events` 와 짝이다.**
 * SQL 은 이 상수를 읽지 못하므로 한쪽만 고치면 조용히 어긋난다
 * (`CLAUDE.md` 의 "같은 숫자가 세 곳에 있다" 표 참고).
 */
export const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
  /**
   * 지금 서버에 닿지 못하는가 (기획서 "인터넷이 없을 때").
   *
   * 방마다의 `Membership.connection` 과 **다른 층이다** — 저쪽은 그 방의 실시간
   * 채널이고, 이것은 앱 전체가 서버에 닿는지다. 방 하나가 말썽인 것은 오프라인이
   * 아니고, 방이 하나도 없는 사람도 오프라인일 수 있다.
   *
   * 접속 정보가 아예 없는 빌드는 여기서 **false 다.** 그건 인터넷 문제가 아니라 앱이
   * 완성되지 않은 것이라 `configured` 가 따로 가른다.
   *
   * **알림 창은 이 값을 보지 않는다** (기획서 "알림 화면").
   */
  offline: boolean
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
