/**
 * Géocodage des entreprises à leur adresse réelle (Base Adresse Nationale).
 *
 * Contexte : scripts/backfill-coordinates.mjs avait rempli les coordonnées à
 * partir du seul code postal, posant le centre de la commune sur chaque fiche.
 * Toutes les entreprises d'une même ville se retrouvaient au même point, et la
 * recherche affichait « 0 m » partout.
 *
 * Ce script ne traite que les fiches dont l'adresse commence par un numéro de
 * rue : les 56 % de fiches scrapées qui n'ont que « COMMUNE (CP) » ne peuvent
 * pas être situées, aucune API n'inventera une voie absente de la source. Elles
 * conservent leur centre de commune et restent marquées `municipality`, ce qui
 * suffit à les exclure de l'affichage des distances.
 *
 * L'endpoint CSV de la BAN traite un fichier entier en une requête : ~800
 * adresses en 2,7 s, soit environ une minute pour l'ensemble. Gratuit, sans clé.
 *
 * Le script est idempotent : il ne reprend que les fiches encore au niveau
 * commune, donc une relance après interruption repart là où il s'est arrêté.
 *
 *   node scripts/geocode-companies.mjs [--dry-run] [--limit N]
 */

import fs from "node:fs";
import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > -1 ? Number(process.argv[i + 1]) : null;
})();

const BAN_CSV_URL = "https://api-adresse.data.gouv.fr/search/csv/";
const CHUNK = 2000;

// En deçà, la BAN a rapproché l'adresse d'une voie qui ne lui ressemble guère.
// Mieux vaut garder le centre de commune qu'un point faussement précis.
const MIN_SCORE = 0.4;
const PRECISIONS_ACCEPTEES = new Set(["housenumber", "street"]);

const envFile = fs.readFileSync(".env.local", "utf8");
const getEnv = (key) => {
  const m = envFile.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
};

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Découpe une ligne CSV en respectant les guillemets doublés. */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { quoted = false; }
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  // Une adresse peut contenir un retour à la ligne entre guillemets : on
  // recolle les fragments plutôt que de décaler toutes les colonnes suivantes.
  const raw = text.split("\n");
  const lines = [];
  let buffer = "";
  for (const l of raw) {
    buffer = buffer ? `${buffer}\n${l}` : l;
    const quotes = (buffer.match(/"/g) || []).length;
    if (quotes % 2 === 0) { lines.push(buffer); buffer = ""; }
  }
  if (buffer) lines.push(buffer);

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const cells = parseCsvLine(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

async function geocodeChunk(rows) {
  const csv = [
    "id,adresse,postal_code",
    ...rows.map((r) => [csvCell(r.id), csvCell(r.adresse), csvCell(r.postal_code)].join(",")),
  ].join("\n");

  const form = new FormData();
  form.append("data", new Blob([csv], { type: "text/csv" }), "adresses.csv");
  form.append("columns", "adresse");
  form.append("postcode", "postal_code");

  const res = await fetch(BAN_CSV_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`BAN a répondu ${res.status} ${res.statusText}`);
  return parseCsv(await res.text());
}

async function main() {
  const client = new pg.Client({ connectionString: getEnv("SUPABASE_DB_URL") });
  await client.connect();

  const stats = { lus: 0, retenus: 0, housenumber: 0, street: 0, rejetes: 0, cpDivergent: 0, ecrits: 0 };

  try {
    const { rows } = await client.query(
      `SELECT id, address AS adresse, postal_code
         FROM winelio.companies
        WHERE deleted_at IS NULL
          AND address ~ '^[0-9]'
          AND postal_code IS NOT NULL AND btrim(postal_code) <> ''
          AND (geo_precision IS NULL OR geo_precision = 'municipality')
        ORDER BY id
        ${LIMIT ? `LIMIT ${LIMIT}` : ""}`
    );
    stats.lus = rows.length;
    console.log(`${rows.length} fiches à géocoder${DRY_RUN ? " (simulation)" : ""}`);
    if (!rows.length) return;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const results = await geocodeChunk(chunk);
      const retenus = [];

      for (const r of results) {
        const type = r.result_type;
        const score = Number(r.result_score || 0);
        const lat = Number(r.latitude);
        const lon = Number(r.longitude);

        if (!PRECISIONS_ACCEPTEES.has(type) || !Number.isFinite(lat) || !Number.isFinite(lon) || score < MIN_SCORE) {
          stats.rejetes++;
          continue;
        }
        // La BAN a filtré sur le code postal fourni ; un écart trahit un
        // rapprochement hasardeux plutôt qu'une adresse mieux connue.
        if (r.result_postcode && r.result_postcode !== r.postal_code) {
          stats.cpDivergent++;
          stats.rejetes++;
          continue;
        }

        retenus.push([r.id, lat, lon, type]);
        stats.retenus++;
        stats[type]++;
      }

      if (retenus.length && !DRY_RUN) {
        // Une seule requête par lot : 2000 UPDATE unitaires prendraient des minutes.
        const res = await client.query(
          `UPDATE winelio.companies AS c
              SET latitude = v.lat, longitude = v.lon,
                  geo_precision = v.precision, geo_source = 'ban',
                  updated_at = now()
             FROM (SELECT * FROM unnest($1::uuid[], $2::numeric[], $3::numeric[], $4::text[])
                     AS t(id, lat, lon, precision)) AS v
            WHERE c.id = v.id`,
          [retenus.map((r) => r[0]), retenus.map((r) => r[1]), retenus.map((r) => r[2]), retenus.map((r) => r[3])]
        );
        stats.ecrits += res.rowCount;
      }

      console.log(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length} — retenus ${stats.retenus}, rejetés ${stats.rejetes}`);
    }
  } finally {
    await client.end();
  }

  console.log("\nRésultat");
  console.log(`  fiches traitées      : ${stats.lus}`);
  console.log(`  au numéro près       : ${stats.housenumber}`);
  console.log(`  à la voie près       : ${stats.street}`);
  console.log(`  rejetées             : ${stats.rejetes} (dont ${stats.cpDivergent} code postal divergent)`);
  console.log(`  écrites en base      : ${stats.ecrits}`);
  console.log(`  taux de couverture   : ${stats.lus ? ((100 * stats.retenus) / stats.lus).toFixed(1) : 0} %`);
}

main().catch((err) => {
  console.error("Échec :", err.message);
  process.exit(1);
});
