# 배포 가이드

랜딩페이지 → GitHub Releases → 앱 다운로드 흐름으로 외부에 공개할 때 필요한 것들입니다.

밀 때마다 도는 검사가 따로 있습니다 — [`ci.yml`](../.github/workflows/ci.yml) 이
`main` 으로 가는 push 와 모든 PR 에서 단위 테스트와 랜딩페이지 점검을 돌립니다.
Electron 을 빌드하지는 않습니다. 빌드는 10분이 넘고, 실제로 깨지는 것은 거의 언제나
코드와 문구이기 때문입니다.

전체 그림은 이렇습니다.

```
PR 을 main 에 머지한다
        │
        ├──────────────▶ Vercel 이 랜딩페이지를 다시 올린다 (여기서 끝)
        ▼
release-please 가 "다음 릴리스" PR 을 만들어 둔다
   커밋의 feat/fix 를 읽어 버전을 정하고 변경 목록을 적는다
        │
        ▼  ← 내보낼 때가 되면 그 PR 을 머지한다 (사람이 정하는 유일한 지점)
        │
   ├── macOS 러너   → arm64 · x64 dmg/zip ─┐
   └── Windows 러너 → setup.exe            │  (초안 릴리스에 올라감)
        │                                  │
        ▼  둘 다 끝나면                    ▼
   설치 안내 + 변경 목록을 본문에 붙이고 초안을 공개로 바꾼다
        │
        ├──▶ 랜딩페이지의 받기 버튼이 새 파일을 가리킨다 (다시 배포할 필요 없음)
        └──▶ Windows 앱들이 조용히 받아 두었다가 갈아끼운다
```

---

## 0. 저장소 만들고 올리기

아직 저장소가 없다면 여기부터입니다.

**올리기 전에 반드시 확인하세요.** 공개 저장소는 한 번 올라간 것이 기록에 남습니다.

```bash
cat .gitignore | grep -x '.env'   # 아무것도 안 나오면 멈추세요
git status --porcelain | grep -E '(^|/)\.env$'   # 아무것도 안 나와야 정상입니다
```

```bash
git init
git add .
git commit -m "tap-tap 첫 공개"
git branch -M main
```

이제 GitHub 에 빈 저장소를 만듭니다. 둘 중 편한 쪽으로 하면 됩니다.

**gh CLI 로** (`brew install gh` 로 설치하고 `gh auth login` 으로 로그인한 뒤)

```bash
gh repo create tap-tap --public --source=. --remote=origin --push
```

**웹에서** — github.com/new 에서 이름 `tap-tap`, 공개(Public)로 만들고,
README·.gitignore·라이선스는 **아무것도 체크하지 않은** 채로 만듭니다. 그다음:

```bash
git remote add origin https://github.com/hayoung-99/tap-tap.git
git push -u origin main
```

> 저장소 이름이나 계정이 다르면 세 곳을 함께 고쳐야 합니다.
> `package.json` 의 `build.publish`, `src/main/update-check.js` 의 `REPO`,
> `site/download.js` 의 `REPO` 입니다.

## 1. 저장소는 공개여야 합니다

**비공개 저장소의 Release 파일은 로그인 없이 받을 수 없습니다.** 외부인이 다운로드해야 하므로
저장소(또는 최소한 릴리스를 두는 저장소)는 공개여야 합니다.

소스를 감추고 싶다면 두 가지 방법이 있습니다.

- 비공개 개발 저장소 + **릴리스만 두는 공개 저장소** 하나를 따로 둔다
- 빌드 결과물을 GitHub 대신 다른 곳(S3, Cloudflare R2, 랜딩페이지 자체)에 올린다

MVP 단계라면 **공개 저장소 + 공개 릴리스**가 가장 단순합니다.

## 2. 키는 저장소에 두지 않습니다

> **anon 키는 어차피 앱 안에 들어갑니다.** 받은 사람이 앱 파일을 열어보면 꺼낼 수 있어요.
> 저장소를 비공개로 해도 이건 막지 못합니다. 그러니 "키를 숨긴다"가 아니라
> **"키가 알려져도 안전한 구조"**로 가는 것이 맞습니다.

저장소를 공개로 두더라도 커밋 기록에 키를 남기지 마세요. 나중에 키를 바꿀 때
과거 기록까지 지울 필요가 없어집니다.

1. 리포지토리 화면에서 **Settings → Secrets and variables → Actions →
   New repository secret** 을 눌러 두 개를 등록합니다. (Variables 탭이 아니라
   **Secrets** 탭입니다)
   - `SUPABASE_URL` — `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` — `eyJ…` 로 시작하는 긴 문자열
2. **Settings → Actions → General → Workflow permissions** 에서
   - **Read and write permissions** 인지 — 릴리스를 만들려면 필요합니다
   - **Allow GitHub Actions to create and approve pull requests** 가 켜져 있는지 —
     release-please 가 릴리스 PR 을 만들려면 필요합니다
3. 릴리스를 내면 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 이
   빌드하면서 그 값을 앱에 구워 넣고 Releases 에 올립니다.

**새 버전 내는 법 — PR 하나를 머지하면 됩니다.**

main 에 무언가 머지될 때마다 release-please 가 **"다음 릴리스" PR** 을 만들어 두고
계속 갱신합니다. 커밋 메시지의 `feat:` / `fix:` 를 읽어 버전을 정하고 변경 목록을
`CHANGELOG.md` 에 적어 둡니다. 그 PR 은 **머지하기 전까지 아무 일도 하지 않습니다.**

내보낼 때가 되면 그 PR 을 머지하세요. 그 순간 태그와 릴리스가 만들어지고, 빌드가
이어서 돌고, 설치 파일이 다 올라가면 공개됩니다.

| 커밋 | 올라가는 자리 |
|---|---|
| `fix:` | patch (0.1.0 → 0.1.1) |
| `feat:` | minor (0.1.0 → 0.2.0) |
| `feat!:` 또는 본문에 `BREAKING CHANGE:` | major (0.1.0 → 1.0.0) |
| `chore:` `ci:` `docs:` `refactor:` `test:` | 올리지 않음 (변경 목록에도 안 보임) |

급할 때는 태그를 직접 밀어도 됩니다. 그 길도 그대로 열려 있습니다.

```bash
npm version patch && git push --follow-tags
```

빌드는 두 러너에서 나눠 돌고, **둘 다 끝나야** 릴리스가 공개됩니다. 그전까지는
초안(draft) 상태라 랜딩페이지에도 앱의 자동 업데이트에도 잡히지 않습니다.
설치 파일이 하나도 없는 릴리스가 최신 버전으로 잡히면 둘 다 헛걸음하기 때문입니다.

> release-please 와 빌드가 **한 워크플로 안에** 있는 이유가 있습니다.
> GITHUB_TOKEN 이 만든 태그는 다른 워크플로를 깨우지 못합니다(무한 반복을 막으려는
> GitHub 의 규칙입니다). 릴리스를 만드는 일과 빌드하는 일을 나눠 두면 빌드가 영영
> 시작되지 않습니다.

> 첫 릴리스 PR 은 `0.1.0` 을 제안합니다. `.release-please-manifest.json` 의 기준값이
> `0.0.0` 이고 지금까지 `feat:` 커밋이 있기 때문입니다. 아직 아무것도 릴리스한 적이
> 없으므로 이게 맞습니다. 버전이 마음에 안 들면 **PR 을 머지하기 전에** 그 PR 위에서
> 고치면 됩니다.

`service_role` 키는 **절대** 넣지 마세요. RLS 를 통째로 무시하는 키입니다.

## 3. anon 키가 공개됐을 때 실제로 가능한 것

실제 프로젝트에 대고 확인한 결과입니다.

| 시도 | 결과 |
|---|---|
| 남의 팀 목록 훑어보기 | **불가** — 내 기기가 속한 팀만 돌아옵니다 |
| 팀 id 를 알아도 팀 이름 바꾸기 | **불가** — 멤버가 아니면 거절 |
| 팀 id 를 알아도 남의 캐릭터 조작 | **불가** — 멤버가 아니면 거절 |
| 기기 식별자를 바꿔가며 팀 계속 만들기 | **가능** ← 남아 있는 약점 |

**팀 생성 스팸이 유일하게 열려 있는 구멍입니다.** 3개 제한은 기기당이고, 기기 식별자는
앱이 스스로 만드는 값이라 마음먹으면 무한정 만들 수 있습니다. 데이터가 아주 작아서
당장 요금이 나갈 정도는 아니지만, 공개 범위를 넓히기 전에는 아래 중 하나가 필요합니다.

- **Supabase Auth 도입** — 기기 식별자 대신 서버가 발급한 신원을 쓰면 자칭이 불가능해집니다
- **Edge Function + 캡차** — 팀 생성만 사람 확인을 거치게 합니다
- **지켜보기** — 지인 공유 수준이라면 `teams` 행 수를 가끔 확인하는 것으로 충분합니다

## 4. 키를 갈아야 할 때

남용이 확인되면 Supabase 대시보드에서 anon 키를 새로 발급하고, 새 키로 다시 빌드해
릴리스를 올리면 됩니다. **예전 버전을 쓰던 사람은 접속이 끊기므로** 랜딩페이지에
"업데이트하세요" 안내를 함께 올려 주세요.

## 5. 받는 사람이 겪는 경고 (중요)

코드 서명을 하지 않았기 때문에 처음 실행할 때 경고가 뜹니다. **랜딩페이지에 이 안내를
반드시 함께 적어 주세요.** 없으면 대부분 여기서 포기합니다.

**macOS** — "확인되지 않은 개발자" 경고

1. 받은 앱을 **응용 프로그램** 폴더로 옮깁니다
2. 앱을 **우클릭 → 열기** (더블클릭이 아니라 우클릭)
3. 뜨는 창에서 **열기**를 한 번 누르면 다음부터는 그냥 열립니다

그래도 "손상되었다"고 나오면 터미널에서:

```bash
xattr -dr com.apple.quarantine /Applications/tap-tap.app
```

**Windows** — SmartScreen "PC 보호" 경고

**추가 정보 → 실행**을 누르면 됩니다.

경고 없이 배포하려면 서명이 필요합니다 — macOS 는 Apple Developer Program(연 $99)과
공증(notarization), Windows 는 코드 서명 인증서입니다. MVP 단계에서는 위 안내로 충분합니다.

## 6. 배포 전 점검

```bash
npm test                  # Supabase 없이 도는 검사
npm run check             # 실제 Supabase 연동 점검
npm run app-icon          # 앱 아이콘 (캐릭터를 렌더해서 icns·ico 를 만든다)
npm run site-images       # 랜딩페이지 그림
npm run dist -- --mac     # 내 컴퓨터에서 빌드해 보기 (키가 없으면 멈춥니다)
```

`dist/` 에 이런 이름으로 나오면 정상입니다. 랜딩페이지가 이 이름을 보고 파일을
고르므로 규칙이 바뀌면 [`site/download.js`](../site/download.js) 도 함께 고쳐야 합니다.

```
tap-tap-0.1.0-arm64.dmg      macOS (Apple Silicon)
tap-tap-0.1.0-x64.dmg        macOS (Intel)
tap-tap-0.1.0-setup.exe      Windows
```

받는 사람은 **아무 설정도 필요 없습니다.** 앱을 열면 바로 팀을 만들 수 있어야 합니다.
"조금만 더 준비하면 돼요" 화면이 뜬다면 키가 구워지지 않은 것이니 다시 빌드하세요.

> Windows 설치 파일은 맥에서 만들 수 없습니다. GitHub Actions 의 Windows 러너가
> 만듭니다. 로컬에서는 `--mac` 만 확인하면 됩니다.

## 7. 랜딩페이지

받는 사람이 처음 닿는 곳입니다. [`site/`](../site/) 에 있고 빌드 도구가 없습니다.
HTML·CSS 파일 그대로 Vercel 에 올라갑니다.

올리기 전에 로컬에서 먼저 확인하세요. Vercel 과 같은 주소 해석 규칙과 같은 헤더(CSP
포함)로 띄우므로, 여기서 멀쩡하면 배포해도 멀쩡합니다.

```bash
npm run site         # http://localhost:4173
npm run site:open    # 브라우저까지 연다
```

```bash
cd site
npx vercel login     # 처음 한 번
npx vercel --prod
```

배포하고 나면 주소가 정해집니다. **그 주소를 다섯 곳에 반영하세요.**

| 파일 | 무엇 |
|---|---|
| `site/index.html` | canonical · hreflang · og:url · og:image · JSON-LD |
| `site/en/index.html` | 위와 같음 |
| `site/sitemap.xml` | 두 페이지의 loc |
| `site/robots.txt` | Sitemap 줄 · llms.txt 를 가리키는 주석 |
| `site/llms.txt` | 본문 안의 주소들 |

`site/sitemap.xml` 의 `lastmod` 는 **내용을 실제로 고친 날**을 적습니다. 배포할 때마다
올리면 구글이 값을 못 믿고 통째로 무시하니, 없는 것만 못합니다. 고칠 때는 양쪽
index.html 의 JSON-LD 안 `datePublished`·`dateModified` 도 같은 날짜로 함께 옮기세요.

받기 버튼은 페이지가 열릴 때 GitHub 의 최신 릴리스를 읽어 채웁니다. 릴리스가 아직
없으면 "곧 올라옵니다"로 보이고, 자바스크립트가 꺼져 있으면 릴리스 목록 페이지로
갑니다. **그래서 GitHub 이 준비되기 전에도 랜딩페이지를 먼저 띄울 수 있습니다.**

새 버전을 낸 뒤에는 랜딩페이지를 다시 배포할 필요가 없습니다. 다만 `softwareVersion`
과 앱 안의 문구가 크게 달라졌다면 한 번 훑어보세요.

## 8. 자동 업데이트

새 버전을 올리면 **Windows 사용자는 아무것도 하지 않아도 갈아탑니다.**

| | Windows | macOS |
|---|---|---|
| 새 버전 확인 | 6시간마다 | 하루 한 번 |
| 내려받기 | 조용히 알아서 | 안 함 |
| 적용 | 배너를 누르면 즉시, 안 누르면 다음 종료 때 | 사람이 직접 받아서 설치 |

**macOS 가 빠진 이유는 코드 서명입니다.** Squirrel.Mac 이 실행 중인 앱의 서명과
새로 받은 앱의 서명을 대조하기 때문에, 서명이 없으면 설치가 반드시 실패합니다.
electron-builder 문서도 못을 박아 두었습니다 — *"Code signing is a mandatory
requirement for auto-updating on macOS."* 그래서 맥에서는 아예 시도하지 않고
"새 버전이 나왔어요 · 받으러 가기" 배너만 띄웁니다. 되는 척하다 실패하는 것이
제일 나쁩니다.

### 어떻게 이어져 있나

```
                    src/main/updates.js   ← 플랫폼을 보고 길을 고른다
                       ╱               ╲
        auto-update.js                   update-check.js
     (electron-updater)                  (GitHub API 로 확인만)
        받아서 설치까지                       나왔다고 알리기만
                       ╲               ╱
                     session.setUpdate({ version, ready, url })
                                 │
                     팀 창 맨 위 배너 (list.js)
```

화면은 플랫폼을 모릅니다. `ready` 가 true 면 "지금 적용하기", false 면
"받으러 가기"를 보여줄 뿐입니다.

내려받기가 실패하면 **알림 쪽으로 흘러내립니다.** 조용히 넘어가면 4장처럼 키를
갈았을 때 사용자가 왜 연결이 끊겼는지 알 길이 없기 때문입니다.

### 받아오는 곳

앱 안의 `app-update.yml` 에 적혀 있고, 그 값은 `package.json` 의 `build.publish`
에서 빌드할 때 만들어집니다. **저장소를 옮기면 거기 한 곳만 고치면 됩니다.**

받은 파일이 진짜인지는 릴리스의 `latest.yml` 에 적힌 SHA512 로 대조합니다.
코드 서명이 없어도 받다가 깨졌거나 바뀐 파일은 걸러집니다.

> `app-update.yml` 에 `releaseType: draft` 가 적혀 나가지만 **업데이터는 그 값을
> 읽지 않습니다.** 발행할 때만 쓰는 설정입니다. 업데이터는 `/releases/latest` 를
> 보므로 초안 릴리스는 잡히지 않습니다.

### 확인하는 법

자동 업데이트는 **패키징한 앱에서만** 돕니다(`app.isPackaged`). 개발 중에는 저장소의
버전이 늘 더 높게 보여 쓸모가 없기 때문입니다. 배너 모양만 보려면:

```bash
TAPTAP_FAKE_NET=1 TAPTAP_CAPTURE=.preview/upd TAPTAP_SEED="디자인팀:나영" \
  TAPTAP_UPDATE="0.2.0:ready" npm start     # "지금 적용하기"
  TAPTAP_UPDATE="0.2.0"       npm start     # "받으러 가기"
```

진짜 흐름은 Windows 에서 **버전이 다른 두 릴리스**로 확인해야 합니다. 낮은 버전을
설치해 두고 높은 버전을 릴리스한 뒤, 앱을 켜고 몇 초 기다리면 배너가 떠야 합니다.

## 9. 앞으로 검토할 것

지금은 넣지 않았지만, 쓰는 사람이 늘면 차례로 필요해지는 것들입니다.

### 코드 서명

5장의 경고를 없애는 유일한 방법입니다. 여기서부터는 돈과 심사가 들어갑니다.

**macOS** — Apple Developer Program 연 $99

1. Developer ID Application 인증서를 발급받아 `.p12` 로 내보냅니다
2. GitHub Actions 시크릿에 넣습니다
   - `CSC_LINK` — `.p12` 를 base64 로 인코딩한 값
   - `CSC_KEY_PASSWORD` — 그 파일의 암호
   - `APPLE_ID` · `APPLE_APP_SPECIFIC_PASSWORD` · `APPLE_TEAM_ID` — 공증(notarization)용
3. `package.json` 의 `build.mac` 에 `hardenedRuntime: true` 와 entitlements 파일을 더합니다
4. electron-builder 가 서명과 `notarytool` 공증을 이어서 처리합니다

**Windows** — 코드 서명 인증서

OV 인증서는 발급이 빠르지만 SmartScreen 평판이 쌓일 때까지 경고가 남습니다. EV 는
바로 통과하지만 비쌉니다. 하드웨어 토큰이 필요 없는
**Azure Trusted Signing** 이 CI 와 붙이기 가장 편합니다.

### macOS 자동 업데이트

Windows 는 이미 받아서 설치까지 합니다(아래 "자동 업데이트" 참고). **macOS 만 남아
있고, 남은 이유가 곧 코드 서명입니다.**

서명을 붙이고 나면 고칠 곳은 한 군데입니다.

```js
// src/main/updates.js
function canAutoInstall(platform) {
  return platform === 'win32' || platform === 'darwin'
}
```

`test/update-check.test.js` 의 "macOS 에서는 시도하지 않는다" 검사도 함께 뒤집으면
됩니다. 나머지는 손댈 곳이 없습니다 — 받아 두는 것도, 배너도, 적용도 이미
플랫폼과 무관하게 짜여 있습니다.

### 팀 생성 스팸 막기

3장에 적은, 지금 유일하게 열려 있는 구멍입니다. 지인 공유를 넘어 공개 범위를
넓히기 전에 Supabase Auth 도입을 검토하세요. 통신 계층이
[`src/services/net.js`](../src/services/net.js) 인터페이스 뒤에 격리되어 있어
그 뒤만 갈아끼우면 됩니다.

### 그 밖에

- **Linux** — `package.json` 에 AppImage 타겟이 있지만 CI 에서는 만들지 않습니다.
  필요해지면 워크플로 매트릭스에 `ubuntu-latest` 를 한 줄 더하면 됩니다
- **커스텀 도메인** — 7장의 네 파일에서 주소만 바꾸면 됩니다
