# 에이전트 공통 프로젝트 규칙

> 이 문서는 **Claude Code와 Codex 모두**에게 적용되는 공통 프로젝트 규칙의 Source of Truth다.
> 각 에이전트 전용 지침 파일(`CLAUDE.md`, `AGENTS.md`)은 이 문서를 반드시 먼저 읽고 따르며, 아래 규칙을 자체적으로 복사·재정의하지 않는다 — 내용이 바뀌면 이 문서만 고치면 모든 에이전트에 동시에 반영된다.
> 저장 위치는 `photo-selection-fe/docs/`이지만, 적용 범위는 FE+BE 전체 프로젝트다(아래 Project Scope 참고).
> 마지막 업데이트: 2026-08-06

---

## Project Scope

이 프로젝트는 두 개의 **별도 git 저장소**로 구성된 하나의 서비스다.

- `photo-selection-fe` — Next.js 프론트엔드 (이 문서가 위치한 저장소)
- `photo-selection-be` — FastAPI 백엔드 (sibling 디렉터리, `../photo-selection-be`)

두 저장소는 같은 상위 폴더 아래 sibling 디렉터리로 함께 체크아웃되어 있다는 것을 전제로 한다. 어느 저장소에서 작업을 시작했든:

- 기능 구현, 버그 수정, 성능 분석, QA를 수행할 때는 **frontend와 backend를 함께 조사**해서 원인을 찾는다 — 한쪽 저장소 코드만 보고 결론 내리지 않는다.
- 이미지 바이트/파일 스토리지가 관여하는 작업(업로드, R2 삭제, presigned URL 등)은 브라우저 또는 Next API 라우트가 FastAPI 백엔드를 직접 호출하는 구조라는 점을 감안해 FE/BE 양쪽 코드를 함께 확인한다.
- sibling 저장소가 로컬에 없다면(예: 저장소 하나만 clone된 환경) 그 사실을 먼저 알리고, 접근 가능한 범위 안에서만 판단한다 — 없는 코드를 추측으로 서술하지 않는다.

---

## Source of Truth

- 실제 구현 코드를 Source of Truth로 본다.
- 코드와 문서가 충돌하면 실제 코드를 확인한 뒤 문서를 수정한다.
- 오래된 문서나 주석만 믿고 구현을 변경하지 않는다.
- 문서를 근거로 코드 쪽이 잘못됐다고 추정하지 않는다 — 코드가 명백한 버그로 보이더라도, 이 문서의 규칙에 따라 문서에는 "현재 코드 기준 사실"만 담고 버그 자체는 별도로 보고한다(수정은 별도 승인 후).

작업을 시작하기 전에 항상 아래 문서를 확인한다(`photo-selection-fe/docs/` 기준):

- `architecture.md` — 시스템 전체 아키텍처
- `upload-flow.md` — 업로드/원본 처리/썸네일·프리뷰 흐름
- `user-flow.md` — 사용자 흐름
- 그 외 작업이 영향을 주는 문서가 있으면 함께 확인한다.

---

## Documentation sync

구현 변경이 아래 항목에 영향을 주면 **같은 작업(같은 커밋/PR 단위)** 안에서 관련 문서도 반드시 함께 업데이트한다. "나중에 문서화"로 미루지 않는다.

- API 흐름
- DB schema / 상태값
- 주요 데이터 흐름
- R2/storage 구조
- background worker
- upload/download architecture
- batch/concurrency 방식
- 주요 사용자 flow
- 외부 서비스 연동
- 신규 핵심 기능
- 기존 핵심 기능의 동작 변경

다만 아래 변경은 문서 의미가 바뀌지 않는다면 문서 업데이트를 강제하지 않는다.

- 단순 스타일 변경
- 버튼 색상/문구 수준의 UI 수정
- 내부 리팩터링
- 동작 변화가 없는 코드 정리

---

## Documentation impact check

작업 완료 전에 반드시 관련 문서 영향 여부를 확인하고 최종 보고에 아래 형식을 포함한다.

```
Documentation impact:
- architecture.md: updated / not affected
- upload-flow.md: updated / not affected
- user-flow.md: updated / not affected
- 기타 관련 문서: updated / not affected
```

`not affected`라고 판단한 경우에도 실제로 구조나 사용자 흐름이 바뀌지 않았는지 확인한다 — 확인 없이 관습적으로 채우지 않는다. `updated`인 경우에는 어떤 문서의 어느 부분을 고쳤는지 한 줄로 덧붙인다.

---

## Safe implementation

- 기존 기능을 변경하기 전 관련 FE/BE 흐름을 함께 확인한다.
- 기존 구현 의도를 이해한 뒤 수정한다 — 추측으로 수정하지 않는다.
- 동일 기능을 구현한 기존 코드를 먼저 찾는다 — 중복 구현하지 않는다.
- 현재 사용 중인 call site를 검색한다.
- 미사용/legacy 코드라고 판단해도 임의로 삭제하지 않는다.
- 삭제가 필요한 경우 call site와 영향 범위를 먼저 보고한다 — 실제 삭제는 별도 승인 후 진행한다.
- 문서 서술과 실제 코드가 어긋나는 원인이 "현재 아무도 호출하지 않는 함수/경로"라면, 문서에는 **현재 active flow만** 사실로 서술한다 — 미사용 코드를 마치 실행되는 것처럼 설명하지 않는다. 미사용 코드는 문서에 "정의는 있으나 호출부 없음"으로 짧게만 남긴다.
- 수정 범위를 최소화한다.

---

## Documentation quality

- 숫자형 설정값(배치 크기, 동시성, 타임아웃, 픽셀/품질 값 등)은 숫자만 적지 말고 **관련 상수명 또는 환경변수명**도 함께 기록한다. 예: "PC 배치 크기 8장(`BATCH_SIZE=8`, `upload/page.tsx`)".
- 현재 기본값과, 환경변수 등으로 설정 가능한 값의 범위를 구분해서 적는다.
- 추측이나 예정 구조를 현재 구현처럼 문서화하지 않는다.
- 아직 구현되지 않은 설계는 명확히 "planned", "proposal" 등으로 구분한다.
