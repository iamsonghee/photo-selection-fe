-- 셀프 고객 계정 전체 사진 한도(2,000장)에서 관리자는 제외한다(무제한).
-- 관리자 목록은 BE app/beta_policy.py, FE src/lib/admin-emails.ts의 ADMIN_EMAILS와 같아야 한다.
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

    IF v_photo_count > 2000 THEN
      RAISE EXCEPTION 'customer account photo limit exceeded'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
