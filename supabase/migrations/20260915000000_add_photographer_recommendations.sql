ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS is_photographer_recommended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.photos.is_photographer_recommended IS
  'True when the photographer recommends this photo to the customer before selection confirmation.';
