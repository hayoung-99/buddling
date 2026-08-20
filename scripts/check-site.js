/**
 * 랜딩페이지가 스스로 어긋나지 않았는지 본다.
 *
 *   npm run check:site
 *
 * **빌드한 결과를 본다.** 예전에는 `site/*.html` 을 파일로 읽었지만, 이제 페이지는
 * Next 가 만들어 내므로 실제로 띄워서 응답을 받아야 진짜를 본 것이 된다. 그래서 이
 * 스크립트가 서버를 직접 띄우고, 끝나면 내린다.
 *
 * 여기서 잡으려는 것은 그대로다 — "눈으로 보면 멀쩡한데 기계가 보면 틀린 것".
 * 사람은 페이지를 열어 보고 넘어가지만, 검색엔진과 답변형 AI 는 canonical 이
 * 한 글자만 달라도 다른 페이지로 센다.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const zlib = require('node:zlib')

const WEB = path.join(__dirname, '..', 'apps', 'web')
const PORT = Number(process.env.CHECK_SITE_PORT ?? 4181)
const ORIGIN = `http://127.0.0.1:${PORT}`

/** 우리 주소가 아닌 것들. 여기 없는 호스트가 나오면 우리 사이트로 친다. */
const FOREIGN_HOSTS = [
  'github.com',
  'api.github.com',
  'schema.org',
  'www.sitemaps.org',
  'www.w3.org',
  'openapi.vercel.sh',
]

/** 사람이 볼 주소 → 서버에서 받아 올 경로 */
const PAGES = ['/', '/en/']
const TEXT_FILES = ['/sitemap.xml', '/robots.txt', '/llms.txt']

const problems = []
const fail = (file, message) => problems.push(`${file}: ${message}`)

/** 받아 둔 본문과 헤더. 검사마다 다시 받지 않는다. */
const fetched = new Map()
const headers = new Map()
const body = (route) => fetched.get(route) ?? ''

// ── 서버 띄우고 내리기 ────────────────────────────────

function startServer() {
  const server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
    cwd: WEB,
    stdio: 'ignore',
  })
  return server
}

async function waitForServer(timeoutMs = 60000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const response = await fetch(`${ORIGIN}/`)
      if (response.ok) return
    } catch {
      // 아직 안 떴다
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`${timeoutMs}ms 안에 서버가 뜨지 않았습니다`)
}

async function fetchAll() {
  for (const route of [...PAGES, ...TEXT_FILES]) {
    const response = await fetch(ORIGIN + route)
    if (!response.ok) {
      fail(route, `서버가 ${response.status} 로 답했습니다`)
      continue
    }
    fetched.set(route, await response.text())
    headers.set(route, response.headers)
  }
}

// ── 1. 참조한 파일이 실제로 있는가 ────────────────────

/**
 * 없는 그림을 가리키면 사람 눈에는 빈 자리로만 보인다. OG 이미지가 없으면
 * 링크를 공유했을 때 미리보기가 통째로 안 뜬다.
 *
 * **스타일시트 안까지 본다.** 빼꼼 캐릭터 다섯은 `<img>` 가 아니라 CSS 배경이라,
 * HTML 만 훑으면 이름이 어긋나도 아무 데도 걸리지 않는다. 게다가 그 칸은 1440px
 * 아래에서 통째로 숨으므로, 좁은 화면으로 열어 본 사람은 빈 자리마저 못 본다.
 */
async function checkLocalFiles() {
  for (const page of PAGES) {
    const html = body(page)
    const referenced = new Set()

    for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) referenced.add(match[1])
    for (const match of html.matchAll(/content="https?:\/\/[^"]*?(\/assets\/[^"]+)"/g)) {
      referenced.add(match[1])
    }

    for (const match of html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)) {
      const href = match[1]
      const response = await fetch(href.startsWith('http') ? href : ORIGIN + href)
      if (!response.ok) {
        fail(page, `스타일시트를 못 받았습니다 → ${href} (${response.status})`)
        continue
      }
      const css = await response.text()
      for (const url of css.matchAll(/url\(\s*['"]?(\/assets\/[^'")]+)/g)) referenced.add(url[1])
    }

    for (const url of referenced) {
      // Next 가 스스로 내는 것은 빌드 산출물이라 볼 것이 없다
      if (url.startsWith('/_next/')) continue
      const response = await fetch(ORIGIN + url, { method: 'HEAD' })
      if (!response.ok) fail(page, `없는 파일을 가리킵니다 → ${url} (${response.status})`)
    }
  }
}

// ── 2. 주소가 다섯 곳에서 하나로 모이는가 ─────────────

/**
 * 도메인을 바꿀 때 한 곳을 빠뜨리는 일이 잦다. canonical 이 실제 주소와
 * 어긋나면 검색엔진이 색인을 둘로 나눠 잡아 순위가 갈라진다.
 */
function checkOneOrigin() {
  const found = new Map() // origin → 그 주소를 쓴 곳들

  for (const route of [...PAGES, ...TEXT_FILES]) {
    // 문장 끝 마침표가 호스트에 딸려오지 않도록 마디마다 끊어 읽는다
    for (const match of body(route).matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
      const host = match[1].toLowerCase()
      if (FOREIGN_HOSTS.includes(host)) continue
      if (!found.has(host)) found.set(host, new Set())
      found.get(host).add(route)
    }
  }

  if (found.size === 0) {
    fail('site', '우리 주소가 어디에도 없습니다')
    return
  }
  if (found.size > 1) {
    const detail = [...found]
      .map(([host, routes]) => `${host} (${[...routes].join(', ')})`)
      .join(' / ')
    fail('site', `주소가 여러 개로 갈렸습니다 → ${detail}`)
    return
  }

  const [, routes] = [...found][0]
  for (const route of [...PAGES, ...TEXT_FILES]) {
    if (!routes.has(route)) fail(route, '우리 주소가 한 번도 안 나옵니다')
  }
}

// ── 3. 구조화 데이터가 읽히는가 ───────────────────────

/**
 * JSON-LD 는 쉼표 하나만 틀려도 통째로 무시된다. 그런데 화면에는 아무 표시도
 * 나지 않아서, 검색 결과가 초라해진 뒤에야 알게 된다.
 *
 * 이제는 만들어 내는 것이라 문법이 틀릴 일은 거의 없지만, **몇 덩어리가
 * 들어 있는지**를 함께 본다 — 옮기다 통째로 빠뜨리는 쪽이 더 무서운 실수다.
 */
const EXPECTED_LD_TYPES = [
  'WebSite',
  'Person',
  'ImageObject',
  'WebPage',
  'FAQPage',
  'SoftwareApplication',
  'HowTo',
]

function checkStructuredData() {
  for (const page of PAGES) {
    const blocks = [
      ...body(page).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
    ]
    if (blocks.length === 0) {
      fail(page, '구조화 데이터(JSON-LD)가 없습니다')
      continue
    }

    const types = new Set()
    blocks.forEach((block, index) => {
      let parsed
      try {
        parsed = JSON.parse(block[1])
      } catch (error) {
        fail(page, `${index + 1}번째 JSON-LD 를 읽을 수 없습니다 → ${error.message}`)
        return
      }
      for (const node of parsed['@graph'] ?? [parsed]) {
        for (const type of [node['@type']].flat()) types.add(type)
      }
    })

    for (const type of EXPECTED_LD_TYPES) {
      if (!types.has(type)) fail(page, `구조화 데이터에 ${type} 이(가) 없습니다`)
    }
  }
}

// ── 4. 두 언어가 서로를 가리키는가 ────────────────────

/**
 * hreflang 은 짝이 맞아야 한다. 한쪽만 상대를 가리키면 구글은 그 관계를
 * 믿지 않고 버린다.
 */
function checkLanguageLinks() {
  for (const page of PAGES) {
    const html = body(page)
    // 속성 이름은 대소문자를 가리지 않는다. Next 는 `hrefLang` 으로 내보내지만
    // HTML 파서가 소문자로 읽으므로 크롤러에게는 `hreflang` 이다.
    for (const lang of ['ko', 'en', 'x-default']) {
      const has = new RegExp(`hreflang="${lang}"`, 'i').test(html)
      if (!has) fail(page, `hreflang="${lang}" 이 없습니다`)
    }
    if (!/rel="canonical"/i.test(html)) fail(page, 'canonical 이 없습니다')
  }
}

// ── 5. sitemap 이 두 페이지를 다 담는가 ───────────────

function checkSitemap() {
  const xml = body('/sitemap.xml')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

  if (locs.length !== PAGES.length) {
    fail('/sitemap.xml', `페이지가 ${PAGES.length}개인데 loc 은 ${locs.length}개입니다`)
  }
  if (!locs.some((loc) => loc.endsWith('/en/'))) fail('/sitemap.xml', '영어 페이지가 빠졌습니다')
}

// ── 6. 자바스크립트가 불어나지 않았는가 ───────────────

/**
 * Next 로 옮기면서 자바스크립트가 늘어난 것은 알고 받아들인 대가다 — 예전 랜딩은
 * 12KB 였고 지금은 **gzip 170KB 안팎**이다. 다만 **모르는 새 더 늘어나는 것**은 막는다.
 * 랜딩 본문에 `'use client'` 를 하나 들이면 그 순간 이 숫자가 뛴다.
 *
 * 재는 기준은 **gzip** 이다. 그것이 실제로 오가는 양이고, 압축 전 크기로 재면
 * 큰 숫자에 놀라 잘못된 판단을 하게 된다.
 */
const JS_BUDGET_KB = 190

async function checkScriptBudget() {
  for (const page of PAGES) {
    const scripts = new Set()
    for (const match of body(page).matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(match[1])

    let total = 0
    for (const src of scripts) {
      const response = await fetch(src.startsWith('http') ? src : ORIGIN + src)
      if (!response.ok) continue
      // `fetch` 는 받은 것을 알아서 풀어 주므로, 오가는 양을 보려면 직접 압축해 본다
      const raw = Buffer.from(await response.arrayBuffer())
      total += zlib.gzipSync(raw).length
    }

    const kb = Math.round(total / 1024)
    if (kb > JS_BUDGET_KB) {
      fail(page, `자바스크립트가 ${kb}KB 입니다 (한도 ${JS_BUDGET_KB}KB)`)
    }
  }
}

// ── 7. vercel.json 이 스키마를 지키는가 ───────────────

/**
 * `vercel.json` 은 **주석을 받지 않는다.** 스키마가 `additionalProperties: false` 라
 * 허용된 키 밖의 것이 하나라도 있으면 빌드가 시작조차 못 하고 설정 오류로 끝난다.
 *
 * 이 저장소는 `.oxlintrc.json`·`tsconfig.json` 에 `"//"` 로 설명을 다는 습관이 있어서
 * 손이 그리 간다. 실제로 그렇게 운영 배포를 한 번 떨어뜨렸다 — **미리보기는 통과했는데
 * 운영만 실패**해서 알아채기도 늦었다. 그래서 여기서 먼저 잡는다.
 */
/*
 * 스키마가 허용하는 키 전부(40개). **손으로 줄여 적지 말 것.**
 *
 * 처음에는 눈에 익은 것 18개만 적어 두었는데, 그러면 검사가 스키마보다 엄격해져서
 * `github` · `env` · `routes` 처럼 멀쩡한 키를 "허용되지 않는 키" 로 막는다. 반대로
 * 목록에는 있지만 스키마에는 없는 `public` 을 통과시키기도 했다 — 잡으라고 만든 것을
 * 그대로 지나 보내는 셈이다.
 *
 * 새 키가 필요해졌는데 여기서 막히면, 목록을 늘리기 전에 스키마부터 확인한다.
 *
 *   curl -s https://openapi.vercel.sh/vercel.json | jq -r '.properties | keys[]'
 */
const VERCEL_JSON_KEYS = new Set([
  '$schema', 'alias', 'build', 'buildCommand', 'builds', 'bulkRedirectsPath',
  'bunVersion', 'cleanUrls', 'crons', 'devCommand', 'env', 'experimentalBYOC',
  'experimentalEnvironmentVariables', 'experimentalServiceGroups', 'experimentalServices',
  'experimentalServicesV2', 'fluid', 'framework', 'functionFailoverRegions', 'functions',
  'git', 'github', 'headers', 'ignoreCommand', 'images', 'installCommand', 'name',
  'outputDirectory', 'passiveRegions', 'proxy', 'redirects', 'regions', 'relatedProjects',
  'rewrites', 'routes', 'scope', 'services', 'trailingSlash', 'version', 'wildcard',
])

function checkVercelJson() {
  const file = path.join(WEB, 'vercel.json')
  if (!fs.existsSync(file)) return

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail('vercel.json', `읽을 수 없습니다 → ${error.message}`)
    return
  }

  for (const key of Object.keys(parsed)) {
    if (!VERCEL_JSON_KEYS.has(key)) {
      fail('vercel.json', `"${key}" 는 허용되지 않는 키입니다 (주석도 넣을 수 없습니다)`)
    }
  }
}

// ── 8. CSP 가 자기 페이지의 스크립트를 막지 않는가 ───

/**
 * CSP 가 이 페이지 자신의 스크립트를 막고 있지 않은가.
 *
 * **실제로 그런 상태로 나간 적이 있다.** 미들웨어가 요청마다 nonce 를 만들어 CSP 에
 * 실었는데, 페이지는 빌드 때 구워 둔 것이라 그 nonce 가 HTML 에는 붙지 않았다. 그래서
 * 랜딩의 자바스크립트가 하나도 돌지 않았다 — 빼꼼 캐릭터가 영영 나오지 않고 받기 단추도
 * 갱신되지 않았다. **그런데 페이지는 멀쩡해 보였다.** 없어도 페이지가 굴러가도록 만들어
 * 둔 덕에 빈 자리조차 나지 않았고, 어긋난 사실은 브라우저 콘솔에만 남았다.
 *
 * 그래서 브라우저가 판정하는 규칙을 여기서 그대로 밟아 본다. 어떤 방식으로 허용하든
 * (nonce·해시·`'unsafe-inline'`) 상관없이 **"내 스크립트가 내 정책을 통과하는가"** 하나만
 * 본다. 정책을 바꾸는 날에도 이 검사는 그대로 값을 한다.
 */
function checkOwnScriptsAllowed() {
  for (const route of PAGES) {
    const csp = headers.get(route)?.get('content-security-policy')
    if (!csp) {
      fail(route, '보안 헤더(CSP)가 없습니다')
      continue
    }

    const directive = csp.split(';').map((part) => part.trim())
    const scriptSrc = directive.find((part) => part.startsWith('script-src'))
    if (!scriptSrc) continue // script-src 가 없으면 default-src 로 내려가는데, 그건 아래 default 검사가 본다

    const sources = scriptSrc.split(/\s+/).slice(1)
    const nonce = sources.find((source) => source.startsWith("'nonce-"))
    const inlineOk = sources.includes("'unsafe-inline'")
    // `'strict-dynamic'` 이 있으면 호스트 허용이 통째로 무시된다. 즉 `<script src>` 도
    // nonce 를 달고 있어야 한다.
    const strictDynamic = sources.includes("'strict-dynamic'")

    const html = body(route)

    /*
     * 실행되는 인라인 스크립트만 센다. `type="application/ld+json"` 같은 데이터 덩어리는
     * 브라우저가 script-src 로 재지 않는다.
     */
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attributes = match[1]
      if (/\ssrc=/.test(attributes)) continue
      const type = attributes.match(/\stype="([^"]+)"/)?.[1]
      if (type && !/^(text\/javascript|module|application\/javascript)$/.test(type)) continue
      if (inlineOk) continue
      if (nonce && attributes.includes('nonce=')) continue
      fail(route, `CSP 가 이 페이지의 인라인 스크립트를 막습니다 (${scriptSrc})`)
      break
    }

    if (!strictDynamic) continue
    for (const match of html.matchAll(/<script([^>]*\ssrc=[^>]*)>/g)) {
      if (match[1].includes('nonce=')) continue
      fail(route, `'strict-dynamic' 이 있는데 <script src> 에 nonce 가 없습니다 (${scriptSrc})`)
      break
    }
  }
}

// ── 9. 어드민이 새어 나가지 않는가 ────────────────────

/**
 * 어드민은 검색에 잡히면 안 된다.
 *
 * 막는 일 자체는 DB 가 한다(집계 함수가 전부 `is_admin()` 을 확인한다). 여기서 보는 것은
 * **색인**이다. 한번 색인되면 지우는 데 시간이 걸리고, 그 사이 주소가 알려진다.
 *
 * 세 곳을 다 본다 — 응답 헤더 · 페이지의 메타 · `robots.txt`. 하나만으로도 대개 되지만,
 * 하나를 빠뜨렸다는 사실은 색인된 뒤에야 알게 된다. `robots.txt` 는 그룹이 둘이라
 * (`*` 와 이름을 부른 크롤러들) **양쪽 모두에** 적혀 있어야 한다.
 */
async function checkAdminHidden() {
  const route = '/admin/'
  const response = await fetch(ORIGIN + route)
  if (!response.ok) {
    fail(route, `서버가 ${response.status} 로 답했습니다`)
    return
  }

  const tag = response.headers.get('x-robots-tag') ?? ''
  if (!/noindex/i.test(tag)) fail(route, `X-Robots-Tag 에 noindex 가 없습니다 (${tag || '없음'})`)

  const html = await response.text()
  const meta = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? ''
  if (!/noindex/i.test(meta)) fail(route, `<meta name="robots"> 에 noindex 가 없습니다 (${meta || '없음'})`)

  // Supabase 에 닿을 수 있어야 한다. 랜딩과 같은 CSP 를 쓰면 로그인부터 막힌다.
  const csp = response.headers.get('content-security-policy') ?? ''
  const directive = (name) =>
    csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + ' '))

  const connect = directive('connect-src')
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !connect?.includes(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    fail(route, `CSP 의 connect-src 에 Supabase 주소가 없습니다 (${connect})`)
  }

  /*
   * 숫자판의 막대는 높이와 너비를 인라인 `style` 로 준다. 이걸 막으면 화면이 통째로
   * 깨지는 게 아니라 **그려지다 만다** — 막대는 min-height 인 2px 짜리 선이 되고 줄
   * 채움은 값과 무관하게 같은 길이가 된다. 눈으로는 잘 안 걸리고 콘솔에만 남는다.
   * 실제로 숫자판이 나간 뒤로 줄곧 그 상태였다.
   *
   * `style` **속성**에는 nonce 를 달 수 없고(nonce 는 `<style>`·`<link>` 전용) 값이
   * 매번 달라져 해시도 못 쓰므로, 어드민에서는 `'unsafe-inline'` 이 유일한 길이다.
   */
  const adminStyle = directive('style-src')
  if (!adminStyle?.includes("'unsafe-inline'")) {
    fail(route, `CSP 가 숫자판의 인라인 스타일을 막습니다 — 막대가 안 그려집니다 (${adminStyle})`)
  }

  /*
   * 그리고 그 구멍이 랜딩으로 새지 않았는지 본다. 랜딩은 인라인 스타일을 하나도 쓰지
   * 않으므로 열어 둘 이유가 없고, 열어 둔 곳은 나중에 누가 왜 열었는지 아무도 모르게 된다.
   */
  const landingStyle = ((await fetch(ORIGIN + '/')).headers.get('content-security-policy') ?? '')
    .split(';').map((part) => part.trim()).find((part) => part.startsWith('style-src '))
  if (landingStyle?.includes("'unsafe-inline'")) {
    fail('/', `랜딩의 style-src 까지 열려 있습니다 — 어드민에서만 열어야 합니다 (${landingStyle})`)
  }

  if (body('/sitemap.xml').includes('/admin')) fail('sitemap.xml', '어드민이 실려 있습니다')

  /*
   * 주석을 먼저 걷어낸다. 이 파일의 주석에 `User-agent: *` 라는 말이 그대로 들어 있어서,
   * 그냥 읽으면 어느 그룹이 잘못됐는지 이름을 엉뚱하게 짚는다.
   */
  const robots = body('/robots.txt')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')

  const groups = robots.split(/\n\s*\n/).filter((group) => /^user-agent:/im.test(group))
  if (!groups.length) fail('robots.txt', 'User-agent 그룹이 하나도 없습니다')
  for (const group of groups) {
    if (!/^disallow:\s*\/admin/im.test(group)) {
      const name = group.match(/^user-agent:\s*(\S+)/im)?.[1] ?? '?'
      fail('robots.txt', `"${name}" 그룹에 Disallow: /admin/ 이 없습니다`)
    }
  }
}

// ── 실행 ──────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(path.join(WEB, '.next'))) {
    console.error('\n먼저 빌드해야 합니다: npm run build:web\n')
    process.exit(1)
  }

  checkVercelJson()

  const server = startServer()
  try {
    await waitForServer()
    await fetchAll()

    await checkLocalFiles()
    checkOneOrigin()
    checkStructuredData()
    checkLanguageLinks()
    checkSitemap()
    checkOwnScriptsAllowed()
    await checkAdminHidden()
    await checkScriptBudget()
  } finally {
    server.kill()
  }

  if (problems.length) {
    console.error('\n랜딩페이지에 어긋난 곳이 있습니다.\n')
    for (const problem of problems) console.error(`  · ${problem}`)
    console.error('')
    process.exit(1)
  }

  console.log(
    '랜딩페이지 이상 없음 (파일 참조 · 주소 일치 · 구조화 데이터 · hreflang · sitemap · CSP · JS 예산 · 어드민 숨김 · vercel.json)',
  )
}

void main()
