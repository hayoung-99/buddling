import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSession, TOUCH_INTERVAL_MS } from '../src/main/session'
import { createFakeServer, createFakeNet, MAX_TEAMS_PER_USER } from '../src/services/fake-net'
import type { Store, StoredState } from '../src/main/store'
import type { Net } from '../src/services/net'
import type { PetSettings, TapPayload } from '@buddling/shared/state'
import { DEFAULT_SIGNAL } from '@buddling/shared/signals'

const DEFAULT_PET: PetSettings = { position: null, scale: 1, signal: DEFAULT_SIGNAL }

/**
 * Electron 없이 돌아가는 저장소 흉내.
 *
 * 반환값에 `Store` 를 적어 두는 것이 중요하다 — 진짜 저장소(`src/main/store.ts`)의
 * 모양이 바뀌면 **테스트가 깨지기 전에** 여기서 컴파일러가 잡는다. 예전에는 둘이
 * 조용히 어긋날 수 있었다.
 */
function memoryStore(): Store & { peek: () => StoredState } {
  let state: StoredState = {
    auth: {},
    nickname: '',
    memberships: [],
    pets: {},
    petVisible: true,
    language: null,
    power: null,
    lastUpdateCheck: null,
    notifications: [],
    notificationsSeenAt: null,
  }

  const pet = (teamId: string): PetSettings => ({ ...DEFAULT_PET, ...state.pets[teamId] })

  return {
    // 세션은 이 둘을 부르지 않는다 (진짜 저장소는 앱이 뜰 때·꺼질 때 쓴다).
    // 그래도 `Store` 를 온전히 만족시켜 두어야 모양이 어긋날 때 여기서 걸린다.
    load: () => state,
    flush: () => {},
    authStorage: {
      getItem: (key: string) => state.auth[key] ?? null,
      setItem(key: string, value: string) {
        state = { ...state, auth: { ...state.auth, [key]: value } }
      },
      removeItem(key: string) {
        const auth = { ...state.auth }
        delete auth[key]
        state = { ...state, auth }
      },
    },

    pet,
    get: <K extends keyof StoredState>(key: K) => state[key],
    set(patch: Partial<StoredState>) {
      state = { ...state, ...patch }
      return state
    },
    setPet(teamId: string, patch: Partial<PetSettings>) {
      state.pets = { ...state.pets, [teamId]: { ...pet(teamId), ...patch } }
      return state.pets[teamId]
    },
    prunePets(teamIds: string[]) {
      const keep = new Set(teamIds)
      state.pets = Object.fromEntries(Object.entries(state.pets).filter(([id]) => keep.has(id)))
    },

    /** 테스트에서 들여다보기 위한 창 */
    peek: () => state,
  }
}

function makeSession({
  server = createFakeServer(),
  userId = 'user-me',
  now,
}: { server?: ReturnType<typeof createFakeServer>; userId?: string; now?: () => number } = {}) {
  const store = memoryStore()
  const net = createFakeNet({ server, userId })
  const session = createSession({ url: 'x', anonKey: 'y', store, net, now })
  return { server, store, net, session }
}

describe('세션 — 팀 만들고 들어가기', () => {
  let ctx: ReturnType<typeof makeSession>
  beforeEach(() => {
    ctx = makeSession()
  })

  it('팀을 만들면 소속과 캐릭터 창 목록에 잡힌다', async () => {
    const state = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    expect(state.memberships).toHaveLength(1)
    expect(state.memberships[0].team.name).toBe('디자인팀')
    expect(state.memberships[0].connection).toBe('connected')
  })

  it('닉네임을 기억해 두었다가 다음 팀에서 기본값으로 쓴다', async () => {
    await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    expect(ctx.session.snapshot().nickname).toBe('나영')
  })

  it('소속을 저장소에 캐시해 둔다 — 다음 실행 때 바로 캐릭터를 띄우려고', async () => {
    await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    expect(ctx.store.peek().memberships).toHaveLength(1)
  })

  it(`팀 ${MAX_TEAMS_PER_USER}개를 넘기면 거절한다`, async () => {
    for (let i = 0; i < MAX_TEAMS_PER_USER; i += 1) {
      await ctx.session.createTeam({ name: `팀${i}`, nickname: '나영' })
    }
    await expect(ctx.session.createTeam({ name: '넘침', nickname: '나영' })).rejects.toThrow(
      'TEAM_LIMIT_REACHED',
    )
  })

  it('정원이 찼어도 이미 속한 팀에는 다시 참여할 수 있다 (닉네임 변경 경로)', async () => {
    const first = await ctx.session.createTeam({ name: '팀0', nickname: '나영' })
    const code = first.memberships[0].team.inviteCode
    for (let i = 1; i < MAX_TEAMS_PER_USER; i += 1) {
      await ctx.session.createTeam({ name: `팀${i}`, nickname: '나영' })
    }

    const after = await ctx.session.joinTeam({ inviteCode: code, nickname: '나영2' })
    expect(after.memberships).toHaveLength(MAX_TEAMS_PER_USER)
    expect(after.memberships.find((m) => m.team.inviteCode === code)!.member.nickname).toBe(
      '나영2',
    )
  })
})

describe('세션 — 팀마다 따로 관리되는 것들', () => {
  it('캐릭터는 팀마다 따로 저장된다', async () => {
    const ctx = makeSession()
    const a = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const b = await ctx.session.createTeam({ name: '개발팀', nickname: '나영' })
    const [designId, devId] = [a.memberships[0].team.id, b.memberships[1].team.id]

    await ctx.session.setCharacter(designId, 'bunny')
    await ctx.session.setCharacter(devId, 'panda')

    const state = ctx.session.snapshot()
    expect(state.memberships.find((m) => m.team.id === designId)!.member.characterKey).toBe(
      'bunny',
    )
    expect(state.memberships.find((m) => m.team.id === devId)!.member.characterKey).toBe('panda')
  })

  it('캐릭터 창 설정(크기·위치)도 팀마다 따로다', async () => {
    const ctx = makeSession()
    const a = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = a.memberships[0].team.id

    ctx.store.setPet(teamId, { scale: 1.5 })
    expect(ctx.session.snapshot().memberships[0].pet.scale).toBe(1.5)
  })

  it('팀을 나가면 그 팀의 화면 설정도 함께 지운다', async () => {
    const ctx = makeSession()
    const a = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = a.memberships[0].team.id
    ctx.store.setPet(teamId, { scale: 1.5 })

    await ctx.session.leaveTeam(teamId)
    expect(ctx.store.peek().pets[teamId]).toBeUndefined()
    expect(ctx.session.snapshot().memberships).toHaveLength(0)
  })
})

describe('세션 — 콕 찌르기', () => {
  it('같은 팀에 있는 다른 기기에게만 전달된다', async () => {
    const server = createFakeServer()
    const me = makeSession({ server, userId: 'user-me' })
    const mate = makeSession({ server, userId: 'user-mate' })

    const created = await me.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id
    await mate.session.joinTeam({
      inviteCode: created.memberships[0].team.inviteCode,
      nickname: '민수',
    })

    const got: TapPayload[] = []
    mate.session.on('tap', (payload) => got.push(payload))

    expect(await me.session.tap({ teamId })).toBe(true)
    expect(got).toHaveLength(1)
    expect(got[0].teamId).toBe(teamId)
    expect(got[0].fromNickname).toBe('나영')
  })

  it('연타는 걸러낸다 — 네트워크를 도배하지 않는다', async () => {
    const ctx = makeSession()
    const created = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id

    expect(await ctx.session.tap({ teamId })).toBe(true)
    expect(await ctx.session.tap({ teamId })).toBe(false) // 곧바로 다시 누르면 무시
  })

  it('속하지 않은 팀에는 보내지 않는다', async () => {
    const ctx = makeSession()
    expect(await ctx.session.tap({ teamId: '없는팀' })).toBe(false)
  })

  /**
   * 무엇을 보낼지는 세션이 저장소를 읽어 붙인다. 캐릭터 창도 방 창의 `콕!` 버튼도
   * 그냥 "보내 줘" 라고만 하므로, 두 곳에서 각각 챙기다 한쪽만 어긋나는 일이 없다.
   */
  describe('고른 신호가 실려 나간다', () => {
    /** 나와 상대를 한 방에 넣고, 상대에게 온 신호를 모아 준다 */
    async function pair() {
      const server = createFakeServer()
      const me = makeSession({ server, userId: 'user-me' })
      const mate = makeSession({ server, userId: 'user-mate' })
      const created = await me.session.createTeam({ name: '나오리와 친구들', nickname: '나영' })
      const teamId = created.memberships[0].team.id
      await mate.session.joinTeam({
        inviteCode: created.memberships[0].team.inviteCode,
        nickname: '민수',
      })
      const got: TapPayload[] = []
      mate.session.on('tap', (payload) => got.push(payload))
      return { me, mate, teamId, got }
    }

    it('아무것도 안 고르면 콕이 나간다', async () => {
      const { me, teamId, got } = await pair()
      await me.session.tap({ teamId })
      expect(got[0].signal).toBe('poke')
    })

    it('폴짝을 고르면 폴짝이 나간다', async () => {
      const { me, teamId, got } = await pair()
      me.session.setSignal(teamId, 'hop')
      await me.session.tap({ teamId })
      expect(got[0].signal).toBe('hop')
    })

    it('한 사람만 찌를 때도 같은 신호가 따라간다', async () => {
      const { me, mate, teamId, got } = await pair()
      me.session.setSignal(teamId, 'hop')
      const mateId = mate.store.peek().memberships[0].member.id
      await me.session.tap({ teamId, toMemberId: mateId })
      expect(got[0].signal).toBe('hop')
      expect(got[0].toMemberId).toBe(mateId)
    })

    it('모르는 값을 고르려 하면 콕으로 떨어진다', async () => {
      const { me, teamId, got } = await pair()
      me.session.setSignal(teamId, 'nonsense')
      await me.session.tap({ teamId })
      expect(got[0].signal).toBe('poke')
    })

    it('옛 저장 파일처럼 신호 칸이 없으면 콕으로 본다', async () => {
      const { me, teamId, got } = await pair()
      me.store.setPet(teamId, { signal: undefined })
      await me.session.tap({ teamId })
      expect(got[0].signal).toBe('poke')
    })

    it('신호는 방마다 따로다', async () => {
      const { me, teamId, got } = await pair()
      const other = await me.session.createTeam({ name: '가족', nickname: '나영' })
      const otherId = other.memberships.find((entry) => entry.team.id !== teamId)!.team.id

      me.session.setSignal(teamId, 'hop')
      expect(me.store.peek().pets[teamId].signal).toBe('hop')
      expect(me.store.peek().pets[otherId]?.signal ?? DEFAULT_SIGNAL).toBe('poke')

      await me.session.tap({ teamId })
      expect(got[0].signal).toBe('hop')
    })

    it('고른 신호는 화면 상태에도 실려 나간다 — 창을 다시 열지 않아도 된다', async () => {
      const { me, teamId } = await pair()
      const state = me.session.setSignal(teamId, 'hop')
      const entry = state.memberships.find((item) => item.team.id === teamId)
      expect(entry?.pet.signal).toBe('hop')
    })

    it('속하지 않은 방의 신호는 고르지 않는다', async () => {
      const { me } = await pair()
      me.session.setSignal('없는팀', 'hop')
      expect(me.store.peek().pets['없는팀']).toBeUndefined()
    })
  })
})

describe('세션 — 설정이 없을 때', () => {
  it('Supabase 키가 없으면 팀 기능을 잠그되 앱은 살아 있다', () => {
    const store = memoryStore()
    const session = createSession({ url: '', anonKey: '', store })
    const state = session.snapshot()

    expect(state.configured).toBe(false)
    expect(state.configError).toBe('error.missingConfig') // 문장은 보여주는 쪽에서 만든다
    expect(state.memberships).toEqual([])
  })

  it('캐시된 소속이 있으면 네트워크 없이도 먼저 보여준다', () => {
    const store = memoryStore()
    store.set({
      memberships: [
        {
          team: { id: 't1', name: '지난 팀', inviteCode: 'ABCD2345', inviteExpiresAt: null },
          member: { id: 'm1', nickname: '나영', characterKey: 'duck' },
        },
      ],
    })
    const session = createSession({ url: '', anonKey: '', store })
    expect(session.snapshot().memberships).toHaveLength(1)
  })
})

/**
 * 다음 호출 한 번만 실패하게 만든다.
 * 인터넷이 잠깐 없는 상황을 흉내 내는 데 쓴다.
 */
function failOnce<M extends keyof Net>(
  net: Net,
  method: M,
  when: (...args: any[]) => boolean = () => true,
) {
  // 메서드를 통째로 바꿔치는 일이라 타입을 그대로 지킬 수 없다. 이 헬퍼 안에서만 느슨하게 둔다.
  const original = (net[method] as (...args: any[]) => Promise<unknown>).bind(net)
  let used = false
  ;(net as unknown as Record<string, unknown>)[method] = async (...args: any[]) => {
    if (!used && when(...args)) {
      used = true
      throw new Error('offline')
    }
    return original(...args)
  }
}

describe('세션 — 끊긴 연결 되살리기', () => {
  let ctx: ReturnType<typeof makeSession>
  beforeEach(() => {
    ctx = makeSession()
  })
  afterEach(async () => {
    vi.useRealTimers()
    await ctx.session.dispose()
  })

  /** 팀을 만들어 두고, 앱을 껐다 켠 것처럼 연결만 끊어 둔다 */
  async function teamsThenOffline(names: string[]) {
    const ids: string[] = []
    for (const name of names) {
      const state = await ctx.session.createTeam({ name, nickname: '나영' })
      ids.push(state.memberships.at(-1)!.team.id)
    }
    await ctx.net.disconnect()
    return ids
  }

  it('서버 목록을 못 읽어도 캐시해 둔 소속으로 연결은 시도한다', async () => {
    await teamsThenOffline(['디자인팀'])
    failOnce(ctx.net, 'getMyTeams')

    await ctx.session.restore()

    expect(ctx.net.connectedTeamIds()).toHaveLength(1)
  })

  it('한 팀이 안 붙어도 나머지 팀은 붙는다 — 하나 때문에 전부 조용해지면 안 된다', async () => {
    const [first, second] = await teamsThenOffline(['팀A', '팀B'])
    failOnce(ctx.net, 'connect', (team) => team.id === first)

    await ctx.session.restore()

    expect(ctx.net.connectedTeamIds()).toEqual([second])
  })

  it('한 번 실패해도 스스로 다시 붙는다 — 켤 때 와이파이가 아직 없을 수 있다', async () => {
    vi.useFakeTimers()
    await teamsThenOffline(['디자인팀'])
    failOnce(ctx.net, 'connect')

    await ctx.session.restore()
    expect(ctx.net.connectedTeamIds()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.net.connectedTeamIds()).toHaveLength(1)
  })

  it('절전에서 깨어났을 때처럼 밖에서 부르면 곧바로 다시 맞춘다', async () => {
    await teamsThenOffline(['디자인팀'])
    failOnce(ctx.net, 'connect')
    await ctx.session.restore()

    await ctx.session.recover()

    expect(ctx.net.connectedTeamIds()).toHaveLength(1)
  })

  it('앱을 끄면 재시도 예약도 함께 사라진다', async () => {
    vi.useFakeTimers()
    await teamsThenOffline(['디자인팀'])
    failOnce(ctx.net, 'connect')
    await ctx.session.restore()

    await ctx.session.dispose()
    await vi.advanceTimersByTimeAsync(60000)

    expect(ctx.net.connectedTeamIds()).toHaveLength(0)
  })
})

describe('세션 — 방장과 강퇴', () => {
  it('방장은 멤버를 내보낼 수 있다', async () => {
    const server = createFakeServer()
    const host = makeSession({ server, userId: 'user-host' })
    const guest = makeSession({ server, userId: 'user-guest' })

    const created = await host.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id
    const joined = await guest.session.joinTeam({
      inviteCode: created.memberships[0].team.inviteCode,
      nickname: '민수',
    })

    await host.session.kickMember(teamId, joined.memberships[0].member.id)

    expect(host.session.snapshot().memberships[0].members.map((m) => m.nickname)).toEqual([
      '나영',
    ])
  })

  it('방장이 아니면 내보낼 수 없다', async () => {
    const server = createFakeServer()
    const host = makeSession({ server, userId: 'user-host' })
    const guest = makeSession({ server, userId: 'user-guest' })

    const created = await host.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id
    await guest.session.joinTeam({
      inviteCode: created.memberships[0].team.inviteCode,
      nickname: '민수',
    })
    const hostMemberId = created.memberships[0].member.id

    await expect(guest.session.kickMember(teamId, hostMemberId)).rejects.toThrow('NOT_THE_HOST')
  })

  it('내보내진 사람은 다음에 목록을 받을 때 그 사실을 안다', async () => {
    const server = createFakeServer()
    const host = makeSession({ server, userId: 'user-host' })
    const guest = makeSession({ server, userId: 'user-guest' })

    const created = await host.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id
    const joined = await guest.session.joinTeam({
      inviteCode: created.memberships[0].team.inviteCode,
      nickname: '민수',
    })

    const kicked: { teamId: string; teamName: string }[] = []
    guest.session.on('kicked', (payload) => kicked.push(payload))

    await host.session.kickMember(teamId, joined.memberships[0].member.id)
    // 실시간 알림이 이미 왔을 수도, 늦을 수도 있다 — 늦었다면 여기서 확실히 맞춘다
    await guest.session.recover()

    expect(kicked).toEqual([{ teamId, teamName: '디자인팀' }])
    expect(guest.session.snapshot().memberships).toEqual([])
  })

  it('내가 직접 나간 것은 강퇴로 잘못 알리지 않는다', async () => {
    const ctx = makeSession()
    const created = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id

    const kicked: unknown[] = []
    ctx.session.on('kicked', (payload) => kicked.push(payload))
    await ctx.session.leaveTeam(teamId)

    expect(kicked).toEqual([])
  })
})

describe('세션 — 알림 화면', () => {
  /** 방장이 게스트를 만들고 초대해 둔다 */
  async function hostAndGuest({ now }: { now?: () => number } = {}) {
    const server = createFakeServer()
    const host = makeSession({ server, userId: 'user-host' })
    const guest = makeSession({ server, userId: 'user-guest', now })
    const created = await host.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id
    const joined = await guest.session.joinTeam({
      inviteCode: created.memberships[0].team.inviteCode,
      nickname: '민수',
    })
    return { host, guest, teamId, guestMemberId: joined.memberships[0].member.id }
  }

  it('강퇴되면 알림 목록에 한 줄 남는다', async () => {
    const { host, guest, teamId, guestMemberId } = await hostAndGuest()

    await host.session.kickMember(teamId, guestMemberId)
    await guest.session.recover()

    const [entry] = guest.session.snapshot().notifications
    expect(entry.teamId).toBe(teamId)
    expect(entry.teamName).toBe('디자인팀')
  })

  it('내가 직접 나간 것은 알림에 남지 않는다', async () => {
    const ctx = makeSession()
    const created = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    await ctx.session.leaveTeam(created.memberships[0].team.id)

    expect(ctx.session.snapshot().notifications).toEqual([])
  })

  it('같은 방에서 두 번 내보내지면 알림 줄이 하나로 유지된다', async () => {
    let clock = 1000
    const { host, guest, teamId, guestMemberId } = await hostAndGuest({ now: () => clock })

    await host.session.kickMember(teamId, guestMemberId)
    await guest.session.recover()
    expect(guest.session.snapshot().notifications).toHaveLength(1)

    // 새 초대코드로 다시 들어왔다가 또 내보내진다
    clock = 2000
    const inviteCode = host.session.snapshot().memberships[0].team.inviteCode
    const rejoined = await guest.session.joinTeam({ inviteCode, nickname: '민수' })
    await host.session.kickMember(teamId, rejoined.memberships[0].member.id)
    await guest.session.recover()

    const notifications = guest.session.snapshot().notifications
    expect(notifications).toEqual([{ teamId, teamName: '디자인팀', at: 2000 }])
  })

  it('최신 알림이 맨 앞에 온다', async () => {
    let clock = 1000
    const server = createFakeServer()
    const host = makeSession({ server, userId: 'user-host' })
    const guest = makeSession({ server, userId: 'user-guest', now: () => clock })

    const design = await host.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const designId = design.memberships[0].team.id
    const devState = await host.session.createTeam({ name: '개발팀', nickname: '나영' })
    const devId = devState.memberships.find((m) => m.team.id !== designId)!.team.id

    const joinedDesign = await guest.session.joinTeam({
      inviteCode: design.memberships[0].team.inviteCode,
      nickname: '민수',
    })
    const joinedDev = await guest.session.joinTeam({
      inviteCode: devState.memberships.find((m) => m.team.id === devId)!.team.inviteCode,
      nickname: '민수',
    })

    clock = 1000
    await host.session.kickMember(
      designId,
      joinedDesign.memberships.find((m) => m.team.id === designId)!.member.id,
    )
    await guest.session.recover()

    clock = 2000
    await host.session.kickMember(
      devId,
      joinedDev.memberships.find((m) => m.team.id === devId)!.member.id,
    )
    await guest.session.recover()

    const notifications = guest.session.snapshot().notifications
    expect(notifications.map((n) => n.teamName)).toEqual(['개발팀', '디자인팀'])
  })

  it('한 번도 안 읽은 알림이 있으면 안읽음 표시가 켜진다', async () => {
    const { host, guest, teamId, guestMemberId } = await hostAndGuest()
    expect(guest.session.snapshot().hasUnreadNotifications).toBe(false)

    await host.session.kickMember(teamId, guestMemberId)
    await guest.session.recover()

    expect(guest.session.snapshot().hasUnreadNotifications).toBe(true)
  })

  it('알림 창을 열었다고 표시하면 안읽음이 꺼진다', async () => {
    const { host, guest, teamId, guestMemberId } = await hostAndGuest()
    await host.session.kickMember(teamId, guestMemberId)
    await guest.session.recover()

    guest.session.markNotificationsSeen()

    expect(guest.session.snapshot().hasUnreadNotifications).toBe(false)
  })

  it('알림을 지우면 목록에서 빠진다', async () => {
    const { host, guest, teamId, guestMemberId } = await hostAndGuest()
    await host.session.kickMember(teamId, guestMemberId)
    await guest.session.recover()

    guest.session.dismissNotification(teamId)

    expect(guest.session.snapshot().notifications).toEqual([])
  })
})

describe('세션 — 팀을 떠난 뒤 흔적 지우기', () => {
  it('팀에서 나가면 연타 기록도 함께 지워, 다시 들어갔을 때 첫 콕이 막히지 않는다', async () => {
    const ctx = makeSession()
    const created = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id

    expect(await ctx.session.tap({ teamId })).toBe(true)
    await ctx.session.leaveTeam(teamId)

    // 같은 팀 이름으로 다시 만들어도 새 팀이라 막힐 이유가 없다
    const again = await ctx.session.createTeam({ name: '디자인팀', nickname: '나영' })
    expect(await ctx.session.tap({ teamId: again.memberships[0].team.id })).toBe(true)
  })
})

describe('세션 — 아직 쓰고 있다는 흔적', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /*
   * 이 앱은 컴퓨터를 켜 두는 동안 계속 떠 있어서, 앱을 켤 때 한 번 남기는 것만으로는
   * 오래 쓰는 사람일수록 활동이 없어 보이게 된다. 그래서 주기적으로 남긴다.
   */
  it('앱이 떠 있는 동안 주기마다 흔적을 남긴다', async () => {
    vi.useFakeTimers()
    const ctx = makeSession()
    const touch = vi.spyOn(ctx.net, 'touch')

    await ctx.session.restore()
    expect(touch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(TOUCH_INTERVAL_MS)
    expect(touch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(TOUCH_INTERVAL_MS)
    expect(touch).toHaveBeenCalledTimes(2)
  })

  it('앱을 끄면 흔적 남기기도 멈춘다', async () => {
    vi.useFakeTimers()
    const ctx = makeSession()
    const touch = vi.spyOn(ctx.net, 'touch')

    await ctx.session.restore()
    await ctx.session.dispose()
    await vi.advanceTimersByTimeAsync(TOUCH_INTERVAL_MS * 2)

    expect(touch).not.toHaveBeenCalled()
  })

  /* 인터넷이 없다고 사용자에게 말을 걸 일이 아니다. 다음 차례에 다시 남기면 된다. */
  it('흔적을 못 남겨도 조용히 넘어가고 다음 차례에 다시 시도한다', async () => {
    vi.useFakeTimers()
    const ctx = makeSession()
    const errors: string[] = []
    ctx.session.on('error', (message) => errors.push(message))
    const touch = vi.spyOn(ctx.net, 'touch').mockRejectedValue(new Error('OFFLINE'))

    await ctx.session.restore()
    await vi.advanceTimersByTimeAsync(TOUCH_INTERVAL_MS * 2)

    expect(touch).toHaveBeenCalledTimes(2)
    expect(errors).toEqual([])
  })

  /*
   * 이 주기는 어드민이 "지금 켜 둔 사람"을 세는 창(1시간)의 절반이어야 한다. 창과 같은
   * 간격이면 마지막 흔적이 경계에 걸린 사람이 셀 때마다 들락날락한다. 그 짝이 깨지는
   * 것을 여기서 잡는다 — 상수만 조용히 늘려 놓고 넘어가는 일이 실제로 있었다.
   */
  it('흔적 주기가 어드민의 1시간 창보다 촘촘하다', () => {
    expect(TOUCH_INTERVAL_MS).toBeLessThanOrEqual(60 * 60 * 1000 / 2)
  })
})
