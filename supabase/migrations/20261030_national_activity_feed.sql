BEGIN;
-- Opt-in only. Preferences are never inherited from an old marketing consent.
CREATE TABLE winelio.feed_preferences (
  user_id uuid PRIMARY KEY REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  share_activity boolean NOT NULL DEFAULT false,
  share_gains boolean NOT NULL DEFAULT false,
  daily_digest_frequency integer NOT NULL DEFAULT 0 CHECK (daily_digest_frequency BETWEEN 0 AND 2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT share_gains OR share_activity)
);
CREATE TABLE winelio.feed_consent_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  share_activity boolean NOT NULL,
  share_gains boolean NOT NULL,
  daily_digest_frequency integer NOT NULL,
  notice_version text NOT NULL DEFAULT '2026-10-30',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE winelio.feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('member_joined','member_sponsored','recommendation_created','gain_credited')),
  source_id uuid NOT NULL,
  amount numeric,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind, source_id),
  CHECK ((kind='gain_credited' AND amount>0) OR (kind<>'gain_credited' AND amount IS NULL))
);
CREATE TABLE winelio.feed_digest_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  digest_day date NOT NULL,
  slot integer NOT NULL CHECK(slot IN (0,1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  UNIQUE(user_id,digest_day,slot)
);
ALTER TABLE winelio.feed_digest_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winelio.feed_digest_receipts FROM anon,authenticated;

CREATE INDEX feed_events_recent ON winelio.feed_events(occurred_at DESC, id);
ALTER TABLE winelio.feed_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.feed_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.feed_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winelio.feed_preferences, winelio.feed_consent_history, winelio.feed_events FROM anon, authenticated;
GRANT SELECT ON winelio.feed_preferences TO authenticated;
CREATE POLICY own_feed_preferences ON winelio.feed_preferences FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE FUNCTION winelio.set_feed_preferences(p_share_activity boolean, p_share_gains boolean, p_frequency integer)
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
  -- A new member can opt in from Settings after completing signup (within 24h).
  -- A withdrawn publication is never resurrected by a later consent.
  IF p_share_activity AND NOT EXISTS (
    SELECT 1 FROM winelio.feed_consent_history WHERE user_id=uid AND share_activity
  ) THEN
    INSERT INTO winelio.feed_events(actor_id,kind,source_id,occurred_at)
      SELECT uid,'member_joined',uid,created_at FROM winelio.profiles
      WHERE id=uid AND created_at>now()-interval '24 hours' AND onboarding_status='active'
        AND is_active IS TRUE AND is_demo IS NOT TRUE AND nullif(trim(first_name),'') IS NOT NULL
      ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO winelio.feed_consent_history(user_id,share_activity,share_gains,daily_digest_frequency)
    VALUES(uid,p_share_activity,p_share_gains,p_frequency);
  IF p_frequency=0 THEN
    UPDATE winelio.feed_digest_receipts SET dismissed_at=now() WHERE user_id=uid AND dismissed_at IS NULL;
  END IF;
  -- Withdrawal also removes prior publications: re-consenting cannot resurrect them.
  DELETE FROM winelio.feed_events WHERE actor_id=uid
    AND (NOT p_share_activity OR (kind='gain_credited' AND NOT p_share_gains));
END $$;
REVOKE ALL ON FUNCTION winelio.set_feed_preferences(boolean,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION winelio.set_feed_preferences(boolean,boolean,integer) TO authenticated;

CREATE FUNCTION winelio.capture_feed_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; event_kind text; event_amount numeric; event_time timestamptz := now();
BEGIN
  IF TG_TABLE_NAME='profiles' THEN
    IF NEW.is_demo IS TRUE OR NEW.onboarding_status IS DISTINCT FROM 'active'
      OR nullif(trim(NEW.first_name),'') IS NULL THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
      IF OLD.onboarding_status='active' AND nullif(trim(OLD.first_name),'') IS NOT NULL THEN RETURN NEW; END IF;
    END IF;
    IF NEW.sponsor_id IS NOT NULL THEN
      PERFORM 1 FROM winelio.feed_preferences WHERE user_id=NEW.sponsor_id FOR SHARE;
      INSERT INTO winelio.feed_events(actor_id,kind,source_id)
        SELECT NEW.sponsor_id,'member_sponsored',NEW.id
        FROM winelio.feed_preferences f JOIN winelio.profiles p ON p.id=f.user_id
        WHERE f.user_id=NEW.sponsor_id AND f.share_activity AND p.is_demo IS NOT TRUE AND p.is_active IS TRUE
        ON CONFLICT DO NOTHING;
    END IF;
    actor:=NEW.id; event_kind:='member_joined';
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
    FROM winelio.feed_preferences f JOIN winelio.profiles p ON p.id=f.user_id
    WHERE f.user_id=actor AND f.share_activity AND (event_kind<>'gain_credited' OR f.share_gains)
      AND p.is_demo IS NOT TRUE AND p.is_active IS TRUE
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION winelio.capture_feed_event() FROM PUBLIC;
CREATE TRIGGER capture_feed_profile AFTER INSERT OR UPDATE ON winelio.profiles FOR EACH ROW EXECUTE FUNCTION winelio.capture_feed_event();
CREATE TRIGGER capture_feed_recommendation AFTER INSERT ON winelio.recommendations FOR EACH ROW EXECUTE FUNCTION winelio.capture_feed_event();
CREATE TRIGGER capture_feed_credit AFTER INSERT OR UPDATE ON winelio.commission_transactions FOR EACH ROW EXECUTE FUNCTION winelio.capture_feed_event();

CREATE FUNCTION winelio.get_national_feed(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,kind text,display_name text,amount numeric,occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT e.id,e.kind,
   coalesce(nullif(trim(p.first_name),''),'Un membre') ||
     CASE WHEN nullif(trim(p.last_name),'') IS NOT NULL THEN ' '||upper(left(trim(p.last_name),1))||'.' ELSE '' END,
   CASE WHEN e.kind='gain_credited' THEN e.amount ELSE NULL END,e.occurred_at
 FROM winelio.feed_events e
 JOIN winelio.profiles p ON p.id=e.actor_id
 JOIN winelio.feed_preferences f ON f.user_id=p.id
 WHERE auth.uid() IS NOT NULL AND f.share_activity AND p.is_active IS TRUE AND p.is_demo IS NOT TRUE
   AND (e.kind<>'gain_credited' OR (f.share_gains AND EXISTS (
     SELECT 1 FROM winelio.commission_transactions c WHERE c.id=e.source_id AND c.status='EARNED'
       AND c.type='recommendation' AND c.user_id=e.actor_id AND c.amount=e.amount)))
   AND e.occurred_at>now()-interval '30 days'
 ORDER BY e.occurred_at DESC,e.id LIMIT greatest(1,least(coalesce(p_limit,100),100));
$$;
REVOKE ALL ON FUNCTION winelio.get_national_feed(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION winelio.get_national_feed(integer) TO authenticated;
-- In-app delivery is lazy: generated once when the member opens/refocuses the app.
-- No external delivery or cron is needed. Paris calendar days include DST correctly.
CREATE FUNCTION winelio.get_network_digest()
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
      SELECT 1 FROM winelio.get_national_feed(100) e WHERE e.occurred_at>greatest(coalesce(last_summary,now()-interval '1 day'),now()-interval '1 day')
    ) THEN
    INSERT INTO winelio.feed_digest_receipts(user_id,digest_day,slot) VALUES(uid,today,current_slot) ON CONFLICT DO NOTHING;
  END IF;
  RETURN QUERY SELECT r.id,r.created_at FROM winelio.feed_digest_receipts r
    WHERE r.user_id=uid AND r.digest_day=today AND r.dismissed_at IS NULL ORDER BY r.created_at DESC LIMIT 1;
END $$;
CREATE FUNCTION winelio.dismiss_network_digest(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 UPDATE winelio.feed_digest_receipts SET dismissed_at=now() WHERE id=p_id AND user_id=auth.uid() AND dismissed_at IS NULL;
$$;
REVOKE ALL ON FUNCTION winelio.get_network_digest(),winelio.dismiss_network_digest(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION winelio.get_network_digest(),winelio.dismiss_network_digest(uuid) TO authenticated;

-- Must be called daily by the deployment scheduler. No message is sent here.
CREATE FUNCTION winelio.cleanup_feed_events() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM winelio.feed_events WHERE occurred_at<=now()-interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM winelio.feed_digest_receipts WHERE created_at<=now()-interval '30 days';
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION winelio.cleanup_feed_events() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION winelio.cleanup_feed_events() TO service_role;
-- Install maintenance when pg_cron is available; otherwise deployment must schedule it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('winelio-feed-retention', '15 2 * * *', 'SELECT winelio.cleanup_feed_events()');
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
