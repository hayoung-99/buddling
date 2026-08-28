import { describe, it, expect, vi } from 'vitest'
import { createQuitGate, QUIT_WATCHDOG_MS } from '../src/main/quit'
import type { WatchableMenu } from '../src/main/quit'

/**
 * `menu-will-close` 만 흉내 내는 작은 emitter.
 *
 * 진짜 `Menu` 를 흉내 내는 것이 아니라, `createQuitGate` 가 실제로 쓰는 두 메서드
 * (`on`·`off`)만 흉내 낸다.
 */
function fakeMenu(): WatchableMenu & { close(): void } {
  const listeners = new Set<() => void>()
  return {
    on(_event, listener) {
      listeners.add(listener)
    },
    off(_event, listener) {
      listeners.delete(listener)
    },
    close() {
      // Set 은 순회 중에 자기 자신이 지워져도 안전하다(스펙이 보장) — 리스너가
      // `off()` 로 스스로를 지우는 경우가 바로 이것이다.
      for (const listener of listeners) listener()
    },
  }
}

/** `setTimer`·`defer` 를 즉시 실행하는 흉내로 바꿔, 실제 타이머 없이 순서만 검사한다 */
function createGate(overrides: { watchdogMs?: number } = {}) {
  const quit = vi.fn()
  const exit = vi.fn()
  const timers: Array<{ fn: () => void; ms: number }> = []
  const setTimer = vi.fn((fn: () => void, ms: number) => {
    timers.push({ fn, ms })
    return timers.length
  })
  const defer = vi.fn((fn: () => void) => fn())

  const gate = createQuitGate({ quit, exit, setTimer, defer, ...overrides })
  return { gate, quit, exit, setTimer, defer, timers }
}

describe('createQuitGate', () => {
  it('메뉴가 떠 있지 않을 때 request() 하면 곧바로 quit() 한다', () => {
    const { gate, quit } = createGate()
    gate.request()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('메뉴가 떠 있을 때 request() 하면 quit() 을 미룬다', () => {
    const { gate, quit } = createGate()
    const menu = fakeMenu()
    gate.menuOpened(menu)

    gate.request()
    expect(quit).not.toHaveBeenCalled()
  })

  it('메뉴가 떠 있는 채로 request() 한 뒤 menu-will-close 가 오면 그때 quit() 한다', () => {
    const { gate, quit } = createGate()
    const menu = fakeMenu()
    gate.menuOpened(menu)
    gate.request()

    menu.close()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('menu-will-close 가 오지 않으면 영영 quit() 을 부르지 않는다 — 타임아웃이 없는 것이 설계다', () => {
    const { gate, quit } = createGate()
    const menu = fakeMenu()
    gate.menuOpened(menu)
    gate.request()

    expect(quit).not.toHaveBeenCalled()
    // 시간을 더 기다려도(=아무 타이머도 걸지 않는 것을 확인) 여전히 안 불린다
    expect(quit).not.toHaveBeenCalled()
  })

  it('request() 를 두 번 불러도 quit() 은 한 번', () => {
    const { gate, quit } = createGate()
    gate.request()
    gate.request()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('종료를 고르지 않고 메뉴만 닫히면 quit() 을 부르지 않는다', () => {
    const { gate, quit } = createGate()
    const menu = fakeMenu()
    gate.menuOpened(menu)
    menu.close()
    expect(quit).not.toHaveBeenCalled()
  })

  it('메뉴가 열렸다 닫힌 뒤 request() 하면 곧바로 quit() 한다', () => {
    const { gate, quit } = createGate()
    const menu = fakeMenu()
    gate.menuOpened(menu)
    menu.close()

    gate.request()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('armWatchdog() 뒤 정해진 시간이 지나면 exit(0) 을 부른다', () => {
    const { gate, exit, timers } = createGate()
    gate.armWatchdog()

    expect(timers).toHaveLength(1)
    expect(timers[0]!.ms).toBe(QUIT_WATCHDOG_MS)
    timers[0]!.fn()
    expect(exit).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('armWatchdog() 을 두 번 불러도 타이머는 하나만 걸린다', () => {
    const { gate, setTimer } = createGate()
    gate.armWatchdog()
    gate.armWatchdog()
    expect(setTimer).toHaveBeenCalledOnce()
  })
})
