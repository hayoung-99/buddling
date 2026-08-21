import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSession, TOUCH_INTERVAL_MS } from '../src/main/session'
import { createFakeServer, createFakeNet, MAX_TEAMS_PER_USER } from '../src/services/fake-net'
import type { Store, StoredState } from '../src/main/store'
import type { Net } from '../src/services/net'
import type { PetSettings, TapPayload } from '@buddling/shared/state'

const DEFAULT_PET: PetSettings = { position: null, scale: 1 }

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

function makeSession({ server = createFakeServer(), userId = 'user-me' } = {}) {
  const store = memoryStore()
  const net = createFakeNet({ server, userId })
  const session = createSession({ url: 'x', anonKey: 'y', store, net })
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
