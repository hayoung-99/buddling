/**
 * preload 빌드. 렌더러와 따로 도는 이유가 있다.
 *
 * 창들이 `sandbox` 를 끄지 않으므로 preload 는 **CommonJS 여야 한다.** Electron 문서가
 * 못을 박아 두었다 — "Sandboxed preload scripts are run as plain JavaScript without an
 * ESM context." ESM 으로 내보내면 preload 가 통째로 뜨지 않고, 그러면 `window.teamApi`
 * 가 없어 화면이 빈 채로 뜬다. 오류도 눈에 잘 안 띄는 자리에만 남는다.
 *
 * `electron` 은 번들에 넣지 않고 실행할 때 얻는다.
 */

import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const preload = (name: string) => path.resolve(here, 'src', 'preload', `${name}.ts`)

export default defineConfig({
  build: {
    outDir: path.resolve(here, 'dist-preload'),
    emptyOutDir: true,
    // 읽을 일이 생겼을 때 그대로 읽히는 편이 낫다. 크기가 문제 될 양이 아니다.
    minify: false,
    lib: {
      entry: {
        pet: preload('pet'),
        team: preload('team'),
        size: preload('size'),
        settings: preload('settings'),
      },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.cjs`,
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
})
