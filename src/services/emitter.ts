/**
 * 아주 작은 이벤트 방출기. Net 구현들과 세션이 함께 쓴다.
 *
 * **`net.ts` 안에 두지 않고 따로 뺐다.** 구현(`fake-net`·`supabase-net`)이 이걸 가져다
 * 쓰고 `net.ts` 는 다시 그 구현들을 가져다 쓰므로, 한 파일에 두면 서로를 부르는 고리가
 * 생긴다. CommonJS 시절에는 `createNet` 안에서 늦게 `require` 해 고리를 피했지만,
 * 정적 import 로 옮긴 지금은 고리를 아예 만들지 않는 편이 낫다.
 *
 * 어떤 이벤트에 무엇이 실려 오는지는 쓰는 쪽이 정한다 (`Emitter<NetEvents>` 처럼).
 * 그래야 `on('presnce', …)` 같은 오타가 컴파일 때 걸린다.
 */

/** 이벤트 이름 → 그 이벤트에 실려 오는 것 */
export type EventMap = Record<string, unknown>

export interface Emitter<E extends EventMap> {
  /** @returns 다시 부르면 이 handler 만 떼어낸다 */
  on<K extends keyof E & string>(event: K, handler: (payload: E[K]) => void): () => void
  emit<K extends keyof E & string>(event: K, payload: E[K]): void
  clear(): void
}

export function createEmitter<E extends EventMap>(): Emitter<E> {
  const handlers = new Map<string, Set<(payload: never) => void>>()

  return {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler as (payload: never) => void)
      return () => handlers.get(event)?.delete(handler as (payload: never) => void)
    },

    emit(event, payload) {
      for (const handler of handlers.get(event) ?? []) {
        try {
          // 하나가 터져도 나머지는 받아야 한다 — 한 창의 실수로 다른 창이 소식을 잃지 않게.
          ;(handler as (payload: unknown) => void)(payload)
        } catch (error) {
          console.error(`[net] ${event} 처리 중 오류`, error)
        }
      }
    },

    clear() {
      handlers.clear()
    },
  }
}
