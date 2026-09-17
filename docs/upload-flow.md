# 업로드 플로우

## 고객 검토 이후 재보정본 교체

고객 검토 이력이 있는 V2 사진은 갤러리·목록·일괄 업로드 모달에서 서버 파일 삭제를 제공하지 않는다. `UploadPanelTarget.deleteLocked`로 사진별 제한을 전달하고, 검토 전 V2 파일은 기존 삭제를 허용한다. 교체는 기존 이력 보존 업로드를 사용하며, 교체 후에도 V2 스냅샷의 검토 이력을 기준으로 삭제 제한을 유지한다. 로컬에서 고른 아직 업로드하지 않은 파일의 매칭 해제는 서버 파일 삭제와 별개로 유지한다.

> 코드 기준: `upload/page.tsx`, `upload-client-compress.ts`, `upload-compress.worker.ts`, `upload.py`, `storage.py`
> 마지막 업데이트: 2026-09-17 — 셀렉용 프리뷰 완료 후 고객 링크 활성화, 활성화 이후 원본 전송·복구 분리.

---

## 개요

업로드는 **셀렉용 이미지**(썸네일/프리뷰)와 **납품 원본**을 분리해서 처리한다.

- **셀렉용**: 브라우저 압축본 → FastAPI 전송 → FastAPI가 썸네일/프리뷰 생성 → R2 (압축본 자체는 저장되지 않음, §4)
- **납품 원본** (`include_original=true`일 때만): 압축하지 않은 브라우저 원본 → R2 presigned PUT 직접 전송 → 비동기 worker가 **재압축 없이** 존재만 검증 후 확정(§6)
- **최종 보정본 원본** (`include_original`과 무관): 워크플로우 V1/V2 업로드 파일 → R2 presigned PUT 직접 전송 → 검토용 축소본과 함께 `photo_versions`에 연결 → 최종 확정 후 ZIP 납품(§7)

이 둘은 같은 파일 선택에서 **동시에** 발생한다 — `include_original=true`이면 압축본은 FastAPI로, 압축하지 않은 원본은 R2로, 같은 사진이 두 경로로 각각 전송된다.

화면 책임은 프로젝트 상태로 분리한다. `/photographer/projects/[id]/upload`는 `preparing` 동안의 업로드·선택·삭제·유사도 분석 전용이다. 초대 링크가 활성화된 뒤 직접 재진입하면 `/photographer/projects/[id]/assets/original`로 이동하며, 여기서는 업로드 화면과 같은 가상화 `PhotographerPhotoGallery` 구현을 읽기 전용으로 사용한다. 확정 이후의 원본·셀렉·보정본은 각각 `/assets/original`, `/assets/selected`, `/assets/retouched`로 분리하되 공용 `ProjectAssetTabs`로 탐색한다. 원본/셀렉 화면은 동일한 grid/list media geometry와 상세 뷰어 shell을 공유하고, 원본 메타데이터와 셀렉 코멘트만 variant slot으로 나눈다.

---

## 레이어별 역할

### Browser (`upload/page.tsx`, `upload-client-compress.ts`)

1. 파일 선택 → `startUpload()` 호출.
2. `include_original=true`이면 HEIC 파일 전체 차단(FE 선행 검증, BE도 동일하게 거부).
3. **모든 파일**을 브라우저에서 압축(`include_original` 여부와 무관하게 항상 실행). 업로드 화면 전용 `compressImagesInParallel()`이 워커 풀로 producer-consumer 파이프라인의 batch를 압축한다. 비원본은 PC 8장/모바일 3장이고, 원본 포함은 파일별 job 연결을 위해 1장 batch를 유지하되 PC에서 2~3개 batch를 한 압축 라운드로 묶는다. 모바일은 워커 1개다(§FE 배치·동시성·파이프라인 구조 참고). 여기서 모바일은 iPhone/iPad와 Android 휴대폰·태블릿을 뜻한다. 그 외 화면(설정 프로필 이미지, 보정본 업로드 등)은 싱글턴 워커 기반 `compressImageForUpload()`를 그대로 사용 — 두 진입점 모두 실제 압축 로직은 `compressWithWorker()`를 공유한다.
4. 파일 선택 시 각 파일에 세션 내 고정 UUID(`client_upload_id`)를 부여하고 압축 결과와 함께 FormData로 FastAPI `POST /api/upload/photos`에 보낸다. 모든 업로드에 원본 `File`의 이름/크기/MIME/수정 시각과, 압축 디코딩에서 얻은 경우 `source_widths/source_heights`를 함께 보낸다. 직접 호출 재시도와 Next 프록시 fallback도 같은 UUID를 재사용한다.
5. `include_original=true`이면 압축한 셀렉용 사진을 `/photos`로 보내 모든 photo row와 original job을 먼저 만든다. 응답의 presigned URL은 원본 큐에 보관하며, 전체 프리뷰 row가 등록되기 전에는 원본 PUT을 시작하지 않는다.
6. 모든 프리뷰 등록과 화면 갱신이 끝나면 원본 큐가 raw `File` PUT을 시작하고 기존 confirm/recover로 저장을 확인한다. 이때 고객 셀렉 요청을 바로 열 수 있으며, 업로드 세션의 완료 토스트와 finalize는 모든 원본 작업이 끝날 때까지 기다린다. 원본 단계에는 화면 유지 경고를 표시한다. 전체 업로드 세션 동안 내부 링크·화면 버튼·브라우저 history 이동을 확인한 뒤 처리하며, 실제 문서 종료·새로고침은 `beforeunload`로 경고한다.

### FastAPI (`upload.py`)

`POST /api/upload/photos` 하나의 요청 안에서 아래를 **전부 동기로** 처리하고 나서 응답한다.

1. FormData에서 압축본 파일을 받아 Pillow로 EXIF 보정 → 썸네일(300px/q75) 생성 → **같은 decode 결과에서** 프리뷰(1200px/q82) 생성(순차). 브라우저가 source 크기를 보내지 못한 작은 비압축 파일은 이 decode의 입력 크기로 해상도를 채운다. 압축본 bytes는 썸네일/프리뷰 생성 입력으로만 쓰이고 처리 후 즉시 버려진다 — R2에 별도로 저장되지 않는다(§4).
2. 썸네일 + 프리뷰를 R2에 **병렬** 업로드(`asyncio.gather`).
3. 요청에 포함된 모든 파일 처리가 끝난 뒤 `insert_photos_with_numbers` RPC가 `photos` 행(포함 `source_*`)과, `include_original=true`인 경우 대응하는 `original_jobs` 행을 **한 DB 트랜잭션**에서 생성한다. `(project_id, client_upload_id)` UNIQUE 제약과 프로젝트 행 잠금을 함께 사용하므로 서버 처리는 성공했지만 브라우저가 응답을 받지 못해 같은 요청을 재전송해도 기존 photo/job을 반환하고 새 행을 만들지 않는다. replay 사진에서 source metadata만 비어 있으면 새 요청값으로 보강한다. 번호 할당·사진·job 생성 중 하나라도 실패하면 전체가 롤백된다.
4. FastAPI가 생성된 `original_jobs`를 재조회해 presigned PUT URL을 응답에 포함한다. DB 마이그레이션보다 BE가 먼저 배포된 짧은 구간에만 기존 별도 job INSERT 폴백을 사용한다.
5. confirm 요청(`/originals/confirm`) 수신 시 R2 HEAD 확인 → job 상태를 `awaiting_upload → pending`으로 전이.

### R2 저장 경로

| 경로 | 내용 | 생성 주체 | 비고 |
|---|---|---|---|
| `photos/{photographer_id}/{project_id}/{client_upload_id.hex}_thumb.jpg` | 갤러리 썸네일 (300px) | FastAPI | 논리 업로드 항목별 고정 key. 응답 유실 재시도만 같은 바이트로 덮어씀, `Cache-Control: immutable` |
| `photos/{photographer_id}/{project_id}/{client_upload_id.hex}_preview.jpg` | 뷰어 프리뷰 (1200px) | FastAPI | 동일 |
| `originals/source/{project_id}/{client_upload_id.hex}.{ext}` | 브라우저가 PUT한 원본 raw — **이 키가 그대로 최종 납품 파일** | Browser(presigned PUT) | 재시도 시 같은 key 사용, worker는 검증만 하고 삭제하지 않음(§6) |
| `originals/{project_id}/{hex}.jpg` | (레거시) 과거 worker가 재압축본을 올리던 경로 | — | **현재 코드는 이 경로에 아무것도 쓰지 않는다.** `storage.py`의 R2 key 허용 패턴에는 과거 생성된 객체 검증용으로 남아 있을 뿐 |
| `versions/{project_id}/delivery/v{1\|2}/{photo_id}_{hex}.{ext}` | 최종 납품용 보정본 원본(재인코딩 없음) | Browser(presigned PUT) | 파일당 최대 100MiB |
| `versions/delivery-archives/{project_id}/{archive_id}/part-{n}.zip` | 검토 회차별 최종 보정본 후보 ZIP | FastAPI worker | 폐기 후보 또는 만료 후 삭제 |

## 보정본 업로드와 최종 납품

일괄 업로드의 파일 매칭은 파일명 exact/fuzzy → Gemini 임베딩 → 순서 폴백 순서다. Gemini 점수가 `GEMINI_MATCH_AUTO_THRESHOLD`(기본 0.96) 이상이어도 1·2위 후보 차이가 `GEMINI_MATCH_MARGIN_THRESHOLD`(기본 0.03) 미만이면 연결과 업로드는 유지하면서 `AI 확인 필요`로 표시한다. 이미 계산한 유사도 행렬을 재사용하므로 추가 AI 호출이나 업로드 지연은 없다.

1. `UploadVersionsPanel`/단일 교체가 원본 파일 metadata로 `POST /api/upload/versions/delivery/presign`을 호출한다. 파일당 상한은 100MiB(`DELIVERY_VERSION_MAX_BYTES`), 브라우저 direct PUT 동시성은 3(`DIRECT_UPLOAD_CONCURRENCY`)이다.
2. 브라우저는 원본 바이트의 R2 direct PUT과 `compressImageForUpload()` 검토용 파일 준비를 동시에 시작한다. 두 작업이 모두 끝나면 검토용 파일과 `delivery_metadata`를 `POST /api/upload/versions`에 보낸다. 개별 카드 업로드 잠금은 사진·버전 단위이므로 다른 카드의 업로드를 막지 않으며, 연속 완료 시 목록 재조회는 짧게 합쳐 한 번만 수행한다.
3. FastAPI는 delivery key prefix와 R2 HEAD 실제 크기를 확인하고, 매 업로드마다 고유한 key에 검토용 1200px/82% JPEG와 300px/75% 썸네일을 만든다. 같은 V1/V2 단계의 기존 파일이 있으면 `replace_photo_versions_with_history` RPC가 기존 활성 파일과 고객 검토 결과를 `photo_version_revisions`에 스냅샷으로 보존한 뒤 현재 `photo_versions`를 원자적으로 교체한다. 단, 현재 `version_reviews.status='approved'`인 사진은 UI의 선택·교체 대상에서 제외하고 FastAPI와 RPC도 교체를 거부한다.
4. 교체 이력은 같은 단계 안의 파일 변경 기록일 뿐 V3를 생성하거나 재보정 허용 횟수를 소비하지 않는다. 고객 API와 최종 납품 후보는 현재 활성 `photo_versions`만 사용하며, 작가 상세 뷰어에서만 과거 파일을 읽기 전용으로 확인할 수 있다.
5. 작가가 고객 검토를 시작하면 `start_retouch_review_with_archive`가 모든 `selections.is_selected=true` 사진에 납품 자산이 있는지 검사한다. V1 검토는 V1, V2 검토는 각 사진의 V2 우선·없으면 V1을 선택해 immutable manifest를 만든다.
6. `final_delivery_archive_worker`가 기존 `ARCHIVE_PART_MAX_BYTES`(기본 500MiB) 기준으로 ZIP을 만든다. 고객이 재보정을 요청하면 후보를 폐기하고 다음 검토 시작 시 다시 만든다. V1 또는 어느 V2 회차에서든 최종 확정되면 `projects.status='delivered'`와 `delivered_at`이 함께 기록되고 해당 회차 후보가 최종 ZIP이 된다. DB 트리거와 CHECK 제약이 날짜 없는 완료 상태를 허용하지 않는다.

FE 압축본(업로드 화면에서 만드는 최대 1600px/q0.82 JPEG: `UPLOAD_INTERMEDIATE_MAX_EDGE`, `UPLOAD_INTERMEDIATE_JPEG_QUALITY`)은 R2에 전혀 닿지 않는다 — `/api/upload/photos` 요청 바디로만 존재하고 BE가 썸네일/프리뷰를 만드는 즉시 폐기된다.

### Worker (`original_compress_worker`) — 재압축 없음

> **2026-08-06 정정**: 이 worker는 이름과 달리 현재 압축을 하지 않는다. 과거(재압축이 있던 시절) 버전의 문서를 그대로 두면 오해를 유발하므로 아래는 실제 코드(`app/routers/upload.py`의 `_process_original_job`) 기준이다.

- 서버 기동 시 `asyncio.create_task()` (`main.py` lifespan).
- 5초 주기로 `claim_original_job()` RPC 폴링(`SELECT FOR UPDATE SKIP LOCKED`).
- job 처리 순서:
  1. R2 HEAD로 `r2_source_key`(`originals/source/{project_id}/{hex}.{ext}`) 객체가 실제 존재하는지만 확인 — **다운로드/재압축/재업로드하지 않는다.**
  2. `complete_original_job` RPC로 `photos.r2_original_url = r2_source_key`(그 키 그대로), `original_ready_at`, `original_status='completed'` 갱신.
  3. source 파일은 삭제하지 않는다 — 이 객체 자체가 보존해야 할 납품 원본이기 때문("이 객체를 다시 압축하거나 삭제하면 고객 ZIP이 원본이 아니게 된다", 코드 주석).
  4. 프로젝트의 모든 원본이 `completed`가 되면 `enqueue_original_archive_build` RPC로 다운로드용 ZIP 아카이브 빌드를 큐에 넣는다. 워커는 작은 원본을 최대 4개(`ARCHIVE_DOWNLOAD_CONCURRENCY=4`)까지 선행 다운로드하되, 파트별 192MiB 메모리 예산(`ARCHIVE_PREFETCH_MEMORY_BYTES`)과 동시 빌드 수에 따라 자동으로 동시성을 낮춘다. 실제 ZIP 기록 진행률은 최소 2초 간격(`ARCHIVE_PROGRESS_UPDATE_SECONDS=2`)으로 DB에 기록한다(`app/archive.py`, 상세는 `docs/user-flow.md` §8.2).
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

### include_original=false (모든 기기, bounded 파이프라인)

batch 압축이 끝나는 즉시 그 batch를 업로드 큐로 보내고, 동시에 다음 batch 압축을 이어서 진행한다(§FE 배치·동시성·파이프라인 구조 참고). PC는 8장 batch·최대 6개 lane, 모바일은 3장 batch·1개 lane을 사용한다. 아래는 batch 하나의 처리 흐름이다.

```
Browser                    FastAPI                    R2                    DB
  │                           │                        │                    │
  ├─ [1] batch 압축 완료 → 즉시 업로드 큐로 전달          │                    │
  │   compressImagesInParallel() (다음 batch 압축은     │                    │
  │   이 batch의 전송을 기다리지 않고 곧바로 이어서 진행) │                    │
  │                           │                        │                    │
  ├─ [2] POST /upload/photos (batch) — 업로드 큐에서     │                    │
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
  │  (미리보기 저장 응답)       │                        │                    │
  │   구간 이후의 "서버 처리")  │                        │                    │
```

### include_original=true (셀렉 + 납품 원본)

아래는 파일 1장(=batch, `effectiveBatch=1`)이 거치는 `/photos → original PUT → confirm` 체인이다 — 이 순서 자체는 모든 기기에서 동일하다(`uploadOneBatch()` 공유, §FE 배치·동시성·파이프라인 구조 참고). 모든 기기는 producer-consumer 파이프라인으로 이 체인을 스케줄링한다. PC는 여러 consumer lane을 사용하지만 모바일은 단일 lane이라 원본 PUT을 병렬화하지 않고, 그 PUT 중 다음 파일의 압축만 겹친다.

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
  │ [여기서 이 배치(파일) 완료 — consumer lane이 즉시 bounded queue에서 다음 파일을 │
  │  꺼내 이어감. 모바일은 lane=1이므로 이 체인의 네트워크/R2 PUT은 순차 유지]      │
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
- `compressImagesInParallel(files, signal, poolSize)` — 업로드 화면(`upload/page.tsx`) 전용. 워커 풀(acquire/release, 워커당 동시 작업 최대 1개)로 파이프라인의 batch를 압축한다. 원본 포함 PC는 CPU·메모리에 따라 **2~3개**(저사양 1개), 그 외 PC는 2개, 모바일은 1개를 쓴다. `AbortSignal`로 취소하면 부분 결과 없이 AbortError를 던지고, 그 시점에 busy하던 워커는 즉시 교체해 다음 세션이 기다리지 않게 한다.
- 실제 압축 처리(워커 호출 + canvas 폴백)는 `compressWithWorker()`로 공유 — 두 진입점 모두 동일 로직.

---

## FE 배치 · 동시성 · 파이프라인 구조

| 모드 | 배치 크기 | 동시 배치 수(concurrency) | 상수/근거 |
|---|---|---|---|
| `include_original=false`, PC | 8장/배치 | **6**(기본), 느린 회선이면 2~4로 하향 | `BATCH_SIZE=8`, `getDesktopUploadConcurrency(false)` → `PC_CONCURRENCY(5)+1` |
| `include_original=false`, Mobile | 3장/배치 | **1** | `MOBILE_BATCH_SIZE=3`, `MOBILE_CONCURRENCY=1` |
| `include_original=true`, PC | **1장/배치** | 4(기본), 고사양 기기+빠른 회선이면 6 | `ORIGINAL_PC_CONCURRENCY=4`, `ORIGINAL_PC_CONCURRENCY_FAST=6` |
| `include_original=true`, Mobile | **1장/배치** | 1 | `getDesktopUploadConcurrency` 미적용, 고정 1 |

`include_original=true`는 파일별 job·원본 결과를 연결하기 위해 1장 batch를 유지한다. 표의 동시성은 `requestSlots`의 전체 요청 상한이다. PC 미리보기 lane은 최대 2개이며, PC와 모바일 모두 모든 프리뷰 row를 등록할 때까지 원본 네트워크 요청을 시작하지 않는다. 등록 완료 뒤 PC 원본 큐는 2개로 시작해 256KB 이상·500ms 이상 걸린 원본 PUT을 표본으로 적응 조절한다. 범위는 1~`requestSlots-1`이고 전체 요청은 기존 상한 4/6을 넘지 않는다. 모바일 원본 전송은 1개씩 순차 실행한다.

### 모든 기기: producer-consumer 파이프라인 (2026-08-07 모바일 적용)

`pipelineMode = true`로 `include_original` 값과 기기 종류에 무관하게 같은 파이프라인 구조를 쓴다. 압축(producer)과 XHR 전송(consumer)을 **bounded async channel**로 연결해, batch 압축이 끝나는 즉시 전송을 시작하고 동시에 다음 batch 압축을 이어간다 — 기존 round의 "전체 압축 완료 후 전송 시작" barrier를 제거했다.

- **producer**: 셀렉 전용과 모바일은 기존처럼 batch를 순서대로 압축한다. 원본 포함 PC는 1장 batch의 예약/job 연결은 유지하면서 2~3개 batch의 파일을 한 번에 워커 풀에 넘겨 실제 병렬 압축하고, 결과를 다시 각 1장 batch로 분리해 순서대로 channel에 넣는다. 압축 라운드가 끝나면 전송 완료를 기다리지 않고 다음 라운드를 이어간다.
- **channel(bounded queue)**: 용량 = `concurrency`다. PC는 기존 값(비원본 기본 6, 원본 포함 기본 4/고사양·빠른 회선 6)을 유지하고, 모바일은 항상 1이다(`MOBILE_CONCURRENCY=1`; 원본 포함도 고정 1). 모바일 producer는 queue가 차면 **다음 batch 압축 전에** 대기하므로, 전송 중인 batch와 다음 batch를 넘는 압축본·미리보기 누적을 막는다.
- **consumer lane**: 셀렉 전용은 기존 `concurrency`, 원본 포함은 `previewConcurrency`개의 lane이 `/photos` 응답까지 처리한다. 원본 PUT/confirm은 별도 `originalQueue`에서 처리하므로 미리보기 lane이 원본 전송을 기다리지 않는다. `UploadWorkQueue`는 FIFO로 활성 작업 수를 제한한다. 사진 등록 결과를 기다리는 동안에는 네트워크 슬롯을 점유하지 않아 모바일 단일 슬롯 교착을 피한다. 대기 항목은 이미 선택된 File 참조·Promise이며 새 원본 복사본을 만들지 않는다.
- **FE 압축과 network 업로드의 overlap**: 다음 batch 압축은 현재 batch의 네트워크 전송 중에 진행될 수 있다. 따라서 모바일에서도 압축 대기와 전송 대기가 번갈아 생기던 유휴 구간을 줄인다. 단, 모바일은 동시 전송을 늘리지 않으므로 원본 R2 PUT의 실제 업링크 대역폭 자체를 높이지는 않는다. `uploadOneBatch()`의 `setTimeout(0)` 양보는 유지돼 iOS에서 이전 batch 프리뷰가 그려진 뒤 다음 전송이 시작된다.
- `include_original=false`(OPT-ROUND-01) 실측(로컬, 100/500장, 12~17MP급 실사진, 2026-08-06): 첫 업로드 시작(T_first_xhr_start)이 약 5~7.5배 빨라지고, 전체 소요시간(T_done)이 약 26~35% 단축됨을 확인 — 채택 결정.
- `include_original=true`(OPT-ROUND-02)도 실사진 기반(5~20MB급 원본 24장) 실측을 거쳐 채택했다 — 회선/원본 크기에 따라 개선폭이 달라질 수 있어 별도 성능 기록 위치가 생기기 전까지는 이 문서에 구체 수치를 고정하지 않는다.

### PC 실측 튜닝과 압축 병렬화 (3단계, 2026-09-11)

동시 원본 수는 Network Information API의 다운로드 추정값만으로 결정하지 않고 세션 중 완료된 실제 원본 PUT 처리량으로 조절한다. 첫 측정 구간은 2개로 시작하고 각 동시 수준에서 `현재 동시 수 × 2`개의 유효 표본이 모인 뒤 다음 수준을 판단한다. 조절은 대기 중 작업에만 적용되어 진행 중 요청을 취소하지 않는다. 결정값과 측정 구간 수는 식별정보 없이 `UploadTelemetry` v3의 `originalConcurrency`에 포함된다. 짧거나 작은 파일은 연결 준비 비용의 영향이 커 표본에서 제외되며, 업로드 파일이 적으면 초기값 2로 완료될 수 있다.

원본 포함 PC 압축은 같은 라운드의 2~3장을 하나의 `compressImagesInParallel()` 호출에 전달한다. 원본 File은 압축하지 않고 R2 PUT 경로에 그대로 사용하며, 병렬화 대상은 1600px 미리보기 중간 파일뿐이다. 모바일은 메모리 안전을 위해 압축·전송 모두 1개를 유지한다.

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

업로드가 끝나 DB에서 다시 불러온 사진의 라이트박스는 원본이 아니라 `r2_preview_url`(없으면 `r2_thumb_url`)을 사용한다. 라이트박스가 열려 있는 동안 `useAdjacentImagePreload`가 PC 이전 1장·다음 2장, 모바일 양옆 1장의 표시용 프리뷰만 미리 다운로드·decode하며, 데이터 절약 모드에서는 현재 사진만 대상으로 한다. 이 동작은 업로드 파이프라인이나 원본 R2 객체에는 접근하지 않는다.

| 단계 | 상태 배열 | 이미지 소스 |
|---|---|---|
| 파일 선택 직후(압축 전) | `queuedPreviews` | **원본(raw) File**의 blob URL |
| 전송 중(스피너) | `uploadingPhotos` | 압축된 File(통상 JPEG)의 blob URL |
| 배치 응답 성공 직후 | `pendingPhotos` | 위와 같은 압축본 blob URL 유지(서버가 반환한 thumb_url을 쓰지 않음 — iOS에서 업로드 XHR과 동시에 DB 조회하면 연결 한도를 초과하는 문제 회피) |
| **전체 업로드 세션 종료 후, 딱 1회** | `photos`(DB) | `getPhotosByProjectId()` 재조회 → 이때 처음으로 실제 `r2_thumb_url` 사용 |

각 파일은 큐에 들어올 때 만든 `tempId`와 `sourceIndex`를 `queuedPreviews → uploadingPhotos → pendingPhotos` 사이에서 그대로 인계받고, `sourceIndex` 순서로 렌더한다. 따라서 상태가 바뀌어도 카드의 React key·그리드 위치가 유지되며, 업로드 완료 순서가 달라도 재마운트·재정렬되지 않는다. 전송 시작 시 큐 원본(raw) blob URL은 압축본 blob URL로 바뀌지만, 카드 컴포넌트는 압축본을 투명 상태로 먼저 해독한 뒤에만 180ms 페이드로 교체한다. 따라서 대용량 원본이나 브라우저가 직접 해독하지 못하는 HEIC 원본 때문에 검은 프레임이 보이거나, URL 교체 때문에 카드가 깜빡이는 것을 피한다. 각 blob URL은 세션 종료/실패/중단 때 즉시 revoke한다.

즉 모든 기기에서 pipeline batch가 여러 번 반복되어도 세션 도중에는 서버 썸네일 URL을 한 번도 참조하지 않는다. 이 구조 때문에, 만약 향후 썸네일/프리뷰 생성을 비동기로 지연시키더라도 **업로드 세션 진행 중 화면 표시 자체는 깨지지 않는다** — 다만 다음 두 지점은 현재 코드가 "생성이 항상 동기로 끝나 있다"를 전제로 하고 있어 영향을 받는다:
- `insert_photos_with_numbers` 시점에 `r2_thumb_url`이 이미 있어야 한다(현재 photos row는 thumb_url 없이 존재할 수 없음).
- 세션 종료 직후 1회 호출되는 `getPhotosByProjectId()` 응답에 `r2_thumb_url`이 없으면 그 순간 그리드가 비어 보일 수 있다.

---

## 진행률(progress) · 완료 조건

2026-09-11: PC·모바일 모두 `UploadTelemetry`(`src/lib/upload-telemetry.ts`)의 세션 통계를 `UPLOAD_SAMPLE_MS=500`ms 간격으로 화면에 반영한다. 2단계에서 병렬 미리보기/원본 단계를 별도 기록하며 준비 상태가 진행 중인 원본 PUT 표시를 덮어쓰지 않는다. 전체 요청 상한과 최종 저장 확인 조건은 유지한다.

- **원본 포함**: R2 direct PUT을 XHR로 관찰해 `원본 전송 바이트 / 선택한 원본 총 바이트`로 전송률을 계산한다. 미리보기 바이트와 완료 배치 수를 섞지 않는다. 원본 파일별 최대 전송 위치를 유지하므로 재전송 바이트가 중복 합산되거나 진행률이 역행하지 않는다. 이는 유효 전송 진행량이며 재시도까지 포함한 실제 회선 사용량은 아니다.
- **셀렉 전용**: 압축본 multipart body의 `loaded/total` 실측 비율에 원본 파일 크기를 가중치로 적용한다. 압축 전에는 최종 전송량이 확정되지 않으므로 GB 수치는 표시하지 않는다.
- **완료 구분**: 전송률은 100%까지 표시한다. 이 값은 저장 완료율이 아니다. 사진 준비 / 미리보기 전송 / 원본 전송 / 저장 확인 / 다시 시도 상태와 `N/M장 저장 완료`, 실패 장수를 별도로 표시한다. 원본 포함 사진은 PUT + confirm/recover 성공 뒤에만 저장 완료로 집계하며 worker·ZIP 완료를 뜻하지 않는다. 병렬 처리 중에는 재시도 → 전송 → 저장 확인 순으로 대표 상태를 표시한다.
- **남은 시간**: `ETA_WINDOW_MS=15000`ms 동안의 유효 전송량 증가를 사용한다. 최소 `ETA_MIN_SAMPLE_MS=3000`ms 표본이 필요하며, `ETA_STALE_MS=5000`ms 동안 진행이 없거나 실패 시 추정을 중지한다. 재시도 중에는 복구 문구를 표시한다. 예상치는 ±20% 범위의 분 단위로 표시하며 통계적 신뢰구간이 아니다. `전송 약 N~M분 남음`은 전송 예상 시간이며 저장 확인 시간까지 보장하지 않는다. 초기에는 `남은 시간 계산 중`, 바이트 전송 후에는 `저장 확인 중`을 표시한다. PC의 시작 전 고정 회선 가정 예상 시간은 선택 파일 총 용량과 전송 후 안내 문구로 대체했다.

### 구간별 성능 기록

세션 종료 또는 화면 이탈 시 브라우저 console의 `[upload-performance]` 및 `acut:upload-performance` CustomEvent로 집계 1건을 기록한다. 서버 전송·영구 보관은 하지 않는다. 파일명, 파일 객체, 프로젝트/사용자 ID, R2 key, URL, 토큰은 포함하지 않는다.

- `version=2`, `previewBytes`(준비된 중간 이미지 크기 합계), `device`, `includesOriginal`, `fileCount`, `sourceBytes`, `transferredBytes`(유효 전송량), `savedCount`, `failedCount`, `outcome`, `elapsedMs`, `retryCount`
- `firstOriginalMs`: 파일 선택 세션 시작부터 첫 원본 PUT 시작까지
- `firstSavedMs`: 세션 시작부터 첫 사진 저장 확인 성공까지
- `fileStageMs`: 큐 대기, 압축 준비, 압축 후 대기, 미리보기 바디 전송, 미리보기 응답 대기, 원본 PUT, 저장 확인, 재시도 등 단계 체류 시간의 파일별 합계
- `finalizeMs`: 세션 마지막 DB 집계 요청 시간

병렬 파일의 시간은 겹치므로 `fileStageMs` 합계를 전체 소요 시간으로 해석하면 안 된다. 셀렉 전용의 여러 파일 batch는 batch의 단계 경계를 각 파일에 적용한다. `previewProcessing`은 브라우저의 바디 전송 완료부터 응답까지로 네트워크 왕복·서버 이미지 처리·R2·DB 시간이 합쳐진 값이다. **서버 내부 CPU/R2/DB 개별 시간 또는 운영 속도 개선율을 실측한 지표가 아니다.**

"업로드 완료!" 토스트가 실제로 기다리는 것:

| | `include_original=false` | `include_original=true` |
|---|---|---|
| FE 압축 | 대기(모든 기기의 파이프라인 producer·consumer lane이 모두 종료될 때까지) | 대기(모든 기기의 파이프라인 producer·consumer lane이 모두 종료될 때까지) |
| `/api/upload/photos` 응답(=썸네일/프리뷰 생성+R2 PUT+DB INSERT 전부 포함) | **대기** | 대기 |
| 원본 R2 presigned PUT(Browser→R2) | 해당 없음 | **대기** |
| `/originals/confirm` 응답 | 해당 없음 | **대기** |
| `/originals/finalize` DB 집계 | 해당 없음 | **대기** — R2 조회 없이 `pending/processing/completed` 수만 확인 |
| worker의 원본 R2 HEAD 검증(`processing→completed`) | 해당 없음 | **대기 안 함** — 완전 비동기 |
| 다운로드 ZIP 아카이브 빌드 | 해당 없음 | **대기 안 함** — 완전 비동기(`user-flow.md` §8.2) |

모든 미리보기 pipeline batch와 원본 큐 작업이 끝나면, 원본 포함 세션은 `POST /originals/finalize`를 한 번 호출해 DB 상태를 집계한 뒤 `uploadProgress=100` → `uploadPhase="done"` → 토스트, 600ms 뒤 DB 재조회(위 섹션). finalize는 R2 HEAD·ZIP 생성·worker 완료 대기를 수행하지 않으며 confirm을 통과한 `pending/processing/completed`를 정상으로 인정한다. 따라서 성공 경로의 추가 비용은 작은 DB count 조회 1회뿐이다.

모든 셀렉용 프리뷰 row가 등록되면 원본 PUT/worker 완료를 기다리지 않고 고객 링크를 활성화할 수 있다. `activate_project_for_selection` RPC가 프로젝트 행을 잠그고 실제 사진 수가 셀렉 목표 이상인지 확인한 뒤 `preparing→selecting`과 `photo_count` 동기화를 한 트랜잭션으로 처리한다. 같은 행 잠금과 `photos` INSERT 트리거가 활성화와 늦은 사진 등록의 경쟁을 직렬화하며, 활성화 뒤 신규 사진은 거부하고 같은 `client_upload_id`의 응답 유실 replay만 허용한다. 원본 전송은 현재 화면에서 계속되고 실패한 기존 job은 `?recover=1` 복구 진입점에서 다시 선택할 수 있다.

원본 PUT은 첫 요청이 성공하면 추가 대기 없이 끝난다. 각 원본 파일은 PUT과 confirm이 하나의 총 재시도 예산(`ORIGINAL_TRANSFER_MAX_RETRIES=4`, 최초 요청 제외)을 공유한다. 네트워크 오류, 408/429/500/502/503/504, presigned URL 403에만 `/originals/recover`로 R2 존재 여부를 먼저 확인하고, 남은 예산 안에서 500ms부터 최대 4초까지 지수 백오프(`ORIGINAL_RETRY_BASE_DELAY_MS`, `ORIGINAL_RETRY_MAX_DELAY_MS`)와 ±25% jitter를 적용한다. PUT·confirm 단계별 재시도와 업로드 종료 후 지연 재전송을 중첩하지 않으므로 한 파일의 PUT/confirm 재호출은 최초 요청 이후 합계 최대 4번이다(R2 존재 확인용 recover 호출은 별도). 최종 실패만 `/originals/report-failure`로 `last_error`에 기록하고, finalize 결과와 함께 "업로드 완료" 대신 "원본 업로드 확인 필요"를 표시한다. 셀렉용 사진 업로드 성공 자체는 되돌리지 않으므로 사용자는 누락 원본만 다시 선택해 복구한다.

**UI phase**: 코드에 정의된 값은 `idle`/`processing`/`done`(과 실패 시 `idle`로 복귀)뿐이다. `uploadPhase === "sending"`을 조건으로 쓰는 UI 코드가 일부 있으나, 실제로 `setUploadPhase("sending")`을 호출하는 지점은 없다 — 즉 `sending`은 현재 코드 경로상 도달하지 않는 상태다(세션 lifecycle 값이며 실제 단계 문구는 `UploadTelemetry`로 분리한다).

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

원본 업로드 목록은 별도의 `photos.source_file_size/source_width/source_height/source_content_type/source_last_modified`를 사용한다. 파일 크기·이름·MIME·수정 시각은 브라우저 `File`에서 받고, 픽셀 크기는 브라우저가 압축 때문에 이미 디코딩한 경우 그 값을 재사용한다. 압축을 생략한 작은 파일은 서버가 썸네일을 만들며 이미 디코딩한 입력 크기를 사용하므로 메타데이터 수집만을 위한 추가 디코딩이나 네트워크 요청은 없다. 과거 행에서 source metadata가 없으면 `file_size`로 대체하거나 해상도를 추정하지 않는다.

**`photos.original_compressed_size`는 현재 원본 객체 크기**

컬럼명은 과거 재압축 결과를 저장하던 때의 이름을 유지하지만, 현재 `original_compress_worker`는 R2 HEAD에서 확인한 압축하지 않은 원본 바이트 크기를 `complete_original_job(p_file_size)`로 전달해 이 컬럼에 저장한다. 과거 행 등 값이 NULL인 경우에만 `app/archive.py`가 고정 추정치 20MiB(`_FALLBACK_PHOTO_BYTES`)를 사용한다.

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

## 모바일 업로드 UI와 생성 설정 (2026-09-09)

- `projects/new/page.tsx`의 `handleSubmit(goToUpload)`는 이동 위치만 결정하며 `include_original`에는 `includeOriginal`을 그대로 전달한다. 원본 올리기를 눌러도 false를 true로 덮어쓰지 않는다. Next 생성 API의 저장과 FastAPI 원본 처리 분기는 기존 계약을 유지한다.
- `UploadVersionsPanel`은 body portal과 Light scope로 열리며 Mobile inset/scroll/footer는 `UploadVersionsPanel.module.css`에서 관리한다. 자동 표시 조건과 파일 매칭/전송 로직은 유지하고 toolbar에서 일괄 업로드/교체를 다시 열 수 있다.
- 모바일 보정 목록의 개별 파일 선택은 즉시 업로드한다. 일괄 창은 파일 선택·매칭 확인 후 업로드로 확정한다. 하단에 실제 업로드/교체 잔여 장수와 요청 가능 이유를 표시한다.
- 원본 gallery는 long press release click을 경계에서 차단해 해당 gesture로 하나의 사진만 선택한다. 선택/전체 선택/취소 UI를 제공하고 삭제 확인과 서버 삭제 로직은 유지한다.
- R2 key, presigned URL, worker, 압축 품질, batch/concurrency는 변경하지 않았다. [모바일 구현 검증과 한계](mobile-design-implementation-2026-09-09.md).

모바일 보정 화면 후속 개선: `SingleVersionUploadSlot compact`는 점선 영역 대신 ‘파일 선택’ 버튼을 사용한다. toolbar와 전체 업로드 완료 전 하단 Primary `일괄 업로드`는 같은 기존 일괄 창을 열고, 필터·보기 전환은 공통 아이콘 버튼으로 직접 배치한다. 보정본 Mobile 내보내기는 제거한다. 현재 보정 단계의 모든 대상 업로드가 완료되면 하단 action은 검토 요청으로 전환한다. 파일 검증과 개별/일괄 전송 로직은 유지한다.

모바일 `UploadVersionsPanel` footer는 취소·업로드 버튼만 유지한다. 파일이 없을 때의 `추가로 업로드할 파일을 선택해주세요.` 안내는 비활성 업로드 버튼과 의미가 겹치므로 모바일에서 숨기며, Desktop 상태 문구와 실제 업로드 진행률 표시는 유지한다.


## 원본 선발급 예약·만료 정리 (호환 유지, 2026-09-11)

현재 업로드 화면은 선발급 예약 API를 호출하지 않고 `/photos`가 반환한 job URL을 사용한다. 아래 예약 테이블과 정리 worker는 이전 선전송 흐름에서 남은 객체 정리와 호환을 위해 유지한다.

- DB 마이그레이션: `20260911150000_original_upload_reservations.sql`. `original_upload_reservations`와 service-role 전용 `reserve_original_upload`, `renew_original_upload_reservation`, `claim_expired_original_uploads` RPC를 추가한다. 예약은 프로젝트 소유권·`preparing`·원본 포함 설정·파일 metadata·업로드 한도를 검사한다. 같은 `(project_id, client_upload_id)`는 같은 key와 metadata를 재사용한다. 프로젝트 삭제 후에도 미등록 객체를 정리할 수 있도록 예약 테이블에는 프로젝트 cascade FK가 없다.
- 예약 수명은 SQL의 48시간, URL은 기존 `ORIGINAL_PRESIGNED_EXPIRES=3600`초다. `/photos`가 선발급된 항목을 처리하기 전에 예약을 갱신하므로, 정리가 선점한 예약의 늦은 미리보기 요청은 409로 종료된다. 원본 큐가 늦게 실행되어 URL 만료까지 30초 이내이면 선전송 시도를 생략하고 job recover에서 URL을 다시 얻는다. 확인 직전에 최신 브라우저 세션 토큰을 읽어 오래 대기한 항목의 인증 만료를 피한다.
- `original_reservation_sweep_worker`는 `RESERVATION_SWEEP_SECONDS=1800`초마다 최대 50개를 claim한다. `original_jobs.r2_source_key`와 `photos.(project_id,client_upload_id)` 둘 다 연결이 없을 때만 객체를 삭제한다. DB/R2 오류 시 예약을 남기고, 중단된 cleanup claim은 10분 뒤 재선점할 수 있다. 정리 중에는 예약 재발급/갱신을 거부한다. 원본을 복사하거나 재압축하지 않는다.
- 중단 시 아직 전송하지 않은 등록 job은 복구 대상으로 남긴다. 과거 미등록 원본은 예약 만료 정리 대상이다. 성공한 원본은 worker/ZIP 완료 여부와 무관하게 기존 confirm 조건으로 처리한다.

## 실패 원본 재시도 UI (2단계)

같은 페이지 세션의 실패 원본만 `recoveryFilesRef`에 보관한다. PC·모바일 복구 배너의 `실패 원본 N장 재시도`는 파일 선택창 없이 기존 recover → 필요한 PUT → confirm을 실행한다. 저장이 이미 확인된 파일은 재전송하지 않는다. 성공·상태 재조회 때 캐시를 비우며 페이지 종료/새로고침 후에는 파일 재선택과 기존 이름+크기+수정시각 매칭을 사용한다. 복구 중 중복 클릭과 신규 업로드 시작을 차단하고, 파일을 찾지 못한 경우와 전송 실패를 서로 다른 문구로 표시한다.

`original_status IS NULL` 또는 `awaiting_upload`/`failed`인 사진은 복구 필요 상태로 집계한다. 프로젝트 목록·대시보드·상세 화면은 `원본 미업로드 N장` 경고 배지를 표시하고, 원본 업로드 화면은 해당 사진 카드마다 `원본 누락` 배지를 표시한다. 정상 처리 중인 `pending`/`processing`은 경고 대상에 포함하지 않는다.

### 2단계 검증 범위

- 예약 거부/미배포 시 무서명, 연결된 객체·DB 오류 시 정리 금지, R2 삭제 오류 시 원장 유지에 대한 BE 테스트 및 기존 업로드/종료 테스트.
- FIFO 동시성 상한·오류 후 슬롯 반환·모바일 단일 슬롯 등록 대기·병렬 단계 표시 테스트.
- 브라우저의 3600×2400 합성 패턴을 실제 압축 worker로 비교: 3200px 538,266B → 1600px 184,921B, 최종 표시 크기 1200×800 비교 PSNR 약 40.0dB. 원본 크기 metadata는 유지된다. 이는 합성 표본 1개의 중간 파일 비교로, 실제 사진 전체의 화질 보장이나 원본 업로드 시간 개선율이 아니다. 업로드 화면 외 `compressImageForUpload`의 기본 3200px 설정은 유지한다.
