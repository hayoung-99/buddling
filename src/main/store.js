/**
 * 아주 작은 영속 저장소. userData 폴더의 JSON 파일 하나에 전부 담는다.
 *
 * 저장하는 것
 *   deviceId    이 기기를 나타내는 값. 계정 대신 "이 멤버가 나"임을 증명하므로 절대 바꾸지 않는다.
 *   nickname    새 팀에 들어갈 때 기본으로 채워 넣을 이름
 *   memberships 마지막으로 확인한 소속 팀들. 서버가 진짜지만, 앱을 켜자마자
 *               캐릭터를 띄우려면 캐시가 필요하다 (네트워크가 늦거나 끊겨도 뜬다).
 *   pets        팀별 화면 설정 — 어디에 얼마만 하게 띄울지
 *   language    고른 언어. 비어 있으면 첫 실행 때 운영체제 언어로 한 번 정해 넣는다.
 *   power       절전 강도. 캐릭터가 가만히 있을 때 얼마나 게으르게 그릴지를 정한다.
 *   lastUpdateCheck  새 버전을 마지막으로 확인한 날. 앱을 껐다 켜도 하루 한 번을 지키려면
 *               기억해 둬야 한다.
 *
 * 쓰기는 잠깐 모았다 한 번에 한다 (SAVE_DELAY). 앱을 끄기 직전처럼 미룰 수 없을 때는
 * `flush()` 로 그 자리에서 끝낸다.
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app } = require('electron')
const { writeJsonAtomically } = require('./write-json')

const DEFAULTS = {
  deviceId: null,
  nickname: '',
  memberships: [], // [{ team: {id,name,inviteCode}, member: {id,nickname,characterKey} }]
  pets: {}, // teamId → { position: {x,y}|null, scale: number }
  petVisible: true,
  language: null, // 아직 안 고른 상태. 처음 실행할 때 운영체제 언어를 보고 정해진다.
  power: null, // 절전 강도. 아직 안 고르면 'balanced' 로 본다 (src/shared/power.js)
  lastUpdateCheck: null, // 새 버전을 마지막으로 확인한 날 'YYYY-MM-DD'. 하루 한 번만 보려고 남긴다.
}

const DEFAULT_PET = { position: null, scale: 1 }

/**
 * 쓰기를 모아서 하는 간격(ms).
 *
 * 크기 슬라이더를 한 번 끌면 설정이 초당 수십 번 바뀐다. 그때마다 디스크에 쓰면
 * 메인 프로세스가 그만큼 멈춰 서서 정작 슬라이더가 뻑뻑해진다. 잠깐 모았다 한 번 쓴다.
 */
const SAVE_DELAY = 250

let filePath = null
let state = { ...DEFAULTS }
let pending = null

function load() {
  filePath = path.join(app.getPath('userData'), 'tap-tap.json')
  try {
    state = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  } catch {
    state = { ...DEFAULTS }
  }

  if (!state.deviceId) {
    state.deviceId = crypto.randomUUID()
    // 이 값은 계정 대신 "이 멤버가 나"임을 증명한다. 잃어버리면 팀에서 남남이 되므로
    // 모아 뒀다 쓰지 않고 그 자리에서 확실히 남긴다.
    flush()
  }
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
  console.error('[tap-tap] 설정을 저장하지 못했습니다', result.error)
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
  clearTimeout(pending)
  pending = null
  write()
}

module.exports = {
  load,
  flush,
  get: (key) => state[key],

  set(patch) {
    state = { ...state, ...patch }
    save()
    return state
  },

  /** 팀별 화면 설정 (없으면 기본값) */
  pet(teamId) {
    return { ...DEFAULT_PET, ...(state.pets[teamId] ?? {}) }
  },

  setPet(teamId, patch) {
    state = {
      ...state,
      pets: { ...state.pets, [teamId]: { ...module.exports.pet(teamId), ...patch } },
    }
    save()
    return state.pets[teamId]
  },

  /** 더 이상 속하지 않는 팀의 화면 설정을 정리한다 */
  prunePets(teamIds) {
    const keep = new Set(teamIds)
    const pets = Object.fromEntries(Object.entries(state.pets).filter(([id]) => keep.has(id)))
    state = { ...state, pets }
    save()
  },
}
