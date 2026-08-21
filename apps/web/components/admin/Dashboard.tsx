'use client'

import { useEffect, useState } from 'react'
import { fetchDaily, fetchDistribution, fetchOverview } from '../../lib/admin'
import type { DailyRow, Distribution, Overview } from '../../lib/admin'
import { characterName } from './character-name'

/**
 * 숫자판.
 *
 * 세 가지 질문 순서로 읽힌다 — **지금 쓰고 있나 · 실제로 얼마나 쓰이나 · 얼마나 새로
 * 들어오나.** 예전에는 카드가 그냥 넉 장 나란히 있어서 왜 그 순서인지 읽어낼 단서가
 * 없었다. 마디마다 제목을 다는 것이 그 답이다.
 *
 * 그래프 라이브러리를 넣지 않는다 — 막대 몇 개 그리자고 의존성을 하나 더 들일 화면이
 * 아니다. 세로 막대는 `height: %` 하나로 그린다.
 *
 * **읽기 전용이다.** 방이나 사람을 고치거나 지우는 단추가 없다. 잘못 누르면 되돌릴 수
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

  /*
   * 스키마가 아직 갱신되지 않으면 새 열쇠가 통째로 없다. 그대로 그리면 숫자 자리가
   * 빈칸이나 NaN 이 되는데, 그것만 보고는 무엇이 잘못됐는지 알 방법이 없다.
   * 배포 순서(스키마 먼저, 웹 나중)가 뒤집혔다는 뜻이므로 그렇게 적어 준다.
   */
  if (!overview.now || !overview.fresh || !overview.total) {
    return (
      <p className="admin-error">
        데이터베이스가 아직 옛 모양이에요. Supabase 콘솔에서{' '}
        <code>supabase/schema.sql</code> 을 다시 실행해 주세요.
      </p>
    )
  }

  const soloRatio = overview.total.teams
    ? Math.round((overview.solo / overview.total.teams) * 100)
    : 0

  return (
    <>
      <h2 className="admin-heading">지금</h2>
      <section className="admin-cards">
        <Card
          label="지금 켜 둔 사람"
          value={overview.now.people}
          sub={`최근 1시간 · 방 ${overview.now.teams}개`}
        />
        <Card
          label="오늘 온 사람"
          value={overview.active.d1}
          sub={`7일 ${overview.active.d7} · 30일 ${overview.active.d30}`}
        />
      </section>

      <h2 className="admin-heading">실제 사용</h2>
      <section className="admin-cards">
        <Card
          label="쓰는 사람"
          value={overview.live.people}
          sub={`최근 30일 안에 앱을 켠 사람 · 누적 ${overview.total.people}명 중`}
        />
        <Card
          label="쓰는 방"
          value={overview.total.teams}
          sub="마지막 사람이 나가면 방도 함께 사라져요 — 남아 있는 방이 곧 쓰는 방입니다"
        />
        <Card
          label="혼자인 방"
          value={`${soloRatio}%`}
          sub={`${overview.solo}개 / ${overview.total.teams}개`}
        />
      </section>

      <p className="admin-note">
        <strong>계정 {overview.accounts.total}개</strong> 중 {overview.accounts.anonymous}개가
        익명입니다. 앱을 다시 깔거나 세션을 잃을 때마다 하나씩 늘어나므로{' '}
        <strong>사람 수가 아닙니다</strong> — 사람 수로 읽어야 하는 것은 위의 &ldquo;쓰는
        사람&rdquo; 입니다. 방에 들어가지 않은 채 떠도는 계정은 7일마다 저절로 정리됩니다.
      </p>

      <h2 className="admin-heading">신규 유입</h2>
      <section className="admin-cards">
        <Card
          label="오늘"
          value={overview.fresh.people.today}
          sub={`새 사람 · 새 방 ${overview.fresh.teams.today}개`}
        />
        <Card
          label="최근 7일"
          value={overview.fresh.people.d7}
          sub={`새 사람 · 새 방 ${overview.fresh.teams.d7}개`}
        />
        <Card
          label="최근 30일"
          value={overview.fresh.people.d30}
          sub={`새 사람 · 새 방 ${overview.fresh.teams.d30}개`}
        />
        <Card
          label="깔고 방 안 만든 사람"
          value={overview.accounts.stranded}
          sub="앱까지는 왔는데 방을 못 만든 사람 · 7일이 지나면 매일 새벽 3시에 정리돼요"
        />
      </section>

      <section className="admin-panel">
        <h3>최근 {DAYS}일 — 날짜별로</h3>
        <Bars rows={daily} />
        <p className="admin-note">
          <strong>날짜별 활동자 수는 여기에 없습니다.</strong> 지금 DB 는 사람마다 마지막
          흔적 하나만 들고 있어서, 과거 어느 날 누가 왔는지는 기록이 남지 않습니다. 그래서
          만들 수 있는 것만 그립니다 — 지금 활동자는 위 카드가, 언제 마지막으로 왔는지는
          아래 표가 답합니다.
        </p>
      </section>

      <h2 className="admin-heading">분포</h2>
      <section className="admin-two">
        <div className="admin-panel">
          <h3>마지막으로 온 때</h3>
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
          <h3>방 크기</h3>
          <Rows rows={distribution.teamSizes.map((row) => [`${row.size}명`, row.teams])} />
        </div>

        <div className="admin-panel">
          <h3>고른 캐릭터</h3>
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
  const peak = Math.max(1, ...rows.map((row) => Math.max(row.newTeams, row.newPeople)))
  const total = rows.reduce(
    (sum, row) => ({ teams: sum.teams + row.newTeams, people: sum.people + row.newPeople }),
    { teams: 0, people: 0 },
  )

  return (
    <>
      <div className="admin-bars">
        {rows.map((row) => (
          <div className="admin-bar-day" key={row.date} title={`${row.date} · 방 ${row.newTeams} · 사람 ${row.newPeople}`}>
            <span className="admin-bar teams" style={{ height: `${(row.newTeams / peak) * 100}%` }} />
            <span className="admin-bar members" style={{ height: `${(row.newPeople / peak) * 100}%` }} />
          </div>
        ))}
      </div>
      <p className="admin-legend">
        <span className="admin-swatch teams" /> 새 방 {total.teams}
        <span className="admin-swatch members" /> 새 사람 {total.people}
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
