-- Isolated fixture database only. No production connection, account or notification.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA winelio;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,winelio TO authenticated,anon;
CREATE TABLE winelio.profiles(id uuid PRIMARY KEY,first_name text,last_name text,sponsor_id uuid,is_demo boolean DEFAULT false,is_active boolean DEFAULT true,onboarding_status text DEFAULT 'active',created_at timestamptz DEFAULT now());
CREATE TABLE winelio.recommendations(id uuid PRIMARY KEY,referrer_id uuid,is_demo boolean DEFAULT false);
CREATE TABLE winelio.commission_transactions(id uuid PRIMARY KEY,user_id uuid,recommendation_id uuid,amount numeric,type text,status text,is_demo boolean DEFAULT false,earned_at timestamptz);
\ir ../../supabase/migrations/20261030_national_activity_feed.sql
\ir ../../supabase/migrations/20261030b_feed_member_access.sql
\ir ../../supabase/migrations/20261030b_feed_member_access.sql
CREATE FUNCTION public.check_test(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
INSERT INTO winelio.profiles(id,first_name,last_name) VALUES
 ('10000000-0000-0000-0000-000000000001','Julie','Martin'),
 ('10000000-0000-0000-0000-000000000002','Thierry','Curie');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'no publication without consent');
SELECT winelio.set_feed_preferences(true,false,1);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed()),'new member opt-in publishes arrival');
SELECT check_test((SELECT display_name='Julie M.' FROM winelio.get_national_feed()),'first name and initial only');
SELECT winelio.set_feed_preferences(true,false,1);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed()),'repeated consent does not duplicate');
INSERT INTO winelio.profiles(id,first_name,last_name,sponsor_id) VALUES('10000000-0000-0000-0000-000000000003','Secret','Client','10000000-0000-0000-0000-000000000001');
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='member_sponsored' AND display_name='Julie M.'),'sponsoring publishes only sponsor identity');
INSERT INTO winelio.recommendations VALUES('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='recommendation_created' AND amount IS NULL),'recommendation has no dossier amount');
INSERT INTO winelio.commission_transactions VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',300.25,'recommendation','PENDING',false,null);
SELECT winelio.set_feed_preferences(true,true,2);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='gain_credited'),'pending money never published');
UPDATE winelio.commission_transactions SET status='EARNED',earned_at=now() WHERE id='30000000-0000-0000-0000-000000000001';
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='gain_credited' AND amount=300.25),'only credited actual amount');
UPDATE winelio.commission_transactions SET earned_at=now();
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='gain_credited'),'earned update idempotent');
UPDATE winelio.commission_transactions SET status='CANCELLED';
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='gain_credited'),'cancelled credit withdrawn');
UPDATE winelio.commission_transactions SET status='EARNED';
SELECT winelio.set_feed_preferences(true,false,0);
SELECT winelio.set_feed_preferences(true,true,1);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='gain_credited'),'re-consent never restores old gains');
-- Daily digest is generated only for new real network activity, never per event.
SELECT winelio.set_feed_preferences(true,true,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_network_digest()),'digest disabled by default/choice');
SELECT winelio.set_feed_preferences(true,true,1);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_network_digest()),'one grouped daily in-app summary');
SELECT check_test((SELECT count(*)=1 FROM winelio.get_network_digest()),'refresh returns same summary');
SELECT check_test((SELECT count(*)=1 FROM winelio.feed_digest_receipts),'one receipt despite repeated load');
SELECT winelio.dismiss_network_digest((SELECT id FROM winelio.get_network_digest()));
SELECT check_test((SELECT count(*)=0 FROM winelio.get_network_digest()),'dismiss survives reload');
SELECT check_test((SELECT count(*)=1 FROM winelio.feed_digest_receipts),'dismiss never generates another same-day summary');
-- Fill both slots to exercise the hard two-per-day limit, including preference changes.
INSERT INTO winelio.feed_digest_receipts(user_id,digest_day,slot,dismissed_at)
SELECT '10000000-0000-0000-0000-000000000001',(now() AT TIME ZONE 'Europe/Paris')::date,1,now() ON CONFLICT DO NOTHING;
SELECT winelio.set_feed_preferences(true,true,2);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_network_digest()),'never a third summary on frequency change');
SELECT winelio.set_feed_preferences(true,true,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_network_digest()),'disabling summaries hides existing reminder');
SELECT winelio.set_feed_preferences(false,false,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'withdrawal removes all own publications');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false);
SELECT winelio.set_feed_preferences(true,true,1);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed()),'any member sees national activity independent of sponsor tree');
SELECT set_config('test.uid','90000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'shared auth account without Winelio membership cannot read feed');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false);
UPDATE winelio.profiles SET is_active=false WHERE id='10000000-0000-0000-0000-000000000002';
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'inactive Winelio viewer cannot read feed');
UPDATE winelio.profiles SET is_active=true WHERE id='10000000-0000-0000-0000-000000000002';
SELECT set_config('test.uid','90000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'shared auth account without Winelio membership cannot read feed');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false);
UPDATE winelio.profiles SET is_active=false WHERE id='10000000-0000-0000-0000-000000000002';
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'inactive Winelio viewer cannot read feed');
UPDATE winelio.profiles SET is_active=true WHERE id='10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT check_test((SELECT count(*)=1 FROM winelio.feed_preferences),'RLS sees only own preferences');
DO $$ BEGIN
  BEGIN PERFORM * FROM winelio.feed_events; RAISE EXCEPTION 'Raw source IDs readable'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: raw events forbidden'; END;
  BEGIN PERFORM winelio.set_feed_preferences(false,true,3); RAISE EXCEPTION 'Invalid input allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Invalid preferences' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('test.uid','',false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'anonymous projection empty');
SELECT check_test(NOT has_function_privilege('anon','winelio.get_national_feed(integer)','EXECUTE'),'anonymous RPC forbidden');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false);
UPDATE winelio.profiles SET is_demo=true WHERE id='10000000-0000-0000-0000-000000000002';
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'demo profiles excluded');
UPDATE winelio.profiles SET is_demo=false;
UPDATE winelio.feed_events SET occurred_at=now()-interval '31 days';
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'30-day visibility limit');
SELECT check_test(winelio.cleanup_feed_events()>0,'retention maintenance purges old rows');
DELETE FROM winelio.profiles;
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events),'account deletion purges events');
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_preferences),'account deletion purges preferences');
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_consent_history),'account deletion purges consent history');
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_digest_receipts),'account deletion purges digest receipts');
