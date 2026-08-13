/**
 * 테스트용 인메모리 Net.
 *
 * supabase/schema.sql 의 RPC와 같은 규칙(초대코드 검증, 닉네임 중복, 팀 개수 제한)을
 * 그대로 흉내 내고, 브로드캐스트는 같은 팀에 연결된 다른 클라이언트에게 바로 전달한다.
 * 덕분에 Supabase 없이도 "A가 클릭하면 B가 반응한다"를 검증할 수 있다.
 */

const { createEmitter } = require('./net')

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 한 기기가 동시에 속할 수 있는 팀 수 (schema.sql 의 max_teams_per_device 와 맞춘다) */
const MAX_TEAMS_PER_DEVICE = 3

/** 팀 하나에 들어갈 수 있는 사람 수 (schema.sql 의 max_members_per_team 과 맞춘다) */
const MAX_MEMBERS_PER_TEAM = 5

/** 초대코드가 살아있는 시간 (schema.sql 의 invite_ttl 과 맞춘다) */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * 여러 클라이언트가 공유하는 가짜 서버 하나.
 * `now` 를 갈아끼우면 시간을 앞으로 돌려 만료를 테스트할 수 있다.
 */
function createFakeServer({ random = Math.random, now = () => Date.now() } = {}) {
  const teams = new Map() // teamId → { id, name, inviteCode }
  const codes = new Map() // inviteCode → teamId
  const members = new Map() // `${teamId}:${deviceId}` → { id, teamId, deviceId, nickname, characterKey }
  const connections = new Map() // teamId → Set<connection>
  let sequence = 0

  const nextId = () => `id-${(sequence += 1)}`
  const key = (teamId, deviceId) => `${teamId}:${deviceId}`

  function generateInviteCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = ''
      for (let i = 0; i < 6; i += 1) {
        code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
      }
      if (!codes.has(code)) return code
    }
    throw new Error('CODE_GENERATION_FAILED')
  }

  const publicTeam = (team) => ({
    id: team.id,
    name: team.name,
    inviteCode: team.inviteCode,
    inviteExpiresAt: new Date(team.inviteExpiresAt).toISOString(),
  })
  const publicMember = (member) => ({
    id: member.id,
    nickname: member.nickname,
    characterKey: member.characterKey,
  })

  const membersOf = (teamId) =>
    [...members.values()].filter((m) => m.teamId === teamId).map(publicMember)

  const teamsOf = (deviceId) => [...members.values()].filter((m) => m.deviceId === deviceId)

  const membership = (member) => ({
    team: publicTeam(teams.get(member.teamId)),
    member: publicMember(member),
    members: membersOf(member.teamId),
  })

  function broadcast(teamId, event, payload, exceptMemberId) {
    for (const connection of connections.get(teamId) ?? []) {
      if (connection.memberId === exceptMemberId) continue
      connection.deliver(event, { ...payload, teamId })
    }
  }

  function syncPresence(teamId) {
    const onlineIds = [...(connections.get(teamId) ?? [])].map((c) => c.memberId)
    for (const connection of connections.get(teamId) ?? []) connection.presence(onlineIds)
  }

  return {
    teams,
    members,
    MAX_TEAMS_PER_DEVICE,
    MAX_MEMBERS_PER_TEAM,

    createTeam({ deviceId, name, nickname, characterKey }) {
      if (!nickname?.trim()) throw new Error('NICKNAME_REQUIRED')
      if (!deviceId?.trim()) throw new Error('DEVICE_ID_REQUIRED')
      if (teamsOf(deviceId).length >= MAX_TEAMS_PER_DEVICE) throw new Error('TEAM_LIMIT_REACHED')

      const team = {
        id: nextId(),
        name: name?.trim() || '우리 팀',
        inviteCode: generateInviteCode(),
        inviteExpiresAt: now() + INVITE_TTL_MS,
      }
      teams.set(team.id, team)
      codes.set(team.inviteCode, team.id)

      const member = {
        id: nextId(),
        teamId: team.id,
        deviceId,
        nickname: nickname.trim(),
        characterKey: characterKey ?? 'cat',
      }
      members.set(key(team.id, deviceId), member)
      return membership(member)
    },

    joinTeam({ deviceId, inviteCode, nickname, characterKey }) {
      if (!nickname?.trim()) throw new Error('NICKNAME_REQUIRED')
      const teamId = codes.get(String(inviteCode ?? '').trim().toUpperCase())
      if (!teamId) throw new Error('INVALID_INVITE_CODE')
      if (teams.get(teamId).inviteExpiresAt <= now()) throw new Error('INVITE_EXPIRED')

      const taken = [...members.values()].some(
        (m) => m.teamId === teamId && m.nickname === nickname.trim() && m.deviceId !== deviceId,
      )
      if (taken) throw new Error('NICKNAME_TAKEN')

      const existing = members.get(key(teamId, deviceId))
      if (existing) {
        // 이미 들어와 있는 팀이면 닉네임·캐릭터만 새로 맞춘다
        existing.nickname = nickname.trim()
        if (characterKey) existing.characterKey = characterKey
        return membership(existing)
      }

      if (teamsOf(deviceId).length >= MAX_TEAMS_PER_DEVICE) throw new Error('TEAM_LIMIT_REACHED')
      if (membersOf(teamId).length >= MAX_MEMBERS_PER_TEAM) throw new Error('TEAM_FULL')

      const member = {
        id: nextId(),
        teamId,
        deviceId,
        nickname: nickname.trim(),
        characterKey: characterKey ?? 'cat',
      }
      members.set(key(teamId, deviceId), member)
      return membership(member)
    },

    getMyTeams({ deviceId }) {
      return teamsOf(deviceId).map(membership)
    },

    setCharacter({ deviceId, teamId, characterKey }) {
      const member = members.get(key(teamId, deviceId))
      if (!member) throw new Error('NOT_A_MEMBER')
      member.characterKey = characterKey
      return publicMember(member)
    },

    setNickname({ deviceId, teamId, nickname }) {
      const name = String(nickname ?? '').trim()
      if (!name) throw new Error('NICKNAME_REQUIRED')
      const member = members.get(key(teamId, deviceId))
      if (!member) throw new Error('NOT_A_MEMBER')
      const taken = [...members.values()].some(
        (m) => m.teamId === teamId && m.nickname === name && m.deviceId !== deviceId,
      )
      if (taken) throw new Error('NICKNAME_TAKEN')
      member.nickname = name
      return publicMember(member)
    },

    renameTeam({ deviceId, teamId, name }) {
      if (!members.has(key(teamId, deviceId))) throw new Error('NOT_A_MEMBER')
      const clean = String(name ?? '').trim()
      if (!clean) throw new Error('TEAM_NAME_REQUIRED')
      const team = teams.get(teamId)
      team.name = clean
      return publicTeam(team)
    },

    refreshInvite({ deviceId, teamId }) {
      if (!members.has(key(teamId, deviceId))) throw new Error('NOT_A_MEMBER')
      const team = teams.get(teamId)
      codes.delete(team.inviteCode) // 예전 코드는 그 즉시 못 쓰게 된다
      team.inviteCode = generateInviteCode()
      team.inviteExpiresAt = now() + INVITE_TTL_MS
      codes.set(team.inviteCode, teamId)
      return publicTeam(team)
    },

    leaveTeam({ deviceId, teamId }) {
      members.delete(key(teamId, deviceId))

      // 마지막 사람이 나갔으면 빈 팀과 초대코드를 함께 지운다 (schema.sql 과 같은 규칙)
      const empty = ![...members.values()].some((m) => m.teamId === teamId)
      if (empty) {
        const team = teams.get(teamId)
        if (team) codes.delete(team.inviteCode)
        teams.delete(teamId)
        connections.delete(teamId)
      }
    },

    attach(connection) {
      if (!connections.has(connection.teamId)) connections.set(connection.teamId, new Set())
      connections.get(connection.teamId).add(connection)
      syncPresence(connection.teamId)
    },

    detach(connection) {
      connections.get(connection.teamId)?.delete(connection)
      syncPresence(connection.teamId)
    },

    broadcast,
  }
}

/** 가짜 서버에 붙는 클라이언트 하나. Net 인터페이스를 만족한다. */
function createFakeNet({ server, deviceId }) {
  const emitter = createEmitter()
  /** teamId → { connection, member } */
  const rooms = new Map()

  async function disconnect(teamId = null) {
    const targets = teamId === null ? [...rooms.keys()] : rooms.has(teamId) ? [teamId] : []
    for (const id of targets) {
      const { connection } = rooms.get(id)
      rooms.delete(id)
      server.detach(connection)
    }
  }

  return {
    on: emitter.on,

    async createTeam(payload) {
      return server.createTeam({ deviceId, ...payload })
    },
    async joinTeam(payload) {
      return server.joinTeam({ deviceId, ...payload })
    },
    async getMyTeams() {
      return server.getMyTeams({ deviceId })
    },
    async setCharacter(teamId, characterKey) {
      const member = server.setCharacter({ deviceId, teamId, characterKey })
      const room = rooms.get(teamId)
      if (room) room.member = member
      return member
    },
    async setNickname(teamId, nickname) {
      const member = server.setNickname({ deviceId, teamId, nickname })
      const room = rooms.get(teamId)
      if (room) room.member = member
      await this.announceRosterChange(teamId)
      return member
    },

    async renameTeam(teamId, name) {
      const team = server.renameTeam({ deviceId, teamId, name })
      await this.announceRosterChange(teamId)
      return team
    },

    async refreshInvite(teamId) {
      const team = server.refreshInvite({ deviceId, teamId })
      await this.announceRosterChange(teamId)
      return team
    },

    async leaveTeam(teamId) {
      // 지우고 → 알리고 → 끊는다 (supabase-net 과 같은 순서)
      server.leaveTeam({ deviceId, teamId })
      await this.announceRosterChange(teamId)
      await disconnect(teamId)
    },

    async connect(team, member) {
      await disconnect(team.id)
      const connection = {
        teamId: team.id,
        memberId: member.id,
        deliver: (event, payload) => {
          // 한 사람만 콕 찌른 경우 나머지는 무시한다 (supabase-net 과 같은 규칙)
          if (event === 'tap' && payload.toMemberId && payload.toMemberId !== member.id) return
          emitter.emit(event, payload)
        },
        presence: (onlineIds) => emitter.emit('presence', { teamId: team.id, onlineIds }),
      }
      rooms.set(team.id, { connection, member })
      server.attach(connection)
      emitter.emit('status', { teamId: team.id, status: 'SUBSCRIBED' })
    },

    disconnect,

    async sendTap({ teamId, toMemberId = null }) {
      const room = rooms.get(teamId)
      if (!room) throw new Error('error.notConnected')
      server.broadcast(
        teamId,
        'tap',
        {
          fromMemberId: room.member.id,
          fromNickname: room.member.nickname,
          toMemberId,
        },
        // 자기 자신에게는 되돌려 보내지 않는다 (로컬에서 이미 반응했다)
        room.member.id,
      )
    },

    async announceRosterChange(teamId) {
      const room = rooms.get(teamId)
      if (!room) return
      server.broadcast(teamId, 'roster', {}, room.member.id)
    },

    onlineIn(teamId) {
      return rooms.has(teamId) ? [rooms.get(teamId).connection.memberId] : []
    },
  }
}

module.exports = {
  createFakeServer,
  createFakeNet,
  MAX_TEAMS_PER_DEVICE,
  MAX_MEMBERS_PER_TEAM,
  INVITE_TTL_MS,
}
