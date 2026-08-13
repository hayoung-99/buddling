import { describe, it, expect, beforeEach } from 'vitest'
import {
  createFakeServer,
  createFakeNet,
  MAX_TEAMS_PER_DEVICE,
  MAX_MEMBERS_PER_TEAM,
  INVITE_TTL_MS,
} from '../src/services/fake-net.js'
import { toFriendlyError } from '../src/services/net.js'

/** 서로 다른 기기 두 대를 흉내 낸다 */
function twoDevices() {
  const server = createFakeServer()
  return {
    server,
    alice: createFakeNet({ server, deviceId: 'device-alice' }),
    bob: createFakeNet({ server, deviceId: 'device-bob' }),
  }
}

/** 팀을 만들고 두 사람 모두 실시간 채널에 붙인 상태를 만든다 */
async function connectedTeam() {
  const { server, alice, bob } = twoDevices()
  const a = await alice.createTeam({ name: '디자인팀', nickname: '나영', characterKey: 'cat' })
  const b = await bob.joinTeam({
    inviteCode: a.team.inviteCode,
    nickname: '민수',
    characterKey: 'duck',
  })
  await alice.connect(a.team, a.member)
  await bob.connect(b.team, b.member)
  return { server, alice, bob, a, b, teamId: a.team.id }
}

describe('팀 만들기', () => {
  let net
  beforeEach(() => {
    net = twoDevices()
  })

  it('6자리 초대코드를 발급한다', async () => {
    const { team } = await net.alice.createTeam({ name: '디자인팀', nickname: '나영' })
    expect(team.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(team.name).toBe('디자인팀')
  })

  it('헷갈리는 0·O·1·I 는 초대코드에 쓰지 않는다', async () => {
    for (let i = 0; i < 40; i += 1) {
      const { team } = await net.alice.createTeam({ name: `팀${i}`, nickname: '나영' })
      expect(team.inviteCode).not.toMatch(/[01OI]/)
      await net.alice.leaveTeam(team.id) // 정원을 비우고 다음 반복
    }
  })

  it('초대코드는 팀마다 다르다', async () => {
    const codes = new Set()
    for (let i = 0; i < 60; i += 1) {
      const { team } = await net.alice.createTeam({ name: `팀${i}`, nickname: '나영' })
      codes.add(team.inviteCode)
      await net.alice.leaveTeam(team.id)
    }
    expect(codes.size).toBe(60)
  })

  it('팀 이름을 비우면 기본 이름을 붙인다', async () => {
    const { team } = await net.alice.createTeam({ name: '   ', nickname: '나영' })
    expect(team.name).toBe('우리 팀')
  })

  it('닉네임 없이는 만들 수 없다', async () => {
    await expect(net.alice.createTeam({ name: '팀', nickname: '  ' })).rejects.toThrow(
      'NICKNAME_REQUIRED',
    )
  })
})

describe('여러 팀에 속하기', () => {
  it('한 기기가 여러 팀에 동시에 속할 수 있다', async () => {
    const { alice } = twoDevices()
    await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await alice.createTeam({ name: '개발팀', nickname: '나영' })

    const mine = await alice.getMyTeams()
    expect(mine.map((m) => m.team.name)).toEqual(['디자인팀', '개발팀'])
    // 팀마다 별도의 멤버 신분을 갖는다
    expect(mine[0].member.id).not.toBe(mine[1].member.id)
  })

  it(`최대 ${MAX_TEAMS_PER_DEVICE}개까지만 만들 수 있다`, async () => {
    const { alice } = twoDevices()
    for (let i = 0; i < MAX_TEAMS_PER_DEVICE; i += 1) {
      await alice.createTeam({ name: `팀${i}`, nickname: '나영' })
    }
    await expect(alice.createTeam({ name: '하나 더', nickname: '나영' })).rejects.toThrow(
      'TEAM_LIMIT_REACHED',
    )
  })

  it('정원이 찼으면 초대코드로도 더 못 들어간다', async () => {
    const { alice, bob } = twoDevices()
    const extra = await bob.createTeam({ name: '남의 팀', nickname: '민수' })
    for (let i = 0; i < MAX_TEAMS_PER_DEVICE; i += 1) {
      await alice.createTeam({ name: `팀${i}`, nickname: '나영' })
    }
    await expect(
      alice.joinTeam({ inviteCode: extra.team.inviteCode, nickname: '나영' }),
    ).rejects.toThrow('TEAM_LIMIT_REACHED')
  })

  it('하나를 나가면 다시 들어갈 자리가 생긴다', async () => {
    const { alice } = twoDevices()
    const first = await alice.createTeam({ name: '팀0', nickname: '나영' })
    for (let i = 1; i < MAX_TEAMS_PER_DEVICE; i += 1) {
      await alice.createTeam({ name: `팀${i}`, nickname: '나영' })
    }
    await alice.leaveTeam(first.team.id)

    await expect(alice.createTeam({ name: '새 팀', nickname: '나영' })).resolves.toBeTruthy()
    expect(await alice.getMyTeams()).toHaveLength(MAX_TEAMS_PER_DEVICE)
  })

  it('팀마다 다른 캐릭터를 고를 수 있다', async () => {
    const { alice } = twoDevices()
    const design = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    const dev = await alice.createTeam({ name: '개발팀', nickname: '나영' })

    await alice.setCharacter(design.team.id, 'bunny')
    await alice.setCharacter(dev.team.id, 'panda')

    const mine = await alice.getMyTeams()
    expect(mine.find((m) => m.team.id === design.team.id).member.characterKey).toBe('bunny')
    expect(mine.find((m) => m.team.id === dev.team.id).member.characterKey).toBe('panda')
  })

  it('팀이 없으면 빈 목록이다', async () => {
    const { alice } = twoDevices()
    expect(await alice.getMyTeams()).toEqual([])
  })
})

describe('초대코드로 참여하기', () => {
  it('코드가 맞으면 같은 팀에 들어간다', async () => {
    const { alice, bob } = twoDevices()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    const joined = await bob.joinTeam({ inviteCode: created.team.inviteCode, nickname: '민수' })

    expect(joined.team.id).toBe(created.team.id)
    expect(joined.member.nickname).toBe('민수')

    const [mine] = await alice.getMyTeams()
    expect(mine.members.map((m) => m.nickname).sort()).toEqual(['나영', '민수'])
  })

  it('대소문자와 앞뒤 공백은 알아서 맞춰준다', async () => {
    const { alice, bob } = twoDevices()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    const joined = await bob.joinTeam({
      inviteCode: `  ${created.team.inviteCode.toLowerCase()} `,
      nickname: '민수',
    })
    expect(joined.team.id).toBe(created.team.id)
  })

  it('없는 코드는 거절한다', async () => {
    const { alice } = twoDevices()
    await expect(alice.joinTeam({ inviteCode: 'ZZZZZZ', nickname: '나영' })).rejects.toThrow(
      'INVALID_INVITE_CODE',
    )
  })

  it('같은 팀에 같은 닉네임 두 명은 안 된다', async () => {
    const { alice, bob } = twoDevices()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await expect(
      bob.joinTeam({ inviteCode: created.team.inviteCode, nickname: '나영' }),
    ).rejects.toThrow('NICKNAME_TAKEN')
  })

  it('이미 들어와 있는 팀에 다시 참여하면 정원을 더 쓰지 않는다', async () => {
    const { alice } = twoDevices()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await alice.joinTeam({ inviteCode: created.team.inviteCode, nickname: '나영2' })

    const mine = await alice.getMyTeams()
    expect(mine).toHaveLength(1)
    expect(mine[0].member.nickname).toBe('나영2') // 닉네임만 갱신된다
  })
})

describe('콕 찌르기 (실시간)', () => {
  it('내가 클릭하면 팀원에게 전달된다', async () => {
    const { alice, bob, teamId } = await connectedTeam()
    const received = []
    bob.on('tap', (payload) => received.push(payload))

    await alice.sendTap({ teamId })

    expect(received).toHaveLength(1)
    expect(received[0].fromNickname).toBe('나영')
    expect(received[0].teamId).toBe(teamId) // 어느 팀에서 온 신호인지 알 수 있다
  })

  it('보낸 사람에게는 되돌아오지 않는다 (이미 로컬에서 반응했다)', async () => {
    const { alice, teamId } = await connectedTeam()
    const received = []
    alice.on('tap', (payload) => received.push(payload))

    await alice.sendTap({ teamId })

    expect(received).toHaveLength(0)
  })

  it('한 명을 지목하면 그 사람만 반응한다', async () => {
    const { server, alice, bob, a, b, teamId } = await connectedTeam()
    const carol = createFakeNet({ server, deviceId: 'device-carol' })
    const c = await carol.joinTeam({ inviteCode: a.team.inviteCode, nickname: '수진' })
    await carol.connect(c.team, c.member)

    const bobGot = []
    const carolGot = []
    bob.on('tap', (payload) => bobGot.push(payload))
    carol.on('tap', (payload) => carolGot.push(payload))

    await alice.sendTap({ teamId, toMemberId: b.member.id })

    expect(bobGot).toHaveLength(1)
    expect(carolGot).toHaveLength(0)
  })

  it('다른 팀에는 새어나가지 않는다', async () => {
    const { server, alice, teamId } = await connectedTeam()
    const outsider = createFakeNet({ server, deviceId: 'device-outsider' })
    const other = await outsider.createTeam({ name: '남의 팀', nickname: '철수' })
    await outsider.connect(other.team, other.member)

    const got = []
    outsider.on('tap', (payload) => got.push(payload))

    await alice.sendTap({ teamId })
    expect(got).toHaveLength(0)
  })

  it('내가 두 팀에 있어도 신호는 보낸 팀에만 간다', async () => {
    const { server } = twoDevices()
    const me = createFakeNet({ server, deviceId: 'device-me' })
    const mate = createFakeNet({ server, deviceId: 'device-mate' })

    const design = await me.createTeam({ name: '디자인팀', nickname: '나영' })
    const dev = await me.createTeam({ name: '개발팀', nickname: '나영' })
    const inDesign = await mate.joinTeam({ inviteCode: design.team.inviteCode, nickname: '민수' })
    const inDev = await mate.joinTeam({ inviteCode: dev.team.inviteCode, nickname: '민수' })

    await me.connect(design.team, design.member)
    await me.connect(dev.team, dev.member)
    await mate.connect(inDesign.team, inDesign.member)
    await mate.connect(inDev.team, inDev.member)

    const got = []
    mate.on('tap', (payload) => got.push(payload.teamId))

    await me.sendTap({ teamId: design.team.id })

    expect(got).toEqual([design.team.id])
  })

  it('연결하지 않은 팀에는 보낼 수 없다', async () => {
    const { alice } = twoDevices()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await expect(alice.sendTap({ teamId: created.team.id })).rejects.toThrow()
  })
})

describe('접속 상태(presence)', () => {
  it('두 사람이 붙으면 양쪽 다 두 명으로 보인다', async () => {
    const { alice, bob, a, b, teamId } = await connectedTeam()
    let seen = []
    alice.on('presence', (payload) => {
      if (payload.teamId === teamId) seen = payload.onlineIds
    })
    await bob.disconnect()
    await bob.connect(b.team, b.member)

    expect(seen.sort()).toEqual([a.member.id, b.member.id].sort())
  })

  it('나가면 목록에서 빠진다', async () => {
    const { alice, bob, a, teamId } = await connectedTeam()
    let seen = []
    alice.on('presence', (payload) => {
      if (payload.teamId === teamId) seen = payload.onlineIds
    })
    await bob.disconnect()

    expect(seen).toEqual([a.member.id])
  })
})

describe('캐릭터 바꾸기 / 팀 나가기', () => {
  it('바꾼 캐릭터가 다른 사람의 멤버 목록에 반영된다', async () => {
    const { alice, bob, teamId } = await connectedTeam()
    await bob.setCharacter(teamId, 'panda')

    const [mine] = await alice.getMyTeams()
    expect(mine.members.find((m) => m.nickname === '민수').characterKey).toBe('panda')
  })

  it('팀에 속하지 않은 기기는 캐릭터를 바꿀 수 없다', async () => {
    const { alice, teamId } = await connectedTeam()
    const stranger = createFakeNet({ server: twoDevices().server, deviceId: 'nobody' })
    await expect(stranger.setCharacter(teamId, 'duck')).rejects.toThrow('NOT_A_MEMBER')
    expect(alice).toBeTruthy()
  })

  it('팀을 나가면 남은 사람의 목록에서 사라진다', async () => {
    const { alice, bob, teamId } = await connectedTeam()
    await bob.leaveTeam(teamId)

    const [mine] = await alice.getMyTeams()
    expect(mine.members.map((m) => m.nickname)).toEqual(['나영'])
  })

  it('한 팀만 나가고 나머지 팀은 그대로 남는다', async () => {
    const { alice } = twoDevices()
    const design = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    const dev = await alice.createTeam({ name: '개발팀', nickname: '나영' })

    await alice.leaveTeam(design.team.id)

    const mine = await alice.getMyTeams()
    expect(mine).toHaveLength(1)
    expect(mine[0].team.id).toBe(dev.team.id)
  })
})

describe('오류 알림', () => {
  it.each([
    'INVALID_INVITE_CODE',
    'INVITE_EXPIRED',
    'NICKNAME_TAKEN',
    'NICKNAME_REQUIRED',
    'TEAM_LIMIT_REACHED',
    'TEAM_FULL',
  ])('%s 는 번역 열쇠로 바뀐다', (code) => {
    // 이 계층은 지금 어떤 나라말을 쓰는지 모르므로 문장을 만들지 않는다
    expect(toFriendlyError(new Error(`db error: ${code}`)).message).toBe(`error.${code}`)
  })

  it('스키마가 낡았을 때도 알아볼 수 있는 열쇠를 준다', () => {
    const friendly = toFriendlyError(new Error('function public.get_my_teams does not exist'))
    expect(friendly.message).toBe('error.schemaStale')
  })

  it('이미 열쇠인 오류는 그대로 둔다', () => {
    expect(toFriendlyError(new Error('error.notConnected')).message).toBe('error.notConnected')
  })
})

describe('아무도 없는 팀', () => {
  it('마지막 사람이 나가면 팀이 사라진다', async () => {
    const { server, alice } = twoDevices()
    const created = await alice.createTeam({ name: '잠깐 팀', nickname: '나영' })
    expect(server.teams.size).toBe(1)

    await alice.leaveTeam(created.team.id)
    expect(server.teams.size).toBe(0)
  })

  it('사라진 팀의 초대코드는 더 이상 통하지 않는다', async () => {
    const { alice, bob } = twoDevices()
    const created = await alice.createTeam({ name: '잠깐 팀', nickname: '나영' })
    await alice.leaveTeam(created.team.id)

    await expect(
      bob.joinTeam({ inviteCode: created.team.inviteCode, nickname: '민수' }),
    ).rejects.toThrow('INVALID_INVITE_CODE')
  })

  it('남은 사람이 있으면 팀은 그대로 있다', async () => {
    const { server, alice, bob, teamId } = await connectedTeam()
    await bob.leaveTeam(teamId)

    expect(server.teams.size).toBe(1)
    const [mine] = await alice.getMyTeams()
    expect(mine.team.id).toBe(teamId)
  })
})

describe('초대코드 유효시간', () => {
  /** 시계를 마음대로 돌릴 수 있는 서버 */
  const START = Date.parse('2026-01-01T00:00:00Z')

  function timedServer() {
    let clock = START
    const server = createFakeServer({ now: () => clock })
    return {
      server,
      advance: (ms) => {
        clock += ms
      },
      alice: createFakeNet({ server, deviceId: 'device-alice' }),
      bob: createFakeNet({ server, deviceId: 'device-bob' }),
    }
  }

  it('만든 코드에는 만료 시각이 붙는다', async () => {
    const { alice } = timedServer()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    expect(Date.parse(team.inviteExpiresAt)).toBe(START + INVITE_TTL_MS)
  })

  it(`${INVITE_TTL_MS / 3600000}시간 안에는 들어갈 수 있다`, async () => {
    const { advance, alice, bob } = timedServer()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })

    advance(INVITE_TTL_MS - 60000) // 만료 1분 전
    const joined = await bob.joinTeam({ inviteCode: team.inviteCode, nickname: '민수' })
    expect(joined.team.id).toBe(team.id)
  })

  it('시간이 지나면 같은 코드로 못 들어간다', async () => {
    const { advance, alice, bob } = timedServer()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })

    advance(INVITE_TTL_MS + 1000)
    await expect(bob.joinTeam({ inviteCode: team.inviteCode, nickname: '민수' })).rejects.toThrow(
      'INVITE_EXPIRED',
    )
  })

  it('만료돼도 이미 들어와 있는 팀원은 그대로다', async () => {
    const { advance, alice } = timedServer()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })

    advance(INVITE_TTL_MS + 1000)
    const mine = await alice.getMyTeams()
    expect(mine).toHaveLength(1)
    expect(mine[0].team.id).toBe(team.id)
  })

  it('새 코드를 발급하면 다시 들어올 수 있다', async () => {
    const { advance, alice, bob } = timedServer()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })

    advance(INVITE_TTL_MS + 1000)
    const fresh = await alice.refreshInvite(created.team.id)
    expect(fresh.inviteCode).not.toBe(created.team.inviteCode)

    const joined = await bob.joinTeam({ inviteCode: fresh.inviteCode, nickname: '민수' })
    expect(joined.team.id).toBe(created.team.id)
  })

  it('새 코드를 발급하면 예전 코드는 즉시 죽는다 — 유출됐을 때의 대응책', async () => {
    const { alice, bob } = timedServer()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await alice.refreshInvite(created.team.id)

    await expect(
      bob.joinTeam({ inviteCode: created.team.inviteCode, nickname: '민수' }),
    ).rejects.toThrow('INVALID_INVITE_CODE')
  })

  it('팀 밖의 사람은 코드를 새로 발급할 수 없다', async () => {
    const { alice, bob } = timedServer()
    const created = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await expect(bob.refreshInvite(created.team.id)).rejects.toThrow('NOT_A_MEMBER')
  })

  it('만료는 전용 열쇠로 구분된다 — 없는 코드와 다른 안내를 하기 위해', () => {
    expect(toFriendlyError(new Error('db error: INVITE_EXPIRED')).message).toBe(
      'error.INVITE_EXPIRED',
    )
    expect(toFriendlyError(new Error('db error: INVALID_INVITE_CODE')).message).toBe(
      'error.INVALID_INVITE_CODE',
    )
  })
})

describe('팀 정원', () => {
  /** 한 팀에 사람을 원하는 만큼 채워 넣는다 */
  async function fillTeam(server, inviteCode, count) {
    for (let i = 0; i < count; i += 1) {
      const net = createFakeNet({ server, deviceId: `filler-${i}` })
      await net.joinTeam({ inviteCode, nickname: `사람${i}` })
    }
  }

  it(`한 팀에 ${MAX_MEMBERS_PER_TEAM}명까지 들어갈 수 있다`, async () => {
    const { server, alice } = twoDevices()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })

    await fillTeam(server, team.inviteCode, MAX_MEMBERS_PER_TEAM - 1) // 만든 사람 포함 5명
    const [mine] = await alice.getMyTeams()
    expect(mine.members).toHaveLength(MAX_MEMBERS_PER_TEAM)
  })

  it('정원이 차면 더 못 들어온다', async () => {
    const { server, alice, bob } = twoDevices()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await fillTeam(server, team.inviteCode, MAX_MEMBERS_PER_TEAM - 1)

    await expect(bob.joinTeam({ inviteCode: team.inviteCode, nickname: '민수' })).rejects.toThrow(
      'TEAM_FULL',
    )
  })

  it('정원이 차도 이미 있는 사람은 닉네임을 바꿀 수 있다', async () => {
    const { server, alice } = twoDevices()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await fillTeam(server, team.inviteCode, MAX_MEMBERS_PER_TEAM - 1)

    const again = await alice.joinTeam({ inviteCode: team.inviteCode, nickname: '나영2' })
    expect(again.member.nickname).toBe('나영2')
  })

  it('한 명이 나가면 자리가 하나 생긴다', async () => {
    const { server, alice, bob } = twoDevices()
    const { team } = await alice.createTeam({ name: '디자인팀', nickname: '나영' })
    await fillTeam(server, team.inviteCode, MAX_MEMBERS_PER_TEAM - 1)

    const leaver = createFakeNet({ server, deviceId: 'filler-0' })
    await leaver.leaveTeam(team.id)

    await expect(
      bob.joinTeam({ inviteCode: team.inviteCode, nickname: '민수' }),
    ).resolves.toBeTruthy()
  })

  it('정원 초과는 전용 열쇠로 구분된다', () => {
    expect(toFriendlyError(new Error('db error: TEAM_FULL')).message).toBe('error.TEAM_FULL')
  })
})
