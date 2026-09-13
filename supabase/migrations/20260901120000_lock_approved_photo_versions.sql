-- 이미 적용된 replace_photo_versions_with_history도 고객 확정 보정본을 교체하지 못하게 한다.
-- 현재 photo_versions 행을 먼저 잠가, 검토 제출과 교체가 동시에 실행되는 경우에도
-- approved 검토가 기록된 뒤 파일이 교체되는 경쟁 조건을 차단한다.

ALTER FUNCTION public.replace_photo_versions_with_history(JSONB)
  RENAME TO replace_photo_versions_with_history_unlocked;

CREATE OR REPLACE FUNCTION public.replace_photo_versions_with_history(p_rows JSONB)
RETURNS SETOF public.photo_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_rows IS NULL
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'photo version rows are required' USING ERRCODE = '22023';
  END IF;

  -- 현재 버전 행을 고정된 순서로 잠근다. version_reviews의 FK 검증도 이 잠금과
  -- 직렬화되므로 아래 approved 확인과 실제 교체 사이에 새 확정이 끼어들 수 없다.
  PERFORM 1
  FROM public.photo_versions pv
  JOIN jsonb_array_elements(p_rows) AS requested(value)
    ON pv.photo_id = NULLIF(requested.value->>'photo_id', '')::UUID
   AND pv.version = NULLIF(requested.value->>'version', '')::SMALLINT
  ORDER BY pv.photo_id, pv.version
  FOR UPDATE OF pv;

  IF EXISTS (
    SELECT 1
    FROM public.photo_versions pv
    JOIN jsonb_array_elements(p_rows) AS requested(value)
      ON pv.photo_id = NULLIF(requested.value->>'photo_id', '')::UUID
     AND pv.version = NULLIF(requested.value->>'version', '')::SMALLINT
    JOIN public.version_reviews vr
      ON vr.photo_version_id = pv.id
    WHERE vr.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved photo versions cannot be replaced' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.replace_photo_versions_with_history_unlocked(p_rows);
END;
$$;

COMMENT ON FUNCTION public.replace_photo_versions_with_history(JSONB) IS
  'Locks current versions, rejects approved reviews, then atomically archives and replaces mutable V1/V2 files.';

REVOKE ALL ON FUNCTION public.replace_photo_versions_with_history_unlocked(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_photo_versions_with_history_unlocked(JSONB) FROM service_role;
REVOKE ALL ON FUNCTION public.replace_photo_versions_with_history(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_photo_versions_with_history(JSONB) TO service_role;
