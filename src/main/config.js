/**
 * Supabase 접속 정보를 어디서 읽을지 정하는 곳.
 *
 * 찾는 순서
 *   1) 실행할 때 넘긴 환경변수 (SUPABASE_URL / SUPABASE_ANON_KEY)
 *   2) 저장소 루트의 `.env` 파일 — 개발할 때
 *   3) 빌드할 때 구워 넣은 값     — 배포한 앱에서
 *
 * 3번이 있어야 GitHub Releases 로 받은 사람이 아무 설정 없이 바로 쓸 수 있다.
 * `npm run dist` 가 `scripts/bake-config.js` 를 먼저 돌려 그 값을 만들어 넣는다.
 *
 * anon 키는 원래 공개되는 값이다 — 테이블은 RLS 로 잠겨 있고 모든 접근은
 * security definer 함수로만 이뤄지므로, 키만으로는 남의 팀을 들여다볼 수 없다.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')
const BAKED = path.join(__dirname, 'config.generated.json')
const ENV_FILE = '.env'

function loadConfig() {
  // 이미 들어 있는 환경변수는 dotenv 가 덮어쓰지 않는다
  require('dotenv').config({ path: path.join(ROOT, ENV_FILE) })
  if (process.resourcesPath) {
    require('dotenv').config({ path: path.join(process.resourcesPath, ENV_FILE) })
  }

  let baked = {}
  try {
    baked = JSON.parse(fs.readFileSync(BAKED, 'utf8'))
  } catch {
    // 빌드하지 않았으면 없는 게 정상이다
  }

  return {
    url: process.env.SUPABASE_URL || baked.url || '',
    anonKey: process.env.SUPABASE_ANON_KEY || baked.anonKey || '',
  }
}

module.exports = { loadConfig, BAKED }
