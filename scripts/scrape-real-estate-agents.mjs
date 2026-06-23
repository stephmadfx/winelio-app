/**
 * Script de scraping des meilleurs agents immobiliers en France.
 * 
 * Filtres :
 *   - Note Google >= 4.0
 *   - Nombre d'avis >= 20
 *   - Cible les 100 plus grandes villes de France
 *   - Récupération des e-mails en priorité sur leurs sites web
 * 
 * Usage:
 *   node scripts/scrape-real-estate-agents.mjs
 *   node scripts/scrape-real-estate-agents.mjs --limit-cities 3
 *   node scripts/scrape-real-estate-agents.mjs --city Lille
 *   node scripts/scrape-real-estate-agents.mjs --skip-puppeteer
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
const OUTPUT_FILE = path.join(OUTPUT_DIR, "agents_immobiliers_france.csv");

// 100 plus grandes villes de France par population municipale
const CITIES = [
  "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Montpellier", "Strasbourg", "Bordeaux", "Lille",
  "Rennes", "Reims", "Toulon", "Saint-Étienne", "Le Havre", "Grenoble", "Dijon", "Angers", "Villeurbanne", "Saint-Denis (La Réunion)",
  "Nîmes", "Clermont-Ferrand", "Aix-en-Provence", "Le Mans", "Brest", "Tours", "Amiens", "Limoges", "Annecy", "Boulogne-Billancourt",
  "Perpignan", "Metz", "Besançon", "Orléans", "Saint-Denis (Seine-Saint-Denis)", "Rouen", "Argenteuil", "Mulhouse", "Montreuil", "Caen",
  "Nancy", "Saint-Paul (La Réunion)", "Roubaix", "Tourcoing", "Nanterre", "Vitry-sur-Seine", "Avignon", "Créteil", "Dunkerque", "Poitiers",
  "Asnières-sur-Seine", "Versailles", "Colombes", "Saint-Pierre (La Réunion)", "Aubervilliers", "Aulnay-sous-Bois", "Courbevoie", "Cherbourg-en-Cotentin", "Rueil-Malmaison", "Champigny-sur-Marne",
  "Pau", "Béziers", "Calais", "La Rochelle", "Saint-Maur-des-Fossés", "Saint-Nazaire", "Antibes", "Draguignan", "Ajaccio", "Cannes",
  "Mérignac", "Valence", "Colmar", "Bourges", "Issy-les-Moulineaux", "Levallois-Perret", "Noisy-le-Grand", "Quimper", "La Seyne-sur-Mer", "Villeneuve-d'Ascq",
  "Neuilly-sur-Seine", "Antony", "Vénissieux", "Cergy", "Troyes", "Clichy", "Pessac", "Ivry-sur-Seine", "Chambéry", "Lorient",
  "Niort", "Sarcelles", "Montauban", "Villejuif", "Saint-Quentin", "Hyères", "Cayenne", "Beauvais", "Saint-Malo", "Vannes"
];

// ─── Arguments CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const limitCities = parseInt(getArg("limit-cities") || "0", 10);
const targetCity = getArg("city");
const skipPuppeteer = args.includes("--skip-puppeteer");

// Filtrer les villes à traiter
let citiesToProcess = CITIES;
if (targetCity) {
  citiesToProcess = CITIES.filter(c => c.toLowerCase() === targetCity.toLowerCase());
  if (citiesToProcess.length === 0) {
    // Si la ville n'est pas dans le top 100, on l'ajoute quand même pour permettre le test
    citiesToProcess = [targetCity];
  }
} else if (limitCities > 0) {
  citiesToProcess = CITIES.slice(0, limitCities);
}

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

// Formatage CSV sûr pour Excel (délimiteur ; et guillemets doublés)
function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  // Remplacer les retours à la ligne par des espaces
  str = str.replace(/\r?\n|\r/g, " ");
  // Doubler les guillemets existants
  if (str.includes('"') || str.includes(';') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Initialise le fichier CSV avec son entête et le BOM UTF-8
function initCSVFile() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Si le fichier existe déjà, on le renomme ou le supprime pour repartir propre
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
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
  
  // BOM UTF-8 pour Excel
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

async function searchPlaces(query, city) {
  const base = "https://maps.googleapis.com/maps/api/place/textsearch/json";
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    query: `${query} ${city} France`,
    language: "fr",
    region: "fr"
  });

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
  const lower = email.toLowerCase();
  if (EXCLUDED_EMAIL_PATTERNS.some((p) => lower.includes(p))) return false;
  if (EXCLUDED_EMAIL_DOMAINS.some((d) => lower.endsWith("@" + d) || lower.includes("@" + d + "."))) return false;
  if (email.length > 80) return false;
  if (!/^.{2,}@.+\..{2,}$/.test(email)) return false;
  
  // Filtrer les chaînes typiques d'exemples, de bugs (sentry) ou de templates
  const EXCLUDED_SUBSTRINGS = ["sentry", "example", "exemple", "domaine.", "test.", "testing"];
  if (EXCLUDED_SUBSTRINGS.some(sub => lower.includes(sub))) return false;

  // Exclure les préfixes d'e-mails de test ou de conformité légale/technique
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
  // 1. Essai avec les liens mailto:
  const mailtoMatches = [...html.matchAll(MAILTO_REGEX)].map((m) => m[1]);
  const validMailtos = mailtoMatches.filter(isValidEmail);
  if (validMailtos.length > 0) return [...new Set(validMailtos)];

  // 2. Essai avec regex brute
  const rawMatches = html.match(EMAIL_REGEX) || [];
  const validRaws = rawMatches.filter(isValidEmail);
  return [...new Set(validRaws)];
}

// Recherche d'e-mail par requêtes HTTP simples
async function scrapeEmailHttp(websiteUrl) {
  const base = normalizeUrl(websiteUrl);
  if (!base) return null;

  const pagesToTry = [
    base,
    `${base}/contact`,
    `${base}/nous-contacter`,
    `${base}/contactez-nous`,
    `${base}/mentions-legales`,
    `${base}/contact.html`,
    `${base}/contact.php`
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

// Recherche d'e-mail via Puppeteer (fallback)
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
      
      // Bloque les ressources inutiles pour accélérer
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
      await sleep(1500); // Laisse le JS s'exécuter un court instant

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
  console.log("🚀 Lancement du scraping des agents immobiliers");
  console.log(`   Note minimale : >= 4.0`);
  console.log(`   Nombre minimal d'avis : >= 20`);
  console.log(`   Villes à traiter : ${citiesToProcess.length}`);
  console.log(`   Mode Puppeteer : ${skipPuppeteer ? "DÉSACTIVÉ" : "ACTIVÉ"}`);
  console.log("------------------------------------------------------------\n");

  // Initialisation du fichier CSV
  initCSVFile();
  console.log(`📝 Fichier CSV initialisé dans : ${OUTPUT_FILE}\n`);

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
    for (let c = 0; c < citiesToProcess.length; c++) {
      const city = citiesToProcess[c];
      console.log(`📍 [${c + 1}/${citiesToProcess.length}] Recherche à : ${city}...`);
      
      let results = [];
      try {
        const searchData = await searchPlaces("agent immobilier", city);
        results = searchData.results || [];
      } catch (err) {
        console.error(`  ❌ Erreur de recherche pour ${city}:`, err.message);
        continue;
      }

      console.log(`  🔍 ${results.length} établissements trouvés. Filtrage...`);

      // Élimination doublons et filtrage note/avis
      const filteredResults = results.filter(place => {
        const rating = place.rating || 0;
        const reviews = place.user_ratings_total || 0;
        const matches = rating >= 4.0 && reviews >= 20;
        if (!matches) totalFilteredOut++;
        return matches;
      });

      console.log(`  🎯 ${filteredResults.length} agents qualifiés (note >= 4.0, avis >= 20)`);

      // Traitement de chaque agent qualifié dans la ville (4 en parallèle)
      const CONCURRENCY = 4;
      for (let i = 0; i < filteredResults.length; i += CONCURRENCY) {
        const batch = filteredResults.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async (place, batchIdx) => {
          const currentIndex = i + batchIdx + 1;
          let logBuffer = `    ↳ [${currentIndex}/${filteredResults.length}] ${place.name.slice(0, 35).padEnd(35)} | Note: ${place.rating} (${place.user_ratings_total} avis) `;

          // Appel Place Details pour récupérer site web et téléphone
          let details = null;
          try {
            details = await getPlaceDetails(place.place_id);
            await sleep(100); // Respect du rate limit Google Places API
          } catch (err) {
            logBuffer += `❌ Details: ${err.message}`;
            console.log(logBuffer);
            return;
          }

          const website = details?.website || null;
          const phone = details?.formatted_phone_number || "";
          const address = details?.formatted_address || place.formatted_address || "";
          const postalCode = extractPostalCode(address);

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

            // Enregistrer immédiatement dans le CSV uniquement si un e-mail a été trouvé
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
          totalProcessed++;
        }));
      }
      
      console.log(`  ✅ Ville ${city} terminée.\n`);
      await sleep(500); // Petite pause entre les villes
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log("============================================================");
  console.log("🏁 Scraping terminé !");
  console.log(`   Total d'établissements qualifiés traités : ${totalProcessed}`);
  console.log(`   Filtre note < 4.0 ou avis < 20 exclus   : ${totalFilteredOut}`);
  console.log(`   E-mails trouvés                         : ${totalFoundWithEmail}`);
  console.log(`   Fichier CSV généré                      : ${OUTPUT_FILE}`);
  console.log("============================================================");
}

main().catch(console.error);
