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

const { createClient } = require('@supabase/supabase-js')
const WebSocket = require('ws')
const { createEmitter, toFriendlyError } = require('./net')

const TAP_EVENT = 'tap'
const ROSTER_EVENT = 'roster'

function createSupabaseNet({ url, anonKey, deviceId }) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      // Electron 메인 프로세스의 Node 에는 전역 WebSocket 이 없을 수 있어 직접 넘긴다
      transport: WebSocket,
      params: { eventsPerSecond: 20 },
    },
  })

  const emitter = createEmitter()
  /** teamId → { channel, member } */
  const rooms = new Map()

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args)
    if (error) throw toFriendlyError(error)
    return data
  }

  function onlineIn(teamId) {
    const room = rooms.get(teamId)
    if (!room) return []
    return Object.values(room.channel.presenceState())
      .flat()
      .map((entry) => entry.memberId)
      .filter(Boolean)
  }

  async function connect(team, member) {
    await disconnect(team.id)

    const channel = client.channel(`team:${team.id}`, {
      config: {
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

    await new Promise((resolve, reject) => {
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
  }

  /** teamId 를 주면 그 팀만, 없으면 전부 끊는다 */
  async function disconnect(teamId = null) {
    const targets = teamId === null ? [...rooms.keys()] : rooms.has(teamId) ? [teamId] : []
    for (const id of targets) {
      const { channel } = rooms.get(id)
      rooms.delete(id)
      await client.removeChannel(channel)
    }
  }

  function requireRoom(teamId) {
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
        p_device_id: deviceId,
        p_character_key: characterKey,
      })
    },

    async joinTeam({ inviteCode, nickname, characterKey }) {
      return rpc('join_team', {
        p_invite_code: inviteCode,
        p_nickname: nickname,
        p_device_id: deviceId,
        p_character_key: characterKey,
      })
    },

    /** @returns {Promise<Array<{team, member, members}>>} */
    async getMyTeams() {
      return (await rpc('get_my_teams', { p_device_id: deviceId })) ?? []
    },

    async setCharacter(teamId, characterKey) {
      const member = await rpc('set_character', {
        p_device_id: deviceId,
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
        p_device_id: deviceId,
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
        p_device_id: deviceId,
        p_team_id: teamId,
        p_name: name,
      })
      await this.announceRosterChange(teamId)
      return team
    },

    /** 초대코드를 새로 발급한다. 예전 코드는 그 즉시 못 쓰게 된다. */
    async refreshInvite(teamId) {
      const team = await rpc('refresh_invite', { p_device_id: deviceId, p_team_id: teamId })
      await this.announceRosterChange(teamId)
      return team
    },

    async leaveTeam(teamId) {
      // 순서가 중요하다: 먼저 지우고, 그다음 알려야 남은 사람들이 다시 불러올 때
      // 이미 빠진 상태를 본다. 알린 뒤에 채널을 닫는다.
      await rpc('leave_team', { p_device_id: deviceId, p_team_id: teamId })
      const room = rooms.get(teamId)
      if (room) {
        await room.channel.send({ type: 'broadcast', event: ROSTER_EVENT, payload: {} })
      }
      await disconnect(teamId)
    },

    connect,
    disconnect,

    async sendTap({ teamId, toMemberId = null }) {
      const room = requireRoom(teamId)
      await room.channel.send({
        type: 'broadcast',
        event: TAP_EVENT,
        payload: {
          fromMemberId: room.member.id,
          fromNickname: room.member.nickname,
          toMemberId,
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

module.exports = { createSupabaseNet }
