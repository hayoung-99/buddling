# 화면 속 아이콘을 라이브러리 것으로 — 개발 설계

**근거 문서** [PRODUCT.md](../PRODUCT.md) 의 **"알고 둔 선택 → 화면 속 아이콘은 갖다
쓰고, 캐릭터는 직접 그린다"** 절. 이 문서는 그 정의를 **어떻게 만들지**만 적습니다.
왜 그렇게 정했는지는 기획서에 있고, 둘이 어긋나 보이면 **기획서가 이깁니다.**

읽는 순서는 [CLAUDE.md](../../CLAUDE.md) → [DEVELOPMENT.md](../DEVELOPMENT.md) →
[PRODUCT.md](../PRODUCT.md) → 이 문서입니다.

---

## 한 줄

**`lucide-react` 를 `apps/desktop` 의 devDependency 로 들이고,
`renderer/icons.tsx` 다섯 함수의 본문을 lucide 컴포넌트 호출로 바꿉니다.**
`icons.tsx` 는 지웠다 다시 만드는 것이 아니라 **크기·굵기만 씌우는 얇은 껍데기로
남습니다.** 부르는 다섯 자리는 한 글자도 고치지 않습니다.

```
지금                                   바뀐 뒤

icons.tsx                              icons.tsx  ← 파일은 그대로, 본문만 바뀜
  base = {viewBox,fill,stroke,           base   = { width:16, height:16, strokeWidth:1.8 }
          strokeWidth:1.8, ...}          inChip = { ...base, width:14, height:14 }
  PeopleIcon → 손으로 그린 <svg>          PeopleIcon → <UsersRound {...inChip} {...props}/>
  KeyIcon    → 손으로 그린 <svg>          KeyIcon    → <Key        {...inChip} {...props}/>
  PawIcon    → 손으로 그린 <svg>          PawIcon    → <PawPrint   {...base}   {...props}/>
  BellIcon   → 손으로 그린 <svg>          BellIcon   → <Bell       {...base}   {...props}/>
  GearIcon   → 손으로 그린 <svg>          GearIcon   → <Settings   {...base}   {...props}/>
      │                                        │
      └──────────── 이 다섯 자리는 그대로 ─────┘
        TeamList.tsx (People·Key·Paw·Gear) · NotificationButton.tsx (Bell)
```

---

## 1. 지금 어떻게 되어 있나

`apps/desktop/src/renderer/icons.tsx` 하나에 다섯 함수가 모여 있고, 전부 같은 `base`
객체를 펼친 뒤 `props` 로 덮어쓰는 모양입니다.

```tsx
type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 16, height: 16, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}
```

부르는 자리는 **다섯 곳뿐**입니다.

| 자리 | 아이콘 | 어떻게 부르나 |
|---|---|---|
| `team/TeamList.tsx:55` | `PeopleIcon` | 인자 없음 → 16px. `ui.iconChip`(26px 원) 안 |
| `team/TeamList.tsx:97` | `KeyIcon` | 인자 없음 → 16px. `ui.iconChip`(26px 원) 안 |
| `team/TeamList.tsx:336` | `PawIcon` | `className="mr-[4px]"`. `ui.titlebar` 안 |
| `team/TeamList.tsx:357` | `GearIcon` | `width={13} height={13}`. "설정…" 버튼 안 |
| `NotificationButton.tsx:30` | `BellIcon` | `width={16} height={16}`. 제목줄 오른쪽 |

`NotificationButton` 은 `TeamList` · `TeamDetail` · `Settings` 세 창이 함께 씁니다.
**오프라인 화면(`OfflineScreen.tsx`)에는 아이콘이 없습니다** — 제목줄의 발바닥·종이
그 화면 위에 그대로 남아 있을 뿐입니다(오프라인 설계 문서 참고). 캐릭터 창·크기 조절
패널·알림 창에는 이 아이콘들이 들어가지 않습니다.

**색은 전부 `currentColor` 로 부모에게서 물려받습니다.** 배지 안 둘은
`ui.iconChip` 의 `text-ink`, 발바닥은 `ui.titlebar` 의 `text-ink`, 종은
`NotificationButton` 의 `text-ink-soft`(hover 시 `text-ink`), 톱니는
`ui.buttonQuiet` 의 `text-ink-soft` 입니다. **이 방식은 바뀌지 않습니다** — lucide 도
기본 `stroke` 가 `currentColor` 입니다.

---

## 2. 의존성

### 어디에 · 어떤 버전으로

**`apps/desktop` 워크스페이스의 `devDependencies` 에 `lucide-react@^1.35.0`.**

저장소 루트에서, `.nvmrc` 가 정한 Node 로 설치합니다.

```bash
nvm use                    # 22.23.2 / npm 10.9.8 인지 node -v && npm -v 로 확인
npm install -w buddling --save-dev lucide-react@^1.35.0
```

`-w buddling` 이 `apps/desktop` 입니다(그 폴더의 패키지 이름이 `buddling`).
**이때는 `npm ci` 가 아니라 `npm install` 이 맞습니다** — 새 의존성을 더하는 일이라
`package-lock.json` 이 바뀌는 것이 정상입니다. 다만 npm 버전이 다르면 lockfile 이
엉뚱한 데까지 다시 쓰이므로 `nvm use` 를 먼저 하라는 것이 CLAUDE.md 의 요구입니다.
커밋 전에 `git diff package-lock.json` 으로 **lucide-react 항목 말고 다른 것이 함께
바뀌지 않았는지** 보세요.

### 왜 `devDependencies` 인가

`react` · `react-dom` · `three` 와 같은 이유입니다. 렌더러는 Vite 가 통째로 번들해
`dist-renderer/` 로 떨어뜨리고, 런타임에 `require('lucide-react')` 하는 코드는 어디에도
없습니다. `dependencies` 로 옮기면 electron-builder 가 이 패키지를 asar 안에 통째로
넣어 **쓰지도 않는 1,600개 아이콘 소스가 배포본에 실립니다.**

### 무엇이 딸려 오나

- **런타임 의존성 0개.** `peerDependencies` 에 `react` 뿐이고(`^16.5.1 || ^17 || ^18 ||
  ^19`), 이 저장소는 `react@^19.2.8` 이라 만족합니다.
- **타입 정의가 패키지에 들어 있습니다** — `@types/*` 를 따로 붙이지 않습니다.
- **라이선스는 ISC.** 번들에 `@license` 주석이 그대로 살아남는 것을 확인했습니다
  (esbuild 가 legal comment 를 파일 끝에 모아 둡니다). 따로 고지 파일을 만들지
  않습니다.

### 얼마나 무거워지나 — 실측

설계 단계에서 임시 폴더에 직접 만들어 재 봤습니다(저장소는 건드리지 않았습니다).

| 무엇 | 값 |
|---|---|
| rollup 으로 번들 (tree-shaking 확인) | 산출물에 `createLucideIcon(` 이 **정확히 5번** — 다섯 개만 남습니다 |
| esbuild `--minify`, react external | **3.7KB** |
| 위를 gzip | **1.68KB** |

**tree-shaking 이 도는 근거는 패키지의 `"sideEffects": false` 와 ESM 진입점
(`module: dist/esm/lucide-react.mjs`)입니다.** 그래서 **배럴(`import { Bell } from
'lucide-react'`)로 부르면 됩니다.** 이 패키지에는 `exports` 맵이 없어서
`lucide-react/dist/esm/icons/bell.mjs` 같은 깊은 경로도 우연히 열려 있지만,
**그 길로 부르지 마세요** — 패키지 내부 구조에 기대는 것이라 다음 메이저에서 조용히
깨집니다. 배럴로 불러도 결과가 같다는 것을 위에서 확인했습니다.

렌더러 진입점이 여럿이라(`team` · `teamDetail` · `settings` …) rollup 이 공유 청크로
빼 줍니다. 창마다 다섯 개가 복사되지 않습니다.

---

## 3. `icons.tsx` — 새 내용

파일을 통째로 아래로 바꿉니다.

```tsx
/**
 * 창 안에서 쓰는 작은 선 아이콘들.
 *
 * 그림 자체는 lucide 세트에서 그대로 꺼내 쓴다 (기획서 "화면 속 아이콘은 갖다 쓰고,
 * 캐릭터는 직접 그린다"). 이 파일은 그 위에 크기와 굵기만 씌우는 얇은 껍데기다.
 *
 * 껍데기를 남긴 이유: 부르는 다섯 자리가 크기·굵기를 저마다 적어 두면 "같은 뜻으로
 * 같은 값" 이 다섯 군데로 흩어진다. 여기 한 곳에 두면 세트를 갈아탈 일이 생겨도
 * 아래 import 한 줄과 이 다섯 줄만 고치면 되고, 새 아이콘이 필요해졌을 때 같은
 * 세트에서 골랐는지도 이 파일만 보면 안다.
 */

import { Bell, Key, PawPrint, Settings, UsersRound } from 'lucide-react'
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/**
 * viewBox·fill·stroke·선 끝 모양은 lucide 가 이미 똑같은 값으로 붙이므로 다시 적지
 * 않는다. 우리가 정하는 것은 크기와 굵기 둘뿐이다.
 *
 * 굵기 1.8 은 손으로 그리던 시절의 값 그대로다. lucide 의 기본값은 2 지만, 24칸짜리
 * 그림을 16px 로 줄여 그리므로 화면에 찍히는 굵기는 1.8 × 16 ÷ 24 = 1.2px 이 되어
 * 지금과 한 픽셀도 다르지 않다. 여기를 2 로 올리면 다섯이 한꺼번에 굵어진다.
 *
 * lucide 의 `size` 프로퍼티는 일부러 쓰지 않는다. 부르는 쪽이 이미 width·height 로
 * 덮어쓰고 있는데(GearIcon 은 13px), 둘을 섞으면 어느 쪽이 이기는지가 안 보인다.
 */
const base = {
  width: 16,
  height: 16,
  strokeWidth: 1.8,
}

/**
 * 원형 배지(ui.iconChip, 26px) 안에 들어가는 둘만 14px 이다.
 *
 * lucide 는 아이콘마다 24칸을 거의 꽉 채워 그린다 — 잉크가 대략 19~20칸이다. 손으로
 * 그리던 것은 15칸쯤으로 안쪽에 여유를 두고 그렸어서, 같은 16px 로 얹으면 이 둘만
 * 배지 테두리에 바짝 붙어 커 보인다. 나머지 셋은 제목줄과 글자 줄에 놓여 가두는
 * 테두리가 없으므로 그대로 둔다.
 */
const inChip = { ...base, width: 14, height: 14 }

/** 사람 둘 — "새 방 만들기" 배지 */
export function PeopleIcon(props: IconProps) {
  return <UsersRound {...inChip} {...props} />
}

/** 열쇠 — "초대코드로 참여하기" 배지 */
export function KeyIcon(props: IconProps) {
  return <Key {...inChip} {...props} />
}

/** 발바닥 — 창 제목줄, 앱 이름 옆 */
export function PawIcon(props: IconProps) {
  return <PawPrint {...base} {...props} />
}

/** 종 — 제목줄 오른쪽, 알림 창으로 가는 단추 */
export function BellIcon(props: IconProps) {
  return <Bell {...base} {...props} />
}

/** 톱니바퀴 — 맨 아래 "설정…" 앞 */
export function GearIcon(props: IconProps) {
  return <Settings {...base} {...props} />
}
```

### 왜 이 크기가 되는지 (배지 안 둘만 14px 인 이유)

**24칸 안에서 잉크가 차지하는 크기를 재 보면 이렇습니다** (선 굵기 제외, 대략값).

| 자리 | 지금 손그림 | lucide | 늘어남 | 가두는 테두리 |
|---|---|---|---|---|
| 사람 둘 | 15.0 × 12.6 | 20.0 × 18.0 | **+33%** | **있음** — 26px 원 |
| 열쇠 | 15.0 × 13.3 | 19.5 × 19.0 | **+30%** | **있음** — 26px 원 |
| 발바닥 | 15.4 × 14.7 | 19.0 × 19.5 | +23% | 없음 (제목줄) |
| 종 | 13.0 × 16.0 | 18.8 × 19.6 | +23% | 없음 (제목줄) |
| 톱니 | 16.8 × 16.8 | 19.2 × 19.2 | +14% | 없음 (글자 줄) |

**다섯 다 커집니다. 문제가 되는 것은 배지 안 둘뿐입니다.** `ui.iconChip` 이 26px
원인데 16px 아이콘이 24칸을 꽉 채우면 원 안쪽 여백이 사방 6px 남짓으로 줄어
답답해 보입니다. 14px 로 내리면 잉크가 11.7px 이 되어 예전(10px)과 비슷한 여백이
돌아옵니다. 나머지 셋은 원이든 상자든 가두는 것이 없어 커진 것이 눈에 걸리지
않으므로 16px(톱니는 13px)을 그대로 둡니다.

**14px 로도 아직 답답해 보이면 13px 까지만 내려 보고, 그 아래로는 가지 마세요.**
잉크가 11px 아래로 내려가면 사람 둘의 뒷사람 어깨선이 앞사람과 붙어 한 덩어리로
읽힙니다. 반대로 배지(`ui.iconChip` 의 `w-[26px] h-[26px]`)를 키우는 쪽으로 풀지
마세요 — 그 배지는 온보딩 두 줄의 세로 리듬을 정하는 값이라 두 줄 전체가 흔들립니다.

---

## 4. 어느 lucide 아이콘을 고르나

**전부 `lucide-react@1.35.0` 에 실제로 있는 이름입니다** (패키지를 받아
`dist/lucide-react.d.ts` 에서 `declare const` 로 확인했습니다).

| 지금 | lucide 이름 | 왜 이것인가 | 버린 후보 |
|---|---|---|---|
| `PeopleIcon` | **`UsersRound`** | 지금 그림과 같은 구성 — 둥근 머리 + 호로 그린 어깨, 뒷사람이 오른쪽 뒤로 물러섬 | `Users` — 어깨가 직선이라 각지게 읽힌다. `Users2` 는 alias |
| `KeyIcon` | **`Key`** | 방향까지 같다. 왼쪽 아래 고리 + 오른쪽 위로 뻗는 대(21,2) + 톱니 둘 | `KeyRound` — 고리가 오른쪽 위, 대가 왼쪽 아래로 정반대이고 가운데가 칠해진 점이라 결이 다르다 |
| `PawIcon` | **`PawPrint`** | 세트에 발바닥이 이것뿐이다 | 없음 |
| `BellIcon` | **`Bell`** | 지금과 거의 같다. 몸통이 조금 넓어지는 정도 | `BellRing`·`BellDot` 은 뜻이 다르다 (울림·읽지 않음) |
| `GearIcon` | **`Settings`** | 도형이 둘(톱니 실루엣 + 가운데 원)이라 13px 에서도 버틴다 | `Cog` — 조각이 **14개**라 13px 에서 뭉갠다. `Settings2` 는 슬라이더 두 줄이라 톱니가 아니다 |

**발바닥만 모양이 눈에 띄게 달라집니다** — 반듯한 대칭(가운데 큰 원 + 발가락 4개)이
비스듬한 발자국(발가락 3개)이 됩니다. 기획서가 이미 이 변화를 예고하고 그래도
바꾸기로 정해 두었으니, **"어색해 보인다" 는 이유로 여기만 손그림으로 되돌리지
마세요.** 되돌리려면 기획서부터 고쳐야 합니다.

**앞으로 아이콘이 하나 더 필요해지면 반드시 lucide 안에서 고릅니다.** 하나만 다른
데서 가져오거나 손으로 그려 끼우면 그 하나가 티가 납니다(기획서 같은 절).

---

## 5. 왜 `icons.tsx` 를 남기나 — 검토한 두 갈래

| | 파일을 지우고 부르는 곳에서 직접 lucide 를 부른다 | **껍데기로 남긴다 (고른 쪽)** |
|---|---|---|
| 고치는 파일 | `TeamList.tsx` · `NotificationButton.tsx` + `icons.tsx` 삭제 | `icons.tsx` 하나 |
| 크기·굵기 | `size={16} strokeWidth={1.8}` 이 **다섯 자리로 흩어진다** | 한 자리에 남는다 |
| 세트를 갈아탈 때 | 다섯 자리를 다 찾아 고친다 | import 한 줄 + 다섯 줄 |
| 배지 안 둘만 14px 인 규칙 | 어디에도 적을 곳이 없어 두 자리에 숫자만 남는다 | `inChip` 이라는 이름과 주석이 이유를 들고 있다 |
| "같은 세트에서 고른다" 는 기획서 규칙 | 지켜지는지 알려면 다섯 자리를 다 봐야 한다 | 이 파일만 보면 안다 |

CLAUDE.md 가 가장 조심하라고 적어 둔 것이 **"같은 숫자가 세 곳에 있다"** 입니다.
파일을 지우는 쪽은 정확히 그 함정을 새로 파는 일이라 고르지 않았습니다.

---

## 6. `docs/DEVELOPMENT.md` 손질

두 군데입니다.

1. **"기능별 설계 문서" 표에 한 줄** — 이 문서를 가리키는 줄, 상태는 `설계 중`.
2. **"구조" 절 끝의 한 문장**을 손봅니다. 지금 이렇게 적혀 있습니다.

   > 아이콘도 랜딩페이지 그림도 **앱과 같은 캐릭터 코드로 그립니다.**

   이건 **앱 아이콘·메뉴바 아이콘** 이야기인데, 이제 "창 안의 작은 아이콘" 과 헷갈릴
   수 있습니다. 어느 아이콘인지 못 박고, 창 안의 것은 lucide 에서 온다는 한 마디를
   덧붙입니다. **이 절의 다른 서술은 건드리지 않습니다.**

---

## 7. 확인할 것

```bash
npm ci                 # 설치가 lockfile 과 맞는지 (npm install 뒤 한 번)
npm test               # 이 변경이 건드리는 테스트는 없다. 깨지면 그게 신호다
npm run typecheck      # IconProps 가 lucide 의 props 와 맞는지 여기서 걸린다
npm run lint
npm run build
```

**눈으로 반드시 봅니다.** 온보딩(배지 둘) · 제목줄(발바닥 + 종) · 맨 아래(톱니)가
한 화면에 다 나오는 상황이 온보딩 화면입니다.

```bash
# 온보딩 — 사람 배지 · 열쇠 배지 · 발바닥 · 종 · 톱니가 전부 나온다
BUDDLING_PROFILE=shot BUDDLING_FAKE_NET=1 BUDDLING_CAPTURE=.preview/icons-onboarding \
  BUDDLING_LANG=ko npm start

# 방이 있는 상태 + 설정 창 — 제목줄과 톱니를 다른 배경에서 한 번 더 본다
BUDDLING_PROFILE=shot BUDDLING_FAKE_NET=1 BUDDLING_CAPTURE=.preview/icons-list \
  BUDDLING_LANG=ko BUDDLING_SEED="디자인팀:나영" BUDDLING_SETTINGS=1 npm start
```

**보는 것 네 가지.**

1. 배지 안 둘이 원 테두리에 붙어 보이지 않는가 (14px 이 맞는지 — 아니면 13px)
2. 다섯의 선 굵기가 서로, 그리고 옆 글자와 어울리는가 (1.8 을 유지한 결과 확인)
3. 13px 톱니가 뭉개지지 않는가
4. 제목줄에서 발바닥이 앱 이름과 세로로 맞는가 — 지금 `mr-[4px]` 하나로 맞춰 둔
   자리라, 잉크가 커지면서 아래로 내려앉아 보일 수 있습니다. 어긋나면
   **`TeamList.tsx` 의 그 한 줄에서** 여백을 손보고(`ui.titlebar` 는 세 창이 함께
   쓰므로 건드리지 않습니다), 무엇을 왜 바꿨는지 주석으로 남기세요.

**용량도 한 번 재세요.** 고치기 전후로 `dist-renderer` 를 비교하면 실측이 됩니다.

```bash
du -sk apps/desktop/dist-renderer
```

설계 단계 예상은 **gzip 기준 1.7KB 증가**입니다. 이보다 자릿수가 다르게 나오면
tree-shaking 이 안 돈 것이니, 깊은 경로로 부르고 있지 않은지부터 보세요.

**정리할 때는 메인 프로세스를 먼저 죽이고 프로필 폴더를 지웁니다**
(`pkill -f "buddling/node_modules/electron"` → `.preview` 정리). 순서가 뒤바뀌면
예약된 저장이 사라진 폴더에 쓰려다 오류창이 뜹니다.

---

## 8. 알고 두는 것

- **빌드 로그에 경고 두 줄이 새로 뜰 수 있습니다.**
  `Module level directives cause errors when bundled, "use client" ... was ignored`
  — lucide 의 `Icon.mjs` · `context.mjs` 에 `"use client"` 가 붙어 있어서 나오는
  것으로, rollup 으로 직접 재현했습니다(Vite 가 걸러 줄 수도 있습니다). **산출물에는
  영향이 없으므로 그대로 둡니다.** 이걸 끄려고 `vite.config.mts` 에 `onwarn` 을 달면
  앞으로 진짜 경고까지 함께 삼킵니다.
- **`aria-hidden="true"` 가 저절로 붙습니다.** lucide 는 a11y 프로퍼티가 없는 아이콘에
  이걸 붙입니다. 다섯 다 장식이고 뜻은 옆 글자나 버튼의 `aria-label` 이 지고 있으므로
  (`NotificationButton` 참고) **개선입니다.** 아이콘 자체에 이름을 붙일 일이 생기면
  `aria-label` 을 넘기면 `aria-hidden` 이 자동으로 빠집니다.
- **`class` 에 `lucide lucide-<이름>` 이 앞에 붙습니다.** 넘긴 `className` 은 뒤에
  이어 붙으므로 `<PawIcon className="mr-[4px]" />` 는 그대로 듣습니다. 이 앱에는
  `.lucide` 를 정의한 CSS 가 없어 충돌하지 않습니다.
- **`IconProps` 에 `color` 를 넘기지 마세요.** `SVGProps` 에는 `color` 가 있는데
  lucide 는 그걸 `stroke` 로 바꿔 씁니다(SVG 의 `color` 와 뜻이 다릅니다). 지금 다섯
  자리 중 넘기는 곳은 없습니다. 색은 계속 부모의 `text-*` 로 물려줍니다.
- **`npm run typecheck` 이 `IconProps` 의 `ref` 에서 걸리면** — `SVGProps` 의 `ref` 와
  lucide 의 `RefAttributes` 가 안 맞는 경우입니다. 그때만
  `type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'>` 로 좁히세요. 다섯 자리 중
  `ref` 를 넘기는 곳은 없어서 잃는 것이 없습니다. **걸리지 않으면 그대로 두세요.**
- **`packages/shared` 는 건드리지 않습니다.** 문구가 아니라 그림만 바뀌므로 네 언어
  사전도 그대로입니다.
- **`.oxlintrc.json` 도 그대로입니다.** 새 폴더가 생기지 않아 `overrides` 에 더할 것이
  없습니다.
- **이 변경은 `apps/desktop` 안에서 일어나므로 release-please 가 정상적으로 잡습니다**
  (shared 만 고칠 때의 함정에 걸리지 않습니다).

---

## 9. 하지 않는 것

- **캐릭터는 손대지 않습니다.** 앱 아이콘 · 메뉴바 아이콘 · 랜딩페이지 그림은 계속
  같은 캐릭터 코드에서 나옵니다.
- **랜딩페이지(`apps/web`)에 lucide 를 들이지 않습니다.** 기획서의 이 절은 **앱 창
  안의 아이콘** 이야기이고, 랜딩은 `'use client'` 하나에도 자바스크립트 예산이 걸린
  자리입니다(`scripts/check-site.js` 의 190KB 한도).
- **제목줄의 발바닥을 캐릭터로 바꾸지 않습니다.** `docs/BACKLOG.md` 에 적힌 별개의
  디자인 작업입니다.
- **`ui.ts` · `theme.css` 를 고치지 않습니다.** 배지 색도 크기도 그대로입니다
  (7번의 4번 항목에서 발바닥 여백만 예외로 열어 두었습니다).
- **아이콘을 확인하는 테스트를 새로 만들지 않습니다.** 이 저장소의 렌더러에는 지금
  DOM 테스트 장치가 없고, 그걸 들이는 일은 이 변경보다 큽니다. 확인은 7번의 캡처로
  합니다.
