BEGIN;
-- Product-owner decision: ordinary activity uses first name + surname initial by default.
-- Preserve every explicit visibility choice. Never create or infer a gains consent.
ALTER TABLE winelio.feed_preferences ALTER COLUMN share_activity SET DEFAULT true;
CREATE OR REPLACE FUNCTION winelio.get_national_feed(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,kind text,display_name text,amount numeric,occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT e.id,e.kind,
   CASE WHEN nullif(trim(p.first_name),'') IS NULL THEN 'Un membre'
     ELSE trim(p.first_name) || CASE WHEN nullif(trim(p.last_name),'') IS NOT NULL
       THEN ' '||upper(left(trim(p.last_name),1))||'.' ELSE '' END END,
   CASE WHEN e.kind='gain_credited' THEN e.amount ELSE NULL END,e.occurred_at
 FROM winelio.feed_events e
 JOIN winelio.profiles p ON p.id=e.actor_id
 LEFT JOIN winelio.feed_preferences f ON f.user_id=p.id
 WHERE auth.uid() IS NOT NULL
   AND EXISTS (SELECT 1 FROM winelio.profiles viewer WHERE viewer.id=auth.uid() AND viewer.is_active IS TRUE)
   AND e.is_published AND p.is_active IS TRUE AND p.is_demo IS NOT TRUE
   AND coalesce(f.share_activity,true)
   AND (e.kind<>'gain_credited' OR (f.share_gains AND EXISTS (
     SELECT 1 FROM winelio.commission_transactions c WHERE c.id=e.source_id AND c.status='EARNED'
       AND c.type='recommendation' AND c.user_id=e.actor_id AND c.amount=e.amount)))
   AND e.occurred_at>now()-interval '30 days'
 ORDER BY e.occurred_at DESC,e.id LIMIT greatest(1,least(coalesce(p_limit,100),100));
$$;
-- Both profile completion and email confirmation must hold before publishing a member.
CREATE FUNCTION winelio.publish_member_feed_events(p_user_id uuid,p_when timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE member record;
BEGIN
 SELECT p.id,p.sponsor_id INTO member FROM winelio.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.id=p_user_id AND p.is_active IS TRUE AND p.is_demo IS NOT TRUE
   AND p.onboarding_status='active' AND nullif(trim(p.first_name),'') IS NOT NULL
   AND u.email_confirmed_at IS NOT NULL;
 IF NOT FOUND THEN RETURN; END IF;
 IF member.sponsor_id IS NOT NULL THEN
   PERFORM 1 FROM winelio.feed_preferences WHERE user_id=member.sponsor_id FOR SHARE;
   INSERT INTO winelio.feed_events(actor_id,kind,source_id,occurred_at)
     SELECT p.id,'member_sponsored',member.id,p_when FROM winelio.profiles p
     LEFT JOIN winelio.feed_preferences f ON f.user_id=p.id
     WHERE p.id=member.sponsor_id AND p.is_active IS TRUE AND p.is_demo IS NOT TRUE AND coalesce(f.share_activity,true)
     ON CONFLICT DO NOTHING;
 END IF;
 PERFORM 1 FROM winelio.feed_preferences WHERE user_id=member.id FOR SHARE;
 INSERT INTO winelio.feed_events(actor_id,kind,source_id,occurred_at)
   SELECT p.id,'member_joined',member.id,p_when FROM winelio.profiles p
   LEFT JOIN winelio.feed_preferences f ON f.user_id=p.id
   WHERE p.id=member.id AND coalesce(f.share_activity,true)
   ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION winelio.publish_member_feed_events(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION winelio.capture_confirmed_member_feed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM winelio.publish_member_feed_events(NEW.id,NEW.email_confirmed_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION winelio.capture_confirmed_member_feed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_winelio_confirmed_member_feed AFTER UPDATE OF email_confirmed_at ON auth.users
 FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
 EXECUTE FUNCTION winelio.capture_confirmed_member_feed();
CREATE OR REPLACE FUNCTION winelio.capture_feed_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; event_kind text; event_amount numeric; event_time timestamptz := now();
BEGIN
  IF TG_TABLE_NAME='profiles' THEN
    IF TG_OP='UPDATE' THEN
      IF OLD.onboarding_status='active' AND nullif(trim(OLD.first_name),'') IS NOT NULL THEN RETURN NEW; END IF;
    END IF;
    PERFORM winelio.publish_member_feed_events(NEW.id,now());
    RETURN NEW;
  ELSIF TG_TABLE_NAME='recommendations' THEN
    IF NEW.is_demo IS TRUE THEN RETURN NEW; END IF;
    actor:=NEW.referrer_id; event_kind:='recommendation_created';
  ELSE
    IF NEW.status<>'EARNED' OR NEW.type<>'recommendation' OR NEW.amount<=0 OR NEW.is_demo IS TRUE THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
      IF OLD.status='EARNED' THEN RETURN NEW; END IF;
    END IF;
    actor:=NEW.user_id; event_kind:='gain_credited'; event_amount:=NEW.amount;
    -- Use the credit transition time, never the original pending creation time.
    event_time:=coalesce(NEW.earned_at,now());
  END IF;
  -- Serialize event creation with consent withdrawal.
  PERFORM 1 FROM winelio.feed_preferences WHERE user_id=actor FOR SHARE;
  INSERT INTO winelio.feed_events(actor_id,kind,source_id,amount,occurred_at)
    SELECT actor,event_kind,NEW.id,event_amount,event_time
    FROM winelio.profiles p LEFT JOIN winelio.feed_preferences f ON f.user_id=p.id
    WHERE p.id=actor AND coalesce(f.share_activity,true) AND (event_kind<>'gain_credited' OR f.share_gains IS TRUE)
      AND p.is_demo IS NOT TRUE AND p.is_active IS TRUE
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION winelio.set_feed_preferences(p_share_activity boolean, p_share_gains boolean, p_frequency integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_share_activity IS NULL OR p_share_gains IS NULL OR p_frequency IS NULL
    OR p_frequency NOT BETWEEN 0 AND 2 OR (p_share_gains AND NOT p_share_activity)
    THEN RAISE EXCEPTION 'Invalid preferences'; END IF;
  -- Serialise changes and retain the exact consent notice/version.
  PERFORM 1 FROM winelio.profiles WHERE id=uid FOR UPDATE;
  INSERT INTO winelio.feed_preferences(user_id,share_activity,share_gains,daily_digest_frequency)
    VALUES(uid,p_share_activity,p_share_gains,p_frequency)
    ON CONFLICT(user_id) DO UPDATE SET share_activity=excluded.share_activity,
      share_gains=excluded.share_gains,daily_digest_frequency=excluded.daily_digest_frequency,updated_at=now();
  INSERT INTO winelio.feed_consent_history(user_id,share_activity,share_gains,daily_digest_frequency,notice_version)
    VALUES(uid,p_share_activity,p_share_gains,p_frequency,'2026-10-30-default-activity');
  IF p_frequency=0 THEN
    UPDATE winelio.feed_digest_receipts SET dismissed_at=now() WHERE user_id=uid AND dismissed_at IS NULL;
  END IF;
  -- Hiding activity also removes prior publications; re-enabling does not recreate them.
  DELETE FROM winelio.feed_events WHERE actor_id=uid
    AND (NOT p_share_activity OR (kind='gain_credited' AND NOT p_share_gains));
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
