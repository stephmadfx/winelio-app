-- Leaderboard : classement par taille totale du réseau (5 niveaux, all-time)
-- et extension de leaderboard_my_position pour les nouvelles catégories.

-- ─────────────────────────────────────────────
-- 1. Classement top réseau total (5 niveaux)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION winelio.leaderboard_top_network_total(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar text, total_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'winelio', 'public'
AS $$
  WITH RECURSIVE tree(root_id, member_id, depth) AS (
    SELECT p.id, c.id, 1
    FROM winelio.profiles p
    JOIN winelio.profiles c ON c.sponsor_id = p.id
    WHERE p.id != '00000000-0000-0000-0000-000000000001'::uuid
      AND c.id != '00000000-0000-0000-0000-000000000001'::uuid

    UNION ALL

    SELECT t.root_id, c.id, t.depth + 1
    FROM tree t
    JOIN winelio.profiles c ON c.sponsor_id = t.member_id
    WHERE t.depth < 5
      AND c.id != '00000000-0000-0000-0000-000000000001'::uuid
  )
  SELECT
    pr.id        AS user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    COUNT(t.member_id)::INT AS total_count
  FROM winelio.profiles pr
  JOIN tree t ON t.root_id = pr.id
  WHERE pr.id != '00000000-0000-0000-0000-000000000001'::uuid
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
  GROUP BY pr.id, pr.first_name, pr.last_name, pr.avatar, pr.created_at
  ORDER BY total_count DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────
-- 2. Extension de leaderboard_my_position
--    Nouvelles catégories : 'n1_total', 'network_total'
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION winelio.leaderboard_my_position(
  p_user_id uuid,
  p_category text,
  p_period_start timestamp with time zone
)
RETURNS TABLE(rank integer, value numeric, total_users integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'winelio', 'public'
AS $function$
DECLARE
  v_rank  INT;
  v_value NUMERIC;
  v_total INT;
BEGIN
  IF p_category = 'sponsors' THEN
    WITH ranked AS (
      SELECT user_id, score, RANK() OVER (ORDER BY score DESC) AS rk
      FROM winelio.leaderboard_top_sponsors(p_period_start, 100000)
    )
    SELECT rk, score, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;

  ELSIF p_category = 'revenue' THEN
    WITH ranked AS (
      SELECT user_id, total_amount, RANK() OVER (ORDER BY total_amount DESC) AS rk
      FROM winelio.leaderboard_top_revenue(p_period_start, 100000)
    )
    SELECT rk, total_amount, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;

  ELSIF p_category = 'recos' THEN
    WITH ranked AS (
      SELECT user_id, reco_count, RANK() OVER (ORDER BY reco_count DESC) AS rk
      FROM winelio.leaderboard_top_recos(p_period_start, 100000)
    )
    SELECT rk, reco_count, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;

  ELSIF p_category = 'n1_total' THEN
    -- Filleuls directs all-time : réutilise top_sponsors avec date fixe
    WITH ranked AS (
      SELECT user_id, score, RANK() OVER (ORDER BY score DESC) AS rk
      FROM winelio.leaderboard_top_sponsors('2010-01-01'::timestamptz, 100000)
    )
    SELECT rk, score, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;

  ELSIF p_category = 'network_total' THEN
    WITH ranked AS (
      SELECT user_id, total_count, RANK() OVER (ORDER BY total_count DESC) AS rk
      FROM winelio.leaderboard_top_network_total(100000)
    )
    SELECT rk, total_count, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;

  ELSE
    RAISE EXCEPTION 'Unknown category: %', p_category;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_rank,  0)::INT,
    COALESCE(v_value, 0)::NUMERIC,
    COALESCE(v_total, 0)::INT;
END;
$function$;
