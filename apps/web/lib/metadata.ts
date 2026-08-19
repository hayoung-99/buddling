import type { Metadata } from 'next'
import type { Copy } from './copy'
import { LOCALE_PATHS, OG_IMAGE, SITE_URL, absolute } from './site'

/**
 * 나라말 한 벌에 딸린 `<head>` 를 만든다.
 *
 * 여기서 챙기는 것들은 눈으로 봐서는 틀린 줄 모르는 것뿐이다 — canonical 이 한 글자만
 * 달라도 검색엔진이 색인을 둘로 나눠 잡고, OG 그림이 없으면 링크를 공유했을 때
 * 미리보기가 통째로 안 뜬다. `scripts/check-site.js` 가 빌드한 결과에서 이걸 다시 본다.
 */
export function buildMetadata(copy: Copy): Metadata {
  const path = LOCALE_PATHS[copy.locale]
  const url = absolute(path)
  const image = {
    url: absolute(OG_IMAGE.path),
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    alt: copy.meta.imageAlt,
    type: 'image/png',
  }

  return {
    metadataBase: new URL(SITE_URL),
    title: copy.meta.title,
    description: copy.meta.description,

    alternates: {
      canonical: url,
      languages: {
        ko: absolute(LOCALE_PATHS.ko),
        en: absolute(LOCALE_PATHS.en),
        // 어느 말도 맞지 않는 사람에게 보여 줄 기본값
        'x-default': absolute(LOCALE_PATHS.ko),
      },
    },

    robots: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },

    openGraph: {
      type: 'website',
      siteName: 'tap-tap',
      locale: copy.locale === 'ko' ? 'ko_KR' : 'en_US',
      alternateLocale: copy.locale === 'ko' ? 'en_US' : 'ko_KR',
      url,
      title: copy.meta.title,
      description: copy.meta.ogDescription,
      images: [image],
    },

    // X 는 og 로 되돌아가지만, 슬랙·디스코드와 링크를 미리 읽는 AI 들은 twitter:* 를 먼저 본다.
    twitter: {
      card: 'summary_large_image',
      title: copy.meta.title,
      description: copy.meta.ogDescription,
      images: [{ url: image.url, alt: image.alt }],
    },

    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/assets/icon-32.png', type: 'image/png', sizes: '32x32' },
      ],
      apple: '/assets/icon-180.png',
    },
  }
}
