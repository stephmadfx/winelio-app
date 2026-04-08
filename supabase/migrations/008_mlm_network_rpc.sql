-- Migration 008 : RPC récursive pour récupérer tout le réseau MLM en une seule requête

CREATE OR REPLACE FUNCTION winelio.get_network_ids(
  p_user_id  uuid,
  p_max_depth int DEFAULT 5
)
RETURNS TABLE(member_id uuid, depth int)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE tree AS (
    SELECT id AS member_id, 1 AS depth
    FROM winelio.profiles
    WHERE sponsor_id = p_user_id

    UNION ALL

    SELECT p.id, t.depth + 1
    FROM winelio.profiles p
    JOIN tree t ON p.sponsor_id = t.member_id
    WHERE t.depth < p_max_depth
  )
  SELECT member_id, depth FROM tree;
$$;
