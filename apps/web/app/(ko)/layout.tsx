import '../globals.css'
import type { ReactNode } from 'react'
import { RootHtml } from '../../components/RootHtml'
import { ko } from '../../lib/copy.ko'
import { buildMetadata } from '../../lib/metadata'

export const metadata = buildMetadata(ko)

export const viewport = {
  // 벽지 맨 위 색. 주소창이 페이지와 이어져 보이게 한다.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#a9a5bd' },
    { media: '(prefers-color-scheme: dark)', color: '#14121a' },
  ],
}

export default function KoreanLayout({ children }: { children: ReactNode }) {
  return <RootHtml copy={ko}>{children}</RootHtml>
}
