/**
 * 창들이 메인 프로세스에 말을 거는 통로의 모양.
 *
 * preload 가 `contextBridge` 로 딱 이만큼만 열어 주고, 렌더러는 이 목록 밖으로는
 * 아무것도 할 수 없다. 그 경계를 여기 한 곳에 적어 두면 preload 는 "이대로 만들었나",
 * 렌더러는 "이대로 쓰고 있나" 를 컴파일러가 양쪽에서 봐 준다.
 *
 * 예전에는 이 경계가 통째로 `any` 였다 — 오타 하나가 조용히 `undefined` 가 되어
 * 화면에서만 드러났다.
 */

import type { AppState, TapPayload } from './state'

/**
 * 메인이 `ipcMain.handle` 로 답할 때의 봉투.
 *
 * 그냥 던지면 Electron 이 "Error invoking remote method '...'" 라는 껍데기를 씌워 버려서
 * 그 문구가 사용자 화면에 그대로 보인다. 그래서 성패를 값으로 실어 보내고, preload 의
 * `call()` 이 봉투를 풀어 다시 던진다.
 *
 * `error` 는 이미 지금 언어의 문장이다 — 열쇠를 문장으로 바꾸는 일은 `main/ipc.ts` 가 한다.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** 바탕화면 위 캐릭터 창 */
export interface PetApi {
  /** 이 창이 맡은 팀. 창을 만들 때 `--team-id=` 로 받는다. */
  teamId: string | undefined

  getState: () => Promise<AppState>

  onState: (handler: (state: AppState) => void) => void
  onCharacter: (handler: (characterKey: string) => void) => void
  onTap: (handler: (payload: TapPayload) => void) => void
  /** 컴퓨터가 잠들거나 화면이 잠기면 false, 깨어나면 true */
  onRenderState: (handler: (active: boolean) => void) => void

  /** 커서가 캐릭터 위에 있는 동안만 true. false 면 클릭이 바탕화면으로 통과된다. */
  setInteractive: (interactive: boolean) => void

  tap: () => void
  dragStart: () => void
  dragEnd: () => void
  openMenu: () => void
  openTeamWindow: () => void
}

/** 팀 목록 창과 팀 상세 창이 함께 쓴다. 상세 창만 `teamId` 를 받는다. */
export interface TeamApi {
  teamId: string | undefined

  getState: () => Promise<AppState>

  openTeam: (teamId: string) => void
  openSettings: () => void
  /** 알림 화면을 연다 (이미 열려 있으면 앞으로 가져온다) */
  openNotifications: () => void
  /** 새 버전을 받을 수 있는 곳을 브라우저로 연다 (주소는 메인이 정한다) */
  openDownloadPage: () => void
  /** 이미 받아 둔 새 버전을 지금 적용한다 (앱이 다시 시작된다) */
  installUpdate: () => void
  /**
   * 오프라인 화면의 "다시 해 보기". 서버에 닿는지만 확인하고 돌아온다 — 방 채널을
   * 다시 붙이는 일은 기다리지 않는다 (기획서 "인터넷이 없을 때").
   */
  retryConnection: () => Promise<AppState>

  onState: (handler: (state: AppState) => void) => void
  onError: (handler: (message: string) => void) => void

  createTeam: (payload: { name: string; nickname: string }) => Promise<AppState>
  joinTeam: (payload: { inviteCode: string; nickname: string }) => Promise<AppState>
  leaveTeam: (teamId: string) => Promise<AppState>
  refreshInvite: (teamId: string) => Promise<AppState>
  renameTeam: (teamId: string, name: string) => Promise<AppState>
  /** 방장만 부를 수 있다. 대상을 그 방에서 내보낸다. */
  kickMember: (teamId: string, memberId: string) => Promise<AppState>
  setNickname: (teamId: string, nickname: string) => Promise<AppState>
  setLanguage: (preference: string) => Promise<AppState>
  setCharacter: (teamId: string, characterKey: string) => Promise<AppState>
  /** 이 방에서 내가 보낼 신호를 고른다 (내 기기에만 저장된다) */
  setSignal: (teamId: string, signal: string) => Promise<AppState>
  /** 이 방을 재우거나 깨운다. 재우면 오는 신호에 반응하지 않는다 (내 기기에만 저장된다) */
  setAsleep: (teamId: string, asleep: boolean) => Promise<AppState>
  /** 이 방 캐릭터를 화면에서 치우거나 다시 부른다 (앱을 껐다 켜면 전부 나온다) */
  setHidden: (teamId: string, hidden: boolean) => Promise<AppState>

  /** 그 팀의 특정 멤버 한 명만 콕 찌른다. 너무 자주 부르면 false 가 돌아온다. */
  tapMember: (teamId: string, memberId: string) => Promise<boolean>
}

/** 캐릭터 크기 조절 패널 */
export interface SizeApi {
  getScale: () => Promise<{
    scale: number
    teamName: string
    caption: string
    resetHint: string
  } | null>
  /** @param live 슬라이더를 아직 끄는 중인가 */
  setScale: (scale: number, live?: boolean) => void
  close: () => void
}

/** 절전 강도와 언어를 고르는 창 */
export interface SettingsApi {
  getState: () => Promise<AppState>
  onState: (handler: (state: AppState) => void) => void
  /** 알림 화면을 연다 (이미 열려 있으면 앞으로 가져온다) */
  openNotifications: () => void
  /**
   * 오프라인 화면의 "다시 해 보기". 서버에 닿는지만 확인하고 돌아온다 — 방 채널을
   * 다시 붙이는 일은 기다리지 않는다 (기획서 "인터넷이 없을 때").
   */
  retryConnection: () => Promise<AppState>
  setPower: (level: string) => Promise<AppState>
  setLanguage: (preference: string) => Promise<AppState>
}

/**
 * 내 소속이 바뀐 일이 쌓이는 알림 화면. 창은 하나뿐이라 팀 id 를 받지 않는다.
 *
 * `unreadBefore` 는 **이 창이 이번에 열릴 때 한 번만** 정해진다 — 창이 떠 있는 동안
 * 다시 부르지 않는다. 그래야 "안읽음 색" 이 보는 도중에 눈앞에서 사라지지 않는다
 * (기획서 "알림 화면" 의 "기준 시각은 창이 열릴 때만 갱신한다").
 */
export interface NotificationsApi {
  getState: () => Promise<AppState>
  onState: (handler: (state: AppState) => void) => void
  /** 이번에 창이 열리기 직전까지의 컷오프. 이보다 나중 줄이 안읽음이다. */
  getUnreadBefore: () => Promise<number>
}

declare global {
  interface Window {
    petApi: PetApi
    teamApi: TeamApi
    sizeApi: SizeApi
    settingsApi: SettingsApi
    notificationsApi: NotificationsApi
  }
}
