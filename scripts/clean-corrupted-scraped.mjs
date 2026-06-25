import fs from "fs";
import pg from "pg";

const envFile = fs.readFileSync(".env.local", "utf8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
};

const connectionString = getEnv("SUPABASE_DB_URL");

function normalize(s) {
  if (!s) return "";
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\(.*\)/g, "") // remove parentheses
    .replace(/[^a-z0-9]/g, " ") // replace non-alphanumeric with space
    .replace(/\s+/g, " ") // collapse spaces
    .trim();
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function main() {
  const dryRun = process.argv.includes("--delete") ? false : true;
  console.log(`🚀 Starting database clean audit. Mode: ${dryRun ? "DRY RUN (Audit only)" : "DELETION MODE"}`);

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // 1. Fetch scraped companies
    console.log("📥 Fetching scraped companies...");
    const res = await client.query(`
      SELECT id, name, city, postal_code, address, latitude, longitude, owner_id 
      FROM winelio.companies 
      WHERE source = 'scraped' AND postal_code IS NOT NULL AND postal_code != ''
    `);
    const companies = res.rows;
    console.log(`📊 Found ${companies.length} scraped companies.`);

    // 2. Get unique postal codes
    const uniqueCPs = [...new Set(companies.map(c => c.postal_code))];
    console.log(`🎯 Found ${uniqueCPs.length} unique postal codes.`);

    // 3. Resolve all postal codes in chunks
    console.log("🌐 Resolving postal codes from geo.api.gouv.fr...");
    const cpCache = new Map(); // cp -> { communes: Set, lat, lng }
    const cpQueue = [...uniqueCPs];
    const concurrency = 30;
    const activeCPWorkers = [];
    let cpProcessed = 0;

    async function cpWorker() {
      while (cpQueue.length > 0) {
        const cp = cpQueue.shift();
        try {
          const apiRes = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom,centre`);
          if (apiRes.ok) {
            const data = await apiRes.json();
            if (data && data.length > 0) {
              const communes = new Set(data.map(d => normalize(d.nom)));
              let lat = null;
              let lng = null;
              const centre = data[0].centre;
              if (centre && centre.coordinates) {
                [lng, lat] = centre.coordinates;
              }
              cpCache.set(cp, { communes, lat, lng });
            }
          }
        } catch (err) {
          // ignore
        }
        cpProcessed++;
        if (cpProcessed % 500 === 0) {
          console.log(`   Processed ${cpProcessed}/${uniqueCPs.length} postal codes...`);
        }
      }
    }

    for (let i = 0; i < Math.min(concurrency, cpQueue.length); i++) {
      activeCPWorkers.push(cpWorker());
    }
    await Promise.all(activeCPWorkers);
    console.log(`✅ Loaded ${cpCache.size} postal code mappings.`);

    // 4. Identify potential mismatches to pre-fetch city coordinates
    const potentialMismatches = [];
    const uniqueCitiesToFetch = new Map(); // normCompCity -> rawCityName

    for (const comp of companies) {
      const cpData = cpCache.get(comp.postal_code);
      if (!cpData) continue;

      const normCompCity = normalize(comp.city);
      if (!cpData.communes.has(normCompCity)) {
        uniqueCitiesToFetch.set(normCompCity, comp.city);
        potentialMismatches.push(comp);
      }
    }

    console.log(`\n🔎 Found ${potentialMismatches.length} potential mismatches (out of ${companies.length}).`);
    console.log(`🌐 Fetching coordinates for ${uniqueCitiesToFetch.size} unique mismatched cities...`);

    // 5. Pre-fetch mismatched cities in parallel
    const cityCache = new Map(); // normCompCity -> Array of { nom, lat, lng }
    const cityQueue = Array.from(uniqueCitiesToFetch.entries());
    const activeCityWorkers = [];
    let citiesProcessed = 0;

    async function cityWorker() {
      while (cityQueue.length > 0) {
        const [normCompCity, rawCityName] = cityQueue.shift();
        try {
          const apiRes = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(rawCityName)}&fields=nom,centre,codeDepartement`);
          if (apiRes.ok) {
            const data = await apiRes.json();
            if (data && data.length > 0) {
              const candidates = [];
              for (const item of data) {
                if (item.centre && item.centre.coordinates) {
                  const [lng, lat] = item.centre.coordinates;
                  candidates.push({
                    nom: item.nom,
                    lat,
                    lng,
                    codeDepartement: item.codeDepartement
                  });
                }
              }
              cityCache.set(normCompCity, candidates);
            }
          }
        } catch (err) {
          // ignore
        }
        citiesProcessed++;
        if (citiesProcessed % 100 === 0) {
          console.log(`   Processed ${citiesProcessed}/${uniqueCitiesToFetch.size} cities...`);
        }
      }
    }

    for (let i = 0; i < Math.min(concurrency, cityQueue.length); i++) {
      activeCityWorkers.push(cityWorker());
    }
    await Promise.all(activeCityWorkers);
    console.log(`✅ Loaded ${cityCache.size} city coordinate mappings.`);

    // 6. Audit companies (completely offline now)
    console.log("\n🔍 Auditing companies for mismatches...");
    const corruptedIds = [];
    const ownerIdsToDelete = new Set();
    let matchCount = 0;
    let localMismatchCount = 0; // Neighboring cities (< 30km)
    let noGeoDataCount = 0;

    for (const comp of companies) {
      const cpData = cpCache.get(comp.postal_code);
      if (!cpData) {
        noGeoDataCount++;
        continue;
      }

      const normCompCity = normalize(comp.city);
      
      // If the target city name is in the list of communes for this postal code, it's correct!
      if (cpData.communes.has(normCompCity)) {
        matchCount++;
        continue;
      }

      // Mismatch! Check pre-fetched candidates
      const candidates = cityCache.get(normCompCity);
      if (!candidates || candidates.length === 0 || cpData.lat === null || cpData.lng === null) {
        localMismatchCount++;
        continue;
      }

      // Determine the company's department code
      let dept = comp.postal_code.substring(0, 2);
      if (comp.postal_code.startsWith("97") || comp.postal_code.startsWith("98")) {
        dept = comp.postal_code.substring(0, 3);
      }

      // 1. Try to find matches within the SAME department
      const deptMatches = candidates.filter(c => c.codeDepartement === dept);
      let matchedCommune = null;

      if (deptMatches.length > 0) {
        // Try exact name match in same department
        const exactDeptMatches = deptMatches.filter(c => normalize(c.nom) === normCompCity);
        if (exactDeptMatches.length > 0) {
          matchedCommune = exactDeptMatches[0]; // arbitrary first, usually only one
        } else {
          // Try partial name match (e.g. Evry-Courcouronnes for Evry)
          const partialDeptMatches = deptMatches.filter(c => 
            normalize(c.nom).includes(normCompCity) || normCompCity.includes(normalize(c.nom))
          );
          if (partialDeptMatches.length > 0) {
            // Pick closest if multiple
            let minD = Infinity;
            for (const c of partialDeptMatches) {
              const d = calculateDistance(cpData.lat, cpData.lng, c.lat, c.lng);
              if (d < minD) {
                minD = d;
                matchedCommune = c;
              }
            }
          } else {
            // Fallback to closest commune in same department
            let minD = Infinity;
            for (const c of deptMatches) {
              const d = calculateDistance(cpData.lat, cpData.lng, c.lat, c.lng);
              if (d < minD) {
                minD = d;
                matchedCommune = c;
              }
            }
          }
        }
      }

      // 2. If no candidate in same department, fallback to all candidates regardless of department
      if (!matchedCommune) {
        // Try exact name match
        const exactMatches = candidates.filter(c => normalize(c.nom) === normCompCity);
        if (exactMatches.length > 0) {
          let minD = Infinity;
          for (const c of exactMatches) {
            const d = calculateDistance(cpData.lat, cpData.lng, c.lat, c.lng);
            if (d < minD) {
              minD = d;
              matchedCommune = c;
            }
          }
        } else {
          // Try partial match
          const partialMatches = candidates.filter(c => 
            normalize(c.nom).includes(normCompCity) || normCompCity.includes(normalize(c.nom))
          );
          if (partialMatches.length > 0) {
            let minD = Infinity;
            for (const c of partialMatches) {
              const d = calculateDistance(cpData.lat, cpData.lng, c.lat, c.lng);
              if (d < minD) {
                minD = d;
                matchedCommune = c;
              }
            }
          } else {
            // Fallback to closest overall candidate
            let minD = Infinity;
            for (const c of candidates) {
              const d = calculateDistance(cpData.lat, cpData.lng, c.lat, c.lng);
              if (d < minD) {
                minD = d;
                matchedCommune = c;
              }
            }
          }
        }
      }

      if (!matchedCommune) {
        localMismatchCount++;
        continue;
      }

      const distance = calculateDistance(cpData.lat, cpData.lng, matchedCommune.lat, matchedCommune.lng);

      if (distance > 30) {
        corruptedIds.push(comp.id);
        ownerIdsToDelete.add(comp.owner_id);
        console.log(`❌ Corrupted: "${comp.name}" | Scraped City: ${comp.city} | Actual CP/Address: ${comp.postal_code} (${comp.address}) | Distance: ${Math.round(distance)} km (closest match: ${matchedCommune.nom} [${matchedCommune.codeDepartement}])`);
      } else {
        localMismatchCount++;
      }
    }

    console.log(`\n📊 Audit Statistics:`);
    console.log(`   Correct Matches          : ${matchCount}`);
    console.log(`   Local Mismatches (<30km) : ${localMismatchCount}`);
    console.log(`   No Geo Data              : ${noGeoDataCount}`);
    console.log(`   ⚠️ CORRUPTED Mismatches (>30km) : ${corruptedIds.length}`);

    if (corruptedIds.length === 0) {
      console.log("🎉 No corrupted companies found!");
      return;
    }

    if (dryRun) {
      console.log(`\n📢 Audit complete. ${corruptedIds.length} corrupted companies would be deleted. Run with --delete to proceed.`);
      return;
    }

    // 7. Delete corrupted records
    console.log(`\n🔥 Starting deletion of ${corruptedIds.length} corrupted companies...`);
    const ownerIdsArr = Array.from(ownerIdsToDelete).filter(Boolean);

    // Delete companies
    console.log(`   Deleting ${corruptedIds.length} companies...`);
    const resComp = await client.query(`
      DELETE FROM winelio.companies WHERE id = ANY($1)
    `, [corruptedIds]);
    console.log(`   Deleted ${resComp.rowCount} companies.`);

    if (ownerIdsArr.length > 0) {
      // Delete profiles
      console.log(`   Deleting ${ownerIdsArr.length} profiles...`);
      const resProf = await client.query(`
        DELETE FROM winelio.profiles WHERE id = ANY($1)
      `, [ownerIdsArr]);
      console.log(`   Deleted ${resProf.rowCount} profiles.`);

      // Delete auth users
      console.log(`   Deleting ${ownerIdsArr.length} auth.users...`);
      const resAuth = await client.query(`
        DELETE FROM auth.users WHERE id = ANY($1)
      `, [ownerIdsArr]);
      console.log(`   Deleted ${resAuth.rowCount} auth users.`);
    }

    console.log("✅ Deletion completed successfully!");

  } catch (err) {
    console.error("Error running audit/clean:", err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
