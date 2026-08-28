/**
 * 온보딩 화면에 쓰는 작은 선 아이콘들.
 *
 * currentColor 기반이라 부모의 text-* 색을 그대로 따라간다. 아이콘 라이브러리를 새로
 * 넣지 않고 손으로 그린 이유: 이 앱에 필요한 아이콘은 넷뿐이고, 다른 화면들도 전부
 * 이런 식으로 작은 컴포넌트를 파일 하나에 모아 둔다 (ui.ts·thumbnails.ts 참고).
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 사람 2인 — "새 방 만들기" 배지 */
export function PeopleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="2.6" />
      <path d="M4.5 18c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" />
      <circle cx="16.5" cy="8.6" r="2.1" />
      <path d="M14.8 13.9c1.9-.4 4.7.7 4.7 4" />
    </svg>
  )
}

/** 열쇠 — "초대코드로 참여하기" 배지 */
export function KeyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="14.5" r="3.3" />
      <path d="M10.3 12.2 18 4.5" />
      <path d="M15.2 7.3l2.1 2.1" />
      <path d="M17.6 4.9l2.1 2.1" />
    </svg>
  )
}

/** 발바닥 — 앱 이름 옆 */
export function PawIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="15.4" r="4" />
      <circle cx="6.2" cy="10.4" r="1.9" />
      <circle cx="10.4" cy="6.6" r="1.9" />
      <circle cx="13.6" cy="6.6" r="1.9" />
      <circle cx="17.8" cy="10.4" r="1.9" />
    </svg>
  )
}

/** 톱니바퀴 — "설정…" 옆 */
export function GearIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path
        d="M12 3.6v2.3M12 18.1v2.3M20.4 12h-2.3M5.9 12H3.6
           M17.5 6.5l-1.6 1.6M8.1 15.9l-1.6 1.6M17.5 17.5l-1.6-1.6
           M8.1 8.1 6.5 6.5"
      />
    </svg>
  )
}
