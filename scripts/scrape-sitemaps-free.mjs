/**
 * Script de scraping gratuit des agents immobiliers indépendants via sitemaps.
 * 
 * Ce script extrait les agents de SAFTI et IAD France sans utiliser d'API payante.
 * Il utilise les sitemaps publics et parse le code source HTML des profils.
 * 
 * Usage:
 *   node scripts/scrape-sitemaps-free.mjs
 *   node scripts/scrape-sitemaps-free.mjs --limit 10
 *   node scripts/scrape-sitemaps-free.mjs --network safti
 *   node scripts/scrape-sitemaps-free.mjs --concurrency 5
 */

import fs from "fs";
import path from "path";
import vm from "vm";

// ─── Configuration ────────────────────────────────────────────────────────────

const OUTPUT_DIR = "./outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "agents_independants_france.csv");
const PROCESSED_URLS_FILE = path.join(OUTPUT_DIR, "agents_sitemaps_processed_urls.txt");

const SITEMAPS = {
  safti: {
    url: "https://www.safti.fr/sitemaps/sitemap.mandataires.xml",
    pattern: "/votre-conseiller-safti/",
  },
  iad: {
    url: "https://www.iadfrance.fr/sitemap/fr/agents.xml",
    pattern: "/conseiller-immobilier/",
  },
  efficity: {
    url: "https://www.efficity.com/sitemap-consultants.xml",
    pattern: "https://www.efficity.com/",
  },
  proprietes: {
    url: "https://www.proprietes-privees.com/sitemap.xml",
    pattern: "/negociateur/",
  }
};

// ─── CLI Arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const limit = parseInt(getArg("limit") || "0", 10);
const targetNetwork = getArg("network"); // "safti" ou "iad"
const concurrencyLimit = parseInt(getArg("concurrency") || "10", 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildSaftiEmail(firstName, lastName) {
  const clean = (str) => {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };
  return `${clean(firstName)}.${clean(lastName)}@safti.fr`;
}

function buildIadEmail(slug) {
  return `${slug.toLowerCase()}@iadfrance.fr`;
}

function cleanPhone(raw) {
  if (!raw) return "";
  let clean = raw.trim().replace(/\s+/g, "");
  if (clean.startsWith("+33")) {
    clean = "0" + clean.slice(3);
  }
  // Format standard : 06 12 34 56 78
  if (clean.length === 10) {
    return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 8)} ${clean.slice(8, 10)}`;
  }
  return raw;
}

// ─── Main Logic ───────────────────────────────────────────────────────────────

async function fetchSitemapUrls(networkKey) {
  const config = SITEMAPS[networkKey];
  console.log(`📡 Téléchargement du sitemap ${networkKey.toUpperCase()} : ${config.url}...`);
  try {
    const res = await fetch(config.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const matches = xml.match(/<loc>(https:\/\/[^<]+)<\/loc>/g) || [];
    const urls = matches
      .map(m => m.replace(/<\/?loc>/g, "").trim())
      .filter(u => u.includes(config.pattern));
    console.log(`✅ ${urls.length} URLs d'agents trouvées pour ${networkKey.toUpperCase()}.`);
    return urls;
  } catch (error) {
    console.error(`❌ Impossible de récupérer le sitemap pour ${networkKey}:`, error.message);
    return [];
  }
}

async function parseAgentPage(url, networkKey) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) {
      console.warn(`⚠️ HTTP ${res.status} pour ${url}`);
      return null;
    }
    const html = await res.text();

    if (networkKey === "safti") {
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
      if (match) {
        const nextData = JSON.parse(match[1]);
        const agent = nextData.props?.pageProps?.agent;
        if (agent) {
          return {
            name: `${agent.firstName} ${agent.lastName}`.trim(),
            city: agent.city || "",
            rating: "",
            reviewsCount: "",
            phone: cleanPhone(agent.phoneNumber),
            email: buildSaftiEmail(agent.firstName, agent.lastName),
            website: url,
            address: agent.principalArea || "",
            postalCode: agent.postCode || "",
            placeId: `safti:${agent.slug}`
          };
        }
      }
    } else if (networkKey === "iad") {
      const slug = url.split("/").pop();
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      let name = slug.replace(".", " ");
      let city = "";
      let postalCode = "";

      if (titleMatch) {
        const title = titleMatch[1];
        const iadRegex = /^(.*?) - (.*?) [aà] (.*?) \((\d{5})\) - iad/;
        const regMatch = title.match(iadRegex);
        if (regMatch) {
          name = regMatch[1].trim();
          city = regMatch[3].trim();
          postalCode = regMatch[4].trim();
        }
      }

      // Décoder le téléphone en Base64
      let phone = "";
      const b64Match = html.match(/KzMz[a-zA-Z0-9+/]{12}/);
      if (b64Match) {
        const decoded = Buffer.from(b64Match[0], "base64").toString();
        phone = cleanPhone(decoded);
      }

      return {
        name,
        city,
        rating: "",
        reviewsCount: "",
        phone,
        email: buildIadEmail(slug),
        website: url,
        address: city ? `${city} (${postalCode})` : "",
        postalCode,
        placeId: `iad:${slug}`
      };
    } else if (networkKey === "efficity") {
      const slug = url.replace("https://www.efficity.com/", "").replace(/\//g, "").trim();
      if (!slug) return null;
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      let name = slug;
      let city = "";
      let postalCode = "";

      if (titleMatch) {
        const title = titleMatch[1];
        const efficityRegex = /^(.*?) \| (.*?) à (.*?)(?: \(.*?\))? \| efficity/i;
        const regMatch = title.match(efficityRegex);
        if (regMatch) {
          name = regMatch[1].trim();
          city = regMatch[3].trim();
        }
      }

      let phone = "";
      const telMatch = html.match(/href="tel:([^"]*)"/i);
      if (telMatch) {
        phone = cleanPhone(telMatch[1]);
      }

      const pcMatch = html.match(/\((\d{5})\)/);
      if (pcMatch) {
        postalCode = pcMatch[1];
      }

      return {
        name,
        city,
        rating: "",
        reviewsCount: "",
        phone,
        email: `${slug.toLowerCase()}@efficity.com`,
        website: url,
        address: city ? `${city} (${postalCode})` : "",
        postalCode,
        placeId: `efficity:${slug}`
      };
    } else if (networkKey === "proprietes") {
      const slug = url.split("/").pop();
      if (!slug || slug === "negociateur") return null;

      let name = slug.replace(".", " ");
      let city = "";
      let postalCode = "";
      let phone = "";

      // Extraction via Nuxt State
      const nuxtMatch = html.match(/window\.__NUXT__[\s\S]*?<\/script>/);
      let parsedNuxt = false;
      if (nuxtMatch) {
        let nuxtCode = nuxtMatch[0].replace(/<\/script>/, "").trim();
        try {
          const sandbox = { window: {} };
          vm.createContext(sandbox);
          vm.runInContext(nuxtCode, sandbox);
          const nuxt = sandbox.window.__NUXT__;
          if (nuxt) {
            const pinia = nuxt.pinia || nuxt.state?.pinia || nuxt.state;
            if (pinia?.mandataries?.mandataryDetails) {
              const detailsMap = pinia.mandataries.mandataryDetails;
              const key = Object.keys(detailsMap).find(k => k.toLowerCase() === slug.toLowerCase()) || slug;
              const details = detailsMap[key];
              if (details) {
                if (details.firstname && details.lastname) {
                  name = `${details.firstname} ${details.lastname}`.trim();
                }
                if (details.phone) {
                  phone = cleanPhone(details.phone);
                }
                if (details.location) {
                  city = (details.location.label || "").trim();
                  postalCode = (details.location.code || "").trim();
                } else if (details.zone) {
                  city = details.zone.trim();
                }
                parsedNuxt = true;
              }
            }
          }
        } catch (err) {
          // Fallback to regex if Nuxt VM parsing fails
        }
      }

      // Fallbacks Regex si Nuxt n'a pas pu être parsé ou si des champs manquent
      if (!parsedNuxt) {
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        if (titleMatch) {
          const title = titleMatch[1];
          const ppRegex = /^(.*?) - Votre conseiller/i;
          const regMatch = title.match(ppRegex);
          if (regMatch) {
            name = regMatch[1].trim();
          }
        }

        const phoneMatch = html.match(/phone":"(\d{10})"/i) || html.match(/phone="(\d{10})"/i) || html.match(/phone\s*:\s*"(\d{10})"/i);
        if (phoneMatch) {
          phone = cleanPhone(phoneMatch[1]);
        } else {
          const mobileMatch = html.match(/0[67]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/);
          if (mobileMatch) {
            phone = cleanPhone(mobileMatch[0]);
          }
        }
      }

      if (!city) {
        // Extraction de la ville et du code postal depuis l'objet location de Nuxt via Regex
        const locationMatch = html.match(/location\s*[=:]\s*\{([^}]+?)\bparent\b/i);
        if (locationMatch) {
          const locContent = locationMatch[1];
          const codeMatch = locContent.match(/code\s*:\s*"([^"]*)"/i);
          const labelMatch = locContent.match(/label\s*:\s*"([^"]*)"/i);
          if (codeMatch) postalCode = codeMatch[1].trim();
          if (labelMatch) city = labelMatch[1].trim();
        }
      }

      if (!city) {
        const descMatch = html.match(/<meta name="description" content="[^"]* sur ([A-Z\s-]+) et ses environs/i);
        if (descMatch) {
          city = descMatch[1].trim();
        }
      }

      if (!postalCode || !city) {
        const zoneMatch = html.match(/zone":"([^"]*)"/i) || html.match(/zone="([^"]*)"/i);
        if (zoneMatch) {
          const zone = zoneMatch[1];
          const cpMatch = zone.match(/\d{5}/);
          if (cpMatch && !postalCode) {
            postalCode = cpMatch[0];
          }
          if (!city) {
            city = zone.split("/")[0].trim();
          }
        }
      }

      return {
        name,
        city,
        rating: "",
        reviewsCount: "",
        phone,
        email: `${slug.toLowerCase()}@proprietes-privees.com`,
        website: url,
        address: city ? `${city} (${postalCode})` : "",
        postalCode,
        placeId: `proprietes:${slug}`
      };
    }
  } catch (error) {
    console.error(`❌ Erreur lors du parsing de ${url} :`, error.message);
  }
  return null;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Charger les emails existants pour la déduplication
  const existingEmails = new Set();
  if (fs.existsSync(OUTPUT_FILE)) {
    const csvContent = fs.readFileSync(OUTPUT_FILE, "utf8");
    const lines = csvContent.split("\n");
    for (const line of lines) {
      const parts = line.split(";");
      if (parts.length > 5) {
        const email = parts[5].replace(/"/g, "").trim().toLowerCase();
        if (email && email.includes("@")) {
          existingEmails.add(email);
        }
      }
    }
    console.log(`ℹ️ ${existingEmails.size} e-mails uniques déjà présents dans le fichier CSV.`);
  } else {
    // Si le fichier n'existe pas, on initialise l'entête
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
    console.log("🆕 Fichier CSV créé avec en-têtes.");
  }

  // 2. Charger le cache des URLs déjà traitées
  const processedUrls = new Set();
  if (fs.existsSync(PROCESSED_URLS_FILE)) {
    const lines = fs.readFileSync(PROCESSED_URLS_FILE, "utf8").split("\n");
    for (const line of lines) {
      const url = line.trim();
      if (url) processedUrls.add(url);
    }
    console.log(`ℹ️ ${processedUrls.size} URLs déjà marquées dans le cache.`);
  }

  // 3. Récupérer les URLs de sitemaps à traiter
  let allTasks = [];
  const networksToScrape = targetNetwork ? [targetNetwork] : ["safti", "iad", "efficity", "proprietes"];

  for (const net of networksToScrape) {
    if (SITEMAPS[net]) {
      const urls = await fetchSitemapUrls(net);
      for (const url of urls) {
        if (!processedUrls.has(url)) {
          allTasks.push({ url, network: net });
        }
      }
    }
  }

  console.log(`ℹ️ ${allTasks.length} nouvelles URLs à scraper.`);

  if (limit > 0) {
    console.log(`⚠️ Limite appliquée : traitement de seulement ${limit} profils.`);
    allTasks = allTasks.slice(0, limit);
  }

  if (allTasks.length === 0) {
    console.log("✅ Aucun nouveau profil à scraper.");
    return;
  }

  console.log(`🚀 Lancement du scraping avec une concurrence de ${concurrencyLimit}...`);

  let countSuccess = 0;
  let countSkipped = 0;

  async function worker(task, index) {
    const { url, network } = task;
    // Log de progression périodique
    if (index % 10 === 0 || index === allTasks.length - 1) {
      console.log(`[Progression] Traitement ${index + 1}/${allTasks.length}...`);
    }

    const agent = await parseAgentPage(url, network);
    await sleep(100); // Petit délai pour le respect des serveurs

    if (!agent) {
      return;
    }

    // Déduplication par email
    if (existingEmails.has(agent.email.toLowerCase())) {
      countSkipped++;
      // On l'enregistre quand même dans le cache URL pour ne plus le requêter
      fs.appendFileSync(PROCESSED_URLS_FILE, `${url}\n`, "utf8");
      return;
    }

    // On exige au moins un numéro de téléphone pour que le lead soit valide
    if (!agent.phone) {
      // Pas de téléphone, on ignore mais on le marque dans le cache URL
      fs.appendFileSync(PROCESSED_URLS_FILE, `${url}\n`, "utf8");
      return;
    }

    // Écrire directement dans le CSV
    const row = [
      agent.name,
      agent.city,
      agent.rating,
      agent.reviewsCount,
      agent.phone,
      agent.email,
      agent.website,
      agent.address,
      agent.postalCode,
      agent.placeId
    ].map(escapeCSV).join(";") + "\n";

    fs.appendFileSync(OUTPUT_FILE, row, "utf8");
    fs.appendFileSync(PROCESSED_URLS_FILE, `${url}\n`, "utf8");
    existingEmails.add(agent.email.toLowerCase());
    countSuccess++;
  }

  // Exécution concurrente simplifiée
  let taskIndex = 0;
  async function runWorker() {
    while (taskIndex < allTasks.length) {
      const idx = taskIndex++;
      await worker(allTasks[idx], idx);
    }
  }

  const workers = Array(Math.min(concurrencyLimit, allTasks.length))
    .fill(null)
    .map(() => runWorker());

  await Promise.all(workers);

  console.log(`\n🎉 Scraping sitemaps terminé !`);
  console.log(`📊 Résultats :`);
  console.log(`   - Nouveaux agents ajoutés : ${countSuccess}`);
  console.log(`   - Doublons d'emails ignorés : ${countSkipped}`);
}

main().catch((err) => {
  console.error("❌ Erreur critique :", err);
});
