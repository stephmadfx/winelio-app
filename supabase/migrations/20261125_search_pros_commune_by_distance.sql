-- La ville choisie (nom officiel geo.api.gouv.fr) était comparée au texte saisi par le pro
-- ("Grenade-sur-l'Adour" vs "GRENADE SUR L ADOUR", "Saint-Perdon" vs "St Perdon") : 0 résultat.
-- Le centre de la commune sert déjà de point de départ du tri par distance : p_commune est ignoré.
CREATE OR REPLACE FUNCTION winelio.search_professionals_by_distance(p_latitude double precision, p_longitude double precision, p_category_name text DEFAULT 'all'::text, p_commune text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 250)
 RETURNS TABLE(profile_id uuid, first_name text, last_name text, city text, latitude double precision, longitude double precision, company_name text, company_alias text, company_source text, company_description text, category_name text, distance_km double precision, geo_precision text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'winelio', 'public', 'pg_temp'
AS $function$
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
      -- p_commune conservé pour compatibilité, la proximité suffit
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
$function$

;
