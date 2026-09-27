-- 사진별 참가자 코멘트를 사진당 하나의 공용 작가 전달 메모로 전환한다.
-- 기존 공용 메모가 비어 있을 때만 가장 최근 참가자 코멘트를 옮겨 수동 작성값을 보존한다.
WITH latest_comment AS (
  SELECT DISTINCT ON (project_id, photo_id)
    project_id,
    photo_id,
    left(btrim(comment), 100) AS comment
  FROM public.customer_participant_opinions
  WHERE nullif(btrim(comment), '') IS NOT NULL
  ORDER BY project_id, photo_id, updated_at DESC
)
INSERT INTO public.customer_selections (project_id, photo_id, comment)
SELECT project_id, photo_id, comment
FROM latest_comment
ON CONFLICT (project_id, photo_id) DO UPDATE
SET comment = EXCLUDED.comment,
    updated_at = now()
WHERE nullif(btrim(public.customer_selections.comment), '') IS NULL;

COMMENT ON TABLE public.customer_selections IS
  '사진당 1행 — 소유자의 최종 선택, 참가자별 찜 색상, 참여자가 함께 수정하는 작가 전달 메모를 저장.';
COMMENT ON TABLE public.customer_participant_opinions IS
  '공유 참여자의 사진별 개인 별점. comment는 공용 메모 전환 전 데이터 호환을 위해 유지하는 레거시 필드.';
