import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomically } from '../src/main/write-json.js'

let dir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taptap-write-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

describe('writeJsonAtomically', () => {
  it('적고 나면 읽을 수 있다', () => {
    const file = path.join(dir, 'settings.json')

    expect(writeJsonAtomically(file, { nickname: '나영', teams: 2 })).toEqual({ ok: true })
    expect(read(file)).toEqual({ nickname: '나영', teams: 2 })
  })

  it('임시 파일을 남기지 않는다', () => {
    const file = path.join(dir, 'settings.json')
    writeJsonAtomically(file, { a: 1 })

    expect(fs.readdirSync(dir)).toEqual(['settings.json'])
  })

  it('여러 번 적으면 마지막 것이 남는다', () => {
    const file = path.join(dir, 'settings.json')
    writeJsonAtomically(file, { count: 1 })
    writeJsonAtomically(file, { count: 2 })

    expect(read(file)).toEqual({ count: 2 })
  })

  it('폴더가 없으면 만들어서 적는다', () => {
    // 외장 디스크를 뽑았거나, 정리 스크립트가 지웠거나, 프로필 폴더를 통째로 날린 경우
    const file = path.join(dir, 'sub', 'deeper', 'settings.json')

    expect(writeJsonAtomically(file, { a: 1 })).toEqual({ ok: true })
    expect(read(file)).toEqual({ a: 1 })
  })

  it('폴더가 앱이 도는 중에 사라져도 다시 만들어 적는다', () => {
    const nested = path.join(dir, 'profile')
    const file = path.join(nested, 'settings.json')
    writeJsonAtomically(file, { a: 1 })

    fs.rmSync(nested, { recursive: true, force: true })

    expect(writeJsonAtomically(file, { a: 2 })).toEqual({ ok: true })
    expect(read(file)).toEqual({ a: 2 })
  })

  it('적을 수 없으면 던지지 않고 실패를 돌려준다', () => {
    // 파일이 있어야 할 자리에 폴더가 있으면 쓸 수 없다
    const file = path.join(dir, 'settings.json')
    fs.mkdirSync(file)

    const result = writeJsonAtomically(file, { a: 1 })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
  })

  it('실패해도 예외가 새어 나가지 않는다 — 타이머 안에서 불리므로 아무도 잡지 못한다', () => {
    const file = path.join(dir, 'settings.json')
    fs.mkdirSync(file)

    expect(() => writeJsonAtomically(file, { a: 1 })).not.toThrow()
  })

  it('실패해도 먼저 있던 파일을 깨뜨리지 않는다', () => {
    const file = path.join(dir, 'settings.json')
    writeJsonAtomically(file, { keep: 'me' })

    // JSON 으로 만들 수 없는 값 (순환 참조) → 임시 파일 단계에서 실패한다
    const circular = {}
    circular.self = circular
    const result = writeJsonAtomically(file, circular)

    expect(result.ok).toBe(false)
    expect(read(file)).toEqual({ keep: 'me' })
  })
})
