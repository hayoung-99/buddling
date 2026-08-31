/**
 * 아주 작은 영속 저장소. userData 폴더의 JSON 파일 하나에 전부 담는다.
 *
 * 저장하는 것
 *   auth        Supabase 익명 로그인 세션. 계정 대신 "이 멤버가 나"임을 증명한다.
 *   nickname    새 팀에 들어갈 때 기본으로 채워 넣을 이름
 *   memberships 마지막으로 확인한 소속 팀들. 서버가 진짜지만, 앱을 켜자마자
 *               캐릭터를 띄우려면 캐시가 필요하다 (네트워크가 늦거나 끊겨도 뜬다).
 *   pets        팀별 개인 설정 — 어디에 얼마만 하게 띄울지, 이 방에서 무슨 신호를 보낼지
 *   language    고른 언어. 비어 있으면 첫 실행 때 운영체제 언어로 한 번 정해 넣는다.
 *   power       절전 강도. 캐릭터가 가만히 있을 때 얼마나 게으르게 그릴지를 정한다.
 *   lastUpdateCheck  새 버전을 마지막으로 확인한 날. 앱을 껐다 켜도 하루 한 번을 지키려면
 *               기억해 둬야 한다.
 *   notifications       내보내진 나 자신의 줄들. 알림 화면의 나머지 사건은 서버에서 온다
 *   notificationsSeenAt 알림 창을 마지막으로 연 시각. 안읽음 판정의 기준이다
 *   serverNotifications 서버가 적어 둔 사건들의 사본. 오프라인일 때도 마지막으로 받은
 *               것까지는 보여 주려고 기기에 둔다 (원본은 언제나 서버)
 *
 * 쓰기는 잠깐 모았다 한 번에 한다 (SAVE_DELAY). 앱을 끄기 직전처럼 미룰 수 없을 때는
 * `flush()` 로 그 자리에서 끝낸다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { legacyStorePath } from './legacy-store'
import { writeJsonAtomically } from './write-json'
import type { Member, PetSettings, Team } from '@buddling/shared/state'
import { DEFAULT_SIGNAL } from '@buddling/shared/signals'
import type { NetEvent } from '../services/net'

/**
 * 기기에 남기는 **내보내진 나 자신의 줄** 하나 (기획서 "알림 화면").
 *
 * 서버가 적어 준 사건(`joined`·`left`·`kicked`)과 달리 이 표에 남는 것은 이 한 종류뿐이라
 * `kind` 를 들고 있지 않는다 — 그 값은 `session.ts` 의 `snapshot()` 이 `'kicked-me'` 로
 * 붙여 준다. `shared/state.ts` 의 `NotificationEntry` 를 그대로 쓰지 않는 이유가 그것이다.
 */
export interface DeviceNotificationEntry {
  id: string
  teamId: string
  /** 내보내질 당시 내가 부르던 이름 — 그때 무엇을 잃었는지 말하는 값이라 나중에 팀
   *  이름이 바뀌어도 이 줄은 그대로다 */
  teamName: string
  /** epoch ms. 안읽음 판정과 7일 소멸에 쓴다 */
  at: number
}

/**
 * 저장 파일에 남는 소속.
 *
 * 화면이 보는 `Membership`(shared/state.ts)과 다르다 — 접속 여부나 지금 연결 상태처럼
 * 서버에서 와야 아는 것은 캐시할 이유가 없다. 뼈대만 남겨 두었다가 앱을 켜자마자
 * 캐릭터를 띄우는 데 쓴다.
 */
export interface CachedMembership {
  team: Team
  member: Member
  /** 옛 저장 파일에는 없다. 없으면 나 혼자인 것으로 본다. */
  members?: Member[]
}

/** 저장 파일 하나에 담기는 전부 */
export interface StoredState {
  /** Supabase 세션. 이 값이 곧 신원이다 (아래 authStorage) */
  auth: Record<string, string>
  nickname: string
  memberships: CachedMembership[]
  /** teamId → 그 팀 캐릭터를 어디에 얼마만 하게 띄울지, 무슨 신호를 보낼지 */
  pets: Record<string, PetSettings>
  /** 아직 안 고른 상태는 null. 처음 실행할 때 운영체제 언어를 보고 정해진다. */
  language: string | null
  /** 절전 강도. 아직 안 고르면 'balanced' 로 본다 (shared/power.ts) */
  power: string | null
  /** 새 버전을 마지막으로 확인한 날 'YYYY-MM-DD'. 하루 한 번만 보려고 남긴다. */
  lastUpdateCheck: string | null
  /** 내보내진 나 자신의 줄들 — 알림 화면에 쌓이는 나머지(들어옴·나감·내보내짐)는
   *  서버가 들고 있다가 `net.getMyEvents()` 로 온다. 최신이 앞이 아니어도 된다 —
   *  정렬은 내보낼 때(session.ts) 한다 */
  notifications: DeviceNotificationEntry[]
  /** 알림 창을 마지막으로 연 시각(epoch ms). 한 번도 안 열었으면 null — 그때는 있는
   *  것 전부가 안읽음이다 */
  notificationsSeenAt: number | null
  /**
   * 서버에서 마지막으로 받아 온 7일치의 **사본** (기획서 "알림 화면").
   *
   * 원본은 언제나 서버다. 이 칸은 인터넷이 없는 동안 보여 줄 것이고, 새로 받아 오면
   * **통째로 갈아 끼운다** — 줄 단위로 견주거나 합치지 않는다. 합치기 시작하는 순간
   * 서버와 기기가 서로 다른 말을 할 수 있게 되는데, 캐싱을 미뤄 두었던 이유가
   * 정확히 그것이었다.
   *
   * **`notifications`(내보내진 나 자신의 줄)와 다른 칸이다.** 그쪽은 앱이 뺄셈으로
   * 알아내 만든 것이라 서버에서 다시 읽을 수 없고, 갈아 끼우기에 쓸려 나가면 안 된다.
   *
   * 받은 모양 그대로 적는다 — `at` 은 ISO 문자열이다.
   */
  serverNotifications: NetEvent[]
}

const DEFAULTS: StoredState = {
  auth: {},
  nickname: '',
  memberships: [],
  pets: {},
  language: null,
  power: null,
  lastUpdateCheck: null,
  notifications: [],
  notificationsSeenAt: null,
  serverNotifications: [],
}

const DEFAULT_PET: PetSettings = { position: null, scale: 1, signal: DEFAULT_SIGNAL }

/**
 * 쓰기를 모아서 하는 간격(ms).
 *
 * 크기 슬라이더를 한 번 끌면 설정이 초당 수십 번 바뀐다. 그때마다 디스크에 쓰면
 * 메인 프로세스가 그만큼 멈춰 서서 정작 슬라이더가 뻑뻑해진다. 잠깐 모았다 한 번 쓴다.
 */
const SAVE_DELAY = 250

let filePath: string | null = null
let state: StoredState = { ...DEFAULTS }
let pending: ReturnType<typeof setTimeout> | null = null

function load() {
  filePath = path.join(app.getPath('userData'), 'buddling.json')

  /*
   * 새 파일이 없으면 이름을 바꾸기 전 자리를 한 번 본다.
   *
   * 앱 이름이 바뀌면 userData 폴더도 함께 바뀌어서, 그냥 두면 이미 쓰던 사람이
   * 세션을 잃고 방과 남남이 된다 (`legacy-store.ts` 참고). 읽어 왔으면 그 자리에서
   * 새 파일로 옮겨 적고, 그다음부터는 새 파일만 본다.
   */
  const legacy = legacyStorePath(app.getPath('appData'), process.env.BUDDLING_PROFILE)

  for (const candidate of [filePath, legacy]) {
    if (!candidate) continue
    try {
      state = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(candidate, 'utf8')) }
      if (candidate !== filePath) write()
      return state
    } catch {
      // 다음 후보를 본다. 둘 다 없으면 처음 켠 것이다.
    }
  }

  state = { ...DEFAULTS }
  return state
}

function write() {
  if (!filePath) return

  const result = writeJsonAtomically(filePath, state)
  if (result.ok) return

  /*
   * 저장에 실패했다고 앱을 죽이지 않는다.
   *
   * 이 함수는 예약된 타이머 안에서도 불린다. 거기서 예외가 새어 나가면 아무도
   * 잡지 않아 메인 프로세스가 통째로 죽고, 사용자는 캐릭터 대신 오류창을 본다.
   * 자리·크기를 한 번 못 적는 것과는 비교가 안 되는 손해다.
   *
   * 다음 저장 때 다시 시도한다. 상태는 메모리에 그대로 있으므로 그때 한꺼번에 적힌다.
   */
  console.error('[buddling] 설정을 저장하지 못했습니다', result.error)
}

function save() {
  if (!filePath || pending) return
  pending = setTimeout(() => {
    pending = null
    write()
  }, SAVE_DELAY)
  // 이 타이머 때문에 앱이 종료되지 못하는 일이 없게 한다
  pending.unref?.()
}

/** 미뤄 둔 쓰기를 지금 끝낸다 (앱을 끄기 직전처럼 미룰 수 없는 순간에) */
function flush() {
  if (pending) clearTimeout(pending)
  pending = null
  write()
}

/**
 * Supabase 가 세션을 넣어 두는 자리 (createSupabaseNet 의 auth.storage 로 넘긴다).
 *
 * 이 값이 곧 신원이다. 예전 deviceId 처럼 한 번 정하고 마는 값이 아니라 토큰이
 * 갱신될 때마다 새로 쓰인다. 새것을 받아 놓고 적기 전에 앱이 죽으면 다음 실행 때
 * 이미 무효가 된 옛 토큰을 들고 가 로그인이 깨지고, 그러면 속한 팀을 전부 잃는다.
 * 그래서 여기만은 모아 뒀다 쓰지 않고 그 자리에서 끝낸다.
 */
const authStorage = {
  getItem: (key: string) => state.auth?.[key] ?? null,

  setItem(key: string, value: string) {
    state = { ...state, auth: { ...state.auth, [key]: value } }
    flush()
  },

  removeItem(key: string) {
    const auth = { ...state.auth }
    delete auth[key]
    state = { ...state, auth }
    flush()
  },
}

/** 팀별 화면 설정 (없으면 기본값) */
function pet(teamId: string): PetSettings {
  return { ...DEFAULT_PET, ...state.pets[teamId] }
}

const store = {
  load,
  flush,
  authStorage,
  pet,

  get: <K extends keyof StoredState>(key: K): StoredState[K] => state[key],

  set(patch: Partial<StoredState>): StoredState {
    state = { ...state, ...patch }
    save()
    return state
  },

  setPet(teamId: string, patch: Partial<PetSettings>): PetSettings {
    state = {
      ...state,
      pets: { ...state.pets, [teamId]: { ...pet(teamId), ...patch } },
    }
    save()
    return state.pets[teamId]
  },

  /** 더 이상 속하지 않는 팀의 화면 설정을 정리한다 */
  prunePets(teamIds: string[]) {
    const keep = new Set(teamIds)
    const pets = Object.fromEntries(Object.entries(state.pets).filter(([id]) => keep.has(id)))
    state = { ...state, pets }
    save()
  },
}

/** 메인 프로세스 어디서나 같은 하나를 쓴다. 테스트는 `createSession` 에 흉내를 꽂는다. */
export type Store = typeof store

export default store
