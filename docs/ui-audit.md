# A-CUT 프런트엔드 UI 감사

> 조사일: 2026-07-29
> 대상 저장소: `photo-selection-fe` 현재 작업 트리(커밋되지 않은 변경 포함)
> 조사 목적: 화면별 불일치의 코드 원인을 분류하고 향후 디자인 시스템 구축의 기준 자료를 만든다.
> 제한: 이 조사에서는 코드와 기능을 수정하지 않았다.

## 1. 결론 요약

A-CUT이 화면마다 중구난방으로 느껴지는 가장 큰 원인은 **토큰 부재 자체보다, 전역 토큰이 있어도 핵심 화면이 이를 일관되게 소비하지 않는 구조**다.

현재 전역에는 색상 변수와 소수 primitive가 있지만 다음 세 층이 병존한다.

1. `globals.css`의 파랑 primary + 주황 accent 기반 공통 토큰
2. 작가/고객 핵심 페이지의 주황 CTA + 다수 하드코딩 값 + inline style
3. 랜딩·관리자·고객 HUD가 각각 가진 독립적인 시각 문법

이 위에 프로젝트 상태, 사진 카드, 모달, 토스트, 로딩, 모바일 작업공간이 페이지별로 다시 구현되어 있다. 따라서 단순히 색상 표를 추가하는 것만으로는 해결되지 않는다. **상태 표현 모델 → 핵심 primitive → 역할별 셸 → 사진 작업 패턴** 순서로 정리해야 한다.

### 핵심 수치

- UI 페이지: 34개
- `src/components` TSX 파일: 45개
- 네이티브 UI 요소 직접 사용: 351건
- 인라인 `style={{...}}`: 1,197건
- 컴포넌트/페이지 내부 `<style>` 블록: 21곳
- 별도 CSS 파일: 9개
- 임의 text 크기 사용:
  - `text-[10px]` 90회
  - `text-[11px]` 66회
  - `text-[9px]` 23회
  - `text-[8px]` 8회
  - 6px, 7px도 존재
- radius:
  - `rounded-xl` 132회
  - `rounded-lg` 75회
  - `rounded-full` 62회
  - `rounded-md` 49회
  - `rounded-2xl` 28회
- 주요 대형 UI 파일:
  - 작가 업로드 3,033줄
  - 작가 워크플로우 2,008줄
  - 프로젝트 상세 1,351줄
  - 고객 뷰어 1,250줄
  - 고객 갤러리 1,137줄
  - 고객 리뷰 상세 1,081줄

## 2. 조사 방법과 근거

### 2.1 코드 조사

- App Router의 모든 `page.tsx`, `layout.tsx`, loading 파일 확인
- `src/components`, `src/contexts`, UI 관련 `src/lib` 확인
- CSS 변수, Tailwind class, arbitrary value, inline style, CSS Module, 컴포넌트 내부 style tag 집계
- 버튼/입력/카드/배지/모달/드롭다운/토스트/사진 UI/상태 UI 사용처 추적
- 반응형 분기, safe-area, loading/empty/error/disabled, 접근성 속성 검색
- 기존 `docs/architecture.md`, `docs/user-flow.md`와 코드 대조

### 2.2 실제 렌더링 대조

로컬 앱에서 공개 화면을 읽기 전용으로 확인했다.

- `/`: 헤더, 긴 랜딩 섹션, 4장 사진 데모, 서비스 3개, 후기, CTA 렌더링 확인
- `/guide`: 작가/고객 탭과 가이드 섹션 확인
- `/beta/apply`: 비로그인 인증 유도 상태 확인

작가·관리자 화면은 인증이 필요하고 고객 화면은 유효 토큰이 필요하므로 실제 데이터 변경 없이 코드와 기존 E2E 흐름을 근거로 조사했다. 따라서 시각적 픽셀 비교가 아니라 **렌더 트리와 스타일 계약 감사**가 중심이다.

## 3. 기술 스택과 CSS 구조

### 3.1 사용 라이브러리

- Next.js 16.1.6, React 19.2.3, TypeScript
- Tailwind CSS 4 (`@import "tailwindcss"`)
- 아이콘: `lucide-react`, `@iconify/react`
- 폼: `react-hook-form`, `zod`
- 사진 가상화: `@tanstack/react-virtual`
- 날짜: `date-fns`
- 별도 범용 UI 라이브러리 없음
- Radix UI, Headless UI, React Aria, MUI, Chakra, shadcn registry 기반 구성 없음
- `class-variance-authority`, `tailwind-merge`, `clsx`, 공통 `cn()` 없음
- 접근성 전용 `eslint-plugin-jsx-a11y` 또는 dialog/focus 라이브러리 없음

### 3.2 CSS 계층

| 계층 | 파일/형태 | 역할 |
|---|---|---|
| 전역 토큰 | `src/app/globals.css` | 색상 18종, font-sans/mono, body, 소수 animation |
| 역할 전역 | `photographer.css`, `customer-shell.css`, `landing.css` | 역할별 폰트/스크롤/safe-area/마케팅 스타일 |
| CSS Module | `Sidebar.module.css`, `Workflow.module.css`, `about.module.css`, `delivered.module.css`, `customer-acut-hud.module.css` | 특정 셸/페이지 전용 |
| Tailwind utility | 거의 모든 TSX | spacing, typography, responsive |
| inline style | 1,197건 | 색, 크기, layout, typography, interaction state |
| 컴포넌트 내부 style tag | 21곳 | 페이지별 class, keyframe, media query |

`tailwind.config`는 없고 Tailwind 4의 CSS theme 변수를 사용한다. 그러나 spacing, radius, shadow, z-index, typography의 제품 토큰은 정의되지 않았다.

## 4. 현재 디자인 값 인벤토리

### 4.1 전역 색상 토큰

`src/app/globals.css`:

| 의미 | 값 |
|---|---|
| background | `#0a0b0d` |
| foreground | `#f2f2f4` |
| muted foreground | `#b8b8c0` |
| subtle foreground | `#9494a0` |
| placeholder | `#888894` |
| disabled | `#6f6f7a` |
| border | `#3a3a42` |
| border strong | `#52525b` |
| border subtle | `#23232a` |
| surface | `#15161a` |
| surface raised | `#1d1e23` |
| primary | `#4f7eff` |
| accent | `#ff4d00` |
| success | `#2ed573` |
| danger | `#ff4757` |
| warning | `#f5a623` |

### 4.2 코드에 추가로 반복되는 색상

토큰 외에 다음 계열이 반복된다.

- accent alias: `#FF4D00`, `#ff5e1a`, `#ff6600`, `#FF5A1F`, `#e64500`
- danger alias: `#ef4444`, `#FF3333`, `#ff4757`, `#B91C1C`
- success alias: `#22c55e`, `#00e676`, `#00ff66`, `#2ed573`
- warning alias: `#FFB800`, `#ffaa00`, `#ffd966`, `#f5a623`
- blue/info alias: `#4f7eff`, `#4285F4`, `#4DA3FF`
- surface alias: `#030303`, `#080808`, `#0a0a0a`, `#0a0a0c`, `#111`, `#1a1a1e`, `#222`, `#27272c`

같은 의미 안에서도 대소문자 차이를 넘어 실제 색값이 다르다.

### 4.3 폰트

현재 확인된 family:

- Noto Sans KR
- Pretendard / Pretendard Variable
- Inter
- DM Sans
- Space Grotesk
- Space Mono
- JetBrains Mono
- Playfair Display
- system-ui / Apple system fallback

불러오는 방식도 세 종류다.

- `globals.css` Google Fonts `@import`
- 역할별 CSS의 Google/CDN `@import`
- `next/font/google`
- root `<head>`의 Google Fonts `<link>`

`Playfair Display`, `DM Sans`는 전역 import되지만 주요 `@theme`에는 연결되지 않는다. 작가 레이아웃은 Pretendard를 선언한 뒤 inline으로 Inter 변수를 우선한다.

### 4.4 font size/weight

- Tailwind 기본: xs, sm, base, lg, xl, 2xl~7xl
- 임의 크기: 6, 7, 8, 9, 10, 10.5, 11, 12, 12.5, 13, 15px
- inline `0.58rem`, `0.63rem`, `0.68rem` 등 추가
- weight: 300, 400, 500, 600, 700, 800, 900 및 `font-black`

특히 고객 갤러리 모바일 CSS는 파일명을 7px, 별점 컨트롤을 8px로 축소한다.

### 4.5 spacing

Tailwind의 2/3/4/5/6/8/10 단위를 폭넓게 사용하지만 제품 spacing scale은 명시되지 않는다.

주요 콘텐츠 padding:

- 관리자 본문 `px-10 py-10`
- 작가 일반 `p-4 md:p-8`
- 프로젝트 생성 `px-4 sm:px-6`
- 고객 갤러리 desktop `24px`, mobile `6~14px`
- 모달 desktop `24px`, mobile `20px`
- 일부 inline 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 48px

### 4.6 radius

- 버튼: 0, 4, 8, 10, 12, 16px, full pill, clip-path
- 카드: 각진 0, rounded-md/lg/xl/2xl
- 모달: 각진 HUD, 16px, `rounded-2xl`, 모바일 full-screen
- 사진 카드: 고객 갤러리는 각진 정사각형, 잠금 갤러리는 `rounded-lg`, 작가 목록은 `rounded-xl/2xl`

### 4.7 shadow

- Tailwind `shadow`, `shadow-lg`, `shadow-xl`, `shadow-2xl`
- accent glow: `0 0 8/15/20/30px`, `0 4px 20px`, `0 6px 28px`
- black elevation: `0 4px 24px rgba(0,0,0,0.6)` 등
- 상태 pill에도 glow가 포함됨

elevation 단계와 focus shadow가 분리되지 않았다.

## 5. 우선순위 정의

- **P0:** 핵심 과업을 막거나 데이터 손실/오작동 위험이 명확한 문제. 이번 정적 UI 감사에서는 확정 가능한 P0를 발견하지 않았다.
- **P1:** 핵심 흐름의 일관성, 이해 가능성, 모바일 사용성, 접근성에 직접 영향을 주는 문제.
- **P2:** 시각 정돈, 유지보수, 낮은 빈도의 화면 품질 문제.

## 6. 디자인 토큰 불일치

### TOKEN-01 — primary와 accent의 역할 충돌

- **문제 설명:** 전역 `--primary`는 파랑이고 `--accent`는 주황이지만 공통 Button primary는 파랑, 실제 핵심 CTA는 대부분 주황이다.
- **관련 파일:** `src/app/globals.css`, `src/components/ui/Button.tsx`, `src/app/photographer/settings/page.tsx`, `src/app/photographer/projects/[id]/workflow/WorkflowPageClient.tsx`, `src/app/c/[token]/gallery/GalleryPageClient.tsx`
- **현재 구현 사례:** 베타 신청 `Button`은 파랑, 작가 저장/전달과 고객 확정은 주황, 정보/링크도 파랑을 사용한다.
- **사용자에게 보이는 영향:** 같은 “주요 행동”이 화면에 따라 다른 색이고 파랑이 CTA인지 정보색인지 판단하기 어렵다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 색 이름을 hue가 아니라 역할로 재정의한다. 예: `action-primary`, `action-secondary`, `feedback-info`, `focus-ring`, `brand-accent`.

### TOKEN-02 — 의미색의 다중 alias

- **문제 설명:** success/danger/warning/accent가 토큰 외 실제 값으로 여러 번 재정의된다.
- **관련 파일:** `src/components/photographer/ProjectActionFlow.tsx`, `ProjectPipelineHeader.tsx`, `ProjectProgressBar.tsx`, `src/app/c/[token]/review/[photoId]/page.tsx`, `src/app/c/[token]/gallery/GalleryPageClient.tsx`
- **현재 구현 사례:** 성공은 `#2ed573`, `#22c55e`, `#00E676`, `#00ff66`; 경고는 `#f5a623`, `#FFB800`, `#ffaa00`.
- **사용자에게 보이는 영향:** 비슷하지만 다른 초록/주황/빨강이 혼재해 상태의 의미가 흐려진다.
- **수정 우선순위:** P1
- **권장 개선 방향:** feedback 색의 base/subtle/border/text 조합을 토큰 세트로 만들고 직접 hex 사용을 금지한다.

### TOKEN-03 — typography 체계와 폰트 로딩 중복

- **문제 설명:** 최소 8개 font family와 4가지 로딩 방식이 혼재하며 본문/제목/모노의 역할이 화면마다 바뀐다.
- **관련 파일:** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/landing/landing.css`, `src/app/photographer/photographer.css`, `src/app/photographer/layout.tsx`, `src/app/c/[token]/gallery/GalleryPageClient.tsx`
- **현재 구현 사례:** root는 Noto Sans KR, 작가는 Inter/Pretendard, 고객 작업공간은 Pretendard·Inter·Space 계열을 한 화면에서 섞는다.
- **사용자에게 보이는 영향:** 제목의 성격과 텍스트 밀도가 페이지마다 달라지고 font swap/추가 요청 가능성도 커진다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 본문/표시/모노 최대 3개 family와 type scale, weight, line-height, letter-spacing을 토큰화하고 `next/font` 또는 단일 로딩 경로로 통합한다.

### TOKEN-04 — 작은 텍스트가 시각 스타일을 넘어 가독성 문제로 확장됨

- **문제 설명:** 6~11px 텍스트가 시스템 라벨뿐 아니라 파일명, 컨트롤, 상태 설명에 사용된다.
- **관련 파일:** `src/app/c/[token]/gallery/GalleryPageClient.tsx`, `src/components/ProjectProgressBar.tsx`, `src/components/layout/Sidebar.module.css`, `src/app/photographer/projects/[id]/results/page.tsx`
- **현재 구현 사례:** 갤러리 모바일 파일명 7px, 별 8px, 진행 단계 9px, 다수 메타 10px.
- **사용자에게 보이는 영향:** 모바일과 고밀도 화면에서 읽기 어렵고 확대가 필요한 사용자를 배제한다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 의미 있는 텍스트 최소 12px, 일반 보조문구 13~14px 기준을 세운다. 10px 이하는 장식적 라벨로 한정하고 핵심 정보는 별도 accessible text를 제공한다.

### TOKEN-05 — spacing/radius/shadow scale 부재

- **문제 설명:** Tailwind 기본값과 임의 px, 각진 HUD, rounded-2xl, pill이 역할 정의 없이 섞인다.
- **관련 파일:** `src/components/ui/*.tsx`, `src/app/landing/landing.css`, `src/app/c/[token]/**`, `src/app/photographer/**`
- **현재 구현 사례:** 같은 확인 모달도 각진 테두리, 16px, 24px radius 또는 모바일 full-screen으로 표현된다.
- **사용자에게 보이는 영향:** 카드 계층과 클릭 가능한 표면을 모양만으로 예측하기 어렵다.
- **수정 우선순위:** P2
- **권장 개선 방향:** spacing 4/8/12/16/24/32, radius control/card/dialog/pill, elevation 0~3의 제한된 scale을 정의한다.

### TOKEN-06 — z-index와 motion 토큰 부재

- **문제 설명:** z-index가 3, 5, 6, 50, 100, 110, 140, 150, 200, 210, 1000, 9999, 100000, 100001로 흩어져 있다.
- **관련 파일:** `PhotographerModal.tsx`, `FieldInfoTip.tsx`, `PhotographerMobileChrome.tsx`, 사진 모달/토스트 관련 파일
- **현재 구현 사례:** 모달 chrome을 숨기기 위해 100000 단위 z-index를 사용한다.
- **사용자에게 보이는 영향:** 툴팁/토스트/고정바/모달이 겹치는 경계 상황에서 예측하지 못한 가림이 발생할 수 있다.
- **수정 우선순위:** P2
- **권장 개선 방향:** base/sticky/dropdown/toast/modal/tooltip 계층과 motion duration/easing을 토큰화한다.

## 7. 컴포넌트 불일치

### COMP-01 — 공통 UI 사용률이 낮음

- **문제 설명:** 10개의 UI primitive가 있지만 351건의 네이티브 UI 직접 구현이 더 넓게 사용된다.
- **관련 파일:** `src/components/ui/*.tsx`, `src/app/photographer/**`, `src/app/c/[token]/**`
- **현재 구현 사례:** `Button/Input/Card`는 베타 신청에 집중되고 업로드·갤러리·워크플로우는 자체 스타일을 쓴다.
- **사용자에게 보이는 영향:** hover/focus/disabled/error 상태가 같은 역할에서도 다르게 보인다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 현재 primitive를 그대로 강제하지 말고 핵심 화면 요구를 반영한 새 API를 정의한 뒤 migration inventory를 만든다.

### COMP-02 — 버튼과 입력 상태 계약이 다름

- **문제 설명:** 높이, radius, focus ring, disabled opacity, loading label, 오류 위치가 구현마다 다르다.
- **관련 파일:** `Button.tsx`, `Input.tsx`, `ProjectNexusPageClient.tsx`, `projects/new/page.tsx`, `PinForm.tsx`, `review/[photoId]/page.tsx`
- **현재 구현 사례:** 32~48px 버튼, 각진/rounded/full pill, blue/orange/무 focus가 섞이며 disabled opacity도 0.4/0.5/0.6이다.
- **사용자에게 보이는 영향:** 어떤 요소가 활성/비활성인지, Enter 또는 클릭 후 진행 중인지 일관되게 알기 어렵다.
- **수정 우선순위:** P1
- **권장 개선 방향:** control size, focus-visible, pending, disabled, error, icon-only 규격을 primitive 계약에 포함한다.

### COMP-03 — 모달·드롭다운·토스트가 페이지별 구현

- **문제 설명:** overlay 패턴과 알림 시스템이 분산되어 있다.
- **관련 파일:** `PhotographerModal.tsx`, `AuthModal.tsx`, `CustomerInviteShareModal.tsx`, `FeedbackModal.tsx`, `upload/page.tsx`, `settings/page.tsx`, `projects/page.tsx`
- **현재 구현 사례:** modal은 center/full-screen/bottom-sheet/각진 HUD로 갈리고 토스트는 2.5~3.2초 또는 `alert`다.
- **사용자에게 보이는 영향:** 닫기·취소·성공 확인 위치를 재학습해야 하고 피드백을 놓치기 쉽다.
- **수정 우선순위:** P1
- **권장 개선 방향:** Dialog, Popover/Menu, Toast를 접근성 동작과 함께 공통화한다.

### COMP-04 — 동일 프로젝트 상태를 여러 컴포넌트가 독립 해석

- **문제 설명:** 상태명, 단계 수, 색과 CTA가 여러 파일에 하드코딩되어 있다.
- **관련 파일:** `src/lib/project-status.ts`, `StatusPill.tsx`, `ProjectPipelineMiniBar.tsx`, `ProjectActionFlow.tsx`, `project-flow-steps.tsx`, `dashboard/page.tsx`, `projects/page.tsx`
- **현재 구현 사례:** `selecting`이 `셀렉 중`, `셀렉 완료`, `셀렉 대기중`으로 표시된다.
- **사용자에게 보이는 영향:** 작가와 관리자가 같은 상태를 다르게 이해할 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 상태 코드마다 actor별 label, description, phase, next action, tone을 한 모델에 정의한다.

### COMP-05 — 사진 카드·그리드·뷰어 중복

- **문제 설명:** 고객 갤러리, 잠금 갤러리, 리뷰, 업로드, 결과, 워크플로우가 각자 photo card/stage를 구현한다.
- **관련 파일:** `GalleryPhotoCard.tsx`, `locked/page.tsx`, `review/page.tsx`, `upload/page.tsx`, `results/page.tsx`, `WorkflowPageClient.tsx`
- **현재 구현 사례:** aspect ratio가 1:1, 4:3, 3:2로 갈리고 selected border, filename overlay, loading fallback, error fallback도 다르다.
- **사용자에게 보이는 영향:** 사진의 선택/현재/검토/실패 상태를 화면마다 다른 방식으로 읽어야 한다.
- **수정 우선순위:** P1
- **권장 개선 방향:** `PhotoThumbnail`, `PhotoGrid`, `PhotoStage`, overlay slot, selection state, quality badge, load/error state를 분리한다.

### COMP-06 — 미사용 또는 유사 컴포넌트 잔존

- **문제 설명:** 사용처 없는 진행/뷰어/모바일 컴포넌트와 실제 사용 구현이 공존한다.
- **관련 파일:** `PhotographerMobileChrome.tsx`, `ProjectProgressBar.tsx`, `ProjectPipelineHeader.tsx`, `FullScreenImageModal.tsx`, `results/ResultsActions.tsx`
- **현재 구현 사례:** `ResultsActions`는 실제 다운로드 없이 `console.log`만 있고 import되지 않는다.
- **사용자에게 보이는 영향:** 직접 영향은 낮지만 새 기능이 어느 패턴을 따라야 할지 불명확하다.
- **수정 우선순위:** P2
- **권장 개선 방향:** 사용/실험/폐기 상태를 명시한 뒤 디자인 시스템 이행 전에 정리한다.

## 8. 페이지 레이아웃 불일치

### LAYOUT-01 — 역할별 셸의 브랜드 연결이 약함

- **문제 설명:** 공개, 작가, 고객, 관리자가 로고·폰트·배경·헤더·콘텐츠 폭을 각자 정의한다.
- **관련 파일:** `src/app/landing/**`, `src/app/photographer/layout.tsx`, `src/app/c/[token]/CustomerLayoutClient.tsx`, `src/components/admin/AdminShell.tsx`
- **현재 구현 사례:** 랜딩은 각진 오렌지 시스템 UI, 작가는 둥근 카드와 파랑 glow, 관리자는 기본 표 UI다.
- **사용자에게 보이는 영향:** 같은 제품의 서로 다른 부분이 아니라 별도 서비스처럼 느껴진다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 공통 브랜드 layer와 역할별 density layer를 분리한다.

### LAYOUT-02 — 작가 연속 작업 화면의 작업공간 계약 부재

- **문제 설명:** 상세→업로드→결과→워크플로우가 모두 다른 header/tool/footer 구조다.
- **관련 파일:** `ProjectNexusPageClient.tsx`, `upload/page.tsx`, `results/page.tsx`, `WorkflowPageClient.tsx`
- **현재 구현 사례:** 일부는 `PhotographerPageHeader`, 일부는 로컬 기술 헤더, 일부는 100dvh 고정 workspace를 사용한다.
- **사용자에게 보이는 영향:** 프로젝트 맥락과 현재 단계, 뒤로가기, 다음 행동 위치가 계속 바뀐다.
- **수정 우선순위:** P1
- **권장 개선 방향:** Project Workspace Shell에 breadcrumb/status/tool area/content/bottom action 슬롯을 둔다.

### LAYOUT-03 — 관리자 셸의 반응형 부재

- **문제 설명:** 고정 240px 사이드바와 40px 본문 padding을 작은 화면에서도 유지한다.
- **관련 파일:** `AdminShell.tsx`, `AdminSidebar.tsx`, 관리자 표 페이지
- **현재 구현 사례:** 표만 가로 스크롤되고 전체 셸은 모바일 내비게이션으로 전환되지 않는다.
- **사용자에게 보이는 영향:** 모바일 운영이 어렵고 표의 핵심 열을 한눈에 볼 수 없다.
- **수정 우선순위:** P2
- **권장 개선 방향:** 지원 범위를 결정하고 모바일에서는 drawer + 카드형 핵심 데이터 또는 명시적 데스크톱 전용 안내를 제공한다.

### LAYOUT-04 — 모바일 breakpoint와 DOM 분기가 불일치

- **문제 설명:** CSS/Tailwind/JS가 600, 767, 768, 900px을 별도로 사용하고 일부 화면은 모바일 DOM을 완전히 복제한다.
- **관련 파일:** `gallery/GalleryPageClient.tsx`, `viewer/[photoId]/page.tsx`, `review/[photoId]/page.tsx`, `upload/page.tsx`, `EmptyDashboard.tsx`
- **현재 구현 사례:** 갤러리는 767px, 업로드는 768px, 리뷰는 900px, viewer는 `md`로 분기한다.
- **사용자에게 보이는 영향:** 같은 기기 폭에서도 화면별 제어 밀도와 내비게이션 방식이 다르다.
- **수정 우선순위:** P1
- **권장 개선 방향:** breakpoint token, 공통 media/query hook, mobile action bar/safe-area primitive를 만든다.

## 9. UX 정보 구조 문제

### UX-01 — 프로젝트 상태명과 “현재 해야 할 일”이 혼합됨

- **문제 설명:** 상태 label, 단계 완료 label, CTA label이 서로 구분되지 않고 같은 위치에 사용된다.
- **관련 파일:** `src/lib/project-status.ts`, `dashboard/page.tsx`, `projects/page.tsx`, `StatusPill.tsx`, `project-flow-steps.tsx`
- **현재 구현 사례:** `confirmed`가 데이터 상태로는 셀렉 완료지만 UI에서는 보정대기/확정 완료/보정 시작 대기로 바뀐다.
- **사용자에게 보이는 영향:** 현재 상태와 다음 행동을 구분하기 어렵다.
- **수정 우선순위:** P1
- **권장 개선 방향:** `상태`, `단계`, `다음 행동`, `주의`를 별도 정보 슬롯으로 분리한다.

### UX-02 — 고객 상태 라우트가 중복 안내와 리다이렉트에 의존

- **문제 설명:** 초대, 확정, 잠금, 리뷰, 완료 페이지가 상태를 다시 판정한다.
- **관련 파일:** `InvitePageClient.tsx`, `confirmed/page.tsx`, `locked/page.tsx`, `review/page.tsx`, `delivered/page.tsx`
- **현재 구현 사례:** 일부 리다이렉트 구간에서 빈 `div` 또는 `null`을 반환한다.
- **사용자에게 보이는 영향:** 상태가 바뀌는 순간 빈 화면/깜박임과 서로 다른 문구가 발생할 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 고객 상태 라우터와 공통 status screen을 만들고 redirect 전용 loading transition을 제공한다.

### UX-03 — 고객 갤러리의 필터와 사진 조작이 과밀함

- **문제 설명:** 전체/선택, 별점, 유사컷, 품질 2종, 색상, 초기화, 정렬, 검색, 점프가 한 헤더에 모여 있다.
- **관련 파일:** `src/app/c/[token]/gallery/GalleryPageClient.tsx`, `GalleryPhotoCard.tsx`
- **현재 구현 사례:** 모바일에서는 가로 스크롤로 유지하고 검색/정렬을 숨긴다. 카드 안에도 선택/품질/그룹/파일명/별점/색상 정보가 겹친다.
- **사용자에게 보이는 영향:** 첫 사용자가 “사진 선택”보다 필터 해석에 더 많은 인지 비용을 쓴다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 1차 과업(선택/확정)과 2차 도구(평가/필터)를 계층화하고 모바일에서는 filter sheet로 분리한다.

### UX-04 — 관리자 로그의 경고 문구가 현재 상태와 어긋남

- **문제 설명:** UI는 v1/재보정/납품 로그가 기록되지 않는다고 경고하지만 현재 상태/문서에는 확장된 action이 존재한다.
- **관련 파일:** `src/app/admin/logs/page.tsx`, `src/lib/admin-db.ts`, `supabase/migrations/20260726_project_logs_expand_actions.sql`, `docs/architecture.md`
- **현재 구현 사례:** 경고에는 5개 action만 기록된다고 고정 문구가 표시된다.
- **사용자에게 보이는 영향:** 운영자가 로그 누락을 실제 장애로 오해하거나 반대로 경고를 신뢰하지 않게 된다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 실제 수집 범위를 데이터에서 파생하거나 경고를 검증 후 갱신한다. 디자인 작업과 별도로 기능 사실 확인이 필요하다.

## 10. loading, empty, error, disabled 상태

### STATE-01 — 로딩 표현이 최소 3계열

- **문제 설명:** `PageLoader`, `SystemLoadingScreen`, 페이지 로컬 spinner/skeleton이 혼재한다.
- **관련 파일:** `PageLoader.tsx`, `SystemLoadingScreen.tsx`, `app/loading.tsx`, `photographer/loading.tsx`, `confirmed/page.tsx`, `projects/new/page.tsx`
- **현재 구현 사례:** 동일한 전체 페이지 로딩이 단순 아크, 시스템 부팅 화면, 작은 border spinner로 다르게 보인다.
- **사용자에게 보이는 영향:** 실제 진행/페이지 전환/백그라운드 동작의 차이를 로딩 스타일로 이해할 수 없다.
- **수정 우선순위:** P1
- **권장 개선 방향:** route loading, content skeleton, blocking process, inline pending의 4종으로 목적을 구분한다.

### STATE-02 — empty/error 처리의 위치와 품질 편차

- **문제 설명:** 빈 상태는 전용 `EmptyDashboard`부터 표 한 줄, 빈 화면까지 다양하고 전역 `error.tsx`/`not-found.tsx`가 없다.
- **관련 파일:** `EmptyDashboard.tsx`, 관리자 표 페이지, `locked/page.tsx`, `viewer/[photoId]/page.tsx`, App Router 전체
- **현재 구현 사례:** `locked`는 selecting 상태에서 빈 화면을 반환하고, 일부 페이지는 error text, 일부는 redirect/null, 일부는 `alert`를 사용한다.
- **사용자에게 보이는 영향:** 오류인지 이동 중인지 데이터가 없는지 구분되지 않는 구간이 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** EmptyState/ErrorState/RedirectingState를 만들고 route error boundary를 추가하는 계획을 세운다.

### STATE-03 — disabled가 색과 opacity에만 의존

- **문제 설명:** disabled 스타일이 opacity 0.4~0.6과 cursor 변경 중심이며 이유 설명은 드물다.
- **관련 파일:** `Button.tsx`, `SelectionConfirmFooter.tsx`, `gallery/GalleryPageClient.tsx`, `WorkflowPageClient.tsx`, `projects/new/page.tsx`
- **현재 구현 사례:** 선택 수 부족, 상태 잠금, 저장 중이 같은 회색/opacity로 표현된다.
- **사용자에게 보이는 영향:** 왜 사용할 수 없는지와 언제 활성화되는지 알기 어렵다.
- **수정 우선순위:** P1
- **권장 개선 방향:** disabled reason, pending, read-only를 분리하고 인접 도움말/상태 문구를 제공한다.

## 11. 접근성 문제

### A11Y-01 — 사용자 확대 차단

- **문제 설명:** root와 작가 viewport에 `maximumScale: 1`이 설정되어 pinch zoom을 제한한다.
- **관련 파일:** `src/app/layout.tsx`, `src/app/photographer/layout.tsx`
- **현재 구현 사례:** `width=device-width, initialScale=1, maximumScale=1`.
- **사용자에게 보이는 영향:** 저시력 사용자가 모바일 브라우저 확대를 사용할 수 없다.
- **수정 우선순위:** P1
- **권장 개선 방향:** `maximumScale` 제한을 제거하고 레이아웃 자체가 확대를 견디도록 한다.

### A11Y-02 — 모달 focus 관리 불충분

- **문제 설명:** 공통/로컬 모달 대부분이 focus trap, 최초 focus, 닫힌 뒤 trigger focus 복귀를 구현하지 않는다.
- **관련 파일:** `PhotographerModal.tsx`, `AuthModal.tsx`, `CustomerInviteShareModal.tsx`, `FeedbackModal.tsx`, 각 페이지 로컬 모달
- **현재 구현 사례:** `role="dialog"`가 있는 모달도 focus 이동은 하지 않으며 role 자체가 없는 overlay도 있다.
- **사용자에게 보이는 영향:** 키보드 사용자가 배경 UI로 빠지거나 모달이 열렸는지 놓칠 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 검증된 dialog primitive로 focus/escape/scroll lock/aria-labelledby를 표준화한다.

### A11Y-03 — form label 연결과 아이콘 컨트롤 이름 누락

- **문제 설명:** 공통 Input/Textarea의 label이 `htmlFor`로 연결되지 않고 여러 별/색상/닫기 아이콘 버튼은 시각 정보만 있다.
- **관련 파일:** `Input.tsx`, `Textarea.tsx`, `GalleryPhotoCard.tsx`, `gallery/GalleryPageClient.tsx`, `review/[photoId]/page.tsx`, `upload/page.tsx`
- **현재 구현 사례:** 별점 button은 별 문자만, 색상 원은 색만, 일부 X 버튼은 `aria-label`이 없다.
- **사용자에게 보이는 영향:** 스크린리더가 입력 이름, 별점 값, 색상 의미, 닫기 행동을 정확히 전달하지 못한다.
- **수정 우선순위:** P1
- **권장 개선 방향:** id/label/description/error 연결과 icon-only button accessible name을 primitive에서 강제한다.

### A11Y-04 — 링크 안에 버튼이 중첩된 사진 카드

- **문제 설명:** 전체 사진 카드 Link 내부에 선택/별점/그룹 button이 있다.
- **관련 파일:** `src/components/customer/GalleryPhotoCard.tsx`
- **현재 구현 사례:** `preventDefault`와 `stopPropagation`에 의존해 클릭 충돌을 피한다.
- **사용자에게 보이는 영향:** 키보드 포커스·브라우저 기본 동작·스크린리더의 interactive hierarchy가 불안정하다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 카드의 상세 링크와 조작 버튼을 형제 요소로 분리하고 focus order를 설계한다.

### A11Y-05 — focus-visible과 reduced motion 정책 부재

- **문제 설명:** 일부 입력은 `outline: none`, 많은 커스텀 버튼은 focus 스타일이 없고 반복 애니메이션에 reduced-motion 대응이 없다.
- **관련 파일:** `globals.css`, `landing/landing.css`, `SystemLoadingScreen.tsx`, `PageLoader.tsx`, 갤러리/뷰어/작가 로컬 style
- **현재 구현 사례:** 스캔라인, pulse, ping, marquee, glow animation이 계속 동작한다.
- **사용자에게 보이는 영향:** 키보드 현재 위치를 찾기 어렵고 움직임 민감 사용자가 불편할 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 전역 `:focus-visible` 계약과 `prefers-reduced-motion` 대체 규칙을 추가한다.

### A11Y-06 — 상태가 색/광택/점에 과도하게 의존

- **문제 설명:** 선택, 단계, 품질, 색상 태그가 작은 색상 점과 border/glow로 구분된다.
- **관련 파일:** `StatusPill.tsx`, `ProjectPipelineMiniBar.tsx`, `GalleryPhotoCard.tsx`, `review/[photoId]/page.tsx`
- **현재 구현 사례:** 색상 태그는 5~6px 원, 진행 mini bar는 4px 색 segment다.
- **사용자에게 보이는 영향:** 색각 이상, 저시력 사용자가 상태 차이를 놓칠 수 있다.
- **수정 우선순위:** P1
- **권장 개선 방향:** 텍스트/아이콘/shape를 함께 사용하고 중요 상태에는 숨김 텍스트 또는 명시 label을 제공한다.

## 12. 단순 시각적 문제

### VISUAL-01 — 테크니컬/HUD 장식의 과용과 적용 범위 불일치

- **문제 설명:** `SYS`, `STATUS`, 대문자 mono label, grid, scanline, bracket가 랜딩과 일부 고객/작가 화면에만 강하게 쓰인다.
- **관련 파일:** `landing/page.tsx`, `landing.css`, `SystemLoadingScreen.tsx`, `gallery/GalleryPageClient.tsx`, `results/page.tsx`
- **현재 구현 사례:** 관리자·설정은 평범한 SaaS 카드인데 갤러리·결과는 시스템 콘솔처럼 보인다.
- **사용자에게 보이는 영향:** 장식이 정보보다 먼저 보이고 역할별 톤 차이가 커진다.
- **수정 우선순위:** P2
- **권장 개선 방향:** 브랜드 장식은 로고/마케팅/소수 emphasis에 한정하고 제품 작업 화면은 정보 우선 규칙을 둔다.

### VISUAL-02 — 배경 glow와 표면 계층이 페이지마다 다름

- **문제 설명:** 작가/고객 셸의 blue/violet blur, landing scanline, 관리자 flat surface가 통일된 elevation으로 연결되지 않는다.
- **관련 파일:** `photographer/layout.tsx`, `CustomerLayoutClient.tsx`, `landing.css`, `AdminShell.tsx`
- **현재 구현 사례:** 같은 `background/surface` 토큰 위에 역할별 독자 장식이 추가된다.
- **사용자에게 보이는 영향:** 카드의 중요도와 클릭 가능성을 배경 대비로 예측하기 어렵다.
- **수정 우선순위:** P2
- **권장 개선 방향:** base canvas, surface 1~3, overlay, decorative ambient layer를 분리한다.

## 13. 디자인 시스템 구축 권장 순서

### 1단계 — 의미 모델 고정

- project status의 actor별 label/description/next action
- feedback tone과 상태 색
- loading/empty/error/disabled/pending 의미
- 사진 상태(selected/current/reviewed/error/quality/group)

### 2단계 — foundation token

- color semantic token
- typography family/type scale
- spacing/radius/elevation
- breakpoint/safe-area
- z-index/motion/focus

### 3단계 — 접근성 포함 primitive

- Button, IconButton
- Input, Textarea, Select, Field
- Badge/StatusBadge
- Card/Surface
- Dialog/Sheet, Popover/Menu
- Toast
- Loader/Skeleton/Empty/Error

### 4단계 — 도메인 패턴

- ProjectStatus/ProjectProgress
- ProjectWorkspaceShell
- PhotoThumbnail/PhotoGrid/PhotoStage
- SelectionBar/ReviewBar
- FilterBar
- UploadProgress/RecoveryPanel

### 5단계 — 대표 화면 이행

1. 고객 갤러리
2. 작가 업로드
3. 관리자 프로젝트 목록
4. 이후 작가 워크플로우와 고객 리뷰로 확장

## 14. 대표 화면 3개 추천

### 1. 고객 갤러리 `/c/[token]/gallery`

가장 중요한 고객 과업이며 사진 컴포넌트, 필터, 선택, 확정, 모바일, 접근성 문제를 한 번에 검증할 수 있다.

### 2. 작가 업로드 `/photographer/projects/[id]/upload`

가장 큰 UI 파일이고 upload/loading/error/recovery/analysis/modal/toast를 모두 포함한다. 여기서 만든 작업공간과 상태 primitive가 작가 영역의 기준이 된다.

### 3. 관리자 프로젝트 목록 `/admin/projects`

한 역할당 한 대표 화면을 선택한다는 관점에서 관리자 정보 밀도와 반응형 표, 공통 프로젝트 상태 표현을 검증하기 가장 좋다.

후속 1순위는 `/photographer/projects/[id]/workflow`다. 업로드에서 정한 패턴을 적용하면 상태·보정·검토 흐름의 중복을 가장 크게 줄일 수 있다.

## 15. 이번 단계에서 하지 않은 일

- 새로운 디자인 또는 토큰 구현
- 기존 UI/기능/라우트 수정
- 테스트 데이터 생성, 업로드, 제출, 상태 변경
- 인증이 필요한 화면의 운영 데이터 기반 시각 회귀
- 색 대비의 픽셀 단위 WCAG 계산
- 브라우저별/실기기별 전체 반응형 QA

세부 페이지와 컴포넌트 목록은 각각 `docs/page-inventory.md`, `docs/component-inventory.md`를 참고한다.
