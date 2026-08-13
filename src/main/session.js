/**
 * 앱의 상태 한 곳.
 *
 * 저장소(store) · 네트워크(net) · 창 사이를 잇는 유일한 지점이다.
 * 창들은 여기에만 말을 걸고, 서로를 직접 알지 못한다.
 *
 * 한 기기가 최대 3개 팀에 속할 수 있고, 팀마다 캐릭터 창이 하나씩 뜬다.
 * 그래서 이 안의 거의 모든 것이 teamId 를 키로 하는 모음이다.
 *
 * store 와 net 은 갈아끼울 수 있게 인자로 받는다. 그래야 Electron 없이 테스트할 수 있다.
 */

const { createNet, createEmitter, toFriendlyError } = require('../services/net')
const defaultStore = require('./store')
const { getLanguage } = require('./i18n')

const TAP_THROTTLE_MS = 300

/** 한 기기가 동시에 속할 수 있는 팀 수 (supabase/schema.sql 과 맞춘다) */
const MAX_TEAMS = 3

/** 팀 하나에 들어갈 수 있는 사람 수 (supabase/schema.sql 과 맞춘다) */
const MAX_MEMBERS = 5

function createSession({ url, anonKey, store = defaultStore, net: injectedNet = null }) {
  const emitter = createEmitter()
  const deviceId = store.get('deviceId')

  let net = null
  let netError = null
  /** teamId → { team, member, members } */
  let memberships = new Map()
  /** teamId → string[] */
  const onlineIds = new Map()
  /** teamId → 'idle' | 'connecting' | 'connected' | 'error' */
  const connections = new Map()
  /** teamId → 마지막으로 보낸 시각 */
  const lastTapAt = new Map()
  /** 새 버전이 나왔을 때 { version, url }. 없으면 null. */
  let update = null

  try {
    net = injectedNet ?? createNet({ url, anonKey, deviceId })
  } catch (error) {
    // 키가 없어도 앱은 뜬다. 캐릭터는 혼자 놀고, 팀 창이 설정 방법을 안내한다.
    netError = error.message
  }

  // 캐시된 소속으로 시작한다 — 네트워크를 기다리지 않고 캐릭터를 띄우기 위해서다
  for (const entry of store.get('memberships') ?? []) {
    memberships.set(entry.team.id, { ...entry, members: entry.members ?? [entry.member] })
  }

  if (net) {
    net.on('tap', (payload) => emitter.emit('tap', payload))
    net.on('roster', () => refresh())
    net.on('presence', ({ teamId, onlineIds: ids }) => {
      onlineIds.set(teamId, ids)
      publish()
    })
    net.on('status', ({ teamId, status }) => {
      // Realtime 은 끊기면 알아서 다시 붙는다. 그 사이 상태만 화면에 알려준다.
      connections.set(
        teamId,
        status === 'SUBSCRIBED'
          ? 'connected'
          : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
            ? 'error'
            : status === 'CLOSED'
              ? 'idle'
              : 'connecting',
      )
      publish()
    })
  }

  function snapshot() {
    return {
      configured: net !== null,
      configError: netError,
      deviceId,
      nickname: store.get('nickname'),
      language: getLanguage(),
      maxTeams: MAX_TEAMS,
      maxMembers: MAX_MEMBERS,
      update,
      memberships: [...memberships.values()].map((entry) => ({
        ...entry,
        onlineIds: onlineIds.get(entry.team.id) ?? [],
        connection: connections.get(entry.team.id) ?? 'idle',
        pet: store.pet(entry.team.id),
      })),
    }
  }

  function publish() {
    emitter.emit('teams', snapshot())
  }

  /** 소속이 바뀌면 저장소 캐시와 화면 설정을 함께 정리한다 */
  function commit() {
    const list = [...memberships.values()]
    store.set({ memberships: list })
    store.prunePets(list.map((entry) => entry.team.id))
    publish()
  }

  function requireNet() {
    if (!net) throw new Error(netError)
    return net
  }

  function assertRoom() {
    if (memberships.size >= MAX_TEAMS) throw new Error('TEAM_LIMIT_REACHED')
  }

  /** 서버에서 내 소속을 통째로 다시 불러온다 */
  async function refresh() {
    if (!net) return
    try {
      const list = await net.getMyTeams()
      const next = new Map(list.map((entry) => [entry.team.id, entry]))

      // 서버에서 사라진 팀은 연결을 끊는다 (다른 기기에서 나갔거나 팀이 지워졌다)
      for (const id of memberships.keys()) {
        if (!next.has(id)) await net.disconnect(id)
      }
      memberships = next
      commit()
    } catch (error) {
      emitter.emit('error', toFriendlyError(error).message)
    }
  }

  /** 새로 들어간 팀을 실제 연결까지 반영한다 */
  async function enterTeam(entry) {
    memberships.set(entry.team.id, entry)
    store.set({ nickname: entry.member.nickname })
    commit()

    await requireNet().connect(entry.team, entry.member)
    await net.announceRosterChange(entry.team.id)
    await refresh()
  }

  return {
    on: emitter.on,
    snapshot,
    publish,
    get maxTeams() {
      return MAX_TEAMS
    },

    /** 앱 시작 시 속해 있던 팀들로 자동 복귀 */
    async restore() {
      if (!net) {
        publish()
        return
      }
      try {
        const list = await net.getMyTeams()
        memberships = new Map(list.map((entry) => [entry.team.id, entry]))
        commit()

        for (const entry of memberships.values()) {
          await net.connect(entry.team, entry.member)
        }
      } catch (error) {
        emitter.emit('error', toFriendlyError(error).message)
        publish()
      }
    },

    async createTeam({ name, nickname, characterKey = 'cat' }) {
      assertRoom()
      const entry = await requireNet().createTeam({ name, nickname, characterKey })
      await enterTeam(entry)
      return snapshot()
    },

    async joinTeam({ inviteCode, nickname, characterKey = 'cat' }) {
      // 정원 판단은 서버에 맡긴다. 이미 들어와 있는 팀에 다시 참여하는 경우
      // (닉네임만 바꾸는 경우) 는 정원을 쓰지 않는데, 여기서 미리 막으면 그것까지 막힌다.
      const entry = await requireNet().joinTeam({ inviteCode, nickname, characterKey })
      await enterTeam(entry)
      return snapshot()
    },

    /** 이 팀에서 쓰는 내 닉네임을 바꾼다 */
    async setNickname(teamId, nickname) {
      if (!memberships.has(teamId) || !net) return snapshot()
      const member = await net.setNickname(teamId, nickname)
      store.set({ nickname: member.nickname })
      await refresh()
      return snapshot()
    },

    /** 팀 이름을 바꾼다 */
    async renameTeam(teamId, name) {
      if (!memberships.has(teamId) || !net) return snapshot()
      await net.renameTeam(teamId, name)
      await refresh()
      return snapshot()
    },

    /** 초대코드를 새로 발급한다. 예전 코드는 그 즉시 못 쓰게 된다. */
    async refreshInvite(teamId) {
      const entry = memberships.get(teamId)
      if (!entry || !net) return snapshot()
      const team = await net.refreshInvite(teamId)
      memberships.set(teamId, { ...entry, team })
      commit()
      return snapshot()
    },

    async leaveTeam(teamId) {
      if (net && memberships.has(teamId)) await net.leaveTeam(teamId)
      memberships.delete(teamId)
      onlineIds.delete(teamId)
      connections.delete(teamId)
      commit()
      return snapshot()
    },

    async setCharacter(teamId, characterKey) {
      const entry = memberships.get(teamId)
      if (!entry) return snapshot()

      // 화면부터 바꾸고 (네트워크를 기다리지 않는다)
      memberships.set(teamId, { ...entry, member: { ...entry.member, characterKey } })
      commit()
      emitter.emit('character', { teamId, characterKey })

      if (net) {
        try {
          await net.setCharacter(teamId, characterKey)
          await net.announceRosterChange(teamId)
          await refresh()
        } catch (error) {
          emitter.emit('error', toFriendlyError(error).message)
        }
      }
      return snapshot()
    },

    /**
     * 콕 찌르기. toMemberId 가 없으면 그 팀 전원에게 보낸다.
     * 연타해도 네트워크를 도배하지 않도록 팀별로 짧게 스로틀한다.
     */
    async tap({ teamId, toMemberId = null } = {}) {
      if (!net || !memberships.has(teamId)) return false
      const now = Date.now()
      if (now - (lastTapAt.get(teamId) ?? 0) < TAP_THROTTLE_MS) return false
      lastTapAt.set(teamId, now)
      try {
        await net.sendTap({ teamId, toMemberId })
        return true
      } catch (error) {
        emitter.emit('error', toFriendlyError(error).message)
        return false
      }
    },

    /**
     * 고른 언어를 저장하기만 한다.
     *
     * 알리는(publish) 일은 부르는 쪽이 한다 — 메인 프로세스가 번역기를 갈아끼운 뒤에
     * 알려야 창들이 새 언어로 그린다. 여기서 바로 알리면 옛 언어가 실려 나간다.
     */
    setLanguage(preference) {
      store.set({ language: preference })
      return snapshot()
    },

    /**
     * 새 버전이 나왔다는 사실만 받아 둔다.
     *
     * 어디서 어떻게 알아냈는지는 여기서 알 바가 아니다 — `update-check.js` 가
     * 알아내고, 여기는 창들에게 전해지는 상태에 실어 보내기만 한다.
     */
    setUpdate(info) {
      update = info
      publish()
    },

    async dispose() {
      await net?.disconnect()
      emitter.clear()
    },
  }
}

module.exports = { createSession }
