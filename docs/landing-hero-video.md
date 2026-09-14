# 히어로 제품 시연 영상

2026-09-12. 로컬 랜딩 히어로용 20초 무음 영상. 배포하지 않는다.

## 화면과 타이밍

실측한 데스크톱 히어로 1200×641 비율을 유지해 2400×1282, 모바일 4:5 영역은 960×1200으로 출력한다. 모두 30fps·600프레임이며 영상 자체는 contain으로 표시한다. 모바일은 가로 영상 크롭 대신 별도 세로 구성을 사용한다.

| 시간 | 장면 |
|---|---|
| 0–2.5초 | 휴대폰 고객 갤러리, 일부 사진에 주황색 별점 |
| 2.5–5.5초 | 0001·0006·0010을 순서대로 선택 |
| 5.5–6초 | 같은 0001 썸네일이 상세 사진으로 확대 연결 |
| 6–9.5초 | 요청을 구절 단위로 입력하고 저장 상태 표시 |
| 9.5–11.3초 | 갤러리로 복귀, 셀렉 확정 버튼과 실제 확인 다이얼로그 |
| 11.3–12초 | 제출 완료 |
| 12–12.6초 | 작가 셀렉 결과로 교차 전환 |
| 12.6–15초 | 동일한 세 장, 파일명, 사진 아래 요청 확인 |
| 15–16초 | 보정본 탭, ACUT_0001-보정.jpg 파일 놓기 |
| 16–18초 | 업로드 진행 |
| 18–19.3초 | 한 장 업로드 완료 |
| 19.3–20초 | 첫 갤러리로 교차 전환해 반복 |

상세 사진은 ACUT_0001.jpg를 비율 유지 cover로 채우고 사진 주변 주황 프레임을 제거했다. 입력 중인 코멘트에만 포커스 테두리·커서를 표시한다. 작가 결과는 실제 OriginalPhotoGallery의 셀렉 그리드와 카드 아래 PhotoCardComment를 사용한다. 실제 제품에 없는 오른쪽 요청 패널은 사용하지 않는다. 데스크톱은 사이드바·프로젝트 탭·도구와 3열 갤러리, 모바일은 읽을 수 있는 2열 갤러리로 배치한다.

## 사진 매핑

| 갤러리 순서 | 파일명 | 제공 파일명 | 결과 |
|---|---|---|---|
| 1 | ACUT_0001.jpg | 유사컷31.jpg | 선택·별점 4·요청 |
| 2 | ACUT_0002.jpg | 유사컷32.jpg | — |
| 3 | ACUT_0005.jpg | Gemini_Generated_Image_xtwe5ixtwe5ixtwe.jpg | — |
| 4 | ACUT_0006.jpg | Gemini_Generated_Image_mlcuphmlcuphmlcu.jpg | 선택·별점 5 |
| 5 | ACUT_0010.jpg | 유사컷02.jpg | 선택·별점 5 |
| 6 | ACUT_0003.jpg | Gemini_Generated_Image_o7ynpjo7ynpjo7yn.jpg | — |
| 7 | ACUT_0004.jpg | Gemini_Generated_Image_aew1n7aew1n7aew1.jpg | — |
| 8 | ACUT_0007.jpg | 유사컷21.jpg | — |
| 9 | ACUT_0008.jpg | 유사컷22.jpg | — |
| 10 | ACUT_0009.jpg | 유사컷01.jpg | — |

원본 경로: `/landing/sample-project/studio-v2/originals/{파일명}`. 고객/작가 화면은 같은 PICKS와 getSamplePhoto()를 참조한다. 0001의 요청은 양쪽 모두 “얼굴 주변 잔머리만 자연스럽게 정리해주세요.”다. 아래 랜딩 체험의 13장/4장 상태와 독립적이다.

## 자산과 재생성

`public/landing/hero/`에 데스크톱 `acut-demo.webm`, `acut-demo.mp4`, `acut-demo-poster.webp`와 모바일 `acut-demo-mobile.webm`, `acut-demo-mobile.mp4`, `acut-demo-mobile-poster.webp`를 생성한다. 정확한 해상도·길이·파일 크기는 `manifest.json`, `manifest-mobile.json`에 기록한다.

```sh
npm run dev
# 별도 터미널에서 실행
node scripts/render-landing-hero.mjs
node scripts/render-landing-hero.mjs --mobile
node scripts/verify-landing-hero.mjs
```

기존 Node·Playwright·Sharp, Playwright 번들 FFmpeg(VP8), macOS Swift/AVFoundation(H.264 fast start)을 사용한다. 패키지/lockfile 변경은 없다. macOS 인코딩 서비스와 브라우저 실행이 가능한 터미널이 필요하다. DEMO_ORIGIN으로 localhost 포트를 변경할 수 있다. 기본값은 http://127.0.0.1:3001이다.

PNG 프레임은 os.tmpdir()의 acut-hero-frames / acut-hero-mobile-frames에 저장한다. `--encode-only`로 해당 프레임을 재인코딩한다. DEMO_FRAMES, FFMPEG_PATH, SWIFT_MODULE_CACHE로 작업 경로를 지정할 수 있다. window.renderDemoFrame(seconds)로 시간을 주입하므로 녹화 타이밍은 재현 가능하다. 주소창·개발 도구·운영체제 UI는 요소 캡처에 포함되지 않는다. 두 형식 모두 오디오 트랙이 없다.

## 격리 및 재생 동작

개발 전용 /landing/demo-capture에서 실제 GalleryPhotoCard, SelectionConfirmDialog, ProjectAssetTabs, OriginalPhotoGallery 등에 정적 샘플을 적용한다. production은 notFound()로 차단한다. 운영 API·고객 경로·외부 서비스 요청은 녹화 스크립트에서 차단하고 검사한다. 서비스 기능·DB·업로드 흐름은 변경하지 않는다. 주요 녹화 로직은 한국어 주석을 포함한다.

HeroVideo는 autoPlay·muted·playsInline·loop·poster를 제공하고 컨트롤을 숨긴다. Safari가 video 내부의 `source media` 조건을 안정적으로 적용하지 않으므로 서버 HTML은 모바일 H.264 MP4 하나로 시작한다. 따라서 아이폰은 hydration 전부터 올바른 모바일 영상으로 네이티브 autoplay를 시도하며, 데스크톱에서만 viewport 확인 후 데스크톱 MP4로 교체한다. iOS의 네이티브 autoplay를 다시 초기화하지 않도록 `load()`를 호출하지 않으며 `play()`와 `canplay` 재시도는 보조 수단으로만 사용한다. 영상 표시는 React의 `playing` 이벤트 상태에 의존하지 않으며 실제 video 프레임을 항상 전면에 둔다. 영상이 화면에 들어올 때 자동재생을 다시 시도하며, 이후 3초 동안 현재 프레임조차 준비되지 않으면 poster 위에 작은 "영상 재생" 버튼을 표시한다. CSS로 비율을 예약해 레이아웃 이동을 방지한다. 최초 재생 후 waiting 또는 반복 경계에서는 poster로 되돌리지 않아 깜빡임을 방지한다. 움직임 축소 설정에서는 hydration 직후 자동재생을 멈추고 poster를 우선 표시하되, 사용자가 재생 버튼을 누르면 같은 화면에서 영상을 재생한다.

## 검증 방법

verify-landing-hero.mjs는 데스크톱 1440px·모바일 390px에서 비율, 가로 넘침, 실제 반복 경계 2회, waiting, 자동 재생 거절 모의, 미디어 오류, 움직임 축소와 수동 재생을 검사한다. 가로/세로 MP4도 별도로 디코딩한다. 결과와 스크린샷은 os.tmpdir()/acut-hero-verification/에 저장한다. WebKit iPhone 13 환경에서 자동재생과 움직임 축소 상태의 수동 재생을 별도로 확인하며, 실제 물리 기기는 검증 범위에 포함하지 않는다.

이전 정지 시안은 /landing/demo-capture?storyboard=1에서 별도로 보존하며, 최종 영상은 DemoCapture.tsx를 사용한다. 정지 시안의 오른쪽 패널은 최종 영상에 포함되지 않는다.


## 보정본 업로드 장면

승인된 시안을 최종 영상에 적용했다. UploadStoryboard.tsx는 부모의 frameTime을 받아 파일 이동, 진행 표시, 완료 이미지를 재현한다. 실제 SingleVersionUploadSlot이 지원하는 개별 파일 놓기 흐름이며 운영 업로드는 실행하지 않는다. ACUT_0001-보정.jpg와 원본 ACUT_0001.jpg를 함께 표시하고 나머지 두 장은 업로드 대기로 유지한다. AI 보정이나 고객 검토 시작은 표현하지 않는다.

변경 소스: DemoCapture.tsx, UploadStoryboard.tsx, upload-storyboard.css, HeroVideo.tsx, render-landing-hero.mjs, verify-landing-hero.mjs. 영상, poster, manifest 및 user-flow.md와 이 문서를 갱신한다.

## 최종 용량

| 구성 | WebM | MP4 | Poster |
|---|---:|---:|---:|
| 데스크톱 | 8,353,166 bytes | 6,382,195 bytes | 112,088 bytes |
| 모바일 | 5,352,986 bytes | 4,923,602 bytes | 61,708 bytes |

검증 완료: 데스크톱 1440px·모바일 390px에서 20초/해상도 일치, 가로 넘침 없음. 반복 경계 2회 및 waiting에서 poster 전환 없음. 자동 재생 거절·미디어 오류는 poster 유지, 움직임 축소는 영상 요청 0건. 두 MP4 디코딩 성공. 모든 시나리오 운영 API 0건. 업로드 완료 프레임 시각 확인 및 TypeScript·ESLint 통과. 실기기 iOS는 미검증, 배포하지 않음.
