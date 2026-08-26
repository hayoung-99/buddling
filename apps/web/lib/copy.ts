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
  nav: { characters: string; download: string; install: string; faq: string }

  hero: {
    /** 제목은 세 조각이다 — 앞줄, 강조, 뒷조각 */
    lead: string
    emphasis: string
    tail: string
    sub: string
    /**
     * 받기 버튼 바로 아래 한 줄. 처음 열 때 경고가 뜬다는 것을 **누르기 전에** 알려 준다.
     *
     * macOS 빌드에 서명이 없어서 첫 실행에 경고가 한 번 뜨는데, 넘기는 법은 두 판
     * 아래 "처음 열 때" 에 있다. 받기 버튼은 파일을 내려받고 **페이지를 떠나므로**,
     * 그 안내가 있다는 사실 자체를 여기서 알려 주지 않으면 아무도 다시 찾아오지 않는다.
     */
    warns: string
    /** 그 안내로 가는 링크의 글자 */
    warnsLink: string
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
    /** 폰에서만 보이는 줄 — 여기 있는 파일을 이 기기로는 열 수 없다는 것 */
    mobileHint: ReactNode
    pending: ReactNode
  }

  install: {
    label: string
    heading: string
    sub: string
    macos: { title: string; howToName: string; steps: Step[] }
    windows: { title: string; howToName: string; steps: Step[]; hint: string }
  }

  /**
   * 맨 끝의 "해 보면 이래요" 장면.
   *
   * 이 제품의 단 하나뿐인 마법(내가 누르면 상대가 춤춘다)이 지금까지 **글자로만**
   * 있었다. 화면 둘을 나란히 놓고 실제로 그 일이 일어나는 것을 보여 주는 자리이고,
   * 마지막 받기 버튼도 여기 있다 — 그 전까지는 꼬리말 앞 3,000px 동안 누를 것이
   * 하나도 없었다.
   */
  try: {
    label: string
    heading: string
    sub: string
    /** 왼쪽 창(내 화면)·오른쪽 창(친구 화면)에 붙는 이름 */
    mine: string
    theirs: string
    altMine: string
    altTheirs: string
    /** 받기 구역으로 돌려보내는 마지막 단추 */
    cta: string
  }

  faq: {
    label: string
    heading: string
    items: Question[]
  }

  footer: { tagline: string; github: string; releases: string }

  /** 받기 단추가 상태에 따라 바꿔 다는 말 (예전 `dl-strings` 스크립트가 하던 일) */
  downloadStrings: {
    pending: string
    heroFor: string
    copied: string
    /** 폰에서는 받을 수 없으므로, 대신 이 주소를 컴퓨터로 보내게 한다 */
    sendToComputer: string
  }

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
