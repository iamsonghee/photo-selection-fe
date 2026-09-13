# 작가 모바일 디자인 검수 — 2026-09-09

> Historical, pre-implementation findings. Current status: [Mobile implementation and verification](mobile-design-implementation-2026-09-09.md).

> 상태: 검수 완료 / 아래 개선안은 **미구현**. 제품 코드·테스트 코드·API·DB 변경 없음.
> 연속 범위: 앞선 작가 PC 개선의 모바일 운영 화면. 고객 UI·관리자·공개 랜딩은 이번 재설계 대상이 아니다.
> **정밀 후속 검수:** [새 세션·터치·실패 상태 검수](mobile-design-deep-audit-2026-09-09.md). 이 문서의 환경/횟수는 1차 기록이고, 후속 M11–M17 및 우선순위 변경은 정밀 검수를 따른다.
> 다음 문서: [모바일 재설계안](mobile-design-proposal-2026-09-09.md). 현재 구현과 제안을 구분한다.

## 1. 판정

작가 모바일은 Light shell, 공통 폼, 사진 자산 탭·툴바, 고정 하단 액션의 기반을 이미 갖추고 있다. **가로 넘침은 대표 10개 화면에서 발견하지 않았지만, 상태 정확성·작업 문맥·시트 접근성·터치 규격까지 통일된 상태는 아니다.**

전면 교체보다 기존 공통 구현의 책임을 정리하는 것이 효율적이다. 우선순위는 잘못된 상태 표시와 시트의 닫기/포커스 계약, 그다음 프로젝트 식별·버튼 규격·목록 카드와 보정 작업 밀도다. Dark 사진 뷰어는 업무 목적에 맞는 별도 환경으로 유지한다.

## 2. 검증 환경과 한계

- localhost:3001, Playwright Chromium의 기존 테스트 작가 세션. 기존 테스트 프로젝트만 열었다.
- viewport: `page.setViewportSize`로 **320 / 360 / 390 / 430 × 844px**. 수정 폼은 **390 × 600px**도 확인했다.
- 방법: 화면 탐색, 스크린샷, computed geometry, DOM/접근성 이름, 키보드 조작, 실제 TSX/CSS와 호출부 대조.
- 실제 휴대폰/모바일 UA·터치 장치 에뮬레이션·iOS Safari 검증이 아니다. 600px 높이는 짧은 화면 검사이며 소프트키보드가 열린 상태를 재현한 것이 아니다. `safe-area-inset-*`의 실제 비영(非零) 값, 주소창 축소, pinch/swipe, VoiceOver/TalkBack은 미검증이다.
- 정상 생성·저장·삭제·업로드·내보내기·문의 발송을 실행하지 않았다. 생성 폼은 quota GET 응답만 브라우저에서 모킹해 일반 폼을 열고 빈 폼의 클라이언트 오류를 확인했다. 이후 모킹을 해제했다.
- 일부 Playwright click 호출은 DOM 상태가 바뀐 뒤에도 완료를 기다리다 시간 초과했다. 이후 키보드 활성화와 DOM 상태로 재확인했다. 이 도구 현상을 제품 클릭 불능으로 판정하지 않는다.
- 업로드 길게 누르기 확인은 자동화 입력 완료를 확보하지 못해 중단했다. 코드의 450ms/10px 조건만 확인했으며 실제 터치 관리 모드·삭제 검증으로 세지 않는다.
- 타입/린트/빌드/E2E 파일을 추가하거나 실행하지 않았다. 구현을 바꾸지 않는 디자인 검수이며 아래 결과는 브라우저 탐색 결과다.
- FE의 shell·폼·자산·모달 호출부 및 `architecture.md`, `upload-flow.md`, `user-flow.md`, BE `app/main.py`의 upload/storage router·worker 경계를 확인했다. 이미지 전송·서버 상태 전이를 변경하는 설계는 이번에 제안하지 않는다.

## 3. 화면별 검사 기록

| 화면 | 확인한 상태/조작 | 결과·한계 |
|---|---|---|
| 프로젝트 목록 | 54/50 계정, 검색, editing/selecting/preparing/delivered 카드 | 네 폭 가로 넘침 없음. 상태·색·5단계 진행 표시가 상세/PC와 다름 |
| 프로젝트 상세 | editing 프로젝트, 작업 패널·정보·링크·더보기 | 네 폭 넘침 없음. 현재 작업이 시각적으로 정보 위에 배치됨. 모바일 back prop은 미전달 |
| 프로젝트 수정 | 더보기 → 수정, 기존 값/공통 라벨, 짧은 높이 | 네 폭 넘침 없음. 390×600에서 프로젝트명 focus가 화면 안에 있음. 저장 미실행 |
| 프로젝트 생성 | quota GET 모킹, 일반 폼·필수 오류 | 네 폭 넘침 없음. label/error 관계 유지. 하단 버튼 40/38px |
| 설정 | 프로필/알림/계정, control geometry | 네 폭 넘침 없음. 저장·계정 삭제 미실행. 도움말/문의 진입점 없음 |
| 원본 업로드 | preparing, 기존 20장, 내부 scrollTop 200→310→150→0 | 네 폭 넘침 없음. immersive→compact→expanded 복원, body scrollY=0. 파일 전송 미실행 |
| 원본 자산 | 5장, 3열 갤러리, 필터 시트, 원본 뷰어 열기 | 네 폭 넘침 없음. 상단에서 프로젝트 문맥 숨김. 필터 initial focus/trap 누락, Escape는 동작 |
| 셀렉 자산 | 3장 갤러리, 하단 보정본 업로드 진입 | 네 폭 넘침 없음. 공유 탭/툴바 확인. 실제 다운로드·코멘트 변경 미실행 |
| 보정본 자산 | V1 대상 3장/업로드 0장, 필터·내보내기 시트 | 네 폭 넘침 없음. 필터 Escape 미작동 2회, filename 과도한 생략. 업로드/검토 요청 미실행 |
| 최종본 자산 | delivered, 최종본 0장 | 네 폭 넘침 없음. 완료 Neutral PC 규칙이 모바일에는 아직 미적용. 이미지 있는 최종본은 미검증 |
| 삭제 확인창 | 상세 더보기 → 삭제 → Escape | 390px에서 dialog 358px, 초기 focus 내부, Escape 닫힘. 삭제 실행 안 함 |
| 사진 뷰어 | 원본 첫 사진 | 390px Dark stage·파일명·장수·이전/다음·하단 filmstrip 확인. 실기기 확대/스와이프 미검증 |
| Dashboard / Manual | 모바일 route 판별/redirect 호출부, Dashboard 직접 접근 | 모두 목록으로 보내는 코드. Dashboard 실제 redirect 확인; Manual은 코드 확인 |

가로 넘침은 `document.documentElement.scrollWidth === innerWidth`와 화면 내 주요 control 경계를 측정했다. 내부 말줄임·숨겨진 정보·터치 편의까지 통과했다는 뜻은 아니다. 실제 데이터의 모든 상태, 긴 이름·큰 수치·대량 사진·서버 장애·대기 상태를 포괄하지 않는다.

## 4. 확인된 문제와 재설계 항목

### M01 — P1 / 상태 정확성: 사진이 있는데 ‘업로드전’

- 재현: 테스트 프로젝트 `78664367-194a-4867-84e8-4692d810bc3c` 원본 업로드 화면에는 **20장**, 목록에서 같은 프로젝트명으로 검색하면 **업로드전**.
- 근거: `projects/page.tsx`의 `MobileProjectCard`가 `<StatusPill status={project.status} />`만 전달. `StatusPill`은 `photoCount`가 없으면 0으로 해석한다. `Project.photoCount` 데이터는 존재한다(`lib/db.ts` mapping).
- 판정: 직접 화면 대조 1회 + 호출부 원인 확인. 표시 오류이며 사진 업로드 실패로 해석하지 않는다.
- 제안: 상태/사진 수/actor/현재 단계/다음 행동을 같은 도메인 표시 모델에서 계산한다. 모바일 카드에 상태 계산을 별도로 추가하지 않는다. 업로드 세션이 진행 중인지와 서버의 `photoCount > 0`은 구분한다.
- 증거: [잘못된 목록 상태](assets/mobile-audit-2026-09-09/preparing-status-390.png).

### M02 — P1 / 시트 공통 동작: 이름만 dialog이고 동작이 다름

- 원본 ‘사진 찾기’: 열기 후 focus가 trigger에 남고 Shift+Tab도 시트 밖. Escape는 페이지별 effect로 닫힘. 열기/Shift+Tab 직접 확인 1회, 추가 열기에서도 상태 확인; 보정본의 아래 반복 검증과 구분한다.
- 보정본 ‘필터’: 키보드 Enter로 열기 → focus가 trigger에 남음 → Escape → 계속 열림. **2/2회** 재현. 닫기 버튼으로 종료 가능하므로 완전한 사용 차단은 아니다.
- 시트 열린 상태의 `elementFromPoint(22,25)`는 배경 A-CUT 프로젝트 링크를 반환(**2/2회**). 스크린샷에서도 헤더가 overlay 밖에 남는다. header의 z-50이 main의 z-10 stacking context 위에 있기 때문이다.
- 공통 `ProjectAssetMobileSheet`는 inline fixed surface·role/title을 제공하지만 portal·focus/scroll 계약이 없다. `ProjectAssetsPageClient`만 별도 Escape effect, `WorkflowPageClient`에는 같은 처리가 없다.
- 제안: 기존 `useDialogAccessibility`와 공통 portal/theme 경계를 활용한다. header 포함 전체 배경 차단, 최초 focus·trap·복귀·중첩 잠금·pending 닫기 조건을 같은 기반에서 관리한다. 업무 내용만 sheet slot으로 주입한다.
- 증거: [원본 시트와 overlay 밖의 헤더](assets/mobile-audit-2026-09-09/filter-sheet-390.png).

### M03 — P1 / 작업 문맥: 자산 화면 첫 화면에 프로젝트 정보 없음

- 원본·셀렉·보정본·최종본 상단에는 A-CUT와 탭/도구만 표시된다. 소량 사진처럼 스크롤하지 않는 상태에서는 프로젝트명·고객을 화면에서 확인하기 어렵다.
- `ProjectAssetWorkspaceHeader` identity는 `hidden md:flex`. `MobileHeader` context는 `compact || assetImmersive`일 때만 보인다. 프로젝트 상세 intro에도 backHref/onBack이 없다.
- 제안: depth 화면 header에서 처음부터 ‘뒤로 + 프로젝트명’을 보이고 프로젝트명을 누르면 상세로 이동. 고객·현재 작업은 보조 정보. 자산 탭 자체를 반복 제목으로 만들지 않는다.
- 증거: [원본 첫 화면](assets/mobile-audit-2026-09-09/original-390.png).

### M04 — P2 / 공통 control 규격: 터치 영역과 버튼 크기 불일치

| 실측 위치 | 현재 element box | 제안 |
|---|---|---|
| 생성 ‘나중에/원본 올리기’ | 40 / 38px 높이 | 주요 작업 48px, 같은 행 같은 높이 |
| 업로드 ‘사진 추가/셀렉 요청’ | 40 / 38px 높이 | 동일 |
| 설정 취소/저장 | 40px | 동일 |
| 설정 알림 switch | 36×20px | 시각 switch 유지, label 포함 44px 이상 hit area |
| 원본 전체삭제 | 높이 36px | 일반 toolbar에서 선택/관리로 진입, 파괴 action은 관리 영역 |
| 보정본 원본 보기 | 40×32px | 최소 44×44px hit area |
| 자산 toolbar | 44px | 유지, 상태·focus는 공통 버튼 기반 |

44/48px은 이번 제품 내부 설계 제안이며 외부 접근성 인증 판정이 아니다. label이 control을 감싸 hit area를 확장하는지 따로 확인해야 한다. 공통 `PhotographerLightButton`에 모바일 규격을 명시하고 페이지마다 `h-*`를 추가하지 않는 방향을 제안한다.

### M05 — P2 / 목록: 상태·진행·CTA의 중복과 긴 제목

- 모바일 카드에는 배경 장식 tint, 80px thumbnail, 15px 한 줄 제목, 상태 pill+별도 box+5-step bar+CTA가 반복된다. 390px 첫 화면은 약 두 장의 카드만 충분히 보인다.
- PC/상세는 6-step/actor 모델을 공유하지만 모바일은 `ProjectPipelineMiniBar` 5단계와 로컬 CTA/status 조합. 대기·완료에는 disabled button으로 상태를 반복한다. 이름/thumbnail 진입도 일반 div의 onClick 중심이다.
- 검색은 placeholder만, 필터 icon button은 accessible name·expanded 연결이 없다. 필터의 전체/진행중/완료 버튼도 선택 상태를 프로그램적으로 전달하지 않는다.
- 제안: 제목·고객 → actor/현재 작업 → 필요한 날짜 → 단일 행동. 카드 제목은 2줄까지, ID는 하위 위계. 공통 6-step mapping을 이용하되 목록에는 필요 최소 정보만 표시한다. 의미 있는 링크 진입점과 검색/필터 이름·선택 상태를 제공한다.
- 증거: [현재 목록](assets/mobile-audit-2026-09-09/projects-390.png).

### M06 — P2 / 보정 작업: 파일 식별과 다음 행동 설명 부족

- 2열 카드의 한 줄에 원본 thumbnail+filename+‘미업로드’를 배치해 짧은 `E2E_TEST_001.jpg`도 `E2E_TE…` 수준으로 생략된다. 모바일에도 ‘파일을 놓아도 됩니다’ 같은 데스크톱 표현이 남는다. 후속 새 세션에서는 V1 업로드 0장의 첫 진입에 일괄 업로드창이 자동으로 열리는 상태도 확인했다(M12).
- 0/3장 상태에서 하단 ‘보정본 검토 요청’은 disabled지만 PC의 진행 요약은 모바일에서 숨겨져 이유가 하단에 함께 보이지 않는다. 카드별 단일 업로드와 PC 일괄 업로드의 작업 방식 차이를 설명해야 한다.
- 제안: 보정 단계는 작업용 목록을 기본으로 검토한다. filename 전용 행과 대상/업로드 상태를 분리하고 원본→보정본을 비교 가능하게 배치한다. 단일 파일 선택 즉시 업로드는 유지하며 이를 분명히 안내한다. 일괄 매칭은 이미 첫 방문 자동 dialog로 구현되어 있다. 후속 M12에 따라 작은 화면 geometry와 닫은 뒤 재진입 경로를 검토한다. 하단에는 ‘0/3장 · 3장 업로드 후 요청 가능’ 같은 실제 enablement 근거를 표시한다.
- 증거: [보정본 0/3장](assets/mobile-audit-2026-09-09/retouched-390.png).

### M07 — P2 / 사진 관리: 삭제가 탐색보다 앞에 있음

- 원본 업로드 일반 toolbar는 ‘전체삭제’를 직접 노출한다. 선택 관리는 450ms 길게 누르기로 진입한다. 이 동작은 문구 안내와 코드로 확인했지만 실제 터치 성능은 미검증이다.
- 제안: ‘선택’ 버튼을 명시적으로 추가하고 길게 누르기는 단축 조작으로 유지한다. 선택 모드에서 선택 수·전체 선택·취소·삭제를 노출한다. 전체 삭제는 별도 확인 뒤 실행하는 현행 보호 절차를 유지한다.

### M08 — P2 / 도움말 경로와 미전환 portal

- `FeedbackButton`의 활성 호출부는 PC Sidebar 한 곳. 모바일 header는 설정 링크만 제공하고 Settings에 문의가 없다. Manual도 모바일에서 목록으로 redirect한다.
- 문의 modal은 코드상 `desktop && isPhotographerLightRoute`일 때만 Light scope. 모바일에서 접근 가능한 창으로 브라우저 검증한 것은 아니다.
- 제안: Settings에 ‘사용 가이드/문의하기’ 영역. 기존 Feedback 전송 기능 재사용 + 모바일 Light portal·48px action. 별도 메시지 API나 고객용 문의 기능을 만들지 않는다.

### M09 — P2 / 상태 semantic: 완료가 여러 색/중복 표시

- 모바일 목록은 완료 Badge/StatusPill/완료됨 CTA가 겹친다. 최종본 footer의 emerald 색은 PC md override 밖에서 유지된다.
- 제안: 작가 Orange, 고객 Teal, 완료 Neutral을 같은 의미로 사용한다. 대기/완료는 상태 설명이며 disabled action을 만들어 반복하지 않는다. 사진 승인 등 다른 도메인의 success 의미까지 일괄 변경하지 않는다.

### M10 — 문서 불일치

- Light §5.3은 ‘Project Detail만 back action 제공’이라고 하지만 현재 상세는 back prop을 전달하지 않는다.
- §7.15는 모바일 자산 탭 위 고객명/ID row가 있다고 서술하지만 현재 identity는 PC에만 렌더된다. 같은 절의 원본 2열 서술과 이후 3열 서술도 혼재한다.
- §7.15의 ‘Mobile Header와 Bottom Nav’ 문구는 현행 bottom navigation 미사용과 충돌한다.
- §7.17의 mobile min-height 80px/leading 수직 배치는 현재 구현과 다르다. wrapper 내부 기본 min-height는 64px, sm 이상 80px이며 leading은 `hidden sm:block`이다.
- 현재 사실은 `design-system-light.md`에 정정하고 새 규격은 proposal 문서에만 둔다. 과거 검증을 이번 모바일 실기기 검증으로 확대하지 않는다.

## 5. 유지할 기반

- Light palette 단일 source, Pretendard/ID mono, 44px 자산 toolbar와 file tab.
- Create/Edit의 공통 `ProjectFormFields`와 label·hint·error 연결.
- `PhotographerConfirmDialog`의 focus/pending 보호.
- `PhotographerPhotoGallery`의 가상화와 화면별 3열 원본/2열 셀렉 구성. 밀도 변화 시 row measurement를 함께 갱신해야 한다.
- 업로드의 내부 스크롤과 expanded/compact/immersive 복원. 실기기 안정성은 별도 검증.
- 원본 상세의 Dark 사진 stage. Light 미전환 버그로 보지 않는다([뷰어 증거](assets/mobile-audit-2026-09-09/viewer-390.png)).

## 6. 구현 전 남은 검증

아래는 최초 남은 항목이다. 후속 정밀 검수에서 Chromium touch long press/이동 취소, 긴 이름·파일명, mock 빈 목록/GET 실패/quota/생성 pending·500, breakpoint와 root text-size 합성 검사를 추가했다. 실기기 iOS/Android, soft keyboard·safe area·주소창, 실제 200% 글자 확대, screen reader, swipe/pinch, 큰 사진 수, 사진 있는 완료 상태, 실제 업로드·보정본 매칭·다운로드, 모든 권한/등급별 분기는 여전히 다음 구현 단계의 acceptance matrix에 포함한다. 미검증을 문제 없음으로 표시하지 않는다.

Documentation impact:
- architecture.md: not affected — 데이터/API/배포 구조 변경 없음.
- upload-flow.md: not affected — 파일 처리·전송·worker 변경 없음.
- user-flow.md: not affected — 사용자 흐름 구현 변경 없음; 새 탐색 제안은 proposal에 분리.
- 기타 관련 문서: updated — 모바일 검수/재설계안 및 시각 시안 추가, Light 문서의 현재 모바일 사실 정정, inventory에서 새 검수 링크 제공.
