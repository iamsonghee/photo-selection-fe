-- 별점을 사용하던 프로젝트는 마지막 별점을 지운 뒤에도 기존 UI를 유지한다.
ALTER TABLE public.projects ADD COLUMN selection_uses_ratings boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.keep_project_selection_ratings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.rating BETWEEN 1 AND 5
    AND (TG_OP = 'INSERT' OR OLD.rating IS DISTINCT FROM NEW.rating) THEN
    UPDATE public.projects SET selection_uses_ratings = true
    WHERE id = NEW.project_id AND NOT selection_uses_ratings;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER keep_project_selection_ratings
AFTER INSERT OR UPDATE OF rating ON public.selections
FOR EACH ROW EXECUTE FUNCTION public.keep_project_selection_ratings();

UPDATE public.projects p SET selection_uses_ratings = true
WHERE EXISTS (SELECT 1 FROM public.selections s WHERE s.project_id = p.id AND s.rating BETWEEN 1 AND 5);

ALTER TABLE public.project_participants
  ADD COLUMN done boolean NOT NULL DEFAULT false,
  ADD COLUMN last_seen_at timestamptz;

-- 이름 없이 찜하던 색도 예약해 신규 참여자가 기존 후보를 가져가지 않게 한다.
INSERT INTO public.project_participants (project_id, color)
SELECT DISTINCT s.project_id, tag.color
FROM public.selections s CROSS JOIN LATERAL unnest(s.color_tags) AS tag(color)
WHERE tag.color IN ('red', 'yellow', 'green', 'blue', 'purple')
ON CONFLICT (project_id, color) DO NOTHING;

-- 선택 토글과 같은 프로젝트 행 잠금을 사용한다. 확정과 후보 보존은 한 트랜잭션이다.
CREATE FUNCTION public.confirm_customer_selection(p_project_id uuid, p_photo_ids uuid[])
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND OR v_project.status <> 'selecting' THEN RETURN 'invalid_project_state'; END IF;
  IF p_photo_ids IS NULL OR cardinality(p_photo_ids) <> v_project.required_count
    OR cardinality(p_photo_ids) = 0
    OR (SELECT count(DISTINCT id) FROM unnest(p_photo_ids) AS t(id)) <> cardinality(p_photo_ids)
    OR EXISTS (
      SELECT 1 FROM unnest(p_photo_ids) AS t(id)
      LEFT JOIN public.photos p ON p.id = t.id AND p.project_id = p_project_id
      WHERE p.id IS NULL
    ) THEN RETURN 'invalid_photos'; END IF;

  UPDATE public.selections SET is_selected = false
  WHERE project_id = p_project_id AND is_selected AND NOT (photo_id = ANY(p_photo_ids));
  INSERT INTO public.selections (project_id, photo_id, is_selected)
  SELECT p_project_id, id, true FROM unnest(p_photo_ids) AS t(id)
  ON CONFLICT (project_id, photo_id) DO UPDATE SET is_selected = true;

  UPDATE public.projects SET status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = p_project_id;
  INSERT INTO public.project_logs (project_id, photographer_id, action)
  VALUES (p_project_id, v_project.photographer_id, 'confirmed');
  RETURN 'saved';
END;
$$;
REVOKE ALL ON FUNCTION public.keep_project_selection_ratings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_customer_selection(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_customer_selection(uuid, uuid[]) TO service_role;
