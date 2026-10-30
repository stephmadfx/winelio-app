-- Disposable cluster only: each historical record becomes a separate genuine dated event.
INSERT INTO winelio.profiles(id,first_name,last_name,created_at) VALUES
 (md5('individual-parent')::uuid,'IdentitéParent','Privée',now()-interval '15 days'),
 (md5('individual-child')::uuid,'IdentitéEnfant','Privée',now()-interval '14 days');
UPDATE winelio.profiles SET sponsor_id=md5('individual-parent')::uuid WHERE id=md5('individual-child')::uuid;
INSERT INTO auth.users SELECT id,now() FROM winelio.profiles;
INSERT INTO winelio.recommendations(id,referrer_id,created_at) VALUES(md5('individual-reco')::uuid,md5('individual-child')::uuid,now()-interval '13 days');
INSERT INTO winelio.commission_transactions(id,user_id,recommendation_id,amount,type,status) VALUES(md5('individual-gain')::uuid,md5('individual-child')::uuid,md5('individual-reco')::uuid,300,'recommendation','EARNED');
\ir ../../supabase/migrations/20261030d_individual_feed_history.sql
SELECT set_config('test.uid',md5('individual-parent')::uuid::text,false);
SELECT check_test((SELECT count(*)=4 FROM winelio.feed_events WHERE is_historical),'each signup, sponsoring and recommendation seeded separately');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'individual history waits for publication');
UPDATE winelio.feed_events SET is_published=true WHERE is_historical;
SELECT check_test((SELECT count(*)=4 FROM winelio.get_national_feed()),'four separate historical events replace collective summary');
SELECT check_test((SELECT bool_and(display_name='Un membre' AND amount IS NULL) FROM winelio.get_national_feed()),'no retrospective identity or gain disclosure');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed() WHERE kind IN('network_summary','gain_credited')),'no collective recap or old money in the individual timeline');
SELECT check_test((SELECT bool_and(occurred_at<now()-interval '12 days') FROM winelio.get_national_feed()),'original event dates kept');
SELECT check_test((SELECT min(occurred_at)=min(created_at) FROM winelio.feed_events CROSS JOIN winelio.profiles WHERE is_historical),'source creation dates are not replaced by publication date');
SELECT winelio.set_feed_preferences(true,true,1);
SELECT check_test((SELECT bool_and(display_name='Un membre') FROM winelio.get_national_feed()),'a later consent does not retroactively reveal identities');
UPDATE winelio.feed_events SET occurred_at=now()-interval '1 hour' WHERE is_historical;
SELECT check_test((SELECT count(*)=0 FROM winelio.get_network_digest()),'historical events never trigger daily new-activity digest');
INSERT INTO winelio.recommendations(id,referrer_id) VALUES(md5('individual-new-reco')::uuid,md5('individual-parent')::uuid);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_network_digest()),'new opted-in activity still triggers digest');
SELECT check_test((SELECT count(*)=1 FROM winelio.get_national_feed() WHERE display_name='IdentitéParent P.'),'new events continue to use authorized first name and initial');
SELECT set_config('test.uid',md5('individual-child')::uuid::text,false);
SELECT winelio.set_feed_preferences(false,false,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events WHERE actor_id=md5('individual-child')::uuid),'explicit opt-out removes own historical publications');
SELECT winelio.set_feed_preferences(true,false,0);
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events WHERE actor_id=md5('individual-child')::uuid),'re-consent does not restore withdrawn history');
SELECT set_config('test.uid',md5('unrelated-auth-account')::uuid::text,false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_national_feed()),'individual history also requires active Winelio membership');
DELETE FROM winelio.commission_transactions;
DELETE FROM winelio.recommendations;
UPDATE winelio.profiles SET sponsor_id=NULL;
DELETE FROM winelio.profiles;
DELETE FROM auth.users;
SELECT check_test((SELECT count(*)=0 FROM winelio.feed_events),'individual history test cleanup complete');
