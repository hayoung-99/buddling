'use client'

import { useEffect } from 'react'
import { LATEST_API } from '../lib/site'
import type { Copy } from '../lib/copy'

/**
 * 받기 단추를 지금 릴리스와 지금 보고 있는 컴퓨터에 맞춰 준다.
 *
 * 그리는 것은 없다 — 서버가 이미 그려 둔 마크업의 글자와 주소만 고친다. 그래서 이
 * 스크립트가 늦게 오거나 아예 실패해도 페이지는 멀쩡하고, 단추는 릴리스 페이지로
 * 가는 링크 그대로 남는다. **실패해도 헛걸음하지 않는 것**이 이 파일의 규칙이다.
 */

/** `data-asset` 값 → 그 자산을 알아보는 방법 */
const MATCHERS: Record<string, (name: string) => boolean> = {
  'mac-arm64': (name) => name.endsWith('-arm64.dmg'),
  'mac-x64': (name) => name.endsWith('-x64.dmg'),
  windows: (name) => name.endsWith('.exe'),
}

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

interface Release {
  tag_name?: string
  assets?: ReleaseAsset[]
}

const formatSize = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

/**
 * 어느 파일을 권할지 정한다.
 *
 * 맥의 칩 종류는 확실하게 알 수 없다. userAgentData 가 알려주면 그 값을 쓰고,
 * 모르면 아무것도 권하지 않는다 — 틀리게 권하면 받은 사람이 실행조차 못 한다.
 */
async function guessTarget(): Promise<string | null> {
  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string
      getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>
    }
  }
  const ua = nav.userAgent
  const platform = nav.userAgentData?.platform ?? ''

  if (/Windows/i.test(platform || ua)) return 'windows'
  if (!/Mac/i.test(platform || ua)) return null

  try {
    const detail = await nav.userAgentData?.getHighEntropyValues?.(['architecture'])
    if (detail?.architecture === 'arm') return 'mac-arm64'
    if (detail?.architecture === 'x86') return 'mac-x64'
  } catch {
    // 이 브라우저는 칩 종류를 알려주지 않는다
  }
  return null
}

async function fetchLatest(): Promise<Release> {
  const response = await fetch(LATEST_API, { headers: { accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub ${response.status}`)
  return response.json() as Promise<Release>
}

function applyRelease(release: Release): boolean {
  const version = String(release.tag_name ?? '').replace(/^v/i, '')
  const assets = release.assets ?? []

  const tag = document.querySelector('[data-release-tag]')
  if (tag && version) tag.textContent = `v${version}`

  let matched = 0

  for (const row of document.querySelectorAll<HTMLElement>('[data-asset]')) {
    const match = MATCHERS[row.dataset.asset ?? '']
    const asset = match && assets.find((item) => match(item.name))
    const link = row.querySelector<HTMLAnchorElement>('a.btn')
    const meta = row.querySelector('.meta')

    if (!asset || !link) continue
    matched += 1

    link.href = asset.browser_download_url
    if (meta) meta.textContent = `${asset.name} · ${formatSize(asset.size)}`
  }

  return matched > 0
}

/** 아직 올라온 파일이 없을 때: 버튼을 눌러도 헛걸음하지 않게 한다 */
function showPending(pending: string) {
  for (const row of document.querySelectorAll('[data-asset]')) {
    const meta = row.querySelector('.meta')
    if (meta) meta.textContent = pending
  }
  const notice = document.querySelector<HTMLElement>('[data-pending-notice]')
  if (notice) notice.hidden = false
}

export function DownloadButtons({ strings }: { strings: Copy['downloadStrings'] }) {
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const target = await guessTarget()
      if (cancelled) return

      if (target) {
        const row = document.querySelector<HTMLElement>(`[data-asset="${target}"]`)
        row?.setAttribute('data-recommended', '')

        // 히어로의 첫 버튼도 그 파일을 가리키게 한다
        const hero = document.querySelector<HTMLAnchorElement>('[data-hero-download]')
        if (hero && row) {
          hero.textContent = strings.heroFor.replace('{target}', row.dataset.label ?? '')
          hero.dataset.follows = target
        }
      }

      try {
        const release = await fetchLatest()
        if (cancelled) return
        if (!applyRelease(release)) {
          showPending(strings.pending)
          return
        }

        // 히어로 버튼은 권한 파일과 같은 곳으로 보낸다
        const hero = document.querySelector<HTMLAnchorElement>('[data-hero-download]')
        const followed = hero?.dataset.follows
        if (hero && followed) {
          const link = document.querySelector<HTMLAnchorElement>(`[data-asset="${followed}"] a.btn`)
          if (link) hero.href = link.href
        }
      } catch {
        // GitHub 이 답하지 않거나 아직 릴리스가 없다. 링크는 릴리스 페이지 그대로 둔다.
        if (!cancelled) showPending(strings.pending)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [strings])

  return null
}
