-- Migration-stage regression test in the disposable cluster.
INSERT INTO winelio.profiles(id,first_name,last_name,created_at) VALUES
 (md5('names-visible')::uuid,'  Julie  ','  martin  ',now()-interval '14 days'),
 (md5('names-hidden')::uuid,'Thierry','Confidentiel',now()-interval '14 days'),
 (md5('names-incomplete')::uuid,'','FamillePrivée',now()-interval '14 days');
INSERT INTO auth.users SELECT id,now() FROM winelio.profiles;
INSERT INTO winelio.feed_preferences(user_id,share_activity,share_gains) VALUES(md5('names-hidden')::uuid,false,false);
INSERT INTO winelio.feed_events(actor_id,kind,source_id,occurred_at,is_historical,is_published)
 SELECT id,'member_joined',id,created_at,true,true FROM winelio.profiles;
\ir ../../supabase/migrations/20261030e_feed_default_display_names.sql
SELECT set_config('test.uid',md5('names-visible')::uuid::text,false);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE display_name='Julie M.' AND kind='member_joined'),'historical first name and initial visible by default');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE display_name LIKE 'Thierry%'),'existing explicit opt-out preserved');
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE display_name='Un membre'),'missing first name never reveals a lone surname initial');
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_consent_history),'default activity visibility does not forge consent');
SELECT check_test((SELECT count(*)=1 FROM winelio.feed_preferences),'migration does not manufacture per-user preferences');
SELECT check_test((SELECT NOT share_activity AND NOT share_gains FROM winelio.feed_preferences WHERE user_id=md5('names-hidden')::uuid),'existing stored choices unchanged');
-- Unconfirmed signups cannot enter the feed now ordinary activity is on by default.
INSERT INTO auth.users VALUES(md5('names-new')::uuid,NULL);
INSERT INTO winelio.profiles(id,first_name,last_name,sponsor_id) VALUES(md5('names-new')::uuid,'Nouveau','Durand',md5('names-visible')::uuid);
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events WHERE source_id=md5('names-new')::uuid),'unconfirmed signup never published');
UPDATE auth.users SET email_confirmed_at=now() WHERE id=md5('names-new')::uuid;
SELECT check_test((SELECT count(*)=2 FROM winelio.feed_events WHERE source_id=md5('names-new')::uuid),'confirmed signup and sponsor captured once without a preference row');
UPDATE winelio.profiles SET first_name='Nouveau' WHERE id=md5('names-new')::uuid;
UPDATE auth.users SET email_confirmed_at=now() WHERE id=md5('names-new')::uuid;
SELECT check_test((SELECT count(*)=2 FROM winelio.feed_events WHERE source_id=md5('names-new')::uuid),'profile refresh and repeated confirmation do not duplicate activity');
INSERT INTO winelio.recommendations(id,referrer_id) VALUES(md5('names-reco')::uuid,md5('names-visible')::uuid);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='recommendation_created' AND display_name='Julie M.'),'new recommendation named by default');
-- Financial posting requires an independent positive choice, even with ordinary activity enabled.
INSERT INTO winelio.commission_transactions(id,user_id,recommendation_id,amount,type,status) VALUES(md5('names-no-gain')::uuid,md5('names-visible')::uuid,md5('names-reco')::uuid,300,'recommendation','EARNED');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='gain_credited'),'earned gain is not published without consent');
SELECT winelio.set_feed_preferences(true,true,0);
INSERT INTO winelio.commission_transactions(id,user_id,recommendation_id,amount,type,status) VALUES(md5('names-pending')::uuid,md5('names-visible')::uuid,md5('names-reco')::uuid,25.50,'recommendation','PENDING');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind='gain_credited'),'pending amount stays private even with consent');
UPDATE winelio.commission_transactions SET status='EARNED',earned_at=now() WHERE id=md5('names-pending')::uuid;
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE kind='gain_credited' AND display_name='Julie M.' AND amount=25.50),'only qualified credited amount published after independent consent');
SELECT check_test((SELECT notice_version='2026-10-30-default-activity' FROM winelio.feed_consent_history ORDER BY recorded_at DESC LIMIT 1),'visibility and gains choice audited with new notice version');
SELECT winelio.set_feed_preferences(false,false,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events WHERE actor_id=md5('names-visible')::uuid),'hiding activity removes own historical and new events and gains');
INSERT INTO winelio.recommendations(id,referrer_id) VALUES(md5('names-hidden-reco')::uuid,md5('names-visible')::uuid);
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events WHERE source_id=md5('names-hidden-reco')::uuid),'new activity remains hidden after opting out');
SELECT winelio.set_feed_preferences(true,false,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events WHERE actor_id=md5('names-visible')::uuid),'enabling again never restores withdrawn history');
SELECT set_config('test.uid',md5('not-a-member')::uuid::text,false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'shared non-Winelio users remain excluded from named feed');
DELETE FROM winelio.commission_transactions;
DELETE FROM winelio.recommendations;
UPDATE winelio.profiles SET sponsor_id=NULL;
DELETE FROM winelio.profiles;
DELETE FROM auth.users;
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events),'named-feed fixture cleaned up');
