-- Compte le nombre de membres par niveau MLM (1 à p_max_level) sous un user donné.
-- Utilisé par /network/stats pour afficher les filleuls réels par niveau,
-- indépendamment du fait qu'ils aient ou non généré des commissions.

CREATE OR REPLACE FUNCTION winelio.network_members_by_level(
  p_user_id UUID,
  p_max_level INT DEFAULT 5
) RETURNS TABLE (level INT, member_count INT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = winelio, public
AS $$
  WITH RECURSIVE network AS (
    SELECT id, 1 AS lvl
    FROM winelio.profiles
    WHERE sponsor_id = p_user_id
    UNION ALL
    SELECT p.id, n.lvl + 1
    FROM winelio.profiles p
    JOIN network n ON p.sponsor_id = n.id
    WHERE n.lvl < p_max_level
  )
  SELECT lvl::INT, COUNT(*)::INT
  FROM network
  GROUP BY lvl
  ORDER BY lvl;
$$;

GRANT EXECUTE ON FUNCTION winelio.network_members_by_level(UUID, INT) TO authenticated;

COMMENT ON FUNCTION winelio.network_members_by_level IS
  'Retourne le nombre de filleuls réels par niveau MLM (1 à p_max_level) sous un user donné. Indépendant des commissions générées.';
