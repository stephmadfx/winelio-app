-- Simplification : Top Parrains compte désormais le nombre de FILLEULS DIRECTS
-- (niveau 1 uniquement) inscrits dans la période, au lieu du score pondéré
-- 5/3/2/1/1. Plus intuitif côté UX ("X filleuls" vs "X pts").
-- Le nom de colonne reste `score` pour ne pas casser le contrat avec le helper TS.

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
  SELECT
    p.sponsor_id AS user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    COUNT(*)::INT AS score
  FROM winelio.profiles p
  JOIN winelio.profiles pr ON pr.id = p.sponsor_id
  WHERE p.sponsor_id IS NOT NULL
    AND p.created_at >= p_period_start
    AND p.sponsor_id != '00000000-0000-0000-0000-000000000001'::uuid
    AND p.email NOT LIKE '%@winelio-demo.internal'
    AND p.email NOT LIKE '%@winelio-scraped.local'
    AND p.email NOT LIKE '%@winelio-e2e.local'
    AND p.email NOT LIKE '%@mailsac.com'
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
    AND pr.id != '00000000-0000-0000-0000-000000000001'::uuid
  GROUP BY p.sponsor_id, pr.first_name, pr.last_name, pr.avatar, pr.created_at
  ORDER BY score DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION winelio.leaderboard_top_sponsors IS
  'Top parrains : nombre de filleuls DIRECTS (niveau 1) inscrits dans la période. Exclut emails techniques + user système.';
