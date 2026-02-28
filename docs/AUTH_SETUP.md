# 구글 로그인 (Supabase OAuth) 설정

## 1. 환경 변수 (.env.local)

프로젝트 루트에 `.env.local` 파일을 만들고 다음 값을 **실제 값**으로 채우세요.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- Supabase 대시보드 → **Project Settings** → **API** 에서 URL과 `anon` `public` 키 확인
- `NEXT_PUBLIC_` 접두사가 있어야 클라이언트에서 사용 가능

## 2. Supabase 대시보드 설정

### Authentication → URL Configuration

- **Site URL**: `http://localhost:3001` (로컬 개발 시)
- **Redirect URLs**에 다음 추가:
  - `http://localhost:3001/auth/callback`

배포 시에는 실제 도메인으로 추가 (예: `https://yourdomain.com/auth/callback`).

### Authentication → Providers → Google

- **Google** 프로바이더 **Enable** 로 활성화
- Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성 후, 여기에 **Client ID** / **Client Secret** 입력

## 3. 동작 흐름

1. 사용자가 `/auth`에서 "Google로 계속하기" 클릭
2. `signInWithOAuth({ provider: 'google' })` 호출 → Supabase가 구글 로그인 URL 반환
3. 브라우저가 해당 URL로 이동 → 구글 로그인 화면 표시
4. 로그인 후 Supabase가 `redirectTo`로 리다이렉트 → `/auth/callback?code=...`
5. 콜백 페이지에서 `exchangeCodeForSession(code)` 호출 후 `/photographer/dashboard`로 이동

## 4. RLS (Row Level Security) — 프로젝트 생성 실패 시

클라이언트에서 `projects` 테이블에 INSERT할 때 실패한다면 RLS 정책을 확인하세요.

- **Supabase 대시보드** → **Table Editor** → **projects** → **RLS** (또는 Authentication → Policies)
- **INSERT 정책**이 없으면 `anon` / `authenticated` 유저는 행을 넣을 수 없습니다.
- 예: `authenticated` 역할에 대해 `INSERT`를 허용하는 정책을 추가 (예: `photographer_id`가 현재 사용자에 해당하는 경우만 허용하거나, 적어도 INSERT는 허용).

## 5. 문제 해결

- **로그인 창이 안 뜨는 경우**: 브라우저 콘솔에서 `[Auth] signInWithOAuth(google) 호출` / `[Auth] signInWithOAuth 성공, 리다이렉트:` 로그 확인. URL이 나오면 해당 주소로 이동해야 합니다.
- **Redirect URL 오류**: Supabase URL Configuration의 Redirect URLs에 `http://localhost:3001/auth/callback`이 포함되어 있는지 확인.
- **Google Provider 비활성화**: Authentication → Providers → Google 이 켜져 있는지 확인.
