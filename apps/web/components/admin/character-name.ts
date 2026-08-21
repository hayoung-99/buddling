import ko from '@doran-doran/shared/i18n/ko.json'

/**
 * 캐릭터 이름은 앱이 쓰는 사전에서 그대로 가져온다.
 *
 * `cat`·`panda` 같은 열쇠를 그대로 보여 주면 앱 화면과 다른 말이 되어, 어느 캐릭터
 * 이야기인지 한 번 더 옮겨 생각해야 한다. 사전에 없는 열쇠가 오면 열쇠를 그대로 쓴다 —
 * 캐릭터가 늘었는데 어드민만 안 고친 경우가 그렇고, 그때 빈칸이 되는 것보다 낫다.
 *
 * 숫자판과 방 목록이 함께 쓴다. 한쪽에 복사해 두면 캐릭터가 늘었을 때 한쪽만 고쳐진
 * 채로 갈린다 — 이 저장소가 네 언어 사전을 한 곳에서 보는 것과 같은 이유다.
 */
export const characterName = (key: string) =>
  (ko as Record<string, string>)[`character.${key}`] ?? key
