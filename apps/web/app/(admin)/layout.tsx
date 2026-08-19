import '../globals.css'
import './admin.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'

/**
 * 어드민의 `<html>` 껍데기.
 *
 * 랜딩과 달리 자기 루트 레이아웃을 갖는 이유는 `app/(ko)`·`app/(en)` 과 같다 — Next 의
 * 루트 레이아웃은 경로 그룹마다 하나씩이고, 여기는 그 둘 어디에도 속하지 않는다.
 *
 * **검색에 잡히지 않게 한다.** 메타의 `robots` 와 미들웨어의 `X-Robots-Tag`, `robots.txt`
 * 세 곳에 함께 적혀 있다. 하나만으로도 대개 되지만, 셋 중 하나를 빠뜨렸을 때 조용히
 * 색인되는 쪽이 되돌리기 어렵다.
 *
 * 나라말은 한국어 한 벌뿐이다. 읽는 사람이 운영자라 네 언어 사전에 넣지 않는다.
 */
export const metadata: Metadata = {
  title: 'tap-tap 어드민',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
