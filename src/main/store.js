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
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app } = require('electron')

const DEFAULTS = {
  deviceId: null,
  nickname: '',
  memberships: [], // [{ team: {id,name,inviteCode}, member: {id,nickname,characterKey} }]
  pets: {}, // teamId → { position: {x,y}|null, scale: number }
  petVisible: true,
  language: null, // 아직 안 고른 상태. 처음 실행할 때 운영체제 언어를 보고 정해진다.
}

const DEFAULT_PET = { position: null, scale: 1 }

let filePath = null
let state = { ...DEFAULTS }

function load() {
  filePath = path.join(app.getPath('userData'), 'tap-tap.json')
  try {
    state = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  } catch {
    state = { ...DEFAULTS }
  }

  if (!state.deviceId) {
    state.deviceId = crypto.randomUUID()
    save()
  }
  return state
}

function save() {
  if (!filePath) return
  // 쓰다가 죽어도 기존 파일이 깨지지 않도록 임시 파일에 쓴 뒤 교체한다
  const temporary = `${filePath}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2))
  fs.renameSync(temporary, filePath)
}

module.exports = {
  load,
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
