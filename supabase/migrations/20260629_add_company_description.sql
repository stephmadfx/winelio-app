-- Add description column to companies if not exists
ALTER TABLE winelio.companies ADD COLUMN IF NOT EXISTS description text;

-- Drop view CASCADE to allow redefining columns
DROP VIEW IF EXISTS winelio.v_search_professionals CASCADE;

-- Create view with company_description
CREATE OR REPLACE VIEW winelio.v_search_professionals AS
  SELECT p.id AS profile_id,
     p.first_name,
     p.last_name,
     COALESCE(c.city, p.city) AS city,
     COALESCE((c.latitude)::double precision, p.latitude) AS latitude,
     COALESCE((c.longitude)::double precision, p.longitude) AS longitude,
     p.is_professional,
     c.name AS company_name,
     c.alias AS company_alias,
     c.source AS company_source,
     c.description AS company_description,
     cat.name AS category_name
    FROM ((winelio.profiles p
      LEFT JOIN winelio.companies c ON (((c.owner_id = p.id) AND (c.deleted_at IS NULL))))
      LEFT JOIN winelio.categories cat ON ((cat.id = c.category_id)))
   WHERE (p.is_professional = true);

-- Recreate search_professionals_by_distance function with company_description
DROP FUNCTION IF EXISTS winelio.search_professionals_by_distance(double precision, double precision, text, text, text, integer);

CREATE OR REPLACE FUNCTION winelio.search_professionals_by_distance(
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.profile_id,
    v.first_name,
    v.last_name,
    v.city,
    v.latitude,
    v.longitude,
    v.company_name,
    v.company_alias,
    v.company_source,
    v.company_description,
    v.category_name,
    CASE
      WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        6371 * acos(
          least(greatest(
            cos(radians(p_latitude)) * cos(radians(v.latitude)) *
            cos(radians(v.longitude) - radians(p_longitude)) +
            sin(radians(p_latitude)) * sin(radians(v.latitude)),
            -1.0
          ), 1.0)
        )
      ELSE NULL
    END::double precision AS distance_km
  FROM winelio.v_search_professionals v
  WHERE (p_category_name = 'all' OR v.category_name = p_category_name)
    AND (p_commune IS NULL OR v.city ILIKE '%' || p_commune || '%')
    AND (
      p_search IS NULL OR
      v.first_name ILIKE '%' || p_search || '%' OR
      v.last_name ILIKE '%' || p_search || '%' OR
      v.company_name ILIKE '%' || p_search || '%' OR
      v.company_alias ILIKE '%' || p_search || '%'
    )
  ORDER BY
    CASE WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
      6371 * acos(
        least(greatest(
          cos(radians(p_latitude)) * cos(radians(v.latitude)) *
          cos(radians(v.longitude) - radians(p_longitude)) +
          sin(radians(p_latitude)) * sin(radians(v.latitude)),
          -1.0
        ), 1.0)
      )
    ELSE NULL END ASC NULLS LAST,
    COALESCE(v.company_name, v.last_name) ASC
  LIMIT p_limit;
END;
$$;
