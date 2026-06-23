import fs from "fs";
import pg from "pg";

const envFile = fs.readFileSync(".env.local", "utf8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
};

const connectionString = getEnv("SUPABASE_DB_URL");

async function main() {
  console.log("🚀 Deploying function public.search_professionals_by_distance to PostgreSQL...");
  
  const client = new pg.Client({ connectionString });
  await client.connect();
  
  const sql = `
    -- Drop legacy public function if exists
    DROP FUNCTION IF EXISTS public.search_professionals_by_distance(double precision, double precision, text, text, text, integer);

    -- Create function in winelio schema
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

    -- Grant execute privileges on winelio schema function
    GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO public;
    GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO anon;
    GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO authenticated;
    GRANT EXECUTE ON FUNCTION winelio.search_professionals_by_distance TO service_role;
  `;
  
  try {
    await client.query(sql);
    console.log("✅ Function deployed to winelio schema and privileges granted successfully!");
  } catch (err) {
    console.error("❌ Error deploying function:", err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
