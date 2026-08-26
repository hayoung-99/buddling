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
 * 그 줄에 서버가 그려 둔 설명("2020년 후반 이후에 나온 맥이에요").
 *
 * 처음 읽을 때 한 번 갈무리해 둔다 — 아래에서 덮어쓰고 나면 되찾을 데가 없다.
 */
function detailOf(row: HTMLElement, meta: Element | null): string {
  if (row.dataset.detail === undefined) row.dataset.detail = meta?.textContent?.trim() ?? ''
  return row.dataset.detail
}

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

/**
 * 이 기기에서 데스크톱 앱을 실행할 수 있는가.
 *
 * `guessTarget()` 이 돌려주는 null 로는 가릴 수 없다 — 그것은 "폰이라 못 쓴다" 와
 * "맥인데 칩을 모르겠다" 를 같은 값으로 뭉뚱그린다. 앞의 것에는 다른 것을 권해야 하고
 * 뒤의 것에는 목록을 그대로 보여 주면 되므로, 그 둘을 여기서 갈라 준다.
 */
function canRunDesktopApp(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  if (typeof nav.userAgentData?.mobile === 'boolean') return !nav.userAgentData.mobile

  const ua = navigator.userAgent
  if (/Android|iPhone|iPod/i.test(ua)) return false
  /*
   * 아이패드는 **데스크톱 사파리인 척한다.** userAgent 만 보면 맥과 구별되지 않으므로
   * 손가락이 닿는 화면인지로 가른다 — 맥에는 터치 스크린이 없다.
   */
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return false
  return true
}

/**
 * 지금 보고 있는 주소를 컴퓨터로 보낸다.
 *
 * 공유 판이 있으면 그것을 연다 — 폰에서 "내 컴퓨터로" 는 대개 에어드롭이나 메시지이고,
 * 그 길은 운영체제가 이미 잘 알고 있다. 없으면 주소를 복사해 둔다.
 *
 * **둘 다 실패해도 조용히 지나간다.** 공유 판을 열었다가 닫는 것도 거절로 오는데,
 * 그건 사용자가 그만둔 것이지 고장이 아니다.
 */
async function sendToComputer(): Promise<boolean> {
  const url = location.href
  try {
    if (navigator.share) {
      await navigator.share({ url })
      return false // 공유 판이 이미 알려 줬으므로 단추 글자는 그대로 둔다
    }
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
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
    /*
     * **원본 파일명을 그대로 쓰지 않는다.**
     *
     * 예전에는 `tap-tap-0.4.0-arm64.dmg · 117 MB` 처럼 자산 이름을 그대로 박았는데,
     * 그 이름은 개명 전 것이라 Buddling 이라고 적힌 페이지에서 **제품 이름이 둘로**
     * 보였다. 하필 서명 없는 바이너리를 받으라고 하는 순간이라, 그 자리에서 이름이
     * 어긋나는 것은 그냥 어수선한 정도가 아니라 의심할 이유가 된다.
     *
     * 게다가 원본 파일명은 서버가 그려 둔 사람 말("2020년 후반 이후에 나온 맥이에요")을
     * 지우고 그 자리에 들어앉는 것이라, 이름 문제가 없더라도 손해 보는 교환이었다.
     * 설명은 그대로 두고 **크기만 덧붙인다.** 버전은 이 구역 머리의 꼬리표가 말한다.
     */
    const detail = detailOf(row, meta)
    if (meta) meta.textContent = detail ? `${detail} · ${formatSize(asset.size)}` : formatSize(asset.size)
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
    let cleanup: (() => void) | null = null

    const onSend = (event: MouseEvent) => {
      event.preventDefault()
      const button = event.currentTarget as HTMLAnchorElement
      void sendToComputer().then((copied) => {
        if (!copied || cancelled) return
        // 복사는 화면에 아무 흔적도 남기지 않으므로 단추가 대신 말해 준다
        button.textContent = strings.copied
        setTimeout(() => {
          if (!cancelled) button.textContent = strings.sendToComputer
        }, 1800)
      })
    }

    const run = async () => {
      /*
       * 폰에서는 받을 수 있는 것이 없다. 셋 다 이 기기로는 열지 못하는 파일이라,
       * 첫 단추를 **이 주소를 컴퓨터로 보내는 것**으로 바꾼다. 이 제품이 퍼지는 길이
       * 친구가 보낸 링크이고 그 링크는 대개 폰에서 열리므로, 여기서 아무것도 할 수
       * 없으면 그 사람은 그대로 떠난다.
       */
      if (!canRunDesktopApp()) {
        const notice = document.querySelector<HTMLElement>('[data-mobile-notice]')
        if (notice) notice.hidden = false

        const hero = document.querySelector<HTMLAnchorElement>('[data-hero-download]')
        if (hero) {
          hero.textContent = strings.sendToComputer
          // 스크립트가 죽어도 헛걸음하지 않게, 원래 자리는 살려 둔다
          hero.href = location.href
          hero.addEventListener('click', onSend)
          cleanup = () => hero.removeEventListener('click', onSend)
        }
      }

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
      cleanup?.()
    }
  }, [strings])

  return null
}
