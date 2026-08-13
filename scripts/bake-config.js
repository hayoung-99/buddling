/**
 * 배포용 앱에 Supabase 접속 정보를 구워 넣는다.
 *
 *   node scripts/bake-config.js
 *
 * `npm run dist` 가 electron-builder 앞에 이걸 먼저 돌린다.
 * 값이 없으면 그냥 멈춘다 — 키 없는 앱을 배포하면 받는 사람이 아무것도 못 하기 때문이다.
 *
 * CI(GitHub Actions)에서 빌드한다면 저장소에 키를 두지 말고
 * 시크릿으로 넣은 환경변수를 그대로 읽게 하면 된다.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
require('dotenv').config({ path: path.join(ROOT, '.env') })

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error(
    [
      '',
      '빌드를 멈춥니다: Supabase 접속 정보가 없습니다.',
      '',
      '이대로 배포하면 앱을 받은 사람은 "설정이 필요해요" 화면만 보게 됩니다.',
      '',
      '  · 내 컴퓨터에서 빌드한다면 → 프로젝트 루트의 환경설정 파일을 채우세요',
      '  · CI 에서 빌드한다면      → SUPABASE_URL / SUPABASE_ANON_KEY 를 시크릿으로 넘기세요',
      '',
      '자세한 내용은 docs/SUPABASE_SETUP.md 를 보세요.',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

const target = path.join(ROOT, 'src', 'main', 'config.generated.json')
fs.writeFileSync(target, `${JSON.stringify({ url, anonKey }, null, 2)}\n`)
console.log(`구워 넣음 → ${path.relative(ROOT, target)}  (${url})`)
