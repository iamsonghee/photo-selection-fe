# A-CUT 페이지 인벤토리

> 조사일: 2026-07-29
> 대상: `photo-selection-fe` 현재 작업 트리(커밋되지 않은 변경 포함)
> 원칙: 코드를 수정하지 않고 App Router 페이지, 레이아웃, 연결 컴포넌트, 기존 E2E 시나리오와 공개 화면 렌더링을 조사했다.

## 1. 범위와 요약

- UI `page.tsx`: 34개
- 역할 구간: 공개/가입 5개, 작가 9개, 고객 10개, 관리자 10개(중복 없이 총 34개)
- 전역 셸: 루트, 작가, 고객 토큰, 관리자 4종
- 실제 브라우저 대조: `/`, `/guide`, `/beta/apply`
- 인증이 필요한 작가·관리자 화면과 유효 고객 토큰이 필요한 화면은 실제 코드, 라우팅 조건, Playwright E2E를 근거로 조사했다.
- API 라우트는 화면 인벤토리에서 제외하되 화면 상태·이동의 근거로 확인했다.

## 2. 주요 사용자 흐름

### 2.1 공개 방문자/가입

1. `/` 또는 `/landing`에서 서비스 소개 확인
2. `무료로 시작하기`에서 `AuthModal` 실행
3. OAuth 완료 후 `/photographer/dashboard`
4. 별도 흐름으로 `/beta/apply` 신청 → `/beta/apply/complete`
5. `/guide`에서 작가/고객 사용 흐름 확인

근거 파일:

- `src/app/page.tsx`
- `src/app/landing/page.tsx`
- `src/components/AuthModal.tsx`
- `src/app/guide/GuidePageClient.tsx`
- `src/components/beta/BetaApplyForm.tsx`

### 2.2 작가 핵심 흐름

1. `/photographer/dashboard`에서 프로젝트 현황 확인
2. `/photographer/projects/new`에서 프로젝트 생성
3. `/photographer/projects/[id]` 허브에서 메타데이터, 고객 링크, PIN, 진행 단계 확인
4. `/photographer/projects/[id]/upload`에서 원본 업로드·유사컷 분석·고객 초대 활성화
5. 고객 확정 후 `/photographer/projects/[id]/results`에서 셀렉 결과 확인·내보내기
6. `/photographer/projects/[id]/workflow`에서 보정 시작, V1/V2 업로드, 고객 검토 요청, 최종 납품 파일 처리
7. `/photographer/settings`에서 프로필과 계정 설정

근거 파일:

- `src/app/photographer/dashboard/page.tsx`
- `src/app/photographer/projects/new/page.tsx`
- `src/app/photographer/projects/[id]/ProjectNexusPageClient.tsx`
- `src/app/photographer/projects/[id]/upload/page.tsx`
- `src/app/photographer/projects/[id]/results/page.tsx`
- `src/app/photographer/projects/[id]/workflow/WorkflowPageClient.tsx`

### 2.3 고객 핵심 흐름

1. `/c/[token]` 접속
2. PIN이 있으면 `/c/[token]/pin`
3. 초대/안내 화면에서 갤러리 진입
4. `/c/[token]/gallery`에서 사진 선택·별점·색상 태그·필터 사용
5. `/c/[token]/viewer/[photoId]`에서 상세 확인·코멘트·선택
6. 셀렉 확정 후 `/confirmed` 또는 `/locked`
7. 보정본 도착 시 `/review`와 `/review/[photoId]`
8. 최종 승인 후 `/delivered`

프로젝트 상태에 따라 `/c/[token]`, `/confirmed`, `/locked`, `/review`, `/delivered` 사이에서 리다이렉트가 발생한다.

근거 파일:

- `src/app/c/[token]/page.tsx`
- `src/app/c/[token]/InvitePageClient.tsx`
- `src/app/c/[token]/gallery/GalleryPageClient.tsx`
- `src/app/c/[token]/viewer/[photoId]/page.tsx`
- `src/app/c/[token]/confirmed/page.tsx`
- `src/app/c/[token]/locked/page.tsx`
- `src/app/c/[token]/review/page.tsx`
- `src/app/c/[token]/review/[photoId]/page.tsx`

### 2.4 관리자 핵심 흐름

1. `/admin`에서 서비스 지표와 임박 프로젝트 확인
2. `/admin/projects`와 상세에서 프로젝트 상태·PIN·활동 확인
3. `/admin/users`와 상세에서 작가 등급·베타·프로젝트·감사 로그 관리
4. `/admin/beta-applications`에서 신청 검토
5. `/admin/feedback`과 `/admin/logs`에서 운영 이슈 확인
6. `/admin/settings`에서 서비스 한도 관리

근거 파일:

- `src/components/admin/AdminShell.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/app/admin/**/page.tsx`

## 3. 전체 라우트 인벤토리

### 3.1 공개/가입 화면

| 라우트 | 페이지 파일 | 화면 목적과 주요 UI | 레이아웃/반응형 | 상태 처리 |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | `/landing` 구현을 재사용하는 메인 랜딩 | 루트 셸, 장식 그리드·스캔라인, 반응형 섹션 | 인증 모달 상태는 랜딩 내부 |
| `/landing` | `src/app/landing/page.tsx` | 제품 소개, 문제/솔루션/후기/CTA | `landing.css`, 344줄. 모바일 미디어쿼리와 Tailwind 혼용 | 로그인 여부에 따라 대시보드 이동 또는 `AuthModal` |
| `/guide` | `src/app/guide/page.tsx`, `GuidePageClient.tsx` | 작가/고객 탭형 사용 가이드 | 독립적인 장문 가이드 UI, Noto Sans KR 기반 | 탭 전환, CTA disabled 처리 |
| `/beta/apply` | `src/app/beta/apply/page.tsx`, `BetaApplyForm.tsx` | 로그인 전 인증 유도 또는 베타 신청 폼 | 공통 `Card`, `Input`, `Textarea`, `Button`을 가장 일관되게 사용 | 로그인/제출/검증/오류/완료 |
| `/beta/apply/complete` | `src/app/beta/apply/complete/page.tsx` | 신청 완료 확인 | 중앙 카드 | 단일 완료 상태 |

### 3.2 작가 화면

| 라우트 | 페이지 파일 | 화면 목적과 주요 UI | 레이아웃/반응형 | 상태 처리 |
|---|---|---|---|---|
| `/photographer/dashboard` | `src/app/photographer/dashboard/page.tsx` | 지표 카드, 대기/진행 프로젝트, 최근 완료, 새 프로젝트 CTA | 공통 작가 셸 + `PhotographerPageHeader`; 모바일/데스크톱 카드 그리드 | `PageLoader`, `EmptyDashboard`, 인증 오류, 베타 설문 |
| `/photographer/projects` | `src/app/photographer/projects/page.tsx` | 검색·필터·상태별 프로젝트 목록 | 모바일 카드와 데스크톱 테이블을 별도 마크업으로 구현 | 로딩, 오류, 빈 목록, 삭제 `alert`, 커스텀 드롭다운 |
| `/photographer/projects/new` | `src/app/photographer/projects/new/page.tsx` | 2단계 프로젝트 생성 폼 | `max-w-2xl`; `sm` 기준 1→2열 | 필드 검증, API 오류, 제출 중 disabled |
| `/photographer/projects/[id]` | `page.tsx`, `ProjectNexusPageClient.tsx` | 프로젝트 허브: 상태, 메타, 링크/PIN, 액션 플로우, 위험 영역 | `max-w-[1600px]`, 데스크톱 2열 + 우측 380px, 모바일 1열 | 로딩/권한 오류, 3종 공통 모달, 로컬 토스트 |
| `/photographer/projects/[id]/upload` | `upload/page.tsx` | 원본 업로드, 가상화 그리드/목록, 복구, 삭제, 유사컷 분석, 초대 활성화 | 고정 `100dvh` 작업공간; 768px 기준 모바일 전용 조정 | 가장 많은 로딩/진행/실패/복구/모달/토스트 상태 |
| `/photographer/projects/[id]/results` | `results/page.tsx` | 셀렉 결과 그리드/목록, 코멘트, CSV/TXT/클립보드, 뷰어 | 고정 `100dvh`; 1400px에서 8열, 768px 이하 액션바 재배치 | 로딩/오류/빈 결과, 2종 모달, 자체 토스트/라이트박스 |
| `/photographer/projects/[id]/workflow` | `WorkflowPageClient.tsx` | 상태 탭, 보정본 V1/V2 업로드·매칭·검토 결과·전달·납품 | `max-w-[1600px]`, 2~7열 그리드, 모바일 하단 CTA | 로딩/오류, 확인/기한 모달, `alert`, 비교 뷰어, disabled 단계 |
| `/photographer/settings` | `settings/page.tsx` | 프로필, 이미지, 알림 예정 기능, 계정 삭제 | `max-w-[1600px]`, 데스크톱 1.4fr/1fr, 모바일 스택 | 로딩/폼 오류/다중 토스트/계정 삭제 모달 |
| `/photographer/manual` | `manual/page.tsx` | 작가용 상세 매뉴얼/FAQ | 장문 카드형 문서, 모바일 스택 | 섹션 탐색과 FAQ |

### 3.3 고객 화면

| 라우트 | 페이지 파일 | 화면 목적과 주요 UI | 레이아웃/반응형 | 상태 처리 |
|---|---|---|---|---|
| `/c/[token]` | `page.tsx`, `InvitePageClient.tsx` | 초대 랜딩 또는 상태별 목적지 분기 | `CustomerHeader/Footer` 또는 독자 HUD 스타일 혼용 | 프로젝트 로딩/오류, 상태별 리다이렉트 |
| `/c/[token]/pin` | `pin/page.tsx`, `PinForm.tsx` | 4자리 PIN 인증 | 중앙 단일 패널, `100dvh`, 커스텀 브랜드 바 | 입력 오류, 제출 중, 리다이렉트 |
| `/c/[token]/about` | `AboutPageClient.tsx`, `about.module.css` | 고객용 서비스/작가 소개 | 전용 CSS 모듈 598줄, 768px 미디어쿼리 | 로딩/오류 |
| `/c/[token]/gallery` | `GalleryPageClient.tsx`, `GalleryPhotoCard.tsx` | 선택, 별점, 색상 태그, 유사컷, 품질 필터, 검색/정렬, 확정 | JS 계산 가상화 그리드; 767px 별도 규칙; 고정 2단 헤더와 하단 확정 바 | 로딩/오류/빈 필터 결과, 확정 모달, 동기화 상태 |
| `/c/[token]/viewer/[photoId]` | `page.tsx` | 단일 사진 확대, 선택, 별점, 색상, 코멘트, 유사컷 | 데스크톱/모바일 DOM을 완전히 분리; 모바일 pinch 컴포넌트 | 로딩/잘못된 사진/상태 리다이렉트/저장 |
| `/c/[token]/confirmed` | `page.tsx` | 셀렉 확정 후 상태 안내와 확정 취소 | 전용 `cf-*` 스타일 + 공통 헤더/푸터 | 로딩/상태 리다이렉트/취소 모달/오류 |
| `/c/[token]/locked` | `page.tsx` | 확정 사진, 검토 결과, 작가 보정 진행 안내 | 공통 헤더/푸터, 3→7열 썸네일 그리드 | 로딩, 일부 상태에서 빈 화면 후 리다이렉트, 취소 모달 |
| `/c/[token]/review` | `page.tsx` | 보정본 검토 목록/비교와 전체 제출 | 데스크톱 작업공간과 900px 이하 압축 UI | 로딩/오류/제출 모달/비교 모달 |
| `/c/[token]/review/[photoId]` | `page.tsx` | 사진별 원본/보정본 검토, 확정/재보정 코멘트 | 모바일 전용 조기 return + 데스크톱 3패널 작업공간 | 로딩/상태 리다이렉트/제출 모달/비교 모달 |
| `/c/[token]/delivered` | `page.tsx`, `delivered.module.css` | 최종 완료와 작가 정보 | 독립 CSS 모듈 401줄 + 공통 헤더/푸터 | 로딩/오류/상태 리다이렉트 |

### 3.4 관리자 화면

| 라우트 | 페이지 파일 | 화면 목적과 주요 UI | 레이아웃/반응형 | 상태 처리 |
|---|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | 전체 지표, 상태 분포, 임박/지연 프로젝트 | 고정 240px 사이드바 + `px-10`; 표는 가로 스크롤 | 빈 임박 목록 |
| `/admin/projects` | `admin/projects/page.tsx` | 전체 프로젝트 표 | 최소 820px 표 | 빈 표 |
| `/admin/projects/[id]` | `admin/projects/[id]/page.tsx` | 프로젝트 상세/PIN/고객 링크/로그 | 2→3열 정보 카드 | `notFound`, 빈 로그 |
| `/admin/users` | `admin/users/page.tsx` | 가입 작가와 베타 초대 | 최소 720px 표 | 빈 표, 초대 제어 오류 |
| `/admin/users/[id]` | `admin/users/[id]/page.tsx` | 베타 관리, 프로젝트, 감사 로그 | 카드와 최소 560px 표 | `notFound`, 빈 목록 |
| `/admin/beta-applications` | `admin/beta-applications/page.tsx` | 신청 검색/필터/목록 | 네이티브 select/input, 최소 760px 표 | 검색 결과 없음 |
| `/admin/beta-applications/[id]` | `admin/beta-applications/[id]/page.tsx` | 신청 상세와 심사 | 1→2열 정보 카드 | `notFound`, 제어 오류 |
| `/admin/feedback` | `admin/feedback/page.tsx` | 버그/제안 카드 목록 | 세로 카드 | 빈 목록 |
| `/admin/logs` | `admin/logs/page.tsx` | 활동 로그 표 | 최소 640px 표 | 빈 표, 현재 구현과 어긋나는 경고 문구 |
| `/admin/settings` | `admin/settings/page.tsx` | 한도 설정과 관리자 계정 | 설정 폼 + 카드 | 폼 저장 오류 |

## 4. 역할별 레이아웃 구조

### 4.1 루트/랜딩

- 루트 `body`는 `Noto Sans KR`, 어두운 배경과 전역 토큰을 사용한다.
- 랜딩은 `Space Mono`, `Space Grotesk`, `JetBrains Mono`, Pretendard를 추가로 불러온다.
- 화면 전체 장식, 스캔라인, 각진 패널과 시스템 라벨이 강한 마케팅 전용 문법을 만든다.
- 브라우저 렌더링에서 랜딩의 헤더, 서비스 섹션, 후기, CTA가 하나의 긴 문서로 확인됐다.

### 4.2 작가 셸

- `PhotographerDesktopShell`이 데스크톱 사이드바(240/72px), 모바일 상단 헤더(57px), 하단 내비게이션(60px + safe area)을 제공한다.
- 프로젝트 상세 루트에서만 사이드바를 기본 축소한다.
- 모든 작가 페이지가 이 셸 안에 있지만 내부 최대 폭, 헤더, 고정 작업공간 여부는 페이지마다 다르다.
- `PhotographerMobileChrome.tsx`는 별도 모바일 드로어 구현이지만 현재 어디에서도 사용되지 않는다.

### 4.3 고객 셸

- 토큰 레이아웃은 전역 배경 효과와 `SelectionProvider`, `ReviewProvider`만 제공한다.
- 실제 헤더·푸터·고정 도구막대는 각 페이지가 선택적으로 구현한다.
- `CustomerHeader/Footer`를 쓰는 상태 화면과 완전히 독립적인 갤러리·뷰어·리뷰 작업공간이 병존한다.

### 4.4 관리자 셸

- 고정 폭 240px 사이드바와 `px-10 py-10` 본문이다.
- 모바일 대체 내비게이션이 없다.
- 표는 `overflow-x-auto`와 560~820px 최소 너비로만 대응한다.
- 작가/고객의 장식적 UI와 달리 기본 Tailwind 카드/표 스타일에 가깝다.

## 5. 페이지 레벨 문제

### PAGE-01 — 역할별 셸이 서로 다른 제품처럼 보임

- **문제 설명:** 랜딩은 테크니컬 마케팅 문법, 작가는 유리광/카드 문법, 고객은 페이지별 독립 HUD, 관리자는 단순 데이터 테이블 문법을 사용한다.
- **관련 파일:** `src/app/landing/landing.css`, `src/app/photographer/layout.tsx`, `src/app/c/[token]/CustomerLayoutClient.tsx`, `src/components/admin/AdminShell.tsx`
- **현재 구현 사례:** 로고, 헤더 높이, 본문 여백, 표면색, 폰트가 역할 셸마다 별도 정의된다.
- **사용자에게 보이는 영향:** 역할을 전환하거나 고객 링크를 열면 동일 서비스라는 인지가 약하고 학습한 UI 규칙이 이어지지 않는다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 브랜드 토큰과 공통 셸 계약(로고, 배경, 헤더, 콘텐츠 폭)을 먼저 정의하고 역할별 정보 밀도만 변형한다.

### PAGE-02 — 고객 상태 화면의 정보 구조가 라우트에 분산됨

- **문제 설명:** `InvitePageClient`, `confirmed`, `locked`, `review`, `delivered`가 각각 상태 판정과 리다이렉트, 헤더/푸터를 구현한다.
- **관련 파일:** `src/app/c/[token]/InvitePageClient.tsx`, `src/app/c/[token]/confirmed/page.tsx`, `src/app/c/[token]/locked/page.tsx`, `src/app/c/[token]/review/page.tsx`, `src/app/c/[token]/delivered/page.tsx`
- **현재 구현 사례:** 동일한 `ProjectStatus`를 각 페이지에서 다시 해석하며, 일부 전환 구간은 빈 컨테이너 또는 `null`을 잠시 반환한다.
- **사용자에게 보이는 영향:** 상태 전환 시 화면이 깜박이거나, 비슷한 안내가 다른 레이아웃·문구로 표시될 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 고객 상태→목적 화면 매핑과 공통 상태 셸을 한곳에 정의하고, 각 라우트는 콘텐츠 슬롯만 제공한다.

### PAGE-03 — 작가 핵심 작업 화면의 구조가 페이지 단위로 고립됨

- **문제 설명:** 업로드(3,033줄), 워크플로우(2,008줄), 결과(1,023줄)가 각각 헤더, 카드, 필터, 모달, 뷰어를 내부 구현한다.
- **관련 파일:** `src/app/photographer/projects/[id]/upload/page.tsx`, `src/app/photographer/projects/[id]/workflow/WorkflowPageClient.tsx`, `src/app/photographer/projects/[id]/results/page.tsx`
- **현재 구현 사례:** 같은 프로젝트의 연속 단계인데 화면 상단 구조, 내보내기, 보기 전환, 하단 CTA 배치가 다르다.
- **사용자에게 보이는 영향:** 단계가 바뀔 때 탐색 위치와 조작 규칙을 다시 익혀야 한다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 프로젝트 작업공간 셸, 상단 프로젝트 컨텍스트, 필터/보기 도구막대, 하단 주요 액션 영역을 공통화한다.

### PAGE-04 — 관리자 모바일 레이아웃이 사실상 데스크톱 전용

- **문제 설명:** 관리자 셸은 고정 사이드바와 큰 본문 여백을 유지하고 모바일 내비게이션이 없다.
- **관련 파일:** `src/components/admin/AdminShell.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/app/admin/**/page.tsx`
- **현재 구현 사례:** 표에 가로 스크롤은 있지만 240px 사이드바가 항상 화면을 차지한다.
- **사용자에게 보이는 영향:** 작은 화면에서 본문 가용 폭이 급감하고 운영 작업이 어렵다.
- **수정 우선순위:** P2
- **권장 개선 방향:** 관리자 지원 뷰포트를 명시한다. 모바일 지원 시 드로어/상단바를 추가하고, 미지원이라면 최소 화면 안내를 제공한다.

### PAGE-05 — 반응형 기준과 safe-area 처리가 페이지마다 다름

- **문제 설명:** 600, 767, 768, 900, 1400px 기준이 혼재하며 모바일 DOM을 별도 구현한 페이지도 있다.
- **관련 파일:** `src/app/c/[token]/gallery/GalleryPageClient.tsx`, `src/app/c/[token]/viewer/[photoId]/page.tsx`, `src/app/c/[token]/review/[photoId]/page.tsx`, `src/app/photographer/projects/[id]/upload/page.tsx`, `src/app/photographer/dashboard/EmptyDashboard.tsx`
- **현재 구현 사례:** 갤러리는 767px, 업로드는 `window.innerWidth <= 768`, 리뷰는 900px, 빈 대시보드는 600px을 사용한다.
- **사용자에게 보이는 영향:** 인접한 화면에서도 같은 기기에서 모바일/데스크톱 규칙이 다르게 적용되고 고정 바 간격이 달라진다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 반응형 토큰과 공통 viewport 훅을 정의하고, safe-area를 셸 수준에서 제공한다.

## 6. 먼저 개선할 대표 화면 3개

### 1순위 — 고객 사진 선택 갤러리 `/c/[token]/gallery`

- 고객의 핵심 과업이 집중된 화면이다.
- 사진 카드, 선택, 별점, 색상, 필터, 유사컷, 품질 배지, 가상화, 확정 모달을 모두 포함해 고객용 디자인 시스템의 기준 화면으로 적합하다.
- 모바일에서 7~8px 텍스트, 가로 스크롤 필터, 숨겨지는 검색/정렬 등 정보 밀도 문제도 가장 선명하다.

### 2순위 — 작가 원본 업로드 `/photographer/projects/[id]/upload`

- 저장소에서 가장 큰 UI 파일이며 업로드·진행·복구·실패·분석·삭제·초대 상태를 모두 포함한다.
- 버튼, 배너, 토스트, 모달, 사진 그리드/목록, 하단 액션의 표준을 만들면 작가 영역 전체에 재사용할 수 있다.
- 기능 위험이 높으므로 시각 재설계 전에 상태 모델과 컴포넌트 경계를 먼저 분리해야 한다.

### 3순위 — 관리자 프로젝트 목록 `/admin/projects`

- 관리자 역할의 대표적인 데이터 목록 화면이며 상태 배지, 사진 수, 기한, 링크가 한 표에 모여 있다.
- 작가·고객 화면에서 만든 공통 상태 토큰을 운영 화면까지 검증할 수 있다.
- 목록/필터/빈 상태/반응형 표 패턴을 다른 관리자 화면에 빠르게 확장할 수 있다.

후속 후보는 `/photographer/projects/[id]/workflow`다. 상태·보정·검토 표현의 복잡도가 가장 높지만, 업로드 화면에서 작업공간 패턴과 상태 컴포넌트를 먼저 정한 뒤 적용하는 편이 안전하다.
