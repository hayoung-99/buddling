/**
 * 랜딩페이지를 내 컴퓨터에서 Vercel 과 같은 규칙으로 띄운다.
 *
 *   npm run site                 http://localhost:4173
 *   npm run site:open            띄우고 브라우저까지 연다
 *   npm run site -- --port 5000  포트를 바꾼다
 *
 * 아무 정적 서버나 쓰지 않고 이걸 쓰는 이유는 두 가지다.
 *
 *   1. Vercel 은 cleanUrls·trailingSlash 로 주소를 다르게 해석한다. 같은 규칙을
 *      그대로 흉내 내야 `/en` 이 로컬에서만 404 나거나, 배포하고 나서야 주소가
 *      한 칸 어긋난 걸 알게 되는 일이 없다.
 *   2. site/vercel.json 의 헤더를 파일에서 읽어 그대로 붙인다. 특히 CSP —
 *      인라인 <style> 하나를 실수로 넣었을 때 배포한 뒤가 아니라 여기 콘솔에서
 *      바로 빨간 줄이 뜬다.
 *
 * 의존성은 노드 기본 모듈뿐이다. 랜딩페이지에 빌드 도구를 들이지 않기로 한
 * 결정과 같은 이유다.
 *
 * Vercel 과 다른 점은 두 가지뿐이고 둘 다 확인하려는 것과 무관하다.
 * 404 가 Vercel 의 그림 있는 페이지 대신 그냥 글자로 뜨고, x-vercel-* 헤더가 없다.
 */

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const ROOT = path.join(__dirname, '..', 'site')

// ── 인자 ─────────────────────────────────────────────

const argv = process.argv.slice(2)
const valueOf = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? null : (argv[index + 1] ?? null)
}

const PORT = Number(valueOf('--port') ?? process.env.PORT ?? 4173)
const OPEN = argv.includes('--open')

// ── 확장자 → Content-Type ────────────────────────────
//
// 여기서 .js 가 text/javascript 여야 download.js(type="module")가 실행된다.
// 나머지는 틀려도 티가 잘 안 나지만, 이것만은 페이지가 바로 죽는다.

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// ── vercel.json 의 헤더를 그대로 읽어 쓴다 ───────────

/**
 * Vercel 의 source 는 path-to-regexp 다. 지금 vercel.json 에 있는 것은
 * `/(.*)` 꼴과 고정 경로뿐이라 그 정도만 옮긴다. 더 복잡한 규칙을 쓰게 되면
 * 여기도 같이 손봐야 하므로, 못 알아본 규칙은 조용히 넘기지 않고 경고를 찍는다.
 */
function toRegExp(source) {
  if (/[:?+*[\]{}]/.test(source.replace(/\(\.\*\)/g, ''))) return null
  const body = source
    .split('(.*)')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('(.*)')
  return new RegExp(`^${body}$`)
}

function loadHeaderRules() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))
  const rules = []
  for (const entry of config.headers ?? []) {
    const pattern = toRegExp(entry.source)
    if (!pattern) {
      console.warn(`  (건너뜀) 흉내 낼 수 없는 source 규칙입니다: ${entry.source}`)
      continue
    }
    rules.push({ pattern, headers: entry.headers ?? [] })
  }
  return rules
}

const RULES = loadHeaderRules()

/**
 * 맞는 규칙을 순서대로 다 적용한다 (뒤에 온 값이 이긴다 — Vercel 과 같다).
 * Cache-Control 만 뺀다. 그림을 고쳤는데 브라우저가 1년 동안 옛 그림을
 * 보여 주면 로컬에서 아무것도 확인할 수 없기 때문이다.
 */
function headersFor(pathname) {
  const out = {}
  for (const rule of RULES) {
    if (!rule.pattern.test(pathname)) continue
    for (const { key, value } of rule.headers) {
      if (key.toLowerCase() === 'cache-control') continue
      out[key] = value
    }
  }
  out['Cache-Control'] = 'no-store'
  return out
}

// ── 주소 풀기 ────────────────────────────────────────

function safeJoin(pathname) {
  const target = path.resolve(ROOT, `.${path.posix.normalize(pathname)}`)
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null
  return target
}

const isFile = (file) => {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * 주소 하나를 어떻게 다룰지 정한다. Vercel 의 cleanUrls·trailingSlash 순서다.
 *   { redirect } 이면 308, { file } 이면 그 파일, 둘 다 없으면 404.
 */
function resolve(pathname) {
  // 1. .html 이 드러난 주소는 깨끗한 주소로 되돌린다 (cleanUrls)
  if (pathname.endsWith('/index.html')) {
    return { redirect: pathname.slice(0, -'index.html'.length) }
  }
  if (pathname.endsWith('.html')) {
    return { redirect: `${pathname.slice(0, -'.html'.length)}/` }
  }

  // 2. 확장자가 있으면 그 파일 그대로. 슬래시는 붙이지 않는다.
  if (path.extname(pathname)) return { file: safeJoin(pathname) }

  // 3. 확장자가 없으면 슬래시로 끝나야 한다 (trailingSlash)
  if (!pathname.endsWith('/')) return { redirect: `${pathname}/` }

  // 4. 폴더의 index.html 이 먼저, 그다음 같은 이름의 .html
  const index = safeJoin(`${pathname}index.html`)
  if (index && isFile(index)) return { file: index }
  const sibling = safeJoin(`${pathname.slice(0, -1)}.html`)
  if (sibling && isFile(sibling)) return { file: sibling }

  return {}
}

// ── 서버 ─────────────────────────────────────────────

const log = (req, status, note = '') =>
  console.log(`  ${String(status).padEnd(3)} ${req.method.padEnd(4)} ${req.url} ${note}`)

function sendText(req, res, status, message) {
  const body = Buffer.from(message, 'utf8')
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  })
  log(req, status)
  res.end(req.method === 'HEAD' ? undefined : body)
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    log(req, 405)
    return res.end()
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return sendText(req, res, 400, '주소를 읽을 수 없습니다\n')
  }
  if (pathname.includes('\0')) return sendText(req, res, 400, '주소를 읽을 수 없습니다\n')

  const outcome = resolve(pathname)

  if (outcome.redirect) {
    res.writeHead(308, {
      ...headersFor(outcome.redirect),
      Location: outcome.redirect + url.search,
    })
    log(req, 308, `→ ${outcome.redirect}`)
    return res.end()
  }

  if (!outcome.file || !isFile(outcome.file)) {
    return sendText(req, res, 404, `찾을 수 없습니다: ${pathname}\n`)
  }

  // 랜딩페이지는 통째로 몇백 KB 다. 스트리밍할 이유가 없다.
  const body = fs.readFileSync(outcome.file)
  res.writeHead(200, {
    ...headersFor(pathname),
    'Content-Type': TYPES[path.extname(outcome.file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
  })
  log(req, 200)
  res.end(req.method === 'HEAD' ? undefined : body)
})

server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(`\n  ${PORT} 번 포트를 이미 누가 쓰고 있습니다.`)
  console.error(`  다른 포트로: npm run site -- --port ${PORT + 1}\n`)
  process.exit(1)
})

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`
  console.log(`\n  site/ → ${url}`)
  console.log(`  영어판 → ${url}en/`)
  console.log('  vercel.json 의 헤더(CSP 포함)를 그대로 붙입니다. Ctrl+C 로 멈춥니다.\n')
  if (OPEN) openBrowser(url)
})

// ── 브라우저 열기 ────────────────────────────────────

function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]] // start 는 cmd 안에만 있는 명령이다
        : ['xdg-open', [url]]

  // 브라우저를 못 열어도 서버는 살아 있어야 한다. 주소는 이미 찍어 두었다.
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}
