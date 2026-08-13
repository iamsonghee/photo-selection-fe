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
  - 인증 완료 후에는 `InvitePageClient`가 `project.status`를 다시 확인해 `editing`/`editing_v2` → `/locked`, `confirmed` → `/confirmed`로 재분기. 그 외(주로 `preparing`/`selecting`)에는 고객명, 프로젝트명, 전체 사진 수, 필수 선택 수, 선택 마감일과 `사진 선택 시작하기` CTA를 표시한다. PC는 4개 핵심 정보를 한 줄로, 모바일은 2열로 압축해 핵심 정보와 CTA가 첫 화면에 들어오게 한다. 선택 마감일은 서버 차단 조건이 아니므로 이미 지난 경우에도 CTA를 막지 않고 "선택 권장일이 지났지만 지금도 사진을 선택할 수 있어요"라고 안내한다. 원본 포함 프로젝트는 같은 화면에서 별도 `원본 다운로드` 진입점을 제공한다.
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
- **호출되는 API**: `GET /api/c/photos?token=...` (via `SelectionContext`) — 프로젝트/사진/기존 선택/`photo_groups` 반환. 그리드 카드의 실제 썸네일 이미지는 `photos.r2_thumb_url`을 직접 쓰지 않고, `GET /api/c/presign-thumbs?token=...&photoIds=...`(최대 200장/요청, FastAPI `/api/storage/presign` 프록시)로 발급받은 presigned GET URL을 사용한다 — R2 key 자체는 응답에 노출되지 않는다(§8.1·§10 upload-flow.md 참고, 과거 문서는 "r2_thumb_url을 그대로 사용"으로 잘못 서술돼 있었음, 2026-08-06 정정).
- **성공 시 기대 결과**: 사진 그리드 렌더, 이미 저장된 선택/별점/코멘트가 있으면 그대로 표시. 작가가 "유사컷 분석"을 실행해 완료된 프로젝트라면, 흔들림/눈감음 의심 사진에 경고 배지(⚠, 카드 우상단)가 표시됨 — **정보성 참고용이며 선택/확정을 막지 않음**. **(2026-07-28 베타 전환)** 이 배지는 OpenCLIP 파이프라인이 채우던 `blur_variance` 등 컬럼 기반인데, 유사컷 분석 버튼이 Gemini로 전환되며 신규 분석에서는 더 이상 이 컬럼들이 채워지지 않는다 — 배지 UI 코드는 남아있지만 과거(전환 이전) OpenCLIP으로 분석된 프로젝트에서만 실제로 보이고, 신규/재분석 프로젝트에는 나타나지 않는다. 분석 완료 이후 고객이 갤러리를 처음 여는 시점 기준으로만 반영되고, 이미 갤러리를 열어둔 상태에서 작가가 재분석하면 새로고침 전까지 배지가 갱신되지 않음. 같은 조건(분석 완료된 프로젝트)에서는 "유사컷 묶어보기" 토글도 함께 노출됨(기본 OFF, 2026-07-30 이전에는 "유사컷 대표이미지 적용"이라는 라벨이었음) — 이 토글은 `photo_groups`/`similarity_group_id`를 그대로 읽으므로 베타 전환 이후에도 동일하게 동작한다(이제 Gemini가 채운 결과를 보여줄 뿐). **(2026-07-30 UX 개선)** 켜면 각 그룹의 "표지" 사진 1장만 보이고 나머지 멤버는 숨겨진다 — 표지는 그룹 내 선택된 사진이 없으면 내부적으로 계산된 기본 표지(구 "대표컷", 화면에는 이 개념이 노출되지 않음)이고, 1장 이상 선택돼 있으면 선택 개수와 무관하게 항상 "선택된 사진 중 원래 촬영/파일 순서가 가장 앞선 사진"이 표지가 된다. 배지는 항상 `+N`(표지 외에 접힌 사진 수, 선택 개수와 무관하게 고정) 형태이고, 그룹 내 선택이 1장 이상이면 `+N · M/전체 선택`처럼 선택 수를 함께 표시한다. 펼치면 항상 원래 촬영/파일 순서(orderIndex)대로 나열되며, 사진을 선택/해제해도 그 순서나 그룹 펼침/접힘 상태는 전혀 바뀌지 않는다(그룹 내 여러 장을 선택해도 자동으로 펼쳐지거나 풀리지 않음) — 이 토글은 고객이 선택 가능한 사진의 화면상 가시성에 직접 영향을 준다.
- **실패 및 경계 상황**:
  - `project.status === "preparing"` → `/c/[token]`으로 되돌림(`GalleryPageClient.tsx:150`).
  - `project.status === "confirmed"` → `/c/[token]/confirmed`로 이동.
  - `project.status === "editing"` → `/c/[token]/locked`로 이동.
  - `project`가 끝내 `null`이면(§BUG-001 계열) "INVALID_TOKEN" 표시 — 정상 흐름에서는 인증 후 전체 페이지 이동으로 재발생하지 않음(§2 참고).
- **관련 권한/인증 조건**: PIN 쿠키 필요(미들웨어가 `/c/:token/:path+`로 보호).
- **QA에서 확인해야 할 항목**: 사진 수가 많은 프로젝트(수백 장)에서 최초 로딩 속도. 가상 스크롤은 실제로 적용되어 있음(`GalleryPageClient.tsx`가 `@tanstack/react-virtual`의 `useVirtualizer`로 행 단위 가상화, 화면+overscan 범위만 DOM에 렌더 — 2026-08-06 확인, 이전 "확인 필요" 서술 정정).

---

## 6. 사진 조회 및 상세 보기

- **시작 조건**: 갤러리 진입 완료, `status === "selecting"`.
- **사용자가 수행하는 단계**: 사진 클릭 → 전체화면 뷰어 진입 → 좌우 이동/ESC로 갤러리 복귀.
- **프론트엔드 라우트**: `/c/[token]/viewer/[photoId]` (`src/app/c/[token]/viewer/[photoId]/page.tsx`).
- **호출되는 API**: `SelectionContext`의 기존 데이터 사용(추가 목록 조회 없음) + 대형 프리뷰 이미지는 `GET /api/c/presign-preview?...`로 presigned URL을 받아 표시(FastAPI `/api/storage/presign` 경유).
- **성공 시 기대 결과**: 원본 대비 축소된 프리뷰(1200px) 표시, 별점/색상/코멘트/선택 토글 UI 노출. PC·모바일 헤더에는 파일명보다 탐색 맥락을 우선해 `11번째 · 전체 34장` 같은 현재 위치와 진행 바를 표시한다. 하단 액션 영역은 평가(별점·색상) → 코멘트 저장 상태 → 코멘트 입력·사진 선택 CTA의 3단 구조다.
- **실패 및 경계 상황**: presign 호출 실패 시 이미지 표시 실패 가능성 — 폴백(예: `r2_preview_url` 직접 사용) 여부는 **확인 필요**. 존재하지 않는 `photoId` 접근 시 동작도 **확인 필요**.
- **관련 권한/인증 조건**: PIN 쿠키(미들웨어 보호 대상).
- **QA에서 확인해야 할 항목**: 방향키/스와이프로 이전·다음 이동, 마지막/첫 사진에서 경계 동작, 이미지 우클릭/드래그 저장 방지(`NEXT_PUBLIC_BLOCK_VIEWER_IMAGE_DOWNLOAD` 옵션) 동작 여부.

### 6-1. 유사컷 그룹 skip 내비게이션 (뷰어)

갤러리에서 "유사컷 묶어보기" 토글을 켠 상태로 사진을 클릭하면, 이 상태가 뷰어 URL에 `?grouped=1`로 전달된다
(`GalleryFilterState.groupedView` → `buildFilterQueryString`, `src/lib/gallery-filter.ts`). 뷰어는 이 파라미터를
`parseFilterFromSearchParams`로 읽어 그룹핑을 활성화한다(`groupingActive` — 파일명/품질 필터가 켜져 있으면 그룹 접기보다
우선하므로 자동으로 비활성화됨, 갤러리와 동일 규칙).

**(2026-07-30 UX 개선)** 그룹의 "표지(front)" 개념과 펼침 상태 관리가 다음과 같이 바뀌었다:

- **필름스트립/좌우 이동/스와이프는 표지 사진(+미소속 사진) 단위로만 동작한다** — 그룹의 다른 멤버는 목록에서
  제외되므로 "다음/이전"이 항상 그룹을 건너뛴다(`src/lib/photo-groups.ts`의 `filterToGroupFrontPhotos`/`getGroupFrontPhotoId`
  사용, 갤러리와 공용). 표지는 그룹 내 선택된 사진이 없으면 내부 기본 표지(구 "대표컷", 화면에 노출되지 않음)이고,
  1장 이상 선택돼 있으면 선택 개수와 무관하게 항상 "선택된 사진 중 원래 촬영/파일 순서(orderIndex)가 가장 앞선 사진"이다.
- 표지 하단에 그룹이 있음을 암시하는 힌트(PC: `◧ 유사컷 N장 ▾` pill, 모바일: 이미지 하단 플로팅 pill)가 나타나며,
  클릭/탭하면 나머지 멤버가 펼쳐진다 — PC는 필름스트립 위 미니 스트립, 모바일은 하단 바텀시트.
  펼쳐진 멤버는 **항상 원래 촬영/파일 순서(orderIndex)대로 나열**되고, 멤버를 클릭해 미리보기를 전환하거나 다른
  사진을 선택/해제해도 이 순서나 펼침 상태는 전혀 바뀌지 않는다(그룹 내 여러 장을 선택해도 자동으로 펼쳐지거나
  풀리지 않음 — 셀렉 상태와 펼침 상태는 완전히 분리되어 있다).
- 메인 필름스트립에서 펼쳐진 그룹의 표지 썸네일에는 오렌지 링(`.fs-thumb.group-expanded`)이 표시된다.
- **펼침 상태는 그룹(groupId)별로 세션 내내 기억된다**(`groupExpandStateRef`): 그룹에 처음 진입할 때만
  "지금 보는 사진이 표지가 아니면 1회 자동으로 편다"를 판단하고, 그 이후로는 사용자가 펼치기/접기 버튼으로
  명시적으로 바꾸기 전까지 그 상태를 유지한다 — 다른 그룹이나 미소속 사진으로 이동했다가 다시 돌아와도
  이전에 접었던 그룹은 계속 접힌 채로 남는다. 그룹핑 토글을 껐다가 다시 켜면 모든 그룹의 기억이 초기화되어
  다시 "새 진입"으로 취급된다. 미소속 사진으로 이동하면 열려있던 패널 UI는 닫히지만(펼침 여부 자체는 그
  이전 그룹의 기억에 그대로 남아있음), 그룹이 없는 사진에는 애초에 패널이 뜨지 않는다.
- 모바일 바텀시트가 열려 있어도 스와이프/이전·다음 버튼은 계속 동작한다 — 배경 오버레이는 `pointer-events: none`으로
  시각적 딤 처리만 하고, 시트 패널 자체(`pointer-events: auto`)만 탭을 가로챈다.
- `?grouped=1`이 없으면(토글 OFF 상태에서 진입, 또는 구형 링크) 기존처럼 전체 사진을 낱장으로 순회하는 동작이 그대로 유지된다.

---

## 7. 사진 선택과 선택 취소

- **시작 조건**: 갤러리 또는 뷰어에서 `status === "selecting"`.
- **사용자가 수행하는 단계**: 사진(또는 체크박스) 클릭으로 선택 토글.
- **프론트엔드 라우트**: `/c/[token]/gallery`, `/c/[token]/viewer/[photoId]` (둘 다 `SelectionContext.toggle()` 사용).
- **호출되는 API**: `POST /api/c/selections` `{ token, project_id, photo_id, is_selected }` — `rating`/`color_tag`/`comment`는 이번에 안 바뀌면 body에 아예 포함하지 않는다(서버가 생략된 필드는 건드리지 않음). fire-and-forget(응답을 기다리지 않고 UI는 즉시 갱신).
- **성공 시 기대 결과**: 헤더의 "SELECTED Y / N" 카운트 갱신, `selections` 테이블에 upsert. 뷰어에서 선택하면 PC·모바일 사진 좌상단에는 갤러리와 동일한 오렌지 체크 배지가 표시되고, CTA는 `✓ 선택됨 · Y / N`으로 바뀐다.
- **실패 및 경계 상황**:
  - 이미 N장을 채운 상태에서 새 사진을 선택하려 하면 **클라이언트에서 차단**(요청 자체가 서버로 가지 않음) — 이미 선택된 사진을 해제하는 것은 언제나 가능.
  - **서버 측에는 N장 제한 검증이 없음** — 클라이언트 로직을 우회해 N장 넘게 저장을 시도하면 `selections` 테이블에는 들어갈 수 있으나, `/api/c/confirm`에서 개수 불일치로 최종 확정은 거부됨.
  - `status`가 `selecting`/`preparing`이 아니면 서버가 403 반환(예: 이미 확정된 후 뒤늦은 요청).
- **관련 권한/인증 조건**: PIN 쿠키, `checkPinAuth` + `validateTokenAndProject`.
- **QA에서 확인해야 할 항목**: 빠른 연속 클릭(더블 클릭) 시 상태 깜빡임 여부, 네트워크 지연 중 여러 번 클릭했을 때 최종 상태 일관성, 새로고침 시 선택 상태가 서버 값과 일치하는지. 선택 직후 PC·모바일의 pill/CTA 상태가 올바르게 전환되는지도 확인한다. **여러 브라우저(동일 토큰)에서 서로 다른 사진/필드를 동시에 편집해도 서로의 값을 지우지 않는지**(2026-07-28 수정 — §8, 부록 참고).

---

## 8. 별점 및 코멘트 저장

- **시작 조건**: 뷰어 또는 갤러리 카드에서 `status === "selecting"`.
- **사용자가 수행하는 단계**: 별점(1~5) 클릭, 색상 태그 선택, 코멘트 입력. 뷰어의 코멘트는 입력이 600ms 멈추면 자동 저장되며, 포커스 아웃·Enter·다른 사진으로 이동할 때도 즉시 저장을 시도한다. PC·모바일 모두 입력창 바로 위에 `자동 저장` → `저장 중…` → `✓ 저장됨` 상태를 표시한다.
- **프론트엔드 라우트**: `/c/[token]/viewer/[photoId]` (주 입력처), `/c/[token]/gallery`(카드 오버레이에서도 가능할 수 있음, **확인 필요**).
- **호출되는 API**: `POST /api/c/selections` — 이번에 실제로 바뀐 필드(`rating`/`color_tag`(직렬화됨)/`comment` 중 해당하는 것)만 body에 포함하고 나머지는 생략, `is_selected`도 생략(서버가 기존 값을 그대로 보존). 예: 색상칩만 클릭하면 `color_tag`만 전송되고 `rating`/`comment`는 body에 없음.
- **성공 시 기대 결과**: 별점/태그/코멘트가 즉시 UI에 반영되고 서버에도 저장됨. 코멘트는 완료 후 2초간 `✓ 저장됨`을 보여준 뒤 `자동 저장` 안내로 돌아간다.
- **실패 및 경계 상황**: 코멘트 저장 요청이 실패하면 입력한 내용을 유지하고 `저장 실패 · 다시 시도`를 표시한다. 다시 시도는 같은 코멘트를 재전송한다. (과거엔 안 바뀐 필드까지 로컬 캐시 값 그대로 재전송해서, 동시에 다른 세션이 그 사이 저장한 값을 덮어쓰는 데이터 유실 버그가 있었음 — 2026-07-28 수정, §11/부록 참고.)
- **관련 권한/인증 조건**: PIN 쿠키, `status`가 `selecting`/`preparing`이어야 함.
- **QA에서 확인해야 할 항목**: 특수문자·이모지·매우 긴 코멘트 입력, 600ms 자동 저장·blur·Enter·사진 이동 시 저장, 저장 중/완료/실패 상태가 PC·모바일에서 올바르게 전환되는지, 코멘트 저장 실패 시(네트워크 끊김) 입력값을 유지한 채 재시도할 수 있는지, 별점을 준 뒤 선택을 해제해도 별점이 유지되는지. **여러 브라우저(동일 토큰)에서 서로 다른 필드를 동시에 편집해도 유실되지 않는지**(A가 별점, B가 색상칩을 거의 동시에 저장 → 둘 다 남아있어야 함).

---

## 9. 새로고침과 새 탭에서 상태 유지

- **시작 조건**: PIN 인증 완료 상태(쿠키 존재).
- **사용자가 수행하는 단계**: 브라우저 새로고침, 또는 같은 링크를 새 탭에서 열기.
- **프론트엔드 라우트**: 접근하던 라우트 그대로.
- **호출되는 API**: 페이지 재마운트에 따라 `GET /api/c/photos` 등이 다시 호출됨(쿠키가 브라우저 프로필 단위로 공유되므로 새 탭에서도 동일 쿠키 사용).
- **성공 시 기대 결과**: 재인증 없이 동일 화면 유지, 선택/별점/코멘트는 서버에 저장된 값 기준으로 다시 로드됨(클라이언트 로컬 상태를 별도로 캐시하지 않음). **갤러리(`/c/[token]/gallery`)의 필터 상태(선택됨 탭/별점/색상/정렬/파일명 검색/흔들림·눈감음 필터/유사컷 대표이미지 적용 토글)는 URL 쿼리에 반영되어 새로고침·뒤로가기 후에도 유지된다** — 필터를 바꿀 때마다 `router.replace`로 URL만 갱신(히스토리에 새 엔트리를 쌓지 않음), 마운트 시 URL에서 1회 복원. 뷰어와 동일한 `GalleryFilterState`/`parseFilterFromSearchParams`/`buildFilterQueryString`(`src/lib/gallery-filter.ts`)을 재사용.
- **새로고침 없이도 다른 세션의 변경사항이 반영됨(2026-07-28 추가)**: `status`가 `selecting`/`preparing`인 동안 `SelectionContext`가 5초 간격으로 선택/별점/색상/코멘트만 폴링해 화면에 반영한다(사진 목록·필터는 폴링 대상 아님). 완전한 실시간(WebSocket 등)은 아니라서 최대 폴링 주기(탭이 백그라운드면 그동안 정지, 포그라운드 복귀 시 즉시 1회 재조회)만큼 지연될 수 있다.
- **실패 및 경계 상황**: 쿠키의 서명 타임스탬프가 24시간을 넘으면 새로고침 시 `/pin`으로 다시 리다이렉트됨(§10 참고). 시크릿 모드/다른 브라우저에서는 쿠키가 공유되지 않아 재인증 필요. PIN 쿠키가 아직 없는 상태로 쿼리 파라미터가 붙은 링크(필터/그룹 상태 포함)에 처음 접근하면, `/pin` 인증 왕복 후에도 원래 쿼리스트링이 그대로 보존되어 목적지 URL에 복원된다(`src/middleware.ts`가 리다이렉트 시 `pathname`뿐 아니라 `search`까지 `from` 파라미터에 함께 실어 보냄 — 과거엔 쿼리스트링이 유실되는 버그가 있었음, 회귀 테스트: `tests/e2e/customer/pin-auth.spec.ts` M3).
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
- **이미 로그인된 상태로 `/landing` 재방문(2026-07-27 추가)**: 이전에는 로그인 여부와 무관하게 항상 "Login"/"무료로 시작하기" CTA가 뜨고 클릭 시 `AuthModal`이 다시 열려, 세션이 멀쩡한데도 매번 OAuth 재동의 화면을 거쳐야 하는 불편이 있었다. `LandingPage`가 마운트 시 `supabase.auth.getUser()`로 세션 여부를 확인해(`src/app/landing/page.tsx`), 로그인된 상태면 모든 CTA 라벨이 "대시보드로 이동"(헤더는 "대시보드")으로 바뀌고 클릭 시 `AuthModal` 없이 곧바로 `router.push("/photographer/dashboard")`로 이동한다.
- **프론트엔드 라우트**: 로그인 트리거는 `AuthModal` 컴포넌트(랜딩 페이지 등에서 열림), 콜백은 `GET /auth/callback`. (`/auth` 페이지 자체는 사용되지 않는 no-op 리다이렉트였으며 2026-07-13 삭제됨)
- **호출되는 API**: `supabase.auth.signInWithOAuth({ provider: "google"|"kakao", options: { redirectTo: origin + "/auth/callback" } })` (Supabase Auth, 자체 API 라우트 아님) → 콜백에서 `supabase.auth.exchangeCodeForSession(code)`.
- **성공 시 기대 결과**: 콜백이 `photographers` 테이블에 해당 `auth_id`가 없으면 자동 생성 후 기본적으로 `/photographer/dashboard`로 리다이렉트.
- **실패 및 경계 상황**:
  - OAuth 동의 거부/실패 시 처리 로직은 이번 조사에서 확인하지 못함 — **확인 필요**.
  - Kakao 로그인은 **실제로 활성화되어 정상 동작함을 확인함**(2026-07-27, `auth.users`를 직접 조회해 `provider: "kakao"`인 실제 계정과 정상 이메일을 확인 — 기존 `ACUT_OVERVIEW.md`의 "카카오 미구현" 기록은 오래된 정보로 보임).
  - 테스트 전용 이메일/비밀번호 로그인(`/api/auth/test-login`)은 `ENABLE_TEST_LOGIN=true`일 때만 동작하며 실제 사용자 흐름이 아님.
- **관련 권한/인증 조건**: 없음(로그인 자체는 누구나 시도 가능, 이후 모든 작가 기능은 세션 필요).
- **QA에서 확인해야 할 항목**: 최초 로그인 시 `photographers` 행이 정말 자동 생성되는지, 로그아웃 후 재로그인 시 중복 생성되지 않는지, 로그인 세션이 만료된 상태에서 작가 페이지 접근 시 어떤 화면이 뜨는지(미들웨어가 `/photographer/**`를 보호하지 않으므로 페이지 셸은 보일 수 있음 — `docs/architecture.md` §13 참고).

---

## 2. 프로젝트 생성

- **시작 조건**: 로그인 완료, `/photographer/projects` 목록 화면.
- **사용자가 수행하는 단계**: "새 프로젝트" 진입 → 등급별 한도를 이미 다 썼으면 입력 폼 대신 안내 화면이 즉시 뜬다(§9-1 참고, 사전에 `GET /api/photographer/quota`로 확인). 아니면 프로젝트명, 고객명, 촬영일, 셀렉 기한, 필요 선택 장수(N), 촬영 종류, 고객 연락처(선택), PIN(선택), 재보정 허용 횟수 입력 → 생성.
- **프론트엔드 라우트**: `/photographer/projects/new`.
- **호출되는 API**: `POST /api/photographer/projects`(2026-07-26부터 — 이전에는 `src/lib/db.ts`의 `createProject()`가 브라우저에서 Supabase에 직접 INSERT했으나, 서버 검증이 전혀 없어 등급별 한도를 강제할 수 없었기 때문에 이 API로 옮김). `access_pin`, `max_revision_count` 등 폼 상태 전체를 그대로 body로 전송(`src/app/photographer/projects/new/page.tsx`).
- **성공 시 기대 결과**: `status: "preparing"`인 새 프로젝트 생성, `access_token`은 이 API가 `crypto.randomUUID()`로 발급. 성공 시 `photographers.total_projects_created`를 +1하고(현재는 어떤 검증 로직도 이 값을 읽지 않음 — §9-1) `project_logs`에 `created` 액션을 함께 기록(이전에는 클라이언트가 생성 직후 별도로 `project-logs` API를 한 번 더 호출했으나 이 API로 통합됨). 생성 직후 `/photographer/projects/[id]` 상세 허브로 이동하며, 화면 최상단의 "다음 단계" 카드가 원본 업로드 시작으로 안내한다.
- **실패 및 경계 상황**: 필수 필드(셀렉 기한 등) 누락 시 클라이언트 유효성 검사 에러 표시. 등급별 한도 초과 시 403 + `{error:"beta_limit_exceeded", limit_type, current, max, message}`(§9-1) — 관리자는 무제한, 베타는 현재 보유 10개, 일반(Trial)은 현재 보유 1개까지(둘 다 "현재 보유 수" 기준 — 삭제하면 슬롯이 다시 확보됨).
- **관련 권한/인증 조건**: 로그인 세션 필요. 한도 검증은 세션에서 조회한 `photographer_id` 기준으로만 이뤄지며 클라이언트가 보낸 값은 신뢰하지 않는다.
- **QA에서 확인해야 할 항목**: 일반 사용자가 한도(1개) 도달 후 그 프로젝트를 삭제하면 다시 생성할 수 있는지(현재 보유 수 기준이라 정상 동작 — §9-1), PIN을 생성 시점에 설정하지 않고 나중에 추가하는 경로(§5)와의 동작 일치 여부.

---

## 3. 프로젝트 상세 허브 및 고객 프로젝트 설정

- **시작 조건**: 프로젝트 생성 완료, `/photographer/projects/[id]` 진입.
- **사용자가 수행하는 단계**: 화면 최상단의 "현재 작업" 패널에서 현재 상태에 맞는 작업으로 이동하고, 그 아래의 공통 프로젝트 상세 정보에서 프로젝트명·고객명·촬영일·셀렉 기한·필요 장수(N)·촬영 종류·고객 연락처·재보정 횟수·납품 파일 설정을 확인하거나 수정한다. 작업 패널은 `preparing + photo_count=0`이면 원본 업로드 시작, `preparing + photo_count>0`이면 업로드 현황, `selecting`이면 셀렉 현황, 보정 상태면 워크플로우, 검토 상태면 보정본 현황, `delivered`이면 프로젝트 결과로 안내한다.
- **프론트엔드 라우트**: `/photographer/projects/[id]` (`ProjectNexusPageClient.tsx`, 편집 모드 토글).
- **호출되는 API**: 상세 데이터 조회 및 로그 조회 외에, 정보 수정 시 `PATCH /api/photographer/projects/{id}` — 세션+소유권 확인 후 필드 갱신. "현재 작업" 패널은 상태를 변경하지 않고 기존 업로드·워크플로우·결과 화면으로 이동만 한다.
- **성공 시 기대 결과**: 화면에 즉시 반영("프로젝트 정보가 저장되었습니다" 토스트).
- **실패 및 경계 상황**: 필요 장수(N)는 `["preparing", "selecting"].includes(status)`일 때만 수정 가능(`canEditN`) — 확정 이후에는 수정 불가로 보임. 저장 실패 시 에러 메시지 표시.
- **관련 권한/인증 조건**: 로그인 세션 + `project.photographer_id` 일치.
- **QA에서 확인해야 할 항목**: `confirmed` 이후 상태에서 N을 수정하려는 시도가 실제로 UI/서버 양쪽에서 막히는지, 셀렉 기한을 과거 날짜로 바꿨을 때의 동작.

---

## 4. 사진 업로드

- **시작 조건**: `status`가 `preparing` 또는 `selecting`(`UPLOADABLE_STATUSES`).
- **사용자가 수행하는 단계**: 파일 선택(드래그앤드롭 또는 파일 다이얼로그) → 업로드 확인 모달에서 "원본 포함" / "썸네일만" 선택(예상 시간 안내 포함) → 자동 압축 → 업로드 진행률 확인 → (N장 이상 업로드 완료 시) "초대 링크 활성화" 버튼 클릭. 모달에서 선택한 `include_original` 값이 업로드에 적용됨. HEIC 파일이 포함된 상태에서 "원본 포함"을 선택하면 HEIC 건수 경고가 모달 내에 표시되고 해당 파일은 썸네일만 업로드됨. 드래그앤드롭은 데스크톱에서만 활성화(모바일 비활성화).
- **프론트엔드 라우트**: `/photographer/projects/[id]/upload`.
- **호출되는 API**:
  1. 클라이언트 압축(`compressImagesInParallel`, 워커 풀 기반 — 이 화면 전용, `include_original` 값과 무관하게 **항상** 실행됨. 서버 호출 아님). `include_original=true`일 때도 압축본이 `/api/upload/photos`로 전송되며, **별도로** 압축되지 않은 브라우저 원본(`rawFile`)이 R2로 직접 PUT된다 — 즉 이 경우 같은 사진이 압축본(BE 경유)과 원본(R2 직접)으로 두 번 전송된다. 상세 배치/동시성/barrier 구조는 `docs/upload-flow.md` 참고.
  2. `POST {NEXT_PUBLIC_API_URL}/api/upload/photos`(FastAPI, Bearer JWT) — 실패 시 `POST /api/photographer/upload/photos`(Next 프록시)로 폴백.
  3. `include_original=true`일 때 응답의 `original_presigned`를 파싱 → R2에 presigned PUT(브라우저→R2 직접, BE 비경유) → `POST /api/photographer/upload/originals/confirm`(`job_id`) 순서로 처리(각 파일별 순차, 오류는 non-fatal로 경고만). 이 확인(confirm) 응답까지 받아야 해당 배치가 완료 처리된다 — "업로드 완료" 토스트는 이 단계까지 포함해서 기다린다.
  4. N장 이상 업로드 완료 후 수동으로 `PATCH /api/photographer/projects/{id}/status` `{status:"selecting"}` 호출("초대 링크 활성화" 버튼) — **자동 전환이 아니라 작가가 직접 눌러야 하는 수동 액션**입니다(기존 문서의 "자동 활성화" 서술과 달리 확인됨).
- **성공 시 기대 결과**: 업로드 세션 진행 중 화면에 보이는 이미지는 서버 썸네일이 아니라 브라우저 로컬 `URL.createObjectURL()` blob URL이며(선택 직후: 원본 파일 blob, 전송 중: 압축본 blob), 세션 전체가 끝난 뒤 1회 DB를 재조회해 실제 `r2_thumb_url` 기반 그리드로 교체된다. `projects.photo_count`는 각 배치 응답마다 증가. 원본 포함 세션은 마지막에 R2/ZIP 작업 없는 DB 상태 검증을 1회 수행하고, 원본 PUT/confirm 실패가 남아 있으면 "업로드 완료"로 표시하지 않고 "원본 업로드 확인 필요"와 이어 업로드 배너를 보여준다. 정상 PUT에는 재시도 대기가 없고, 복구 가능한 실패에만 최대 2회 추가 재시도한다. N장 이상이면 "초대 링크 활성화" 버튼이 활성화되고, 클릭 시 `status: "selecting"`으로 전환 + 공유 모달 표시. 이때 원본이 `pending/processing`이면 복구 오류로 오인하지 않고 버튼을 `원본 확인 중…` 상태로 유지하며 최대 15초 동안 1초 간격으로 활성화를 자동 재시도한다. `awaiting_upload`/`failed`/`NULL`처럼 실제 원본 복구가 필요한 상태가 있을 때만 복구 안내를 표시한다. `include_original=true` 업로드 시 워크플로우 화면의 원본 카드에 `original_status` 배지(`원본 처리 중`/`원본 완료`/`원본 실패`)가 표시됨. 이 "원본 처리"는 재압축이 아니라 R2에 이미 올라온 파일의 존재 확인(HEAD)뿐이라 통상 `original_compress_worker`의 다음 5초 폴링 주기 안에 끝난다(수분~수십분이 걸린다는 과거 서술은 압축 단계가 있던 시절 기준으로 부정확 — §8.1 참고). 단, Railway가 Sleep한 상태였다면 다음 HTTP 요청이 올 때까지 지연될 수 있다.
  - **(2026-07-28 베타 전환) `[AI 유사도 분석]` 버튼의 엔진이 OpenCLIP → Gemini Embedding으로 바뀜.** 버튼 위치·라벨은 그대로이고 사용자에게 "Gemini"라는 이름은 노출되지 않는다. 클릭하면 이제 clip-service의 `/analyze/gemini`를 호출해 유사컷 그룹핑만 수행한다 — **흔들림/눈감음 경고 배지는 이 전환과 함께 업로드 화면에서 완전히 제거**되었다(OpenCV/MediaPipe가 더 이상 실행되지 않아 신규 데이터가 생기지 않으므로). 버튼 문구는 상태에 따라 5단계로 바뀐다: "AI 유사도 분석 시작"(최초) → "AI 분석 중"(진행 중, 중단 가능) → "새 이미지 분석"(신규 사진만 있고 실패 없음) → "분석 재개"(일부 실패) → "분석 결과 보기"(전부 완료, 클릭해도 API 재호출 없이 토글만 켜짐 — 이미 최신 결과가 저장돼 있음). AI 유사컷 분석 트리거는 `preparing`/`selecting` 두 상태 모두에서 노출되어, 초대 링크 활성화 이후 추가로 올린 사진도 재분석할 수 있다 — 다만 이미지 단위 캐시 덕분에 이미 분석된 사진은 재요청해도 Gemini API를 다시 호출하지 않고 새로 추가된 사진만 분석한다(그룹핑 자체는 항상 프로젝트 전체를 다시 계산해 `photo_groups`/`similarity_group_id`를 최신 상태로 교체). 사진을 삭제(1건/전체삭제)하면 그룹도 자동으로 재정합화된다.
  - **(2026-07-28 추가) 관리자 계정 한정**: 위 "AI 유사컷 분석" 바 아래에 별도 "Gemini 분석 (POC)" 바가 추가로 노출된다(일반 작가 계정에는 보이지 않음, 단 이 바가 호출하는 threshold 재계산/품질 조회 API만 관리자 이메일이 아니면 403 — 분석 자체를 트리거/취소/폴링하는 API는 위 일반 버튼과 동일해 관리자가 아니어도 통과함). 이 패널은 이제 OpenCLIP과의 비교 목적이 아니라 **threshold 슬라이더 실험 + Gemini Flash 품질 판정(관리자 전용) 조회 UI**로 성격이 바뀌었다 — 분석 대상 이미지 수(50장/100장/전체)를 선택해 트리거하면 별도 진행 상태 폴링 후 "결과 보기" 모달에서 그룹·처리량·실패수·예상비용을 확인할 수 있다. threshold 슬라이더로 재그룹핑해도 Gemini API를 다시 호출하지 않아 추가 비용이 없다(단, 이 슬라이더 실험은 화면에 표시만 될 뿐 베타 사용자에게 노출되는 실제 `photo_groups`에는 반영되지 않는다 — 베타 그룹핑은 항상 고정 threshold로 별도 계산됨). 그룹 대표 이미지는 medoid(그룹 내 다른 사진들과 평균 유사도가 가장 높은 실제 사진)로 자동 선정되어 맨 앞에 "대표 이미지" 배지로 표시된다.
  - **(2026-07-28 추가) Gemini Flash 품질 판정(관리자 한정, 위 Gemini 분석과 독립)**: 같은 바에 두 번째 CTA "이미지 품질 확인 (POC)"이 추가로 노출된다. Gemini Flash 모델로 사진별 눈감음/흔들림/초점/얼굴판정 의심 여부를 4단계(문제없음/가능성있음/의심/판정어려움)로 확인한다. 이 트리거도 유사컷 분석과 독립적으로 실행/재사용되며, 이미 판정된 사진은 재요청 시 API를 다시 호출하지 않는다. **자동 삭제·숨김이 아니며 품질 이슈가 있는 사진도 그룹에서 빠지지 않는다** — 어디까지나 1차 검토를 돕는 보조 표시다. **베타 일반 사용자의 대표컷 선정에는 절대 반영되지 않는다** — 관리자 전용 조회 API(`include_quality=true`, 서버가 직접 고정)에서만 결과가 섞여 나오고, 베타 버튼이 쓰는 일반 그룹핑 계산에는 이 값이 전달되지 않는다(항상 medoid 기준).
  - **(2026-07-28 추가) 결과 모달 탭 2개**: "결과 보기"를 누르면 이제 **"품질 확인"**(기본 진입) / **"유사컷 그룹"** 두 탭이 나온다.
    - **품질 확인 탭**: Flash는 유사컷 그룹핑과 무관하게 프로젝트 전체 사진을 분석하므로, 그룹으로 묶이지 않은(싱글톤) 사진의 품질 결과도 이 탭에서 확인할 수 있다(기존에는 그룹에 포함된 사진만 결과가 보이던 누락이 있었음 — 이번에 해결). 필터 6종(전체/눈감음의심/흔들림의심/초점확인필요/얼굴판정어려움/품질분석실패·미분석)과 필터별 사진 수가 표시되고, 한 사진이 여러 축에서 의심되면 해당 필터 전부에 나타난다. 미분석·판정불가 사진은 "이상 없음"으로 절대 표시되지 않고 별도 필터로만 잡힌다. 사진을 클릭하면 원본을 새 탭으로 연다.
    - **유사컷 그룹 탭**: 기존 그룹 대표 이미지(medoid, 보라 배지)와 품질 반영 추천 이미지("AI 추천", 청록 배지)를 각 썸네일에 표시한다(medoid와 다를 수 있음 — 다르면 두 배지가 서로 다른 사진에 붙어 한눈에 비교됨). threshold 슬라이더도 이 탭에서만 노출.
    - 각 썸네일에 품질 요약 태그가 붙고, 툴팁에서 Gemini 판정과 기존 OpenCV/MediaPipe 판정(해상도가 달라 참고용)을 함께 확인할 수 있다.
- **실패 및 경계 상황**:
  - CR3/RAW 등 지원하지 않는 형식: 과거 "조용한 실패"(BUG-01, `TECHNICAL_ANALYSIS.md`) 이슈가 기록되어 있고 수정 완료(✅)로 표시되어 있으나, **현재 코드에서 실제로 실패 목록이 사용자에게 노출되는지는 이번 조사에서 재검증하지 않음 — 확인 필요**. 관련 회귀 테스트: `tests/e2e/photographer/upload.spec.ts`(U5, CR3 거부).
  - 대문자 확장자(`.JPG`, `.HEIC`) 처리: 회귀 테스트 U6 존재.
  - 0바이트 파일: 회귀 테스트 U12(거부).
  - 등급별 사진 한도(관리자 무제한, 베타/일반은 `app_settings` DB 값 — 기본값 베타 2000장·일반 500장/프로젝트, §9-1) 초과 시 FastAPI가 거부.
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
  2. 보정된 파일을 원본과 매칭해 업로드. 매칭은 4단계 순서로 자동 시도된다: ① 파일명 완전 일치 → ② 편집 툴 접미사 제거 후 유사 파일명 → ③ CLIP 이미지 유사도 → ④(2026-07-13 추가) 위 세 단계 모두 실패한 잔여 사진·잔여 파일을 순서대로 짝짓는 최후 폴백("순서" 배지로 표시, 근거가 약하므로 작가가 확인 후 "변경"으로 재지정 가능).
  3. "고객에게 전달" 클릭 → `editing → reviewing_v1` 또는 `editing_v2 → reviewing_v2` 전환.
- **프론트엔드 라우트**: `/photographer/projects/[id]/workflow`(**실제 사용되는 유일한 V1/V2 업로드·전달 화면** — 프로젝트 상세 허브의 모든 보정 관련 버튼이 여기로 연결됨, `UploadVersionsPanel.tsx` 컴포넌트가 담당). (`/photographer/projects/[id]/edit/start`와 `/photographer/projects/[id]/upload-versions`, `.../upload-versions/v2`는 어디서도 링크되지 않던 레거시 페이지로 2026-07-13 삭제됨 — `/results` 페이지의 "보정 시작하기"/"보정본 업로드" 버튼도 이때 `/workflow`로 가도록 함께 수정됨)
- **호출되는 API**:
  - `PATCH /api/photographer/projects/{id}` 또는 `.../status` `{status:"editing"}` (보정 시작).
  - `POST {API_URL}/api/upload/versions`(FastAPI 직접, Bearer JWT) — 1500px/2MB 상한 리사이즈, `photo_versions` upsert, 기존 `version_reviews` 삭제.
  - 매칭 보조: `POST /api/photographer/projects/{id}/retouch-match`(clip-service 프록시, 파일명 매칭 실패 시 유사도 기반 추천).
  - 전달: `PATCH .../status` `{status:"reviewing_v1"|"reviewing_v2"}`.
- **성공 시 기대 결과**: 고객 쪽 `/c/[token]/review`가 활성화되고, `/c/[token]/locked` 등에서도 "보정본이 도착했습니다" 안내가 노출(고객 흐름 §Part1-11).
- **실패 및 경계 상황**: 재보정 횟수 한도(기본값 2회, `app_settings.beta_max_revision_count` — §9-1, 관리자가 실시간으로 변경 가능)를 넘는 버전 업로드는 FastAPI가 거부. 2MB를 넘는 보정본은 품질을 85%→60%까지 단계적으로 낮춰 자동으로 맞춤(그래도 못 맞추면 어떻게 되는지는 **확인 필요**). V1을 다시 업로드(교체)하면 해당 사진의 `version_reviews`가 삭제되어 고객이 재검토해야 함.
- **관련 권한/인증 조건**: 로그인 세션(Supabase JWT를 FastAPI에 직접 전달), 소유권.
- **QA에서 확인해야 할 항목**: `canUploadV1`/`canUploadV2` 조건(`["editing","reviewing_v1"]`/`["editing_v2","reviewing_v2"]`) 밖의 상태에서 업로드 시도 시 UI 차단 여부, 파일명 매칭이 실패했을 때 CLIP 매칭 제안 UI의 정확도, 순차 폴백("순서" 배지)으로 잘못 매칭된 경우 "변경"으로 정상 재지정되는지.

---

## 8. 납품용 원본 업로드 및 고객 다운로드

> **정정(2026-07-31)**: 이 섹션은 과거 `delivered` 상태 이후 별도로 원본을 업로드하던 `delivery_files`/`DeliveryUploadPanel` 방식을 기술하고 있었으나, 그 방식은 2026-07-23에 완전히 제거되었다(`DROP TABLE delivery_files`, 관련 컴포넌트/엔드포인트 삭제). 아래는 현재 코드 기준 실제 흐름이다.

### 8.1 원본 업로드 (작가)

- **시작 조건**: 프로젝트 생성 시 "원본 포함" 옵션(`include_original=true`)을 선택 — `preparing` 상태이고 아직 사진을 한 장도 올리지 않은 경우에만 이후에 옵션을 바꿀 수 있다.
- **사용자가 수행하는 단계**: `/photographer/projects/[id]/upload`에서 셀렉용 이미지와 원본을 함께 업로드(같은 파일 선택 동작 — 별도의 "납품 파일 업로드" 화면은 없음).
- **호출되는 API**: `POST /api/upload/photos`(FastAPI, `include_original=true`) — 썸네일/프리뷰는 즉시 R2 업로드, 원본은 브라우저가 presigned PUT으로 R2에 직접 올린 뒤 `POST /api/upload/originals/confirm`으로 확인. `original_jobs` 비동기 큐(`original_compress_worker`)는 재압축 없이 5초 폴링으로 R2 HEAD만 재확인한다. 브라우저가 PUT한 `originals/source/{project_id}/{hex}.{ext}` 키를 그대로 `photos.r2_original_url`로 확정하고, HEAD에서 확인한 실제 원본 크기를 `photos.original_compressed_size`에 저장한다. 컬럼명에는 `compressed`가 남아 있지만 현재 의미는 재압축 크기가 아닌 원본 객체 크기다. 과거 재압축 함수(`_process_original_sync`)는 코드에 남아 있지만 호출부가 없다.
- **실패 및 경계 상황**: `include_original=true` 재업로드는 프로젝트가 `preparing`을 벗어나면(초대 링크 활성화 이후) FastAPI가 403으로 거부(§8.3 스냅샷 고정 정책).

### 8.2 납품용 원본 다운로드 ZIP 아카이브 (신규, 2026-07-31)

- **시작 조건**: `include_original=true` 프로젝트가 `preparing→selecting`으로 전환되어 고객 초대 링크가 활성화되고, 원본이 필요한 사진 전부가 `original_status='completed'`인 경우. 초대 링크 활성화 전에는 사진이 추가·삭제될 수 있으므로 ZIP을 사전 생성하지 않는다.
- **흐름**: 초대 링크 활성화 → `/api/photographer/projects/[id]/status`가 `activate_project_with_original_archive` RPC를 호출. 원본이 모두 완료됐으면 `preparing→selecting`과 `projects.original_archive_status`의 `NULL→pending`이 한 트랜잭션에서 수행된다. 이후 백그라운드 워커가 기본 500MiB(`ARCHIVE_PART_MAX_BYTES`, env로 조정 가능 — 코드 clamp 범위 50MiB~5GiB, 프로덕션 값은 Railway에 별도 설정) 단위로 `original_archive_parts`를 만들고 R2 원본을 로컬 임시 ZIP에 `ZIP_STORED`로 담아 R2에 업로드한다. 전체 파트 완료 시 `original_archive_status='ready'`.
- **초대 링크 활성화**: `include_original=true`면 `activate_project_with_original_archive` RPC가 모든 사진의 `original_status='completed'`를 확인한다. `pending/processing`만 남은 정상 비동기 확인 구간은 409 `originals_processing`으로 구분하고 FE가 최대 15초간 자동 재시도한다. `awaiting_upload`/`failed`/`NULL`처럼 복구가 필요한 원본이 있을 때만 409 `originals_incomplete`로 링크 활성화를 차단하고 이어 업로드를 안내한다. 모든 원본이 완료되면 링크는 ZIP `ready`를 기다리지 않고 즉시 열리며, ZIP은 준비 중으로 표시되다가 `ready` 후 활성화된다.
- **다운로드 30일 기한**: 초대 링크가 최초로 활성화된 시각(`projects.original_download_started_at`, 최초 1회만 기록)부터 30일. 링크를 다시 복사/재전달해도 초기화되지 않는다(상태 전이 자체가 1회성이라 자연히 보장). 만료 37일차(30일+7일 유예)에 R2의 ZIP이 자동 삭제된다(원본 파일 자체의 보관 정책은 변경되지 않음).
- **활성화 후 변경 금지**: 프로젝트가 `preparing`을 벗어난 이후에는 원본이 포함된 사진의 추가/삭제가 API 레벨에서 거부된다. 따라서 ZIP은 초대 링크 활성화 시점의 확정된 스냅샷으로 생성된다.
- **stuck 복구**: `archive_sweep_worker`(`app/archive.py`, 서버 lifespan에서 `original_archive_worker`와 함께 기동, 30분 주기)가 `recover_stuck_original_archive_builds` RPC(part 생성 전 프로젝트 claim, 15분 초과 `processing` 복구)와 `recover_stuck_original_archive_parts` RPC(ZIP 빌드+업로드 중인 part, 45분 초과 `processing` 복구 — part 크기가 클수록 처리 시간이 길어질 수 있어 build claim보다 여유를 둠)를 호출해 archive 빌드가 영구히 멈추지 않게 한다 — `original_jobs`의 `stuck_job_sweep_worker`와 같은 패턴을 archive 큐에도 적용한 것.
- **고객 화면**: `GET /api/c/original-download`는 파일 수/총 용량/만료일/ZIP 상태와 URL이 없는 파일 메타데이터만 반환한다. 기존 활성 링크에 `original_archive_status=NULL`이면서 미완료 원본이 있는 레거시 상태는 `archiveBlocked=true`로 반환해 무한 "준비 중"이 아니라 미완료 장수와 작가 복구 필요를 안내한다. 실제 ZIP 준비 중일 때만 모달 닫힘 10초/열림 2초로 폴링한다. `GET /api/c/original-download/archive`는 ZIP 클릭 시, `POST /api/c/original-download/files`는 선택한 `photoIds` 다운로드 시에만 1시간 TTL presigned URL을 발급한다. 전체 원본은 ZIP 탭, 일부 원본은 개별 파일 탭으로 역할을 구분하고 개별 탭의 전체 선택은 PC·모바일 모두 숨긴다. PC Chrome/Edge는 CTA 클릭 직후 `showDirectoryPicker()`로 폴더를 먼저 선택하고, API가 선택 ID 수와 동일한 URL을 반환했는지 확인한 뒤 각 URL 응답 body를 `FileSystemWritableFileStream`에 순차적으로 pipe한다. 동일 파일명이 이미 있으면 `(2)`, `(3)` 접미사로 보존한다. 이 경로는 자동 다중 다운로드 권한에 의존하지 않으며 한 번에 전부 Blob 메모리에 올리지 않는다. File System Access API 미지원 데스크톱 브라우저만 기존 `<a download>` 반복 방식으로 폴백한다. 모바일은 API가 이미 제공한 숫자형 `byteSize` 합계를 사용해 10장(`MOBILE_MAX_FILE_COUNT=10`) 또는 총 100MiB(`MOBILE_MAX_TOTAL_BYTES=100 * 1024 * 1024`)를 먼저 초과하는 추가 선택을 즉시 차단하고 이유별 안내를 표시한다. 문구는 기기 성능을 단정하지 않고 “휴대폰에서 안정적으로 저장하기 위한 기준”으로 안내한다. CTA 직전에도 두 제한을 재검증한다. Web Share가 정상 반환되거나 파일 다운로드 폴백을 실행한 뒤에는 다음 묶음을 고를 수 있도록 선택을 초기화하되, OS 사진 앱의 실제 저장 성공을 브라우저가 확인할 수 없으므로 별도 "저장 완료" 메시지는 표시하지 않는다. 모바일의 전체 압축파일 준비 완료 화면에는 용량이 큰 경우 원활한 다운로드를 위해 PC 이용을 권장하는 보조 문구를 표시하되 다운로드 자체는 차단하지 않는다.
- **기존 프로젝트**: 이 기능 배포 이전에 이미 활성화된 프로젝트는 `original_download_started_at`/`original_archive_status`가 `NULL`로 유지되어 소급 노출되지 않는다(신규 활성화 프로젝트부터만 적용).
- **최종 보정본과의 관계**: 완전히 별개 — 최종 보정본은 기존대로 `delivered` 상태 이후 작가가 개별적으로 전달한다(이 기능이 다루는 것은 셀렉 이전에 미리 받아둔 "납품용 원본"이며, 보정된 최종본이 아니다).

---

## 9. 프로젝트 상태 변경

- **시작 조건**: 각 상태 전이 조건 충족 시(§`docs/architecture.md` 5.1 상태 머신 참고).
- **사용자가 수행하는 단계**: 각 화면의 전용 버튼 클릭(초대 링크 활성화/보정 시작/고객에게 전달 등). 상태를 임의로 건너뛰는 UI는 제공되지 않음.
- **프론트엔드 라우트**: 상태별로 분산(`upload/page.tsx`, `results/page.tsx`, `workflow/WorkflowPageClient.tsx`, `ProjectNexusPageClient.tsx`).
- **호출되는 API**: `PATCH /api/photographer/projects/{id}` 또는 `PATCH /api/photographer/projects/{id}/status` — 서버가 `canTransition(from, to, {maxRevisionCount, revisionRound})`으로 허용 여부를 검증, 허용되지 않으면 400.
- **성공 시 기대 결과**: `project_logs`에 이력 기록, 관련 화면들이 새 상태를 즉시 반영.
- **실패 및 경계 상황**: 허용되지 않는 전이(예: `preparing → confirmed` 건너뛰기) 요청 시 400. 고객이 확정을 취소(`confirmed → selecting`, 최대 3회)한 직후 작가가 이미 "보정 시작"을 누르려던 경우의 경쟁 조건은 **확인 필요**(둘 다 서버에서 상태를 재확인하므로 이론상 안전하나 UX 상 혼란 가능).
- **관련 권한/인증 조건**: 로그인 세션 + 소유권. `/api/photographer/projects/{id}/status`가 `/api/photographer/projects/{id}`(PATCH)와 별도로 존재하는 이유(권한 범위 차이 등)는 **확인 필요**.
- **QA에서 확인해야 할 항목**: 두 브라우저 탭(작가/고객)을 동시에 열어 상태를 양쪽에서 바꾸는 경쟁 조건, `project_logs` 액션 목록(`created`/`uploaded`/`selecting`/`confirmed`/`editing`)이 실제 모든 전이를 빠짐없이 기록하는지(`reviewing_v1` 이후 전이는 로그 액션 화이트리스트에 없어 기록되지 않을 가능성 — `src/app/api/photographer/project-logs/route.ts` 확인 필요).

---

## 9-1. 이용량 등급 및 한도(2026-07-26 추가)

- **시작 조건**: 프로젝트 생성(§2) 또는 사진 업로드(§4) 시도.
- **등급 3단계**: 관리자(`ADMIN_EMAILS`, 무제한) / 베타(관리자가 부여, 기본값 프로젝트 10개·사진 2000장/프로젝트) / 일반(Trial, 그 외 전부 — 기본값 프로젝트 1개·사진 500장/프로젝트). 판정은 매 요청마다 실시간(`photographers.beta_status`+`beta_end_date`)으로 이뤄지고, 별도 만료 배치는 없다. **구체적인 한도 값은 `/admin/settings`(§10-2)에서 관리자가 실시간으로 바꿀 수 있다** — 위 값은 초기 기본값이며 코드 재배포 없이 언제든 바뀔 수 있다.
- **프로젝트 한도는 등급과 무관하게 항상 "현재 보유 수"(`COUNT(*) FROM projects`) 기준**이다 — 일반 사용자도 프로젝트를 삭제하면 즉시 새 프로젝트를 만들 수 있다. (최초 설계 단계에서는 일반 사용자만 "삭제해도 줄지 않는 누적 생성 수"(`photographers.total_projects_created`)로 판정해 삭제 후 재생성으로 우회하지 못하게 했으나, 2026-07-26 정책 변경(커밋 `2b2e241`/`818affc`)으로 두 등급 모두 현재 보유 수 기준으로 단순화됐다. `total_projects_created` 컬럼 자체는 남아 계속 증가하지만 어떤 검증 로직에서도 더 이상 읽지 않는다.)
- **호출되는 API**: `GET /api/photographer/quota`(사전 확인/사용량 표시용), `POST /api/photographer/projects`·`POST /api/upload/photos`(실제 강제 지점).
- **성공 시 기대 결과**: 한도 내면 정상 생성/업로드. `/photographer/projects` 목록 헤더와 `/photographer/projects/new` 진입 시 "N/M" 형태로 현재 사용량이 표시된다(가능한 경우). **(2026-07-27 추가)** `/photographer/dashboard` 사용량 패널은 `tier === "beta"`일 때 "베타 이용중" 배지를 함께 보여준다 — 이전에는 작가 본인이 자신이 베타/일반 중 어느 등급인지 화면에서 확인할 방법이 전혀 없었다(관리자 화면에서만 조회 가능했음).
- **실패 및 경계 상황**:
  - 일반 사용자가 1개 한도 도달(현재 보유 1개) → "무료 체험에서는 프로젝트 1개까지 생성할 수 있습니다." 그 프로젝트를 삭제하면 즉시 다시 생성 가능해진다.
  - 베타였다가 관리자가 종료/중지 처리 → "베타 이용 기간이 종료되었습니다." 이후 일반 한도(현재 보유 수 기준)가 적용된다.
  - **기존 프로젝트/사진은 한도와 무관하게 항상 그대로 조회·진행 가능** — 한도는 오직 "새로 생성/업로드"할 때만 개입한다. 베타 종료 후에도 이미 만든 프로젝트가 사라지거나 잠기지 않는다.
  - 이 기능이 배포된 시점에 이미 가입해 있던 작가도 그랜드파더링 없이 `beta_status='not_invited'`(일반)로 시작한다 — 필요하면 관리자가 개별적으로 베타를 부여해야 한다.
- **관련 권한/인증 조건**: 로그인 세션. 등급 판정에 이메일(관리자 여부)과 `photographers` 행의 베타 컬럼을 사용.
- **QA에서 확인해야 할 항목**: 일반 사용자가 한도 도달 후 프로젝트를 삭제하면 실제로 다시 생성할 수 있는지, 베타 부여/회수 직후 한도가 즉시 반영되는지, 관리자 계정으로는 어떤 한도에도 걸리지 않는지.

---

## 10. 관리자(운영자) 백오피스 접근

- **시작 조건**: 베타 운영을 위한 내부 전용 화면(`/admin`). 2026-07-26 2단계에서 Dashboard/Beta Users/Projects/Feedback/Activity Logs/Settings 6개 메뉴가 구현됨(P0 범위, 조회 위주 + PIN 재설정/피드백 상태 변경 개입 기능).
- **사용자가 수행하는 단계**: `ADMIN_EMAILS`에 등록된 운영자 계정(`realsong88@gmail.com`, `hilee6461@gmail.com`)으로 로그인한 상태에서 주소창에 직접 `/admin` 입력(사이드바/메뉴 등에 별도 진입 링크는 아직 없음) → 좌측 사이드바로 메뉴 간 이동.
- **프론트엔드 라우트**: `/admin`(Dashboard), `/admin/users`(+`/[id]`), `/admin/projects`(+`/[id]`), `/admin/feedback`, `/admin/logs`, `/admin/settings`. 상세는 `docs/architecture.md` §6.3.
- **호출되는 API**: 조회 화면은 서버 컴포넌트가 직접 DB를 조회(API 없음). 개입 동작만 API 호출: PIN 재설정/제거는 `PATCH /api/admin/projects/[id]/pin`, 피드백 상태 변경은 `PATCH /api/admin/feedback/[id]`.
- **성공 시 기대 결과**: 각 메뉴가 실제 베타 운영 데이터(작가/프로젝트/활동 로그/피드백)를 표시. Projects 상세에서 PIN을 재설정·제거하면 즉시 반영(`router.refresh()`). Feedback 목록에서 상태를 드롭다운으로 변경하면 즉시 반영.
- **실패 및 경계 상황**:
  - 비로그인 상태로 `/admin` 접근 → `/`(랜딩)로 리다이렉트.
  - 로그인은 되어 있으나 허용 이메일이 아닌 계정(다른 작가 등) → `/photographer/dashboard`로 리다이렉트. 별도의 "접근 권한 없음" 안내 문구는 표시하지 않음(조용한 리다이렉트로 결정됨).
  - PIN 재설정 시 4자리 숫자가 아니면 `PATCH /api/admin/projects/[id]/pin`이 400을 반환하고 입력값은 저장되지 않음.
- **관련 권한/인증 조건**: 기존 로그인 시스템 재사용, 별도 관리자 회원가입/역할 테이블 없음. 허용 이메일은 `src/lib/admin-emails.ts`의 `ADMIN_EMAILS` 상수 하드코딩(현재 2개 계정). `/api/admin/**` 라우트는 각자 `getAdminUser()`를 재검증(레이아웃 가드가 API에는 자동 적용되지 않음).
- **QA에서 확인해야 할 항목**: 로그아웃 상태/타 계정 상태에서 `/admin` 직접 접근 시 리다이렉트, PIN 재설정 후 실제 고객 로그인 화면(`/c/[token]/pin`)에서 새 PIN이 정상 동작하는지, Activity Logs에서 `reviewing_v1/editing_v2/reviewing_v2/delivered` 전이가 실제로 기록되는지(마이그레이션 적용 이후에만 정상 동작 — §11 참고).

---

## 10-1. 베타 사용자 관리(2026-07-26 추가)

- **시작 조건**: `/admin/users`(목록) 또는 `/admin/users/[id]`(상세) 화면.
- **사용자가 수행하는 단계 — 이미 가입한 작가에게 부여**: 상세 화면의 "베타 관리" 폼에서 베타 상태(미참여/참여중/종료/중지) 드롭다운 + 시작일/종료일 + 관리자 메모 입력 → 저장.
- **사용자가 수행하는 단계 — 가입 전 이메일 사전 등록**: 목록 화면 상단 "베타 사전 초대" 섹션에 이메일 입력 → 등록. 그 이메일로 실제 가입하면(§Part 2-1 로그인/가입) 자동으로 베타가 부여되고 목록에서 사라진다(소진 처리).
- **프론트엔드 라우트/컴포넌트**: `src/components/admin/AdminBetaControl.tsx`(상태/기간/메모), `AdminBetaInvitations.tsx`(사전 초대).
- **호출되는 API**: `PATCH /api/admin/users/[id]/beta`, `POST /api/admin/beta-invitations`, `DELETE /api/admin/beta-invitations/[id]`.
- **성공 시 기대 결과**: 저장 즉시 반영(`router.refresh()`). 상태 변경 내용에 따라 "관리 이력"(작가 상세 화면 하단)에 `admin_audit_logs` 항목이 남는다 — 메모만 바꾼 경우는 이력에 남지 않는다.
- **실패 및 경계 상황**: 이미 가입된 이메일을 사전 초대로 등록하려 하면 "이미 가입된 사용자입니다. 사용자 상세에서 직접 베타를 부여해주세요" 오류로 거부되고, 상세 화면에서 수동으로 부여해야 한다.
- **관련 권한/인증 조건**: `getAdminUser()` — 관리자 전용.
- **QA에서 확인해야 할 항목**: 베타 부여 직후 해당 작가 계정으로 프로젝트를 추가 생성할 수 있는지(§9-1), 종료/중지 처리 후 다시 막히는지, 사전 초대 등록 → 그 이메일로 신규 가입 → 자동 베타 부여까지 이어지는지.

---

## 10-2. 관리자 설정값 실시간 변경(2026-07-26 추가)

- **시작 조건**: `/admin/settings` 화면.
- **사용자가 수행하는 단계**: 일반/베타 이용 한도 6개 필드(일반 프로젝트·사진 한도, 베타 프로젝트·사진·재보정 한도, 베타 기본 기간) 중 원하는 값을 입력란에서 수정 → 저장 버튼 클릭.
- **프론트엔드 라우트/컴포넌트**: `src/app/admin/settings/page.tsx` + `src/components/admin/AdminSettingsForm.tsx`(`AdminPinControl.tsx`와 동일한 저장 패턴).
- **호출되는 API**: `PATCH /api/admin/settings` — `app_settings`(id=1 싱글턴) 테이블 UPDATE, `updated_at`/`updated_by`(관리자 이메일) 기록.
- **성공 시 기대 결과**: 저장 즉시 DB에 반영되고, **코드 재배포 없이** 다음 요청부터 새 값이 적용된다 — 프로젝트 생성/사진 업로드 서버 검증뿐 아니라 대시보드 진행바·재보정 패널·업로드 사전 경고 같은 표시용 화면도 `GET /api/limits`를 통해 새 값을 실시간으로 가져와 반영한다.
- **실패 및 경계 상황**: 값이 1 이상의 정수가 아니면 `PATCH /api/admin/settings`가 400을 반환하고 저장되지 않는다. `ADMIN_EMAILS`(관리자 계정 목록)는 이 화면에서 바꿀 수 없다 — 여전히 코드 하드코딩이며 읽기 전용으로만 표시된다(별도 관리자 회원/권한 시스템을 만들지 않는다는 기존 결정 유지).
- **관련 권한/인증 조건**: `getAdminUser()` — 관리자 전용.
- **QA에서 확인해야 할 항목**: 값 변경 직후 별도 배포 없이 실제로 새 한도가 적용되는지(일반 사용자 계정으로 프로젝트 생성 시도), 대시보드/업로드 화면의 표시 숫자도 함께 갱신되는지, 잘못된 값(0, 음수, 소수) 입력 시 서버가 거부하는지.

## 11. 작가 피드백(버그 제보·기능 제안) 제출

- **시작 조건**: 로그인한 작가가 `/photographer/**` 어느 화면에서든 사이드바 하단 "문의하기" 클릭.
- **사용자가 수행하는 단계**: 모달에서 유형(버그/제안) 선택 → 내용 입력 → "보내기".
- **프론트엔드 컴포넌트**: `src/components/photographer/FeedbackModal.tsx`(`FeedbackButton`), `Sidebar.tsx` 하단(로그아웃 버튼 위)에 배치.
- **호출되는 API**: `POST /api/feedback` — 세션에서 `photographer_id` 조회 후 `feedback` 테이블에 `category`, `message`, 제출 당시 `page_url`(현재 경로)을 저장. 현재 경로가 `/photographer/projects/[id]/**`(허브/업로드/워크플로우/결과) 형태면 경로에서 프로젝트 id를 추출해 `project_id`도 함께 저장 — 관리자 Feedback 목록에 프로젝트명이 함께 표시됨(`/photographer/projects`, `/photographer/projects/new` 등 프로젝트 스코프가 아닌 화면은 `project_id`가 비워짐).
- **성공 시 기대 결과**: "전달되었습니다" 안내 후 모달 닫힘. 관리자는 `/admin/feedback`에서 즉시 확인 가능(작가 이름, 프로젝트명(있는 경우), 페이지 경로, 원문 표시).
- **실패 및 경계 상황**: 내용이 비어 있으면 클라이언트에서 제출을 막음. 서버 저장 실패 시 "전송에 실패했습니다" 표시, 재시도 가능(입력값 유지).
- **관련 권한/인증 조건**: 로그인 세션 필요(비로그인 작가 화면은 어차피 대부분 접근 불가). 고객(`/c/[token]/**`)용 제보 버튼은 이번 범위에 포함되지 않음(스팸/어뷰징 처리 필요 — 후속 단계 결정 사항).
- **QA에서 확인해야 할 항목**: 여러 프로젝트를 오가며 제출한 피드백의 `page_url`이 실제 제출 시점 경로와 일치하는지, 관리자 화면에서 상태(신규→확인중→해결됨) 변경이 즉시 반영되는지.

---

## 12. 클로즈드 베타 신청 및 관리자 심사(2026-07-26 추가, 2026-07-27 로그인 정책 변경)

`plan/beta-system.md`의 1~4단계 구현. 기존 "베타 등급"(§9-1 이용량 등급) 부여와는 별개로, 잠재 사용자를 모집·심사하기 위한 신청서 접수와 관리자 검토 화면이다.

### 12-1. 신청자(2026-07-27부터 로그인 필수)

- **시작 조건**: 랜딩페이지(`/landing`)의 베타 신청 CTA 또는 `/beta/apply` 직접 접근. **URL 자체는 로그인 여부와 무관하게 공개**이지만, 로그인 안 된 상태면 폼 대신 로그인 안내가 뜬다.
- **사용자가 수행하는 단계(로그인 안 된 경우)**: "로그인하고 신청하기" 클릭 → `AuthModal` 팝업(페이지 이동 없음)에서 구글/카카오 로그인(신규면 가입까지 한 번에 처리) → 완료되면 자동으로 다시 `/beta/apply`로 돌아와 이번엔 신청서 폼이 보인다.
- **사용자가 수행하는 단계(로그인된 경우)**: 이메일은 세션 값이 읽기 전용으로 이미 채워져 있고, 이름/휴대폰번호/촬영 장르/월평균 촬영 건수/프로젝트당 평균 전달 사진 수/현재 전달 방식/사용 희망 이유 입력 + 개인정보·연락 동의 체크 → "베타 신청하기".
- **프론트엔드 컴포넌트**: `src/app/beta/apply/page.tsx`(서버, 세션 이메일을 `BetaApplyForm`에 전달) + `src/components/beta/BetaApplyForm.tsx`(클라이언트 — `prefillEmail`이 없으면 로그인 안내 카드, 있으면 신청서 폼을 렌더).
- **로그인 후 원래 페이지로 복귀하는 방식**: `AuthModal`의 `redirectTo` URL에 `?next=...`를 붙이는 방법은 **Supabase의 Redirect URLs 허용 목록과 정확히 일치해야 해서 실제로 OAuth 콜백이 거부되는 문제가 있었다**(로컬 테스트에서 실측 — 에러와 함께 랜딩페이지로 튕김). 대신 로그인 시작 전 `sessionStorage`에 돌아갈 경로를 저장해두고(`src/lib/post-login-redirect.ts`), 로그인은 항상 기존 기본 목적지(`/photographer/dashboard`)로 완료된 뒤 그 페이지의 `useEffect`가 저장된 경로로 다시 이동시킨다. Supabase 프로젝트 설정은 전혀 건드리지 않는다. **대시보드 화면 깜빡임 방지(2026-07-27 추가)**: `/photographer/dashboard`는 대기 중인 리다이렉트가 있으면 첫 렌더부터(이펙트를 기다리지 않고) 실제 대시보드 콘텐츠 대신 로딩 화면만 보여줘, 이동 중 대시보드가 잠깐 스쳐 보이는 현상이 없다.
- **호출되는 API**: `POST /api/beta/applications` — **2026-07-27부터 세션 필수**(없으면 401). 휴대폰번호는 `src/lib/phone.ts`로 정규화 후 저장, 서버가 중복 여부를 조회해 이미 등록된 번호면 409로 거부한다. 이메일/`matched_photographer_id`는 항상 서버가 세션에서 가져온 값 — 클라이언트가 이메일을 보내는 경로 자체가 없다.
- **성공 시 기대 결과**: `/beta/apply/complete`로 이동, "신청이 접수되었습니다" 안내. `matched_photographer_id`는 제출 즉시 채워져 있다(별도 매칭 단계 불필요).
- **실패 및 경계 상황**: 필수 항목 누락/형식 오류는 클라이언트에서 우선 차단, 서버도 동일 항목을 재검증한다. 같은 번호로 재신청 시 신규 레코드를 만들지 않고 안내 문구를 표시한다(레이스 컨디션은 `phone` 컬럼의 `UNIQUE` 제약이 최종 방어).
- **관련 권한/인증 조건**: 페이지 라우팅 자체는 게이트 없음(`middleware.ts`의 matcher가 `/beta/**`를 포함하지 않음) — 대신 화면 렌더링과 제출 API가 각자 세션 유무로 분기한다.
- **QA에서 확인해야 할 항목**: 로그인 상태에서 제출 시 이메일이 실제로 세션 값으로 저장되는지(실 데이터로 확인 완료), 신규 OAuth 가입(브랜드뉴 계정)을 통한 라운드트립은 실제 신규 계정이 없어 코드 리뷰 수준으로만 확인(기존 계정 재로그인 경로는 실측 완료).

### 12-2. 관리자(`/admin/beta-applications`)

- **시작 조건**: 관리자 계정으로 로그인 후 사이드바 "Beta Applications" 메뉴 진입(`admin-nav.ts`).
- **사용자가 수행하는 단계**: 목록에서 상태 필터(`?status=`)/이름·번호 검색(`?q=`, GET 쿼리스트링 기반) → 신청자 클릭 → 상세에서 상태(신청완료→검토중→승인/보류/거절) 변경, 연락완료 체크, 관리자 메모 저장.
- **프론트엔드 컴포넌트**: `src/app/admin/beta-applications/page.tsx`(목록), `src/app/admin/beta-applications/[id]/page.tsx`(상세) + `src/components/admin/AdminBetaApplicationControl.tsx`(상태/메모/연락완료 저장, 기존 `AdminFeedbackStatusControl`/`AdminBetaControl` 패턴과 동일하게 `fetch` PATCH 후 `router.refresh()`).
- **호출되는 API**: `PATCH /api/admin/beta-applications/[id]` — `getAdminUser()` 재검증 후 상태/메모/연락완료를 부분 업데이트.
- **성공 시 기대 결과**: 변경 즉시 반영(페이지 refresh). 신청이 로그인 필수가 되면서 `matched_photographer_id`는 항상 채워져 있으므로 상세 화면 상단에 "이미 가입된 계정과 매칭됨" 배지가 항상 표시되고 `/admin/users/[id]`로 링크된다.
- **실패 및 경계 상황**: 승인 상태로 바꿔도 `photographers.beta_status` 변경은 자동으로 일어나지 않는다(의도된 설계 — §9-1과 별개 축, plan/beta-system.md §4 참고) — 대신 아래 12-3의 "베타 부여" 버튼으로 명시적으로 처리한다.
- **관련 권한/인증 조건**: `middleware.ts`의 `/admin`, `/admin/:path*` matcher가 이미 이 라우트를 포함하므로 별도 인증 코드를 추가하지 않았다 — 비관리자 계정으로 접근하면 `/photographer/dashboard`로 리다이렉트됨을 실제로 확인함.
- **QA에서 확인해야 할 항목**: 상태 필터/검색이 여러 항목을 동시에 조합했을 때도 정확한지, 신청자 수가 늘어난 뒤에도 목록 페이지 성능이 괜찮은지(현재는 페이지네이션 없이 전체 조회).

### 12-3. 승인 사용자·가입 연결(2026-07-26 초안, 2026-07-27 재설계)

신청이 로그인 선행 조건이 되면서(§12-1) `matched_photographer_id`가 항상 이미 채워져 있다 — "가입 전 이메일 사전등록"(`beta_invitations`) 방식은 신청자가 이미 가입돼 있는 상황과 안 맞아(호출하면 항상 "이미 가입된 사용자입니다" 거부) 폐기하고, 이미 존재하는 계정에 직접 베타를 부여하는 단순한 흐름으로 다시 설계했다.

- **시작 조건**: 신청 상태를 `approved`로 바꾼 뒤, 매칭된 계정이 아직 베타가 아니면(`beta_status !== 'active'`) 상세 화면에 "가입 연결" 카드와 "베타 부여" 버튼이 노출됨.
- **사용자가 수행하는 단계**: "베타 부여" 클릭 → 기존 `PATCH /api/admin/users/[id]/beta`를 그대로 재사용해 `{beta_status:'active'}`만 전송. 날짜를 직접 보내지 않으면 서버가 `app_settings.beta_default_duration_days`만큼(기본값 30일) 오늘부터 자동으로 `beta_start_date`/`beta_end_date`를 채운다(2026-07-27부터, 이전에는 날짜를 비워둬 무기한 유효로 처리했음). 다른 기간을 쓰려면 이후 `/admin/users/[id]`의 `AdminBetaControl.tsx`에서 명시적으로 날짜를 지정해 재저장하면 된다(날짜를 직접 보내는 요청은 자동 채움 대상이 아니라 그대로 저장됨).
- **프론트엔드 컴포넌트**: `src/components/admin/AdminBetaApplicationControl.tsx` — "이메일로 수동 매칭" 입력창은 완전히 제거됨(2026-07-27, 신청 시점에 항상 자동 매칭되므로 더 이상 필요 없다고 판단, 예외 상황용 폴백도 의도적으로 남기지 않음).
- **성공 시 기대 결과**: `router.refresh()` 후 버튼이 사라지고(이미 베타 상태이므로), `/admin/users/[id]`에서도 베타 상태 변경이 확인된다.
- **실패 및 경계 상황**: `matched_photographer_id`가 비어 있는 경우(정상 흐름에서는 로그인 필수라 발생하지 않음 — 이 정책 이전의 레거시 데이터 등 예외 상황에서만 가능)는 버튼 대신 "매칭된 계정이 없습니다" 경고 문구만 표시하고, 관리자가 Supabase 대시보드에서 직접 확인해야 한다(별도 UI 미제공).
- **관련 권한/인증 조건**: `PATCH /api/admin/users/[id]/beta`는 `getAdminUser()` 재검증.
- **QA에서 확인해야 할 항목**: "베타 부여" 버튼 클릭 → `photographers.beta_status`가 실제로 `active`로 바뀌는지 실 데이터로 확인 완료(테스트 후 원래 상태로 복구함). 신규 가입(브랜드뉴 OAuth 계정 생성)을 통한 §12-1의 "가입 시점 자동 매칭" 백필 로직만 실제 신규 계정이 없어 코드 리뷰 수준으로만 확인했다.

### 12-4. 핵심 사용 행동 집계(2026-07-27 추가)

- **시작 조건**: 없음(자동) — 신청자가 실제로 가입하거나, 그 작가의 고객이 링크에 접속하는 시점에 자동으로 기록된다. 관리자가 직접 트리거하는 동작이 아니다.
- **사용자가 수행하는 단계**: 없음. (a) 신규 사용자가 OAuth로 가입, (b) 로그인(신규/기존 모두), (c) 고객이 `/c/[token]` 링크를 클릭 — 3가지 자연스러운 행동이 곧 트리거다.
- **기록 지점**: `src/app/auth/callback/route.ts`에서 `signup_completed`(신규 가입 시 1회)와 `first_login`(신규/기존 가입 모두, 작가당 최초 1회)을, `src/app/c/[token]/layout.tsx`(인덱스 `page.tsx`가 아니라 모든 하위 경로를 감싸는 layout — `/gallery` 등 딥링크 진입도 놓치지 않기 위해)에서 `customer_link_visited`(프로젝트당 최초 1회)를 기록한다. 셋 다 `src/lib/beta-usage-events.ts`의 `recordBetaUsageEvent()`를 공유하며 이 함수는 절대 throw하지 않는다 — 이벤트 기록 실패가 로그인/고객 접속 자체를 막지 않는다.
- **성공 시 기대 결과**: `/admin/beta-applications/[id]`에서 매칭된 계정이 있으면 "사용 현황" 섹션(첫 로그인 시각/생성한 프로젝트 수/고객이 접속한 프로젝트 수)이 노출된다. 프로젝트 생성 수는 기존 `projects` 테이블을 그대로 카운트하는 것이라 별도 이벤트 기록이 필요 없다(plan/beta-system.md §6.1에서 이미 "이미 확보 가능"으로 분류됨).
- **실패 및 경계 상황**: 같은 작가가 여러 번 로그인해도 `first_login`은 부분 유니크 인덱스(`photographer_id, event_type WHERE project_id IS NULL`)로 1건만 남는다. 같은 고객이 링크를 여러 번 열어도 `customer_link_visited`는 프로젝트당 1건만 남는다(`project_id, event_type WHERE project_id IS NOT NULL`). 두 경우 모두 두 번째 이후 insert는 유니크 위반(23505)으로 조용히 무시되므로 매번 "이미 기록됐는지" 조회하지 않는다.
- **관련 권한/인증 조건**: 없음(로그인/고객 접속 경로에 자동으로 끼워짐). 관리자 화면 표시만 `getAdminUser()` 보호 대상.
- **QA에서 확인해야 할 항목**: 신규 OAuth 가입을 통한 `signup_completed`/`first_login` 기록은 §12-3과 동일한 이유로 아직 실측하지 못했다(코드 리뷰 수준) — 다음에 실제 신규 계정 가입이 발생하면 확인 필요. `customer_link_visited`는 2026-07-27 마이그레이션 적용 후 실제 고객 링크(`/c/[token]/gallery` 딥링크 포함)로 검증 완료 — 최초 방문 시 정확히 1건 기록되고, 같은 링크 재방문(새로고침) 시에도 중복 없이 1건만 유지됨을 확인했다. 관리자 상세 화면의 "사용 현황"(생성한 프로젝트 수·고객 접속 프로젝트 수)도 실 데이터와 정확히 일치함을 확인했다.

### 12-5. 베타 설문 — ②첫 프로젝트 납품 완료 후(2026-07-27 추가, 5단계)

- **시작 조건**: 작가가 `/photographer/dashboard`에 진입했고(프로젝트가 1개 이상 있어야 함), 그 작가의 **첫 생성 프로젝트**(생성일 기준, 납품일 기준 아님)가 `status='delivered'`인 상태.
- **사용자가 수행하는 단계**: 별도 수행 없이 조건 충족 시 대시보드에 모달이 뜬다(`BetaSurveyModal`). 5문항(①실제 고객 사용 여부(예/아니오) ②시간 절감 체감(1~5점) ③가장 도움이 된 기능(복수선택+기타) ④가장 불편했던 점(자유서술) ⑤다음 프로젝트에서도 사용할 계획(1~5점, 조기 이탈 예측) — 2026-07-27 재설계, plan/beta-system.md §7.1a) 응답 후 "제출", 또는 "나중에"(24시간 뒤 재노출), 또는 "다시 묻지 않기"(영구 재노출 안 함) 중 하나를 선택한다.
- **컴포넌트/API**: `src/app/photographer/dashboard/page.tsx`가 마운트 후 `GET /api/photographer/beta-survey/status`로 노출 여부를 확인(트리거 판정은 서버가 `projects` 테이블에서 `photographer_id`의 최초 생성 프로젝트 status를 직접 조회 — `delivered_at` 컬럼은 일부 경로에서 안 채워질 수 있어 신뢰하지 않음). 응답/나중에는 `POST /api/photographer/beta-survey`, 건너뛰기는 `POST /api/photographer/beta-survey/skip`이 처리하며 `beta_survey_responses` 테이블(`photographer_id, survey_type` 유니크)에 upsert된다.
- **성공 시 기대 결과**: 제출/건너뛰기 후에는 몇 번을 재방문해도 다시 뜨지 않는다. "나중에" 후에는 24시간 동안만 재노출이 억제되고 이후 다시 뜬다. "노출" 자체는 별도로 기록하지 않으므로, 세 시각(`later_until`/`skipped_at`/`submitted_at`) 중 아무것도 없는 상태에서 조건이 계속 켜져 있으면 대시보드 방문마다 다시 뜬다(설계상 의도 — §7.2 "1회 노출"은 "영구 1회"가 아니라 "이번 방문에 1회").
- **실패 및 경계 상황**: 이미 제출된 설문에 다시 제출 요청이 오면(중복 클릭 등) 서버가 멱등 처리(`alreadySubmitted:true`, DB 재기록 없음). 복수선택 문항(③가장 도움이 된 기능)에서 "기타"를 골랐는데 텍스트를 안 채우면 클라이언트/서버 양쪽에서 막고, 최소 1개 선택도 서버가 강제한다. 빈 대시보드(`projects.length === 0`)에서는 트리거 자체가 구조적으로 성립할 수 없어 이 상태를 위한 별도 분기는 없다.
- **관련 권한/인증 조건**: `api/photographer/beta-survey/*` 세 엔드포인트 모두 세션 필요(401 없으면). `admin_audit_logs`에는 기록하지 않는다 — 그 테이블은 관리자/시스템 행위 전용이고(§10-1), 작가가 자발적으로 제출하는 설문은 기존 `feedback` 제출과 동일하게 감사 로그 대상이 아니다.
- **범위 밖**: ①"셀렉 링크 전달 후" 설문은 문항이 아직 확정되지 않아(plan/beta-system.md §7.1, §13) 트리거·문항을 구현하지 않았다. `src/lib/beta-survey.ts`의 `SurveyType`에 식별자(`link_sent`)만 미리 선언해뒀고, `IMPLEMENTED_SURVEY_TYPES`에는 아직 넣지 않았다.
- **QA에서 확인해야 할 항목**: `tests/e2e/photographer/beta-survey.spec.ts`에서 트리거 미충족 시 미노출/충족 시 노출/나중에 24h 정책/건너뛰기 영구 억제/제출 후 영구 억제/미인증 401을 다룬다. `src/app/api/auth/test-setup/route.ts`에 테스트 전용 액션(`first_project_status`/`set_project_status`/`reset_beta_survey`/`backdate_survey_later`)을 추가해 실제 촬영→선택→납품 워크플로우를 거치지 않고도 상태를 직접 조작해 검증할 수 있게 했다(`ENABLE_TEST_LOGIN=true`일 때만 동작, 기존 `create_project` 등과 동일한 안전장치). DB 마이그레이션(`20260727_beta_survey_responses.sql`) 적용 후 실 브라우저(Playwright)로 6개 시나리오 모두 통과 확인 완료(2026-07-27).

### 12-6. 베타 설문 — ③두 번째 프로젝트 납품 완료 후(2026-07-27 추가, 6단계)

- **시작 조건**: 작가가 `/photographer/dashboard`에 진입했고, **생성 순서 기준 두 번째 프로젝트**(완료 순서 아님, plan/beta-system.md §6.1)가 `status='delivered'`인 상태. ②와 마찬가지로 이미 제출/건너뛰기했으면 트리거되지 않는다.
- **사용자가 수행하는 단계**: 조건 충족 시 대시보드에 모달이 뜬다. 8문항(①계속 사용 의향(1~5점) ②추천 의향 NPS(0~10) ③서비스가 없어진다면 얼마나 아쉬울지(1~5점, PMF/Sean Ellis 문항) ④적정 가격(구간 선택) ⑤유료 출시 시에도 계속 사용할 의향(1~5점) ⑥추가되었으면 하는 기능(자유서술) ⑦기타 의견(자유서술) ⑧정식 출시 안내 희망 여부(체크박스) — 2026-07-27 재설계, plan/beta-system.md §7.1a) 응답 후 "제출", 또는 "나중에", 또는 "다시 묻지 않기" 중 하나를 선택 — 노출/재노출 정책은 ②와 완전히 동일(§7.2).
- **컴포넌트/API**: ②와 동일한 인프라를 그대로 재사용 — `GET .../beta-survey/status`가 `IMPLEMENTED_SURVEY_TYPES`(생애주기 순서로 5개 타입 등록, §12-7 참고)를 순서대로 검사해 먼저 트리거된 것을 반환하고(모든 설문은 `(photographer_id, survey_type)`별로 완전히 독립적으로 상태 관리됨), `BetaSurveyModal`은 `surveyType` 값에 따라 문항 블록만 분기한다. 트리거 판정은 ②와 동일하게 `projects.status`를 직접 조회(두 번째로 생성된 행을 `ORDER BY created_at ASC` + `range(1,1)`로 특정) — `project_logs.action='delivered'`는 신뢰하지 않는다(②와 동일 이유, §12-5).
- **"적정 가격" 문항 형식**: 문서(plan/beta-system.md §7.1)에 "주관식/구간 선택" 둘 다 언급돼 있어 확정이 필요했음 — 사용자 확인 후 **구간 선택**으로 결정. 최초 구현("무료가 아니면 안 씀/1만원 미만/1만원~3만원/3만원~5만원/5만원 이상")은 같은 날 문항 재설계에서 "무료 아니면 안 씀"이 너무 공격적이라는 피드백을 받아 **월 5천원 미만/5천원~1만원/1만원~3만원/3만원~5만원/5만원 이상/현재로서는 유료 이용 의향 없음**(마지막으로 이동)으로 최종 확정했다. 구간 경계값은 하드코딩이라 나중에 바꾸려면 `src/lib/beta-survey.ts`/`BetaSurveyModal.tsx`/API 검증 로직 3곳을 함께 수정해야 한다.
- **성공 시 기대 결과 / 실패 및 경계 상황 / 권한**: §12-5와 동일 — 멱등 제출, 세션 필수(401), `admin_audit_logs` 미기록.
- **QA에서 확인해야 할 항목**: `tests/e2e/photographer/beta-survey.spec.ts`의 두 번째 `describe` 블록(CS1~CS5)에서 트리거 미충족/충족/나중에 24h/건너뛰기 영구 억제/NPS·가격 구간·체크박스 포함 제출까지 실 브라우저로 검증 완료(2026-07-27). 테스트 계정에 두 번째 프로젝트가 없으면 `test-setup`의 `second_project_status` 액션이 테스트용으로 하나 생성하고, 테스트 종료 후 새로 만든 경우에 한해 삭제한다(`tests/helpers/setup.ts`의 `getSecondProjectStatus`/`deleteTestProject`) — 기존에 있던 프로젝트를 건드린 경우는 원래 status로 복원만 한다.

### 12-7. 베타 설문 — 첫 프로젝트 진행 중 마이크로 설문 3종(2026-07-27 추가)

- **배경**: ②③가 프로젝트가 "끝난 후"에만 몰려 있어 실사용 중 막히는 지점을 실시간으로 파악하기 어렵다는 문제 제기 — 상태 전이마다 설문을 넣으면 응답률이 떨어지므로, 첫 프로젝트 진행 중 딱 3개 지점에만 1~2문항짜리 마이크로 설문을 추가했다. "10초 안에 답할 수 있는" 것이 핵심 제약이며, 인프라(테이블/모달 셸/API 3종/노출정책)는 ②③와 100% 동일하게 재사용한다.
- **시작 조건 3종**:
  - `project_created`: 작가의 첫 프로젝트가 존재하는 시점(사실상 대시보드가 빈 상태를 벗어나는 시점).
  - `original_uploaded`: 첫 프로젝트에 `project_logs.action='uploaded'` 이벤트가 최소 1건 존재하는 시점(`src/app/photographer/projects/[id]/upload/page.tsx`에서 업로드 배치가 끝날 때마다 기록 — 여러 번 있을 수 있어 "최소 1건"으로 판단).
  - `selection_received`: 첫 프로젝트에 `project_logs.action='confirmed'` 이벤트가 존재하는 시점(`src/app/api/c/confirm/route.ts`에서 고객이 선택 확정 시 기록). ②③와 달리 `projects.status`가 아니라 **로그 존재 여부**로 판단한다 — 고객이 이후 `cancel-confirm`으로 확정을 취소하면 status는 `selecting`으로 되돌아가지만, "회신받았다"는 사실 자체는 이미 일어난 이벤트이기 때문이다.
- **사용자가 수행하는 단계**: 조건 충족 시 대시보드에 모달이 뜬다. 문항(§7.1a): 생성 후(1문항, 생성 과정 난이도 1~5점), 원본 업로드 후(2문항, 업로드 수월함 1~5점 + 불편한 점 자유서술), 셀렉 회신받았을 때(2문항, 확인 과정 편리함 1~5점 + 고객 피드백 자유서술). "제출"/"나중에"/"다시 묻지 않기" 3가지 액션은 ②③와 동일(선택 즉시 자동제출 아님 — 사용자 확정).
- **컴포넌트/API**: `IMPLEMENTED_SURVEY_TYPES`가 생애주기 순서로 `["project_created","original_uploaded","selection_received","first_delivery","second_delivery"]`로 확장돼, 여러 개가 동시에 조건 충족돼도 가장 이른 것부터 노출된다. 세 타입 모두 첫 프로젝트를 `project_id` 컨텍스트로 저장(기존 `getFirstProjectId` 재사용).
- **DB 마이그레이션**: `20260727b_beta_survey_responses_add_micro_types.sql` — `survey_type` CHECK 제약을 6개 값으로 확장. 적용 완료(2026-07-27).
- **⚠️ 재노출 관련 중요 차이점**: ②③의 트리거는 `projects.status`(복원 가능한 필드)에 의존하지만, 이 3종의 트리거는 "프로젝트 존재"·"로그 존재"라는 **되돌릴 수 없는 사실**에 의존한다. 즉 한 번 트리거되면(프로젝트 1개만 있어도) 사용자가 직접 응답하거나 "다시 묻지 않기"를 누르기 전까지 대시보드 방문마다 계속 노출된다(§7.2 설계상 의도 — "나중에"는 24시간만 억제). E2E 테스트에서 이 특성 때문에 `beta_survey_responses` 행을 삭제(reset)하는 정리 방식이 다른 e2e 스펙(`dashboard.spec.ts`)의 대시보드 클릭을 실제로 가로막는 회귀를 일으켰다 — 테스트 종료 후에는 삭제 대신 영구 skip으로 남기도록 수정했다.
- **실패 및 경계 상황 / 권한**: §12-5와 동일 — 멱등 제출, 세션 필수(401), `admin_audit_logs` 미기록.
- **QA에서 확인해야 할 항목**: `tests/e2e/photographer/beta-survey.spec.ts`의 3개 신규 `describe` 블록(PS1, US1~US2, SS1~SS2)에서 노출·문항 렌더·제출·나중에·다시 묻지 않기를 검증 완료(2026-07-27). `test-setup`의 `insert_project_log` 액션으로 실제 업로드/셀렉 확정 플로우 없이 이벤트를 직접 삽입해 트리거를 테스트한다. **"트리거 미충족 → 미노출" 부정 케이스는 검증하지 않았다** — 이 계정의 첫 프로젝트엔 이미 실사용/QA 이력이 쌓여 있어 project_logs가 append-only라 지울 수 없고, 안전하게 "로그 없음" 상태를 재현할 수 없기 때문(②③의 BS1/CS1과 다른 점).

---

## 부록: 이번 조사에서 흐름별로 남은 `확인 필요` 요약

- 프로젝트 생성 폼이 최종적으로 호출하는 정확한 API(엔드포인트, FastAPI 직접 여부).
- `access_token` 발급 주체(DB 기본값/트리거 vs 애플리케이션 코드).
- 결과 페이지(`results/page.tsx`)가 사진/선택 데이터를 가져오는 정확한 API 경로.
- 로그인 실패(OAuth 거부 등) 시 사용자에게 보이는 화면(단, `exchangeCodeForSession` 에러는 `/?error=...`로 리다이렉트됨을 §12-1에서 실측 확인함).
- `preparing` 상태 고객 링크에 접근했을 때의 정확한 화면.
- `photo_versions` 업로드가 2MB 상한을 끝내 못 맞췄을 때의 동작.
- `beta_applications`(§12)/`beta_usage_events`(§12-4) 테이블 모두 마이그레이션이 실제로 적용되어 실 데이터로 전체 흐름을 검증 완료(2026-07-27).
- `reviewing_v1`/`reviewing_v2` 이후 상태 전이가 `project_logs`에 기록되는지 여부.
