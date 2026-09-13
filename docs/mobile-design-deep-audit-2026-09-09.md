# 작가 모바일 정밀 검수 — 2026-09-09 후속

> Historical, pre-implementation findings. Current status: [Mobile implementation and verification](mobile-design-implementation-2026-09-09.md).

> **미구현 / 제품 코드 변경 없음.** 사용자의 ‘꼼꼼하게’ 요청에 따라 [1차 검수](mobile-design-audit-2026-09-09.md)의 미검증 상태를 추가 확인했다.
> [실패·짧은 화면 상태 시안](assets/mobile-audit-2026-09-09/deep/state-proposal.png)을 추가했다.
> [보완된 재설계안](mobile-design-proposal-2026-09-09.md)과 함께 읽는다. 아래 문제는 수정 완료 목록이 아니다.

## 1. 결론과 우선순위 변경

1차의 일반 화면 검사보다 중요한 문제가 **새 세션·실제 터치 이벤트·네트워크 실패**에서 발견됐다. 우선순위를 `선택 대상 정확성 → 첫 진입 업로드창 → 상태/설정값 정확성 → 오류와 modal 동작 → 정보 밀도`로 조정한다.

| ID | 우선순위 | 결과 | 영향 |
|---|---|---|---|
| M11 | P1 | 한 장 long press 후 두 장 선택 | 사용자가 의도하지 않은 사진까지 삭제 대상에 포함될 수 있음. 삭제 미실행 |
| M12 | P1 | 첫 방문 자동 업로드창의 body/하단 배치 붕괴 | 작은 화면에서 파일 선택과 설명 확인을 방해 |
| M13 | P1 | 목록 GET 실패를 빈 목록 onboarding으로 표시 | 데이터가 없는 상태와 조회 실패를 구분할 수 없음 |
| M14 | P1 | 원본 허용 OFF와 생성 payload 불일치 | 버튼에 따라 고객 원본 허용값이 달라짐 |
| M15 | P2 | 생성 실패가 화면 밖, pending 버튼 이름/geometry 소실 | 저장 상태와 복구 방법을 확인하기 어려움 |
| M16 | P2 | 사진 viewer 초기 focus/Tab이 배경에 남음 | 시트 외의 별도 dialog에도 공통 접근성 누락 |
| M17 | 검증 과제 | root text-size 200% 합성 검사에서 PIN row 넘침 | 실기기 글자 확대를 반드시 후속 검사해야 함 |

P1은 이번 작업의 수정 우선순위다. 실제 운영 사고, 데이터 삭제, 보안 침해가 발생했다고 주장하지 않는다. 발견한 문제를 숨기거나 UI만 바꿔 우회하지 않는다.

## 2. 환경·데이터·증거 수준

- Chromium의 기존 테스트 인증 상태를 메모리에서 새 BrowserContext로 복사했다. 매 시나리오에서 context를 닫아 route mock·storage·선택 상태를 정리했다. 인증값은 문서/파일로 출력하지 않았다.
- 추가 context 옵션: `isMobile:true`, `hasTouch:true`, viewport `320×568`, `390×844`, `430×844`; `navigator.maxTouchPoints=1`을 확인했다. 모바일 UA를 별도로 지정하지 않았고 OS/하드웨어를 에뮬레이션하지 않았다.
- long press는 CDP `Input.dispatchTouchEvent`의 touchStart → 560ms → touchEnd. 이는 DOM `.click()` 합성이 아닌 Chromium touch 입력이지만 실제 휴대폰에서의 판정은 아니다.
- 네트워크 경계는 context route fulfillment로만 만들었다. 목록/사진 GET 반환값을 일시 교체했고 정상 데이터는 서버에 다시 쓰지 않았다. 생성 POST는 로컬에서 보류한 뒤 HTTP 500을 반환했다. **정상 생성·원본 허용값 저장·사진 삭제·파일 업로드를 실행하지 않았다.**
- 최초 화면 재현에는 sessionStorage가 비어 있는 새 context를 사용했다. 새 context의 인증은 기존 계정이며 신규 가입 사용자를 뜻하지 않는다.
- 일반 문서 가로폭뿐 아니라 **dialog 내부 scrollWidth, body/하단 실측 높이, 화면 밖 오류, 활성 focus, 손가락 아래 hit target**을 측정했다.
- root font-size32px은 `html { font-size:200% !important }`를 임시 주입한 합성 stress 검사다. 실제 iOS/Android 글자 확대·browser zoom·200% 인증 테스트와 구분한다.
- 실기기 Safari/Android 키보드·주소창·safe-area·VoiceOver/TalkBack·실제 pinch는 아직 미검증이다. 모든 정상 업로드/납품 상태·대량 사진 성능을 검증했다는 뜻도 아니다.

## 3. M11 — 한 번의 길게 누르기에서 두 사진이 선택됨

**재현:** preparing 프로젝트 `78664367-194a-4867-84e8-4692d810bc3c` → 원본 업로드 → `IMG_0001.jpg` 중앙에서 560ms touch 유지 → 손 떼기. 취소 후 같은 조작을 반복.

| 시점 | 선택됨 | 손가락 좌표 아래 |
|---|---|---|
| touchStart 전 | 없음 | IMG_0001 상세 보기 |
| 560ms 유지 후 | IMG_0001 | IMG_0002 선택 |
| touchEnd 후 | IMG_0001 + IMG_0002 | IMG_0002 선택 해제 |

초기 반복 **2/2회**, 이벤트 단계별 추가 검사 **1회**에서 확인했다. 20px 이동 후 560ms 유지하는 비교 동작에서는 관리 모드가 열리지 않았다(1회). 즉 이동 취소 조건과 추가 선택 문제는 구분된다.

원인 연결:

- [`upload/page.tsx`](../src/app/photographer/projects/[id]/upload/page.tsx)의 `enterMobilePhotoManageMode`는 해당 photoId 하나를 추가한다.
- 같은 파일의 gallery leading cell은 `!mobilePhotoManageMode`일 때만 ‘사진 추가’를 렌더한다. mode 전환 시 앞의 cell이 사라져 원래 두 번째 칸의 첫 사진이 첫 칸으로 이동한다.
- [`OriginalPhotoGallery.tsx`](../src/components/photographer/OriginalPhotoGallery.tsx)의 450ms timer와 `didLongPressRef`는 각 사진 컴포넌트 단위다. 새로 손가락 아래 놓인 다음 사진에 들어오는 click까지 막는 전역 gesture 계약은 없다.
- 따라서 ‘오래 누른 원래 사진에서는 click을 무시한다’만으로는 안전하지 않다.

**제안/완료 기준:** 진행 중 gesture의 touchEnd와 후속 click을 gallery 수준에서 한 번에 소비하거나, 손을 뗄 때까지 cell geometry를 유지한다. 명시적 ‘선택’ 버튼을 추가하더라도 long press 오류가 저절로 해결되는 것은 아니다. 첫/중간/끝 행, 가상화 재배치, 선택 취소 후 재진입, 20px 이동 취소를 실제 touch로 재검증한다. 선택 수·강조 사진·확인창 삭제 대상이 항상 같아야 한다.

[2장 선택 증거](assets/mobile-audit-2026-09-09/deep/touch-selection.png)

## 4. M12 — 첫 진입 자동 보정본 업로드창

1차 검수의 ‘모바일 일괄 매칭은 재사용 후보’ 설명을 정정한다. **현재도 첫 보정본이 없는 editing 프로젝트의 첫 진입에서 `UploadVersionsPanel`이 자동으로 열린다.** `WorkflowPageClient`는 `isActive`, `assetView=retouched`, 대상 있음, V1 업로드 0장 등 조건과 sessionStorage의 prompt key로 노출을 제어한다. 같은 세션의 후속 방문에서는 생략되므로 일반 페이지 스크린샷만으로 이 상태를 놓칠 수 있다.

| viewport | dialog 폭/높이 | 내부 scrollWidth | footer 높이 | 관찰 |
|---|---|---|---|---|
| 320×568 | 272×544px | 304px | 350.5px | body 압축, footer 안내문 세로 줄바꿈, 파일 선택 버튼 y=549px |
| 390×844 | 342×820px | 340px | 350.5px | footer의 과도한 높이, 좁은 안내문 칼럼 |
| 430×844 | 382×729.5px | 380px | 103px | 내용 여유가 상대적으로 확보됨 |

320×568은 별도 새 context에서 **2/2회** 재현. 390/430은 각 1회. 사진/파일명 mock 없이 실제 기존 프로젝트로 확인했다.

원인: inline overlay 24px inset, header/body/footer `px-8`, footer의 줄어들지 않는 104px 취소+132px 업로드+gap 조합이 같은 행에 있다. 안내문만 극단적으로 축소되고 footer가 body 공간을 가져간다. 이 overlay도 main stacking context 안에 있어 `elementFromPoint(22,25)`는 배경 header 링크를 반환한다. 초기 focus는 공통 hook 덕분에 dialog 내부로 들어오므로 **focus 성공과 layout/배경 차단 실패를 별도 판정**한다.

**제안:** 모바일 workflow shell의 header/body/footer를 공통화하고 좁은 폭에서 설명→버튼 수직 배치, 두 버튼 같은 48px 높이, body 독립 스크롤, 제목/닫기 항상 접근 가능을 보장한다. 파일 선택 전 안내는 한 줄이 아니어도 읽을 수 있어야 한다. 자동 열림을 유지할지 여부와 별개로 **닫은 뒤 다시 여는 ‘일괄 업로드’ 진입점**을 모바일 toolbar/메뉴에 명시한다. 현행 자동 노출을 ‘미구현 기능’으로 취급하지 않는다.

[320px](assets/mobile-audit-2026-09-09/deep/upload-dialog-320.png) · [390px](assets/mobile-audit-2026-09-09/deep/upload-dialog-390.png)

## 5. M13 — 조회 실패와 빈 상태 혼동

Supabase `/rest/v1/projects` GET에 HTTP 500을 주입한 뒤 목록으로 진입하면 **‘첫 프로젝트를 만들어보세요’**가 표시된다. 같은 GET에 `[]`를 반환한 정상 빈 상태와 동일하다. 실패 상태 **2/2회**, 정상 빈 fixture 1회 확인. quota는 별도 응답이므로 mock 목록이 빈 경우에도 원래 사용량이 표시될 수 있다. 사용량 불일치를 별도 제품 버그로 추가하지 않는다.

`projects/page.tsx`의 load는 `.catch(console.error).finally(setLoading(false))`이고 error state를 보존하지 않는다. 초기 projects=[]가 onboarding으로 이어진다. 사용자에게 재시도 경로가 없다.

**제안:** `loading / loaded-empty / loaded / filtered-empty / error`를 명시적으로 구분한다. 최초 조회 실패는 ‘프로젝트를 불러오지 못했어요 + 다시 시도’, 기존 목록을 가진 재조회 실패는 기존 목록+갱신 실패 안내로 표현하는 안이다. 빈 상태에서만 생성 안내. API 반환 규칙 자체는 변경하지 않는다.

[조회 실패가 빈 목록으로 보이는 증거](assets/mobile-audit-2026-09-09/deep/list-read-error.png)

## 6. M14 — ‘원본 다운로드 허용’ OFF와 버튼별 payload

동일 유효 입력·동일 OFF 상태에서 생성 POST를 가로챘다. 실제 생성은 하지 않았다.

| 동작 | switch aria-checked | 전송 include_original |
|---|---|---|
| 원본 올리기 | false | true |
| 나중에 올리기 | false | false |

원인은 Create `handleSubmit(goToUpload)`의 `finalIncludeOriginal = goToUpload ? true : includeOriginal`. 현재 코드 주석에 의도도 남아 있으므로 우연한 렌더링 버그로 단정하지 않는다. 다만 사용자에게 표시되는 ‘고객 원본 다운로드 허용’과 ‘업로드 화면으로 바로 이동’이 서로 다른 결정인데 현재 UI에서 결과가 합쳐진다.

**기획 판단:** 권장안은 원본 허용값과 생성 후 이동을 분리해 두 버튼이 같은 선택값을 존중하는 것이다. 기존 강제 ON 정책을 유지해야 한다면 Primary 선택 전에 ON이 되는 결과와 이유를 명시하고 모순된 OFF를 두지 않는다. 이는 색/배치 변경만으로 해결할 수 없는 **별도 동작 결정**이며, 이번 설계 문서에서 API 동작을 바꾸거나 승인됐다고 간주하지 않는다.

## 7. M15 — 폼 오류/대기 상태

- 빈 생성 제출: first invalid control과 error id는 연결돼 있지만 activeElement는 ‘원본 올리기’ 버튼에 남는다. 실제 구현은 wrapper `scrollIntoView`만 수행한다. 화면 이동과 focus 이동은 다르다.
- 유효 입력 제출을 지연 후 500으로 반환: input 값은 유지되고 중복 버튼은 disabled로 잠긴다(유지할 동작).
- 처리 중 Primary는 글자 없이 spinner만 남아 **54×34px**으로 줄어든다. `aria-label`, `aria-busy`도 없다. `PhotographerLightButton`의 pending 계약이 있어도 call site가 `disabled`만 전달하고 children을 교체하므로 자동으로 해결되지 않는다.
- 서버 오류는 320×568에서 y=830px, 390×844에서 y=1106px에 있어 현재 viewport 밖이었다(두 viewport에서 각 1회). form-level error에 alert/live role도 없다. 서버 실패가 해결됐거나 버튼이 반응하지 않았다고 오해할 수 있다.

**제안:** pending 상태에서도 ‘생성 중…’ 같은 accessible name과 버튼 geometry를 유지한다. form-level failure는 입력값을 보존하며 action bar의 reason/alert 또는 보이는 오류 요약으로 안내한다. 오류를 숨기는 해결책은 사용하지 않는다. first-field validation은 해당 input에 focus하고 label/hint/error가 읽히도록 한다. 이 동작은 공통 Form/ActionBar contract로 관리한다.

[실패 메시지가 보이지 않는 현재 viewport](assets/mobile-audit-2026-09-09/deep/create-error-offscreen.png)

## 8. M16 — Dark 사진 viewer 접근성

390×844, 원본 첫 사진 tap → dialog 열림 → Tab → Escape를 확인했다. 최초 focus와 Tab 이후 focus가 모두 viewer 밖에 남았고, Escape는 닫힘(1회). 닫기 control은40×40px, 이전/다음은44×44px이다.

`OriginalPhotoViewer`는 role/name과 개별 keydown handler가 있지만 공통 `useDialogAccessibility`를 사용하지 않는다. Dark stage는 유지하면서 동작 계약만 공유하는 것이 적절하다. 비교/도움말 중첩 상태와 기존 Arrow/hold-preview shortcut이 상위 dialog Escape와 충돌하지 않도록 구현 단계에서 검증한다. 기존 PC 시트 개선이 모든 viewer까지 적용됐다는 뜻은 아니다.

## 9. 경계 조건의 통과/보류 기록

| 검사 | 결과 | 해석 |
|---|---|---|
| 한도 GET 500 → 다시 시도 → 정상 quota | 정상 폼으로 복구 | 기존 실패 안내와 재시도 유지 |
| quota 50/50 | 한도 도달 안내, 목록으로 복귀 action | 유효 폼을 먼저 채우게 하지 않는 분기 유지 |
| 매우 긴 프로젝트명/고객명, 320px | document 가로 넘침 없음 | 실제 이름은 생략됨; 정보 확인 링크/이름2줄 필요 |
| 긴 파일명 5장, 원본320px | 가로 넘침 없음, 앞부분만 반복 | `TruncatedTextTooltip`은 mouse enter/leave 기반. 터치 전체명 확인은 viewer/명시 control로 보완 |
| 긴 파일명 보정본320px | file label 폭23px 사례 | body의 폭 계산과 footer 압축은 다른 문제; 첫 방문 modal 포함 검사 필요 |
| 390→767→768→844×390→390 | document 넘침 없이 전환 | 768부터 Sidebar가 나타나 main502px, 가로844에서 main578px. 폭 기반 현행 정책이며 터치 device라도 PC shell이 됨 |
| long press 중20px 이동 | 관리 모드 미진입 | 10px 이동 취소 조건의 대표 확인, 모든 제스처 통과 아님 |
| root font-size32px 합성 검사 | 생성 PIN control 오른쪽373px>320px, settings layout viewport332px | 실기기 확대에서 재확인할 설계 과제. 실제 200% 접근성 인증 결과 아님 |

가로폭 검사는 `scrollWidth === innerWidth`만으로 끝내지 않는다. 모바일 browser가 layout viewport를 확장하면 둘이 같이 커질 수 있다. 요청한 viewport 폭과 visual viewport, 내부 control 경계를 함께 비교해야 한다.

[긴 프로젝트명](assets/mobile-audit-2026-09-09/deep/long-project-name.png) · [긴 파일명](assets/mobile-audit-2026-09-09/deep/long-filenames.png) · [PIN 확대 합성 검사](assets/mobile-audit-2026-09-09/deep/text-stress-pin.png)

## 10. 구현 전 결정을 고정할 항목

1. 원본 허용 정책과 생성 후 이동을 분리할지 결정(M14). 현행 API/worker 계약을 문구 수정으로 몰래 바꾸지 않는다.
2. 자동 첫 방문 업로드 안내의 노출 방식과 재진입 위치(M12). 재사용할 모달이 이미 존재한다는 전제에서 결정한다.
3. 모바일 기본 보정본 view를 작업 목록으로 바꿀지와 기존 grid 선호 보존 방식(M06).
4. gesture 종료 시점과 관리 모드 geometry, 단일 선택 불변조건(M11).
5. 공통 mobile overlay 범위: Sheet + UploadVersions + Viewer 각각의 theme/shortcut 경계와 동일한 focus/background 계약(M02/M12/M16).

새 모달·새 버튼·새 상태 계산 함수를 늘리는 것으로 완료 처리하지 않는다. 기존 구현의 call site와 state contract를 함께 정리하고, 실제 검증한 범위만 현재 디자인 시스템으로 승격한다.

Documentation impact:
- architecture.md: not affected — 구조/API/DB 구현 변경 없음.
- upload-flow.md: not affected — 실제 전송/선택 삭제/worker 변경 없음.
- user-flow.md: not affected — 동작 변경 제안은 별도 proposal이며 현재 flow 구현은 유지.
- 기타 관련 문서: updated — 정밀 검수·증거 추가, 최초 검수의 후속 범위/한계와 재설계 우선순위·상태 계약 보완.
