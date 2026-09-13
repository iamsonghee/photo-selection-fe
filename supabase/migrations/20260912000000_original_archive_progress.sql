-- 납품용 원본 ZIP 생성 진행률.
-- 워커가 처리한 파일 수/바이트를 제한된 주기로 기록하고 고객 화면의 ETA에 사용한다.

ALTER TABLE public.original_archive_parts
    ADD COLUMN IF NOT EXISTS processed_file_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS processed_bytes BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS progress_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.original_archive_parts.processed_file_count
    IS '현재 시도에서 ZIP에 기록을 마친 원본 수';
COMMENT ON COLUMN public.original_archive_parts.processed_bytes
    IS '현재 시도에서 ZIP에 기록을 마친 원본 실제 바이트 합계';
COMMENT ON COLUMN public.original_archive_parts.progress_updated_at
    IS '아카이브 워커가 마지막으로 진행률을 갱신한 시각';
