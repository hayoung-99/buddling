import { supabase } from './supabase'

/**
 * 어드민이 읽는 집계의 모양.
 *
 * 이 타입들은 `supabase/schema.sql` 의 `admin_*` 함수가 만드는 JSON 과 짝이다.
 * **한쪽을 고치면 다른 쪽도 고쳐야 한다** — 여기서 컴파일러가 잡아 주지 못하는 유일한
 * 이음매라, 함수 이름과 열쇠를 그대로 옮겨 적어 두었다.
 */

export interface Overview {
  teams: number
  members: number
  /** 팀에 속한 **사람** 수. 아래 accounts 와 다르다 */
  people: number
  accounts: { total: number; anonymous: number }
  /** 마지막 흔적이 얼마나 최근인가 */
  active: { d1: number; d7: number; d30: number }
  /** 혼자만 있는 팀 */
  solo: number
  recent: { teams7: number; members7: number; teams30: number; members30: number }
  generatedAt: string
}

export interface DailyRow {
  date: string
  newTeams: number
  newMembers: number
}

export interface Distribution {
  teamSizes: { size: number; teams: number }[]
  characters: { key: string; members: number }[]
  lastSeen: { today: number; week: number; month: number; older: number }
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
export const fetchIsAdmin = () => call<boolean>('is_admin')
