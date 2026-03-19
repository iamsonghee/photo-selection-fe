-- photographers 테이블: 작가 프로필 (auth_id = Supabase auth.uid())
CREATE TABLE IF NOT EXISTS public.photographers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid NOT NULL UNIQUE,
  email text,
  name text,
  profile_image_url text,
  bio text,
  instagram_url text,
  portfolio_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photographers_auth_id ON public.photographers(auth_id);

-- 기존 테이블에 컬럼이 없을 수 있으므로 추가 (이미 있으면 무시)
ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS profile_image_url text;
ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE public.photographers ADD COLUMN IF NOT EXISTS portfolio_url text;
