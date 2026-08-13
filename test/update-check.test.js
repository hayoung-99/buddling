import { describe, it, expect, vi, afterEach } from 'vitest'
import { isNewer, startUpdateCheck } from '../src/main/update-check.js'

describe('isNewer', () => {
  it('뒷자리가 올라간 것도 새 버전으로 본다', () => {
    expect(isNewer('0.1.0', '0.1.1')).toBe(true)
    expect(isNewer('0.1.0', '0.2.0')).toBe(true)
    expect(isNewer('0.9.9', '1.0.0')).toBe(true)
  })

  it('같거나 낮은 버전은 알리지 않는다', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false)
    expect(isNewer('0.2.0', '0.1.9')).toBe(false)
    expect(isNewer('1.0.0', '0.9.9')).toBe(false)
  })

  it('태그의 v 접두사를 무시한다 — GitHub 태그는 v0.1.0 꼴이다', () => {
    expect(isNewer('0.1.0', 'v0.1.1')).toBe(true)
    expect(isNewer('v0.1.1', 'v0.1.1')).toBe(false)
  })

  it('자리 수가 모자라면 0으로 채운다', () => {
    expect(isNewer('1.0.0', '1.1')).toBe(true)
    expect(isNewer('1.1', '1.1.0')).toBe(false)
  })

  it('숫자를 10진수로 비교한다 — 문자열로 비교하면 9 > 10 이 된다', () => {
    expect(isNewer('0.9.0', '0.10.0')).toBe(true)
    expect(isNewer('0.10.0', '0.9.0')).toBe(false)
  })

  it('미리보기 꼬리표는 떼고 본다', () => {
    expect(isNewer('0.1.0', '0.2.0-beta.1')).toBe(true)
    expect(isNewer('0.2.0', '0.2.0-beta.1')).toBe(false)
  })

  it('읽을 수 없는 값이면 알리지 않는다 — 확실할 때만 띄운다', () => {
    for (const bad of [undefined, null, '', 'latest', '1.2.3.4', 'x.y.z', {}]) {
      expect(isNewer('0.1.0', bad)).toBe(false)
      expect(isNewer(bad, '9.9.9')).toBe(false)
    }
  })
})

describe('startUpdateCheck', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** 첫 확인이 끝날 때까지 타이머를 감고 기다린다 */
  async function runFirstCheck() {
    await vi.advanceTimersByTimeAsync(10000)
  }

  it('새 버전이면 딱 한 번 알린다', async () => {
    vi.useFakeTimers()
    const onUpdate = vi.fn()
    const watcher = startUpdateCheck({
      currentVersion: '0.1.0',
      onUpdate,
      fetchLatest: async () => 'v0.2.0',
    })

    await runFirstCheck()
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].version).toBe('0.2.0')

    // 다음 날 다시 확인해도 같은 버전이면 두 번 알리지 않는다
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)
    expect(onUpdate).toHaveBeenCalledTimes(1)

    watcher.stop()
  })

  it('같은 버전이면 아무 말도 하지 않는다', async () => {
    vi.useFakeTimers()
    const onUpdate = vi.fn()
    const watcher = startUpdateCheck({
      currentVersion: '0.2.0',
      onUpdate,
      fetchLatest: async () => 'v0.2.0',
    })

    await runFirstCheck()
    expect(onUpdate).not.toHaveBeenCalled()
    watcher.stop()
  })

  it('조회가 실패해도 조용히 넘어간다 — 알림 때문에 앱이 시끄러워지면 안 된다', async () => {
    vi.useFakeTimers()
    const onUpdate = vi.fn()
    const watcher = startUpdateCheck({
      currentVersion: '0.1.0',
      onUpdate,
      fetchLatest: async () => {
        throw new Error('네트워크 없음')
      },
    })

    await expect(runFirstCheck()).resolves.not.toThrow()
    expect(onUpdate).not.toHaveBeenCalled()
    watcher.stop()
  })

  it('멈춘 뒤에는 알리지 않는다', async () => {
    vi.useFakeTimers()
    const onUpdate = vi.fn()
    const watcher = startUpdateCheck({
      currentVersion: '0.1.0',
      onUpdate,
      fetchLatest: async () => 'v0.2.0',
    })

    watcher.stop()
    await runFirstCheck()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
