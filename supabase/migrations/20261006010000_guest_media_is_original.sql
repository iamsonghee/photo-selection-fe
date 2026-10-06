-- 하객이 사진을 원본으로 보냈는지(카톡처럼 '사진 원본으로 보내기' 체크). 기본은 줄여서(긴 변 3200px JPEG) 보낸다.
-- 영상은 브라우저에서 줄일 수 없어 항상 true. 이 컬럼 전에 올라온 파일은 모두 원본이었으므로 기본값 true로 채운다.
ALTER TABLE public.guest_media ADD COLUMN IF NOT EXISTS is_original boolean NOT NULL DEFAULT true;
