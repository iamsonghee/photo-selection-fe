-- R2_PUBLIC_URL이 이미 설정돼 있어 BE가 업로드 시점에 바로 공개 URL을 돌려준다(presign
-- 엔드포인트 불필요, 1차 범위에서는 단순하게 URL을 그대로 저장). storage_key는 삭제 시
-- R2 객체 키 계산용으로 남겨둔다.
ALTER TABLE public.customer_photos ADD COLUMN IF NOT EXISTS thumb_url text;
ALTER TABLE public.customer_photos ADD COLUMN IF NOT EXISTS preview_url text;
