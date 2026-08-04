# 업로드 플로우

> 코드 기준: `upload/page.tsx`, `upload.py`, `upload-client-compress.ts`  
> 마지막 업데이트: 2026-08-04

---

## 개요

업로드는 **셀렉용 이미지**와 **납품 원본**을 분리해서 처리한다.

- **셀렉용**: 브라우저 압축 → 서버 전송 → FastAPI가 썸네일/프리뷰 생성 → R2
- **납품 원본**: 브라우저 원본 → R2 presigned PUT 직접 → Worker가 비동기 압축 → R2 (B Plan)

---

## 레이어별 역할

### Browser (`upload/page.tsx`, `upload-client-compress.ts`)

1. 파일 선택 → `startUpload()` 호출
2. `include_original=true`이면 HEIC 파일 전체 차단 (FE 선행 검증)
3. **모든 파일**을 브라우저에서 압축(`include_original` 여부와 무관하게 항상 실행) — 업로드 화면(`upload/page.tsx`)은 워커 풀 기반 `compressImagesInParallel()`로 한 라운드의 파일을 동시에 압축(데스크톱 2 workers / 모바일 1 worker, 2026-07-27 이후). 그 외 화면(설정 프로필 이미지, 보정본 업로드 등)은 기존 싱글턴 워커 기반 `compressImageForUpload()`를 그대로 사용 — 두 경로 모두 실제 압축 로직은 `compressWithWorker()`를 공유한다.
4. 압축 결과를 FormData에 담아 FastAPI로 POST
5. `include_original=true`이면 응답의 `original_presigned`를 받아 브라우저 원본(`rawFile`)을 R2에 직접 PUT
6. PUT 완료 후 서버에 confirm 통지 (`POST /originals/confirm`)

### FastAPI (`upload.py`)

1. FormData에서 압축본 파일을 받아 Pillow로 썸네일(300px/75%) + 프리뷰(1200px/82%) 생성
2. 썸네일 + 프리뷰를 R2에 업로드
3. `photos` 테이블에 INSERT (thumb_url, preview_url 저장)
4. `include_original=true`이면 `original_jobs` INSERT + presigned PUT URL을 생성해 응답에 포함
5. confirm 요청 수신 시 R2 HEAD 확인 → job 상태를 `pending`으로 전이

### R2 저장 경로

| 경로 | 내용 | 생성 주체 |
|---|---|---|
| `photos/{photographer_id}/{project_id}/{hex}_thumb.jpg` | 갤러리 썸네일 (300px) | FastAPI |
| `photos/{photographer_id}/{project_id}/{hex}_preview.jpg` | 뷰어 프리뷰 (1200px) | FastAPI |
| `originals/source/{project_id}/{hex}.{ext}` | 브라우저 원본 raw (임시) | Browser (presigned PUT) |
| `originals/{project_id}/{hex}.jpg` | Worker 압축 완료 납품 파일 | Worker |

`originals/source/` 파일은 Worker 처리 완료 후 삭제 (best effort).

### Worker (`original_compress_worker`)

- 서버 기동 시 `asyncio.create_task()` (main.py lifespan)
- 5초 주기로 `claim_original_job()` RPC 폴링
- job 처리 순서:
  1. R2에서 `originals/source/` 파일 다운로드
  2. `_process_original_sync()` — JPEG 변환 + 20MB 압축
  3. `originals/{project_id}/{hex}.jpg` R2 업로드
  4. R2 HEAD verify
  5. DB: `photos.r2_original_url`, `original_ready_at`, `original_status='completed'` 갱신
  6. `originals/source/` 파일 삭제

### DB (`original_jobs` 상태 머신)

```
awaiting_upload → pending → processing → completed
                                       ↘ failed
```

| 전이 | 트리거 |
|---|---|
| `awaiting_upload → pending` | `/originals/confirm` 성공 |
| `awaiting_upload → pending` | 24h sweep에서 R2 HEAD 확인 후 파일 존재 |
| `awaiting_upload → failed` | 24h sweep에서 R2 HEAD 미존재 |
| `pending → processing` | Worker `SELECT FOR UPDATE SKIP LOCKED` 클레임 |
| `processing → pending` | stuck sweep (15분 초과) |
| `processing → completed` | 압축 성공 + DB 완료 처리 |
| `processing → failed` | `attempts >= max_attempts` 또는 즉시 실패 오류 |

---

## 전체 플로우 다이어그램

### include_original=false (셀렉 전용)

```
Browser                    FastAPI                    R2                    DB
  │                           │                        │                    │
  ├─ [1] 파일 선택             │                        │                    │
  │   compressImageForUpload() │                        │                    │
  │   max 3200px / quality 0.82│                        │                    │
  │                           │                        │                    │
  ├─ [2] POST /upload/photos  │                        │                    │
  │   FormData: compressed    │                        │                    │
  │──────────────────────────▶│                        │                    │
  │                           ├─ [3] thumb 300px/q75   │                    │
  │                           │   preview 1200px/q82   │                    │
  │                           │───────────────────────▶│                    │
  │                           │                        │ photos/.../thumb   │
  │                           │                        │ photos/.../preview │
  │                           │                        │                    │
  │                           ├─ [4] INSERT photos     │                    │
  │                           │────────────────────────────────────────────▶│
  │                           │                        │                    │
  │◀──────────────────────────│                        │                    │
  │  { uploaded: N }          │                        │                    │
```

### include_original=true (셀렉 + 납품 원본)

```
Browser                    FastAPI                    R2                   DB                  Worker
  │                           │                        │                    │                    │
  ├─ [1] 파일 선택             │                        │                    │                    │
  │   rawFile = 원본 보관      │                        │                    │                    │
  │   compressImageForUpload() │                        │                    │                    │
  │   → compressed ≈2MB       │                        │                    │                    │
  │                           │                        │                    │                    │
  ├─ [2] POST /upload/photos  │                        │                    │                    │
  │   files=compressed        │                        │                    │                    │
  │   include_original=true   │                        │                    │                    │
  │   original_filenames=...  │                        │                    │                    │
  │──────────────────────────▶│                        │                    │                    │
  │                           ├─ [3] thumb/preview 생성│                    │                    │
  │                           │───────────────────────▶│                    │                    │
  │                           │                        │ photos/.../thumb   │                    │
  │                           │                        │ photos/.../preview │                    │
  │                           │                        │                    │                    │
  │                           ├─ [4] INSERT photos     │                    │                    │
  │                           │   original_status=     │                    │                    │
  │                           │   'awaiting_upload'    │                    │                    │
  │                           │────────────────────────────────────────────▶│                    │
  │                           │                        │                    │                    │
  │                           ├─ [5] INSERT original_jobs                   │                    │
  │                           │   status='awaiting_upload'                  │                    │
  │                           │   + presigned PUT URL 발급                  │                    │
  │                           │────────────────────────────────────────────▶│                    │
  │                           │                        │                    │                    │
  │◀──────────────────────────│                        │                    │                    │
  │  { original_presigned:    │                        │                    │                    │
  │    [{job_id, url, ...}] } │                        │                    │                    │
  │                           │                        │                    │                    │
  ├─ [6] PUT {presigned_url}  │                        │                    │                    │
  │   body = rawFile (원본)   │                        │                    │                    │
  │   브라우저 → R2 직접      │                        │                    │                    │
  │──────────────────────────────────────────────────▶│                    │                    │
  │                           │                        │ originals/source/  │                    │
  │                           │                        │ {project}/{hex}.ext│                    │
  │                           │                        │                    │                    │
  ├─ [7] POST /originals/confirm                       │                    │                    │
  │   job_id=...             │                         │                    │                    │
  │──────────────────────────▶│                        │                    │                    │
  │                           ├─ R2 HEAD 확인          │                    │                    │
  │                           │───────────────────────▶│                    │                    │
  │                           ├─ RPC confirm_original_upload                │                    │
  │                           │   awaiting → pending   │                    │                    │
  │                           │────────────────────────────────────────────▶│                    │
  │◀──────────────────────────│                        │                    │                    │
  │  { ok: true }             │                        │                    │                    │
  │                           │                        │                    │                    │
  │ [UI] "원본 업로드 완료,   │                        │                    │                    │
  │  서버에서 처리 중..."     │                        │                    │                    │
  │                           │                        │                    │                    │
  │                           │                        │             [8] Worker 5초 폴링        │
  │                           │                        │                    │◀───────────────────│
  │                           │                        │                    │ claim_original_job  │
  │                           │                        │                    │ pending→processing  │
  │                           │                        │                    │────────────────────▶│
  │                           │                        │                    │                    │
  │                           │                        │             [9] source 다운로드         │
  │                           │                        │◀───────────────────────────────────────│
  │                           │                        │                    │                    │
  │                           │                        │       [10] _process_original_sync()    │
  │                           │                        │        JPEG 변환 + 20MB 압축            │
  │                           │                        │                    │                    │
  │                           │                        │       [11] 납품 파일 R2 업로드          │
  │                           │                        │◀───────────────────────────────────────│
  │                           │                        │ originals/{project}/{hex}.jpg           │
  │                           │                        │                    │                    │
  │                           │                        │       [12] DB 완료 처리                │
  │                           │                        │                    │◀───────────────────│
  │                           │                        │                    │ r2_original_url 갱신│
  │                           │                        │                    │ original_status=    │
  │                           │                        │                    │ 'completed'         │
  │                           │                        │                    │                    │
  │                           │                        │       [13] source 삭제 (best effort)   │
  │                           │                        │◀───────────────────────────────────────│
  │                           │                        │ originals/source/... 삭제               │
```

---

## 브라우저 압축 (`upload-client-compress.ts`)

서버 전송량 최적화 목적. `include_original` 여부와 무관하게 항상 실행된다.

| 항목 | 값 |
|---|---|
| 최대 해상도 | 3200px (long edge) |
| JPEG quality | 0.82 |
| 건너뛰는 조건 | 600KB 이하 파일 |
| 건너뛰는 조건 | 압축 결과가 원본 대비 2% 미만 절감 |
| 출력 | `{basename}.jpg` (JPEG 고정) |
| lastModified | 압축 시점의 `Date.now()` (원본과 다름) |

HEIC/PNG/WebP → JPEG로 변환된다. `rawFile`(원본)과 `compressed`(압축본)는 분리 보관된다.

**두 진입점(2026-07-27 이후)**:
- `compressImageForUpload(file)` — 파일 1개, 싱글턴 워커. 기존 호출부(설정 프로필 이미지, `WorkflowPageClient.tsx` 보정본 단일 파일, `UploadVersionsPanel.tsx`/`retouch-gemini-match.ts` 보정본 여러 파일) 동작을 그대로 유지.
- `compressImagesInParallel(files, signal, poolSize)` — 업로드 화면 전용. 워커 풀(acquire/release, 워커당 동시 작업 최대 1개)로 한 라운드의 파일을 동시에 압축한다. `AbortSignal`로 취소하면 부분 결과 없이 AbortError를 던지고, 그 시점에 busy하던 워커는 즉시 교체해 다음 세션이 기다리지 않게 한다. 풀 크기는 데스크톱 2 / 모바일 1(메모리 안정성 우선 — 사진 디코딩 메모리가 파일 크기보다 훨씬 커서 처음부터 크게 잡지 않음). 실측(30장, 합성 이미지, 원본 포함 업로드 기준) 압축 소요 시간이 순차 대비 약 절반으로 감소.
- 실제 압축 처리(워커 호출 + canvas 폴백)는 `compressWithWorker()`로 공유 — 두 진입점 모두 동일 로직.

---

## 20MB 제한 (`_process_original_sync`)

Worker가 납품 파일을 만들 때 적용. 브라우저 → 서버 전송에는 20MB 제한 없음.

```
입력: source_bytes (R2에서 다운로드한 원본 raw)

① JPEG이고 ≤20MB → 압축 없이 그대로 반환

② JPEG가 아닌 경우 (PNG/WebP/HEIC) → quality=95로 JPEG 변환
   → ≤20MB이면 반환

③ quality 단계 하향: 90 → 85 → 80 → 75
   → 각 단계에서 ≤20MB이면 반환

④ 해상도 축소: 6000 → 5000 → 4000 → 3200 → 2400 → 1600px (quality=90 고정)
   → 각 단계에서 ≤20MB이면 반환

⑤ 1600px/q90에서도 초과 → 마지막 결과 그대로 반환 (20MB 초과 허용)
```

- 품질 조정 먼저, 해상도 축소는 마지막
- 목표 용량: 20MB
- 목표 달성 불가 시 최선 결과 반환 (거부 없음)

---

## 배치 + 동시성

| 모드 | 배치 크기 | 동시성 |
|---|---|---|
| `include_original=false`, PC | 8장/배치 | 5 |
| `include_original=false`, Mobile | 3장/배치 | 1 |
| `include_original=true`, PC | **1장/배치** | 3 |
| `include_original=true`, Mobile | **1장/배치** | 1 |

`include_original=true`일 때 배치 크기를 1로 고정하는 이유: 서버가 1장에 presigned URL 1개를 발급하고, 브라우저가 즉시 PUT하는 사이클을 유지하기 위함. presigned URL이 발급 후 수초 내에 사용되므로 만료 위험이 없다.

FastAPI 서버 측 동시성:
- `include_original=false`: `UPLOAD_PHOTOS_CONCURRENCY` (기본 5)
- `include_original=true`: `UPLOAD_WITH_ORIGINAL_CONCURRENCY` (기본 3)
- Worker: `ORIGINAL_COMPRESS_CONCURRENCY` (기본 1, Railway 512MB RAM 보호)

---

## 복구 플로우

브라우저 종료/네트워크 단절로 presigned PUT이 미완료된 경우.

```
페이지 재방문
  │
  ├─ GET /originals/pending?project_id=...
  │   → awaiting_upload 상태 job 목록
  │
  ├─ job 존재하면 복구 배너 표시
  │
  └─ 파일 선택 시 3중 매칭 (filename + size + lastModified)
       │
       ├─ 매칭 성공 → POST /originals/recover
       │                  │
       │                  ├─ R2 HEAD: 파일 있음 → confirm → pending 전이
       │                  └─ R2 HEAD: 파일 없음 → 새 presigned URL 발급 → PUT 재시도
       │
       └─ 매칭 실패 → unmatchedJobs UI 표시
                         ├─ "다시 파일 선택" → 재매칭 시도
                         └─ "원본 업로드 포기" → POST /originals/abandon → failed 처리
```

---

## UI 상태 전이

```
idle
 │ 파일 선택 + startUpload()
 ▼
processing     ← compressImageForUpload() 진행 중 (progress 0~100%)
 │
 ▼
sending        ← XHR 전송 중 (progress 3~90%)
 │ R2 PUT 시작
 ├──▶ sendingSourcePhase=true
 │      배너: "원본 업로드 중 N/M — 페이지 닫으면 중단"
 │      beforeunload 경고 활성
 │ R2 PUT 전체 완료
 └──▶ sendingSourcePhase=false
 │
 ▼
done
 │ include_original=true 이고 PUT 시도 1건 이상
 ▼
allSourceAttempted=true
  배너: "원본 업로드 완료 — 서버에서 납품용 파일 처리 중, 이제 페이지를 닫아도 됩니다"
```

---

## 주의 사항

**Railway Sleep (Starter 플랜)**

Railway Starter 플랜은 HTTP 요청이 5분간 없으면 인스턴스가 Sleep되며 `asyncio` worker task가 파괴된다. `pending` 상태 job은 DB에 보존되지만 처리가 중단된다. 다음 HTTP 요청이 도착하면 worker가 재생성되고 pending job을 재개한다.

작가가 업로드 완료 후 브라우저를 닫고 5분 이내에 다른 HTTP 요청이 없으면 pending job 처리가 무기한 중단될 수 있다. **Railway Hobby 플랜($5/월)은 Sleep 없이 상시 가동**되므로, 원본 비동기 압축 기능의 안정적 운영을 위한 필수 조건이다.

**`photos.file_size` 의미**

`photos.file_size`에 저장되는 값은 썸네일 + 프리뷰 바이트 합산이다. 원본 파일 크기나 브라우저 압축본 크기가 아니다.

**HEIC + include_original=true**

HEIC 파일은 `include_original=true` 상태에서 FE와 BE 모두에서 거부된다. `include_original=false`(셀렉 전용)일 때는 HEIC 업로드가 허용된다.

**베타 규모 기준**

| 규모 | 상태 |
|---|---|
| ~500장 | 기본 검증 범위 |
| 1000장 | 성능 검증 필요 |
| 3000장 (프로젝트 최대치) | 성능 및 복구 시나리오 검증 필요 |
