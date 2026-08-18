/**
 * 실제 Supabase 프로젝트를 상대로 하는 점검 스크립트.
 *
 *   node scripts/e2e-check.js
 *
 * 서로 다른 기기 두 대인 척하며 팀 만들기 → 참여 → 콕 찌르기 → 접속 상태까지
 * 한 번에 확인한다. 단위 테스트(fake-net)가 검증하는 것과 같은 규칙을,
 * 이번에는 진짜 RPC와 Realtime 을 거쳐 확인하는 것이 목적이다.
 *
 * 만든 팀과 멤버는 끝나면 지운다.
 */

const path = require('node:path')
const crypto = require('node:crypto')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// 소스가 아니라 빌드 산출물을 읽는다 (`src/services` 는 이제 타입스크립트다).
// 먼저 `npm run build` 가 돌아야 한다 — package.json 의 이 명령들이 그렇게 되어 있다.
const { createSupabaseNet } = require('../dist-main/services/supabase-net.cjs')

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 이벤트가 올 때까지 기다린다. 안 오면 실패로 처리한다. */
function expectEvent(net, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off()
      reject(new Error(`'${event}' 이벤트가 ${timeoutMs}ms 안에 오지 않았습니다`))
    }, timeoutMs)
    const off = net.on(event, (payload) => {
      clearTimeout(timer)
      off()
      resolve(payload)
    })
  })
}

const results = []
let rateLimited = false

/**
 * 요청 제한에 걸린 것인지 가린다.
 *
 * 이걸 그냥 "실패"로 찍으면 서버가 막아서 실패한 것과 구별이 안 된다. 실제로 채널
 * 정책을 확인하는 단계가 여기 걸려서, 방어가 뚫린 줄 알고 한참 들여다본 적이 있다.
 * 검사를 못 돌린 것과 검사가 틀어진 것은 전혀 다른 소식이다.
 */
const isRateLimited = (message) => /rate limit/i.test(message)

async function step(label, run) {
  process.stdout.write(`  ${label} … `)
  try {
    const detail = await run()
    console.log(`OK${detail ? ` (${detail})` : ''}`)
    results.push(true)
  } catch (error) {
    if (isRateLimited(error.message)) {
      rateLimited = true
      console.log(`못 돌림\n     → 익명 로그인 요청 제한에 걸렸습니다 (검사 자체는 하지 못했습니다)`)
    } else {
      console.log(`실패\n     → ${error.message}`)
    }
    results.push(false)
  }
}

async function main() {
  if (!URL || !KEY) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다. docs/SUPABASE_SETUP.md 참고.')
    process.exit(1)
  }
  console.log(`Supabase: ${URL}\n`)

  const suffix = crypto.randomBytes(3).toString('hex')

  /*
   * 클라이언트 하나가 곧 익명 계정 하나다.
   *
   * 세션 저장소를 주지 않으므로 createSupabaseNet 을 부를 때마다 새로 로그인하고,
   * 그때마다 auth.users 에 줄이 하나 생긴다. Supabase 의 익명 로그인 요청 제한은
   * 기본이 시간당 30건이라, 여기서 헤프게 만들면 뒷단계가 통째로 못 돌고 그 실패가
   * 마치 서버가 막은 것처럼 보인다. 실제로 한 번 그렇게 헷갈렸다.
   *
   * 그래서 "팀원이 아닌 사람"이 필요한 검사는 전부 outsider 하나를 돌려 쓴다.
   * 이 계정은 어디에도 성공적으로 들어가지 않으므로 언제나 남남인 상태를 유지한다.
   */
  const extras = []
  const device = () => {
    const net = createSupabaseNet({ url: URL, anonKey: KEY })
    extras.push(net)
    return net
  }

  const alice = createSupabaseNet({ url: URL, anonKey: KEY })
  const bob = createSupabaseNet({ url: URL, anonKey: KEY })
  const outsider = device()

  let team = null
  let secondTeam = null
  let aliceMember = null
  let bobMember = null

  await step('팀 만들기 (RPC create_team)', async () => {
    const created = await alice.createTeam({
      name: `점검용 팀 ${suffix}`,
      nickname: `나영-${suffix}`,
      characterKey: 'cat',
    })
    team = created.team
    aliceMember = created.member
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(team.inviteCode)) {
      throw new Error(`초대코드 형식이 이상합니다: ${team.inviteCode}`)
    }
    return `초대코드 ${team.inviteCode}`
  })

  await step('잘못된 초대코드는 거절 (RLS·검증)', async () => {
    try {
      await bob.joinTeam({ inviteCode: 'ZZZZZZ', nickname: '침입자', characterKey: 'duck' })
    } catch (error) {
      if (error.message === 'error.INVALID_INVITE_CODE') return '열쇠로 변환됨'
      throw error
    }
    throw new Error('없는 코드인데 참여가 되었습니다')
  })

  await step('초대코드로 참여 (RPC join_team)', async () => {
    const joined = await bob.joinTeam({
      inviteCode: team.inviteCode,
      nickname: `민수-${suffix}`,
      characterKey: 'duck',
    })
    bobMember = joined.member
    if (joined.team.id !== team.id) throw new Error('다른 팀에 들어갔습니다')
  })

  await step('멤버 목록 조회 (RPC get_my_teams)', async () => {
    const [mine] = await alice.getMyTeams()
    if (mine.members.length !== 2) {
      throw new Error(`팀원이 2명이어야 하는데 ${mine.members.length}명입니다`)
    }
    return `${mine.members.map((m) => m.nickname).join(', ')}`
  })

  await step('한 기기가 두 번째 팀도 만들 수 있다', async () => {
    const created = await alice.createTeam({
      name: `점검용 둘째 팀 ${suffix}`,
      nickname: `나영-${suffix}`,
      characterKey: 'bunny',
    })
    secondTeam = created.team
    const mine = await alice.getMyTeams()
    if (mine.length !== 2) throw new Error(`팀이 2개여야 하는데 ${mine.length}개입니다`)
    return `${mine.map((m) => m.team.name.split(' ').slice(0, 2).join(' ')).join(' / ')}`
  })

  await step('팀마다 다른 캐릭터를 갖는다', async () => {
    const mine = await alice.getMyTeams()
    const keys = mine.map((m) => m.member.characterKey)
    if (new Set(keys).size !== 2) throw new Error(`캐릭터가 갈리지 않았습니다: ${keys.join(', ')}`)
    return keys.join(' / ')
  })

  await step('네 번째 팀은 거절된다 (최대 3개)', async () => {
    await alice.createTeam({
      name: `점검용 셋째 팀 ${suffix}`,
      nickname: `나영-${suffix}`,
      characterKey: 'dog',
    })
    try {
      await alice.createTeam({
        name: `점검용 넷째 팀 ${suffix}`,
        nickname: `나영-${suffix}`,
        characterKey: 'dog',
      })
    } catch (error) {
      if (error.message === 'error.TEAM_LIMIT_REACHED') return '열쇠로 변환됨'
      throw error
    }
    throw new Error('정원이 찼는데도 팀이 만들어졌습니다')
  })

  await step('실시간 채널 연결 (Realtime subscribe)', async () => {
    await alice.connect(team, aliceMember)
    await bob.connect(team, bobMember)
  })

  // 앱으로는 만들 수 없는 상황이라 여기서만 확인된다. supabase/schema.sql 의
  // realtime.messages 정책이 실제로 문을 지키는지 보는 유일한 자리다.
  await step('팀원이 아니면 채널에 못 붙는다 (Realtime 정책)', async () => {
    // 팀과 멤버 정보를 통째로 넘겨도 소용없어야 한다. 이 값들은 비밀이 아니다 —
    // 창 인자(--team-id=)와 팀원들의 로컬 파일에 그대로 돌아다닌다.
    try {
      await outsider.connect(team, aliceMember)
    } catch {
      return '거절됨'
    }
    throw new Error('팀원이 아닌데도 채널에 붙었습니다')
  })

  await step('콕 찌르기가 팀원에게 도착 (Broadcast)', async () => {
    const received = expectEvent(bob, 'tap')
    await wait(300) // 양쪽 구독이 자리를 잡을 시간
    await alice.sendTap({ teamId: team.id })
    const payload = await received
    if (payload.fromMemberId !== aliceMember.id) throw new Error('보낸 사람이 다릅니다')
    if (payload.teamId !== team.id) throw new Error('teamId 가 붙지 않았습니다')
    return `"${payload.fromNickname}" 로부터`
  })

  await step('한 명만 지목한 콕 찌르기', async () => {
    const received = expectEvent(bob, 'tap')
    await bob.sendTap({ teamId: team.id, toMemberId: bobMember.id }) // 자기 자신에게는 안 온다
    await alice.sendTap({ teamId: team.id, toMemberId: bobMember.id })
    const payload = await received
    if (payload.toMemberId !== bobMember.id) throw new Error('대상이 다릅니다')
  })

  await step('접속 상태 공유 (Presence)', async () => {
    // presence 는 서버가 동기화해 줄 때까지 잠깐 걸린다. 잠시 기다렸다 확인한다.
    let online = []
    for (let attempt = 0; attempt < 20; attempt += 1) {
      online = alice.onlineIn(team.id)
      if (online.includes(aliceMember.id) && online.includes(bobMember.id)) break
      await wait(250)
    }
    if (process.env.E2E_DEBUG) console.log('\n     presence 상태:', JSON.stringify(online))
    for (const [who, id] of [
      ['나영', aliceMember.id],
      ['민수', bobMember.id],
    ]) {
      if (!online.includes(id)) throw new Error(`접속 목록에 ${who}(${id}) 가 없습니다`)
    }
    return `${online.length}명 접속 중`
  })

  await step('캐릭터 변경이 상대에게 반영 (RPC set_character)', async () => {
    await bob.setCharacter(team.id, 'panda')
    const [mine] = await alice.getMyTeams()
    const found = mine.members.find((m) => m.id === bobMember.id)
    if (found.characterKey !== 'panda') throw new Error(`반영 안 됨: ${found.characterKey}`)
  })

  await step('멤버 목록 변경 알림이 전달 (Broadcast roster)', async () => {
    const received = expectEvent(alice, 'roster')
    await bob.announceRosterChange(team.id)
    await received
  })

  await step('팀 나가기 후 목록에서 사라짐 (RPC leave_team)', async () => {
    await bob.leaveTeam(team.id)
    const [mine] = await alice.getMyTeams()
    if (mine.members.length !== 1) throw new Error(`${mine.members.length}명이 남았습니다`)
  })

  // 방금 나간 사람으로 바로 확인한다. 나갈 때 앱이 스스로 연결을 끊으므로 "조용해졌다"
  // 만으로는 서버가 막았는지 알 수 없다. 다시 붙어 보는 것만이 증거가 된다.
  await step('팀을 나가면 채널에 다시 못 붙는다', async () => {
    try {
      await bob.connect(team, bobMember)
    } catch {
      return '다시 붙지 못함'
    }
    throw new Error('나갔는데도 채널에 다시 붙었습니다')
  })

  await step('한 팀만 나가도 나머지 팀은 남는다', async () => {
    await alice.leaveTeam(secondTeam.id)
    const mine = await alice.getMyTeams()
    if (!mine.some((m) => m.team.id === team.id)) throw new Error('첫 팀까지 사라졌습니다')
    return `${mine.length}개 남음`
  })

  await step('아무도 없게 된 팀은 DB에서 사라진다', async () => {
    // 직전 단계에서 혼자였던 둘째 팀을 나갔다 → 초대코드도 함께 없어져야 한다
    try {
      await bob.joinTeam({
        inviteCode: secondTeam.inviteCode,
        nickname: `민수2-${suffix}`,
        characterKey: 'cat',
      })
    } catch (error) {
      if (error.message === 'error.INVALID_INVITE_CODE') return '초대코드도 함께 사라짐'
      throw error
    }
    throw new Error('빈 팀이 그대로 남아 있습니다')
  })

  // ── 초대코드 만료·재발급, 팀 정원 ──
  let refreshTeam = null

  await step('초대코드에 24시간 만료가 붙는다', async () => {
    const owner = device()
    const created = await owner.createTeam({ name: `만료 점검 ${suffix}`, nickname: '주인' })
    refreshTeam = { net: owner, ...created }

    const hours = (Date.parse(created.team.inviteExpiresAt) - Date.now()) / 3600000
    if (!(hours > 23 && hours < 25)) throw new Error(`남은 시간이 ${hours.toFixed(1)}시간입니다`)
    return `${hours.toFixed(1)}시간 뒤 만료`
  })

  await step('팀 밖의 사람은 코드를 새로 발급할 수 없다', async () => {
    try {
      await outsider.refreshInvite(refreshTeam.team.id)
    } catch (error) {
      if (error.message === 'error.NOT_A_MEMBER') return '거절됨'
      throw error
    }
    throw new Error('남이 코드를 갈아끼웠습니다')
  })

  await step('새 코드를 발급하면 예전 코드는 즉시 죽는다', async () => {
    const oldCode = refreshTeam.team.inviteCode
    const fresh = await refreshTeam.net.refreshInvite(refreshTeam.team.id)
    if (fresh.inviteCode === oldCode) throw new Error('코드가 그대로입니다')

    try {
      await outsider.joinTeam({ inviteCode: oldCode, nickname: '지각생' })
    } catch (error) {
      if (error.message !== 'error.INVALID_INVITE_CODE') throw error
      // 새 코드로는 들어가진다
      await device().joinTeam({ inviteCode: fresh.inviteCode, nickname: '제때' })
      return `${oldCode} → ${fresh.inviteCode}`
    }
    throw new Error('예전 코드로 들어가졌습니다')
  })

  await step('닉네임과 팀 이름을 나중에 바꿀 수 있다', async () => {
    const renamed = await refreshTeam.net.renameTeam(refreshTeam.team.id, `이름바꾼팀 ${suffix}`)
    if (!renamed.name.startsWith('이름바꾼팀')) throw new Error('팀 이름이 그대로입니다')

    const member = await refreshTeam.net.setNickname(refreshTeam.team.id, `새이름-${suffix}`)
    if (!member.nickname.startsWith('새이름')) throw new Error('닉네임이 그대로입니다')
    return `${renamed.name} / ${member.nickname}`
  })

  await step('같은 팀에 있는 이름으로는 바꿀 수 없다', async () => {
    const mate = device()
    const fresh = await refreshTeam.net.refreshInvite(refreshTeam.team.id)
    await mate.joinTeam({ inviteCode: fresh.inviteCode, nickname: `동료-${suffix}` })

    try {
      await mate.setNickname(refreshTeam.team.id, `새이름-${suffix}`)
    } catch (error) {
      if (error.message === 'error.NICKNAME_TAKEN') return '중복 거절됨'
      throw error
    }
    throw new Error('같은 닉네임으로 바뀌었습니다')
  })

  await step('팀 밖의 사람은 팀 이름을 못 바꾼다', async () => {
    try {
      await outsider.renameTeam(refreshTeam.team.id, '남의 팀')
    } catch (error) {
      if (error.message === 'error.NOT_A_MEMBER') return '거절됨'
      throw error
    }
    throw new Error('남이 팀 이름을 바꿨습니다')
  })

  await step('팀 정원은 5명이다', async () => {
    const host = device()
    const { team: crowded } = await host.createTeam({ name: `정원 점검 ${suffix}`, nickname: '방장' })

    for (let i = 1; i < 5; i += 1) {
      await device().joinTeam({ inviteCode: crowded.inviteCode, nickname: `손님${i}` })
    }
    try {
      await outsider.joinTeam({ inviteCode: crowded.inviteCode, nickname: '초과' })
    } catch (error) {
      if (error.message === 'error.TEAM_FULL') return '5명까지, 6번째 거절'
      throw error
    }
    throw new Error('6번째가 들어갔습니다')
  })

  // 뒷정리
  for (const net of extras) {
    for (const mine of await net.getMyTeams().catch(() => [])) {
      await net.leaveTeam(mine.team.id).catch(() => {})
    }
    await net.disconnect().catch(() => {})
  }

  for (const mine of await alice.getMyTeams().catch(() => [])) {
    await alice.leaveTeam(mine.team.id).catch(() => {})
  }
  await alice.disconnect().catch(() => {})
  await bob.disconnect().catch(() => {})

  const failed = results.filter((ok) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} 통과`)

  if (rateLimited) {
    console.log(
      '\n못 돌린 단계가 있습니다. 이 점검은 익명 계정을 11개쯤 새로 만드는데,\n' +
        'Supabase 의 익명 로그인 제한이 기본 시간당 30건입니다. 한 시간 안에 여러 번\n' +
        '돌렸다면 잠시 뒤에 다시 해 보세요. 자주 돌려야 한다면 대시보드\n' +
        'Authentication → Rate Limits 에서 한도를 올릴 수 있습니다.',
    )
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\n점검 중 오류:', error.message)
  process.exit(1)
})
