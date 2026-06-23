-- Drop legacy public function if exists
DROP FUNCTION IF EXISTS public.search_professionals_by_distance(double precision, double precision, text, text, text, integer);

-- Create search_professionals_by_distance function for distance-sorted professional search
CREATE OR REPLACE FUNCTION winelio.search_professionals_by_distance(
  p_latitude double precision,
  p_longitude double precision,
  p_category_name text DEFAULT 'all',
  p_commune text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 250
)
RETURNS TABLE (
  profile_id uuid,
  first_name text,
  last_name text,
  city text,
  latitude double precision,
  longitude double precision,
  company_name text,
  company_alias text,
  company_source text,
  category_name text,
  distance_km double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.profile_id::uuid,
    v.first_name::text,
    v.last_name::text,
    v.city::text,
    v.latitude::double precision,
    v.longitude::double precision,
    v.company_name::text,
    v.company_alias::text,
    v.company_source::text,
    v.category_name::text,
    CASE 
      WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
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

-- Grant execute privileges
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO public;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO anon;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO authenticated;
GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO service_role;
