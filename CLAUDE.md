# A-CUT Claude Code Project Rules

이 문서는 **Claude Code 전용** 지침이다. Claude/Codex 공통 프로젝트 규칙(Source of Truth 원칙, 문서 동기화 조건, 안전한 구현 절차 등)은 `docs/agent-guidelines.md`에 있다.

**작업을 시작하기 전에 `docs/agent-guidelines.md`를 읽고, 그 안의 공통 프로젝트 규칙(Project Scope, Source of Truth, Documentation sync, Documentation impact check, Safe implementation, Documentation quality)을 반드시 따른다.** 아래는 그 공통 규칙 위에 Claude Code에서만 쓰는 QA 절차·서브에이전트 운용 규칙을 추가한 것이다 — 공통 규칙 내용을 여기서 다시 복사하지 않는다.

---

# QA 및 버그 수정 절차

## 목적

사용자가 이미 발견한 문제만 수정하는 것이 아니라,
필요한 경우 실제 사용자 흐름을 테스트하여
잠재적인 버그와 회귀 문제를 발견한다.

## 역할

- **qa-explorer**
  - Playwright 기반 탐색적 QA
  - 사용자 흐름 테스트
  - 버그 재현
  - 성능 이상 탐색

- **Main Claude**
  - 근본 원인 분석
  - 코드 수정
  - 테스트 추가
  - 최종 판단

- **qa-verifier**
  - 수정 내용 독립 검증
  - 회귀 테스트
  - 브라우저 재검증

---

# 검증 전략 (중요)

모든 작업에 Playwright를 실행하지 않는다.

변경 위험도에 따라 검증 수준을 선택한다.

## Level 1 : 기본 검증

다음 작업은 Playwright를 실행하지 않는다.

- 문서 수정
- 주석 수정
- 오탈자 수정
- 사용하지 않는 import 제거
- 단순 리팩토링
- 내부 코드 정리
- UI 영향이 없는 변경

필요 시 실행

- typecheck
- lint
- 관련 unit test

---

## Level 2 : 기능 검증

다음 변경은 기능 테스트를 수행한다.

- API 변경
- 서비스 로직 변경
- DB 처리 변경
- 상태 관리 변경
- 비즈니스 로직 변경

실행

- typecheck
- lint
- build
- 관련 unit/integration test

---

## Level 3 : 브라우저 검증

다음 변경에만 Playwright와 qa-verifier를 사용한다.

- 인증
- PIN
- 로그인
- 쿠키
- 세션
- 토큰
- 페이지 이동
- Router 변경
- 사용자 입력
- 저장
- 업로드
- 다운로드
- 새로고침
- 뒤로가기
- 모바일 UI
- 실제 사용자가 직접 수행하는 기능
- 프론트 + 백엔드 연동 기능

---

## qa-explorer 사용 조건

qa-explorer는 다음 경우에만 사용한다.

- 사용자가 탐색적 QA를 요청한 경우
- 알려지지 않은 버그를 찾는 경우
- 기능 영역 전체를 점검하는 경우
- Main Claude가 필요하다고 판단한 경우

일반적인 코드 수정에는 자동으로 사용하지 않는다.

---

# 버그 수정 절차

필요한 경우 아래 순서를 따른다.

1. qa-explorer가 기능 영역을 탐색한다.
2. 발견한 문제는 최소 2회 이상 재현한다.
3. Main Claude가 원인을 분석한다.
4. 최소 범위만 수정한다.
5. 자동 테스트를 추가한다.
6. typecheck/lint/build를 수행한다.
7. 필요 시 qa-verifier가 브라우저 검증을 수행한다.
8. FAIL이면 수정 후 재검증한다.
9. PASS 후 사용자에게 보고한다.

---

# 버그 수정 원칙

- 증상만 가리는 수정은 하지 않는다.
- 근본 원인을 해결한다.
- 오류 메시지를 숨기지 않는다.
- 임의의 delay를 추가하여 해결하지 않는다.
- 새로고침으로 해결되는 문제를 정상으로 간주하지 않는다.
- 인증 문제는 다음을 모두 확인한다.

    - Cookie
    - Session
    - LocalStorage
    - Token
    - Provider 상태
    - Router 이동
    - API 호출 순서

- 테스트를 삭제하거나 비활성화하지 않는다.

---

# 탐색 QA 권장 영역

1. 고객 링크 및 PIN 인증
2. 프로젝트 목록
3. 사진 목록
4. 사진 상세
5. 사진 셀렉
6. 별점
7. 코멘트
8. 보정본 전달
9. 작가 기능
10. 권한 및 접근제어

---

# 최종 보고

최종 보고에는 반드시 포함한다.

- 검증 수준(Level 1~3)
- 선택한 이유
- 테스트한 기능 영역
- 실행한 사용자 흐름
- 발견한 버그
- 수정한 버그
- 변경 파일
- 추가한 테스트
- 실행한 테스트
- 브라우저 검증 여부
- 남아있는 위험
- 테스트하지 못한 범위
- **Documentation impact** — `docs/agent-guidelines.md`의 "Documentation impact check" 형식 그대로 포함(구현 작업 완료 보고마다 필수)

---

# 신규 기능 기획

새로운 기능을 요청받았다고 해서 product-planner를 자동 호출하지 않는다.

다음 작업은 메인 세션에서 직접 진행한다.

- 초기 아이디어 논의
- 기능 필요성 검토
- 간단한 사용자 흐름 논의
- 와이어프레임 초안 및 수정
- 기능 범위에 대한 반복적인 대화

다음 경우에만 product-planner 사용을 고려한다.

- 사용자가 명시적으로 요청한 경우
- FE와 BE를 포함한 코드 영향 조사가 필요한 경우
- API, DB, 권한 및 기존 기능 충돌을 정식으로 분석해야 하는 경우
- 합의된 기획을 구조화된 설계안으로 정리해야 하는 경우

product-planner를 사용하기 전에는 조사 범위와 산출물을 최소화한다.
