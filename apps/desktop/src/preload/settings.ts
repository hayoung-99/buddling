import { contextBridge, ipcRenderer } from 'electron'
import type { SettingsApi, IpcResult } from '@doran-doran/shared/ipc'
import type { AppState } from '@doran-doran/shared/state'

/** 메인 프로세스가 `{ ok, value, error }` 로 답한다. 실패는 여기서 다시 던진다. */
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result: IpcResult<T> = await ipcRenderer.invoke(channel, payload)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

/** 설정 창이 쓸 수 있는 것 전부. */
const api: SettingsApi = {
  getState: () => call<AppState>('app:state'),
  onState: (handler) => {
    ipcRenderer.on('state', (_event, state: AppState) => handler(state))
  },

  setPower: (level) => call<AppState>('settings:power', level),
  setLanguage: (preference) => call<AppState>('settings:language', preference),
}

contextBridge.exposeInMainWorld('settingsApi', api)
