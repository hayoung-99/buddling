import { supabase } from './supabase'

/**
 * 어드민이 읽는 집계의 모양.
 *
 * 이 타입들은 `supabase/schema.sql` 의 `admin_*` 함수가 만드는 JSON 과 짝이다.
 * **한쪽을 고치면 다른 쪽도 고쳐야 한다** — 여기서 컴파일러가 잡아 주지 못하는 유일한
 * 이음매라, 함수 이름과 열쇠를 그대로 옮겨 적어 두었다.
 */

/** 기간별로 하나씩. `today` 의 날짜 경계는 한국 시간이다 */
interface Spread {
  today: number
  d7: number
  d30: number
}

export interface Overview {
  /**
   * 지금 켜 둔 사람과 팀 (최근 1시간 안에 흔적).
   *
   * 앱이 30분마다 흔적을 남기므로 켜 둔 사람은 이 창 안에 반드시 들어온다.
   * **다만 새 버전을 받기 전의 앱은 아직 12시간짜리라, 배포 직후 한동안은 실제보다
   * 적게 나온다.**
   */
  now: { people: number; teams: number }
  /** 실제로 쓰는 사람 — 최근 30일 안에 흔적이 있는 사람 */
  live: { people: number }
  /**
   * 누적 전체.
   *
   * **`total.teams` 가 곧 "쓰는 팀" 이다.** 마지막 사람이 나가면 `leave_team()` 이
   * 팀도 함께 지우므로, 남아 있는 팀은 반드시 사람이 있는 팀이다.
   */
  total: {
    teams: number
    /** 팀 자리 수. 한 사람이 두 팀에 들면 둘로 센다 */
    members: number
    /** 팀에 속한 **사람** 수. 아래 accounts 와 다르다 */
    people: number
  }
  accounts: {
    total: number
    anonymous: number
    /**
     * 깔았지만 팀까지 가지 못한 사람 = 온보딩 이탈.
     *
     * **누적이 아니라 최근 일주일치다** — 팀 없는 익명 계정은 7일이 지나면
     * `cleanup_anonymous_users()` 가 매일 새벽 3시에 지운다.
     */
    stranded: number
  }
  /** 마지막 흔적이 얼마나 최근인가 */
  active: { d1: number; d7: number; d30: number }
  /** 새로 생긴 팀과, 처음 팀에 들어온 사람 */
  fresh: { teams: Spread; people: Spread }
  /** 혼자만 있는 팀 */
  solo: number
  generatedAt: string
}

export interface DailyRow {
  date: string
  newTeams: number
  /** `members` 줄 수가 아니라 **그날 처음 팀에 들어온 사람** 수 */
  newPeople: number
}

export interface Distribution {
  teamSizes: { size: number; teams: number }[]
  characters: { key: string; members: number }[]
  lastSeen: { today: number; week: number; month: number; older: number }
}

export interface AdminTeamMember {
  nickname: string
  character: string
  joinedAt: string
  lastSeen: string
}

export interface AdminTeam {
  /** 화면에서 줄을 구별하는 열쇠. 팀 이름은 유일하지 않다 */
  id: string
  name: string
  createdAt: string
  /** 팀원 중 가장 최근 흔적. 아무도 온 적이 없으면 null */
  lastSeen: string | null
  members: AdminTeamMember[]
}

/**
 * 팀 목록.
 *
 * **여기에는 초대코드가 없다.** 그건 이름이 아니라 팀에 들어가는 열쇠라서, 팀 이름과
 * 함께 새면 남의 팀에 그대로 들어갈 수 있다. `supabase/schema.sql` 의 `admin_teams`
 * 가 애초에 내보내지 않으므로 화면에서 감추는 것이 아니라 오지를 않는다.
 */
export interface AdminTeams {
  /** 실제 팀 수. `teams.length` 와 다르면 잘린 것이다 */
  total: number
  /** 서버가 담아 준 최대 개수 */
  limit: number
  teams: AdminTeam[]
}

/**
 * RPC 하나를 부른다.
 *
 * 서버가 `FORBIDDEN` 을 던지면 그대로 올려보낸다. **화면에서 감추는 것과 서버가 막는
 * 것은 다른 일이고**, 실제로 막는 쪽은 서버다. 이 함수는 그 사실을 숨기지 않는다.
 */
async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const fetchOverview = () => call<Overview>('admin_overview')
export const fetchDaily = (days: number) => call<DailyRow[]>('admin_daily', { p_days: days })
export const fetchDistribution = () => call<Distribution>('admin_distribution')
export const fetchTeams = (limit: number) => call<AdminTeams>('admin_teams', { p_limit: limit })
export const fetchIsAdmin = () => call<boolean>('is_admin')
