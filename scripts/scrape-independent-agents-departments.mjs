/**
 * Script de scraping des agents immobiliers indépendants par DÉPARTEMENT en France.
 * 
 * Filtres :
 *   - Note Google >= 4.0
 *   - Nombre d'avis >= 4
 *   - Cible les 101 départements français
 *   - Mots-clés élargis ciblés sur les réseaux de mandataires
 *   - Récupération des e-mails en priorité sur leurs sites web
 * 
 * Partage le même fichier de sortie et de cache que le script par ville.
 * 
 * Usage:
 *   node scripts/scrape-independent-agents-departments.mjs
 *   node scripts/scrape-independent-agents-departments.mjs --limit-depts 5
 *   node scripts/scrape-independent-agents-departments.mjs --dept "Nord"
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

// ─── Configuration ────────────────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY manquant dans l'environnement");
  process.exit(1);
}
const OUTPUT_DIR = "./outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "agents_independants_france.csv");
const PROCESSED_IDS_FILE = path.join(OUTPUT_DIR, "agents_independants_processed_ids.txt");
const processedPlaceIds = new Set();

// Mots-clés de recherche pour les indépendants (génériques + grands réseaux)
const SEARCH_QUERIES = [
  "mandataire immobilier",
  "agent immobilier independant",
  "iad France",
  "SAFTI",
  "Capifrance",
  "Optimhome",
  "BSK Immobilier",
  "Proprietes Privees",
  "Megagence",
  "Efficity",
  "Dr House Immo",
  "RE/MAX",
  "Sextant France",
  "3G Immo",
  "chasseur immobilier",
  "coach immobilier"
];

// ─── Arguments CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const limitDepts = parseInt(getArg("limit-depts") || "0", 10);
const targetDept = getArg("dept");
const skipPuppeteer = args.includes("--skip-puppeteer");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout(promise, ms, defaultValue = null) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve(defaultValue);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function extractPostalCode(address) {
  const match = address?.match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  str = str.replace(/\r?\n|\r/g, " ");
  if (str.includes('"') || str.includes(';') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function loadProcessedPlaceIds() {
  // 1. Charger depuis le fichier de cache de suivi s'il existe
  if (fs.existsSync(PROCESSED_IDS_FILE)) {
    try {
      const content = fs.readFileSync(PROCESSED_IDS_FILE, "utf8");
      content.split("\n").forEach(id => {
        const trimmed = id.trim();
        if (trimmed) {
          processedPlaceIds.add(trimmed);
        }
      });
      console.log(`ℹ️ Chargement de ${processedPlaceIds.size} Place IDs traités depuis le fichier de cache.`);
    } catch (err) {
      console.error("⚠️ Impossible de lire le fichier de cache des Place IDs:", err.message);
    }
  }

  // 2. Charger depuis le fichier CSV lui-même
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const content = fs.readFileSync(OUTPUT_FILE, "utf8");
      const lines = content.split("\n");
      let csvLoadedCount = 0;
      for (const line of lines) {
        const parts = line.split(";");
        if (parts.length > 9) {
          const placeId = parts[9].replace(/^"|"$/g, "").trim();
          if (placeId && placeId !== "Place ID") {
            if (!processedPlaceIds.has(placeId)) {
              processedPlaceIds.add(placeId);
              csvLoadedCount++;
            }
          }
        }
      }
      if (csvLoadedCount > 0) {
        console.log(`ℹ️ Chargement de ${csvLoadedCount} Place IDs supplémentaires depuis le fichier CSV.`);
      }
    } catch (err) {
      console.error("⚠️ Impossible de lire le fichier CSV pour extraire les Place IDs:", err.message);
    }
  }
}

function markPlaceIdAsProcessed(placeId) {
  processedPlaceIds.add(placeId);
  try {
    fs.appendFileSync(PROCESSED_IDS_FILE, placeId + "\n", "utf8");
  } catch (err) {
    console.error("⚠️ Impossible d'écrire dans le fichier de cache des Place IDs:", err.message);
  }
}

function initCSVFile() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    console.log(`ℹ️ Le fichier CSV existe déjà. Les nouveaux résultats y seront ajoutés.`);
    return;
  }

  const headers = [
    "Nom",
    "Ville",
    "Note Google",
    "Nombre d'avis",
    "Téléphone",
    "Email",
    "Site Web",
    "Adresse",
    "Code Postal",
    "Place ID"
  ];
  
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const content = headers.map(escapeCSV).join(";") + "\n";
  fs.writeFileSync(OUTPUT_FILE, Buffer.concat([bom, Buffer.from(content)]));
}

function appendToCSV(row) {
  const content = [
    row.name,
    row.city,
    row.rating,
    row.reviewsCount,
    row.phone,
    row.email,
    row.website,
    row.address,
    row.postalCode,
    row.placeId
  ].map(escapeCSV).join(";") + "\n";
  
  fs.appendFileSync(OUTPUT_FILE, content, "utf8");
}

// ─── Google Places API ────────────────────────────────────────────────────────

async function searchPlaces(query, location, pageToken) {
  const base = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    query: `${query} ${location} France`,
    language: "fr",
    region: "fr"
  });

  if (pageToken) {
    params.set("pagetoken", pageToken);
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
    fields: "name,formatted_address,formatted_phone_number,website,address_components",
    language: "fr"
  });

  const res = await fetch(`${base}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.result || null;
}

// ─── Extraction des E-mails ──────────────────────────────────────────────────

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})/gi;
const EMAIL_REGEX  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;

const EXCLUDED_EMAIL_DOMAINS = [
  "example.com", "test.com", "sentry.io", "google.com", "facebook.com",
  "instagram.com", "twitter.com", "linkedin.com", "youtube.com",
  "wordpress.com", "wixsite.com", "jimdo.com", "squarespace.com",
  "w3.org", "schema.org", "mozilla.org", "apple.com", "microsoft.com",
  "domain.com", "email.com"
];
const EXCLUDED_EMAIL_PATTERNS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
  ".css", ".js", ".php", ".html", ".xml", ".json",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp4", ".pdf", ".zip", ".tar", ".gz"
];

function isValidEmail(email) {
  const lower = email.toLowerCase().trim();
  if (EXCLUDED_EMAIL_PATTERNS.some((p) => lower.includes(p))) return false;
  if (EXCLUDED_EMAIL_DOMAINS.some((d) => lower.endsWith("@" + d) || lower.includes("@" + d + "."))) return false;
  if (email.length > 80) return false;
  if (!/^.{2,}@.+\..{2,}$/.test(email)) return false;
  
  const EXCLUDED_SUBSTRINGS = ["sentry", "example", "exemple", "domaine.", "test.", "testing"];
  if (EXCLUDED_SUBSTRINGS.some(sub => lower.includes(sub))) return false;

  const localPart = lower.split("@")[0];
  const EXCLUDED_LOCAL_PARTS = [
    "john", "jane", "test", "demo", "yourname",
    "mentions-legales", "mentionslegales", "mentions_legales",
    "donneespersonnelles", "donnees-personnelles", "donnees_personnelles",
    "rgpd", "dpo", "abuse", "webmaster", "postmaster", "legal", "privacy", "compliance",
    "noreply", "no-reply", "hosting", "support", "admin"
  ];
  if (EXCLUDED_LOCAL_PARTS.includes(localPart)) return false;
  
  return true;
}

function normalizeUrl(url) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/$/, "");
}

async function fetchHtml(url, timeoutMs = 6000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
      },
      signal: controller.signal,
      redirect: "follow"
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractEmailsFromHtml(html) {
  const mailtoMatches = [...html.matchAll(MAILTO_REGEX)].map((m) => m[1]);
  const validMailtos = mailtoMatches.filter(isValidEmail);
  if (validMailtos.length > 0) return [...new Set(validMailtos)];

  const rawMatches = html.match(EMAIL_REGEX) || [];
  const validRaws = rawMatches.filter(isValidEmail);
  return [...new Set(validRaws)];
}

async function scrapeEmailHttp(websiteUrl) {
  const base = normalizeUrl(websiteUrl);
  if (!base) return null;

  const pagesToTry = [
    base,
    `${base}/contact`,
    `${base}/nous-contacter`,
    `${base}/contactez-nous`,
    `${base}/mentions-legales`
  ];

  for (const url of pagesToTry) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const emails = extractEmailsFromHtml(html);
    if (emails.length > 0) return emails[0];
    await sleep(200);
  }
  return null;
}

async function scrapeEmailPuppeteer(browser, websiteUrl) {
  const base = normalizeUrl(websiteUrl);
  if (!base) return null;

  const pagesToTry = [
    base,
    `${base}/contact`,
    `${base}/nous-contacter`,
    `${base}/contactez-nous`,
    `${base}/mentions-legales`
  ];

  for (const url of pagesToTry) {
    let page;
    try {
      page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const type = req.resourceType();
        if (["image", "font", "stylesheet", "media"].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
      await sleep(1500);

      const content = await page.content();
      await page.close();

      const emails = extractEmailsFromHtml(content);
      if (emails.length > 0) return emails[0];
    } catch {
      try { await page?.close(); } catch {}
    }
    await sleep(300);
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Lancement du scraping des agents immobiliers INDÉPENDANTS par DÉPARTEMENT");
  console.log(`   Note minimale : >= 4.0`);
  console.log(`   Nombre minimal d'avis : >= 4`);
  console.log(`   Mode Puppeteer : ${skipPuppeteer ? "DÉSACTIVÉ" : "ACTIVÉ"}`);
  console.log("------------------------------------------------------------\n");

  // Récupérer la liste des départements depuis l'API officielle
  console.log("Fetching departments from geo.api.gouv.fr...");
  const deptRes = await fetch("https://geo.api.gouv.fr/departements?fields=nom,code");
  if (!deptRes.ok) {
    throw new Error(`Failed to fetch departments: ${deptRes.status}`);
  }
  let departments = await deptRes.json();
  console.log(`Loaded ${departments.length} departments.`);

  // Filtrer les départements selon les arguments
  if (targetDept) {
    departments = departments.filter(d => 
      d.nom.toLowerCase().includes(targetDept.toLowerCase()) || 
      d.code === targetDept
    );
    if (departments.length === 0) {
      console.error(`Aucun département trouvé pour : ${targetDept}`);
      process.exit(1);
    }
  } else if (limitDepts > 0) {
    departments = departments.slice(0, limitDepts);
  }

  console.log(`Départements à traiter : ${departments.length}\n`);

  loadProcessedPlaceIds();
  initCSVFile();
  console.log(`📝 Fichier CSV configuré dans : ${OUTPUT_FILE}\n`);

  let browser = null;
  if (!skipPuppeteer) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
  }

  let totalProcessed = 0;
  let totalFoundWithEmail = 0;
  let totalFilteredOut = 0;

  try {
    for (let d = 0; d < departments.length; d++) {
      const dept = departments[d];
      console.log(`📍 [${d + 1}/${departments.length}] Département : ${dept.nom} (${dept.code})...`);
      
      let combinedResults = [];
      const seenPlaceIds = new Set();

      for (const query of SEARCH_QUERIES) {
        try {
          const searchData = await searchPlaces(query, `${dept.nom} ${dept.code}`);
          const results = searchData.results || [];
          results.forEach(place => {
            if (!seenPlaceIds.has(place.place_id)) {
              seenPlaceIds.add(place.place_id);
              combinedResults.push(place);
            }
          });
          await sleep(150);
        } catch (err) {
          console.error(`  ❌ Erreur de recherche (${query}) pour le dept ${dept.nom}:`, err.message);
        }
      }

      console.log(`  🔍 ${combinedResults.length} établissements trouvés. Filtrage...`);

      const filteredResults = combinedResults.filter(place => {
        const rating = place.rating || 0;
        const reviews = place.user_ratings_total || 0;
        const matches = rating >= 4.0 && reviews >= 4;
        if (!matches) totalFilteredOut++;
        return matches;
      });

      console.log(`  🎯 ${filteredResults.length} agents qualifiés (note >= 4.0, avis >= 4)`);

      const CONCURRENCY = 4;
      for (let i = 0; i < filteredResults.length; i += CONCURRENCY) {
        const batch = filteredResults.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async (place, batchIdx) => {
          const currentIndex = i + batchIdx + 1;
          
          if (processedPlaceIds.has(place.place_id)) {
            console.log(`    ↳ [${currentIndex}/${filteredResults.length}] ${place.name.slice(0, 35).padEnd(35)} | Note: ${place.rating} (Déjà traité, ignoré)`);
            return;
          }

          let logBuffer = `    ↳ [${currentIndex}/${filteredResults.length}] ${place.name.slice(0, 35).padEnd(35)} | Note: ${place.rating} (${place.user_ratings_total} avis) `;

          let details = null;
          try {
            details = await getPlaceDetails(place.place_id);
            await sleep(100);
          } catch (err) {
            logBuffer += `❌ Details: ${err.message}`;
            console.log(logBuffer);
            return;
          }

          const website = details?.website || null;
          const phone = details?.formatted_phone_number || "";
          const address = details?.formatted_address || place.formatted_address || "";
          const postalCode = extractPostalCode(address);

          // Extraire le nom de la ville de l'adresse
          let city = dept.nom; 
          if (address) {
            const parts = address.split(",");
            for (const part of parts) {
              const m = part.trim().match(/^\d{5}\s+(.+)$/);
              if (m) {
                city = m[1].trim();
                break;
              }
            }
          }

          let email = "";
          if (website) {
            logBuffer += `🌐 `;
            try {
              email = await withTimeout((async () => {
                let e = null;
                try {
                  e = await scrapeEmailHttp(website);
                } catch { /* ignore */ }

                if (!e && browser) {
                  logBuffer += `🕷️ `;
                  try {
                    e = await scrapeEmailPuppeteer(browser, website);
                  } catch { /* ignore */ }
                }
                return e;
              })(), 35000, null);
            } catch (err) {
              // ignore
            }
          }

          if (email) {
            logBuffer += `📧 ${email}`;
            totalFoundWithEmail++;

            appendToCSV({
              name: place.name,
              city: city,
              rating: place.rating || "",
              reviewsCount: place.user_ratings_total || "",
              phone: phone,
              email: email,
              website: website || "",
              address: address,
              postalCode: postalCode,
              placeId: place.place_id
            });
          } else {
            logBuffer += website ? `⚪ E-mail introuvable` : `⚪ Pas de site web`;
          }

          console.log(logBuffer);
          markPlaceIdAsProcessed(place.place_id);
          totalProcessed++;
        }));
      }
      
      console.log(`  ✅ Département ${dept.nom} (${dept.code}) terminé.\n`);
      await sleep(500);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log("============================================================");
  console.log("🏁 Scraping par département terminé !");
  console.log(`   Total d'établissements qualifiés traités : ${totalProcessed}`);
  console.log(`   Filtre note < 4.0 ou avis < 4 exclus    : ${totalFilteredOut}`);
  console.log(`   E-mails trouvés                         : ${totalFoundWithEmail}`);
  console.log(`   Fichier CSV mis à jour                  : ${OUTPUT_FILE}`);
  console.log("============================================================");
}

main().catch(console.error);
