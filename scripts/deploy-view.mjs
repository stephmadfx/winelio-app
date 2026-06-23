import fs from "fs";
import pg from "pg";

const envFile = fs.readFileSync(".env.local", "utf8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
};

const connectionString = getEnv("SUPABASE_DB_URL");

async function main() {
  console.log("🚀 Deploying view v_search_professionals to PostgreSQL...");
  
  const client = new pg.Client({ connectionString });
  await client.connect();
  
  const sql = `
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
    
    -- Grant SELECT access to public, authenticated and service_role
    GRANT SELECT ON winelio.v_search_professionals TO public;
    GRANT SELECT ON winelio.v_search_professionals TO authenticated;
    GRANT SELECT ON winelio.v_search_professionals TO service_role;
    GRANT SELECT ON winelio.v_search_professionals TO anon;
  `;
  
  try {
    await client.query(sql);
    console.log("✅ View deployed and privileges granted successfully!");
  } catch (err) {
    console.error("❌ Error deploying view:", err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
