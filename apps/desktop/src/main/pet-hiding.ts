/**
 * 트레이 맨 아래 '모두' 항목의 얼굴을 정한다.
 *
 * **저장된 스위치를 읽지 않고 지금 보이는 캐릭터를 센다**(기획서 "숨기기는 한
 * 마리씩"). 그래서 한 마리씩 숨기다 마지막 한 마리가 숨는 순간 글자가 저절로
 * '모두 보이기' 로 바뀐다.
 */

/** 세는 데 필요한 것은 이것뿐이다 — 방 목록의 순서도 이름도 보지 않는다 */
export interface RoomVisibility {
  hidden: boolean
}

export interface AllToggle {
  /** 'hide' 면 '모두 숨기기', 'show' 면 '모두 보이기' */
  action: 'hide' | 'show'
  /** 방이 하나도 없으면 눌러도 할 일이 없다 */
  enabled: boolean
}

export function allToggle(rooms: readonly RoomVisibility[]): AllToggle {
  // 방이 없을 때 '모두 보이기' 로 떨어지면, 숨긴 것이 하나도 없는데 부르는 단추가
  // 놓이게 된다. 그래서 글자는 '모두 숨기기' 로 두고 누르지 못하게 한다.
  if (rooms.length === 0) return { action: 'hide', enabled: false }
  return { action: rooms.some((room) => !room.hidden) ? 'hide' : 'show', enabled: true }
}
