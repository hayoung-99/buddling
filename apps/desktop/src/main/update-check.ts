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

const REPO = 'hayoung-99/doran-doran-desktop'

const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`

/**
 * 알림을 눌렀을 때 열 곳.
 * 랜딩 페이지에는 설치할 때 뜨는 경고를 넘는 방법까지 적혀 있으므로,
 * 배포한 뒤에는 이 값을 랜딩 페이지 주소로 바꾸는 편이 친절하다.
 */
const DOWNLOAD_PAGE = `https://github.com/${REPO}/releases/latest`

const REQUEST_TIMEOUT_MS = 8000

/** "v0.1.0" · "0.1.0" → [0, 1, 0]. 읽을 수 없으면 null. */
function parseVersion(value: unknown): number[] | null {
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
function isNewer(current: string, latest: string): boolean {
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
      'user-agent': 'doran-doran-desktop',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const body = await response.json()
  return typeof body?.tag_name === 'string' ? body.tag_name : null
}

/**
 * 아침마다 한 번 확인해서 새 버전이 있으면 알려준다.
 *
 * 언제 볼지는 `update-schedule.js` 가 정한다. 여기는 "보라고 하면 본다".
 *
 * 네트워크 실패는 조용히 넘긴다 — 알림 기능 때문에 오류 메시지가 뜨면
 * 정작 중요한 오류가 묻힌다.
 *
 * `ready: false` 를 실어 보낸다 — 받아 둔 것이 없으니 화면은 "받으러 가기"를
 * 보여줘야 한다는 뜻이다. 받아 둔 경우는 `auto-update.js` 가 true 로 보낸다.
 *
 */
export interface UpdateCheckOptions {
  currentVersion: string
  onUpdate: (info: { version: string; url: string; ready: false }) => void
  /** 언제 볼지를 정해 주는 쪽 (`update-schedule.ts`) */
  schedule: (check: () => void) => { stop: () => void }
  /** 자동 내려받기가 실패해 이 길로 갈아탄 경우, 일정을 기다리지 않고 지금 한 번 본다 */
  immediate?: boolean
  /** 테스트가 GitHub 대신 답한다 */
  fetchLatest?: () => Promise<string | null>
}

function startUpdateCheck({
  currentVersion,
  onUpdate,
  schedule,
  immediate = false,
  fetchLatest = fetchLatestVersion,
}: UpdateCheckOptions) {
  let stopped = false
  let announced: string | null = null

  async function check() {
    if (stopped) return
    try {
      const latest = await fetchLatest()
      if (stopped || !latest || latest === announced) return
      if (!isNewer(currentVersion, latest)) return

      announced = latest
      onUpdate({ version: String(latest).replace(/^v/i, ''), url: DOWNLOAD_PAGE, ready: false })
    } catch {
      // 인터넷이 없거나 GitHub 이 잠깐 안 될 뿐이다. 내일 아침에 다시 본다.
    }
  }

  /*
   * 내려받기가 실패해 이 길로 갈아탄 경우다. 오늘 몫은 그쪽에서 이미 썼으므로
   * 일정만 걸면 내일 아침까지 아무 말도 하지 않게 된다. 그러라고 만든 길이 아니다.
   */
  if (immediate) void check()

  const scheduled = schedule(check)

  return {
    stop() {
      stopped = true
      scheduled.stop()
    },
  }
}

export { isNewer, startUpdateCheck }
