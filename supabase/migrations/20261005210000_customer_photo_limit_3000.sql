-- 셀프 고객 계정 전체 사진 한도를 5,000장에서 3,000장으로 내린다(테스트 단계 — Nano DB 메모리 여유 부족, 2026-10-05).
-- BE MAX_PHOTOS_PER_CUSTOMER_ACCOUNT, FE CUSTOMER_PHOTO_LIMIT과 같아야 한다. 20261005200000_customer_photo_limit_5000.sql에서 숫자만 바꿨다.
CREATE OR REPLACE FUNCTION public.enforce_customer_account_photo_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_photo_count bigint;
BEGIN
  FOR v_owner_id IN
    SELECT DISTINCT project.owner_id
    FROM inserted_customer_photos inserted
    JOIN public.customer_projects project ON project.id = inserted.project_id
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = v_owner_id
        AND u.email = ANY (ARRAY['realsong88@gmail.com', 'hilee6461@gmail.com', 'ych2174@gmail.com'])
    );

    SELECT count(*) INTO v_photo_count
    FROM public.customer_photos photo
    JOIN public.customer_projects project ON project.id = photo.project_id
    WHERE project.owner_id = v_owner_id;

    IF v_photo_count > 3000 THEN
      RAISE EXCEPTION 'customer account photo limit exceeded'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
