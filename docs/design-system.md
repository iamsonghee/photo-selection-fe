# A-CUT 디자인 시스템 초안

> 상태: Draft 0.1
> 작성일: 2026-07-29
> 근거: `ui-audit.md`, `component-inventory.md`, `page-inventory.md`
> 참고: `DESIGN-airbnb.md`의 문서 구성 방식만 참고했으며 색상·형태·브랜드 표현은 가져오지 않았다.

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
| `blue-500` | `#4F7EFF` | 정보/focus |
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
| `text-link` | `blue-500` | 텍스트 링크와 정보성 이동 |

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
