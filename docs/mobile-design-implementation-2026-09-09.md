# 모바일 디자인 구현 및 검증 — 2026-09-09

사용자의 모바일 구현 요청에 따라 이전 검수 M01–M17의 제품 개선을 반영했다. 초기 검수와 proposal은 구현 전 기록이며, 현재 상태는 이 문서와 실제 코드를 따른다.

## 구현 범위

| 검수 항목 | 반영 내용 |
|---|---|
| M01, M05, M09 | 모바일 카드: 사진 수를 포함한 공통 상태 label, actor와 6단계 위치, PC와 같은 다음 작업 판단. 64px 사진·2줄 제목·중립 완료 색상·대기 중 상세 진입. 작업 주체 필터와 검색/필터 접근성 이름 제공 |
| M02, M16 | 시트·업로드창을 Light body portal로 이동. 공통 hook으로 focus trap/복귀, Escape, 배경 inert, 중첩 스크롤 잠금. 사진 뷰어도 같은 동작을 사용하며 Dark 사진 stage 유지 |
| M03 | 자산 첫 화면부터 프로젝트명/고객 문맥과 상세 복귀. 상세 intro에서 목록 복귀 |
| M04 | Mobile 공통 작업 버튼 최소 48px, toolbar/스위치/닫기/원본 보기 44px. PIN 시각/터치 영역 분리 |
| M06, M12 | 보정본 Mobile 기본 목록. 첫 자동 업로드창은 inset 12px, 본문 스크롤, 안내/버튼 세로 배치. toolbar 일괄 업로드·교체 재진입. 하단에 실제 업로드/교체 잔여 수 표시 |
| M07, M11 | 원본 ‘선택’ 진입과 전체 선택·해제·취소·선택 삭제. long press release click을 gallery 경계에서 차단해 재배치된 이웃 사진의 추가 선택 방지 |
| M08 | 설정에서 매뉴얼·기존 문의 기능 접근. 모바일 매뉴얼 redirect 제거, 문의도 Light 버튼/portal 사용 |
| M13 | 목록 조회 실패를 onboarding과 구분해 재시도 제공 |
| M14 | 생성 후 업로드 이동 여부와 원본 다운로드 허용 설정 분리. `include_original`은 선택값 유지 |
| M15 | 필수 오류 입력 focus, 하단 서버 오류 alert, 입력 보존. 생성 pending label과 폭 유지. 고정 하단 spacer 실측 |
| M17 | PIN 행 줄바꿈과 설정 버튼 wrap으로 작은 화면 대응. 합성 글자 확대 검사는 실기기 인증과 구분 |
| M10 | 디자인 시스템·사용자 흐름·업로드 문서와 구현 전 기록의 상태 연결 |

## 공통 구현

- `PhotographerPortal`: body에 overlay를 렌더하고 기존 `PhotographerLightTheme` 토큰을 적용한다.
- `useDialogAccessibility`: overlay 공통 동작. 배경의 기존 inert/overflow 상태를 복원한다. 모바일 시트는 desktop 전환 시 잠금을 해제한다.
- `PhotographerFormActionBar`: `error` alert와 `mobileLeading` slot. `mobileFixed`일 때 `ResizeObserver`로 safe-area/안내를 포함한 실제 높이만큼 spacer를 확보한다.
- `PhotographerLightButton`: 기존 크기/색 variant 재사용. `pendingLabel`을 제공하면 원래 label 폭을 유지하면서 처리 상태를 표시한다.
- `OriginalPhotoGallery`: 450ms 인식과 이동 취소 기준은 유지한다. 다음 pointer gesture부터 정상 선택을 허용한다.

## 검증

- `npx tsc --noEmit` 통과. 변경 파일 lint는 오류 0개이며 이미지 최적화/미사용 정의 경고 28개가 남는다. 최종 Playwright 실행은 **PC 4개 + Mobile 6개, 10개 모두 통과**했다(24.8초). 모바일 보정 목록의 개별 파일 선택창 열기, 44px 도구 버튼 간격, 일괄 창 재진입도 포함한다.
- Chromium 모바일 context에서 길게 누르기 → 한 장만 선택, release 후 유지, 같은 사진 해제와 다음 사진 추가 선택을 확인했다.
- 320×568 업로드창: footer는 안내 문구 제거와 10px padding 적용으로 약 65px이며, 실제 iPhone safe area가 있으면 하단 inset만큼 늘어난다. 기존 약 350px footer로 본문이 밀리던 현상을 해소했다. 측정 기준은 `UploadVersionsPanel.module.css` inset과 `.uvp-scroll`/footer DOM box다.
- 목록·생성·설정 320/360/390/430px에서 가로 넘침을 검사했다. 목록은 로딩 완료 후 별도로 확인했다.
- 생성/설정은 320px에서 root font-size 32px 합성 검사도 수행했으며 입력/버튼의 화면 밖 넘침이 없었다. 실제 OS 글자 확대 검증과 구분한다.
- 보정 목록은 116px 행 높이와 가상화 측정을 함께 변경했다. 파일명 두 줄과 기존 `SingleVersionUploadSlot`을 재사용해 목록에서도 개별 파일 선택이 가능하다. 320px 도구 버튼 네 개는 각각 44px이며 서로 겹치지 않는다.
- 빠른 생성 시 프로필 조회가 끝나기 전 ‘로그인이 필요합니다’가 표시되는 경쟁 조건도 확인해, 프로필 로딩 중 제출을 잠갔다.
- 테스트는 생성·삭제 실행을 interception하거나 테스트 전용 fixture를 만들고 정리한다. 기존 프로젝트의 실제 삭제·납품·문의 전송을 수행하지 않는다.

## 제한

Chromium 에뮬레이션 결과다. 실제 iOS/Android 키보드, OS 글자 크기, VoiceOver/TalkBack, 실기기 핀치와 대량 파일 전송은 인증하지 않았다. R2·worker·업로드 동시성·압축·상태 전환 API 계약은 변경하지 않았다. 원안의 그림은 구조 시안이며 픽셀 단위 구현 규격이 아니다.

스크린샷: [목록 320px](assets/mobile-implementation-2026-09-09/projects-320.png), [생성 320px](assets/mobile-implementation-2026-09-09/projects-new-320.png), [설정 320px](assets/mobile-implementation-2026-09-09/settings-320.png), [보정 목록](assets/mobile-implementation-2026-09-09/retouched-320.png), [일괄 업로드창](assets/mobile-implementation-2026-09-09/upload-dialog-320.png). 왼쪽 아래 N 아이콘은 로컬 개발 도구다.

## 사용자 피드백: 높은 우선순위 개선

프로젝트명 중심의 48px 자산 헤더, 탭 위 여백 축소, 일괄 업로드 텍스트와 더보기 시트, 64px 원본 사진, 작은 파일 선택 버튼, 중립색 비활성 검토 요청을 반영했다. 더보기는 기존 시트를, 파일 선택은 기존 단일 업로드 컴포넌트를 재사용한다. [개선 화면 390px](assets/mobile-implementation-2026-09-09/priority-improvements-390.png).

후속 검증: PC 4개와 모바일 6개 시나리오를 확인했다. 전체 실행 중 색상 기대값 오기 1건을 토큰값 `#eef3f4`로 정정해 해당 시나리오를 재실행했다. 320/390/430px에서 자산 헤더 48px과 가로 넘침 없음을 확인했고, 타입 검사 및 변경 파일 lint 오류는 0개다. 이미지/미사용 정의 경고는 유지한다.

## iPhone 16 Pro Chrome 제보 후 보완

- 기존 보정본이 있는 추가 업로드 분기에서 버튼 그룹의 `width:100%`가 같은 flex 행의 설명 폭을 압박했다. 모바일 grid와 버튼 전용 다음 행으로 수정했다.
- 전체화면 자산 셸은 fixed 헤더와 별도 top padding 조합을 실제 헤더 행 + 남은 높이 main으로 변경했다. 탭이 헤더 뒤에 배치되지 않도록 한다.
- `mobile-layout-regression.spec.ts`에서 Chromium과 WebKit을 각각 실행했다. 402×874 모바일 context의 원본 스크롤 → 셀렉 → 보정본 → 추가 업로드 → 320×568 변경 → 닫기를 검사한다. 탭 중앙의 실제 hit target, 헤더/탭 경계, 모달과 요약의 가로 넘침/높이를 확인했으며 두 엔진 모두 통과했다.
- 기존 보정본은 테스트 응답으로 재현했고 파일은 업로드하지 않았다. 테스트 프로젝트는 정리했다. 이는 로컬 WebKit 에뮬레이션이며 사용자의 실제 아이폰 재검증과는 구분한다.

추가 엔진 검사 2개 통과 후 기존 PC 4개·모바일 6개 회귀도 모두 통과했다(기존 회귀 25.7초). UI 배치 수정이며 API·스토리지·업무 전환 흐름에는 영향이 없다.

## 프로젝트 목록의 보정본 업로드 바로가기 진입 보완

- 사용자가 목록에서 바로 진입할 때 탭 가림을 제보했다. 기존 직접 URL 검사는 이 경로를 다루지 않았다. 보완 전 로컬 Chromium/WebKit에서 목록 하단 진입과 자동 업로드 창 닫기, 브라우저 뒤로가기 후 재진입을 검사했으나 동일한 가림은 재현되지 않았다.
- 코드상 데이터 로딩 전후로 fixed/flow 헤더 배치가 바뀌는 조건을 확인했다. 경로로 자산 화면군을 판별해 로딩 중에도 같은 셸 배치를 적용하고, 화면군 진입 시 문서 스크롤을 초기화했다. 외부 셸의 프로그램적 스크롤과 main padding 전환도 차단했다. 사진 목록 스크롤과 자산 탭의 보존 동작은 유지한다.
- 회귀 검사는 목록의 테스트 카드들을 응답으로 구성해 대상 카드를 화면 아래에 두고 실제 버튼으로 이동한다. 사진 응답을 보류하는 동안에도 헤더가 flow 배치이며 문서 스크롤이 0인지 확인한다. 자동 모달 닫기, 목록 복귀 후 재진입, 원본/셀렉/보정본 전환, 기존 보정본이 있는 추가 업로드 창의 좁은 폭도 검사한다.
- 실기기 제보의 원인을 확정한 것은 아니며, 실제 iPhone Chrome의 주소창 변화까지 검증한 결과로 해석하지 않는다.

검증 결과: 기존 PC 4개·모바일 6개 통과. 추가 진입 검사에서는 처음에 사진 지연 대상을 Next API로 잘못 지정해 2개가 timeout되었으며, 실제 Supabase 사진 조회 경로로 수정한 뒤 Chromium/WebKit 2개 모두 통과했다(23.4초). 타입 검사와 변경 TS/TSX 파일 lint도 통과했다. API·업로드 구조·업무 상태 전환에는 변경이 없다.

## 헤더 자체가 사라진다는 후속 제보에 따른 수정

앞선 flex flow 헤더 배치는 아래 방식으로 대체했다. 이전 절의 flow/clip 설명은 당시 수정 이력이다.

- 자산 헤더를 viewport 최상단 fixed로 복원했다. `--mobile-workspace-header-height`(48px + 상단 safe-area)를 헤더 높이와 본문 top inset 양쪽에서 사용한다. 본문 역시 fixed이며 padding 애니메이션 없이 헤더 아래부터 viewport 하단까지 차지한다.
- 자산 화면에서는 모달 열림에 따라 헤더를 언마운트하거나 main 클래스를 제거하지 않는다. portal 모달의 배경 격리 동작은 유지한다.
- 기존 검사의 헤더 y 좌표만으로는 충분하지 않아 헤더 표시, 최소 44px 높이, 뒤로가기 링크 중앙의 hit target을 추가했다. 목록 진입 및 자동 모달 닫기 후 외부 스크롤 시도, viewport 높이 변경, 재진입과 탭 이동에도 검사한다.

검증: 기존 모바일 6개·PC 4개 통과. WebKit 검사에서 탭 전환 중 DOM 교체로 boundingBox가 일시적으로 null인 경우를 재시도하도록 검사 코드를 수정한 뒤 추가 Chromium/WebKit 2개도 통과했다. 타입 검사와 변경 파일 lint 통과. 두 엔진의 스크린샷에서 뒤로가기·프로젝트명 헤더와 자산 탭이 함께 보임을 확인했다. [WebKit 헤더 복원 화면](assets/mobile-implementation-2026-09-09/header-restored-webkit.png). 실제 iPhone Chrome 검증은 포함하지 않는다.

## 사용자 지정 개선 1–9 구현

[디자인 시스템의 번호별 구현](design-system-light.md#모바일-보정본-개선-19-2026-09-09)을 반영했다. 모바일 보정 목록은 폭에 따라 커지는 동일 크기 사진/업로드 슬롯, 두 줄 파일명, 상태 행으로 구성한다. 기존 가상화와 뷰어 비교를 재사용한다. 삭제 선택은 더보기에서 진입하고 전체 선택·취소·선택 삭제를 제공한다. 상단 업로드 버튼의 폭과 목록 위 여백을 줄이고 하단 진행 안내를 두 단계로 정리했다. 10번 개발 도구는 변경하지 않았다.

검증 결과: 기존 PC 4개·모바일 6개 및 확장된 Chromium/WebKit 2개가 통과했다(전체 12개, 51.5초). 긴 보정 파일명·이미지 로드·320px 행 겹침·1440px 기존 PC 썸네일 크기 검사를 추가한 뒤 두 엔진 검사를 다시 통과했다(25.7초). 타입 오류 0개, 변경 파일 lint 오류 0개이며 기존 미사용 정의/이미지 경고 6개는 유지한다. 실제 iPhone Chrome 실기기 검증은 포함하지 않는다. 보정본 응답과 목록 배치는 테스트 응답으로 구성했고 실제 업로드/삭제는 실행하지 않았다. 생성한 테스트 프로젝트는 정리했다.

화면 확인: [모바일 보정 목록 1–9](assets/mobile-implementation-2026-09-09/retouched-improvements-1-9.png), [긴 파일명과 원본 비교](assets/mobile-implementation-2026-09-09/retouched-comparison-1-9.png). 비교 화면의 사진은 테스트용 원본/보정본 데이터다.

## 일괄 업로드 버튼 여백과 코멘트 영역

모바일 원본의 `유사컷`과 보정본의 `일괄 업로드`는 `ProjectAssetMobileContextAction`을 공유한다. 44px 터치 영역 안에 높이 36px, 좌우 padding 10px의 Orange tonal face를 사용해 toolbar를 과하게 채우지 않는다. Solid Orange는 하단 확정 작업에 남긴다. 모든 자산 탭은 `…` 메뉴 없이 선택·필터/정렬·보기 전환을 `ProjectAssetMobileIconButton`으로 바로 노출한다. 각 아이콘은 44px hit area와 18px 크기, 같은 색·radius·interaction을 사용하고 버튼 사이 추가 gap은 제거한다. 모바일 보정본 내보내기는 제거하고 PC 내보내기는 유지한다. 원본/보정본 쌍 아래에는 기존 `PhotoCardComment`를 재사용해 셀렉 코멘트와 보정 코멘트를 각각 전체 표시한다.

현재 보정 단계의 업로드가 일부라도 남아 있으면 모바일 하단 action bar는 Primary `일괄 업로드`를 표시한다. 이 CTA는 toolbar의 tonal 업로드와 같은 `UploadVersionsPanel`을 열며, 모든 대상 업로드가 완료되면 기존 검토 요청 CTA로 전환한다. Desktop 하단 검토 요청은 유지한다. 보정본 카드 파일명은 공통 자산 파일명과 같은 12px Medium·Muted foreground를 사용한다.

모바일 `UploadVersionsPanel`의 펼친 사진별 선택은 원본과 보정본 한 쌍을 14px radius card로 묶는다. 두 asset은 같은 너비의 4:3 preview를 사용하고 파일명은 preview 위에 12px Medium·Muted 한 줄로 표시한다. 빈 보정본도 같은 이미지 시작선과 geometry를 유지한다. 반복 `원본/V1` label과 자동 매핑 원리, 빈 결과 header를 숨기고 toggle은 `사진별 선택`으로 축약한다. 별도 `변경`·휴지통 action row 대신 보정본 preview 우측 상단의 24px White face와 작은 Danger `X`로 삭제하고, 비워진 4:3 `파일 선택` surface에서 다시 업로드한다. Footer는 설명 없이 10px padding의 취소·업로드 action만 유지한다.

모바일 업로드 dialog 상단은 56px title/close header로 줄이고 upload illustration, 대상·새 파일·매칭 상세, `매칭 결과` heading을 숨긴다. 기존 보정본이 있는 경우 파일 선택 상태는 52px neutral bar의 `선택/전체 장수 · 용량`과 `파일 다시 선택`만으로 전달한다. `선택 초기화`는 모바일에서 숨기며 정상적인 부분 업로드는 border 없는 11px note, 실제 파일 검증 오류만 warning surface를 사용한다. Footer의 Primary action은 실제 업로드 장수를 label에 포함한다. 보정본 preview의 24px `X` face는 44px hit area를 유지하면서 이미지 우측 상단 모서리에 맞춘다.

검증: 기존 PC 4개·모바일 6개 통과. 추가 Chromium/WebKit 검사는 테스트 보정 코멘트가 기존 `normalizeReviewComment`의 100자 제한을 넘겨 실패한 뒤, 제한 내 데이터로 수정해 모두 통과했다(24.4초). 버튼 표시 높이 32px, 터치 높이 최소 44px, 위아래 여백 최소 8px, 두 코멘트 표시, 본문 잘림 없음, 320px에서 다음 행과 겹침 없음, 1440px에서 PC 사진 크기 유지를 검사했다. 타입 검사 및 해당 컴포넌트 lint 오류 0개. 실기기 검증은 포함하지 않는다. [버튼 여백과 코멘트 영역](assets/mobile-implementation-2026-09-09/retouched-comments.png).

## 사진 사이 방향 표시와 중복 상태 제거

사용자 요청에 따라 모바일 코멘트 상단의 원본/업로드 완료/미업로드 문구를 제거했다. 이미지 사이에는 16px ChevronRight를 두 사진의 세로 중앙에 표시한다. 행의 기본 메타데이터 예상 높이를 64px로 조정했으며 코멘트를 포함한 실제 높이 측정은 유지한다.

검증 중 WebKit의 viewport 폭 변경 시 가상화 크기 캐시 초기화가 실제 행 측정보다 늦게 실행되어 코멘트 행이 겹치는 경우를 확인했다. 캐시 초기화 직후 화면에 있는 행을 즉시 재측정하도록 보완한 뒤 Chromium/WebKit 두 검사가 통과했다(25.0초). 화살표가 두 사진 사이와 이미지 세로 중앙에 놓이는지, 상태 문구 제거, 코멘트 표시 및 320px 행 겹침 여부를 검사했다. 변경 파일 lint 통과. [방향 표시와 상태 제거 화면](assets/mobile-implementation-2026-09-09/retouched-mapping-arrow.png).

## 지정 항목 1·2·6·8·9: 여백과 안내 위치

파일명 고정 높이를 없애 짧은 이름 아래의 공백을 줄였다. 보정 화면 하단 바에 compactMobile 옵션을 적용해 상하 여백과 내용 간격을 축소했다. 원본/보정본 제목 행 높이는 28px, 도구줄과 목록 외곽 여백은 16px로 맞췄다. 즉시 업로드 안내는 목록 상단에서 파일 선택 슬롯 안으로 이동했다. 코멘트 스타일과 필터 기능은 이번 요청 범위에 포함하지 않는다.

검증: PC 4개·모바일 6개·Chromium/WebKit 진입 및 레이아웃 2개, 총 12개 모두 통과(52.5초). 타입 검사와 공용 하단 바 lint도 통과했다. 스크린샷에서 안내 이동, 제목 행 축소, 좌우 정렬과 코멘트 배치를 확인했다. [여백 개선 화면](assets/mobile-implementation-2026-09-09/retouched-spacing-1-2-6-8-9.png). 실제 iPhone Chrome 검증은 포함하지 않는다.

## 프로젝트명 정렬 보완

자산 화면의 `MobileHeader` 좌우 padding을 20px에서 8px로, 버튼/제목 간격을 12px에서 4px로 줄였다. 뒤로가기 터치 영역 44px는 유지하며 프로젝트명은 20px 왼쪽으로 이동한다.

검증: WebKit 진입·헤더·모달 검사 통과. Chromium은 연속 탭 전환 중 이전 패널의 버튼을 잡아 timeout되어 탭의 aria-selected 완료를 기다리도록 검사를 보완한 뒤 통과했다. MobileHeader lint 오류 0개(기존 이미지 경고 1개).

## 상세 뷰어 지정 항목 1·3·5·8·9

상단 원본/보정본/비교 전환, 별도 버전 이력 시트, 사진 바깥의 파일명 캡션, 코멘트 개수·미리보기·전체 내용 시트, 모바일 사진 이동 시 비교 모드 유지를 구현했다. 원본만 있는 사진은 이를 안내하며 비교 모드 자체는 유지한다. 기존 비교 뷰어·버전 이력·접근성 훅을 재사용한다. 시트의 레이어는 뷰어 위에 배치하고 닫기/버전 선택 후 원래 버튼으로 포커스를 돌려준다. PC inspector 및 기본 사진 보기 흐름은 유지한다.

검증: 기존 PC 4개·모바일 6개 회귀 검사 통과. 추가 상세 뷰어 검사는 Chromium/WebKit 모두 최종 통과했다(30.9초). 보기 전환, 보정본 없는 사진으로 이동 시 비교 모드 유지, 코멘트 유무, 버전 선택과 시트 닫기, 트리거 포커스 복귀, 320px 화면의 시트 높이와 가로 넘침을 확인했다. 타입 검사와 변경 뷰어·이력·검사 파일 lint도 통과했다. 실제 iPhone Chrome 실기기 검증은 포함하지 않는다.

화면 확인: [모바일 상세 뷰어](assets/mobile-implementation-2026-09-09/viewer-accessibility-1-3-5-8-9.png), [320px 코멘트 시트](assets/mobile-implementation-2026-09-09/viewer-comment-sheet-320.png). 사진과 코멘트는 테스트 데이터다.

## 상세 뷰어 추가 지정 항목 1·2·3·5·7·8

사진 표시 폭을 넓히고 이동 버튼은 사진 아래에 배치했다. 상단 모드 전환은 터치 높이를 유지하며 외곽 여백을 줄이고 선택 상태와 키보드 포커스를 분리했다. 이력·코멘트 버튼에 아이콘, 개수와 진입 화살표를 추가하고 모바일 썸네일의 반복 모드 배지를 숨겼다. 사진 탭/명시적 버튼으로 집중 보기를 전환하며, 기존 MobileViewerPinchPhoto의 핀치·팬·더블 탭 확대를 재사용한다. 사진 비율은 contain으로 유지한다.

검증: 기존 PC 4개·모바일 6개 통과. 추가 Chromium/WebKit 2개도 최종 통과(36.2초). 사진 표시 영역 폭, 사진 아래 이동 버튼 배치, 단일 탭 집중 보기와 버튼 복원, 더블 탭 확대/초기화, 비교·코멘트·버전 이력과 좁은 화면 회귀를 확인했다. 타입 검사와 변경 뷰어 및 테스트 lint 통과. 핀치 동작은 기존 공용 구현을 재사용했으며 이번 자동 검사는 더블 탭 확대를 검증했다. 실제 iPhone Chrome 실기기 검증은 포함하지 않는다. [최종 상세 뷰어 화면](assets/mobile-implementation-2026-09-09/viewer-focus-controls.png).


### 모바일 비교 탭·집중 보기 CTA 제거

후속 요청으로 모바일 상세 뷰어는 원본·보정본 두 가지 전환만 제공한다. 비교 상태로 진입해도 모바일에서는 해당 사진 한 장을 표시하고 보정본 버튼을 활성화한다. PC 비교 기능은 유지한다. 집중 보기 CTA와 해당 버튼용 상단 여백을 제거했으며, 사진 단일 탭으로 조작 영역을 숨기고 다시 탭해 복원하는 동작 및 핀치·더블 탭 확대는 유지한다. 코멘트 영역은 이번 변경에서 수정하지 않았다. 이전 절의 비교 탭·집중 보기 버튼 설명은 이 변경으로 대체된다.

검증: Chromium/WebKit 모바일 회귀 2개 통과(36.0초). 두 모드만 노출, 단일 이미지 진입, CTA 제거, 사진 탭 숨김/복원과 더블 탭 확대를 검사했다. 타입 검사 및 변경 파일 lint 통과. 실제 iPhone Chrome 검증은 포함하지 않는다.


### 모바일 버전 이력 아이콘과 중앙 이동 버튼

버전 이력은 코멘트 영역 오른쪽 위의 History 아이콘으로 진입한다. `OriginalPhotoViewer.module.css`의 `.mobileHistoryButton`은 44px 터치 영역을 유지하고 아이콘은 20px로 표시한다. 버전 개수는 열린 시트 제목에 표시한다. 코멘트 제목과 미리보기는 하나의 버튼으로 묶어 전체 내용 시트로 연결하며 본문은 밝은 회색이다. 이전/다음 버튼은 사진 영역의 좌우 세로 중앙에 배치한다. PC 및 데이터/API 흐름은 유지한다.

검증: Chromium/WebKit 회귀 2개 통과(37.3초). 이력 아이콘으로 시트 진입, 버전 선택, 코멘트 시트와 포커스 복귀, 사진 이동 버튼의 세로 중앙 정렬을 확인했다. 타입 및 변경 파일 lint 통과. [화면 확인](assets/mobile-implementation-2026-09-09/viewer-history-icon.png). 실제 iPhone Chrome 검증은 포함하지 않는다.


### 모바일 코멘트 직접 표시

코멘트 개수·진입 화살표·별도 코멘트 시트를 제거했다. 본문을 바로 표시하고 `ViewerInlineComment`에서 실제 세 줄 넘침을 측정해 더 보기/접기를 제공한다. `.inlineComments`는 펼친 내용이 사진 영역을 밀어내지 않도록 최대 높이 140px와 내부 스크롤을 사용한다. 기존 데이터에 셀렉·보정 코멘트가 함께 있으면 내용을 누락하지 않고 단계 라벨과 함께 각각 표시한다. 버전 이력 아이콘 및 시트는 유지한다.

검증: Chromium/WebKit 회귀 2개 최종 통과(31.7초). 빈 코멘트, 본문 직접 표시, 개수 버튼 제거, 여러 줄 코멘트의 펼침/접기 및 이력 진입을 검사했다. 타입 검사와 변경 파일 lint 통과. 실제 iPhone Chrome 검증은 포함하지 않는다.


### 모바일 상세 미업로드·탭 개선 1~14

모바일 보정본 미업로드 시 원본을 대체 표시하지 않고 공용 ACUT 로고와 안내를 표시한다. 보정본 모드는 유지하며 원본 탭 및 좌우/썸네일 탐색은 계속 사용할 수 있다. 미업로드 배지는 보정본 모드 썸네일에만 나타나고 원본만 있는 이력 시트는 상태를 안내한다. 코멘트 출처, 간결한 모드 컨트롤, 고정된 헤더·사진 프레임을 적용했다. ViewerMobileImage는 URL별로 로딩/완료/실패 상태를 관리하며 이전 사진을 새 보정본처럼 표시하지 않는다. API·업로드·PC 비교 흐름은 유지한다. 세부 번호별 규격은 design-system-light.md의 모바일 상세 뷰어 미업로드·탭 개선 1~14 절을 따른다. 이전 원본 대체 표시 설명은 이번 구현으로 대체된다.

검증: PC 4개·모바일 6개·Chromium/WebKit 확장 2개 총 12개 통과. 320px 미업로드 화면 검사를 추가한 뒤 두 엔진 검사도 통과(35.0초). 중앙 로고·안내, 단일 원본 이력 안내, 미업로드 배지, 원본/보정본 전환 및 모드 유지, 코멘트 펼침, 기존 모바일 레이아웃을 확인했다. 타입 검사와 변경 뷰어/테스트 lint 통과. [320px 미업로드 화면](assets/mobile-implementation-2026-09-09/viewer-empty-retouched.png). 실제 iPhone Chrome 실기기 검증은 포함하지 않는다.


### 모바일 상단 시각 정리 1~7

1. 뷰어의 pointer/keyboard 입력 상태로 모바일 모드 버튼의 포커스 테두리를 구분한다. 터치 시 제거하고 키보드 탐색 시 :focus-visible 표시를 유지한다.
2. `.mobileModes` 내부 padding 3px로 선택 배경과 외곽을 분리한다.
3. 모바일 상세 `.header` 하단 선은 투명하게 처리한다.
4. `.mobileViewControls` 상하 padding을 6px로 통일한다.
5. 선택 배경은 #2e353b로 완화하고 흰색 굵은 글자를 유지한다.
6. 외곽 radius 8px, 선택 영역 radius 5px로 맞춘다.
7. `.counter`는 11px, #969fa7, 현재/전체 모두 font-weight 400으로 표시한다.

모드 버튼의 최소 터치 높이 44px와 PC 스타일은 유지한다.

검증: Chromium/WebKit 2개 최종 통과(34.0초). 터치 후 테두리 제거, 키보드 활성화 시 포커스 표시, 최소 44px 터치 높이 및 미업로드/탐색/코멘트 회귀 확인. WebKit 기본 Tab 이동 설정에 의존하던 검사는 명시적 포커스 후 Space 활성화로 조정했다. 타입 검사와 변경 파일 lint 통과. 실제 iPhone 검증은 포함하지 않는다. [탭 정리 화면](assets/mobile-implementation-2026-09-09/viewer-tabs-polished.png).


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

Validation: Existing desktop 4 and mobile 6 regressions passed. Updated Chromium/WebKit regressions both passed (40.3s), including matching surface colors, removal of mobile history, horizontal swipe navigation and no navigation while zoomed. Swipe checks dispatch synthetic touch events; this is not physical iPhone verification. Type checking and changed-file lint passed. [Unified viewer](assets/mobile-implementation-2026-09-09/viewer-unified-surface.png).


### Mobile retouched list landscape media

Retouched mapping rows reuse PHOTO_GRID_MEDIA_ASPECT_RATIO (218.32 / 150.7), matching the selected gallery. Original, retouched and upload slots share --mapping-media-height calculated from column width. Virtual row height estimates and the centered arrow use the same height. Desktop media sizes remain unchanged.

Validation: Chromium and WebKit regressions passed (40.3s), covering landscape aspect ratio, equal media heights, centered arrow, 320px row overlap and unchanged desktop thumbnails. Type check passed. [Landscape mapping rows](assets/mobile-implementation-2026-09-09/retouched-landscape.png).


### Mobile mapping filenames above images

Original and retouched filenames appear above their landscape media. Mapping cells use shared grid rows (subgrid), keeping both images aligned even when one filename wraps. The direction arrow belongs to the media row and comments follow both columns.

Validation: Chromium/WebKit passed (43.3s), including filenames above images, equal image top alignment, centered arrow and 320px row overlap checks. Type checking passed.


### Shared PhotoAssetPreview for selected and retouched media

PhotoAssetPreview now owns the filename header and PhotoThumbnailFrame presentation. Selected grid cards and mobile retouched mapping cells both use it. Filename typography is 12px / 20px, weight 500, with one-line ellipsis and the existing full-name hover tooltip. The shared frame owns radius, surface color and PHOTO_ASSET_MEDIA_ASPECT_RATIO; per-screen controls remain children. Original upload grids can supply a custom selection header. Mapping rows still share filename/media grid rows and measured virtual heights. --photo-asset-gap provides a common 3px gap default. Earlier separate retouched filename/two-line rules no longer define the active presentation.

Validation: All 12 existing desktop/mobile checks passed. Added cross-screen filename-style comparison initially found different inherited font fallback lists; PhotoAssetPreview now explicitly owns the font family. Chromium/WebKit cross-screen checks then passed (44.4s). Type checking and component lint passed. Physical iPhone testing is not included.


### Shared mobile asset toolbar geometry

Removed the retouched workflow override (56px height and 16px gutters). Original, selected and retouched tabs now use ProjectAssetWorkspaceToolbar compactMobile defaults: 44px height, 12px horizontal padding, no vertical padding. Upload button visual height remains 32px inside its 44px hit target. Function slots and desktop layout remain unchanged.

Validation: Chromium/WebKit regressions passed (39.2s). Expanded selected and retouched toolbars both measure 44px; upload button spacing and existing flows pass. Test setup resets scroll events before comparing heights because tabs share collapsed-header state. Type check passed.


### Mobile retouched select-all checkbox

The select-all checkbox moved from the workspace toolbar into the sticky retouched column header, directly before `보정본`. The checkbox-and-label group starts on the same left alignment line as retouched filenames. Its visible face is 18px and the touch target remains 44px. It selects/deselects eligible versions and enters list selection mode; partial selection uses `aria-checked="mixed"`. Approved and missing versions remain excluded.

The workspace toolbar keeps the current round and count during selection and no longer renders a selection-delete CTA at any viewport. A selected state replaces the shared bottom status action with `N장 선택됨`, `선택 해제`, and `선택 삭제`, using the existing danger confirmation flow. Clearing the selection restores the normal upload/review action. `ProjectAssetStatusActionBar.forceFallback` lets this local selection action take priority even when the project otherwise has a customer-waiting status.

Validation: Chromium/WebKit mobile regressions passed (42.8s), covering filename-aligned column labeling, the absence of an upper selection-delete CTA, the selected bottom action, selection clearing, existing navigation, and narrow layouts. Type checking and changed-file lint passed. No real photo deletion was performed; physical iPhone verification is not included.


### Mobile retouched card grid default (2026-09-10)

Removed the mobile-only effect that forced `viewMode="list"`. The existing desktop `V1Card` and `V2Card` are now the default mobile presentation through the shared `Workflow.module.css` two-column grid. Original reference thumbnails, landscape previews/upload slots, replacement controls, statuses, and comment data continue to use the same card implementation. Mobile renders compact source-labeled selection and retouch comments; desktop retains its existing retouch comment presentation. List comparison remains available in the mobile tools sheet.

The gallery toolbar provides a labeled `전체` checkbox with a 44px target. Each eligible uploaded card uses a shared mobile/desktop image-overlay checkbox in the retouched image's upper-left corner, preserving filename width. Its 44px hit area places the 20px face 4px from the top and left edges. The face is translucent white when unchecked and primary orange when checked; selected cards keep the orange ring. Missing and approved cards do not expose a checkbox. The replacement action moves to the lower-right edge with a 44px hit area and a smaller 28px visual button.

The fixed bottom selection action removes `선택 해제` and uses one full-width primary-orange `선택 삭제 N장` button. Selection is cleared through checked card/select-all controls, while deletion still requires the existing danger confirmation dialog.

The `미업로드` pill in an empty V1 card header is hidden below 768px. The existing upload slot remains the mobile status indicator, leaving the card header width to the original reference thumbnail and filename. Desktop keeps the pill.

Validation: six mobile design-system scenarios passed, followed by Chromium and WebKit layout regressions (59.3s). Coverage includes default two-column geometry, the hidden mobile missing-upload pill, both comment sources, image-overlay and select-all controls, the single primary bottom deletion action, optional list switching, 320px layout, viewer behavior, and upload modal sizing. Type checking and changed-file lint passed. No real deletion was performed; physical iPhone verification is not included.
