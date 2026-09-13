# A-CUT 컴포넌트 인벤토리

> Mobile implementation: [Current implementation and verification](mobile-design-implementation-2026-09-09.md). Earlier audit/proposal links are historical.

> 최초 조사일: 2026-07-29 / PC 재사용 지도 갱신: 2026-09-09
> 대상: `src/components`, 핵심 페이지 내부 로컬 컴포넌트와 스타일 구현
> 현재 컴포넌트의 역할과 사용 범위를 기록한다. §1.1은 2026-09-09 PC 개선 구현 후 갱신했고, 이후 과거 조사 항목은 해당 시점의 기록이다.

## 1. 요약

- 2026-09-09 파일 수: `src/components` TSX 86개, 그중 `src/components/ui` 18개 (`rg --files … -g '*.tsx'`). 파일 수는 재사용률을 뜻하지 않는다.
- **2026-07-29 과거 통계:** 네이티브 UI 요소 351건, 인라인 style 1,197건. 이번에는 이 두 건수를 재집계하지 않았다.
- 작가 Light PC는 Header/Button/Form/ActionBar/AssetToolbar/Gallery를 이미 공유한다. 아래에는 과거 세대와 proposal도 남아 있으므로 현재 PC 사용 지도(§1.1)와 구분한다.
- 사진/프로젝트 상태 관련 공통 컴포넌트가 여러 세대로 공존한다.
- 사용처가 없는 컴포넌트도 확인된다.

### 1.1 현재 작가 PC 재사용 지도

| 역할 | 실제 공통 구현 | 현재 사용 / 한계 |
|---|---|---|
| Light theme | `styles/PhotographerLightTheme.module.css` | shell·Sidebar·route CSS module·portal이 단일 palette를 참조 |
| Page frame/header | `PhotographerLightPageFrame`, `PhotographerLightPageHeader` | Dashboard/List/Detail/Create/Edit/Settings/Upload/Manual. `ProjectFormPageHeading`도 같은 Header를 감쌈 |
| 일반 버튼 | `PhotographerLightButton` | Focus/Form/Settings/Confirm/Request 등. `regular/toolbar/confirmation/work-panel` 크기와 PC 상태 CSS 공유 |
| Form | `ProjectFormFields` / `PROJECT_FORM_INPUT_CLASS` | Create/Edit, Settings field/input/switch. Input/Textarea/PhoneInput wrapper가 label·hint·error 연결; 선택 group과 aria-pressed 제공 |
| Action bar | `PhotographerFormActionBar` / `PhotographerPageActionBar` alias | 생성·수정·원본 관리·셀렉의 하단 요약/action |
| 목록 filter | `PhotographerDenseFilterToolbar` | Project List의 search와 filter composition |
| Asset context/tab | `ProjectAssetWorkspaceHeader`, `ProjectAssetTabs` | 원본/셀렉/보정본/최종본. 표시 가능한 tab은 프로젝트 상태로 결정. Mobile은 44px hit area 안에 36px tab face 사용 |
| Asset 도구 | `ProjectAssetWorkspaceToolbar`, `ProjectAssetMobileToolbarActions`, `ProjectAssetMobileContextAction`, `ProjectAssetMobileIconButton`, `ProjectAssetMobileSheet`, `ProjectAssetToolbarButton`, `ProjectAssetToolbarSummary`, `ProjectAssetToolbarViewToggle` | 탭 간 bar·button·counter·view toggle 공유. Mobile 원본의 `유사컷`은 compact tonal face를 사용하고 선택·필터·보기 전환은 간격 없는 44px 공통 아이콘 버튼으로 나열한다. 보정본 일괄 업로드는 하단 상태 action bar에서만 제공한다. |
| Photo gallery | `PhotographerPhotoGallery` (`OriginalPhotoGallery` alias) | Upload와 Asset original/selected. 보정본 카드의 업무 상태는 별도이며 grid 상수는 공유 |
| ID/진행 | `ProjectIdText`, `ProjectStepper`, `ProjectProgressCard` | PC 목록은 compact 6-step, 상세는 Expanded wrapper 사용 |
| Empty onboarding | `FirstProjectOnboarding` | Dashboard/Project List가 동일 초기 안내 재사용 |
| Modal | `PhotographerModal`, `PhotographerConfirmDialog` | `useDialogAccessibility`로 focus trap/복귀/scroll/Escape 공유, title id와 pending 닫기 잠금. Feedback/UploadVersions 자체 shell도 hook 사용; PC Feedback Light 적용 |
| Data/panel 유지 | `ProjectAssetsDataProvider`, `ProjectAssetsRoutePanels` | Asset 탭 간 데이터와 방문한 panel 재사용 |

수치/역할은 [Light 문서 §0.5·§7.22](design-system-light.md)를, PC 재현 결과와 개선 순서는 [PC 검수](desktop-design-audit-2026-09-09.md)를 따른다. 아래 과거 목록의 사용처를 현재 Light PC에 그대로 적용하지 않는다.

## 2. 공통 UI primitive

| 컴포넌트 | 파일 | 현재 API/스타일 | 주요 사용처 | 관찰 |
|---|---|---|---|---|
| `Button` | `src/components/ui/Button.tsx` | 7 variant, 3 size, 36/44/48px, `rounded-lg/xl` | 베타 신청, 일부 확인 버튼 | 작가 핵심 화면은 주로 자체 버튼 사용. primary는 파랑 `--primary`, 핵심 CTA는 주황 `--accent`라 의미 충돌 |
| `Input` | `src/components/ui/Input.tsx` | 44px, `rounded-lg`, blue focus ring, label/error | 베타 신청 | `label`과 input을 `htmlFor/id`로 연결하지 않음 |
| `Textarea` | `src/components/ui/Textarea.tsx` | 최소 100px, Input과 동일 | 베타 신청 | Input과 같은 접근성 문제 |
| `Card` | `src/components/ui/Card.tsx` | `rounded-xl`, border, `bg-surface/50`, padding 20px | 베타 신청/완료 | 작가·관리자 카드와 배경/패딩이 다름 |
| `Badge` | `src/components/ui/Badge.tsx` | 8 variant, pill, 12px | 실사용이 매우 제한적 | 상태 배지는 대부분 `StatusPill` 또는 페이지 로컬 배지 |
| `SimilarityToggleButton` | `src/components/ui/SimilarityToggleButton.tsx` | `compact/default` 크기, `active`, 그룹 수, 접근성 레이블을 공통 관리 | 고객 셀렉 갤러리 모바일 툴바 | 분석 실행 CTA와 분리된 유사컷 보기 토글 |
| `PhotoAnalysisFilterGroup` | `src/components/photographer/PhotoAnalysisFilterGroup.tsx` | 유사컷 묶어보기·눈감음·흔들림 체크박스의 문구, 수량, 선택 상태와 inline/grid 반응형 표현을 공통 관리 | 작가 원본 업로드, Asset 원본 탭 | 두 화면의 동일한 AI 결과 필터를 같은 UI로 유지 |
| `StatusPill` | `src/components/ui/StatusPill.tsx` | 프로젝트 8상태 + preparing 세분화 | 대시보드, 프로젝트 목록, 관리자 | 인라인 스타일 중심. 다른 진행 컴포넌트와 단계/색 의미 불일치 |
| `ProgressBar` | `src/components/ui/ProgressBar.tsx` | 4색, 8px 트랙, 선택 라벨 | 제한적 | 프로젝트 진행 표시에는 다른 컴포넌트 사용 |
| `PhotographerModal` | `src/components/ui/PhotographerModal.tsx` | 모바일 전체화면, 데스크톱 중앙 모달. `document.body` portal에서도 현재 작가 Light route를 판별해 `PhotographerLightTheme` token scope를 다시 적용 | 프로젝트 상세, 설문 | 공통화가 가장 진행됨. 포커스 트랩·복귀는 없음 |
| `PhotographerConfirmDialog` | `src/components/ui/PhotographerConfirmDialog.tsx` | Figma `#56052` 기반 confirmation. 기본 412px/36px/24px과 compact 360px/20px/20px density, 동일 폭 action pair, pending/error를 공통 관리 | 프로젝트 상세 삭제·보정 시작, 사진 삭제, 업로드창 보정본 삭제 등 | portal·theme·scroll lock·Escape는 `PhotographerModal` 재사용. 짧은 단일 대상 확인은 compact density 사용 |
| `PageLoader` | `src/components/ui/PageLoader.tsx` | full/inline, 주황 아크/점 | 다수 작가/고객 로딩 | 인라인 스타일과 컴포넌트 내부 키프레임 |
| `FieldInfoTip` | `src/components/ui/FieldInfoTip.tsx` | portal tooltip, hover/focus | 프로젝트 상세 | 키보드 접근과 위치 재계산을 지원하는 좋은 공통화 사례 |
| `PhotoThumbnailFrame` | `src/components/ui/PhotoThumbnailFrame.tsx` | 기본 무테 media frame, active 시 Brand Orange 2px inset | 고객 셀렉 카드, 작가 원본 grid | 사진 비율·overlay·checkbox는 소비 화면이 소유하고 경계선 상태 규칙만 공통 관리 |

## 3. 레이아웃 컴포넌트

| 컴포넌트 | 역할 | 현재 구현 |
|---|---|---|
| `PhotographerDesktopShell` | 작가 공통 셸 | 데스크톱 Sidebar, 모바일 Header. 모바일 Dashboard/Manual은 Project List로 정리하고 Sidebar의 266/102.5px 공통 상수를 content offset에도 사용 |
| `Sidebar` | 작가 데스크톱 내비게이션 | Figma `#56039` 기반 expanded/collapsed geometry. CSS Module 전용 토큰(`--acb-*`)을 사용하고 Light Golden route는 `isPhotographerLightRoute()`와 단일 `rootLight` scope를 공유 |
| `MobileHeader` | 작가 모바일 상단 | 64px + top safe-area, 프로젝트 로고 링크와 설정 profile trigger |
| `PhotographerMobilePageHeader` | 작가 모바일 page intro | 20px gutter, title/description/back/trailing 공통 slot. Project List compact usage를 trailing으로 수용 |
| `PhotographerPageHeader` | 작가 페이지 제목/통계/액션 | 일부 페이지에서만 사용 |
| `PhotographerMobileChrome` | 모바일 FAB+드로어 | 현재 사용처 없음. 기존 모바일 셸과 중복 |
| `AdminShell`/`AdminSidebar` | 관리자 셸 | 고정 240px, 모바일 대안 없음 |

## 4. 고객 컴포넌트

| 컴포넌트 | 역할 | 현재 구현과 변형 |
|---|---|---|
| `CustomerHeader` | 상태 화면 공통 헤더 래퍼 | 기본은 다크(`#0a0a0c`/`#1a1a1e`). `theme="customerLight"`로 고객 라이트 팔레트 opt-in(격자·목록 화면용) — `SelectionConfirmFooter`와 같은 방식이라 기존 호출부는 영향 없음. 라이트 배경에서는 `BrandLogoBar variant="customerEntry"`를 함께 써야 로고가 흰 글씨로 묻히지 않는다. 갤러리/뷰어는 사용하지 않음 |
| `CustomerFooter` | 상태 화면 공통 하단 액션 래퍼 | fixed, safe area; 갤러리/리뷰는 자체 하단바 |
| `CustomerEntryShell`/`CustomerEntryHeader` | 고객 최초 진입 canvas/app bar | 기본 variant는 375px preview canvas, responsive variant는 모바일·PC viewport 전체 폭을 사용하며 테두리와 외부 거터를 제거. safe area와 `BrandLogoBar customerEntry` variant를 제공 |
| `CustomerInviteIntro` | 셀렉·보정본 검토 초대 인트로 | 대표 사진·작가 정보·PC split/mobile stack·본문/CTA slot을 공통 관리. PC·모바일 모두 `100dvh` 안에서 영역을 배분하고 양방향 overflow를 차단한다. 대표 사진은 사전 로드 성공 후에만 `<img>`를 연결하고 로딩·오류 중에는 깨진 이미지 대신 light brand placeholder를 유지 |
| `ParticipantSheet` | 고객 참가자(색) 선택 시트 | `src/components/customer/ParticipantSheet.tsx`; 첫 "찜" 시점에 뜨고, 이후 앱바(모바일)·헤더(PC) 우측 신원 칩으로 다시 열어 이름·색을 고칠 수 있다(`current`가 있으면 `내 표시 바꾸기` 모드 — 제목/버튼 문구가 바뀌고 색을 옮길 때 경고를 띄운다). white bottom sheet. 이미 쓰인 색은 `사용 중`(이름이 등록돼 있으면 `민 사용 중`) 표시 — 되찾기용으로 선택은 허용하고, 고르면 저장된 이름을 미리 채운다. `roster` prop은 서버 명단이며 생략 시 색 이름만 쓴다. 식별자 저장·명단 조회는 `lib/customer-participant.ts` |
| `PhotoFocusOverlay` | 사진 전체화면 집중 보기 | `src/components/customer/PhotoFocusOverlay.tsx`; 고객 뷰어 3곳(셀렉 상세·보정본 검토·잠금 뷰어)이 공유한다. 검은 판(`z-index: 200`)을 덮는 방식이라 챙 구조가 다른 화면에 붙여도 동작이 같다(예전에는 셀렉 뷰어 모바일에만 챙 숨김 방식으로 존재). 내부는 `MobileViewerPinchPhoto`라 확대/팬이 유지되고, `onPrev`/`onNext`를 주면 집중 중에도 스와이프·`← →`로 이동한다. `ESC`·탭·클릭으로 닫힌다. 단축키는 capture 단계에서 받아 아래 화면 단축키와 충돌하지 않는다 |
| `PhotoPositionBar` | 사진 위치 표시 바 | `src/components/customer/PhotoPositionBar.tsx`; 트랙 + thumb 세그먼트로 "전체 중 몇 번째"를 보여주고 탭/드래그로 그 지점 사진에 seek. thumb 폭/위치는 스크롤바와 같은 수학(폭 `max(100/총장수, 6%)`). `tone="accent"`(주황, PC 하단) / `"plain"`(흰색, 사진 위 오버레이). 위치 지정은 호출부가 `className`으로 한다. 셀렉 뷰어(모바일·PC)와 보정본 검토가 함께 사용 |
| `PhotoFilmstrip` | 가로 썸네일 목록 | `src/components/customer/PhotoFilmstrip.tsx`; 현재 항목은 **흰 테두리**(주황은 "선택됨" 배지 전용 — 둘 다 주황이면 "여기 있음"과 "골랐음"이 구분되지 않는다), 비활성은 grayscale + `opacity .45`. 활성 항목 자동 스크롤(첫 진입은 instant, 이후 smooth). 화면별 차이인 코너 배지는 `badge` render prop으로 연다(뷰어=선택 체크, 검토=확정/재보정) |
| `GalleryPhotoCard` | 썸네일, 선택, 별점, 색상, 그룹/품질 배지 | media 경계는 `PhotoThumbnailFrame`을 사용하고 나머지 정보 밀도와 interaction은 고객 갤러리 CSS가 관리 |
| `GalleryDesktopHeader` | 갤러리 PC(≥768px) 상단 헤더 · 필터/정렬/검색 툴바 | `src/components/customer/GalleryDesktopHeader.tsx`; 컴포넌트 내부 `<style>`(주의: `<style jsx>`가 아님 — 이 코드베이스는 styled-jsx scoped mode를 지원하지 않으므로 항상 plain `<style>`+수동 고유 클래스 접두어를 쓴다), `.customer-app-shell`의 `--customer-*` 라이트 토큰 사용. 찜(색) 라벨은 자체 계산하지 않고 `colorLabel(key)` prop으로 받는다(참가자 명단을 아는 쪽은 페이지). 색 2개 이상이면 `colorFilterMode`/`onColorFilterModeChange`로 `모두 찜`(AND) 토글 노출 |
| `SelectionConfirmFooter` | 선택 수와 확정 CTA | 컴포넌트 내부 `<style>`; 갤러리와 초대 화면에서 변형 사용. `theme="workspace"`(기본, Dark Photo Workspace) / `"customerLight"`(고객 라이트 톤, 폭 무관 적용) opt-in variant |

## 5. 사진/뷰어 컴포넌트

| 컴포넌트 | 역할 | 현재 사용 |
|---|---|---|
| `MobileViewerPinchPhoto` | 모바일 pinch/pan 이미지 | 고객 viewer. `selected`+`onToggleSelect`를 넘기면 이미지 좌측 상단(갤러리 카드와 같은 자리) 배지가 탭 가능한 선택 체크박스로 렌더링됨(44×44 탭 영역, 34×34 시각 박스, 터치 이벤트 전파 차단으로 pinch/이중탭과 분리; 미선택은 갤러리 카드와 같은 흰 채움 + 어두운 outer ring이라 어두운 사진에서도 빈 체크박스로 읽힘; `.fv-photo-checkbox:focus-visible`로 흰 포커스 링). `selected`일 때는 사진 실제 렌더 영역(`object-fit: contain` 계산값)에 맞춘 주황 테두리(`.fv-selected-frame`)도 함께 그려 훑어볼 때 선택 여부가 바로 읽히게 한다. 두 prop이 없으면 기존처럼 읽기 전용 표시(`LockedPhotoViewer` 등). `marks`를 넘기면 다른 참가자의 찜을 사진 우측 상단에 읽기 전용으로 얹는다(체크박스와 같은 `imageBounds` 측정값 사용, 확대 중에는 함께 숨김; 각 mark의 `named: false`는 이름 미등록을 뜻하며 `.fv-photo-mark-unnamed`로 점선 테두리를 준다 — 표시 글자도 부모가 물음표로 채워 넘긴다). `onSingleTap`은 더블 탭(확대)으로 이어지지 않은 한 번의 탭만 `DOUBLE_TAP_MS`(320ms) 지연 후 확정해 호출 — 뷰어의 챙 숨기기/보이기 토글에 사용 |
| `PrevNextButton` | 이전/다음 원형 버튼 | 여러 뷰어/모달에서 재사용 |
| `CompareViewerModal` | 작가 워크플로우 원본/V1/V2 비교 | 워크플로우 전용 |
| `FullScreenImageModal` | 단일 이미지 확대 | 현재 사용처 없음 |
| `OriginalPhotoGallery` | 작가 원본 grid/list 가상화, 파일명·원본 용량·해상도 표시 | 업로드 화면은 선택·유사컷·업로드 cell을 주입하는 편집 모드, 결과 `원본` 탭은 동일 렌더러의 읽기 전용 모드로 재사용. 원본·셀렉·보정본 grid가 공유하는 최소 카드 폭·간격·반응형 좌우 여백·미디어 비율 상수도 이 모듈에서 제공하고, grid media 경계는 고객 카드와 같은 `PhotoThumbnailFrame`을 사용한다. |
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
| `ProjectFormFields` | Light 생성·수정·설정의 폼 primitive 묶음 | Create/Edit가 840px composition과 Heading·Section·Field/Input·error·촬영유형·재보정·Switch·PIN을 공유한다. Settings는 Field/Input/Switch/Error를 사용한다. 값·업무 검증은 화면이 소유하며 Field와 Input/Textarea/PhoneInput wrapper가 label·hint·error를 연결한다 |
| `PhotographerFormActionBar` | Light 생성·수정 폼의 하단 액션 영역 | 프로젝트 생성과 상세 정보 수정이 840px 콘텐츠 정렬, sticky surface·상단 divider·80px 최소 높이·반응형 정렬을 공유한다. 안내 문구와 버튼 문구는 화면별로 주입하되 버튼 geometry/type는 `PhotographerLightButton` 기본값을 함께 사용 |
| `UploadVersionsPanel` | V1/V2 파일 매칭·업로드 패널 | 1,025줄, 자체 스타일/상태가 큼 |
| `GeminiAnalysisPanel` | 유사컷/품질 분석 POC/결과 | 907줄, 관리자 조건과 실사용 분석 UI가 한 파일에 공존 |
| `CustomerInviteShareModal` | 고객 링크 공유 | 자체 modal overlay, 공통 `PhotographerModal` 미사용 |
| `FeedbackModal` | 피드백 제출 | body portal의 자체 overlay/modal. Light scope가 없어 PC Light 화면에서도 Dark로 렌더됨(2026-09-09 재현) |
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
- **관련 파일:** `CompareViewerModal.tsx`, `FullScreenImageModal.tsx`, `viewer/[photoId]/page.tsx`, `results/page.tsx`, `upload/page.tsx`
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

### 모바일 구현 재사용 지도 (2026-09-09)

현재 상태는 [모바일 구현 결과](mobile-design-implementation-2026-09-09.md)를 따른다. 앞선 검수/proposal 링크는 구현 전 기록이다.

| 공통 구현 | 현재 사용 |
|---|---|
| `PhotographerPortal` | 모바일 자산 시트, 보정 일괄 업로드창. body portal + 공통 Light scope |
| `useDialogAccessibility` | 공통 modal/confirm, 문의, 자산 시트, 보정 업로드창, 원본 사진 뷰어 |
| `useHoldPreview` | 고객 보정 상세·사진 집중 보기와 작가 원본/보정본 뷰어의 길게 누르기 비교. `300ms` 지연, `10px` 이동 취소, 포인터 캡처, pointer/touch 종료·창 이탈 복귀를 한곳에서 처리 |
| `PhotographerFormActionBar` | 생성/수정 오류 alert, 자산 모바일 진행 안내, 고정 spacer 실측 |
| `PhotographerLightButton` | PC/Mobile 크기 variant, pending label 폭 유지 |
| `SingleVersionUploadSlot` | 보정 gallery 카드와 모바일 목록의 미업로드 칸. 파일 검증/선택 즉시 업로드 재사용 |
| `OriginalPhotoGallery` | long press click 경계, 모바일 보정 목록의 116px row/2줄 파일명 및 가상화 높이 동기화 |

기존 legacy 정의는 삭제하지 않았다. 기존 이미지 최적화 및 미사용 정의 관련 lint 경고는 별도 정리 범위다.

### 모바일 보정 목록 후속 개선 (2026-09-09)

`OriginalPhotoGallery`의 retouched variant 안에서 모바일 매핑 행을 제공한다. 목록 폭을 측정해 동일 크기 사진/빈 슬롯과 가상화 행 높이를 맞추며 최대 두 줄 파일명·연결 화살표·선택 모드 체크박스를 제공한다. `SingleVersionUploadSlot compact`가 빈 사진 영역을 채우고, `ProjectAssetMobileToolbarActions.onEnterSelection`이 더보기의 선택 진입을 제공한다. 비교는 기존 `OriginalPhotoViewer`를 재사용한다. 상세 규격은 `design-system-light.md`의 모바일 보정본 개선 1–9 절을 따른다.

모바일 보정 행은 코멘트 길이에 맞춰 `virtualizer.measureElement`로 높이를 측정한다. 공용 `PhotoCardComment`는 `label`과 `truncate` 옵션을 제공하며 모바일 보정 행에서 셀렉/보정 코멘트를 구분해 전체 표시한다. 기존 호출의 기본 라벨과 줄 제한은 유지한다.

`PhotographerFormActionBar.compactMobile`은 모바일 내부 padding/gap만 축소하는 선택 옵션이다. `ProjectAssetStatusActionBar`가 이를 전달하며 보정 화면에서 사용한다. 버튼 크기와 safe-area, 다른 호출의 기본 간격은 유지한다.

### 모바일 상세 뷰어 제어

`OriginalPhotoViewer`는 선택적인 `mobileDetailLayout`, `mobileView`, `mobileComments`, `mobileMissingRetouched`를 받아 모바일 공용 사진 stage와 하단 코멘트 패널을 제공한다. 셀렉 상세는 `mobileDetailLayout`으로 보정 상세와 같은 좌우 8px 사진 여백, 핀치 확대, compact filmstrip을 사용한다. 보정 상세만 `mobileView`를 추가해 원본/보정본 전환과 미업로드 상태를 표시한다. PC에서는 전달된 inspector를 유지하고, 모바일 보정 상세에서는 별도 버전 이력 CTA나 시트를 렌더링하지 않는다.


### 모바일 상세 사진 집중 보기와 조작부 정리

`OriginalPhotoViewer`는 `mobileView`가 있는 모바일 화면에서 기존 `MobileViewerPinchPhoto`를 재사용한다. 집중 보기 상태는 뷰어 내부에 두며 사진 단일 탭으로 전환한다. Escape는 집중 보기를 먼저 해제한다. PC 이미지 렌더링은 기존 경로를 사용한다.


### 모바일 비교 탭·집중 보기 CTA 제거

후속 요청으로 모바일 상세 뷰어는 원본·보정본 두 가지 전환만 제공한다. 비교 상태로 진입해도 모바일에서는 해당 사진 한 장을 표시하고 보정본 버튼을 활성화한다. PC 비교 기능은 유지한다. 집중 보기 CTA와 해당 버튼용 상단 여백을 제거했으며, 사진 단일 탭으로 조작 영역을 숨기고 다시 탭해 복원하는 동작 및 핀치·더블 탭 확대는 유지한다. 이전 절의 비교 탭·집중 보기 버튼 설명은 이 변경으로 대체된다.


### 모바일 버전 이력 아이콘과 중앙 이동 버튼

모바일 상세 화면의 버전 이력 CTA는 제거했다. 이전/다음 버튼은 사진 영역의 좌우 세로 중앙에 배치하며 44px 터치 영역을 유지한다. PC 버전 이력과 데이터/API 흐름은 유지한다.


### 모바일 코멘트 직접 표시

코멘트 개수·진입 화살표·별도 코멘트 시트를 제거하고 본문을 바로 표시한다. `ViewerCommentPanel`은 셀렉 상세보기의 desktop inspector와 mobile compact panel, 보정본 상세보기의 mobile comment 영역에서 함께 사용한다. 청록색 `고객 코멘트` 제목과 왼쪽 인용선, 14/24px 본문, 내부 스크롤을 공통으로 관리하며 보정본에 셀렉·보정 코멘트가 함께 있으면 출처 라벨로 구분한다. 더 보기/접기 버튼은 사용하지 않는다.


### 모바일 상세 미업로드·탭 개선 1~14

모바일 보정본 미업로드 시 원본을 대체 표시하지 않고 공용 ACUT 로고와 안내를 표시한다. 보정본 모드는 유지하며 원본 탭 및 좌우/썸네일 탐색은 계속 사용할 수 있다. 미업로드 배지는 보정본 모드 썸네일에만 나타나고 원본만 있는 이력 시트는 상태를 안내한다. 코멘트 출처, 간결한 모드 컨트롤, 고정된 헤더·사진 프레임을 적용했다. ViewerMobileImage는 URL별로 로딩/완료/실패 상태를 관리하며 이전 사진을 새 보정본처럼 표시하지 않는다. API·업로드·PC 비교 흐름은 유지한다. 세부 번호별 규격은 design-system-light.md의 모바일 상세 뷰어 미업로드·탭 개선 1~14 절을 따른다. 이전 원본 대체 표시 설명은 이번 구현으로 대체된다.


### 모바일 상단 시각 정리 1~7

1. 뷰어의 pointer/keyboard 입력 상태로 모바일 모드 버튼의 포커스 테두리를 구분한다. 터치 시 제거하고 키보드 탐색 시 :focus-visible 표시를 유지한다.
2. `.mobileModes` 내부 padding 3px로 선택 배경과 외곽을 분리한다.
3. 모바일 상세 `.header` 하단 선은 투명하게 처리한다.
4. `.mobileViewControls` 상하 padding을 6px로 통일한다.
5. 선택 배경은 #2e353b로 완화하고 흰색 굵은 글자를 유지한다.
6. 외곽 radius 8px, 선택 영역 radius 5px로 맞춘다.
7. `.counter`는 11px, #969fa7, 현재/전체 모두 font-weight 400으로 표시한다.

모드 버튼의 최소 터치 높이 44px와 PC 스타일은 유지한다.


### Mobile viewer unified surface: items 1-14

1-2: Header, stage, comments and filmstrip share --viewer-bg (#111315), with no separating borders.
3: Mobile version-history entry and sheet are removed; desktop inspector remains.
4-6: Centered modes use 66% width, --viewer-tab-height 44px hit targets and --viewer-tab-face 34px visible backgrounds with reduced contrast.
7-8: Comments use source labels and plain text; no speech icon. Empty comments occupy one line; long comments retain expand/collapse.
9-11: Thumbnails use transparent inactive borders, a 1px active border, inactive opacity .85, width 68px and gap 6px. Horizontal scrolling remains, with its scrollbar hidden.
12: Single-touch horizontal movement of at least 48px and 1.5 times vertical movement navigates photos. Multi-touch and zoomed panning do not navigate. Existing MobileViewerPinchPhoto handles zoom/pan.
13: Photos remain centered with contain sizing in the remaining stage.
14: Shared --viewer-* variables define background, text, muted text, gutters and tab dimensions.

Missing-retouched states, mode switching, image loading and inline comments remain. This supersedes earlier mobile version-history sheet descriptions.


### Shared PhotoAssetPreview for selected and retouched media

PhotoAssetPreview now owns the filename header and PhotoThumbnailFrame presentation. Selected grid cards and mobile retouched mapping cells both use it. Filename typography is 12px / 20px, weight 500, with one-line ellipsis and the existing full-name hover tooltip. The shared frame owns radius, surface color and PHOTO_ASSET_MEDIA_ASPECT_RATIO; per-screen controls remain children. Original upload grids can supply a custom selection header. Mapping rows still share filename/media grid rows and measured virtual heights. --photo-asset-gap provides a common 3px gap default. Earlier separate retouched filename/two-line rules no longer define the active presentation.


### Shared mobile asset toolbar geometry

Removed the retouched workflow override (56px height and 16px gutters). Original, selected and retouched tabs now use ProjectAssetWorkspaceToolbar compactMobile defaults: 44px height, 12px horizontal padding, no vertical padding. Upload button visual height remains 32px inside its 44px hit target. Function slots and desktop layout remain unchanged.


### Retouched list selection ownership

- `OriginalPhotoGallery`: mobile retouched column header owns the 44px select-all target and receives `allVisibleSelected`, `someVisibleSelected`, `selectionDisabled`, and `onToggleAllVisible`. Individual card checkboxes remain available in mobile manage mode.
- `WorkflowPageClient`: owns eligible version IDs, selection state, bulk toggle, selection clearing, and the existing delete confirmation.
- `ProjectAssetStatusActionBar`: `forceFallback` allows a page-local selection action to replace customer-stage actions temporarily. The shared `PhotographerPageActionBar` continues to own fixed positioning, safe-area spacing, and responsive action layout.


### Shared retouched card grid on mobile

- `WorkflowPageClient.V1Card` / `V2Card`: shared desktop and mobile retouched card implementation; mobile keeps a two-column grid with a 44px original reference and file metadata above a full-card-width retouched preview.
- `VersionSelectionCheckbox`: shared mobile/desktop image-overlay selection control. It uses a 44px hit area and a 20px face positioned 4px from the retouched image's upper-left edge.
- `WorkflowPageClient`: defaults to gallery at every viewport, owns the gallery select-all checkbox, and leaves optional mobile list switching to `ProjectAssetMobileToolbarActions`.
- `PhotoCardComment`: renders comments in upload mapping, selection cards, and the comparison list. V1/V2 gallery cards omit comments; the detail viewer and comparison list retain source-labeled full comments.
- `WorkflowPageClient`: PC and mobile card headers show only the original filename before upload. After upload they show the retouched filename with the original filename as secondary metadata. Desktop uses about five columns at laptop widths and caps at six on wide screens. `VersionPhoto` supplies 400w/1500w responsive sources. The mobile round select and footer actions remain tied to the selected round.
