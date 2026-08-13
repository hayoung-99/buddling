const { contextBridge, ipcRenderer } = require('electron')

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call(channel, payload) {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && result.ok === false) throw new Error(result.error)
  return result?.value
}

/** 설정 창이 쓸 수 있는 것 전부. */
contextBridge.exposeInMainWorld('settingsApi', {
  getState: () => call('app:state'),
  onState: (handler) => ipcRenderer.on('state', (_event, state) => handler(state)),

  setPower: (level) => call('settings:power', level),
  setLanguage: (preference) => call('settings:language', preference),
})
