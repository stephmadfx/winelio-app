/**
 * Script de scraping des meilleurs agents immobiliers indépendants en France.
 * 
 * Filtres :
 *   - Note Google >= 4.0
 *   - Nombre d'avis >= 4
 *   - Cible les 100 plus grandes villes de France
 *   - Mots-clés : "mandataire immobilier" et "agent immobilier independant"
 *   - Récupération des e-mails en priorité sur leurs sites web
 * 
 * Usage:
 *   node scripts/scrape-independent-agents.mjs
 *   node scripts/scrape-independent-agents.mjs --limit-cities 3
 *   node scripts/scrape-independent-agents.mjs --city Lille
 *   node scripts/scrape-independent-agents.mjs --skip-puppeteer
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

// 200 plus grandes villes de France par population municipale
const CITIES = [
  "Paris",
  "Marseille",
  "Lyon",
  "Toulouse",
  "Nice",
  "Nantes",
  "Montpellier",
  "Strasbourg",
  "Bordeaux",
  "Lille",
  "Rennes",
  "Toulon",
  "Reims",
  "Saint-Étienne",
  "Le Havre",
  "Villeurbanne",
  "Dijon",
  "Angers",
  "Grenoble",
  "Saint-Denis",
  "Nîmes",
  "Aix-en-Provence",
  "Saint-Denis",
  "Clermont-Ferrand",
  "Le Mans",
  "Brest",
  "Tours",
  "Amiens",
  "Annecy",
  "Limoges",
  "Metz",
  "Perpignan",
  "Boulogne-Billancourt",
  "Besançon",
  "Rouen",
  "Orléans",
  "Montreuil",
  "Caen",
  "Saint-Paul",
  "Argenteuil",
  "Mulhouse",
  "Nancy",
  "Tourcoing",
  "Roubaix",
  "Nanterre",
  "Vitry-sur-Seine",
  "Asnières-sur-Seine",
  "Créteil",
  "Avignon",
  "Colombes",
  "Poitiers",
  "Aubervilliers",
  "Aulnay-sous-Bois",
  "Dunkerque",
  "Nouméa",
  "Saint-Pierre",
  "Versailles",
  "Courbevoie",
  "Rueil-Malmaison",
  "Le Tampon",
  "Béziers",
  "Pau",
  "La Rochelle",
  "Cherbourg-en-Cotentin",
  "Mérignac",
  "Champigny-sur-Marne",
  "Antibes",
  "Saint-Maur-des-Fossés",
  "Ajaccio",
  "Fort-de-France",
  "Saint-Nazaire",
  "Cannes",
  "Noisy-le-Grand",
  "Drancy",
  "Mamoudzou",
  "Cergy",
  "Levallois-Perret",
  "Issy-les-Moulineaux",
  "Calais",
  "Pessac",
  "Colmar",
  "Évry-Courcouronnes",
  "Vénissieux",
  "Ivry-sur-Seine",
  "Valence",
  "Clichy",
  "Quimper",
  "Antony",
  "Bourges",
  "La Seyne-sur-Mer",
  "Montauban",
  "Villeneuve-d'Ascq",
  "Cayenne",
  "Le Blanc-Mesnil",
  "Troyes",
  "Pantin",
  "Villejuif",
  "Chambéry",
  "Niort",
  "Fréjus",
  "Neuilly-sur-Seine",
  "Sarcelles",
  "Saint-André",
  "Clamart",
  "Lorient",
  "Narbonne",
  "Bobigny",
  "Meaux",
  "Maisons-Alfort",
  "Hyères",
  "Vannes",
  "Beauvais",
  "Saint-Louis",
  "La Roche-sur-Yon",
  "Chelles",
  "Corbeil-Essonnes",
  "Saint-Laurent-du-Maroni",
  "Cholet",
  "Bayonne",
  "Fontenay-sous-Bois",
  "Saint-Ouen-sur-Seine",
  "Cagnes-sur-Mer",
  "Vaulx-en-Velin",
  "Épinay-sur-Seine",
  "Saint-Quentin",
  "Sartrouville",
  "Sevran",
  "Arles",
  "Massy",
  "Albi",
  "Les Abymes",
  "Gennevilliers",
  "Saint-Herblain",
  "Grasse",
  "Bondy",
  "Les Sables-d'Olonne",
  "Laval",
  "Évreux",
  "Saint-Priest",
  "Suresnes",
  "Martigues",
  "Vincennes",
  "Aubagne",
  "Saint-Malo",
  "Livry-Gargan",
  "Blois",
  "Rosny-sous-Bois",
  "La Courneuve",
  "Brive-la-Gaillarde",
  "Bastia",
  "Talence",
  "Meudon",
  "Montrouge",
  "Alès",
  "Carcassonne",
  "Melun",
  "Choisy-le-Roi",
  "Saint-Germain-en-Laye",
  "Belfort",
  "Charleville-Mézières",
  "Alfortville",
  "Noisy-le-Sec",
  "Sète",
  "Chalon-sur-Saône",
  "Bagneux",
  "Tarbes",
  "Saint-Brieuc",
  "Istres",
  "Salon-de-Provence",
  "Puteaux",
  "Caluire-et-Cuire",
  "Rezé",
  "Mantes-la-Jolie",
  "Valenciennes",
  "Anglet",
  "Bagnolet",
  "Bron",
  "Châlons-en-Champagne",
  "Châteauroux",
  "Arras",
  "Thionville",
  "Villenave-d'Ornon",
  "Castres",
  "Bourg-en-Bresse",
  "Gagny",
  "Le Cannet",
  "Angoulême",
  "Garges-lès-Gonesse",
  "Villepinte",
  "Stains",
  "Gap",
  "Poissy",
  "Colomiers",
  "Wattrelos",
  "Draguignan",
  "Compiègne",
  "Montélimar",
  "Boulogne-sur-Mer",
  "Douai",
  "Marcq-en-Barœul",
  "Neuilly-sur-Marne",
  "Le Lamentin",
  "Saint-Joseph",
  "Pontault-Combault",
  "Saint-Benoît",
  "La Ciotat",
  "Joué-lès-Tours",
  "Tremblay-en-France",
  "Chartres",
  "Oullins-Pierre-Bénite",
  "Thonon-les-Bains",
  "Franconville",
  "Saint-Martin-d'Hères",
  "Annemasse",
  "Savigny-sur-Orge",
  "Échirolles",
  "Palaiseau",
  "Romainville",
  "Saint-Raphaël",
  "Six-Fours-les-Plages",
  "Sainte-Marie",
  "Conflans-Sainte-Honorine",
  "Vitrolles",
  "Châtillon",
  "Meyzieu",
  "Athis-Mons",
  "La Possession",
  "Matoury",
  "Bezons",
  "Haguenau",
  "Creil",
  "Villeneuve-Saint-Georges",
  "Villefranche-sur-Saône",
  "Saint-Leu",
  "Châtenay-Malabry",
  "Saint-Chamond",
  "Sainte-Geneviève-des-Bois",
  "Roanne",
  "Le Perreux-sur-Marne",
  "Mâcon",
  "Auxerre",
  "Dumbéa",
  "Schiltigheim",
  "Trappes",
  "Les Mureaux",
  "Houilles",
  "Le Port",
  "Marignane",
  "Romans-sur-Isère",
  "Villiers-sur-Marne",
  "Montluçon",
  "Nevers",
  "Lens",
  "Thiais",
  "Saint-Médard-en-Jalles",
  "Agen",
  "Montigny-le-Bretonneux",
  "Nogent-sur-Marne",
  "Aix-les-Bains",
  "Épinal",
  "Saint-Laurent-du-Var",
  "Koungou",
  "Pontoise",
  "Bègles",
  "Plaisir",
  "Herblay-sur-Seine",
  "Vienne",
  "Carpentras",
  "Mont-de-Marsan",
  "Dreux",
  "Vigneux-sur-Seine",
  "Rillieux-la-Pape",
  "Goussainville",
  "Ris-Orangis",
  "L'Haÿ-les-Roses",
  "Saint-Martin",
  "Savigny-le-Temple",
  "Cambrai",
  "Cachan",
  "Châtellerault",
  "Baie-Mahault",
  "Viry-Châtillon",
  "Le Chesnay-Rocquencourt",
  "Menton",
  "Chatou",
  "Malakoff",
  "La Garenne-Colombes",
  "Tournefeuille",
  "Bourgoin-Jallieu",
  "Draveil",
  "Liévin",
  "Villiers-le-Bel",
  "Vandœuvre-lès-Nancy",
  "Agde",
  "Décines-Charpieu",
  "Saint-Cloud",
  "Faaa",
  "Villemomble",
  "Guyancourt",
  "Orange",
  "Fresnes",
  "Saint-Étienne-du-Rouvray",
  "Ermont",
  "Clichy-sous-Bois",
  "Vallauris",
  "Périgueux",
  "Sotteville-lès-Rouen",
  "Bois-Colombes",
  "Le Plessis-Robinson",
  "Charenton-le-Pont",
  "Punaauia",
  "Maubeuge",
  "Montfermeil",
  "Vanves",
  "Saint-Sébastien-sur-Loire",
  "Orvault",
  "Dieppe",
  "Soissons",
  "Yerres",
  "Illkirch-Graffenstaden",
  "Sucy-en-Brie",
  "Le Gosier",
  "Rambouillet",
  "Remire-Montjoly",
  "Gonesse",
  "Païta",
  "Blagnac",
  "Taverny",
  "La Teste-de-Buch",
  "Bussy-Saint-Georges",
  "Champs-sur-Marne",
  "Limeil-Brévannes",
  "Cormeilles-en-Parisis",
  "Bergerac",
  "Sens",
  "Lambersart",
  "Armentières",
  "Gradignan",
  "Villeparisis",
  "Sannois",
  "Étampes",
  "Grigny",
  "Cenon",
  "Brétigny-sur-Orge",
  "Papeete",
  "Lunel",
  "La Garde",
  "Élancourt",
  "Saumur",
  "Vertou",
  "Aurillac",
  "Eaubonne",
  "Biarritz",
  "Miramas",
  "Muret",
  "Castelnau-le-Lez",
  "Villeneuve-la-Garenne",
  "Les Ulis",
  "Les Pavillons-sous-Bois",
  "Sèvremoine",
  "Le Grand-Quevilly",
  "Lormont",
  "Hénin-Beaumont",
  "Brunoy",
  "Cavaillon",
  "Saint-Ouen-l'Aumône",
  "Sainte-Suzanne",
  "Alençon",
  "Saintes",
  "Le Mont-Dore",
  "Vernon",
  "Béthune",
  "Vichy",
  "Le Bouscat",
  "Vierzon",
  "Libourne",
  "Eysines",
  "Kourou",
  "Montbéliard",
  "Petit-Bourg",
  "Orly",
  "Laon",
  "Frontignan",
  "Le Kremlin-Bicêtre",
  "Couëron",
  "Fontenay-aux-Roses",
  "Montgeron",
  "Beaupréau-en-Mauges",
  "Rodez",
  "Sainte-Anne",
  "Les Lilas",
  "Dole",
  "La Valette-du-Var",
  "Dammarie-les-Lys",
  "Olivet",
  "Hérouville-Saint-Clair",
  "Rochefort",
  "Combs-la-Ville",
  "Lanester",
  "Roissy-en-Brie",
  "Tassin-la-Demi-Lune",
  "Saint-Jean-de-Braye",
  "Deuil-la-Barre",
  "Maisons-Laffitte",
  "Le Moule",
  "Vélizy-Villacoublay",
  "Challans",
  "Saint-Dizier",
  "Torcy",
  "Saint-Louis",
  "Manosque",
  "Loos",
  "Gif-sur-Yvette",
  "Les Pennes-Mirabeau",
  "Oyonnax",
  "Montigny-lès-Cormeilles",
  "Auch",
  "Abbeville",
  "Villeneuve-sur-Lot",
  "Mantes-la-Ville",
  "Sèvres",
  "Montereau-Fault-Yonne",
  "Achères",
  "Le Petit-Quevilly",
  "Arcueil",
  "Épernay",
  "Gujan-Mestras",
  "Dax",
  "Millau",
  "Fontaine",
  "Chemillé-en-Anjou",
  "Longjumeau",
  "Neuilly-Plaisance",
  "Hazebrouck",
  "Nogent-sur-Oise",
  "Voiron",
  "Fleury-les-Aubrais",
  "La Madeleine",
  "Saint-Michel-sur-Orge",
  "Montmorency",
  "Montigny-lès-Metz",
  "Sainte-Foy-lès-Lyon",
  "Morsang-sur-Orge",
  "Mandelieu-la-Napoule",
  "Gardanne",
  "Le Robert",
  "Lagny-sur-Marne",
  "Allauch",
  "Bruay-la-Buissière",
  "Givors",
  "Saint-Gratien",
  "Saint-Cyr-l'École",
  "Ozoir-la-Ferrière",
  "Saint-Genis-Laval",
  "Montaigu-Vendée",
  "Le Plessis-Trévise",
  "Mons-en-Barœul",
  "Plaisance-du-Touch",
  "Saint-Mandé",
  "Bourg-la-Reine",
  "Villeneuve-le-Roi",
  "Carquefou",
  "Sceaux",
  "Concarneau",
  "Chaumont",
  "Lingolsheim",
  "Carrières-sous-Poissy",
  "Coudekerque-Branche",
  "Wasquehal",
  "Halluin",
  "La Chapelle-sur-Erdre",
  "Denain",
  "Cugnaux",
  "Maurepas",
  "Chaville",
  "Croix",
  "Bouguenais",
  "Joinville-le-Pont",
  "Le Creusot",
  "Forbach",
  "La Celle-Saint-Cloud",
  "Mitry-Mory",
  "Chilly-Mazarin",
  "Beaune",
  "Lannion",
  "Fougères",
  "L'Isle-sur-la-Sorgue",
  "Grande-Synthe",
  "Mont-Saint-Aignan",
  "Sarreguemines",
  "Cahors",
  "Bruges",
  "Bourg-lès-Valence",
  "Albertville",
  "Bressuire",
  "Gentilly",
  "Cournon-d'Auvergne",
  "Vence",
  "Macouria",
  "Chevilly-Larue"
];

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

const limitCities = parseInt(getArg("limit-cities") || "0", 10);
const targetCity = getArg("city");
const skipPuppeteer = args.includes("--skip-puppeteer");

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

  // 2. Charger depuis le fichier CSV lui-même (pour synchroniser si le cache a été perdu/supprimé)
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
  console.log("🚀 Lancement du scraping des agents immobiliers INDÉPENDANTS");
  console.log(`   Note minimale : >= 4.0`);
  console.log(`   Nombre minimal d'avis : >= 4`);
  console.log(`   Villes à traiter : ${citiesToProcess.length}`);
  console.log(`   Mode Puppeteer : ${skipPuppeteer ? "DÉSACTIVÉ" : "ACTIVÉ"}`);
  console.log("------------------------------------------------------------\n");

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
    for (let c = 0; c < citiesToProcess.length; c++) {
      const city = citiesToProcess[c];
      console.log(`📍 [${c + 1}/${citiesToProcess.length}] Recherche indépendants à : ${city}...`);
      
      // Récupérer et fusionner les résultats pour les différents mots-clés
      let combinedResults = [];
      const seenPlaceIds = new Set();

      for (const query of SEARCH_QUERIES) {
        try {
          const searchData = await searchPlaces(query, city);
          const results = searchData.results || [];
          results.forEach(place => {
            if (!seenPlaceIds.has(place.place_id)) {
              seenPlaceIds.add(place.place_id);
              combinedResults.push(place);
            }
          });
          await sleep(150); // Pause courte entre les mots-clés
        } catch (err) {
          console.error(`  ❌ Erreur de recherche (${query}) pour ${city}:`, err.message);
        }
      }

      console.log(`  🔍 ${combinedResults.length} établissements trouvés au total. Filtrage...`);

      // Élimination doublons et filtrage note/avis
      const filteredResults = combinedResults.filter(place => {
        const rating = place.rating || 0;
        const reviews = place.user_ratings_total || 0;
        const matches = rating >= 4.0 && reviews >= 4;
        if (!matches) totalFilteredOut++;
        return matches;
      });

      console.log(`  🎯 ${filteredResults.length} agents qualifiés (note >= 4.0, avis >= 4)`);

      // Traitement de chaque agent qualifié dans la ville (4 en parallèle)
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

          // Appel Place Details pour récupérer site web et téléphone
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

            // Enregistrer uniquement si un e-mail a été trouvé
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
      
      console.log(`  ✅ Ville ${city} terminée.\n`);
      await sleep(500);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log("============================================================");
  console.log("🏁 Scraping des indépendants terminé !");
  console.log(`   Total d'établissements qualifiés traités : ${totalProcessed}`);
  console.log(`   Filtre note < 4.0 ou avis < 4 exclus    : ${totalFilteredOut}`);
  console.log(`   E-mails trouvés                         : ${totalFoundWithEmail}`);
  console.log(`   Fichier CSV généré                      : ${OUTPUT_FILE}`);
  console.log("============================================================");
}

main().catch(console.error);
