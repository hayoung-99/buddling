import type { MetadataRoute } from 'next'
import { LOCALE_PATHS, MODIFIED, absolute } from '../lib/site'

/**
 * 주소가 되풀이되는 곳이라 손으로 적지 않고 만들어 낸다.
 *
 * 예전 `sitemap.xml` 은 두 페이지 각각에 hreflang 세 줄을 다시 적어 여덟 곳에 같은
 * 주소가 있었다. 도메인을 바꿀 때 한 곳만 빠뜨려도 색인이 갈라지는데, 그걸
 * `scripts/check-site.js` 가 뒤늦게 잡아 주고 있었다. 이제 `lib/site.ts` 한 곳에서 나온다.
 *
 * `robots.txt` 와 `llms.txt` 는 반대로 `public/` 에 그대로 둔다 — 손으로 쓴 설명이
 * 값을 하는 파일이고, 만들어 내면 그 주석이 사라진다.
 */
const languages = {
  ko: absolute(LOCALE_PATHS.ko),
  en: absolute(LOCALE_PATHS.en),
  'x-default': absolute(LOCALE_PATHS.ko),
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absolute(LOCALE_PATHS.ko),
      lastModified: MODIFIED,
      changeFrequency: 'monthly',
      priority: 1,
      alternates: { languages },
    },
    {
      url: absolute(LOCALE_PATHS.en),
      lastModified: MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: { languages },
    },
  ]
}
