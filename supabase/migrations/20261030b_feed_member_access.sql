BEGIN;
-- The Supabase instance is shared: an unrelated authenticated account is not a Winelio member.
CREATE OR REPLACE FUNCTION winelio.get_national_feed(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,kind text,display_name text,amount numeric,occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT e.id,e.kind,
   coalesce(nullif(trim(p.first_name),''),'Un membre') ||
     CASE WHEN nullif(trim(p.last_name),'') IS NOT NULL THEN ' '||upper(left(trim(p.last_name),1))||'.' ELSE '' END,
   CASE WHEN e.kind='gain_credited' THEN e.amount ELSE NULL END,e.occurred_at
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
 ORDER BY e.occurred_at DESC,e.id LIMIT greatest(1,least(coalesce(p_limit,100),100));
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
