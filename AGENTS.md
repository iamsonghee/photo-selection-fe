# A-CUT — Codex Agent Instructions (frontend)

이 저장소에서 작업하기 전에:

1. **`docs/agent-guidelines.md`를 읽는다.** Claude Code와 Codex가 공통으로 따르는 프로젝트 규칙(Source of Truth, 문서 동기화 조건, 안전한 구현 절차 등)의 Source of Truth이며, 여기서는 요약·복제하지 않는다.
2. 그 문서의 공통 규칙을 이 저장소의 프로젝트 지침으로 그대로 따른다.
3. 구현 변경이 공통 규칙의 "Documentation sync" 기준에 해당하면, `docs/architecture.md` / `docs/upload-flow.md` / `docs/user-flow.md` 등 관련 문서를 코드 변경과 **같은 작업 안에서** 함께 최신화한다.
4. 작업 완료 전에 문서 영향 여부를 확인하고, `docs/agent-guidelines.md`의 "Documentation impact check" 형식으로 결과를 보고한다.

## 저장소 구조 (Codex 전용 참고)

- 이 저장소(`photo-selection-fe`, Next.js)는 백엔드 저장소 `../photo-selection-be`(FastAPI)와 **별도 git 저장소**다. 두 저장소를 하나의 서비스로 함께 조사하되, 커밋은 각 저장소 기준으로 분리한다(이 저장소 커밋에 백엔드 변경을 함께 넣지 않는다).
- 백엔드 저장소에는 별도의 `AGENTS.md`가 있다. Claude Code는 이 저장소의 `CLAUDE.md`를 따른다. 세 파일 모두 공통 규칙은 `docs/agent-guidelines.md` 하나만 참조한다.
