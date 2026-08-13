/**
 * 캐릭터 5종 스펙.
 *
 * 5마리를 따로 모델링하지 않는다. `createCritter()`가 읽는 하나의 공통 리그를
 * 이 스펙으로 변형해서 만든다. 비율·색·부위 모양만 여기서 바꾸면 된다.
 *
 * 처음 그린 컨셉아트의 종류·색상·대사를 따르되, 픽셀아트가 아니라
 * 3D 장난감 질감으로 재해석했다.
 *
 * 화면에 보여줄 이름은 여기 두지 않는다 — 나라말마다 다르므로
 * `src/shared/i18n/*.json` 의 `character.<key>` 에 있다.
 */

/** 귀 모양 */
export const EAR = {
  TRIANGLE: 'triangle', // 고양이
  FLOPPY: 'floppy', // 강아지 (늘어진 귀)
  ROUND: 'round', // 판다
  LONG: 'long', // 토끼
  NONE: 'none', // 오리
}

/** 꼬리 모양 */
export const TAIL = {
  CURL: 'curl', // 고양이 (말려 올라간)
  WAG: 'wag', // 강아지
  PUFF: 'puff', // 토끼·판다 (동그란 뭉치)
  FEATHER: 'feather', // 오리
  NONE: 'none',
}

/** 주둥이 모양 */
export const SNOUT = {
  MUZZLE: 'muzzle', // 포유류 주둥이
  BEAK: 'beak', // 오리 부리
}

/** 앞다리 모양 */
export const ARM = {
  PAW: 'paw', // 앞발
  WING: 'wing', // 날개
}

export const CHARACTERS = [
  {
    key: 'cat',
    name: 'HAPPY CAT',
    cry: 'YAY!',
    palette: {
      body: 0xf8f6f3,
      belly: 0xffffff,
      accent: 0xffbecb,
      snout: 0xffffff,
      nose: 0xff8fa3,
      eye: 0x2f2a26,
      cheek: 0xffb3c1,
      foot: 0xf0ebe4,
    },
    build: {
      bodyRadius: 0.56,
      bodyShape: [1.0, 1.02, 0.94], // 몸통 x/y/z 스케일
      headRadius: 0.62,
      headLift: 0.6, // 몸통·머리가 겹치는 정도 (작을수록 머리가 몸에 파묻힌다)
      legLength: 0.13,
      feet: 'paw',
      ears: { type: EAR.TRIANGLE, size: 0.44, spread: 0.56, tilt: 0.24 },
      snout: { type: SNOUT.MUZZLE, size: 0.32 },
      tail: { type: TAIL.CURL, size: 0.6 },
      arms: { type: ARM.PAW, size: 0.22 },
      patches: [],
    },
  },
  {
    key: 'dog',
    name: 'CHUBBY DOG',
    cry: 'WOW!',
    palette: {
      body: 0xb87a4d,
      belly: 0xf5e6d2,
      accent: 0x92603a,
      snout: 0xf5e6d2,
      nose: 0x3b2c24,
      eye: 0x2f2a26,
      cheek: 0xe89a8a,
      foot: 0xf5e6d2,
    },
    build: {
      bodyRadius: 0.6,
      bodyShape: [1.06, 0.98, 0.98],
      headRadius: 0.64,
      headLift: 0.56,
      legLength: 0.12,
      feet: 'paw',
      ears: { type: EAR.FLOPPY, size: 0.5, spread: 0.86, tilt: 0.16, color: 'accent' },
      snout: { type: SNOUT.MUZZLE, size: 0.34 },
      tail: { type: TAIL.WAG, size: 0.44 },
      arms: { type: ARM.PAW, size: 0.24 },
      patches: [],
    },
  },
  {
    key: 'panda',
    name: 'PUDGY PANDA',
    cry: 'HOORAY!',
    palette: {
      body: 0xfbf9f6,
      belly: 0xffffff,
      accent: 0x272320,
      snout: 0xffffff,
      nose: 0x272320,
      eye: 0x141210,
      cheek: 0xf2b6bd,
      foot: 0x272320,
    },
    build: {
      bodyRadius: 0.64,
      bodyShape: [1.04, 0.96, 1.0],
      headRadius: 0.66,
      headLift: 0.54,
      legLength: 0.12,
      feet: 'paw',
      ears: { type: EAR.ROUND, size: 0.29, spread: 0.74, tilt: 0.1, color: 'accent' },
      snout: { type: SNOUT.MUZZLE, size: 0.34 },
      tail: { type: TAIL.PUFF, size: 0.16 },
      arms: { type: ARM.PAW, size: 0.26, color: 'accent' },
      patches: ['pandaEyes'],
    },
  },
  {
    key: 'duck',
    name: 'DUMB DUCK',
    cry: 'QUACK!',
    palette: {
      body: 0xffd23f,
      belly: 0xffe27a,
      accent: 0xf5b800,
      snout: 0xff9e2c,
      nose: 0xe07d10,
      eye: 0x2b2419,
      cheek: 0xffb36b,
      foot: 0xff9e2c,
    },
    build: {
      bodyRadius: 0.55,
      bodyShape: [1.0, 1.06, 0.96],
      headRadius: 0.52,
      headLift: 0.68,
      legLength: 0.1,
      feet: 'webbed',
      ears: { type: EAR.NONE, size: 0, spread: 0, tilt: 0 },
      snout: { type: SNOUT.BEAK, size: 0.38 },
      tail: { type: TAIL.FEATHER, size: 0.34 },
      arms: { type: ARM.WING, size: 0.32 },
      patches: [],
    },
  },
  {
    key: 'bunny',
    name: 'HOP BUNNY',
    cry: 'JUMP!',
    palette: {
      body: 0xfbc7d4,
      belly: 0xfff3f6,
      accent: 0xff9fb6,
      snout: 0xfff3f6,
      nose: 0xff7ba0,
      eye: 0x3a2a2e,
      cheek: 0xff9fb6,
      foot: 0xfff3f6,
    },
    build: {
      // 귀가 전체 키의 3분의 1을 차지한다. 화면에서는 다른 종과 같은 높이로 맞춰지므로
      // 몸·머리를 키우고 귀를 조금 줄여야 혼자 왜소해 보이지 않는다.
      bodyRadius: 0.55,
      bodyShape: [0.98, 1.04, 0.94],
      headRadius: 0.64,
      headLift: 0.6,
      legLength: 0.12,
      feet: 'paw',
      ears: { type: EAR.LONG, size: 0.72, spread: 0.36, tilt: 0.14 },
      snout: { type: SNOUT.MUZZLE, size: 0.28 },
      tail: { type: TAIL.PUFF, size: 0.2 },
      arms: { type: ARM.PAW, size: 0.21 },
      patches: [],
    },
  },
]

export const DEFAULT_CHARACTER_KEY = 'cat'

export const CHARACTER_KEYS = CHARACTERS.map((c) => c.key)

/** 키로 캐릭터 스펙을 찾는다. 없거나 잘못된 키면 기본 캐릭터를 돌려준다. */
export function getCharacter(key) {
  return CHARACTERS.find((c) => c.key === key) ?? CHARACTERS[0]
}

export function isCharacterKey(key) {
  return CHARACTER_KEYS.includes(key)
}
