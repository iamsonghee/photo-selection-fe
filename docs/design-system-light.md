# A-CUT Light UI Design System

> **Status:** Working Design System  
> **Version:** Light Theme Draft 0.6 — 2026-09-09 PC + Mobile shared components  
> **Golden Reference:** Dashboard + Photographer Project List + Photographer Project Detail  
> **Reference routes:** `/photographer/dashboard`, `/photographer/projects`, `/photographer/projects/[id]`  
> **Scope:** Photographer 일반 운영 영역의 Light App UI  
> **Not in scope:** Dark Photo Workspace의 팔레트 변경, 고객 UI 규칙 통합. 모바일 구현 및 검증 범위는 [구현 결과](mobile-design-implementation-2026-09-09.md)를 따른다. Light 적용 여부와 검증 수준은 §0.4를 따른다.

> **모바일 구현 (2026-09-09):** [구현 및 재검증 결과](mobile-design-implementation-2026-09-09.md). [초기 검수](mobile-design-audit-2026-09-09.md) / [정밀 검수](mobile-design-deep-audit-2026-09-09.md) / [설계 원안](mobile-design-proposal-2026-09-09.md)은 구현 전 기록이다. 카드·폼·시트·업로드창·뷰어·도움말을 공통 기반으로 반영했다. Chromium 모바일 에뮬레이션과 PC 회귀를 별도로 확인하며 실기기 검증은 아니다.

## 0. 문서의 역할과 증거 수준

이 문서는 새로운 시안을 제안하지 않는다. 2026-08-27의 Dashboard, Photographer Project List, Photographer Project Detail Golden Reference에서 출발했으며, 이후 Form/Settings/Asset Workspace 구현을 반영한다. 2026-09-09 PC 검수에서는 실제 구현 범위와 검증 범위를 분리했다. 이전 모바일 검증 기록은 유지하지만 PC 검수만으로 재검증한 것으로 간주하지 않는다. 이후 모바일의 별도 검증 범위는 위 후속 검수 문서를 따른다.

Source of Truth 우선순위는 다음과 같다.

1. 현재 Dashboard / Photographer Project List / Photographer Project Detail Light 구현
2. Browser computed style
3. 현재 사용 중인 shared token/component
4. Figma Dashboard `#56043`, Project List `#56056`, `#56057`, `#56051`, Project Detail `#56058`, `#56059`, `#56060` 중 구현에 실제 반영된 geometry/typography

### 0.1 분류

| 분류 | 의미 |
|---|---|
| **A. Stable Light Core** | Dashboard와 Project List처럼 서로 다른 Light 운영 화면에서 반복 검증된 공통 원칙 |
| **B. Validated Pattern** | 실제 데이터·상호작용에서 검증된 컴포넌트 패턴. 적용 맥락에 따른 density 조절은 허용 |
| **C. Page-specific** | Dashboard 또는 Project List의 정보 구조·밀도·위치에 종속된 규칙 |
| **D. Cross-screen Conflict** | 두 Golden Reference 또는 기존 shared 문서 사이에 아직 남은 구현 충돌 |
| **E. Experimental / Open Question** | 대표 상태가 부족하거나 다음 Golden Reference에서 추가 검증이 필요한 항목 |

### 0.2 Audit provenance와 제한

- Color, surface, spacing, radius, action, component 구조는 두 Golden route의 실제 TSX/CSS와 shared Sidebar 구현을 조사했다.
- Typography 표는 실제 선언값과 Tailwind CSS 4 기본 해석값을 함께 풀어 `font-family / size / weight / line-height / letter-spacing` 다섯 값으로 기록했다.
- Project List 구현 후 Playwright Chromium에서 toolbar gap, filter→table gap, Project ID typography, deadline hierarchy, step state, row hover/focus를 실제 DOM/computed style로 재검증했다.
- Project Detail 구현 후 Playwright Chromium에서 1440px Desktop, 1024px Narrow, 390px Mobile의 content grid, Expanded Stepper, Information/Work Panel, Customer Link, destructive dialog, typography와 Light mobile shell을 실제 DOM/computed style로 재검증했다.
- Project ID는 Dashboard와 Project List 양쪽에서 `JetBrains Mono / 11px / 600 / 16.5px / normal`이 일치함을 확인했다. 전체 LNB typography처럼 아직 재검증하지 않은 값은 계속 **code-resolved / browser recheck required**로 표시한다.
- Light route LNB와 콘텐츠는 Pretendard를 사용하고 ID·D+는 JetBrains Mono를 사용한다. Sidebar 내부의 `Inter` loader는 Dark/legacy 구현에 남아 있지만 Light scope에서는 computed Pretendard로 재검증했다.

### 0.3 Draft 0.3 검증 결과 요약 — 2026-08-27 이력

| 분류 | 이번 버전의 결과 |
|---|---|
| A. Stable 강화 | Light color/surface, shared page frame/header, Project ID, Actor semantic, Light route Pretendard scope, customer-stage overdue `D+N` |
| B. 신규 검증 | Expanded Stepper, Information Card, Work Panel, Customer Link Tool, Destructive Confirmation, Project Detail responsive grid/mobile shell |
| C. Page-specific | Dashboard Focus/Recent/Aside, Project List filter/grid/Usage Ring, Project Detail 6-step+information+work composition |
| D. Conflict | Dashboard `focus` vs Project List `focus-visible`, 기존 `design-system.md` palette/type 차이, Dark/legacy Sidebar Inter loader |
| E. Pending | completed-row fixture, Settings, generic Info/Warning semantic, 다른 Light route의 mobile page composition 전체 audit |

### 0.4 현재 PC 적용 범위와 검증 상태 (2026-09-09)

Light shell 판별의 구현 기준은 `src/lib/photographer-sidebar-routes.ts`의 `isPhotographerLightRoute()`다. **Light로 렌더된다는 사실과 모든 상태가 검증됐다는 사실은 다르다.**

| Route / 화면 | 현재 구현 | 이번 PC 검증 |
|---|---|---|
| Dashboard / Project List | 공유 Light page frame/header, actor/ID/stepper | populated·overdue·completed 대표 상태, 네 PC 폭의 문서 가로 넘침 검사 |
| Project Detail / Edit | 공유 Light shell, Expanded Stepper, 정보/작업 패널, 840px edit form | Detail 대표 화면·삭제 dialog; Edit 네 PC 폭·label 연결 검사 |
| Project Create | 공유 840px form + quota 분기 | 한도 초과 안내 확인. quota 응답을 모킹한 일반 폼의 label·선택 상태·필수 오류 E2E 통과; 정상 생성 전송은 미실행 |
| Settings | 공유 Light theme/header/button, `ProjectFormField`/input class/switch | 네 PC 폭의 기본 폼 확인. 저장/오류/계정 삭제 전체 상태는 미검증 |
| `/projects/[id]/upload` | Light 원본 관리 화면, 공통 gallery/action bar | 기존 preparing 프로젝트. 실제 업로드·분석 미실행 |
| `/projects/[id]/assets/original`, `selected`, `retouched`, `final` | Light Asset Workspace. Header/Tab/Toolbar와 data provider 재사용 | 네 PC 폭. Final은 0장 empty 상태만 확인 |
| `/projects/[id]/results`, `workflow` | Light 판별에 포함되는 legacy redirect | 각각 assets original/selected, retouched로 redirect하는 코드 확인. 독립 화면으로 세지 않음 |
| `/photographer/manual` | Light shell + 공유 page frame/header | 공통 Light header·Sidebar, 네 PC 폭의 가로 넘침 E2E 통과 |
| 고객 PC | 별도 Customer Light / Dark Viewer | `customer-design.md`를 따름. 이 문서의 Navy·Orange CTA를 강제하지 않음 |

PC 폭은 `1024 / 1280 / 1440 / 1920px`, 높이 `1000px`로 설정했다(`page.setViewportSize`). 자세한 상태·한계와 미해결 문제는 [PC 검수 결과](desktop-design-audit-2026-09-09.md)를 따른다. 기존 Figma·모바일 검증 기록을 이번 브라우저 검수 결과와 합쳐 완료 범위를 넓히지 않는다.

### 0.5 PC 재사용 지도 — 실제 구현 기준

| 역할 | 우선 재사용할 구현 | 소비 화면 / 유지할 경계 |
|---|---|---|
| Light palette | `styles/PhotographerLightTheme.module.css` | 페이지 CSS module과 공통 modal. shell·Sidebar·page·portal이 같은 palette를 참조. Sidebar active tint 등 역할별 값은 소비자가 소유 |
| 운영 page frame/intro | `PhotographerLightPageFrame`, `PhotographerLightPageHeader` | Dashboard/List/Detail/Create/Edit/Settings/Upload/Manual. 중앙 840px form과 full-width composition은 구분 |
| 일반 CTA | `PhotographerLightButton` | Focus, Form, Settings, Request/Confirm 등. 일반 label은 13/18px; 업무 크기 예외는 §7.22 |
| 폼 field/control | `ProjectFormFields.tsx` | Create/Edit, Settings의 field/input/switch. 도메인 값·검증·API는 페이지 책임 |
| 고정 하단 action | `PhotographerFormActionBar` / `PhotographerPageActionBar` | 생성·수정·원본 관리·셀렉 등. 요약/버튼은 slot으로 주입 |
| 목록 filter composition | `PhotographerDenseFilterToolbar` | Project List의 search/filter 배치. Assets와 무조건 같은 조합으로 만들지 않음 |
| Asset context/tab | `ProjectAssetWorkspaceHeader`, `ProjectAssetTabs` | original/selected/retouched/final. final tab은 `hasFinalAssetTab()`이 허용하는 delivered 상태에서만 표시 |
| Asset 작업 도구 | `ProjectAssetWorkspaceToolbar`, `ProjectAssetToolbarButton`, `ProjectAssetMobileContextAction`, `ProjectAssetToolbarSummary`, `ProjectAssetToolbarViewToggle` | 네 자산 탭의 공통 bar와 control geometry; 모바일 대표 작업은 compact tonal action을 공유하고 업무 action은 소비자가 주입 |
| 이미지 목록 | `PhotographerPhotoGallery` (`OriginalPhotoGallery` alias) | Upload와 Assets original/selected. 보정본은 별도 업무 card이지만 같은 grid 상수 사용 |
| Thumbnail 경계 | `PhotoThumbnailFrame` | 작가·고객의 이미지 경계 상태만 공유. 비율/selection/metadata는 소비자가 소유 |
| ID / 진행 | `ProjectIdText`, `ProjectStepper`, `ProjectProgressCard` | 기계식 ID와 6-step 표시. 모바일 legacy 상태 표현까지 이번에 교체하지 않음 |
| Modal / confirmation | `PhotographerModal`, `PhotographerConfirmDialog` | Theme/overlay 공유. `useDialogAccessibility`로 초기 focus·trap·복귀·scroll·Escape를 공유하고 제목 id 및 pending 닫기 잠금 제공 |
| Assets 데이터 | `ProjectAssetsDataProvider`, `ProjectAssetsRoutePanels` | 프로젝트/사진 데이터와 방문한 panel을 유지. 디자인 변경을 위해 상태/API 로직을 복제하지 않음 |

### 0.6 PC 개선 반영과 남은 검증 범위

2026-09-09 검수 후 P1/P2 개선을 구현했다. 이전 문제의 재현 기록과 후속 검증은 [PC 검수 결과](desktop-design-audit-2026-09-09.md)에 함께 남긴다.

- **문의 portal:** PC Light route에 공통 palette와 버튼을 적용했다. 입력 label·오류 설명·pending 잠금·focus 복귀도 공유한다.
- **폼:** `ProjectFormField`와 `ProjectFormInput` / `ProjectFormTextarea` / `ProjectFormPhoneInput`이 label, hint/error id, required/invalid 상태를 연결한다. 선택 묶음에는 `group`과 `aria-pressed`를 사용한다.
- **Modal:** 공통 shell, 문의창, 보정본 업로드 dialog가 `useDialogAccessibility`를 사용한다. 제목 연결, 초기 focus, Tab 순환, Escape, 닫힌 메뉴의 summary로 복귀, 중첩 dialog scroll 잠금을 처리한다. Confirmation은 `pending`을 `closeDisabled`로 전달한다.
- **Palette / Button:** Light palette를 한 source로 모으고 `regular / toolbar / confirmation / work-panel` 크기를 명시했다. PC hover·focus-visible·disabled·reduced-motion은 공통 버튼 CSS가 소유한다. 미사용 `.menuTheme`는 공통 theme 참조로 남겨 두었다.
- **Dashboard Focus:** PC container query로 가용 폭이 820px 미만이면 지표를 다음 행에 배치한다. headline 생략을 없애고 날짜를 한 줄로 유지한다. 400px 이하 카드에서는 thumbnail을 축소한다. 네 PC 폭에서 가독성과 문서 가로 넘침을 확인했다.
- **Manual / Completed:** 매뉴얼에 Light shell·공통 header를 적용하고 최종본 `납품 완료`는 PC에서 Neutral token으로 표시한다.
- **검증 한계:** Settings 실제 저장/계정 삭제, 정상 생성 전송, 실제 업로드와 납품 이미지가 있는 모든 상태, Safari/Firefox와 모바일은 이번 후속 검증 대상이 아니다. 고객 palette는 별도 규칙을 유지한다.

## 1. Theme Strategy — A. Stable Light Core

A-CUT은 우선적으로 하나의 화면을 Light/Dark로 토글하는 제품이 아니라, 업무 맥락에 맞는 두 환경이 공존하는 제품을 지향한다.

| Context | 목적 | 기본 방향 |
|---|---|---|
| **Light App UI** | 운영, 관리, 상태 파악, 정보 탐색 | 밝은 neutral canvas, white card, Deep Navy text, 제한된 semantic color |
| **Dark Photo Workspace** | 사진 집중, 비교, 셀렉, 보정 확인 | 사진 대비를 우선하는 dark neutral stage |

Light 규칙을 사진 작업 화면에 강제하지 않고, Dark surface와 contrast 규칙을 운영 UI에 그대로 옮기지 않는다. Brand Orange와 actor semantic처럼 의미가 공유되는 축만 각 theme에서 적절한 contrast로 유지한다.

Golden 기준 화면은 Dashboard, Photographer Project List, Photographer Project Detail이다. 실제 Light 적용은 Create/Edit, Settings, Upload와 Asset Workspace까지 확장되어 있다(§0.4). Settings는 공유 폼·기본 PC composition을 확인했지만 저장/실패/계정 상태 전체를 검증한 Golden 화면으로 승격하지 않는다.

## 2. Light Color System — A. Stable Light Core

### 2.1 실제 route-scoped token

| Token | 실제 값 | Semantic role | Usage | Don't |
|---|---:|---|---|---|
| `--accent` | `#FF5712` | Brand Primary / Photographer Actor | Primary CTA, FAB, 작가 dot, 현재 navigation indicator, 중요한 progress | 일반 제목·메타·장식 전체를 Orange로 칠하지 않는다 |
| `--accent-foreground` | `#FFFFFF` | Primary action 위 content | Orange fill 위 텍스트와 아이콘 | Dark 문서의 black-on-orange 값을 Light CTA에 재사용하지 않는다 |
| `--foreground` | `#023852` | Primary Text / Strong Neutral | 제목, 핵심 값, 주요 문장, navigation emphasis | actor/info처럼 의미색이 필요한 자리를 무조건 Navy로 대체하지 않는다 |
| `--muted-foreground` | `rgba(2,56,82,.68)` | Secondary Text | 설명, 고객명 기본 표현, action/status 보조 텍스트 | ID·disabled처럼 더 낮은 위계까지 동일 색으로 평탄화하지 않는다 |
| `--subtle-foreground` | `rgba(2,56,82,.52)` | Muted Text | project ID, icon, passive actor | 읽어야 하는 본문이나 주요 action에 쓰지 않는다 |
| `--placeholder-foreground` | `rgba(2,56,82,.46)` | Placeholder candidate | Dashboard empty-state의 낮은 강조 문구 | 아직 Input placeholder의 Light global rule로 선언하지 않는다 |
| `--disabled-foreground` | `rgba(2,56,82,.38)` | Disabled / Lowest metadata | activity 보조 정보, quota denominator, 비활성 조작 | 현재 상태, CTA, 중요 수치에 사용하지 않는다 |
| `--background` | `#F5F8F8` | Page Background / Level 0 | page canvas, Focus Card 상단 neutral zone | 모든 card를 같은 색으로 만들어 surface 구분을 없애지 않는다 |
| `--surface` | `#FFFFFF` | Primary Surface / Level 1 | Work Card, panel, Focus Card 하단과 metric surface | semantic actor 색으로 card 전체를 채우지 않는다 |
| `--surface-raised` | `#EEF3F4` | Raised / Secondary Surface / Level 2 | secondary button, hover surface, fallback thumbnail | Primary CTA 대신 사용하지 않는다 |
| `--border` | `color-mix(#023852 16%, #FFF)`; sRGB 약 `#D7DFE3` | Standard low-contrast border | navigation divider, stronger quiet control boundary | 반복 카드마다 고대비 outline을 두르지 않는다 |
| `--border-strong` | `color-mix(#023852 28%, #FFF)`; sRGB 약 `#B8C7CF` | Strong border candidate | hover/focus 보강 후보 | 두 Golden 화면에서 광범위한 기본 border로 검증된 값으로 간주하지 않는다 |
| `--border-subtle` | `color-mix(#023852 9%, #FFF)`; sRGB 약 `#E8EDEF` | Divider / Subtle Border | panel outline, internal divider, timeline, thumbnail boundary | Card-in-Card 박스를 반복해서 만들지 않는다 |
| `--cyan`, `--customer-foreground` | `#079FA0` | Customer Actor | customer dot, customer-related icon/text accent | 일반 Info와 자동으로 동일시하거나 큰 cyan fill을 만들지 않는다 |
| `--customer-soft` | `color-mix(#9FD8C5 24%, #FFF)`; sRGB 약 `#E8F6F1` | Customer soft tint | customer timeline dot의 작은 halo | card/section 전체 배경으로 확장하지 않는다 |
| `--primary`, `--success` | `#079FA0` | 현재 구현 alias | Dashboard 내부에서 customer/info 성격의 제한된 참조 | Customer와 Success를 장기적으로 같은 semantic으로 확정하지 않는다 |
| `--danger` | `#DC2E2F` | Critical | overdue, error, destructive 후보, 100% quota | 일반 deadline, passive state, 사진 장식에 쓰지 않는다 |
| `--warning` | `#FAC005` | Warning | approaching deadline 후보 | 두 Golden 화면에 대표 warning 사례가 없으므로 일반 accent로 쓰지 않는다 |

`color-mix()`의 HEX는 sRGB 산술 해석을 돕기 위한 근삿값이다. 구현 Source of Truth는 원래 CSS 표현식이다.

### 2.2 Brand Orange 사용량

Orange는 가장 먼저 보이는 **행동색**이며 넓은 면적의 기본 surface가 아니다.

- Primary CTA: Orange fill + White content.
- Photographer actor: 작은 dot/icon 등 국소적인 semantic signal.
- Active indicator: White surface와 좌측 안쪽 3px Orange indicator를 사용하고 아이콘만 Orange로 강조한다. 라벨은 기본 전경색을 유지해 본문 제목과 경쟁하지 않는다.
- Progress: quota 80–99%에서만 Orange. 80% 미만은 Neutral, 100% 이상은 Critical.
- 한 시야에서 반복 카드마다 Orange CTA를 만들지 않는다. Work Card 자체가 action이고, 명시적 Primary는 Focus Card 또는 Dashboard FAB처럼 우선 행동에만 둔다.

### 2.3 Actor / state semantic

| 의미 | 실제 표현 | 규칙 |
|---|---|---|
| Photographer | `#FF5712` dot/icon/active indicator | 작가가 현재 행동 주체일 때만 사용 |
| Customer | `#079FA0` dot/icon/text accent, 필요 시 `#E8F6F1` small halo | 큰 fill 금지. 일반 고객명은 기본적으로 Neutral이며 Focus Card의 teal 고객명은 현재 page-specific |
| Completed / Passive | `rgba(2,56,82,.52)` | 완료는 새 행동색을 얻지 않으며 CTA를 제거한다 |
| Critical | `#DC2E2F` | 해당 단계의 기한 초과, 오류, 파괴 행동에만 사용 |
| Warning | `#FAC005` | 마감 임박 등 실제 warning 상태에만 사용. Dashboard 검증 사례는 아직 없음 |
| Info | 별도 Light semantic 미확정 | 현재 `--primary`가 Teal이지만 Customer와 일반 Info의 분리 여부는 Open Question |

색만으로 actor를 전달하지 않는다. Work Card는 dot과 `작가/고객/완료` 텍스트를 함께 사용하고 Activity는 색 dot과 완결된 사건 문장을 함께 사용한다.

## 3. Surface Hierarchy — A. Stable Light Core

| Level | Token / treatment | Golden Reference 적용 |
|---|---|---|
| Level 0 — Canvas | `--background` | 전체 page, Focus Card upper neutral zone |
| Level 1 — Primary surface | `--surface` | Work Card, Usage, Activity, Focus lower zone/metric, Project List table/rows/controls |
| Level 2 — Raised / quiet interactive | `--surface-raised` | Secondary action, card/row hover, table header, active neutral segment, image fallback |
| Boundary — Standard | `--border` 1px | navigation shell 등 구조 경계 |
| Boundary — Subtle | `--border-subtle` 1px | panel outline, divider, timeline, thumbnail 내부 경계 |

Light UI의 depth는 `background → white surface → raised surface` 순서로 만든다. Border는 구조를 설명할 때만 사용한다.

- 반복 Work Card: outer border 없이 Navy 8%의 작은 shadow로 white plane을 분리한다.
- 큰 Focus/Aside panel: low-contrast border를 허용한다.
- Focus Metric: 두 박스를 만들지 않고 하나의 white surface와 한 개의 세로 divider를 쓴다.
- Recent Activity: event별 card를 만들지 않고 spacing + timeline divider로 구분한다.
- Dense Table: outer container와 header/body 경계만 그리고 row마다 box/card를 만들지 않는다.
- border와 강한 shadow를 한 surface에 동시에 반복하지 않는다.

## 4. Typography

### 4.1 Font contract — A. Stable Light Core

- Light App UI 기본 sans는 `"Pretendard Variable", "Pretendard", -apple-system, sans-serif`다.
- `JetBrains Mono`는 project ID, D+ 값, 비교 가능한 숫자/카운터에만 허용한다.
- 한 컴포넌트의 전체 본문을 mono로 바꾸지 않는다.
- Sidebar는 legacy/Dark 경로를 위해 `Inter` loader를 보유하지만 `.rootLight`에서 Pretendard를 강제한다. Project Detail Light LNB의 computed family가 Pretendard임을 검증했으며 loader 자체 제거는 별도 migration item이다.
- 전역 `globals.css`의 `Noto Sans KR`와 Light route의 Pretendard 관계도 Photographer shell 범위에서 정리해야 한다.

### 4.2 Golden Reference type specimens

아래 `0` letter-spacing은 별도 tracking 선언 없이 기본값을 쓰는 경우다. `code-resolved` 행은 Browser computed 재검증이 필요하다.

| Role | Family | Size | Weight | Line-height | Letter-spacing | 분류 / 근거 |
|---|---|---:|---:|---:|---:|---|
| Desktop Page Title | Pretendard stack | 28px | 700 | 42px | -0.56px | B / 명시값 |
| Desktop Page Description | Pretendard stack | 14px | 400 | 25px | -0.45px | B / 명시값 |
| Mobile Page Title | Pretendard stack | 20px | 700 | 28px | 0 | C / Tailwind default, code-resolved |
| Mobile Description | Pretendard stack | 14px | 400 | 20px | 0 | C / Tailwind default, code-resolved |
| Section Title | Pretendard stack | 15px | 700 | 22.5px inherited | 0 | B / code-resolved |
| Work Card Headline | Pretendard stack | 14px | 700 | 20px | 0 | B / Tailwind `text-sm` |
| Work/Focus Metadata | Pretendard stack | 12.5px | 600 | 18.75px inherited | 0 | B / code-resolved |
| Project ID | JetBrains Mono fallback stack | 11px | 600 | 16.5px | normal | A / Dashboard·Project List computed 일치, `ProjectIdText` |
| Actor label | Pretendard stack | 11px | 600 | 16.5px inherited | 0 | B / code-resolved |
| Current action | Pretendard stack | 12px | 600 | 18px inherited | 0 | B / code-resolved |
| Work Metric primary | JetBrains Mono | 15px | 600 | 22.5px inherited | 0 | B / code-resolved |
| Work Metric secondary | JetBrains Mono | 13px | 500 | 19.5px inherited | 0 | B / code-resolved |
| Work Metric prefix/unit | Pretendard stack | 11px | 500–600 | 16.5px inherited | 0 | B / code-resolved |
| Overdue D+ | JetBrains Mono | 12px | 600 | 18px inherited | 0 | B / code-resolved |
| Focus Headline desktop | Pretendard stack | 21px | 800 | 31.5px inherited | 0 | C / component-specific, code-resolved |
| Focus Headline mobile | Pretendard stack | 15px | 800 | 22.5px inherited | 0 | C / component-specific, code-resolved |
| Focus Supporting Text | Pretendard stack | 12px | 400 | 19.5px | 0 | C / `leading-relaxed` |
| Focus Metric Label | Pretendard stack | 14px | 600 | 24px | -0.45px inherited from metric item | C / Figma-adopted component value |
| Focus Metric Value short | Pretendard stack | 36px desktop / 26px mobile | 700 | 36px / 26px | -0.45px inherited | C / adaptive component value |
| Focus Metric Unit short | Pretendard stack | 18px desktop / 13px mobile | 600 | 18px / 13px | -0.45px inherited | C / adaptive component value |
| Focus Metric Supporting | Pretendard stack | 16px | 500 | 24px | -0.45px inherited | C / component-specific |
| Button | Pretendard stack | 13px | 700 Primary / 400 Secondary | 18px | -0.28px | B / explicit action pair |
| Usage Title | Pretendard stack | 14px | 600 | 20px | -0.3px | B / explicit |
| Usage Value | Pretendard stack | 16px | 700 | 20px | -0.3px | B / explicit |
| Usage Supporting | Pretendard stack | 11px | 400–600 | 16.5px inherited | 0 | C / dense aside value |
| Activity Panel Title | Pretendard stack | 18px | 700 | 24px | 0 | B / explicit |
| Activity Timestamp | Pretendard stack | 12px | 400 | 16px | 0 | B / Tailwind `text-xs` |
| Activity Text | Pretendard stack | 13px | 400; project name 600 | 17.875px | 0 | B / `leading-snug` |
| Activity Metadata | Pretendard stack | 12px | 400 | 16px | 0 | B / Tailwind `text-xs` |
| Lifecycle Tab | Pretendard stack | 18px | 700 active / 400 inactive | 32px | -0.45px | B / Project List computed·Figma adopted |
| Lifecycle Count | Pretendard stack | 12px | 700 | 22px | -0.288px | B / Project List |
| Dense Control | Pretendard stack | 14px | 600 | 19.2–24px | -0.36~-0.45px | B / Search·Segment·Select·Date·Sort family |
| Dense Table Header | Pretendard stack | 16px | 700 | 22.4–28.8px | -0.45px | B / column label; step number만 12/17px |
| Dense Row Project Name | Pretendard stack | 18px | 600 | 24px | -0.45px | B / primary identity |
| Dense Row Customer | Pretendard stack | 16px | 500 | 28px | -0.2107px | B / secondary identity |
| Dense Row Date/Deadline Label | Pretendard stack | 14px | 400 | 14px | -0.45px | B / secondary metadata |
| Dense Row Deadline Date | Pretendard stack | 16px | 500 | 28px | -0.21px | B / operational value |
| Stepper Actor Label | Pretendard stack | 12px | 500 | 14px | -0.36px | B / current node 아래 text-only |
| Detail Key Date | Pretendard stack | 24px | 600 | 32px | -0.45px | B / Information Card |
| Detail Contact Metadata | Pretendard stack | 14px | 400 | 22px | -0.35px | B / customer phone |
| Detail Setting Value | Pretendard stack | 16px | 500 | 24px | -0.35px | B / deadline 등 operational value |
| Sidebar Logo Title | Pretendard stack | 22.8px | 800 | 36.48px | -0.912px | B / Figma `#56039` |
| Sidebar Nav | Pretendard stack | 16px | 600 | 24px | -0.35px | A / product-context refinement after Figma `#56039` |

Focus Metric은 길이에 따라 desktop `36/28/22px`, mobile `26/20/16px`로 축소되고 unit도 그에 맞춰 `18/14/11px`, `13/10/8px`가 된다. 이는 공통 type scale이 아니라 MetricPair의 overflow 방지 로직이다.

11px Project ID는 두 화면에서 공통 컴포넌트와 computed style이 일치해 Stable role로 승격한다. 12.5px, 15px, 21px, weight 800과 inherited line-height는 Dashboard에서 실제 사용되지만 아직 Stable scale이 아니다. Project Detail에서 재사용성·가독성을 추가 검증한다.

## 5. Spacing and Geometry

### 5.1 Candidate tokens — 반복 관찰값

| Candidate | 값 | 반복 사용 |
|---|---:|---|
| App desktop gutter | 32px | page horizontal padding, FAB desktop offset |
| Section gap | 24px | page top-level stack, main section stack |
| Panel gap | 16px | aside stack, Focus internal mobile gap |
| Control → result gap | 16px | Project List filter toolbar → table; 기능적으로 결합된 영역 |
| Grid / compact gap | 12px | Work Card grid, recent section, action group |
| Compact inline gap | 6–8px | actor row, title/icon, pagination |
| Card compact padding | 12–16px | Work body 12px, Usage 16px, Focus upper 16px |
| Panel padding | 20px | Recent Activity, Focus lower desktop vertical |
| Roomy horizontal padding | 24px | Focus lower desktop, expanded LNB |
| Standard large radius | 16px | Focus outer, Usage, Activity |
| Repeated card radius | 14px | Work Card only; token promotion pending |
| Inner radius | 8–12px | thumbnail 8/12px, button 8px, metric 12px |
| Hairline | 1px | low-contrast border and divider |
| Small icon | 12–16px | activity clock/link, focus signal, pagination |
| Navigation icon | 20px leaf in 44×44px box | 50px LNB row 안에서 충분한 hit area를 유지하며 visual weight 완화 |

### 5.2 Dashboard/component-specific geometry

| Item | Actual value | Classification |
|---|---|---|
| Page padding | desktop `32px 32px 64px`, top 24px | C |
| Main ↔ Aside gap | 32px | C |
| Aside | 320px, sticky top 92px, desktop only | C |
| Recent grid | `repeat(auto-fill, minmax(220px, 1fr))`, gap 12px | C |
| Recent project count | shoot-date descending, max 10 | C, information rule |
| Focus candidates | ranked max 5, one visible at a time | C, information rule |
| Focus upper zone | desktop height 162px, padding 16px, gap 20px | C |
| Focus thumbnail | desktop 195×130px, mobile 114×76px | C |
| Focus MetricPair | desktop width 30%, full height; mobile full width | C |
| Focus lower zone | desktop padding 24×20px; mobile 16px | C |
| Work thumbnail | card inset x 12px, top 10px, aspect 3:2 | B treatment / C dimensions |
| Work body | x 12px, top 12px, bottom 16px | B |
| Pagination control | 28×28px, radius-full, icon 14px | C |
| Usage progress | height 4px | B |
| Activity dot | 8px; customer halo 4px | B |
| FAB | 52×52px, desktop right/bottom 32px, icon 22px | C placement / B action treatment |
| LNB | collapsed 102.5px, expanded 266px, outer inset top 28px/x 24px/bottom 20px | B / desktop shell pattern |

### 5.3 Photographer Mobile Shell — A. Stable Light Core

모바일 운영 화면은 Desktop을 축소한 별도 시안이 아니라 같은 Light token을 읽는 공통 shell layer다.

| Item | Contract |
|---|---|
| Global brand header | content 56px + `safe-area-inset-top`, fixed, Light surface 95% + blur |
| Bottom navigation | 모바일 운영 화면에서는 사용하지 않는다 |
| Page gutter | 20px (`--mobile-page-gutter`) |
| Page intro | `PhotographerMobilePageHeader`, title 20/28px Bold, description 14/20px |
| Back action | 상세 depth에서만 44×44px hit area로 노출 |
| Breakpoint | `<768px` mobile shell, `>=768px` desktop Sidebar/Page Header |

- 전역 브랜드 헤더는 로고와 계정 진입만 소유한다. 페이지명·설명·뒤로가기는 page intro가 소유해 두 역할을 한 헤더에 섞지 않는다.
- 본문 offset은 header 높이를 직접 복제하지 않고 `.photographer-mobile-shell-main`이 공통 token과 safe-area로 계산한다. 일반 문서 화면의 하단은 16px과 기기 safe-area를 확보하되, 공통 하단 액션바가 있는 화면은 액션바가 safe-area를 직접 채우므로 shell 여백을 중복 적용하지 않는다. `data-photographer-viewport-page` 작업 화면에서는 shell 자체를 `100dvh` border-box로 고정하고 작업 화면이 header padding을 제외한 content box의 `100%`를 채운다. header가 transition되는 중에도 두 높이가 함께 변해 body 이중 스크롤이나 footer 아래 빈 canvas를 만들지 않는다.
- Project List와 Project Detail은 공통 page intro와 20px X축을 사용한다. Detail은 `dense` title 26/32px과 목록으로 돌아가는 `backHref`를 사용한다. Create/Edit도 back action을 제공한다.
- 모바일의 주 작업 공간은 Project List와 그 하위 workflow다. Dashboard와 Manual에 직접 진입하면 Project List로 이동하고, 설정은 전역 Header의 profile trigger로 접근한다.
- Project List header 우측은 PC와 같은 73px `UsageRing`을 재사용한다. 일반 사용량은 Neutral, 80% 이상은 Orange, 한도 도달은 Critical이며 필터 아래에 같은 정보를 반복하지 않는다.
- 모바일 작가 영역의 global brand header는 scroll 48px을 넘으면 56px에서 44px로 축소하고, 16px 이내로 돌아오면 확장한다. Logo mark/text/profile도 함께 한 단계 축소하며 200ms transition과 reduced-motion 예외를 제공한다. 전체화면 viewer나 modal처럼 공통 shell이 header를 숨기는 상태에는 노출하지 않는다.
- 최소 검증 viewport는 375px, 390px, 430px이며 모든 폭에서 page-wide horizontal overflow를 허용하지 않는다.
- Project Create/Edit mobile form은 제목만 page intro에 남기고 장문 description을 숨긴다. Section header는 `번호 + 제목 + * 필수`만 표시하며 field helper는 입력 의미가 label만으로 불명확한 경우가 아니면 desktop에서만 제공한다.
- 상시 설명을 숨겨도 의미가 불명확한 toggle은 라벨 옆 32px `i` trigger로 설명을 제공한다. 현재 `원본 다운로드 허용`에 적용하며 tap/focus/hover 모두 같은 tooltip을 연다.
- Mobile PIN row는 `고객 비밀번호 *`를 한 줄로 유지하고 `(PIN)`은 desktop에서만 표시한다. PIN input은 64px과 4px 자간을 확보해 4번째 숫자가 refresh action에 가려지지 않게 한다.
- Mobile form action bar는 Bottom Navigation 제거 후 별도 60px reserve를 만들지 않고 기기 bottom safe-area만 확보한다.

### 5.4 Project List/component-specific geometry

| Item | Actual value | Classification |
|---|---|---|
| Shared page frame | desktop left/right 32px, top 24px | A / Dashboard·Project List 공통 |
| Header → lifecycle/filter group | 40px | C / Project List composition |
| Lifecycle tab | width 120px, active underline 2px, count 23×23px | B |
| Dense control | height 48px, radius 8px, group gap 12px | B |
| Wide toolbar | fluid search `1fr` + filter cluster `auto`, gap 12px | B |
| Toolbar → table | 16px | B / control→result relationship |
| Table container | white, radius 12px, subtle 1px border, overflow hidden | B |
| Table header | raised neutral surface, measured height about 78px, x padding 32px | B |
| Table row | height 100px, x padding 32px, subtle 1px divider | B |
| Row thumbnail | 60×60px, radius 12px, object-cover | B geometry / C radius exception |
| Workflow node | 23×23px; connector 1px; current halo 4px | B |
| Primary/Secondary row action | 140×38px, radius 6px | B |
| Overflow utility | visual/hit area 28×28px | B |
| Project List Usage Ring | 73×73px, stroke 4px | C |

## 6. Action Hierarchy — A. Stable Light Core

| Tier | Light treatment | Use |
|---|---|---|
| Primary | Brand Orange fill, White content, bold label | 현재 맥락에서 가장 중요한 다음 행동. Focus CTA, FAB, Project Row `보정 시작` |
| Secondary | Neutral raised surface + subtle border, Navy text | 같은 영역의 보조/열람 행동. Focus `프로젝트 보기`, 완료 Row `결과보기` |
| Utility | compact neutral/icon control | pagination, sidebar toggle, row overflow |
| Tertiary | text-only, muted → foreground hover | `전체 프로젝트 보기`, Row의 비핵심 action link |
| Passive | Neutral text 또는 CTA 없음 | customer response waiting, completed Work Card |

Primary와 Secondary는 Focus Card에서 같은 13/18px geometry를 공유하며 fill과 weight로 위계를 만든다. Work Card는 카드 전체가 detail navigation action이므로 내부 CTA를 추가하지 않는다.

Project List Row의 Primary/Secondary도 서로 같은 140×38px, 12/19px geometry를 공유하며 fill/semantic으로 구분한다. Customer waiting은 button을 만들지 않는다.

`새 프로젝트`는 LNB에 두지 않는다. Dashboard에서는 52px FAB를 사용하며 다른 화면의 생성 진입점은 각 workflow 맥락에서 제공한다.

## 7. Validated Component Patterns — B

### 7.1 Shared Page Frame / Header

- **Implementation:** `PhotographerLightPageFrame`, `PhotographerLightPageHeader`.
- **Purpose:** Light 운영 페이지의 최상단 문자 시작 좌표와 title/description typography를 공통 관리한다.
- **Geometry:** desktop x 32px / top 24px. trailing slot은 Usage Ring처럼 page-specific 보조 정보를 수용한다.
- **Typography:** 28/42px title, 14/25px description.
- **Spacing:** description top 6px. header 이후 간격은 page composition이 명시한다.
- **Breadcrumb variant:** optional Breadcrumb slot과 title 앞 간격은 Header 컴포넌트가 소유한다. 상세 페이지는 breadcrumb 내용을 주입하고 `mb-5`(20px)로 identity/title block과 분리한다. Breadcrumb가 없는 Dashboard·Project List는 일반 frame 시작 좌표를 사용한다. Create/Edit/Settings의 중앙 840px composition과 상세의 breadcrumb 이후 title 좌표를 같은 절대 X/Y로 간주하지 않는다.
- **Dashboard:** 인사 headline + 고정 description, 별도 `대시보드` title 없음.
- **Project List:** `프로젝트` title + operational description + optional quota ring.
- **Responsive:** Desktop은 공용 Page Frame/Header를 사용한다. Mobile은 `PhotographerMobilePageHeader`와 20px gutter를 사용하며 fixed chrome offset은 `--mobile-header-height`와 safe-area로 shell에서 계산한다.

### 7.2 Section Header

- 15px bold title, optional count/pagination 또는 right-aligned tertiary link.
- Header와 content 간격은 12px.
- count가 pagination에 이미 있으면 title 옆 badge로 중복하지 않는다.

### 7.3 Focus Card

- **Purpose:** 가장 먼저 대응해야 하는 프로젝트 하나와 다음 행동을 강조한다.
- **Structure:** upper neutral zone = thumbnail + operational content + MetricPair; lower white zone = follow-up + Secondary/Primary.
- **Surface:** outer 16px radius + subtle border. upper는 page background, lower와 metrics는 white. 내부 box를 반복하지 않는다.
- **Semantic:** headline 전체가 아니라 16px icon만 danger/orange/teal로 강조한다. Critical metric만 Red.
- **Interaction:** 두 action 모두 project detail로 이동하는 현재 구현. Action contract의 세분화는 추후 확인.
- **Responsive:** desktop horizontal, mobile vertical; thumbnail과 metric 크기 전환.
- Focus의 ranking, copy, 2-metric 고정 구성은 Dashboard-specific이다.

### 7.4 Metric

- Label → Value(+optional Unit) → Supporting 순서.
- 숫자/기호가 먼저, 한글 unit은 절반 크기와 한 단계 낮은 weight.
- Work Card의 `selected/original`은 `10/171장`처럼 공백 없이 쓰고, 주 값·분모·단위의 색/크기로 강약을 만든다.
- `보정20장`은 `보정` prefix와 `장` unit을 약하게, `20`을 강하게 표시한다.
- 값의 의미를 색 하나로 구분하지 않는다. Critical일 때만 Red를 허용한다.

### 7.5 Work Card

- **Purpose:** 최근 프로젝트를 actor 구분 없이 촬영일 최신순으로 빠르게 탐색한다.
- **Structure:** inset thumbnail → project identity → bottom-aligned actor/current action + optional metric 또는 overdue.
- **Surface:** white, radius 14px, no outer border, quiet Navy shadow. hover는 raised surface + slightly larger shadow.
- **Interaction:** 전체 카드 click/Enter/Space navigation, focus ring 제공.
- **Semantic:** actor는 6px dot + text. completed는 neutral and no action. D+는 현재 customer stage deadline이 초과됐고 metric 자리가 비어 있을 때만 표시한다.
- **Responsive:** grid container의 auto-fill에 따라 카드 폭이 유동적이며 최소 220px.

### 7.6 Deadline / Badge

- 현재 Work Card에는 image overlay status badge를 두지 않는다.
- Deadline은 card lower-right의 배경 없는 compact `D+N` text다.
- D+는 촬영일·생성일 경과가 아니라 **현재 customer stage의 실제 deadline 초과**만 뜻한다.
- Photographer 또는 completed state에는 D+를 표시하지 않는다.
- 일반 Status Badge의 Light global geometry/color mapping은 두 desktop Golden 화면만으로 검증되지 않았다.

### 7.7 Progress / Usage

- Structure: title/current-max → 4px progress → plan/remaining.
- 80% 미만 Neutral, 80–99% Orange, 100% 이상 Critical Red.
- white surface, subtle border, 16px radius, 16px horizontal/14px vertical padding.
- quota 경고 상태의 문구·접근성은 다른 화면에서 재검증한다.

### 7.8 Recent Activity

- 최신 이벤트 최대 6건의 flat timeline.
- 한 event는 timestamp → project/action sentence → customer/project ID로 자기완결적이다.
- actor dot과 vertical hairline을 쓰며 event별 card는 만들지 않는다.
- project name만 semibold, action phrase는 regular로 문장 내부 강약을 만든다.
- hover는 opacity 변화만 사용하고 새 border/surface box를 만들지 않는다.

### 7.9 Thumbnail

- Layout이 먼저 3:2 container를 결정한다.
- image는 `width/height: 100%`, `object-fit: cover`, `object-position: center`.
- 원본 ratio가 layout을 변경하지 않는다.
- Work Card는 `loading="lazy"`, `decoding="async"`로 grid loading을 완화한다.
- photo 위에는 Navy 4% overlay만 두며 현재 상태 tag를 겹치지 않는다.
- image가 없으면 raised→background neutral gradient fallback을 사용한다.
- Focus thumbnail도 동일한 3:2 crop을 사용하지만 lazy/async는 현재 지정하지 않는다.

### 7.10 Navigation / LNB

- **Implementation:** `Sidebar`와 `PhotographerDesktopShell`이 펼침/접힘 상태와 content offset을 같은 width 상수에서 관리한다. 페이지가 별도 margin 값을 갖지 않는다.
- 사용자가 toggle로 선택한 펼침/접힘 상태는 Photographer shell 내부 route 이동에서 유지한다. 목적지 페이지 종류가 navigation preference를 다시 덮어쓰지 않는다. 최초 직접 진입 시에만 Project Detail은 collapsed를 기본값으로 사용한다.
- **Geometry:** fixed left shell은 102.5px collapsed / 266px expanded, top 28px / expanded x 24px / bottom 20px inset을 사용한다. logo mark 31.2px, nav row 50px, row gap 6px, radius 10px, icon box 44×44px이다.
- Dashboard, Project List, Project Create, Project Detail은 `isPhotographerLightRoute()`와 Sidebar의 단일 `rootLight` token scope를 공유한다. 페이지 콘텐츠만 Light이고 LNB가 Dark로 남는 혼합 상태를 허용하지 않는다.
- nav item은 본문 title과 경쟁하지 않도록 Pretendard 15/22px Semibold, tracking -0.35px, icon 20px을 사용한다. 펼침/접힘 모두 같은 50px row geometry를 사용하고 label만 progressive disclosure한다.
- active는 기본 전경 라벨 + White surface + 좌측 안쪽 3px Orange indicator이며 아이콘만 Orange다. hover는 white surface를 사용한다.
- LNB는 navigation과 account context에 집중하며 `새 프로젝트` action을 포함하지 않는다. 사용량은 expanded에서만 borderless inline progress로 보이고 profile은 40px radius 12 avatar와 실제 이름/plan을 사용한다.
- profile popover는 실제 LNB 안에서 본문을 침범하지 않도록 expanded navigation content와 같은 218px width, radius 12px, padding 8px을 사용한다. Figma `#56039`의 302px floating example보다 제품 shell의 공간 관계를 우선한 Intentional Product Override다.
- popover menu row는 40px/14px Medium, icon 18px이다. Surface는 White, divider는 low-contrast Neutral이며 `로그아웃`만 공용 Critical Red를 사용한다. 설정·문의하기·로그아웃 기능과 실제 email은 유지한다.
- 하단 footer는 별도 구획 surface나 top divider를 만들지 않는다. inline 사용량과 56px profile trigger를 14px gap으로 배치하고 hover/focus surface는 profile trigger의 12px radius 안에서만 나타난다.
- `준비중`은 10.5/16px Semibold muted text이며 fill/border badge를 만들지 않는다. disabled navigation의 낮은 contrast와 작은 보조 문구만으로 비활성 상태를 전달한다.
- collapse control은 visual 25.92px을 유지하되 실제 button hit area는 40×40px이다. hover/focus ring도 visual shell 안에서 표현한다.
- 새 프로젝트 action은 모든 LNB 상태에서 제외해 페이지별 Primary CTA와 경쟁하지 않는다.
- Figma의 `Home/Project`, `New Project`, placeholder icon, `Basic`은 실제 한국어 navigation/data로 대체한다. 구조·geometry·semantic treatment와 compact `준비중` text는 Stable pattern으로 관리한다.

### 7.11 Project Identity / Project ID

- Project Name은 화면의 primary identity, customer name은 secondary identity, Project ID는 tertiary machine-readable identifier다.
- Project ID는 `ProjectIdText` 하나로 관리한다. Dashboard Focus/Work/Activity와 Project List Desktop/Mobile이 공유한다.
- Typography는 `JetBrains Mono / 11px / 600 / 16.5px / normal / subtle foreground`로 고정한다.
- `displayId`가 없을 때 fallback은 UUID 앞 8자를 대문자로 통일한다. 화면마다 8/12자리 또는 대소문자를 다르게 만들지 않는다.
- Project Detail에서는 Breadcrumb의 `#Project ID`가 현재 위치와 식별 역할을 함께 담당한다. 같은 Header 안에 별도 ID badge를 반복하지 않고 Project Name을 바로 primary title로 시작한다.

### 7.12 Lifecycle Tabs

- 전체 / 진행중 / 완료는 workflow 단계가 아니라 lifecycle 축이다.
- 각 tab은 120px 고정폭, active underline 2px, count 23px 원을 사용한다.
- Active는 18/32px Bold + foreground, Inactive는 Regular + muted다.
- Orange는 active underline에만 사용한다. inactive count와 tab surface를 colorful하게 만들지 않는다.

### 7.13 Dense Filter Toolbar

- `PhotographerDenseFilterToolbar`가 Search와 filter cluster의 responsive relationship을 관리한다.
- 모든 control은 height 48px, radius 8px, control gap 12px family로 보인다.
- Wide desktop은 `fluid search 1fr + filter cluster auto`를 12px로 연결한다. 임의의 search max-width로 중앙 공백을 만들지 않는다.
- 좁은 desktop에서는 search와 filter cluster가 두 행으로 분리된다.
- Search / Actor segment / Stage / Shoot Date / Sort는 Neutral surface·subtle border를 사용한다.
- Filter toolbar와 result table은 같은 작업 그룹이므로 16px만 띄운다. 일반 section gap 24px을 적용하지 않는다.

### 7.14 Dense Table / Project Row

- Table은 white Level-1 surface 하나이며 header만 raised neutral Level-2다.
- Header와 body는 동일한 grid track을 공유한다. `프로젝트` header는 thumbnail + identity 두 track을 span한다.
- Row는 height 100px, x padding 32px, low-contrast divider만 사용한다. row별 card/border/radius를 만들지 않는다.
- Row hover는 `surface-raised` 60%와 150ms transition을 사용한다. keyboard `focus-visible`에서만 1px inset Orange 50% ring을 표시한다.
- Thumbnail은 60×60px 고정 container + object-cover다. 원본 비율이 row 높이를 바꾸지 않는다.
- Completed Row를 전체 opacity로 흐리게 만들지 않는다. action/step semantic을 Neutral로 낮춰 위계를 만든다.

### 7.15 Six-step Workflow Stepper

- 단계는 `01 원본 → 02 셀렉 → 03 보정 → 04 1차 수정 → 05 2차 수정 → 06 납품`이다.
- Header label과 Row node는 동일한 11-track grid를 공유한다. node 23px, connector 1px.
- Done은 opaque Navy-derived fill + check, Current는 Actor Orange/Teal + 4px soft halo, Future는 empty neutral circle다.
- Connector는 node 아래를 지나가지만 모든 filled node는 opaque여야 한다. 선이 node 내부로 비치면 안 된다.
- `maxRevisionCount`상 도달 불가능한 수정 단계는 점선 원을 쓰지 않고 quiet neutral fill + 짧은 `—`로 표시한다.
- Current node 아래 Actor는 `작가/고객` text만 둔다. node color를 작은 dot으로 다시 반복하지 않는다.
- Actor/state mapping은 `getProjectActor`, `getSixStepPosition`, `getDisabledSteps`에서 파생하며 화면에서 재해석하지 않는다.
- Project Detail Expanded variant도 current item 전체에 Orange/Teal border·fill을 두지 않는다. semantic color는 current node와 단계 text에만 사용해 우측 작업 CTA와 경쟁하지 않게 한다.
- Project Detail Expanded variant는 outer padding 16×12px, item min-height 68px, node 32px, title 15/20px, description 12/20px을 사용한다. Desktop 6열 전체 높이는 105px 이하로 유지해 본문보다 강한 상태 배너가 되지 않게 한다.

### 7.15.1 Project Detail Work Panel

- 우측 Work Panel은 다음 행동을 안내하는 보조 영역이며, 페이지 본문이나 Expanded Stepper보다 큰 상태 배너처럼 보이지 않아야 한다.
- outer padding 24px, eyebrow 14/20px, title 24/32px, description 14/22px을 사용한다. Desktop panel 높이는 430px 이하를 기준으로 한다.
- meta는 별도의 bordered card를 중첩하지 않고 `surface-raised` 위에 subtle divider만 사용한다. label 13/20px, value 14/20px이다.
- Photographer Primary CTA만 Orange filled를 사용한다. Customer/Completed action은 Neutral Secondary를 유지하며 actor semantic은 icon·eyebrow·작은 badge에만 사용한다.
- CTA는 48px 높이와 14/20px Bold를 사용한다. 카드 테두리는 항상 Neutral이며 semantic border로 CTA와 경쟁하지 않는다.

### 7.15.2 Project Detail Information Card

- Project Information은 하나의 white Level-1 container 안에서 divider와 spacing으로 `기본 정보 → 고객 갤러리 설정 → 고객 링크`를 구분한다. 하위 정보마다 독립 raised card를 반복하지 않는다.
- container header는 x 24px/y 16px, title 18/24px이다. section body는 24px, section title은 15/20px이고 numbered marker는 20px을 유지한다.
- 촬영 일자처럼 독립적으로 읽어야 하는 핵심 정보만 border 없는 `surface-raised` block을 사용한다. 고객 identity와 보조 metadata는 white surface 위에서 typography와 divider로 구분한다.
- 갤러리 설정 값은 네 개의 개별 card가 아니라 하나의 `surface-raised` summary strip으로 묶는다. item min-height 56px, label 12/20px Medium, value 14/20px Semibold이며 item 사이는 subtle divider만 사용한다.
- summary strip은 desktop 4열, medium 2열, mobile 1열로 재배치되며 각 값의 의미와 순서는 바꾸지 않는다.

### 7.15.3 Customer Link Tool

- 고객 링크는 Project Information Card 안의 마지막 section이며 별도 full-width tinted footer card를 만들지 않는다. white surface와 top divider로 앞선 설정 영역에 연결한다.
- Read-only URL/PIN control은 동일한 44px 높이, radius 8px, `surface-raised`, subtle border를 사용한다. trailing utility hit area는 44px이며 field 의미는 label과 info tip으로 제공한다.
- URL 단독 복사와 PIN reveal은 control 내부 utility action이다. 링크+PIN 묶음 복사는 공용 `PhotographerLightButton` Secondary variant를 사용한다.
- 아직 동작하지 않는 알림톡은 dark/Primary fill을 사용하지 않는다. Secondary Neutral + disabled opacity로 표시해 실제 가능한 행동과 명확히 구분한다.
- control과 action은 12px gap을 기본으로 하고 좁은 화면에서는 줄바꿈한다. 데이터, 활성화 조건, 복사 동작은 presentation pattern이 재해석하지 않는다.

### 7.15.4 Project Detail Content Grid

- Detail 본문은 `Primary information + Secondary work panel`의 2열 구조이며 두 열의 상단 기준선을 맞춘다. column gap은 공용 section gap과 같은 24px이다.
- Primary column은 `minmax(0, 1fr)`로 남은 폭을 사용한다. Secondary column은 고정 470px을 사용하지 않고 `clamp(380px, 28vw, 440px)` 범위에서만 반응한다.
- 이 비율은 일반 desktop에서 설정 정보가 눌리는 문제와 wide desktop에서 작업 패널이 과도하게 커지는 문제를 함께 방지한다.
- `xl` 미만에서는 한 열로 전환하며 Primary information 다음에 Secondary work panel을 배치한다. 업무 상태나 action 우선순위는 breakpoint에 따라 바꾸지 않는다.

### 7.15.5 Project Detail Typography Scope

- Project Detail의 기본 family는 공용 Light App contract와 같은 Pretendard stack이다. loading/error/detail/edit view와 toast도 별도 Inter override를 만들지 않는다.
- Mono는 공용 Project ID와 실제 초과 기한 `D+N`에만 사용한다. 촬영일, 고객 연락처, 검토 기한은 숫자를 포함하더라도 Pretendard operational text다.
- 핵심 촬영일은 24/32px Semibold, 연락처는 14/22px Regular, 설정 기한 값은 16/24px Medium을 사용한다. browser default line-height 또는 `letter-spacing: normal`에 맡기지 않는다.
- label은 12/18px Semibold, tracking -0.25px을 사용한다. 동일 정보 카드 안에서 Tailwind alias의 암묵적인 line-height와 명시 px 값을 혼용하지 않는다.

### 7.15.6 Compact Confirmation

- **Implementation:** `PhotographerConfirmDialog`이 semantic confirmation structure를, `PhotographerModal`의 `confirmation` variant가 portal/theme/overlay/dialog shell을 담당한다. 페이지가 title/detail/action geometry를 반복 구현하지 않는다.
- **Figma geometry:** frame `#56052`, `#55798` 기준 dialog width 412px, padding 36px, radius 24px, content width 340px이다. title 24/48px Semibold, description 14/21px Regular, content/action gap 28px을 사용한다.
- detail surface는 radius 12px, padding 20px, body 14/22.4px이다. action pair는 gap 8px, 동일 폭, height 56px, radius 8px, label 16/24px을 사용한다. compact confirmation에는 별도 close glyph를 두지 않고 취소·overlay·Escape로 닫는다.
- 업로드 패널 안의 단일 보정본 삭제처럼 맥락이 이미 분명한 확인은 `PhotographerConfirmDialog compact`를 사용한다. 폭 360px, padding 20px, radius 20px, 좌측 정렬 20/28px 제목으로 축소하고 `보정본을 삭제할까요?`와 `삭제한 보정본은 복구할 수 없습니다.`만 표시한다. 파일명 반복과 별도 detail surface는 생략한다.
- 모바일 보정본 업로드 footer는 취소·업로드 action만 표시한다. `추가로 업로드할 파일을 선택해주세요.`처럼 disabled 버튼 상태와 반복되는 설명은 모바일에서 숨기고 Desktop 보조 상태 문구만 유지한다. 실제 전송 중에는 별도 진행률 영역으로 상태를 전달한다.
- 모바일 보정본 업로드의 사진별 매핑은 원본과 보정본 한 쌍을 14px radius의 단일 card로 묶는다. card 간격은 12px, 내부 padding은 12px이며 두 asset은 같은 너비의 4:3 preview로 표시한다. 반복 `원본/V1` label은 숨기고 파일명은 preview 위에 12px Medium·Muted 한 줄로 배치한다. 빈 보정본도 같은 이미지 시작선과 4:3 geometry의 파일 선택 surface를 사용한다.
- 모바일 매핑 행은 별도 `변경`·휴지통 action row를 표시하지 않는다. 업로드된 보정본 preview 우측 상단의 44px hit area 안에 24px White translucent face와 작은 Danger `X`를 배치하며, face 끝을 이미지 모서리 0~2px에 맞춘다. Solid Red surface는 사용하지 않는다. 삭제 후 같은 위치에 나타나는 `파일 선택` surface에서 새 보정본을 고르며, 새로 선택했지만 아직 전송하지 않은 파일도 같은 `X`로 매핑에서 제거한다. Desktop의 파일 변경·삭제 action은 유지한다.
- 모바일 보정본 업로드 dialog header는 56px 안에 20px title과 44px close action만 배치하고 upload illustration은 숨긴다. `대상/새 파일/매칭` summary와 `매칭 결과` heading은 Desktop에만 유지한다. 기존 보정본이 있는 모바일 file selection summary는 52px neutral bar에서 `선택 장수/전체 장수 · 용량`과 단일 `파일 다시 선택` action만 표시한다. 정상적인 부분 업로드는 border 없는 11px neutral note로 안내하고, 검증 오류만 warning surface를 사용한다. Dialog 자체의 focus outline은 노출하지 않으며 footer Primary label이 실제 업로드 장수를 전달한다.
- 모바일에서는 자동 매핑 원리 설명을 숨기고 `현재 연결 및 사진별 선택`은 `사진별 선택`으로 축약한다. 비어 있던 매핑 결과 header와 divider를 제거하고, accordion과 목록 사이는 8px만 둔다. Footer는 상하 10px과 44px action을 사용한다.
- Light route의 destructive confirmation은 generic `rose-*` utility를 직접 사용하지 않고 `--danger: #DC2E2F` token으로 해석한다.
- Compact dialog surface는 White `surface`이며 별도 header/footer divider를 만들지 않는다. danger는 error message와 최종 destructive action에만 사용한다.
- 취소는 공용 `PhotographerLightButton` Secondary를 사용한다. 프로젝트 자체 삭제는 Danger variant, 원본 관리 flow의 사진 삭제 확인(`#55798`)은 해당 workflow의 Primary Orange variant를 사용한다. 두 경우 모두 geometry와 pending contract는 동일하다.
- Light dialog dim은 Figma와 같은 black 40%를 사용하며 compact confirmation에는 backdrop blur를 추가하지 않는다. Dark route의 기존 standard modal 70% overlay는 유지해 modal 공용 컴포넌트가 theme context에 따라 contrast를 해석한다.
- **Validated usage:** Project Detail·Project List의 `프로젝트 삭제`, Original Upload의 선택/전체 사진 삭제가 같은 `PhotographerConfirmDialog`를 사용한다. 진입 위치와 action tone이 달라도 문구, 위험 안내, geometry, pending/error presentation은 하나의 pattern으로 유지한다.

### 7.15.6a Workflow Request Modal

- **Classification:** B — Original Upload의 고객 셀렉 요청 flow에서 새로 검증된 Light workflow pattern이다. destructive confirmation과 달리 실제 데이터를 확인하고 한 개의 설정값을 입력한 뒤 다음 상태로 전환한다.
- **Implementation:** 공용 `PhotographerModal`의 `workflow` variant가 portal/theme/overlay/dialog shell을 담당하고, `CustomerSelectionRequestModal`이 고객 summary, 기한 선택, 접속 정보, 전송 action을 조합한다. 페이지는 modal geometry를 반복 구현하지 않는다.
- **Figma geometry:** frame `#56053` 기준 desktop dialog width 650px, radius 20px, horizontal padding 32px, top padding 28px, bottom padding 32px이다. Light dim은 black 40%이며 blur를 추가하지 않는다. title은 24/36px Semibold, description은 14/21px Regular, main section gap은 24px이다. 제한 높이에서는 내용만 스크롤하고 header/footer는 고정한다.
- Summary는 `surface-raised`, radius 8px, horizontal padding 20px, vertical padding 16px을 사용한다. Customer identity와 두 개의 operational metric을 한 면에 압축 배치하며 desktop에서는 vertical divider, narrow viewport에서는 horizontal divider로 전환한다. Customer avatar는 이미지가 없을 때 공용 Customer soft semantic을 사용한다. 선택 정보인 연락처가 없을 때는 오류성 `미설정` 대신 `연락처 없이 링크 직접 공유`로 다음 행동을 설명한다.
- Date control은 54px height, radius 8px, 20px horizontal inset을 사용한다. quick deadline chip은 min-height 32px의 보조 입력이며 선택된 날짜와 일치할 때만 Orange tint를 사용한다. label 우측에는 `오늘부터 N일 후`를 표시해 날짜 판단 비용을 낮춘다. 날짜 계산은 오늘 기준 로컬 날짜로 처리하고, 실제 저장값과 상태 전환은 기존 API contract를 유지한다.
- Read-only access 정보는 하나의 bordered surface 안에서 desktop 2열, narrow viewport 1열로 배치한다. 긴 URL은 protocol을 생략한 host/path로 축약 표시하되 full value는 유지한다. 최초 요청 전에는 비활성 링크를 복사하지 않으며, 성공 후 열리는 공유 modal에서 실제 복사 action을 제공한다. 선택 PIN이 없을 때는 `PIN 없이 접속`으로 표현하고 실제 PIN에만 자릿수 tracking을 사용한다; mono family로 바꾸지 않는다.
- 사진 구성 잠금 안내는 Orange low-opacity tint와 warning icon만 사용하고 Critical Red를 사용하지 않는다. 경고 안에 별도 White nested card를 만들지 않고 divider 아래에 동의 control을 직접 연결한다. `현재 원본 N장으로 요청하는 것에 동의합니다` checkbox는 최초 `preparing→selecting` 전환에만 필요하며, 이미 활성화된 링크를 다시 공유할 때 반복하지 않는다.
- Footer action pair는 gap 8px, 약 1:2 width hierarchy, height 56px, radius 8px, label 16/24px이다. Secondary는 취소, Primary는 결과를 포함한 `N장 셀렉 요청하기`다. deadline과 사진 구성 확인이 모두 유효할 때만 Primary를 활성화한다. 성공 후 기존 링크 공유 modal을 열어 상태 전환과 복사 action을 분리한다.
- 모바일 workflow request modal은 같은 token과 상태 전환 contract를 유지하되 한 화면에서 판단할 정보만 남긴다. shell은 viewport 좌우 12px, 내부 16px, radius 16px이며 모든 content wrapper에 `min-width: 0`과 horizontal overflow 차단을 적용한다. 제목은 `셀렉 요청`, 고객 summary는 `고객명 / 셀렉 N장 · 원본 M장 · 다운로드 허용 여부` 두 줄로 축약한다. 마감일 quick option은 `+3/+7/+15일`만 노출하고, 요청 성공 직후 별도 공유 modal에서 다시 제공하는 링크·PIN section은 숨긴다. 모바일 date control은 브라우저별 native 문자열/indicator 렌더링 차이로 인한 우측 잘림을 막기 위해 `YYYY.MM.DD` 표시 면과 우측 Calendar icon을 직접 렌더링한다. 실제 `type=date` input은 control 전체에 투명하게 겹쳐 OS native picker와 접근성 label을 유지한다. 사진 잠금 안내는 동의 checkbox 한 문장으로 합치며, header close와 중복되는 footer 취소는 숨기고 48px full-width 요청 CTA 하나만 유지한다. Desktop의 native date input·상세 summary·5개 quick option·접속 정보·2-button footer는 그대로 유지한다.
- Modal이 pending인 동안 close glyph, overlay, Escape, submit을 잠가 중복 상태 전환을 막는다. 성공 후에만 modal을 닫고 페이지의 실제 project status와 deadline을 갱신한다.

### 7.15.6b Original Upload Empty State

- **Reference:** Figma `#56069`. 사진이 0장인 `preparing` 프로젝트에서만 사용하는 원본 업로드 초기 상태다.
- 공용 Light Page Header와 하단 `PhotographerFormActionBar`는 다른 업로드 상태와 동일하게 유지하며, 빈 상태는 그 사이의 작업 영역만 소유한다. 상태·업로드 API·파일 선택 동작을 presentation pattern이 변경하지 않는다.
- 작업 영역은 Neutral page background 위에 desktop 40px, narrow viewport 16px inset을 두고 White `surface` dropzone을 배치한다. dropzone은 2px dashed low-contrast border, radius 12px이며 raised/tinted card처럼 넓은 색면을 만들지 않는다.
- 중앙 content는 최대 340px, icon box 72×72px, 안내/CTA 간격 28px이다. Figma의 sample image placeholder는 제품의 기존 `ImagePlus` glyph로 해석하며, 72px Neutral icon box 안에서 Orange는 glyph에만 제한한다.
- Title은 desktop 24/48px Semibold, narrow viewport 20/32px Semibold다. 지원 형식과 실제 계정별 최대 장수는 14/21px Regular Muted text로 표시하며 Figma mock 숫자로 고정하지 않는다.
- `원본 업로드`는 이 작업 영역의 유일한 Primary이며 140×40px geometry를 사용한다. drag-over 피드백, 파일 dialog, HEIC 처리, quota 검증은 기존 업로드 flow를 그대로 유지한다.

### 7.15.6c Full-screen Photo Viewer

- **Reference:** Figma `#55824`(node `1:5716`). Original Upload의 grid/list thumbnail에서 사진 자체를 눌렀을 때 여는 inspection workspace다. Light App 위에 표시되지만 사진의 명암과 색을 안정적으로 비교하기 위해 viewer 내부만 의도적으로 Dark surface를 사용한다.
- **Implementation:** body portal의 `prj-lightbox-*` pattern과 공용 `PrevNextButton`의 `xl` variant를 사용한다. 파일명 영역이나 card 전체를 trigger로 확장하지 않고 실제 thumbnail media만 상세 보기 trigger로 사용한다. Escape/Arrow key, adjacent preload, 실제 `Photo` URL을 유지한다. 유사컷은 별도 review 화면이나 진입 CTA를 열지 않고 같은 viewer 안에서 filmstrip의 데이터만 전환한다.
- **Header:** height 76px, background `#161A1D`, bottom divider `#424242`, horizontal inset 20/32px이다. 좌측은 40px close hit area + 15px X + 실제 파일명, 우측은 현재/전체 counter다. 파일명은 Pretendard 16/26.4px Semibold, tracking -0.495px이며 counter는 15/26.4px tabular number를 사용한다.
- **Photo stage:** background `#111315`, desktop padding 60px 160px 68px이다. 사진은 최대 width 1035px 안에서 `object-fit: contain`으로 표시하며 crop, radius, overlay를 추가하지 않는다. 좌우 navigation은 74px circle/20px glyph, viewport edge 48px을 사용한다.
- **Filmstrip:** 항상 한 줄만 사용한다. 전체 보기에서는 각 유사컷 그룹을 대표 thumbnail 하나와 `+N` count로 축약하고, 이를 선택하거나 gallery에서 그룹 멤버를 열면 같은 filmstrip이 해당 그룹 멤버로 전환된다. `전체 사진`으로 원래 위치에 복귀한다. `selecting` 상태에서는 viewer context bar의 `대표컷 지정`으로 현재 그룹의 대표 사진을 바꾸며 현재 대표컷은 체크 상태로 표시한다. 별도의 두 번째 thumbnail row를 만들지 않는다.
- Filmstrip geometry는 height 112px, background `#1B2024`, top divider `#424242`, padding 13px 32px 23px, gap 8px이다. thumbnail은 109×75px, radius 2px이며 inactive opacity 58%, active white 2px border를 사용한다. focus-visible은 Light App의 Brand Orange token을 유지한다.
- **Keyboard:** `←/→`는 현재 filmstrip 안의 사진 이동, `G`는 유사컷 집중 보기/전체 사진 전환, `Escape`는 집중 보기에서 전체 사진 복귀 후 viewer 닫기의 단계적 동작을 사용한다. `G`는 `event.key` 문자가 아니라 `KeyboardEvent.code === "KeyG"`로 판별해 한/영 입력 상태와 무관하게 같은 물리 키로 동작한다.
- 단축키를 사진 중앙에 상시 표시하지 않는다. Desktop은 같은 browser tab session의 최초 viewer 진입에서만 우측 하단 안내를 3초간 노출하고, 이후에는 header counter 옆 `ⓘ` utility가 단축키 popover를 연다. `G`는 현재 사진의 그룹 유무와 관계없이 shortcut guide에 항상 표시하고, 집중 보기에서는 설명을 `전체 사진`으로 갱신한다. Popover가 열렸을 때 `Escape`는 viewer보다 popover를 먼저 닫는다. Mobile은 키보드 단축키 사용 맥락이 없으므로 최초 안내 toast와 `ⓘ` utility/popover를 모두 숨기고, 해당 header 공간은 사진 이력처럼 모바일에 유효한 후속 기능을 위해 비워둔다.
- **Responsive:** 768px 이하에서 header 60px, navigation 44px/edge 8px, filmstrip 82px, thumbnail 72×50px으로 축소한다. 정보 순서와 viewer navigation contract는 바꾸지 않는다.
- **Classification:** C — 사진 inspection을 위한 cross-theme workspace다. Dark surface 값과 viewer geometry를 일반 Light Modal, Card 또는 page surface 규칙으로 승격하지 않는다.

- 셀렉 grid의 virtual row는 사진 순서·코멘트 유무·코멘트 표시 밀도가 바뀔 때 다시 측정한다. 정렬 후에도 코멘트가 포함된 행만 32px compact comment 높이를 더하고 다음 행을 바로 이어 배치한다. 한 줄에서 잘린 코멘트는 hover 시 공용 tooltip으로 전체 내용을 표시한다.

### 7.15.6d Photographer Photo Gallery

- **Classification:** B — Original Upload, 결과의 원본 탭, 셀렉 탭에서 반복 검증된 Photographer용 dense photo collection pattern이다.
- **Implementation:** 가상화 `PhotographerPhotoGallery`가 grid/list media geometry, queued thumbnail loading, filename formatting, hover/focus와 상세보기 hit area를 공통 관리한다. 화면별 별도 photo card를 만들지 않고 `original | selection` variant와 metadata slot만 사용한다.
- **Shared thumbnail boundary:** 고객 셀렉 갤러리와 작가 원본 grid는 `PhotoThumbnailFrame`을 공유한다. 2·3·4·5열과 작가 grid 모두 기본 상태는 border 없이 이미지만 표시하고, 선택됨 또는 펼친 유사컷 범위에서만 Brand Orange 2px inset ring을 사용한다. 사진 비율, filename, checkbox, badge와 hover overlay는 각 화면의 정보 밀도에 맞게 별도로 유지한다.
- Desktop Grid는 최소 cell width 218px, 12px gap, image aspect ratio `218.32 / 150.7`, radius 8px을 공통으로 사용한다. 결과 화면의 Mobile 원본 탭은 비교 탐색 밀도를 위해 최소 2열과 8px gap을 사용한다. 이 예외는 화면에서 주입하는 `mobileMinCols=2`, `mobileGridGap=8`로 한정하며 공용 gallery의 Desktop geometry나 셀렉/보정 variant에는 전파하지 않는다.
- filename은 공용 formatter로 extension만 소문자로 정규화하고 basename의 원문 대소문자는 보존한다. 줄임표가 생겨도 tooltip/accessible label에는 전체 이름을 유지한다.
- 원본 variant는 filename과 유사컷 group badge를, 셀렉 variant는 2-digit sequence·filename·고객 코멘트를 metadata slot에 넣는다. 서로 다른 업무 정보 때문에 카드 shell이나 image geometry를 분기하지 않는다. 셀렉에서 코멘트가 없는 경우 반복적인 `코멘트 없음` 문구를 노출하지 않고 동일한 한 줄 높이만 유지한다. 실제 고객 코멘트는 Customer Teal semantic을 사용하며 Orange를 경고처럼 남용하지 않는다.
- List는 58px row, 52×36px thumbnail, raised-neutral header와 low-contrast divider를 공유한다. 원본은 용량/해상도, 셀렉은 순번/고객 코멘트 column을 사용하며 header와 value는 동일한 grid template으로 정렬한다.
- 상세보기는 공용 Full-screen Photo Viewer shell을 사용해 사진 stage, filmstrip, 좌우 키 이동, 닫기 동작을 통일한다. 원본의 유사컷 context와 셀렉의 고객 코멘트는 viewer extension slot으로만 추가한다.
- 셀렉 결과 상세보기의 파일명·현재 순번은 공용 viewer header에서만 표시한다. 해당 사진에 셀렉 코멘트가 있을 때만 desktop `inspector`와 모바일 `ViewerCommentPanel`을 만들고 제목을 `셀렉 코멘트`로 표시한다. 실제 코멘트는 Teal quote accent로 강조하고 긴 내용은 패널 내부에서만 스크롤한다. 모바일은 `mobileDetailLayout`을 통해 보정 상세와 같은 좌우 8px stage, 핀치 확대, 68×48px compact filmstrip을 사용한다. Desktop filmstrip은 124×84px 썸네일과 약한 divider를 사용하며 현재 사진을 수평 중앙으로 자동 이동한다.
- 업로드/삭제/유사도 분석은 `preparing` 업로드 화면만 소유한다. 결과의 원본/셀렉 탭은 같은 presentation primitive를 읽기 전용으로 사용하며 공통화가 권한이나 workflow state를 확대하지 않는다.

### 7.15.6e Customer Selection Footer

- **Implementation:** 고객 갤러리의 `SelectionConfirmFooter`에서 `mobileGallery` variant를 사용한다.
- 고객 셀렉 Mobile 고정 footer는 보기 필터와 무관한 실제 선택 수량 Y/N과 남은 장수를 표시한다. `.gl-page-wrapper .ac-confirm-footer-gallery`에 한해 높이는 `100px + safe-area-inset-bottom`, 좌우 20px이며 `24px 수량·progress → 8px gap → 48px full-width CTA`로 배치한다. 추천 포함·추가 선택·전체 선택 검토·확정 중 현재 가능한 다음 행동 하나를 표시한다. 보정본 검토 footer의 기존 80px 배치는 유지한다.
- **승인된 플로팅 안내 패턴(현재 갤러리 미사용):** 향후 사진 위에 짧은 안내가 필요한 경우 absolute 토스트로 구현한다. 첫 콘텐츠 위 12px, `z-index: 60`, 97% 흰색 배경, 중립색 10% border, 약한 그림자를 사용한다. PC는 내용 너비·최대 440px, 모바일은 좌우 20px 한 줄로 제한한다. 의미 아이콘만 20px 브랜드색으로 강조하고 우측 닫기는 44px 터치 영역을 확보한다. 토스트는 콘텐츠 좌표에 참여하지 않아 닫을 때 reflow하지 않으며 모바일 자동 종료가 필요한 경우 4초 fade-out을 사용한다. 현재 고객 갤러리의 전체 사진·작가 추천·내가 선택한 사진에는 안내 문구를 표시하지 않는다.
- 갤러리 본문은 footer 80px과 최소 끝 간격 12px을 합친 `92px + safe-area-inset-bottom`만 확보한다. 선택 제한 snackbar는 footer 위 16px인 `96px + safe-area-inset-bottom`에 표시해 CTA와 겹치지 않는다. Desktop footer 구조는 변경하지 않는다.

### 7.15.7 Project Detail Responsive Contract

- Wide desktop(≥1280px)은 Expanded Stepper 6열과 `Primary + Secondary` content grid를 사용한다. Secondary width는 380–440px 범위를 벗어나지 않는다.
- Narrow desktop/tablet(<1280px)은 content grid를 한 열로 전환해 Project Information 다음에 Work Panel을 배치한다. Header와 Light LNB의 desktop/mobile 전환 기준은 기존 shell contract를 유지한다.
- Mobile(<768px)의 Project Detail Expanded Stepper는 6단계를 연결선 위 한 줄로 표시한다. 단계명은 `원본/셀렉/보정/1차/2차/납품`으로 축약하고 현재 단계의 상세 상태는 상단 한 줄 summary로 보존한다.
- Mobile Project Detail은 `identity → stepper → current work → project information` 순서다. 상단 identity는 로고가 프로젝트 목록 이동을 담당하므로 별도 뒤로가기를 표시하지 않고 20px page inset에 제목을 정렬한다. 촬영 유형은 제목 옆 상단의 작은 rectangular tonal badge로 한 번만 표시하고 Project Information에서는 반복하지 않는다. 날짜는 다음 줄에 단독으로 표시한다. 카드 간격은 16px로 통일한다. Current Work Panel은 장문 description·actor badge·행형 meta table을 숨기고 핵심 meta의 label을 축약해 한 줄로 표시한다. Stepper는 연결선이 끊기지 않도록 단계 item에 배경 면을 사용하지 않으며, 현재 단계의 node와 label에만 actor color를 적용한다. 현재 node에는 연결선을 덮는 외곽 ring이나 시각적 border를 추가하지 않는다. 예정 단계의 text와 connector 대비는 낮춰 완료·현재·예정을 구분한다. Project Information은 제목 아래 중복 summary와 접기 기능 없이 상세 정보를 항상 표시한다. 모바일 정보 면은 `surface-raised`와 `surface`를 섞은 옅은 배경을 사용한다. 고객·촬영 장소·갤러리·수정·연락처·검토 기한 순으로 읽고, 제목 아래와 고객 링크 위의 모바일 divider는 표시하지 않는다. 더보기 trigger는 평상시 배경 면을 두지 않는다. Project Detail의 수정·삭제 action은 화면 크기와 관계없이 Information Card header의 `···` 메뉴 하나로 통합하고 `수정하기/삭제하기`를 제공한다. Desktop Page Header에는 중복 overflow action을 두지 않는다. 값이 없는 장소·연락처·검토 기한은 렌더하지 않는다. 고객 링크가 아직 비활성이면 disabled input/action 대신 업로드 후 생성된다는 한 줄 안내만 표시한다.
- Mobile Project List는 `전체 / 진행중 / 완료` lifecycle filter를 compact select로 제공하고 프로젝트명 검색창 왼쪽에 배치한다. 별도 filter icon은 상태 filter를 중복하지 않고 공용 `ProjectAssetMobileSheet` 기반 촬영일 filter를 하단에서 연다. Sheet는 공용 title·dim·닫기·초기화·완료 구조 안에 시작일과 종료일을 제공한다. 날짜 범위를 지정하지 않은 초기 상태는 전체 촬영일을 포함하며 기본 정렬은 최근 촬영일순이다.
- Mobile Asset Workspace는 탭 제목을 시각적으로 반복하지 않고 h1은 sr-only로 유지한다. `ProjectAssetWorkspaceHeader`의 identity row는 PC 전용이며 MobileHeader가 자산 첫 화면부터 프로젝트/고객 문맥과 상세로 돌아가기를 제공한다. Desktop은 40px context/breadcrumb와 우측 meta를 사용한다(§7.21).
- Asset Tabs는 Mobile과 Desktop 모두 콘텐츠 면에 연결되는 file-tab 구조를 사용한다. Mobile tab rail은 page background를 유지하고 Active tab만 바로 아래 white toolbar와 연결되는 surface와 Bold label을 사용한다. Active tab은 좌우·하단 border와 Orange marker를 사용하지 않으며 radius 6px 상단 모서리만 유지하고, inactive tab은 muted text로 물러난다. 가용 폭은 균등 분할하고 사진 수 count를 숨긴다. 44px 최소 터치 높이는 시각 밀도를 이유로 더 줄이지 않는다. Desktop은 기존 radius 8px file-tab border, count와 tab당 최소 112px을 유지한다.
- 원본 Asset Workspace는 탭과 화면 맥락만으로 읽기 전용 상태를 전달하며 별도의 `고객 공유 중` 안내 pill이나 bar를 반복하지 않는다. Mobile 탭은 44px 최소 터치 높이와 14px label을 사용하고, 아래 toolbar는 외곽 card border 없이 44px 한 줄에 배치한다. 분석 결과가 있는 유사컷 control은 고객 갤러리와 같은 `SimilarityToggleButton`을 사용해 아이콘·`유사컷` 문구·그룹 수를 표시한다. 활성 상태는 Orange border와 soft background로, 비활성 상태는 neutral outline으로 구분하며 ON/OFF 문구는 사용하지 않는다. 전환 직후 snackbar로 현재 표시 방식을 확인한다. 분석 전은 `유사컷`, 처리 중은 `분석 중`, 결과 없음은 `유사컷 없음`으로 구분한다. Mobile 보기 전환은 현재 상태가 아니라 다음 동작을 나타내는 icon 하나만 표시한다. 갤러리 상태에서는 List icon과 `목록으로 보기`, 목록 상태에서는 Grid icon과 `갤러리로 보기` label을 사용한다. 파일명 검색·정렬은 `필터` bottom sheet에 통합하고 비기본 설정 수는 Orange count badge로 표시한다. Desktop은 검색 input·정렬 select·2-item segmented control을 계속 노출한다.
- Mobile 원본 Asset grid는 PC와 동일하게 각 이미지 상단에 실제 표시 파일명을 한 줄로 노출한다. 현재 3열에서 카드 높이를 일정하게 유지하도록 12px text와 ellipsis를 사용하고, 파일명 행 높이를 virtual row 계산에 포함해 다음 행이 잘리지 않게 한다. 이 규칙은 원본 Asset grid에만 적용하며 compact upload cell이나 셀렉·보정 variant를 강제로 변경하지 않는다.
- Mobile Asset Workspace의 고객 상태 action bar는 viewport 하단에 fixed하고 `safe-area-inset-bottom`을 포함한다. 본문 flex flow에는 action bar와 같은 높이의 spacer를 두어 마지막 갤러리 행이 CTA 뒤에 가려지지 않게 한다. 납품 완료 상태에서는 모바일 action bar와 spacer를 모두 렌더링하지 않는다. Desktop에서는 기존 sticky action bar를 유지하고 모든 자산 탭에서 동일한 읽기 전용 `납품 완료` 상태를 표시한다.
- 고객 상태 action bar의 준비 중 알림톡은 모바일에서 숨기고 초대/검토 링크 복사 CTA가 한 줄 전체 폭을 사용한다. Desktop에서는 준비 중 상태를 함께 확인할 수 있도록 기존 secondary action을 유지한다.
- Mobile Asset Workspace의 셀렉·보정본·최종본 toolbar도 원본 탭과 같은 44px 단일 행을 사용한다. `…` 메뉴는 사용하지 않고 필터/정렬과 보기 전환을 각각 `ProjectAssetMobileIconButton`으로 바로 나열한다. 아이콘 버튼은 44px hit area, 18px icon, 8px radius, 동일한 neutral color·hover 상태를 공유하며 버튼 사이 추가 gap은 두지 않는다. 보정본 toolbar에서는 중복되는 `1차 보정 · N장` 요약과 `일괄 업로드/교체`를 제거하고, 업로드는 진행 수를 함께 보여주는 하단 action bar에서만 제공한다. 보정본 Mobile에서는 내보내기도 제공하지 않는다. 원본 gallery는 많은 사진을 빠르게 훑도록 모바일에서 3열·1:1 썸네일·6px 간격, 화면 좌우 12px, 카드 내부 2px을 사용한다. 파일명은 이미지 위 18px 높이의 12px Medium 한 줄 말줄임으로 표시하며 썸네일 radius는 8px을 사용한다. 셀렉·보정본·최종본 gallery는 모바일 기본 2열·6px 간격과 toolbar 이후 10px top inset을 사용한다. 셀렉 코멘트는 라벨 없는 한 줄 카드로 표시한다.
- Mobile 보정본 목록은 desktop table의 고정 column minimum을 그대로 사용하지 않는다. `원본 1fr → 보정본 1fr`의 68px mapping row로 전환하고 양쪽 44×44px thumbnail, 8px 내부 gap, 12/18px Medium 단일 filename을 사용한다. 가운데 화살표는 파일 연결만 보조하며 조작 대상이 아니다. Header는 `원본 / 보정본` 32px로 축약하고 상태·고객 코멘트는 모바일 목록에서 숨긴다. 파일명이 같아도 `원본명 유지` 같은 대체 문구를 파일명 위치에 표시하지 않고 실제 보정본 파일명을 한 줄 ellipsis로 표시한다. Desktop table column과 row 높이는 유지한다.
- 모바일 원본 업로드 화면도 원본 gallery와 같은 3열·1:1·6px 규칙을 사용한다. 사진을 450ms 길게 누르면 관리 모드로 진입해 좌측 상단 22px 주황색 사각 checkbox를 노출하며, 일반 탭은 선택 토글로 전환한다. 미선택 checkbox는 84% white surface와 약한 shadow를 사용하고 선택 상태는 카드 외곽이 아닌 이미지 내부 2px accent line으로 표현한다. checkbox는 선택 시 180ms pop, 이미지 line은 180ms fade를 사용하며 reduced-motion에서는 생략한다. 10px 이상 움직인 pointer는 long press를 취소해 세로 스크롤과 충돌하지 않게 한다. 관리 모드 상단은 고정 label `사진 선택`, accent count pill, `취소`로 구성하고 하단 공통 action bar에는 48px 높이의 full-width `선택한 사진 N장 삭제` 하나만 둔다. 선택이 0장이면 CTA를 비활성화하고 안내 toast를 표시한다. 일반 상태의 모바일 toolbar에는 별도 overflow menu 없이 익숙한 `전체삭제` action을 직접 노출한다. 사진 영역의 내부 스크롤이 16px을 넘으면 페이지 헤더를 compact 상태로 전환하고, 96px 이상 아래로 진행하면 공통 모바일 brand header를 immersive 상태로 축소한다. 위로 스크롤하면 compact, 최상단으로 돌아오면 expanded 상태를 복원한다.
- 축소 상태가 바뀐 직후 260ms 동안 발생하는 scroll-container 높이 보정 이벤트는 사용자 스크롤 방향 판정에서 제외한다. 특히 목록 끝에서 immersive 전환으로 `maxScrollTop`이 바뀌어도 이를 위쪽 스크롤로 오인하지 않아 header가 compact/immersive 사이에서 왕복하지 않는다. 최상단(`16px` 이하) 복원은 이 안정화 구간보다 우선한다.
- `data-photographer-viewport-page`가 있는 모바일 작업 route는 document scrolling과 vertical overscroll을 허용하지 않고 내부 gallery만 스크롤한다. 공통 하단 액션바는 `touch-action: pan-x`로 버튼 tap은 유지하면서 footer에서 시작하는 세로 swipe가 iOS/Chrome rubber-band로 전달되는 것을 차단한다.
- 내부 gallery의 header 방향 판정에는 raw `scrollTop`이 아니라 `0...maxScrollTop`으로 clamp한 값을 사용한다. 하단을 더 당겼다가 놓을 때 발생하는 rubber-band 반동을 위쪽 스크롤로 오인해 immersive header가 다시 나타나지 않으며, 실제로 유효 범위 안에서 위로 이동할 때만 compact 상태로 복원한다.
- 원본 업로드의 관리자 전용 Gemini/품질 분석 POC는 데스크톱 실험 도구로 한정한다. 모바일에서는 패널과 그 여백을 함께 렌더링하지 않아 사진 목록과 하단 주요 행동의 흐름을 방해하지 않는다.
- 최종본 탭은 viewport와 무관하게 납품 결과만 보여준다. Grid와 List 모두 최종 보정본 파일명과 최종 이미지만 노출하며 원본 thumbnail·원본 파일명·확정 badge·고객 코멘트·버전 비교 inspector를 반복하지 않는다. 상세 viewer도 최종 이미지와 최종 파일명 탐색에만 집중한다.
- 최종본 route의 workflow stage는 첫 paint부터 `final`로 초기화한다. effect 전환 전의 V1/V2 상태나 과거 `재보정 요청` badge를 임시로 렌더링하지 않는다.
- 모바일 최종본의 내보내기처럼 3개 이하의 짧은 utility 목록은 전체 화면 bottom sheet를 사용하지 않는다. toolbar icon 아래 최대 280px compact popover, 투명 click-away layer, 44px action row를 사용해 gallery를 계속 볼 수 있게 한다. 필터처럼 선택지가 많거나 적용 단계가 필요한 작업만 `ProjectAssetMobileSheet`를 유지한다.
- Desktop `ProjectAssetWorkspaceToolbar`는 내보내기처럼 toolbar 아래로 펼쳐지는 popover를 자르지 않도록 visible overflow를 사용한다. 모바일 header가 접힌 상태에서만 overflow를 숨겨 높이 0 영역의 action이 노출되지 않게 한다.
- 보정본 탭 재진입 시 최신 데이터는 기존 콘텐츠를 유지한 채 백그라운드에서 갱신한다. `최신 정보 확인 중` 같은 일시적인 상태 문구를 toolbar에 추가하지 않아 탭 전환 시 텍스트와 정렬이 깜빡이지 않게 한다.
- 보정본 선택 삭제 확인창은 제목, 선택 장수, 취소·삭제 action만 표시한다. 재업로드 가능 여부처럼 작업 결과에서 유추할 수 있는 부가 설명 박스는 표시하지 않는다.
- 보정본 삭제는 해당 회차의 작가 작업 중 상태(`editing`, `editing_v2`)에서만 허용한다. 고객 검토 중(`reviewing_v1`, `reviewing_v2`)에는 카드 체크박스·전체 선택·선택 삭제와 업로드 패널의 기존 파일 삭제를 숨기고 기존 선택을 즉시 해제한다. 서버 삭제 API도 같은 상태를 검증해 검토 중 요청을 `409`로 거부한다.
- Mobile Asset Workspace는 내부 갤러리를 아래로 96px 이상 스크롤한 뒤 같은 방향으로 12px 이상 이동하면 immersive browse mode로 전환한다. 이 상태에서는 공통 A-CUT header, mobile project context와 operation toolbar를 접고 현재 위치를 나타내는 file tab만 유지한다. File tab rail은 화면 상단에서 `max(8px, safe-area-inset-top)`만큼 떨어뜨리고 갤러리와 12px 간격을 둬 화면 경계와 사진에 붙어 보이지 않게 한다. 위로 12px 이상 이동하면 toolbar를 복원하고, scrollTop 16px 이하에서는 project context와 전체 header를 복원한다. Desktop에는 이 동작을 적용하지 않으며 `prefers-reduced-motion`에서는 전환 animation을 제거한다.
- 반응형 변화는 정보 순서, workflow state, action enablement를 바꾸지 않는다. 동일 DOM과 실제 데이터를 CSS layout으로만 재배치한다.
- Light route의 Mobile Header는 본문과 같은 `PhotographerLightTheme` token scope를 사용한다. 현재 모바일 Bottom Nav는 사용하지 않는다. fixed chrome이 전역 Dark token을 읽어 Light 본문과 혼합되는 상태를 허용하지 않는다.

### 7.16 Deadline / Next Action / Overflow

- Deadline column은 label 14/14px + date 16/28px 구조를 유지한다.
- Dashboard와 동일하게 일반 `D-N` badge를 반복하지 않는다. 현재 Customer stage의 실제 초과만 `D+N` Critical plain text로 표시한다.
- `D+N`은 공용 `dday()`를 사용하며 `JetBrains Mono / 12px / 600 / 18px`다.
- Primary row action은 Orange filled 140×38px. 완료 `결과보기`는 같은 geometry의 Neutral Secondary다.
- Customer waiting은 `고객 응답 대기` Neutral text만 사용한다. Stepper가 이미 Actor를 표현하므로 Teal dot을 반복하지 않는다.
- 현재 PC 목록에는 row overflow가 없다. 목록은 다음 작업 진입만 제공하며 수정·삭제는 Project Detail의 `ProjectInformationCard` 더보기 menu에서 수행한다. 상세 trigger는 `h-9 w-9`(36px)이며 glyph는 subtle foreground, hover/focus는 Neutral utility hierarchy를 따른다.

### 7.17 Shared Page Action Bar

- **Implementation:** `PhotographerFormActionBar`, 폼 외 화면에서는 의미상 alias인 `PhotographerPageActionBar`를 사용한다.
- **Purpose:** 긴 Light 생성·수정 폼과 결과 확인 workspace의 마지막 액션이 스크롤 중에도 일관되게 보이도록 surface·divider·sticky behavior를 공통 관리한다.
- **Structure:** optional leading 안내/오류 + right-aligned action group. 안내 문구와 버튼 종류는 화면이 주입하며 컴포넌트가 업무 문구를 소유하지 않는다.
- **Geometry:** 기본 `sticky bottom-0`; 내부 wrapper는 mobile `min-h-[64px] py-3`, sm 이상 `min-h-[80px] py-4`. desktop x padding 32px, mobile x padding 16px, action gap 8px. `mobileFixed`이면 mobile fixed+ResizeObserver 실측 높이 spacer, md 이상 sticky다. 프로젝트 생성과 상세 수정은 같은 840px 본문 기준선에 맞춘다.
- **Surface:** White/Light `surface` + 상단 `border-subtle`. 콘텐츠와 겹쳐 보이지 않도록 Navy 3.5%의 낮은 상향 shadow만 허용하며, raised card처럼 보이는 강한 elevation은 사용하지 않는다.
- **Responsive:** 일반 leading은 `hidden sm:block`이다. 좁은 화면에는 `mobileLeading`으로 진행/disabled 이유를 제공하고 `error`는 항상 보이는 alert slot으로 렌더한다. 640px 미만 action group은 전체 폭을 나눠 사용하며 공통 작업 버튼의 최소 높이는 48px이다. 고정 spacer는 safe-area와 안내 높이를 포함해 실측한다.
- **Action:** 실제 버튼의 Primary/Secondary hierarchy와 13/18px typography, padding, radius는 `PhotographerLightButton` 기본값이 담당한다. 생성·수정 화면에서 별도 고정 width/height나 typography override를 추가하지 않는다. 문구 길이에 따른 자연 폭만 허용하며 action bar가 버튼 색·업무 상태를 재정의하지 않는다. 셀렉 결과처럼 확인 후 상태를 전환하는 workspace는 좌측에 결과 요약과 다음 행동 안내, 우측에 유일한 Primary CTA를 배치하고 toolbar나 page header에 같은 CTA를 반복하지 않는다.
- **Validated use:** Project Create와 Project Detail의 전체 정보 수정 view가 동일 구현을 사용한다. 따라서 공통 Form Action Bar 구조와 840px 정렬은 B로 분류하되 각 페이지의 문구와 action 의미는 C다.

### 7.18 Project Form

- **Implementation:** `ProjectFormFields.tsx`의 `ProjectFormPageHeading`, `ProjectFormSection`, `ProjectFormField`, `ProjectFormInput`, `ProjectFormTextarea`, `ProjectFormPhoneInput`, 공용 input class/state helper, `ProjectShootTypeSelector`, `ProjectRevisionSelector`, `PhotographerLightSwitch`, `ProjectFormToggleRow`, `ProjectPinControl`.
- **Validated use:** Project Create와 Project Edit가 같은 840px form composition과 동일한 field 순서를 사용한다. 화면마다 같은 구조를 다시 작성하지 않는다.
- **Section:** White surface, radius 16px, raised neutral header, 26px number badge를 사용한다. Mobile은 body/header x padding 16px, body field gap 16px, header y padding 12px, title 16px으로 압축하고 Desktop은 x padding 32px, field gap 24px, header y padding 20px, title 18px을 유지한다. section gap은 20px이다.
- **Label/Input:** label은 Mobile 13px/Desktop 14px Semibold + required asterisk다. `필수`/`선택` 보조 badge를 반복하지 않는다. Input text는 iOS focus zoom 방지를 위해 양쪽 모두 16px을 유지한다. Mobile은 min-height 48px, radius 8px, padding 11×16px이고 Desktop은 radius 12px, padding 14×20px이다. populated는 Orange 30% border, focus는 Orange 50%, error는 Critical 70%다.
- 공용 form input과 field wrapper는 `min-width: 0`, input은 `max-width: 100%`와 border-box를 사용한다. 날짜 필드는 브라우저별 native date text를 직접 노출하지 않고, 고정 폭 visual value와 calendar icon 위에 투명한 native date input을 겹쳐 picker 기능만 사용한다. 모바일 브라우저의 고유 date 최소 너비나 locale text가 grid/card를 밀거나 잘리지 않아야 한다.
- **Choice controls:** 촬영 유형은 12px label+12px icon의 5-way responsive flex, 재보정은 Mobile 14px/Desktop 15px 3-way flex다. Mobile touch target은 최소 44px이며 Selected는 Orange 8% tint + Orange 50% border를 공유한다.
- **Switch/PIN:** switch는 36×20px, thumb 12px/inset 4px. PIN은 4자리 숫자 입력+random utility+switch를 하나의 row로 사용한다.
- **Accessibility:** `ProjectFormField`는 생성한 id를 label과 하위 공통 control에 연결한다. `hint`/`error`는 `aria-describedby`, 오류는 `aria-invalid`로 전달한다. 복수 선택 control은 `group`으로 묶고 각 버튼의 `aria-pressed`로 선택을 전달한다. 도메인 검증은 페이지가 소유한다.
- **Validation:** field로 환원 가능한 오류는 입력 바로 아래 12px Critical text로 표시한다. 서버 오류나 cross-field/domain 오류만 form-level error로 둔다.
- **Mode difference:** Edit는 진행 상태에 따른 셀렉 수와 원본 설정 disabled 안내를 추가하고, Create는 quota/생성 후 이동 선택을 추가한다. 이 차이 때문에 공통 presentation primitive가 업무 상태를 직접 소유하지 않는다.

### 7.19 Portal Theme Boundary

- `PhotographerModal`처럼 `document.body`에 portal되는 UI는 Light page DOM의 CSS custom property를 자동 상속하지 못한다.
- `PhotographerModal`은 Shell과 같은 `isPhotographerLightRoute()` 판별을 사용하고, Light route의 portal root에 `PhotographerLightTheme.module.css` scope를 다시 적용한다. 자체 portal에도 명시적으로 같은 scope를 적용한다. `FeedbackModal.tsx`는 PC와 Mobile Light route에서 공통 theme와 button을 사용한다.
- Dim overlay는 black alpha를 유지할 수 있지만 dialog/menu surface, border, text, action은 Light token으로 해석되어야 한다. Project Detail의 삭제 dialog는 White surface로 확인했다. 현재 상세 더보기 menu는 `ProjectInformationCard`의 inline `<details>`여서 부모 Light scope를 상속한다; body portal 사례로 간주하지 않는다.
- `useDialogAccessibility`가 초기 focus·Tab trap·Escape·복귀·중첩 scroll 잠금을 소유한다. shell은 `role="dialog"`, `aria-modal`, `aria-labelledby`, `tabIndex={-1}`를 제공한다. `data-dialog-autofocus`가 있으면 해당 control을 우선하고, 없으면 dialog 자체에 focus한다. `closeDisabled` 동안 모든 닫기 경로를 잠근다. geometry는 각 shell이 유지하며 모든 업무 modal 상태가 검증됐다는 뜻은 아니다.
- 일반 업무 modal은 `PhotographerModal variant="standard"`의 단일 responsive dialog를 사용한다. Light dim은 black 40%, surface는 white, radius는 mobile 18px/desktop 20px이며 raised header와 footer를 subtle divider로 구분한다. title 18/24px Bold, description 13/20px, body padding mobile 20px/desktop 24px을 사용한다.
- 짧은 공유·PIN·업로드 확인·안내·문의 modal은 모바일에서도 viewport inset 12px을 둔 content-sized card로 표시한다. 긴 베타 설문만 `mobilePresentation="fullscreen"`을 사용하고 desktop에서는 지정된 max-width의 card로 복귀한다.
- 고객 초대 공유는 링크와 PIN을 별도 bordered resource row로 표시하고 footer의 유일한 Primary에서 전체 정보를 복사한다. 문의하기는 유형 선택·본문·오류를 body에, 취소·보내기를 footer에 둔다. 프로젝트 한도와 확정 취소는 confirmation variant와 공용 56px action pair를 사용한다.

### 7.20 Retouch Upload Workspace

- `원본 / V1 / V2`를 같은 화면 안에서 다시 선택하는 보조 탭은 사용하지 않는다. 상단의 공용 Asset Tab이 정보 구조를 담당하고, 보정 라운드는 프로젝트 상태에 따라 자동 선택한다.
- Desktop toolbar는 `전체 N / 확정 N / 재보정 요청 N` 등 상태별 필터에 수량을 합쳐 표시하고 검토 결과 요약·회차 탭의 중복 수량은 생략한다. Mobile은 회차 선택과 필터·보기 도구를 한 줄에 배치하며 회차는 native select로 전환한다. 0건 예외 필터는 숨긴다.
- 모바일 보정 카드는 PC와 같은 정보 위계를 축약해 사용한다. 상단에는 좌측 44px 원본 참조 thumbnail과 우측 파일 정보를 두고, 하단에는 카드 폭 전체를 사용하는 보정본 preview 또는 업로드 슬롯을 표시한다. 업로드 전에는 원본 파일명 하나만 표시한다. 업로드 후에는 보정본 파일명을 주 정보, `원본 · 파일명`을 보조 정보로 표시한다. 체크·교체 action은 큰 보정본 preview에만 배치한다.
- Desktop에서 일괄 업로드는 보정 toolbar의 대표 utility다. Mobile은 상단 중복 CTA를 두지 않고, 현재 보정 단계의 업로드가 일부라도 남아 있으면 하단 action bar에 Primary `일괄 업로드`를 표시한다. 모든 대상 업로드가 완료되면 같은 위치가 검토 요청 CTA로 전환된다. 비어 있는 카드의 drop target은 개별 업로드 진입점으로 유지한다.
- Desktop retouch gallery는 218px 최소 카드 폭을 사용해 일반 노트북 폭에서 약 5열, 1800px 이상 화면에서는 최대 6열로 제한한다. 모바일은 2열을 유지한다.
- **Retouch card anatomy:** 모바일은 작은 원본 참조·파일 정보 → 큰 보정 preview → 상태 순서다. 갤러리 카드에는 코멘트를 표시하지 않아 사진 판독에 집중하고, 목록 보기와 상세보기에는 현재 회차에서 재보정 요청된 항목의 코멘트만 표시한다. PC도 작은 원본 reference와 주 보정 preview의 같은 위계를 유지한다.
- **Preview resolution:** 보정 preview는 400px 카드 thumbnail과 1500px preview를 `srcset`으로 함께 제공한다. 브라우저가 카드의 실제 폭과 기기 픽셀 비율에 맞는 소스를 골라 Retina 화면이나 넓어진 PC 카드에서 400px 이미지를 과도하게 확대하지 않는다.
- **Comments:** 갤러리 카드는 코멘트를 표시하지 않는다. 셀렉 상세는 해당 사진의 셀렉 코멘트만 표시한다. 보정 상세는 현재 작업 회차의 `reviewStatus`가 `revision_requested`일 때 해당 회차의 고객 코멘트만 `재보정 요청`으로 표시한다. 원본·이전 버전을 탐색해도 코멘트 범위를 바꾸거나 과거 코멘트를 합치지 않으며, 현재 단계에 해당하는 코멘트가 없으면 코멘트 영역을 숨긴다.
- **Version label:** 현재 Asset Tab과 workflow 상태가 version을 이미 설명하므로 모든 이미지에 `V1 보정본` / `V2 재보정본` overlay를 반복하지 않는다. 서로 다른 version이 한 영역에 섞이는 비교 문맥에서만 낮은 대비의 명시적 version label을 허용한다.
- **Review state:** 전체가 고객 검토 중인 상태는 toolbar의 global summary 한 곳에서 Customer semantic으로 먼저 표현하고 업로드 완료 수량은 뒤의 muted metadata로 둔다. 각 카드에 동일한 `검토 중` badge를 반복하지 않으며, 카드 badge는 `확정`과 `재보정 요청`처럼 사진별 결과가 갈릴 때만 사용한다.
- **Card action:** 선택 체크박스는 preview 좌측 상단, 교체 아이콘은 우측 하단에 배치한다. 교체는 28px 시각 크기와 44px 터치 영역을 분리한다. 현재 단계에서 실행할 수 없는 일괄 교체 CTA는 숨긴다. 확정 상태는 배경 없는 중립색 체크와 텍스트, 재보정 요청만 주황색으로 표시한다.
- **Filename:** 원본·보정 workflow 카드와 공용 비교 viewer는 표시 확장자만 소문자로 통일한다. 보정 갤러리 파일명은 12px medium 한 줄이며 앞부분 말줄임과 마지막 10자를 분리해 끝의 식별자·확장자를 유지한다. PC hover·키보드 focus로 전문을 확인한다. 저장·다운로드·매칭용 원본 filename은 변경하지 않는다.
- 원본/V1/V2 상세 비교는 별도 카드 전용 lightbox를 만들지 않고 공통 `CompareViewerModal`을 사용한다. 카드에서 원본 reference와 주 보정본 preview 어느 쪽을 열어도 동일한 원본↔V1↔V2 전환과 비교 동작을 제공한다.
- 업로드 안내는 “검토 요청 전에는 고객에게 공개되지 않는다”는 핵심 규칙만 한 줄로 제공한다. 별도 버전 탭을 가리키거나 버튼명을 장문으로 반복하지 않는다.
- 하단 Action Bar는 업로드 N/M장 또는 N장 준비 완료 한 문장으로 표시하고 별도 progress·남은 장수·공개 시점 설명을 반복하지 않는다. 모바일에서 업로드가 남으면 일괄 업로드, 완료되면 검토 요청을 제공한다. 재보정 교체가 남은 경우에만 교체 필요 수를 덧붙인다.
- 고객 검토 중에는 공용 상태 Action Bar의 검토 상태와 링크 복사 동작을 유지한다. 다만 재보정 검토 중 1차 보정 탭에는 해당 회차의 검토 완료 상태만 표시한다.
- **Bulk upload dialog phases:** 파일 선택 → 매칭 검토 → 실제 전송을 서로 다른 상태로 표현한다. 큰 Dropzone은 새 파일 선택 전까지만 사용하고, 파일을 고른 뒤에는 `선택 파일 수 / 용량 / 매칭 상태`를 담은 88px compact summary로 접어 매칭 결과가 dialog의 주 콘텐츠가 되게 한다.
- 기존 서버 보정본은 현재 연결 상태이지 새 업로드 파일이 아니다. 서버 보정본만으로 `매칭 완료` 성공 Dropzone을 만들지 않으며, 새 파일이 0장이면 `새로 업로드할 보정본 파일을 선택해주세요`를 footer에 명시한다.
- 매칭 완료율과 네트워크 업로드 진행률은 같은 progress bar를 재사용하지 않는다. 매칭 상태는 body summary/result에 표시하고 Orange progress rail은 실제 파일 전송이 시작된 동안에만 노출한다.
- 업로드 CTA는 `N장 업로드`처럼 이번 전송 범위를 포함한다. disabled 상태에서는 hover tooltip에만 의존하지 않고 footer status text로 비활성 이유를 항상 읽을 수 있게 한다.
- Bulk upload의 정상 파일명/AI 고신뢰 매칭 행은 neutral border를 사용하고 반복 `자동` badge를 노출하지 않는다. Orange, Customer, Warning, Critical은 사용자 확인이나 상태 차이가 있는 행에만 사용한다.
- Dialog summary는 `대상 N장 · 새 파일 N장 · N/N 매칭 완료`를 한 번만 제공하고, 접힌 파일 선택 영역은 총 파일 용량과 재선택 action만 소유한다. Footer는 이번 전송 수량과 실행 가능 여부만 설명한다.
- 행에서 선택한 로컬 파일은 `삭제` action으로 업로드 대상에서 제외한다. 기존 서버 파일을 교체하려던 로컬 파일을 삭제하면 서버 파일 상태로 돌아가며, 서버 파일 삭제는 별도 확인 Dialog를 거친다.
- 매칭 목록은 고객이 선택한 원본 사진 순서를 유지한다. 자동 매칭 결과가 바뀌어도 행 위치를 이동하지 않고 행 안의 파일, 상태, 확인 필요 표현만 갱신한다.
- 보정본 파일을 선택하기 전에는 내부 placeholder 매핑을 오류 목록처럼 노출하지 않는다. 상태는 Neutral `파일 선택 전`으로 표시하고, 필요한 사용자는 `사진별로 직접 선택` disclosure를 열어 개별 대상에 파일을 지정할 수 있다. 파일이 선택되면 disclosure와 관계없이 매칭 결과를 자동으로 펼친다.
- 첫 업로드의 Dropzone은 `보정본 파일을 선택하세요`, 기존 파일에 추가하는 흐름은 `추가할 보정본을 선택하세요`로 구분한다. 아직 선택하지 않은 정상 초기 상태에는 `확인 필요`, Critical border 같은 오류 표현을 사용하지 않는다.
- 큰 dashed Dropzone은 보정본이 한 장도 연결되지 않은 최초 업로드에서만 사용한다. 일부 보정본이 이미 연결된 추가·교체 흐름에서는 `현재 연결 수 / 남은 수`와 파일 선택 action을 담은 compact selector로 전환해 매칭 결과의 가시 영역을 확보한다. Dropzone 외곽선은 배경 SVG가 아니라 실제 CSS dashed border를 사용해 네 변이 끊기지 않게 표시한다.
- 보정본 파일 선택 시 대상 수와 선택 수가 다르더라도 부분 업로드·교체를 위해 실행을 차단하지 않고 사전 안내한다. 대상보다 많은 파일 중 매칭할 수 없는 파일, 기존 연결을 교체할 가능성, 일부만 먼저 업로드되는 결과를 구체적으로 설명한다.
- JPEG/JPG, PNG, WebP, HEIC/HEIF 외 형식, 0-byte 파일, 동일한 `파일명 + 크기 + 수정 시각`의 중복 파일은 매칭 전에 제외하고 제외 수와 이유를 한 번만 요약한다. 파일 input은 선택 직후 값을 비워 동일 파일 재선택도 change event를 발생시키며, compact selector는 로컬 선택 전체를 서버 연결 상태로 되돌리는 `선택 초기화`를 제공한다.
- Modal body scrollbar는 neutral gray를 기본/hover에 사용한다. Brand Orange는 CTA와 실제 upload progress에 남기며 scrollbar 위치 표현에 사용하지 않는다.

### 7.21 Asset Workspace Tab Transition / Loading

- `원본 / 셀렉 / 보정본 / 최종본` 상단은 `ProjectAssetWorkspaceHeader`를 사용한다. Desktop의 compact project identity와 Asset Tab의 시작 좌표·vertical spacing을 페이지별로 다시 선언하지 않는다.
- 탭별 `원본 갤러리 / 셀렉 결과 / 보정본 업로드 / 최종본 갤러리` 명칭은 활성 file tab과 중복되므로 시각적 page title로 반복하지 않고 접근성 `h1`으로만 유지한다. Desktop은 높이 40px의 한 줄 context에서 `프로젝트 > 프로젝트명` breadcrumb와 우측 `고객명 고객 · #프로젝트ID`만 표시한 뒤 12px 아래에 Asset Tab을 둔다. Mobile은 이 context row 전체를 숨기고 file tab을 바로 사용한다. 각 탭 페이지는 Header 아래의 업무 toolbar와 content만 소유한다.
- Asset Tab 바로 아래 operation/filter bar는 `ProjectAssetWorkspaceToolbar`를 사용한다. 공통 컴포넌트가 Desktop의 page inset·최소 높이 72px·Level-1 surface와 Mobile의 44px 단일 행을 소유한다. Mobile tab은 44px hit area 안에 36px face를 두어 상단 면을 가볍게 보이게 한다. Toolbar는 active tab과 동일한 white `Surface`와 12px content inset을 공유하고 gallery와 맞닿는 하단 divider 하나만 사용한다. 탭별 대표 utility 뒤에 필터/정렬과 Grid/List 전환을 44px 아이콘 버튼으로 직접 배치한다.
- Toolbar의 leading slot에는 현재 범위·수량·읽기 전용 상태·업무 필터를, actions slot에는 검색·정렬·보기 전환·업로드·내보내기를 배치한다. 원본/셀렉/보정본의 기능 차이는 유지하되 bar 자체의 geometry와 surface hierarchy는 동일해야 한다.
- Toolbar 내부의 범위 요약은 `ProjectAssetToolbarSummary`, 일반/Primary action은 `ProjectAssetToolbarButton`, Grid/List 전환은 `ProjectAssetToolbarViewToggle`을 사용한다. 원본·셀렉·보정본·최종본 모두 action height 44px, radius 8px, 14/24px Semibold label, 18px view icon과 44px square hit area를 공유한다. 탭별로 작은 별도 button/view switch를 다시 만들지 않는다.
- 요약 문구는 `16px Bold label → 15px Semibold count → divider → 13px Medium metadata` 순서를 기본으로 한다. Customer workflow 상태는 동일한 구조 안에서 Customer semantic dot/color만 추가하며, 별도의 작은 status toolbar처럼 축소하지 않는다.
- 원본과 셀렉 grid의 filename은 공통 Photo Filename role을 사용한다. `12/20px Medium`, `-0.35px`, Muted Text를 기본으로 하며 셀렉 여부나 코멘트 존재 여부만으로 Primary Text까지 대비를 올리지 않는다. List variant는 밀도에 맞춰 14px을 허용하지만 동일한 Muted Text semantic을 유지한다.
- `원본 / 셀렉 / 보정본 / 최종본`은 서로 다른 업무 화면이지만 하나의 Project Asset Workspace로 취급한다. 탭을 이동할 때 프로젝트, 전체 사진, 셀렉 ID와 사진 상태를 다시 요청하지 않고 공통 상위 layout의 data provider를 재사용한다.
- 탭 전환 중 `position: fixed; inset: 0` 형태의 full-screen loader를 사용하지 않는다. 공통 Page Header와 Asset Tab은 그대로 보이고, 해당 탭에만 필요한 추가 데이터는 content 영역의 inline loading state로 표시한다.
- 보정본 탭은 공통 사진 데이터와 별도로 version 데이터만 요청한다. 프로젝트 status 변경은 provider의 project state에도 반영해 다른 Asset Tab으로 돌아갔을 때 이전 상태가 잠시 노출되지 않게 한다.
- 비활성 탭 route는 hover와 keyboard focus에서 prefetch한다. 이미 활성화된 탭을 다시 눌러 동일 route navigation을 발생시키지 않는다.
- 최초 직접 진입에서는 structured skeleton 또는 light inline loader를 허용한다. 이후 같은 Asset Workspace 내부 전환에서는 이미 확보한 데이터와 layout을 유지하는 것이 기본 contract다.

### 7.22 Button 역할별 크기와 상태 소유권

| 역할 | 구현 기준 | geometry/type | 소비자 |
|---|---|---|---|
| 일반 운영 CTA | `PhotographerLightButton size="regular"` (기본) | 13/18px, 8px radius, px-5/py-2.5; Primary 700 / Secondary 400 | Focus/Form/Settings/Request/PC Feedback |
| Asset toolbar | `size="toolbar"` | 44px, 14/24px 600, 8px radius | `ProjectAssetToolbarButton` wrapper |
| Compact confirmation | `size="confirmation"` | 56px, 16/24px, 같은 폭의 action pair | `PhotographerConfirmDialog` |
| Detail Work Panel | `size="work-panel"` | 48px, 14/20px 700 | `ProjectWorkPanel` |

`variant="primary | secondary | outline | danger"`는 의미색을, `size`는 역할별 geometry를 소유한다. 기본 `type="button"`이며 제출 버튼은 `type="submit"`을 명시한다. `pending`은 disabled와 `aria-busy`를 함께 설정한다. PC의 Primary hover는 공통 `--accent-hover: #E94B0D`, neutral hover는 raised surface/strong border, focus-visible은 Orange 2px outline과 2px offset을 사용한다. `PhotographerLightTheme` 안의 button·link·select·비텍스트 input과 portal modal도 같은 Orange focus ring을 사용하며 브라우저 기본 blue outline은 노출하지 않는다. 프로그램 방식으로 focus하는 `tabIndex=-1` shell은 outline을 표시하지 않는다. disabled opacity는 40%이며 hover/active transform을 적용하지 않는다. reduced-motion에서는 transition과 active transform을 제거한다. 업무 wrapper는 action 선택과 배치를 소유하고 상태 CSS를 복제하지 않는다.

### 7.23 Settings Page

- 설정은 계정 식별 정보를 담은 summary와 `프로필 / 알림 / 계정` panel로 구성한다. 1280px 이상에서는 280px summary를 왼쪽에 sticky 배치하고 panel을 오른쪽에 둔다. 768–1279px에서는 summary와 panel을 같은 폭의 단일 열로 쌓아 입력 폭을 확보하며, 모바일도 같은 순서를 유지한다.
- 프로필 form은 768px 이상에서 두 열을 사용하고 소개글은 전체 열을 차지한다. 저장과 취소는 profile panel footer에만 두어 어느 설정을 저장하는지 분명하게 한다. ProfileContext에서 받은 계정 정보를 최초 편집 상태로 사용하며 기존 저장·이미지 업로드 API 계약은 변경하지 않는다.
- 프로필 이미지는 summary의 이미지 control에서 변경한다. 문의하기는 PC Sidebar 계정 menu에서 제공하며, 현재 숨김 대상인 사용 매뉴얼 링크는 설정에 반복하지 않는다.
- 각 panel은 white surface, 16px radius, subtle border를 사용하고 header는 raised tint와 40px icon tile로 구분한다. 알림 기능은 실제 제공 전까지 `준비 중` status를 명시하고 switch 조작 시 같은 상태를 안내한다.
- 로그아웃은 neutral action, 계정 삭제는 danger action으로 구분한다. 계정 삭제 확인은 공용 `PhotographerConfirmDialog`를 사용해 focus trap, pending lock, 복귀 동작을 유지한다.

## 8. Page-specific Compositions — C

### 8.1 Dashboard-specific Composition

2026-09-09 PC Focus geometry는 `FocusProjectCard.module.css`의 container query가 우선한다. thumbnail 기본 150×100px(카드 폭 400px 이하 114×76px), headline 줄 수 제한 없음, 지표는 카드 폭 820px 미만에서 전체 폭 다음 행이다. 기존 모바일 composition과 과거 Golden 측정값을 현재 PC 고정값으로 재사용하지 않는다.

```text
Desktop Page Header
└─ Main / Aside row
   ├─ Main
   │  ├─ Focus Project carousel (ranked max 5, one visible)
   │  └─ Recent Projects (shoot date desc, max 10, responsive grid)
   └─ Aside (320px sticky)
      ├─ Usage Summary
      └─ Recent Activity (max 6)

Global layer
└─ New Project FAB
```

다음은 다른 페이지의 공통 layout으로 복제하지 않는다.

- Header 아래에서 Main과 Aside가 같은 Y축에서 시작하는 Dashboard composition.
- Focus → Recent 순서와 Focus ranking/copy.
- 320px sticky aside에 Usage + Activity만 배치하는 조합.
- 최근 프로젝트 10개, 최근 활동 6개, focus 5개 제한.
- 최근 grid의 `minmax(220px, 1fr)`과 Dashboard FAB 위치.
- conditional Beta banner, Welcome modal, ProjectLimit modal은 Dashboard에서 존재하지만 Golden screenshot의 상시 패턴이 아니므로 Light component rule로 승격하지 않는다.
- 첫 프로젝트 Empty State는 공통 `FirstProjectOnboarding`을 사용하며 Dashboard와 Project List에서 동일한 hero, CTA, guide card를 표시한다. 별도 fixed overlay, 중복 logo/header, grid background, FAB를 만들지 않는다.
- Empty onboarding composition은 `max-width: 680px`의 단일 column이며 hero와 guide card 사이 간격은 `56px`이다. Desktop에서는 시각적 무게를 보정하기 위해 composition을 중심선보다 32px 위에 둔다.
- Empty hero는 `72px` neutral icon surface, `32/42px` title, `18px` description, `52px` pill Primary CTA를 사용한다. Orange는 아이콘과 Primary CTA에만 제한한다.
- Guide card는 White surface, 12px radius, low-contrast border/shadow를 사용한다. 각 row는 24px icon slot, 24px content gap, `16/24px` title과 `12/20px` description으로 구성한다.
- Project List에서 프로젝트가 0개이면 Lifecycle/Filter/Table/FAB를 숨기고 공통 Empty State CTA 하나만 제공한다. 검색 결과 0건은 별도의 `FilteredEmptyState`와 필터 초기화 행동을 유지한다.

### 8.2 Project List-specific Composition

```text
Shared Page Header (+ optional Usage Ring)
└─ Lifecycle Tabs
   └─ Dense Filter Toolbar
      └─ Dense Table
         ├─ Table Header
         ├─ Project Rows
         └─ Footer count

Global layer
└─ New Project FAB
```

다음은 Project List의 정보 구조에 종속되므로 다른 페이지에 그대로 복제하지 않는다.

- Lifecycle → Actor → Stage → Shoot Date → Sort의 정확한 filter 조합.
- 6-step workflow column과 Project List의 desktop grid 비율.
- 73px Usage Ring을 Page Header trailing에 배치하는 조합.
- footer의 `표시중 / 시스템 준비완료` 문구.
- row 전체는 project detail navigation이고 내부 action은 event propagation을 차단한다. 현재 목록에는 수정·삭제 overflow가 없으며 상세에서 관리한다.

### 8.3 Project Detail-specific Composition

```text
Shared Page Header (+ Breadcrumb + Overflow)
└─ Expanded 6-step Stepper
   └─ Responsive Content Grid
      ├─ Project Information
      │  ├─ Basic Information
      │  ├─ Gallery Summary
      │  └─ Customer Link Tool
      └─ Work Panel (+ current/next action)
```

다음은 Project Detail의 업무 흐름에 종속되므로 다른 페이지에 그대로 복제하지 않는다.

- Breadcrumb에서 현재 Project ID를 표시하고 별도 ID badge를 반복하지 않는 identity composition.
- 동일 6-step mapping을 단계 설명과 함께 확장해서 보여주는 Expanded Stepper.
- 정보 확인을 Primary column, 현재/다음 행동을 Secondary column에 배치하는 exact composition.
- Project status에 따라 Work Panel의 copy/meta/action을 전환하는 6개 Work Mode.
- Customer Link Tool의 URL/PIN/묶음 복사와 planned 알림톡 조합.

### 8.4 Original Upload List-specific Composition

- Figma `#56062/#56063/#56064`를 기반으로 실제 데이터 밀도를 재검증한 desktop dense list는 48px column header와 58px row를 사용한다.
- row horizontal inset은 32px, checkbox는 18px, thumbnail은 52×36px이다. Header는 14/24px Semibold, filename은 14/24px Medium, numeric value는 14/24px Regular와 tabular numbers를 사용한다.
- column은 `selection / filename / original file size / resolution` 순서다. 넓은 화면에서도 filename은 최대 720px로 제한하고 숫자 열을 140/180px 고정 폭으로 가까이 둔다. Table과 toolbar content는 같은 1600px working width를 공유해 ultra-wide 화면의 과도한 중앙 공백과 trailing 공백을 제어한다. 1280px 이하에서는 filename만 유동 폭으로 전환한다. 숫자 header/value는 우측 정렬한다. `photos.file_size`(thumb+preview 합계)를 원본 용량처럼 표시하지 않고 source metadata만 사용한다.
- 신규 업로드는 기존 압축/썸네일 디코딩 과정에서 얻은 `source_width/source_height`와 브라우저 `File.size`를 저장한다. 기존 행처럼 source metadata가 없는 경우 값을 추정하지 않고 muted `정보 없음`으로 표시한다.
- 목록 정렬은 파일명 정/역순, 원본 용량 큰 순, 해상도 높은 순, 최근 업로드순을 같은 select control family 안에서 제공한다. metadata가 없는 기존 행은 수치 정렬의 뒤쪽에 둔다.
- row 전체는 navigation target이 아니다. Thumbnail만 상세 보기를 열고 checkbox, filename, metadata는 각각의 의미를 유지한다.
- 선택 row는 Orange-derived low-opacity tint만 사용하며 개별 삭제 X를 노출하지 않는다. 삭제는 공통 선택 toolbar와 `PhotographerConfirmDialog`를 거친다.
- 유사컷 분석이 활성화된 대표 row에는 compact neutral badge로 group count를 표시한다. row 전체를 semantic color로 칠하지 않는다.
- 대량 사진 성능을 위해 grid/list 모두 기존 virtualizer와 queued thumbnail loader를 유지한다.
- 보기 전환의 selected state는 neutral surface + `border-strong` inset으로 표현하고, Orange는 keyboard `focus-visible` ring에만 제한한다. 브라우저 기본 blue focus outline은 사용하지 않는다.
- Upload toolbar의 Search/Analysis/Sort/View control은 44px 높이와 8px radius를 공유한다. 그룹 divider는 `border-subtle`보다 낮은 대비로 사용한다.
- list container는 white Level-1 surface, 8px top radius, subtle 1px outer border를 사용하고 header만 raised neutral surface로 구분한다. 마지막 row와 sticky action bar 사이에는 96px scroll breathing room을 둔다.

## 9. Experimental / Open Questions — E

### 9.1 Not yet validated

아래 항목은 두 Golden Reference만으로 Light Global Rule을 선언하지 않는다.

- Project Form 외의 Form, Textarea, standalone Input/Select/Date control
- destructive 외 Modal/Dialog 전체 set, toast interaction, popover
- Dark Photo Workspace 내부 Workflow Stepper variant
- pagination의 full variants
- empty/loading/error/disabled state의 전체 contract
- photo workspace와 Light shell의 전환 경계
- Project Detail 외 Light App mobile 화면의 page-wide composition

### 9.2 Audit follow-up

1. Project ID와 Project List 핵심 interaction은 computed 재검증을 마쳤다. 나머지 typography role도 route별 five-value set을 계속 채집한다. 특히 LNB inherited line-height와 fallback font를 확인한다.
2. Light LNB는 Pretendard computed 검증을 마쳤다. Dark/legacy Sidebar를 위해 남은 `Inter` loader를 제거할지는 전체 Photographer shell migration에서 결정한다.
3. `JetBrains Mono`가 ID/숫자 외 Sidebar `MENU`, logo mark에 필요한지 검토한다.
4. 11px Project ID는 Stable role로 확정했다. Project Detail은 12/14/15/16/18/24/28px 명시 scale을 사용하며 Dashboard의 12.5px/21px과 weight 800은 page-specific으로 유지한다.
5. Customer `#079FA0`와 generic Info semantic을 분리할지 결정한다. 현재 `--primary`, `--success`, `--cyan` alias가 같은 값이다.
6. Warning `#FAC005`은 Project List D-N 반복 badge에서 제외했다. 실제 임박 warning을 별도 표시할지 다음 운영 화면에서 검증한다. placeholder와 border-strong도 아직 전역 확정하지 않는다.
7. Focus Card의 customer name teal 적용은 actor semantic을 identity text까지 확장한 page-specific 실험이다. Work Card의 neutral customer name과 통일 기준이 필요하다.
8. Focus Card의 two-metric fixed structure와 adaptive font가 다른 data shape에서도 안정적인지 확인한다.
9. Work Card radius 14px을 token으로 승격할지, 기존 12/16px scale로 정렬할지 결정한다.
10. Deadline text-only `D+N`은 Dashboard와 Project List에서 공용 `dday()`와 동일 typography로 검증됐다. Project Detail에서 날짜와 함께 쓰는 variant를 추가 확인한다.
11. EmptyDashboard는 Figma `#56042` geometry와 Dashboard Light surface/button token으로 정렬했다. 좁은 viewport에서 18px 설명과 guide copy wrapping을 추가 검증한다.
12. Project List Row는 keyboard-only 1px inset Orange 50% focus-visible을 검증했다. Dashboard Card는 아직 `focus` selector를 사용하므로 공통 contract 승격 전 selector를 정렬해야 한다(D).
13. Project List Usage Ring은 header-specific 실험이다. Dashboard Usage Summary와 동일 데이터라도 서로 다른 geometry를 쓰므로 공통 Usage component로 합치지 않는다.
14. Completed Row 대표 데이터가 없는 테스트 계정에서도 시각 회귀를 안정적으로 검증할 fixture 전략이 필요하다.

## 10. Migration / Conflict Notes

기존 `docs/design-system.md`의 Dark palette와 geometry는 Light 규칙으로 자동 교체하지 않는다. 그 문서에는 현재 Light/Customer 기준의 안내 링크를 추가했다. 아래 표는 Shared Core/Dark와 초기 Light Golden References의 차이 이력이며 자동 migration 지시가 아니다; 현재 적용 범위는 §0.4를 따른다.

| Topic | 기존 `design-system.md` | Light Golden References | 판단 |
|---|---|---|---|
| Theme role | Dark product canvas 중심 | 운영/관리용 Light App route scope | Context별 문서로 병행 |
| Brand Orange | `#FF4D00` | `#FF5712` | 핵심 충돌. 향후 shared brand primitive audit 필요 |
| Primary action content | black | white | theme contrast별 semantic token 필요 |
| Primary text | `#F2F2F4` on dark | Deep Navy `#023852` | theme-specific semantic resolution |
| Customer actor | Porcelain `#9ECAD0` | Teal `#079FA0`, Mint soft tint | Dashboard·Project List actor semantic으로 반복 검증. Detail에서 최종 확인 |
| Critical | `#FF4757` | `#DC2E2F` | theme-specific contrast 후보 |
| Warning | `#F5A623` | `#FAC005` | Dashboard 실제 사례 부족 |
| Info / focus | Blue `#4F7EFF` | 별도 Blue 없음; Teal aliases 존재 | Customer와 Info를 분리하는 Light 설계 필요 |
| Surface | dark canvas/default/raised | off-white/white/very-light neutral | 이름은 공유 가능하나 값은 theme scope |
| Shadow | dark는 border 우선 | 반복 white Work Card는 quiet Navy shadow 사용 | Light-specific elevation 규칙 필요 |
| Thumbnail radius | 4px stable principle, variant provisional | Work 8px, Focus 12px | image principle은 공유, exact geometry는 component별 |
| Type minimum | 의미 텍스트 12px 이상 | Project ID와 Sidebar `준비중` helper가 11px 예외 | machine-readable/helper role의 제한적 예외로 관리 |
| Heading weight | 제품 제목 800/900 금지 | Focus headline 800 | component-specific exception, 승격 금지 |
| Type scale | 24/32 page title, 20/28 section, 16/24 card | 28/42, 15 inherited, 14/20 등 | PNG/이전 audit 값 복사 금지. 다화면 검증 후 Light scale 확정 |
| Font family | Pretendard + JetBrains Mono | Light page/LNB Pretendard + ID·D+ JetBrains Mono; Dark/legacy loader에 Inter 잔존 | Light contract 검증 완료, loader 제거는 migration item |
| Activity structure | 기존 문서에 과거 구현과의 follow-up 서술 | 현재 flat max-6 timeline 구현 | Light 문서는 현재 구현을 Source of Truth로 기록 |
| Dashboard composition | Greeting / Focus / Work + 7:3 aside의 이전 정의 | unified header, recent projects, 320px aside | 기존 Dashboard 절은 최신 구현과 다름 |
| Badge | status/attention pill 규칙 | Dashboard·Project List overdue는 text-only `D+N` | 일반 D-N 반복 badge 금지. Light Status Badge full set은 미검증 |
| Radius | 4/8/12/16/full scale | Work Card 14px 포함 | 14px promotion은 Open Question |

## 11. 다음 Golden Validation 순서

1. **완료 — Project List:** dense table, lifecycle/filter, stepper, deadline/action, Project ID와 Page Header 공통화를 Draft 0.2에 반영.
2. **완료 — Project Detail:** Page Header, Expanded Stepper, Information/Work Panel, Customer Link, destructive dialog, responsive Light shell을 Draft 0.3에 반영.
3. **완료 — Project Edit:** Project Create와 공통인 840px form, label/input/choice/switch/PIN/error/disabled 및 하단 action bar를 `ProjectFormFields.tsx`로 통합.
4. **부분 확인 — Settings:** PC 기본 composition과 shared field/input/switch/button 사용을 확인했다. label·hint 연결은 PC E2E로 확인했고, 실제 저장/실패/pending·계정 상태 검증은 남아 있다(§0.4–0.6).
5. **완료 — Photographer Modal set:** standard/workflow/confirmation shell, 공유·문의·프로젝트 한도·PIN·업로드 안내의 surface와 action hierarchy를 통일했다. 사진 custom photo viewer와 자산 filter sheet는 사진·도구 전용 pattern으로 별도 유지한다.
6. **Empty/Loading/Error states:** populated Dashboard와 같은 Light Core를 유지하는지 별도 검증.

각 화면 검증 후 A/B/C/D/E 분류를 다시 평가한다. 두 개 이상의 서로 다른 운영 화면에서 같은 역할과 값이 반복될 때에만 Stable Light Core 또는 공통 Validated Pattern 승격을 검토한다.

### 7.24 Mobile 운영 화면 — Draft 0.6

- 모바일 카드는 `getDisplayStatusLabel(status, photoCount)`, `getProjectActor`, 공통 6-step 위치와 PC의 다음 작업 판단을 사용한다. 64px 사진, 제목 최대 2줄, 작가 Orange/고객 Teal/완료 Neutral이다. 사진 수만으로 업로드 세션 완료를 추정하지 않는다.
- `PhotographerLightButton.module.css`는 Mobile 작업 버튼 최소 48px, toolbar 44px을 소유한다. `pendingLabel`은 기존 label 폭을 유지한다. Mobile switch는 44px hit area와 36×20px 시각 track을 분리한다.
- `ProjectAssetMobileSheet`와 `UploadVersionsPanel`은 `PhotographerPortal`로 body에 렌더한다. `useDialogAccessibility`가 focus, Escape, 복귀, 중첩 scroll lock과 배경 inert를 관리한다. 사진 뷰어도 같은 hook을 사용하고 Dark 사진 palette를 유지한다.
- `UploadVersionsPanel.module.css`의 Mobile inset은 12px, 최대 높이는 `100dvh - 24px`이다. header/footer는 고정하고 body가 스크롤한다. 업로드가 남아 있으면 하단 action bar의 일괄 업로드로 재진입할 수 있다.
- 모바일 보정본은 목록이 기본이다. 개별 파일 선택 즉시 업로드와 일괄 창의 명시적 업로드 확정은 기존의 서로 다른 흐름이다. 하단에 실제 업로드/교체 잔여 장수를 표시한다.
- 자산 MobileHeader는 첫 화면부터 프로젝트 문맥과 상세 복귀를 제공한다. 상세 intro는 목록 복귀를 제공한다.
- 원본 업로드는 선택 버튼 또는 long press로 관리에 진입한다. 전체 선택/해제·취소·선택 삭제를 제공한다. long press release click을 stable gallery 경계에서 차단해 재배치된 사진의 추가 선택을 방지한다.
- 기존 PC 검수 절의 모바일 제외 문장은 그 PC 검사 시점의 증거 범위다. 현재 모바일 범위와 실기기 한계는 [구현 결과](mobile-design-implementation-2026-09-09.md)를 따른다.

### 모바일 보정 화면 우선 개선 (2026-09-09)

- 자산 상단은 프로젝트명만 표시한다. 고객명은 상세에서 확인하며 뒤로가기 기능은 유지한다. 헤더와 본문이 공유하는 `--mobile-header-height`를 자산 화면에서 48px로 적용하고 탭 위 여백을 제거했다.
- 보정 업로드가 가능한 도구줄은 36px Orange tonal `일괄 업로드/교체` face와 간격 없는 44px 필터·보기 아이콘으로 구성한다. 모바일 보정본 내보내기는 제거하고 PC 내보내기는 유지한다. 업로드 잔여량이 있으면 하단 Primary action도 `일괄 업로드`로 다음 행동을 안내한다. 보정본 카드 파일명은 공통 자산 파일명과 같은 12px Medium, 20px line-height, Muted foreground를 사용해 사진보다 강조되지 않게 한다.
- 보정 목록의 원본/보정 썸네일은 64px이다. `SingleVersionUploadSlot compact`는 점선 박스 대신 최소 44px ‘파일 선택’ 버튼이며, 파일 선택 즉시 업로드 안내는 목록 위에 한 번 표시한다. PC 카드의 기존 업로드 영역은 유지한다.
- Mobile의 비활성 Primary는 `--surface-raised`, `--subtle-foreground`, `--border-subtle`로 표현한다. 활성 Primary의 Orange 의미는 유지한다.

### iPhone/WebKit 레이아웃 보완 (2026-09-09)

모바일 전체화면 자산 route의 헤더는 viewport 최상단에 fixed로 배치한다. `photographer-app`의 `--mobile-workspace-header-height`는 48px + 상단 safe-area이며, 헤더 높이와 fixed main의 top inset이 같은 변수를 사용한다. main의 bottom inset과 padding은 0이다. 자산 헤더는 스크롤 중에도 같은 높이를 유지하며 모달의 열림 상태 때문에 언마운트하지 않는다. 모달은 기존 portal에서 그 위에 표시된다. 일반 폼 route와 PC의 배치는 유지한다.

`UploadVersionsPanel`의 `data-upload-selection-summary`는 모바일에서 `44px minmax(0, 1fr)` grid다. 아이콘/설명 다음 행에 선택 버튼을 배치해, 기존 보정본이 있거나 새 파일을 선택한 상태에서 버튼의 전체 폭이 설명을 밀어내지 않도록 한다.

자산 셸의 모바일 배치는 비동기 데이터의 `data-photographer-viewport-page` 생성 시점 대신 `PhotographerDesktopShell`의 경로 판별과 `data-mobile-asset-workspace`를 기준으로 적용한다. 목록에서 진입하는 순간부터 고정 헤더와 본문 영역을 유지하며, 자산 화면군 진입 시 문서 스크롤을 초기화한다. 자산 탭 간 이동에서는 초기화를 반복하지 않는다. 헤더는 문서 스크롤과 독립적으로 viewport에 고정하고, 사진 목록 내부의 스크롤은 유지한다. 이 배치에서는 main 상단 padding 전환 애니메이션을 사용하지 않는다.

### 모바일 보정본 개선 1–9 (2026-09-09)

이 절은 앞선 64px 보정 목록 썸네일·작은 파일 선택 버튼 규격을 대체한다.

1. `OriginalPhotoGallery`의 모바일 retouched 행은 원본/보정본을 같은 너비의 정사각형으로 표시한다. `ResizeObserver`가 실제 목록 폭에서 양쪽 padding과 열 간격(`MOBILE_MAPPING_ROW_HORIZONTAL_SPACE=40`)을 빼고 두 열의 사진 크기를 계산한다. 가상화 기본 높이는 사진 크기 + 파일명/상태/여백(`MOBILE_MAPPING_ROW_METADATA_HEIGHT=64`)에 코멘트 예상 높이를 더하며, 모바일 행은 `virtualizer.measureElement`로 실제 높이를 측정한다. PC의 기존 목록 행은 유지한다.
2. 사진 아래 상태 행에 업로드 완료/미업로드 또는 기존 검토 상태 배지를 표시한다.
3. 모바일의 항상 노출되던 전체 선택 체크박스를 숨긴다. toolbar의 보정본 선택 아이콘에서 삭제용 선택 모드에 진입하고, 선택 가능한 보정본 위의 체크박스와 전체 선택/해제·취소를 제공한다. 선택 후 기존 선택 삭제 동작을 사용한다. 확정된 보정본은 선택 대상에서 제외한다.
4. 모바일 목록에서 업로드된 사진을 누르면 기존 `OriginalPhotoViewer`를 원본·해당 보정본 비교 상태로 연다. 미업로드 사진은 원본 상세로 연다. 버전 이력을 선택하면 기존 이력 비교 동작으로 돌아간다.
5. `ProjectAssetMobileToolbarActions`의 업로드 버튼은 기존 toolbar 높이 44px를 유지하고 글자 13px와 작은 좌우 여백/아이콘 간격으로 폭을 줄인다.
6. 목록형 `data-workflow-asset-content`의 모바일 gap과 `listShellRetouched` 상단 여백을 축소한다.
7. 하단 상태는 업로드 완료 수량을 굵게, 검토 요청까지 필요한 업로드/교체 수량을 보조 문장으로 나눈다.
8. `SingleVersionUploadSlot compact`를 보정 사진과 같은 크기의 점선 슬롯으로 채운다. 파일 선택 즉시 업로드, 파일 종류 검사와 업로드 잠금은 기존 동작을 재사용한다.
9. 목록 파일명은 고정된 두 줄 영역에 표시한다. 모바일 비교 사진의 캡션에는 양쪽 전체 파일명을 표시하고, 일반 상세 헤더는 긴 파일명을 줄바꿈/스크롤로 확인할 수 있게 한다.

### 모바일 업로드 버튼 여백·코멘트 노출 보완

- 모바일 `ProjectAssetMobileContextAction`은 원본의 `유사컷`처럼 toolbar 안에서 바로 전환해야 하는 대표 작업에 사용한다. 보정본 일괄 업로드는 진행 상태와 함께 하단 action bar에서 제공하므로 이 tonal action을 중복 배치하지 않는다.
- 모바일 원본/보정본 쌍 아래의 `data-mobile-retouched-comments`는 활성 회차의 보정본이 `revision_requested`이고 요청 코멘트가 있을 때만 표시한다. 라벨은 `재보정 요청`으로 고정하며 셀렉 코멘트, 다른 회차의 코멘트, 빈 상태 문구는 이 영역에 표시하지 않는다.
- 공용 `PhotoCardComment`에 `label`과 `truncate` 옵션을 추가했다. 기존 호출은 고객 코멘트/두 줄 제한을 유지하고, 모바일 보정 목록만 전체 텍스트와 줄바꿈을 표시한다. 가상화 행의 고정 height를 제거하고 실제 높이를 측정하므로 긴 코멘트가 다음 사진과 겹치지 않는다.

### 모바일 사진 쌍의 연결 표시

코멘트 바로 위의 원본/업로드 완료/미업로드 상태 행을 제거했다. 두 이미지 사이에는 `ChevronRight` 16px를 이미지 높이의 중앙에 표시한다(`mobileMappingArrow`). 장식 아이콘이므로 스크린 리더와 터치를 방해하지 않는다. 파일명과 코멘트 영역, 하단 전체 업로드 진행 표시는 유지한다. 이 규칙은 앞선 모바일 상태 행 규격을 대체한다.

### 모바일 보정 화면 여백 개선 1·2·6·8·9

1. 모바일 파일명은 고정 두 줄 높이 대신 실제 내용 높이(최대 두 줄)를 사용한다. 원본/보정본 중 긴 파일명에 맞춰 해당 사진 쌍의 높이를 정하고 8px 간격 뒤에 코멘트를 배치한다.
2. 공용 `PhotographerFormActionBar.compactMobile` 옵션을 보정 화면에서 사용한다. 모바일 내부 상하 padding과 안내/버튼 gap은 8px이며 버튼 크기와 하단 safe-area는 유지한다. 다른 화면의 기본 간격은 유지한다.
6. 모바일 보정 목록의 원본/보정본 제목 행은 28px이며 내부 좌우 padding은 사진 행과 같은 12px다.
8. 보정 도구줄과 목록 바깥쪽 좌우 여백은 16px로 맞춘다.
9. 목록 위의 상시 ‘개별 파일은 선택 즉시 업로드됩니다’ 안내를 제거하고, 선택 가능한 미업로드 슬롯 안에 ‘선택 즉시 업로드’를 표시한다.

### 모바일 프로젝트명 왼쪽 정렬

`MobileHeader`의 자산 경로는 좌우 padding 8px(`px-2`), 요소 간격 4px(`gap-1`)을 사용한다. 뒤로가기 44px 터치 영역을 유지하면서 프로젝트명 시작점을 기존 76px에서 56px로 왼쪽 이동한다. 일반 헤더의 간격은 유지한다.

### 모바일 상세 뷰어 접근성 개선 1·3·5·8·9

- `OriginalPhotoViewer.mobileView`로 사진 위에 원본/보정본/비교 전환을 제공한다. 활성 모드는 aria-pressed로 표시하고 각 버튼의 터치 높이는 44px다.
- 보정 상세의 모바일 버전 이력은 상시 inspector 대신 하단 ‘버전 이력’ 버튼에서 별도 시트로 연다. 기존 `PhotoVersionHistory`를 재사용하며 버전 선택 시 시트를 닫는다. 시트는 공용 `useDialogAccessibility`로 배경 격리·포커스 복귀·Escape를 처리한다. PC inspector 배치는 유지한다.
- 모바일 비교 사진 캡션은 이미지 위에 겹치지 않는 별도 줄에 원본/보정본 이름과 전체 파일명을 표시한다.
- 하단에 코멘트 개수와 한 줄 미리보기를 노출한다. 코멘트 시트는 셀렉 요청과 현재 보정 버전 코멘트를 구분해 전체 표시한다.
- 모바일에서 사진 이동 시 선택한 보기 모드를 유지한다. 보정본이 없으면 원본과 안내 문구를 표시하고 비교 모드는 유지해, 보정본이 있는 사진으로 돌아오면 비교가 복원된다. 원본/보정본/비교 버튼은 현재 회차를 선택하며 과거 버전 선택은 이력 시트에서 한다.


### 모바일 상세 사진 집중 보기와 조작부 정리

모바일 상세 뷰어의 추가 지정 항목 1·2·3·5·7·8을 반영했다. `OriginalPhotoViewer.module.css`에서 사진 좌우 여백은 `.stage`의 8px로 줄이고 이동 버튼은 사진의 좌우 중앙에 배치한다. `.mobileModes`는 외곽 padding 없이 최소 44px 터치 높이를 유지한다. 선택 배경과 `:focus-visible` 테두리를 분리하고 반복 원본/보정 썸네일 배지는 모바일에서 숨긴다.


### 모바일 비교 탭·집중 보기 CTA 제거

후속 요청으로 모바일 상세 뷰어는 원본·보정본 두 가지 전환만 제공한다. 비교 상태로 진입해도 모바일에서는 해당 사진 한 장을 표시하고 보정본 버튼을 활성화한다. PC 비교 기능은 유지한다. 집중 보기 CTA와 해당 버튼용 상단 여백을 제거했으며, 사진 단일 탭으로 조작 영역을 숨기고 다시 탭해 복원하는 동작 및 핀치·더블 탭 확대는 유지한다. 이전 절의 비교 탭·집중 보기 버튼 설명은 이 변경으로 대체된다.


### 모바일 버전 이력 아이콘과 중앙 이동 버튼

모바일 상세의 버전 이력 CTA는 제거했다. 이전/다음 버튼은 사진 영역의 좌우 세로 중앙에 배치하고 44px 터치 영역 안의 시각 요소만 작고 반투명하게 표시한다. PC 버전 이력과 데이터/API 흐름은 유지한다.


### 모바일 상세 이동 버튼의 시각적 크기 축소

`OriginalPhotoViewer.module.css`의 모바일 `.nav`는 44px 터치 영역을 유지한다. 원형 배경은 `::before`로 28px, 검정 계열 불투명도 18%로 표시하며 아이콘은 18px이다. 밝은 사진에서는 아이콘 그림자로 식별을 돕고 키보드 포커스 테두리를 유지한다. PC 스타일은 변경하지 않는다.


### 모바일 코멘트 직접 표시

코멘트 개수·진입 화살표·별도 코멘트 시트를 제거하고 현재 단계에 해당하는 본문을 바로 표시한다. 셀렉과 보정본 상세보기는 공용 `ViewerCommentPanel`의 2px 청록색 인용선과 14/24px 본문 규격을 공유한다. 셀렉은 `셀렉 코멘트`, 보정본은 현재 회차가 `revision_requested`일 때만 `재보정 요청` 제목을 사용한다. 모바일 패널은 전체 높이 120px 안에서 긴 본문만 내부 스크롤하고 별도 더 보기/접기 CTA는 두지 않으며, 표시할 코멘트가 없으면 패널을 렌더링하지 않는다.


### 모바일 상세 뷰어 미업로드·탭 개선 1~14

1. 보정본 미업로드 시 원본 대체 대신 공용 BrandLogoBar와 중앙 안내를 표시한다. 로고 애니메이션은 없다.
2. 미업로드 상태에서도 원본 전환·좌우 탐색·썸네일 탐색이 가능하다.
3. 탭 아래 원본 대체 안내를 제거해 모드 전환 시 상단 높이를 유지한다.
4. 보정본 모드의 미업로드 썸네일에만 상태 배지를 표시한다.
5. 코멘트 제목은 공용 `ViewerCommentPanel`의 12px 글자·16px 아이콘·20px 행을 사용한다.
6. 단일 코멘트는 제목에 출처 라벨을 표시한다. 여러 단계 데이터는 각각 출처를 표시한다.
7. 원본만 등록된 버전 시트에는 해당 상태를 안내한다.
8. 모드 전환은 공통 배경 안에 같은 너비의 두 버튼을 사용한다.
9. 선택 배경은 `.mobileModes button[aria-pressed]`의 #333b42로 낮추고 흰 글자와 굵기를 유지한다.
10. 최소 44px 터치 높이를 유지하며 `.header`는 모바일 상세에서 52px, 탭 좌우 여백은 12px로 정리한다.
11. 미업로드 보정본 버튼은 비활성화하지 않는다.
12. 사진 이동 시 선택한 보기 모드를 유지한다.
13. 이미지 영역은 같은 contain 프레임을 사용하며 모바일 헤더 파일명은 한 줄 말줄임으로 높이를 고정한다.
14. 모드 전환 애니메이션 없이 이미지를 교체한다. ViewerMobileImage는 URL 변경 시 로딩 상태를 초기화하고 이전 사진을 숨긴다. 로딩 실패 시 다시 시도를 제공한다.


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


### 모바일 업로드 현황 문구 축약

작업 화면 하단의 모바일 현황은 보정본 N/M장 업로드 한 문장으로 표시한다. 모두 업로드됐을 때 보정본 N장 준비 완료로 전환하며, 재보정 교체가 남아 있으면 교체 필요 수를 대신 표시한다. 하단 버튼은 현재 선택한 회차에만 대응한다. 재보정 진행 중 1차 보정 탭에서는 1차 보정 검토 완료만 표시하고 재보정 업로드·검토 요청은 재보정 탭에서 제공한다.


### Mobile retouched list landscape media

Retouched mapping rows reuse PHOTO_GRID_MEDIA_ASPECT_RATIO (218.32 / 150.7), matching the selected gallery. Original, retouched and upload slots share --mapping-media-height calculated from column width. Virtual row height estimates and the centered arrow use the same height. Desktop media sizes remain unchanged.


### Mobile mapping filenames above images

Original and retouched filenames appear above their landscape media. Mapping cells use shared grid rows (subgrid), keeping both images aligned even when one filename wraps. The direction arrow belongs to the media row and comments follow both columns.


### Shared PhotoAssetPreview for selected and retouched media

PhotoAssetPreview now owns the filename header and PhotoThumbnailFrame presentation. Selected grid cards and mobile retouched mapping cells both use it. Filename typography is 12px / 20px, weight 500, with one-line ellipsis and the existing full-name hover tooltip. The shared frame owns radius, surface color and PHOTO_ASSET_MEDIA_ASPECT_RATIO; per-screen controls remain children. Original upload grids can supply a custom selection header. Mapping rows still share filename/media grid rows and measured virtual heights. --photo-asset-gap provides a common 3px gap default. Earlier separate retouched filename/two-line rules no longer define the active presentation.


### Shared mobile asset toolbar geometry

Removed the retouched workflow override (56px height and 16px gutters). Original, selected and retouched tabs now use ProjectAssetWorkspaceToolbar compactMobile defaults: 44px height, 12px horizontal padding, no vertical padding. Upload button visual height remains 32px inside its 44px hit target. Function slots and desktop layout remain unchanged.


### Mobile retouched select-all checkbox

The retouched list column header exposes the select-all control immediately before `보정본`. The checkbox-and-label group is left aligned to the retouched filename start line. The 18px checkbox face sits inside a 44px touch target, and the column header remains sticky while mapping rows scroll. It selects/deselects currently eligible versions and enters list selection mode. Partial selection exposes `aria-checked="mixed"`. Approved and missing versions remain excluded by existing `selectableVersionIds` logic.

Selection does not replace the mobile workspace toolbar summary. The toolbar keeps the current round and photo count so its height and information hierarchy remain stable, and it never displays a selection-delete CTA. When one or more versions are selected, the shared bottom action bar replaces the normal review action with `N장 선택됨`, `선택 해제`, and a danger-colored `선택 삭제`. Clearing the selection restores the normal upload/review status and action. Delete still opens the existing confirmation dialog; neither the header checkbox nor the bottom action removes data immediately.


### Mobile retouched card grid as the default

The mobile retouched workspace defaults to the same `V1Card`/`V2Card` gallery used on desktop, arranged in two equal columns with an 8px gap. Each card keeps the original reference thumbnail, the filename hierarchy defined below, and a landscape retouched preview or upload slot. Gallery cards omit comments; list and detail views retain the full selection and retouch comments. List view remains available from the directly exposed view toggle for users who need a row comparison.

Before a retouched file is uploaded, both desktop and mobile card headers show only the original filename beside the original reference thumbnail. They do not show a `미업로드` status pill because the upload slot directly below already communicates that state. After upload, the retouched filename becomes primary and `원본 · 파일명` becomes secondary.

When the gallery is active, the workspace summary exposes a labeled `전체` control with a 44px touch target and a 20px checkbox face. Eligible uploaded versions expose the same image-overlay checkbox on mobile and desktop, leaving the reference thumbnail and filename alignment unchanged. Its 44px hit area is aligned to the upper-left image corner and places the 20px face 4px from both edges to reduce photo obstruction. Unchecked faces use a translucent white surface; checked faces and the card ring use the primary orange. Approved and missing versions do not show a checkbox. The replacement action occupies the opposite lower-right corner with a 44px hit area and a smaller 28px visual button.

The selected bottom action contains the count and one full-width primary action, `선택 삭제 N장`. It does not repeat `선택 해제`; users adjust selection by tapping the checked card or the checked select-all control. The confirmation dialog retains its danger treatment. The upper workspace toolbar never contains a delete CTA.

### 작가 추천 마크

작가 추천은 `RecommendationMark`의 사선 절개가 있는 기하학적 A SVG를 사용한다. 폰트 의존 없이 `currentColor`로 표시한다. 사진 카드의 선택 컨트롤은 삭제와 추천 지정에 함께 쓰는 일반 체크박스이며, 44px 터치 영역 안에서 카드 폭에 따라 18·20·24·28px의 시각 면을 사용한다. 추천 저장 상태는 체크박스와 분리해 A와 `작가 추천` 텍스트 배지로 표시한다. 모바일 사진 관리 체크박스도 같은 카드 폭 기준을 사용한다. 목록형 컨트롤은 36px 영역 안에 20px 체크박스 면을 사용한다. 고객 별점의 별 아이콘은 유지한다.

사진 보기 범위 선택은 `추천한 사진`이 활성화되어도 기본 중립 배경과 글자색을 유지한다. 현재 범위는 A 아이콘과 라벨, 장수로 구분하며 작가 추천의 강조색은 하단 편집 영역과 사진 배지에 사용한다.

축소된 작가 추천 플로팅 컨트롤은 카드 전체를 하나의 버튼으로 사용한다. 큰 원형 CTA를 중첩하지 않고 `A`, 작가 추천 라벨, 보조색 장수, 배경 없는 위쪽 chevron 순서로 배치한다. 높이는 56px, 중립 테두리와 약한 그림자를 사용하며 hover는 컨트롤 전체에 적용한다.

펼친 작가 추천 편집 바는 PC에서 제목, 최대 5개 미리보기, 나머지 장수, 작업 버튼을 한 줄에 배치한다. 미리보기는 44px로 제한하고 별도 두 번째 행을 만들지 않는다. 안내 문구는 충분히 넓은 화면에서만 표시하며 모바일에서는 미리보기를 숨긴다.

고객 모바일 갤러리의 보기 범위는 툴바 한 자리를 쓰는 상태형 필로 표시하고, 선택지는 공통 하단 시트에서 제공한다. 작가 추천 보기에서는 연한 Orange surface와 `RecommendationMark`를 함께 사용한다. 좁은 화면에 세 보기 범위를 한 줄 탭으로 압축하지 않는다.

작가 원본 업로드와 셀렉 요청 후 읽기 전용 원본 탭은 공용 `PhotoScopeSelect`로 `전체 사진 / 작가 추천` 범위와 장수를 표시한다. 셀렉터는 외곽 테두리 없이 neutral surface로 구분하며, 작가 추천 선택 시 A와 Orange soft surface로 현재 범위를 전달한다.

Mobile 원본 업로드의 범위 셀렉터 트리거는 장수를 숨기고 132px 너비를 사용한다. 우측에는 공용 격자/목록 전환을 제공하며 정렬은 표시하지 않는다. 업로드 가능한 사진 카드에는 44px hit area의 체크박스를 항상 표시하고, 길게 누르기는 같은 선택 모드로 진입하는 보조 동작으로 유지한다.

Desktop 원본 업로드 toolbar는 72px 한 줄을 사용한다. 보기 범위·AI 분석·검색·정렬·보기 전환을 같은 수직 중심에 배치하며 기능군 사이에 별도 행이나 수평 구분선을 만들지 않는다.

갤러리/목록 보기 전환은 원본 업로드·원본·셀렉·보정 화면 모두 `ProjectAssetToolbarViewToggle`을 사용한다. PC·Mobile 모두 현재 보기의 반대 동작 하나만 44px 아이콘 버튼으로 표시하고 `목록으로 보기 / 갤러리로 보기` tooltip과 접근성 라벨을 제공한다.

Desktop 사진 정렬은 원본 업로드·원본·셀렉 화면 모두 `PhotoSortSelect`를 사용한다. 화면마다 필요한 정렬 항목만 options로 전달한다. 트리거는 외곽선 없는 neutral surface를 사용하고, 브라우저 기본 select 대신 공용 shadow menu에서 현재 항목을 check로 표시한다. Mobile은 같은 정렬 값을 기존 하단 시트의 버튼 그룹으로 조정한다.

원본 업로드·원본·셀렉의 Desktop 검색 도구 바는 `ProjectAssetWorkspaceToolbar`를 공통으로 사용한다. 왼쪽에는 사진 범위와 분석 도구, 오른쪽에는 `검색 → 정렬 → 보기 → 내보내기(있는 경우)` 순서로 배치한다. 검색은 44px 높이와 `clamp(180px, 22vw, 320px)` 너비, 컨트롤 간 12px 간격을 공통으로 사용한다.

보정본·최종본도 같은 `ProjectAssetWorkspaceToolbar` 배치 규칙을 사용한다. 검색과 정렬이 없는 경우 오른쪽 도구는 `보기 → 내보내기 → 일괄 업로드/교체(있는 경우)` 순서로 둔다. Desktop 내보내기 진입점은 모든 자산 탭에서 `ProjectAssetExportTrigger`를 사용하며, 42px 무테 neutral surface와 동일한 chevron·hover·focus 상태를 공유한다. 일괄 업로드/교체는 실제 파일 작업을 여는 주요 행동이므로 오른쪽 끝에 두고, 제출 CTA와 경쟁하지 않는 42px accent soft surface를 사용한다.

재보정이 시작된 프로젝트는 도구 바의 `1차 보정/재보정` segmented control을 사용하지 않는다. Desktop에서는 보정본 탭 오른쪽에 원형 노드와 선택 밑줄 없이 `1차 보정 · 재보정` 텍스트 단계만 표시하고, 보정본 탭 글자의 아래 기준선에 맞춘다. Orange 글자는 현재 보고 있는 회차에만 사용하고, 실제 진행 단계는 작은 cyan 점과 `진행 중` 문구로 분리한다. Mobile은 같은 위치에 `1/2 1차 보정` 또는 `2/2 재보정` 트리거를 표시하고, `보정 단계` 하단 시트에서도 선택한 회차는 Orange surface, 실제 진행 단계는 cyan 상태 문구로 구분한다.

셀렉 결과의 Desktop toolbar는 독립 `파일명 복사` CTA를 두지 않고 `내보내기` 메뉴에 포함한다. 내보내기 트리거는 정렬과 같은 무테 neutral surface를 사용하고, popover는 border 없이 10px radius와 공용 shadow로 구분한다.

원본 사진의 정렬 항목은 `파일명순 / 최근 업로드순 / 오래된 업로드순`만 사용한다. 용량·해상도·파일명 역순은 제거한다. 셀렉 결과는 고객 요청 확인을 위해 `코멘트 우선`을 추가한다. 업로드 일시가 없는 과거 사진은 날짜 정렬의 마지막에 두고 파일명으로 순서를 안정화한다.

셀렉 요청 후 읽기 전용 원본 탭은 저장된 추천이 있을 때만 공용 보기 범위 셀렉터를 표시한다. 추천 카드의 A 표시는 유지하되 이 화면에서 추천 수정 CTA는 제공하지 않는다.

PC 원본 작업 선택은 평소 카드 위에서 숨기고 hover·키보드 focus 시 좌측 상단에 빈 체크박스를 표시한다. 한 장이라도 선택되면 모든 카드의 체크박스를 유지하며, 카드 전체 클릭의 상세보기 동작과 분리한다. 추천 배지와 같은 위치에서는 hover 또는 선택 중인 체크박스를 우선 표시한다. 선택 후 하단에서 `작가 추천으로 지정/제외` 또는 삭제를 실행한다.
