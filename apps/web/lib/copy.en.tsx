import type { Copy } from './copy'

/** 영어판. 문장은 예전 `site/en/index.html` 에서 그대로 옮겨 왔다. */
export const en: Copy = {
  locale: 'en',
  other: { href: '/', lang: 'ko', short: '한국어', long: '한국어' },

  skipToContent: 'Skip to content',
  nav: { characters: 'Characters', download: 'Download', install: 'First launch', faq: 'Questions' },

  hero: {
    lead: 'A',
    emphasis: 'small friend',
    tail: ' on your desktop',
    sub: 'Give your teammates a poke. Tap your character and theirs dances on their screen.',
    needsTwo: 'It takes two — invite one friend and you are set.',
    download: 'Download',
    allVersions: 'All versions',
    warns: 'Your Mac will warn you once, the first time.',
    warnsLink: 'How to get past it',
    note: 'Free · No sign up · macOS and Windows',
    imageAlt: 'A white cat character standing on a desktop',
  },

  shot: {
    headingTop: 'This is what',
    headingBottom: 'opens up',
    body: 'Create a team and you get a six character code. Your teammates type it in, and that is it.',
    imageAlt: 'The Buddling window with a team list open, showing one team with one teammate online.',
  },

  characters: {
    label: 'Characters',
    heading: 'Pick one of five',
    sub: 'Every team gets its own. Choose a different animal per team and you can tell at a glance which team a nudge came from.',
    imageAlt: 'Five characters standing in a row: a cat, a dog, a panda, a duck and a bunny',
    facts: [
      {
        term: 'Clicks pass through',
        detail:
          'The empty space around the character belongs to your desktop. Your icons stay reachable.',
      },
      {
        term: 'It remembers',
        detail: 'Where you dragged it and how big you made it, next time too.',
      },
      {
        term: 'It stays quiet',
        detail: 'It makes no sound, and the menu bar icon hides every character at once.',
      },
    ],
  },

  download: {
    label: 'Download',
    heading: 'The file for your machine',
    latest: 'Latest',
    button: 'Download',
    rows: [
      {
        asset: 'mac-arm64',
        label: 'macOS',
        name: 'macOS — newer Macs',
        meta: 'Made from late 2020 onwards',
      },
      {
        asset: 'mac-x64',
        label: 'macOS',
        name: 'macOS — older Macs',
        meta: 'Bought before mid 2020',
      },
      {
        asset: 'windows',
        label: 'Windows',
        name: 'Windows',
        meta: 'Double click it to install',
      },
    ],
    mobileHint: 'These open on a computer. If you are on a phone, use the button above to send yourself this link.',
    hint: (
      <>
        Not sure which one? Open the Apple menu and choose <strong>About This Mac</strong>. If it
        says &quot;Chip&quot; take the top one. If it says &quot;Processor&quot; take the one below.
      </>
    ),
    pending: (
      <>
        Nothing has been published yet. It will show up here as soon as it is ready.{' '}
        <a href="https://github.com/hayoung-99/buddling/releases">Check the releases page</a>
      </>
    ),
  },

  install: {
    label: 'First launch',
    heading: 'Once, the first time',
    sub: 'Your computer checks with you once. Do this and it opens normally from then on.',
    macos: {
      title: 'macOS',
      howToName: 'Open Buddling for the first time on macOS',
      steps: [
        ['Move the app into your ', { strong: 'Applications' }, ' folder.'],
        ['Double click it. When the warning appears, press ', { strong: 'Done' }, '.'],
        [
          'Open ',
          { strong: 'System Settings → Privacy & Security' },
          ' and press ',
          { strong: 'Open Anyway' },
          ' near the bottom.',
        ],
        ['Press ', { strong: 'Open' }, ' once more and it opens normally from then on.'],
      ],
    },
    windows: {
      title: 'Windows',
      howToName: 'Install Buddling on Windows',
      steps: [
        ['Double click the file you downloaded.'],
        ['When the blue box appears, click ', { strong: 'More info' }, '.'],
        ['Click ', { strong: 'Run anyway' }, ' and the install continues.'],
      ],
      hint: 'It never asks for administrator rights.',
    },
  },

  faq: {
    label: 'Questions',
    heading: 'Things you might wonder',
    items: [
      {
        id: 'faq-what',
        question: 'What is Buddling?',
        answer:
          'A macOS and Windows app that keeps a 3D animal character on your desktop. Tap your own and everyone on that team sees theirs dance. It is free and there is no sign up.',
      },
      {
        id: 'faq-teammates',
        question: 'Do my teammates need it too?',
        answer:
          'Yes. The character has to be on their desktop for the nudge to land. One person creates a team, gets a six character code, and everyone else types it in.',
      },
      {
        id: 'faq-free',
        question: 'Is it really free?',
        answer: 'Yes. No ads, no paid tier. No email and no password either.',
      },
      {
        id: 'faq-alone',
        question: 'Can I use it alone?',
        answer:
          'A character appears for each team you are in, so you need at least one team. A team of one is still a team and the character lives on your desktop just the same. There is simply nobody to nudge yet. Up to three teams, five people each.',
      },
      {
        id: 'faq-work',
        question: 'Can I install it on a work computer?',
        answer:
          'All that travels is the fact that somebody tapped, plus a name. Nothing on your screen and none of your files goes anywhere. It never asks for administrator rights either.',
      },
      {
        id: 'faq-first-open',
        question: 'A box appears the first time. What if it will not open?',
        answer:
          'That happens once. Follow the steps above and it opens normally from then on. If you would rather check for yourself, all the code that makes it is public.',
      },
    ],
  },

  try: {
    label: 'In practice',
    heading: 'Tap here, they dance there',
    sub: 'One tap is all you do, and the other side does not have to do anything at all.',
    mine: 'Your screen',
    theirs: 'Their screen',
    altMine: 'A white cat character on your screen',
    altTheirs: 'A pink bunny character on their screen',
    cta: 'Get it',
  },

  footer: {
    tagline: 'Buddling · Free to use and to change',
    github: 'GitHub',
    releases: 'Releases',
  },

  downloadStrings: {
    pending: 'Coming soon',
    heroFor: 'Download for {target}',
    copied: 'Copied',
    sendToComputer: 'Send to my computer',
  },

  app: {
    description:
      "A desktop app that puts a 3D animal friend on your screen. Tap your own character and your teammates' characters dance on theirs.",
    subCategory: 'Desktop pet app',
    featureList: [
      'A 3D animal character lives on your desktop',
      'Tap your own character and everyone on that team sees theirs dance',
      'No sign up: join with a nickname and a six character code',
      'Clicks in the empty space around the character pass through to the desktop',
      'Remembers where you dragged it and how big you made it',
      'Makes no sound, and the menu bar icon hides every character at once',
      'Up to 3 teams per person, up to 5 people per team',
      'Free on macOS and Windows',
    ],
  },

  meta: {
    title: 'Buddling · A free desktop pet your teammates can feel',
    description:
      "Put a 3D animal friend on your desktop. Tap yours and your teammates' characters dance on theirs. Free for macOS and Windows, no sign up needed.",
    ogDescription:
      'Tap your own character and your teammates’ characters dance. The lightest way to say I am here without saying anything.',
    imageAlt: 'Five characters standing in a row: a cat, a dog, a panda, a duck and a bunny',
  },
}
