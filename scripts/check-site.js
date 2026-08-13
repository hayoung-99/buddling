/**
 * 랜딩페이지가 스스로 어긋나지 않았는지 본다.
 *
 *   npm run check:site
 *
 * 브라우저를 띄우지 않고 파일만 읽는다. 그래서 빠르고, CI 에서 매번 돌려도 된다.
 *
 * 여기서 잡으려는 것은 "눈으로 보면 멀쩡한데 기계가 보면 틀린 것"들이다.
 * 사람은 페이지를 열어 보고 넘어가지만, 검색엔진과 답변형 AI 는 canonical 이
 * 한 글자만 달라도 다른 페이지로 센다.
 */

const fs = require('node:fs')
const path = require('node:path')

const SITE = path.join(__dirname, '..', 'site')

/** 우리 주소가 아닌 것들. 여기 없는 호스트가 나오면 우리 사이트로 친다. */
const FOREIGN_HOSTS = ['github.com', 'api.github.com', 'schema.org', 'www.sitemaps.org', 'www.w3.org', 'openapi.vercel.sh']

const problems = []
const fail = (file, message) => problems.push(`${file}: ${message}`)

const read = (relative) => fs.readFileSync(path.join(SITE, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(SITE, relative))

const PAGES = ['index.html', 'en/index.html']
const TEXT_FILES = ['sitemap.xml', 'robots.txt', 'llms.txt']

// ── 1. 참조한 파일이 실제로 있는가 ────────────────────

/**
 * 없는 그림을 가리키면 사람 눈에는 빈 자리로만 보인다. OG 이미지가 없으면
 * 링크를 공유했을 때 미리보기가 통째로 안 뜬다.
 */
function checkLocalFiles() {
  for (const page of PAGES) {
    const html = read(page)
    const referenced = new Set()

    for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) referenced.add(match[1])
    for (const match of html.matchAll(/content="https?:\/\/[^"]*?(\/assets\/[^"]+)"/g)) {
      referenced.add(match[1])
    }
    // srcset="a.png 1x, b.png 2x"
    for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
      for (const part of match[1].split(',')) {
        const url = part.trim().split(/\s+/)[0]
        if (url.startsWith('/')) referenced.add(url)
      }
    }

    for (const url of referenced) {
      // 디렉터리를 가리키면 그 안의 index.html 을 본다
      const target = url.endsWith('/') ? `${url}index.html` : url
      if (!exists(target.slice(1))) fail(page, `없는 파일을 가리킵니다 → ${url}`)
    }
  }
}

// ── 2. 주소가 다섯 파일에서 하나로 모이는가 ───────────

/**
 * 도메인을 바꿀 때 한 파일을 빠뜨리는 일이 잦다. canonical 이 실제 주소와
 * 어긋나면 검색엔진이 색인을 둘로 나눠 잡아 순위가 갈라진다.
 */
function checkOneOrigin() {
  const found = new Map() // origin → 그 주소를 쓴 파일들

  for (const file of [...PAGES, ...TEXT_FILES]) {
    if (!exists(file)) continue
    // 문장 끝 마침표가 호스트에 딸려오지 않도록 마디마다 끊어 읽는다
    for (const match of read(file).matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
      const host = match[1].toLowerCase()
      if (FOREIGN_HOSTS.includes(host)) continue
      if (!found.has(host)) found.set(host, new Set())
      found.get(host).add(file)
    }
  }

  if (found.size === 0) {
    fail('site', '우리 주소가 어디에도 없습니다')
    return
  }
  if (found.size > 1) {
    const detail = [...found].map(([host, files]) => `${host} (${[...files].join(', ')})`).join(' / ')
    fail('site', `주소가 여러 개로 갈렸습니다 → ${detail}`)
    return
  }

  // 다섯 파일 모두 그 주소를 적고 있어야 한다
  const [, files] = [...found][0]
  for (const file of [...PAGES, ...TEXT_FILES]) {
    if (exists(file) && !files.has(file)) fail(file, '우리 주소가 한 번도 안 나옵니다')
  }
}

// ── 3. 구조화 데이터가 읽히는가 ───────────────────────

/**
 * JSON-LD 는 쉼표 하나만 틀려도 통째로 무시된다. 그런데 화면에는 아무 표시도
 * 나지 않아서, 검색 결과가 초라해진 뒤에야 알게 된다.
 */
function checkStructuredData() {
  for (const page of PAGES) {
    const blocks = [...read(page).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    if (blocks.length === 0) fail(page, '구조화 데이터(JSON-LD)가 없습니다')

    blocks.forEach((block, index) => {
      try {
        JSON.parse(block[1])
      } catch (error) {
        fail(page, `${index + 1}번째 JSON-LD 를 읽을 수 없습니다 → ${error.message}`)
      }
    })
  }
}

// ── 4. 두 언어가 서로를 가리키는가 ────────────────────

/**
 * hreflang 은 짝이 맞아야 한다. 한쪽만 상대를 가리키면 구글은 그 관계를
 * 믿지 않고 버린다.
 */
function checkLanguageLinks() {
  for (const page of PAGES) {
    const html = read(page)
    for (const lang of ['ko', 'en', 'x-default']) {
      if (!html.includes(`hreflang="${lang}"`)) fail(page, `hreflang="${lang}" 이 없습니다`)
    }
    if (!/<link rel="canonical"/.test(html)) fail(page, 'canonical 이 없습니다')
  }
}

// ── 5. sitemap 이 두 페이지를 다 담는가 ───────────────

function checkSitemap() {
  if (!exists('sitemap.xml')) {
    fail('sitemap.xml', '파일이 없습니다')
    return
  }
  const xml = read('sitemap.xml')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

  if (locs.length !== PAGES.length) {
    fail('sitemap.xml', `페이지가 ${PAGES.length}개인데 loc 은 ${locs.length}개입니다`)
  }
  if (!locs.some((loc) => loc.endsWith('/en/'))) fail('sitemap.xml', '영어 페이지가 빠졌습니다')
}

// ── 실행 ──────────────────────────────────────────────

checkLocalFiles()
checkOneOrigin()
checkStructuredData()
checkLanguageLinks()
checkSitemap()

if (problems.length) {
  console.error('\n랜딩페이지에 어긋난 곳이 있습니다.\n')
  for (const problem of problems) console.error(`  · ${problem}`)
  console.error('')
  process.exit(1)
}

console.log('랜딩페이지 이상 없음 (파일 참조 · 주소 일치 · 구조화 데이터 · hreflang · sitemap)')
