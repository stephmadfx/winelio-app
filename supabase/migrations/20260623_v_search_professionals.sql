-- Deploy v_search_professionals view for faster server-side search in recommendations flow
CREATE OR REPLACE VIEW winelio.v_search_professionals AS
SELECT 
  p.id AS profile_id,
  p.first_name,
  p.last_name,
  COALESCE(c.city, p.city) AS city,
  COALESCE(c.latitude, p.latitude) AS latitude,
  COALESCE(c.longitude, p.longitude) AS longitude,
  p.is_professional,
  c.name AS company_name,
  c.alias AS company_alias,
  c.source AS company_source,
  cat.name AS category_name
FROM winelio.profiles p
LEFT JOIN winelio.companies c ON c.owner_id = p.id AND c.deleted_at IS NULL
LEFT JOIN winelio.categories cat ON cat.id = c.category_id
WHERE p.is_professional = true;

-- Grant SELECT access
GRANT SELECT ON winelio.v_search_professionals TO public;
GRANT SELECT ON winelio.v_search_professionals TO authenticated;
GRANT SELECT ON winelio.v_search_professionals TO service_role;
GRANT SELECT ON winelio.v_search_professionals TO anon;
