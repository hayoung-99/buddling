import { contextBridge, ipcRenderer } from 'electron'
import type { TeamApi } from '../shared/ipc'
import type { AppState } from '../shared/state'

/**
 * 목록 창과 상세 창이 같은 preload 를 쓴다.
 * 상세 창만 `--team-id=` 인자를 받으므로, 목록 창에서는 undefined 다.
 */

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && result.ok === false) throw new Error(result.error)
  return result?.value
}

const teamId = process.argv.find((arg) => arg.startsWith('--team-id='))?.slice('--team-id='.length)

/** 팀 창이 쓸 수 있는 것 전부. */
const api: TeamApi = {
  teamId,

  getState: () => call<AppState>('app:state'),

  /** 팀 상세 창을 연다 (이미 열려 있으면 앞으로 가져온다) */
  openTeam: (id) => ipcRenderer.send('window:team-detail', id),

  /** 절전 강도와 언어를 고르는 창을 연다 */
  openSettings: () => ipcRenderer.send('window:settings'),

  /** 새 버전을 받을 수 있는 곳을 브라우저로 연다 (주소는 메인이 정한다) */
  openDownloadPage: () => ipcRenderer.send('window:open-download'),

  /** 이미 받아 둔 새 버전을 지금 적용한다 (앱이 다시 시작된다) */
  installUpdate: () => ipcRenderer.send('update:install'),

  onState: (handler) => {
    ipcRenderer.on('state', (_event, state: AppState) => handler(state))
  },
  onError: (handler) => {
    ipcRenderer.on('app-error', (_event, message: string) => handler(message))
  },

  createTeam: (payload) => call<AppState>('team:create', payload),
  joinTeam: (payload) => call<AppState>('team:join', payload),
  leaveTeam: (id) => call<AppState>('team:leave', id),
  refreshInvite: (id) => call<AppState>('team:refresh-invite', id),
  renameTeam: (id, name) => call<AppState>('team:rename', { teamId: id, name }),
  setNickname: (id, nickname) => call<AppState>('member:nickname', { teamId: id, nickname }),
  setLanguage: (preference) => call<AppState>('settings:language', preference),
  setCharacter: (id, characterKey) => call<AppState>('character:set', { teamId: id, characterKey }),

  /** 그 팀의 특정 멤버 한 명만 콕 찌른다 */
  tapMember: (id, memberId) => call<boolean>('team:tap', { teamId: id, toMemberId: memberId }),
}

contextBridge.exposeInMainWorld('teamApi', api)
