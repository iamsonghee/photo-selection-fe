# 사용자 흐름 (User Flow)

> 2026-07-13 기준 `photo-selection-fe` + `photo-selection-be`(+`clip-service`) 실제 코드를 근거로 작성했습니다.
> 코드로 직접 확인하지 못한 부분은 `확인 필요`로 표시했습니다. 상세 근거(파일/라인)는 `docs/architecture.md`를 함께 참고하세요.
> 저장 위치는 FE 저장소(`photo-selection-fe/docs/`)이지만, 내용은 FE+BE 전체 프로젝트 기준입니다.

---

## 사용자 유형

- **고객**: 회원가입 없이 `access_token`(고객 링크) + 선택적 4자리 PIN으로 접근.
- **사진작가/관리자**: Supabase Auth(Google/Kakao OAuth) 로그인 후 `/photographer/**`에서 프로젝트를 관리.

---

# Part 1. 고객 흐름

## 1. 공유 링크 최초 접속

- **시작 조건**: 작가가 공유한 `https://.../c/{access_token}` 링크를 클릭. 브라우저에 해당 프로젝트의 쿠키가 없는 상태.
- **사용자가 수행하는 단계**: 링크 클릭 → (PIN 유무에 따라 자동 분기).
- **프론트엔드 라우트**: `/c/[token]` (`src/app/c/[token]/page.tsx`, 서버 컴포넌트) → 상황에 따라 `/c/[token]/pin` 또는 `/c/[token]/delivered`로 redirect, 그 외에는 `InvitePageWrapper`/`InvitePageClient` 렌더.
- **호출되는 API**: 서버 컴포넌트가 `getProjectByToken()`으로 직접 Supabase 조회(별도 REST 호출 아님) → `projects.status`, `pin_verified_{token}` 쿠키 존재 여부 확인. 클라이언트 렌더 후 `GET /api/c/photographer?token=...`로 작가 프로필 표시.
- **성공 시 기대 결과**:
  - `status === "delivered"` → `/c/[token]/delivered`로 즉시 이동.
  - PIN 쿠키가 없으면 → `/c/[token]/pin?from=/c/[token]`으로 이동(PIN 있으면 입력 폼, 없으면 자동 인증 후 원래 페이지 복귀).
  - 인증 완료 후에는 `InvitePageClient`가 `project.status`를 다시 확인해 `editing`/`editing_v2` → `/locked`, `confirmed` → `/confirmed`로 재분기. 그 외(주로 `preparing`/`selecting`)에는 초대 소개 화면(3단계 안내: 갤러리 감상 → 사진 선택 → 확정&보정) 표시.
- **실패 및 경계 상황**:
  - 존재하지 않는 `access_token` → `project`가 `null` → "존재하지 않는 초대 링크입니다 / URL을 다시 확인해주세요" 화면(`InvitePageClient.tsx`).
  - `project.status === "preparing"`(작가가 아직 초대 링크를 활성화하지 않음)인 경우 정확히 어떤 화면이 보이는지는 코드상 명시적 분기가 없어 소개 화면이 그대로 노출될 것으로 보임 — 사진이 없는 상태에서의 UX는 **확인 필요**(직접 브라우저 확인 권장).
- **관련 권한/인증 조건**: 없음(토큰만 있으면 접근 가능, PIN이 있으면 PIN 필요).
- **QA에서 확인해야 할 항목**:
  - 존재하지 않는 토큰, 형식이 이상한 토큰(공백/특수문자) 접근 시 에러 화면과 콘솔 에러 여부.
  - `preparing` 상태(업로드 미완료) 프로젝트 링크에 고객이 실수로 접근했을 때 화면.
  - `delivered` 상태 프로젝트에 이 경로로 접근 시 리다이렉트가 항상 동작하는지(딥링크 포함).

---

## 2. PIN이 있는 프로젝트 인증

- **시작 조건**: `projects.access_pin`이 설정된 프로젝트 링크에 쿠키 없이 접근.
- **사용자가 수행하는 단계**: 링크 접속 → 자동으로 `/pin`으로 이동 → 4자리 숫자 입력(4번째 자리 입력 시 자동 제출).
- **프론트엔드 라우트**: `/c/[token]/pin` (`pin/page.tsx` 서버 컴포넌트 + `PinForm.tsx` 클라이언트).
- **호출되는 API**: `POST /api/c/verify-pin` `{ token, pin }`.
- **성공 시 기대 결과**: 200 `{success:true}` + `Set-Cookie: pin_verified_{token}`(HttpOnly, 서명, 24h) → `window.location.href = from`으로 **전체 페이지 이동**하여 원래 목적지(기본값 `/c/[token]`)로 이동. (과거 `router.replace`를 쓸 때 목적지 페이지가 "INVALID_TOKEN"을 표시하던 버그가 있었고, 전체 페이지 이동으로 수정된 이력이 있음 — 관련 회귀 테스트 `tests/e2e/customer/pin-auth.spec.ts` U1.)
- **실패 및 경계 상황**:
  - PIN 불일치 → 401 `{success:false, remaining}`, "비밀번호가 올바르지 않습니다" 표시 후 입력칸 초기화, 첫 칸에 포커스.
  - 1분 내 5회 이상 시도 → 429 `{locked:true, retryAfterSeconds}`, 카운트다운 표시 + 입력 비활성화, 카운트다운 종료 시 자동 재활성화.
  - 네트워크 오류 → "오류가 발생했습니다. 다시 시도해주세요." 표시.
- **관련 권한/인증 조건**: `pin_attempts` 테이블 기준 토큰당 1분 5회 rate limit(로그인 계정과 무관, IP 기록만 함 — IP 자체로 차단하지는 않음).
- **QA에서 확인해야 할 항목**:
  - 정답 PIN 입력 후 새로고침 없이 목적지 페이지가 실제 데이터로 렌더링되는지(과거 회귀 버그).
  - 5회 락아웃 → 카운트다운 종료 후 실제로 재시도가 되는지.
  - 모바일 뷰포트에서 자동 포커스 이동/자동 제출이 정상 동작하는지.

---

## 3. PIN이 없는 프로젝트 접속

- **시작 조건**: `projects.access_pin === null`인 프로젝트 링크에 쿠키 없이 접근.
- **사용자가 수행하는 단계**: 링크 클릭만 하면 됨(입력 없음).
- **프론트엔드 라우트**: `/c/[token]/pin`(서버 컴포넌트가 `access_pin === null` 확인 즉시 아래로 redirect).
- **호출되는 API**: `GET /api/c/auto-verify?token=...&to=...` — DB에서 `access_pin`을 다시 한번 확인(비정상 접근 방어) 후 쿠키 발급, `to` 파라미터로 302 리다이렉트.
- **성공 시 기대 결과**: PIN 입력 화면 없이 원래 목적지로 바로 이동, `pin_verified_{token}` 쿠키 발급(24h).
- **실패 및 경계 상황**: `auto-verify` 호출 시점에 DB에서 프로젝트를 찾지 못하면 `/`로 리다이렉트. 만약 그 사이 작가가 PIN을 설정했다면(`access_pin !== null`) `/pin`으로 다시 리다이렉트되어 정상적으로 입력을 요구함(§방어 로직, `auto-verify/route.ts`).
- **관련 권한/인증 조건**: 없음(링크만 알면 접근 가능 — 설계상 의도된 동작으로 보임).
- **QA에서 확인해야 할 항목**: PIN 없는 프로젝트에 방금 PIN을 추가했을 때, 이미 열려 있던 고객 탭이 어떻게 동작하는지(새로고침 시 PIN 요구로 바뀌는지).

---

## 4. 잘못된 PIN 입력 후 재입력

- **시작 조건**: PIN 입력 화면에서 최소 1회 오답 상태(락아웃 전).
- **사용자가 수행하는 단계**: 오답 입력(자동 제출) → 에러 확인 → 입력칸이 비워지고 포커스가 첫 칸으로 복귀 → 올바른 PIN 재입력.
- **프론트엔드 라우트**: `/c/[token]/pin` (동일 페이지 내에서 처리, 페이지 이동 없음).
- **호출되는 API**: `POST /api/c/verify-pin`을 오답 1회 + 정답 1회, 총 2회 호출(각각 `pin_attempts`에 기록됨).
- **성공 시 기대 결과**: 정답 제출 시 §2와 동일하게 정상 인증 및 목적지 이동.
- **실패 및 경계 상황**: 오답 후 남은 시도 횟수(`remaining`)가 화면에 노출되지는 않음(에러 문구는 고정 텍스트) — `remaining` 값은 응답 바디에는 있지만 UI에서 사용되는지는 **확인 필요**(코드상 `PinForm.tsx`가 `data.remaining`을 렌더링에 사용하지 않는 것으로 보임).
- **관련 권한/인증 조건**: §2와 동일한 rate limit 로직 안에서 누적됨(오답+정답 모두 시도 횟수에 포함).
- **QA에서 확인해야 할 항목**: 오답을 4회까지 반복한 뒤 5번째에 정답을 입력하면 정상 통과하는지(락아웃 임계값이 "5회 이상"이라 정답 시도도 카운트에 포함되는지 경계값 확인).

---

## 5. 인증 후 갤러리 진입

- **시작 조건**: PIN 인증 완료(또는 PIN 없음) + `projects.status === "selecting"` (또는 `preparing`).
- **사용자가 수행하는 단계**: 초대 화면 또는 직접 링크에서 갤러리로 이동.
- **프론트엔드 라우트**: `/c/[token]/gallery` (`GalleryPageClient.tsx`).
- **호출되는 API**: `GET /api/c/photos?token=...` (via `SelectionContext`) — 프로젝트/사진/기존 선택/`photo_groups` 반환.
- **성공 시 기대 결과**: 사진 그리드 렌더, 이미 저장된 선택/별점/코멘트가 있으면 그대로 표시.
- **실패 및 경계 상황**:
  - `project.status === "preparing"` → `/c/[token]`으로 되돌림(`GalleryPageClient.tsx:150`).
  - `project.status === "confirmed"` → `/c/[token]/confirmed`로 이동.
  - `project.status === "editing"` → `/c/[token]/locked`로 이동.
  - `project`가 끝내 `null`이면(§BUG-001 계열) "INVALID_TOKEN" 표시 — 정상 흐름에서는 인증 후 전체 페이지 이동으로 재발생하지 않음(§2 참고).
- **관련 권한/인증 조건**: PIN 쿠키 필요(미들웨어가 `/c/:token/:path+`로 보호).
- **QA에서 확인해야 할 항목**: 사진 수가 많은 프로젝트(수백 장)에서 최초 로딩 속도, 가상 스크롤 여부(**확인 필요**, `TanStack Virtual` 적용 위치 미확정).

---

## 6. 사진 조회 및 상세 보기

- **시작 조건**: 갤러리 진입 완료, `status === "selecting"`.
- **사용자가 수행하는 단계**: 사진 클릭 → 전체화면 뷰어 진입 → 좌우 이동/ESC로 갤러리 복귀.
- **프론트엔드 라우트**: `/c/[token]/viewer/[photoId]` (`src/app/c/[token]/viewer/[photoId]/page.tsx`).
- **호출되는 API**: `SelectionContext`의 기존 데이터 사용(추가 목록 조회 없음) + 대형 프리뷰 이미지는 `GET /api/c/presign-preview?...`로 presigned URL을 받아 표시(FastAPI `/api/storage/presign` 경유).
- **성공 시 기대 결과**: 원본 대비 축소된 프리뷰(1200px) 표시, 별점/색상/코멘트/선택 토글 UI 노출.
- **실패 및 경계 상황**: presign 호출 실패 시 이미지 표시 실패 가능성 — 폴백(예: `r2_preview_url` 직접 사용) 여부는 **확인 필요**. 존재하지 않는 `photoId` 접근 시 동작도 **확인 필요**.
- **관련 권한/인증 조건**: PIN 쿠키(미들웨어 보호 대상).
- **QA에서 확인해야 할 항목**: 방향키/스와이프로 이전·다음 이동, 마지막/첫 사진에서 경계 동작, 이미지 우클릭/드래그 저장 방지(`NEXT_PUBLIC_BLOCK_VIEWER_IMAGE_DOWNLOAD` 옵션) 동작 여부.

---

## 7. 사진 선택과 선택 취소

- **시작 조건**: 갤러리 또는 뷰어에서 `status === "selecting"`.
- **사용자가 수행하는 단계**: 사진(또는 체크박스) 클릭으로 선택 토글.
- **프론트엔드 라우트**: `/c/[token]/gallery`, `/c/[token]/viewer/[photoId]` (둘 다 `SelectionContext.toggle()` 사용).
- **호출되는 API**: `POST /api/c/selections` `{ token, project_id, photo_id, is_selected, rating?, color_tag?, comment? }` — fire-and-forget(응답을 기다리지 않고 UI는 즉시 갱신).
- **성공 시 기대 결과**: 헤더의 "SELECTED Y / N" 카운트 갱신, `selections` 테이블에 upsert.
- **실패 및 경계 상황**:
  - 이미 N장을 채운 상태에서 새 사진을 선택하려 하면 **클라이언트에서 차단**(요청 자체가 서버로 가지 않음) — 이미 선택된 사진을 해제하는 것은 언제나 가능.
  - **서버 측에는 N장 제한 검증이 없음** — 클라이언트 로직을 우회해 N장 넘게 저장을 시도하면 `selections` 테이블에는 들어갈 수 있으나, `/api/c/confirm`에서 개수 불일치로 최종 확정은 거부됨.
  - `status`가 `selecting`/`preparing`이 아니면 서버가 403 반환(예: 이미 확정된 후 뒤늦은 요청).
- **관련 권한/인증 조건**: PIN 쿠키, `checkPinAuth` + `validateTokenAndProject`.
- **QA에서 확인해야 할 항목**: 빠른 연속 클릭(더블 클릭) 시 상태 깜빡임 여부, 네트워크 지연 중 여러 번 클릭했을 때 최종 상태 일관성, 새로고침 시 선택 상태가 서버 값과 일치하는지.

---

## 8. 별점 및 코멘트 저장

- **시작 조건**: 뷰어 또는 갤러리 카드에서 `status === "selecting"`.
- **사용자가 수행하는 단계**: 별점(1~5) 클릭, 색상 태그 선택, 코멘트 입력 후 포커스 아웃(또는 자동 저장 트리거 — 정확한 디바운스/저장 시점은 **확인 필요**).
- **프론트엔드 라우트**: `/c/[token]/viewer/[photoId]` (주 입력처), `/c/[token]/gallery`(카드 오버레이에서도 가능할 수 있음, **확인 필요**).
- **호출되는 API**: `POST /api/c/selections` — `rating`/`color_tag`(직렬화됨)/`comment`만 바뀌고 `is_selected`는 생략(서버가 기존 선택 상태를 그대로 보존).
- **성공 시 기대 결과**: 별점/태그/코멘트가 즉시 UI에 반영되고 서버에도 저장됨.
- **실패 및 경계 상황**: 저장 요청이 실패해도 UI는 낙관적으로 이미 갱신된 상태라 사용자는 실패를 알기 어려움(콘솔에만 에러 로그) — 저장 실패에 대한 사용자 노출 UI는 없는 것으로 보임.
- **관련 권한/인증 조건**: PIN 쿠키, `status`가 `selecting`/`preparing`이어야 함.
- **QA에서 확인해야 할 항목**: 특수문자·이모지·매우 긴 코멘트 입력, 코멘트 저장 실패 시(네트워크 끊김) 새로고침하면 값이 유실되는지, 별점을 준 뒤 선택을 해제해도 별점이 유지되는지.

---

## 9. 새로고침과 새 탭에서 상태 유지

- **시작 조건**: PIN 인증 완료 상태(쿠키 존재).
- **사용자가 수행하는 단계**: 브라우저 새로고침, 또는 같은 링크를 새 탭에서 열기.
- **프론트엔드 라우트**: 접근하던 라우트 그대로.
- **호출되는 API**: 페이지 재마운트에 따라 `GET /api/c/photos` 등이 다시 호출됨(쿠키가 브라우저 프로필 단위로 공유되므로 새 탭에서도 동일 쿠키 사용).
- **성공 시 기대 결과**: 재인증 없이 동일 화면 유지, 선택/별점/코멘트는 서버에 저장된 값 기준으로 다시 로드됨(클라이언트 로컬 상태를 별도로 캐시하지 않음).
- **실패 및 경계 상황**: 쿠키의 서명 타임스탬프가 24시간을 넘으면 새로고침 시 `/pin`으로 다시 리다이렉트됨(§10 참고). 시크릿 모드/다른 브라우저에서는 쿠키가 공유되지 않아 재인증 필요.
- **관련 권한/인증 조건**: 쿠키는 `path: "/"`, `sameSite: lax`로 발급되어 같은 브라우저의 모든 탭에서 공유됨.
- **QA에서 확인해야 할 항목**: 새로고침 직후 로딩 중 상태에서 조작 시 에러 여부, 다른 프로젝트 탭을 동시에 열었을 때 쿠키 이름이 토큰별로 분리되어 있어 서로 간섭하지 않는지.

---

## 10. 만료되거나 잘못된 링크 접근

- **시작 조건**: (a) 존재하지 않는 토큰, (b) 형식은 맞지만 DB에 없는 토큰, (c) 24시간이 지나 만료된 PIN 쿠키, (d) 변조된 쿠키.
- **사용자가 수행하는 단계**: 잘못된/오래된 링크로 접근.
- **프론트엔드 라우트**: 모든 `/c/[token]/**` 경로 공통.
- **호출되는 API**: 미들웨어의 `verifyPinCookieEdge`(존재하지 않거나 만료·변조된 쿠키는 무효 처리) → 각 API 라우트의 `checkPinAuth`.
- **성공 시 기대 결과**: 해당 없음(정의상 실패 케이스).
- **실패 및 경계 상황**:
  - 존재하지 않는 토큰: `getProjectByToken`이 `null` 반환 → "존재하지 않는 초대 링크입니다" 화면(`InvitePageClient.tsx`) 또는 각 API가 404/401 반환.
  - 만료(25시간 경과 등)·변조 쿠키: 미들웨어가 무효로 판단해 `/pin?from=...`으로 리다이렉트(자동 테스트 `pin-auth.spec.ts` T3/T4로 회귀 검증됨).
  - `pin_verified_{token}` 쿠키가 있지만 다른 토큰용으로 서명된 경우(토큰 불일치)도 401/리다이렉트 처리됨(T3).
- **관련 권한/인증 조건**: 없음(실패를 다루는 흐름이므로).
- **QA에서 확인해야 할 항목**: 만료 쿠키로 데이터 API를 직접 호출했을 때 401이 정확히 반환되는지, UI가 이를 "링크가 깨졌다"가 아니라 "다시 인증 필요"로 명확히 안내하는지(현재 만료 시 PIN 재입력 화면으로 자연스럽게 이동하므로 문제 없어 보이나, 문구 자체가 "인증 만료"를 명시하지는 않음 — 확인 필요).

---

## 11. 보정본 확인 및 재보정 요청

- **시작 조건**: `status`가 `reviewing_v1` 또는 `reviewing_v2`(작가가 보정본을 전달 완료).
- **사용자가 수행하는 단계**:
  - (재보정 0회 프로젝트, `max_revision_count === 0`) 전체 보정본을 한 번에 확인 후 "수령 완료" 클릭.
  - (재보정 가능 프로젝트) 모바일: 갤러리에서 사진별 승인/재보정 요청 토글 후 전체 제출. 데스크톱: 사진별 상세 뷰어(`/review/[photoId]`)에서 원본/보정본 비교 후 `Y`(승인)/`R`(재보정 요청, 코멘트 최대 100자) 단축키로 처리 후 제출.
- **프론트엔드 라우트**: `/c/[token]/review` (분기: `DeliveryReceiptView`/`MobileReviewGalleryView`/데스크톱은 `/review/[photoId]`로 자동 이동), `/c/[token]/review/[photoId]`.
- **호출되는 API**: `GET /api/c/review`(보정본+기존 리뷰 로드) → 사진별 승인/재보정 상태를 모아 `POST /api/c/review/submit` `{ token, reviews: [{photo_version_id, photo_id, status, customer_comment?}] }`로 일괄 제출. (레거시 경로 `POST /api/c/review-submit`도 존재 — `photoVersionId`가 없을 때의 폴백으로 추정, **확인 필요**.)
- **성공 시 기대 결과**: 서버가 `version_reviews`를 upsert하고, 재보정 요청이 하나라도 있고 `max_revision_count > 0`이며 아직 라운드 한도 내이면 `projects.status = "editing_v2"`(+`revision_round` 증가), 그렇지 않으면(전부 승인, 또는 재보정 한도 소진) `projects.status = "delivered"`. 응답의 `finalStatus`에 따라 `delivered → /delivered`, `editing_v2`/`editing` → `/locked`, 그 외 → `/confirmed`로 이동.
- **실패 및 경계 상황**:
  - 제출한 `photo_version_id`가 해당 프로젝트 소속이 아니면 400 반환("일부 보정본 ID가 이 프로젝트와 일치하지 않습니다").
  - `reviews` 배열이 비어있으면 400.
  - 재보정 요청이 있어도 이미 재보정 한도(`max_revision_count`)를 소진한 상태(`revision_round >= max_revision_count`)면 재보정 요청 여부와 무관하게 `delivered`로 전환됨 — 고객 입장에서는 "재보정을 요청했는데 왜 완료 처리됐는지" 혼란 가능성.
- **관련 권한/인증 조건**: PIN 쿠키, `checkPinAuth`. 상태 자체에 대한 서버 측 가드(`reviewing_v1`/`reviewing_v2`여야만 제출 가능한지)는 `submitVersionReviews()` 코드상 명시적으로 확인되지 않아 **확인 필요**(프로젝트 조회만 하고 상태값 검사는 안 보임 — 재검증 권장).
- **QA에서 확인해야 할 항목**: 재보정 요청 코멘트 100자 제한 UI/서버 양쪽 일치 여부, 재보정 한도 마지막 라운드에서 재보정 버튼이 실제로 비활성화되는지, `reviewing_v1`이 아닌 상태(예: `selecting`)에서 이 API를 직접 호출했을 때 서버가 거부하는지.

---

# Part 2. 사진작가/관리자 흐름

## 1. 로그인

- **시작 조건**: 미인증 상태에서 `/landing` 등 마케팅 페이지 방문.
- **사용자가 수행하는 단계**: "Google로 계속하기" 또는 "카카오로 계속하기" 클릭 → OAuth 동의 화면 → 콜백 후 대시보드 진입.
- **프론트엔드 라우트**: 로그인 트리거는 `AuthModal` 컴포넌트(랜딩 페이지 등에서 열림), 콜백은 `GET /auth/callback`. (`/auth` 페이지 자체는 사용되지 않는 no-op 리다이렉트였으며 2026-07-13 삭제됨)
- **호출되는 API**: `supabase.auth.signInWithOAuth({ provider: "google"|"kakao", options: { redirectTo: origin + "/auth/callback" } })` (Supabase Auth, 자체 API 라우트 아님) → 콜백에서 `supabase.auth.exchangeCodeForSession(code)`.
- **성공 시 기대 결과**: 콜백이 `photographers` 테이블에 해당 `auth_id`가 없으면 자동 생성 후 기본적으로 `/photographer/dashboard`로 리다이렉트.
- **실패 및 경계 상황**:
  - OAuth 동의 거부/실패 시 처리 로직은 이번 조사에서 확인하지 못함 — **확인 필요**.
  - Kakao 로그인 버튼은 코드상 존재하나, Supabase 대시보드에서 Kakao 프로바이더가 실제로 켜져 있는지는 **확인 필요**(기존 문서 `ACUT_OVERVIEW.md`는 "카카오 미구현"이라고 기록되어 있어 코드와 문서가 불일치 — 반드시 실제 동작 확인 후 문서 정리 필요).
  - 테스트 전용 이메일/비밀번호 로그인(`/api/auth/test-login`)은 `ENABLE_TEST_LOGIN=true`일 때만 동작하며 실제 사용자 흐름이 아님.
- **관련 권한/인증 조건**: 없음(로그인 자체는 누구나 시도 가능, 이후 모든 작가 기능은 세션 필요).
- **QA에서 확인해야 할 항목**: 최초 로그인 시 `photographers` 행이 정말 자동 생성되는지, 로그아웃 후 재로그인 시 중복 생성되지 않는지, 로그인 세션이 만료된 상태에서 작가 페이지 접근 시 어떤 화면이 뜨는지(미들웨어가 `/photographer/**`를 보호하지 않으므로 페이지 셸은 보일 수 있음 — `docs/architecture.md` §13 참고).

---

## 2. 프로젝트 생성

- **시작 조건**: 로그인 완료, `/photographer/projects` 목록 화면.
- **사용자가 수행하는 단계**: "새 프로젝트" 진입 → 프로젝트명, 고객명, 촬영일, 셀렉 기한, 필요 선택 장수(N), 촬영 종류, 고객 연락처(선택), PIN(선택), 재보정 허용 횟수 입력 → 생성.
- **프론트엔드 라우트**: `/photographer/projects/new`.
- **호출되는 API**: `확인 필요` — 조사 과정에서 이 폼이 최종적으로 POST하는 정확한 엔드포인트(예: `/api/photographer/projects` 존재 여부, 또는 FastAPI `/api/projects` 직접 호출 여부)를 명시적으로 확인하지 못했습니다. 폼 상태에 `access_pin`, `max_revision_count` 등이 포함되는 것은 확인했습니다(`src/app/photographer/projects/new/page.tsx`).
- **성공 시 기대 결과**: `status: "preparing"`인 새 프로젝트 생성, `access_token`은 서버(DB 트리거 또는 API)가 발급 — 발급 주체는 **확인 필요**.
- **실패 및 경계 상황**: 필수 필드(셀렉 기한 등) 누락 시 클라이언트 유효성 검사 에러 표시. 베타 한도(계정당 최대 10개 프로젝트)는 FastAPI `POST /api/projects`(`BETA_MAX_PROJECTS_TOTAL=10`)에서 강제되는 것으로 확인되나, 이 생성 폼이 실제로 FastAPI를 호출하는지 Next API를 호출하는지는 위와 같이 **확인 필요**.
- **관련 권한/인증 조건**: 로그인 세션 필요.
- **QA에서 확인해야 할 항목**: 11번째 프로젝트 생성 시도 시 정확한 에러 문구, PIN을 생성 시점에 설정하지 않고 나중에 추가하는 경로(§5)와의 동작 일치 여부.

---

## 3. 고객 프로젝트 설정

- **시작 조건**: 프로젝트 생성 완료, `/photographer/projects/[id]` 진입.
- **사용자가 수행하는 단계**: 프로젝트명·고객명·촬영일·셀렉 기한·필요 장수(N)·촬영 종류·고객 연락처·재보정 횟수 등을 수정.
- **프론트엔드 라우트**: `/photographer/projects/[id]` (`ProjectNexusPageClient.tsx`, 편집 모드 토글).
- **호출되는 API**: `PATCH /api/photographer/projects/{id}` — 세션+소유권 확인 후 필드 갱신.
- **성공 시 기대 결과**: 화면에 즉시 반영("프로젝트 정보가 저장되었습니다" 토스트).
- **실패 및 경계 상황**: 필요 장수(N)는 `["preparing", "selecting"].includes(status)`일 때만 수정 가능(`canEditN`) — 확정 이후에는 수정 불가로 보임. 저장 실패 시 에러 메시지 표시.
- **관련 권한/인증 조건**: 로그인 세션 + `project.photographer_id` 일치.
- **QA에서 확인해야 할 항목**: `confirmed` 이후 상태에서 N을 수정하려는 시도가 실제로 UI/서버 양쪽에서 막히는지, 셀렉 기한을 과거 날짜로 바꿨을 때의 동작.

---

## 4. 사진 업로드

- **시작 조건**: `status`가 `preparing` 또는 `selecting`(`UPLOADABLE_STATUSES`).
- **사용자가 수행하는 단계**: 파일 선택(드래그앤드롭 또는 파일 다이얼로그) → 자동 압축 → 업로드 진행률 확인 → (N장 이상 업로드 완료 시) "초대 링크 활성화" 버튼 클릭.
- **프론트엔드 라우트**: `/photographer/projects/[id]/upload`.
- **호출되는 API**:
  1. 클라이언트 압축(`compressImageForUpload`, 서버 호출 아님).
  2. `POST {NEXT_PUBLIC_API_URL}/api/upload/photos`(FastAPI, Bearer JWT) — 실패 시 `POST /api/photographer/upload/photos`(Next 프록시)로 폴백.
  3. N장 이상 업로드 완료 후 수동으로 `PATCH /api/photographer/projects/{id}/status` `{status:"selecting"}` 호출("초대 링크 활성화" 버튼) — **자동 전환이 아니라 작가가 직접 눌러야 하는 수동 액션**입니다(기존 문서의 "자동 활성화" 서술과 달리 확인됨).
- **성공 시 기대 결과**: 업로드된 사진이 그리드에 표시(썸네일/프리뷰는 FastAPI가 생성), `projects.photo_count` 증가. N장 이상이면 "초대 링크 활성화" 버튼이 활성화되고, 클릭 시 `status: "selecting"`으로 전환 + 공유 모달 표시.
- **실패 및 경계 상황**:
  - CR3/RAW 등 지원하지 않는 형식: 과거 "조용한 실패"(BUG-01, `TECHNICAL_ANALYSIS.md`) 이슈가 기록되어 있고 수정 완료(✅)로 표시되어 있으나, **현재 코드에서 실제로 실패 목록이 사용자에게 노출되는지는 이번 조사에서 재검증하지 않음 — 확인 필요**. 관련 회귀 테스트: `tests/e2e/photographer/upload.spec.ts`(U5, CR3 거부).
  - 대문자 확장자(`.JPG`, `.HEIC`) 처리: 회귀 테스트 U6 존재.
  - 0바이트 파일: 회귀 테스트 U12(거부).
  - 베타 한도(3000장/프로젝트) 초과 시 FastAPI가 거부.
  - 네트워크/CORS 실패 시 Next 프록시로 폴백하지만, 프록시 라우트 자체는 `Authorization` 헤더가 비어 있어도 그대로 FastAPI에 전달하므로 최종 인증 실패는 FastAPI 응답으로 판가름남.
- **관련 권한/인증 조건**: 로그인 세션(Supabase JWT를 FastAPI에 직접 전달), 프로젝트 소유권(FastAPI가 `photographer_id`로 재검증).
- **QA에서 확인해야 할 항목**: 대용량(수백 장) 연속 업로드 중 토큰 만료 처리(과거 BUG-04, PC 환경 토큰 갱신 로직 유무 재확인), 업로드 도중 페이지 이탈 시 상태, 실패한 개별 파일에 대한 사용자 피드백 유무.

---

## 5. 고객 링크 및 PIN 설정

- **시작 조건**: 프로젝트가 이미 존재(생성 시 PIN을 넣지 않았어도 무방).
- **사용자가 수행하는 단계**: 프로젝트 상세에서 PIN 설정/변경/삭제 모달 열기 → 4자리 입력 또는 비우기 → 저장. 초대 링크는 "URL 복사" 또는 "링크+비밀번호 함께 복사" 버튼으로 클립보드에 복사.
- **프론트엔드 라우트**: `/photographer/projects/[id]` (`ProjectNexusPageClient.tsx`).
- **호출되는 API**: `PATCH /api/photographer/projects/{id}` `{ access_pin: "1234" | null }`.
- **성공 시 기대 결과**: "고객 비밀번호가 저장되었습니다"/"제거되었습니다" 토스트. 이후 고객이 이 링크에 접근하면 §Part1-2 또는 §Part1-3 흐름을 따름.
- **실패 및 경계 상황**: 초대 링크 자체는 `status !== "preparing"`일 때만 활성 상태로 표시됨(`isInviteActive`) — `preparing`(업로드 미완료) 상태에서는 링크 복사 버튼이 비활성화되고 "업로드 완료 후 활성화" 문구가 표시됨. PIN 형식 검증(4자리 숫자)은 서버(`/^\d{4}$/`)에서 강제됨.
- **관련 권한/인증 조건**: 로그인 세션 + 소유권.
- **QA에서 확인해야 할 항목**: 고객이 갤러리를 보고 있는 도중 작가가 PIN을 새로 설정했을 때, 고객의 기존 세션(쿠키)이 그대로 유효한지 아니면 다음 접근부터 PIN을 요구하는지(현재 쿠키가 이미 발급되어 있으면 만료 전까지는 재인증을 요구하지 않을 것으로 코드상 보임 — 실제 확인 권장).

---

## 6. 고객 셀렉 결과 확인

- **시작 조건**: `status`가 `confirmed` 이후(최소 확정은 되어 있어야 함).
- **사용자가 수행하는 단계**: 결과 페이지에서 확정된 사진 목록·고객 코멘트 확인 → 필요 시 CSV/TXT로 내보내기 또는 파일명 클립보드 복사.
- **프론트엔드 라우트**: `/photographer/projects/[id]/results` (`results/page.tsx`), 워크플로우 화면에서도 진행 상태 요약 확인 가능(`workflow/WorkflowPageClient.tsx`).
- **호출되는 API**: 확인된 사진/선택 데이터 조회는 `확인 필요`(정확한 GET 엔드포인트를 이번 조사에서 특정하지 못함 — `getPhotosByProjectId` 등 `src/lib/db.ts`의 클라이언트 직접 조회일 가능성 있음).
- **성공 시 기대 결과**: CSV(`파일명,코멘트`)와 TXT(파일명 목록) 다운로드, 클립보드 복사 시 토스트 표시.
- **실패 및 경계 상황**: `status === "selecting"`(아직 미확정) 상태에서 이 페이지에 접근했을 때의 동작은 `isSelecting` 분기가 존재하는 것으로 보아 별도 안내가 있을 것으로 추정되나 구체적 문구는 **확인 필요**.
- **관련 권한/인증 조건**: 로그인 세션 + 소유권.
- **QA에서 확인해야 할 항목**: 코멘트에 쉼표/줄바꿈이 포함된 경우 CSV 이스케이프(`csvEscape` 함수 존재 확인됨)가 실제로 스프레드시트에서 깨지지 않는지, 특수문자 포함 파일명의 TXT 내보내기.

---

## 7. 보정본 업로드 및 전달

- **시작 조건**: `status === "confirmed"`(V1) 또는 `status === "editing_v2"`(V2, 고객이 재보정을 요청한 경우에만 존재).
- **사용자가 수행하는 단계**:
  1. "보정 시작" 클릭 → `confirmed → editing` 전환.
  2. 보정된 파일을 원본과 매칭(파일명 자동 매칭 또는 CLIP 기반 퍼지 매칭)하여 업로드.
  3. "고객에게 전달" 클릭 → `editing → reviewing_v1` 또는 `editing_v2 → reviewing_v2` 전환.
- **프론트엔드 라우트**: `/photographer/projects/[id]/workflow`(**실제 사용되는 유일한 V1/V2 업로드·전달 화면** — 프로젝트 상세 허브의 모든 보정 관련 버튼이 여기로 연결됨, `UploadVersionsPanel.tsx` 컴포넌트가 담당). (`/photographer/projects/[id]/edit/start`와 `/photographer/projects/[id]/upload-versions`, `.../upload-versions/v2`는 어디서도 링크되지 않던 레거시 페이지로 2026-07-13 삭제됨 — `/results` 페이지의 "보정 시작하기"/"보정본 업로드" 버튼도 이때 `/workflow`로 가도록 함께 수정됨)
- **호출되는 API**:
  - `PATCH /api/photographer/projects/{id}` 또는 `.../status` `{status:"editing"}` (보정 시작).
  - `POST {API_URL}/api/upload/versions`(FastAPI 직접, Bearer JWT) — 1500px/2MB 상한 리사이즈, `photo_versions` upsert, 기존 `version_reviews` 삭제.
  - 매칭 보조: `POST /api/photographer/projects/{id}/retouch-match`(clip-service 프록시, 파일명 매칭 실패 시 유사도 기반 추천).
  - 전달: `PATCH .../status` `{status:"reviewing_v1"|"reviewing_v2"}`.
- **성공 시 기대 결과**: 고객 쪽 `/c/[token]/review`가 활성화되고, `/c/[token]/locked` 등에서도 "보정본이 도착했습니다" 안내가 노출(고객 흐름 §Part1-11).
- **실패 및 경계 상황**: 재보정 횟수 베타 한도(`BETA_MAX_REVISION_COUNT=2`)를 넘는 버전 업로드는 FastAPI가 거부. 2MB를 넘는 보정본은 품질을 85%→60%까지 단계적으로 낮춰 자동으로 맞춤(그래도 못 맞추면 어떻게 되는지는 **확인 필요**). V1을 다시 업로드(교체)하면 해당 사진의 `version_reviews`가 삭제되어 고객이 재검토해야 함.
- **관련 권한/인증 조건**: 로그인 세션(Supabase JWT를 FastAPI에 직접 전달), 소유권.
- **QA에서 확인해야 할 항목**: `canUploadV1`/`canUploadV2` 조건(`["editing","reviewing_v1"]`/`["editing_v2","reviewing_v2"]`) 밖의 상태에서 업로드 시도 시 UI 차단 여부, 파일명 매칭이 실패했을 때 CLIP 매칭 제안 UI의 정확도.

---

## 8. 프로젝트 상태 변경

- **시작 조건**: 각 상태 전이 조건 충족 시(§`docs/architecture.md` 5.1 상태 머신 참고).
- **사용자가 수행하는 단계**: 각 화면의 전용 버튼 클릭(초대 링크 활성화/보정 시작/고객에게 전달 등). 상태를 임의로 건너뛰는 UI는 제공되지 않음.
- **프론트엔드 라우트**: 상태별로 분산(`upload/page.tsx`, `results/page.tsx`, `workflow/WorkflowPageClient.tsx`, `ProjectNexusPageClient.tsx`).
- **호출되는 API**: `PATCH /api/photographer/projects/{id}` 또는 `PATCH /api/photographer/projects/{id}/status` — 서버가 `canTransition(from, to, {maxRevisionCount, revisionRound})`으로 허용 여부를 검증, 허용되지 않으면 400.
- **성공 시 기대 결과**: `project_logs`에 이력 기록, 관련 화면들이 새 상태를 즉시 반영.
- **실패 및 경계 상황**: 허용되지 않는 전이(예: `preparing → confirmed` 건너뛰기) 요청 시 400. 고객이 확정을 취소(`confirmed → selecting`, 최대 3회)한 직후 작가가 이미 "보정 시작"을 누르려던 경우의 경쟁 조건은 **확인 필요**(둘 다 서버에서 상태를 재확인하므로 이론상 안전하나 UX 상 혼란 가능).
- **관련 권한/인증 조건**: 로그인 세션 + 소유권. `/api/photographer/projects/{id}/status`가 `/api/photographer/projects/{id}`(PATCH)와 별도로 존재하는 이유(권한 범위 차이 등)는 **확인 필요**.
- **QA에서 확인해야 할 항목**: 두 브라우저 탭(작가/고객)을 동시에 열어 상태를 양쪽에서 바꾸는 경쟁 조건, `project_logs` 액션 목록(`created`/`uploaded`/`selecting`/`confirmed`/`editing`)이 실제 모든 전이를 빠짐없이 기록하는지(`reviewing_v1` 이후 전이는 로그 액션 화이트리스트에 없어 기록되지 않을 가능성 — `src/app/api/photographer/project-logs/route.ts` 확인 필요).

---

## 부록: 이번 조사에서 흐름별로 남은 `확인 필요` 요약

- 프로젝트 생성 폼이 최종적으로 호출하는 정확한 API(엔드포인트, FastAPI 직접 여부).
- `access_token` 발급 주체(DB 기본값/트리거 vs 애플리케이션 코드).
- 결과 페이지(`results/page.tsx`)가 사진/선택 데이터를 가져오는 정확한 API 경로.
- 로그인 실패(OAuth 거부 등) 시 사용자에게 보이는 화면.
- Kakao OAuth의 실제 활성화 여부(Supabase 대시보드 설정).
- `preparing` 상태 고객 링크에 접근했을 때의 정확한 화면.
- 별점/코멘트 저장의 정확한 트리거 시점(디바운스 여부).
- `photo_versions` 업로드가 2MB 상한을 끝내 못 맞췄을 때의 동작.
- `reviewing_v1`/`reviewing_v2` 이후 상태 전이가 `project_logs`에 기록되는지 여부.
