# PC 디자인 시스템 검수 — 2026-09-09

## 후속 개선 구현 — 2026-09-09

아래 최초 검수에서 발견한 P1/P2 항목을 사용자 요청에 따라 구현했다. 최초 검수 내용은 재현 이력으로 보존하며, 현재 상태는 이 절과 Light Design System Draft 0.5를 기준으로 한다.

| 항목 | 반영 결과 |
|---|---|
| P1-01 문의 portal | PC Light palette·공통 버튼, label/error 관계, pending 닫기 잠금 |
| P1-02 폼 접근성 | 공통 Field/Input/Textarea/PhoneInput의 label·hint·error 연결; 선택 group/aria-pressed |
| P1-03 공통 modal | focus 초기화·Tab 순환·복귀·title 연결·중첩 scroll/Escape; confirmation pending 계약 |
| P2-01 theme 중복 | shell/Sidebar/page/portal의 palette source 통합; 로컬 역할 token 유지 |
| P2-02 버튼 재사용 | regular/toolbar/confirmation/work-panel 크기, 공통 PC 상태 CSS; 업무 wrapper 유지 |
| P2-03 Focus 가독성 | PC 카드 폭 기준 지표 행 분리, headline 생략 제거, 날짜 한 줄 유지 |
| P2-04 범위/semantic | Manual Light header/shell, PC 납품 완료 Neutral badge; 고객 palette 경계 문서화 |

검증: TypeScript 통과. 변경 TS/TSX 전체 lint는 오류 0개, 기존 이미지·미사용 선언 경고 14개다. `tests/e2e/photographer/desktop-design-system.spec.ts`의 Chromium PC 테스트 **4개 통과**(일반 생성 폼·오류, Settings/문의창, confirmation pending/focus·수정 폼, Manual 네 폭). Dashboard는 1024/1280/1440/1920px에서 headline·날짜와 가로 넘침을 브라우저 및 스크린샷으로 확인했다. 문의 발송과 UI 삭제 요청은 테스트에서 가로채 pending 후 실패를 재현했으며 실제 발송·실제 프로젝트 삭제로 실행하지 않았다. confirmation 테스트는 별도 test-setup 프로젝트를 생성하고 finally에서 정리했다.

보정본 일괄 업로드창은 실제 브라우저에서 White surface·제목 연결·초기 focus·Shift+Tab·Escape·트리거 복귀·scroll 잠금 해제를 확인했다(파일 전송 미실행). 최종본의 완료 badge는 Neutral computed color를 확인했다.

모바일 화면 구성은 이번에 재설계하거나 재검수하지 않았다. 공통 form/dialog의 접근성 동작은 공유 컴포넌트에도 적용된다. 실제 업로드·저장·최종본 이미지가 있는 모든 상태와 다른 브라우저까지 검증 완료로 간주하지 않는다.

## 최초 검수 결론


작가 PC의 주요 운영 화면은 Light 전환과 공통 컴포넌트 기반이 갖춰져 있다. 다만 **전환 완료 또는 디자인 시스템 확정으로 판정하기에는 문의 모달의 Dark 잔존, 공통 폼·모달 접근성, 중복 토큰, 문서의 과거 설명이 남아 있다.** 재사용 컴포넌트를 새로 많이 만드는 것보다 현재 공통 컴포넌트의 책임과 적용 범위를 정리하는 것이 우선이다.

최초 검수는 코드·브라우저 조사와 문서 동기화였으며 당시 제품 코드는 변경하지 않았다. 아래는 당시 재현 결과와 개선 제안이다. 이후 구현 상태와 검증 범위는 위 후속 개선 절을 따른다.

## 범위와 검증 수준

- 환경: 로컬 개발 서버 `http://localhost:3001`, Playwright Chromium, 기존 테스트 작가 세션과 기존 프로젝트.
- PC 폭: `1024 / 1280 / 1440 / 1920px`, 높이 `1000px` (`page.setViewportSize`). 모바일 viewport는 검사하지 않았다.
- 방법: 실제 페이지/메뉴/수정 화면 진입, DOM·computed style·문서 가로 넘침 측정, 대표 스크린샷 확인, 공통 컴포넌트 import/call site 대조.
- 프로젝트 생성·삭제·저장·파일 업로드·고객 선택 변경·메시지 발송은 실행하지 않았다. 삭제 dialog는 열기·포커스·Escape 닫기만 검사했다.
- `architecture.md`, `upload-flow.md`, `user-flow.md`, FE 렌더링/라우팅, BE `app/main.py`의 API·worker 경계를 확인했다. 디자인 표현과 문서 변경으로 API/DB/업로드 흐름은 바뀌지 않는다.
- 관리자·공개 랜딩, 고객 PIN/완료/보정 검토의 전체 상태, Safari/Firefox, 전송 중·네트워크 실패·대량 사진 성능은 이번 검수 완료 범위에 포함하지 않는다.

| PC 화면 | 확인한 상태 | 결과와 한계 |
|---|---|---|
| Dashboard | 프로젝트 존재, 기한 초과 Focus, 최근/완료 카드, usage 초과 | 네 폭에서 문서 가로 넘침 없음. Focus 내부 줄바꿈/생략은 별도 개선 항목 |
| Project List | 전체 목록, 진행/완료 행, 다음 행동 | 네 폭에서 문서 가로 넘침 없음. 목록의 수정·삭제 overflow는 현재 없음 |
| Project Detail | editing 및 delivered 프로젝트, 정보·작업 패널·삭제 dialog | 1440px 대표 화면 확인, dialog 포커스 이탈 재현. 모든 프로젝트 상태를 검증한 것은 아님 |
| Project Edit | 기존 editing 프로젝트 정보 수정 화면 | 네 폭에서 문서 가로 넘침 없음. 공통 라벨 연결 누락 확인. 저장하지 않음 |
| Project Create | 한도 초과 안내 | 네 폭에서 문서 가로 넘침 없음. 계정이 54/50 상태여서 일반 생성 폼은 코드 대조만 수행 |
| Settings | 프로필 폼, 계정/알림 구조, 문의 모달 | 네 폭에서 문서 가로 넘침 없음. 라벨 연결 누락·문의 모달 Dark 잔존 확인. 저장하지 않음 |
| Original Upload | 기존 preparing 프로젝트 | 네 폭에서 문서 가로 넘침 없음. 실제 업로드·분석은 실행하지 않음 |
| Assets Original / Selected | 5장 원본 / 3장 셀렉, editing 프로젝트 | 네 폭에서 문서 가로 넘침 없음. 공통 context/tab/toolbar·gallery 확인 |
| Assets Retouched | 3장 대상, 보정본 미업로드, 업로드 modal | 네 폭에서 문서 가로 넘침 없음. 파일 선택/업로드 미실행; 모든 round/status는 미검증 |
| Assets Final | delivered 프로젝트, 최종 이미지 0장 | 네 폭에서 문서 가로 넘침 없음. populated 최종본은 미검증 |
| Manual | 사용 매뉴얼 | 1440px에서 Dark shell·Inter 제목 확인. Light route 대상에 포함되어 있지 않음 |
| 고객 셀렉 Intro / Gallery / Viewer | selecting 프로젝트, 원본 5장 | 네 폭에서 문서 가로 넘침 없음. Intro/Gallery Light, Viewer Dark 경계 확인. Gallery fixture 썸네일의 실제 presign/표시 완결성은 보증하지 않음 |

문서 가로 넘침이 없다는 것은 모든 요소의 겹침·잘림·키보드 접근성까지 통과했다는 뜻이 아니다. fixture 제약과 검사하지 않은 상태는 위 표에 구분했다.

## 우선순위별 발견 사항

### P1-01. 문의하기 modal이 Light 경계 밖에서 Dark로 표시됨

- 재현: `/photographer/settings` → Sidebar 프로필 메뉴 → `문의하기`.
- 실제: modal 배경 `rgb(21, 22, 26)`, 글자 `rgb(242, 242, 244)`, 상속 `--background: #0a0b0d`. Light 페이지의 `--background: #f5f8f8`와 다르다. 보내기 버튼도 기존 Dark의 Orange+검은 글자 조합이다.
- 원인: [`FeedbackModal.tsx`](../src/components/photographer/FeedbackModal.tsx)의 `createPortal(..., document.body)`에 Light theme scope가 없다. 자체 overlay이고 `PhotographerModal`을 사용하지 않는다. dialog role/name도 없다.
- 개선안: Light route 판별과 portal theme를 재사용하고, 모달 기반 접근성 계약을 공통화한다. 사진 감상용 Dark viewer와 구분해야 한다.

### P1-02. 재사용 폼의 시각적 라벨이 입력과 연결되지 않음

- [`ProjectFormFields.tsx`](../src/components/photographer/ProjectFormFields.tsx)의 `ProjectFormField`는 `<label>`과 children을 형제 요소로 렌더하지만 `htmlFor/id` 또는 그룹 연결 API가 없다.
- 실제 DOM: 수정 화면 8개 label의 `HTMLLabelElement.control`이 모두 `null`. 입력 요소 중 5개는 연결된 label과 `aria-label/aria-labelledby`가 없다. Settings 입력/textarea 5개도 같은 상태다. placeholder가 보여도 지속적인 필드 이름 연결을 대신하지 못한다.
- 영향: 라벨 클릭으로 입력에 포커스되지 않고, 입력의 접근 가능한 이름이 placeholder 등에 의존한다. 재사용하는 생성·수정·설정에 같은 문제가 퍼진다.
- 개선안: 단일 input은 field ID/label/error/description 연결을 공통으로 제공하고, 촬영 유형·재보정 선택 묶음은 fieldset/legend 또는 labelled group으로 분리한다. `PhoneInput`까지 ID 전달을 점검한다.

### P1-03. 공통 modal에 초기 포커스·트랩·복귀·접근 가능한 제목 연결이 없음

- [`PhotographerModal.tsx`](../src/components/ui/PhotographerModal.tsx)는 portal/theme/scroll lock/Escape를 공유하지만 focus trap, initial focus, restore focus, title의 `aria-labelledby` 연결은 구현하지 않는다.
- 재현: 프로젝트 상세 → 더보기 → 삭제하기. dialog를 연 직후 포커스가 내부로 이동하지 않는다. `취소`에 focus 후 Shift+Tab을 누르면 dialog 밖으로 이동한다(검수 환경에서는 Next 개발 도구). Escape 닫기는 동작한다. 삭제는 실행하지 않았다.
- 개선안: 공통 modal 기반에서 처리해야 소비 화면마다 동일 로직을 복제하지 않는다. standard/confirmation/workflow와 자체 업로드·문의 모달의 적용 범위를 명시한다.
- pending 참고: `PhotographerConfirmDialog`는 pending을 버튼에 적용하지만 modal의 `closeDisabled`에 넘기지 않는다. 현재 상세 호출부는 `onClose`에서 pending을 가드한다. 현재 중복 요청 버그라고 단정하지 않고 **소비자 의존 계약**으로 기록한다.

### P2-01. Light token이 단일 관리 지점으로 완전히 통합되지 않음

- 페이지 module들은 [`PhotographerLightTheme.module.css`](../src/styles/PhotographerLightTheme.module.css)를 `composes`한다. 이 부분은 좋은 재사용 구조다.
- 하지만 [`photographer.css`](../src/app/photographer/photographer.css)의 `.photographer-light-shell`과 [`Sidebar.module.css`](../src/components/layout/Sidebar.module.css)의 `.rootLight`에도 palette가 별도 선언되어 있다. 현재 값이 같더라도 하나만 수정하면 콘텐츠·전환 canvas·LNB가 갈라질 수 있다.
- `ProjectListTheme.module.css`의 `.menuTheme`에도 과거 복제가 남아 있으나 현재 TSX 사용처는 없다. active portal theme로 간주하거나 임의 삭제하지 않는다.
- 개선안: 값은 공유하고, 페이지별 geometry와 LNB의 `--acb-*` 역할 alias는 각 컴포넌트에 남긴다. shell/portal/sidebar와 Light→Dark 경계까지 회귀 확인 후 통합한다.

### P2-02. 버튼의 공통 기반과 크기 변형 사이의 계약이 부족함

- `PhotographerLightButton`: 일반 운영 CTA, 기본 `13/18px`, Primary 700 / Secondary 400, 8px radius.
- `ProjectAssetToolbarButton`: 작업 툴바, `44px`, `14/24px` 600, 별도 border/hover/disabled/focus 구현.
- `PhotographerConfirmDialog`: 일반 버튼에 `56px`, `16/24px` class override.
- `ProjectWorkPanel`: `48px`, `14/20px` 700의 로컬 버튼.
- 크기가 다른 것 자체는 문제가 아니다. 공통 상태·의미색·키보드 처리까지 별도로 유지하거나 utility override에 의존하는 점이 운영 비용을 만든다. hover Orange도 일반 CTA의 accent/90, 툴바의 `#e94b0d`, WorkPanel의 `#ff5e1a`로 나뉜다.
- 개선안: `regular / toolbar / confirmation / work-panel`처럼 검증된 크기 역할과 상태 계약을 명시한 공통 기반을 만들고, 업무 wrapper는 유지한다. 모든 버튼을 한 크기로 통일하지 않는다.

### P2-03. Dashboard Focus의 정보 밀도는 추가 조정 필요

- 1440px·expanded Sidebar·사진이 있는 기한 초과 Focus에서 일반 headline이 `고객의 셀렉이 지연되고 있…`으로 생략되고 날짜가 `2026. 08.` / `31.`로 갈라졌다.
- [`FocusProjectCard.tsx`](../src/app/photographer/dashboard/FocusProjectCard.tsx)의 PC 썸네일 고정 폭, 30% metric, 단일 행 headline이 같은 공간을 나눈다. 문서 overflow 검사만으로는 잡히지 않는 내부 가독성 문제다.
- 개선안: PC의 사용 가능한 content 폭을 기준으로 headline 줄 수·metric 최소 폭·날짜 줄바꿈을 조정한다. 기존 mobile 조합과 분리하여 검토한다.

### P2-04. 전환 범위와 semantic 예외가 문서에서 불명확함

- Manual은 `isPhotographerLightRoute()` 밖이며 PC의 shell와 제목도 Dark/Inter다. 의도된 사진 viewer와 달리 운영 문서 화면의 미전환 항목으로 별도 결정이 필요하다.
- 고객 Light는 `--customer-*`와 `--accent: #ff4d00`, 작가 Light는 Navy 기반 palette와 `#ff5712`를 사용한다. 고객 CTA의 dark control도 현재 문서에 정의된 역할 차이이므로 작가 Orange CTA를 일괄 적용하지 않는다.
- 최종본의 `납품 완료` 표시는 `WorkflowPageClient.tsx`의 `emerald-*` 로컬 badge다. Light 문서의 Completed/Passive Neutral 원칙에 대한 예외이며 아직 공통 success variant로 확정하지 않는다.

## 문서 동기화 결과

| 문서 | 발견한 불일치 | 이번 처리 |
|---|---|---|
| `design-system-light.md` | 초반 3-route 검증 범위와 이후 Form/Settings/Assets 구현 범위 혼재; 목록 overflow·삭제 dialog를 현재처럼 서술 | 현재 적용 route/증거 수준, 재사용 지도, 미해결 예외 추가. 사라진 목록 overflow와 조합 설명 수정 |
| `design-system.md` | 이전 Dark/Shared 규칙이 현재 PC에도 적용되는 것처럼 읽힐 수 있음 | Photographer Light / Customer / legacy 문서 우선순위 링크 추가. Dark 규칙은 유지 |
| `component-inventory.md` | 과거 통계와 신규 항목 혼재; Light Header/Button/Toolbar/Tabs/Provider 누락 | 통계 시점 분리, PC 재사용 지도와 현재 active 역할 추가 |
| `page-inventory.md` | 생성 max-w-2xl, 설정 2열, Sidebar 240/72px, 목록 삭제 등 과거 값 | 작가 PC 표·shell 설명을 현재 구현 기준으로 갱신 |
| `page-patterns.md`, `acut-components.md` | foundation 링크가 legacy 문서만 가리킴 | 현재 Light PC 기준 및 구현 지도 링크 추가; 과거 제안은 유지 |
| `customer-design.md` | PC gallery accent를 두 값으로 병기 | 전역 실제 값 `#ff4d00`와 작가 Light의 차이를 명확히 하고 이번 PC 검수 범위 추가 |

## 최초 제안한 재사용 개선 순서 — 이력

1. **공통 동작 계약부터:** 문의 modal의 theme 경계, 공통 modal focus/name, 공통 field label/error 연결을 정리한다.
2. **색상 변경 지점 축소:** Light palette를 shell/sidebar/page/portal에서 하나의 source로 참조하게 한다.
3. **기존 컴포넌트 활용:** Header / FormField / Button / ActionBar / AssetToolbar / PhotoGallery의 사용 기준과 크기 변형을 고정한다. 목록 전용 조합을 무조건 다른 화면에 복제하지 않는다.
4. **대표 상태 확인:** 생성 일반/오류, 완료 이미지가 있는 최종본, 업로드 pending/실패, 긴 고객명·파일명·큰 수치와 Focus 내부 줄바꿈을 검증한다.
5. **문서 운영:** 구현 상태(적용/미적용)와 검증 상태(코드/브라우저/미검증)를 분리한다. 값 변경은 해당 token/component와 문서 표를 같은 작업에서 갱신한다.

Documentation impact:
- architecture.md: not affected
- upload-flow.md: not affected
- user-flow.md: not affected
- 기타 관련 문서: updated — 위 문서 동기화 표 참고. PC 공통 UI·접근성·디자인 문서 갱신. API·상태 전이·업로드·사용자 흐름의 변경 없음.
