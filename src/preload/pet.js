const { contextBridge, ipcRenderer } = require('electron')

/**
 * 캐릭터 창은 팀마다 하나씩 뜬다.
 * 자기가 어느 팀 것인지는 창을 만들 때 넘긴 `--team-id=` 인자로 알 수 있다.
 */

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call(channel, payload) {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && result.ok === false) throw new Error(result.error)
  return result?.value
}

const teamId = process.argv.find((arg) => arg.startsWith('--team-id='))?.slice('--team-id='.length)

/** 캐릭터 창이 쓸 수 있는 것 전부. 이 목록 밖으로는 아무것도 새어나가지 않는다. */
contextBridge.exposeInMainWorld('petApi', {
  teamId,

  getState: () => call('app:state'),

  onState: (handler) => ipcRenderer.on('state', (_event, state) => handler(state)),
  onCharacter: (handler) => ipcRenderer.on('character', (_event, key) => handler(key)),
  onTap: (handler) => ipcRenderer.on('tap', (_event, payload) => handler(payload)),

  /** 커서가 캐릭터 위에 있는 동안만 true. false면 클릭이 바탕화면으로 통과된다. */
  setInteractive: (interactive) => ipcRenderer.send('pet:interactive', { teamId, interactive }),

  tap: () => ipcRenderer.send('pet:tap', { teamId }),
  dragStart: () => ipcRenderer.send('pet:drag-start', { teamId }),
  dragEnd: () => ipcRenderer.send('pet:drag-end', { teamId }),
  openMenu: () => ipcRenderer.send('pet:menu', { teamId }),
  openTeamWindow: () => ipcRenderer.send('window:team'),
})
