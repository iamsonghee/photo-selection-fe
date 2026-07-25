# Photo-Selection 기술 분석 & 개선 로드맵

> 최초 작성: 2026-05-14  
> 최종 업데이트: 2026-07-23 (원본 통합 업로드 — 별도 납품 패널 제거, 초기 업로드 CTA에 원본 포함 토글 통합)  
> 버전: v1.2

---

## 목차

1. [아키텍처 분석](#1-아키텍처-분석)
2. [기능 테스트 계획](#2-기능-테스트-계획)
3. [버그 분석 및 우선순위](#3-버그-분석-및-우선순위)
4. [성능 최적화 전략](#4-성능-최적화-전략)
5. [개선 로드맵](#5-개선-로드맵)

---

## 1. 아키텍처 분석

### 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | FastAPI, Pillow + pillow-heif, boto3 |
| **인증** | Supabase Auth (JWKS/ES256 JWT) |
| **DB** | Supabase PostgreSQL |
| **스토리지** | Cloudflare R2 (CDN) |
| **배포** | Frontend: Vercel / Backend: Railway |
| **가상 스크롤** | TanStack Virtual |
| **폼** | react-hook-form + Zod |

### 주요 모듈 구조

```
Frontend                        Backend
─────────────────────           ──────────────────────────
/app/photographer/              /routers/
  projects/[id]/                  upload.py      ← 원본·보정본 업로드
    upload/page.tsx               projects.py    ← 프로젝트 CRUD
    workflow/                     storage.py     ← R2 삭제
/app/c/[token]/                 /dependencies.py ← JWT 인증
  gallery/                      /database.py     ← Supabase 클라이언트
  viewer/[photoId]/             /storage.py      ← R2 유틸
/contexts/
  SelectionContext              ← 고객 선택 상태 전역 관리
  ReviewContext                 ← 보정본 검토 상태
```

### 데이터 흐름

```
[작가] 원본 사진 업로드
  → 프론트: ACCEPT_TYPES = "image/*,image/heic,image/heif" 필터
  → 프론트: 모바일이면 압축 먼저 (compressImageFileForMobileIfNeeded)
  → XHR Batch (PC: 8장×동시5 / 모바일: 3장×동시2)
  → 백엔드: Content-Type 검증 (없으면 파일명으로 추론)
  → 백엔드: EXIF 회전 → 썸네일(300px/75%) + 미리보기(1200px/82%)
  → R2 병렬 업로드 → photos DB INSERT

[고객] 갤러리 접근
  → /c/[token]/gallery → SelectionContext 로드
  → TanStack Virtual 가상 스크롤
  → 뷰어: previewUrl(1200px) 사용
  → 선택 확정 → status: "confirmed"

[작가] 원본(납품) 업로드 — 초기 업로드 CTA 동시 처리
  → 프론트: upload/page.tsx의 "원본 포함" 토글 (기본 ON)
      ON:  브라우저 압축 완전 스킵, 1장/배치, PC concurrency=3, 모바일 concurrency=1
      OFF: 기존 압축 흐름 동일 (PC: 8장/배치×동시5, 모바일: 3장/배치×동시2)
  → POST /api/upload/photos (FormData: project_id + files + include_original)
  → 백엔드: include_original=true 시 썸네일·미리보기 생성과 동시에 원본 처리
  → 원본 처리 (_process_original_sync):
      JPEG ≤20MB → 그대로 저장
      PNG/HEIC/WebP → quality=95 JPEG 변환
      20MB 초과 시 2단계 자동 압축:
        1단계: 원해상도 유지, quality 90→85→80→75%
        2단계: quality=90 고정, 최장변 6000→5000→4000→3200→2400→1600px
        1600px에서도 초과 → 최선 결과 그대로 저장 (업로드는 항상 성공)
  → R2 저장: originals/{project_id}/{photo_id}.jpg
  → photos 테이블: r2_original_url, original_uploaded_at 컬럼에 저장
```

### 이미지 처리 설정값

```python
# 원본 / 보정본 공통 (upload.py) — 동일한 사이즈·품질 기준
THUMB_MAX_SIZE = 300        # 갤러리 썸네일
THUMB_JPEG_QUALITY = 75
PREVIEW_MAX_SIZE = 1200     # 뷰어 미리보기 / 보정본 full
PREVIEW_JPEG_QUALITY = 82

# 보정본 전용 (upload.py)
VERSION_MAX_SIZE = 1200     # PREVIEW_MAX_SIZE와 동일
VERSION_JPEG_QUALITY = 82   # 고정 품질 (품질 자동 하향 루프 없음)
VERSION_THUMB_MAX_SIZE = 300
VERSION_THUMB_JPEG_QUALITY = 75

# 원본(납품) 전용 (upload.py) — include_original=true 시 적용
ORIGINAL_MAX_BYTES = 20 * 1024 * 1024      # 20MB 상한
UPLOAD_WITH_ORIGINAL_CONCURRENCY = 3       # 환경변수로 조정 가능 (기본 3)
# 2단계 자동 압축 (20MB 초과 시에만 적용)
#   PNG/HEIC/WebP: quality=95 JPEG 변환 먼저
#   1단계: 원해상도 유지, quality 순서: 90 → 85 → 80 → 75
#   2단계: quality=90 고정, 최장변(px) 순서: 6000 → 5000 → 4000 → 3200 → 2400 → 1600
#   1600px에서도 초과 → 최선 결과 그대로 저장 (항상 성공, 크기 상한 없음)
# R2 key: originals/{project_id}/{photo_id}.jpg  (photo_id = uuid4().hex, 32자 HEX)

# 동시성
UPLOAD_PHOTOS_CONCURRENCY = 5   # 환경변수로 조정 가능
IMAGE_EXECUTOR_MAX_WORKERS = 8  # ThreadPoolExecutor
```

### 브라우저 압축 설정값

```ts
// 원본·보정본 공통 (upload-client-compress.ts 기본값)
maxEdge = 3200
jpegQuality = 0.82
skipBelowBytes = 600KB  // 이하 파일은 압축 스킵

// 원본(납품) 포함 시: 브라우저 압축 완전 우회 (include_original=true)
// → compressImageForUpload 스킵, 원본 바이트 그대로 서버 전송
// → 서버 측 _process_original_sync 에서 ORIGINAL_MAX_BYTES 기준 2단계 압축 적용
```

---

## 2. 기능 테스트 계획

### 2-1. 인증

| ID | 시나리오 | 기대 결과 | 케이스 | 상태 |
|----|---------|---------|-------|------|
| L1 | Google OAuth 로그인 | 대시보드 리디렉션 | 정상 | ⬜ |
| L2 | 이메일 로그인 (테스트 계정) | 대시보드 리디렉션 | 정상 | ⬜ |
| L3 | 잘못된 비밀번호 | 401 에러 메시지 | 오류 | ⬜ |
| L4 | 로그아웃 후 보호 페이지 접근 | 로그인 리디렉션 | 엣지 | ⬜ |
| L5 | JWT 만료 후 API 호출 | 자동 갱신 or 재로그인 | 엣지 | ⬜ |
| L6 | 동시 탭 로그아웃 | 모든 탭 세션 종료 | 엣지 | ⬜ |

### 2-2. 파일 업로드 (원본 사진)

| ID | 시나리오 | 기대 결과 | 케이스 | 버그 | 상태 |
|----|---------|---------|-------|-----|------|
| U1 | JPG 1장 업로드 | 성공, 갤러리 표시 | 정상 | - | ⬜ |
| U2 | PNG 업로드 | 성공 | 정상 | - | ⬜ |
| U3 | HEIC 업로드 | 성공 | 정상 | - | ⬜ |
| U4 | WebP 업로드 | 성공 | 정상 | - | ⬜ |
| U5 | **CR3 업로드** | **거부 + 에러 메시지** | 오류 | ⚠️ BUG-01 | ✅ 2026-05-14 |
| U6 | **대문자 확장자** (.JPG, .HEIC) | 성공 | 엣지 | ⚠️ BUG-02 | ✅ 2026-05-14 |
| U7 | **특수문자 파일명** (#, &, 공백) | 성공 (이스케이프) | 엣지 | ⚠️ BUG-03 | ✅ 2026-05-14 |
| U8 | 20MB 초과 파일 | 에러 안내 | 오류 | - | ⬜ |
| U9 | 500장 연속 업로드 | 배치 처리, 진행률 | 엣지 | - | ⬜ |
| U10 | 업로드 중 네트워크 끊김 | 재시도 or 에러 | 엣지 | - | ⬜ |
| U11 | 베타 한도(1500장) 초과 | 403 + 안내 | 오류 | - | ⬜ |
| U12 | 0바이트 파일 | 거부 | 오류 | - | ⬜ |

### 2-3. 고객 사진 셀렉

| ID | 시나리오 | 기대 결과 | 케이스 | 상태 |
|----|---------|---------|-------|------|
| S1 | 갤러리 로드 (100장) | 가상 스크롤 정상 | 정상 | ⬜ |
| S2 | 사진 선택/해제 | 즉시 반영 + DB 저장 | 정상 | ⬜ |
| S3 | N장 정확히 선택 후 확정 | 확정 완료 | 정상 | ⬜ |
| S4 | N장 미만 확정 시도 | 버튼 비활성 | 오류 | ⬜ |
| S5 | PIN 번호 입력 | 인증 후 갤러리 | 정상 | ⬜ |
| S6 | 잘못된 PIN 5회 이상 | 30분 잠금 | 엣지 | ⬜ |
| S7 | 확정 취소 (3회 한도) | 선택 단계 복귀 | 정상 | ⬜ |
| S8 | 확정 취소 한도 초과 | 비활성 | 오류 | ⬜ |
| S9 | 뷰어 방향키 이동 | 이전/다음 사진 | 정상 | ⬜ |

### 2-4. 보정본 업로드 및 검토

| ID | 시나리오 | 기대 결과 | 케이스 | 상태 |
|----|---------|---------|-------|------|
| R1 | V1 보정본 전체 업로드 | 성공, 검토 요청 가능 | 정상 | ⬜ |
| R2 | 개별 보정본 교체 | version_reviews 초기화 + 재업로드 | 정상 | ⬜ |
| R3 | 고객 V1 검토: 확정/재보정 | 상태 반영 | 정상 | ⬜ |
| R4 | V2 재보정 교체 후 CTA 활성 | 교체 후 활성화 | 정상 | ⬜ |
| R5 | 2MB 초과 보정본 | 자동 품질 조정 | 엣지 | ⬜ |
| R6 | 재보정 한도 초과 시도 | 403 안내 | 오류 | ⬜ |

### 2-5. 원본(납품) 통합 업로드

> 진입 조건: 프로젝트 status = `preparing`, 진입점: `/photographer/projects/[id]/upload`  
> 업로드 CTA와 동시에 썸네일·미리보기·원본이 한 번에 업로드됨

| ID | 시나리오 | 기대 결과 | 케이스 | 상태 |
|----|---------|---------|-------|------|
| D1 | 업로드 페이지 진입 — "원본 포함" 토글 기본 ON 확인 | 데스크톱·모바일 툴바에 토글 표시, 기본 ON | 정상 | ✅ 2026-07-23 |
| D2 | 토글 ON → OFF → ON 전환 | 시각 상태 즉시 반영 | 정상 | ✅ 2026-07-23 |
| D3 | 토글 ON + JPEG 업로드 | `include_original=true` 전송, photos.r2_original_url 저장 | 정상 | ✅ 2026-07-23 |
| D4 | 토글 OFF + JPEG 업로드 | `include_original=false` 전송, photos.r2_original_url=null | 정상 | ✅ 2026-07-23 |
| D5 | 토글 ON + PNG 업로드 | 서버에서 JPEG 변환 후 originals/ 저장 | 정상 | ⬜ |
| D6 | 토글 ON + HEIC 업로드 | JPEG 변환 후 originals/ 저장 | 정상 | ⬜ |
| D7 | 토글 ON + 20MB 초과 파일 | 2단계 압축 후 저장 또는 rejected 처리 | 엣지 | ⬜ |
| D8 | 업로드 중 토글 클릭 시도 | 토글 비활성(disabled) | 경계 | ⬜ |
| D9 | 0장 프로젝트 — 모바일 토글 노출 | photos 없어도 모바일 툴바에 토글 표시 | 경계 | ✅ 2026-07-23 |
| D10 | workflow 페이지 delivered 상태 | "납품 파일 업로드" 버튼 없음, 정적 "납품 완료" 텍스트 표시 | 경계 | ✅ 2026-07-23 |

---

## 3. 버그 분석 및 우선순위

### BUG-01 (P0): CR3/RAW 파일 조용한 업로드 실패

- **현상**: CR3 파일 업로드 시 성공처럼 보이지만 실제 저장 안 됨
- **영향도**: 데이터 손실 — 작가가 업로드 완료로 오해
- **근본 원인**:
  1. 프론트: `ACCEPT_TYPES = "image/*"` → `.cr3` MIME 타입(`image/x-canon-cr3` 또는 `""`) 허용
  2. 프론트: `f.type === ""` 조건으로 타입 없는 파일 전부 통과
  3. 백엔드: `_infer_content_type(".cr3")` → 기본값 `"image/jpeg"` 반환
  4. `"image/jpeg"` ∈ `ALLOWED_CONTENT_TYPES` → 타입 검사 통과
  5. Pillow가 파일 열기 실패 → `None` 반환 → 조용히 스킵
- **수정 방향**:
  - 백엔드: 알 수 없는 확장자 → `None` 반환 → 실패 목록에 추가
  - API 응답: `{ uploaded: N, failed: ["file1.cr3"] }` 포함
  - 프론트: 실패 파일 목록 표시
- **수정 상태**: ⬜ 미수정

---

### BUG-02 (P0): 대문자 확장자 처리 불일치

- **현상**: `.HEIC`, `.JPG` 등 대문자 확장자 파일이 기기/브라우저마다 다르게 처리됨
- **영향도**: HEIC 업로드 불가 케이스 발생
- **근본 원인**:
  - 일부 iOS 기기에서 `.HEIC` 파일의 MIME 타입이 `""` 또는 `"image/HEIC"`(대문자)로 전달
  - 백엔드 `_infer_content_type()`은 `.lower()` 처리하지만 프론트 `content_type` 검사는 미정규화
- **수정 방향**:
  - 프론트: `f.type.toLowerCase()` 후 검사
  - 백엔드: `content_type = content_type.lower()` 정규화 추가
- **수정 상태**: ⬜ 미수정

---

### BUG-03 (P1): 보정본 파일명 특수문자 미처리

- **현상**: `#`, `&`, `?` 등 URL 예약 문자가 포함된 파일명으로 R2 key 생성 → CDN URL 파싱 오류
- **영향도**: 특정 파일명의 보정본 접근 불가
- **근본 원인**: `upload.py`에서 공백(`" "`)만 언더스코어로 치환, 나머지 특수문자 미처리
- **수정 방향**: `re.sub(r'[^\w\-.]', '_', filename)` 적용
- **수정 상태**: ⬜ 미수정

---

### BUG-04 (P1): PC에서 대용량 업로드 중 토큰 만료

- **현상**: 500장 이상 업로드 중 JWT 만료 → 후반부 배치 인증 실패
- **영향도**: 대용량 업로드 중간 실패
- **근본 원인**: 모바일은 20배치마다 토큰 갱신하지만 PC는 갱신 로직 없음
- **수정 방향**: PC도 일정 배치 간격으로 `supabase.auth.refreshSession()` 추가
- **수정 상태**: ⬜ 미수정

---

### BUG-05 (P2): 파일 처리 실패 시 사용자 피드백 없음

- **현상**: 개별 파일 처리 실패 시 조용히 스킵, 사용자는 알 수 없음
- **수정 방향**: API 응답에 `failed` 배열 추가, 프론트에서 표시
- **수정 상태**: ⬜ 미수정 (BUG-01 수정 시 함께 처리)

---

### BUG-06 (P2): JWKS 캐시 TTL 없음

- **현상**: Railway 재배포 후 첫 요청마다 JWKS 조회 (~100ms 추가)
- **근본 원인**: `_jwks_cache`가 프로세스 재시작까지 무기한 유지 → 키 교체 시 영구 인증 실패 위험
- **수정 방향**: TTL 1시간 캐시 구현 + 실패 시 재조회
- **수정 상태**: ⬜ 미수정

---

### 버그 현황 요약

| ID | 설명 | 우선순위 | 영향도 | 수정 상태 |
|----|-----|---------|--------|---------|
| BUG-01 | CR3 조용한 실패 | **P0** | 데이터 손실 | ✅ 2026-05-14 |
| BUG-02 | 대문자 확장자 불일치 | **P0** | 업로드 불가 | ✅ 2026-05-14 |
| BUG-03 | 특수문자 파일명 | P1 | 접근 불가 | ✅ 2026-05-14 |
| BUG-04 | PC 토큰 만료 | P1 | 대용량 실패 | ✅ 2026-05-14 |
| BUG-05 | 실패 피드백 없음 | P2 | UX | ✅ BUG-01과 함께 처리 |
| BUG-06 | JWKS TTL 없음 | P2 | 인증 안정성 | ⬜ |

---

## 4. 성능 최적화 전략

### 병목 지점 맵

```
[파일 선택] → [XHR 배치] → [백엔드 Pillow 처리] → [R2 업로드] → [DB INSERT]
                                      ↑                    ↑
                                   주 병목 1            병목 2 (리전 거리)
```

### OPT-01: Pillow 처리 최적화

- **현재**: 400px 썸네일, 1200px 미리보기, LANCZOS 리샘플링
- **개선**:
  - `THUMB_MAX_SIZE`: 400 → 300 (갤러리 카드 크기 충분) → 생성 속도 ~40% 향상
  - 대형 파일: LANCZOS 이전 `Image.draft('JPEG', (800, 800))`로 pre-shrink
  - 예상 효과: 썸네일 생성 ~1.5s → ~0.9s
- **수정 상태**: ⬜ 미적용

### OPT-02: R2 리전 및 업로드 최적화

- **현재**: Railway(유럽) → R2 기본 리전
- **개선**:
  - R2 리전을 `apac`으로 변경 (한국 접근성)
  - 5MB 이상 파일: multipart upload 적용
- **수정 상태**: ⬜ 미적용

### OPT-03: 갤러리 페이지네이션

- **현재**: `getPhotosByProjectId` → 전체 사진 한 번에 로드
- **문제**: 500장 프로젝트 → 대량 DB 쿼리 + 클라이언트 메모리
- **개선**: `.range(0, 99)` 방식으로 100장씩 추가 로드 (무한 스크롤)
- **수정 상태**: ⬜ 미적용

### OPT-04: JWKS 캐시 TTL

- **현재**: 프로세스 재시작까지 무기한 캐시
- **개선**: TTL 1시간 + 실패 시 재조회
- **수정 상태**: ⬜ 미적용 (BUG-06과 동일)

### OPT-05: 업로드 실패 파일 optimistic 갱신

- **현재**: 배치 완료 후 전체 새로고침
- **개선**: 개별 파일 완료 즉시 UI 업데이트
- **수정 상태**: ⬜ 미적용

---

## 5. 개선 로드맵

### Sprint 1 — 버그 수정 (P0/P1)

| 작업 | 대상 | 예상 공수 | 상태 |
|-----|------|---------|------|
| BUG-01: CR3 실패 명시화 | upload.py + 프론트 | 0.5d | ✅ |
| BUG-02: 대문자 확장자 정규화 | upload.py + 프론트 | 0.5d | ✅ |
| BUG-03: 특수문자 파일명 | upload.py | 0.5d | ✅ |
| BUG-04: PC 토큰 갱신 | upload/page.tsx | 0.5d | ✅ |

### Sprint 2 — 성능 최적화

| 작업 | 대상 | 예상 공수 | 상태 |
|-----|------|---------|------|
| OPT-01: Pillow 처리 최적화 | upload.py | 1d | ✅ 2026-05-14 |
| OPT-03: DB 쿼리 컬럼 최적화 | db.ts | 0.5d | ✅ 2026-05-14 |
| OPT-04: JWKS TTL 캐시 | dependencies.py | 0.5d | ✅ 2026-05-14 |

### Sprint 3 — 테스트 자동화

| 작업 | 대상 | 예상 공수 | 상태 |
|-----|------|---------|------|
| Playwright 설치 + config | playwright.config.ts | 0.5d | ✅ 2026-05-14 |
| 인증 E2E 테스트 | tests/e2e/auth.spec.ts | 0.5d | ✅ 2026-05-14 |
| 업로드 E2E 테스트 | tests/e2e/upload.spec.ts | 1d | ✅ 2026-05-14 |
| 고객 셀렉 E2E 테스트 | tests/e2e/gallery.spec.ts | 1d | ✅ 2026-05-14 |
| 파일 타입 경계 케이스 | tests/e2e/upload.spec.ts | 0.5d | ✅ 2026-05-14 |

### Sprint 4 — 원본(납품) 통합 업로드

> 기존 별도 패널(`DeliveryUploadPanel`) 방식을 제거하고, 초기 업로드 CTA에 "원본 포함" 토글을 통합함

| 작업 | 대상 | 예상 공수 | 상태 |
|-----|------|---------|------|
| `DeliveryUploadPanel.tsx` 제거 | components/photographer/ | 0.5d | ✅ 2026-07-23 |
| `POST /api/upload/originals` 엔드포인트 제거 | upload.py | 0.5d | ✅ 2026-07-23 |
| `delivery_files` 테이블 DROP, `photos` 테이블에 `r2_original_url` / `original_uploaded_at` 추가 | Supabase migration | 0.5d | ✅ 2026-07-23 |
| `_process_original_sync` + `include_original` 파라미터 | upload.py | 1d | ✅ 2026-07-23 |
| R2 key 패턴 `originals/{project_id}/{hex32}.jpg` 로 변경 | storage.py | 0.5d | ✅ 2026-07-23 |
| "원본 포함" 토글 UI (데스크톱·모바일), 배치/동시성 분기 | upload/page.tsx | 1d | ✅ 2026-07-23 |
| `supabase.ts` `delivery_files` 제거, `photos` 타입 컬럼 추가 | types/supabase.ts | 0.5d | ✅ 2026-07-23 |
| WorkflowPageClient 납품 진입점 → 정적 텍스트로 변경 | workflow/WorkflowPageClient.tsx | 0.5d | ✅ 2026-07-23 |
| 고객 다운로드 페이지 (presigned URL) | — | — | ⬜ 베타 이후 |
| R2 TTL lifecycle rule (30일 삭제) | — | — | ⬜ 고객 다운로드 완성 후 |
| ZIP 묶음 다운로드 | — | — | ⬜ 베타 이후 |

---

### 현황 지표

| 항목 | 현재 | 목표 |
|-----|------|------|
| CR3 업로드 처리 | 조용한 실패 | 명시적 오류 안내 |
| 썸네일 생성 속도 | ~1.5s/장 | ~0.9s/장 |
| 갤러리 초기 로드 | 전체 사진 | 100장 단위 |
| E2E 테스트 커버리지 | 0% | 핵심 플로우 80% |
| JWKS 캐시 | 무기한 | TTL 1시간 |

---

*이 문서는 버그 수정/기능 추가/성능 개선 완료 시 상태(⬜ → ✅)를 업데이트해주세요.*
