-- 프로젝트를 삭제하면 사진, 코멘트, 고객 개인정보(customer_name/customer_phone/location/
-- access_pin/access_token)까지 전부 CASCADE로 사라진다 (20250228_projects_cascade.sql).
-- 개인정보는 계속 완전히 지워야 하지만, 그 때문에 촬영 유형별 이용량/셀렉 완료율/사진 수/
-- 보정 요청 수 같은 서비스 통계까지 영구히 잃는 부작용이 있었다. 이 테이블은 프로젝트가
-- 지워지기 직전, 비식별 요약 수치만 별도로 보존한다. projects 테이블 자체를 soft delete로
-- 바꾸지 않고, 삭제 직전 한 번 스냅샷을 남기는 방식을 택했다.
-- photographer_id는 개인정보가 아니라 작가 계정 식별자이며, 등급/작가별 통계 집계에 필요해
-- 남긴다. created_by_type은 향후 고객 직접 셀렉 프로젝트(작가 없이 생성)까지 같은 파이프라인
-- 으로 분석하기 위한 자리로, 현재는 'photographer'만 쓰인다.
CREATE TABLE IF NOT EXISTS public.project_deletion_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id UUID NOT NULL UNIQUE,
  photographer_id UUID REFERENCES public.photographers(id) ON DELETE SET NULL,
  created_by_type TEXT NOT NULL DEFAULT 'photographer'
    CHECK (created_by_type IN ('photographer', 'customer_direct')),
  shoot_type TEXT,
  status_at_deletion TEXT,
  include_original BOOLEAN,
  photo_count INTEGER NOT NULL DEFAULT 0,
  required_count INTEGER,
  selected_count INTEGER NOT NULL DEFAULT 0,
  revision_requested_count INTEGER NOT NULL DEFAULT 0,
  project_created_at TIMESTAMPTZ,
  shoot_date DATE,
  deadline DATE,
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_deletion_summaries IS
  '삭제되는 프로젝트의 비식별 통계 스냅샷. 사진/코멘트/고객 개인정보는 포함하지 않는다.';
COMMENT ON COLUMN public.project_deletion_summaries.photographer_id IS
  '작가 계정 id. 개인정보 아님(고객 정보 아님). 작가 탈퇴/삭제 시 SET NULL.';
COMMENT ON COLUMN public.project_deletion_summaries.created_by_type IS
  '향후 고객 직접 셀렉 프로젝트를 같은 통계 파이프라인에 포함하기 위한 자리. 현재는 photographer만 사용.';
COMMENT ON COLUMN public.project_deletion_summaries.selected_count IS
  'selections.is_selected = true 인 행 수 (삭제 시점 스냅샷).';
COMMENT ON COLUMN public.project_deletion_summaries.revision_requested_count IS
  '프로젝트 전체 기간 동안 보정 재요청이 발생한 총 횟수. 삭제 시점에 살아있는 version_reviews와,
   재업로드로 이미 photo_version_revisions에 보관된 과거 요청 이력을 합산한 값.';

-- 서버(service role)만 읽고 쓴다. 정책 없음 = service_role만 접근 가능.
ALTER TABLE public.project_deletion_summaries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_deletion_summaries FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.project_deletion_summaries TO service_role;


CREATE OR REPLACE FUNCTION public.record_project_deletion_summary(p_project_id UUID)
RETURNS public.project_deletion_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saved public.project_deletion_summaries%ROWTYPE;
BEGIN
  INSERT INTO public.project_deletion_summaries (
    source_project_id,
    photographer_id,
    created_by_type,
    shoot_type,
    status_at_deletion,
    include_original,
    photo_count,
    required_count,
    selected_count,
    revision_requested_count,
    project_created_at,
    shoot_date,
    deadline,
    confirmed_at,
    delivered_at
  )
  SELECT
    pr.id,
    pr.photographer_id,
    'photographer',
    pr.shoot_type,
    pr.status::text,
    pr.include_original,
    pr.photo_count,
    pr.required_count,
    (SELECT count(*) FROM public.selections s
       WHERE s.project_id = pr.id AND s.is_selected = true),
    (SELECT count(*) FROM public.version_reviews vr
       JOIN public.photo_versions pv ON pv.id = vr.photo_version_id
       JOIN public.photos p ON p.id = pv.photo_id
       WHERE p.project_id = pr.id AND vr.status = 'revision_requested')
    +
    (SELECT count(*) FROM public.photo_version_revisions pvr
       JOIN public.photos p ON p.id = pvr.photo_id
       WHERE p.project_id = pr.id AND pvr.review_status = 'revision_requested'),
    pr.created_at,
    pr.shoot_date,
    pr.deadline,
    pr.confirmed_at,
    pr.delivered_at
  FROM public.projects pr
  WHERE pr.id = p_project_id
  ON CONFLICT (source_project_id) DO NOTHING
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

COMMENT ON FUNCTION public.record_project_deletion_summary(UUID) IS
  '프로젝트 삭제 직전, 비식별 통계를 project_deletion_summaries에 원자적으로 기록한다. 재시도해도 안전(idempotent).';

REVOKE ALL ON FUNCTION public.record_project_deletion_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_project_deletion_summary(UUID) TO service_role;
