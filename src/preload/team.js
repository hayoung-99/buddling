const { contextBridge, ipcRenderer } = require('electron')

/**
 * 목록 창과 상세 창이 같은 preload 를 쓴다.
 * 상세 창만 `--team-id=` 인자를 받으므로, 목록 창에서는 undefined 다.
 */

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call(channel, payload) {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && result.ok === false) throw new Error(result.error)
  return result?.value
}

const teamId = process.argv.find((arg) => arg.startsWith('--team-id='))?.slice('--team-id='.length)

/** 팀 창이 쓸 수 있는 것 전부. */
contextBridge.exposeInMainWorld('teamApi', {
  teamId,

  getState: () => call('app:state'),

  /** 팀 상세 창을 연다 (이미 열려 있으면 앞으로 가져온다) */
  openTeam: (id) => ipcRenderer.send('window:team-detail', id),

  /** 절전 강도와 언어를 고르는 창을 연다 */
  openSettings: () => ipcRenderer.send('window:settings'),

  /** 새 버전을 받을 수 있는 곳을 브라우저로 연다 (주소는 메인이 정한다) */
  openDownloadPage: () => ipcRenderer.send('window:open-download'),

  /** 이미 받아 둔 새 버전을 지금 적용한다 (앱이 다시 시작된다) */
  installUpdate: () => ipcRenderer.send('update:install'),

  onState: (handler) => ipcRenderer.on('state', (_event, state) => handler(state)),
  onError: (handler) => ipcRenderer.on('app-error', (_event, message) => handler(message)),

  createTeam: (payload) => call('team:create', payload),
  joinTeam: (payload) => call('team:join', payload),
  leaveTeam: (teamId) => call('team:leave', teamId),
  refreshInvite: (teamId) => call('team:refresh-invite', teamId),
  renameTeam: (teamId, name) => call('team:rename', { teamId, name }),
  setNickname: (teamId, nickname) => call('member:nickname', { teamId, nickname }),
  setLanguage: (preference) => call('settings:language', preference),
  setCharacter: (teamId, characterKey) =>
    call('character:set', { teamId, characterKey }),

  /** 그 팀의 특정 멤버 한 명만 콕 찌른다 */
  tapMember: (teamId, memberId) =>
    call('team:tap', { teamId, toMemberId: memberId }),
})
