# 하객 사진 모으기 구현·검증 보고 (2026-10-12)

두 저장소의 로컬 `main`에서 `feat/guest-album-completion` 브랜치를 만들었다. 작업 worktree는 `../guest-album-fe`, `../guest-album-be`다. 원래 FE 작업 폴더의 알림톡 미커밋 변경은 건드리지 않았다. 사용자가 운영 마이그레이션을 적용했고, 신규 컬럼·RPC·설정값을 읽기 전용으로 확인했다. 후속 배포 요청에 따라 최신 원격 main을 통합했다. 배포 전 기존 앨범 4개 중 만료 대상은 0개였다.

## 구현

- 소유자 파일별 선택 저장, 새로고침·다른 브라우저 복원. 실패 시 선택 복원과 안내, 저장 중 다운로드 차단.
- 선택 스냅샷의 백그라운드 ZIP 파트 생성·바이트 진행률·실패 파트 재시도·서명 다운로드. 사진 원본/줄인 사진·영상 원본 구분. 단일 파일은 파트 목표 크기를 넘어도 쪼개지 않는다.
- KST 보관 종료 다음 날 만료 처리, 관리/다운로드 화면의 7일 전 경고, R2 삭제 성공 후 DB cascade 삭제.
- 공개 API 세 경로의 DB 기반 기기·IP 속도 제한, 동시 업로드의 파일 수·원본/파생 예약 용량 검사.
- 마지막 presign 후 기본 24시간에 pending 정리 표시. 기존 PUT URL 때문에 추가 2시간 유예 후 파일·행 삭제.
- 최초 submission 이후 결혼식 날짜 잠금(정리 후에도 유지), 업로드 전 날짜 수정, 확인창을 거치는 소유자 삭제.
- 검증 중 발견한 기존 오류 수정: 업로드 실패 직후 React ref가 아직 갱신되지 않아 완료 화면이 나올 수 있었다. 작업 내부 실패 집계로 재시도 화면을 보장한다.

## 새 마이그레이션·설정

사용자 적용 대상은 `supabase/migrations/20261012000000_guest_album_completion.sql` 하나다. `tests/sql/guest-local-bootstrap.sql`은 **빈 로컬 테스트 DB 전용**이며 운영에 적용하지 않는다.

| 새 app_settings 컬럼 | 기본값 |
|---|---:|
| `guest_album_max_files` | 5,000개 |
| `guest_album_max_mb` | 20,480MiB |
| `guest_device_requests_per_minute` | 기기당 120회 |
| `guest_ip_requests_per_minute` | IP당 1,200회 |
| `guest_pending_hours` | 24시간, 최소 2 |
| `guest_archive_part_mb` | 1,024MiB |

기존 `guest_retention_days=90`, 사진/영상 개별 제한은 계속 사용한다. 신규 값은 `/admin/settings`에서 변경 가능하다. DB는 pending도 예약량에 포함하고, 기존 파생 이미지의 실제 크기가 기록되지 않았으므로 키당 기존 최대치 5MiB를 보수적으로 반영한다.

운영 적용 순서: 기존 앨범의 결혼식 날짜와 보관 정책 확인 → 사용자가 마이그레이션 적용 → FE·BE 함께 배포 → 실제 R2/실기기 검증. 새 워커가 시작되면 이미 보관 기간이 지난 앨범도 자동 삭제 대상이다. 보관 기간 단축은 기존 앨범에도 적용된다.

## 검증

- TypeScript: `tsc --noEmit` 통과.
- 변경 TS/TSX 파일 ESLint: 통과.
- 전체 `npm run lint`: 실행했으나 main부터 존재하는 테스트 두 곳의 `@next/next/no-assign-module-variable` 오류로 실패. `tests/customer-selection-completion-api.test.mjs:25`, `tests/photographer-customers-api.test.mjs:63`. 전체 출력은 2 errors / 66 warnings이며 변경 파일 오류는 없다.
- Production build: `npm run build -- --webpack` 통과(컴파일·타입 검사·페이지 생성 완료).
- Python 단위/회귀: 하객 업로드·새 ZIP 워커·기존 원본 ZIP/최종 납품 ZIP 관련 16개 통과.
- 로컬 PostgreSQL/PostgREST 통합: 8개 동시 예약이 파일 수 한도를 넘지 않음, pending 표시/유예/원본·파생 파일 삭제, 파트 분할과 선택 스냅샷 유지 3개 통과.
- SQL 회귀: 소유권·날짜 잠금·파일 수/바이트 제한·선택 저장·작업 멱등성·동시 claim 방지·기기/IP 제한·KST 만료 경계 통과. transaction rollback으로 테스트 데이터 복원.
- Playwright Chromium: 3개 통과(44.4초). 업로드 강제 실패→다시 보내기→내가 보낸 사진→마감→선택 저장→새로고침/새 브라우저 복원→ZIP→보관 기간 단축→유예 후 원본/파생/ZIP/DB 삭제를 검증. 날짜 수정·새로고침·5일 만료 경고·삭제 취소/확인, 공개 API 세 경로의 기기/IP 제한도 검증.
- 데스크톱과 모바일 390px 화면 캡처 확인. 관리·다운로드 화면 가로 넘침 없음. 모바일 뷰포트는 실기기 검증을 대체하지 않는다.

테스트는 실제 Next API·FastAPI guest 라우트/워커·PostgreSQL/PostgREST를 통과했다. OAuth 사용자 확인은 로컬 가짜 auth, R2는 로컬 파일 저장소 대체물을 썼다. ZIP 바이트와 내용은 Python 테스트에서 검증했으며 브라우저 다운로드 응답의 ZIP 서명도 확인했다. 운영 서비스에는 연결하지 않았다.

## 로컬 재현

전용 PostgreSQL 17 컨테이너를 `127.0.0.1:55439`에 두고 PostgREST v12.2.12를 `127.0.0.1:55440`에 연결한다. PostgREST는 `PGRST_DB_ANON_ROLE=service_role`인 **로컬 테스트 전용** 구성이다. 빈 DB에 순서대로 실행한다:

1. `tests/sql/guest-local-bootstrap.sql`
2. `supabase/migrations/20260726_app_settings.sql`
3. `supabase/migrations/20261006000000_add_guest_albums.sql`
4. `supabase/migrations/20261006010000_guest_media_is_original.sql`
5. `supabase/migrations/20261012000000_guest_album_completion.sql`
6. `NOTIFY pgrst, 'reload schema';`

BE worktree에서 기존 Python 환경으로 실행:

```sh
SUPABASE_URL=http://127.0.0.1:55441 SUPABASE_SERVICE_ROLE_KEY=local-test \
python -m uvicorn tests.support.guest_local_server:app --host 127.0.0.1 --port 55441
```

FE worktree에서 운영 `.env`를 복사하지 않고 실행:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55441 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test SUPABASE_SERVICE_ROLE_KEY=local-test \
BACKEND_URL=http://127.0.0.1:55441 INTERNAL_PRESIGN_SECRET=local-test \
R2_PUBLIC_URL=http://127.0.0.1:55441/storage npm run dev -- --webpack -p 3107
```

```sh
GUEST_LOCAL_E2E=1 CI=1 PLAYWRIGHT_BASE_URL=http://localhost:3107 \
npx playwright test tests/e2e/guest-album.local.spec.ts --retries=0
```

BE 통합 테스트는 `GUEST_LOCAL_E2E=1 python -m unittest tests.test_guest_local_integration`이다. SQL/BE 통합/브라우저 검사는 같은 테스트 DB의 정책을 바꾸므로 **서로 순서대로** 실행한다. `tests/support/guest_local_server.py`는 테스트 명령에서만 구동하고 운영 앱에 등록하지 않는다.

## 미검증·제안·제한

- 연결된 iOS/Android 실기기와 실제 촬영 HEIC/HEVC 자료를 확보하지 못해 HEIC 사진, iOS 영상 썸네일, HEVC PC 재생, 앱 전환/화면 잠금 업로드는 실기기 검증하지 않았다.
- 코드상 사진 디코딩 실패 시 원본 전송·파생 이미지 생략으로 진행한다. iOS 영상 썸네일은 브라우저 video 프레임 추출에 의존한다. HEVC는 원본 재생이라 코덱을 지원하지 않는 PC에서는 미리보기가 실패할 수 있다. 문제 재현 시 재생용 H.264 프리뷰를 별도 생성하는 방안을 검토해야 한다(이번에는 영상 변환을 추가하지 않음).
- 강제 네트워크 실패→재시도는 데스크톱 Chromium에서 확인했다. 실제 iOS 백그라운드 중단/HEVC 문제의 해결을 주장하지 않는다.
- 실제 R2 대용량·장시간 전송, CDN 캐시 삭제, 운영 프록시 헤더는 미검증이다. Vercel의 신뢰 헤더가 없으면 모든 요청이 공용 IP 버킷을 사용한다.
- 선택별 ZIP은 앨범 만료/삭제까지 캐시되므로 업로드 예약량과 별도 저장 공간을 쓴다. 파트 생성은 한 워커당 한 개씩이며 임시 디스크 여유가 필요하다.
- A5 안내판은 생략했다. 기존 QR PNG 저장은 유지한다. 전체 받기는 새 업로드 경로 없이 ZIP 스냅샷 대상을 전체 ready 파일로 바꾸는 정도로 추가 가능하지만, 이번에는 제안만 하고 구현하지 않았다. AI 장면 정리는 제외했다.

UI 문구·폰트 기준 확인: 기존 전역 sans/mono 토큰과 공용 버튼/확인창 사용, 고객 해요체, 의미 있는 문구 12px 이상.

Documentation impact:
- architecture.md: updated — 하객 DB/RPC/워커/API 추가.
- upload-flow.md: updated — 예약량·실패 재시도·ZIP·삭제 경로.
- user-flow.md: updated — 선택 저장부터 다운로드·날짜 수정·삭제.
- customer-select.md: updated — 구현 현황·설정·수명주기·제외 범위.

## 변경 파일

FE:

- `docs/architecture.md`
- `docs/customer-select.md`
- `docs/guest-album-completion.md`
- `docs/upload-flow.md`
- `docs/user-flow.md`
- `src/app/api/admin/settings/route.ts`
- `src/app/api/customer-select/guest-albums/[id]/archives/route.ts`
- `src/app/api/customer-select/guest-albums/[id]/route.ts`
- `src/app/api/guest/[token]/media/complete/route.ts`
- `src/app/api/guest/[token]/media/presign/route.ts`
- `src/app/api/guest/[token]/submissions/route.ts`
- `src/app/customer-select/guest/[albumId]/download/page.tsx`
- `src/app/customer-select/guest/[albumId]/layout.tsx`
- `src/app/customer-select/guest/[albumId]/page.tsx`
- `src/app/customer-select/guest/[albumId]/select/page.tsx`
- `src/app/customer-select/guest/_lib/GuestAlbumSettings.tsx`
- `src/app/customer-select/guest/_lib/album-store.tsx`
- `src/app/g/[token]/GuestUploadClient.tsx`
- `src/components/admin/AdminSettingsForm.tsx`
- `src/components/guest-album/GuestRetentionWarning.tsx`
- `src/lib/app-settings.ts`
- `src/lib/guest-album-server.ts`
- `src/lib/guest-album.ts`
- `supabase/migrations/20261012000000_guest_album_completion.sql`
- `tests/e2e/guest-album.local.spec.ts`
- `tests/sql/guest-album-completion.sql`
- `tests/sql/guest-local-bootstrap.sql`

BE:

- `app/guest_lifecycle.py`
- `app/main.py`
- `app/routers/guest_upload.py`
- `tests/support/guest_local_server.py`
- `tests/test_guest_lifecycle.py`
- `tests/test_guest_local_integration.py`
