-- Niveau de précision de la position des entreprises.
--
-- Jusqu'ici toutes les coordonnées provenaient de scripts/backfill-coordinates.mjs,
-- qui interrogeait geo.api.gouv.fr par code postal et posait donc le *centre de la
-- commune* sur chaque fiche : 753 entreprises parisiennes partagent le même point.
-- Une distance calculée depuis ces coordonnées ne veut rien dire, ce qui produisait
-- « 0 m » sur la totalité des résultats de recherche.
--
-- Le géocodage à l'adresse (scripts/geocode-companies.mjs, Base Adresse Nationale)
-- ne peut couvrir qu'une partie de la base : 56 % des fiches scrapées n'ont que le
-- nom de leur commune en guise d'adresse. La base sera donc durablement à deux
-- vitesses, d'où cette colonne : elle dit ce que vaut chaque point, pour que
-- l'affichage n'annonce une distance que lorsqu'elle est réelle.
--
-- Valeurs, de la plus fine à la plus grossière :
--   housenumber  -- numéro de rue : distance fiable, précision métrique
--   street       -- voie sans numéro : distance fiable à ~100 m
--   municipality -- centre de commune : AUCUNE distance exploitable

BEGIN;

ALTER TABLE winelio.companies
  ADD COLUMN IF NOT EXISTS geo_precision text,
  ADD COLUMN IF NOT EXISTS geo_source    text;

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS geo_precision text;

DO $$
BEGIN
  ALTER TABLE winelio.companies
    ADD CONSTRAINT companies_geo_precision_check
    CHECK (geo_precision IS NULL OR geo_precision IN ('housenumber', 'street', 'municipality'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE winelio.profiles
    ADD CONSTRAINT profiles_geo_precision_check
    CHECK (geo_precision IS NULL OR geo_precision IN ('housenumber', 'street', 'municipality'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Toutes les coordonnées présentes à ce jour sont des centres de commune, sans
-- exception : elles viennent toutes du backfill par code postal. Le géocodage à
-- l'adresse relèvera ensuite ce niveau pour les fiches qu'il parvient à situer.
UPDATE winelio.companies
SET geo_precision = 'municipality'
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geo_precision IS NULL;

UPDATE winelio.profiles
SET geo_precision = 'municipality'
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geo_precision IS NULL;

-- Le géocodage ne traite que les fiches dont l'adresse commence par un numéro ;
-- cet index évite un seq scan de 47k lignes à chaque relance du script.
CREATE INDEX IF NOT EXISTS companies_geo_precision_idx
  ON winelio.companies (geo_precision)
  WHERE deleted_at IS NULL;

-- La précision doit suivre exactement la même branche que les coordonnées :
-- si le point retenu est celui du profil, c'est la précision du profil qui vaut.
CREATE OR REPLACE VIEW winelio.v_search_professionals AS
 SELECT p.id AS profile_id,
    p.first_name,
    p.last_name,
    COALESCE(c.city, p.city) AS city,
    COALESCE(c.latitude::double precision, p.latitude) AS latitude,
    COALESCE(c.longitude::double precision, p.longitude) AS longitude,
    p.is_professional,
    c.name AS company_name,
    c.alias AS company_alias,
    c.source AS company_source,
    c.description AS company_description,
    cat.name AS category_name,
    CASE
      WHEN c.latitude IS NOT NULL AND c.longitude IS NOT NULL THEN c.geo_precision
      ELSE p.geo_precision
    END AS geo_precision
   FROM winelio.profiles p
     LEFT JOIN winelio.companies c ON c.owner_id = p.id AND c.deleted_at IS NULL
     LEFT JOIN winelio.categories cat ON cat.id = c.category_id
  WHERE p.is_professional = true;

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
    distance_km double precision,
    geo_precision text
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
      v.geo_precision::text             AS geo_precision,
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
    m.distance_km,
    m.geo_precision
  FROM matched m
  ORDER BY
    -- Tri au kilomètre, puis les fiches réellement situées d'abord. Sans ce
    -- second critère, une fiche restée au centre de la commune affiche 0 km et
    -- devance systématiquement le pro effectivement le plus proche, qui se
    -- retrouve enterré derrière une centaine de fiches imprécises. Le
    -- regroupement au kilomètre correspond à ce que l'interface affiche.
    floor(m.distance_km) ASC NULLS LAST,
    (m.geo_precision IN ('housenumber', 'street')) DESC,
    m.distance_km ASC NULLS LAST,
    COALESCE(m.company_name, m.last_name) ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer) TO service_role;

COMMIT;
