-- 20260919000000 마이그레이션의 share_token 기본값이 'base64url'을 썼는데, Postgres encode()는
-- base64/hex/escape만 지원해 실제 INSERT 시 "unrecognized encoding" 오류로 막혀 있었다.
-- hex로 교체 — URL-safe하고 패딩 문제도 없다.
ALTER TABLE public.customer_projects
  ALTER COLUMN share_token SET DEFAULT encode(gen_random_bytes(9), 'hex');
