BEGIN;
-- Replace the collective recap with genuine dated events, de-identified retrospectively.
ALTER TABLE winelio.feed_events ADD COLUMN is_historical boolean NOT NULL DEFAULT false;
ALTER TABLE winelio.feed_events ADD COLUMN is_published boolean NOT NULL DEFAULT true;
ALTER TABLE winelio.feed_events ADD CONSTRAINT historical_feed_never_financial CHECK(NOT is_historical OR kind<>'gain_credited');
UPDATE winelio.feed_network_summaries SET is_published=false;
-- No names, client information or monetary events are published retrospectively.
-- An explicit activity opt-out remains respected; a later consent does not reveal historical identities.
WITH bounds AS (
 SELECT (date_trunc('day',now() AT TIME ZONE 'Europe/Paris')-interval '30 days') AT TIME ZONE 'Europe/Paris' AS since,
 date_trunc('day',now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris' AS until
), members AS (
 SELECT p.id,p.sponsor_id,p.created_at FROM winelio.profiles p JOIN auth.users u ON u.id=p.id CROSS JOIN bounds b
 WHERE p.is_demo IS NOT TRUE AND p.is_active IS TRUE AND p.onboarding_status='active'
 AND u.email_confirmed_at IS NOT NULL AND nullif(trim(p.first_name),'') IS NOT NULL
 AND p.id<>'00000000-0000-0000-0000-000000000001' AND p.created_at>=b.since AND p.created_at<b.until
), historical_events AS (
 SELECT m.id AS actor_id,'member_joined'::text AS kind,m.id AS source_id,m.created_at AS occurred_at FROM members m
 UNION ALL
 SELECT m.sponsor_id,'member_sponsored',m.id,m.created_at FROM members m JOIN winelio.profiles s ON s.id=m.sponsor_id JOIN auth.users su ON su.id=s.id
 WHERE s.is_active IS TRUE AND s.is_demo IS NOT TRUE AND su.email_confirmed_at IS NOT NULL
 AND s.id<>'00000000-0000-0000-0000-000000000001'
 UNION ALL
 SELECT r.referrer_id,'recommendation_created',r.id,r.created_at FROM winelio.recommendations r
 JOIN winelio.profiles p ON p.id=r.referrer_id JOIN auth.users u ON u.id=p.id CROSS JOIN bounds b
 WHERE r.is_demo IS NOT TRUE AND p.is_demo IS NOT TRUE AND p.is_active IS TRUE AND u.email_confirmed_at IS NOT NULL
 AND r.created_at>=b.since AND r.created_at<b.until
)
INSERT INTO winelio.feed_events(actor_id,kind,source_id,occurred_at,is_historical,is_published)
 SELECT h.actor_id,h.kind,h.source_id,h.occurred_at,true,false FROM historical_events h
 WHERE NOT EXISTS(SELECT 1 FROM winelio.feed_preferences f WHERE f.user_id=h.actor_id AND NOT f.share_activity)
 ON CONFLICT(kind,source_id) DO NOTHING;
CREATE OR REPLACE FUNCTION winelio.get_national_feed(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,kind text,display_name text,amount numeric,occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT e.id,e.kind,
   CASE WHEN e.is_historical THEN 'Un membre' ELSE coalesce(nullif(trim(p.first_name),''),'Un membre') ||
     CASE WHEN nullif(trim(p.last_name),'') IS NOT NULL THEN ' '||upper(left(trim(p.last_name),1))||'.' ELSE '' END END,
   CASE WHEN e.kind='gain_credited' THEN e.amount ELSE NULL END,e.occurred_at
 FROM winelio.feed_events e
 JOIN winelio.profiles p ON p.id=e.actor_id
 LEFT JOIN winelio.feed_preferences f ON f.user_id=p.id
 WHERE auth.uid() IS NOT NULL
   AND EXISTS (SELECT 1 FROM winelio.profiles viewer WHERE viewer.id=auth.uid() AND viewer.is_active IS TRUE)
   AND e.is_published AND p.is_active IS TRUE AND p.is_demo IS NOT TRUE
   AND ((NOT e.is_historical AND f.share_activity) OR (e.is_historical AND coalesce(f.share_activity,true)))
   AND (e.kind<>'gain_credited' OR (f.share_gains AND EXISTS (
     SELECT 1 FROM winelio.commission_transactions c WHERE c.id=e.source_id AND c.status='EARNED'
       AND c.type='recommendation' AND c.user_id=e.actor_id AND c.amount=e.amount)))
   AND e.occurred_at>now()-interval '30 days'
 ORDER BY e.occurred_at DESC,e.id LIMIT greatest(1,least(coalesce(p_limit,100),100));
$$;
CREATE OR REPLACE FUNCTION winelio.get_network_digest()
RETURNS TABLE(id uuid,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid:=auth.uid(); frequency integer; local_now timestamp:=now() AT TIME ZONE 'Europe/Paris';
  today date:=local_now::date; current_slot integer; daily_count integer; last_summary timestamptz;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  SELECT daily_digest_frequency INTO frequency FROM winelio.feed_preferences WHERE user_id=uid FOR UPDATE;
  IF coalesce(frequency,0)=0 THEN RETURN; END IF;
  DELETE FROM winelio.feed_digest_receipts r WHERE r.user_id=uid AND r.created_at<now()-interval '30 days';
  current_slot:=CASE WHEN frequency=2 AND extract(hour FROM local_now)>=14 THEN 1 ELSE 0 END;
  SELECT count(*) INTO daily_count FROM winelio.feed_digest_receipts r WHERE r.user_id=uid AND r.digest_day=today;
  SELECT max(r.created_at) INTO last_summary FROM winelio.feed_digest_receipts r WHERE r.user_id=uid;
  IF daily_count<frequency AND NOT EXISTS (
      SELECT 1 FROM winelio.feed_digest_receipts r WHERE r.user_id=uid AND r.digest_day=today AND r.slot=current_slot
    ) AND EXISTS (
      SELECT 1 FROM winelio.get_national_feed(100) e WHERE e.kind<>'network_summary' AND NOT EXISTS (SELECT 1 FROM winelio.feed_events h WHERE h.id=e.id AND h.is_historical) AND e.occurred_at>greatest(coalesce(last_summary,now()-interval '1 day'),now()-interval '1 day')
    ) THEN
    INSERT INTO winelio.feed_digest_receipts(user_id,digest_day,slot) VALUES(uid,today,current_slot) ON CONFLICT DO NOTHING;
  END IF;
  RETURN QUERY SELECT r.id,r.created_at FROM winelio.feed_digest_receipts r
    WHERE r.user_id=uid AND r.digest_day=today AND r.dismissed_at IS NULL ORDER BY r.created_at DESC LIMIT 1;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
