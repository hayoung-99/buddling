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

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

/** 이 앱의 뿌리 (`apps/desktop`). 배포본에서는 asar 의 뿌리다. */
const ROOT = path.join(__dirname, '..', '..')

/**
 * 저장소의 뿌리. 개발할 때만 뜻이 있다.
 *
 * 개발용 설정 파일은 **저장소 루트에 하나** 둔다. 앱과 랜딩·어드민이 같은 Supabase
 * 프로젝트를 보므로 워크스페이스마다 사본을 두면 어긋나기 때문이다. 배포본에서는
 * 이 경로가 asar 밖을 가리키게 되지만, 거기서는 아래 `resourcesPath` 와 구운 값이
 * 답하므로 없는 채로 지나간다.
 */
const REPO_ROOT = path.join(ROOT, '..', '..')

/**
 * 구워 넣은 접속 정보. **저장소 루트에 둔다.**
 *
 * 예전에는 `src/main/` 안에 있었는데, 그 자리가 이제 빌드 산출물 폴더(`dist-main/main/`)
 * 라 `emptyOutDir` 가 지워 버린다. 하필 `npm run dist` 는 굽기 → 빌드 순서라 정확히 그
 * 순서로 사라진다. 루트로 빼면 빌드와 무관해진다.
 */
const BAKED = path.join(ROOT, 'config.generated.json')
const ENV_FILE = '.env'

function loadConfig() {
  // 이미 들어 있는 환경변수는 dotenv 가 덮어쓰지 않는다. 그래서 가까운 곳부터 읽는다 —
  // 앱 폴더에 따로 둔 것이 있으면 그것이 이기고, 없으면 저장소 루트 것을 쓴다.
  dotenv.config({ path: path.join(ROOT, ENV_FILE) })
  dotenv.config({ path: path.join(REPO_ROOT, ENV_FILE) })
  if (process.resourcesPath) {
    dotenv.config({ path: path.join(process.resourcesPath, ENV_FILE) })
  }

  let baked: { url?: string; anonKey?: string } = {}
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

export { loadConfig, BAKED }
