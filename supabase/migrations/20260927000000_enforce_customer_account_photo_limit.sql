-- 셀프 고객 원본은 프로젝트별이 아니라 소유자 전체 합산 2,000장으로 제한한다.
-- 같은 소유자의 동시 업로드를 직렬화한 뒤, 배치 INSERT가 끝난 시점의 실제 행 수를 검사한다.
CREATE OR REPLACE FUNCTION public.lock_customer_photo_owner_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.customer_projects
  WHERE id = NEW.project_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'customer project owner not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_id::text, 0));
  RETURN NEW;
END;
$$;

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

DROP TRIGGER IF EXISTS customer_photos_lock_owner_quota ON public.customer_photos;
CREATE TRIGGER customer_photos_lock_owner_quota
BEFORE INSERT ON public.customer_photos
FOR EACH ROW EXECUTE FUNCTION public.lock_customer_photo_owner_quota();

DROP TRIGGER IF EXISTS customer_photos_enforce_account_limit ON public.customer_photos;
CREATE TRIGGER customer_photos_enforce_account_limit
AFTER INSERT ON public.customer_photos
REFERENCING NEW TABLE AS inserted_customer_photos
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_customer_account_photo_limit();
