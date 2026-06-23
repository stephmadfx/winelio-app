/**
 * Script de scraping des électriciens en France (Sans clé d'API Google Places).
 * 
 * Ce script navigue directement sur le site public Google Maps à l'aide de Puppeteer,
 * extrait les électriciens, clique sur chaque établissement pour en
 * lire les détails (adresse, téléphone, site web) et crawl les sites web pour
 * récupérer les adresses e-mail.
 * 
 * Filtres :
 *   - Note Google >= 4.0
 *   - Nombre d'avis >= 10
 *   - Cible les 100 plus grandes villes de France
 *   - Mots-clés : "electricien", "electricite"
 *   - Fichier de sortie : outputs/electriciens_france.csv
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

// ─── Configuration ────────────────────────────────────────────────────────────

const OUTPUT_DIR = "./outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "electriciens_france.csv");
const PROCESSED_IDS_FILE = path.join(OUTPUT_DIR, "electriciens_processed_ids.txt");
const processedPlaceIds = new Set();

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
const skipPuppeteerFallback = args.includes("--skip-puppeteer-fallback");

// Filtrer les villes à traiter
let citiesToProcess = CITIES;
if (targetCity) {
  citiesToProcess = CITIES.filter(c => c.toLowerCase() === targetCity.toLowerCase());
  if (citiesToProcess.length === 0) {
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

function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  str = str.replace(/\r?\n|\r/g, " ");
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

  if (!fs.existsSync(OUTPUT_FILE)) {
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
}

function loadProcessedIds() {
  if (fs.existsSync(PROCESSED_IDS_FILE)) {
    const content = fs.readFileSync(PROCESSED_IDS_FILE, "utf8");
    for (const id of content.split("\n")) {
      const trimmed = id.trim();
      if (trimmed) processedPlaceIds.add(trimmed);
    }
  }
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
  fs.appendFileSync(PROCESSED_IDS_FILE, `${row.placeId}\n`, "utf8");
  processedPlaceIds.add(row.placeId);
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

// ─── Scrolling & Google Consent ───────────────────────────────────────────────

async function handleGoogleConsent(page) {
  if (page.url().includes("consent.google.com") || await page.$('form[action*="consent"]') || await page.$('button[aria-label*="Tout accepter"]')) {
    console.log("  🛡️ Consentement Google détecté. Clic sur 'Tout accepter'...");
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const acceptBtn = buttons.find(b => 
          b.innerText.includes("Tout accepter") || 
          b.innerText.includes("Accept all") || 
          b.innerText.includes("J'accepte") || 
          b.getAttribute('aria-label')?.includes("Tout accepter")
        );
        if (acceptBtn) {
          acceptBtn.click();
          return "button_clicked";
        }
        
        const forms = Array.from(document.querySelectorAll('form'));
        for (const f of forms) {
          if (f.action.includes("consent")) {
            const btns = f.querySelectorAll('button');
            if (btns.length > 0) {
              btns[btns.length - 1].click();
              return "form_button_clicked";
            }
          }
        }
        return "not_found";
      });
      console.log(`  🛡️ Résultat du consentement : ${clicked}`);
      await sleep(5000);
    } catch (e) {
      console.warn("  ⚠️ Erreur lors du clic de consentement :", e.message);
    }
  }
}

async function scrollFeed(page, maxResults = 30) {
  try {
    await page.evaluate(async (max) => {
      const feed = document.querySelector('div[role="feed"]') || 
                   document.querySelector('.m67q6ED352c__feed-container') || 
                   document.querySelector('div[aria-label*="Résultats"]');
      if (!feed) {
        window.scrollBy(0, window.innerHeight);
        return;
      }
      
      let lastHeight = feed.scrollHeight;
      let scrollAttempts = 0;
      
      while (scrollAttempts < 10) {
        feed.scrollBy(0, 1000);
        await new Promise(r => setTimeout(r, 1200));
        
        const currentHeight = feed.scrollHeight;
        if (currentHeight === lastHeight) {
          scrollAttempts++;
        } else {
          lastHeight = currentHeight;
          scrollAttempts = 0;
        }
        
        const placesCount = document.querySelectorAll('a[href*="/maps/place/"]').length;
        if (placesCount >= max) break;
      }
    }, maxResults);
  } catch (e) {
    // ignore
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Lancement du scraping des électriciens (SANS CLÉ API)");
  console.log(`   Note minimale : >= 4.0`);
  console.log(`   Nombre minimal d'avis : >= 10`);
  console.log(`   Villes à traiter : ${citiesToProcess.length}`);
  console.log(`   Mode Puppeteer Fallback : ${skipPuppeteerFallback ? "DÉSACTIVÉ" : "ACTIVÉ"}`);
  console.log("------------------------------------------------------------\n");

  initCSVFile();
  loadProcessedIds();
  console.log(`ℹ️ ${processedPlaceIds.size} Place IDs déjà présents dans le cache.`);
  console.log(`📝 Fichier CSV initialisé dans : ${OUTPUT_FILE}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=fr-FR"]
  });

  let totalProcessed = 0;
  let totalFoundWithEmail = 0;
  let totalFilteredOut = 0;
  let totalSkipped = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    for (let c = 0; c < citiesToProcess.length; c++) {
      const city = citiesToProcess[c];
      console.log(`📍 [${c + 1}/${citiesToProcess.length}] Recherche à : ${city}...`);
      
      const searchUrl = `https://www.google.com/maps/search/electricien+electricite+${encodeURIComponent(city)}/`;
      try {
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await sleep(4000);
        await handleGoogleConsent(page);

        // Si le consentement nous a redirigés, on retourne sur la recherche
        if (!page.url().includes("/search/")) {
          await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
          await sleep(4000);
        }
      } catch (err) {
        console.error(`  ❌ Erreur de navigation pour ${city}:`, err.message);
        continue;
      }

      console.log("  🔍 Chargement et défilement de la liste...");
      await scrollFeed(page, 40);

      // Récupérer les établissements chargés dans le DOM
      const places = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        return links.map((a, idx) => {
          const href = a.getAttribute('href') || "";
          const name = a.getAttribute('aria-label') || "No Name";
          const idMatch = href.match(/1s(0x[a-f0-9]+:0x[a-f0-9]+)/);
          const placeId = idMatch ? idMatch[1] : `dom:${name.replace(/\s+/g, '_')}`;
          return { name, href, placeId };
        }).filter(x => x.name !== "No Name");
      });

      // Élimination des doublons par Place ID sur cette recherche
      const seenIds = new Set();
      const uniquePlaces = places.filter(p => {
        if (seenIds.has(p.placeId)) return false;
        seenIds.add(p.placeId);
        return true;
      });

      console.log(`  🔍 ${uniquePlaces.length} établissements trouvés dans le DOM.`);

      // Filtrer avec le cache local
      const placesToScrape = uniquePlaces.filter(p => {
        if (processedPlaceIds.has(p.placeId)) {
          totalSkipped++;
          return false;
        }
        return true;
      });

      console.log(`  🎯 ${placesToScrape.length} nouveaux électriciens à analyser.`);

      // Traitement séquentiel pour pouvoir cliquer de manière stable sur les fiches
      for (let i = 0; i < placesToScrape.length; i++) {
        const place = placesToScrape[i];
        let logBuffer = `    ↳ [${i + 1}/${placesToScrape.length}] ${place.name.slice(0, 30).padEnd(30)} `;

        try {
          // Cliquer sur l'élément dans la liste
          const clicked = await page.evaluate((name) => {
            const aElements = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
            const target = aElements.find(a => a.getAttribute('aria-label') === name);
            if (target) {
              target.click();
              return true;
            }
            return false;
          }, place.name);

          if (!clicked) {
            logBuffer += `❌ Impossible de cliquer`;
            console.log(logBuffer);
            continue;
          }

          // Attendre le chargement de la fiche de détails
          await sleep(2500);

          // Extraire les détails de la fiche ouverte
          const details = await page.evaluate(() => {
            // Note & Avis
            const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
            const rating = ratingEl ? ratingEl.innerText.trim() : "";
            
            const reviewsEl = document.querySelector('div.F7nice span[aria-label*="avis"]');
            let reviewsCount = "";
            if (reviewsEl) {
              const match = reviewsEl.getAttribute('aria-label').match(/\d+/);
              if (match) reviewsCount = match[0];
            }

            // Adresse
            const addressEl = document.querySelector('button[data-item-id="address"]');
            const address = addressEl ? addressEl.innerText.replace(/^[^a-zA-Z0-9\s]+/, '').trim() : "";

            // Téléphone
            const phoneEl = document.querySelector('button[data-item-id^="phone:tel:"]');
            let phone = "";
            if (phoneEl) {
              const itemId = phoneEl.getAttribute('data-item-id');
              phone = itemId.replace('phone:tel:', '').replace(/\s+/g, '').trim();
            }

            // Site Web
            const websiteEl = document.querySelector('a[data-item-id="authority"]');
            const website = websiteEl ? websiteEl.getAttribute('href') : "";

            return { rating, reviewsCount, address, phone, website };
          });

          // Filtrer par Note Google >= 4.0 et Avis >= 10
          const ratingVal = parseFloat(details.rating.replace(',', '.')) || 0;
          const reviewsVal = parseInt(details.reviewsCount, 10) || 0;
          if (ratingVal < 4.0 || reviewsVal < 10) {
            logBuffer += `⏭ Note/Avis faibles (${details.rating || "N/A"} - ${details.reviewsCount || 0} avis)`;
            console.log(logBuffer);
            totalFilteredOut++;
            // On le marque comme traité pour ne pas le re-tester
            fs.appendFileSync(PROCESSED_IDS_FILE, `${place.placeId}\n`, "utf8");
            processedPlaceIds.add(place.placeId);
            continue;
          }

          logBuffer += `| Note: ${details.rating} (${details.reviewsCount} avis) `;

          // Standardiser le téléphone français
          let cleanPhoneNum = details.phone;
          if (cleanPhoneNum.startsWith("+33")) {
            cleanPhoneNum = "0" + cleanPhoneNum.slice(3);
          }
          if (cleanPhoneNum.length === 10) {
            cleanPhoneNum = `${cleanPhoneNum.slice(0, 2)} ${cleanPhoneNum.slice(2, 4)} ${cleanPhoneNum.slice(4, 6)} ${cleanPhoneNum.slice(6, 8)} ${cleanPhoneNum.slice(8, 10)}`;
          }

          let email = "";
          if (details.website) {
            logBuffer += `🌐 `;
            try {
              email = await withTimeout((async () => {
                let e = null;
                try {
                  e = await scrapeEmailHttp(details.website);
                } catch { /* ignore */ }

                if (!e && !skipPuppeteerFallback) {
                  logBuffer += `🕷️ `;
                  try {
                    e = await scrapeEmailPuppeteer(browser, details.website);
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
              rating: details.rating || "",
              reviewsCount: details.reviewsCount || "",
              phone: cleanPhoneNum,
              email: email,
              website: details.website || "",
              address: details.address,
              postalCode: extractPostalCode(details.address),
              placeId: place.placeId
            });
          } else {
            logBuffer += details.website ? `⚪ E-mail introuvable` : `⚪ Pas de site web`;
            // On enregistre quand même comme traité pour éviter le re-clic inutile
            fs.appendFileSync(PROCESSED_IDS_FILE, `${place.placeId}\n`, "utf8");
            processedPlaceIds.add(place.placeId);
          }

          console.log(logBuffer);
          totalProcessed++;

        } catch (e) {
          logBuffer += `❌ Erreur : ${e.message}`;
          console.log(logBuffer);
        }

        await sleep(1000); // Petite pause entre chaque clic de fiche
      }

      console.log(`  ✅ Ville ${city} terminée.\n`);
      await sleep(1500);
    }

  } finally {
    await browser.close();
  }

  console.log("============================================================");
  console.log("🏁 Scraping terminé !");
  console.log(`   Total qualifiés traités                 : ${totalProcessed}`);
  console.log(`   Déjà traités (sautés)                    : ${totalSkipped}`);
  console.log(`   Exclus (note < 4.0 ou avis < 10)         : ${totalFilteredOut}`);
  console.log(`   E-mails trouvés et sauvegardés           : ${totalFoundWithEmail}`);
  console.log(`   Fichier CSV généré                      : ${OUTPUT_FILE}`);
  console.log("============================================================");
}

main().catch(console.error);
