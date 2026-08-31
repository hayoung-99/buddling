# 리눅스 빌드·배포 파이프라인 — 개발 설계

**근거 문서** [PRODUCT.md](../PRODUCT.md) 의 **"알고 둔 선택 → 새 버전은 되는 데까지
가져다준다"** 절 전체. 특히 세 운영체제 표(*Linux 는 Windows 와 같다 — 단, 받은 파일을
그대로 열어 쓰고 있을 때만*), *"조용히 아무 일도 하지 않는 상태를 두지 않습니다"*,
*"받는 파일은 운영체제마다 하나입니다"*, 그리고 *"Linux 에서 캐릭터가 실제로 노는 것은
따로 확인해야 합니다"*. 그리고 **"앞으로 → 당분간 하지 않는 것 — 코드 서명"** 의
마지막 문단(*이것은 macOS 하나의 사정이다*).

이 문서는 그 정의를 **어떻게 만들지**만 적습니다. 왜 그렇게 정했는지는 기획서에 있고,
둘이 어긋나 보이면 **기획서가 이깁니다.**

읽는 순서는 [CLAUDE.md](../../CLAUDE.md) → [DEVELOPMENT.md](../DEVELOPMENT.md) →
[PRODUCT.md](../PRODUCT.md) → 이 문서입니다.

---

## 한 줄

**릴리스 빌드 매트릭스에 리눅스(AppImage·x64) 한 자리를 더하고**, 앱에서는
`canAutoInstall()` 이 `'linux'` 를 **조건부로** 받아들이게 합니다 — 지금 프로세스가
정말 AppImage 로 떠 있고 그 파일이 놓인 폴더를 쓸 수 있을 때만입니다. 아니면 처음부터
알림 길로 갑니다.

```
                    startUpdates({ platform })
                              │
              canAutoInstall(platform, canReplaceHere)
                              │
        ┌─────────────────────┼─────────────────────┐
     win32                  linux                darwin
        │                     │                     │
       true       canReplaceAppImage()            false
        │            │              │               │
        │          true           false             │
        └────────────┘              └───────────────┤
                     │                              │
              auto-update.ts                 update-check.ts
           (받아 두고 "지금 적용")        (알리고 "받으러 가기")
                     │
             내려받기 실패 ──┐
             적용 실패    ──┴──→ startNotifying(immediate) 로 갈아탄다
```

---

## 1. 조사해서 확인한 것 — 이 설계의 근거

전부 `node_modules/electron-updater@6.8.9` 와 `app-builder-lib` 의 **실제 코드를 읽어**
확인한 것입니다. 추측이 아닙니다. 여기서 확인한 네 가지가 아래 설계를 그대로 정합니다.

### 1.1 리눅스에서는 "실패하면 알려 준다" 가 통하지 않는다 ★

**이 문서에서 가장 중요한 사실입니다.**

`AppImageUpdater.isUpdaterActive()` 는 `process.env.APPIMAGE` 가 없으면 `false` 를
돌려줍니다.

```js
// electron-updater/out/AppImageUpdater.js:17
isUpdaterActive() {
  if (process.env["APPIMAGE"] == null && !this.forceDevUpdateConfig) {
    if (process.env["SNAP"] == null) {
      this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage")
    } else {
      this._logger.info("SNAP env is defined, updater is disabled")
    }
    return false
  }
  return super.isUpdaterActive()
}
```

그리고 `checkForUpdates()` 는 그 경우 **오류를 내지 않고 조용히 `null` 을 돌려줍니다.**

```js
// electron-updater/out/AppUpdater.js:253
checkForUpdates() {
  if (!this.isUpdaterActive()) {
    return Promise.resolve(null)     // ← 'error' 이벤트가 없다. reject 도 안 한다
  }
  ...
}
```

지금 `auto-update.ts` 가 실패를 아는 길은 **`'error'` 이벤트 하나뿐**입니다. 그래서
그대로 `canAutoInstall()` 에 `'linux'` 를 더하면, AppImage 로 뜨지 않은 사람에게는

- 내려받기도 안 되고
- `onFailure()` 도 안 불리고
- 알림 길로 갈아타지도 않아서

**앱이 매일 아침 조용히 아무 일도 하지 않습니다.** 기획서가 *"되는 척하다 실패하는 것도
나쁘지만, 아무 말 없이 가만히 있는 것이 더 나쁘다"* 로 못 박은 바로 그 상태입니다.

→ **그래서 미리 확인합니다.** 반응형(실패를 기다림)이 아니라 선제형(시작 전에 판정)
입니다. 이것이 이 설계의 핵심 트레이드오프이고, 4장에서 다시 정리합니다.

### 1.2 갈아끼우기에 필요한 권한은 파일이 아니라 **폴더**에 있다

`doInstall()` 은 **기존 AppImage 를 먼저 지우고** 새 파일을 그 자리로 옮깁니다.

```js
// electron-updater/out/AppImageUpdater.js:72
doInstall(options) {
  const appImageFile = process.env["APPIMAGE"]
  if (appImageFile == null) throw newError("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND")
  if (!path.isAbsolute(appImageFile) || appImageFile.includes("\0")) throw newError(...)
  unlinkSync(appImageFile)                                  // ← 여기
  ...
  execFileSync("mv", ["-f", installerPath, destination])    // ← 그리고 여기
}
```

`unlink` 와 `mv` 는 **대상 파일이 아니라 그 파일이 담긴 디렉터리**에 쓰기 권한을
요구합니다. 그래서 판정은 `access(APPIMAGE, W_OK)` 가 아니라
**`access(dirname(APPIMAGE), W_OK)`** 로 해야 합니다. 이걸 헷갈리면 `/opt` 에 root
소유로 놓인 AppImage(파일 자체는 읽기 가능, 폴더는 못 씀)를 "된다" 고 잘못 판정합니다.

**`isAbsolute` 와 `\0` 검사도 그대로 따라 합니다.** 우리가 통과시킨 것을 저쪽이
`throw` 하면 다시 조용한 실패가 되므로, **판정 기준을 저쪽과 일치시킵니다.**

### 1.3 적용 실패는 `'error'` 로 오지만, 지금 코드가 그걸 버린다

`quitAndInstall()` → `BaseUpdater.install()` 은 `doInstall()` 을 `try/catch` 로 감싸고
실패하면 `dispatchError(e)` → `'error'` 이벤트를 냅니다.

```js
// electron-updater/out/BaseUpdater.js:56
try { return this.doInstall({...}) }
catch (e) { this.dispatchError(e); return false }
```

그런데 지금 `auto-update.ts` 의 처리기는 **이미 받아 둔 뒤의 오류를 통째로 무시합니다.**

```ts
// apps/desktop/src/main/auto-update.ts:50 (지금)
autoUpdater.on('error', () => {
  if (stopped || downloaded || failureReported) return   // ← downloaded 면 무조건 버린다
  ...
})
```

그래서 사람이 **"지금 적용하기" 를 눌렀는데 실패하면 아무 일도 안 일어난 것처럼
보입니다.** 배너는 그대로 "받아 뒀어요" 인 채로 남고, 눌러도 계속 아무 일이 없습니다.

이것은 **원래 윈도우에도 있던 틈**입니다(윈도우는 설치 프로그램이 따로 뜨는 구조라
드물 뿐입니다). 리눅스는 `doInstall` 이 이 프로세스 안에서 파일을 직접 만지므로
훨씬 잘 터집니다. **리눅스 때문에 고치면서 윈도우도 함께 고쳐집니다.**

### 1.4 만들어지는 산출물 이름과 갱신 정보

- `AppImageTarget` 이 `isWriteUpdateInfo: true` 로 등록하므로 **`latest-linux.yml` 이
  만들어집니다.** 채널 파일 이름은 `Provider.getChannelFilePrefix()` 가 정하는데,
  리눅스 x64 는 접미사가 없어 정확히 `latest-linux.yml` 입니다
  (arm64 라면 `latest-linux-arm64.yml`). **맥의 `latest-mac.yml`·윈도우의 `latest.yml`
  과 이름이 겹치지 않습니다** — 세 잡이 같은 초안 릴리스에 올려도 서로 덮어쓰지
  않습니다.
- `appendBlockmap()` 이 돌아 `.blockmap` 도 함께 올라갑니다(차등 내려받기용).
- **파일 이름의 arch 는 `x64` 가 아니라 `x86_64` 입니다.**
  `getArtifactArchName(arch, ext)` 가 AppImage·rpm·flatpak 에 대해서만 `x86_64` 로
  바꿉니다. 즉 산출물은 **`buddling-{version}-x86_64.AppImage`** 입니다. 맥의
  `buddling-{version}-x64.dmg` 와 헷갈리지 마세요. **받기 안내에 적을 이름이 이것입니다.**
  (`linux.artifactName` 을 우리가 직접 적어 두었기 때문에 `isUserForced` 가 true 가
  되어, 기본 아키텍처라도 arch 가 생략되지 않습니다 — `platformPackager.js:549`.)
- **빌드에 apt 로 따로 깔 것이 없습니다.** `toolsets.appimage` 를 지정하지 않았으므로
  `buildLegacyFuse2AppImage()` 길로 가는데, 여기 쓰이는 `mksquashfs` 와 런타임은
  `getAppImageTools()` 가 내려받습니다. 시스템 FUSE 도 빌드 시점에는 필요 없습니다.
- **`build/icon.png` 는 이미 있습니다** (512×512 RGBA). electron-builder 의 최소
  요구(256×256)를 넘습니다. 새로 만들 필요가 없습니다.

---

## 2. CI — 릴리스 매트릭스에 리눅스를 더한다

### 2.1 무엇을 고치나

`.github/workflows/release.yml` 의 `build` 잡 하나만 고칩니다. `prepare` · `publish` ·
`refresh` 는 손대지 않습니다.

```yaml
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            target: --mac --arm64 --x64
            optional: false
          - os: windows-latest
            target: --win --x64
            optional: false
          # 리눅스는 이번이 처음이라 한동안 나머지 둘의 발목을 잡지 않게 둔다 (2.2 참고)
          - os: ubuntu-latest
            target: --linux --x64
            optional: true

    runs-on: ${{ matrix.os }}
    continue-on-error: ${{ matrix.optional }}
```

`steps` 는 **한 줄도 고치지 않습니다.** 지금 단계들(checkout → setup-node →
`npm ci` → `npm test` → `npm run build` → `bake-config` → `electron-builder`)이 전부
운영체제와 무관하게 돕니다. `scripts/bake-config.js` 도 순수 Node 입니다.

`optional: false` 를 맥·윈도우에도 **명시적으로 적습니다.** `include` 항목마다 키가
다르면 GitHub 이 없는 키를 `null` 로 채우고, `continue-on-error: ${{ null }}` 이
어떻게 평가되는지에 기대는 것보다 값을 적어 두는 편이 읽기에도 낫습니다.

### 2.2 리눅스만 실패했을 때 나머지는 나가게 한다

**사용자가 승인한 결정입니다.** 지금 `publish` 잡은 이렇게 걸려 있습니다.

```yaml
  publish:
    needs: [prepare, build]
    if: always() && needs.build.result == 'success'
```

`fail-fast: false` 는 **다른 leg 을 취소하지 않을 뿐**, 실패한 leg 이 있으면 `build`
잡의 결과는 여전히 `failure` 입니다. 그러면 `publish` 가 건너뛰어지고 **릴리스가 초안인
채로 멈춥니다.** 초안은 `/releases/latest` 에 안 잡히므로, 랜딩페이지의 받기 버튼도
이미 깔린 앱의 자동 업데이트도 새 버전을 못 봅니다. 워크플로 맨 위 주석이 경고하는
바로 그 상태입니다.

리눅스는 이번이 첫 빌드라 무엇이 어긋날지 모르는 자리인데, 여기서 걸린다고 **멀쩡히
만들어진 맥·윈도우 파일까지 못 나가게 하는 것은 손해가 큽니다.**

`continue-on-error: true` 인 leg 은 실패해도 **conclusion 이 `success`** 로 보고되고,
`needs.<job>.result` 는 conclusion 을 봅니다. 그래서 리눅스만 깨지면 맥·윈도우는
그대로 공개되고, 그 버전에서 리눅스 파일만 빠집니다.

**되돌릴 조건까지 여기 적어 둡니다.** 리눅스 빌드가 **연속 세 번 성공**하고 나면
`optional: true` 를 지우고 나머지 둘과 같이 다룹니다. 그때부터는 리눅스 파일이 빠진
릴리스가 나가는 편이 더 나쁩니다(받기 안내에는 적혀 있는데 파일이 없는 상태). 지우는
것은 위 두 줄(`optional` 키와 `continue-on-error` 줄)뿐입니다.

**이 임시 상태의 대가는 "조용함" 입니다.** 리눅스가 깨져도 워크플로는 초록으로 보입니다.
그래서 **릴리스를 낸 뒤에는 그 릴리스에 `.AppImage` 와 `latest-linux.yml` 이 실제로
올라갔는지 눈으로 확인하는 것을 절차에 넣습니다** (5장의 `docs/RELEASE.md` 항목).

### 2.3 기존 맥·윈도우 빌드에 부작용이 없는지

| 걱정 | 확인한 것 |
|---|---|
| 산출물 이름이 겹치나 | 안 겹칩니다. `-x86_64.AppImage` vs `-x64.dmg`/`-arm64.dmg` vs `-setup.exe` |
| 갱신 정보 파일이 겹치나 | 안 겹칩니다. `latest-linux.yml` / `latest-mac.yml` / `latest.yml` (1.4) |
| 같은 초안 릴리스에 셋이 동시에 올리다 부딪히나 | 지금도 맥·윈도우 둘이 동시에 올리고 있습니다. 리눅스가 하나 더 붙는 것뿐이고, 파일 이름이 전부 다릅니다 |
| `package.json` 의 맥·윈도우 설정이 바뀌나 | **한 글자도 안 바뀝니다.** `build.linux` 는 이미 있던 것을 그대로 씁니다 |
| `--linux` 가 다른 타깃을 함께 만드나 | `build.linux.target` 이 `["AppImage"]` 하나뿐입니다. deb·rpm·snap 은 안 만들어집니다 (기획서의 "형식을 늘리지 않는다") |
| 러너를 더 쓰나 | 잡이 둘에서 셋이 됩니다. ubuntu 러너는 맥·윈도우보다 싸고 빠릅니다 |
| `npm test` 가 리눅스에서 도나 | 도는 테스트 전부가 Electron·브라우저 없이 순수 계산만 합니다. 새로 더할 테스트도 같습니다 (3.4) |

**`package.json` 은 안 고칩니다.** `build.linux` 는 이미 필요한 것을 전부 담고 있습니다.

---

## 3. 앱 — 리눅스에서 새 버전을 가져다주는 길

### 3.1 새 파일: `apps/desktop/src/main/appimage.ts`

지금 프로세스가 **갈아끼울 수 있는 AppImage 로 떠 있는지**를 판정합니다. 규칙 1(순수
함수로 빼서 테스트한다)을 따라, 환경을 읽는 부분과 판정하는 부분을 나눕니다.

```ts
/**
 * 지금 프로세스가 **갈아끼울 수 있는 AppImage** 로 떠 있는지 본다.
 *
 * 왜 미리 보는가: electron-updater 는 AppImage 가 아닐 때 오류를 내지 않고
 * `checkForUpdates()` 에서 조용히 null 을 돌려준다(AppUpdater.js:253). 그래서
 * "일단 해 보고 실패하면 알림으로 갈아탄다" 는 길이 리눅스에서는 통하지 않는다 —
 * 갈아탈 신호 자체가 오지 않아 매일 아침 아무 일도 일어나지 않는다.
 * 기획서가 금지한 "조용히 아무 일도 하지 않는 상태" 가 바로 이것이다.
 *
 * 판정 기준은 electron-updater 쪽과 **일부러 똑같이** 맞춰 두었다.
 * 우리가 통과시킨 것을 저쪽이 throw 하면 다시 조용한 실패가 되기 때문이다.
 */

import { accessSync, constants } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

export interface AppImageEnvironment {
  /** `process.env.APPIMAGE` — AppImage 로 떴을 때만 런타임이 넣어 준다 */
  appImagePath?: string
  /** `process.env.SNAP` — snap 으로 떴으면 electron-updater 가 스스로 꺼진다 */
  snapPath?: string
  /** 그 폴더에 쓸 수 있는가. 테스트가 갈아 끼운다 */
  canWriteDir: (dir: string) => boolean
}

/** 진짜 환경을 읽는다. 이 함수만 바깥세상을 안다. */
function readAppImageEnvironment(): AppImageEnvironment {
  return {
    appImagePath: process.env.APPIMAGE,
    snapPath: process.env.SNAP,
    canWriteDir(dir) {
      try {
        accessSync(dir, constants.W_OK)
        return true
      } catch {
        // 없는 폴더 · 권한 없음 · 읽기 전용 마운트 — 어느 쪽이든 갈아끼울 수 없다
        return false
      }
    },
  }
}

function canReplaceAppImage(env: AppImageEnvironment): boolean {
  // snap 은 스토어가 갱신을 맡는다. electron-updater 도 여기서 스스로 꺼진다
  if (env.snapPath) return false

  const path = env.appImagePath
  // 압축을 풀어 AppRun 을 직접 실행했거나, AppImage 가 아예 아니다
  if (!path) return false

  // doInstall() 이 똑같은 검사를 하고 던진다 (AppImageUpdater.js:77)
  if (!isAbsolute(path) || path.includes('\0')) return false

  /*
   * **파일이 아니라 폴더의 권한을 본다.** doInstall() 은 기존 파일을
   * `unlinkSync` 로 지운 뒤 새 파일을 `mv` 로 그 자리에 놓는데, 둘 다 대상 파일이
   * 아니라 담긴 디렉터리에 쓰기 권한을 요구한다. 파일 권한을 보면 /opt 에 root
   * 소유로 놓인 AppImage 를 "된다" 고 잘못 판정한다.
   */
  return env.canWriteDir(dirname(path))
}

export { canReplaceAppImage, readAppImageEnvironment }
```

**린터**: `.oxlintrc.json` 의 `overrides` 는 `src/main` 을 이미 Node 세상으로 잡고
있으므로 새 항목을 더할 필요가 없습니다(새 **폴더**를 만들 때만 필요합니다).

### 3.2 `updates.ts` — 리눅스를 조건부로 받아들인다

`canAutoInstall()` 이 지금은 플랫폼 문자열 하나만 봅니다. 여기에 **리눅스일 때만 부르는
판정 함수**를 주입받게 바꿉니다. 윈도우·맥은 그 함수를 아예 부르지 않으므로, 리눅스가
아닌 곳에서 `process.env.APPIMAGE` 를 들여다보는 일이 없습니다.

```ts
/** 이 플랫폼에서 받아서 설치까지 할 수 있는가 */
function canAutoInstall(platform: string, canReplaceHere: () => boolean): boolean {
  if (platform === 'win32') return true
  // 리눅스는 "AppImage 로 떠 있고 그 자리를 손댈 수 있을 때만" 이다 (appimage.ts)
  if (platform === 'linux') return canReplaceHere()
  return false
}
```

`UpdatesOptions` 에 한 줄 더합니다.

```ts
export interface UpdatesOptions {
  currentVersion: string
  platform: string
  onUpdate: (info: UpdateInfo) => void
  readLastDay: () => string | null
  writeLastDay: (day: string) => void
  /**
   * 리눅스에서 지금 자리를 갈아끼울 수 있는지. 리눅스가 아니면 불리지 않는다.
   * 테스트가 갈아 끼운다.
   */
  canReplaceHere?: () => boolean
}
```

기본값은 진짜 환경을 봅니다.

```ts
canReplaceHere = () => canReplaceAppImage(readAppImageEnvironment()),
```

그리고 분기 한 줄만 바뀝니다.

```ts
  if (!canAutoInstall(platform, canReplaceHere)) {
    const watcher = startNotifying()
    return { stop: watcher.stop, install() {} }
  }
```

`appimage.ts` 는 **파일 맨 위에서 정적으로 `import`** 해도 됩니다 — `node:fs`·`node:path`
만 쓰므로 `auto-update.ts` 처럼 늦게 읽을 이유가 없습니다.

**`main.ts` 는 안 고칩니다.** 이미 `platform: process.platform` 을 넘기고 있고,
`electronApp.isPackaged` 가드도 그대로 맞습니다.

**파일 맨 위 주석을 갱신하세요.** 지금 이렇게 적혀 있는데 사실과 어긋나게 됩니다.

```
 *   Windows   받아서 설치까지 한다        → auto-update.js
 *   그 밖     새 버전이 나왔다고 알린다   → update-check.js
```

→ 세 갈래로 다시 씁니다: Windows 는 언제나, Linux 는 AppImage 로 떠 있을 때만,
macOS 는 서명이 없어 절대 안 됨. 그리고 *"서명을 붙이는 날 `canAutoInstall()` 에
'darwin' 을 더하면 된다"* 는 문장도 새 시그니처에 맞게 손봅니다.

### 3.3 `auto-update.ts` — 적용 실패도 알림으로 떨어뜨린다

1.3 에서 확인한 틈을 막습니다. **"받아 둔 뒤에 그냥 난 오류" 와 "적용을 시도했다가
난 오류" 를 가릅니다.**

```ts
  let stopped = false
  let downloaded = false
  let failureReported = false
  let installAttempted = false     // ← 새로 생기는 것

  autoUpdater.on('error', () => {
    if (stopped || failureReported) return
    /*
     * 받아 둔 뒤에 그냥 난 오류는 무시한다 — 적용은 여전히 할 수 있다.
     * 다만 **적용을 눌렀다가 난 오류는 버리면 안 된다.** 리눅스의 doInstall 은
     * 이 프로세스 안에서 파일을 직접 지우고 옮기므로(권한·디스크) 실패할 수 있고,
     * 그대로 두면 사람이 "지금 적용하기" 를 눌러도 아무 일이 없는 것처럼 보인다.
     */
    if (downloaded && !installAttempted) return
    failureReported = true
    onFailure()
  })
```

그리고 `install()` 에서 표시를 남깁니다.

```ts
    /** 지금 갈아끼운다. 앱이 꺼졌다가 새 버전으로 다시 뜬다. */
    install() {
      if (!downloaded) return
      // 이 뒤로 오는 오류는 "적용 실패" 다. 위 처리기가 알림 길로 갈아탄다
      installAttempted = true
      // (조용히 설치, 끝나면 다시 실행)
      autoUpdater.quitAndInstall(true, true)
    },
```

`updates.ts` 의 `onFailure` 는 **고칠 것이 없습니다.** 이미
`if (!fallback) fallback = startNotifying(true)` 이므로, 적용 실패도 곧바로 한 번
확인해서 배너를 *"새 버전 {version} 이 나왔어요 · 받으러 가기"* 로 바꿔 줍니다.
`isNewer()` 는 여전히 참입니다(우리는 아직 옛 버전이니까). 화면 쪽은
`session.setUpdate()` 가 덮어쓰므로 손댈 것이 없습니다.

**`autoInstallOnAppQuit` 은 리눅스에서도 `true` 로 둡니다.** 기획서 표가 *"Linux 는
Windows 와 같습니다"* 이므로 "안 눌러도 다음에 끌 때 적용" 까지 같아야 합니다.
다만 **종료 워치독과의 경합**을 알고 둡니다.

- electron-updater 는 `app.once('quit')` 에 설치를 겁니다(`ElectronAppAdapter.js:37`).
- 우리 종료 경로는 `before-quit` → `shutdown()` 에서 `armWatchdog()` 을 걸고,
  `QUIT_WATCHDOG_MS`(2초) 안에 안 끝나면 `app.exit(0)` 을 부릅니다.
- `app.exit()` 은 `will-quit`·`quit` 을 **내지 않습니다.** 그래서 종료가 2초를 넘기면
  그 판의 자동 적용은 건너뛰어집니다.

**잃는 것은 없습니다.** 받아 둔 파일은 캐시에 남아 다음에 켤 때 `update-downloaded` 가
다시 나오고 배너도 다시 뜹니다. 그리고 `unlinkSync`·`execFileSync` 는 동기라 그 사이에
타이머가 끼어들 수 없으므로, **반쯤 지워진 상태로 끝나는 일은 없습니다.** 워치독 시간을
늘리지 마세요 — 그 숫자는 다른 설계([quit-fully-terminates.md](quit-fully-terminates.md))
가 정한 것이고, 여기 사정으로 건드리면 그쪽이 깨집니다.

### 3.4 새 테스트: `apps/desktop/test/updates.test.ts`

지금 `canAutoInstall()` 에는 테스트가 **하나도 없습니다.** 리눅스가 붙으면서 이 함수가
분기 셋짜리가 되므로 여기서 만듭니다. `updates.ts` 는 `electron` 을 부르지 않고
`auto-update.ts` 는 동적 `import` 라 읽히지 않으므로, 그냥 import 해도 됩니다.

**`canAutoInstall`**

| 넣는 것 | 나와야 하는 것 |
|---|---|
| `'win32'`, 아무 함수 | `true`, 그리고 **그 함수가 안 불려야 한다** |
| `'darwin'`, 아무 함수 | `false`, 그리고 **그 함수가 안 불려야 한다** |
| `'linux'`, `() => true` | `true` |
| `'linux'`, `() => false` | `false` |

**`canReplaceAppImage`** (전부 `canWriteDir` 를 주입해서 파일 시스템 없이)

| 상황 | 넣는 것 | 나와야 하는 것 |
|---|---|---|
| 정상 | `appImagePath: '/home/me/Apps/buddling-1.0.0-x86_64.AppImage'`, 폴더 쓸 수 있음 | `true` |
| 압축을 풀어 실행 | `appImagePath: undefined` | `false` |
| 빈 문자열 | `appImagePath: ''` | `false` |
| snap | `appImagePath` 는 있고 `snapPath: '/snap/...'` | `false` |
| 상대경로 | `appImagePath: 'buddling.AppImage'` | `false` |
| NUL 이 낀 경로 | `appImagePath: '/home/me/bud\0dling.AppImage'` | `false` |
| 손댈 수 없는 자리 | `/opt/buddling.AppImage`, 폴더 못 씀 | `false` |
| 폴더 판정에 넘기는 값 | 정상 경로 | `canWriteDir` 가 **`'/home/me/Apps'`** 로 불려야 한다 (파일 경로가 아니라 폴더) |

마지막 줄이 1.2 를 지키는 잠금장치입니다. 파일 권한을 보게 바뀌면 여기서 깨집니다.

**`auto-update.ts` 는 이번에도 테스트하지 않습니다.** `electron-updater` 를 직접
붙들고 있어서 모듈을 통째로 흉내 내야 하는데, 얻는 것보다 드는 것이 큽니다. 대신
바뀌는 로직이 불린값 세 개짜리 판정뿐이라 위 주석으로 근거를 남깁니다.

### 3.5 손댈 필요가 없는 것

- **네 나라말 사전** — 새 문구가 없습니다. 리눅스는 이미 있는
  `update.available`·`update.action`·`update.ready`·`update.restart` 를 그대로 씁니다.
  (규칙 2 에 걸리지 않습니다.)
- **`@buddling/shared`** — `UpdateInfo` 모양(`version`·`ready`·`url`)이 그대로입니다.
- **화면(renderer)** — 배너는 `ready` 값만 보고 갈라집니다. 리눅스가 어느 길로 가든
  화면에는 이미 있는 두 모습 중 하나로 도착합니다.
- **`supabase/schema.sql`** — 서버가 관여하지 않습니다.
- **`fake-net.ts`** — DB 를 안 건드립니다.
- **랜딩페이지(`apps/web`)** — 기획서가 정한 경계입니다. `DownloadButtons` 는 리눅스에
  `null` 을 돌려주어 전체 릴리스 목록으로 보내는데, **지금은 그게 맞는 동작입니다.**
  캐릭터 창이 리눅스에서 실제로 노는 것을 눈으로 본 뒤에 손댑니다.

---

## 4. 왜 이 방법인가 — 검토한 대안

### 4.1 실패를 기다릴 것인가, 미리 볼 것인가 ★

| | 어떻게 되나 |
|---|---|
| **반응형** — `canAutoInstall` 에 `'linux'` 를 그냥 더하고, 실패하면 `onFailure` 로 갈아탄다 | **못 씁니다.** AppImage 가 아닐 때 `checkForUpdates()` 가 오류 없이 `null` 을 돌려주므로(1.1) `onFailure` 가 영영 안 불립니다. 매일 아침 조용히 아무 일도 안 일어납니다 |
| **선제형** ← 고른 것 | 앱을 켤 때 한 번 판정해서 길을 정합니다. 조용히 사라지는 경우가 아예 안 생깁니다 |

**고를 여지가 없었습니다.** 반응형은 취향 문제가 아니라 **작동하지 않습니다.** 다만
이 사실은 코드를 읽어야만 보이고, 나중에 누군가 "판정이 군더더기 아닌가" 하고 지울 수
있어서 1.1 에 근거를 통째로 옮겨 적어 두었습니다.

**대가**: 판정을 앱 시작 때 **한 번만** 합니다. 도중에 사람이 AppImage 를 다른 데로
옮기면 판정이 낡습니다. 그 경우 내려받기까지 하고 적용에서 실패하는데, 3.3 이 그
경로를 알림으로 떨어뜨리므로 **여전히 조용하지 않습니다.** 켤 때마다 다시 보는 것으로
충분하고, 매번 `accessSync` 를 도는 것은 값이 없습니다.

### 4.2 `SNAP` 을 왜 우리도 보나

electron-updater 가 이미 snap 에서 스스로 꺼집니다(1.1 의 `else` 가지). 그런데 그
"꺼짐" 도 **조용한 `null`** 이라 우리에게는 1.1 과 똑같은 문제입니다. 그래서 우리도
같은 조건을 봅니다. AppImage 를 snap 으로 다시 포장해 쓰는 사람은 드물지만, 판정 기준을
저쪽과 맞춰 둔다는 원칙(1.2)이 여기에도 그대로 적용됩니다.

### 4.3 리눅스 형식을 늘리지 않는 것

기획서가 정한 것입니다(*"받는 파일은 운영체제마다 하나입니다"*). 기술적으로도 근거가
있습니다 — `main.js:50-70` 을 보면 electron-updater 는 `package-type` 파일을 보고
deb·rpm·pacman 용 업데이터로 갈아탑니다. 그 셋은 **패키지 관리자를 통해 설치**하므로
sudo 가 필요하고 조용한 갱신이 안 됩니다. 형식을 늘리면 기획서가 경고한 *"같은 리눅스인데
사람마다 다르게 구는 앱"* 이 코드 수준에서 실제로 생깁니다.

### 4.4 `autoInstallOnAppQuit` 을 리눅스에서 끄는 안

3.3 에서 본 워치독 경합을 아예 없애려면 리눅스에서만 `false` 로 두고 "지금 적용하기"
버튼으로만 갈아끼우는 길이 있습니다. **안 골랐습니다** — 기획서 표가 *"Linux 는
Windows 와 같습니다"* 라고 정했고, 경합이 실제로 걸리는 것은 **종료가 이미 2초 넘게
막혀 있는 드문 경우**뿐이며, 그때도 잃는 것 없이 다음 날 다시 제안되기 때문입니다.
일어나지도 않을 일 때문에 두 운영체제의 동작을 갈라 두는 편이 나쁩니다.

---

## 5. 문서 — 받기 안내

기획서: *"받기 안내에는 **셋 다** 적혀 있어야 합니다 — 하나만 빠져도 그 사람에게는 앱이
열리지 않는 것으로 끝납니다."*

### 5.1 `docs/release-notes.md` (릴리스 본문이 되는 파일)

세 곳을 고칩니다.

1. **"무엇을 받아야 하나요" 표에 한 줄 추가.**
   `| Linux (x86_64) | `buddling-{version}-x86_64.AppImage` |`
   **파일 이름을 정확히 `x86_64` 로 적으세요** (1.4). 여기가 틀리면 받는 사람이 없는
   파일을 찾습니다.
2. **"처음 열 때 경고가 뜹니다" 에 `### Linux` 절 추가.** macOS·Windows 절 다음입니다.
   리눅스는 경고를 넘기는 것이 아니라 **실행해도 된다고 한 번 표시해 주는** 절차라는
   점을 분명히 씁니다.

   ```markdown
   ### Linux

   1. 받은 파일을 마우스 오른쪽으로 누르고 **속성 → 권한**에서
      **"프로그램으로 실행 허용"**을 켭니다 (터미널이 편하면
      `chmod +x buddling-{version}-x86_64.AppImage`)
   2. 두 번 눌러 엽니다

   받은 파일을 **내가 지울 수 있는 자리에 그대로 두세요** — 홈 폴더나 다운로드
   폴더면 됩니다. 압축을 풀어서 열거나 `/opt` 처럼 손댈 수 없는 자리에 두면, 새
   버전을 조용히 받아 두지 못하고 "새 버전이 나왔어요" 안내만 뜹니다.
   ```

3. **"다음 버전부터는" 절 고치기.** 지금 *"Windows 는 자동으로 업데이트됩니다"* 로
   시작하는데, **Windows 와 Linux** 로 바꾸고 위 단서를 한 문장으로 덧붙입니다.

### 5.2 `README.md`

**승인된 방향: 맥·윈도우와 나란히 적되, 캐릭터 창이 아직 확인 전이라는 단서를 답니다.**
파일은 실제로 나가는데 안내에 없으면 받은 사람이 무엇을 해야 할지 알 수 없습니다.
기획서가 막은 것은 **랜딩페이지**가 리눅스를 앞세우는 것이고, 저장소 안내는 그 이야기에
들어 있지 않습니다.

네 곳입니다.

1. **10행** — `무료 · 가입 없음 · macOS와 Windows` → `무료 · 가입 없음 · macOS · Windows · Linux`
2. **"받기" 표(40–44행)** — `| **Linux** | 받아서 바로 여는 파일 하나예요 (x86_64) |`
3. **"처음 한 번만"(55–75행)** — `**Windows**` 다음에 `**Linux**` 절. 5.1 의 2번과
   같은 내용을 README 말투(높임말·짧은 문장)로 씁니다.
4. **"새 버전은 어떻게 받나요?"(204–206행)** — Linux 를 Windows 쪽에 넣고, 받은 자리를
   그대로 두어야 한다는 단서를 답니다.

그리고 **"받기" 절 끝에 한 줄**을 답니다.

> **Linux 는 아직 갓 나왔어요.** 파일은 정상으로 만들어지지만, 캐릭터가 바탕화면 위에
> 제대로 뜨는지는 아직 확인하지 못했습니다. 이상하면 알려 주세요.

**랜딩페이지(`apps/web`)는 손대지 않습니다.** 기획서의 경계입니다.

### 5.3 `docs/RELEASE.md`

**릴리스를 낸 뒤 확인 절차에 한 줄 더합니다** — 2.2 의 대가를 여기서 갚습니다.

> 리눅스 빌드는 당분간 실패해도 워크플로가 초록입니다. 공개된 릴리스에
> `buddling-{version}-x86_64.AppImage` 와 `latest-linux.yml` 이 **둘 다** 올라갔는지
> 눈으로 확인하세요. `latest-linux.yml` 이 빠지면 리눅스 쪽 자동 업데이트가 조용히
> 멈춥니다.

(이 파일은 저장소에 올라갑니다 — `docs/RELEASE.md` 는 `CLAUDE.md` 가 말하는 "올리지
않는 둘"에 들어 있지 않습니다. 다만 `apps/desktop/src/main/updates.ts` 주석이 그것을
"로컬 문서" 라고 잘못 적어 둔 자리가 `release.yml` 맨 위 주석에 있는데, **이번 범위가
아니므로 고치지 않습니다.**)

### 5.4 `docs/DEVELOPMENT.md`

- **"배포하기" 절의 요약 목록(347–349행)** — *"Windows 는 자동으로 업데이트됩니다"*
  항목을 세 운영체제로 다시 씁니다. 리눅스의 조건부(AppImage 로 떠 있을 때만)를 한
  문장으로 넣고, 자세한 것은 이 문서로 링크합니다.
- **"기능별 설계 문서" 표에 한 줄** — 아래 6장.

---

## 6. 구현 순서

되돌리기 쉬운 것부터, 그리고 각 단계가 혼자서도 말이 되게.

1. `apps/desktop/src/main/appimage.ts` 를 만들고 `test/updates.test.ts` 에
   `canReplaceAppImage` 몫을 먼저 씁니다 (규칙 1 — 순수 함수부터).
2. `updates.ts` 의 `canAutoInstall` 시그니처를 바꾸고 나머지 테스트를 채웁니다.
   파일 맨 위 주석을 세 갈래로 다시 씁니다 (3.2).
3. `auto-update.ts` 에 `installAttempted` 를 넣습니다 (3.3).
4. `npm test` · `npm run typecheck` · `npm run lint` 를 돌립니다.
5. `.github/workflows/release.yml` 매트릭스에 리눅스를 더합니다 (2.1–2.2).
6. 문서 넷을 고칩니다 (5장).
7. `npm run build` 로 빌드가 여전히 도는지 확인합니다.

**PR 은 `feat/linux-build-pipeline` 브랜치에 하나로 올리고 사람이 누릅니다** — 사용자에게
보이는 동작이 바뀌고(`feat:`) 배포에 걸리는 변경이라, `CLAUDE.md` 의 머지 표에서
"PR 을 열고 멈춘다" 쪽입니다.

**직접 확인할 수 없는 것**: 리눅스 빌드가 실제로 도는지는 **다음 릴리스가 처음**입니다.
이 컴퓨터는 맥이고, 리눅스용 AppImage 를 맥에서 만들 수 없습니다. 그래서 2.2 의
`continue-on-error` 와 5.3 의 눈 확인 절차가 짝으로 필요합니다.

---

## 7. 상태

**설계 중** — 구현이 끝나면 `docs/DEVELOPMENT.md` 의 표에서 "구현 완료 (리뷰 대기)"
로 바꿉니다.
