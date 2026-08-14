import { contextBridge, ipcRenderer } from 'electron'
import type { SizeApi } from '../shared/ipc'

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && result.ok === false) throw new Error(result.error)
  return result?.value
}

/** 크기 조절 패널이 쓸 수 있는 것 전부. */
const api: SizeApi = {
  getScale: () => call('size:get'),
  /** @param live 슬라이더를 아직 끄는 중인가 */
  setScale: (scale, live = false) => ipcRenderer.send('size:set', { scale, live }),
  close: () => ipcRenderer.send('size:close'),
}

contextBridge.exposeInMainWorld('sizeApi', api)
