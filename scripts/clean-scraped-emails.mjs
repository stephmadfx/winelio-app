import fs from "fs";
import path from "path";

const INPUT_FILE = "outputs/agents_independants_france.csv";
const TEMP_FILE = "outputs/agents_independants_france_clean.csv";

const EXCLUDED_EMAILS = [
  "email@mail.com",
  "adresse@fournisseur.com",
  "xxxx@meilleurtaux.com",
  "jean.dupont@mail.com",
  "test@test.com"
];

const EXCLUDED_DOMAINS = [
  "immodvisor.com",
  "webgenery.com",
  "la-boite-immo.com",
  "medimmoconso.fr",
  "anm-conso.com",
  "opinionsystem.fr",
  "opinionsystem.com",
  "apimo.pro",
  "apimo.com"
];

const EXCLUDED_PATTERNS = [
  "informatique-et-libertes",
  "rgpd",
  "dpo",
  "protectiondesdonnees",
  "sentry",
  "example",
  "exemple",
  "no-reply",
  "noreply"
];

function shouldExclude(email) {
  const lower = email.toLowerCase().trim();
  if (!lower) return true;

  if (EXCLUDED_EMAILS.includes(lower)) return true;

  const domain = lower.split("@")[1];
  if (domain && EXCLUDED_DOMAINS.includes(domain)) return true;

  if (EXCLUDED_PATTERNS.some(pattern => lower.includes(pattern))) return true;

  return false;
}

function cleanCSV() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Fichier ${INPUT_FILE} introuvable.`);
    return;
  }

  const content = fs.readFileSync(INPUT_FILE, "utf8");
  const lines = content.split("\n");
  const header = lines[0];
  const cleanedLines = [];

  let count = 0;
  let excludedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parts = line.split(";");
    if (parts.length > 5) {
      const email = parts[5];
      if (shouldExclude(email)) {
        excludedCount++;
        continue;
      }
    }
    cleanedLines.push(line);
    count++;
  }

  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const newContent = [header, ...cleanedLines].join("\n") + "\n";
  fs.writeFileSync(INPUT_FILE, Buffer.concat([bom, Buffer.from(newContent)]));

  console.log(`✅ Nettoyage terminé !`);
  console.log(`   Lignes conservées : ${count}`);
  console.log(`   Lignes exclues     : ${excludedCount}`);
}

cleanCSV();
