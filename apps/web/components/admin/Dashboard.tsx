'use client'

import { useEffect, useState } from 'react'
import { fetchDaily, fetchDistribution, fetchOverview } from '../../lib/admin'
import type { DailyRow, Distribution, Overview } from '../../lib/admin'
import { characterName } from './character-name'

/**
 * 숫자판.
 *
 * 그래프 라이브러리를 넣지 않는다 — 막대 몇 개 그리자고 의존성을 하나 더 들일 화면이
 * 아니다. 세로 막대는 `height: %` 하나로 그린다.
 *
 * **읽기 전용이다.** 팀이나 사람을 고치거나 지우는 단추가 없다. 잘못 누르면 되돌릴 수
 * 없는 일을, 지금 필요하지도 않은데 만들어 둘 이유가 없다.
 */

const DAYS = 30

export function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [distribution, setDistribution] = useState<Distribution | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [a, b, c] = await Promise.all([
          fetchOverview(),
          fetchDaily(DAYS),
          fetchDistribution(),
        ])
        if (cancelled) return
        setOverview(a)
        setDaily(b)
        setDistribution(c)
      } catch (failed) {
        if (!cancelled) setError((failed as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="admin-error">불러오지 못했어요 — {error}</p>
  if (!overview || !distribution) return <p className="admin-note">불러오는 중이에요…</p>

  const soloRatio = overview.teams ? Math.round((overview.solo / overview.teams) * 100) : 0

  return (
    <>
      <section className="admin-cards">
        <Card label="팀" value={overview.teams} sub={`최근 30일 +${overview.recent.teams30}`} />
        <Card
          label="사람"
          value={overview.people}
          sub={`팀 소속 ${overview.members}자리 · 최근 30일 +${overview.recent.members30}`}
        />
        <Card label="오늘 온 사람" value={overview.active.d1} sub={`7일 ${overview.active.d7} · 30일 ${overview.active.d30}`} />
        <Card label="혼자인 팀" value={`${soloRatio}%`} sub={`${overview.solo}개 / ${overview.teams}개`} />
      </section>

      <p className="admin-note">
        <strong>계정 {overview.accounts.total}개</strong> 중 {overview.accounts.anonymous}개가
        익명입니다. 앱을 다시 깔거나 세션을 잃을 때마다 하나씩 늘어나므로{' '}
        <strong>사람 수가 아닙니다</strong> — 사람 수로 읽어야 하는 것은 위의 &ldquo;사람&rdquo;
        입니다. 팀에 들어가지 않은 채 떠도는 계정은 7일마다 저절로 정리됩니다.
      </p>

      <section className="admin-panel">
        <h2>최근 {DAYS}일 — 새로 생긴 것</h2>
        <Bars rows={daily} />
        <p className="admin-note">
          <strong>날짜별 활동자 수는 여기에 없습니다.</strong> 지금 DB 는 사람마다 마지막
          흔적 하나만 들고 있어서, 과거 어느 날 누가 왔는지는 기록이 남지 않습니다. 그래서
          만들 수 있는 것만 그립니다 — 지금 활동자는 위 카드가, 언제 마지막으로 왔는지는
          아래 표가 답합니다.
        </p>
      </section>

      <section className="admin-two">
        <div className="admin-panel">
          <h2>마지막으로 온 때</h2>
          <Rows
            rows={[
              ['하루 안', distribution.lastSeen.today],
              ['1~7일 전', distribution.lastSeen.week],
              ['8~30일 전', distribution.lastSeen.month],
              ['30일보다 전', distribution.lastSeen.older],
            ]}
          />
        </div>

        <div className="admin-panel">
          <h2>팀 크기</h2>
          <Rows rows={distribution.teamSizes.map((row) => [`${row.size}명`, row.teams])} />
        </div>

        <div className="admin-panel">
          <h2>고른 캐릭터</h2>
          <Rows rows={distribution.characters.map((row) => [characterName(row.key), row.members])} />
        </div>
      </section>

      <p className="admin-stamp">
        {new Date(overview.generatedAt).toLocaleString('ko-KR')} 기준
      </p>
    </>
  )
}

function Card({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="admin-card">
      <p className="admin-card-label">{label}</p>
      <p className="admin-card-value">{value}</p>
      <p className="admin-card-sub">{sub}</p>
    </div>
  )
}

/** 날짜별 막대 둘. 가장 큰 날을 100% 로 잡는다 — 절대값은 아래 숫자가 말한다. */
function Bars({ rows }: { rows: DailyRow[] }) {
  const peak = Math.max(1, ...rows.map((row) => Math.max(row.newTeams, row.newMembers)))
  const total = rows.reduce(
    (sum, row) => ({ teams: sum.teams + row.newTeams, members: sum.members + row.newMembers }),
    { teams: 0, members: 0 },
  )

  return (
    <>
      <div className="admin-bars">
        {rows.map((row) => (
          <div className="admin-bar-day" key={row.date} title={`${row.date} · 팀 ${row.newTeams} · 사람 ${row.newMembers}`}>
            <span className="admin-bar teams" style={{ height: `${(row.newTeams / peak) * 100}%` }} />
            <span className="admin-bar members" style={{ height: `${(row.newMembers / peak) * 100}%` }} />
          </div>
        ))}
      </div>
      <p className="admin-legend">
        <span className="admin-swatch teams" /> 새 팀 {total.teams}
        <span className="admin-swatch members" /> 새 사람 {total.members}
        <span className="admin-range">
          {rows[0]?.date} ~ {rows[rows.length - 1]?.date}
        </span>
      </p>
    </>
  )
}

function Rows({ rows }: { rows: [string, number][] }) {
  if (!rows.length) return <p className="admin-note">아직 없어요.</p>
  const peak = Math.max(1, ...rows.map(([, value]) => value))

  return (
    <ul className="admin-rows">
      {rows.map(([label, value]) => (
        <li key={label}>
          <span className="admin-row-label">{label}</span>
          <span className="admin-row-track">
            <span className="admin-row-fill" style={{ width: `${(value / peak) * 100}%` }} />
          </span>
          <span className="admin-row-value">{value}</span>
        </li>
      ))}
    </ul>
  )
}
