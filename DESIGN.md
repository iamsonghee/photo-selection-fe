---
name: A컷 (ACUT)
description: 작가와 고객의 사진 셀렉·보정·납품을 한 흐름으로 잇는 작업 도구
colors:
  brand-orange: "#ff4d00"
  brand-orange-hover: "#e94b0d"
  deep-navy: "#023852"
  navy-muted: "rgba(2, 56, 82, 0.68)"
  navy-subtle: "rgba(2, 56, 82, 0.52)"
  navy-disabled: "rgba(2, 56, 82, 0.38)"
  studio-canvas: "#f5f8f8"
  paper-white: "#ffffff"
  raised-mist: "#eef3f4"
  hairline: "color-mix(in srgb, #023852 16%, #ffffff)"
  hairline-subtle: "color-mix(in srgb, #023852 9%, #ffffff)"
  hairline-strong: "color-mix(in srgb, #023852 28%, #ffffff)"
  customer-teal: "#079fa0"
  customer-halo: "color-mix(in srgb, #9fd8c5 24%, #ffffff)"
  critical-red: "#dc2e2f"
  warning-yellow: "#fac005"
  darkroom-stage: "#0a0b0d"
  darkroom-surface: "#15161a"
  darkroom-raised: "#1d1e23"
  darkroom-text: "#f2f2f4"
  darkroom-muted: "#b8b8c0"
  darkroom-border: "#3a3a42"
typography:
  page-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "42px"
    letterSpacing: "-0.56px"
  page-title-mobile:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "28px"
  section-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "22.5px"
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "25px"
    letterSpacing: "-0.45px"
  label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "18px"
  button:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "18px"
    letterSpacing: "-0.28px"
  mono-id:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "16.5px"
rounded:
  control-sm: "6px"
  control: "8px"
  inner: "12px"
  card: "14px"
  panel: "16px"
  full: "9999px"
spacing:
  inline: "8px"
  compact: "12px"
  panel-gap: "16px"
  panel-padding: "20px"
  mobile-gutter: "20px"
  section: "24px"
  desktop-gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "{colors.paper-white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.raised-mist}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-outline:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.critical-red}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  input-dense:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.control}"
    height: "48px"
  work-card:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.card}"
    padding: "12px"
  panel:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

# Design System: A컷 (ACUT)

세부 측정값, 컴포넌트별 검증 상태, 화면별 구성은 [docs/design-system-light.md](docs/design-system-light.md)(라이트 운영 화면)와 [docs/design-system.md](docs/design-system.md)(다크 사진 작업 화면)가 원본이다. 이 파일은 그 요약이며, 둘이 어긋나면 구현 코드 → 위 문서 → 이 파일 순으로 따른다.

## Overview

**Creative North Star: "밝은 작업실과 암실 (The Studio and the Darkroom)"**

A컷은 한 화면을 라이트/다크로 토글하는 제품이 아니라 두 공간이 공존하는 제품이다. 작업실은 밝고 정돈된 운영 공간이다. 작가가 프로젝트 상태를 파악하고, 업로드하고, 다음 할 일을 처리한다. 흰 종이 같은 면 위에 깊은 남색 글자, 그리고 지금 해야 할 단 하나의 행동에만 주황이 켜진다. 갤러리(사진 목록에서 고르기)도 밝은 작업실에 속한다. 암실은 사진 한 장을 눌러 크게 보는 순간이다. 상세 뷰어·비교 화면은 어두운 무대가 되어 사진만 남기고, UI는 어둠 속으로 물러난다.

컴포넌트는 단정하고 절제되어 있다. 얇은 테두리, 아주 작은 그림자, 낮은 대비의 구분선으로 층을 만들고, 장식은 없다. 밀도는 중간보다 약간 높다. 작가는 수백 장과 여러 프로젝트를 한 화면에서 훑어야 하기 때문이다.

**Key Characteristics:**
- 목록·갤러리·운영은 라이트(작업실), 사진 한 장을 크게 보는 상세 뷰어·비교는 다크(암실). 두 규칙을 서로 옮기지 않는다.
- 주황은 행동색이지 면 색이 아니다.
- 행위자(작가/고객)는 색 점과 텍스트를 함께 써서 구분한다.
- 깊이는 캔버스 → 흰 면 → 한 단계 띄운 면 순서의 톤으로 만든다.
- 한글 UI는 Pretendard 한 가족, 숫자·ID만 JetBrains Mono.

## Colors

깊은 남색 중립 위에 주황 하나가 행동을 이끌고, 청록은 고객을 뜻한다.

### Primary
- **Brand Orange** (`brand-orange`): 현재 맥락에서 가장 중요한 다음 행동(Primary CTA, FAB), 작가 행위자 점, 현재 내비게이션 표시, 80–99% 사용량 진행 막대. 위에 얹는 글자는 항상 흰색.

### Secondary
- **Customer Teal** (`customer-teal`): 고객 행위자 신호. 점, 아이콘, 짧은 텍스트 강조에만 쓴다. 필요하면 `customer-halo`로 작은 후광만 준다.

### Neutral
- **Deep Navy** (`deep-navy`): 라이트 화면의 모든 주 텍스트와 핵심 값.
- **Navy Muted / Subtle / Disabled** (68% / 52% / 38%): 설명 → ID·아이콘 → 비활성·최하위 메타데이터 순으로 위계를 낮춘다.
- **Studio Canvas** (`studio-canvas`): 라이트 페이지 바탕(레벨 0).
- **Paper White** (`paper-white`): 카드·패널·표(레벨 1).
- **Raised Mist** (`raised-mist`): 보조 버튼, hover, 표 헤더(레벨 2).
- **Hairlines**: 남색 9% / 16% / 28%를 흰색에 섞은 구분선. 기본은 subtle.
- **Darkroom** (`darkroom-*`): 상세 뷰어·비교 화면의 무대, 면, 띄운 면, 글자, 보조 글자, 경계. `globals.css`의 `--darkroom-*` 변수로 쓴다.

### Semantic
- **Critical Red** (`critical-red`): 해당 단계의 기한 초과, 오류, 파괴적 행동에만.
- **Warning Yellow** (`warning-yellow`): 실제 경고 상태(마감 임박 등)에만.

### Named Rules
**The One Orange Rule.** 한 시야에 주황 채움 버튼은 하나다. 반복 카드마다 주황 CTA를 두지 않는다. 카드 자체가 행동이면 내부 CTA를 추가하지 않는다.

**The Actor Signal Rule.** 작가 = 주황 점, 고객 = 청록 점, 완료 = 남색 52%. 색만으로 전달하지 않고 `작가/고객/완료` 같은 텍스트를 함께 둔다. 완료는 새 행동색을 얻지 않으며 CTA를 없앤다.

## Typography

**Body Font:** Pretendard Variable (with Pretendard, -apple-system, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** 한 가족의 굵기와 크기 차이만으로 위계를 만드는 담백한 한글 산세리프. Mono는 비교해야 하는 숫자에만 기계적인 정확함을 준다.

### Hierarchy
- **Page Title** (700, 28px / 42px, -0.56px; 모바일 20px / 28px): 페이지당 하나.
- **Section Title** (700, 15px): 패널·섹션 머리.
- **Body** (400, 14px / 25px, -0.45px): 설명 문장.
- **Label** (600, 12px): 행위자 라벨, 현재 행동, 메타데이터.
- **Button** (13px / 18px, -0.28px): Primary·Danger는 700, Secondary는 400. 굵기로 위계를 나누고 크기는 같게 둔다.
- **Mono ID** (600, 11px): 프로젝트 ID, D+N, 비교 가능한 카운터.

### Named Rules
**The Mono-for-Numbers Rule.** JetBrains Mono는 ID·D+·카운터에만 쓴다. 한 컴포넌트의 본문 전체를 mono로 바꾸지 않는다.

**The 16px Input Rule.** 모바일 입력칸은 16px. iOS 자동 확대를 막는다.

## Layout

- **Breakpoint:** 768px 미만은 모바일 shell, 이상은 PC 사이드바 + 페이지 헤더.
- **PC:** 페이지 좌우 32px, 위 24px. 섹션 간격 24px, 패널 간격 16px, 그리드·액션 묶음 12px, 인라인 6–8px. 사이드바는 접힘 102.5px / 펼침 266px.
- **모바일:** 좌우 20px. 상단 브랜드 헤더 56px(스크롤 시 44px) + safe-area. 하단 탭 내비게이션은 쓰지 않는다. 페이지 제목·뒤로가기는 페이지 인트로가 맡고, 전역 헤더는 로고와 계정만 맡는다.
- **최소 검증 폭:** 375 / 390 / 430px. 어떤 폭에서도 가로 넘침 없음.
- **작업 화면(고르기·업로드):** `100dvh`로 잠그고, 바깥 문서 대신 안쪽 사진 영역만 스크롤한다.
- **밀도:** 조밀한 컨트롤은 높이 48px, 표 행은 100px. 작가는 많은 정보를 한 번에 훑는다.

## Elevation & Depth

평평한 톤 층위가 기본이다. 깊이는 캔버스(`studio-canvas`) → 흰 면(`paper-white`) → 띄운 면(`raised-mist`) 순서의 색 차이로 만들고, 테두리는 구조를 설명할 때만 쓴다. 그림자는 남색 기반의 아주 옅은 것만 쓴다.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 10px 24px -22px rgba(2,56,82,0.72)`): 테두리 없는 반복 Work Card를 캔버스에서 떼어낸다.
- **Hairline lift** (`box-shadow: 0 2px 6px rgba(2,56,82,0.03)`): 조용한 컨트롤.
- **Overlay** (`box-shadow: 0 12px 32px rgba(2,56,82,0.18)`): 팝오버·시트처럼 실제로 떠 있는 층.
- **Focus halo** (`box-shadow: 0 0 0 4px rgba(255,77,0,0.22)` / 고객은 `customer-halo`): 스테퍼 현재 노드 등 상태 표시.

### Named Rules
**The Border-or-Shadow Rule.** 한 면에 테두리와 진한 그림자를 같이 반복하지 않는다. 카드 안에 카드 박스를 다시 만들지 않는다. 목록·활동은 간격과 구분선으로 나눈다.

## Shapes

부드럽지만 단단한 모서리. 컨트롤 8px(행 액션 6px), 썸네일·지표·표 12px, 반복 카드 14px, 큰 패널 16px. 원형은 사용량 링, 페이지네이션, 상태 점에만 쓴다. 테두리는 1px 헤어라인.

## Components

### Buttons
`PhotographerLightButton`이 단일 출처다. 크기(size)가 타이포·형태를, 변형(variant)이 톤을 소유한다.
- **Shape:** 8px 모서리.
- **Primary:** 주황 채움 + 흰 글자 700. hover는 90% 불투명도, 누르면 98% 축소.
- **Secondary:** 띄운 면 + subtle 테두리 + 남색 400.
- **Outline:** 흰 면 + 테두리, hover 시 띄운 면과 강한 테두리.
- **Danger:** 빨강 채움 + 흰 글자. 파괴적 확인에만.
- **Sizes:** regular(13px), toolbar(44px 높이), work-panel(48px), confirmation(56px).
- **Focus:** 2px 링 + 2px 오프셋, 변형 색 30–40%.
- **Disabled:** 40% 불투명도. **Pending:** 라벨 자리를 유지한 채 스피너 + 진행 문구.

### Cards / Containers
- **Work Card:** 흰 면, 14px, 테두리 없이 card lift 그림자. 카드 전체가 이동 행동이라 내부 CTA 없음. 썸네일은 3:2.
- **Panel:** 흰 면, 16px, subtle 테두리, 패딩 20px.
- **Dense Table:** 흰 컨테이너 12px + subtle 테두리, 헤더는 띄운 면, 행은 구분선만.

### Inputs / Fields
- **Style:** 높이 48px, 8px, 흰 면 + 헤어라인 테두리.
- **Focus:** 주황 계열 링(`focus-visible`).
- **Mobile:** 16px 글자.

### Navigation
- **PC 사이드바:** 현재 항목은 흰 면 + 왼쪽 안쪽 3px 주황 표시. 아이콘만 주황이고 라벨은 기본 남색. 20px 아이콘, 44×44 터치 영역.
- **모바일:** 고정 브랜드 헤더(95% 흰 면 + blur), 하단 탭 없음.

### Workflow Stepper (signature)
프로젝트의 6단계 상태 흐름. 23px 노드, 1px 연결선, 현재 노드에 4px 후광(작가 단계는 주황, 고객 단계는 청록). 현재 노드 아래에만 행위자 텍스트 라벨.

## Do's and Don'ts

### Do:
- **Do** 운영 화면과 갤러리 그리드는 작업실(라이트), 사진을 눌러 여는 상세 뷰어·비교 화면은 암실(다크)에 둔다.
- **Do** 한 시야의 주황 채움은 다음 행동 하나에만 쓴다.
- **Do** 행위자는 색 점 + 텍스트 라벨로 함께 표시한다.
- **Do** 깊이는 canvas → white → raised 톤으로 만들고, 반복 카드는 테두리 대신 card lift를 쓴다.
- **Do** 버튼은 `PhotographerLightButton`의 variant/size를 쓰고 새 버튼 스타일을 만들지 않는다.
- **Do** 3을 넘는 모든 모션에 `prefers-reduced-motion` 예외를 둔다.

### Don't:
- **Don't** 주황·청록으로 카드나 섹션 전체 면을 칠하지 않는다.
- **Don't** 라이트 규칙을 상세 뷰어에 강제하거나, 다크 대비 값을 운영 화면에 옮기지 않는다.
- **Don't** 프라이머리 색, 폰트, 버튼 스타일을 바꾸지 않는다. 레이아웃은 새로 짜도 이 셋은 유지한다(2026-10-01 결정).
- **Don't** 빨강을 일반 마감일이나 장식에 쓰지 않는다. 해당 단계의 기한 초과·오류·파괴에만 쓴다.
- **Don't** 카드 안에 카드를 만들거나 테두리와 진한 그림자를 한 면에 겹치지 않는다.
