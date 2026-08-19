/**
 * 메인 프로세스 빌드. preload 와 마찬가지로 CommonJS 로 떨어뜨린다.
 *
 * Electron 이 여는 것은 `dist-main/main/main.cjs` 다 (package.json 의 `main`).
 * 소스를 그대로 싣던 때와 달리 이제 빌드해야 앱이 뜬다 — `npm start` 가 알아서 먼저 한다.
 *
 * **파일 하나가 파일 하나로 떨어져야 한다.** 한 덩어리로 묶지 않는 이유는 두 가지다.
 *
 *  1) `__dirname` 이 살아 있어야 한다. `config.ts` · `windows.ts` · `tray.ts` 는
 *     `path.join(__dirname, '..', '..')` 로 저장소 루트(배포본에서는 asar 루트)를 찾는다.
 *     `dist-main/main/` 은 `src/main/` 과 깊이가 같으므로 그 계산이 그대로 성립한다.
 *     한 파일로 묶어 `dist-main/main.cjs` 로 떨어뜨리면 깊이가 하나 줄어 **배포본에서만**
 *     자산을 못 찾는다.
 *  2) 오류 스택이 소스와 같은 이름으로 남아, 무엇이 터졌는지 바로 읽힌다.
 *
 * 그래서 소스 폴더를 훑어 파일마다 진입점을 만든다. 파일을 새로 만들어도 여기를 고칠
 * 일이 없다 — 손으로 적어 두면 언젠가 하나를 빠뜨리고, 그러면 그 파일만 조용히
 * 빠진 채로 빌드된다.
 */

import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

/** `src/main` · `src/services` 의 .ts 를 전부 진입점으로 만든다 (`main/store` → `dist-main/main/store.cjs`) */
function entries(...folders: string[]) {
  const found: Record<string, string> = {}
  for (const folder of folders) {
    const dir = path.resolve(here, 'src', folder)
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue
      found[`${folder}/${path.basename(file, '.ts')}`] = path.join(dir, file)
    }
  }
  return found
}

// 번들에 넣지 않고 실행할 때 얻는 것들. Electron 과 Node 내장은 당연하고,
// `dependencies` 넷은 asar 안의 node_modules 에서 그대로 읽힌다.
const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  '@supabase/supabase-js',
  'dotenv',
  'electron-updater',
  'ws',
]

export default defineConfig({
  build: {
    outDir: path.resolve(here, 'dist-main'),
    emptyOutDir: true,
    // 읽을 일이 생겼을 때 그대로 읽히는 편이 낫다. 크기가 문제 될 양이 아니다.
    minify: false,
    target: 'node22',
    lib: {
      entry: entries('main', 'services'),
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.cjs`,
    },
    rollupOptions: {
      external,
      output: {
        // 여러 파일이 함께 쓰는 것은 공용 덩어리로 빠진다 (사전 JSON 처럼).
        // 확장자를 맞춰 두지 않으면 `.js` 로 떨어지는데, 이 저장소는 `type: module` 이
        // 아니라 그래도 CommonJS 로 읽히기는 한다. 그래도 한 폴더 안에서 확장자가
        // 갈리면 나중에 읽는 사람이 헷갈린다.
        chunkFileNames: '[name].cjs',
      },
    },
  },
})
