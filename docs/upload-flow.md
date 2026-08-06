# 업로드 플로우

> 코드 기준: `upload/page.tsx`, `upload-client-compress.ts`, `upload-compress.worker.ts`, `upload.py`, `storage.py`
> 마지막 업데이트: 2026-08-06 — desktop `include_original=true` 경로에도 producer-consumer 파이프라인(OPT-ROUND-02) 적용, round barrier 제거를 반영해 §전체 플로우 다이어그램/§FE 배치·동시성·파이프라인 구조 수정(desktop+`include_original=false`는 OPT-ROUND-01, 2026-08-06 선행 적용). 이제 desktop은 `include_original` 값과 무관하게 파이프라인 구조, **모바일만** round barrier 구조를 유지한다. 이전 개정 사유: 원본 처리 worker 흐름이 실제 코드와 크게 달랐음(§9 참고).

---

## 개요

업로드는 **셀렉용 이미지**(썸네일/프리뷰)와 **납품 원본**을 분리해서 처리한다.

- **셀렉용**: 브라우저 압축본 → FastAPI 전송 → FastAPI가 썸네일/프리뷰 생성 → R2 (압축본 자체는 저장되지 않음, §4)
- **납품 원본** (`include_original=true`일 때만): 압축하지 않은 브라우저 원본 → R2 presigned PUT 직접 전송 → 비동기 worker가 **재압축 없이** 존재만 검증 후 확정(§6)

이 둘은 같은 파일 선택에서 **동시에** 발생한다 — `include_original=true`이면 압축본은 FastAPI로, 압축하지 않은 원본은 R2로, 같은 사진이 두 경로로 각각 전송된다.

---

## 레이어별 역할

### Browser (`upload/page.tsx`, `upload-client-compress.ts`)

1. 파일 선택 → `startUpload()` 호출.
2. `include_original=true`이면 HEIC 파일 전체 차단(FE 선행 검증, BE도 동일하게 거부).
3. **모든 파일**을 브라우저에서 압축(`include_original` 여부와 무관하게 항상 실행). 업로드 화면 전용 `compressImagesInParallel()`이 워커 풀(PC 2 / 모바일 1)로, 넘겨받은 파일 묶음(batch)을 동시에 압축한다 — desktop은 `include_original` 값과 무관하게 batch(`include_original=false`는 8장, `include_original=true`는 1장) 단위로, 모바일은 round(=batch를 여러 개 묶은 단위) 단위로 호출한다(§FE 배치·동시성·파이프라인 구조 참고). 그 외 화면(설정 프로필 이미지, 보정본 업로드 등)은 싱글턴 워커 기반 `compressImageForUpload()`를 그대로 사용 — 두 진입점 모두 실제 압축 로직은 `compressWithWorker()`를 공유한다.
4. 압축 결과를 FormData에 담아 FastAPI `POST /api/upload/photos`.
5. `include_original=true`이면, 같은 배치 처리 안에서 압축하지 않은 브라우저 원본(`rawFile`)을 응답의 `original_presigned` URL로 R2에 직접 PUT — 이 PUT과 다음 단계 confirm이 끝나야 그 배치가 완료 처리된다(§7 진행률 참고).
6. PUT 완료 후 서버에 confirm 통지(`POST /originals/confirm`).

### FastAPI (`upload.py`)

`POST /api/upload/photos` 하나의 요청 안에서 아래를 **전부 동기로** 처리하고 나서 응답한다.

1. FormData에서 압축본 파일을 받아 Pillow로 EXIF 보정 → 썸네일(300px/q75) 생성 → **같은 decode 결과에서** 프리뷰(1200px/q82) 생성(순차). 이 압축본 bytes는 썸네일/프리뷰 생성 입력으로만 쓰이고 처리 후 즉시 버려진다 — R2에 별도로 저장되지 않는다(§4).
2. 썸네일 + 프리뷰를 R2에 **병렬** 업로드(`asyncio.gather`).
3. 요청에 포함된 모든 파일 처리가 끝난 뒤 `photos` 테이블에 일괄 INSERT(`r2_thumb_url`/`r2_preview_url` 포함, `insert_photos_with_numbers` RPC로 번호까지 원자 할당).
4. `include_original=true`이면 `original_jobs` INSERT + presigned PUT URL을 생성해 응답에 포함.
5. confirm 요청(`/originals/confirm`) 수신 시 R2 HEAD 확인 → job 상태를 `awaiting_upload → pending`으로 전이.

### R2 저장 경로

| 경로 | 내용 | 생성 주체 | 비고 |
|---|---|---|---|
| `photos/{photographer_id}/{project_id}/{hex}_thumb.jpg` | 갤러리 썸네일 (300px) | FastAPI | 매 업로드마다 새 UUID — key 재사용 없음, `Cache-Control: immutable` |
| `photos/{photographer_id}/{project_id}/{hex}_preview.jpg` | 뷰어 프리뷰 (1200px) | FastAPI | 동일 |
| `originals/source/{project_id}/{hex}.{ext}` | 브라우저가 PUT한 원본 raw — **이 키가 그대로 최종 납품 파일** | Browser(presigned PUT) | worker가 검증만 하고 삭제하지 않음(§6) |
| `originals/{project_id}/{hex}.jpg` | (레거시) 과거 worker가 재압축본을 올리던 경로 | — | **현재 코드는 이 경로에 아무것도 쓰지 않는다.** `storage.py`의 R2 key 허용 패턴에는 과거 생성된 객체 검증용으로 남아 있을 뿐 |

FE 압축본(브라우저에서 만든 3200px/q0.82 JPEG)은 R2에 전혀 닿지 않는다 — `/api/upload/photos` 요청 바디로만 존재하고 BE가 썸네일/프리뷰를 만드는 즉시 폐기된다.

### Worker (`original_compress_worker`) — 재압축 없음

> **2026-08-06 정정**: 이 worker는 이름과 달리 현재 압축을 하지 않는다. 과거(재압축이 있던 시절) 버전의 문서를 그대로 두면 오해를 유발하므로 아래는 실제 코드(`app/routers/upload.py`의 `_process_original_job`) 기준이다.

- 서버 기동 시 `asyncio.create_task()` (`main.py` lifespan).
- 5초 주기로 `claim_original_job()` RPC 폴링(`SELECT FOR UPDATE SKIP LOCKED`).
- job 처리 순서:
  1. R2 HEAD로 `r2_source_key`(`originals/source/{project_id}/{hex}.{ext}`) 객체가 실제 존재하는지만 확인 — **다운로드/재압축/재업로드하지 않는다.**
  2. `complete_original_job` RPC로 `photos.r2_original_url = r2_source_key`(그 키 그대로), `original_ready_at`, `original_status='completed'` 갱신.
  3. source 파일은 삭제하지 않는다 — 이 객체 자체가 보존해야 할 납품 원본이기 때문("이 객체를 다시 압축하거나 삭제하면 고객 ZIP이 원본이 아니게 된다", 코드 주석).
  4. 프로젝트의 모든 원본이 `completed`가 되면 `enqueue_original_archive_build` RPC로 다운로드용 ZIP 아카이브 빌드를 큐에 넣는다(`app/archive.py`, 사용자 대기와 무관한 별도 비동기 처리 — 상세는 `docs/user-flow.md` §8.2).
- 과거 재압축 로직이었던 `_process_original_sync()`(JPEG 변환 + 20MB 목표 단계적 품질/해상도 하향, §9)는 **함수는 코드에 남아 있지만 현재 어떤 경로에서도 호출되지 않는다.**
- 재압축이 없어졌기 때문에, Railway가 Sleep 상태가 아닌 한 job은 통상 다음 5초 폴링 안에 `completed`로 끝난다(과거 "수분~수십분" 서술은 재압축 단계가 있던 시절 기준).

### DB (`original_jobs` 상태 머신)

```
awaiting_upload → pending → processing → completed
                                       ↘ failed
```

| 전이 | 트리거 |
|---|---|
| `awaiting_upload → pending` | `/originals/confirm` 성공 (R2 HEAD 확인 후) |
| `awaiting_upload → pending` | 24h sweep에서 R2 HEAD 확인 후 파일 존재 |
| `awaiting_upload → failed` | 24h sweep에서 R2 HEAD 미존재 |
| `pending → processing` | Worker `SELECT FOR UPDATE SKIP LOCKED` 클레임 |
| `processing → pending` | stuck sweep (15분 초과) |
| `processing → completed` | R2 HEAD 검증 성공 + DB 완료 처리 (재압축 없음) |
| `processing → failed` | R2 source 404, 또는 `attempts >= max_attempts` |

---

## 전체 플로우 다이어그램

### include_original=false, desktop (파이프라인 — OPT-ROUND-01 적용)

batch(8장) 압축이 끝나는 즉시 그 batch를 업로드 큐로 보내고, 동시에 다음 batch 압축을 이어서 진행한다(§FE 배치·동시성·파이프라인 구조 참고). 아래는 batch 하나의 처리 흐름 — 여러 batch가 동시에(최대 concurrency개) 이 흐름을 병렬로 돈다.

```
Browser                    FastAPI                    R2                    DB
  │                           │                        │                    │
  ├─ [1] batch(8장) 압축 완료 → 즉시 업로드 큐로 전달     │                    │
  │   compressImagesInParallel() (다음 batch 압축은     │                    │
  │   이 batch의 전송을 기다리지 않고 곧바로 이어서 진행) │                    │
  │                           │                        │                    │
  ├─ [2] POST /upload/photos (batch, 8장) — 업로드 큐에서│                    │
  │   consumer(최대 concurrency개)가 꺼내 즉시 전송      │                    │
  │   FormData: compressed    │                        │                    │
  │──────────────────────────▶│                        │                    │
  │                           ├─ [3] thumb(300px/q75) →│                    │
  │                           │   preview(1200px/q82)  │                    │
  │                           │   (같은 decode, 순차)   │                    │
  │                           ├─ R2 PUT ×2 (병렬)──────▶│                    │
  │                           │                        │ photos/.../thumb   │
  │                           │                        │ photos/.../preview │
  │                           │                        │                    │
  │                           ├─ [4] 요청 내 전체 처리 후│                    │
  │                           │   INSERT photos (일괄)  │                    │
  │                           │────────────────────────────────────────────▶│
  │                           │                        │                    │
  │◀──────────────────────────│                        │                    │
  │  { uploaded: N }          │                        │                    │
  │  (이 응답까지가 progress 90%│                        │                    │
  │   구간 이후의 "서버 처리")  │                        │                    │
```

### include_original=false, 모바일 (round 구조 — 기존 유지)

모바일은 이번 파이프라인 적용 대상이 아니다(§FE 배치·동시성·파이프라인 구조 참고). round(=concurrency×batch size장) 전체 압축이 끝나야 그 round의 batch들이 전송을 시작하는 기존 구조 그대로다 — 위 파이프라인 다이어그램의 [1]이 "round 전체 압축 완료 후에만 [2]"로 바뀐다고 이해하면 된다.

### include_original=true (셀렉 + 납품 원본)

아래는 파일 1장(=batch, `effectiveBatch=1`)이 거치는 `/photos → original PUT → confirm` 체인이다 — 이 순서 자체는 desktop/모바일, 파이프라인/round 구조와 무관하게 항상 동일하다(`uploadOneBatch()` 공유, §FE 배치·동시성·파이프라인 구조 참고). 다른 것은 이 체인 여러 개가 어떻게 스케줄링되느냐다: **desktop은 producer-consumer 파이프라인**(consumer lane이 이 체인을 끝내는 즉시 bounded queue에서 다음 파일을 꺼내 이어감, §아래), **모바일은 round 구조**(같은 round의 배치들이 모두 이 체인을 끝내야 다음 round로 진행)다.

```
Browser                    FastAPI                    R2                   DB                  Worker
  │                           │                        │                    │                    │
  ├─ [1] 파일 선택(배치=1장)   │                        │                    │                    │
  │   rawFile = 원본 그대로 보관│                        │                    │                    │
  │   compressImagesInParallel()│                       │                    │                    │
  │   → compressed(≈수백KB~2MB)│                        │                    │                    │
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
  │   body = rawFile (압축 안 함, 원본 그대로)           │                    │                    │
  │   브라우저 → R2 직접 (BE 비경유)                    │                    │                    │
  │──────────────────────────────────────────────────▶│                    │                    │
  │                           │                        │ originals/source/  │                    │
  │                           │                        │ {project}/{hex}.ext│                    │
  │                           │                        │                    │                    │
  ├─ [7] POST /originals/confirm (이 응답까지 배치 완료 대기)                │                    │
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
  │ [여기서 이 배치(파일) 완료 — desktop은 이 consumer lane이 즉시 bounded queue에서 │
  │  다음 파일을 꺼내 이어감(파이프라인), 모바일은 같은 round의 나머지 배치가       │
  │  모두 끝나야 다음 round로 진행]                                              │
  │                           │                        │             [8] Worker 5초 폴링        │
  │                           │                        │                    │◀───────────────────│
  │                           │                        │                    │ claim_original_job  │
  │                           │                        │                    │ pending→processing  │
  │                           │                        │                    │────────────────────▶│
  │                           │                        │                    │                    │
  │                           │                        │             [9] R2 HEAD 검증만          │
  │                           │                        │                    │  (다운로드/재압축 없음)│
  │                           │                        │◀───────────────────────────────────────│
  │                           │                        │                    │                    │
  │                           │                        │       [10] DB 완료 처리                │
  │                           │                        │                    │◀───────────────────│
  │                           │                        │                    │ r2_original_url =   │
  │                           │                        │                    │  originals/source/..│
  │                           │                        │                    │ (같은 키, 새 사본 아님)│
  │                           │                        │                    │ original_status=    │
  │                           │                        │                    │ 'completed'         │
  │                           │                        │                    │                    │
  │                           │                        │       source 파일 삭제하지 않음(보존)    │
```

---

## 브라우저 압축 (`upload-client-compress.ts`)

서버 전송량 최적화 목적. `include_original` 여부와 무관하게 항상 실행된다. **압축 결과가 R2/DB에 저장되는 일은 없다** — `/api/upload/photos`로 보내는 임시 입력물일 뿐이다.

| 항목 | 값 |
|---|---|
| 최대 해상도 | 3200px (long edge, `DEFAULT_MAX_EDGE`) |
| JPEG quality | 0.82 (`DEFAULT_JPEG_QUALITY`) |
| 건너뛰는 조건 | 600KB 이하 파일 (`DEFAULT_SKIP_BELOW_BYTES`) |
| 건너뛰는 조건 | 압축 결과가 원본 대비 2% 미만 절감 |
| 출력 | `{basename}.jpg` (JPEG 고정) |
| lastModified | 압축 시점의 `Date.now()` (원본과 다름) |

HEIC/PNG/WebP → JPEG로 변환된다. `include_original=true`일 때는 이 압축본과는 별개로 압축하지 않은 `rawFile`(원본)이 R2로 직접 전송된다(§ Worker 이전 다이어그램 참고) — 둘은 분리 보관된다.

**두 진입점**:
- `compressImageForUpload(file)` — 파일 1개, 싱글턴 워커. 설정 프로필 이미지, `WorkflowPageClient.tsx` 보정본 단일 파일, `UploadVersionsPanel.tsx`/`retouch-gemini-match.ts` 보정본 여러 파일 등에서 사용.
- `compressImagesInParallel(files, signal, poolSize)` — 업로드 화면(`upload/page.tsx`) 전용. 워커 풀(acquire/release, 워커당 동시 작업 최대 1개)로 한 라운드의 파일을 동시에 압축한다. 풀 크기는 **데스크톱 2 / 모바일 1**(메모리 안정성 우선). `AbortSignal`로 취소하면 부분 결과 없이 AbortError를 던지고, 그 시점에 busy하던 워커는 즉시 교체해 다음 세션이 기다리지 않게 한다.
- 실제 압축 처리(워커 호출 + canvas 폴백)는 `compressWithWorker()`로 공유 — 두 진입점 모두 동일 로직.

---

## FE 배치 · 동시성 · 파이프라인 구조

| 모드 | 배치 크기 | 동시 배치 수(concurrency) | 상수/근거 |
|---|---|---|---|
| `include_original=false`, PC | 8장/배치 | **6**(기본), 느린 회선이면 2~4로 하향 | `BATCH_SIZE=8`, `getDesktopUploadConcurrency(false)` → `PC_CONCURRENCY(5)+1` |
| `include_original=false`, Mobile | 3장/배치 | **1** | `MOBILE_BATCH_SIZE=3`, `MOBILE_CONCURRENCY=1` |
| `include_original=true`, PC | **1장/배치** | 4(기본), 고사양 기기+빠른 회선이면 6 | `ORIGINAL_PC_CONCURRENCY=4`, `ORIGINAL_PC_CONCURRENCY_FAST=6` |
| `include_original=true`, Mobile | **1장/배치** | 1 | `getDesktopUploadConcurrency` 미적용, 고정 1 |

`include_original=true`일 때 배치 크기를 1로 고정하는 이유: 서버가 1장에 presigned URL 1개를 발급하고, 브라우저가 즉시 PUT하는 사이클을 유지하기 위함. 위 배치 크기·동시성 값 자체는 파이프라인 적용 전후로 **변경되지 않았다** — 바뀐 것은 이 값들을 소비하는 오케스트레이션 구조뿐이다.

### desktop 전체: producer-consumer 파이프라인 (2026-08-06, `include_original=false`는 OPT-ROUND-01, `include_original=true`는 OPT-ROUND-02)

`pipelineMode = !isPhoneLikeClient()`일 때 적용된다 — desktop이면 `include_original` 값과 무관하게 항상 파이프라인 구조다(코드는 두 케이스가 완전히 동일한 채널/lane 구현을 공유). 압축(producer)과 XHR 전송(consumer)을 **bounded async channel**로 연결해, batch 압축이 끝나는 즉시 전송을 시작하고 동시에 다음 batch 압축을 이어간다 — "round 전체(=concurrency×batch size장) 압축 완료 후에만 전송 시작"하던 이전 barrier 구조를 제거했다.

- **producer**: batch(`include_original=false`는 8장, `include_original=true`는 `effectiveBatch=1`이라 파일 1장)를 순서대로 하나씩 `compressImagesInParallel()`에 넘겨 압축(워커 풀은 그대로 PC 2개 — 동시 호출은 하지 않음, 워커 풀 내부 busy-slot 추적이 호출 1건 단위로 설계돼 있어 동시 호출 시 경합 위험이 있기 때문). 압축이 끝난 batch는 즉시 channel에 push하고, 곧바로 다음 batch 압축을 시작한다 — 전송 완료를 기다리지 않는다.
- **channel(bounded queue)**: 용량 = `concurrency`(기존 round 하나가 담던 batch 수와 동일 상한 — `include_original=false`는 기본 6, `include_original=true`는 기본 4/고사양+빠른 회선 6) — **무제한 큐가 아니다**. 이미 압축됐지만 아직 전송되지 않은 batch가 `concurrency`개에 도달하면 producer가 push를 멈추고(backpressure) consumer가 하나를 꺼내 갈 때까지 대기한다.
- **consumer lane**: `concurrency`개의 lane이 channel에서 batch를 꺼내 즉시 처리한다(`uploadOneBatch`, 기존 배치 업로드 로직을 그대로 추출해 재사용 — 로직 자체는 변경 없음). lane 하나는 자신이 꺼낸 batch를 **끝까지**(`include_original=true`면 `/photos → original PUT → confirm` 전 과정을 순서대로) 처리해야 channel에서 다음 batch를 꺼낸다 — 이 내부 순서는 파이프라인 적용 전후로 바뀌지 않았다.
- **FE 압축과 network 업로드가 overlap**된다 — 압축 워커가 다음 batch를 압축하는 동안 이미 압축된 batch들이 동시에 네트워크로 전송 중일 수 있다. 이전 round 구조에서는 "압축 워커가 놀며 전송을 기다리는 구간"과 "전송이 다음 round 압축을 기다리는 구간"이 번갈아 발생했는데, 이 유휴 구간이 사라진 것이 개선의 핵심이다. `include_original=true`에서는 추가로 "한 lane이 느린 original PUT을 기다리는 동안 나머지 lane이 노는" 구간도 줄어든다 — 느린 lane과 무관하게 다른 lane들이 channel에서 다음 파일을 계속 꺼내 가기 때문이다.
- `include_original=false`(OPT-ROUND-01) 실측(로컬, 100/500장, 12~17MP급 실사진, 2026-08-06): 첫 업로드 시작(T_first_xhr_start)이 약 5~7.5배 빨라지고, 전체 소요시간(T_done)이 약 26~35% 단축됨을 확인 — 채택 결정.
- `include_original=true`(OPT-ROUND-02)도 실사진 기반(5~20MB급 원본 24장) 실측을 거쳐 채택했다 — 회선/원본 크기에 따라 개선폭이 달라질 수 있어 별도 성능 기록 위치가 생기기 전까지는 이 문서에 구체 수치를 고정하지 않는다.

### 모바일: 기존 round 구조 유지

파이프라인 적용 대상이 아니다 — iOS WKWebView의 macrotask paint 보장 등 모바일 전용 로직을 건드리지 않기 위해 명시적으로 제외했다. **라운드(round)와 압축 barrier**: 파일 전체를 "동시 배치 수 × 배치 크기" 단위(=한 라운드)로 나눠 처리한다.

1. 그 라운드에 속한 파일 전부를 `compressImagesInParallel()`에 한 번에 넘긴다.
2. 압축은 워커 풀(모바일 1)로 처리된다.
3. **라운드 전체 압축이 끝나야** 그 라운드의 배치들이 `Promise.all`로 동시에 전송을 시작한다 — 압축이 먼저 끝난 개별 파일부터 바로 전송을 시작하는 구조가 아니다.
4. 라운드의 모든 배치 응답(및 `include_original=true`면 원본 PUT+confirm까지)이 끝나야 다음 라운드로 넘어간다. **라운드끼리는 순차**, 라운드 내부의 배치 전송은 **병렬**.

FastAPI 서버 측 동시성(요청 1건 안에서 파일별 처리) — 파이프라인 적용 여부와 무관하게 동일:
- `include_original=false`: `UPLOAD_PHOTOS_CONCURRENCY`(기본 5)
- `include_original=true`: `UPLOAD_WITH_ORIGINAL_CONCURRENCY`(기본 3)
- Pillow decode/리사이즈 전용 스레드풀: `_cpu_executor`, `PILLOW_EXECUTOR_MAX_WORKERS`(기본 4)
- R2 PUT 전용 스레드풀: `_r2_executor`, `R2_EXECUTOR_MAX_WORKERS`(기본 6)
- 위 둘은 `/photos` 엔드포인트 전용이다. 그 외 엔드포인트(보정본 업로드, 프로필 이미지, R2 head/get/delete, 원본 검증 worker의 R2 HEAD)는 공용 풀 `_executor`(`IMAGE_EXECUTOR_MAX_WORKERS`, 기본 8)를 그대로 쓴다.
- Worker(`original_compress_worker`) 동시 클레임 수: `ORIGINAL_COMPRESS_CONCURRENCY`(기본 4) — 재압축이 없어져 R2 HEAD+DB 전이만 하므로 가벼운 작업이다.

---

## 업로드 화면에서 사진이 보이는 방식

업로드 세션 진행 중 화면에 표시되는 이미지는 **항상 브라우저 로컬 `URL.createObjectURL()` blob URL**이며, 서버가 만든 `r2_thumb_url`/`r2_preview_url`이 아니다.

| 단계 | 상태 배열 | 이미지 소스 |
|---|---|---|
| 파일 선택 직후(압축 전) | `queuedPreviews` | **원본(raw) File**의 blob URL |
| 전송 중(스피너) | `uploadingPhotos` | `queuedPreviews`에서 인계받은 **같은 원본(raw) File blob URL** 유지 |
| 배치 응답 성공 직후 | `pendingPhotos` | 위와 같은 원본 blob URL 유지(서버가 반환한 thumb_url을 쓰지 않음 — iOS에서 업로드 XHR과 동시에 DB 조회하면 연결 한도를 초과하는 문제 회피) |
| **전체 업로드 세션 종료 후, 딱 1회** | `photos`(DB) | `getPhotosByProjectId()` 재조회 → 이때 처음으로 실제 `r2_thumb_url` 사용 |

각 파일은 큐에 들어올 때 만든 `tempId`/blob URL을 `queuedPreviews → uploadingPhotos → pendingPhotos` 사이에서 그대로 인계받고, `sourceIndex` 순서로 렌더한다. 그래서 상태가 바뀌어도 카드의 React key·이미지 소스·그리드 위치가 유지되며, 업로드 완료 순서가 달라도 카드가 재마운트되거나 재정렬되지 않는다. blob URL의 소유권만 큐→전송→완료 상태로 옮기고 세션 종료/실패/중단 때 즉시 revoke한다.

즉 batch/라운드가 여러 번 반복되어도(desktop은 `include_original` 값과 무관하게 파이프라인의 batch 단위, 모바일은 round 단위) 세션 도중에는 서버 썸네일 URL을 한 번도 참조하지 않는다. 이 구조 때문에, 만약 향후 썸네일/프리뷰 생성을 비동기로 지연시키더라도 **업로드 세션 진행 중 화면 표시 자체는 깨지지 않는다** — 다만 다음 두 지점은 현재 코드가 "생성이 항상 동기로 끝나 있다"를 전제로 하고 있어 영향을 받는다:
- `insert_photos_with_numbers` 시점에 `r2_thumb_url`이 이미 있어야 한다(현재 photos row는 thumb_url 없이 존재할 수 없음).
- 세션 종료 직후 1회 호출되는 `getPhotosByProjectId()` 응답에 `r2_thumb_url`이 없으면 그 순간 그리드가 비어 보일 수 있다.

---

## 진행률(progress) · 완료 조건

`uploadProgress`(0~90%)는 **XHR 업로드 바디 전송 바이트**만 기준으로 올라간다(`xhr.upload.onprogress`) — FE 압축 완료 여부, BE의 썸네일/프리뷰 생성·R2 PUT·DB INSERT 소요 시간, 원본 R2 PUT/confirm 소요 시간은 이 숫자에 전혀 반영되지 않는다. 이 구간은 별도 boolean(`awaitingServerFinalize`, "서버 처리 중" 배너)으로만 표시된다.

"업로드 완료!" 토스트가 실제로 기다리는 것:

| | `include_original=false` | `include_original=true` |
|---|---|---|
| FE 압축 | 대기(desktop은 파이프라인 lane들이 모두 빌 때까지, 모바일은 round barrier까지) | 대기(desktop은 파이프라인 lane들이 모두 빌 때까지, 모바일은 round barrier까지) |
| `/api/upload/photos` 응답(=썸네일/프리뷰 생성+R2 PUT+DB INSERT 전부 포함) | **대기** | 대기 |
| 원본 R2 presigned PUT(Browser→R2) | 해당 없음 | **대기** |
| `/originals/confirm` 응답 | 해당 없음 | **대기** |
| worker의 원본 R2 HEAD 검증(`processing→completed`) | 해당 없음 | **대기 안 함** — 완전 비동기 |
| 다운로드 ZIP 아카이브 빌드 | 해당 없음 | **대기 안 함** — 완전 비동기(`user-flow.md` §8.2) |

모든 batch(desktop, `include_original` 값과 무관) 또는 라운드(모바일)가 끝나면 `uploadProgress=100` → `uploadPhase="done"` → 토스트, 600ms 뒤 DB 재조회(위 섹션).

**UI phase**: 코드에 정의된 값은 `idle`/`processing`/`done`(과 실패 시 `idle`로 복귀)뿐이다. `uploadPhase === "sending"`을 조건으로 쓰는 UI 코드가 일부 있으나, 실제로 `setUploadPhase("sending")`을 호출하는 지점은 없다 — 즉 `sending`은 현재 코드 경로상 도달하지 않는 상태다(압축과 전송 모두 `processing` 상태로 표시됨).

---

## 20MB 제한 (`_process_original_sync`) — 현재 미사용

> **2026-08-06 정정**: 아래는 `app/routers/upload.py`에 정의는 되어 있으나 **현재 어떤 요청/worker 경로에서도 호출되지 않는** 함수다. 재압축 파이프라인이 살아있던 시절의 로직을 참고용으로만 남긴다 — 삭제 여부는 별도 승인 필요(§9).

```
입력: source_bytes

① JPEG이고 ≤20MB → 압축 없이 그대로 반환
② JPEG가 아닌 경우 (PNG/WebP/HEIC) → quality=95로 JPEG 변환 → ≤20MB이면 반환
③ quality 단계 하향: 90 → 85 → 80 → 75 → 각 단계에서 ≤20MB이면 반환
④ 해상도 축소: 6000 → 5000 → 4000 → 3200 → 2400 → 1600px(quality=90 고정) → 각 단계에서 ≤20MB이면 반환
⑤ 1600px/q90에서도 초과 → 마지막 결과 그대로 반환(20MB 초과 허용)
```

현재 코드에서 브라우저 → R2 원본 PUT에는 애초에 크기 제한이 걸려 있지 않다(BE가 검증하는 것은 R2 HEAD로 파일 존재 여부뿐).

---

## 복구 플로우

브라우저 종료/네트워크 단절로 presigned PUT이 미완료된 경우.

```
페이지 재방문
  │
  ├─ GET /originals/pending?project_id=...
  │   → awaiting_upload/failed 상태 job 목록
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

## 주의 사항

**Railway Sleep (Starter 플랜)**

Railway Starter 플랜은 HTTP 요청이 5분간 없으면 인스턴스가 Sleep되며 `asyncio` worker task가 파괴된다. `pending`/`awaiting_upload` 상태 job은 DB에 보존되지만 처리가 중단된다. 다음 HTTP 요청이 도착하면 worker가 재생성되고 job을 재개한다. **Railway Hobby 플랜($5/월)은 Sleep 없이 상시 가동**되므로, 원본 검증 worker의 안정적 운영을 위한 필수 조건이다.

**`photos.file_size` 의미**

`photos.file_size`에 저장되는 값은 썸네일 + 프리뷰 바이트 합산이다. 원본 파일 크기나 브라우저 압축본 크기가 아니다.

**`photos.original_compressed_size`는 현재 항상 NULL**

재압축 단계가 사라지면서 이 컬럼을 채우는 코드가 없다. `app/archive.py`(아카이브 파트 용량 산정)와 `src/lib/customer-api-server.ts`(고객 다운로드 "총 용량" 표시)는 모두 고정 추정치(`_FALLBACK_PHOTO_BYTES`)로 대체 계산한다.

**HEIC + include_original=true**

HEIC 파일은 `include_original=true` 상태에서 FE와 BE 모두에서 거부된다. `include_original=false`(셀렉 전용)일 때는 HEIC 업로드가 허용된다.

**베타 규모 기준**

| 규모 | 상태 |
|---|---|
| ~500장 | 기본 검증 범위 |
| 1000장 | 성능 검증 필요 |
| 3000장 (프로젝트 최대치) | 성능 및 복구 시나리오 검증 필요 |

---

## 미사용/legacy 코드 메모

| 대상 | 상태 |
|---|---|
| `app/routers/upload.py`의 `_process_original_sync()` | 정의만 있고 호출부 없음(grep 확인). 재압축 파이프라인이 있던 시절의 로직. 삭제는 별도 승인 필요 — 이 파일에서는 참고용으로만 남김. |
| `storage.py`의 R2 key 패턴 `^originals/{project}/{hex}\.jpg$` | 신규 업로드는 이 경로에 쓰지 않음(현재는 `originals/source/...`만 생성). 과거 생성된 객체 검증/호환용으로 패턴만 남아 있을 가능성. |
| FE `uploadPhase` 값 `"sending"` | UI 조건문에는 남아 있으나 `setUploadPhase("sending")` 호출 지점이 없어 현재 코드 경로상 도달 불가. |
