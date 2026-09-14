# 03 보정본 검토 정지 시안

영상 제작 전 검토용 시안이다. 기존 랜딩 03 영역과 히어로 영상은 교체하지 않았다.

## 구성
- ACUT_0010.jpg 원본과 보정본 한 쌍만 사용한다.
- 휴대폰 검토 UI 옆에 보정본 확인 → 원본 비교 → 확정 또는 재보정 요청 단계를 배치한다.
- 모바일 시안은 휴대폰 UI에 집중한다.
- 실제 고객 검토 화면의 모바일 원본 비교는 탭 전환이며, 데스크톱에서는 누르는 동안 원본을 본다.
- 예시 요청: “피부 톤을 조금 더 자연스럽게 조정해주세요.”
- 입력 및 저장 표시는 랜딩 전용 정적 샘플 상태다. 운영 API 호출은 없다.

## 이미지
`docs/assets/review-storyboard/` 아래:
- 01-retouched.png: 보정본 확인
- 02-original.png: 원본 비교
- 03-request.png: 요청 작성
- 04-saved.png: 요청 저장 상태
- 05-mobile.png: 모바일 배치

데스크톱 PNG는 2400×1440, 모바일 PNG는 1280×1600이다.
샘플 경로는 `public/landing/sample-project/studio-v2/{originals,retouched}/ACUT_0010.jpg`다.

## 재생성
로컬 개발 서버를 3001 포트로 실행한 상태에서:

```sh
node scripts/capture-hero-storyboard.mjs --review
```

캡처 주소: `/landing/demo-capture?reviewStoryboard=1` (개발 환경 전용).
`window.renderDemoFrame(t)`로 장면을 고정한다. 향후 영상 길이는 시안 검토 후 결정한다.

## 검증
- TypeScript 및 변경 파일 ESLint 통과.
- 데스크톱/모바일 캡처에서 프레임 잘림 및 요청 텍스트 표시 확인.
- 캡처 manifest의 API 요청 0건.

## Documentation impact
- architecture.md: not affected — 개발 전용 시안 추가.
- upload-flow.md: not affected — 업로드 변경 없음.
- user-flow.md: not affected — 실제 서비스 흐름 변경 없음.
- review-demo-storyboard.md: updated.

## 원본 누르기 영상 (2026-09-12)

정지 시안 이후 요청에 따라 PC 포인터의 press-and-hold를 강조한 영상을 제작했다.
휴대폰 외곽 대신 일반 검토 카드로 표시한다. 실제 모바일의 탭 비교 동작은 변경하지 않는다.

- `seconds=12`, `fps=30`, 캔버스 1200×720, `scale=2` → 2400×1440.
- 0~1.5초: 보정본. 1.5~3.5초: 첫 원본 비교. 3.5~4.5초: 보정본 복귀. 4.5~6.5초: 두 번째 원본 비교. 6.5초: 해제 후 보정본 복귀.
- 8초: 요청 작성, 10~12초: 저장 상태. 원본/보정본은 0.18초 opacity 보간으로 전환한다.
- 생성: `node scripts/render-landing-hero.mjs --review`
- 출력: `public/landing/review/acut-review.{webm,mp4}`, `acut-review-poster.webp`, `manifest.json`.
- 기존 히어로 영상 및 랜딩 03 영역은 교체하지 않았다. 본 영상은 검토용이며 루프 연결은 별도 적용 단계에서 조정한다.


## 03 검토 영상 적용 (2026-09-12)

`LandingStory`의 보정본 등록 전 예시는 `ReviewVideo`의 12초 정적 영상으로 표시한다. 원본을 2초씩 두 번 비교하며, 기존 등록 후 검토 체험은 유지한다. 5:3 비율과 contain으로 모바일에서도 전체 프레임을 표시한다. 히어로와 공통 LandingVideo에서 무음 자동재생·인라인·반복 재생을 사용하며 움직임 축소 설정에서도 영상을 마운트한다. 화면 진입 시 재생을 재시도하며 거절·오류 시 poster와 수동 재생 버튼을 제공한다. 반복 경계나 waiting에서 CSS로 영상을 숨기지 않는다. 운영 API나 실제 서비스 검토 흐름은 변경하지 않는다.
