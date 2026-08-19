/**
 * 랜딩 한 벌의 모양.
 *
 * 마크업은 `components/` 에 한 번만 쓰고, 나라말마다 다른 것은 전부 여기로 모은다.
 * 예전에는 `site/index.html` 과 `site/en/index.html` 두 벌이 통째로 따로 있어서,
 * 한쪽만 고치면 조용히 어긋났다.
 *
 * 문장 안에 굵은 글씨가 들어가는 곳(설치 안내·힌트)은 `ReactNode` 로 둔다.
 * 자리표시자를 만들어 끼워 넣는 것보다 사전에 그대로 적는 편이 읽기 쉽다.
 */

import type { ReactNode } from 'react'

export type Locale = 'ko' | 'en'

/**
 * 설치 안내의 한 단계.
 *
 * 조각으로 쪼개 두는 이유가 있다. 이 문장은 **화면(굵은 글씨가 있는 마크업)과
 * 구조화 데이터(굵기가 없는 맨 문장) 두 모양**으로 쓰인다. 예전에는 HTML 과
 * JSON-LD 에 같은 문장을 두 벌 적어 두어서, 한쪽만 고치면 조용히 어긋났다.
 * 여기 한 벌만 두고 양쪽을 만들어 쓴다.
 */
export type StepPart = string | { strong: string }
export type Step = StepPart[]

/** 조각들을 이어 맨 문장으로 (구조화 데이터가 쓴다) */
export const stepText = (step: Step): string =>
  step.map((part) => (typeof part === 'string' ? part : part.strong)).join('')

export interface Fact {
  term: string
  detail: string
}

export interface DownloadRow {
  /** `download.tsx` 가 릴리스 자산을 짝지을 때 쓰는 열쇠 */
  asset: 'mac-arm64' | 'mac-x64' | 'windows'
  /** 히어로 버튼이 "…용 받기" 로 바뀔 때 쓰는 이름 */
  label: string
  name: string
  meta: string
}

export interface Question {
  /** 주소에 남는 값. 구조화 데이터(FAQPage)도 이걸 가리킨다. */
  id: string
  question: string
  answer: string
}

export interface Copy {
  locale: Locale
  /** 다른 언어로 건너가는 곳 */
  other: { href: string; lang: Locale; short: string; long: string }

  skipToContent: string
  nav: { characters: string; download: string; faq: string }

  hero: {
    /** 제목은 세 조각이다 — 앞줄, 강조, 뒷조각 */
    lead: string
    emphasis: string
    tail: string
    sub: string
    download: string
    allVersions: string
    note: string
    imageAlt: string
  }

  shot: {
    headingTop: string
    headingBottom: string
    body: string
    imageAlt: string
  }

  characters: {
    label: string
    heading: string
    sub: string
    imageAlt: string
    facts: Fact[]
  }

  download: {
    label: string
    heading: string
    latest: string
    button: string
    rows: DownloadRow[]
    hint: ReactNode
    pending: ReactNode
  }

  install: {
    label: string
    heading: string
    sub: string
    macos: { title: string; howToName: string; steps: Step[] }
    windows: { title: string; howToName: string; steps: Step[]; hint: string }
  }

  faq: {
    label: string
    heading: string
    items: Question[]
  }

  footer: { tagline: string; github: string; releases: string }

  /** 받기 단추가 상태에 따라 바꿔 다는 말 (예전 `dl-strings` 스크립트가 하던 일) */
  downloadStrings: { pending: string; heroFor: string; copied: string }

  /** 구조화 데이터가 앱을 설명할 때 쓰는 말 (SoftwareApplication) */
  app: {
    description: string
    subCategory: string
    featureList: string[]
  }

  meta: {
    title: string
    description: string
    ogDescription: string
    imageAlt: string
  }
}
