-- projects 삭제 시 photos, selections, project_logs 자동 삭제
-- project_logs: 이미 20250228_project_logs.sql 에서 ON DELETE CASCADE 적용됨.
-- photos, selections: project_id FK를 ON DELETE CASCADE 로 설정.

-- 제약 이름이 다르면 에러가 날 수 있음. 확인: 
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.photos'::regclass AND contype = 'f';

-- photos
ALTER TABLE public.photos
  DROP CONSTRAINT IF EXISTS photos_project_id_fkey;
ALTER TABLE public.photos
  ADD CONSTRAINT photos_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- selections
ALTER TABLE public.selections
  DROP CONSTRAINT IF EXISTS selections_project_id_fkey;
ALTER TABLE public.selections
  ADD CONSTRAINT selections_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
