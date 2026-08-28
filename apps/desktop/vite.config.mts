/**
 * 렌더러 빌드.
 *
 * 창마다 HTML 이 따로라, 진입점을 하나하나 적어 준다. 출력은 입력이 `root` 아래
 * 어디에 있었는지를 그대로 따라가므로 `dist-renderer/pet/index.html` 처럼 지금과 같은
 * 모양으로 떨어진다.
 *
 * `base: './'` 가 중요하다. 배포본에서 창은 `file://` 로 열리는데, 기본값인 절대경로로
 * 자산을 가리키면 디스크 루트를 뒤지다 아무것도 못 찾는다. 개발 중에는 멀쩡해 보이고
 * 배포본에서만 빈 창이 뜨는 종류의 고장이라 여기서 못을 박아 둔다.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const renderer = (...parts: string[]) => path.resolve(here, 'src', 'renderer', ...parts)

export default defineConfig({
  root: renderer(),
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(here, 'dist-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        pet: renderer('pet', 'index.html'),
        team: renderer('team', 'index.html'),
        teamDetail: renderer('team', 'detail.html'),
        settings: renderer('settings', 'index.html'),
        notifications: renderer('notifications', 'index.html'),
        size: renderer('size', 'index.html'),

        // 배포본에는 들어가지 않지만(package.json 의 build.files 참고) 개발용 명령이
        // 이 산출물을 연다 — npm run preview · app-icon · site-images.
        preview: renderer('preview', 'index.html'),
        icon: renderer('icon', 'index.html'),
        siteAssets: renderer('site-assets', 'index.html'),
      },
    },
  },
})
