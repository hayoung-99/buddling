# Supabase 세팅 가이드

Buddling은 방 정보 저장과 실시간 "콕 찌르기" 전달에 Supabase를 씁니다.
아래 5단계면 끝나고, 무료 플랜으로 충분합니다. **약 5분** 걸립니다.

---

## 1. 프로젝트 만들기

1. https://supabase.com 에 접속해 GitHub 계정 등으로 로그인합니다.
2. **New project** 를 누릅니다.
3. 입력값:
   - **Name**: `buddling` (아무 이름이나 괜찮습니다)
   - **Database Password**: 아무거나 생성해 두세요. 이 앱에서는 쓰지 않지만 나중에 필요할 수 있으니 저장해 두면 좋습니다.
   - **Region**: `Northeast Asia (Seoul)` — 팀원이 한국에 있다면 반응 속도가 가장 빠릅니다.
4. **Create new project** 를 누르고 프로비저닝이 끝날 때까지 1~2분 기다립니다.

## 2. 테이블과 함수 만들기

1. 왼쪽 사이드바에서 **SQL Editor** 를 엽니다.
2. **New query** 를 누릅니다.
3. `schema.sql` **파일 전체**를 복사해 붙여넣습니다. 이 파일은 저장소에 올려 두지 않으니 관리자에게 받으세요.
4. **Run** (⌘+Enter) 을 누릅니다.
5. `Success. No rows returned` 이 나오면 성공입니다.

> 여러 번 실행해도 안전하고, 이미 만든 팀·멤버는 그대로 유지됩니다.
> 앱을 업데이트한 뒤 "데이터베이스가 최신 상태가 아니에요" 라고 나오면 이 단계를 다시 하면 됩니다.

## 3. 키 복사하기

필요한 값은 **Project URL** 과 **anon 키** 두 가지입니다.

### 가장 쉬운 방법: Connect 버튼

1. 대시보드 상단 바에 있는 **Connect** 버튼을 누릅니다.
2. **App Frameworks** 탭을 고릅니다.
3. 아래처럼 두 값이 한 번에 나옵니다. 이름표(`NEXT_PUBLIC_...`)는 무시하고 **값만** 복사하세요.

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

### 설정 화면에서 찾는 방법

Supabase 대시보드가 개편되면서 예전의 **Settings → API** 한 페이지가 둘로 나뉘었습니다.

- **Project URL** → **Project Settings**(톱니바퀴) → **Data API**
- **anon 키** → **Project Settings** → **API Keys**

> **Project URL 을 못 찾겠다면** 브라우저 주소창을 보세요.
> `https://supabase.com/dashboard/project/**abcdefghijklmnop**` 의 굵은 부분이 프로젝트 ref 이고,
> Project URL 은 언제나 `https://<프로젝트 ref>.supabase.co` 입니다.

### 어떤 키를 쓰나요

`anon` `public` 이라고 표시된 `eyJ...` 로 시작하는 긴 문자열을 쓰면 됩니다.
프로젝트에 따라 `sb_publishable_...` 형태의 새 **publishable** 키만 보일 수도 있는데, 그 값도 그대로 쓰면 동작합니다.

> `service_role` (또는 `secret`) 키는 **절대** 쓰지 마세요. RLS를 통째로 무시하는 키라서 앱에 넣으면 안 됩니다.
> 이 앱은 `anon` 키만 사용하며, 그것으로 충분합니다.

## 4. `.env` 파일 만들기

프로젝트 루트에서:

```bash
cp env.sample .env
```

`.env` 를 열어 3단계에서 복사한 값을 넣습니다:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

`.env` 는 `.gitignore` 에 등록되어 있어 커밋되지 않습니다.

## 5. 팀원에게 나눠주기

팀원들은 각자 앱을 실행해야 하므로, **같은 `.env` 값**을 공유해야 합니다.
(같은 Supabase 프로젝트를 바라봐야 서로 연결됩니다.)

- 개발 중에는 `.env` 파일을 직접 전달하면 됩니다.
- 앱으로 패키징해서 배포할 때는 빌드 시점에 값이 포함되므로, 팀원은 아무 설정도 할 필요가 없습니다.

---

## 확인하기

```bash
npm start
```

앱이 켜지고 팀 창에서 팀을 만들었을 때 6자리 초대코드가 나오면 연결 성공입니다.
Supabase 대시보드의 **Table Editor → teams** 에서도 방금 만든 팀이 보입니다.

---

## 자주 겪는 문제

| 증상 | 원인과 해결 |
|---|---|
| `SUPABASE_URL이 설정되지 않았습니다` | `.env` 가 프로젝트 루트에 없거나 이름이 `.env.txt` 등으로 잘못됨 |
| `function public.create_team does not exist` | 2단계 SQL 실행을 건너뜀. SQL Editor에서 다시 실행하세요 |
| 팀은 만들어지는데 상대 캐릭터가 안 뜀 | 두 사람이 서로 다른 Supabase 프로젝트를 보고 있음. `.env` 값이 동일한지 확인 |
| `Invalid API key` | `anon` 키가 아니라 다른 값을 넣었거나 복사할 때 일부가 잘림 |

## 보안 참고

이 앱에는 로그인 화면이 없습니다. 대신 **Supabase 익명 로그인**으로 기기마다 계정을 하나
만들어 두고 그것으로 자신을 증명합니다. **대시보드에서 익명 로그인을 켜 두어야 합니다**
(Authentication → Providers → Anonymous sign-ins).

- 테이블은 RLS로 완전히 잠겨 있어 `anon` 키로 직접 조회·수정할 수 없습니다.
- 모든 접근은 `security definer` 함수(`create_team`, `join_team` 등)를 통해서만 이뤄지고,
  그 함수들은 클라이언트가 넘긴 값이 아니라 `auth.uid()` 로 호출자를 가립니다.
- 실시간 채널은 **private 채널**입니다. `realtime.messages` 에 걸린 정책이 "그 팀 멤버인가"를
  확인하므로, 팀 ID를 알아도 팀원이 아니면 붙을 수 없고 팀을 나가면 그 즉시 끊깁니다.

세션이 곧 신원이라, 그것을 잃으면(프로필 폴더 삭제·오래된 백업 복원 등) 속한 팀과 남남이
됩니다. 되찾는 길은 초대코드로 다시 들어오는 것뿐입니다.

### 안 쓰는 익명 계정은 알아서 정리됩니다

익명 계정은 설치할 때마다, 세션을 잃을 때마다 하나씩 늘어납니다. 그래서 `pg_cron` 으로
**하루 한 번(한국 시간 새벽 3시)** `cleanup_anonymous_users()` 를 돌립니다.
`pg_cron` 은 대시보드 Database → Extensions 에서 켤 수 있고, 안 켜져 있으면 스키마를
실행할 때 안내만 남기고 넘어갑니다.

지우는 대상은 **어느 팀에도 속하지 않고, 만든 지 7일이 지난** 익명 계정뿐입니다.
`members.user_id` 가 `on delete cascade` 라서 쓰는 사람을 잘못 지우면 팀 소속까지 함께
사라지기 때문에, 팀이 있는 계정은 손대지 않습니다. 7일이라는 유예는 지금 막 로그인하고
팀을 만드는 중인 사람이 쓸려가지 않게 하는 장치입니다.

직접 돌려 보거나 기준을 바꿔 보고 싶으면 SQL Editor 에서 이렇게 합니다.

```sql
select public.cleanup_anonymous_users();                 -- 기본 7일, 지운 개수를 돌려준다
select public.cleanup_anonymous_users(interval '30 days');
-- 작업 이름은 예전 이름 그대로다. 바꾸면 이미 걸려 있는 작업과 짝이 어긋나
-- 정리가 둘로 늘거나 사라질 수 있어서, 이름 대신 하는 일만 그대로 둔다.
select * from cron.job where jobname = 'tap-tap-cleanup-anonymous';
```
