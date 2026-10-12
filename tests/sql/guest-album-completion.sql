-- Run against a disposable DB after the guest migrations. Entire test rolls back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'),('99999999-9999-4999-8999-999999999999') ON CONFLICT DO NOTHING;
INSERT INTO guest_albums(id,owner_id,name,wedding_date,upload_token) VALUES
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','테스트',current_date,'abcdefghijklmnopqrstuv');
SELECT guest_owner_action('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','date',p_date=>current_date+1);
INSERT INTO guest_submissions(id,album_id,device_hash,name) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','hash','하객');
DO $$ BEGIN
 BEGIN
  PERFORM guest_owner_action('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','date',p_date=>current_date+2);
  RAISE EXCEPTION 'expected date lock';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%guest_date_locked%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM guest_owner_action('22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999999','delete');
  RAISE EXCEPTION 'expected ownership rejection';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%guest_not_found%' THEN RAISE; END IF; END;
END $$;
UPDATE app_settings SET guest_album_max_files=1,guest_album_max_mb=1;
INSERT INTO guest_media(id,album_id,submission_id,kind,filename,content_type,size_bytes,reserved_bytes,original_key) VALUES
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','photo','test.jpg','image/jpeg',100,110,'test-key');
DO $$ BEGIN
 BEGIN
 INSERT INTO guest_media(id,album_id,submission_id,kind,filename,content_type,size_bytes,reserved_bytes,original_key)
 SELECT '55555555-5555-4555-8555-555555555555',album_id,submission_id,kind,filename,content_type,size_bytes,reserved_bytes,original_key FROM guest_media WHERE album_id='22222222-2222-4222-8222-222222222222';
 RAISE EXCEPTION 'expected count limit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%guest_file_limit%' THEN RAISE; END IF; END;
 BEGIN
 UPDATE guest_media SET preview_size_bytes=1048577,reserved_bytes=1048677 WHERE album_id='22222222-2222-4222-8222-222222222222';
 RAISE EXCEPTION 'expected byte limit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%guest_byte_limit%' THEN RAISE; END IF; END;
END $$;
UPDATE guest_media SET status='ready' WHERE album_id='22222222-2222-4222-8222-222222222222';
UPDATE guest_albums SET closed_at=now() WHERE id='22222222-2222-4222-8222-222222222222';
SELECT guest_owner_action('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','select','44444444-4444-4444-8444-444444444444',true);
SELECT guest_owner_action('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','archive');
SELECT guest_owner_action('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','archive');
DO $$ BEGIN
 IF (SELECT count(*) FROM guest_archives WHERE album_id='22222222-2222-4222-8222-222222222222')<>1 THEN RAISE EXCEPTION 'not idempotent'; END IF;
 IF NOT (SELECT selected FROM guest_media WHERE id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'selection not saved'; END IF;
 IF (SELECT count(*) FROM claim_guest_archive_part())<>1 THEN RAISE EXCEPTION 'claim failed'; END IF;
 IF (SELECT count(*) FROM claim_guest_archive_part())<>0 THEN RAISE EXCEPTION 'double claim'; END IF;
END $$;
UPDATE app_settings SET guest_device_requests_per_minute=2,guest_ip_requests_per_minute=3;
DO $$ BEGIN
 IF NOT check_guest_rate('a','ip') OR NOT check_guest_rate('a','ip') OR check_guest_rate('a','ip') OR check_guest_rate('b','ip') THEN RAISE EXCEPTION 'rate limit failed'; END IF;
END $$;
-- Expiration boundary is KST end-of-day. Only the day after retention ends expires.
INSERT INTO guest_albums(id,owner_id,name,wedding_date,upload_token) VALUES
 ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','만료',(now() AT TIME ZONE 'Asia/Seoul')::date-91,'expiredabcdefghijklmnop'),
 ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','마지막 날',(now() AT TIME ZONE 'Asia/Seoul')::date-90,'lastdayabcdefghijklmnop');
SELECT mark_guest_cleanup();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM guest_albums WHERE name='만료' AND deleting_at IS NOT NULL) THEN RAISE EXCEPTION 'expiration failed'; END IF;
 IF EXISTS(SELECT 1 FROM guest_albums WHERE name='마지막 날' AND deleting_at IS NOT NULL) THEN RAISE EXCEPTION 'expired early'; END IF;
END $$;
ROLLBACK;
