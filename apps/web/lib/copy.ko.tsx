import type { Copy } from './copy'

/** 한국어판. 문장은 예전 `site/index.html` 에서 그대로 옮겨 왔다. */
export const ko: Copy = {
  locale: 'ko',
  other: { href: '/en/', lang: 'en', short: 'EN', long: 'English' },

  skipToContent: '본문으로 건너뛰기',
  nav: { characters: '캐릭터', download: '받기', install: '처음 열 때', faq: '궁금한 것' },

  hero: {
    lead: '바탕화면 위에',
    emphasis: '작은 친구',
    tail: ' 한 마리',
    sub: '멤버들을 콕콕 찔러 보세요. 내 캐릭터를 누르면 상대 화면에서 춤을 춰요.',
    needsTwo: '한 명만 불러 오면 시작돼요. 혼자서는 찌를 상대가 없거든요.',
    download: '받기',
    allVersions: '모든 버전',
    warns: '처음 열 때 경고가 한 번 떠요.',
    warnsLink: '넘기는 법 보기',
    note: '무료 · 가입 없음 · macOS와 Windows',
    imageAlt: '바탕화면 위에 서 있는 흰 고양이 캐릭터',
  },

  shot: {
    headingTop: '받고 나면',
    headingBottom: '이 창이 열려요',
    body: '방을 만들면 여섯 글자 코드가 나와요. 멤버가 그 코드를 넣으면 시작이에요.',
    imageAlt: '방 목록이 열려 있는 Buddling 창. 나오리와 친구들 한 개에 멤버 한 명이 접속해 있다.',
  },

  characters: {
    label: '캐릭터',
    heading: '다섯 마리 중에 한 마리',
    sub: '방마다 한 마리씩 골라요. 다른 동물로 골라 두면 어느 방에서 온 신호인지 한눈에 보여요.',
    imageAlt: '해피 캣, 터비 독, 퍼지 판다, 덤 덕, 홉 버니 다섯 캐릭터가 나란히 서 있는 모습',
    facts: [
      {
        term: '클릭이 통과해요',
        detail: '캐릭터 옆 빈 자리를 누르면 바탕화면이 눌려요. 아이콘을 가리지 않아요.',
      },
      { term: '자리를 기억해요', detail: '끌어서 옮긴 자리도, 키운 크기도 다음에 그대로예요.' },
      { term: '조용해요', detail: '소리는 나지 않고, 메뉴 막대에서 한 번에 숨길 수 있어요.' },
    ],
  },

  download: {
    label: '받기',
    heading: '내 컴퓨터에 맞는 파일',
    latest: '최신',
    button: '받기',
    rows: [
      {
        asset: 'mac-arm64',
        label: 'macOS',
        name: 'macOS — 요즘 맥',
        meta: '2020년 후반 이후에 나온 맥이에요',
      },
      {
        asset: 'mac-x64',
        label: 'macOS',
        name: 'macOS — 그 이전 맥',
        meta: '2020년 중반 이전에 산 맥이에요',
      },
      {
        asset: 'windows',
        label: 'Windows',
        name: 'Windows',
        meta: '두 번 눌러서 설치하는 파일이에요',
      },
    ],
    hint: (
      <>
        어느 쪽인지 모르겠다면 왼쪽 위 사과 메뉴에서 <strong>이 Mac에 관하여</strong>를 열어
        보세요. &quot;칩&quot;이라고 적혀 있으면 위쪽, &quot;프로세서&quot;라고 적혀 있으면
        아래쪽이에요.
      </>
    ),
    pending: (
      <>
        아직 올라온 파일이 없어요. 준비되면 여기에 나타나요.{' '}
        <a href="https://github.com/hayoung-99/buddling/releases">릴리스 보러 가기</a>
      </>
    ),
  },

  install: {
    label: '처음 열 때',
    heading: '처음 한 번만',
    sub: '처음 열 때 컴퓨터가 한 번 확인해요. 아래대로 하면 다음부터는 그냥 열려요.',
    macos: {
      title: 'macOS',
      howToName: 'macOS에서 Buddling 처음 열기',
      steps: [
        ['받은 앱을 ', { strong: '응용 프로그램' }, ' 폴더로 옮겨요.'],
        ['두 번 눌러 열고, 경고가 뜨면 ', { strong: '완료' }, '를 눌러요.'],
        [
          { strong: '시스템 설정 → 개인 정보 보호 및 보안' },
          '을 열고, 아래쪽 ',
          { strong: '확인 없이 열기' },
          '를 눌러요.',
        ],
        ['한 번 더 ', { strong: '열기' }, '를 누르면 다음부터는 그냥 열려요.'],
      ],
    },
    windows: {
      title: 'Windows',
      howToName: 'Windows에서 Buddling 설치하기',
      steps: [
        ['받은 파일을 두 번 눌러요.'],
        ['파란 창이 뜨면 ', { strong: '추가 정보' }, '를 눌러요.'],
        ['아래에 나타나는 ', { strong: '실행' }, '을 누르면 설치가 이어져요.'],
      ],
      hint: '관리자 권한은 묻지 않아요.',
    },
  },

  faq: {
    label: '궁금한 것',
    heading: '궁금할 만한 것',
    items: [
      {
        id: 'faq-what',
        question: 'Buddling이 뭔가요?',
        answer:
          '바탕화면에 3D 동물 캐릭터를 띄워 두는 macOS·Windows 앱이에요. 내 캐릭터를 누르면 같은 방 사람들 화면에서 캐릭터가 춤을 춰요. 무료이고 가입도 없어요.',
      },
      {
        id: 'faq-teammates',
        question: '멤버도 받아야 하나요?',
        answer:
          '네. 서로의 바탕화면에 캐릭터가 있어야 신호가 오가요. 한 사람이 방을 만들면 여섯 글자 초대코드가 나오고, 나머지는 그 코드만 넣으면 돼요.',
      },
      {
        id: 'faq-free',
        question: '정말 무료인가요?',
        answer: '네. 광고도 유료 기능도 없어요. 이메일도 비밀번호도 받지 않고요.',
      },
      {
        id: 'faq-alone',
        question: '혼자 써도 되나요?',
        answer:
          '캐릭터는 방마다 한 마리씩 떠서 방은 하나 있어야 해요. 혼자 만든 방도 방이라 캐릭터는 그대로 살아요. 콕 찌를 상대가 아직 없을 뿐이에요. 방은 최대 3개, 한 방에 5명까지예요.',
      },
      {
        id: 'faq-work',
        question: '회사 컴퓨터에 깔아도 될까요?',
        answer:
          '오가는 건 누가 눌렀다는 신호와 이름뿐이에요. 화면에 뭐가 떠 있는지도, 파일도 밖으로 나가지 않아요. 설치할 때 관리자 권한도 묻지 않고요.',
      },
      {
        id: 'faq-first-open',
        question: '처음 열 때 창이 떠요. 안 열리면요?',
        answer:
          '처음 한 번만 그래요. 위의 순서대로 하면 다음부터는 그냥 열려요. 그래도 미덥지 않으면 만드는 코드를 전부 공개해 뒀으니 직접 읽어 보셔도 돼요.',
      },
    ],
  },

  footer: {
    tagline: 'Buddling · 무료로 쓰고 고칠 수 있어요',
    github: 'GitHub',
    releases: '릴리스',
  },

  downloadStrings: { pending: '곧 올라와요', heroFor: '{target}용 받기', copied: '복사됨' },

  app: {
    description:
      '바탕화면에 3D 동물 친구를 띄우고, 내 캐릭터를 누르면 멤버들 화면에서 캐릭터가 춤추는 데스크톱 앱이에요.',
    subCategory: '바탕화면 캐릭터 앱',
    featureList: [
      '바탕화면 위에 3D 동물 캐릭터가 떠 있어요',
      '내 캐릭터를 누르면 같은 방 사람들 화면에서 캐릭터가 춤을 춰요',
      '가입 없이 닉네임과 여섯 글자 코드로 방에 들어가요',
      '캐릭터 옆 빈 자리는 클릭이 그대로 바탕화면으로 통과해요',
      '끌어서 옮긴 자리와 키운 크기를 기억해요',
      '소리가 나지 않고, 메뉴 막대에서 한 번에 숨길 수 있어요',
      '한 사람이 최대 3개 방, 방 하나에 최대 5명',
      'macOS와 Windows에서 무료',
    ],
  },

  meta: {
    title: 'Buddling · 친구들과 함께 쓰는 무료 바탕화면 캐릭터 앱',
    description:
      '바탕화면에 3D 동물 친구를 띄우고, 내 캐릭터를 누르면 멤버들 화면에서 캐릭터가 춤을 춰요. macOS·Windows 무료. 가입 없이 닉네임과 여섯 글자 코드로 시작해요.',
    ogDescription:
      '내 캐릭터를 누르면 멤버들 화면에서 캐릭터가 춤을 춰요. 말을 걸지 않고도 나 여기 있어를 전하는 가장 가벼운 방법.',
    imageAlt: '크림색 배경 위에 선 고양이, 강아지, 판다, 오리, 토끼 캐릭터 다섯 마리',
  },
}
