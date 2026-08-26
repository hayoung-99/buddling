---
name: Buddling Web
description: 벽지 위에 떠 있는 창 한 장 — 그리고 그 창을 넘어오는 캐릭터들.
colors:
  wall-top: "#a9a5bd"
  wall-bottom: "#cbbfc0"
  panel: "#f7f5f1"
  sunk: "#eae6de"
  ink: "#2b2733"
  ink-soft: "#615c6e"
  accent: "#9a5d18"
  line: "rgba(43, 39, 51, 0.1)"
  wall-top-dark: "#14121a"
  wall-bottom-dark: "#241d24"
  panel-dark: "#221f2b"
  sunk-dark: "#1b1825"
  ink-dark: "#ece9f2"
  ink-soft-dark: "#a49eb4"
  accent-dark: "#e8b06a"
  line-dark: "rgba(236, 233, 242, 0.12)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(2.2rem, 4.6vw, 3.3rem)"
    fontWeight: 300
    lineHeight: 1.14
    letterSpacing: "-0.025em"
  display-emphasis:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(2.2rem, 4.6vw, 3.3rem)"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(1.5rem, 2.8vw, 2rem)"
    fontWeight: 300
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline-quiet:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(1.4rem, 2.4vw, 1.85rem)"
    fontWeight: 300
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "1.02rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.005em"
  lead:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "1.06rem"
    fontWeight: 400
    lineHeight: 1.66
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.66
    letterSpacing: "normal"
  body-strong:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "0.94rem"
    fontWeight: 700
    lineHeight: 1.66
    letterSpacing: "normal"
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.66
    letterSpacing: "normal"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.66
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1.66
    letterSpacing: "0.16em"
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', 'Malgun Gothic', sans-serif"
    fontSize: "2.1rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
rounded:
  window: "14px"
  card: "12px"
  pane: "10px"
  control: "8px"
  hairline: "4px"
  bar: "2px"
spacing:
  hair: "8px"
  tight: "10px"
  snug: "18px"
  rhythm: "26px"
  pane-block: "46px"
  pane-inline: "40px"
  pane-inline-narrow: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "0.68rem 1.35rem"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "0.68rem 1.35rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.68rem 1.35rem"
  download-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pane}"
    padding: "14px 16px"
  download-row-recommended:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pane}"
    padding: "14px 16px"
  window-titlebar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.window}"
    height: "52px"
    padding: "0 22px"
  stat-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px 20px"
  input-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.6rem 0.75rem"
---

# Design System: Buddling Web

## Overview

**Creative North Star: "넘어오는 창"**

이 제품은 바탕화면 위에 사는 앱입니다. 그래서 웹은 앱을 설명하지 않고 **앱이 사는
자리를 그대로 재현합니다** — 페이지 전체가 벽지 위에 떠 있는 창 한 장이고, 신호등
세 개가 달린 제목줄이 글자 한 자를 읽기 전에 "이건 바탕화면에 뜨는 것" 이라고 말해
버립니다.

**그리고 그 창은 캐릭터를 가두지 못합니다.** 이 세계관의 이름이 그냥 "창" 이 아니라
**"넘어오는 창"** 인 이유가 여기 있습니다. 히어로의 고양이는 창틀을 밟고 밖으로 나와
서 있고, 판다·토끼·강아지·오리·고양이 다섯은 화면 양 끝 모서리 뒤에서 몸을 기울여
얼굴을 내밉니다. 창이 한 번 쓰고 마는 장식이 되지 않는 것은 이 규칙 하나 덕분이고,
같은 이유로 900px 아래에서는 창틀을 아예 없앱니다 — 넘어올 틀이 없으면 틀을 두는 것도
거짓말이 됩니다.

**성격은 장난기입니다.** 다만 그 장난기는 화면이 시끄러워서 나오는 것이 아니라
**조용한 틀 위에서만 읽힙니다.** 벽지는 단 두 색의 그러데이션, 선은 전부 1px, 색은
한 점, 제목은 가늘고 한 구절만 굵습니다. 이 절제가 배경이기 때문에 창틀을 밟고 선
고양이 한 마리가 사건이 됩니다. 틀까지 함께 까불면 그 고양이는 그냥 벽지 무늬가
됩니다.

**Key Characteristics:**

- 페이지 = 앱 창 한 장. 신호등 · 제목줄 · 창 모서리가 시그니처입니다
- 캐릭터는 창 안에 갇히지 않습니다. 틀을 넘고, 모서리 뒤에서 내다봅니다
- 벽지는 **차가운 페리윙클**, 창 안은 **따뜻한 크림**. 이 온도차가 캐릭터를 살립니다
- 바깥에서 받아오는 글꼴·아이콘 팩·스크립트가 **하나도 없습니다**
- 색은 한 점만. 나머지는 잉크와 종이입니다

## Colors

차가운 벽지와 따뜻한 종이, 그 위에 주황 한 점. 팔레트가 여덟 개뿐인 것은 절약이
아니라 **캐릭터가 화면에서 유일하게 색이 많은 것**이어야 하기 때문입니다.

### Primary

- **[이름 미정]** (`#9a5d18`): 화면에서 유일한 유채색 강조입니다. 꼬리표(`.label`),
  설치 안내의 번호 마커, 초점 표시(focus ring), 추천 내려받기 줄의 테두리, 어드민
  막대의 둘째 계열에만 붙습니다. **어두운 모드에서는 `#e8b06a`** 로 밝은 쪽으로
  넘어갑니다 — 어두운 바탕에서 같은 갈색은 그냥 어두운 얼룩이 되기 때문입니다.
  **이 값은 확정이 아닙니다** (아래 "The Provisional Accent Rule").

### Neutral

- **차가운 페리윙클** (`#a9a5bd` → `#cbbfc0`): 벽지. 170도 그러데이션이고
  `background-attachment: fixed` 라 스크롤해도 움직이지 않습니다. **취향이 아니라
  계산입니다** — 캐릭터가 전부 따뜻한 색이라 크림색 바닥에서는 히어로 고양이의 ΔE 가
  1.1(사람 눈이 같은 색으로 보는 구간)이었습니다. 이 벽지에서는 30.8, 명도비 1.89 입니다.
- **종이** (`#f7f5f1`): 창 안쪽. 모든 본문이 여기 얹힙니다.
- **가라앉은 판** (`#eae6de`): 리듬을 끊는 판 **하나에만** 씁니다. 어드민에서는 채워지지
  않은 막대의 홈과 코드 조각의 바탕이 됩니다.
- **잉크** (`#2b2733`): 본문과 제목. 그리고 기본 버튼의 바탕색이기도 합니다.
- **옅은 잉크** (`#615c6e`): 부연 설명 · 메타 정보. 종이 위에서 5.9:1 입니다.
  **벽지 위에는 쓰지 않습니다** — 창 안에서만 그 대비가 성립합니다.
- **실선** (`rgba(43, 39, 51, 0.1)`): 판과 판 사이, 카드 테두리. 언제나 1px 입니다.

### Named Rules

**The One Warm Point Rule.** 유채색은 화면에 **한 점만** 있습니다. 나머지는 전부 잉크와
종이입니다. 색을 하나 더 들이고 싶어지면, 먼저 그것이 캐릭터가 가진 색과 다투지 않는지
보세요 — 이 화면에서 색을 가질 자격이 있는 것은 캐릭터입니다.

**The Cold Wall Rule.** 벽지는 차가워야 합니다. 따뜻한 쪽으로 되돌리려면 다섯 종의 ΔE
와 명도비부터 다시 재세요. 이 화면에서 바닥색은 취향이 아니라 캐릭터가 보이느냐 마느냐의
문제입니다.

**The Provisional Accent Rule.** `#9a5d18` 은 **다시 볼 값**입니다. 자리(어디에 쓰는가)는
확정이고 값만 임시입니다. 바꿀 때는 여덟 자리를 한꺼번에 보되, 어두운 모드 짝(`#e8b06a`)을
함께 옮기고 초점 표시가 벽지·종이 양쪽에서 보이는지 확인하세요.

## Typography

**Display / Body / Label Font:** 운영체제 기본 글꼴 스택
(`-apple-system` → `Apple SD Gothic Neo` → `Pretendard` → `Segoe UI` → `Malgun Gothic`)

**Character:** 글꼴을 못 고르는 대신 **굵기 대비로 성격을 냅니다.** 제목은 300 으로 가늘게
가다가 한 구절만 800 으로 튀어나옵니다 — "바탕화면 위에 **작은 친구** 한 마리" 에서
굵어지는 두 글자가 이 페이지의 목소리 전부입니다. 바깥 글꼴을 받아오지 않는 것은 첫
화면이 빨리 뜨는 것이 이 페이지에서 가장 중요한 일이고, CSP 가 애초에 막아 두었기
때문입니다.

### Hierarchy

- **Display** (300, `clamp(2.2rem, 4.6vw, 3.3rem)`, 1.14, `-0.025em`): 히어로 제목.
  `text-wrap: balance` 로 줄을 고르게 나눕니다.
- **Display Emphasis** (800, 같은 크기, `-0.03em`): 제목 안에서 딱 한 구절.
  `<em>` 을 쓰되 기울이지 않고 굵힙니다.
- **Headline** (300, `clamp(1.5rem, 2.8vw, 2rem)`, 1.25): 판 제목.
- **Headline Quiet** (300, `clamp(1.4rem, 2.4vw, 1.85rem)`): 리듬을 끊는 판 하나에서만
  쓰는 작은 판 제목. 그 판은 꼬리표도 없어서 제목이 혼자 서는데, 같은 크기로 두면
  앞뒤 판보다 커 보입니다.
- **Title** (700, `1.02rem`, 1.35): 판 안의 작은 제목, 질문, 설치 안내 소제목.
- **Lead** (400, `1.06rem`): 히어로의 첫 문단. 본문보다 한 단 위인 자리는 여기뿐입니다.
- **Body** (400, `16.5px`, 1.66): 본문. `word-break: keep-all` 로 한국어가 낱말 가운데서
  끊기지 않게 합니다. 부연은 `28~46ch` 로 묶습니다.
- **Body Strong** (700, `0.94rem`): 줄 제목과 버튼 — 본문 다음으로 무거운 것.
- **Body Small** (400, `0.9rem`): 딸린 설명 — 사실 목록의 설명, 설치 단계.
- **Caption** (400, `0.85rem`): 꼬리표성 글자 — 창 제목, 메타, 힌트, 꼬리말.
- **Label** (800, `0.72rem`, `0.16em`, 대문자): 판 위에 붙는 꼬리표. 유일하게 포인트 색을
  쓰는 글자입니다.
- **Metric** (800, `2.1rem`, `-0.03em`): 어드민 숫자판. 이 화면에서 가장 큰 글자입니다.

### Named Rules

**The One Bold Phrase Rule.** 가는 제목에 굵은 구절은 **하나**입니다. 둘이 되는 순간
어느 쪽도 강조가 아니게 됩니다.

**The Three Small Steps Rule.** 본문보다 작은 글자는 **셋뿐입니다** — `0.94` · `0.9` ·
`0.85rem`. 한때 0.82 에서 0.96 사이에 서로 다른 단이 열 개 흩어져 있었습니다. 0.5px
차이라 화면에서는 구별되지 않으면서, 새 줄을 만들 때마다 옆엣것이 몇 rem 이었는지 다시
재게 만듭니다. **넷째 단이 필요해 보이면 그건 크기가 아니라 굵기나 색으로 풀 일입니다.**

**The Malgun Fallback Rule.** Windows 한국어(`Malgun Gothic`)에는 300 이 없어 400 으로
떨어집니다. **알고 두는 것입니다** — 그 환경에서 제목이 조금 두꺼워지는 것을 받아들이는
편이, 굵기 대비라는 장치를 통째로 버리는 것보다 낫습니다.

## Layout

본문 칸은 `min(940px, 100% - 2.5rem)` 입니다(어드민만 `1080px`). 창은 이 폭으로
가운데 서고, **넓은 화면에서 남는 여백은 본문을 늘리는 데 쓰지 않고 캐릭터에게
내줍니다.**

섹션은 `.pane` 하나로 통일됩니다 — 세로 46px · 가로 40px 여백에 1px 실선으로 나뉘고,
안쪽은 `꼬리표 → 제목 → 부연 → 내용` 순서를 지킵니다. **딱 한 판만 이 규칙을 어깁니다**
(아래 The One Broken Pane Rule).

가로로 늘어놓는 것은 전부 `repeat(auto-fit, minmax(N, 1fr))` 이고 최소 폭만 다릅니다 —
사실 목록 220px, 설치 안내 280px, 질문 300px, 어드민 카드 200px. 그래서 화면이 좁아지면
알아서 한 칸으로 접힙니다.

### 화면 폭이 바꾸는 것

| 폭 | 무엇이 달라지나 |
|---|---|
| `< 900px` | **창틀이 사라집니다** — 테두리·모서리·그림자·등장 애니메이션이 전부 꺼지고 판 여백이 20px 로 줄어듭니다. 넘어올 틀이 없으므로 히어로 고양이도 함께 숨습니다 |
| `< 1180px` | 히어로 고양이가 400px → 280px 로 줄고 물리는 값도 같은 비율로 줍니다 |
| `≥ 1440px` | 빼꼼 다섯이 나타납니다. 그 아래에서는 본문 바깥 여백이 좁아 글과 부딪힙니다 |
| `≥ 1900px` | 빼꼼이 커집니다. 더 내밀지는 않습니다 — 깊이는 눈이 정하는 것이라 화면이 넓어졌다고 달라질 것이 없습니다 |

### Named Rules

**The One Broken Pane Rule.** 판이 전부 같은 리듬이면 스크롤이 지루해집니다. 그래서
**딱 한 판**(받고 나면 이 창이 열려요)만 바닥색을 바꾸고, 위 실선을 지우고, 꼬리표를
버리고, 2단으로 눕힙니다. 두 판이 어긋나기 시작하면 그건 리듬이 아니라 무질서입니다.

**The Margin Belongs to the Characters Rule.** 창은 940px 에서 멈춥니다. 남는 여백은
본문을 늘리는 데 쓰지 않습니다 — 그 자리는 빼꼼이 서는 자리입니다.

## Elevation & Depth

**그림자는 딱 하나를 위해 있습니다 — 창이 벽지 위에 떠 있다는 사실.** 나머지는 전부
1px 실선과 바닥색 차이로 나눕니다. 카드도, 판도, 입력칸도 그림자가 없습니다.

깊이가 세 겹입니다. 벽지(가장 뒤) → 창(그림자로 떠 있음) → 창을 넘어온 캐릭터(자기
그림자를 따로 가짐). 캐릭터의 그림자가 창의 그림자와 **다른 방향·다른 흐림도**를 갖는
것이 핵심입니다. 같으면 캐릭터가 창에 인쇄된 그림으로 보입니다.

### Shadow Vocabulary

- **창** (`0 40px 90px -30px rgba(20,18,26,0.45), 0 2px 6px rgba(20,18,26,0.1)`):
  멀리 퍼지는 큰 그림자 + 맞닿는 자리의 작은 그림자. 두 겹이라야 떠 있는 것으로 보입니다.
- **앱 스크린샷 액자** (`0 18px 40px -18px rgba(20,18,26,0.42)`): 창보다 얕습니다.
  창 안에 있는 것이 창만큼 떠 있으면 안 됩니다.
- **넘어온 캐릭터** (`drop-shadow(0 18px 30px rgba(20,18,26,0.28))`): 알파 모양을 따라
  지는 그림자입니다. `box-shadow` 로는 안 됩니다 — 그러면 그림 상자가 드러납니다.
- **빼꼼** (`drop-shadow(0 12px 20px rgba(43,39,51,0.22))`): 벽지 위에 지므로 더 얕고
  더 짧습니다. 어두운 모드에서는 `rgba(0,0,0,0.5)` 로 진해집니다.

### Named Rules

**The Only the Window Floats Rule.** 그림자를 쓸 수 있는 것은 창과 창을 넘어온 것뿐입니다.
카드에 그림자를 붙이고 싶어지면 1px 선이나 바닥색으로 푸세요.

**The Dark Mode Border Rule.** 어두운 모드에서는 창과 벽지의 밝기 차가 1.15:1 뿐이라
**그림자만으로는 창이 사라집니다.** 그래서 어두울 때만 테두리가 0.06 → 0.12 로 진해집니다.
어두운 모드에서 무언가를 얹을 때는 항상 이 확인부터 하세요.

## Shapes

모서리는 크기가 아니라 **위계**를 말합니다. 창 14px → 카드 12px → 판 10px → 조작
부품 8px → 잔선 4px → 막대 2px. 큰 것일수록 둥글고, 손으로 만지는 것일수록 각집니다.

테두리는 언제나 **1px 실선**이고 색은 `line` 하나뿐입니다. 굵은 색 띠, 왼쪽 강조선,
이중 테두리는 이 세계에 없습니다.

아이콘도 팩을 쓰지 않습니다. 신호등 세 개는 인라인 SVG 원 셋이고, 어드민의 펼침
화살표는 **CSS 테두리로 그린 삼각형**입니다.

### Named Rules

**The Hairline Rule.** 나누는 선은 1px 입니다. 더 두꺼운 선이 필요해 보이면 그건 선이
아니라 **바닥색을 바꿔야 할 자리**입니다 (가라앉은 판이 그렇게 나뉩니다).

## Components

### Buttons

- **Shape:** 부드럽게 각진 모서리 (`8px`)
- **Primary:** 잉크 바탕에 종이 글자, `0.68rem 1.35rem`, 굵기 700, `0.94rem`
- **Ghost:** 바탕 없이 1px 실선 테두리. 호버에서 테두리가 옅은 잉크로 진해집니다
- **Hover / Active:** 기본은 불투명도 0.9, 누르면 `translateY(1px)`.
  **바탕색을 바꾸지 않습니다** — 조용히 있다가 누를 때만 반응합니다
- **Focus:** 포인트 색 2.5px 윤곽선, 3px 띄움. 페이지 전체에서 이것 하나입니다

### Download Row

내려받기 한 줄. 이름 · 파일 크기 · 버튼이 한 줄에 서고, 테두리만 있고 바탕은 없습니다.
호버에서 1px 떠오르고 테두리가 진해집니다. **추천 항목만 테두리가 포인트 색**으로
바뀝니다 — 뱃지도, 별표도, 굵은 띠도 쓰지 않습니다. 지금 쓰는 운영체제를 알아내
`data-recommended` 를 붙이는 일은 클라이언트 스크립트가 합니다.

### Window Chrome (시그니처)

이 시스템의 서명입니다. 높이 52px, 신호등 SVG 셋(빨강 `#ff5f57` · 노랑 `#febc2e` ·
초록 `#28c840`) + 제품명 + 오른쪽 내비게이션. `position: sticky` 로 붙어 있고
`backdrop-filter: blur(14px)` 에 88% 불투명한 종이색이라, 스크롤하면 본문이 그 아래로
비쳐 지나갑니다. **언어 바꾸기 링크만 왼쪽에 1px 선을 그어 갈라 둡니다** — 그것만
페이지 안을 오가는 링크가 아니기 때문입니다.

### Cards / Panels (어드민)

종이 바탕 + 1px 실선 + `12px` 모서리 + `18~20px` 안여백. 그림자 없음. 숫자판은
꼬리표(0.78rem) → 숫자(2.1rem/800) → 부연(0.78rem) 세 줄 고정입니다.

### Inputs

종이나 가라앉은 판 바탕, 1px 실선, `8px` 모서리, `0.6rem 0.75rem` 안여백.
글꼴은 `font: inherit` 로 본문을 그대로 물려받습니다.

### Peekers (시그니처)

화면 양 끝에서 캐릭터 다섯이 모서리 뒤로 몸을 기울여 얼굴을 내밉니다. 왼쪽 → 오른쪽 →
왼쪽 지그재그이고, 히어로부터 설치 안내까지 흩어져 있어 스크롤할 때마다 한 마리씩
나타납니다. 1200ms `cubic-bezier(0.16, 0.84, 0.3, 1)` 로 **느리게** 미끄러져 들어오고,
한 번 나오면 다시 숨지 않습니다.

- **`<img>` 가 아니라 CSS 배경입니다.** 좁은 화면에서 칸이 통째로 `display:none` 이라
  어차피 안 보일 그림 145KB 를 아예 받지 않게 됩니다
- **물리는 깊이는 눈이 정합니다.** 다섯 마리 모두 바깥쪽 눈이 화면 안으로 20px 들어오는
  자리입니다. 더 깊이 물릴 수 있어도 여기서 멈춥니다 — 얼굴이 반쯤 잘린 캐릭터는
  빼꼼한 것이 아니라 표정을 잃은 것입니다
- 기우는 방향은 **그림에 이미 구워져** 있습니다. 좌우를 바꾸면 화면 바깥을 봅니다

## Do's and Don'ts

### Do

- **Do** 벽지 위에는 잉크(`#2b2733`)만, 옅은 잉크(`#615c6e`)는 창 안에서만 쓰세요.
  5.9:1 은 종이 위에서의 값입니다.
- **Do** 캐릭터를 창 밖으로 내보내세요. 창을 넘거나 모서리에 물리지 않는 캐릭터는
  이 세계관에서 할 일이 없습니다.
- **Do** 그림을 다시 뜨면 **빼꼼의 물리는 값을 다시 재세요.** 눈 위치가 조금만 움직여도
  곧바로 눈을 밟습니다 (실제로 다섯 마리가 한쪽 눈을 잃은 채 나간 적이 있습니다).
- **Do** 그림은 WebP 로, 화면에 걸릴 크기의 **두 배**로 뜨세요
  (`npm run site-images`). PNG 로 남는 것은 `og.png` 와 아이콘뿐입니다.
- **Do** 랜딩 본문은 서버 컴포넌트로 두세요. 자바스크립트가 필요한 것은 빼꼼과 받기
  단추 둘뿐이고, `scripts/check-site.js` 가 **190KB 한도**로 그걸 지킵니다.

### Don't

- **Don't** SaaS 랜딩페이지 문법을 들이지 마세요 — 보라색 그러데이션 히어로, 로고 띠,
  "신뢰받는 팀들" 줄, 3단 요금표. 이 제품은 팔 것이 아니라 받아 보라고 부르는 것입니다.
- **Don't** 업무용 협업 도구처럼 보이게 만들지 마세요. 파란 기업색 · 조직도 · 생산성
  말투로 가면 5명 정원이 기능이 아니라 **결함**으로 읽힙니다.
- **Don't** 카드 한쪽에 굵은 색 띠를 두르지 마세요. 나누는 선은 1px 하나입니다.
- **Don't** 색을 하나 더 들이지 마세요. 유채색은 화면에 한 점입니다.
- **Don't** 제목 안에서 두 구절을 굵히지 마세요. 하나가 아니면 강조가 아닙니다.
- **Don't** 바깥에서 글꼴·아이콘 팩·스크립트를 받아오지 마세요. CSP 가 막기도 하고,
  첫 화면이 빨리 뜨는 것이 이 페이지에서 가장 중요한 일이기도 합니다.
- **Don't** 벽지를 따뜻한 쪽으로 되돌리지 마세요. 그러려면 다섯 종의 ΔE 부터 다시
  재야 합니다.
