# A-CUT 디자인 시스템 초안

> 상태: **Working Design System(Draft 0.3) — v1.0 Final 아님**
> 작성일: 2026-07-29 (최초) / 2026-08-21 갱신 / 2026-08-24 Stability 분류 갱신
> 근거: `ui-audit.md`, `component-inventory.md`, `page-inventory.md`
> 참고: `DESIGN-airbnb.md`의 문서 구성 방식만 참고했으며 색상·형태·브랜드 표현은 가져오지 않았다.
> 2026-08-21 갱신 근거: A-CUT Golden Screen #1(Project Detail/Project Edit) 확정본과의 Audit 결과 승인 반영. Customer Actor 색상(Blue→Porcelain/Cyan), Icon 정책, Project Code 위계, Required Indicator, Information Grid/Form Controls 등 신규 패턴을 추가했다. 코드 구현은 이번 갱신에 포함하지 않는다.
> 2026-08-24 갱신 근거: A-CUT 전체 화면에 디자인 적용이 아직 완료되지 않은 단계다. 이번 갱신은 문서를 v1.0으로 확정하는 것이 아니라, **여러 화면에서 반복 검증된 규칙(Stable)**과 **아직 조정 중이거나 단일 화면에서만 쓰인 규칙(Provisional/Page-specific)**을 분리해 표시하는 것이 목적이다. Secondary CTA 기준 변경, Customer=Porcelain 적용 범위 명확화, Image Rule 원칙/수치 분리를 반영했다. 주요 Photographer 화면에 디자인 적용이 충분히 진행된 뒤 별도 Design System Audit으로 v1.0을 확정할 예정이며, 그전까지 이 문서는 계속 바뀔 수 있다.

### 현재 PC 구현의 문서 선택 (2026-09-09)

- **작가 Light 운영 UI:** [design-system-light.md](design-system-light.md)를 우선한다. 이 문서의 Dark palette·과거 Dashboard/Detail 수치를 Light 화면에 재적용하지 않는다.
- **고객 PC:** [customer-design.md](customer-design.md)의 PC composition을 따른다. 고객 Light palette와 Dark 사진 viewer 경계는 작가 Light와 별도다.
- **이 문서:** Shared 원칙과 Dark/legacy 기준을 보존한다. 아래 Stability/미구현 서술은 해당 갱신 시점의 기록이며, 현재 Light 전환 완료 여부를 나타내지 않는다.
- **최신 PC 검수:** [2026-09-09 검수 결과](desktop-design-audit-2026-09-09.md). 모바일은 이번 검수에서 제외했다.

### 문서 구성 안내 — Stability Map

기존 절 번호(§)는 재배치하지 않고 그대로 유지한다. 대신 각 절이 지금 어느 신뢰도 단계에 있는지를 아래 6-tier로 안내한다 — **"Dashboard 1개 화면에서 유효해 보였다"는 이유만으로 Stable/Global로 승격하지 않는다.**

| Tier | 의미 | 절 범위 |
|---|---|---|
| 1. Stable Foundations | 원칙, 토큰(Color/Typography/Spacing/Radius/Shadow/Border), Icon 정책, Responsive, A11y, Loading/Empty/Error, Animation, 재사용 지도 — 여러 화면에서 반복 확인, 변경 가능성 낮음 | §1~16 |
| 2. Stable Semantic Rules | Semantic feedback/status(§4.5), Badge color mapping(§18.2), CTA Hierarchy(§23, 2026-08-24 Secondary 기준 갱신), Workflow Semantic Actor Color(§30, 적용 범위 명확화) | §4.5, §18.2, §23, §30 |
| 3. Stable Core Components | Badge component 전체(§18), Image 원칙만(§19 도입부·19.1 — container-decides-size/object-cover/no-shift), Label/Value/Metadata hierarchy(§5.3), Navigation/LNB(§17, 실제 코드로 shipped) | §5.3, §17, §18, §19(원칙만) |
| 4. Provisional Patterns | 최근 디자인에서 사용했지만 아직 다른 화면으로 검증되지 않은 규칙 — Surface-first hierarchy·Card-in-Card 최소화·Default low-contrast border(§9 주석 참고), Focus Project 구조(§22), Project Card(§21, Dashboard 1개 화면만 검증), Metric의 최신 세부 조정(§20), Information Grid(§27), Section Header+Edit Action(§28), Form Controls(§29), Project Detail Page Pattern의 컴포넌트 성격 부분(§31) | §20, §21, §22, §27, §28, §29, §31(부분) |
| 5. Page-specific Patterns | 특정 화면의 정확한 수치/배치 — Dashboard의 Focus 정확한 width/height·My Work grid density·Main/Aside 비율·Usage/Activity layout(§19.2, §26), Project Detail의 3-column field order·Stepper·Status Panel 배치(§31), Project Edit의 field placement·form grid(§29 실사용처) | §19.2, §26, §29(실사용처), §31(레이아웃 수치) |
| 6. Open Questions / Implementation Follow-up | 지금 해결하지 않고 명시적으로 남겨두는 미결정 사항 | 문서 상단 "Open Questions" 절, §18.7, §26.3 |

Dashboard(§26)와 Project Detail(§31)은 같은 규칙(Actor 색, Badge, CTA 등)을 각자 재정의하지 않고 Tier 2/3의 Stable 정의를 참조한다. Tier 4/5 절은 절 안에 "Provisional" 또는 "Page-specific" 주석을 달아 표시했다 — 절 번호나 내용을 삭제하지 않았다.

## Open Questions / Implementation Follow-up (2026-08-24)

지금 결론 내지 않고 남겨두는 항목이다. 아래 때문에 관련 Stable 규칙 자체를 낮추지 않는다.

1. **StatusPill Customer semantic 미적용** — `StatusPill.tsx`(Project List/관리자/`ProjectInformationCard`에서 사용 중)는 9개 상태를 전부 Orange 농도로만 표현하고 있어 §30의 Customer=Porcelain을 아직 반영하지 않았다. 이는 **Design System 규칙의 불확실성이 아니라 Implementation Follow-up/Technical Debt**로 기록한다 — §30의 Customer=Porcelain 규칙 자체는 Stable로 유지한다. 이번 문서 갱신에서 `StatusPill.tsx` 코드는 수정하지 않는다.
2. **Project Detail/Edit(border-heavy Golden Screen) vs 최신 Dashboard(surface-first) 방향 충돌** — Project Detail/Edit Golden Screen은 Surface-first hierarchy 원칙이 나오기 전에 만들어져 `border`/`border-strong`을 상대적으로 더 많이 쓴다. 두 화면 모두 아직 실제 코드로 구현되지 않았으므로 지금 통일하지 않는다.
3. **Secondary Surface-fill을 다른 화면에서도 유지할지** — 이번 갱신으로 Secondary CTA의 기본 표현이 Neutral/Raised Surface로 바뀌었지만, 실제 검증은 Dashboard Focus Card 1곳뿐이다. 다른 화면(고객 화면, 관리자 등)에도 그대로 적용할지는 각 화면에서 실제로 다뤄볼 때 재확인한다.
4. **Customer Name color의 Context별 사용 기준** — Customer Name에 Porcelain을 쓸지 Neutral을 쓸지는 화면 목적에 따라 다를 수 있다(§30 참고). 언제 강조가 "필요한" 상황인지에 대한 명확한 기준은 아직 없다.
5. **Headline Accent Icon(Bell=Critical/Upload=Action/Users=Customer)의 재사용 가능성** — Focus Card 1개 컴포넌트에서만 쓰인 패턴이다. 다른 화면에서도 유효한지, Badge/Turn Indicator와 역할이 겹치지 않는지는 검증되지 않았다.

## 1. 문서의 역할

이 문서는 A-CUT 제품 UI가 공유할 최소 foundation을 정의한다. 완성된 라이브러리 명세가 아니라, 현재 화면을 점진적으로 정리하기 위한 기준이다.

적용 대상:

- 작가 SaaS 화면
- 고객 공유 링크/PIN/셀렉/보정 검토 화면
- 관리자 운영 화면
- 공개 랜딩과 가이드는 브랜드 토큰을 공유하되 제품 화면보다 표현 자유도가 높다.

이번 초안에서 다루지 않는 것:

- 마케팅용 일러스트레이션 시스템
- 라이트 모드
- 복잡한 데이터 시각화
- 에디토리얼 콘텐츠 스타일 전체
- 새로운 UI 라이브러리 도입 결정
- 제품 화면의 즉시 리뉴얼

## 2. 기술 적용 원칙

현재 기술 스택에서 추가 의존성 없이 적용 가능해야 한다.

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4의 `@theme inline`
- CSS custom properties
- CSS Module 또는 Tailwind utility
- `lucide-react` 우선, 필요한 경우에만 `@iconify/react`
- 대량 사진 목록은 기존 `@tanstack/react-virtual` 유지
- 현재 `src/components/ui` primitive는 폐기하지 않고 API와 스타일을 점진적으로 정렬

권장 구현 순서:

1. `globals.css`에 primitive/semantic token을 선언한다.
2. Tailwind `@theme inline`에 필요한 token만 연결한다.
3. 기존 컴포넌트가 semantic token을 사용하도록 내부 스타일을 교체한다.
4. 핵심 화면을 한 번에 재작성하지 않고 대표 화면부터 이행한다.

토큰 이름은 시각값이 아니라 역할을 나타낸다. `orange-500`보다 `action-primary`, `status-warning`을 사용한다.

## 3. 디자인 원칙

### 3.1 사진이 가장 먼저 보인다

- 사진 위 장식, 텍스트, 배지는 필요한 상태만 표시한다.
- 사진의 색과 명암을 바꾸는 과도한 overlay, glow, filter를 사용하지 않는다.
- 사진 작업 화면에서 UI chrome은 어둡고 조용하게 유지한다.
- 썸네일의 선택·오류·검토 상태는 사진을 가리지 않는 가장자리에서 표현한다.

### 3.2 현재 상태와 다음 행동을 분리해 명확히 한다

- `현재 상태`, `진행 단계`, `다음 행동`은 서로 다른 정보다.
- 상태 배지는 명사형/진행형으로 현재 상황을 설명한다.
- 주요 CTA는 사용자가 지금 할 수 있는 다음 행동 하나를 말한다.
- disabled CTA만 보여주지 말고 활성 조건 또는 이유를 함께 제공한다.

### 3.3 작가는 빠르게, 고객은 쉽게

- 작가 화면은 비교, 다중 선택, 필터, 대량 처리의 효율을 우선한다.
- 고객 화면은 사진 감상과 선택/확정의 단순한 흐름을 우선한다.
- 같은 primitive를 쓰되 정보 밀도와 보조 도구 노출 수준은 역할에 따라 다르게 한다.

### 3.4 장식보다 작업 신호를 우선한다

- `SYS`, `STATUS`, 스캔라인, 반복 glow 같은 장식은 제품 작업 화면의 기본 문법으로 쓰지 않는다.
- 색상은 브랜드 장식보다 행동, 경고, 성공, 선택 상태 전달에 사용한다.
- 한 화면의 주황 primary CTA는 원칙적으로 한 영역에 하나만 둔다.

### 3.5 일관된 동작이 일관된 모양보다 우선한다

- 같은 역할의 버튼, 모달, 토스트, 사진 이동은 같은 키보드/터치 동작을 가진다.
- desktop/mobile에서 표현은 달라도 정보 순서와 행동 이름은 유지한다.
- 로딩·오류·저장 중 상태는 모든 화면에서 같은 의미를 가져야 한다.

### 3.6 접근성을 기본 상태로 설계한다

- 색만으로 상태를 구분하지 않는다.
- 의미 있는 텍스트는 12px 미만으로 만들지 않는다.
- 키보드 focus, 확대, reduced motion, screen reader 이름을 component contract에 포함한다.

## 4. Color token

### 4.1 Primitive palette

현재 전역색을 최대한 보존하되 중복 alias를 제거하는 기준값이다.

| Token | 값 | 용도 |
|---|---:|---|
| `gray-950` | `#0A0B0D` | 최하위 canvas |
| `gray-900` | `#15161A` | 기본 surface |
| `gray-850` | `#1D1E23` | raised surface |
| `gray-800` | `#27282F` | hover/selected quiet surface |
| `gray-700` | `#3A3A42` | 기본 border |
| `gray-600` | `#52525B` | strong border |
| `gray-500` | `#6F6F7A` | disabled text |
| `gray-400` | `#9494A0` | tertiary text |
| `gray-300` | `#B8B8C0` | secondary text |
| `gray-100` | `#F2F2F4` | primary text |
| `orange-500` | `#FF4D00` | 브랜드/주요 행동 |
| `orange-600` | `#E64500` | hover/pressed |
| `blue-500` | `#4F7EFF` | 정보/focus 전용 — Customer Actor 색이 아니다(2026-08-21부터, §30 참고) |
| `cyan-500` | `#9ECAD0` | Customer Actor 전용(Porcelain) — §30. Golden Screen에서 "Porcelain"으로 지칭하던 색과 동일하며, 이 문서에서는 hue 계열 명명 규칙에 맞춰 `cyan-500`으로 등록한다 |
| `green-500` | `#2ED573` | 성공/승인 |
| `amber-500` | `#F5A623` | 주의/재보정 |
| `red-500` | `#FF4757` | 오류/파괴 행동 |
| `black` | `#000000` | 밝은 action 위 텍스트 |
| `white` | `#FFFFFF` | 필요한 고대비 아이콘/텍스트 |

새 컴포넌트가 primitive 값을 직접 사용하지는 않는다. 아래 semantic token을 소비한다.

### 4.2 Semantic surface

| Token | 값 참조 | 사용 |
|---|---|---|
| `canvas` | `gray-950` | 제품 기본 배경 |
| `surface-default` | `gray-900` | 카드, 패널 |
| `surface-raised` | `gray-850` | 모달, dropdown, 고정 도구막대 |
| `surface-hover` | `gray-800` | hover/pressed quiet state |
| `surface-scrim` | `rgba(0,0,0,.72)` | modal/viewer backdrop |
| `surface-photo-stage` | `#050506` | 사진 viewer 배경 |

사진을 둘러싼 surface는 중립색만 사용한다. blue/violet ambient glow는 제품 작업 화면의 기본 배경에서 제거 대상이며, 랜딩 장식에만 제한할 수 있다.

### 4.3 Semantic text

| Token | 값 참조 | 사용 |
|---|---|---|
| `text-primary` | `gray-100` | 제목, 주요 값 |
| `text-secondary` | `gray-300` | 본문, 메타 |
| `text-tertiary` | `gray-400` | 보조 설명 |
| `text-disabled` | `gray-500` | 비활성 |
| `text-inverse` | `black` | 주황/밝은 배경 위 |
| `text-on-dark` | `white` | 사진 overlay, 검정 scrim 위 |
| `text-link` | `blue-500` | 텍스트 링크와 정보성 이동 — Customer Actor 색과는 다른 용도다(§30 참고), 혼동해서 재사용하지 않는다 |

### 4.4 Semantic action

| Token | 값 | 규칙 |
|---|---:|---|
| `action-primary` | `orange-500` | 화면의 주요 다음 행동 |
| `action-primary-hover` | `orange-600` | pointer hover |
| `action-primary-text` | `black` | primary CTA text |
| `action-secondary` | `surface-raised` | 보조 행동 fill |
| `action-secondary-text` | `text-primary` | 보조 행동 text |
| `action-destructive` | `red-500` | 삭제/탈퇴 |
| `action-focus` | `blue-500` | focus ring 전용 |

파랑은 주요 CTA로 사용하지 않는다. 외부 인증 버튼(Google/Kakao)은 각 브랜드 색을 예외로 유지한다.

### 4.5 Semantic feedback/status

| 의미 | Text/Icon | Subtle background | Border |
|---|---|---|---|
| Info | `blue-500` | `rgba(79,126,255,.12)` | `rgba(79,126,255,.32)` |
| Success/Approved | `green-500` | `rgba(46,213,115,.12)` | `rgba(46,213,115,.32)` |
| Warning/Revision | `amber-500` | `rgba(245,166,35,.12)` | `rgba(245,166,35,.34)` |
| Danger/Error | `red-500` | `rgba(255,71,87,.12)` | `rgba(255,71,87,.34)` |
| Selected/Active | `orange-500` | `rgba(255,77,0,.10)` | `rgba(255,77,0,.45)` |
| Neutral/Waiting | `text-secondary` | `surface-default` | `border-default` |

규칙:

- success는 실제 완료/승인에만 사용한다.
- warning은 재보정 요청, 마감 임박, 복구 필요에 사용한다.
- danger는 실패, 유효하지 않은 값, 파괴 행동에만 사용한다.
- selected와 primary action은 모두 주황을 사용할 수 있지만, 선택은 border/check 중심이고 CTA는 fill 중심이다.

### 4.6 Photo overlay

| Token | 값 | 사용 |
|---|---:|---|
| `photo-overlay-top` | `rgba(0,0,0,.48)` | 상단 icon 가독성 |
| `photo-overlay-bottom` | `rgba(0,0,0,.68)` | 파일명/메타 |
| `photo-selection-ring` | `orange-500` | 선택 테두리 |
| `photo-current-ring` | `blue-500` | 현재 보고 있는 사진 |
| `photo-error-ring` | `red-500` | 업로드/로딩 실패 |

선택과 현재 위치를 같은 색으로 표시하지 않는다.

## 5. Typography

### 5.1 Font family

제품 UI:

- `font-sans`: Pretendard, `-apple-system`, BlinkMacSystemFont, `"Segoe UI"`, sans-serif
- `font-mono`: JetBrains Mono, ui-monospace, monospace

제한:

- Space Grotesk/Space Mono는 로고와 랜딩의 제한된 브랜드 표현에만 허용한다.
- Playfair Display, DM Sans, Inter를 제품 화면에서 혼용하지 않는다.
- mono는 프로젝트 ID, 파일명, 숫자 비교, 기술 로그처럼 고정폭이 실제로 도움이 되는 곳에만 사용한다.
- 한 화면에서 sans + mono 두 family를 넘기지 않는다.

현재 Pretendard와 JetBrains Mono를 이미 사용하고 있으므로 새 폰트 패키지는 필요하지 않다. 구현 단계에서는 CDN import, Google import, `next/font` 중 한 경로로 정리한다.

### 5.2 Type scale

| Token | Size/Line | Weight | 사용 |
|---|---|---:|---|
| `display` | 32/40px | 700 | 공개/완료 화면의 제한된 큰 제목 |
| `page-title` | 24/32px | 700 | 페이지 제목 |
| `section-title` | 20/28px | 700 | 주요 섹션 |
| `card-title` | 16/24px | 600 | 카드/패널 제목 |
| `body` | 16/24px | 400 | 고객 안내, 장문 본문 |
| `body-sm` | 14/20px | 400 | 제품 기본 본문/메타 |
| `label` | 13/18px | 600 | field, filter, 상태 설명 |
| `caption` | 12/16px | 400 | 파일명, 날짜, 보조 정보 |
| `caption-strong` | 12/16px | 600 | badge, compact label |
| `button` | 14/20px | 600 | 기본 버튼 |
| `button-lg` | 16/24px | 700 | 고객 primary CTA |
| `mono-sm` | 12/16px | 500 | ID, 파일명, 카운터 |

규칙:

- 의미 있는 텍스트 최소값은 12px이다.
- 10px 이하 텍스트는 로고 장식이나 비필수 마케팅 라벨만 허용한다.
- 제품 UI의 일반 제목에 800/900 weight를 사용하지 않는다.
- 고객 화면 본문은 기본 16px, 작가/관리자 밀집 화면은 14px까지 허용한다.
- 숫자와 사진 개수는 크기보다 정렬과 대비로 강조한다.

### 5.3 정보 위계 — 역할 기반 매핑 (Dashboard 등 밀집 화면)

카드 하나 안에 여러 정보가 섞이는 화면(대시보드 Focus/Work 카드 등)에서 "이 텍스트가 왜 이 크기인지"가 애드혹하게 결정되지 않도록, 아래 7개 역할을 반드시 §5.2 Type scale + §4.3 Semantic text 토큰의 조합으로 표현한다. 새 px 값이나 새 weight 단계를 추가하지 않는다 — 위계는 크기보다 **색 대비(§4.3)와 순서(먼저 나오는 것이 더 중요)**로 만든다는 원칙(§5.2 "숫자와 사진 개수는 크기보다 정렬과 대비로 강조한다")을 텍스트 전반으로 확장한 것이다.

| 역할 | Type token | Text color token | 비고 |
|---|---|---|---|
| Operational Headline | `card-title`(16/24, 600) | `text-primary` | 카드에서 가장 먼저 읽혀야 하는 상황 설명 1줄. 800/900 weight로 키우지 않고, 카드 안에서 유일하게 `text-primary` 전체 대비로 처리해 다른 텍스트와 구분한다. |
| Project Identity(이름) | `label`(13/18, 600) | `text-primary` | Operational Headline보다 한 단계 낮지만 충분히 읽혀야 한다. |
| Project Identity(고객명) | `body-sm`(14/20, 400) | `text-secondary` | tertiary/disabled 색으로 낮추지 않는다 — 프로젝트 식별에 필요한 정보이기 때문. |
| Project Identity(코드) | `caption`(12/16, 400) | `text-tertiary` | 같은 줄에서 고객명보다 약하게 — 유일하게 tertiary 색을 쓰는 자리. |
| Supporting Text(설명) | `body-sm`(14/20, 400) 또는 `caption`(12/16, 400) | `text-secondary` | Headline보다 명확히 작고, 문장이 길면 body-sm, 한 줄 요약이면 caption. |
| Metric Label | `caption`(12/16, 400) | `text-tertiary` | 대문자/letter-spacing으로 라벨임을 표시, 크기로 강조하지 않는다. |
| Metric Value | `card-title`(16/24, 600) + `font-mono` | `text-primary` | "가장 강한 숫자"는 새 큰 사이즈가 아니라 기존 card-title 크기에 mono(§5.1 "숫자 비교"용 mono 규칙)와 text-primary 대비를 더해 만든다. |
| Metric Supporting(날짜/원본 수량) | `caption`(12/16, 400) | `text-tertiary` | Metric Value 아래 보조 정보. |
| Metadata(Activity 타임스탬프 등) | `caption`(12/16, 400) | `text-disabled` | 화면에서 가장 낮은 중요도 — 4단계 text color 중 가장 옅은 톤을 쓰는 유일한 자리. |
| Primary/Secondary Action | `button`(14/20, 600) | `action-primary-text` / `action-secondary-text` | 크기는 항상 동일 — 위계는 §4.4의 fill(Primary) vs outline(Secondary) 색 차이로만 만든다. 버튼 높이를 서로 다르게 하지 않는다. |

규칙: 이 표에 없는 새로운 크기 조합이 필요해 보이면, 먼저 색 대비(4단계 text color)와 순서로 위계를 표현할 수 있는지 검토한 뒤에만 예외를 이 표에 추가한다.

### 5.4 최소 크기 결정(2026-08-21) — Golden Screen 10px/11px 채택하지 않음

A-CUT Golden Screen #1(Project Detail/Project Edit) 목업은 자체 프로토타입 토큰에서 `11px`(field label, Turn eyebrow, detail row 등)과 `10px`(Attention Badge, Stepper actor 텍스트)를 사용했다. Audit 결과 아래를 확정한다.

- §5.2·§12.1의 **"의미 있는 텍스트 최소 12px"** 원칙을 그대로 유지한다. 정보 전달 목적의 텍스트(Field Label, Metadata, Helper Text, Status Text, Project Code, Secondary Information 등)는 실제 구현에서 예외 없이 최소 `caption`(12/16px) 토큰 이상을 사용한다.
- 예외는 **순수 장식 목적** 텍스트에만 허용한다(§15 "마케팅에만 유지 가능한 표현"과 같은 범위 — 로고 장식, 비필수 마케팅 라벨). 상태/라벨/메타데이터처럼 사용자가 실제로 읽고 판단에 쓰는 텍스트는 이 예외에 해당하지 않는다.
- Golden Screen의 10px/11px는 **디자인 목업 단계의 시각 실험**으로 남기고, 실제 구현 시 아래처럼 12px 이상으로 치환한다.

| Golden Screen 표기 | 실제 구현 시 |
|---|---|
| Field Label(11px) | `caption`(12/16, 400) + `text-tertiary` |
| Turn eyebrow(11px, mono) | `caption`(12/16, 400) + Actor 색(§30), mono는 유지 가능 |
| Detail Row value(11px, mono) | `caption`(12/16, 400 또는 500) + `font-mono` |
| Attention Badge(10px) | §18.5 기준 `11~12px`(기존 Badge 규칙 그대로, 10px로 더 낮추지 않는다) |
| Stepper actor 텍스트(10px) | `caption`(12/16, 400) |

- 위계는 크기를 잘게 쪼개는 대신 **weight / color / spacing**의 조합으로 만든다 — 이는 새 규칙이 아니라 §5.3에서 이미 확정된 원칙("위계는 크기보다 색 대비와 순서로 만든다")을 재확인한 것이다.

## 6. Spacing

4px 기반의 제한된 scale을 사용한다.

| Token | 값 | 사용 예 |
|---|---:|---|
| `space-0` | 0 | reset |
| `space-1` | 4px | icon 내부, 촘촘한 inline |
| `space-2` | 8px | 작은 gap |
| `space-3` | 12px | control 간격 |
| `space-4` | 16px | 모바일 gutter, 카드 소 padding |
| `space-5` | 20px | 기본 card padding |
| `space-6` | 24px | desktop card/dialog padding |
| `space-8` | 32px | 섹션 간격, desktop page gutter |
| `space-10` | 40px | 큰 섹션 |
| `space-12` | 48px | empty state/상단 여백 |
| `space-16` | 64px | 마케팅 대섹션 한정 |

규칙:

- 제품 page gutter: mobile 16px, tablet 24px, desktop 32px
- 카드 내부: compact 16px, default 20px, roomy 24px
- 폼 field 간격: 20px, label-input 8px, helper 6~8px
- 사진 grid gap: mobile 4~8px, desktop 8~12px
- 고정 하단 action은 콘텐츠 마지막에 자기 높이 + safe area만큼 padding을 확보한다.
- **카드 내부 정보 그룹 간격**: 같은 정보 그룹(예: 프로젝트명+고객명+코드)의 요소 사이는 `space-1`(4px), 서로 다른 정보 그룹 사이는 하나 이상 큰 token으로 띄운다 — 예: Badge↔Project Identity `space-2`(8px), Project Identity↔Headline `space-3`(12px), Headline↔Supporting Text `space-1`(4px), Supporting Text↔Metric `space-6`(24px), Metric↔Action `space-4`(16px). 모든 자리에 같은 gap을 반복해서 카드 내부가 하나의 리스트처럼 보이게 하지 않는다.

## 7. Radius

| Token | 값 | 사용 |
|---|---:|---|
| `radius-none` | 0 | 표, 연결된 segment |
| `radius-xs` | 4px | 사진 썸네일, 작은 badge |
| `radius-sm` | 8px | input, compact button |
| `radius-md` | 12px | 기본 button/card |
| `radius-lg` | 16px | dialog, 큰 panel |
| `radius-full` | 9999px | avatar, status pill, icon button |

규칙:

- 사진 모서리는 작게(`xs`) 유지해 사진 면적을 우선한다.
- 일반 카드와 버튼은 `md`, dialog는 `lg`.
- pill은 상태, avatar, 원형 조작처럼 형태에 의미가 있을 때만 사용한다.
- clip-path CTA와 장식용 비대칭 radius는 제품 화면에서 사용하지 않는다.

## 8. Shadow

dark UI에서는 shadow보다 border와 surface 대비를 우선한다.

| Token | 값 | 사용 |
|---|---|---|
| `shadow-none` | `none` | 기본 카드/사진 |
| `shadow-raised` | `0 8px 24px rgba(0,0,0,.28)` | dropdown, sticky bar |
| `shadow-overlay` | `0 20px 56px rgba(0,0,0,.48)` | dialog |
| `shadow-focus` | `0 0 0 3px rgba(79,126,255,.35)` | focus-visible |

규칙:

- accent glow는 선택·진행 상태의 기본 표현으로 쓰지 않는다.
- 한 surface에 border와 강한 shadow를 동시에 과용하지 않는다.
- 사진 카드 hover 시 이동/확대보다 border 또는 surface 변화만 사용한다.

## 9. Border

| Token | 값 | 사용 |
|---|---|---|
| `border-subtle` | `1px solid #23232A` | section divider, 사진 grid |
| `border-default` | `1px solid #3A3A42` | input, card |
| `border-strong` | `1px solid #52525B` | 강조/hover |
| `border-selected` | `2px solid #FF4D00` | 선택 |
| `border-current` | `2px solid #4F7EFF` | 현재 사진/focus context |
| `border-error` | `1px solid #FF4757` | validation/error |

색이 들어간 2px border는 상태 하나만 표현한다. 동일 요소에 selected와 error가 겹치면 error badge + selected ring처럼 채널을 나눈다.

`border-error`(및 `red-500`/danger 계열)는 실제 Validation Error에만 사용한다. 필수 입력 표시(`*`)는 Error 상태가 아니므로 이 토큰을 재사용하지 않는다 — §29.7 Required Indicator 참고.

> **Provisional(2026-08-24, Dashboard 1개 화면에서만 검증)** — 최근 Dashboard 라운드에서 아래 3개 원칙이 실제로 쓰였다. 방향은 유효해 보이지만 다른 화면으로 아직 검증되지 않아 이 토큰 표 자체(위)는 그대로 두고 주석으로만 남긴다.
> - **Surface-first hierarchy**: 구획을 나눌 때 Border보다 Surface(배경 톤 차이)를 먼저 쓴다.
> - **Default border는 low contrast**: 기본 상태는 `border-subtle`을 쓰고, `border-default`/`border-strong`은 hover/focus/selected/critical일 때만 올린다 — 모든 Card에 동일한 고대비 border를 반복하지 않는다.
> - **Card-in-Card 최소화**: 리스트 안에 항목마다 별도 bordered box를 만드는 대신 Spacing/Divider로 그룹을 구분한다.
>
> Project Detail/Edit Golden Screen은 이 원칙 이전에 만들어져 아직 `border`/`border-strong` 위주다 — 지금 통일하지 않는다(Open Questions 2번).

## 10. Icon 규칙

### 10.1 소스

- 기본: `lucide-react`
- Lucide에 없는 브랜드/특수 아이콘만 `@iconify/react`
- 같은 의미에 SVG 직접 작성과 Lucide를 혼용하지 않는다.

### 10.2 크기

| 용도 | 크기 |
|---|---:|
| compact inline | 14px |
| field/label | 16px |
| 기본 button/nav | 18px |
| icon button | 20px |
| 주요 empty/status | 24px 또는 32px |

기본 stroke는 2, 작은 14px 아이콘은 2~2.25를 허용한다.

### 10.3 의미

- 아이콘만 있는 버튼은 `aria-label`과 tooltip을 제공한다.
- 동일 행동에는 동일 아이콘을 사용한다.
- 상태는 아이콘 + 텍스트를 기본으로 하고 아이콘만으로 전달하지 않는다.
- 별점은 Lucide star 또는 일관된 SVG 한 종류를 사용하고 `★/☆` 문자와 혼용하지 않는다.
- 파괴 행동은 휴지통 아이콘 + 명시적 동사(`사진 삭제`)를 사용한다.

### 10.4 Custom SVG 허용 기준(2026-08-21 확정)

기본 정책은 그대로 `lucide-react` 우선이다. Custom SVG는 아래 세 조건 중 하나를 만족할 때만 허용한다.

1. Lucide에 적절한 의미의 아이콘이 없는 경우
2. A-CUT 고유 기능을 표현하는 경우(예: 셀렉/보정 같은 제품 특화 개념)
3. 브랜드 고유 visual language가 반드시 필요한 경우(로고 등)

**Location/Edit/Copy/Calendar/Chevron처럼 범용적인 UI 아이콘은 위 조건에 해당하지 않으므로 Lucide를 사용한다.** Golden Screen과 동일하게 보이도록 맞추기 위한 목적만으로 Custom SVG를 추가하지 않는다.

아이콘의 크기(§10.2)·색·시각적 무게는 Custom 여부와 관계없이 항상 Design System token(크기 scale, `text-tertiary`/`text-secondary` 등 semantic text color)으로 제어한다 — 아이콘 전용 색상이나 stroke 값을 새로 만들지 않는다.

### 10.5 Golden Screen 아이콘 시스템과의 관계

Golden Screen 시리즈(#1~#8)는 자체 SVG symbol 세트를 `stroke-width: 1.75`로 통일해 사용해왔다(체크·수정·더보기·뒤로가기·경고·위치 아이콘 등). 이는 프로토타입 단계의 시각 실험이며, §10.1(lucide-react 우선)·§10.2(기본 stroke 2, 14px만 2~2.25 허용) 규칙을 대체하지 않는다. 실제 구현 시:

- Lucide에 대응 아이콘이 있는 항목(수정=`Pencil`, 복사=`Copy`, 위치=`MapPin`/`LocateFixed` 계열, 캘린더=`Calendar`, 화살표/chevron=`ChevronRight` 등)은 Lucide로 전환한다.
- stroke-width는 Lucide 기본값과 §10.2 규칙을 따르고, Golden Screen의 1.75 값을 그대로 가져오지 않는다.
- A-CUT에 실제로 대응 개념이 없는 아이콘(예: 셀렉 상태 전용 마크)만 §10.4 기준으로 Custom SVG 유지를 검토한다.

## 11. Responsive breakpoint

| 이름 | 범위 | 목적 |
|---|---|---|
| `mobile` | `< 768px` | 단일 열, touch 중심 |
| `tablet` | `768–1023px` | 좁은 다열/압축 sidebar |
| `desktop` | `1024–1439px` | 전체 작업공간 |
| `wide` | `≥ 1440px` | column 증가, 콘텐츠 폭 cap |

Tailwind 대응:

- base: mobile
- `md`: 768px
- `lg`: 1024px
- wide 전용 규칙: CSS media/container query 1440px 이상

Tailwind 기본 `2xl`은 1536px이므로 1440px wide 전환과 같은 의미로 혼용하지 않는다.

규칙:

- CSS layout은 media query/Tailwind를 우선한다.
- JS `innerWidth` 분기는 가상화 계산, gesture, 렌더 비용처럼 실제 동작 차이가 있을 때만 사용한다.
- 동일 화면의 mobile/desktop DOM을 완전히 복제하지 않는다. 한 정보 구조에서 layout을 바꾸는 것을 우선한다.
- desktop 최대 content width는 일반 1600px, 설정/폼 960px, 읽기 본문 720px을 기본으로 한다.
- 고객 photo workspace는 viewport를 채울 수 있으나 safe area를 포함한다.

## 12. Accessibility

### 12.1 기본

- 문서 `lang="ko"` 유지
- viewport의 `maximumScale: 1` 제거 대상
- 의미 있는 텍스트 12px 이상
- 일반 텍스트 WCAG AA 4.5:1, 큰 텍스트/아이콘 3:1 이상
- 핵심 행동 touch target 최소 44×44px, 모바일 primary CTA 높이 48px

### 12.2 Keyboard/focus

- 모든 조작은 Tab/Shift+Tab/Enter/Space로 가능해야 한다.
- `:focus-visible`에 `action-focus` 2px outline 또는 `shadow-focus`를 제공한다.
- `outline: none`만 적용하지 않는다.
- 사진 grid에서 방향키 탐색을 도입할 경우 roving tabindex를 한 패턴으로만 구현한다.

### 12.3 Form

- label과 control을 `htmlFor/id`로 연결한다.
- helper/error는 `aria-describedby`로 연결한다.
- 오류 입력은 `aria-invalid=true`.
- placeholder를 label 대신 사용하지 않는다.
- 색상 태그는 색 이름을 accessible name으로 제공한다.

### 12.4 Dialog/menu/toast

- dialog: `role="dialog"`, `aria-modal`, title 연결, 최초 focus, focus trap, Escape, trigger focus 복귀
- menu: trigger의 `aria-expanded`, keyboard 이동
- toast: 성공은 `aria-live="polite"`, 실패/중요 오류는 `role="alert"`
- backdrop 클릭만 유일한 닫기 수단으로 만들지 않는다.

### 12.5 Photo

- 실제 사진은 파일명 또는 의미 있는 위치명으로 alt를 제공한다.
- 같은 사진이 작은 preview로 반복되면 맥락에 따라 빈 alt를 허용한다.
- Link 안에 button을 중첩하지 않는다.
- 선택, 현재, 오류, 승인 상태를 색 + 아이콘/텍스트로 표현한다.

### 12.6 Motion

`prefers-reduced-motion: reduce`에서 반복 animation, parallax, marquee, pulse를 중단한다. 진행률처럼 상태 전달에 필요한 변화는 duration을 거의 0으로 줄이되 값은 유지한다.

## 13. Loading / empty / error / disabled

### 13.1 Loading

| 유형 | 사용 | 표현 |
|---|---|---|
| Route loading | 페이지 최초 진입 | page skeleton 또는 중앙 loader |
| Content loading | 카드/표/사진 일부 | 실제 레이아웃과 같은 skeleton |
| Blocking process | 업로드 준비/전달/확정 | progress + 현재 단계 + 취소 가능 여부 |
| Inline pending | 저장/삭제/필터 | control 내부 spinner + 동사형 label |

규칙:

- 300ms 이내 작업에는 전체 loader를 띄우지 않는다.
- 사진은 중립 surface placeholder를 유지해 grid가 흔들리지 않게 한다.
- 업로드는 파일 수, 성공/실패, 현재 단계, 재시도 가능 여부를 표시한다.
- `SystemLoadingScreen` 같은 장식적 부팅 화면은 일반 route loading에서 사용하지 않는다.

### 13.2 Empty

Empty state 구성:

1. 무엇이 비어 있는지
2. 왜 비어 있는지 또는 정상 상태인지
3. 다음 행동 하나

예:

- 프로젝트 없음 → `첫 프로젝트 만들기`
- 필터 결과 없음 → `필터 초기화`
- 아직 코멘트 없음 → CTA 없이 조용한 placeholder

빈 상태에 오류색을 사용하지 않는다.

### 13.3 Error

| 범위 | 표현 |
|---|---|
| Field | control 아래 error text |
| Action | toast 또는 action 영역 inline error |
| Section | section 안 error panel + 재시도 |
| Page | route error state + 돌아가기/재시도 |
| Partial batch | 성공/실패 수와 실패 파일 목록 |

오류 메시지는 `실패했습니다`만 쓰지 않고 대상과 복구 행동을 말한다.

### 13.4 Disabled/read-only/pending

- `disabled`: 조건상 실행 불가. 이유를 인접 텍스트로 설명
- `read-only`: 값을 볼 수 있지만 변경할 수 없음. disabled보다 정상 대비를 유지
- `pending`: 요청 처리 중. label을 `저장 중…`처럼 변경하고 중복 실행 차단
- `locked`: 프로젝트 상태 때문에 접근 불가. lock icon + 언제 가능한지 표시

opacity만으로 네 상태를 구분하지 않는다.

## 14. Animation과 transition

### 14.1 Duration

| Token | 값 | 사용 |
|---|---:|---|
| `motion-fast` | 120ms | hover, color, focus |
| `motion-default` | 180ms | button, tab, 작은 panel |
| `motion-expand` | 240ms | sheet, accordion, sidebar |
| `motion-progress` | 300ms | progress width 보간 |

300ms를 넘는 제품 UI transition은 원칙적으로 사용하지 않는다. 랜딩의 마케팅 animation은 별도다.

### 14.2 Easing

- enter/move: `cubic-bezier(0.2, 0, 0, 1)`
- exit: `cubic-bezier(0.4, 0, 1, 1)`
- color/opacity: `ease-out`
- progress: `linear` 또는 값 변화가 명확한 `ease-out`

### 14.3 허용/제한

허용:

- 색/opacity 변화
- dialog/sheet 8~16px 이내 이동
- 선택 check의 짧은 scale
- progress width

제한:

- 사진 hover에서 큰 zoom
- 상태 badge의 무한 ping
- 제품 배경 scanline/glitch/marquee
- CTA hover의 큰 translate/scale
- 여러 glow가 동시에 반복되는 효과

## 15. 기존 구현 재사용 지도

### 유지하며 정렬

| 현재 구현 | 재사용 이유 | 정렬할 부분 |
|---|---|---|
| `StatusPill` | preparing 세분화와 상태 분기 로직 | actor별 label/tone을 중앙 모델에서 주입 |
| `PhotographerModal` | desktop center/mobile full-screen 구조 | focus trap, Escape, token, sheet variant |
| `PageLoader` | full/inline 구분 | loader 시각 단순화, reduced motion |
| `FieldInfoTip` | portal, hover/focus, 위치 계산 | token 이름과 tooltip contract |
| `PrevNextButton` | 사진 이동 의미가 명확 | 크기/색/focus token |
| `MobileViewerPinchPhoto` | 모바일 사진 제스처 | `PhotoViewer` capability로 포함 |
| `GalleryPhotoCard`의 thumb queue | 대량 이미지 성능 | 카드 구조에서 Link/button 중첩 제거 |
| upload/gallery virtualizer | 대량 사진 처리 필수 | `PhotoGrid` layout contract로 감쌈 |
| `SelectionContext`, `ReviewContext` | 고객 상태 유지 | presentational component와 분리 유지 |

### 통합 후보

- `ProjectProgressBar`, `ProjectPipelineMiniBar`, `ProjectActionFlow` → `ProjectStatus` + `WorkflowStep`
- 여러 full-screen/lightbox → `PhotoViewer`
- 페이지별 toast/alert → 공통 Toast
- 페이지별 modal overlay → Dialog/Sheet
- 페이지별 photo card → `PhotoThumbnail`
- ~~대시보드/프로젝트 목록의 D-day pill, `WorkflowPageClient`의 로컬 `StatusBadge`~~ → §18 `Badge`로 통합 완료(2026-08-21)
- (2026-08-21 Dashboard 패턴 분석 추가, 아직 미착수 — §26.3 Implementation Follow-up 참고) `PhotoProjectCard`의 인라인 썸네일 → §19 `ProjectThumbnail`(compact/card/focus variant)
- (미착수) 화면마다 흩어진 숫자 표시 → §20 Metric(Value/Unit/Label 3단 typography)
- (미착수) `PhotoProjectCard` 등의 이미지+정보 조합 → §21 Project Card 패턴(단, Turn/Action 줄은 실제 구현에 아직 없음)
- (미착수, 신규 컴포넌트) Dashboard "우선 확인할 프로젝트" → §22 Focus Project — 실제 코드에는 대응 컴포넌트 자체가 없다
- (미착수) 실제 "사용량 패널" → §24 Usage Summary(플랜명/잔여량 상시 노출 여부가 다름)
- (미착수) 실제 "최근 활동 패널"(프로젝트별 그룹화) → §25 Activity List(flat 구조) — 구조 자체가 달라 단순 스타일 정렬로 끝나지 않을 수 있음

### 마케팅에만 유지 가능한 표현

- Space Grotesk/Space Mono의 브랜드 로고
- grid background, bracket, scanline
- 큰 장식 animation

제품 작업 화면에서는 기본값으로 사용하지 않는다.

## 16. 초안 적용 우선순위

1. semantic color, type, spacing, focus token
2. ProjectStatus 상태/문구 모델
3. PhotoThumbnail + PhotoGrid
4. Dialog/Toast와 loading/error state
5. 고객 갤러리
6. 작가 업로드
7. 관리자 프로젝트 목록
8. 작가 workflow와 고객 review

이 순서는 디자인을 전부 교체하기 위한 것이 아니라, 재사용 효과와 핵심 흐름 위험도를 함께 고려한 것이다.

## 17. Navigation / LNB (작가 전용)

> 근거: `src/components/layout/Sidebar.tsx`, `Sidebar.module.css`, `PhotographerDesktopShell.tsx` — 2026-08-20 개편.
> 적용 범위: `/photographer/*` 전용. 고객 공유 화면(`/c/[token]/*`)과 관리자(`AdminSidebar`)는 별도 컴포넌트이며 이 절의 대상이 아니다.

### 17.1 구조

공통 Shell(`PhotographerDesktopShell`)이 `/photographer/*` 전체를 감싸며, 사이드바 코드는 페이지마다 복제되지 않고 이 한 곳에서만 관리된다.

| 상태 | 폭 | 트리거 |
|---|---:|---|
| Expanded | 266px | 기본값 |
| Collapsed | 102.5px | 우측 토글 버튼, 또는 프로젝트 상세 루트(`/photographer/projects/[id]`) 진입 시 자동 |

레이아웃 순서(위→아래): 로고 + 접기 토글 → Primary Navigation(`PHOTOGRAPHER_NAV_ITEMS`) → **Active Project Usage** → **Profile(Popover)**. 축소 상태에서도 A 로고를 최상단 브랜드 진입점으로 유지한다. 접기/펼치기 버튼은 사이드바 오른쪽 경계의 같은 세로 위치에 고정해 폭 전환 중 가로로만 움직이며 로고와 겹치지 않게 한다.

### 17.2 프로젝트 생성 진입점

- LNB에는 `새 프로젝트`를 넣지 않는다. Dashboard와 Project List가 제공하는 화면별 Primary CTA를 사용해 한 화면에서 같은 행동이 반복되거나 주황 CTA가 경쟁하지 않게 한다.
- 프로젝트 생성 경로는 `/photographer/projects/new`를 유지하며, LNB는 이동과 계정 맥락에만 집중한다.

### 17.3 Navigation Item

- 항목 구성은 `src/lib/photographer-nav.ts`의 `PHOTOGRAPHER_NAV_ITEMS`가 유일한 source — 대시보드 / 프로젝트 / 고객관리(준비중) / 통계(준비중). 매뉴얼은 메뉴에 노출하지 않는다.
- 행은 높이 50px, 간격 6px, radius 10px이며 44px 아이콘 영역과 15/22px Semibold 라벨을 사용한다.
- Active: 기본 전경 라벨 + White surface + 좌측 안쪽 3px Orange indicator, 아이콘만 Orange로 강조한다. Hover: `surface-hover`. Disabled(준비중): `text-disabled` + 작은 보조 문구, 클릭 불가.
- Collapsed에서도 각 항목은 `title`/`aria-label`로 의미를 유지한다(툴팁 대체).

### 17.4 Active Project Usage

- `usePhotographerQuota()`(`src/lib/use-photographer-quota.ts`, `GET /api/photographer/quota` 재사용) 기반 실데이터 — 하드코딩 없음.
- 표기: `활성 프로젝트` + `{current}/{max}` + 4px progress bar. 별도 카드 테두리와 배경은 두지 않는다. `max === null`(admin, 무제한)이면 표시하지 않는다.
- 색상: 80% 미만 `text-secondary`(중립), 80~99% `action-primary`, 100% 이상 `red-500` — Dashboard 사용량 패널과 동일한 임계값.
- Collapsed에서는 숨김(기존 "세션 활성" 텍스트와 같은 progressive disclosure 원칙).

### 17.5 Profile Popover

- 트리거: 하단 프로필 행(40px radius 12 아바타 + 이름 + tier + disclosure chevron). Tier 라벨은 quota API의 실제 `tier`(`admin`/`beta`/`general`) 기반이며 "Basic" 등 임의값을 쓰지 않는다.
- 위치: 트리거 바로 위(`bottom-full` anchor) — 모달이 아니라 Popover.
- Popover는 expanded navigation content와 같은 218px 폭, radius 12px, padding 8px을 사용한다.
- 항목: 이메일(읽기 전용) → 설정(`/photographer/settings`) → 문의하기(기존 `FeedbackButton` 재사용) → 로그아웃.
- 구현: `<details>/<summary>`를 완전 제어형으로 사용(`ProjectInformationCard`의 더보기 메뉴와 같은 네이티브 패턴 재사용, 새 dropdown primitive를 만들지 않음). `open` state를 직접 들고 있어 **Escape로 닫기, 바깥 클릭으로 닫기, Sidebar가 collapse될 때 자동으로 닫기**를 모두 처리한다 — 네이티브 `<details>` 단독으로는 이 세 가지가 되지 않아 최초 구현에서 실제로 발견된 버그.

### 17.6 Secondary Navigation — 구현하지 않음

기획안에는 프로젝트 진입 시 "← 홈으로 / 프로필 / 알림 / 사용량"으로 구성된 하위 네비게이션이 있었으나, 현재 서비스에 대응하는 실제 라우트/기능(프로젝트 범위의 알림·사용량 탭)이 없어 **구현하지 않았다**. Figma에 있다는 이유로 없는 기능을 새로 만들지 않는다는 원칙에 따른 것이며, 필요해지면 별도 기능 정의 후 이 절에 추가한다.

## 18. Badge (Status / Attention / Time)

> 근거: `src/components/ui/Badge.tsx` — 2026-08-21 도입. 기존에 화면마다 흩어져 있던 상태/기한 pill(대시보드·프로젝트 목록의 D-day, `WorkflowPageClient`의 로컬 `StatusBadge`, 목록의 "완료"/"납품완료" pill 등)을 하나의 공통 semantic 규칙으로 정렬한 것 — §4.5에서 이미 정의돼 있던 색 의미를 실제로 컴포넌트에 연결한 것이며, 새 색은 추가하지 않았다.

### 18.1 세 가지 Type

| Type | 의미 | 예시 |
|---|---|---|
| **Status Badge** | 현재 Workflow가 어떤 상태인가 | 고객 셀렉 중, 보정, 1차 수정, 재보정 요청, 납품 대기, 완료 |
| **Attention Badge** | 사용자의 주의·Action이 필요한가 | 안내 필요, 확인 필요, 마감 임박, 마감 초과 |
| **Time Badge** | 기간/시점 정보 | 요청 후 2일, 확정 후 4일, D-2, D+2 |

### 18.2 Semantic Color Mapping

Badge는 개별 화면에서 색을 직접 고르지 않고 아래 `tone`만 사용한다. §4.5의 Semantic feedback/status 표와 동일한 의미 체계다. `status-customer`는 2026-08-21부터 `--primary`(Blue) 대신 `cyan-500`(§30 Workflow Semantic 참고)을 쓰도록 갱신했다 — 이 문서 전체에서 Customer Actor 색이 추가된 유일한 신규 primitive이며, 그 외 tone은 기존 `--accent`/`--success`/`--warning`/`--danger`/neutral surface를 그대로 재사용한다.

| `tone` | Type | 색 | Tailwind | 예시 |
|---|---|---|---|---|
| `status-photographer` | Status | Orange(`--accent`) | `bg-accent/10 text-accent border-accent/20` | 보정, 1차 수정, 2차 수정, 재보정, 업로드 필요 |
| `status-customer` | Status | Cyan/Porcelain(`cyan-500`, §30) | `bg-[cyan-500]/12 text-[cyan-500] border-[cyan-500]/32` | 고객 셀렉 중, 고객 확인 중, 납품 대기 |
| `status-success` | Status | Green(`--success`) | `bg-success/10 text-success border-success/20` | 완료, 확정, 납품완료 |
| `attention-warning` | Attention | Amber(`--warning`) | `bg-warning/10 text-warning border-warning/20` | 안내 필요, 확인 필요, 마감 임박 |
| `attention-critical` | Attention | Red(`--danger`) | `bg-danger/15 text-danger border-danger/30` (critical만 대비를 조금 더 강하게 허용) | 마감 초과, 기한 초과 |
| `time` | Time | Neutral(Gray) | `bg-surface-raised text-subtle-foreground border-border-subtle` | 요청 후 2일, 확정 후 4일, D-5(여유 있음) |

규칙: 같은 의미의 Badge는 화면이 달라도 항상 같은 `tone`을 쓴다 — 예를 들어 "1차 수정"이 대시보드에서는 `status-photographer`인데 다른 화면에서는 회색 `time`이 되는 식의 불일치를 허용하지 않는다. Orange(`--accent`)는 CTA와 겹치는 색이므로 Status Badge의 photographer-action 의미로만 쓰고, 모든 Badge를 orange로 칠하지 않는다.

### 18.3 Turn Indicator와의 차이

Turn Indicator(지금 누구의 차례인가 — 작가/고객)와 Badge(지금 Workflow가 어떤 상태인가)는 **역할이 다른 별개 개념**이며 하나의 컴포넌트로 합치지 않는다. 현재 코드에는 아직 "Turn Indicator"라는 이름의 단일 공통 컴포넌트가 없고, `StatusPill`의 tone/label이나 각 화면의 actor 기반 문구로 이 개념을 표현하고 있다 — 향후 Turn Indicator를 formalize할 때도 Badge와 시각적으로 구분되는 형태(배경 pill이 아닌 dot+text 등)를 유지해야 한다. 색 의미(작가=Orange, 고객=Cyan/Porcelain — §30 Workflow Semantic 참고)는 Badge의 `status-photographer`/`status-customer`와 **동일하게** 맞춰져 있다 — 같은 의미를 같은 색으로, 다른 컴포넌트로 표현하는 것이 원칙이다. 2026-08-21부터 고객 Actor 색은 Blue가 아니라 Cyan/Porcelain 하나로 통일한다.

### 18.4 Image Overlay 사용 규칙

대표 이미지 위에 Badge를 올릴 때:

- 위치: 이미지 좌측 상단, `top:12px; left:12px`. 여러 개는 수평 배치, 간격 6px.
- Badge를 위한 별도 Row를 만들지 않는다 — 이미지 높이를 늘리지 않고 이미지 내부에 absolute overlay로만 배치한다.
- 사진의 밝기·색상에 관계없이 읽혀야 하므로 Badge 자체 배경(semi-opaque)을 반드시 사용한다. 과도한 shadow/glow는 쓰지 않는다.

### 18.5 Dark Theme Contrast 규칙

- 기본은 subdued background(10~15% opacity) + 선명한 foreground 텍스트 — Solid Primary Button처럼 강한 배경은 피한다.
- `attention-critical`(마감 초과 등 실제 임계 상태)만 예외적으로 배경 opacity를 조금 더 올려(15%) 다른 Badge와 구분되는 대비를 허용한다.
- height 22~24px(`h-6`), font-size 11~12px, font-weight 500~600(critical만 700), padding-inline 8px, radius 6px 전후를 기본값으로 한다.

### 18.6 사용 예시 / 사용하면 안 되는 사례

```tsx
<Badge tone="status-photographer">보정</Badge>
<Badge tone="status-customer">고객 셀렉 중</Badge>
<Badge tone="attention-warning">안내 필요</Badge>
<Badge tone="attention-critical">마감 초과</Badge>
<Badge tone="time">D-2</Badge>
```

사용하면 안 되는 사례:

- 모든 Badge를 `status-photographer`(orange)로 통일해 CTA와 시각적으로 구분되지 않게 만드는 것.
- Time Badge(`time`)에 urgency를 표현하겠다고 orange/red를 직접 지정하는 것 — 기한 임박/초과는 반드시 별도의 Attention Badge(`attention-warning`/`attention-critical`)로 표현한다.
- Turn Indicator와 Badge를 같은 컴포넌트·같은 class로 합치는 것.
- Label+Value가 2줄 이상 필요한 정보(예: "셀렉 마감 · D+2"처럼 상위 label이 함께 필요한 경우)를 억지로 한 줄 Badge(`h-6`)에 욱여넣는 것 — 이런 경우는 Badge 대신 별도 stat 표현을 쓴다(`src/app/photographer/projects/page.tsx` 테이블 뷰의 마감일 열처럼 semantic color만 재사용하고 구조는 유지).

### 18.7 적용 현황

| 화면 | 적용 여부 |
|---|---|
| `src/app/photographer/dashboard/page.tsx` (D-day, 완료 pill) | 적용 |
| `src/app/photographer/projects/page.tsx` (Mobile/Table D-day, 완료·납품완료 pill) | 적용(단, 테이블 뷰 마감일 열은 2줄 구조라 색만 정렬하고 컴포넌트는 유지) |
| `WorkflowPageClient.tsx`의 로컬 `StatusBadge` | 내부 구현만 `Badge`로 위임, 외부 시그니처(`status`/`compact`) 유지 |
| `StatusPill.tsx` | 미적용 — **Implementation Follow-up/Technical Debt**(Design System 규칙의 불확실성 아님, Open Questions 1번). 9개 상태 + 커스텀 dot 애니메이션을 가진 더 큰 컴포넌트로 §15에서 이미 "유지하며 정렬" 대상으로 별도 관리 중. Badge 도입과 무관하게 유지 |
| `ProjectActionFlow.tsx`의 LIVE/YOU ARE HERE | 미적용 — flow 시각화에 종속된 HUD 스타일로 Badge와 다른 패밀리 |
| `UploadVersionsPanel.tsx`의 `StatChip`, upload 페이지의 group badge(`+3` 등) | 미적용 — Status/Attention/Time이 아니라 개수 표시 chip이라 범위 밖 |

## 19. Project Thumbnail

> 근거: A-CUT Golden Screen #8(Dashboard) v1.1에서 여러 차례 조정을 거쳐 확정된 패턴. 실사용처는 `src/app/photographer/dashboard/page.tsx`의 `PhotoProjectCard` 썸네일(구조는 유사하나 세부 규칙 일부가 아래와 다름 — §19.5 참고).

프로젝트 대표 이미지는 장식이 아니라 **프로젝트를 다른 프로젝트와 구분하는 1차 식별 수단**이다. 텍스트만으로 프로젝트를 나열하지 않는다(§3.1의 "사진이 가장 먼저 보인다" 원칙을 프로젝트 목록/카드 레벨로 확장한 것).

### 19.1 Crop / object-fit 정책 — Stable Image Principle(2026-08-24 확정)

여러 화면(Dashboard 내 작업 Card, Focus Project Card)에서 반복 검증된 **Stable** 원칙이다.

- **UI layout이 image container 크기를 결정한다 — 원본 이미지 비율이 layout 크기를 결정하지 않는다.** 이 방향이 확정 기준이며, 아래 §19.2(정확한 px/비율 값)는 이 원칙을 특정 화면에 적용한 Page-specific/Provisional 사례일 뿐이다.
- Portrait/Landscape/Square 원본 모두 **같은 container**를 그대로 쓴다. `object-fit: cover` + `object-position: center`를 기본으로 한다.
- 원본 비율 때문에 Card 높이가 바뀌지 않는다. Pager/Carousel로 항목을 넘겨도 이미지 크기·Card 높이가 움직이면 안 된다(layout shift 금지) — Focus Project에서 여러 라운드에 걸쳐 Playwright로 반복 검증된 부분이다.
- 임의의 고정 가로형(예: 16:9) crop을 강제하지는 않는다. 실제 사진은 인물 중심 세로 구도부터 풍경 위주 가로 구도까지 섞여 있으므로, container 비율 자체는 화면 목적에 맞게 고르되 한 번 정하면 사진마다 바꾸지 않는다.
- 세로 강제 크롭(과도하게 좁고 긴 컨테이너)을 만들지 않는다 — 3:2 ~ 4:3 사이의 자연스러운 landscape 계열을 기본값으로 한다.

### 19.2 Variant — Page-specific / Provisional

> 아래 표의 정확한 비율·px 값은 Global Stable 규칙이 아니라 **특정 화면에서 19.1 원칙을 적용한 사례**다. 다른 화면에 그대로 이식하기 전에 그 화면에서 다시 검토한다.

| Variant | 비율/크기 | 사용처 | 비고 |
|---|---|---|---|
| `compact` | 3:2, 폭 가변(grid column 기준) | Project Card(§21, Provisional)의 대표 이미지 | 카드 폭에 맞춰 유동, 고정 px 폭을 만들지 않는다 |
| `card` | 3:2, 목록/그리드 상단 전체 폭 | Project List의 grid 카드 썸네일(`PhotoProjectCard`) | 기존 구현과 비율 동일(3:2) — 이미 정렬돼 있음 |
| `focus` | 4:3 | Focus Project(§22, Page-specific)의 대표 이미지 | **2026-08-24 정정**: 이전 판(v0.2)은 "폭 고정 + 내용이 늘면 이미지 높이도 늘어난다"고 서술했으나, 실제 확정 방향은 반대다 — **Card 높이를 고정하고 이미지는 그 고정 높이에서 폭이 파생**되며, 콘텐츠 분량과 무관하게 이미지 크기가 절대 변하지 않는다(19.1 "layout shift 금지" 원칙 그대로). 정확한 px 값은 §26 Dashboard Page Pattern 실사용처를 따른다. |

세 variant는 같은 `ProjectThumbnail` 컴포넌트의 크기/역할 차이이며, crop 정책(19.1)과 fallback(19.3)은 공유한다.

### 19.3 Fallback

대표 이미지가 없는 프로젝트는 중립 배경(`surface-raised`) 위에 프로젝트명 이니셜(1~2자)을 두는 placeholder를 사용한다. Placeholder 여부와 관계없이 Card 크기/레이아웃은 동일하게 유지한다 — 이미지 유무로 카드 높이가 들쭉날쭉해지지 않는다.

### 19.4 Badge Overlay

이미지 위에 상태 Badge(§18)를 올릴 때는 §18.4의 규칙을 그대로 따른다(좌측 상단 12px, Badge 간 6px, 별도 Row를 만들지 않고 이미지 높이를 늘리지 않는 absolute overlay). Badge가 이미지의 핵심 피사체(보통 중앙)를 가리지 않도록 좌측 상단 한 자리에만 배치하고, 다른 모서리에 추가 정보를 겹쳐 넣지 않는다.

### 19.5 실제 구현과의 차이 (Implementation Follow-up 후보)

`PhotoProjectCard`(dashboard/page.tsx)는 이미 3:2 비율 + `object-cover` + Badge overlay(§18 `Badge` 사용 중)까지는 이 절과 일치한다. 다만 프로젝트명/고객명을 이미지 **하단에 gradient scrim으로 얹는 방식**을 쓰고 있어, §21에서 확정한 "이미지 아래 별도 영역에 표시" 방식과 다르다 — 어느 쪽을 표준으로 할지는 §26의 Follow-up 항목으로 남긴다(지금 바로 통일하지 않음).

## 20. Metric Typography

> §5.3 "Metric Label/Metric Value/Metric Supporting" 행을 그대로 계승하며, 이번 절은 그 값이 **자릿수가 변해도 깨지지 않아야 한다**는 규칙을 추가한다.

Metric(작업량/요청량 등 숫자)은 일반 body 텍스트가 아니라 전용 3단 구조로 표현한다.

| 요소 | Type token | Text color | 비고 |
|---|---|---|---|
| Metric Value | `card-title`(16/24, 600) + `font-mono` | `text-primary` | 가장 높은 visual hierarchy. §5.3과 동일 |
| Metric Unit(단위, "장" 등) | `caption`(12/16, 400) | `text-secondary` | Value보다 명확히 작게, Value 뒤에 붙인다 |
| Metric Label(성격, "업로드 대상"/"재보정 요청" 등) | `caption`(12/16, 400) | `text-tertiary` | §5.3의 Metric Label과 동일 |

규칙:

- 1자리(`3장`)부터 5자 이상(`10,000장`, `1,000 / 2,000장`)까지 같은 컴포넌트로 소화해야 한다. 검증 시 최소 이 범위의 샘플 데이터를 함께 확인한다.
- Value는 `white-space: nowrap`으로 자체는 줄바꿈되지 않게 하되, Value를 담는 컨테이너에 고정폭을 주지 않는다 — 옆에 다른 정보(Current Action 등)가 있다면 그 정보 쪽을 `flex: 1; min-width: 0`(줄바꿈 허용)으로 두고 Metric 쪽을 `flex: none`으로 둬서, Metric이 항상 자기 폭만 차지하고 다른 정보를 밀어내거나 밀려나지 않게 한다.
- 여러 Metric을 나란히 둘 때(예: Focus Project의 "셀렉 마감일"/"셀렉 요청") 배경 상자로 구분하지 않는다 — `space-8`(32px) 이상의 여백만으로 그룹을 구분한다(§6 "카드 내부 정보 그룹 간격" 원칙과 동일).
- Metric에는 별도 Label을 붙이지 않아도 되는 경우가 있다 — 바로 옆/위의 Current Action(§21.3) 문구가 이미 그 Metric이 무엇인지 설명하고 있다면 Label을 생략해 정보 중복을 피한다(예: "1차 재보정" 옆의 숫자는 "재보정 요청" Label 없이 숫자만 표기).

## 21. Project Card

> **Provisional(2026-08-24)** — Dashboard "내 작업"(`WorkProjectCard.tsx`) 1개 화면에서만 검증됐다. 여러 화면에서 재검증되기 전까지 Global Stable Component로 승격하지 않는다. 현재 Project List(`projects/page.tsx`)의 grid/list 카드와는 정보 항목이 겹치지만 레이아웃이 다르다 — §21.5에서 비교한다.

### 21.1 구성 순서

```
대표 이미지(§19 compact/card) — 위에 Status/Time Badge(§18) overlay
Project Name
Customer Name · Project Code
Current Turn / Action
Metric(§20, 있는 경우)
```

### 21.2 정보 위계

| Level | 정보 | Type token | Text color |
|---|---|---|---|
| 1 | Project Name | `label`(13/18, 600) | `text-primary` |
| 2 | Customer Name | `body-sm`(14/20, 400) | `text-secondary` |
| 3 | Current Turn / Action | 아래 21.3 참고 | — |
| 4 | Project Code | `caption`(12/16, 400) | `text-tertiary` |
| Metric | §20 | §20 | §20 |

Project Name과 Customer Name/Project Code 사이는 `space-1`(같은 그룹, §6), Identity 그룹과 Turn/Action 사이는 그보다 큰 token(`space-3` 이상)으로 띄운다. 고객명을 Project Code와 같은 tertiary 톤으로 낮추지 않는다 — 실제 작업 상대를 식별하는 정보이기 때문이다(§5.3에서 이미 정의된 원칙).

**Project Code hierarchy는 맥락에 따라 달라진다(2026-08-21 확정)** — Project Code가 항상 tertiary인 것은 아니다.

| Context | 설명 | Hierarchy |
|---|---|---|
| A. Header/Identity Metadata | Project Name을 보조하는 인라인 식별 정보로 노출될 때(예: 위 표처럼 Project Name 아래 한 줄로 붙는 경우) | `caption`(12/16, 400) + `text-tertiary` — 이 표의 정의 그대로 |
| B. Labeled Information Field | "프로젝트 번호"라는 명시적 Label이 붙은 독립 필드로 노출될 때(§27 Information Grid 안의 한 필드 등) | 다른 일반 Value와 동일한 hierarchy(§27의 Value 토큰) — tertiary로 낮추지 않는다 |

같은 값(Project Code)이라도 "이름을 보조하는 부가 정보"로 보여줄 때와 "정식 정보 필드"로 보여줄 때는 정보 구조상의 역할이 다르므로 시각 위계도 다르게 가져간다.

### 21.3 Turn Indicator (Current Turn / Action)

Turn Indicator는 §18.3에서 이미 "Badge와 다른 별개 개념"으로 정의돼 있다. Project Card 안에서는 두 줄로 표현한다.

| 줄 | 내용 | Type token | Text color |
|---|---|---|---|
| Turn | "● 작가" 또는 "● 고객" — dot + 배경 없는 텍스트 | `caption`(12/16, 400) | `text-tertiary`(dot 색만 작가=`action-primary`(Orange) 계열, 고객=`cyan-500`(Porcelain) 계열 — §30과 동일하게 유지. `text-link`/Blue는 사용하지 않는다) |
| Action | "보정본 업로드" 등 지금 해야/기다리는 일 | `body-sm`(14/20, 400) 또는 `label`(13/18, 600) | `text-secondary` |

Turn 줄은 작게/Secondary로, Action 줄은 그보다 명확히 크거나 강하게 — 하나의 동일한 문장으로 합치지 않는다.

### 21.4 실제 구현과의 차이

`PhotoProjectCard`는 Turn/Action 줄이 없다 — 대신 `stepLabel`(파이프라인 단계 텍스트) + `ProjectPipelineMiniBar`(진행 바)를 쓴다. 이는 §21의 "지금 내가 뭘 해야 하는지"보다 "전체 중 어디까지 왔는지"에 가까운 정보로, 목적이 다르다. 어느 것을 유지/추가할지는 §26 Follow-up 항목 3번으로 남긴다.

### 21.5 Project List와의 관계

Project List(`projects/page.tsx`)의 카드/행은 "전체 프로젝트를 관리·필터링"하는 화면이라 Pipeline 진행바 + `StatusPill`(9개 세분화 상태) 중심으로 이미 잘 맞는 목적을 가지고 있다. 이 절의 Project Card 패턴을 Project List에 그대로 이식하라는 뜻이 아니다 — Dashboard의 "지금 처리할 작업" 맥락에서 확정된 패턴이며, Project List에 적용할지는 별도 판단이 필요하다(§26).

## 22. Focus Project (Priority Project)

> **Page-specific(2026-08-24 재분류)** — 이 절은 Global Reusable Component가 아니라 **Dashboard Page Pattern**이다(§26과 같은 성격). "우선 확인할 프로젝트"에서 확정된 패턴이며, 목적은 "사용자가 지금 가장 먼저 처리해야 하는 한 가지"를 명확히 전달하는 것 — 일반 Project Card(§21, 마찬가지로 Provisional)와 역할이 다르므로 별도 패턴으로 정의한다. 아래 8단 위계는 여러 라운드의 재설계를 거치며 실제 구현(`FocusProjectCard.tsx`)과 세부 순서가 달라진 부분이 있다 — 지금은 그 차이를 통일하지 않고, 실제 컴포넌트를 source of truth로 둔다.
>
> **Customer Name 색상에 대한 안내**: `FocusProjectCard.tsx`는 현재 고객명에 Porcelain 색을 적용하고 있으나, 이는 **Global Stable Rule로 승격되지 않는다** — §30에서 확정한 대로 Porcelain은 기본적으로 Customer Actor semantic(Turn/Badge/Dot/Status)에 사용하며, 고객명 같은 일반 Identity Text는 기본적으로 Neutral을 쓴다. 이 컴포넌트의 Porcelain 적용은 Page-specific/Provisional 선택으로만 유지한다(Open Questions 4번).

### 22.1 정보 위계 (8단)

| 순서 | 정보 | 비고 |
|---|---|---|
| 1 | 상태 Badge(§18, 이미지 overlay) | Status + Attention Badge 조합 가능(예: [고객 셀렉 중][마감 2일 초과]) |
| 2 | 핵심 문제/행동 Headline | §5.3 "Operational Headline"(`card-title`, `text-primary`) — 카드 안에서 가장 먼저 읽히는 한 줄 |
| 3 | Project Name | §5.3 Project Identity(이름) |
| 4 | Customer Name | §5.3 Project Identity(고객명) |
| 5 | Project Code | §5.3 Project Identity(코드) |
| 6 | 상황 설명 | §5.3 Supporting Text |
| 7 | 핵심 Metric(§20, 2개까지) | 예: 셀렉 마감일 D+2 / 셀렉 요청 10장 |
| 8 | CTA(§23) | Primary + Secondary 2단 |

3~5는 하나의 Project Identity 블록(§21.2와 동일한 `.proj-block` 구조)으로 묶고, 2(Headline)보다 명확히 아래 위계로 둔다 — 같은 이름의 블록을 두 컴포넌트(Focus Project/Project Card)가 공유하므로 프로젝트 정보의 "의미 구조"가 화면마다 달라지지 않는다.

### 22.2 대표 이미지

§19 `focus` variant(4:3, 폭 고정 + `min-height`)를 사용한다. Headline~CTA까지의 정보량이 늘어나 Card 자체가 길어지면 이미지도 그 높이만큼 자연스럽게 길어지는 것을 허용한다(Card가 짧은데 이미지만 억지로 늘어나는 것과는 다른 상황) — 다만 반대로, 정보량이 줄었다고 해서 이미지 크기가 함께 줄어들지 않도록 `min-height`로 하한을 고정한다.

### 22.3 CTA

§23 CTA Hierarchy를 그대로 따른다. Primary Action 문구는 화면·상황별로 실제 기능명과 일치시켜 확정하며(예: "알림톡 다시 보내기" — 실제 발송 채널이 알림톡이므로), 이미 확정된 문구를 임의로 바꾸지 않는다.

### 22.4 여러 개의 Focus Project

우선 확인할 프로젝트가 여러 개일 때, 다음 항목이 살짝 보이는 방식(peek)과 소형 pager(`‹ 1/3 ›`)로 "더 있음"을 알린다. 페이지네이션 숫자만으로 표현하지 않는다.

## 23. CTA Hierarchy — Stable Semantic Rule

> §4.4 Semantic action의 색 정의를 그대로 쓰되, 이번 절은 화면 안에서 **몇 단계의 강조도**를 어떻게 나누는지를 추가한다. 새 색은 정의하지 않는다.

| Tier | 표현 | 색/token | 예 |
|---|---|---|---|
| Primary | Solid fill 버튼 | `action-primary`(§4.4) | "알림톡 다시 보내기" |
| Secondary | **Neutral Surface / Raised Surface**(배경 채움), Primary와 **같은 높이** | `action-secondary`(§4.4) | "프로젝트 보기" |
| Utility | Compact bordered chip — 작은 정보 조작 전용, Primary/Secondary와 시각적으로 경쟁하지 않는다 | `text-secondary`/`text-tertiary` + `border-default`, 배경 없음 또는 아주 옅은 subtle 배경 | "복사", "링크 복사", "PIN 복사" |
| Tertiary | 배경 없는 Text Link + 화살표 아이콘 | `text-secondary`, hover 시 `text-primary` | "전체 프로젝트 보기 →" |
| Passive/Waiting | 버튼이 아니라 상태 텍스트(Turn Indicator, §21.3) | `text-tertiary` | "고객 응답 대기" |

**Secondary 표현 기준(2026-08-24 갱신)** — Outline border는 Secondary의 유일한 표현 방식이 아니다. Dark UI에서 모든 Card/Button에 고대비 border를 반복하면 화면이 wireframe처럼 보인다는 문제가 실제로 있었다 — Secondary Action의 기본 표현은 **Neutral Surface 또는 Raised Surface**(주변 Card보다 한 단계 다른 surface 톤으로 채우기)를 우선하고, border는 그 surface 톤 차이를 보조하는 저대비 수준으로만 둔다(§9 Provisional 주석의 low-contrast border 원칙과 연결). Outline만으로 구분하던 이전 표현은 대체됐다.

규칙:

- 한 화면(하나의 시야 영역)에 Primary(Orange fill) 버튼이 여러 번 반복되지 않는다 — §3.4 "한 화면의 주황 primary CTA는 원칙적으로 한 영역에 하나만 둔다"를 Dashboard 카드 여러 개가 동시에 보이는 상황까지 명시적으로 확장한 것. 예: 내 작업 Card들에는 Primary 버튼을 두지 않고(클릭 시 상세로 이동하는 카드 자체가 Action), Focus Project 1곳에만 Primary CTA를 둔다.
- Passive/Waiting 상태(고객 차례라 지금 할 수 있는 행동이 없음)를 disabled 버튼으로 표현하지 않는다 — 버튼 자체를 없애고 Turn Indicator 텍스트로 대체한다.
- Global 진입점(LNB의 "새 프로젝트")과 화면-로컬 Primary CTA는 §17.2에서 이미 정의한 대로 같은 시각 강도를 가지면 안 된다.
- **Utility는 Tertiary와 다른 tier다**(2026-08-21 추가) — Tertiary는 "다른 화면으로의 이동"(내비게이션) 목적의 텍스트 링크이고, Utility는 "지금 이 화면 안에서 끝나는 작은 조작"(복사 등) 목적의 compact chip이다. 같은 시각 형태로 섞어 쓰지 않는다. §31.6 Customer Link Action Group에서 실제 사용 예를 참고.

> Tier 구조(Primary/Secondary/Utility/Tertiary/Passive)와 Secondary의 Surface-fill 기준은 Stable Semantic Rule이다. 다만 정확한 surface 단계(예: `bg-surface` vs `bg-surface-raised`) 같은 세부 시각 spec은 Dashboard Focus Card 1곳에서만 검증됐으므로 Provisional로 남는다(Open Questions 3번).

## 24. Usage Summary

> 근거: Dashboard 우측 사이드바 "활성 프로젝트" 카드. 실제 코드의 "사용량 패널"(`dashboard/page.tsx` 우측 사이드바)과 정보 항목은 이미 겹치지만, 표시 항목 구성이 다르다 — §24.3에서 비교한다.

### 24.1 정보 구성

1. 제목 + 값(같은 줄): "활성 프로젝트" / "{current} / {max}"
2. Progress bar
3. 플랜명 + 잔여량(같은 줄): "{tier} 플랜" / "{max-current}개 남음"

제목/플랜명은 `label`(13/18,600)/`text-primary`, 값은 `card-title` 크기 + `font-mono`/`text-primary`, 잔여량은 `caption`/`text-tertiary` 톤을 사용한다(§5.2·§4.3 재사용, 새 크기 없음). Progress bar 색은 §17.4와 동일한 임계값을 쓴다 — 80% 미만 중립, 80~99% `action-primary`, 100% 이상 `red-500`.

### 24.2 LNB Usage Indicator와의 역할 구분

LNB 하단의 Usage Indicator(§17.4)와 이 Usage Summary는 **같은 데이터(current/max)를 보여줘도 되는 서로 다른 컴포넌트**다.

| | LNB Usage Indicator(§17.4) | Usage Summary(이 절) |
|---|---|---|
| 위치 | Global navigation 하단 | Dashboard 우측 사이드바 |
| 목적 | 어디서나 보이는 간략 quota | 플랜명 + 잔여량까지 보여주는 상세 summary |
| 항목 | 값 + progress bar만 | 값 + progress bar + 플랜명 + 잔여량 |

두 컴포넌트가 같은 수치를 보여준다는 이유로 어느 한쪽을 제거하지 않는다 — 정보가 겹치는 것과 컴포넌트가 중복인 것은 다르다.

### 24.3 실제 구현과의 차이 (Implementation Follow-up 후보)

실제 "사용량 패널"은 제목 행 + 진행바까지는 이 절과 일치하지만, 플랜명(예: 베타/일반)과 잔여량을 명시적인 한 줄로 보여주지 않고 대신 100%/근접 시에만 조건부 경고 box("한도 초과"/"한도 근접")를 보여준다. Usage Summary가 확정한 "플랜 + 잔여량 상시 노출" 방식과는 다른 접근이다 — §26 Follow-up 항목으로 남긴다.

## 25. Activity List

> 근거: Dashboard "최근 활동". Project Card(§21)/Focus Project(§22)와 달리 **history 정보**이므로 현재 상태 정보보다 낮은 visual priority를 가져야 한다 — Badge(§18)를 그대로 가져다 쓰지 않는다.

### 25.1 정보 위계

| Level | 정보 | Type token | Text color |
|---|---|---|---|
| 1(최상위) | Activity Description(무슨 일이 있었는지) | `body-sm`(14/20, 400), weight 600으로 강조 | `text-primary` |
| 2 | Project Name(어느 프로젝트인지) | `caption-strong`(12/16, 600) | `text-secondary` |
| 3(최하위) | Timestamp | `caption`(12/16, 400) | `text-disabled` — §5.3 Metadata 역할과 동일 |

Project Name이 Activity Description보다 굵어서 "무슨 일이 있었는지"보다 "어느 프로젝트인지"가 먼저 읽히게 만들지 않는다 — Dashboard 작업 중 실제로 뒤집혀 있던 실수이자, 이번 절에서 명시적으로 바로잡은 규칙이다.

### 25.2 Actor Indicator(선택)

필요하면 각 항목 좌측에 작은 dot으로 Actor(작가/고객)를 표시할 수 있다(§18.3 Turn Indicator와 같은 색 언어: 작가=Orange, 고객=Cyan/Porcelain 계열 — §30). 다만 Badge(§18)의 pill 형태를 가져오지 않는다 — Activity는 배경이 있는 상태 표시가 아니라 조용한 로그다.

### 25.3 실제 구현과의 차이 (Implementation Follow-up 후보)

실제 "최근 활동 패널"은 **프로젝트별로 그룹화**해 프로젝트 하나당 최대 3개의 액션을 모아 보여주는 구조다(`projectOrder.slice(0, 4)` → 그룹 내 `group.map`). 이 절이 정의한 "활동 1건 = 1행"의 flat list와는 정보 구조 자체가 다르다 — 어느 구조를 표준으로 할지는 UX 판단이 필요한 사안이라 §26 Follow-up 항목으로 남기고 지금 통일하지 않는다. 또한 실제 구현은 프로젝트명(13px/700/`foreground`)이 활동 내용보다 먼저·굵게 나오는 순서라 25.1의 위계와도 다르다.

## 26. Dashboard Page Pattern

> 이 절은 재사용 가능한 Component가 아니라 **Dashboard 화면 전용 Composition**이다. 아래 구조를 다른 페이지(Project Detail, Upload, Workflow 등)에 그대로 적용하라는 뜻이 아니다 — 각 화면은 자신의 목적에 맞는 정보 구조를 가진다.

### 26.1 구조

```
Greeting(인사말 + 오늘 확인 필요 건수)
├─ 우선 확인할 프로젝트 — Focus Project(§22) × N (peek)
└─ 내 작업 — Project Card(§21) × N (grid)

Right Sidebar
├─ Usage Summary(§24)
└─ Activity List(§25)
```

Main:Sidebar 비율은 약 7:3, Sidebar 내부는 Usage Summary와 Activity List를 뚜렷한 여백(`space-8`, §6)으로 분리한다.

### 26.2 재사용 가능한 부분 / Dashboard 전용 부분

| 구분 | 대상 |
|---|---|
| 재사용 가능 Component | Project Thumbnail(§19), Metric(§20), Project Card(§21), Focus Project(§22), CTA Hierarchy(§23), Usage Summary(§24), Activity List(§25), Badge(§18) |
| Dashboard 전용 Composition | Greeting 문구, "우선 확인할 프로젝트 → 내 작업" 순서 자체, 우측 사이드바에 정확히 Usage Summary + Activity List만 두는 조합 |

### 26.3 Implementation Follow-up (승인 후 소급 적용 대상 — 이번 작업 범위 아님)

Dashboard 목업과 실제 구현 사이에서 발견한 명백한 불일치 4건. 지금 바로 수정하지 않는다.

1. **Project Thumbnail 정보 배치(§19.5)**: 실제 `PhotoProjectCard`는 프로젝트명/고객명을 이미지 하단 gradient scrim에 얹지만, 이 문서가 확정한 Project Card(§21)는 이미지 아래 별도 영역에 표시한다. 또한 실제 고객명은 `text-[10px] text-muted-foreground`로 §21.2가 요구하는 `body-sm`/`text-secondary`보다 작고 옅다.
2. **Turn/Action 정보 부재(§21.4)**: 실제 `PhotoProjectCard`에는 Turn Indicator/Current Action 줄이 없고 대신 파이프라인 진행바 + 단계 라벨을 쓴다. Metric(§20, 예: "127장")도 표시되지 않는다.
3. **Usage Summary 항목 차이(§24.3)**: 실제 "사용량 패널"은 플랜명·잔여량을 상시 노출하지 않고 100%/근접 시 조건부 경고 box만 보여준다.
4. **Activity List 구조 차이(§25.3)**: 실제 "최근 활동 패널"은 프로젝트별 그룹화 구조이고 프로젝트명이 활동 내용보다 먼저·굵게 나온다 — 이 문서가 정의한 flat/우선순위와 다르다.

추가로, Badge의 Actor/Turn 축(작가=Orange/고객=Cyan·Porcelain, §30)이 `StatusPill`에는 아직 반영돼 있지 않다(`StatusPill`은 모든 상태를 Orange 농도 변화로만 표현) — §15에서 이미 "유지하며 정렬" 대상으로 관리 중이므로 이번 문서화로 새로 추가하는 항목은 아니지만, §21.3 Turn Indicator 확정을 계기로 다시 언급해 둔다. 2026-08-21 갱신으로 고객 Actor 색이 Blue에서 Cyan/Porcelain으로 바뀌었으므로, `StatusPill`을 향후 정렬할 때는 Blue가 아니라 Cyan 계열을 기준으로 삼는다. **이 미반영은 §30 규칙의 불확실성이 아니라 Implementation Follow-up/Technical Debt다**(문서 상단 Open Questions 1번과 동일 사안, 여기서는 중복 기록하지 않고 참조만 한다).

---

> 아래 §27~§31은 2026-08-21 A-CUT Golden Screen #1(Project Detail/Project Edit) Audit 승인에 따라 신규 추가한 절이다. §27~29는 Part 2(Reusable Components/Patterns), §30은 Part 3(Workflow Semantic), §31은 Part 4(Page Patterns)에 해당한다 — 문서 맨 앞 "문서 구성 안내" 참고.

## 27. Information Grid

> Project Detail "01 기본 정보"에서 확정된 패턴이지만, 특정 화면에 종속되지 않는 **재사용 가능한 Global 패턴**이다. Key-value 정보를 여러 개 나열해야 하는 화면(설정 조회, 상세 정보 패널 등)에서 공통으로 쓴다.

### 27.1 구조

Desktop 기준 3-column grid를 기본으로 한다.

```
Label
Value
(Optional) Secondary Metadata
```

각 필드는 위 3단 구조를 가진다. Secondary Metadata는 있는 필드에만 붙이고 없는 필드에 빈 줄을 만들지 않는다.

### 27.2 Column 정렬

- 정보량에 따라 어떤 행(row)은 3개 필드를 모두 채우고, 어떤 행은 2개 필드만 쓸 수 있다 — 그 경우에도 **전체 column 기준선(각 column의 시작 X좌표)은 모든 행에서 동일하게 유지**한다. 특정 행에서 필드가 비어도 해당 column을 다른 정보로 채우거나 grid 자체를 재배열하지 않는다.
- 값이 있는 인접 필드 사이에만 divider(수직선)를 두고, 빈 칸 옆에는 정렬 유지를 위한 경우가 아니면 불필요한 divider를 만들지 않는다.

### 27.3 Typography

- Label: `caption`(12/16, 400) + `text-tertiary`
- Value: `body-sm`(14/20, 400) 또는 `label`(13/18, 600) + `text-primary`
- Secondary Metadata: `caption`(12/16, 400) + `text-secondary`(Project Code처럼 더 낮춰야 하는 경우는 §21.2 Context 규칙을 따로 참고)

Label과 Value의 대비는 크기 차이보다 **색 대비(text-tertiary vs text-primary)**로 만든다(§5.3 원칙 재사용). 두 값 모두 12px 미만으로 낮추지 않는다(§5.4).

### 27.4 Box 최소화 원칙

각 필드를 개별 Box/Card로 감싸지 않는다. 필드 사이 구분은 **Typography(Label/Value 대비) + Spacing(§6 정보 그룹 간격 원칙) + Divider(column 사이 1px 구분선) + Alignment(column 기준선)** 만으로 표현한다 — §3.4/§6에서 이미 정의된 "장식보다 여백/구분선" 원칙을 표 형태 정보에 적용한 것이다.

## 28. Section Header + Edit Action

> 정보 섹션(예: "프로젝트 정보", "계정 설정" 등)의 시작에 반복적으로 필요한 패턴.

### 28.1 구조

```
Section Title                                   [Edit Action]
──────────────────────────────────────────────────────────────
(섹션 본문)
```

- Section Title과 Edit Action은 한 행에서 좌/우로 배치한다.
- 행 아래 1px divider(`border-subtle`)로 헤더 영역과 본문을 분리해, Title+Action이 "이 섹션 전체의 헤더"라는 것을 명확히 한다 — Edit Action이 다른 인접 영역(예: 옆 패널)에 속한 것처럼 붕 떠 보이지 않게 하기 위함이다.

### 28.2 Edit Action의 위계

Edit Action은 **Primary CTA가 아니라 Utility/Secondary Action**이다(§23). Orange fill 버튼으로 만들지 않는다 — Section Header의 주 목적은 정보 열람이며, 수정은 그 안의 보조 행동이기 때문이다.

## 29. Form Controls

> Create/Edit 화면(Project Edit 등)에서 공통 재사용하는 Form 시각 스펙. 기존 §12.3(Form 접근성 규칙)의 시각적 대응이며, 접근성 규칙(label-control 연결, `aria-describedby`, `aria-invalid` 등)은 그대로 적용한다.

### 29.1 Text Input

- 배경 `surface-default`, border `border-default`, radius `radius-sm`.
- Focus: `border-current` 또는 `shadow-focus`(§8/§12.2) — 별도 focus 색을 새로 만들지 않는다.
- Placeholder는 label을 대신하지 않는다(§12.3 기존 규칙 재확인).

### 29.2 Date Input

- Text Input과 동일한 시각 스펙을 공유한다. 별도 캘린더 아이콘이 필요하면 §10.1에 따라 lucide `Calendar`를 사용한다(Custom SVG 금지 — §10.4 기준에 해당하지 않음).

### 29.3 Segmented Control

- 여러 개의 상호 배타적 선택지를 나열할 때 사용하며, **CTA 버튼처럼 보이지 않아야 한다.**
- Selected: `action-primary` border + subtle wash 배경(`action-primary`의 10~14% opacity) + `action-primary` 텍스트. **Solid fill을 쓰지 않는다** — solid fill은 Primary CTA(§23)의 전용 표현이므로, Segmented Control과 시각적으로 겹치면 "선택"과 "실행"이 구분되지 않는다.
- Unselected: `border-default` + `text-secondary`, 배경 없음.
- 좁은 column에 여러 옵션이 들어가는 경우, 옵션 폭을 균등 분할해 컨테이너 폭을 채운다(옵션 사이 불균일한 여백을 남기지 않는다).

### 29.4 Toggle

- On: `action-primary` 배경. Off: `border-strong`(neutral) 배경.
- Label + Description(좌) / Toggle(우) 한 행 구조를 기본으로 한다 — Toggle만 단독으로 두지 않고 항상 그 Toggle이 무엇을 켜고 끄는지 설명하는 텍스트와 짝을 이룬다.

### 29.5 Numeric Input

- 단위(`장`, `회` 등)가 붙는 숫자 입력은 입력창과 단위를 **하나의 테두리 안**에 붙여 표현한다(입력창과 단위 라벨을 별개의 작은 박스로 쪼개지 않는다).
- 숫자는 `font-mono`를 허용한다(§5.1 "숫자 비교"용 mono 규칙 재사용).

### 29.6 Helper Text

- Input 바로 아래, `caption`(12/16, 400) + `text-tertiary`.
- Disabled/Locked 상태에서는 **"왜" 조작할 수 없는지 이유를 Helper Text로 항상 함께 제공**한다(§13.4 "이유를 인접 텍스트로 설명" 규칙의 Form 적용) — opacity만으로 상태를 표현하지 않는다.

### 29.7 Required Indicator

- 필수 입력 표시(`*`)는 **Danger/Critical 상태가 아니다.** `red-500`/`border-error` 등 Error semantic color를 재사용하지 않는다(§9 갱신 내용 참고).
- 대신 본문보다 살짝 강조되지만 Error로 오인되지 않는 **subdued 톤**을 쓴다 — 새 색상을 추가하지 않고 기존 `text-secondary`(weight 600)로 표현한다. 크기는 label과 동일하게 유지하고 weight만 올려 강조한다(§5.3 "위계는 크기보다 대비로" 원칙 재사용).
- Validation Error가 실제로 발생했을 때만 `red-500`/`border-error`(§4.5/§9 Danger)를 사용한다 — Required 표시와 Error 표시는 서로 다른 semantic이며 같은 색을 공유하지 않는다.

### 29.8 Disabled / Locked State

- `disabled`(§13.4)와 동일한 원칙 — opacity만으로 표현하지 않고 인접 Helper Text(§29.6)로 이유를 설명한다.
- 여러 필드가 같은 이유로 동시에 잠기는 경우(예: "고객 셀렉 완료로 인해 셀렉 수·재보정 횟수 변경 불가"), 각 필드 아래 개별적으로 이유를 반복해도 되고, 같은 논리 그룹(§31.4)이라면 그룹 단위로 한 번만 설명할 수도 있다 — 화면 맥락에 따라 선택한다.

### 29.9 Validation Error State

- Input border를 `border-error`(Danger, §9)로 바꾸고, 아래 Helper Text 색도 `red-500`으로 바꾼다.
- 아이콘을 붙이는 경우 §10.1(lucide) 기준의 경고 아이콘(`AlertCircle` 등)을 쓴다.
- `aria-invalid="true"`, `aria-describedby`로 에러 메시지와 연결한다(§12.3).

## 30. Workflow Semantic — Actor Color

> Dashboard(§18 Badge, §21.3/§25.2 Turn Indicator)와 Project Detail(§31)이 **공통으로 참조하는 단일 기준**이다. 이 절 밖에서 Actor 색을 별도로 재정의하지 않는다.

### 30.1 3-Actor 모델

| Actor | 색 | Primitive | 사용 |
|---|---|---|---|
| Photographer(작가) / Photographer Turn | Orange | `orange-500`(§4.1) | Badge `status-photographer`, Turn Indicator dot, Stepper 현재 단계, Status Panel `photographer-action` variant |
| Customer(고객) / Customer Turn | **Cyan/Porcelain** | `cyan-500`(§4.1, `#9ECAD0`) | Badge `status-customer`, Turn Indicator dot, Stepper 현재 단계, Status Panel `customer-waiting` variant |
| Completed / Passive | Neutral(무채색) | `gray-400`/`text-tertiary` | 완료 상태 아이콘/텍스트. **Orange를 쓰지 않는다** — 완료 후에는 Primary CTA 자체가 없어야 한다(§23 규칙과 연결) |

2026-08-21부터 **Customer Actor 색은 Blue가 아니라 Cyan/Porcelain으로 통일한다.** Blue(`blue-500`/`text-link`/`action-focus`)는 정보/포커스/링크 용도로만 남기고 Actor 의미로는 사용하지 않는다(§4.1/§4.3 갱신 참고).

**적용 범위 명확화(2026-08-24, Stable Semantic Rule)** — Porcelain/Cyan은 기본적으로 **Customer Actor semantic**에만 사용한다: Customer Turn, Customer Badge, Customer Actor Dot, Customer Status Indicator(위 표의 "사용" 열이 이 범위다). **고객 이름(Customer Name) 같은 일반 Identity Text에 항상 Porcelain을 쓰는 규칙은 만들지 않는다** — Customer Name은 기본적으로 §5.3/§21.2의 Text Hierarchy(Neutral, `text-secondary`)를 따른다. 특정 화면에서 Customer Identity를 시각적으로 강조해야 할 이유가 있다면 그 화면에 한해 Page-specific/Provisional로만 Porcelain 사용을 허용한다(예: §22 Focus Project의 현재 구현 — Open Questions 4번 참고). Actor semantic(Turn/Badge/Dot/Status)과 Identity Text 강조는 서로 다른 결정이다.

### 30.2 Wash/Border 값

| Token | 값 |
|---|---|
| `cyan-500` wash | `rgba(158,202,208,.16)` |
| `cyan-500` border | `rgba(158,202,208,.32)` |

다른 semantic 색(§4.5)의 wash가 대체로 `.10~.14`인 것과 비교해 `.16`으로 약간 더 진하다 — Cyan은 채도가 낮은 색이라 다크 배경에서 동일 opacity로는 다른 색보다 읽기 어렵기 때문에 의도적으로 올린 값이다.

### 30.3 Badge와 Turn Indicator는 여전히 별개(§18.3 원칙 재확인)

Actor 색이 같아도(예: 고객=Cyan) Badge(배경 pill)와 Turn Indicator(dot+텍스트, 배경 없음)는 다른 컴포넌트로 유지한다. Attention/Deadline Badge(마감 임박/초과 등, §18.1)는 Actor와 **다른 semantic 축**이므로 같은 Badge에 합치지 않는다 — 예: "고객 셀렉 중"(Cyan Status Badge)과 "마감 2일 초과"(Red Attention Badge)는 항상 분리된 두 요소다.

## 31. Project Detail Page Pattern

> §26(Dashboard Page Pattern)과 마찬가지로 이 절은 재사용 Component가 아니라 **Project Detail 화면 전용 Composition**이다. 재사용 Component(Information Grid, Form Controls, CTA Hierarchy, Badge 등)는 각자의 절을 참조하고 여기서 다시 정의하지 않는다.

### 31.1 Project Workflow Stepper

6단계 고정: `01 원본 → 02 셀렉 → 03 보정 → 04 1차 수정 → 05 2차 수정 → 06 납품`.

- 완료된 단계와 예정 단계에는 Actor를 표시하지 않는다. **현재 진행 중인 단계에만** 현재 Actor를 dot+텍스트로 표시한다(§18.3 Turn Indicator 시각 언어 재사용, pill 아님).
- Actor 색은 §30을 그대로 따른다 — Photographer Turn = Orange, Customer Turn = Cyan/Porcelain, 완료 단계는 Neutral(체크 아이콘만, Actor 텍스트 없음).

### 31.2 Project Status / Action Panel

Project Detail 우측의 "현재 Workflow 상태를 설명하는" 패널. 상태마다 새 Card Component를 만들지 않고 **하나의 Component + variant**로 구현한다.

| Variant | 설명 | CTA |
|---|---|---|
| `photographer-action` | 작가가 지금 처리할 Action이 있음 | 명확한 Primary Action 제공(§23) |
| `customer-waiting` | 고객 응답을 기다리는 중 | 기본은 상태 전달만(CTA 없음) — 재알림 등 실제 행동이 필요한 조건(예: 마감 초과)에서만 CTA 등장 |
| `completed` | 모든 작업 완료 | **Orange Primary Action을 쓰지 않는다** — Secondary 이하만 허용 |

패널 내부 정보 위계는 다음 순서를 따른다(§20/§22의 Headline-first 철학 재사용, Identity 블록과 대표 이미지는 이 패널에 없음 — 이미 페이지 상단 Header에 표시돼 있으므로 반복하지 않는다):

1. Turn Eyebrow(Actor, 작게) — §30 색
2. Main Message(가장 먼저 읽혀야 하는 headline)
3. Description
4. Metric/Detail row(§20 Metric 재사용)
5. CTA(위 variant별 규칙, §23)

Deadline/Attention(마감 임박·초과)은 Actor와 별개 축이므로, Attention Badge(§18.1/30.3)로 별도 표시하고 Turn Eyebrow와 합치지 않는다.

### 31.3 Project Information Pattern

Project Detail의 "01 기본 정보" 영역은 §27 Information Grid를 그대로 사용한다.

- Customer 정보: `고객` 필드의 Value는 고객 이름(Primary Value), 연락처는 그 아래 Secondary Metadata로 표현한다(§27.3).
- 작가 본인의 이름/전화번호는 Project Information에 반복 표시하지 않는다 — 작가 본인 프로젝트 화면이므로 불필요한 정보다.
- Project Code(프로젝트 번호)가 "01 기본 정보" 안에 명시적 Label 필드로 나올 때는 §21.2 Context B(일반 Value와 동일한 hierarchy)를 따르고, Header에 인라인으로 노출될 때는 Context A(tertiary)를 따른다.

### 31.4 Customer Gallery Settings

아래 4개 설정을 하나의 논리 그룹으로 묶어 문서화한다 — 화면 구현 시 이 그룹 단위로 나란히 배치한다.

- 고객 셀렉 수 (§29.5 Numeric Input)
- 재보정 요청 횟수 (§29.3 Segmented Control)
- 원본 납품 허용 (§29.4 Toggle)
- 고객 PIN (§31.5 PIN Setting)

이 그룹이 조건부로 잠기는 경우(예: 고객 셀렉 완료 후 셀렉 수 변경 불가) §29.8 Disabled/Locked 규칙을 따른다.

### 31.5 PIN Setting

PIN은 **Authentication UI가 아니라 Project Gallery Setting이다.** OTP 입력처럼 자릿수를 분리한 여러 개의 박스로 표현하지 않는다.

- 하나의 값 필드(PIN Value, 예: "1234")로 표시한다.
- Enabled/Disabled 상태는 §29.4 Toggle로 표현하며, PIN Value와 Toggle을 한 행(Label+Description 좌 / Value+Toggle 우)으로 묶는다.
- Validation Error가 필요한 경우에만 §29.9 규칙을 적용하고, 평상시에는 로그인 화면과 같은 시각 언어(입력 포커스, 자동 이동, 마스킹 등)를 가져오지 않는다.

### 31.6 Customer Link Action Group

Customer Link 영역은 3개 그룹으로 나눠 정보와 Action이 뒤섞이지 않게 한다.

| 그룹 | 항목 | Tier |
|---|---|---|
| Information | URL, PIN 값 | 텍스트 정보(버튼 아님) |
| Utility | 복사, 링크+PIN 복사 | §23 Utility Action(compact bordered chip) |
| Communication Action | 알림톡 보내기 | §23 Secondary Action(단, 다른 Utility와 구분되도록 그룹을 시각적으로 분리 배치 — 예: Information+Utility는 좌측, Communication Action은 우측) |

Information 그룹과 Action 그룹(Utility+Communication)은 레이아웃상 좌/우 또는 위/아래로 분리해, "이 화면에서 그냥 보여주는 값"과 "지금 실행하는 행동"이 시각적으로 섞이지 않도록 한다.

### 31.7 Customer Original Download Modal

고객 원본 다운로드는 고객 페이지의 라이트 Surface와 Orange Primary Action을 따른다. 다운로드 기능이라는 이유로 Dark Viewer의 색을 가져오지 않는다.

- 제목은 `원본 사진 다운로드`, 설명은 한 문장으로 제한한다.
- 사진 수·총 용량·다운로드 기한은 하나의 Neutral 정보 패널에 묶는다.
- `전체 압축파일`과 `사진 골라 받기`는 같은 위계의 Segmented Tab으로 표현한다.
- 전체 다운로드 CTA는 Orange, full-width로 두고 카드 내부에 작은 버튼으로 중복 배치하지 않는다.
- 모바일의 `전체 압축파일`은 콘텐츠 높이의 Bottom Sheet, `사진 골라 받기`는 검색·목록·고정 CTA를 위해 Full-screen Sheet를 사용한다.
- 대용량 PC 권장은 CTA와 경쟁하지 않는 보조 문장으로 표시한다.
- 선택 목록의 체크, 선택됨 Badge, Focus Ring은 고객 Accent Orange를 일관되게 사용한다.

### 31.8 Retouched Bulk Upload Modal

보정본 일괄 업로드는 원본과 업로드 파일의 대응 관계를 빠르게 검토하는 작업 화면이다. Photographer Accent Orange는 파일 선택과 최종 업로드 CTA에 집중하고, 정상 매칭 행은 중립색으로 유지한다.

- 제목 앞에는 Orange Soft Surface의 업로드 아이콘을 둔다.
- 파일 선택 전에는 큰 Dropzone을 사용하고, 선택 후에는 파일 수·용량·재선택을 한 줄에 모은 compact summary로 접어 매칭 목록의 가시 영역을 확보한다.
- Desktop 매칭 목록은 `원본 사진 / 업로드 파일 / 매칭 상태·관리` 열을 명시한다. Mobile은 같은 두 사진 열을 카드 안에 유지하고 파일명, 상태, `파일 변경`을 함께 노출한다.
- 원본과 보정본 썸네일은 정해진 슬롯 안에서 `object-fit: contain`으로 표시해 사진 비율과 전체 구도를 보존한다.
- 정상 매칭 행은 Neutral Surface와 투명 Border를 사용한다. AI 저신뢰 및 순서 연결처럼 작가 확인이 필요한 행만 Amber Border와 상태 문구를 사용한다.
- 파일을 새로 연결하는 행동은 `파일 선택`, 연결된 파일을 바꾸는 행동은 서버·로컬 상태와 관계없이 `파일 변경`으로 통일한다.
- 기존 파일 이미지는 그 자체로 상태를 전달하므로 `현재` Badge를 반복 표시하지 않는다.
- 자동 순서 연결은 최후 폴백으로 유지하며 `순서 확인 필요`로 명시한다. 낮은 신뢰도의 AI 연결도 `AI 확인 필요`와 신뢰도를 표시한다.
- 서버에 업로드된 보정본과 아직 업로드하지 않은 로컬 보정본 모두 `파일 변경 → 삭제` 순서로 Action을 제공한다. 서버 파일 삭제는 Red Danger Action과 확인 Dialog를 거치고, 로컬 파일 삭제는 업로드 대상에서 즉시 제외한다. 기존 서버 파일을 교체하려던 로컬 파일을 삭제하면 기존 서버 파일 상태로 되돌린다.
- 파일이 없는 행은 오류가 아닌 작업 전 상태이므로 카드 전체를 Red로 표시하지 않는다. Neutral Border를 유지하고 보정본 슬롯 전체를 `파일 선택` Action으로 사용한다.
- 빈 슬롯에서는 `미매핑` Badge와 `매핑 없음` 문구를 중복 표시하지 않는다.
- 고객 코멘트는 공통 `PhotoCardComment`의 최소형 표현을 사용한다. 이미지·파일명 열을 압축하지 않도록 매핑 행 하단에 `아이콘 + 한 줄 본문`으로 배치하고, 코멘트가 있는 행에만 표시한다.
- 파일 선택·자동 매칭으로 상태가 바뀌어도 행을 재정렬하지 않고 원본 사진 순서를 유지한다. 상태 변화는 행 안의 이미지·Border·Action으로만 피드백한다.
- Green은 전체 매칭 완료처럼 실제 성공 상태에만, Red는 오류와 별도 삭제 확인 흐름에만 사용한다.


## 베타 신청 라이트 테마 (2026-09-12)
`src/app/beta/layout.tsx`와 `beta.css`의 `.beta-light` 범위에 랜딩과 같은 라이트 캔버스·중립색·주황색 토큰을 적용한다.
신청 전 로그인 안내, 인증 모달, 신청 폼, 완료 화면에 적용하며 공용 AuthModal이나 다른 서비스 경로의 테마는 변경하지 않는다.
기존 신청 항목·검증·로그인 리다이렉트·제출 API는 유지한다.
랜딩의 사용 가이드 링크는 개편 전까지 헤더·푸터에서 숨기되 /guide 경로 자체는 유지한다.

### 전체 화면 로딩 및 고객 별점 통일

- `SystemLoadingScreen`의 기본값과 앱/작가 로딩 경계는 라이트 버전을 사용한다. 전체 화면 `PageLoader`도 흰 배경과 회색 안내 문구를 사용하며 인라인 로더는 기존 스타일을 유지한다.
- 고객 갤러리 카드, 데스크톱 별점 필터, PC/모바일 상세보기의 문자 별(★/☆)을 랜딩 체험과 같은 Lucide `Star` SVG로 통일한다. 채운 별은 `currentColor`, 빈 별은 `none`, 둥근 외곽선은 `strokeWidth={2}`를 사용한다. 별점 저장·해제·필터 동작은 유지한다.
- 로컬 샘플에서 390px/1440px 로딩 배경과 가로 넘침 없음, 실제 갤러리 카드의 SVG 별 5개 및 채움 상태를 확인했다. 운영 API는 호출하지 않았다.

### 랜딩 오버스크롤 배경과 체험 안내

- 랜딩이 표시되는 동안 `html`과 `body` 배경을 랜딩 캔버스(`#fafbf9`)로 맞춰 모바일 상·하단 오버스크롤에서 전역 다크 배경이 노출되지 않게 한다.
- 고객 셀렉 체험은 이미지 생성 방식을 강조하지 않고 `체험용 프로젝트`로 안내한다. 설명은 사진 선택뿐 아니라 찜·별점·사진별 요청을 직접 시험할 수 있다는 행동 중심 문장으로 표시한다.

### 모바일 프로젝트 목록 정보 밀도

- 작은 대표 썸네일과 두 줄 이내 프로젝트명, 고객명·촬영일을 사용한다. ID·단계 숫자·전체 너비 상세보기 버튼은 모바일 카드에서 생략한다.
- 상태 줄은 작가 작업과 고객 대기를 기존 의미 색으로 구분하고, 작가 차례에만 작업 링크를 제공한다. 고객 차례에는 현재 셀렉/검토 기한을 표시한다.
- 검색창은 상태 선택과 분리해 넓게 사용한다. 전체·내 작업·고객 대기·완료를 4열로 배치하고 촬영일/단계는 상세 필터 시트에 둔다. 새 프로젝트는 상단 텍스트 버튼으로 제공해 모바일 목록을 가리는 플로팅 버튼을 없앤다.

### PC 프로젝트 목록 열 구성

- `DesktopProjectList.tsx` / `ProjectListTheme.module.css`의 `.projectTable`은 반응형 6열 표를 사용한다. 고객 정보는 프로젝트 메타데이터에 포함하며, 진행 단계 열에는 작은 6단계 표시와 현재 상태·작업 주체를 함께 배치한다. 현재 단계는 의미 색의 구간과 굵은 단계명, 지난 단계는 중립색 구간, 해당 없는 단계는 점선으로 구분한다.
- 프로젝트명 → 고객명·촬영일 → ID 순서이며 `.projectTable td` 높이 기준은 88px이다. 내용이 길면 행이 늘어날 수 있다. `.projectTable th`는 sticky로 열 이름을 유지한다.
- `.identityColumn` / `.statusColumn` / `.deadlineColumn` / `.actionColumn`이 너비를 배분한다. 1100px 이하에서는 셀 여백을 줄이고 썸네일을 숨기며 진행 표시를 간소화해 작업 링크와 상태 텍스트를 확보한다.
- PC 검색창은 240px을 기준으로 짧게 표시하고 진행 단계·촬영일 범위·정렬을 라벨과 함께 항상 노출한다. 도구 모음은 공간이 부족하면 줄바꿈하며 모바일의 상세 필터 시트는 유지한다.
- 상단 새 프로젝트 버튼은 기존 공용 버튼·한도 확인을 사용한다. 사이드바와 중복되던 원형 사용량, 플로팅 생성 버튼, 시스템 준비완료 문구는 PC 목록에서 제거했다.

### PC 프로젝트 목록 시각 위계 조정

- `.progress`는 최대 288px의 6구간 표시로 제한하고 현재 상태와 작업 주체를 위의 `.progressCaption`에 모은다. 컨테이너 700px 이하에서는 단계명을 생략하고 현재 위치를 N/6으로 병기한다. 6단계 매핑은 유지한다.
- 프로젝트명은 `.projectName` 15px, ID는 `.projectId` 보통 굵기로 구분한다. 행 hover·focus 시 배경을 강조하며 링크의 키보드 포커스를 표시한다.
- 검색·단계·촬영일·정렬은 위쪽 반복 라벨 없이 같은 높이로 배치한다. 촬영일은 `.shootRange` 외곽선 하나로 묶고 접근성 이름으로 시작일·종료일을 구분한다. 정렬은 날짜 옆에 붙인다. 기본 결과 개수 줄은 생략하고 조건 적용 시에만 ‘전체 N개 중 M개’와 초기화를 표시한다.
- `.desktopList`의 컨테이너 폭이 880px 이하이면 검색·단계와 촬영일·정렬을 각각 한 줄로 배치한다. 모바일 상세 필터 시트는 유지한다.
- 고객 대기 행은 중복 대기 문구 대신 기존 상세 화면으로 가는 ‘진행 확인’ 링크를 제공한다. 기한 날짜·D-day·강조 색은 변경하지 않는다.

PC 표의 진행·기한·작업 열은 `.statusColumn` / `.deadlineColumn` / `.actionColumn`의 제한된 폭을 사용하고 프로젝트 열이 나머지 폭을 사용한다. 컨테이너 960px 이하에서 폭을 축소하고 700px 이하에서 비율 배치로 전환한다. 행 작업 버튼은 중립 테두리 스타일로 통일하며 상단 새 프로젝트만 주황색 버튼으로 강조한다.

PC 목록은 촬영일과 현재 상태를 별도 열로 표시한다. `ProjectListTheme.module.css`의 컨테이너 1150px 이하에서는 현재 상태를 진행 열로, 850px 이하에서는 촬영일을 프로젝트 정보로 합친다. `.deadlineLine`은 기한 날짜와 D-day를 줄바꿈 없이 나란히 표시하며 기존 계산·문구·색은 유지한다.

### 프로젝트 식별 정보와 단계 헤더

- `.desktopList` 최대 폭은 1504px이며 넓은 화면의 `.identityColumn`은 22%로 제한해 촬영일과의 공백을 줄인다.
- 고객명 옆에 실제 `Project.location`을 MapPin 아이콘과 표시한다. 빈 장소는 생략하며 긴 장소는 말줄임 후 hover·키보드 focus에서 전체 내용을 표시한다.
- 헤더는 ‘진행 단계’만 표시하고 각 행의 `.progressSteps`에 단계명을 표시한다. 컨테이너 700px 이하에서는 단계명을 생략하고 행의 현재 위치 N/6을 유지한다.

검색 영역은 `.searchGroup`과 `.listSearch`의 flex 확장으로 표와 양끝을 맞춘다. 좁은 PC에서는 기존 두 줄 배치를 유지한다. 프로젝트명은 hover 시 밑줄을 표시하지 않고 행 배경 피드백을 유지한다. `.currentState`는 위에 원형 점과 작가/고객, 아래에 현재 상태를 표시한다. 점은 작가 `--accent`, 고객 `--customer-foreground`, 완료는 중립색을 사용한다.

### 프로젝트 상세·수정 화면 정렬

`ProjectDetailTheme.module.css`는 상세를 목록과 같은 최대 1504px 안에 배치한다. PC 상세는 왼쪽 현재 작업·고객 링크, 오른쪽 간결한 프로젝트 정보로 구성하며 1000px 이하에서는 작업부터 한 열로 표시한다. 진행 단계는 6개 이름과 현재 위치를 유지하고 중복 설명을 시각적으로 숨긴다. 작업 카드 상단 선은 작가 주황·고객 청록·완료 중립색을 사용한다. 상단 `정보 수정` 버튼과 정보 카드의 수정·삭제 메뉴는 기존 핸들러를 공유한다.

수정 폼은 `.editContainer` 최대 1100px이며 `.editSections`가 1280px부터 기본 정보/갤러리 설정 2열, 그 이하는 1열로 배치한다. 생성 화면의 공통 입력·오류·잠금·저장 컴포넌트를 유지하며 수정 화면에 한정해 중립 섹션 헤더를 적용한다. 하단 저장 바의 내부도 같은 최대 폭을 사용한다. 수정에서만 `PhotographerFormActionBar.viewportFixed`를 켜 화면 하단에 고정한다. 본문 기준 위치·폭과 바 높이를 ResizeObserver로 측정해 사이드바와 겹치지 않고 마지막 입력을 가리지 않게 한다. PC 상세는 상단 수정 버튼과 메뉴의 삭제로 역할을 분리한다.

### 원본 업로드 화면 도구 배치

상세 뷰어는 `OriginalPhotoViewer.module.css`의 다크 팔레트로 헤더·inspector·사진 무대를 통일한다. `PhotoVersionHistory.module.css`는 현재 버전·상태·요청·비교·이력 순으로 구성하고 이력 항목에도 상태를 표시한다. 모바일은 접이식 정보 영역의 높이를 제한해 사진 공간을 확보한다. 셀렉의 코멘트 패널은 유무에 따른 폭 변화를 없애고 본문 대비를 높인다.

자산 셀렉의 `readableComments`는 색 박스 대신 요청 라벨·최대 두 줄 본문으로 표시한다. 상세 보기 텍스트 링크는 두지 않고 사진 클릭을 유지한다. 가상화 갤러리의 코멘트 행 높이도 함께 확보한다. 보정본 카드의 검토 코멘트는 같은 `PhotoCardComment.readable` 표현을 사용한다. 확정은 청록 텍스트, 재보정 요청은 주황 배지와 카드 상단 선으로 구분하며 사진 자체는 흐리게 처리하지 않는다. 상태별 필터는 전체 다음에 재보정 요청을 표시한다.

자산 페이지는 `AssetWorkspace.module.css`로 탭·헤더·도구줄을 공유한다. 탭은 주황 밑줄로 현재 위치를 표시하고 PC 도구줄은 줄바꿈 시 높이를 자동 확장한다. 셀렉 검색창 폭은 `.search`에서 제한하며 복사 버튼을 직접 노출한다. 보정본은 별도 회차 행을 만들지 않고 작업 도구줄 안에 `1차 보정/재보정` Neutral Segment, `업로드 N/M장` 진행 막대, 상태 필터를 한 흐름으로 배치한다. 정상 필터 선택은 Neutral Surface로 표시하고 Orange는 남은 업로드·재보정 요청처럼 확인이 필요한 상태에만 사용한다. 자산 layout도 compactOnly 헤더 정책을 사용하며 숨긴 프로젝트 정보는 포커스에서 제외한다.

업로드는 `useCollapsibleAssetHeaderController({ compactOnly: true })`를 사용한다. 기존 자산 화면의 모바일 몰입 모드는 변경하지 않는다. 갤러리 스크롤 `COLLAPSE_AT`에서 접고 `EXPAND_AT`에서 펼치며, 짧은 목록은 축소로 스크롤이 사라지는 반복을 방지한다. `.compactHeader`는 48px이며 `.expandedHeader`와 함께 200ms로 전환한다. 움직임 축소 설정에서는 전환을 생략하고 숨긴 영역은 inert로 포커스에서 제외한다.

`UploadTheme.module.css`의 `.workspace`는 PC 도구줄을 두 줄로 구성한다. 첫 줄은 사진 수·전체 선택과 AI 분석·필터, 둘째 줄은 파일명 검색과 정렬·보기 전환이다. AI 결과가 많거나 화면 폭이 좁으면 도구가 줄바꿈하며, 업로드 중에는 기존 진행 상태와 중단 동작을 표시한다. 빈 화면은 단일 점선 영역과 사진 선택 버튼으로 구성하고 모바일에서는 드래그 안내를 표시하지 않는다. 공용 사진 갤러리와 하단 작업 바 동작은 유지한다.

### PC 대시보드 개편

`DashboardTheme.module.css`의 `.frame`은 프로젝트 목록과 같은 최대 1504px·32px 여백을 사용한다. 상단 업무 상황판은 `지금 확인할 프로젝트` 전체 수와 그 구성인 작가 차례·기한 지난 고객 수를 하나의 면 안에서 보여준다. 최우선 프로젝트는 240~280px의 큰 1:1 대표 이미지와 바로 할 일을 묶은 강조 카드로, 후속 작업은 52px 썸네일 행으로 구분한다. 대표 이미지는 비율을 변형하지 않고 중앙 기준 `object-fit: cover`로 자른다. 활성 기한은 날짜와 D-day를 한 줄에 배치한다. 프로젝트 목록과 같이 3일보다 많이 남은 정상 상태는 D-day를 숨기고, 임박은 배경 없는 주황색 11px 텍스트, 당일·초과는 위험색 텍스트로 표시한다. 최근 변경 프로젝트는 사진 비중이 큰 3열 카드로 구성한다. 프로젝트 사용량은 업무 현황과 분리해 320px 보조 영역에 도넛 차트·사용/전체 수치·잔여 수량으로 표시하고, 대시보드에서는 전역 사이드바의 중복 사용량을 숨긴다. 최근 활동은 같은 보조 영역에서 색상 점·연결선·시간·프로젝트명이 포함된 문장·고객명과 ID로 구성된 타임라인으로 유지한다. 1250px 이하 PC에서는 사용량과 활동을 본문 아래 2열로 배치한다. 링크와 키보드 포커스를 유지한다. 모바일 대시보드 UI는 제공하지 않는다.

사진 상세 뷰어는 사진 클릭(모바일 탭)으로 검은 배경의 집중 보기를 전환한다. 집중 보기에서는 헤더·정보 패널·썸네일·이동 버튼을 숨기고, 다시 사진을 누르거나 Escape로 복원한다. 좌우 버튼은 사진 옆 여백이 충분하면 여백 중앙에, 부족할 때만 사진 위에 배치한다.

원본 비교가 가능한 단일 보정본 보기에서는 사진을 누르고 유지하면 원본을 표시하고, 놓으면 보정본으로 복귀한다. 사진을 클릭해 검은 화면의 집중 보기로 확대한 뒤에도 같은 제스처와 원본 레이어를 유지한다. 지연은 OriginalPhotoViewer의 HOLD_PREVIEW_DELAY_MS, 이동 취소 기준은 HOLD_MOVE_TOLERANCE_PX를 사용한다. 원본은 디코딩 완료 후 별도 레이어로 표시하며, 모바일의 기존 확대 컴포넌트를 교체하지 않는다. 드래그·다중 터치·화면 이탈 시 비교를 취소하고, 길게 누른 제스처는 단일 탭으로 처리하지 않는다. 사진 아래에 사용 안내를 노출하며 PC 단축키 안내는 텍스트 버튼으로 제공한다. 모바일 상단 원본/보정본 버튼은 제거하고 요청·이력의 원본 선택 경로를 유지한다. 헤더·정보 패널·필름스트립·버전 이력의 반복 구분선은 제거하고 다크 배경의 밝기와 여백으로 구분한다.

고객 보정본 검토 상세에서는 사진 위 상시 회차·판단 배지를 사용하지 않는다. 파일명과 회차는 앱바에, 현재 판단은 우측 상태 행에 둔다. 하단은 필름스트립과 검토 진행/전달 영역을 동일 높이의 그리드로 구성해 마지막 사진 판단 후 별도 풋터가 추가되며 사진 높이가 변하지 않도록 한다. 완료 전에는 검토 수와 남은 수, 사유가 빠졌으면 사유 확인, 완료 후에는 작가 전달 CTA를 같은 자리에서 교체한다.

보정본 검토 요청 모달은 고객과 검토 회차·사진 수를 한 줄 요약으로 표시하고, 검토 기한을 본문의 주 작업으로 둔다. 접속 링크와 비밀번호는 요청 성공 후 공유 모달에서 제공하므로 설정 모달에서 반복 노출하지 않는다. 모바일은 네이티브 날짜 입력을 48px 표시 필드 위에 투명하게 배치하고 빠른 기한을 `+3/+7/+15일`로 축약한다. 하단에는 단일 Primary 요청 버튼만 표시하고, PC에서는 취소 버튼을 함께 제공한다.
