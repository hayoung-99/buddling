import { stepText } from './copy'
import type { Copy } from './copy'
import {
  APP_VERSION,
  AUTHOR,
  LICENSE_URL,
  LOCALE_PATHS,
  MODIFIED,
  OG_IMAGE,
  PUBLISHED,
  RELEASES_LATEST,
  REPO_URL,
  SITE_URL,
  absolute,
} from './site'

/**
 * 검색엔진과 답변형 AI 가 읽는 구조화 데이터.
 *
 * **사전에서 만들어 낸다.** 예전에는 같은 문장이 두 벌 있었다 — 화면의 HTML 과
 * JSON-LD 에. 그래서 FAQ 답을 하나 고치면 구조화 데이터 쪽이 남몰래 낡았고,
 * JSON-LD 는 쉼표 하나만 틀려도 통째로 무시되는데 화면에는 아무 표시도 나지 않아
 * 검색 결과가 초라해진 뒤에야 알게 된다.
 *
 * 이제 질문·답·설치 단계는 `copy.*.tsx` 한 곳에서 나오므로 어긋날 수가 없다.
 */
export function buildJsonLd(copy: Copy) {
  const path = LOCALE_PATHS[copy.locale]
  const page = absolute(path)
  const id = (fragment: string) => `${SITE_URL}/#${fragment}`

  const howTo = (
    key: 'macos' | 'windows',
    guide: { howToName: string; steps: Copy['install']['macos']['steps'] },
  ) => ({
    '@type': 'HowTo',
    '@id': id(`howto-${key}`),
    name: guide.howToName,
    description: copy.install.sub,
    totalTime: 'PT1M',
    step: guide.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: stepText(step),
      url: `${page}#guide-${key}`,
    })),
  })

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': id('website'),
        url: `${SITE_URL}/`,
        name: 'tap-tap',
        inLanguage: ['ko', 'en'],
        publisher: { '@id': id('author') },
      },
      {
        '@type': 'Person',
        '@id': id('author'),
        name: AUTHOR.name,
        url: AUTHOR.url,
        sameAs: [AUTHOR.url],
      },
      {
        '@type': 'ImageObject',
        '@id': id('og-image'),
        url: absolute(OG_IMAGE.path),
        contentUrl: absolute(OG_IMAGE.path),
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
        caption: copy.meta.imageAlt,
      },
      {
        '@type': ['WebPage', 'FAQPage'],
        '@id': id('webpage'),
        url: page,
        name: copy.meta.title,
        description: copy.meta.description,
        inLanguage: copy.locale,
        isPartOf: { '@id': id('website') },
        about: { '@id': id('app') },
        primaryImageOfPage: { '@id': id('og-image') },
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        hasPart: [{ '@id': id('howto-macos') }, { '@id': id('howto-windows') }],
        // 화면의 질문과 같은 곳에서 나온다 — 두 벌로 갈릴 수 없다
        mainEntity: copy.faq.items.map((item) => ({
          '@type': 'Question',
          '@id': id(item.id),
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'SoftwareApplication',
        '@id': id('app'),
        name: 'tap-tap',
        description: copy.app.description,
        url: `${SITE_URL}/`,
        image: { '@id': id('og-image') },
        screenshot: [
          absolute('/assets/team-window.webp'),
          absolute('/assets/characters.webp'),
        ],
        applicationCategory: 'CommunicationApplication',
        applicationSubCategory: copy.app.subCategory,
        operatingSystem: 'macOS, Windows',
        downloadUrl: RELEASES_LATEST,
        installUrl: `${page}#download`,
        softwareVersion: APP_VERSION,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        // 앱은 네 나라 말을 지원한다 (랜딩은 둘)
        inLanguage: ['ko', 'en', 'ja', 'zh'],
        isAccessibleForFree: true,
        license: LICENSE_URL,
        author: { '@id': id('author') },
        publisher: { '@id': id('author') },
        sameAs: [REPO_URL],
        mainEntityOfPage: { '@id': id('webpage') },
        softwareHelp: [{ '@id': id('howto-macos') }, { '@id': id('howto-windows') }],
        featureList: copy.app.featureList,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: copy.locale === 'ko' ? 'KRW' : 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
      howTo('macos', copy.install.macos),
      howTo('windows', copy.install.windows),
    ],
  }
}
