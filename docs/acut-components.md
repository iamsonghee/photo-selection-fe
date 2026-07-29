# A-CUT 도메인 컴포넌트 초안

> 상태: Draft 0.1
> 작성일: 2026-07-29
> foundation: `docs/design-system.md`
> page patterns: `docs/page-patterns.md`

## 1. 범위

이 문서는 A-CUT에 현재 필요한 12개 도메인 컴포넌트만 정의한다. Button, Input, Dialog, Toast 같은 범용 primitive의 상세 API는 별도 구현 단계에서 다룬다.

모든 컴포넌트는 현재 스택에서 구현 가능해야 한다.

- React 19 + TypeScript
- Tailwind CSS 4/CSS custom properties
- Lucide icon
- 기존 context와 비즈니스 로직 유지
- 대량 사진에서는 기존 virtualizer와 thumb load queue 유지

상태 저장/API 호출은 도메인 hook/context가 담당하고, 아래 컴포넌트는 표시와 사용자 입력 contract에 집중한다.

## 2. 공통 contract

### 상태 우선순위

한 요소에 상태가 겹치면 다음 순서로 표시한다.

1. error
2. pending/uploading
3. disabled/locked
4. selected/active
5. warning/quality
6. default

선택과 오류가 동시에 필요하면 ring과 badge처럼 서로 다른 시각 채널을 사용한다.

### 상호작용

- icon-only control: 최소 44×44px, `aria-label`
- focus-visible: blue focus token
- 클릭 가능한 container 안에 별도 button/link를 중첩하지 않는다.
- hover에서만 나타나는 기능은 focus/touch 대안을 제공한다.
- pending 중에는 중복 실행을 막고 진행 label을 제공한다.

### 사진 표현

- object-fit 기본: thumbnail `cover`, viewer `contain`
- aspect ratio는 variant가 소유한다.
- 로딩 중에도 layout 크기를 유지한다.
- 사진 위 text는 필수 metadata만 표시한다.

## 3. PhotoThumbnail

### 목적

사진 목록에서 한 장의 이미지와 선택·현재 위치·업로드·검토·품질 상태를 일관되게 표시한다. 페이지별 사진 카드 구현을 대체할 최소 시각 단위다.

### 구성 요소

1. Image plate
2. 상태 ring
3. 상단 leading slot
   - selection control 또는 순번
4. 상단 trailing slot
   - quality/error/status badge
5. 하단 metadata slot
   - 파일명 또는 짧은 상태
6. group/count slot(선택)
7. 별도 detail link/action 영역

전체 container는 기본적으로 비-interactive다. 상세 열기 link와 선택 button은 형제 control로 배치한다.

### Variant

| Variant | 용도 | 기본 비율 | 기본 정보 |
|---|---|---:|---|
| `selection` | 고객 셀렉 | 1:1 | 선택, group, 최소 metadata |
| `management` | 작가 업로드/결과 | 1:1 또는 4:3 | 파일명, 업로드/분석 상태 |
| `review` | 원본/보정 검토 | 4:3 | 승인/재보정 상태 |
| `comparison` | 원본/V1/V2 쌍 | container 결정 | 버전 label |
| `compact` | rail/list | 4:3 | 현재 위치/순번만 |

`density`는 `comfortable | compact` 두 종류만 둔다.

### State

| State | 표현 |
|---|---|
| `loading` | 고정 크기 neutral skeleton |
| `ready` | 기본 border |
| `selected` | orange 2px ring + check + accessible selected text |
| `current` | blue 2px ring + 현재 사진 label |
| `pending` | 작은 spinner + 상태 동사 |
| `warning` | warning badge, 사진 색 변경 없음 |
| `error` | red badge/ring + 재시도 action |
| `disabled` | control 비활성 + 이유, 사진 opacity 최대 .65 |
| `approved` | green check/status |
| `revisionRequested` | amber request/status |

### Desktop / mobile 동작

Desktop:

- hover는 이미지 확대 대신 border/surface만 변경한다.
- metadata는 항상 필요한 최소 항목만 보이고, 추가 action은 hover와 focus 모두에서 나타난다.
- selection control은 32px로 보여도 실제 hit area는 44px 확보한다.

Mobile:

- 2~3열 grid에서도 선택 control hit area 44px을 유지한다.
- 파일명처럼 읽기 어려운 metadata는 카드에서 제거하고 viewer에서 제공한다.
- 별점/색상/코멘트 control을 thumbnail 위에 모두 올리지 않는다.

### 사용 위치

- 고객 gallery와 locked gallery
- 작가 upload/results/workflow
- 고객 review 목록과 thumbnail rail
- Gemini 분석 결과의 photo item

### 사용하지 말아야 할 사례

- 큰 사진 감상이 목적인 단일 viewer
- 프로젝트 cover처럼 사진 한 장이 장식 이미지인 경우
- avatar/profile image
- 카드 전체 Link 안에 여러 button을 넣어야 하는 구조

### 기존 구현 재사용

- `GalleryPhotoCard`의 queued thumbnail loading
- upload page의 thumbnail error/fallback
- locked page의 4:3 photo state
- workflow/review의 승인·재보정 표시

## 4. PhotoGrid

### 목적

많은 `PhotoThumbnail`을 성능 저하 없이 배치하고, grid/list 전환·virtualization·선택·빈 상태를 공통으로 관리한다.

### 구성 요소

1. Scroll container
2. Layout engine
3. Virtual row/list adapter(선택)
4. Photo item renderer
5. Empty/no-result state
6. Loading placeholders
7. Grid navigation/scroll anchor

Filter toolbar는 PhotoGrid 자체에 포함하지 않는다. Page pattern의 tool strip이 소유한다.

### Variant

| Variant | 용도 | Layout |
|---|---|---|
| `customer` | 고객 셀렉 | mobile 2~3열, desktop 5~8열 |
| `management` | 작가 대량 사진 | mobile 3열, desktop 사용자 density에 따라 5~10열 |
| `review` | 검토 목록 | mobile 2~3열, desktop 4~7열 |
| `rail` | viewer thumbnail rail | 가로 또는 세로 1열 |
| `list` | 파일명/상태 비교 | row list |

`viewMode`: `grid | list`. Compare view는 `PhotoViewer`가 담당한다.

### State

- `loading`
- `ready`
- `empty`
- `noResults`
- `partialError`
- `disabled`
- `selecting`
- `restoringScroll`

Partial error는 성공 사진을 유지하고 실패 item만 error 상태로 둔다.

### Desktop / mobile 동작

Desktop:

- 가용 폭과 최소 cell 폭으로 column 수를 결정한다.
- 대량 데이터는 기존 `@tanstack/react-virtual` 사용.
- grid/list 전환 시 filter와 scroll context를 가능한 유지한다.
- keyboard grid navigation은 도입할 경우 한 패턴으로 제공한다.

Mobile:

- 기본 gap 4~8px.
- 화면 폭만으로 무조건 3열을 강제하지 않고 최소 touch target과 사진 판독성을 우선한다.
- filter bar와 bottom action 높이를 scroll padding에 포함한다.
- virtualization column 계산은 768px breakpoint contract와 맞춘다.

### 사용 위치

- `/c/[token]/gallery`
- `/photographer/projects/[id]/upload`
- `/photographer/projects/[id]/results`
- `/photographer/projects/[id]/workflow`
- `/c/[token]/review`
- `/c/[token]/locked`

### 사용하지 말아야 할 사례

- 사진이 1~3장뿐인 비교 panel
- 프로젝트 목록 cover image
- metadata 비교가 핵심인 관리자 table
- 각각 다른 크기의 masonry gallery. A-CUT 핵심 작업에서는 균일 grid를 우선한다.

### 기존 구현 재사용

- gallery/upload의 virtualizer
- `thumb-load-queue`
- upload의 grid/list mode
- 현재 column/gap 계산 로직은 breakpoint token에 맞춰 통합

## 5. PhotoViewer

### 목적

원본 사진 감상, 원본/보정본 비교, 이전/다음 이동, 모바일 pinch를 하나의 viewer shell과 capability로 제공한다.

### 구성 요소

1. Viewer shell/backdrop
2. Context header
   - close/back
   - 파일명/버전
   - index count
3. Image stage
4. Prev/next navigation
5. Mode control
   - single
   - toggle compare
   - side-by-side
6. Thumbnail rail(선택)
7. Metadata/action panel(선택)
8. Mobile gesture layer

### Variant

| Variant | 설명 |
|---|---|
| `single` | 한 장 확대 |
| `toggleCompare` | 원본/보정본을 동일 stage에서 전환 |
| `sideBySide` | 두 버전을 나란히 비교 |
| `reviewWorkspace` | thumbnail rail + stage + 검토 panel |
| `lightbox` | 최소 chrome의 modal viewer |

Capability prop으로 `zoom`, `pinch`, `swipe`, `keyboard`, `thumbnailRail`을 조합한다. variant마다 별도 viewer를 만들지 않는다.

### State

- `loading`
- `ready`
- `imageError`
- `emptyVersion`
- `saving`
- `disabledNavigation`
- `approved`
- `revisionRequested`

이미지 한쪽이 없는 compare는 전체 error가 아니라 해당 stage에 `이미지 없음`을 표시한다.

### Desktop / mobile 동작

Desktop:

- ArrowLeft/ArrowRight: 사진 이동 또는 compare mode에 따라 명확한 단일 의미
- Escape: overlay 닫기
- side-by-side는 각 이미지 label을 항상 표시한다.
- thumbnail rail은 160~240px 범위, 접기 가능.
- stage는 `surface-photo-stage`, image는 `contain`.

Mobile:

- full-screen, global app chrome 숨김.
- top safe area와 bottom action safe area 포함.
- pinch/pan은 기존 `MobileViewerPinchPhoto` 활용.
- swipe는 prev/next의 보조 수단이며 버튼 또는 명확한 탐색 대안을 유지한다.
- side-by-side보다 toggle/tab을 기본으로 한다.

### 사용 위치

- 고객 photo viewer
- 고객 review detail
- 작가 results lightbox
- 작가 workflow compare
- 작가 upload preview

### 사용하지 말아야 할 사례

- thumbnail 목록 자체
- 프로젝트 cover 단순 확대가 필요 없는 경우
- dialog 안에 다시 viewer dialog를 중첩
- 비교와 사진 이동 모두 같은 좌우 화살표에 모호하게 배정

### 기존 구현 재사용

- `PrevNextButton`
- `MobileViewerPinchPhoto`
- `FullScreenCompareModal`의 Escape/swipe
- `CompareViewerModal`의 original/V1/V2 model
- 페이지 로컬 lightbox는 capability로 흡수

## 6. SelectionBadge

### 목적

사진이 선택되었거나 선택 가능한 상태임을 빠르게 표시한다. 프로젝트 상태나 품질 상태를 표현하는 badge가 아니다.

### 구성 요소

1. Container
2. Check 또는 숫자
3. 짧은 accessible label
4. 선택 해제 hit area(인터랙티브 variant)

### Variant

| Variant | 설명 |
|---|---|
| `checkbox` | photo 선택/해제 control |
| `selected` | 읽기 전용 선택됨 표시 |
| `order` | 선택 순서가 의미 있을 때 숫자 |
| `count` | `12장 선택` 같은 summary |
| `groupCount` | `+3` 유사컷 묶음 수. 선택 의미와 시각을 구분 |

`groupCount`는 orange fill 대신 neutral surface + orange border를 사용해 실제 선택과 구분한다.

### State

- `unselected`
- `selected`
- `hover`
- `focus`
- `pending`
- `disabled`
- `limitReached`

`limitReached`는 선택되지 않은 control을 disabled하고 `필요 장수를 모두 선택했습니다` 설명을 제공한다.

### Desktop / mobile 동작

Desktop:

- 시각 크기 22~24px, hit area 최소 44px.
- hover/focus에서 상태 label tooltip 허용.

Mobile:

- 시각 크기 24px, hit area 44px.
- 카드 모서리에서 safe inset 6~8px.
- count summary는 persistent action panel 안에서 text와 함께 사용한다.

### 사용 위치

- `PhotoThumbnail selection`
- 고객 gallery/viewer
- 작가 bulk selection
- 셀렉 결과 summary

### 사용하지 말아야 할 사례

- 프로젝트 status
- 승인/재보정 status
- 업로드 진행 상태
- 품질 경고
- 선택 가능한 카드 전체를 Link로 만들고 badge button을 중첩

### 기존 구현 재사용

- `GalleryPhotoCard`의 check UI와 group badge
- 고객 footer의 Y/N count

## 7. RatingControl

### 목적

사진에 0~5점 별점을 입력·수정·필터링하거나 읽기 전용으로 표시한다.

### 구성 요소

1. Group label
2. 별 5개 button 또는 읽기 전용 icon
3. 현재 값
4. 초기화/지우기 action(필요한 경우)
5. 저장 상태와 error

### Variant

| Variant | 설명 |
|---|---|
| `interactive` | 사진 평가 |
| `compact` | desktop thumbnail/toolbar |
| `readOnly` | 결과/관리자 표시 |
| `filter` | N점 이상 filter |

별 icon은 한 종류로 통일한다. `★/☆` 문자와 Lucide/SVG를 혼용하지 않는다.

### State

- `empty`
- `rated`
- `preview`(hover/focus)
- `saving`
- `saved`
- `error`
- `disabled`

같은 별을 다시 선택해 0점으로 지울 수 있다면 tooltip/help에서 명시한다.

### Desktop / mobile 동작

Desktop:

- interactive 기본 별 hit area 36~40px, compact도 keyboard focus 가능.
- hover preview와 keyboard focus preview가 동일하게 작동한다.
- filter는 `3점 이상` accessible name을 사용한다.

Mobile:

- 별 hit area 최소 44px.
- thumbnail overlay에 8px 별을 두지 않는다.
- viewer 하단 panel 또는 sheet에서 조작한다.
- 저장 중에도 현재 값은 유지한다.

### 사용 위치

- 고객 gallery의 고급 평가
- 고객 viewer
- 별점 filter
- 작가 results의 읽기 전용 표시

### 사용하지 말아야 할 사례

- 승인/재보정의 이진 판단
- 사진 품질 AI 점수
- 프로젝트 진행률
- color tag를 대체하는 분류

### 기존 구현 재사용

- gallery/viewer의 rating state와 저장 로직
- 표시 icon과 크기, accessible label만 통합

## 8. CommentIndicator

### 목적

사진에 코멘트가 있는지, 어떤 종류의 코멘트인지 목록에서 알려주고 상세 편집 위치로 이동시킨다.

### 구성 요소

1. Message icon
2. 상태 dot 또는 count
3. 짧은 label/preview(공간이 있을 때)
4. detail/editor 이동 action(인터랙티브 variant)

Comment editor 자체는 포함하지 않는다.

### Variant

| Variant | 설명 |
|---|---|
| `presence` | 코멘트 있음/없음 icon |
| `count` | 여러 코멘트 수 |
| `preview` | 1~2줄 미리보기 |
| `revision` | 재보정 요청 코멘트 |
| `readOnly` | 결과 표시 |

### State

- `none`
- `hasComment`
- `unread`(향후 실제 unread 데이터가 있을 때만)
- `editing`
- `saving`
- `error`
- `disabled`

`unread`는 데이터 모델이 없으면 시각적으로 추정하지 않는다.

### Desktop / mobile 동작

Desktop:

- thumbnail에는 icon + indicator만 표시하고 preview는 tooltip/detail rail에서 제공한다.
- row/list에서는 1줄 preview 허용.

Mobile:

- 최소 44px action으로 viewer의 comment field를 연다.
- 작은 speech icon만으로 의미를 전달하지 않고 accessible name을 제공한다.
- 긴 preview를 사진 위에 덮지 않는다.

### 사용 위치

- 고객 gallery/viewer
- 작가 selection results
- workflow review summary
- `RetouchRequest`

### 사용하지 말아야 할 사례

- 일반 page feedback/toast
- 프로젝트 내부 메모와 고객 사진 코멘트를 구분하지 않는 표시
- 코멘트가 없는데 항상 빈 badge를 노출

### 기존 구현 재사용

- SelectionContext의 photo comment
- results/workflow의 코멘트 표시

## 9. ProjectCard

### 목적

작가가 프로젝트 목록/대시보드에서 고객, 상태, 기한, 사진 수, 다음 행동을 빠르게 파악하도록 한다.

### 구성 요소

1. Cover thumbnail(선택)
2. Project title
3. Customer/date metadata
4. `ProjectStatus`
5. Deadline
6. Progress summary
7. Primary next action
8. Overflow menu

정보 순서와 action label은 actor가 작가인 상태 모델에서 파생한다.

### Variant

| Variant | 설명 |
|---|---|
| `dashboard` | cover 중심, 최근/중요 프로젝트 |
| `list` | 비교 중심 horizontal row |
| `compact` | 작은 dashboard section |
| `mobile` | 1열, action 강조 |
| `completed` | 완료 프로젝트 quiet tone |

`mobile`은 별도 데이터 모델이 아니라 layout variant다.

### State

- `preparing`
- `inProgress`
- `waitingCustomer`
- `actionRequired`
- `completed`
- `overdue`
- `loading`
- `error`

프로젝트 내부 상태 8종은 `ProjectStatus`가 표시하고, Card state는 시각 우선순위만 결정한다.

### Desktop / mobile 동작

Desktop:

- dashboard grid에서는 cover 3:2.
- list에서는 thumbnail 72~96px와 핵심 metadata를 한 행에 배치.
- overflow menu는 destructive/secondary action만 포함.
- 다음 행동 CTA는 하나.

Mobile:

- cover는 3:2 또는 compact thumbnail.
- 상태/기한을 제목 바로 아래.
- CTA full-width 또는 하단 우측 한 곳.
- hover 전용 menu를 사용하지 않는다.

### 사용 위치

- 작가 dashboard
- 작가 project list
- 관련 프로젝트 추천/최근 프로젝트

### 사용하지 말아야 할 사례

- 관리자 전체 프로젝트 비교 표
- 프로젝트 상세 header
- 고객에게 프로젝트 상태를 안내하는 화면
- 카드 안에서 수정/삭제/업로드/결과 등 모든 행동을 동등하게 노출

### 기존 구현 재사용

- dashboard cover/card
- projects page의 mobile/desktop metadata
- `StatusPill`
- `ProjectPipelineMiniBar`의 진행 데이터는 `ProjectStatus/WorkflowStep`으로 이전

## 10. ProjectStatus

### 목적

프로젝트의 내부 상태를 actor별로 정확한 label, tone, 설명으로 표현한다. 상태와 다음 CTA를 분리하는 단일 기준점이다.

### 구성 요소

1. 상태 icon/dot
2. Actor-specific label
3. 보조 설명(extended variant)
4. Optional phase/count

### Variant

| Variant | 설명 |
|---|---|
| `pill` | 목록/카드 |
| `inline` | table/meta |
| `extended` | 상세 header/상태 안내 |
| `customer` | 고객 친화 label |
| `admin` | 내부 상태 코드 병기 가능 |

### 상태/label

| 내부 상태 | 작가 label | 고객 label | 기본 tone |
|---|---|---|---|
| `preparing`, 0장 | 업로드 전 | 갤러리 준비 중 | neutral |
| `preparing`, 일부 | 업로드 중 | 갤러리 준비 중 | info |
| `preparing`, 준비 완료 | 초대 대기 | 갤러리 준비 완료 | selected |
| `selecting` | 고객 셀렉 중 | 사진 선택 중 | selected |
| `confirmed` | 보정 시작 대기 | 셀렉 확정 | neutral |
| `editing` | 보정 중 | 보정 진행 중 | info |
| `reviewing_v1` | 고객 검토 중 | 보정본 검토 | warning |
| `editing_v2` | 재보정 중 | 재보정 진행 중 | warning |
| `reviewing_v2` | 고객 재검토 중 | 재보정본 검토 | warning |
| `delivered` | 납품 완료 | 최종 완료 | success |

`selected` tone은 “행동 가능/진행 중”을 의미하는 주황 계열이며 success가 아니다.

### State

ProjectStatus 자체의 UI state:

- `default`
- `loading`
- `stale`(서버 동기화 지연이 실제 감지될 때)
- `compact`
- `withDescription`

프로젝트 status를 임의로 `error`로 바꾸지 않는다. 오류는 별도 feedback이다.

### Desktop / mobile 동작

Desktop:

- pill/inline 선택.
- extended는 설명 1줄과 단계 정보를 허용한다.
- admin variant는 내부 코드를 tooltip 또는 secondary text로 제공할 수 있다.

Mobile:

- label을 축약하지 않는다.
- extended description은 필요 시 2줄.
- 작은 dot만 표시하지 않고 text 유지.

### 사용 위치

- `ProjectCard`
- 작가 프로젝트 상세/header
- 작가 workflow
- 고객 status/locked/confirmed/delivered
- 관리자 table/detail

### 사용하지 말아야 할 사례

- 다음 행동 버튼 label
- 업로드 파일 상태
- 사진 승인/재보정 상태
- 대시보드 section title(`대기중`, `진행중`)을 대신하는 용도

### 기존 구현 재사용

- `StatusPill`의 preparing 세분화
- `src/lib/project-status.ts`의 status type/transition
- 화면별 label map은 이 actor table로 통합

## 11. WorkflowStep

### 목적

프로젝트 전체 흐름에서 완료된 단계, 현재 단계, 향후 단계를 보여주고 현재 단계의 설명 또는 행동으로 연결한다.

### 구성 요소

1. Step indicator
2. Step label
3. State icon
4. Optional description
5. Optional action
6. Connector

### Variant

| Variant | 설명 |
|---|---|
| `compact` | 카드/목록의 축약 progress |
| `horizontal` | desktop 상세/header |
| `vertical` | mobile 상세/action flow |
| `actionable` | 현재 단계에 CTA 포함 |

기본 단계:

1. 원본 업로드
2. 고객 셀렉
3. 1차 보정/검토
4. 재보정/재검토(조건부)
5. 최종 납품

재보정이 허용되지 않거나 발생하지 않은 프로젝트는 4단계를 `건너뜀`으로 표시하거나 compact variant에서 숨길 수 있다. 전체 단계 번호/진행률 계산은 동일 모델을 사용한다.

### State

- `completed`
- `current`
- `upcoming`
- `locked`
- `skipped`
- `attention`
- `pendingTransition`

`reviewing_v1/v2`는 완료가 아니라 customer action을 기다리는 current/attention 상태다.

### Desktop / mobile 동작

Desktop:

- horizontal은 label을 모두 보이게 하고 connector로 연결.
- compact는 segment + 현재 단계 text를 함께 제공한다.
- clickable step은 실제 접근 가능한 화면에만 link가 된다.

Mobile:

- vertical을 기본으로 해 label과 설명 공간 확보.
- compact card에서는 현재 단계 text + 전체 progress만 표시.
- horizontal label을 9px로 축소하지 않는다.

### 사용 위치

- 프로젝트 상세
- dashboard/project card compact progress
- workflow header
- 고객 상태 안내의 제한된 progress

### 사용하지 말아야 할 사례

- 파일 업로드 progress
- 고객이 할 수 없는 미래 내부 단계를 과도하게 상세 표시
- 상태 전환이 아닌 navigation tab
- 모든 step을 클릭 가능하게 만들어 우회 이동 허용

### 기존 구현 재사용

- `project-flow-steps.tsx`의 상태→단계 판단
- `ProjectActionFlow`의 action data
- `ProjectPipelineMiniBar`의 compact layout
- `ProjectProgressBar`는 중복 로직 제거 후보

## 12. UploadProgress

### 목적

대량 사진 업로드와 후처리의 현재 단계, 전체/개별 진행률, 성공·실패·복구 가능 상태를 명확히 보여준다.

### 구성 요소

1. 작업 제목
2. 단계 label
3. Progress bar
4. 처리 수 `완료 / 전체`
5. 예상/경과 정보(정확할 때만)
6. 성공/실패 summary
7. 취소/재시도/복구 action
8. 실패 파일 목록 toggle(부분 실패)

### Variant

| Variant | 설명 |
|---|---|
| `batch` | 전체 업로드 |
| `file` | 개별 파일 row |
| `compact` | 고정 feedback strip |
| `blocking` | 이탈하면 안 되는 처리 |
| `recovery` | 중단 작업 복구 |
| `analysis` | 유사컷/품질 분석. 업로드와 label을 구분 |

### State

- `queued`
- `preparing`
- `compressing`
- `uploading`
- `processing`
- `completed`
- `partialSuccess`
- `failed`
- `canceling`
- `canceled`
- `recoverable`
- `retrying`

단계를 임의의 하나의 `업로드 중`으로 합치지 않는다. 단, 사용자가 제어할 수 없는 기술 세부 단계는 이해 가능한 3~4개로 묶는다.

### Desktop / mobile 동작

Desktop:

- compact strip은 tool strip 아래.
- batch detail은 panel/modal에서 실패 파일을 펼친다.
- 다른 사진 탐색을 계속할 수 있으면 blocking overlay를 사용하지 않는다.

Mobile:

- 고정 bottom action과 겹치지 않는 compact banner.
- background 업로드 중 이탈 영향과 복구 방법 표시.
- 긴 실패 목록은 full-screen sheet.
- progress text 최소 12px.

### 사용 위치

- 원본 업로드
- 보정본 V1/V2 업로드
- 납품 파일 업로드
- 유사컷/품질 분석
- 업로드 복구

### 사용하지 말아야 할 사례

- 프로젝트 전체 workflow
- 단순 페이지 데이터 fetch
- 이미 완료된 업로드를 계속 progress bar로 표시
- 정확하지 않은 예상 시간을 확정값처럼 표시

### 기존 구현 재사용

- upload page의 단계/파일 수/복구 state
- `ProgressBar`의 width 계산
- `UploadVersionsPanel`의 파일 매칭/실패 state

## 13. RetouchRequest

### 목적

고객이 특정 보정본에 재보정을 요청하고, 작가가 대상 사진·버전·코멘트·처리 상태를 정확히 이해하게 한다.

### 구성 요소

1. Photo/version reference
2. 요청 상태
3. 고객 코멘트
4. 원본/보정본 비교 진입
5. revision round/remaining count
6. 저장/수정 action(고객 composer)
7. 처리/완료 metadata(작가 summary)

### Variant

| Variant | 설명 |
|---|---|
| `composer` | 고객이 재보정 요청 작성 |
| `summary` | 작가가 요청 목록 확인 |
| `inline` | viewer action panel |
| `readOnly` | 완료/이력 |
| `limitReached` | 재보정 횟수 소진 안내 |

### State

- `notRequested`
- `draft`
- `saving`
- `requested`
- `editing`
- `resubmitted`
- `resolved`
- `error`
- `disabled`
- `limitReached`

`requested`와 API error를 같은 warning 색으로 표현하지 않는다. 요청은 amber, 실패는 red다.

### Desktop / mobile 동작

Desktop:

- compare viewer 옆 detail rail 또는 list row.
- 코멘트는 최소 2줄, 전체 보기 가능.
- 작가 summary는 사진 thumbnail + 요청 text + 상태를 한 행에 비교 가능.

Mobile:

- viewer 하단 panel에서 `재보정 요청`을 선택한 뒤 comment field를 펼친다.
- keyboard가 열릴 때 action이 가려지지 않게 한다.
- 긴 코멘트와 비교는 full-screen viewer로 이동.

### 사용 위치

- 고객 review/detail
- 작가 workflow
- 작가 results/history
- locked/delivered의 읽기 전용 이력(필요한 경우)

### 사용하지 말아야 할 사례

- 일반 사진 코멘트
- 작가 내부 메모
- 프로젝트 전체 상태 badge
- 단순 승인 action
- 재보정 한도가 없는데 limit UI 노출

### 기존 구현 재사용

- `ReviewContext`의 status/comment
- review detail의 approve/revision 분기
- workflow의 V1/V2 review summary

## 14. ApprovalPanel

### 목적

셀렉 확정, 보정본 검토 제출, 최종 승인처럼 되돌리기 어렵거나 다음 단계로 전환하는 행동을 요약하고 안전하게 실행한다.

### 구성 요소

1. 현재 완료 조건 summary
2. 부족/주의 사항
3. 주요 CTA
4. 보조/취소 action
5. 정책 설명(취소 횟수, 재보정 잔여 등)
6. Confirm dialog trigger
7. 제출 error

### Variant

| Variant | 설명 |
|---|---|
| `selection` | Y/N 선택 확정 |
| `review` | 승인/재보정 요청 결과 제출 |
| `delivery` | 작가가 고객 검토/납품 단계로 전환 |
| `final` | 최종 수령/완료 |
| `compact` | desktop sticky/action bar |

### State

- `incomplete`
- `ready`
- `warning`
- `submitting`
- `success`
- `error`
- `locked`

상태별 예:

- selection incomplete: `3장 더 선택해 주세요`
- review incomplete: `검토하지 않은 사진 2장`
- ready: primary CTA 활성
- submitting: `확정 중…`, 중복 실행 차단
- success: route transition 전 success feedback

### Desktop / mobile 동작

Desktop:

- page content 하단 또는 sticky bottom/right rail.
- summary와 CTA를 한 줄에 배치 가능.
- confirm dialog에서 결과를 구체적으로 반복한다.

Mobile:

- 하단 fixed/sticky panel + safe area.
- primary CTA 높이 48px, 가능하면 full-width.
- panel은 사진 grid를 가리지 않도록 콘텐츠 bottom padding 확보.
- incomplete 이유를 CTA 바로 위에 표시한다.

### 사용 위치

- 고객 gallery 확정
- 고객 review 결과 제출
- 고객 최종 수령 완료
- 작가 고객 초대 활성화/보정본 전달
- 작가 workflow 최종 단계 전환

### 사용하지 말아야 할 사례

- 즉시 되돌릴 수 있는 별점/색상 저장
- 일반 form 저장
- 사진 한 장 선택/해제
- 단순 navigation
- 조건이 충족되지 않았는데 이유 없는 disabled CTA

### 기존 구현 재사용

- `SelectionConfirmFooter`
- gallery/review의 confirm modal 요약
- workflow 하단 action bar
- customer footer의 상태별 CTA

## 15. 컴포넌트 조합 예

### 고객 셀렉

```text
Customer header
  ProjectStatus(customer, inline)
  SelectionBadge(count)
Filter tools
PhotoGrid(customer)
  PhotoThumbnail(selection)
    SelectionBadge(checkbox)
ApprovalPanel(selection)
PhotoViewer(toggleCompare 아님, single)
  RatingControl(interactive)
  CommentIndicator / comment field
```

### 작가 업로드

```text
Workspace header
  ProjectStatus(pill)
  WorkflowStep(compact)
UploadProgress(compact/batch/recovery)
PhotoGrid(management)
  PhotoThumbnail(management)
PhotoViewer(lightbox)
ApprovalPanel(delivery)
```

### 보정 검토

```text
Workspace header
  ProjectStatus
  WorkflowStep
PhotoViewer(reviewWorkspace / sideBySide)
  RetouchRequest(inline)
PhotoGrid(review)
ApprovalPanel(review)
```

### 작가 프로젝트 목록

```text
List page pattern
ProjectCard(dashboard/list/mobile)
  ProjectStatus(pill)
  WorkflowStep(compact)
```

## 16. 구현 우선순위와 의존 관계

1. `ProjectStatus`
   - 기존 status label 불일치 해결
2. `SelectionBadge`, `PhotoThumbnail`
   - 고객 gallery의 interactive hierarchy 개선
3. `PhotoGrid`
   - 기존 virtualizer를 공통 layout으로 감쌈
4. `RatingControl`, `CommentIndicator`
   - 고객 조작 크기와 접근성 정렬
5. `ApprovalPanel`
   - 고객/작가의 다음 행동 위치 통일
6. `UploadProgress`
   - 작가 upload 상태 정리
7. `PhotoViewer`
   - 여러 viewer/lightbox를 점진 통합
8. `WorkflowStep`
   - 진행 표현 통합
9. `RetouchRequest`
   - review/workflow 연결
10. `ProjectCard`
   - 상태/단계가 안정된 뒤 목록에 적용

이 순서는 컴포넌트를 모두 새로 만드는 순서가 아니다. 각 단계에서 기존 구현의 로직과 성능 최적화를 유지하며 presentation contract를 맞춘다.
