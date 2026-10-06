-- 하객 사진 모으기(1단계): 신랑신부가 만든 하객 앨범, 하객이 보낸 묶음(이름·축하 메시지), 사진·영상.
-- 하객은 로그인하지 않는다. 같은 브라우저 식별은 서버가 심는 httpOnly 쿠키의 무작위 키를 SHA-256으로
-- 해시해 guest_submissions.device_hash에 저장한다(원래 키는 DB에 남기지 않는다).
-- 파일은 브라우저가 R2에 직접 PUT한다(원본 그대로 + 브라우저가 만든 썸네일·미리보기). 키는
-- guest-albums/{album_id}/{media_id}/(original|thumb|preview). 버킷이 공개라 추측할 수 없는 UUID 키가 보호 수단이다.
-- 모든 접근은 service-role(Next API 라우트)만 한다 — RLS 켜고 정책 없음.

CREATE TABLE public.guest_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  -- 보관 기간의 기준일(KST 날짜). 업로드가 시작된 뒤에는 바꾸지 않는다(앱에서 막음 — 수정 화면은 아직 없음).
  wedding_date date NOT NULL,
  ceremony_time time,
  venue text CHECK (char_length(venue) <= 100),
  greeting text CHECK (char_length(greeting) <= 100),
  -- 하객 링크·QR의 토큰(/g/{upload_token})
  upload_token text NOT NULL UNIQUE CHECK (char_length(upload_token) >= 16),
  -- 셀렉 시작 = 하객 업로드 마감
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_albums_owner_idx ON public.guest_albums (owner_id, created_at DESC);

CREATE TABLE public.guest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.guest_albums(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  message text CHECK (char_length(message) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_submissions_device_idx ON public.guest_submissions (album_id, device_hash);

CREATE TABLE public.guest_media (
  -- 브라우저가 파일마다 만든 UUID — 재시도해도 같은 행이다.
  id uuid PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES public.guest_albums(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.guest_submissions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo', 'video')),
  filename text NOT NULL CHECK (char_length(filename) <= 255),
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  duration_seconds real,
  -- 원본 EXIF 촬영 시각(시간대 없음, customer_photos.taken_at과 같은 규칙)
  taken_at timestamp,
  original_key text NOT NULL,
  thumb_key text,
  preview_key text,
  -- pending: 업로드 주소만 받음, ready: R2에 올라간 것을 서버가 확인함. 화면에는 ready만 보인다.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_media_album_idx ON public.guest_media (album_id, status, created_at);
CREATE INDEX guest_media_submission_idx ON public.guest_media (submission_id);

ALTER TABLE public.guest_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_media ENABLE ROW LEVEL SECURITY;

-- 정책이 아직 정해지지 않은 값의 임시값(2026-10-06 사용자 확인). /admin/settings에서 바꾼다.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS guest_photo_max_mb integer NOT NULL DEFAULT 20 CHECK (guest_photo_max_mb >= 1),
  ADD COLUMN IF NOT EXISTS guest_video_max_mb integer NOT NULL DEFAULT 500 CHECK (guest_video_max_mb >= 1),
  ADD COLUMN IF NOT EXISTS guest_retention_days integer NOT NULL DEFAULT 90 CHECK (guest_retention_days >= 1);
