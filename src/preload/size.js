const { contextBridge, ipcRenderer } = require('electron')

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call(channel, payload) {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && result.ok === false) throw new Error(result.error)
  return result?.value
}


/** 크기 조절 패널이 쓸 수 있는 것 전부. */
contextBridge.exposeInMainWorld('sizeApi', {
  getScale: () => call('size:get'),
  setScale: (scale) => ipcRenderer.send('size:set', scale),
  close: () => ipcRenderer.send('size:close'),
})
