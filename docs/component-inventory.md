# A-CUT 컴포넌트 인벤토리

> 조사일: 2026-07-29
> 대상: `src/components`, 핵심 페이지 내부 로컬 컴포넌트와 스타일 구현
> 이 문서는 구현 변경 없이 현재 컴포넌트의 역할, 사용 범위, 중복과 일관성 문제를 기록한다.

## 1. 요약

- `src/components`의 TSX 컴포넌트 파일: 45개
- `src/components/ui`: 10개
- 네이티브 UI 요소(`<button>`, `<input>`, `<textarea>`, `<select>`, `<dialog>`) 사용: 351건
- 인라인 `style={{...}}` 발생: 1,197건
- 공통 UI primitive는 존재하지만 핵심 작가/고객 페이지에서는 대부분 우회한다.
- 사진/프로젝트 상태 관련 공통 컴포넌트가 여러 세대로 공존한다.
- 사용처가 없는 컴포넌트도 확인된다.

## 2. 공통 UI primitive

| 컴포넌트 | 파일 | 현재 API/스타일 | 주요 사용처 | 관찰 |
|---|---|---|---|---|
| `Button` | `src/components/ui/Button.tsx` | 7 variant, 3 size, 36/44/48px, `rounded-lg/xl` | 베타 신청, 일부 확인 버튼 | 작가 핵심 화면은 주로 자체 버튼 사용. primary는 파랑 `--primary`, 핵심 CTA는 주황 `--accent`라 의미 충돌 |
| `Input` | `src/components/ui/Input.tsx` | 44px, `rounded-lg`, blue focus ring, label/error | 베타 신청 | `label`과 input을 `htmlFor/id`로 연결하지 않음 |
| `Textarea` | `src/components/ui/Textarea.tsx` | 최소 100px, Input과 동일 | 베타 신청 | Input과 같은 접근성 문제 |
| `Card` | `src/components/ui/Card.tsx` | `rounded-xl`, border, `bg-surface/50`, padding 20px | 베타 신청/완료 | 작가·관리자 카드와 배경/패딩이 다름 |
| `Badge` | `src/components/ui/Badge.tsx` | 8 variant, pill, 12px | 실사용이 매우 제한적 | 상태 배지는 대부분 `StatusPill` 또는 페이지 로컬 배지 |
| `StatusPill` | `src/components/ui/StatusPill.tsx` | 프로젝트 8상태 + preparing 세분화 | 대시보드, 프로젝트 목록, 관리자 | 인라인 스타일 중심. 다른 진행 컴포넌트와 단계/색 의미 불일치 |
| `ProgressBar` | `src/components/ui/ProgressBar.tsx` | 4색, 8px 트랙, 선택 라벨 | 제한적 | 프로젝트 진행 표시에는 다른 컴포넌트 사용 |
| `PhotographerModal` | `src/components/ui/PhotographerModal.tsx` | 모바일 전체화면, 데스크톱 중앙 모달 | 프로젝트 상세, 설문 | 공통화가 가장 진행됨. 포커스 트랩·복귀는 없음 |
| `PageLoader` | `src/components/ui/PageLoader.tsx` | full/inline, 주황 아크/점 | 다수 작가/고객 로딩 | 인라인 스타일과 컴포넌트 내부 키프레임 |
| `FieldInfoTip` | `src/components/ui/FieldInfoTip.tsx` | portal tooltip, hover/focus | 프로젝트 상세 | 키보드 접근과 위치 재계산을 지원하는 좋은 공통화 사례 |

## 3. 레이아웃 컴포넌트

| 컴포넌트 | 역할 | 현재 구현 |
|---|---|---|
| `PhotographerDesktopShell` | 작가 공통 셸 | 데스크톱 Sidebar, 모바일 Header/BottomNav, 프로젝트 상세에서 72px 축소 |
| `Sidebar` | 작가 데스크톱 내비게이션 | CSS Module 전용 토큰(`--acb-*`)과 Tailwind/inline 혼용 |
| `MobileHeader` | 작가 모바일 상단 | 57px 예상, 프로필 링크 |
| `MobileBottomNav` | 작가 모바일 하단 | 5개 탭, 60px + safe area |
| `PhotographerPageHeader` | 작가 페이지 제목/통계/액션 | 일부 페이지에서만 사용 |
| `PhotographerMobileChrome` | 모바일 FAB+드로어 | 현재 사용처 없음. 기존 모바일 셸과 중복 |
| `AdminShell`/`AdminSidebar` | 관리자 셸 | 고정 240px, 모바일 대안 없음 |

## 4. 고객 컴포넌트

| 컴포넌트 | 역할 | 현재 구현과 변형 |
|---|---|---|
| `CustomerHeader` | 상태 화면 공통 헤더 래퍼 | 고정색 `#0a0a0c`, `#1a1a1e`; 갤러리/뷰어는 사용하지 않음 |
| `CustomerFooter` | 상태 화면 공통 하단 액션 래퍼 | fixed, safe area; 갤러리/리뷰는 자체 하단바 |
| `GalleryPhotoCard` | 썸네일, 선택, 별점, 색상, 그룹/품질 배지 | Link 안에 여러 button이 중첩됨. 갤러리 전용 CSS 클래스에 강결합 |
| `SelectionConfirmFooter` | 선택 수와 확정 CTA | 컴포넌트 내부 `<style>`; 갤러리와 초대 화면에서 변형 사용 |

## 5. 사진/뷰어 컴포넌트

| 컴포넌트 | 역할 | 현재 사용 |
|---|---|---|
| `MobileViewerPinchPhoto` | 모바일 pinch/pan 이미지 | 고객 viewer |
| `PrevNextButton` | 이전/다음 원형 버튼 | 여러 뷰어/모달에서 재사용 |
| `CompareViewerModal` | 작가 워크플로우 원본/V1/V2 비교 | 워크플로우 전용 |
| `FullScreenCompareModal` | 고객 원본/보정본 토글 비교 | 리뷰 목록/상세 |
| `FullScreenImageModal` | 단일 이미지 확대 | 현재 사용처 없음 |
| 페이지 로컬 lightbox | 업로드/결과/갤러리/뷰어 내부 확대 | 공통 컴포넌트와 별도 구현 |

사진 URL/로딩 보조:

- `src/lib/thumb-load-queue.ts`: 썸네일 동시 로딩 큐
- `src/lib/viewer-image-url.ts`: 뷰어 이미지 URL 선택
- `@tanstack/react-virtual`: 고객 갤러리와 작가 업로드 대량 목록/그리드 가상화

## 6. 프로젝트 상태/진행 컴포넌트

| 컴포넌트/모듈 | 단계 수 | 표현 | 사용 상태 |
|---|---:|---|---|
| `StatusPill` | 상태 8종 + preparing 3종 | pill + dot/animation | 넓게 사용 |
| `ProjectProgressBar` | 4단계 | label/dot/bar | 현재 사용처 없음 |
| `ProjectPipelineMiniBar` | 5단계 | 4px segment | 대시보드/프로젝트 목록 |
| `ProjectActionFlow` | 4/5단계 | 카드/노드/lock/live | 프로젝트 상세 |
| `ProjectPipelineHeader` | 5단계 메타 | `STEP 01/05`, link active | 현재 사용처 없음 |
| `project-flow-steps.tsx` | 4/5단계 | 상태→step/CTA 데이터 | `ProjectActionFlow` 입력 생성 |
| 워크플로우 로컬 stage tabs | V1/V2 상태 기반 | 탭 + 하단 CTA | 워크플로우 내부 |

현재 레이블 예:

- `selecting`: `셀렉 중`, `셀렉 완료`, `셀렉 대기중`, `2/5 셀렉`
- `confirmed`: `셀렉 완료`, `확정 완료`, `보정대기`, `보정 시작 대기`
- `reviewing_v1`: `v1 검토 중`, `검토중`, `보정 완료`, `고객 검토 중`

## 7. 작가 도메인 컴포넌트

| 컴포넌트 | 역할 | 관찰 |
|---|---|---|
| `ProjectActionFlow` | 프로젝트 상세의 단계별 액션 | 상태 데이터와 시각 표현이 분리되어 있으나 색/타이포는 독자적 |
| `ProjectPipelineMiniBar` | 목록용 축약 진행바 | `ProjectProgressBar`와 단계 수/색 의미 중복 |
| `ProjectPipelineHeader` | 프로젝트 작업 헤더 | 미사용 상태 |
| `UploadVersionsPanel` | V1/V2 파일 매칭·업로드 패널 | 1,025줄, 자체 스타일/상태가 큼 |
| `GeminiAnalysisPanel` | 유사컷/품질 분석 POC/결과 | 907줄, 관리자 조건과 실사용 분석 UI가 한 파일에 공존 |
| `CustomerInviteShareModal` | 고객 링크 공유 | 자체 modal overlay, 공통 `PhotographerModal` 미사용 |
| `FeedbackModal` | 피드백 제출 | 자체 overlay/modal |
| `BetaSurveyModal` | 베타 설문 | `PhotographerModal` 사용 |

## 8. 관리자 컴포넌트

- `AdminBetaApplicationControl`
- `AdminBetaControl`
- `AdminBetaInvitations`
- `AdminFeedbackStatusControl`
- `AdminPinControl`
- `AdminSettingsForm`
- `AdminShell`
- `AdminSidebar`

공통 패턴:

- 네이티브 select/input/button을 직접 스타일링한다.
- 서버 페이지 카드/표와 클라이언트 제어 폼의 spacing이 별도다.
- 성공/실패 피드백이 각 컴포넌트 내부 문구로 표시되고 전역 토스트는 없다.

## 9. 현재 확인된 UI 종류

### 9.1 버튼

- 공통 `Button`: primary/secondary/outline/danger/ghost/google/kakao
- 작가 핵심 CTA: `bg-accent`, 검정 텍스트, `rounded-xl`, shadow
- 랜딩 CTA: 각진/clip-path/확대 glow
- 고객 CTA: 각진 HUD, pill, 원형 아이콘, 하단 full-width 등
- 관리자 CTA: 작은 `rounded-md` border 버튼
- 사진 조작: 체크박스형, 별 아이콘, 색상 원형, 이전/다음 원형

### 9.2 입력

- 공통 Input/Textarea
- 프로젝트 생성/편집의 로컬 input class
- 고객 코멘트 단일행 input
- PIN 4자리/분할 입력
- 네이티브 date/number/select
- 파일 input을 label/dropzone으로 숨겨 제어
- 검색 입력과 필터용 select

### 9.3 카드

- 공통 `Card`
- 작가 `rounded-2xl bg-surface-raised/70`
- 관리자 `rounded-xl bg-surface`
- 고객 사진 정사각 카드
- 랜딩 각진 패널/사진 카드
- 상태 안내 패널과 위험 영역 카드

### 9.4 배지

- `Badge`
- `StatusPill`
- deadline D-day 배지
- 프로젝트 등급/베타 배지
- 품질(흔들림/눈감음) 배지
- 유사컷 수/대표/선택 배지
- `LIVE`, `LINK_ACTIVE`, 시스템 상태 라벨
- 업로드/매칭 방식/실패 배지

### 9.5 모달/오버레이

- `PhotographerModal`
- `AuthModal`
- `CompareViewerModal`
- `FullScreenCompareModal`
- `FullScreenImageModal`(미사용)
- `CustomerInviteShareModal`
- `FeedbackModal`
- 갤러리 확정 모달
- 리뷰 제출 모달
- 업로드 삭제/추가 업로드 경고/PIN/복구/라이트박스 모달
- 결과 보정 시작/안내/라이트박스 모달
- 설정 계정 삭제 모달
- 워크플로우 확인/검토 기한/내보내기 오버레이

### 9.6 드롭다운/선택

- 네이티브 `<select>` 8개 파일
- 프로젝트 목록 portal 컨텍스트 메뉴
- 워크플로우 내보내기 메뉴
- 탭/segmented control을 드롭다운 대신 쓰는 필터 다수

### 9.7 토스트/알림

- 프로젝트 상세: 단일 문자열, 3초
- 결과: 단일 문자열, 2.5초
- 업로드: 단일 문자열, 3초
- 설정: 배열형 다중 토스트, 성공/실패, 3.2초
- 프로젝트 목록/워크플로우: 일부 실패에 브라우저 `alert`
- 관리자: 폼 내부 상태 문구
- 공통 Toast 컴포넌트/aria-live 영역 없음

## 10. 컴포넌트 문제

### COMP-01 — 공통 primitive가 핵심 화면에서 우회됨

- **문제 설명:** 공통 `Button/Input/Card/Badge`가 존재하지만 핵심 작가·고객 화면은 로컬 class와 inline style로 같은 역할을 재구현한다.
- **관련 파일:** `src/components/ui/*.tsx`, `src/app/photographer/projects/[id]/upload/page.tsx`, `src/app/c/[token]/gallery/GalleryPageClient.tsx`, `src/app/c/[token]/viewer/[photoId]/page.tsx`
- **현재 구현 사례:** 공통 Button primary는 파랑인데 실제 핵심 CTA는 주황이며 크기·radius·disabled 처리도 페이지마다 다르다.
- **사용자에게 보이는 영향:** 동일한 저장/확정/취소 버튼이 화면마다 다른 중요도와 조작감을 보인다.
- **수정 우선순위:** P1
- **권장 개선 방향:** primitive API를 실제 핵심 화면 요구로 재정의하고, semantic variant(`primary`, `destructive`, `quiet`)와 상태를 토큰에 연결한 뒤 점진적으로 교체한다.

### COMP-02 — 프로젝트 진행 표현이 중복되고 단계 정의가 다름

- **문제 설명:** 상태 pill, 4단계 progress, 5단계 mini bar, action flow, workflow tabs가 각각 상태를 해석한다.
- **관련 파일:** `StatusPill.tsx`, `ProjectProgressBar.tsx`, `ProjectPipelineMiniBar.tsx`, `ProjectActionFlow.tsx`, `src/lib/project-flow-steps.tsx`, `WorkflowPageClient.tsx`
- **현재 구현 사례:** `reviewing_v1`이 어떤 UI에서는 `검토중`, 다른 UI에서는 `보정 완료` 또는 `고객 검토 중`이다.
- **사용자에게 보이는 영향:** 같은 프로젝트가 화면에 따라 다른 단계처럼 인식된다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 상태의 내부 코드, 사용자용 상태명, 단계, CTA, 색/아이콘을 하나의 상태 표현 모델에서 파생한다.

### COMP-03 — 모달 구현이 분산되고 접근성 계약이 없음

- **문제 설명:** 공통 모달 외에 다수 overlay가 자체 구현되어 role, Escape, focus, scroll lock, 모바일 표현이 다르다.
- **관련 파일:** `PhotographerModal.tsx`, `AuthModal.tsx`, `CustomerInviteShareModal.tsx`, `FeedbackModal.tsx`, `upload/page.tsx`, `review/**/page.tsx`
- **현재 구현 사례:** 일부는 `role="dialog"`와 Escape를 지원하고, 일부는 배경 클릭만 지원하며, 일부 모바일 모달은 full-screen/일부는 bottom sheet다.
- **사용자에게 보이는 영향:** 닫기 방법과 크기가 일관되지 않고 키보드/스크린리더 사용자가 모달 밖으로 이동할 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 접근성 동작을 포함한 Dialog 기반 primitive 하나와 `center/fullscreen/sheet` presentation variant를 만든다.

### COMP-04 — 사진 뷰어와 라이트박스가 중복됨

- **문제 설명:** 단일/비교/프로젝트 결과/업로드 라이트박스가 비슷한 이미지 탐색을 각자 구현한다.
- **관련 파일:** `CompareViewerModal.tsx`, `FullScreenCompareModal.tsx`, `FullScreenImageModal.tsx`, `viewer/[photoId]/page.tsx`, `results/page.tsx`, `upload/page.tsx`
- **현재 구현 사례:** 이전/다음 버튼만 공통이고 키보드, swipe, pinch, label, backdrop, 이미지 fallback은 구현마다 다르다.
- **사용자에게 보이는 영향:** 사진 확대/이동/닫기 제스처가 작업 단계에 따라 달라진다.
- **수정 우선순위:** P1
- **권장 개선 방향:** image stage, navigation, metadata, compare mode, zoom capability를 조합 가능한 viewer shell로 통합한다.

### COMP-05 — 토스트와 오류 알림이 통합되지 않음

- **문제 설명:** 최소 4개의 자체 토스트와 브라우저 `alert`, 폼 내부 메시지가 혼재한다.
- **관련 파일:** `ProjectNexusPageClient.tsx`, `results/page.tsx`, `upload/page.tsx`, `settings/page.tsx`, `projects/page.tsx`, `WorkflowPageClient.tsx`
- **현재 구현 사례:** 표시 시간 2.5/3/3.2초, 위치와 색, 다중 표시 가능 여부가 다르며 aria-live가 없다.
- **사용자에게 보이는 영향:** 성공/실패 피드백을 놓치기 쉽고 화면마다 다른 위치를 확인해야 한다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 전역 Toast provider, severity, duration, action, dedupe, `aria-live` 정책을 정의한다.

### COMP-06 — 미사용/잔존 컴포넌트가 현재 기준을 흐림

- **문제 설명:** 사용처 없는 컴포넌트가 살아 있어 어떤 구현이 표준인지 판단하기 어렵다.
- **관련 파일:** `PhotographerMobileChrome.tsx`, `ProjectProgressBar.tsx`, `ProjectPipelineHeader.tsx`, `FullScreenImageModal.tsx`, `results/ResultsActions.tsx`
- **현재 구현 사례:** `ResultsActions`는 다운로드 대신 `console.log`만 실행하며 페이지에서 import되지 않는다.
- **사용자에게 보이는 영향:** 직접적인 런타임 영향은 작지만 새 개발이 잘못된 패턴을 재사용할 위험이 크다.
- **수정 우선순위:** P2
- **권장 개선 방향:** 디자인 시스템 구축 전 사용처/의도/폐기 여부를 결정하고 deprecated 표기 또는 제거 계획을 세운다.

### COMP-07 — 사진 카드의 중첩 인터랙션 구조

- **문제 설명:** `GalleryPhotoCard`의 전체가 `Link`인데 내부에 선택, 별점, 그룹 펼치기 `button`이 들어간다.
- **관련 파일:** `src/components/customer/GalleryPhotoCard.tsx`, `src/app/c/[token]/gallery/GalleryPageClient.tsx`
- **현재 구현 사례:** 이벤트 전파 방지로 마우스 동작을 제어하지만 HTML 상 interactive content가 중첩된다.
- **사용자에게 보이는 영향:** 키보드 포커스 순서와 스크린리더 역할이 혼란스럽고, 실수로 뷰어가 열릴 가능성이 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 카드 컨테이너를 비-interactive 요소로 두고 상세 링크와 조작 버튼을 형제 요소로 분리한다.
