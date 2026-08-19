/**
 * 테스트용 인메모리 Net.
 *
 * supabase/schema.sql 의 RPC와 같은 규칙(초대코드 검증, 닉네임 중복, 팀 개수 제한)을
 * 그대로 흉내 내고, 브로드캐스트는 같은 팀에 연결된 다른 클라이언트에게 바로 전달한다.
 * 덕분에 Supabase 없이도 "A가 클릭하면 B가 반응한다"를 검증할 수 있다.
 */

import { createEmitter } from './emitter'
import type { Net, NetEvents, NetMembership } from './net'
import type { Member, Team } from '@tap-tap/shared/state'

/** 서버 안에서만 쓰는 팀. 밖으로 나갈 때는 `publicTeam` 이 `Team` 모양으로 깎는다. */
interface StoredTeam {
  id: string
  name: string
  inviteCode: string
  /** 밀리초. 밖으로 나갈 때 ISO 문자열이 된다. */
  inviteExpiresAt: number
}

/** 서버 안에서만 쓰는 멤버. `userId` 는 밖으로 내보내지 않는다. */
interface StoredMember extends Member {
  teamId: string
  userId: string
}

/** 붙어 있는 클라이언트 하나 */
interface Connection {
  teamId: string
  memberId: string
  userId: string
  deliver(event: 'tap' | 'roster', payload: Record<string, unknown>): void
  presence(onlineIds: string[]): void
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 초대코드 길이 (schema.sql 의 gen_invite_code 와 맞춘다) */
const CODE_LENGTH = 8

/** 한 사람이 동시에 속할 수 있는 팀 수 (schema.sql 의 max_teams_per_user 와 맞춘다) */
const MAX_TEAMS_PER_USER = 3

/** 팀 하나에 들어갈 수 있는 사람 수 (schema.sql 의 max_members_per_team 과 맞춘다) */
const MAX_MEMBERS_PER_TEAM = 5

/** 초대코드가 살아있는 시간 (schema.sql 의 invite_ttl 과 맞춘다) */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * 여러 클라이언트가 공유하는 가짜 서버 하나.
 * `now` 를 갈아끼우면 시간을 앞으로 돌려 만료를 테스트할 수 있다.
 */
function createFakeServer({ random = Math.random, now = () => Date.now() } = {}) {
  const teams = new Map<string, StoredTeam>()
  const codes = new Map<string, string>()
  /** `${teamId}:${userId}` → 멤버 */
  const members = new Map<string, StoredMember>()
  const connections = new Map<string, Set<Connection>>()
  let sequence = 0

  const nextId = () => `id-${(sequence += 1)}`
  const key = (teamId: string, userId: string) => `${teamId}:${userId}`

  function generateInviteCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = ''
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
      }
      if (!codes.has(code)) return code
    }
    throw new Error('CODE_GENERATION_FAILED')
  }

  const publicTeam = (team: StoredTeam): Team => ({
    id: team.id,
    name: team.name,
    inviteCode: team.inviteCode,
    inviteExpiresAt: new Date(team.inviteExpiresAt).toISOString(),
  })
  const publicMember = (member: StoredMember): Member => ({
    id: member.id,
    nickname: member.nickname,
    characterKey: member.characterKey,
  })

  const membersOf = (teamId: string): Member[] =>
    [...members.values()].filter((m) => m.teamId === teamId).map(publicMember)

  const teamsOf = (userId: string) => [...members.values()].filter((m) => m.userId === userId)

  const membership = (member: StoredMember): NetMembership => ({
    team: publicTeam(teams.get(member.teamId)!),
    member: publicMember(member),
    members: membersOf(member.teamId),
  })

  function broadcast(
    teamId: string,
    event: 'tap' | 'roster',
    payload: Record<string, unknown>,
    exceptMemberId?: string,
  ) {
    for (const connection of connections.get(teamId) ?? []) {
      if (connection.memberId === exceptMemberId) continue
      connection.deliver(event, { ...payload, teamId })
    }
  }

  function syncPresence(teamId: string) {
    const onlineIds = [...(connections.get(teamId) ?? [])].map((c) => c.memberId)
    for (const connection of connections.get(teamId) ?? []) connection.presence(onlineIds)
  }

  return {
    teams,
    members,
    MAX_TEAMS_PER_USER,
    MAX_MEMBERS_PER_TEAM,

    createTeam({
      userId,
      name,
      nickname,
      characterKey,
    }: {
      userId: string
      name?: string
      nickname: string
      characterKey?: string
    }): NetMembership {
      if (!nickname?.trim()) throw new Error('NICKNAME_REQUIRED')
      if (!userId?.trim()) throw new Error('NOT_SIGNED_IN')
      if (teamsOf(userId).length >= MAX_TEAMS_PER_USER) throw new Error('TEAM_LIMIT_REACHED')

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
        userId,
        nickname: nickname.trim(),
        characterKey: characterKey ?? 'cat',
      }
      members.set(key(team.id, userId), member)
      return membership(member)
    },

    joinTeam({
      userId,
      inviteCode,
      nickname,
      characterKey,
    }: {
      userId: string
      inviteCode: string
      nickname: string
      characterKey?: string
    }): NetMembership {
      if (!nickname?.trim()) throw new Error('NICKNAME_REQUIRED')
      const teamId = codes.get(String(inviteCode ?? '').trim().toUpperCase())
      if (!teamId) throw new Error('INVALID_INVITE_CODE')
      if (teams.get(teamId)!.inviteExpiresAt <= now()) throw new Error('INVITE_EXPIRED')

      const taken = [...members.values()].some(
        (m) => m.teamId === teamId && m.nickname === nickname.trim() && m.userId !== userId,
      )
      if (taken) throw new Error('NICKNAME_TAKEN')

      const existing = members.get(key(teamId, userId))
      if (existing) {
        // 이미 들어와 있는 팀이면 닉네임·캐릭터만 새로 맞춘다
        existing.nickname = nickname.trim()
        if (characterKey) existing.characterKey = characterKey
        return membership(existing)
      }

      if (teamsOf(userId).length >= MAX_TEAMS_PER_USER) throw new Error('TEAM_LIMIT_REACHED')
      if (membersOf(teamId).length >= MAX_MEMBERS_PER_TEAM) throw new Error('TEAM_FULL')

      const member = {
        id: nextId(),
        teamId,
        userId,
        nickname: nickname.trim(),
        characterKey: characterKey ?? 'cat',
      }
      members.set(key(teamId, userId), member)
      return membership(member)
    },

    getMyTeams({ userId }: { userId: string }): NetMembership[] {
      return teamsOf(userId).map(membership)
    },

    setCharacter({
      userId,
      teamId,
      characterKey,
    }: {
      userId: string
      teamId: string
      characterKey: string
    }): Member {
      const member = members.get(key(teamId, userId))
      if (!member) throw new Error('NOT_A_MEMBER')
      member.characterKey = characterKey
      return publicMember(member)
    },

    setNickname({
      userId,
      teamId,
      nickname,
    }: {
      userId: string
      teamId: string
      nickname: string
    }): Member {
      const name = String(nickname ?? '').trim()
      if (!name) throw new Error('NICKNAME_REQUIRED')
      const member = members.get(key(teamId, userId))
      if (!member) throw new Error('NOT_A_MEMBER')
      const taken = [...members.values()].some(
        (m) => m.teamId === teamId && m.nickname === name && m.userId !== userId,
      )
      if (taken) throw new Error('NICKNAME_TAKEN')
      member.nickname = name
      return publicMember(member)
    },

    renameTeam({ userId, teamId, name }: { userId: string; teamId: string; name: string }): Team {
      if (!members.has(key(teamId, userId))) throw new Error('NOT_A_MEMBER')
      const clean = String(name ?? '').trim()
      if (!clean) throw new Error('TEAM_NAME_REQUIRED')
      // 멤버가 있다는 것을 위에서 확인했으므로 팀도 반드시 있다
      const team = teams.get(teamId)!
      team.name = clean
      return publicTeam(team)
    },

    refreshInvite({ userId, teamId }: { userId: string; teamId: string }): Team {
      if (!members.has(key(teamId, userId))) throw new Error('NOT_A_MEMBER')
      const team = teams.get(teamId)!
      codes.delete(team.inviteCode) // 예전 코드는 그 즉시 못 쓰게 된다
      team.inviteCode = generateInviteCode()
      team.inviteExpiresAt = now() + INVITE_TTL_MS
      codes.set(team.inviteCode, teamId)
      return publicTeam(team)
    },

    leaveTeam({ userId, teamId }: { userId: string; teamId: string }) {
      members.delete(key(teamId, userId))

      // 마지막 사람이 나갔으면 빈 팀과 초대코드를 함께 지운다 (schema.sql 과 같은 규칙)
      const empty = ![...members.values()].some((m) => m.teamId === teamId)
      if (empty) {
        const team = teams.get(teamId)
        if (team) codes.delete(team.inviteCode)
        teams.delete(teamId)
        connections.delete(teamId)
      }
    },

    attach(connection: Connection) {
      // 진짜 서버에서는 realtime.messages 정책이 이 판단을 한다. 여기서 흉내 내지 않으면
      // "남의 팀 채널에 못 붙는다"를 테스트가 증명하지 못한다.
      if (!members.has(key(connection.teamId, connection.userId))) {
        throw new Error('NOT_A_MEMBER')
      }
      if (!connections.has(connection.teamId)) connections.set(connection.teamId, new Set())
      connections.get(connection.teamId)!.add(connection)
      syncPresence(connection.teamId)
    },

    detach(connection: Connection) {
      connections.get(connection.teamId)?.delete(connection)
      syncPresence(connection.teamId)
    },

    broadcast,
  }
}

/** 가짜 서버에 붙는 클라이언트 하나. Net 인터페이스를 만족한다. */
/**
 * 반환값에 `Net` 을 적어 두면 아래 메서드들의 인자 타입이 저절로 따라오고,
 * `supabase-net` 과 모양이 어긋나는 순간 컴파일러가 잡는다.
 */
function createFakeNet({
  server,
  userId,
}: {
  server: ReturnType<typeof createFakeServer>
  userId: string
}): Net {
  const emitter = createEmitter<NetEvents>()
  const rooms = new Map<string, { connection: Connection; member: Member }>()

  async function disconnect(teamId?: string) {
    const targets = teamId === undefined ? [...rooms.keys()] : rooms.has(teamId) ? [teamId] : []
    for (const id of targets) {
      const { connection } = rooms.get(id)!
      rooms.delete(id)
      server.detach(connection)
    }
  }

  return {
    on: emitter.on,

    async createTeam(payload) {
      return server.createTeam({ userId, ...payload })
    },
    async joinTeam(payload) {
      return server.joinTeam({ userId, ...payload })
    },
    async getMyTeams() {
      return server.getMyTeams({ userId })
    },
    async setCharacter(teamId, characterKey) {
      const member = server.setCharacter({ userId, teamId, characterKey })
      const room = rooms.get(teamId)
      if (room) room.member = member
      return member
    },
    async setNickname(teamId, nickname) {
      const member = server.setNickname({ userId, teamId, nickname })
      const room = rooms.get(teamId)
      if (room) room.member = member
      await this.announceRosterChange(teamId)
      return member
    },

    async renameTeam(teamId, name) {
      const team = server.renameTeam({ userId, teamId, name })
      await this.announceRosterChange(teamId)
      return team
    },

    async refreshInvite(teamId) {
      const team = server.refreshInvite({ userId, teamId })
      await this.announceRosterChange(teamId)
      return team
    },

    async leaveTeam(teamId) {
      // 지우고 → 알리고 → 끊는다 (supabase-net 과 같은 순서)
      server.leaveTeam({ userId, teamId })
      await this.announceRosterChange(teamId)
      await disconnect(teamId)
    },

    async connect(team, member) {
      await disconnect(team.id)
      const connection: Connection = {
        teamId: team.id,
        memberId: member.id,
        userId,
        deliver: (event, payload) => {
          // 한 사람만 콕 찌른 경우 나머지는 무시한다 (supabase-net 과 같은 규칙)
          if (event === 'tap' && payload.toMemberId && payload.toMemberId !== member.id) return
          // 서버는 이벤트마다 다른 것을 싣는다. 어느 쪽인지는 `event` 가 정하므로
          // 여기서 한 번 좁혀 준다 (`supabase-net` 은 채널이 갈라 줘서 이럴 일이 없다).
          if (event === 'tap') emitter.emit('tap', payload as unknown as NetEvents['tap'])
          else emitter.emit('roster', payload as unknown as NetEvents['roster'])
        },
        presence: (onlineIds) => emitter.emit('presence', { teamId: team.id, onlineIds }),
      }
      // 붙는 데 실패하면 방을 남기지 않는다 — 반쯤 열린 방이 남으면 다음 연결이
      // 이미 붙어 있는 줄 알고 건너뛴다 (supabase-net 도 같은 이유로 되돌린다)
      server.attach(connection)
      rooms.set(team.id, { connection, member })
      emitter.emit('status', { teamId: team.id, status: 'SUBSCRIBED' })
    },

    disconnect,

    /** 지금 붙어 있는 팀들 (supabase-net 과 같은 규약) */
    connectedTeamIds: () => [...rooms.keys()],

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
      return rooms.has(teamId) ? [rooms.get(teamId)!.connection.memberId] : []
    },
  }
}

export {
  createFakeServer,
  createFakeNet,
  MAX_TEAMS_PER_USER,
  MAX_MEMBERS_PER_TEAM,
  INVITE_TTL_MS,
}
