import { describe, it, expect, beforeEach } from 'vitest'
import { createSession } from '../src/main/session.js'
import { createFakeServer, createFakeNet, MAX_TEAMS_PER_DEVICE } from '../src/services/fake-net.js'

/** Electron 없이 돌아가는 저장소 흉내 */
function memoryStore(deviceId = 'device-me') {
  let state = { deviceId, nickname: '', memberships: [], pets: {}, petVisible: true }
  return {
    get: (key) => state[key],
    set(patch) {
      state = { ...state, ...patch }
      return state
    },
    pet: (teamId) => ({ position: null, scale: 1, ...(state.pets[teamId] ?? {}) }),
    setPet(teamId, patch) {
      state.pets = { ...state.pets, [teamId]: { ...this.pet(teamId), ...patch } }
      return state.pets[teamId]
    },
    prunePets(teamIds) {
      const keep = new Set(teamIds)
      state.pets = Object.fromEntries(Object.entries(state.pets).filter(([id]) => keep.has(id)))
    },
    /** 테스트에서 들여다보기 위한 창 */
    peek: () => state,
  }
}

function makeSession({ server = createFakeServer(), deviceId = 'device-me' } = {}) {
  const store = memoryStore(deviceId)
  const net = createFakeNet({ server, deviceId })
  const session = createSession({ url: 'x', anonKey: 'y', store, net })
  return { server, store, net, session }
}

describe('세션 — 팀 만들고 들어가기', () => {
  let ctx
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

  it(`팀 ${MAX_TEAMS_PER_DEVICE}개를 넘기면 거절한다`, async () => {
    for (let i = 0; i < MAX_TEAMS_PER_DEVICE; i += 1) {
      await ctx.session.createTeam({ name: `팀${i}`, nickname: '나영' })
    }
    await expect(ctx.session.createTeam({ name: '넘침', nickname: '나영' })).rejects.toThrow(
      'TEAM_LIMIT_REACHED',
    )
  })

  it('정원이 찼어도 이미 속한 팀에는 다시 참여할 수 있다 (닉네임 변경 경로)', async () => {
    const first = await ctx.session.createTeam({ name: '팀0', nickname: '나영' })
    const code = first.memberships[0].team.inviteCode
    for (let i = 1; i < MAX_TEAMS_PER_DEVICE; i += 1) {
      await ctx.session.createTeam({ name: `팀${i}`, nickname: '나영' })
    }

    const after = await ctx.session.joinTeam({ inviteCode: code, nickname: '나영2' })
    expect(after.memberships).toHaveLength(MAX_TEAMS_PER_DEVICE)
    expect(after.memberships.find((m) => m.team.inviteCode === code).member.nickname).toBe('나영2')
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
    expect(state.memberships.find((m) => m.team.id === designId).member.characterKey).toBe('bunny')
    expect(state.memberships.find((m) => m.team.id === devId).member.characterKey).toBe('panda')
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
    const me = makeSession({ server, deviceId: 'device-me' })
    const mate = makeSession({ server, deviceId: 'device-mate' })

    const created = await me.session.createTeam({ name: '디자인팀', nickname: '나영' })
    const teamId = created.memberships[0].team.id
    await mate.session.joinTeam({
      inviteCode: created.memberships[0].team.inviteCode,
      nickname: '민수',
    })

    const got = []
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
        { team: { id: 't1', name: '지난 팀' }, member: { id: 'm1', characterKey: 'duck' } },
      ],
    })
    const session = createSession({ url: '', anonKey: '', store })
    expect(session.snapshot().memberships).toHaveLength(1)
  })
})
