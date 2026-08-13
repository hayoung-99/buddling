/*
 * 받기 버튼을 최신 릴리스에 맞춘다.
 *
 * 이 파일이 없어도(혹은 실패해도) 페이지는 동작한다. 모든 받기 버튼은 처음부터
 * GitHub 의 최신 릴리스 페이지를 가리키고 있고, 여기서는 그 링크를 파일 하나로
 * 좁혀 주기만 한다. 검색엔진과 자바스크립트를 끈 브라우저도 같은 곳에 닿는다.
 *
 * 파일 이름 규칙은 package.json 의 build.artifactName 에서 정한다.
 *   tap-tap-0.1.0-arm64.dmg / tap-tap-0.1.0-x64.dmg / tap-tap-0.1.0-setup.exe
 */

const REPO = 'hayoung-99/tap-tap'
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`

/** data-asset 값 → 그 자산을 알아보는 방법 */
const MATCHERS = {
  'mac-arm64': (name) => name.endsWith('-arm64.dmg'),
  'mac-x64': (name) => name.endsWith('-x64.dmg'),
  windows: (name) => name.endsWith('.exe'),
}

const strings = JSON.parse(document.getElementById('dl-strings').textContent)

const formatSize = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`

// ── 지금 보고 있는 컴퓨터 알아맞히기 ──────────────────

/**
 * 어느 파일을 권할지 정한다.
 *
 * 맥의 칩 종류는 확실하게 알 수 없다. userAgentData 가 알려주면 그 값을 쓰고,
 * 모르면 아무것도 권하지 않는다 — 틀리게 권하면 받은 사람이 실행조차 못 한다.
 */
async function guessTarget() {
  const ua = navigator.userAgent
  const platform = navigator.userAgentData?.platform ?? ''

  if (/Windows/i.test(platform || ua)) return 'windows'
  if (!/Mac/i.test(platform || ua)) return null

  try {
    const detail = await navigator.userAgentData?.getHighEntropyValues(['architecture'])
    if (detail?.architecture === 'arm') return 'mac-arm64'
    if (detail?.architecture === 'x86') return 'mac-x64'
  } catch {
    // 이 브라우저는 칩 종류를 알려주지 않는다
  }
  return null
}

// ── 최신 릴리스 반영 ──────────────────────────────────

async function fetchLatest() {
  const response = await fetch(LATEST_API, { headers: { accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub ${response.status}`)
  return response.json()
}

function applyRelease(release) {
  const version = String(release.tag_name ?? '').replace(/^v/i, '')
  const assets = release.assets ?? []

  const tag = document.querySelector('[data-release-tag]')
  if (tag && version) tag.textContent = `v${version}`

  let matched = 0

  for (const row of document.querySelectorAll('[data-asset]')) {
    const asset = assets.find((item) => MATCHERS[row.dataset.asset]?.(item.name))
    const link = row.querySelector('a.btn')
    const meta = row.querySelector('.meta')

    if (!asset || !link) continue
    matched += 1

    link.href = asset.browser_download_url
    if (meta) meta.textContent = `${asset.name} · ${formatSize(asset.size)}`
  }

  return matched > 0
}

/** 아직 올라온 파일이 없을 때: 버튼을 눌러도 헛걸음하지 않게 한다 */
function showPending() {
  for (const row of document.querySelectorAll('[data-asset]')) {
    const meta = row.querySelector('.meta')
    if (meta) meta.textContent = strings.pending
  }
  const notice = document.querySelector('[data-pending-notice]')
  if (notice) notice.hidden = false
}

async function main() {
  const target = await guessTarget()
  if (target) {
    const row = document.querySelector(`[data-asset="${target}"]`)
    row?.setAttribute('data-recommended', '')

    // 히어로의 첫 버튼도 그 파일을 가리키게 한다
    const hero = document.querySelector('[data-hero-download]')
    if (hero && row) {
      hero.textContent = strings.heroFor.replace('{target}', row.dataset.label)
      hero.dataset.follows = target
    }
  }

  try {
    const release = await fetchLatest()
    if (!applyRelease(release)) {
      showPending()
      return
    }

    // 히어로 버튼은 권한 파일과 같은 곳으로 보낸다
    const hero = document.querySelector('[data-hero-download]')
    const followed = hero?.dataset.follows
    if (hero && followed) {
      const link = document.querySelector(`[data-asset="${followed}"] a.btn`)
      if (link) hero.href = link.href
    }
  } catch {
    // GitHub 이 답하지 않거나 아직 릴리스가 없다. 링크는 릴리스 페이지 그대로 둔다.
    showPending()
  }
}

main()

// ── 터미널 명령 복사 ──────────────────────────────────

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy)?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text.trim())
      const original = button.textContent
      button.textContent = strings.copied
      setTimeout(() => {
        button.textContent = original
      }, 1600)
    } catch {
      // 클립보드를 못 쓰는 상황이면 사용자가 직접 골라 복사하면 된다
    }
  })
}
