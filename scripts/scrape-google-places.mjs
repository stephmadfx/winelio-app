/**
 * Script de scraping Google Places API → Kiparlo DB
 *
 * Récupère de vrais professionnels depuis Google Maps et les importe
 * comme profils professionnels dans Kiparlo.
 *
 * Usage:
 *   node scripts/scrape-google-places.mjs
 *   node scripts/scrape-google-places.mjs --category plomberie --city Paris --max 50
 *
 * Variables d'environnement requises:
 *   GOOGLE_PLACES_API_KEY=AIza...
 *   SUPABASE_URL=https://...
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ──────────────────────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "AIzaSyCO97R0uHUFnU8X7zYv3Q-FAdxEL54xSTw";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://dxnebmxtkvauergvrmod.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Catégories Kiparlo → mots-clés Google Places ─────────────────────────────

const CATEGORY_KEYWORDS = {
  plomberie:    { id: "2c02fde6-2efd-4c34-a361-93028b139d3c", queries: ["plombier", "chauffagiste"] },
  electricite:  { id: "3d1ecc47-46c1-45fa-ab41-c7b98ba7cd5d", queries: ["électricien", "électricité"] },
  menuiserie:   { id: "292f4dcb-81da-4c16-be6e-a584c1d05fab", queries: ["menuisier", "menuiserie"] },
  maconnerie:   { id: "401446e8-f986-4c95-bc1d-c4cb1763a023", queries: ["maçon", "maçonnerie"] },
  peinture:     { id: "c628c27d-3272-4950-a830-511081fa6e9b", queries: ["peintre", "peinture bâtiment"] },
  jardinage:    { id: "0e5b482d-b5fe-4729-8ff2-af25ce16224f", queries: ["paysagiste", "jardinier"] },
  toiture:      { id: "104ba686-dbbd-47d5-bf9e-228285d44dc2", queries: ["couvreur", "toiture"] },
  nettoyage:    { id: "ce12beb5-d9e4-4745-8b0f-a7cfa6361561", queries: ["entreprise nettoyage", "société nettoyage"] },
  demenagement: { id: "27452504-97af-4455-b67f-0d87dbe188e3", queries: ["déménageur", "déménagement"] },
  informatique: { id: "9463e181-31c3-48f0-af94-a567afb7d02b", queries: ["informaticien", "dépannage informatique"] },
  automobile:   { id: "9580e735-9314-437e-8cb2-8ac34a3f59c7", queries: ["garagiste", "mécanicien auto"] },
  assurance:    { id: "bccd04ae-29de-4cac-9bb8-7541205c700c", queries: ["courtier assurance", "assureur"] },
  comptabilite: { id: "7bd8aef3-daf2-4e0e-bab5-ab1641343e49", queries: ["comptable", "expert-comptable"] },
  juridique:    { id: "64610e40-df24-4032-af69-45369fb5a567", queries: ["avocat", "cabinet juridique"] },
  immobilier:   { id: "6187d5e3-14ac-459b-a83e-52fd4e5eedd1", queries: ["agence immobilière", "agent immobilier"] },
  evenementiel: { id: "25706267-461d-4fcb-afad-dc0c0b748e6b", queries: ["organisateur événement", "wedding planner"] },
};

// Villes cibles
const CITIES = [
  "Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux",
  "Nantes", "Strasbourg", "Lille", "Rennes", "Montpellier",
];

// ─── Arguments CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const targetCategory = getArg("category");
const targetCity = getArg("city");
const maxPerQuery = parseInt(getArg("max") || "20", 10);
const dryRun = args.includes("--dry-run");

const categoriesToProcess = targetCategory
  ? { [targetCategory]: CATEGORY_KEYWORDS[targetCategory] }
  : CATEGORY_KEYWORDS;

const citiesToProcess = targetCity ? [targetCity] : CITIES;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractPostalCode(address) {
  const match = address?.match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

function extractCity(address) {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  // Format typique: "21 Rue Davy, 75017 Paris, France"
  // On cherche la partie avec code postal + ville
  for (const part of parts) {
    const m = part.match(/^\d{5}\s+(.+)$/);
    if (m) return m[1].trim();
  }
  // Sinon prendre l'avant-dernière partie (avant "France")
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    if (candidate && candidate !== "France") return candidate;
  }
  return null;
}

async function searchPlaces(query, city, pageToken = null) {
  const base = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    language: "fr",
    region: "fr",
  });

  if (pageToken) {
    params.set("pagetoken", pageToken);
  } else {
    params.set("query", `${query} ${city} France`);
  }

  const res = await fetch(`${base}?${params}`);
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  return res.json();
}

async function getPlaceDetails(placeId) {
  const base = "https://maps.googleapis.com/maps/api/place/details/json";
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    place_id: placeId,
    fields: "name,formatted_address,formatted_phone_number,website,geometry,address_components",
    language: "fr",
  });

  const res = await fetch(`${base}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.result || null;
}

// ─── Import dans Supabase ─────────────────────────────────────────────────────

const importedPlaceIds = new Set();

async function importProfessional(place, categorySlug, categoryId) {
  if (importedPlaceIds.has(place.place_id)) return { skipped: true, reason: "duplicate" };
  importedPlaceIds.add(place.place_id);

  // Récupère détails complets (téléphone, website)
  let details = null;
  try {
    details = await getPlaceDetails(place.place_id);
    await sleep(100); // rate limiting
  } catch (e) {
    // ignore, on utilise les données de base
  }

  const name = place.name;
  const address = details?.formatted_address || place.formatted_address || "";
  const phone = details?.formatted_phone_number || null;
  const website = details?.website || null;
  const lat = place.geometry?.location?.lat || null;
  const lng = place.geometry?.location?.lng || null;
  const postalCode = extractPostalCode(address);
  const city = extractCity(address);

  // Email fictif basé sur place_id (unique, mais non-fonctionnel)
  const email = `pro.${place.place_id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}@kiparlo-pro.fr`;

  if (dryRun) {
    console.log(`[DRY-RUN] ${name} | ${city} | ${phone || "no phone"} | ${email}`);
    return { success: true, dry: true };
  }

  // 1. Crée l'utilisateur auth via Admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "google_places", place_id: place.place_id },
  });

  if (authError) {
    if (authError.message?.includes("already registered")) {
      return { skipped: true, reason: "email_exists" };
    }
    console.error(`  ❌ Auth error for ${name}:`, authError.message);
    return { error: authError.message };
  }

  const userId = authData.user.id;

  // 2. Met à jour le profil (créé automatiquement par le trigger)
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      first_name: "",
      last_name: name,
      phone,
      is_professional: true,
      address,
      city,
      postal_code: postalCode,
      latitude: lat,
      longitude: lng,
    })
    .eq("id", userId);

  if (profileError) {
    console.error(`  ❌ Profile error for ${name}:`, profileError.message);
  }

  // 3. Crée l'entreprise
  const { error: companyError } = await supabase.from("companies").insert({
    owner_id: userId,
    name,
    phone,
    website,
    address,
    city,
    postal_code: postalCode,
    latitude: lat,
    longitude: lng,
    category_id: categoryId,
    is_verified: false,
  });

  if (companyError) {
    console.error(`  ❌ Company error for ${name}:`, companyError.message);
  }

  return { success: true, userId, name, city };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Démarrage du scraping Google Places → Kiparlo");
  console.log(`   Mode: ${dryRun ? "DRY-RUN (aucune insertion)" : "LIVE"}`);
  console.log(`   Catégories: ${Object.keys(categoriesToProcess).join(", ")}`);
  console.log(`   Villes: ${citiesToProcess.join(", ")}`);
  console.log(`   Max par requête: ${maxPerQuery}\n`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [catSlug, catConfig] of Object.entries(categoriesToProcess)) {
    if (!catConfig) {
      console.warn(`⚠️  Catégorie inconnue: ${catSlug}`);
      continue;
    }

    for (const city of citiesToProcess) {
      for (const query of catConfig.queries) {
        console.log(`\n📍 ${catSlug} / ${city} / "${query}"`);

        let pageToken = null;
        let imported = 0;

        do {
          const data = await searchPlaces(query, city, pageToken);

          if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
            console.error(`  ❌ API error: ${data.status} — ${data.error_message || ""}`);
            break;
          }

          for (const place of data.results || []) {
            if (imported >= maxPerQuery) break;

            process.stdout.write(`  → ${place.name.slice(0, 40).padEnd(40)} `);
            const result = await importProfessional(place, catSlug, catConfig.id);

            if (result.dry) {
              process.stdout.write("✓ (dry-run)\n");
              imported++;
              totalImported++;
            } else if (result.success) {
              process.stdout.write(`✅ ${result.city || ""}\n`);
              imported++;
              totalImported++;
            } else if (result.skipped) {
              process.stdout.write(`⏭  ${result.reason}\n`);
              totalSkipped++;
            } else {
              process.stdout.write(`❌ error\n`);
              totalErrors++;
            }

            await sleep(200); // respecte le rate limit
          }

          pageToken = data.next_page_token || null;
          if (pageToken) await sleep(2000); // Google demande d'attendre avant next page

        } while (pageToken && imported < maxPerQuery);

        await sleep(500);
      }
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(`✅ Terminé!`);
  console.log(`   Importés : ${totalImported}`);
  console.log(`   Ignorés  : ${totalSkipped}`);
  console.log(`   Erreurs  : ${totalErrors}`);
}

main().catch(console.error);
