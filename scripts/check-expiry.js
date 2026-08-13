/**
 * 초대코드가 정말로 만료되는지 실제 Supabase 로 확인한다.
 *
 * 24시간을 기다릴 수는 없으니, 먼저 `supabase/expiry-test.sql` 을 실행해
 * 유효시간을 10초로 줄여 두고 이 스크립트를 돌린다.
 *
 *   node scripts/check-expiry.js
 *
 * 끝나면 supabase/schema.sql 을 다시 실행해 24시간으로 되돌리세요.
 */

const path = require('node:path')
const crypto = require('node:crypto')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { createSupabaseNet } = require('../src/services/supabase-net')

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
async function step(label, run) {
  process.stdout.write(`  ${label} … `)
  try {
    const detail = await run()
    console.log(`OK${detail ? ` (${detail})` : ''}`)
    results.push(true)
  } catch (error) {
    console.log(`실패\n     → ${error.message}`)
    results.push(false)
  }
}

async function main() {
  if (!URL || !KEY) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다.')
    process.exit(1)
  }
  console.log(`Supabase: ${URL}\n`)

  const suffix = crypto.randomBytes(3).toString('hex')
  const owner = createSupabaseNet({ url: URL, anonKey: KEY, deviceId: `exp-a-${suffix}` })
  const guest = createSupabaseNet({ url: URL, anonKey: KEY, deviceId: `exp-b-${suffix}` })

  let team = null
  let ttlSeconds = 0

  await step('유효시간이 10초로 줄어 있다', async () => {
    const created = await owner.createTeam({
      name: `만료 실험 ${suffix}`,
      nickname: `주인-${suffix}`,
      characterKey: 'cat',
    })
    team = created.team
    ttlSeconds = Math.round((Date.parse(team.inviteExpiresAt) - Date.now()) / 1000)

    if (ttlSeconds > 60) {
      throw new Error(
        `아직 ${ttlSeconds}초로 잡혀 있습니다. supabase/expiry-test.sql 을 먼저 실행해 주세요`,
      )
    }
    return `${ttlSeconds}초 뒤 만료`
  })

  await step('만료 전에는 들어갈 수 있다', async () => {
    const joined = await guest.joinTeam({
      inviteCode: team.inviteCode,
      nickname: `손님-${suffix}`,
      characterKey: 'duck',
    })
    if (joined.team.id !== team.id) throw new Error('다른 팀에 들어갔습니다')
    await guest.leaveTeam(team.id) // 다시 나와서 만료 뒤를 시험한다
  })

  await step(`${ttlSeconds + 3}초 기다렸다가 다시 시도하면 거절된다`, async () => {
    await wait((ttlSeconds + 3) * 1000)
    try {
      await guest.joinTeam({
        inviteCode: team.inviteCode,
        nickname: `지각-${suffix}`,
        characterKey: 'duck',
      })
    } catch (error) {
      if (error.message === 'error.INVITE_EXPIRED') return '만료 열쇠로 변환됨'
      throw error
    }
    throw new Error('만료된 코드로 들어가졌습니다')
  })

  await step('새 코드를 발급하면 다시 들어갈 수 있다', async () => {
    const fresh = await owner.refreshInvite(team.id)
    const joined = await guest.joinTeam({
      inviteCode: fresh.inviteCode,
      nickname: `늦둥이-${suffix}`,
      characterKey: 'duck',
    })
    if (joined.team.id !== team.id) throw new Error('다른 팀에 들어갔습니다')
    return `${team.inviteCode} → ${fresh.inviteCode}`
  })

  // 뒷정리
  for (const net of [guest, owner]) {
    for (const mine of await net.getMyTeams().catch(() => [])) {
      await net.leaveTeam(mine.team.id).catch(() => {})
    }
    await net.disconnect().catch(() => {})
  }

  const failed = results.filter((ok) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} 통과`)
  if (failed === 0) {
    console.log('\n확인이 끝났습니다. supabase/schema.sql 을 다시 실행해 24시간으로 되돌려 주세요.')
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\n점검 중 오류:', error.message)
  process.exit(1)
})
