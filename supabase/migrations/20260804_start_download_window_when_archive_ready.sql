-- 고객 링크를 ZIP 준비와 분리한다. selecting 상태에서 ZIP이 나중에 완료되면,
-- 그 완료 시점부터만 30일 납품 원본 다운로드 기한을 계산한다.

CREATE OR REPLACE FUNCTION public.complete_archive_part(
    p_part_id UUID,
    p_project_id UUID,
    p_completed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.original_archive_parts
    SET status = 'completed', completed_at = p_completed_at
    WHERE id = p_part_id;

    IF NOT EXISTS (
        SELECT 1 FROM public.original_archive_parts
        WHERE project_id = p_project_id AND status <> 'completed'
    ) THEN
        UPDATE public.projects
        SET original_archive_status = 'ready',
            original_archive_processing_started_at = NULL,
            original_download_started_at = CASE
                WHEN status = 'selecting' AND original_download_started_at IS NULL THEN p_completed_at
                ELSE original_download_started_at
            END
        WHERE id = p_project_id AND original_archive_status = 'processing';
    END IF;
END;
$$;
