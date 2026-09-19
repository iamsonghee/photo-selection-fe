# 셀프 고객 셀렉 서비스 (2026-09-19)

> 작가가 A-CUT을 쓰지 않는 경우, 고객이 직접 촬영본을 올려 셀렉하고 파일명·보정요청을 외부
> 작가에게 전달하는 별도 이용 흐름. `feature/customer-select` 브랜치에서 구현, `main` 미병합.
> 이 문서는 기획 초안이 아니라 **실제 구현된 코드를 기준**으로 작성했다 — 초기 기획 문서
> (`customer-select-step1.md`, 세션 스크래치패드)와 갈라진 지점은 각 절에 명시했다.

## 1. 왜 별도 시스템인가

기존 `projects`/`photos`/`selections`(작가 플로우)와 소유권·인증·생애주기 모델이 근본적으로
다르다: 소유자가 링크+PIN이 아니라 로그인 계정, 확정 후 잠금이 없음(자유롭게 되돌리기),
원본을 보관하지 않음(고객 기기에 이미 있음), 재보정 횟수 제한 없음(외부 작가와의 계약
사항이라 A-CUT이 강제하지 않음). 그래서 `customer_projects`/`customer_photos`/
`customer_selections`/`customer_photo_versions`/`customer_project_participants`를 완전히
분리된 테이블로 새로 만들었다(작가 테이블에 컬럼을 얹거나 합성 소유자 계정에 귀속시키는
방식은 검토 후 기각 — 단계 0 분석 참고).

## 2. 데이터 모델

초기 마이그레이션: `supabase/migrations/20260919*.sql` (5개, 프로덕션 적용 완료).
추가 프로젝트 정보는 `20260920000000_add_customer_project_details.sql`에 있으며,
CLI 이력과 맞지 않으므로 `supabase db push`가 아니라 대시보드 SQL Editor 또는
Management API로 이 파일만 실행한다.

- **`customer_projects`**: `owner_id`(auth.users 참조), `name`, `shoot_type`, `shoot_date`·`selection_deadline`·`studio_name`(선택 입력), `target_count`(참고용 가이드, 강제 아님), `photo_count`, `share_token`(hex, 참가자 인증용), `exported`, `retouch_done`
- **`customer_photos`**: 원본 파일명 유지, `thumb_url`/`preview_url`(BE 업로드 응답을 그대로 저장 — R2_PUBLIC_URL이 설정돼 있어 presign 단계 불필요)
- **`customer_selections`**: 사진당 1행. `rating`/`comment`는 프로젝트 공용, `color_tags`(text[])로 참가자별 찜 여부만 구분 — 작가 플로우의 `selections.color_tags`와 같은 설계
- **`customer_photo_versions`**: 사진 1장에 여러 회차의 보정본(무제한 재보정 — 작가 플로우 v1/v2 상한과 다름). `round`/`decision`(pending·confirmed·redo)/`redo_reason`
- **`customer_project_participants`**: `project_participants`(작가 플로우)와 동일 패턴 — 색=참가자 슬롯, 표시용 닉네임 + 완료 표시. 계정 없는 참가자를 서버가 식별할 수 없어 이 방식이 그대로 유효

모든 테이블은 RLS만 켜고 정책은 두지 않는다 — 읽기/쓰기는 전부 Next.js API 라우트가
service-role 클라이언트로 수행한다(`project_participants`와 동일 관례).

동시성: `customer_selections.color_tags` 추가/제거는 `toggle_customer_selection_color` RPC로
원자 처리한다. 여러 참가자가 동시에 같은 사진에 서로 다른 색을 찜하는 것이 이 기능의 핵심
시나리오라, 전체 배열을 통째로 재전송하는 방식(작가 플로우가 2026-07-29에 겪은 lost-update
버그와 같은 클래스)을 처음부터 쓰지 않았다.

## 3. 인증 모델

- **소유자**: 기존 작가 로그인과 동일한 Supabase Auth(Google/Kakao) — `src/app/customer-select/login/page.tsx`가 별도 화면으로 `signInWithOAuth`를 호출한다. 기존 `AuthModal`(사이버펑크 톤)은 이 서비스의 "단순한 소비자 UI" 목표와 톤이 맞지 않아 재사용하지 않았다.
- **참가자(공유 링크)**: 로그인하지 않는다. `customer_projects.share_token`을 URL 쿼리(`?share_token=`)로 들고 다니며, 최초 방문 시 아직 안 쓰인 색 슬롯을 자동 배정받고 `localStorage`(`acut:customer-select:identity:{projectId}`)에 저장해 재방문 시 복원한다. 닉네임은 접속 직후 배너로 물어보되 스킵 가능(`NicknamePrompt.tsx`).
- Next.js API 라우트는 소유자 세션(쿠키) 또는 `share_token` 둘 중 하나로 접근을 허용한다(`resolveCustomerProjectAccess`, `src/lib/customer-select-server.ts`). BE 업로드 엔드포인트는 소유자 Supabase JWT(Bearer) 또는 `share_token` 폼필드로 같은 판단을 한다(`app/routers/customer_upload.py`).

**기획 초안과의 차이**: 원래 초안은 참가자 전용 경로를 `/cs/[token]/**`로 분리하는 안이었으나,
실제로는 소유자와 같은 `/customer-select/[projectId]/**` 경로에 `share_token` 쿼리만 추가하는
방식으로 구현했다 — 페이지 컴포넌트를 이중으로 만들 필요가 없어 더 단순하다.

## 4. 업로드 아키텍처

- **클라이언트 압축**: 작가 업로드 화면의 `lib/upload-client-compress.ts`(`compressImagesInParallel`)를 그대로 재사용한다. identity 비의존으로 설계돼 있어 그대로 가져다 썼다 — 1600px/0.82 압축(`UPLOAD_INTERMEDIATE_MAX_EDGE/QUALITY`). 20장씩 압축 후 즉시 전송해 대량 선택 시 압축 결과 전체가 메모리에 쌓이지 않는다.
- **BE 엔드포인트**: `POST /api/customer-upload/photos`(원본), `POST /api/customer-upload/retouched`(보정본) — 둘 다 `app/routers/customer_upload.py`. 작가 업로드(`/api/upload/photos`)는 `get_current_photographer`·베타 쿼터·`original_jobs`(납품 원본 보관) 등 작가 생애주기에 강하게 결합돼 있어 재사용하지 않고, 썸네일·프리뷰 생성 로직(`_make_thumb_and_preview_sync`)만 가져다 썼다.
- **상한**: 프로젝트당 5,000장 — 등급별 쿼터 테이블 없이 상수 하나(`MAX_PHOTOS_PER_CUSTOMER_PROJECT`).
- **보정본 파일명 매칭**: 작가 플로우의 `lib/version-mapping.ts`(`buildVersionMapping` — 정확일치 → 접미사 제거 후 일치)를 그대로 재사용. 실패분은 화면에서 드롭다운으로 수동 지정.
- **저장 실패 대응**: `real-store.tsx`의 셀렉/찜/별점/코멘트 저장은 최대 3회 재시도(backoff) 후에도 실패하면 낙관적 업데이트를 되돌리고 배너로 안내한다. 작가 플로우의 `SelectionContext.tsx`(폴링·필드별 버전 관리를 포함한 978줄)를 통째로 재사용하려 했으나 API 계약이 달라(`/api/c/**` 전제) 재사용 범위가 예상(~60줄)보다 훨씬 작았다 — 핵심 보장(실패가 조용히 사라지지 않는 것)만 축소 이식했다. 다른 참가자의 변경사항을 실시간으로 반영하는 폴링은 아직 없다(각 화면이 마운트 시 재조회하는 수준).

## 5. 화면과 라우트 (실제 구현 기준)

| 화면 | 경로 | 상태 |
|---|---|---|
| 로그인 | `/customer-select/login` | 구현됨 |
| 프로젝트 생성 | `/customer-select/new` | 구현됨 |
| 사진 업로드 | `/customer-select/[projectId]/upload` | 구현됨 |
| 셀렉 갤러리 | `/customer-select/[projectId]/select` | 구현됨 |
| 최종 검토 | `/customer-select/[projectId]/review` | 구현됨 |
| 작가 전달 결과 | `/customer-select/[projectId]/export` | 구현됨 |
| 보정본 업로드+매칭 | `/customer-select/[projectId]/retouch/upload` | 구현됨 |
| 원본·보정본 비교 | `/customer-select/[projectId]/retouch/compare` | 구현됨 |
| 재보정 요청 전달 | `/customer-select/[projectId]/retouch/export` | 구현됨 |
| 완료 | `/customer-select/[projectId]/done` | 구현됨 |
| 내 프로젝트 목록(초안 S2) | `/customer-select` | 구현됨 — 로그인 후 기본 착지점, 상태별 다음 작업으로 이동 |
| 프로젝트 설정/삭제(초안 S9) | — | **미구현** |
| 공유 링크 관리 화면(초안 S14) | — | **미구현** — 링크는 셀렉 갤러리의 "공유" 버튼으로 즉시 클립보드 복사만 제공, 발급 중지·재발급 UI 없음 |
| 실시간 참여 표시(1차 재미 요소) | — | **미구현** — 마일스톤·취향 일치율·의견 갈린 사진 필터는 구현, "접속 중" 배지는 없음 |
| CSV/TXT 실제 다운로드 | — | **미구현** — 전달 화면에 버튼만 있고 비활성(복사만 실동작), 기존 `ProjectAssetsPageClient.tsx`의 `csvEscape`·`downloadTextFile` 로직을 그대로 옮기면 됨(단계 0 조사 결과) |

접근·삭제 정책과 보관 만료 정책은 아직 정해지지 않았다 — Step 6/7 완료 보고에서
남은 항목으로 표시했던 것과 동일하게 유효하다.

### 5.1 공통 ACUT 화면 기반 (2026-09-19)

로그인·프로젝트 목록·새 프로젝트 화면은 작가 Light UI의 브랜드 토큰을
`AcutLightTheme.module.css`로 공유한다. 고객 셀렉 전용으로 새 디자인 시스템을 복제하지 않고,
참가자 상태·셀렉 갤러리 같은 도메인 UI만 전용으로 유지한다. PC는 `max-width: 1504px`
작업 영역, 모바일은 단일 칼럼으로 반응형 배치한다. 로그인 후에는 새 프로젝트로 즉시
보내지 않고 `/customer-select` 목록으로 이동한다. 전역 `body`도 ACUT 라이트 캔버스를
기본값으로 사용하므로 고객 셀렉 화면이 별도의 다크 배경을 덮는 구조가 아니다.
프로젝트 생성과 이후 업로드·검토·전달·보정본 흐름의 하단 행동 영역은
`PhotographerFormActionBar`를 공유한다. 본문만 화면별 최대 폭에 맞추고 액션바의 surface와
상단 divider는 화면 전체 폭을 사용한다.
사진 업로드 화면은 생성 화면과 같은 `CustomerSelectShell`·`PhotographerLightPageFrame`·
`ProjectFormSection`을 사용하며, 드롭존과 진행 상태만 업로드 도메인 UI로 유지한다.
업로드 중 장수와 진행률은 작가 업로드와 동일하게 공통 하단 액션바의 상태 영역에 표시한다.
선택한 파일은 `PhotographerPhotoGallery`에 로컬 blob 미리보기로 즉시 추가하고,
`isPending`·`isUploading` 상태로 사진별 준비·전송 현황을 표시한다.

## 6. 참고

- 원래 기획 초안 전체(사용자 여정, 화면별 예외 처리, 미결정 질문 목록)는 세션 스크래치패드
  `customer-select-step1.md`에 있다 — 저장소에 반영되지 않은 임시 파일이라 이 문서와 내용이
  갈리면 **이 문서(및 실제 코드)를 신뢰**한다.
- 관련 절: `architecture.md`의 "셀프 고객 셀렉 서비스" 절, `user-flow.md`의 같은 절.
