import fs from "fs";
import pg from "pg";

const envFile = fs.readFileSync(".env.local", "utf8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
};

const connectionString = getEnv("SUPABASE_DB_URL");

async function main() {
  console.log("🚀 Starting coordinates backfill for scraped professionals...");
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // 1. Get all distinct postal_code with null coordinates
    const resCodes = await client.query(`
      SELECT DISTINCT postal_code 
      FROM winelio.companies 
      WHERE (latitude IS NULL OR longitude IS NULL) AND postal_code IS NOT NULL AND postal_code != ''
    `);
    
    const codes = resCodes.rows.map(r => r.postal_code);
    console.log(`🎯 Found ${codes.length} distinct postal codes to geocode.`);

    if (codes.length === 0) {
      console.log("✅ All postal codes are already geocoded!");
      return;
    }

    // Cache of postal code -> { lat, lng }
    const geoCache = new Map();
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    // 2. Fetch coordinates from geo.api.gouv.fr in chunks
    const concurrency = 10;
    const queue = [...codes];
    const activeWorkers = [];

    async function worker() {
      while (queue.length > 0) {
        const cp = queue.shift();
        try {
          const res = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom,centre`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
              const centre = data[0].centre;
              if (centre && centre.coordinates) {
                const [lng, lat] = centre.coordinates;
                geoCache.set(cp, { lat, lng });
                successCount++;
              }
            }
          }
        } catch (err) {
          // console.error(`Error fetching CP ${cp}:`, err.message);
          errorCount++;
        }

        processedCount++;
        if (processedCount % 100 === 0) {
          console.log(`   Fetched ${processedCount}/${codes.length} postal codes (Success: ${successCount}, Errors/No data: ${errorCount})...`);
        }
      }
    }

    console.log(`📥 Querying geo.api.gouv.fr with concurrency ${concurrency}...`);
    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
      activeWorkers.push(worker());
    }
    await Promise.all(activeWorkers);

    console.log(`\n✅ Finished fetching coordinates. Got ${geoCache.size} valid coordinate mappings.`);
    console.log("💾 Updating database...");

    // 3. Update database companies and profiles in batches
    let updatedCompanies = 0;
    let updatedProfiles = 0;
    
    // Disable triggers or just run updates. Since updates are simple, standard UPDATE query is fine.
    const cacheEntries = Array.from(geoCache.entries());
    let updateIndex = 0;

    for (const [cp, coords] of cacheEntries) {
      // Update companies
      const resComp = await client.query(`
        UPDATE winelio.companies 
        SET latitude = $1, longitude = $2 
        WHERE postal_code = $3 AND (latitude IS NULL OR longitude IS NULL)
      `, [coords.lat, coords.lng, cp]);
      updatedCompanies += resComp.rowCount;

      // Update profiles (matching owners of those companies)
      const resProf = await client.query(`
        UPDATE winelio.profiles 
        SET latitude = $1, longitude = $2 
        WHERE id IN (
          SELECT owner_id FROM winelio.companies WHERE postal_code = $3
        ) AND (latitude IS NULL OR longitude IS NULL)
      `, [coords.lat, coords.lng, cp]);
      updatedProfiles += resProf.rowCount;

      updateIndex++;
      if (updateIndex % 200 === 0) {
        console.log(`   Updated ${updateIndex}/${geoCache.size} mappings... (Companies: ${updatedCompanies}, Profiles: ${updatedProfiles})`);
      }
    }

    console.log(`\n============================================================`);
    console.log(`🏁 Coordinates backfill complete!`);
    console.log(`   Companies updated : ${updatedCompanies}`);
    console.log(`   Profiles updated  : ${updatedProfiles}`);
    console.log(`============================================================`);

  } catch (err) {
    console.error("Critical error in backfill:", err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
