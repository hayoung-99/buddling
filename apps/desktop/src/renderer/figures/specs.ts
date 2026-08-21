/**
 * 피규어 5종 스펙.
 *
 * 앱이 쓰는 캐릭터(`@buddling/shared/characters` + `pet/critter.ts`)와는 **별개의 세트**다.
 * 그쪽은 팔이 관절 없는 돌기이고 다리가 발만 있는 동글동글한 인형인데, 이쪽은 큰 머리에
 * 세로로 선 알약 몸통, 어깨에서 늘어진 팔, 짧은 다리가 있는 피규어다. 컨셉 시트
 * (삼색 고양이 · 갈색 강아지 · 판다 · 오리 · 분홍 토끼, 세 방향) 를 보고 읽어 낸 값이다.
 *
 * 다섯이 한 리그를 공유하고 색·비율·귀·무늬만 다르다. 그래야 어느 하나도 겉돌지 않는
 * 한 세트로 보인다 — 앱 캐릭터가 가진 가장 큰 자산이라 여기서도 같은 길을 간다.
 *
 * 앱에는 연결되어 있지 않다. `npm run preview:figures` 에서만 돈다.
 */

export type FigureEars = 'triangle' | 'floppy' | 'round' | 'long' | 'none'
export type FigureFace = 'muzzle' | 'plain' | 'beak'
export type FigureTail = 'none' | 'puff' | 'feather'
export type FigureMark = 'calicoHead' | 'calicoBody' | 'pandaEyes' | 'sparkle'

/**
 * 색은 이름으로 고른다. 부위가 팔레트의 어느 칸을 쓰는지만 가리키므로 종의 색을 바꿀 때
 * 한 곳만 고치면 된다. 없는 칸은 `body` 로 떨어진다.
 */
export type FigurePaletteKey =
  | 'body'
  | 'torso'
  | 'belly'
  | 'muzzle'
  | 'nose'
  | 'eye'
  | 'innerEar'
  | 'foot'
  | 'limb'
  | 'beak'
  | 'beakLower'
  | 'markA'
  | 'markB'
  | 'markC'

export type FigurePalette = Partial<Record<FigurePaletteKey, number>> & { body: number }

export interface FigureBuild {
  headRadius: number
  /** 머리 구의 x/y/z 배율. 조금 넓적한 것이 이 세트의 얼굴이다 */
  headScale: [number, number, number]
  /** 몸통 캡슐의 반지름과 곧은 부분의 길이 */
  bodyRadius: number
  bodyLength: number
  armLength: number
  legLength: number
  ears: FigureEars
  face: FigureFace
  arms: 'arm' | 'wing'
  feet: 'paw' | 'webbed'
  tail: FigureTail
  /** 팔다리가 몸과 다른 색이면 팔레트의 `limb` 를 쓴다 (판다) */
  limbColor: 'body' | 'limb'
  marks: FigureMark[]
}

export interface FigureSpec {
  key: string
  /** 미리보기 이름표. 앱에 나오지 않으므로 사전에 두지 않고 한국어만 적는다 */
  name: string
  palette: FigurePalette
  build: FigureBuild
}

/** 종마다 다르게 주지 않는 공통 비율. 바꾸면 다섯이 함께 움직인다. */
const SHARED = {
  headRadius: 0.52,
  headScale: [1.08, 0.96, 1.0] as [number, number, number],
  bodyRadius: 0.28,
  bodyLength: 0.28,
  armLength: 0.42,
  legLength: 0.2,
}

export const FIGURES: FigureSpec[] = [
  {
    key: 'calico',
    name: '삼색 고양이',
    palette: {
      body: 0xf7f4ee,
      nose: 0x4d4444,
      eye: 0x2a2a2a,
      innerEar: 0xe9a3ab,
      foot: 0xf7f4ee,
      markA: 0x2b2b2b, // 머리 왼쪽(화면 왼쪽) 검은 무늬와 그쪽 귀
      markB: 0xd9953a, // 머리 오른쪽 주황 무늬와 그쪽 귀
      markC: 0xe2aa3c, // 어깨의 노란 점
    },
    build: {
      ...SHARED,
      ears: 'triangle',
      face: 'plain',
      arms: 'arm',
      feet: 'paw',
      tail: 'none',
      limbColor: 'body',
      marks: ['calicoHead', 'calicoBody'],
    },
  },
  {
    key: 'puppy',
    name: '강아지',
    palette: {
      body: 0x8e5a3a,
      belly: 0xe8d0b0,
      muzzle: 0xe8d0b0,
      nose: 0x45291f,
      eye: 0x2a2a2a,
      foot: 0x8e5a3a,
    },
    build: {
      ...SHARED,
      ears: 'floppy',
      face: 'muzzle',
      arms: 'arm',
      feet: 'paw',
      tail: 'none',
      limbColor: 'body',
      marks: [],
    },
  },
  {
    key: 'panda',
    name: '판다',
    palette: {
      body: 0xf7f5f0,
      torso: 0x262626, // 몸통은 검고 그 앞에 흰 배가 붙는다
      belly: 0xf7f5f0,
      limb: 0x262626,
      nose: 0x222222,
      eye: 0x1c1c1c,
      foot: 0x262626,
      markA: 0x262626, // 눈 무늬와 귀
    },
    build: {
      ...SHARED,
      ears: 'round',
      face: 'plain',
      arms: 'arm',
      feet: 'paw',
      tail: 'none',
      limbColor: 'limb',
      marks: ['pandaEyes'],
    },
  },
  {
    key: 'duck',
    name: '오리',
    palette: {
      body: 0xf6d42a,
      eye: 0x222222,
      beak: 0xef8a1e,
      beakLower: 0xde7612,
      limb: 0xf0a826, // 날개
      foot: 0xe9821c,
    },
    build: {
      ...SHARED,
      // 오리는 몸이 조금 더 통통하고 짧다
      bodyRadius: 0.3,
      bodyLength: 0.22,
      armLength: 0.36,
      ears: 'none',
      face: 'beak',
      arms: 'wing',
      feet: 'webbed',
      tail: 'feather',
      limbColor: 'limb',
      marks: [],
    },
  },
  {
    key: 'bunny',
    name: '토끼',
    palette: {
      body: 0xf2a8bf,
      belly: 0xf3dccb,
      muzzle: 0xf3dccb,
      nose: 0x5b3a2e,
      eye: 0x2a2a2a,
      innerEar: 0xf8d3e1,
      foot: 0xf2a8bf,
      markA: 0xfbe6ef, // 옆구리의 반짝이
    },
    build: {
      ...SHARED,
      ears: 'long',
      face: 'muzzle',
      arms: 'arm',
      feet: 'paw',
      tail: 'puff',
      limbColor: 'body',
      marks: ['sparkle'],
    },
  },
]

export function getFigure(key: string): FigureSpec {
  const found = FIGURES.find((spec) => spec.key === key)
  if (!found) throw new Error(`모르는 피규어: ${key}`)
  return found
}
