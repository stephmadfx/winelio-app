BEGIN;
-- One-off, collective historical statistics, never individual events without consent.
-- Minimum five observations per released metric is a minimisation safeguard, not a legal certification.
CREATE TABLE winelio.feed_network_summaries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 metric text NOT NULL CHECK(metric IN ('new_members','new_recommendations')),
 event_count integer NOT NULL CHECK(event_count>=5),
 is_published boolean NOT NULL DEFAULT false,
 period_start date NOT NULL,
 period_end date NOT NULL,
 occurred_at timestamptz NOT NULL,
 CHECK(period_start<=period_end),
 UNIQUE(metric,period_start,period_end)
);
ALTER TABLE winelio.feed_network_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winelio.feed_network_summaries FROM PUBLIC,anon,authenticated;
-- Fixed snapshot ending yesterday, Paris time. Do not recreate history on every read.
WITH bounds AS (
 SELECT (date_trunc('day',now() AT TIME ZONE 'Europe/Paris')-interval '30 days') AT TIME ZONE 'Europe/Paris' AS since,
 date_trunc('day',now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris' AS until
), counts AS (
 SELECT 'new_members'::text AS metric,count(*)::integer AS n FROM winelio.profiles p
 JOIN auth.users u ON u.id=p.id CROSS JOIN bounds b
 WHERE p.is_demo IS NOT TRUE AND p.is_active IS TRUE AND p.onboarding_status='active'
 AND u.email_confirmed_at IS NOT NULL AND nullif(trim(p.first_name),'') IS NOT NULL
 AND p.id<>'00000000-0000-0000-0000-000000000001'
 AND p.created_at>=b.since AND p.created_at<b.until
 UNION ALL
 SELECT 'new_recommendations',count(*)::integer FROM winelio.recommendations r
 CROSS JOIN bounds b WHERE r.is_demo IS NOT TRUE AND r.created_at>=b.since AND r.created_at<b.until
)
INSERT INTO winelio.feed_network_summaries(metric,event_count,period_start,period_end,occurred_at)
 SELECT c.metric,c.n,(b.since AT TIME ZONE 'Europe/Paris')::date,
 ((b.until AT TIME ZONE 'Europe/Paris')::date-1),b.until-interval '1 microsecond'
 FROM counts c CROSS JOIN bounds b WHERE c.n>=5
 ON CONFLICT(metric,period_start,period_end) DO NOTHING;
CREATE OR REPLACE FUNCTION winelio.get_national_feed(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,kind text,display_name text,amount numeric,occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH events AS (
 SELECT e.id,e.kind,
   coalesce(nullif(trim(p.first_name),''),'Un membre') ||
     CASE WHEN nullif(trim(p.last_name),'') IS NOT NULL THEN ' '||upper(left(trim(p.last_name),1))||'.' ELSE '' END AS display_name,
   CASE WHEN e.kind='gain_credited' THEN e.amount ELSE NULL END AS amount,e.occurred_at
 FROM winelio.feed_events e
 JOIN winelio.profiles p ON p.id=e.actor_id
 JOIN winelio.feed_preferences f ON f.user_id=p.id
 WHERE auth.uid() IS NOT NULL
   AND EXISTS (SELECT 1 FROM winelio.profiles viewer WHERE viewer.id=auth.uid() AND viewer.is_active IS TRUE)
   AND f.share_activity AND p.is_active IS TRUE AND p.is_demo IS NOT TRUE
   AND (e.kind<>'gain_credited' OR (f.share_gains AND EXISTS (
     SELECT 1 FROM winelio.commission_transactions c WHERE c.id=e.source_id AND c.status='EARNED'
       AND c.type='recommendation' AND c.user_id=e.actor_id AND c.amount=e.amount)))
   AND e.occurred_at>now()-interval '30 days'
 UNION ALL
 SELECT s.id,'network_summary'::text,
   'Du '||to_char(s.period_start,'DD/MM')||' au '||to_char(s.period_end,'DD/MM/YYYY')||' : '||s.event_count::text||
   CASE s.metric WHEN 'new_members' THEN ' nouveaux membres confirmés ont rejoint Winelio.'
     ELSE ' recommandations ont été créées sur Winelio.' END,
   NULL::numeric,s.occurred_at
 FROM winelio.feed_network_summaries s
 WHERE auth.uid() IS NOT NULL
   AND EXISTS (SELECT 1 FROM winelio.profiles viewer WHERE viewer.id=auth.uid() AND viewer.is_active IS TRUE)
   AND s.is_published AND s.occurred_at>now()-interval '30 days'
 )
 SELECT * FROM events ORDER BY occurred_at DESC,id LIMIT greatest(1,least(coalesce(p_limit,100),100));
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
      SELECT 1 FROM winelio.get_national_feed(100) e WHERE e.kind<>'network_summary' AND e.occurred_at>greatest(coalesce(last_summary,now()-interval '1 day'),now()-interval '1 day')
    ) THEN
    INSERT INTO winelio.feed_digest_receipts(user_id,digest_day,slot) VALUES(uid,today,current_slot) ON CONFLICT DO NOTHING;
  END IF;
  RETURN QUERY SELECT r.id,r.created_at FROM winelio.feed_digest_receipts r
    WHERE r.user_id=uid AND r.digest_day=today AND r.dismissed_at IS NULL ORDER BY r.created_at DESC LIMIT 1;
END $$;
CREATE OR REPLACE FUNCTION winelio.cleanup_feed_events() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM winelio.feed_events WHERE occurred_at<=now()-interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM winelio.feed_digest_receipts WHERE created_at<=now()-interval '30 days';
  DELETE FROM winelio.feed_network_summaries WHERE occurred_at<=now()-interval '30 days';
  RETURN removed;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
