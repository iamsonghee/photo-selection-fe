-- Apply manually before deploying FE + BE. No client role may call lifecycle RPCs.
ALTER TABLE public.app_settings
 ADD COLUMN guest_album_max_files integer NOT NULL DEFAULT 5000 CHECK (guest_album_max_files > 0),
 ADD COLUMN guest_album_max_mb integer NOT NULL DEFAULT 20480 CHECK (guest_album_max_mb > 0),
 ADD COLUMN guest_device_requests_per_minute integer NOT NULL DEFAULT 120 CHECK (guest_device_requests_per_minute > 0),
 ADD COLUMN guest_ip_requests_per_minute integer NOT NULL DEFAULT 1200 CHECK (guest_ip_requests_per_minute > 0),
 ADD COLUMN guest_pending_hours integer NOT NULL DEFAULT 24 CHECK (guest_pending_hours >= 2),
 ADD COLUMN guest_archive_part_mb integer NOT NULL DEFAULT 1024 CHECK (guest_archive_part_mb > 0);
ALTER TABLE public.guest_albums ADD COLUMN upload_started_at timestamptz, ADD COLUMN deleting_at timestamptz;
UPDATE public.guest_albums a SET upload_started_at = (SELECT min(created_at) FROM public.guest_submissions s WHERE s.album_id=a.id);
ALTER TABLE public.guest_media ADD COLUMN selected boolean NOT NULL DEFAULT false,
 ADD COLUMN thumb_size_bytes bigint NOT NULL DEFAULT 0 CHECK (thumb_size_bytes >= 0),
 ADD COLUMN preview_size_bytes bigint NOT NULL DEFAULT 0 CHECK (preview_size_bytes >= 0),
 ADD COLUMN reserved_bytes bigint, ADD COLUMN last_presigned_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN cleanup_at timestamptz;
-- Existing derivative sizes were not recorded; reserve their signed maximum conservatively.
UPDATE public.guest_media SET thumb_size_bytes=CASE WHEN thumb_key IS NULL THEN 0 ELSE 5242880 END,
 preview_size_bytes=CASE WHEN preview_key IS NULL THEN 0 ELSE 5242880 END;
UPDATE public.guest_media SET reserved_bytes=size_bytes+thumb_size_bytes+preview_size_bytes;
ALTER TABLE public.guest_media ALTER COLUMN reserved_bytes SET NOT NULL;
ALTER TABLE public.guest_media ADD CONSTRAINT guest_reserved_bytes CHECK (reserved_bytes >= size_bytes);

CREATE FUNCTION public.guard_guest_album() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.wedding_date IS DISTINCT FROM OLD.wedding_date AND OLD.upload_started_at IS NOT NULL THEN
  RAISE EXCEPTION 'guest_date_locked';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_guest_album BEFORE UPDATE ON public.guest_albums FOR EACH ROW EXECUTE FUNCTION public.guard_guest_album();

CREATE FUNCTION public.guard_guest_upload() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a guest_albums; s app_settings; n bigint; b bigint;
BEGIN
 SELECT * INTO a FROM guest_albums WHERE id=NEW.album_id FOR UPDATE;
 SELECT * INTO STRICT s FROM app_settings WHERE id=1;
 IF a.id IS NULL OR a.deleting_at IS NOT NULL OR (now() AT TIME ZONE 'Asia/Seoul')::date > a.wedding_date+s.guest_retention_days THEN
  RAISE EXCEPTION 'guest_expired';
 END IF;
 IF TG_TABLE_NAME='guest_submissions' THEN
  IF a.closed_at IS NOT NULL THEN RAISE EXCEPTION 'guest_closed'; END IF;
  UPDATE guest_albums SET upload_started_at=coalesce(upload_started_at, now()) WHERE id=a.id;
 ELSE
  IF TG_OP='UPDATE' THEN
   IF NEW.album_id<>OLD.album_id OR NEW.submission_id<>OLD.submission_id THEN RAISE EXCEPTION 'guest_invalid'; END IF;
   IF NEW.size_bytes<>OLD.size_bytes OR NEW.content_type<>OLD.content_type OR NEW.kind<>OLD.kind THEN RAISE EXCEPTION 'guest_invalid'; END IF;
   NEW.thumb_size_bytes:=greatest(NEW.thumb_size_bytes,OLD.thumb_size_bytes);
   NEW.preview_size_bytes:=greatest(NEW.preview_size_bytes,OLD.preview_size_bytes);
   IF OLD.cleanup_at IS NOT NULL THEN RAISE EXCEPTION 'guest_expired'; END IF;
   -- A retry cannot turn a completed upload back into pending.
   IF OLD.status='ready' AND NEW.status='pending' THEN RAISE EXCEPTION 'guest_invalid'; END IF;
  END IF;
  NEW.reserved_bytes:=NEW.size_bytes+NEW.thumb_size_bytes+NEW.preview_size_bytes;
  IF NEW.status='pending' OR (TG_OP='UPDATE' AND OLD.status='pending') THEN
   IF a.closed_at IS NOT NULL THEN RAISE EXCEPTION 'guest_closed'; END IF;
   IF NOT EXISTS (SELECT 1 FROM guest_submissions WHERE id=NEW.submission_id AND album_id=a.id) THEN RAISE EXCEPTION 'guest_invalid'; END IF;
   IF TG_OP='INSERT' OR NEW.reserved_bytes>OLD.reserved_bytes THEN
   SELECT count(*),coalesce(sum(reserved_bytes),0) INTO n,b FROM guest_media WHERE album_id=a.id AND id<>NEW.id;
   IF n+1>s.guest_album_max_files THEN RAISE EXCEPTION 'guest_file_limit'; END IF;
   IF b+NEW.reserved_bytes>s.guest_album_max_mb::bigint*1048576 THEN RAISE EXCEPTION 'guest_byte_limit'; END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_guest_submission BEFORE INSERT ON public.guest_submissions FOR EACH ROW EXECUTE FUNCTION public.guard_guest_upload();
CREATE TRIGGER guard_guest_media BEFORE INSERT OR UPDATE OF status, reserved_bytes ON public.guest_media FOR EACH ROW EXECUTE FUNCTION public.guard_guest_upload();

CREATE TABLE public.guest_rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, requests integer NOT NULL);
ALTER TABLE public.guest_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.check_guest_rate(p_device text, p_ip text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s app_settings; n integer; k text; lim integer;
BEGIN
 SELECT * INTO STRICT s FROM app_settings WHERE id=1;
 FOREACH k IN ARRAY ARRAY['ip:'||p_ip,'device:'||p_device] LOOP
  lim := CASE WHEN k LIKE 'ip:%' THEN s.guest_ip_requests_per_minute ELSE s.guest_device_requests_per_minute END;
  INSERT INTO guest_rate_limits VALUES(k,date_trunc('minute',now()),1)
  ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,
   requests=CASE WHEN guest_rate_limits.window_start=excluded.window_start THEN least(guest_rate_limits.requests,2147483646)+1 ELSE 1 END
  RETURNING requests INTO n;
  IF n>lim THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE TABLE public.guest_archives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), album_id uuid NOT NULL REFERENCES guest_albums(id) ON DELETE CASCADE,
 selection_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(album_id,selection_hash)
);
CREATE TABLE public.guest_archive_parts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), archive_id uuid NOT NULL REFERENCES guest_archives(id) ON DELETE CASCADE,
 part_number integer NOT NULL, manifest jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','failed')),
 processed_bytes bigint NOT NULL DEFAULT 0, total_bytes bigint NOT NULL,
 object_key text, error text, lease_token uuid, lease_until timestamptz, UNIQUE(archive_id,part_number)
);
ALTER TABLE public.guest_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_archive_parts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.guest_owner_action(p_album uuid, p_owner uuid, p_action text, p_media uuid DEFAULT NULL, p_selected boolean DEFAULT NULL, p_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a guest_albums; s app_settings; job uuid; h text; m guest_media; items jsonb := '[]'; bytes bigint := 0; part integer := 1;
BEGIN
 SELECT * INTO a FROM guest_albums WHERE id=p_album AND owner_id=p_owner FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'guest_not_found'; END IF;
 SELECT * INTO STRICT s FROM app_settings WHERE id=1;
 IF p_action='delete' THEN
  UPDATE guest_albums SET deleting_at=coalesce(deleting_at,now()),closed_at=coalesce(closed_at,now()) WHERE id=a.id;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF a.deleting_at IS NOT NULL OR (now() AT TIME ZONE 'Asia/Seoul')::date > a.wedding_date+s.guest_retention_days THEN RAISE EXCEPTION 'guest_expired'; END IF;
 IF p_action='date' THEN
  IF p_date IS NULL THEN RAISE EXCEPTION 'guest_invalid'; END IF;
  UPDATE guest_albums SET wedding_date=p_date WHERE id=a.id;
 ELSIF p_action='select' THEN
  IF a.closed_at IS NULL OR p_selected IS NULL THEN RAISE EXCEPTION 'guest_invalid'; END IF;
  UPDATE guest_media SET selected=p_selected WHERE id=p_media AND album_id=a.id AND status='ready' AND cleanup_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'guest_not_found'; END IF;
 ELSIF p_action='archive' THEN
  IF a.closed_at IS NULL THEN RAISE EXCEPTION 'guest_invalid'; END IF;
  SELECT md5(string_agg(id::text,',' ORDER BY id)) INTO h FROM guest_media WHERE album_id=a.id AND selected AND status='ready' AND cleanup_at IS NULL;
  IF h IS NULL THEN RAISE EXCEPTION 'guest_empty_selection'; END IF;
  SELECT id INTO job FROM guest_archives WHERE album_id=a.id AND selection_hash=h;
  IF job IS NOT NULL THEN
   UPDATE guest_archive_parts SET status='pending',error=NULL WHERE archive_id=job AND status='failed';
   RETURN jsonb_build_object('archiveId',job);
  END IF;
  INSERT INTO guest_archives(album_id,selection_hash) VALUES(a.id,h) RETURNING id INTO job;
  FOR m IN SELECT * FROM guest_media WHERE album_id=a.id AND selected AND status='ready' AND cleanup_at IS NULL ORDER BY id LOOP
   IF bytes>0 AND bytes+m.size_bytes>s.guest_archive_part_mb::bigint*1048576 THEN
    INSERT INTO guest_archive_parts(archive_id,part_number,manifest,total_bytes) VALUES(job,part,items,bytes);
    part:=part+1; items:='[]'; bytes:=0;
   END IF;
   items:=items||jsonb_build_array(jsonb_build_object('id',m.id,'key',m.original_key,'filename',m.filename,'size',m.size_bytes,'is_original',m.is_original));
   bytes:=bytes+m.size_bytes;
  END LOOP;
  INSERT INTO guest_archive_parts(archive_id,part_number,manifest,total_bytes) VALUES(job,part,items,bytes);
  RETURN jsonb_build_object('archiveId',job);
 ELSE RAISE EXCEPTION 'guest_invalid';
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.claim_guest_archive_part() RETURNS SETOF guest_archive_parts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked uuid;
BEGIN
 SELECT p.id INTO picked FROM guest_archive_parts p JOIN guest_archives j ON j.id=p.archive_id JOIN guest_albums a ON a.id=j.album_id
 CROSS JOIN app_settings s WHERE s.id=1 AND a.deleting_at IS NULL
 AND (now() AT TIME ZONE 'Asia/Seoul')::date<=a.wedding_date+s.guest_retention_days
 AND (p.status='pending' OR (p.status='processing' AND p.lease_until<now()))
 ORDER BY j.created_at,p.part_number FOR UPDATE OF p SKIP LOCKED LIMIT 1;
 RETURN QUERY UPDATE guest_archive_parts SET status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',processed_bytes=0
 WHERE id=picked RETURNING *;
END $$;

-- Mark first; the worker deletes bytes before deleting rows. URL expiry is a safety grace, not a user policy.
CREATE FUNCTION public.mark_guest_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE guest_albums a SET deleting_at=now(),closed_at=coalesce(closed_at,now()) FROM app_settings s
 WHERE s.id=1 AND a.deleting_at IS NULL AND (now() AT TIME ZONE 'Asia/Seoul')::date>a.wedding_date+s.guest_retention_days;
 UPDATE guest_media m SET cleanup_at=now() FROM app_settings s WHERE s.id=1 AND m.status='pending' AND m.cleanup_at IS NULL
 AND m.last_presigned_at<now()-make_interval(hours=>s.guest_pending_hours);
 DELETE FROM guest_rate_limits WHERE window_start<now()-interval '1 day';
END $$;
REVOKE ALL ON FUNCTION public.check_guest_rate(text,text), public.guest_owner_action(uuid,uuid,text,uuid,boolean,date), public.claim_guest_archive_part(), public.mark_guest_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_guest_rate(text,text), public.guest_owner_action(uuid,uuid,text,uuid,boolean,date), public.claim_guest_archive_part(), public.mark_guest_cleanup() TO service_role;
