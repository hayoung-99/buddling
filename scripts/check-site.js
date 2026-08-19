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

/** 받아 둔 본문. 검사마다 다시 받지 않는다. */
const fetched = new Map()
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

// ── 실행 ──────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(path.join(WEB, '.next'))) {
    console.error('\n먼저 빌드해야 합니다: npm run build:web\n')
    process.exit(1)
  }

  const server = startServer()
  try {
    await waitForServer()
    await fetchAll()

    await checkLocalFiles()
    checkOneOrigin()
    checkStructuredData()
    checkLanguageLinks()
    checkSitemap()
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
    '랜딩페이지 이상 없음 (파일 참조 · 주소 일치 · 구조화 데이터 · hreflang · sitemap · JS 예산)',
  )
}

void main()
