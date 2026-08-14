import { describe, it, expect, vi } from 'vitest'
import { releaseUnclosableWindows } from '../src/main/quit.js'

/**
 * 캐릭터 창 흉내.
 *
 * 진짜 창에서 중요한 것은 `closable: false` 때문에 close() 가 듣지 않는다는 점이고,
 * 그래서 이 코드가 부르는 것은 반드시 destroy() 여야 한다. close() 를 부르면 실제
 * 앱에서는 아무 일도 일어나지 않고 종료가 취소된다.
 */
function fakePet({ destroyed = false } = {}) {
  const window = {
    destroyed,
    isDestroyed: () => window.destroyed,
    destroy: vi.fn(() => {
      window.destroyed = true
    }),
    close: vi.fn(),
  }
  return { window, pointer: {} }
}

describe('releaseUnclosableWindows', () => {
  it('캐릭터 창을 destroy 로 없앤다 — close 는 closable:false 에 막혀 듣지 않는다', () => {
    const pets = new Map([
      ['team-1', fakePet()],
      ['team-2', fakePet()],
    ])

    expect(releaseUnclosableWindows(pets.values())).toBe(2)

    for (const { window } of pets.values()) {
      expect(window.destroy).toHaveBeenCalledOnce()
      expect(window.close).not.toHaveBeenCalled()
      expect(window.isDestroyed()).toBe(true)
    }
  })

  it('이미 사라진 창은 건드리지 않는다 — 종료 중에 두 번 불릴 수 있다', () => {
    const pets = new Map([
      ['team-1', fakePet({ destroyed: true })],
      ['team-2', fakePet()],
    ])

    expect(releaseUnclosableWindows(pets.values())).toBe(1)
    expect(pets.get('team-1').window.destroy).not.toHaveBeenCalled()
    expect(pets.get('team-2').window.destroy).toHaveBeenCalledOnce()

    // 한 번 더 불러도 조용하다 (종료를 두 번 눌렀을 때)
    expect(releaseUnclosableWindows(pets.values())).toBe(0)
  })

  it('팀이 하나도 없으면 아무 일도 하지 않는다', () => {
    expect(releaseUnclosableWindows(new Map().values())).toBe(0)
  })
})
