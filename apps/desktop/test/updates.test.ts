import { describe, it, expect, vi } from 'vitest'
import { canAutoInstall } from '../src/main/updates'
import { canReplaceAppImage } from '../src/main/appimage'
import type { AppImageEnvironment } from '../src/main/appimage'

describe('canAutoInstall', () => {
  it('Windows 는 언제나 된다 — 판정 함수를 부르지 않는다', () => {
    const canReplaceHere = vi.fn()
    expect(canAutoInstall('win32', canReplaceHere)).toBe(true)
    expect(canReplaceHere).not.toHaveBeenCalled()
  })

  it('macOS 는 코드 서명이 없어 시도조차 하지 않는다 — 판정 함수를 부르지 않는다', () => {
    // Squirrel.Mac 이 실행 중인 앱의 서명과 새 앱의 서명을 대조한다.
    // 되는 척하다 실패하는 것이 조용히 알리기만 하는 것보다 나쁘다.
    const canReplaceHere = vi.fn()
    expect(canAutoInstall('darwin', canReplaceHere)).toBe(false)
    expect(canReplaceHere).not.toHaveBeenCalled()
  })

  it('Linux 는 판정 함수의 결과를 그대로 따른다', () => {
    expect(canAutoInstall('linux', () => true)).toBe(true)
    expect(canAutoInstall('linux', () => false)).toBe(false)
  })
})

describe('canReplaceAppImage', () => {
  /** `canWriteDir` 이 무엇으로 불렸는지도 함께 보고 싶을 때 쓴다. */
  function harness(overrides: Partial<AppImageEnvironment> & { canWrite?: boolean } = {}) {
    const { canWrite = true, ...rest } = overrides
    const canWriteDir = vi.fn(() => canWrite)
    const env: AppImageEnvironment = { canWriteDir, ...rest }
    return { env, canWriteDir }
  }

  it('AppImage 로 떠 있고 그 폴더에 쓸 수 있으면 된다', () => {
    const { env } = harness({
      appImagePath: '/home/me/Apps/buddling-1.0.0-x86_64.AppImage',
    })
    expect(canReplaceAppImage(env)).toBe(true)
  })

  it('압축을 풀어 AppRun 을 직접 실행했으면 안 된다 — APPIMAGE 가 없다', () => {
    const { env } = harness({ appImagePath: undefined })
    expect(canReplaceAppImage(env)).toBe(false)
  })

  it('빈 문자열도 없는 것으로 본다', () => {
    const { env } = harness({ appImagePath: '' })
    expect(canReplaceAppImage(env)).toBe(false)
  })

  it('snap 이면 안 된다 — 스토어가 갱신을 맡는다', () => {
    const { env } = harness({
      appImagePath: '/home/me/Apps/buddling-1.0.0-x86_64.AppImage',
      snapPath: '/snap/buddling/current',
    })
    expect(canReplaceAppImage(env)).toBe(false)
  })

  it('상대경로면 안 된다 — doInstall() 도 이 검사를 한다', () => {
    const { env } = harness({ appImagePath: 'buddling.AppImage' })
    expect(canReplaceAppImage(env)).toBe(false)
  })

  it('NUL 이 낀 경로면 안 된다 — doInstall() 도 이 검사를 한다', () => {
    const { env } = harness({ appImagePath: '/home/me/bud\0dling.AppImage' })
    expect(canReplaceAppImage(env)).toBe(false)
  })

  it('폴더에 쓸 수 없으면 안 된다 — 예: /opt 에 root 소유로 놓인 경우', () => {
    const { env } = harness({ appImagePath: '/opt/buddling.AppImage', canWrite: false })
    expect(canReplaceAppImage(env)).toBe(false)
  })

  it('판정할 때 파일 경로가 아니라 담긴 폴더로 canWriteDir 를 부른다', () => {
    const { env, canWriteDir } = harness({
      appImagePath: '/home/me/Apps/buddling-1.0.0-x86_64.AppImage',
    })
    canReplaceAppImage(env)
    // unlink·mv 는 대상 파일이 아니라 디렉터리에 쓰기 권한을 요구한다 (1.2).
    // 여기가 파일 경로로 바뀌면 이 검사가 깨진다.
    expect(canWriteDir).toHaveBeenCalledWith('/home/me/Apps')
  })
})
