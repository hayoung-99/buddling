/**
 * 새 버전이 나왔는지 알아보고 **알려주기만** 한다. 받아서 설치하지는 않는다.
 *
 * 설치까지 하는 길은 `auto-update.js` 에 따로 있고, 어느 쪽을 쓸지는
 * `updates.js` 가 플랫폼을 보고 정한다. 이 파일은 그중 "알리기만" 하는 쪽이다.
 *
 * 이 길이 필요한 이유는 두 가지다.
 *   - macOS 는 코드 서명이 없으면 자동 설치가 구조적으로 불가능하다
 *   - Windows 라도 내려받기가 실패할 수 있다. 그때 조용히 넘어가는 대신
 *     사람에게 알려서 직접 받게 한다
 *
 * 굳이 알림이라도 두는 이유:
 *   Supabase 접속 정보가 앱에 구워져 나가기 때문에, 키를 갈면 예전 버전을 쓰던
 *   사람은 어느 날 갑자기 연결이 끊긴다. 그때 무슨 일인지 알 방법이 있어야 한다.
 */

const REPO = 'alice-0130/tap-tap'

const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`

/**
 * 알림을 눌렀을 때 열 곳.
 * 랜딩 페이지에는 설치할 때 뜨는 경고를 넘는 방법까지 적혀 있으므로,
 * 배포한 뒤에는 이 값을 랜딩 페이지 주소로 바꾸는 편이 친절하다.
 */
const DOWNLOAD_PAGE = `https://github.com/${REPO}/releases/latest`

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 하루 한 번이면 충분하다
const FIRST_CHECK_DELAY_MS = 8000 // 앱이 뜨는 동안은 방해하지 않는다
const REQUEST_TIMEOUT_MS = 8000

/** "v0.1.0" · "0.1.0" → [0, 1, 0]. 읽을 수 없으면 null. */
function parseVersion(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0] // 0.2.0-beta.1 의 뒷부분은 보지 않는다

  const parts = cleaned.split('.')
  if (parts.length === 0 || parts.length > 3) return null

  const numbers = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : NaN))
  if (numbers.some(Number.isNaN)) return null

  while (numbers.length < 3) numbers.push(0)
  return numbers
}

/**
 * latest 가 current 보다 새 버전인가.
 * 판단할 수 없으면 false — 확실하지 않을 때 알림을 띄우지 않는다.
 */
function isNewer(current, latest) {
  const a = parseVersion(current)
  const b = parseVersion(latest)
  if (!a || !b) return false

  for (let index = 0; index < 3; index += 1) {
    if (b[index] > a[index]) return true
    if (b[index] < a[index]) return false
  }
  return false
}

/** GitHub 에서 최신 릴리스 태그를 읽어온다. 실패하면 null. */
async function fetchLatestVersion() {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      accept: 'application/vnd.github+json',
      // GitHub 은 User-Agent 없는 요청을 거절한다
      'user-agent': 'tap-tap-desktop',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const body = await response.json()
  return typeof body?.tag_name === 'string' ? body.tag_name : null
}

/**
 * 주기적으로 확인해서 새 버전이 있으면 한 번 알려준다.
 *
 * 네트워크 실패는 조용히 넘긴다 — 알림 기능 때문에 오류 메시지가 뜨면
 * 정작 중요한 오류가 묻힌다.
 *
 * `ready: false` 를 실어 보낸다 — 받아 둔 것이 없으니 화면은 "받으러 가기"를
 * 보여줘야 한다는 뜻이다. 받아 둔 경우는 `auto-update.js` 가 true 로 보낸다.
 *
 * @param {{
 *   currentVersion: string,
 *   onUpdate: (info: { version: string, url: string, ready: false }) => void,
 *   fetchLatest?: () => Promise<string|null>,
 * }} options
 * @returns {{ stop: () => void }}
 */
function startUpdateCheck({ currentVersion, onUpdate, fetchLatest = fetchLatestVersion }) {
  let stopped = false
  let announced = null

  async function check() {
    if (stopped) return
    try {
      const latest = await fetchLatest()
      if (stopped || !latest || latest === announced) return
      if (!isNewer(currentVersion, latest)) return

      announced = latest
      onUpdate({ version: String(latest).replace(/^v/i, ''), url: DOWNLOAD_PAGE, ready: false })
    } catch {
      // 인터넷이 없거나 GitHub 이 잠깐 안 될 뿐이다. 다음 차례에 다시 본다.
    }
  }

  const first = setTimeout(check, FIRST_CHECK_DELAY_MS)
  const repeat = setInterval(check, CHECK_INTERVAL_MS)
  // 이 타이머 때문에 앱이 종료되지 못하는 일이 없게 한다
  first.unref?.()
  repeat.unref?.()

  return {
    stop() {
      stopped = true
      clearTimeout(first)
      clearInterval(repeat)
    },
  }
}

module.exports = { isNewer, startUpdateCheck }
