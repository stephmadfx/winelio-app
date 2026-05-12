-- Filtre commun : exclut les emails techniques (démo, scraping, e2e, recette)
-- et l'utilisateur système Winelio. Réutilisé par toutes les fonctions ci-dessous.

-- 1. TOP PARRAINS : score pondéré 5/3/2/1/1 sur les 5 niveaux MLM
CREATE OR REPLACE FUNCTION winelio.leaderboard_top_sponsors(
  p_period_start TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  score INT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
  WITH RECURSIVE downline AS (
    SELECT
      p.sponsor_id AS root_id,
      p.id        AS member_id,
      1           AS lvl,
      p.created_at
    FROM winelio.profiles p
    WHERE p.sponsor_id IS NOT NULL
      AND p.sponsor_id != '00000000-0000-0000-0000-000000000001'::uuid
      AND p.email NOT LIKE '%@winelio-demo.internal'
      AND p.email NOT LIKE '%@winelio-scraped.local'
      AND p.email NOT LIKE '%@winelio-e2e.local'
      AND p.email NOT LIKE '%@mailsac.com'
    UNION ALL
    SELECT
      d.root_id,
      p.id,
      d.lvl + 1,
      p.created_at
    FROM winelio.profiles p
    JOIN downline d ON p.sponsor_id = d.member_id
    WHERE d.lvl < 5
      AND p.email NOT LIKE '%@winelio-demo.internal'
      AND p.email NOT LIKE '%@winelio-scraped.local'
      AND p.email NOT LIKE '%@winelio-e2e.local'
      AND p.email NOT LIKE '%@mailsac.com'
  ),
  scored AS (
    SELECT
      d.root_id,
      SUM(
        CASE d.lvl
          WHEN 1 THEN 5
          WHEN 2 THEN 3
          WHEN 3 THEN 2
          WHEN 4 THEN 1
          WHEN 5 THEN 1
          ELSE 0
        END
      )::INT AS score
    FROM downline d
    WHERE d.created_at >= p_period_start
    GROUP BY d.root_id
  )
  SELECT
    s.root_id AS user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    s.score
  FROM scored s
  JOIN winelio.profiles pr ON pr.id = s.root_id
  WHERE s.score > 0
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
    AND pr.id != '00000000-0000-0000-0000-000000000001'::uuid
  ORDER BY s.score DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_top_sponsors(TIMESTAMPTZ, INT) TO authenticated;

-- 2. TOP REVENUS : Σ commissions EARNED + PENDING
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
  WHERE ct.created_at >= p_period_start
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

-- 3. TOP RECOS : nombre de recommandations créées
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
  WHERE r.created_at >= p_period_start
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

-- 4. MA POSITION : rang du user dans une catégorie donnée pour la période
CREATE OR REPLACE FUNCTION winelio.leaderboard_my_position(
  p_user_id UUID,
  p_category TEXT,
  p_period_start TIMESTAMPTZ
)
RETURNS TABLE (
  rank INT,
  value NUMERIC,
  total_users INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_rank INT;
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
  ELSE
    RAISE EXCEPTION 'Unknown category: %', p_category;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_rank, 0)::INT,
    COALESCE(v_value, 0)::NUMERIC,
    COALESCE(v_total, 0)::INT;
END;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_my_position(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION winelio.leaderboard_top_sponsors IS 'Top parrains : score pondéré 5/3/2/1/1 sur les 5 niveaux MLM, filleuls inscrits dans la période.';
COMMENT ON FUNCTION winelio.leaderboard_top_revenue  IS 'Top revenus : somme des commissions EARNED + PENDING dans la période.';
COMMENT ON FUNCTION winelio.leaderboard_top_recos    IS 'Top recos : nombre de recommandations créées dans la période (is_demo=false).';
COMMENT ON FUNCTION winelio.leaderboard_my_position  IS 'Position d''un user dans une catégorie pour une période. Retourne (rank, value, total_users) ou (0,0,0) si non classé.';
