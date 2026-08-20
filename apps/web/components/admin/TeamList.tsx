'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchTeams } from '../../lib/admin'
import type { AdminTeam, AdminTeams } from '../../lib/admin'
import { characterName } from './character-name'

/**
 * 팀 목록.
 *
 * 숫자판과 파일을 나눈 이유는 **성격이 다르기 때문**이다. 위쪽은 집계이고 이쪽은
 * 사람이 손으로 적은 이름이 나오는 목록이다. 무엇이 화면에 나가는지 판단할 일이
 * 생기면 이 파일 하나만 보면 되도록 떼어 두었다.
 *
 * **읽기 전용이다.** 이름을 고치거나 팀을 지우는 단추가 없다.
 *
 * 펼치기는 `<details>` 로 만든다. 자바스크립트를 한 줄도 쓰지 않고, 브라우저가 접근성
 * (키보드·스크린리더)까지 알아서 해 준다. 상태를 들고 있으면 그 둘을 직접 해야 한다.
 *
 * 거르기는 브라우저에서 한다. 서버를 다시 부를 만큼 팀이 많지 않고, 글자를 칠 때마다
 * 왕복하면 오히려 굼떠 보인다.
 */

/** 한 번에 받아 오는 팀 수. 서버가 1000 까지만 준다 (`admin_teams`) */
const LIMIT = 200

export function TeamList() {
  const [data, setData] = useState<AdminTeams | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const teams = await fetchTeams(LIMIT)
        if (!cancelled) setData(teams)
      } catch (failed) {
        if (!cancelled) setError((failed as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* 팀 이름과 팀원 닉네임 양쪽에서 찾는다 — 누가 어느 팀인지가 대개 궁금한 것이다 */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!data) return []
    if (!needle) return data.teams
    return data.teams.filter(
      (team) =>
        team.name.toLowerCase().includes(needle) ||
        team.members.some((member) => member.nickname.toLowerCase().includes(needle)),
    )
  }, [data, query])

  /*
   * 스키마가 아직 옛 모양이면 이 함수가 없다. 숫자판까지 함께 죽이지 않도록 여기서만
   * 안내하고 넘어간다 — 위쪽 숫자는 멀쩡히 보이는 편이 낫다.
   */
  if (error) {
    return (
      <section className="admin-panel">
        <h3 className="admin-panel-title">팀</h3>
        <p className="admin-error">
          팀 목록을 불러오지 못했어요 — {error}
          {/DOES NOT EXIST|admin_teams/i.test(error) && (
            <>
              {' '}
              Supabase 콘솔에서 <code>supabase/schema.sql</code> 을 다시 실행해 주세요.
            </>
          )}
        </p>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="admin-panel">
        <h3 className="admin-panel-title">팀</h3>
        <p className="admin-note">불러오는 중이에요…</p>
      </section>
    )
  }

  return (
    <section className="admin-panel">
      <h3 className="admin-panel-title">팀 {data.total}개</h3>

      <input
        className="admin-filter"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="팀 이름이나 닉네임으로 거르기"
        aria-label="팀 이름이나 닉네임으로 거르기"
      />

      {/*
        말없이 자르면 화면이 "이게 전부"로 읽힌다. 잘렸을 때만 그렇다고 적는다.
      */}
      {data.total > data.teams.length && (
        <p className="admin-note">
          {data.total}개 중 <strong>가장 최근에 쓴 {data.teams.length}개</strong>만 보여 주고
          있어요. 나머지는 이 화면에 없습니다.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="admin-note">{query.trim() ? '걸린 팀이 없어요.' : '아직 팀이 없어요.'}</p>
      ) : (
        <ul className="admin-teams">
          {shown.map((team) => (
            <TeamRow key={team.id} team={team} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TeamRow({ team }: { team: AdminTeam }) {
  return (
    <li>
      <details>
        <summary>
          <span className="admin-team-name">{team.name}</span>
          <span className="admin-team-meta">{team.members.length}명</span>
          <span className="admin-team-meta admin-team-when">{ago(team.lastSeen)}</span>
        </summary>

        {team.members.length === 0 ? (
          /* 마지막 사람이 나가면 leave_team() 이 팀도 지우므로 여기 올 일은 없다.
             콘솔에서 손으로 지운 경우에만 남으므로, 깨지지 않게만 해 둔다. */
          <p className="admin-note">팀원이 없어요.</p>
        ) : (
          <ul className="admin-members">
            {team.members.map((member) => (
              <li key={member.nickname}>
                <span className="admin-member-name">{member.nickname}</span>
                <span className="admin-team-meta">{characterName(member.character)}</span>
                <span className="admin-team-meta admin-team-when">{ago(member.lastSeen)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="admin-team-made">{day(team.createdAt)}에 만들었어요</p>
      </details>
    </li>
  )
}

/**
 * "언제 마지막으로 왔나" 를 일상어로.
 *
 * 정확한 시각은 여기서 볼 일이 아니다 — 알고 싶은 것은 "아직 쓰나" 이고, 그건 며칠
 * 전인지로 충분하다. 앱이 30분마다 흔적을 남기므로 한 시간 안이면 지금 켜 둔 것이다.
 */
function ago(at: string | null): string {
  if (!at) return '흔적 없음'
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60000)
  if (minutes < 60) return '지금 켜 둠'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return `${Math.floor(days / 30)}달 전`
}

const day = (at: string) => new Date(at).toLocaleDateString('ko-KR')
