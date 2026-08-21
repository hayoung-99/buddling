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
  /**
   * 화면에 보이는 서비스 이름.
   *
   * 한국어판은 `도란도란`, 영어판은 `Doran Doran` 이다. 구조화 데이터(`jsonld.ts`)와
   * `og:site_name` 은 나라말과 무관하게 `Doran Doran` 하나로 두는데, 같은 것을
   * 가리키는 이름이 페이지마다 다르면 검색엔진이 둘로 잡기 때문이다.
   */
  brand: string
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
    /**
     * 히어로 바로 아래 한 줄. 둘 이상이어야 시작된다는 것을 **받기 전에** 알려 준다.
     *
     * 방이 없으면 캐릭터도 뜨지 않아서(기획서 "알고 둔 선택"), 이걸 모르고 받은 사람은
     * 바탕화면의 친구 대신 입력 폼을 먼저 만난다. FAQ 안쪽에도 적혀 있지만 그 자리는
     * 받기 버튼보다 한참 아래라 읽히지 않는다.
     */
    needsTwo: string
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
