import { describe, it, expect } from 'vitest'
import {
  CHARACTERS,
  CHARACTER_KEYS,
  DEFAULT_CHARACTER_KEY,
  getCharacter,
  isCharacterKey,
  EAR,
  TAIL,
  SNOUT,
  ARM,
} from '../src/shared/characters'
import type { PaletteKey } from '../src/shared/characters'

describe('캐릭터 스펙', () => {
  it('컨셉아트의 5종이 모두 있다', () => {
    expect(CHARACTER_KEYS).toEqual(['cat', 'dog', 'panda', 'duck', 'bunny'])
  })

  it('기본 캐릭터는 실제로 존재하는 키다', () => {
    expect(CHARACTER_KEYS).toContain(DEFAULT_CHARACTER_KEY)
  })

  it.each(CHARACTERS)('$key 는 표시에 필요한 정보를 갖는다', (spec) => {
    expect(spec.name).toBeTruthy()
    expect(spec.cry).toBeTruthy()
    // 화면에 보여줄 이름은 나라말마다 다르므로 사전(i18n)에 있다.
    // (`CharacterSpec` 에 `label` 이 없어 타입도 막아 주지만, 데이터가 손으로 늘어나는
    //  자리라 실제 값도 확인해 둔다)
    expect('label' in spec).toBe(false)
  })

  it.each(CHARACTERS)('$key 의 팔레트에 필요한 색이 모두 있다', (spec) => {
    const slots: PaletteKey[] = ['body', 'belly', 'accent', 'snout', 'nose', 'eye', 'cheek', 'foot']
    for (const slot of slots) {
      expect(typeof spec.palette[slot], `${spec.key}.${slot}`).toBe('number')
    }
  })

  it.each(CHARACTERS)('$key 의 build 값이 유효한 범위 안에 있다', (spec) => {
    const { build } = spec
    expect(build.bodyRadius).toBeGreaterThan(0)
    expect(build.headRadius).toBeGreaterThan(0)
    expect(build.bodyShape).toHaveLength(3)
    expect(build.legLength).toBeGreaterThanOrEqual(0)
    expect(Object.values(EAR)).toContain(build.ears.type)
    expect(Object.values(TAIL)).toContain(build.tail.type)
    expect(Object.values(SNOUT)).toContain(build.snout.type)
    expect(Object.values(ARM)).toContain(build.arms.type)
    expect(Array.isArray(build.patches)).toBe(true)
  })

  it('알 수 없는 키를 주면 기본 캐릭터로 되돌린다', () => {
    expect(getCharacter('dragon').key).toBe(CHARACTERS[0].key)
    expect(getCharacter(undefined).key).toBe(CHARACTERS[0].key)
    expect(getCharacter('duck').key).toBe('duck')
  })

  it('isCharacterKey 로 저장된 값을 검증할 수 있다', () => {
    expect(isCharacterKey('bunny')).toBe(true)
    expect(isCharacterKey('dragon')).toBe(false)
  })
})
