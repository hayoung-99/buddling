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

import { randomUUID } from 'node:crypto'
import { createNet, createEmitter, toFriendlyError } from '../services/net'
import type {
  ConnectionState,
  AppState,
  NotificationEntry,
  TapPayload,
  UpdateInfo,
} from '@buddling/shared/state'
import { NOTIFICATION_TTL_MS } from '@buddling/shared/state'
import { toSignal } from '@buddling/shared/signals'
import type { Net, NetEvent, NetMembership } from '../services/net'
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
 * 몇 번 잇달아 닿지 못해야 "오프라인" 으로 보는가.
 *
 * **2 는 곧 `RETRY_DELAYS[0]` 이다** — 처음 실패하고, 5초 뒤 다시 붙어 보기가 한 번
 * 더 실패하면 그때 덮는다(기획서 "인터넷이 없을 때"). 첫 실패에 곧바로 덮으면
 * 노트북이 잠깐씩 끊길 때마다 창 셋이 통째로 뒤집히는데, **끊긴 것보다 그 깜빡임이
 * 더 성가시다.**
 *
 * **이 숫자와 `RETRY_DELAYS` 는 짝이다** — 재시도 일정을 바꾸면 덮이는 시점도 함께
 * 움직인다. 기획서가 그것을 알고 묶어 두었고, 여기가 그 사실을 적어 두는 자리다.
 */
const OFFLINE_AFTER_FAILURES = 2

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
  /** 방장이 나를 내보냈다. 누가 그랬는지는 싣지 않는다 (기획서 "방장과 강퇴"). */
  kicked: { teamId: string; teamName: string }
}

export interface SessionOptions {
  url?: string
  anonKey?: string
  /** 테스트는 메모리 저장소를 꽂는다 */
  store?: Store
  /** 테스트는 `fake-net` 을 꽂는다 */
  net?: Net | null
  /** 알림 시각을 결정한다. 테스트가 순서를 확정적으로 만들 때 갈아끼운다. */
  now?: () => number
}

function createSession({
  url,
  anonKey,
  store = defaultStore,
  net: injectedNet = null,
  now = Date.now,
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
  /**
   * 서버에 잇달아 닿지 못한 횟수. 닿으면 0으로 돌아간다.
   *
   * `OFFLINE_AFTER_FAILURES` 이상이면 `AppState.offline` 이 켜진다. **되돌리는 것은
   * 성공뿐이다** — `cancelRetry()` 는 이 값을 건드리지 않는다. 절전에서 깨어날 때
   * `recover()` 가 그것을 부르는데, 거기서 함께 0으로 되돌리면 아직 오프라인인데
   * 화면이 잠깐 정상으로 돌아왔다 다시 덮이는 깜빡임이 생긴다.
   */
  let unreachableStreak = 0
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

  /** 서버가 적어 준 사건 하나의 `at`(ISO 문자열)을 epoch ms 로 바꾼다 */
  function atMs(event: NetEvent): number {
    return new Date(event.at).getTime()
  }

  /**
   * 기기 줄(내보내진 나 자신)과 서버 줄(들어옴·나감·내보내짐)을 합쳐 최신순으로 늘어놓는다.
   *
   * **컷오프를 여기서도 다시 건다.** 적어 둘 때(`syncEvents()`)의 컷오프는 이상한 값과
   * 시계 어긋남을 막는 문지기이고, 여기가 진짜 일하는 자리다 — 열흘 동안 오프라인이면
   * 사본은 열흘 전 것 그대로인데(성공해야만 갈아 끼우므로), 그때 서버가 이미 지운 줄을
   * 앱만 들고 있게 된다.
   */
  function snapshot(): AppState {
    const cutoff = now() - NOTIFICATION_TTL_MS
    const mine: NotificationEntry[] = store
      .get('notifications')
      .filter((entry) => entry.at > cutoff)
      .map((entry) => ({ ...entry, kind: 'kicked-me' as const }))
    const theirs: NotificationEntry[] = store
      .get('serverNotifications')
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        teamId: event.teamId,
        teamName: event.teamName,
        nickname: event.nickname,
        newHostNickname: event.newHostNickname,
        at: atMs(event),
      }))
      .filter((entry) => entry.at > cutoff)
    const notifications = [...mine, ...theirs].sort((a, b) => b.at - a.at)
    const seenAt = store.get('notificationsSeenAt') ?? 0

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
      notifications,
      hasUnreadNotifications: notifications.some((entry) => entry.at > seenAt),
      offline: unreachableStreak >= OFFLINE_AFTER_FAILURES,
    }
  }

  /**
   * 내가 내보내진 줄 하나를 기기에 남긴다(기획서 "알림 화면").
   *
   * 이제 이 표에 남는 것은 **이 한 줄뿐이다** — 들어옴·나감·내보내짐(남에게 일어난 일)은
   * 서버가 들고 있다가 `syncEvents()` 로 온다. 내가 내보내진 것만은 서버에서 읽을 수
   * 없다(이미 그 방의 멤버가 아니다) — 그래서 여전히 뺄셈으로 알아내 기기에 둔다.
   *
   * **방마다 하나로 묶지 않는다.** 같은 방에서 두 번 내보내지면 줄도 둘이다 — 서로
   * 다른 두 번의 일이라, 뒤의 것으로 앞의 것을 덮으면 아직 확인하지 못한 줄이 사라질
   * 수 있다. 몇 번 내보내졌는지 세는 화면이 아니라 각각을 한 번씩 말하는 화면이다.
   */
  function addNotification(teamId: string, teamName: string) {
    const entry = { id: randomUUID(), teamId, teamName, at: now() }
    // 저장할 때 함께 오래된 줄을 걸러 낸다 — 기기에 영영 쌓이게 두지 않는다.
    const cutoff = now() - NOTIFICATION_TTL_MS
    store.set({
      notifications: [...store.get('notifications').filter((n) => n.at > cutoff), entry],
    })
  }

  /**
   * 서버가 적어 둔 사건들을 다시 받아 **사본을 통째로 갈아 끼운다**(기획서 "알림 화면").
   *
   * 줄 단위로 합치지 않는다. 서버는 물어볼 때마다 그 순간의 7일치를 전부 돌려주므로
   * 오프라인 동안 놓친 일도 이 목록 안에 이미 들어 있다.
   *
   * **실패하면 사본을 그대로 둔다. 비우지 않는다.** 인터넷이 없는 것과 스키마가 아직
   * 안 올라간 것을 가리지 않는다 — 사람 쪽에서는 둘 다 "지금은 새 소식을 알 수 없다"
   * 는 같은 상태다. 던지지도 않는다 — 던지면 팀 목록 갱신까지 통째로 막힌다.
   */
  async function syncEvents() {
    if (!net) return
    try {
      const received = await net.getMyEvents()
      // 이상한 `at` 이 디스크에 남지 않게 여기서도 한 번 거른다 — 시계 어긋남을 막는
      // 문지기다. 보여 줄 때(snapshot())의 컷오프가 진짜 일하는 자리다.
      const cutoff = now() - NOTIFICATION_TTL_MS
      store.set({
        serverNotifications: received.filter(
          (event) => Number.isFinite(atMs(event)) && atMs(event) > cutoff,
        ),
      })
    } catch {
      // 위 설명대로 일부러 삼킨다. 사본은 그대로 둔다.
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

    // 서버에서 사라진 팀은 연결을 끊는다.
    //
    // 여기서 사라졌다는 것은 곧 방장이 나를 내보냈다는 뜻이다 — 내가 스스로 나가는
    // 길(`leaveTeam()`)은 이 함수를 거치지 않고 곧바로 지우기 때문에, 여기서 사라진
    // 팀은 언제나 남이 지운 것이다. 혼자 있던 방은 내가 나가야만 사라지므로 안전한
    // 구분이다 (기획서 "방장과 강퇴" 의 "만드는 쪽에게").
    for (const id of memberships.keys()) {
      if (next.has(id)) continue
      const removed = memberships.get(id)!
      await requireNet().disconnect(id)
      forget(id)
      addNotification(id, removed.team.name)
      emitter.emit('kicked', { teamId: id, teamName: removed.team.name })
    }
    memberships = next
    commit()
  }

  /**
   * 서버에서 내 소속을 받아 온다. **이 호출 하나가 "서버에 닿는가" 의 기준이다**
   * (기획서 "인터넷이 없을 때"). 방 채널이 붙는지는 보지 않는다 — 방 하나가 말썽인
   * 것은 오프라인이 아니고, 방이 하나도 없는 사람도 오프라인일 수 있다.
   *
   * 실패하면 곧바로 다시 붙어 보기를 예약한다. **오프라인 화면이 "저절로 다시 붙는다"
   * 고 약속하므로, 닿지 못한 상태에는 반드시 예약이 걸려 있어야 한다.** 예전에는
   * `refresh()` 가 실패해도 예약하지 않아서 그 자리가 비어 있었다.
   */
  async function fetchTeams(): Promise<NetMembership[]> {
    try {
      const list = await requireNet().getMyTeams()
      unreachableStreak = 0
      return list
    } catch (error) {
      unreachableStreak += 1
      scheduleRetry()
      throw error
    }
  }

  /**
   * 서버에서 내 소속을 통째로 다시 불러온다.
   *
   * **알림을 먼저 받아 둔다.** `applyTeams()` 가 끝에서 `commit()` → `publish()` 를
   * 부르므로, 그 전에 사본을 최신으로 맞춰 두면 그 한 번의 방송에 소속과 알림이 함께
   * 실린다. 반대 순서로 두면 `publish()` 를 한 번 더 불러야 알림이 반영되는데,
   * `state` IPC 가 roster 가 바뀔 때마다 두 번 나가는 것뿐이라 낭비였다.
   *
   * `fetchTeams()` 가 실패하면 `applyTeams()` 자체가 불리지 않아 그 안의 `publish()`
   * 도 없다 — 그때만 예외적으로 직접 불러서, 방금 받아 둔 알림이라도 화면에
   * 반영되게 한다.
   */
  async function refresh() {
    if (!net) return
    // 소속을 다시 불러오는 자리마다 알림도 함께 새로 받는다 — roster 브로드캐스트
    // 하나에 두 가지가 얹혀 있다 (기획서 "알림 화면"의 "만드는 쪽에게").
    await syncEvents()
    try {
      await applyTeams(await fetchTeams())
    } catch (error) {
      emitter.emit('error', toFriendlyError(error).message)
      publish()
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
    // `fetchTeams()` 가 실패하면 그 안에서 곧바로 `scheduleRetry()` 를 불러 retryStep 을
    // 올린다(오프라인 화면이 "저절로 다시 붙는다" 는 약속을 지키려면 그래야 한다). 그래서
    // 아래 catch 안에서 retryStep 을 읽으면 이미 올라간 뒤라 "처음 한 번만" 을 가릴 수
    // 없다 — 부르기 전에 미리 붙잡아 둔다.
    const firstFailureInStreak = retryStep === 0

    try {
      await applyTeams(await fetchTeams())
    } catch (error) {
      // 서버를 못 읽어도 캐시된 소속으로 연결은 시도해 본다
      everythingWorked = false
      // 인터넷이 오래 없으면 같은 실패가 계속 되풀이된다. 그때마다 알리면 잔소리가 되니
      // 한 번 어긋난 뒤 처음 한 번만 말한다. 다시 붙으면 알림도 처음으로 돌아간다.
      if (firstFailureInStreak) emitter.emit('error', toFriendlyError(error).message)
    }
    // 앱을 켤 때·절전에서 깨어날 때도 밀린 알림을 함께 받는다.
    await syncEvents()

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

    /**
     * 사람이 "다시 해 보기" 를 눌렀다 (기획서 "인터넷이 없을 때").
     *
     * **닿는지만 확인하고 돌아온다.** 방 채널을 다시 붙이는 일은 기다리지 않는다 —
     * 채널 하나에 최대 15초라(`services/supabase-net.ts`) 그것까지 기다리면 단추가
     * 몇십 초씩 눌린 채로 남는다. 오프라인인지는 `getMyTeams()` 하나로 정해지므로
     * 그것만 기다리면 화면은 이미 정확하다.
     *
     * `cancelRetry()` 로 백오프를 처음(5초)으로 되돌린다 — 사람이 기다림을 끝낸 것이라
     * 그다음 자동 재시도도 촘촘한 쪽에서 다시 시작하는 것이 맞다.
     *
     * **치르는 값** — 성공한 경우 `getMyTeams()` 가 곧이어 `syncConnections()` 안에서
     * 한 번 더 불린다. 일부러 그대로 둔다 — 사람이 일부러 누른 단추에 RPC 하나가 더
     * 드는 것과, 잘 도는 `syncConnections()` 를 둘로 쪼개는 것 중에 앞쪽이 싸다.
     */
    async retryNow() {
      cancelRetry()
      try {
        await applyTeams(await fetchTeams()) // 성공하면 여기서 publish 되어 화면이 돌아온다
      } catch {
        publish() // 실패해도 offline 값은 갱신해 내보낸다
      }
      void syncConnections() // 채널 붙이기·알림 받기는 뒤에서
      return snapshot()
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

    /**
     * 방장만 부를 수 있다. 내보낸 대상은 이 자리에서 목록을 다시 받지 않으므로,
     * 그쪽은 다음에 서버 목록을 받을 때(`applyTeams`) 스스로 알아챈다.
     */
    async kickMember(teamId: string, memberId: string) {
      if (!memberships.has(teamId) || !net) return snapshot()
      await net.kickMember(teamId, memberId)
      await refresh()
      return snapshot()
    },

    async leaveTeam(teamId: string) {
      if (net && memberships.has(teamId)) await net.leaveTeam(teamId)
      memberships.delete(teamId)
      forget(teamId)
      // 나간 방의 줄은 서버가 더는 주지 않는다. 여기서 한 번 받아 와 사본을 갈아 끼워야
      // 그 방 줄이 함께 사라진다 — 안 그러면 다음 성공적인 동기화까지 목록에 남고,
      // 사본은 껐다 켜도 남는다(예전에는 메모리라 앱을 끄면 사라졌다). `commit()` 앞에
      // 두어 그 한 번의 방송에 바뀐 소속과 갈아 끼운 사본이 함께 실리게 한다.
      await syncEvents()
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
      const sentAt = Date.now()
      if (sentAt - (lastTapAt.get(teamId) ?? 0) < TAP_THROTTLE_MS) return false
      lastTapAt.set(teamId, sentAt)
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
     * 이 방을 재우거나 깨운다.
     *
     * 신호 고르기와 똑같이 **서버로 나가지 않는다.** 재우는 것은 내 화면의 사정이라
     * 방의 다른 멤버는 알 필요가 없고, 알게 되면 "왜 자고 있어?" 라고 물을 자리가
     * 생긴다 — 그것이 이 제품이 없애려던 부담이다 (기획서 "잠재우기").
     *
     * **보내는 것은 막지 않는다.** `tap()` 은 이 값을 보지 않는다.
     */
    setAsleep(teamId: string, asleep: boolean) {
      if (!memberships.has(teamId)) return snapshot()
      store.setPet(teamId, { asleep })
      commit()
      return snapshot()
    },

    /** 그 방이 지금 재워져 있는가 (트레이·캐릭터 메뉴가 글자를 고를 때 본다) */
    isAsleep(teamId: string) {
      return Boolean(store.pet(teamId).asleep)
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
     * 알림 창을 지금 열었다고 기록한다. 이 시각보다 나중 줄만 다음부터 안읽음이다.
     *
     * **부르는 시점이 중요하다** — 이미 열려 있는 창을 앞으로 가져오기만 할 때는
     * 부르지 않는다. 거기서 부르면 지금 보고 있는 안읽음 색이 눈앞에서 사라진다
     * (기획서 "알림 화면"). 그 구분은 메인 프로세스의 창 관리 쪽(`main.ts`)이 안다.
     *
     * **기기 시계와 서버 시계가 어긋나면 클램프한다.** 서버 줄의 `at` 은 서버 시각이고
     * 이 값은 기기 시각이다. 기기 시계가 뒤처져 있으면 방금 눈으로 본 맨 위 줄이
     * 계속 안읽음으로 남으므로, 최소한 그 줄까지는 반드시 읽음이 되게 한다.
     */
    markNotificationsSeen() {
      const newest = snapshot().notifications[0]?.at ?? 0
      store.set({ notificationsSeenAt: Math.max(now(), newest) })
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
