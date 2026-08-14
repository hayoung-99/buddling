/**
 * 테스트 설정을 따로 두는 이유.
 *
 * `vite.config.mts` 는 `root` 를 `src/renderer` 로 잡는다 — 창마다 HTML 진입점이 그
 * 아래에 있기 때문이다. 그런데 vitest 는 설정 파일이 따로 없으면 그 설정을 그대로
 * 물려받아서, `test/` 를 아예 못 보고 "테스트 파일이 없다" 로 끝난다.
 *
 * vitest 는 `vitest.config.*` 를 먼저 보므로 이 파일 하나로 갈린다.
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.{js,ts}'],
  },
})
