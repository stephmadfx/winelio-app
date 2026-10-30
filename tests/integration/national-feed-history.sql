-- Continues only inside the disposable cluster from national-feed.cjs.
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);
ALTER TABLE winelio.recommendations ADD COLUMN created_at timestamptz DEFAULT now();
INSERT INTO winelio.profiles(id,first_name,last_name,created_at)
 SELECT md5('history-'||i)::uuid,'Historique','Privé',now()-interval '10 days' FROM generate_series(1,10) i;
INSERT INTO auth.users SELECT id,now() FROM winelio.profiles;
UPDATE auth.users SET email_confirmed_at=NULL WHERE id=md5('history-7')::uuid;
UPDATE winelio.profiles SET is_demo=true WHERE id=md5('history-8')::uuid;
UPDATE winelio.profiles SET created_at=now()-interval '40 days' WHERE id=md5('history-9')::uuid;
UPDATE winelio.profiles SET created_at=now() WHERE id=md5('history-10')::uuid;
INSERT INTO winelio.recommendations(id,referrer_id) VALUES(md5('history-reco')::uuid,md5('history-1')::uuid);
\ir ../../supabase/migrations/20261030c_feed_history_summaries.sql
SELECT check_test((SELECT count(*)=1 FROM winelio.feed_network_summaries),'backfill suppresses sparse recommendation cohort');
SELECT check_test((SELECT event_count=6 FROM winelio.feed_network_summaries),'backfill excludes demo, unconfirmed, old and current-day members');
SELECT set_config('test.uid',md5('history-1')::uuid::text,false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='network_summary'),'history waits for compatible frontend deployment');
UPDATE winelio.feed_network_summaries SET is_published=true;
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='network_summary'),'history visible to active Winelio members without naming anyone');
SELECT check_test((SELECT display_name NOT LIKE '%Privé%' AND display_name NOT LIKE '%Historique%' AND amount IS NULL FROM winelio.get_national_feed()),'summary never exposes identities or gains');
SELECT check_test((SELECT occurred_at<date_trunc('day',now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris' FROM winelio.get_national_feed()),'history keeps its original period end');
SELECT winelio.set_feed_preferences(false,false,1);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_network_digest()),'historical backfill does not generate a new-activity reminder');
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM winelio.feed_network_summaries; RAISE EXCEPTION 'Raw summary table exposed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS summary storage denied'; END;
END $$;
RESET ROLE;
SELECT set_config('test.uid',md5('outside-project')::uuid::text,false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'shared Auth accounts cannot read historical summary');
SELECT set_config('test.uid',md5('history-1')::uuid::text,false);
SELECT winelio.set_feed_preferences(true,false,1);
INSERT INTO winelio.recommendations(id,referrer_id) VALUES(md5('history-new-reco')::uuid,md5('history-1')::uuid);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_network_digest()),'new real activity still triggers the daily digest');
SELECT check_test((SELECT count(*)=2 FROM winelio.get_national_feed()),'historical summary and opted-in real activity coexist');
UPDATE winelio.feed_network_summaries SET occurred_at=now()-interval '31 days';
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='network_summary'),'expired history is hidden');
SELECT winelio.cleanup_feed_events();
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_network_summaries),'retention purges expired summary');
DELETE FROM winelio.recommendations;
DELETE FROM winelio.profiles;
DELETE FROM auth.users;
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_preferences),'history test cleanup removes account preferences');
