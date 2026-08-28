/**
 * Supabase로 구현한 Net.
 *
 * - 팀/멤버 정보: security definer RPC 호출 (테이블은 RLS로 잠겨 있다)
 * - "콕 찌르기": Realtime Broadcast. DB에 남기지 않는 일회성 이벤트라 가장 가볍다.
 * - 접속 여부: Realtime Presence
 *
 * 한 기기가 여러 팀에 속할 수 있으므로 채널도 팀마다 하나씩 연다.
 * 밖으로 나가는 이벤트에는 항상 teamId 가 붙어, 어느 팀에서 온 신호인지 알 수 있다.
 */

import { createClient } from '@supabase/supabase-js'
import { createEmitter } from './emitter'
import { toFriendlyError } from './errors'
import { withSessionRecovery } from './session-recovery'
import type { Net, NetConfig, NetEvent, NetEvents } from './net'
import type { Member, Team } from '@buddling/shared/state'
import { DEFAULT_SIGNAL } from '@buddling/shared/signals'
import type { RealtimeChannel } from '@supabase/supabase-js'

const TAP_EVENT = 'tap'
const ROSTER_EVENT = 'roster'

/**
 * 반환값에 `Net` 을 적어 두면, 그 아래 메서드들의 인자 타입이 저절로 따라온다.
 * 인터페이스와 어긋나는 순간 여기서 걸린다 — `fake-net` 과 짝이 맞는지도 함께 지켜진다.
 */
function createSupabaseNet({ url, anonKey, storage }: Required<Pick<NetConfig, 'url' | 'anonKey'>> & Pick<NetConfig, 'storage'>): Net {
  const client = createClient(url, anonKey, {
    auth: {
      // 세션이 곧 신원이다. 잃어버리면 팀에서 남남이 되므로 반드시 남겨야 한다.
      persistSession: true,
      autoRefreshToken: true,
      // Node 에는 주소창이 없다. 켜 두면 없는 URL 을 뒤지다 경고를 남긴다.
      detectSessionInUrl: false,
      // 안 주면 메모리에만 남는다 — 앱은 반드시 주고, 일회성 스크립트는 안 줘도 된다
      ...(storage ? { storage } : {}),
    },
    realtime: {
      // `transport` 를 주지 않는다. 예전에는 `ws` 꾸러미를 직접 넘겼는데, 그때는 Node 에
      // 전역 WebSocket 이 없었기 때문이다. 지금은 Electron 43 이 Node 24 를 싣고 오고
      // 스크립트가 도는 Node 도 22 라 양쪽 다 전역이 있으며, realtime-js 가 그걸 스스로
      // 찾는다. 억지로 넘기면 꾸러미 하나와 브라우저 WebSocket 과의 모양 차이를 메우는
      // 캐스팅만 떠안게 된다.
      params: { eventsPerSecond: 20 },
    },
  })

  const emitter = createEmitter<NetEvents>()

  /** 열려 있는 팀 채널 하나 */
  interface Room {
    channel: RealtimeChannel
    member: Member
  }

  const rooms = new Map<string, Room>()
  /** 로그인이 진행 중일 때의 약속. 계정이 여러 개 생기는 것을 막는다. */
  let signingIn: ReturnType<typeof client.auth.signInAnonymously> | null = null

  /**
   * 로그인 화면이 없는 앱이라, 기기마다 익명 계정을 하나 만들어 그것으로 자신을 증명한다.
   *
   * 예전에는 클라이언트가 지어낸 device_id 문자열을 서버가 그냥 믿었다. 지금은 서버가
   * 발급하고 서버가 검증하는 auth.uid() 를 쓴다 — 실시간 채널을 잠글 수 있는 것도
   * 심사할 신원이 생겼기 때문이다.
   *
   * 인터넷이 없으면 여기서 실패한다. 부르는 쪽(session.js)이 이미 재시도를 갖고 있으므로
   * 따로 붙잡지 않고 그대로 올려보낸다.
   */
  async function ensureSession() {
    const { data } = await client.auth.getSession()
    if (data.session) return data.session

    if (!signingIn) {
      signingIn = client.auth.signInAnonymously().finally(() => {
        signingIn = null
      })
    }
    // finally 가 signingIn 을 비우기 전에 붙잡아 둔다
    const pending = signingIn
    const { data: created, error } = await pending
    if (error) throw toFriendlyError(error)
    return created.session
  }

  /**
   * 쓸모없어진 세션을 버린다.
   *
   * `scope: 'local'` 인 이유 — 서버에 로그아웃을 알릴 상대가 이미 없다. 계정이 지워져서
   * 여기까지 온 것이라, 서버를 부르면 헛걸음이거나 오류로 끝난다. 저장된 것만 지우면
   * 다음 `ensureSession()` 이 새 익명 계정을 만든다.
   */
  async function forgetSession() {
    await client.auth.signOut({ scope: 'local' })
  }

  async function rpc(name: string, args?: Record<string, unknown>) {
    return withSessionRecovery(async () => {
      await ensureSession()
      const { data, error } = await client.rpc(name, args)
      if (error) throw toFriendlyError(error)
      return data
    }, forgetSession)
  }

  function onlineIn(teamId: string): string[] {
    const room = rooms.get(teamId)
    if (!room) return []
    return Object.values(room.channel.presenceState())
      .flat()
      .map((entry) => (entry as { memberId?: string }).memberId)
      .filter((id): id is string => Boolean(id))
  }

  async function connect(team: Team, member: Member) {
    await disconnect(team.id)

    // 붙기 전에 세션이 있어야 한다. private 채널은 토큰을 보고 들여보낼지 정한다.
    await ensureSession()

    const channel = client.channel(`team:${team.id}`, {
      config: {
        // 이 한 줄이 "누구나 들을 수 있는 방"을 "팀원만 들어오는 방"으로 바꾼다.
        // 실제 심사는 서버가 realtime.messages 정책으로 한다 (supabase/schema.sql).
        private: true,
        broadcast: { self: false },
        presence: { key: member.id },
      },
    })

    channel.on('broadcast', { event: TAP_EVENT }, ({ payload }) => {
      // 나에게 온 것이거나 팀 전체에게 보낸 것만 반응한다
      if (payload.toMemberId && payload.toMemberId !== member.id) return
      emitter.emit('tap', { ...payload, teamId: team.id })
    })

    channel.on('broadcast', { event: ROSTER_EVENT }, () =>
      emitter.emit('roster', { teamId: team.id }),
    )

    channel.on('presence', { event: 'sync' }, () =>
      emitter.emit('presence', { teamId: team.id, onlineIds: onlineIn(team.id) }),
    )

    rooms.set(team.id, { channel, member })

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('error.realtimeTimeout')),
          15000,
        )

        channel.subscribe(async (status, error) => {
          emitter.emit('status', { teamId: team.id, status })
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            await channel.track({
              memberId: member.id,
              nickname: member.nickname,
              characterKey: member.characterKey,
            })
            resolve()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout)
            reject(toFriendlyError(error ?? new Error(status)))
          }
        })
      })
    } catch (error) {
      // 한 번도 붙지 못한 채널을 그냥 두면, Supabase 쪽에서 프로세스가 끝날 때까지
      // 10초마다 재조인을 시도한다. 여기서 걷어내고 다시 붙이는 일은 부르는 쪽에 맡긴다.
      await disconnect(team.id)
      throw error
    }
  }

  /** teamId 를 주면 그 팀만, 없으면 전부 끊는다 */
  async function disconnect(teamId?: string) {
    const targets = teamId === undefined ? [...rooms.keys()] : rooms.has(teamId) ? [teamId] : []
    for (const id of targets) {
      const { channel } = rooms.get(id)!
      rooms.delete(id)
      await client.removeChannel(channel)
    }
  }

  function requireRoom(teamId: string): Room {
    const room = rooms.get(teamId)
    if (!room) throw new Error('error.notConnected')
    return room
  }

  return {
    on: emitter.on,

    async createTeam({ name, nickname, characterKey }) {
      return rpc('create_team', {
        p_name: name,
        p_nickname: nickname,
        p_character_key: characterKey,
      })
    },

    async joinTeam({ inviteCode, nickname, characterKey }) {
      return rpc('join_team', {
        p_invite_code: inviteCode,
        p_nickname: nickname,
        p_character_key: characterKey,
      })
    },

    /** @returns {Promise<Array<{team, member, members}>>} */
    async getMyTeams() {
      return (await rpc('get_my_teams', {})) ?? []
    },

    /**
     * `get_my_events()` 는 이 앱보다 늦게 콘솔에 적용될 수 있다 — `supabase/schema.sql`
     * 은 사람이 손으로 실행하는 파일이다. 그래서 여기서는 오류를 삼키지 않고 그대로
     * 올려보낸다 — 삼키는 자리는 `main/session.ts` 의 `syncEvents()` 다. 거기서
     * 삼켜야 팀 목록 갱신(`getMyTeams`)까지 함께 막히지 않는다.
     */
    async getMyEvents() {
      return ((await rpc('get_my_events', {})) ?? []) as NetEvent[]
    },

    async touch() {
      await rpc('touch_member', {})
    },

    async setCharacter(teamId, characterKey) {
      const member = await rpc('set_character', {
        p_team_id: teamId,
        p_character_key: characterKey,
      })
      const room = rooms.get(teamId)
      if (room) {
        room.member = { ...room.member, characterKey }
        await room.channel.track({
          memberId: member.id,
          nickname: member.nickname,
          characterKey: member.characterKey,
        })
      }
      return member
    },

    /** 이 팀에서 쓰는 내 닉네임을 바꾼다 */
    async setNickname(teamId, nickname) {
      const member = await rpc('set_nickname', {
        p_team_id: teamId,
        p_nickname: nickname,
      })
      const room = rooms.get(teamId)
      if (room) {
        room.member = { ...room.member, nickname: member.nickname }
        await room.channel.track({
          memberId: member.id,
          nickname: member.nickname,
          characterKey: member.characterKey,
        })
      }
      await this.announceRosterChange(teamId)
      return member
    },

    /** 팀 이름을 바꾼다 */
    async renameTeam(teamId, name) {
      const team = await rpc('rename_team', {
        p_team_id: teamId,
        p_name: name,
      })
      await this.announceRosterChange(teamId)
      return team
    },

    /** 초대코드를 새로 발급한다. 예전 코드는 그 즉시 못 쓰게 된다. */
    async refreshInvite(teamId) {
      const team = await rpc('refresh_invite', { p_team_id: teamId })
      await this.announceRosterChange(teamId)
      return team
    },

    /** 방장만 부를 수 있다. 대상을 내보내고, 그 자리에서 초대코드를 새로 발급한다. */
    async kickMember(teamId, memberId) {
      const team = await rpc('kick_member', { p_team_id: teamId, p_member_id: memberId })
      await this.announceRosterChange(teamId)
      return team
    },

    async leaveTeam(teamId) {
      // 순서가 중요하다: 먼저 지우고, 그다음 알려야 남은 사람들이 다시 불러올 때
      // 이미 빠진 상태를 본다. 알린 뒤에 채널을 닫는다.
      await rpc('leave_team', { p_team_id: teamId })
      const room = rooms.get(teamId)
      if (room) {
        await room.channel.send({ type: 'broadcast', event: ROSTER_EVENT, payload: {} })
      }
      await disconnect(teamId)
    },

    connect,
    disconnect,

    /** 지금 채널이 열려 있는 팀들. 다시 붙여야 할 팀을 가려내는 데 쓴다. */
    connectedTeamIds: () => [...rooms.keys()],

    async sendTap({ teamId, toMemberId = null, signal = DEFAULT_SIGNAL }) {
      const room = requireRoom(teamId)
      await room.channel.send({
        type: 'broadcast',
        event: TAP_EVENT,
        payload: {
          fromMemberId: room.member.id,
          fromNickname: room.member.nickname,
          toMemberId,
          // 업데이트하지 않은 상대는 이 값을 모른 채 늘 춤춘다. 그래도 아무 일도
          // 일어나지 않는 것보다는 낫다 — 보낸 사람은 갔는지 알 길이 없다.
          signal,
        },
      })
    },

    /** 멤버 목록이 바뀌었으니 다시 불러오라고 팀에 알린다 */
    async announceRosterChange(teamId) {
      const room = rooms.get(teamId)
      if (!room) return
      await room.channel.send({ type: 'broadcast', event: ROSTER_EVENT, payload: {} })
    },

    onlineIn,
  }
}

export { createSupabaseNet }
