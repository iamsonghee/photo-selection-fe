-- photos 테이블에 작가 메모 컬럼 추가
-- Supabase 대시보드 → SQL Editor에서 실행하세요.

ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS memo text;

