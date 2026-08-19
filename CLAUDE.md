# CLAUDE.md

이 파일은 Claude Code 가 이 저장소에서 일할 때 읽는 안내입니다.

**무엇을 만드는 프로젝트인지, 어떻게 실행하고 어떤 구조인지는
[README.md](README.md) 에 있습니다. 먼저 읽으세요.** 여기에는 README 에 없는 것,
즉 **코드를 고칠 때 지켜야 할 관례와 밟기 쉬운 함정**만 적습니다.

---

## 저장소는 워크스페이스로 나뉘어 있습니다

```
apps/desktop      Electron 앱 (예전의 저장소 루트가 통째로 여기)
packages/shared   앱·랜딩·어드민이 함께 보는 것 — @tap-tap/shared
site/ · scripts/  랜딩페이지와 거기 딸린 도구
supabase/         schema.sql
```

**명령은 루트에서 부릅니다.** 루트 `package.json` 이 알맞은 워크스페이스로 넘겨줍니다
(`npm test` → `npm run test -w tap-tap`). 설치도 루트에서 `npm ci` 한 번이면 됩니다 —
workspaces 가 의존성을 루트 `node_modules` 로 올려 두기 때문입니다.

**공유 코드는 `@tap-tap/shared/…` 로 부릅니다.** 상대경로로 넘나들지 마세요.
이 패키지는 **빌드하지 않고 소스를 그대로 내보냅니다** — 부르는 쪽이 전부 번들러라
트랜스파일은 그쪽이 합니다. 그래서 산출물이 어긋날 일이 없습니다. `tsc` 가 이걸 찾는
길은 `tsconfig.base.json` 의 `paths` 하나뿐이니, 새 하위 경로를 만들면
`packages/shared/package.json` 의 `exports` 와 함께 봐 주세요.

타입 검사는 **루트 `tsconfig.json` 이 워크스페이스 전부를 한 번에** 봅니다.
워크스페이스마다 있는 `tsconfig.json` 은 편집기가 파일 하나를 열었을 때 쓰라고 둔
것이지 검사의 기준이 아닙니다. (TypeScript 7 은 `baseUrl` 을 없앴고 `compilerOptions`
안의 주석 키도 거부하므로, 흉내 내어 넣지 마세요.)

## 자주 쓰는 명령

```bash
npm test              # 단위 테스트. 고칠 때마다 돌린다. Supabase 없이 돈다.
npm run typecheck     # 타입 검사. 화면을 고쳤으면 이것도 돌린다.
npm run lint          # oxlint. 빠르니 고칠 때마다 함께 돌린다.
npm run build         # 화면(React·TS)과 preload 빌드
npm run dev           # 화면을 고칠 때마다 다시 빌드 (창은 새로고침)
npm start             # 앱 실행 (먼저 빌드한다)
npm run start:both    # A·B 두 명인 척 동시 실행 (Ctrl+C 한 번에 둘 다 종료)
npm run check         # 실제 Supabase 를 거치는 e2e 점검 (.env 필요, 데이터는 지운다)
npm run check:site    # 랜딩페이지 점검
npm run preview       # 캐릭터 5종을 나란히 놓고 눈으로 확인
```

CI(`.github/workflows/ci.yml`)가 미는 것마다 돌리는 것은 `npm test` ·
`npm run typecheck` · `npm run lint` · `npm run build` · `npm run check:site`
다섯입니다. **이 다섯이 통과하지 않으면 끝난 게 아닙니다** — 말뿐인 규칙이 아니라,
이 잡(`check`)이 `main` 규칙셋의 필수 검사라 **빨가면 머지 자체가 막힙니다.**
(Electron 앱을 포장하는 것은 여전히 태그를 밀 때만 합니다 — 10분이 넘고 러너를
셋 잡아먹습니다.)

### 일을 시작하기 전에 의존성부터 맞춘다

**dependabot 이 올린 의존성 갱신 PR 은 세션과 세션 사이에 머지됩니다.** 사람이 누르기도
하고, 아래 "머지" 절의 기준에 따라 에이전트가 `--auto` 를 걸어 둔 것을 CI 가 초록이 되는
순간 GitHub 이 누르기도 합니다. 그래서 마지막으로 본 `main` 과 지금의
`package.json`·`package-lock.json` 이 어긋나 있을 수 있습니다. 고치기 시작하기 전에 **지나쳐 온 dependabot 커밋이 있는지
보고, 있으면 설치부터 맞추고 들어갑니다.**

```bash
git log --oneline -20 | grep -iE "deps|dependabot"
npm ci
```

이 어긋남은 조용해서 더 나쁩니다. CI 는 미는 것마다 새로 설치하므로 언제나 초록이고,
로컬 테스트도 그냥 통과합니다. 그래서 한참 뒤에 **"CI 는 되는데 로컬만 깨진다"** (또는
그 반대)로 나타나는데, 그때는 원인이 의존성이라는 것부터가 떠오르지 않습니다. 실제로
`package.json` 은 vitest `^4.1.10` 인데 `node_modules` 에는 2.1.9 가 들어 있던 적이
있습니다.

**`npm install` 이 아니라 `npm ci` 입니다.** `npm install` 은 lockfile 을 지금 쓰는 npm
버전에 맞게 **다시 쓰기 때문에**, 손대지도 않은 `package-lock.json` 이 고쳐진 채로
커밋에 딸려 들어갑니다 (optional 패키지의 `libc` 항목이 통째로 지워지는 식으로).
`npm ci` 는 lockfile 이 적어 둔 그대로만 설치하고 그 파일을 건드리지 않습니다.

**도구 버전은 `.nvmrc` 와 `package.json` 의 `packageManager` 가 정합니다.** 위 문제의
뿌리는 사람마다 npm 버전이 다른 것이라, 아예 저장소가 정해 둡니다. `.nvmrc` 에 적힌
Node 를 쓰면 그 배포본에 딸려 오는 npm 도 같아집니다 (22.23.2 → npm 10.9.8).

```bash
nvm use            # .nvmrc 를 읽는다. fnm 도 같다
node -v && npm -v  # 22.23.2 / 10.9.8 이어야 한다
```

이 컴퓨터에는 Homebrew 와 `/usr/local` 에도 node 가 깔려 있습니다. 셸에 따라 그쪽이
먼저 잡히면 버전이 조용히 갈라지므로, 작업을 시작할 때 위 두 줄로 한 번 확인하세요.
CI 도 같은 파일을 봅니다(`node-version-file: .nvmrc`). **Node 를 올릴 때는 `.nvmrc` 와
`packageManager` 를 함께 고칩니다** — 한쪽만 고치면 다시 어긋납니다.

**린터는 oxlint 입니다 (`npm run lint`). 포매터는 없습니다.** 모양은 여전히 주변 코드를
눈으로 보고 맞추세요 — 세미콜론 없음, 작은따옴표, 들여쓰기 2칸.

규칙은 `.oxlintrc.json` 에 있고 아껴서 켭니다. `correctness` 범주와, 손으로 고른 넷
(`no-undef` · `eqeqeq` · `no-shadow` · `import/no-cycle`) 뿐입니다.

**타입을 아는 규칙도 켜 둡니다** (`oxlint --type-aware`). 이것을 도는 것은
`oxlint-tsgolint` 이고, 이 저장소의 `typescript@7` 과 **같은 typescript-go** 위에
서 있어 짝이 맞습니다. 느려질까 걱정할 정도는 아닙니다 — 0.3초에서 0.6초가 됩니다.

가장 값을 하는 것은 `no-floating-promises` 입니다. **일부러 기다리지 않는 자리에는
`void` 를 적어 두세요** (`void window.loadFile(...)` 처럼). 그러면 *실수로* 빠뜨린
`await` 만 걸립니다. 이 앱은 타이머와 이벤트 처리기가 많아서 삼켜진 오류가 조용히
사라지기 쉬운 자리입니다.

**`plugins` 에 `typescript` 를 빠뜨리지 마세요.** 이 배열을 적는 순간 기본값을 통째로
덮어쓰기 때문에, 빠뜨리면 `typescript/*` 규칙이 **하나도 돌지 않으면서 오류도 안 납니다.**
실제로 한동안 그런 상태였습니다.

false positive 라 꺼 둔 것 셋이 있습니다 — `unbound-method`(이 저장소는 `this` 를 쓰지
않는 클로저를 돌려주는 방식이라 전부 헛짚습니다) · `require-array-sort-compare` ·
`no-base-to-string`. **모양을 강요하는
범주(`style`)는 켜지 않습니다** — 켜 보니 4,015건이 나왔는데 전부 `sort-keys` 처럼
이 저장소가 손으로 맞춰 둔 것과 다투는 규칙이었습니다. 포매터를 넣지 않는 이유도
같습니다. 기존 코드가 통째로 다시 포맷되면 그 diff 가 정작 볼 것을 덮습니다.

`no-undef` 가 값을 하려면 파일이 어느 세상에 있는지 알아야 합니다 (메인은 Node·CJS,
화면은 브라우저, preload 는 둘 다). 그 구분은 설정의 `overrides` 에 있습니다.
**새 폴더를 만들면 거기에도 한 줄 더해야** 합니다 — 안 하면 그 폴더의 전역 이름이
전부 "없는 이름"으로 잡힙니다.

typescript-eslint 를 쓸 수 없어서 oxlint 를 골랐습니다. 이 저장소의 `typescript` 는
7.x, 즉 Go 로 다시 쓴 네이티브 컴파일러라 기존 컴파일러 API 가 없는데,
typescript-eslint 는 최신(8.67.0)도 `typescript <6.1.0` 을 요구합니다. oxlint 는
TS 를 스스로 파싱하므로 그 제약을 받지 않습니다.

**화면은 Tailwind 로 칠합니다.** 색과 모서리는 `renderer/theme.css` 의 토큰을 이름으로
부르고(`bg-card` `rounded-row`), 여러 창에서 되풀이되는 묶음은 `renderer/ui.ts` 에
문자열로 모아 둡니다. 별도의 `.css` 파일을 새로 만들기 전에 이 두 곳을 먼저 보세요.

**이제 메인 프로세스까지 전부 빌드해서 씁니다.** 소스는 `src/` 지만 실제로 도는 것은
산출물입니다 — Electron 이 여는 것은 `dist-main/main/main.cjs`(`package.json` 의 `main`),
창이 여는 화면은 `dist-renderer/`, preload 는 `dist-preload/*.cjs` 입니다. 소스만 고치고
빌드하지 않으면 **아무것도 안 바뀐 것처럼 보입니다.** `npm start` 는 알아서 먼저 빌드합니다.

빌드는 Vite 설정 **세 벌**입니다 — 화면(`apps/desktop/vite.config.mts`) · preload
(`apps/desktop/vite.preload.config.mts`) · 메인(`apps/desktop/vite.main.config.mts`). 메인 설정은 `apps/desktop/src/main` 과
`apps/desktop/src/services` 를 훑어 **파일 하나를 파일 하나로** 떨어뜨립니다. 한 덩어리로 묶으면
`__dirname` 의 깊이가 달라져 `config.ts`·`windows.ts`·`tray.ts` 가 저장소 루트를 찾지
못하는데, 그게 **배포본에서만** 드러납니다.

---

## 랜딩페이지(apps/web) 관례

**랜딩 본문에 `'use client'` 를 들이지 마세요.** 지금 랜딩은 서버 컴포넌트로만 그려지고,
자바스크립트가 필요한 것은 둘뿐입니다 — 빼꼼 등장(`Peekers`)과 받기 단추
(`DownloadButtons`). 여기에 하나를 더하면 gzip 기준 자바스크립트가 곧바로 뜁니다.
`scripts/check-site.js` 가 **190KB 한도**로 그걸 지킵니다 (지금 170KB 안팎).

**나라말은 `lib/copy.ko.tsx`·`copy.en.tsx` 에만 있습니다.** 마크업은 `components/Landing.tsx`
한 벌뿐입니다. 예전에는 HTML 이 두 벌이라 한쪽만 고치면 조용히 어긋났습니다.

**구조화 데이터는 만들어 냅니다** (`lib/jsonld.ts`). FAQ 와 설치 단계는 화면과 같은 사전에서
나오므로 두 벌로 갈릴 수 없습니다. 설치 단계를 조각(`Step`)으로 둔 이유가 그것입니다 —
화면은 굵은 글씨로, 구조화 데이터는 맨 문장으로 같은 원본에서 나옵니다.

**주소는 `lib/site.ts` 한 곳에서 나옵니다.** 도메인을 바꿀 일이 생기면 거기만 고치세요.

**그림은 WebP 이고, 화면에 걸릴 크기의 두 배로 떠 둡니다.** 만드는 것은
`apps/desktop/scripts/make-site-images.js` 입니다 (`npm run site-images`) — 앱과 같은
캐릭터 코드로 그리므로 캐릭터가 바뀌면 다시 돌리기만 하면 됩니다. 팀 창 스크린샷만은
진짜 앱을 띄워 찍어 옮긴 뒤 `npm run site-images -- --webp-only` 로 형식을 맞춥니다.
**PNG 로 남는 것은 `og.png` 와 아이콘뿐입니다** — 링크 미리보기를 만드는 쪽에 WebP 를
못 읽는 곳이 아직 있기 때문입니다. 빼꼼 캐릭터는 `<img>` 가 아니라 CSS 배경이라
이름이 어긋나도 HTML 만 봐서는 안 걸리므로, `check-site.js` 가 스타일시트 안까지 봅니다.

**정적 export 를 쓰지 않습니다.** Next 가 RSC 페이로드를 인라인 스크립트로 넣기 때문에,
정적으로 뽑으면 CSP 의 `script-src` 에 `'unsafe-inline'` 을 열어 줘야 합니다. 대신
`middleware.ts` 가 요청마다 nonce 를 발급합니다. **이 파일을 지우면 페이지가 하얗게 뜹니다.**

---

## 글쓰기 관례

**모든 주석과 문서는 한국어 서술문입니다.** 이 저장소에서 주석은 "무엇을 하는지"가
아니라 **"왜 이렇게 했는지"** 를 적습니다. 코드를 읽으면 아는 것은 쓰지 않습니다.

```js
// 이렇게 (왜)
// 첫 프레임을 그리기 전에도 불리므로 카메라 행렬을 직접 최신화한다.
// (안 하면 화면 좌표 변환이 어긋나 클릭 영역이 캐릭터와 따로 논다)
stage.camera.updateMatrixWorld()

// 이렇게 말고 (무엇)
// 카메라 행렬을 갱신한다
stage.camera.updateMatrixWorld()
```

사용자에게 보이는 문구도 같은 톤입니다 — 기술 용어 대신 일상어를 씁니다
("렌더링 프레임 제한" 이 아니라 "가만히 있을 때 얼마나 아낄지").

**커밋 메시지만 영어입니다.** Conventional Commits 를 씁니다
(`feat:` `fix:` `chore:` `ci:`, 필요하면 `feat(power):` 처럼 범위). release-please 가
이걸 읽어 버전을 정하고 변경 목록을 씁니다. **형식을 어기면 릴리스가 어긋납니다.**

---

## 브랜치와 PR

**`main` 에 직접 밀지 않습니다.** 규칙이기도 하고, GitHub 이 실제로 막습니다 —
`main protection` 규칙셋이 걸려 있습니다.

| 걸린 것 | 뜻 |
|---|---|
| `pull_request` (승인 **0명**) | **PR 을 거치지 않은 push 는 거부됩니다.** 혼자 하는 프로젝트라 리뷰 승인은 요구하지 않습니다 |
| `required_status_checks` (`check`) | **CI 가 초록이 아니면 머지되지 않습니다.** `check` 는 `ci.yml` 의 잡 이름입니다 |
| `non_fast_forward` | 강제 push 로 역사를 덮어쓸 수 없습니다 |
| `deletion` | `main` 을 지울 수 없습니다 |

**클래식 브랜치 보호가 아니라 규칙셋(ruleset)입니다.** 그래서
`gh api repos/…/branches/main/protection` 은 **404 를 냅니다** — 보호가 없다는 뜻이
아니니 그 404 를 보고 "안 걸려 있구나" 로 읽지 마세요 (실제로 한 번 그렇게 잘못
읽은 적이 있습니다). 확인하려면 `gh api repos/hayoung-99/tap-tap/rulesets` 를 봅니다.

그래서 **"검사를 안 돌리고 넘어가기"가 불가능합니다.** 초록인지 눈으로 지키는 대신
GitHub 이 지킵니다.

### 브랜치는 코드를 고치기 전에 판다

한 줄이라도 고치기 시작하기 전에 만듭니다. 고친 뒤에 옮기려 하면 번거롭고,
`main` 위에 쌓아 봐야 밀 수 없습니다.

브랜치 하나에 담는 단위는 **따로 되돌릴 수 있어야 하는 것 하나**입니다. 커밋 수나
파일 수가 아니라 "이것만 취소하고 싶어질 수 있는가" 로 가릅니다. 랜딩 개편과
저장소 주소 변경을 한 브랜치에 담으면 랜딩만 되돌릴 방법이 없어집니다.

이름은 커밋 타입을 따릅니다 — `feat/…` `fix/…` `chore/…` `ci/…` `docs/…`

조사·로그 확인·빌드나 테스트 실행·설명처럼 **코드를 고치지 않는 일에는 만들지
않습니다.**

### 이어지는 작업은 새 PR 이 아니라 열려 있는 PR 을 갱신한다

**이게 가장 자주 어기게 되는 규칙입니다.** 같은 갈래의 추가 작업을 요구받으면
그 브랜치에 커밋을 쌓습니다. PR 은 브랜치 끝을 따라가므로 push 만 하면 저절로
갱신됩니다. 그러려면 **PR 을 연 뒤에도 그 브랜치에 머물러 있어야 합니다** —
올리자마자 `main` 으로 돌아가면 다음 작업이 갈 곳을 잃습니다.

새 PR 은 **갈래가 실제로 다른 일**일 때만 열고, 그때는 열려 있는 PR 의 브랜치가
아니라 `main` 에서 팝니다. 그러지 않으면 새 작업이 아직 머지되지 않은 것 위에
얹혀 함께 묶입니다. 애매하면 묻습니다.

| 상황 | 어떻게 |
|---|---|
| 열려 있는 PR 과 같은 갈래의 추가 작업 | 그 브랜치에 커밋 → PR 자동 갱신 |
| 갈래가 다른 일 | `main` 에서 새 브랜치 → 새 PR |
| 방금 올린 것을 되돌려 달라 | 같은 PR 에 되돌리는 커밋 |

### 올리기 전에 확인한다

`npm test` 는 언제나. 랜딩을 건드렸으면 `npm run check:site`, 화면을 바꿨으면
캡처로 눈 확인, 빌드 설정을 바꿨으면 실제 빌드까지.

PR 본문에는 **무엇을 왜 했는지와 무엇을 확인했는지**를 적습니다. 머지를 판단할
근거가 PR 안에 다 있어야 합니다. 중간에 막혔거나 검증에 실패했으면 PR 을 열지
않고 브랜치만 둔 채 상황을 알립니다.

**PR 제목도 Conventional Commits 를 따릅니다.** Squash 로 머지하면 제목이 그대로
커밋 제목이 되어 release-please 가 그것을 읽습니다. 규칙을 벗어나면 버전도 안
오르고 변경 목록에도 안 나오는데, 오류 없이 조용히 빠지므로 알아채기 어렵습니다.
(저장소가 squash 만 허용하고 머지 뒤 브랜치도 알아서 지웁니다 — `--delete-branch`
를 따로 붙일 필요가 없습니다.)

### 머지 — 결과가 뻔한 것만 에이전트가 넘긴다

**어느 쪽이든 반드시 PR 을 거칩니다.** 아래는 "PR 없이 밀어도 되는 경우"가 아니라
"열린 PR 을 누가 누르는가"의 이야기입니다.

**CI 가 초록인 것과 머지해도 좋은 것은 다릅니다.** 실제로 그랬던 적이 여러 번
있습니다 — 검사에 넣을 커밋 하나가 빠져 "머지하지 마세요"를 달아야 했던 PR(#36),
의존성 하나를 빼면서 실제 Supabase 점검 결과를 보고서야 판단할 수 있었던 PR(#40),
자바스크립트가 예상의 두 배라는 사실을 알고 받아들일지가 쟁점이던 PR(#42).
셋 다 CI 는 초록이었습니다.

그래서 에이전트가 넘기는 것은 **결과가 뻔한 것**뿐입니다.

| | 어떻게 |
|---|---|
| `chore(deps)` · dependabot 갱신 | `gh pr merge <번호> --squash --auto` |
| 오타·문구·주석만 고친 `docs:` | 같음 |
| 그 밖 전부 | **PR 을 열고 멈춘다.** 사람이 누른다 |

`--auto` 는 **에이전트가 판단해서 머지하는 것이 아닙니다.** "검사가 통과하면
들어간다"는 약속을 미리 걸어 두는 것이고, 실제로 누르는 것은 GitHub 입니다.
CI 가 빨개지면 그대로 열린 채 남습니다. 그래서 CI 가 끝나기를 지켜보고 있을
필요가 없습니다 — 걸어 두고 넘어가면 됩니다.

이게 성립하는 이유는 위의 `required_status_checks` 입니다. **필수 검사가 없으면
`--auto` 는 기다릴 것이 없어 곧바로 머지해 버립니다.** 규칙셋에서 그 항목을 빼는
날에는 이 표도 함께 되돌려야 합니다.

**`--admin` 은 쓰지 마세요.** 요구 조건을 우회하는 것이라, 에이전트가 넘겨도 되는
종류의 일에는 애초에 필요하지 않습니다.

애매하면 넘기지 않습니다. 사람이 한 번 더 보는 비용이 잘못 들어간 것을 되돌리는
비용보다 늘 쌉니다.

### 남의 작업을 쓸어 담지 않는다

이 저장소에는 사람이 병행해서 고치는 파일이 늘 남아 있습니다. **`git add -A` 를
쓰지 말고 파일을 하나씩 지정하세요.** 커밋 전에 무엇이 들어가는지 보여 주고 넘어갑니다.

작업 트리가 지저분한 상태에서 브랜치를 옮겨야 한다면, 옮기려는 두 브랜치가 건드린
파일과 지금 고쳐진 파일이 겹치는지 먼저 보세요. 겹치면 옮기지 말고 임시 worktree
에서 작업합니다.

---

## 지켜야 할 규칙

### 1. 순수 함수로 빼서 테스트한다

Electron 도 브라우저도 없이 돌릴 수 있는 계산은 별도 모듈로 빼고 `test/` 에서 검증합니다.
이미 그렇게 되어 있는 것들 — `shared/power.ts`, `renderer/pet/pacer.ts`,
`renderer/pet/tween.ts`, `renderer/pet/animations.ts`, `main/pet-size.ts`,
`main/update-check.ts`, `main/update-schedule.ts`, `main/quit.ts`, `main/write-json.ts`.

새 로직을 넣을 때 "이건 Electron 이 있어야 테스트된다" 는 생각이 들면,
대개 계산 부분을 덜 떼어낸 것입니다.

`main/session.ts` 는 `store` 와 `net` 을 인자로 받습니다. 테스트에서는 메모리 저장소와
`services/fake-net.ts` 를 꽂습니다. **이 주입 통로를 막지 마세요.**

**테스트도 타입스크립트입니다** (`test/*.test.ts`). 흉내 내는 것에는 진짜 타입을 답니다 —
`session.test.ts` 의 메모리 저장소는 `Store` 를, `fake-net` 은 `Net` 을 만족해야 합니다.
그래야 진짜 쪽 모양이 바뀔 때 **테스트가 깨지기 전에** 컴파일러가 먼저 잡습니다.

### 2. 네 언어 사전은 항상 함께 고친다

문구를 하나 추가하면 `packages/shared/src/i18n/{ko,en,ja,zh}.json` **네 개 모두** 고쳐야 합니다.
빠진 열쇠·남는 열쇠·`{빈칸}` 불일치·빈 문장을 `apps/desktop/test/i18n.test.ts` 가 잡아냅니다.

로직은 `packages/shared/src/i18n/index.ts` **한 곳에만** 있습니다. `apps/desktop/src/main/i18n.ts` 는 그 위의
얇은 껍데기로, "앱이 지금 쓰는 언어" 하나만 들고 있습니다. 예전에는 메인이 CommonJS 라
ESM 인 shared 를 부를 수 없어서 같은 로직이 두 벌이었고 한쪽만 고치면 조용히 어긋났는데,
메인도 ESM 이 된 뒤로 그 함정이 없어졌습니다. **문장을 만드는 규칙을 바꿀 일이 생기면
shared 만 고치면 됩니다.**

### 3. 오류는 문장이 아니라 열쇠로 옮긴다

통신 계층(`services/`)은 지금 어떤 말을 쓰는지 모릅니다. 그래서 문장을 만들지 않고
`error.INVITE_EXPIRED` 같은 **열쇠만** 던집니다. 문장은 `main/ipc.js` 가 만듭니다.

IPC 응답은 `{ ok, value, error }` 봉투입니다. 그냥 던지면 Electron 이
`Error invoking remote method '...'` 라는 껍데기를 씌워 사용자 화면에 그대로 보입니다.
preload 의 `call()` 이 봉투를 풀어 다시 던집니다 — 새 창을 만들면 이 패턴을 따라가세요.

### 4. 렌더 루프에 무언가 더할 때는 절전을 지난다

이 앱은 컴퓨터를 켠 순간부터 끌 때까지 떠 있습니다. **캐릭터 창의 렌더 루프에서
매 프레임 도는 일을 늘리는 것은 곧 사용자의 배터리를 쓰는 일입니다.**

`renderer/pet/pet.js` 의 루프는 세 가지를 지킵니다.

1. 창이 안 보이거나 컴퓨터가 잠들면 **아예 그리지 않는다** (`setAnimationLoop(null)`)
2. 가만히 있으면 절전 단계가 정한 프레임만 그리고 그림자를 멈춘다
3. 찔렸거나 만지는 중이면 넉넉히 그린다

새 연출을 넣는다면 `isBusy()` 에 그 상태를 더해야 저프레임에서 끊겨 보이지 않습니다.
반대로 **CSS 애니메이션으로 되는 것(말풍선·이름표)은 이 루프에 넣지 마세요** —
컴포지터가 알아서 부드럽게 돌립니다.

**이 루프에 React 를 들이지 마세요.** 캐릭터 창의 React(`pet/main.tsx`)는 캔버스와
오버레이 두 칸을 얹고 나면 다시 그리지 않습니다. 그 뒤로는 `pet.ts` 가 DOM 을 직접
만집니다. 프레임마다 상태를 건드리면 그때마다 재조정이 돌아, 위에서 아낀 것을 그대로
반납하게 됩니다.

숨긴 창의 `requestAnimationFrame` 은 **브라우저가 멈춰 주지 않습니다.** 재보면
숨겨도 CPU 가 그대로였습니다. 그래서 메인 프로세스가 `render` 채널로 직접 껐다 켭니다.

### 5. Three.js 자원은 만들면 반드시 되돌린다

캐릭터를 바꾸면 `disposeCritter()`, 음표는 수명이 끝나면 `material.dispose()`,
썸네일 렌더러는 `dispose()` + `forceContextLoss()`. 런타임에 geometry·material 을
새로 만드는 코드를 넣는다면 **어디서 해제하는지까지 같이 쓰세요.**

### 6. 같은 숫자가 세 곳에 있다

팀 3개 · 팀당 5명 · 초대코드 24시간은 아래 세 곳에 각각 적혀 있습니다.
**하나를 바꾸면 셋 다 바꿔야 합니다.**

| 곳 | 무엇 |
|---|---|
| `supabase/schema.sql` | `max_teams_per_user()` · `max_members_per_team()` · `invite_ttl()` |
| `apps/desktop/src/main/session.ts` | `MAX_TEAMS` · `MAX_MEMBERS` |
| `apps/desktop/src/services/fake-net.ts` | `MAX_TEAMS_PER_USER` · `MAX_MEMBERS_PER_TEAM` · `INVITE_TTL_MS` |

DB 는 `security definer` RPC 로만 접근합니다. 테이블은 RLS 로 잠겨 있어서
클라이언트에서 직접 select/insert 하면 아무것도 안 됩니다. 새 기능이 DB 를 건드린다면
**RPC 를 추가하고 `fake-net.js` 에 같은 규칙을 흉내 내야** 테스트가 돕니다.

---

## 밟기 쉬운 함정

- **`apps/desktop/package.json` 의 `electron` 은 캐럿 없이 정확한 버전입니다.**
  workspaces 가 `electron` 을 루트 `node_modules` 로 올려 버리는데, electron-builder 는
  앱 폴더에서 그것을 찾다 실패하고 **범위 표기(`^43.4.0`)로는 어느 바이너리를 받을지
  정하지 못합니다.** 캐럿을 도로 붙이면 `npm run dist` 가 통째로 멈춥니다
  (`Cannot compute electron version`). dependabot 은 정확한 버전도 잘 올려 줍니다.
- **`@tap-tap/shared` 는 `devDependencies` 에 있습니다.** 빌드할 때 번들에 녹아들어
  런타임에는 부르지 않기 때문입니다. `dependencies` 로 옮기면 타입스크립트 소스가
  배포본 asar 안에 그대로 실립니다.
- **preload 는 CommonJS 여야 합니다.** 창들이 `sandbox` 를 끄지 않아서, ESM 으로
  내보내면 preload 가 통째로 뜨지 않습니다. 그러면 `window.teamApi` 가 없어 **화면이
  빈 채로** 뜨는데, 오류는 눈에 잘 안 띄는 곳에만 남습니다
  (`apps/desktop/vite.preload.config.mts` 참고).
- **Vite 설정의 `base: './'` 를 건드리지 마세요.** 창은 `file://` 로 열리므로 절대경로면
  자산을 못 찾습니다. 개발 중에는 멀쩡해 보이고 **배포본에서만** 깨집니다.
- **`.env` 를 Bash 로 읽으려 하면 훅이 막습니다.** 필요하면 사용자에게 부탁하세요.
- **저장소 루트에 `config.generated.json` 이 있으면 `SUPABASE_URL=` 로 비워도 소용없습니다.**
  `main/config.ts` 가 환경변수 → `.env` → 구운 값 순으로 찾기 때문입니다. (예전에는
  `apps/desktop/src/main/` 안에 있었는데, 그 자리가 빌드 산출물 폴더가 되면서 루트로 옮겼습니다 —
  `emptyOutDir` 가 지워 버리기 때문입니다.) 오프라인
  상황을 흉내 내려면 닿지 않는 주소(`https://127.0.0.1:9`)를 주는 편이 확실합니다.
- **앱이 이미 떠 있으면 두 번째 실행은 조용히 죽습니다** (단일 인스턴스 잠금).
  로그가 비어 있으면 이걸 먼저 의심하세요. `pkill -f "tap-tap/node_modules/electron"`.
- **3D 좌표를 화면 좌표로 옮기기 전에 카메라 행렬을 손수 갱신해야 합니다.**
  첫 프레임 전에는 행렬이 낡아 있어서, 클릭 영역이 캐릭터와 50px쯤 어긋납니다.
- **Tailwind 는 `html` 에 `line-height: 1.5` 를 겁니다.** 말풍선과 이름표는 그 전부터
  브라우저 기본값(`normal`)으로 재어져 있어서, 그대로 두면 글자 칸이 한 줄만큼 두꺼워져
  이름표가 몇 px 내려앉습니다. 캐릭터 창의 겹쳐 뜨는 것들에는 `leading-[normal]` 을
  붙여 둡니다.
- **같은 성질의 유틸리티를 두 번 붙이지 마세요.** `px-[14px]` 뒤에 `px-[12px]` 를
  덧붙이면 **클래스에 적은 순서가 아니라 만들어진 CSS 의 순서**가 이깁니다. 어느 쪽이
  이길지 알 수 없으니, `renderer/ui.ts` 의 `input`·`inputCompact` 처럼 아예 다른 이름을
  두세요.
- **캐릭터 창은 `closable: false` 입니다.** 맥에서 ⌘W 로 닫히면 캐릭터가 영영
  사라지기 때문입니다. 없애는 길은 트레이의 "숨기기"와 팀 나가기뿐입니다.
- **맥에서 `activate` 는 `whenReady` 보다 먼저 옵니다.** Dock 아이콘을 눌러 앱을
  *켤* 때 그렇습니다. 그 시점에 창을 만들면 `Cannot create BrowserWindow before
  app is ready` 로 메인 프로세스가 죽고, 밖에서는 그냥 "안 열리는" 것으로만 보입니다.
  준비 전에 오는 이벤트는 흘려보내세요 (`main/main.js` 의 `activate` 처리기).
- **맥 실행 확인은 반드시 Dock 아이콘을 눌러서 합니다.** `open -a` 나 셸에서 직접
  실행하면 위의 `activate` 가 그 시점에 오지 않아 **고장이 재현되지 않습니다.**
  이걸 몰라 멀쩡하다고 판단하고 넘어간 적이 있습니다.

---

## 눈으로 확인하기

화면을 고쳤으면 스크린샷을 찍어 직접 보세요. `apps/desktop/src/main/dev-capture.ts` 가
환경변수로 상황을 만들어 주고 PNG 를 남긴 뒤 앱을 끕니다.

```bash
TAPTAP_PROFILE=shot TAPTAP_FAKE_NET=1 TAPTAP_CAPTURE=.preview/x TAPTAP_LANG=ko \
  TAPTAP_SEED="디자인팀:나영" TAPTAP_SETTINGS=1 npm start
```

쓸 수 있는 환경변수는 그 파일 맨 위 주석에 전부 적혀 있습니다.

성능이 걱정되는 변경을 했다면 실제로 재세요.

```bash
TAPTAP_METRICS=5 npm start   # 5초마다 CPU·메모리·보이는 창 수를 찍는다
```

---

## 하지 말 것

- **`main` 에 직접 밀지 마세요.** 브랜치를 파고 PR 로 올립니다 (위 "브랜치와 PR").
  **`main` 으로 가는 길은 PR 하나뿐입니다** (규칙셋이 실제로 막습니다).
  머지는 `chore(deps)` 와 문구만 고친 `docs:` 에만 CI 초록을 확인하고 누르고,
  나머지는 **PR 을 연 데까지가 할 일입니다**
  (위 "머지 — 결과가 뻔한 것만 에이전트가 넘긴다").
- **`supabase/schema.sql` 을 사용자 대신 실행할 수 없습니다.** 쿼리를 준비해 주고
  Supabase 콘솔에서 돌려 달라고 하세요.
- 릴리스는 release-please 가 만든 PR 을 머지하면 일어납니다. 태그를 직접 밀지 마세요.
- **검증용으로 띄운 앱을 정리할 때는 메인 프로세스를 먼저 죽이고 프로필 폴더를
  지우세요.** 순서가 뒤바뀌면 예약된 저장이 사라진 폴더에 쓰려다 오류창이 뜹니다.
  `TAPTAP_PROFILE` 은 `app.setPath` 로 걸리므로 메인 프로세스 명령줄에
  `--user-data-dir` 이 없습니다 — 그걸로 찾으면 헬퍼만 잡고 메인은 살아남습니다.
