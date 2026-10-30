BEGIN;

-- Correct only the identified review sandbox, preserving login, sponsor and all data.
UPDATE winelio.profiles SET is_demo = true
WHERE id = '6b484bab-4f15-4a46-9a97-dd262097e896'::uuid
  AND first_name = 'Apple' AND last_name = 'Review'
  AND is_demo IS NOT TRUE;

-- UI projection only: keep get_network_ids unchanged for financial/history consumers.
CREATE OR REPLACE FUNCTION winelio.get_display_network_ids(p_user_id uuid, p_max_depth integer DEFAULT 5)
RETURNS TABLE(member_id uuid, depth integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE viewer AS (
    SELECT p.id, CASE WHEN p.is_demo IS TRUE THEN coalesce(p.demo_owner_id,p.id) END AS demo_owner
    FROM winelio.profiles p WHERE p.id=p_user_id
      AND (auth.uid()=p_user_id OR auth.role()='service_role'
           OR coalesce(auth.jwt()->'app_metadata'->>'role','')='super_admin')
  ), tree AS (
    SELECT p.id AS member_id,1 AS depth,ARRAY[v.id,p.id] AS path
    FROM viewer v JOIN winelio.profiles p ON p.sponsor_id=v.id
    WHERE p.id<>v.id AND p_max_depth>=1
      AND ((v.demo_owner IS NULL AND p.is_demo IS NOT TRUE)
        OR (v.demo_owner IS NOT NULL AND p.is_demo IS TRUE AND p.demo_owner_id=v.demo_owner))
    UNION ALL
    SELECT p.id,t.depth+1,t.path||p.id
    FROM tree t JOIN winelio.profiles p ON p.sponsor_id=t.member_id CROSS JOIN viewer v
    WHERE t.depth<least(p_max_depth,5) AND NOT p.id=ANY(t.path)
      AND ((v.demo_owner IS NULL AND p.is_demo IS NOT TRUE)
        OR (v.demo_owner IS NOT NULL AND p.is_demo IS TRUE AND p.demo_owner_id=v.demo_owner))
  ) SELECT t.member_id,t.depth FROM tree t;
$$;
REVOKE ALL ON FUNCTION winelio.get_display_network_ids(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION winelio.get_display_network_ids(uuid,integer) TO authenticated,service_role;

-- Public rankings always describe the real network, including intermediate branches.
CREATE OR REPLACE FUNCTION winelio.leaderboard_top_sponsors(p_period_start timestamptz,p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid,first_name text,last_name text,avatar text,score integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.sponsor_id,pr.first_name,pr.last_name,pr.avatar,count(*)::integer
 FROM winelio.profiles p JOIN winelio.profiles pr ON pr.id=p.sponsor_id
 WHERE p.is_demo IS NOT TRUE AND pr.is_demo IS NOT TRUE
   AND p.created_at>=p_period_start
   AND pr.id<>'00000000-0000-0000-0000-000000000001'::uuid
   AND coalesce(p.email,'') !~* '@(winelio-demo\.internal|winelio-scraped\.local|winelio-e2e\.local|mailsac\.com)$'
   AND coalesce(pr.email,'') !~* '@(winelio-demo\.internal|winelio-scraped\.local|winelio-e2e\.local|mailsac\.com)$'
 GROUP BY p.sponsor_id,pr.first_name,pr.last_name,pr.avatar,pr.created_at
 ORDER BY count(*) DESC,pr.created_at ASC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION winelio.leaderboard_top_network_total(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid,first_name text,last_name text,avatar text,total_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH RECURSIVE real_profiles AS (
   SELECT p.* FROM winelio.profiles p WHERE p.is_demo IS NOT TRUE
     AND p.id<>'00000000-0000-0000-0000-000000000001'::uuid
     AND coalesce(p.email,'') !~* '@(winelio-demo\.internal|winelio-scraped\.local|winelio-e2e\.local|mailsac\.com)$'
 ), tree(root_id,member_id,depth,path) AS (
   SELECT p.id,c.id,1,ARRAY[p.id,c.id] FROM real_profiles p JOIN real_profiles c ON c.sponsor_id=p.id WHERE p.id<>c.id
   UNION ALL
   SELECT t.root_id,c.id,t.depth+1,t.path||c.id FROM tree t JOIN real_profiles c ON c.sponsor_id=t.member_id
   WHERE t.depth<5 AND NOT c.id=ANY(t.path)
 )
 SELECT pr.id,pr.first_name,pr.last_name,pr.avatar,count(t.member_id)::integer
 FROM real_profiles pr JOIN tree t ON t.root_id=pr.id
 GROUP BY pr.id,pr.first_name,pr.last_name,pr.avatar,pr.created_at
 ORDER BY count(t.member_id) DESC,pr.created_at ASC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION winelio.leaderboard_top_revenue(
  p_period_start TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  total_amount NUMERIC
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
  SELECT
    ct.user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    SUM(ct.amount)::NUMERIC AS total_amount
  FROM winelio.commission_transactions ct
  JOIN winelio.profiles pr ON pr.id = ct.user_id
  WHERE ct.is_demo IS NOT TRUE AND pr.is_demo IS NOT TRUE
    AND ct.created_at >= p_period_start
    AND UPPER(ct.status) IN ('EARNED', 'PENDING')
    AND ct.user_id != '00000000-0000-0000-0000-000000000001'::uuid
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
  GROUP BY ct.user_id, pr.first_name, pr.last_name, pr.avatar, pr.created_at
  ORDER BY total_amount DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_top_revenue(TIMESTAMPTZ, INT) TO authenticated;


CREATE OR REPLACE FUNCTION winelio.leaderboard_top_recos(
  p_period_start TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  reco_count INT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
  SELECT
    r.referrer_id AS user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    COUNT(*)::INT AS reco_count
  FROM winelio.recommendations r
  JOIN winelio.profiles pr ON pr.id = r.referrer_id
  WHERE pr.is_demo IS NOT TRUE AND r.created_at >= p_period_start
    AND COALESCE(r.is_demo, false) = false
    AND r.referrer_id != '00000000-0000-0000-0000-000000000001'::uuid
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
  GROUP BY r.referrer_id, pr.first_name, pr.last_name, pr.avatar, pr.created_at
  ORDER BY reco_count DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_top_recos(TIMESTAMPTZ, INT) TO authenticated;


NOTIFY pgrst, 'reload schema';
COMMIT;
