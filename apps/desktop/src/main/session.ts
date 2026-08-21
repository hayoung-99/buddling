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

import { createNet, createEmitter, toFriendlyError } from '../services/net'
import type { ConnectionState, AppState, TapPayload, UpdateInfo } from '@buddling/shared/state'
import { toSignal } from '@buddling/shared/signals'
import type { Net, NetMembership } from '../services/net'
import type { Store } from './store'
import defaultStore from './store'
import { getLanguage } from './i18n'

const TAP_THROTTLE_MS = 300

/**
 * 연결이 안 될 때 다시 해 보기까지 기다리는 시간(ms).
 *
 * 이 앱은 컴퓨터를 켤 때 같이 뜬다. 그런데 그 순간에는 와이파이가 아직 안 붙어 있는
 * 일이 흔하다. 다시 시도하지 않으면 사용자는 앱을 껐다 켜기 전까지 영영 혼자다.
 * 뒤로 갈수록 뜸하게 두드려서, 인터넷이 오래 없어도 배터리를 갉아먹지 않게 한다.
 */
const RETRY_DELAYS = [5000, 15000, 30000, 60000]

/**
 * "아직 쓰고 있다" 는 흔적을 남기는 주기(ms).
 *
 * 흔적은 앱을 켤 때 `getMyTeams()` 가 이미 한 번 남긴다. 그런데 **이 앱은 컴퓨터를 켜
 * 두는 동안 계속 떠 있는 앱이라**, 껐다 켜지 않는 사람은 그 뒤로 며칠이고 흔적이
 * 갱신되지 않는다. 그러면 가장 오래 쓰는 사람이 가장 활동 없어 보이는, 방향이 거꾸로인
 * 오차가 남는다.
 *
 * **이 주기는 어드민의 측정 창과 1:2 로 묶인 짝이다.** 어드민이 "지금 켜 둔 사람" 을
 * 최근 1시간으로 세므로(`supabase/schema.sql` 의 `admin_overview`) 그 절반인 30분으로
 * 남긴다. 창과 같은 간격으로 남기면 마지막 흔적이 경계에 걸린 사람이 셀 때마다
 * 들락날락한다. **한쪽만 고치면 숫자가 조용히 틀어지니 반드시 함께 고친다.**
 *
 * 30분이 부담이 되지 않는 이유는, 이것이 렌더 루프와 무관한 네트워크 호출 하나이기
 * 때문이다 — 인덱스를 탄 `update` 한 줄이고 사람당 하루 48번이다.
 *
 * 테스트가 이 값을 다시 적지 않도록 내보낸다. 예전에는 `session.test.ts` 가 열두
 * 시간을 손으로 적어 두고 있어서, 이 상수만 고치면 테스트가 조용히 어긋났다.
 */
export const TOUCH_INTERVAL_MS = 30 * 60 * 1000

/** 한 기기가 동시에 속할 수 있는 팀 수 (supabase/schema.sql 과 맞춘다) */
const MAX_TEAMS = 3

/** 팀 하나에 들어갈 수 있는 사람 수 (supabase/schema.sql 과 맞춘다) */
const MAX_MEMBERS = 5

/** 세션이 밖으로 내보내는 것들 */
export type SessionEvents = {
  /** 화면에 보여 줄 것이 달라졌다 */
  teams: AppState
  tap: TapPayload
  /** 사람에게 보여 줄 오류. 이미 번역 열쇠로 바뀐 뒤다. */
  error: string
  character: { teamId: string; characterKey: string }
}

export interface SessionOptions {
  url?: string
  anonKey?: string
  /** 테스트는 메모리 저장소를 꽂는다 */
  store?: Store
  /** 테스트는 `fake-net` 을 꽂는다 */
  net?: Net | null
}

function createSession({
  url,
  anonKey,
  store = defaultStore,
  net: injectedNet = null,
}: SessionOptions) {
  const emitter = createEmitter<SessionEvents>()

  let net: Net | null = null
  let netError: string | null = null
  let memberships = new Map<string, NetMembership>()
  const onlineIds = new Map<string, string[]>()
  const connections = new Map<string, ConnectionState>()
  /** teamId → 마지막으로 보낸 시각 */
  const lastTapAt = new Map<string, number>()
  let update: UpdateInfo | null = null
  /** 다시 붙어 보기까지의 대기. 성공하면 처음으로 되돌린다. */
  let retryStep = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let touchTimer: ReturnType<typeof setInterval> | null = null
  let disposed = false

  try {
    // 세션 저장소를 넘긴다 — 이게 없으면 로그인이 메모리에만 남아, 앱을 껐다 켤 때마다
    // 새 익명 계정이 생기고 그때마다 속한 팀을 잃는다.
    net = injectedNet ?? createNet({ url, anonKey, storage: store.authStorage })
  } catch (error) {
    // 키가 없어도 앱은 뜬다. 캐릭터는 혼자 놀고, 팀 창이 설정 방법을 안내한다.
    netError = (error as Error).message
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

  function snapshot(): AppState {
    return {
      configured: net !== null,
      configError: netError,
      nickname: store.get('nickname'),
      language: getLanguage(),
      power: store.get('power'),
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

  function requireNet(): Net {
    if (!net) throw new Error(netError ?? 'error.missingConfig')
    return net
  }

  function assertRoom() {
    if (memberships.size >= MAX_TEAMS) throw new Error('TEAM_LIMIT_REACHED')
  }

  /** 더 이상 속하지 않는 팀에 딸린 것들을 함께 지운다 (안 그러면 계속 쌓인다) */
  function forget(teamId: string) {
    onlineIds.delete(teamId)
    connections.delete(teamId)
    lastTapAt.delete(teamId)
  }

  /** 서버가 준 목록으로 소속을 갈아끼운다 */
  async function applyTeams(list: NetMembership[]) {
    const next = new Map(list.map((entry): [string, NetMembership] => [entry.team.id, entry]))

    // 서버에서 사라진 팀은 연결을 끊는다 (다른 기기에서 나갔거나 팀이 지워졌다)
    for (const id of memberships.keys()) {
      if (next.has(id)) continue
      await requireNet().disconnect(id)
      forget(id)
    }
    memberships = next
    commit()
  }

  /** 서버에서 내 소속을 통째로 다시 불러온다 */
  async function refresh() {
    if (!net) return
    try {
      await applyTeams(await net.getMyTeams())
    } catch (error) {
      emitter.emit('error', toFriendlyError(error).message)
    }
  }

  /**
   * 흔적 남기기를 시작한다. 두 번 불러도 타이머는 하나다.
   *
   * 실패해도 아무것도 하지 않는다 — 인터넷이 없으면 다음 차례에 다시 남기면 되고,
   * 이것 때문에 사용자에게 말을 걸 이유는 없다.
   */
  function startTouching() {
    if (touchTimer || !net) return
    touchTimer = setInterval(() => {
      void net?.touch().catch(() => {})
    }, TOUCH_INTERVAL_MS)
    // 이 타이머 때문에 앱이 종료되지 못하는 일이 없게 한다
    touchTimer.unref?.()
  }

  function cancelRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    retryStep = 0
  }

  function scheduleRetry() {
    if (disposed || retryTimer || !net) return
    const delay = RETRY_DELAYS[Math.min(retryStep, RETRY_DELAYS.length - 1)]
    retryStep += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void syncConnections()
    }, delay)
    // 이 타이머 때문에 앱이 종료되지 못하는 일이 없게 한다
    retryTimer.unref?.()
  }

  /**
   * 소속을 서버와 맞추고, 아직 안 붙은 팀을 붙인다.
   *
   * 한 팀이 실패해도 나머지는 계속 시도한다 — 팀 하나가 말썽이라고 나머지 둘까지
   * 조용해지면 안 된다. 하나라도 못 붙었으면 잠시 뒤에 통째로 다시 해 본다.
   */
  async function syncConnections() {
    if (!net || disposed) return
    let everythingWorked = true

    try {
      await applyTeams(await net.getMyTeams())
    } catch (error) {
      // 서버를 못 읽어도 캐시된 소속으로 연결은 시도해 본다
      everythingWorked = false
      // 인터넷이 오래 없으면 같은 실패가 계속 되풀이된다. 그때마다 알리면 잔소리가 되니
      // 한 번 어긋난 뒤 처음 한 번만 말한다. 다시 붙으면 알림도 처음으로 돌아간다.
      if (retryStep === 0) emitter.emit('error', toFriendlyError(error).message)
    }

    const connected = new Set(net.connectedTeamIds())
    for (const entry of memberships.values()) {
      if (connected.has(entry.team.id)) continue
      try {
        await net.connect(entry.team, entry.member)
      } catch {
        // 화면에는 이미 connection 상태로 보이고 있다. 여기서는 다시 시도할 일만 남긴다.
        everythingWorked = false
      }
    }

    if (everythingWorked) cancelRetry()
    else scheduleRetry()
    publish()
  }

  /** 새로 들어간 팀을 실제 연결까지 반영한다 */
  async function enterTeam(entry: NetMembership) {
    memberships.set(entry.team.id, entry)
    store.set({ nickname: entry.member.nickname })
    commit()

    await requireNet().connect(entry.team, entry.member)
    await requireNet().announceRosterChange(entry.team.id)
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
      startTouching()
      await syncConnections()
    },

    /**
     * 끊겼을지 모르는 연결을 다시 맞춘다.
     * 컴퓨터가 절전에서 깨어났을 때처럼, 그 사이 무슨 일이 있었는지 모를 때 부른다.
     */
    async recover() {
      cancelRetry()
      await syncConnections()
    },

    async createTeam({
      name,
      nickname,
      characterKey = 'cat',
    }: {
      name: string
      nickname: string
      characterKey?: string
    }) {
      assertRoom()
      const entry = await requireNet().createTeam({ name, nickname, characterKey })
      await enterTeam(entry)
      return snapshot()
    },

    async joinTeam({
      inviteCode,
      nickname,
      characterKey = 'cat',
    }: {
      inviteCode: string
      nickname: string
      characterKey?: string
    }) {
      // 정원 판단은 서버에 맡긴다. 이미 들어와 있는 팀에 다시 참여하는 경우
      // (닉네임만 바꾸는 경우) 는 정원을 쓰지 않는데, 여기서 미리 막으면 그것까지 막힌다.
      const entry = await requireNet().joinTeam({ inviteCode, nickname, characterKey })
      await enterTeam(entry)
      return snapshot()
    },

    /** 이 팀에서 쓰는 내 닉네임을 바꾼다 */
    async setNickname(teamId: string, nickname: string) {
      if (!memberships.has(teamId) || !net) return snapshot()
      const member = await net.setNickname(teamId, nickname)
      store.set({ nickname: member.nickname })
      await refresh()
      return snapshot()
    },

    /** 팀 이름을 바꾼다 */
    async renameTeam(teamId: string, name: string) {
      if (!memberships.has(teamId) || !net) return snapshot()
      await net.renameTeam(teamId, name)
      await refresh()
      return snapshot()
    },

    /** 초대코드를 새로 발급한다. 예전 코드는 그 즉시 못 쓰게 된다. */
    async refreshInvite(teamId: string) {
      const entry = memberships.get(teamId)
      if (!entry || !net) return snapshot()
      const team = await net.refreshInvite(teamId)
      memberships.set(teamId, { ...entry, team })
      commit()
      return snapshot()
    },

    async leaveTeam(teamId: string) {
      if (net && memberships.has(teamId)) await net.leaveTeam(teamId)
      memberships.delete(teamId)
      forget(teamId)
      commit()
      return snapshot()
    },

    async setCharacter(teamId: string, characterKey: string) {
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
     * 신호 보내기. toMemberId 가 없으면 그 방 전원에게 보낸다.
     * 연타해도 네트워크를 도배하지 않도록 팀별로 짧게 스로틀한다.
     *
     * **무슨 신호를 보낼지는 여기서 정한다.** 캐릭터 창도 방 창의 `콕!` 버튼도 그냥
     * "보내 줘" 라고만 하고, 골라 둔 값은 이 한 곳에서 붙는다. 두 곳에서 각각
     * 챙기게 두면 한쪽만 고쳐져 조용히 어긋난다.
     */
    async tap({ teamId, toMemberId = null }: { teamId: string; toMemberId?: string | null }) {
      if (!net || !memberships.has(teamId)) return false
      const now = Date.now()
      if (now - (lastTapAt.get(teamId) ?? 0) < TAP_THROTTLE_MS) return false
      lastTapAt.set(teamId, now)
      try {
        await net.sendTap({ teamId, toMemberId, signal: toSignal(store.pet(teamId).signal) })
        return true
      } catch (error) {
        emitter.emit('error', toFriendlyError(error).message)
        return false
      }
    },

    /**
     * 이 방에서 내가 보낼 신호를 고른다.
     *
     * 캐릭터와 달리 **서버로 나가지 않는다.** 남이 미리 알 필요가 없고, 보낼 때
     * 페이로드에 실어 보내는 것으로 충분하다 (`@buddling/shared/signals` 참고).
     */
    setSignal(teamId: string, signal: string) {
      if (!memberships.has(teamId)) return snapshot()
      store.setPet(teamId, { signal: toSignal(signal) })
      commit()
      return snapshot()
    },

    /**
     * 고른 언어를 저장하기만 한다.
     *
     * 알리는(publish) 일은 부르는 쪽이 한다 — 메인 프로세스가 번역기를 갈아끼운 뒤에
     * 알려야 창들이 새 언어로 그린다. 여기서 바로 알리면 옛 언어가 실려 나간다.
     */
    setLanguage(preference: string) {
      store.set({ language: preference })
      return snapshot()
    },

    /** 절전 강도. 창들은 상태로 받아 곧바로 반영한다. */
    setPower(level: string) {
      store.set({ power: level })
      publish()
      return snapshot()
    },

    /**
     * 새 버전이 나왔다는 사실만 받아 둔다.
     *
     * 어디서 어떻게 알아냈는지는 여기서 알 바가 아니다 — `update-check.js` 가
     * 알아내고, 여기는 창들에게 전해지는 상태에 실어 보내기만 한다.
     */
    setUpdate(info: UpdateInfo) {
      update = info
      publish()
    },

    async dispose() {
      disposed = true
      cancelRetry()
      if (touchTimer) clearInterval(touchTimer)
      touchTimer = null
      await net?.disconnect()
      emitter.clear()
    },
  }
}

/** 메인 프로세스의 나머지가 세션을 가리킬 때 쓰는 타입 */
export type Session = ReturnType<typeof createSession>

export { createSession }
