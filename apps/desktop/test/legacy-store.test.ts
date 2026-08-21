import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { legacyStorePath } from '../src/main/legacy-store'

/**
 * 이름을 바꾸기 전 저장 파일을 찾아오는 자리.
 *
 * 이게 틀리면 이미 쓰던 사람이 세션을 잃고 방과 남남이 되는데, 그건 앱을 실제로
 * 배포해 봐야 드러난다. 그래서 자리를 정하는 계산만 따로 떼어 여기서 확인한다.
 */
describe('legacyStorePath', () => {
  it('옛 앱 이름으로 된 폴더의 JSON 을 가리킨다', () => {
    expect(legacyStorePath('/Users/x/Library/Application Support')).toBe(
      path.join('/Users/x/Library/Application Support', 'tap-tap', 'tap-tap.json'),
    )
  })

  it('개발용 프로필로 띄웠으면 옮겨 올 것이 없다', () => {
    expect(legacyStorePath('/Users/x/Library/Application Support', 'second')).toBeNull()
    expect(legacyStorePath('/Users/x/Library/Application Support', 'shot')).toBeNull()
  })

  it('프로필이 비어 있는 것은 프로필이 없는 것으로 본다', () => {
    expect(legacyStorePath('/tmp/appdata', '')).not.toBeNull()
    expect(legacyStorePath('/tmp/appdata', null)).not.toBeNull()
    expect(legacyStorePath('/tmp/appdata', undefined)).not.toBeNull()
  })

  it('자리를 모르면 찾지 않는다', () => {
    expect(legacyStorePath('')).toBeNull()
  })
})
