# A-CUT 페이지 패턴 초안

> 상태: Draft 0.1
> 작성일: 2026-07-29
> foundation: `docs/design-system.md`
> component: `docs/acut-components.md`

## 1. 목적

페이지 패턴은 모든 페이지를 같은 레이아웃으로 만들기 위한 규칙이 아니다. 역할과 과업이 다른 화면에서도 사용자가 다음을 예측할 수 있게 하는 공통 뼈대다.

- 현재 어느 프로젝트/단계에 있는가
- 지금 할 수 있는 주요 행동은 무엇인가
- 도구와 상태 메시지는 어디에 나타나는가
- desktop/mobile에서 정보가 어떤 순서로 유지되는가

## 2. 공통 페이지 영역

제품 페이지는 필요한 영역만 조합한다.

1. **Global navigation**: 역할 전환이 아닌 해당 역할 내부 이동
2. **Page context**: breadcrumb, 프로젝트/페이지 제목, 현재 상태
3. **Primary action**: 현재 화면의 주요 다음 행동
4. **Tools**: 검색, 필터, 정렬, 보기 전환, 내보내기
5. **Content**: 표, 카드, form, photo grid/stage
6. **Feedback**: loading, error, upload/recovery, toast
7. **Persistent action**: 모바일 하단 확정/전달 등 필요한 화면만

규칙:

- page title과 primary action은 첫 화면에서 찾을 수 있어야 한다.
- 상태 배지와 CTA label을 한 문장처럼 붙이지 않는다.
- tools는 content보다 앞에 오되, 고객 화면에서는 기본 도구만 노출한다.
- 위험 행동은 primary action 영역에서 분리해 페이지 하단 또는 별도 menu에 둔다.

## 3. 목록 화면

### 목적

여러 프로젝트/사용자/신청/로그를 빠르게 비교하고 원하는 항목으로 진입한다.

### 구조

1. Page header
   - title
   - 결과/전체 수
   - primary CTA(있는 경우)
2. Summary(선택)
   - 상태별 수, 임박 건수
3. Filter toolbar
   - 검색
   - 상태 filter
   - 정렬
   - `필터 초기화`
4. Result feedback
   - `총 N건`, 적용 필터
5. List content
   - project card/grid 또는 data table
6. Pagination/virtualization(필요할 때만)

### Desktop

- 작가 프로젝트는 card/grid 또는 row list를 선택하되 동일 데이터 순서를 유지한다.
- 관리자는 비교가 중요한 경우 table을 사용한다.
- primary CTA는 page header 우측.
- filter toolbar는 1행을 우선하고 2행으로 자연스럽게 wrap한다.
- table row 전체를 클릭 영역으로 만들 때 내부 action과 중첩하지 않는다.

### Mobile

- 1열 카드가 기본이다.
- 중요한 순서: 제목 → 상태/기한 → 진행 정보 → 다음 행동.
- 검색은 유지하고 고급 filter/sort는 sheet로 묶는다.
- 새 프로젝트 CTA는 header button 또는 FAB 중 하나만 사용한다.
- desktop table을 단순 가로 스크롤로만 축소하지 않는다.

### State

- Loading: 카드/행 skeleton 4~6개
- Empty: 목록 자체가 없음 + 생성 CTA
- No result: 검색/필터 결과 없음 + 초기화
- Error: 목록 영역 안 재시도
- Partial data: 누락 필드를 `—`로 표시하되 row 전체를 error로 만들지 않는다.

### 적용 위치

- `/photographer/dashboard`
- `/photographer/projects`
- `/admin/projects`
- `/admin/users`
- `/admin/beta-applications`
- `/admin/logs`

### 피해야 할 것

- 같은 항목에 status pill, progress bar, CTA가 서로 다른 상태명을 표시
- mobile/desktop에서 별도 데이터 계산
- 한 row에 동일 중요도의 버튼 여러 개 노출
- 빈 목록과 필터 결과 없음에 같은 문구 사용

## 4. 상세 화면

### 목적

하나의 프로젝트/사용자/신청의 현재 상태를 이해하고 관련 행동으로 이동한다.

### 구조

1. Context header
   - back/breadcrumb
   - title
   - `ProjectStatus`
   - primary action
2. Key facts
   - 고객, 촬영일, 마감, 사진/필요 셀렉 수
3. Main content
   - workflow/최근 활동/링크/결과
4. Supporting rail(선택)
   - 고객 링크/PIN, 제한, compact metadata
5. History/activity
6. Danger zone

### Desktop

- 기본 container 1600px 이하.
- 정보량이 적으면 단일 열을 유지한다.
- 우측 rail은 320~380px, sticky가 필요하면 global header 높이를 고려한다.
- primary action은 header 또는 main section 첫 action 영역 중 한 곳에만 둔다.

### Mobile

- title → status → primary action → key facts → main content → support → danger 순서.
- rail 콘텐츠를 별도 modal로 숨기기보다 본문 아래로 이동한다.
- 수정 form은 full-screen dialog 또는 새 페이지 중 하나를 선택한다.

### State

- Loading: header + 주요 fact skeleton
- Not found/permission: page error state
- Read-only: 정보 대비 유지, 편집 control만 숨기거나 명확한 read-only 표시
- Status transition: 기존 내용을 유지하고 action 영역만 pending

### 적용 위치

- `/photographer/projects/[id]`
- `/admin/projects/[id]`
- `/admin/users/[id]`
- `/admin/beta-applications/[id]`

### 재사용

- `PhotographerPageHeader`의 title/crumb 구조
- `StatusPill`의 상태 계산
- `ProjectActionFlow`의 상태→행동 데이터

### 피해야 할 것

- 프로젝트 ID 같은 기술 메타를 고객명/기한보다 크게 강조
- 동일 페이지에서 편집, 삭제, 다음 단계 CTA를 모두 primary로 표시
- 상태를 badge와 progress에서 다른 말로 표현

## 5. 사진 작업 화면

### 목적

많은 사진을 탐색·비교·업로드·검토하면서 프로젝트 맥락을 잃지 않게 한다.

### 구조

1. Workspace header
   - back
   - 프로젝트명
   - 현재 단계/상태
   - 사진 count
2. Tool strip
   - filter
   - sort
   - grid/list/compare view
   - bulk action
3. Feedback strip
   - upload/recovery/error/analysis 상태가 있을 때만
4. Photo content
   - `PhotoGrid` 또는 `PhotoViewer`
5. Context panel(선택)
   - metadata, comment, retouch decision
6. Persistent action
   - 업로드 시작, 고객에게 전달, 검토 결과 제출

### Desktop

- viewport 높이를 사용하는 workspace 허용.
- header와 tool strip은 최대 2단.
- `PhotoGrid`가 남은 영역을 차지하고 내부 scroll을 담당할 수 있다.
- viewer는 thumbnail rail + stage + detail rail 조합을 허용한다.
- 다중 선택/bulk action은 선택이 생긴 뒤 contextual toolbar로 노출한다.

### Mobile

- header 1단, 핵심 count와 close/back만 유지.
- filter/sort는 bottom sheet.
- 사진 상세는 full-screen viewer.
- 조작은 하단 action panel에 모으고 safe area를 포함한다.
- 고객 선택 화면에서는 별점/색상/코멘트를 한 번에 모두 노출하지 않고 viewer 또는 확장 패널에 둔다.

### State

- 사진 loading은 cell 크기를 유지한다.
- 일부 사진 오류는 grid 전체 오류로 승격하지 않는다.
- upload/recovery는 `UploadProgress`로 계속 보이게 한다.
- analysis 결과는 사진 선택보다 높은 시각 우선순위를 갖지 않는다.
- 빈 project는 upload dropzone/CTA를 보여준다.
- filter 결과 없음은 grid 안에서 filter 초기화를 제공한다.

### 적용 위치

- `/photographer/projects/[id]/upload`
- `/photographer/projects/[id]/results`
- `/photographer/projects/[id]/workflow`
- `/c/[token]/gallery`
- `/c/[token]/viewer/[photoId]`
- `/c/[token]/review`
- `/c/[token]/review/[photoId]`

### 재사용

- upload/gallery virtualizer
- thumb load queue
- `PrevNextButton`
- `MobileViewerPinchPhoto`
- compare viewer의 keyboard/swipe 로직

### 피해야 할 것

- 사진 위에 항상 보이는 큰 gradient/파일 메타/다수 badge
- 서로 다른 선택 ring으로 같은 상태 표현
- header에 모든 filter를 한 줄로 강제
- 작업 중 전체 화면을 장식적 loader로 덮음

## 6. 설정 화면

### 목적

프로필, 서비스 옵션, 알림, 계정 설정을 안전하게 확인하고 변경한다.

### 구조

1. Page header
2. Profile summary(필요한 경우)
3. Sectioned form
   - section title
   - 설명
   - field group
   - section action 또는 page save
4. Read-only/coming-soon section
5. Danger zone

### Desktop

- 읽기/편집 form 최대 폭 960px.
- 2열은 서로 관련된 짧은 field에만 사용한다.
- 저장 방식은 page-level 또는 section-level 중 하나로 통일한다.

### Mobile

- 모든 field 1열.
- save action은 변경이 있을 때 하단 sticky bar 사용 가능.
- profile image action은 명확한 텍스트 버튼을 유지한다.
- danger dialog는 full-screen보다 확인 문맥이 보이는 sheet/center dialog를 선택한다.

### State

- Dirty: 저장 CTA 활성 + 이탈 경고가 필요한지 명시
- Saving: field를 전부 흐리게 하지 않고 save control pending
- Saved: toast 또는 section success
- Error: field error + 상단 summary(다수 오류일 때)
- Read-only: 정상 대비 + lock/설명
- Coming soon: disabled control보다 별도 안내

### 적용 위치

- `/photographer/settings`
- `/admin/settings`
- 프로젝트 생성/편집 form

### 재사용

- 현재 `Input`, `Textarea`, `FieldInfoTip`
- `PhotographerModal`의 mobile full-screen form

### 피해야 할 것

- 준비 중 기능을 disabled switch로만 표시
- 저장 성공과 오류를 서로 다른 위치에서 표시
- placeholder를 label로 사용

## 7. 고객 셀렉 화면

### 목적

고객이 설명 없이도 사진을 보고 필요한 수만큼 선택한 뒤 확정한다.

### 정보 우선순위

1. 사진
2. 선택 수 `Y / N`
3. 선택/해제 행동
4. 확정 CTA
5. 필터/별점/색상/코멘트
6. 유사컷/품질 보조 정보

### 구조

1. Customer header
   - 프로젝트명
   - 작가명(선택)
   - 선택 수
2. Primary filters
   - 전체/선택됨
   - filter button
3. `PhotoGrid`
4. Persistent `ApprovalPanel`
   - 선택 수
   - 부족/초과 설명
   - 확정 CTA
5. Confirm dialog

### Desktop

- filter toolbar에서 검색, 정렬, 고급 필터를 펼칠 수 있다.
- grid는 5~8열까지 사진 크기 하한을 지키며 증가한다.
- 카드 기본 상태에는 선택 control과 필요한 badge만 표시한다.
- 파일명/별점/색상은 hover가 아니라 focus 또는 명시적 detail affordance로 접근 가능해야 한다.

### Mobile

- 3열을 기본으로 하되 최소 touch target이 확보되지 않으면 2열로 낮춘다.
- 상단 56px, 하단 64px + safe area를 기준으로 한다.
- 검색/정렬/유사컷/품질은 filter sheet에 넣는다.
- 별점/색상/코멘트는 viewer 하단 panel에서 충분한 크기로 제공한다.
- 선택 count와 확정 CTA는 항상 접근 가능하되 사진을 과도하게 가리지 않는다.

### State

- `Y < N`: `N-Y장 더 선택해 주세요`
- `Y = N`: 확정 가능
- `Y > N`: 선택 제한 정책상 발생하지 않게 막거나 `Y-N장 선택을 해제해 주세요`
- Saving: 해당 photo만 pending indicator
- Offline/동기화 지연: 마지막 저장 상태와 재시도
- Confirmed: gallery 편집을 잠그고 상태 화면으로 전환

### 적용 위치

- `/c/[token]/gallery`
- `/c/[token]/viewer/[photoId]`

### 피해야 할 것

- 고객이 이해하기 어려운 `SYS`, `GROUP_ID`, 분석 엔진 용어
- 사진 카드 안에 Link와 여러 button 중첩
- 7~10px 파일명/별점 control
- 모바일에서 가로 스크롤 필터를 유일한 접근 방식으로 사용

## 8. 관리자 화면

### 목적

운영자가 많은 항목을 정확하게 비교하고 상태 변경의 결과를 예측한다.

### 구조

1. Admin page header
2. KPI summary(대시보드만)
3. Filter/search
4. Data table 또는 compact cards
5. Bulk action(실제로 필요한 경우만)
6. Audit/context detail

### Desktop

- table header는 sticky를 허용한다.
- 첫 열은 대상, 중간은 상태/핵심 값, 마지막은 날짜/행동 순서.
- 상태 변경 control은 row 안보다 detail 또는 명시적인 action cell에서 수행한다.
- 파괴/등급 변경에는 결과 설명과 확인 dialog를 제공한다.

### Mobile

관리자 모바일 지원 범위를 명시해야 한다.

- 최소 지원 시: 조회와 긴급 상태 변경만 제공
- card에는 대상, 상태, 최근 활동, 핵심 action만 표시
- 전체 column 비교가 필요한 표는 `데스크톱에서 전체 보기` 안내 또는 선택적 horizontal scroll
- sidebar는 drawer/top app bar로 전환

### State

- 빈 표, 검색 결과 없음, 권한 없음, 로드 실패를 분리한다.
- 저장 성공/실패는 제어 컴포넌트 바로 근처와 toast 중 한 방식으로 통일한다.
- 운영 경고 문구는 고정 copy가 아니라 실제 기능 상태와 함께 관리한다.

### 적용 위치

- `/admin`
- `/admin/projects`
- `/admin/users`
- `/admin/beta-applications`
- `/admin/feedback`
- `/admin/logs`
- `/admin/settings`

### 피해야 할 것

- 단순히 모든 table에 `min-width`와 가로 스크롤만 추가
- 상태 색상만으로 row 의미 표현
- 한 row에서 select 변경 즉시 저장되지만 결과/오류가 멀리 표시되는 구조

## 9. 모바일 공통 화면

### App chrome

- 상단 app bar: 56px + top safe area
- 작가 하단 nav: 60~64px + bottom safe area
- persistent action: 최소 64px + bottom safe area
- modal/full-screen viewer가 열리면 global mobile chrome을 중복 표시하지 않는다.

### 정보 순서

- 제목과 현재 상태
- 핵심 콘텐츠
- 다음 행동
- 보조 정보/고급 도구

desktop의 좌우 배치를 mobile에서 좌→우 순서로 기계적으로 쌓지 말고 과업 순서로 재배치한다.

### Navigation

- back은 browser/router history와 목적 경로를 구분한다.
- close는 현재 overlay/workspace를 닫는다.
- bottom nav는 최상위 작가 영역에만 사용한다.
- 고객 링크에는 작가용 global navigation을 노출하지 않는다.

### Touch/gesture

- touch target 44px 이상
- swipe는 이전/다음 버튼을 대체하지 않고 보조한다.
- pinch zoom을 허용하고 browser zoom을 차단하지 않는다.
- drag/drop은 mobile file picker 대안을 항상 제공한다.

### Form/dialog

- 키보드가 열려도 primary action과 현재 field가 가려지지 않게 한다.
- 긴 form dialog는 full-screen을 허용한다.
- 짧은 확인은 bottom sheet 또는 center dialog.
- safe area와 virtual keyboard viewport를 함께 고려한다.

## 10. 패턴 선택표

| 화면 | 기본 패턴 | 보조 패턴 |
|---|---|---|
| 작가 대시보드 | 목록 | summary |
| 프로젝트 목록 | 목록 | filter |
| 새 프로젝트 | 설정/form | step |
| 프로젝트 허브 | 상세 | workflow |
| 원본 업로드 | 사진 작업 | upload progress |
| 셀렉 결과 | 사진 작업 | export |
| 보정 workflow | 사진 작업 | workflow/approval |
| 작가 설정 | 설정 | danger zone |
| 고객 초대/PIN | 단일 task | form |
| 고객 gallery | 고객 셀렉 | photo viewer |
| 고객 review | 사진 작업 | retouch/approval |
| 관리자 dashboard | 관리자 | summary/table |
| 관리자 detail | 상세 | audit/action |

## 11. 이행 원칙

- 한 페이지를 리뉴얼하기 전에 해당 page pattern의 공통 영역을 식별한다.
- 기능 state와 API 호출은 유지하고 presentation 경계를 먼저 분리한다.
- desktop/mobile을 동시에 정의하되 한 번에 모든 route를 바꾸지 않는다.
- 고객 갤러리 → 작가 업로드 → 관리자 프로젝트 목록 순으로 패턴을 검증한다.

