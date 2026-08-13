import { describe, it, expect, vi } from 'vitest'
import { isNewer, startUpdateCheck } from '../src/main/update-check.js'
import { canAutoInstall } from '../src/main/updates.js'

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
  /**
   * 언제 볼지는 `update-schedule.js` 가 정한다. 여기서는 그 자리에
   * "부르면 본다"는 손잡이를 끼워 넣고 우리가 직접 당긴다.
   */
  function harness({ currentVersion = '0.1.0', fetchLatest, immediate = false }) {
    const onUpdate = vi.fn()
    let due = null

    const watcher = startUpdateCheck({
      currentVersion,
      onUpdate,
      immediate,
      fetchLatest,
      schedule: (check) => {
        due = check
        return { stop: () => {} }
      },
    })

    return { onUpdate, watcher, morning: () => due() }
  }

  /** check() 안의 await 들이 끝나기를 기다린다 */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('새 버전이면 딱 한 번 알린다', async () => {
    const h = harness({ fetchLatest: async () => 'v0.2.0' })

    h.morning()
    await settle()

    expect(h.onUpdate).toHaveBeenCalledTimes(1)
    expect(h.onUpdate.mock.calls[0][0].version).toBe('0.2.0')
    // 이 길은 받아 두지 않는다. 화면이 "받으러 가기"를 보여줘야 한다는 뜻이다.
    expect(h.onUpdate.mock.calls[0][0].ready).toBe(false)
    expect(h.onUpdate.mock.calls[0][0].url).toMatch(/^https:\/\/github\.com\//)

    // 다음 날 아침에 또 봐도 같은 버전이면 두 번 알리지 않는다
    h.morning()
    await settle()
    expect(h.onUpdate).toHaveBeenCalledTimes(1)

    h.watcher.stop()
  })

  it('일정이 부르기 전에는 아무것도 하지 않는다', async () => {
    const fetchLatest = vi.fn(async () => 'v0.2.0')
    const h = harness({ fetchLatest })

    await settle()
    expect(fetchLatest).not.toHaveBeenCalled()
    h.watcher.stop()
  })

  it('immediate 면 일정을 기다리지 않고 바로 본다 (자동 설치가 실패해 갈아탄 경우)', async () => {
    const h = harness({ fetchLatest: async () => 'v0.2.0', immediate: true })

    await settle()
    expect(h.onUpdate).toHaveBeenCalledTimes(1)
    h.watcher.stop()
  })

  it('같은 버전이면 아무 말도 하지 않는다', async () => {
    const h = harness({ currentVersion: '0.2.0', fetchLatest: async () => 'v0.2.0' })

    h.morning()
    await settle()
    expect(h.onUpdate).not.toHaveBeenCalled()
    h.watcher.stop()
  })

  it('조회가 실패해도 조용히 넘어간다 — 알림 때문에 앱이 시끄러워지면 안 된다', async () => {
    const h = harness({
      fetchLatest: async () => {
        throw new Error('네트워크 없음')
      },
    })

    expect(() => h.morning()).not.toThrow()
    await settle()
    expect(h.onUpdate).not.toHaveBeenCalled()
    h.watcher.stop()
  })

  it('멈춘 뒤에는 알리지 않는다', async () => {
    const h = harness({ fetchLatest: async () => 'v0.2.0' })

    h.watcher.stop()
    h.morning()
    await settle()
    expect(h.onUpdate).not.toHaveBeenCalled()
  })
})

describe('canAutoInstall', () => {
  it('Windows 에서만 받아서 설치까지 한다', () => {
    expect(canAutoInstall('win32')).toBe(true)
  })

  it('macOS 에서는 시도하지 않는다 — 코드 서명 없이는 반드시 실패한다', () => {
    // Squirrel.Mac 이 실행 중인 앱의 서명과 새 앱의 서명을 대조한다.
    // 되는 척하다 실패하는 것이 조용히 알리기만 하는 것보다 나쁘다.
    expect(canAutoInstall('darwin')).toBe(false)
  })

  it('모르는 플랫폼이면 알림만 한다', () => {
    for (const platform of ['linux', 'freebsd', '', undefined]) {
      expect(canAutoInstall(platform)).toBe(false)
    }
  })
})
