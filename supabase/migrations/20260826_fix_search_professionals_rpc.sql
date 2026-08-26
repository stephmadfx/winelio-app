-- Correctif recherche de professionnels.
--
-- Régression introduite par 20260629_add_company_description.sql : la fonction a été
-- recréée sans les casts ::text présents dans 20260623. Or v_search_professionals.company_alias
-- est un varchar(7) (companies.alias), ce qui fait échouer chaque appel avec
-- "structure of query does not match function result type". Le client Supabase remontait
-- l'erreur en console et affichait une liste vide : plus aucun pro visible.
--
-- La même migration avait aussi perdu SECURITY DEFINER et les GRANT.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Le join companies.owner_id -> profiles.id n'était couvert par aucun index :
-- seq scan de 47k lignes à chaque chargement de page protégée (layout) et à chaque recherche.
CREATE INDEX IF NOT EXISTS companies_owner_id_idx
  ON winelio.companies (owner_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_is_professional_idx
  ON winelio.profiles (id)
  WHERE is_professional = true;

CREATE INDEX IF NOT EXISTS companies_category_id_idx
  ON winelio.companies (category_id)
  WHERE deleted_at IS NULL;

-- Recherche texte : ILIKE '%...%' ne peut pas utiliser un btree, seul un GIN trigramme aide.
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx
  ON winelio.companies USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS companies_city_trgm_idx
  ON winelio.companies USING gin (city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_last_name_trgm_idx
  ON winelio.profiles USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_first_name_trgm_idx
  ON winelio.profiles USING gin (first_name gin_trgm_ops);

DROP FUNCTION IF EXISTS winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer);

CREATE FUNCTION winelio.search_professionals_by_distance(
    p_latitude double precision,
    p_longitude double precision,
    p_category_name text DEFAULT 'all'::text,
    p_commune text DEFAULT NULL::text,
    p_search text DEFAULT NULL::text,
    p_limit integer DEFAULT 250
)
RETURNS TABLE(
    profile_id uuid,
    first_name text,
    last_name text,
    city text,
    latitude double precision,
    longitude double precision,
    company_name text,
    company_alias text,
    company_source text,
    company_description text,
    category_name text,
    distance_km double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = winelio, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      v.profile_id::uuid                AS profile_id,
      v.first_name::text                AS first_name,
      v.last_name::text                 AS last_name,
      v.city::text                      AS city,
      v.latitude::double precision      AS latitude,
      v.longitude::double precision     AS longitude,
      v.company_name::text              AS company_name,
      v.company_alias::text             AS company_alias,
      v.company_source::text            AS company_source,
      v.company_description::text       AS company_description,
      v.category_name::text             AS category_name,
      -- distance calculée une seule fois (l'ancienne version la recalculait dans ORDER BY)
      CASE
        WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL
             AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
          6371 * acos(
            least(greatest(
              cos(radians(p_latitude)) * cos(radians(v.latitude)) *
              cos(radians(v.longitude) - radians(p_longitude)) +
              sin(radians(p_latitude)) * sin(radians(v.latitude)),
              -1.0
            ), 1.0)
          )
        ELSE NULL
      END::double precision             AS distance_km
    FROM winelio.v_search_professionals v
    WHERE (p_category_name IS NULL OR p_category_name = 'all' OR v.category_name = p_category_name)
      AND (p_commune IS NULL OR v.city ILIKE '%' || p_commune || '%')
      AND (
        p_search IS NULL OR
        v.first_name ILIKE '%' || p_search || '%' OR
        v.last_name ILIKE '%' || p_search || '%' OR
        v.company_name ILIKE '%' || p_search || '%' OR
        v.company_alias ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    m.profile_id,
    m.first_name,
    m.last_name,
    m.city,
    m.latitude,
    m.longitude,
    m.company_name,
    m.company_alias,
    m.company_source,
    m.company_description,
    m.category_name,
    m.distance_km
  FROM matched m
  ORDER BY
    m.distance_km ASC NULLS LAST,
    COALESCE(m.company_name, m.last_name) ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer) TO service_role;

ANALYZE winelio.companies;
ANALYZE winelio.profiles;
