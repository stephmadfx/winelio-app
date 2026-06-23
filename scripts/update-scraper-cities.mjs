import fs from "fs";
import path from "path";

const SCRAPER_FILE = "scripts/scrape-independent-agents.mjs";

async function main() {
  console.log("Fetching top 500 French cities by population...");
  const res = await fetch("https://geo.api.gouv.fr/communes?fields=nom,population&format=json");
  if (!res.ok) {
    throw new Error(`Failed to fetch communes: ${res.status}`);
  }
  const data = await res.json();
  
  const sortedCommunes = data
    .filter(c => c.population !== undefined)
    .sort((a, b) => b.population - a.population);
  
  const top500 = sortedCommunes.slice(0, 500).map(c => c.nom);
  console.log(`Retrieved ${top500.length} cities. First is ${top500[0]}, 500th is ${top500[499]}`);
  
  // Now let's read the scraper file
  if (!fs.existsSync(SCRAPER_FILE)) {
    throw new Error(`Scraper file ${SCRAPER_FILE} does not exist`);
  }
  
  let content = fs.readFileSync(SCRAPER_FILE, "utf8");
  
  // Replace CITIES array
  const citiesArrayString = JSON.stringify(top500, null, 2);
  const citiesRegex = /const CITIES = \[\s*[\s\S]*?\n\];/;
  content = content.replace(citiesRegex, `const CITIES = ${citiesArrayString};`);
  
  // Replace SEARCH_QUERIES array
  const expandedQueries = [
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
  
  const queriesArrayString = JSON.stringify(expandedQueries, null, 2);
  const queriesRegex = /const SEARCH_QUERIES = \[\s*[\s\S]*?\n\];/;
  content = content.replace(queriesRegex, `const SEARCH_QUERIES = ${queriesArrayString};`);
  
  fs.writeFileSync(SCRAPER_FILE, content, "utf8");
  console.log("Successfully updated scraper script with 500 cities and expanded keywords!");
}

main().catch(console.error);
