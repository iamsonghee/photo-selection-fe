# 프로젝트 상태값 정리

프로젝트(`projects.status`)는 워크플로우 단계에 따라 아래 8가지 값을 가집니다.

---

## 1. 상태 목록 및 한글명

| 상태값 | 한글명 | 설명 |
|--------|--------|------|
| `preparing` | 업로드 전 | 작가가 프로젝트를 만들었고, 사진 업로드 중 (M < N) |
| `selecting` | 셀렉 중 | 고객이 N장을 고르는 단계 (초대 링크로 갤러리 접근) |
| `confirmed` | 셀렉 완료 | 고객이 최종 확정 완료. 작가 보정 대기 |
| `editing` | 보정 중 | 작가가 v1 보정본 작업 중. 고객은 locked |
| `reviewing_v1` | v1 검토 중 | 작가가 v1 보정본 전달 완료. 고객이 확정/재보정 선택 |
| `editing_v2` | v2 재보정 중 | 고객이 재보정 요청 후, 작가가 v2 작업 중 |
| `reviewing_v2` | v2 검토 중 | 작가가 v2 보정본 전달 완료. 고객이 최종 검토 |
| `delivered` | 납품 완료 | 고객이 전부 확정. 프로젝트 완료 |

---

## 2. 상태 전이 (누가 / 언제 바꾸는지)

- **API로만 변경**: 고객·작가 모두 상태 변경은 **API 경유**만 허용 (admin 또는 PATCH로 DB 반영). 클라이언트의 `updateProject` 직접 호출은 사용하지 않음.
- **전이 검증**: 작가 PATCH `/api/photographer/projects/[id]` 에서 `body.status` 변경 시 `canTransition(현재상태, 요청상태)` 로 검증. 허용되지 않으면 400.

```
[작가] 프로젝트 생성
    → preparing

[작가] 사진 업로드 완료 (M ≥ N) 후 초대 링크 공유
    → selecting   (※ 앱에서 자동으로 바꾸는지, 수동인지는 구현에 따름)

[고객] 갤러리에서 N장 선택 후 "최종 확정"
    → POST /api/c/confirm → confirmed (confirmProjectAdmin)

[고객] 확정 취소 (제한 횟수 내)
    → POST /api/c/cancel-confirm → selecting (cancelConfirmAdmin)

[작가] "보정 시작" 클릭 (현재 status === "confirmed" 일 때만 가능)
    → PATCH /api/photographer/projects/[id] { status: "editing" } → editing

[작가] v1 보정본 업로드 후 "고객에게 전달"
    → reviewing_v1

[고객] v1 검토 제출 — 전부 확정
    → delivered

[고객] v1 검토 제출 — 재보정 요청 있음
    → editing_v2

[작가] v2 보정본 업로드 후 "고객에게 전달"
    → reviewing_v2

[고객] v2 검토 제출 — 전부 확정
    → delivered

[고객] v2 검토 제출 — 재보정 요청 (1회 남은 경우)
    → editing_v2
```

---

## 3. 허용 전이 (canTransition)

`src/lib/project-status.ts`의 `canTransition(from, to)` 기준:

| 현재 상태 | 이동 가능한 다음 상태 |
|-----------|------------------------|
| `preparing` | `selecting` |
| `selecting` | `confirmed` |
| `confirmed` | `editing`, `selecting` |
| `editing` | `reviewing_v1` |
| `reviewing_v1` | `delivered`, `editing_v2` |
| `editing_v2` | `reviewing_v2` |
| `reviewing_v2` | `delivered`, `editing_v2` |
| `delivered` | (없음, 종료) |

---

## 4. 대시보드 그룹 (작가 프로젝트 목록용)

- **대기중** `GROUP_WAITING`: `preparing`
- **진행중** `GROUP_IN_PROGRESS`: `selecting`, `confirmed`, `editing`, `reviewing_v1`, `editing_v2`, `reviewing_v2`
- **완료** `GROUP_COMPLETED`: `delivered`

---

## 5. 고객 초대 링크(`/c/[token]`)에서의 동작

| 상태 | 고객이 보는 화면 / 이동 |
|------|--------------------------|
| `preparing`, `selecting` | 초대 랜딩 또는 갤러리(셀렉) |
| `editing`, `editing_v2` | `/c/[token]/locked` (보정 중 안내) |
| `confirmed` | `/c/[token]/confirmed` (확정 내용 확인) |
| `reviewing_v1`, `reviewing_v2` | "보정본이 도착했습니다!" → 검토 페이지 |
| `delivered` | `/c/[token]/delivered` (납품 완료 안내) |

---

## 6. 관련 타입/상수 위치

- **타입**: `src/types/index.ts` — `ProjectStatus`, `Project.confirmedAt` / `deliveredAt`
- **상수·전이 규칙**: `src/lib/project-status.ts` — `PROJECT_STATUSES`, `PROJECT_STATUS_LABELS`, `canTransition`, `getStatusLabel`
- **DB**: `projects.status` (text). 마이그레이션 등은 `supabase/migrations/` 참고
