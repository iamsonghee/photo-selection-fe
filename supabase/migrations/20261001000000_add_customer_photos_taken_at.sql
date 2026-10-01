-- 셀프 고객 셀렉의 장면 구분용 원본 촬영 시각. 브라우저가 압축 전 원본 EXIF(DateTimeOriginal,
-- 없으면 파일 수정 시각)를 읽어 보낸다. 카메라 시계에는 시간대가 없으므로 timestamp(시간대 없음)로
-- 저장한다. 기존 사진은 NULL이며, 이 경우 장면 없이 촬영 순서 목록으로 보여준다.
ALTER TABLE public.customer_photos ADD COLUMN IF NOT EXISTS taken_at timestamp;
