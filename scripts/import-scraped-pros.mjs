/**
 * Script d'importation des professionnels scrapés dans la base de données Winelio.
 * 
 * Ce script lit un fichier CSV (semicolon-separated), valide les données,
 * gère le dédoublonnage (e-mail, téléphone) par rapport aux vrais pros existants,
 * crée un compte factice auth.users / profiles (email pro.[uuid]@winelio-scraped.local)
 * et insère la fiche entreprise avec source='scraped'.
 * 
 * Usage :
 *   node scripts/import-scraped-pros.mjs --file outputs/agents_immobiliers_france.csv --category-slug immobilier --limit 10
 *   node scripts/import-scraped-pros.mjs --file outputs/agents_immobiliers_france.csv --category-slug immobilier --concurrency 5
 *   node scripts/import-scraped-pros.mjs --file outputs/agents_immobiliers_france.csv --category-slug immobilier --dry-run
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ─── Configuration Supabase ──────────────────────────────────────────────────

const SUPABASE_URL = "https://supabase.aide-multimedia.fr";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.YJaG6JP4aadbwKUpNhLpx6j_F5F_oCvW5rCVn_FZn-o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Arguments CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const filePath = getArg("file");
const categorySlug = getArg("category-slug");
const limit = parseInt(getArg("limit") || "0", 10);
const concurrency = parseInt(getArg("concurrency") || "3", 10);
const dryRun = args.includes("--dry-run");
const onlyEmail = args.includes("--only-email");

function isValidEmail(email) {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return clean.includes("@") && !clean.includes("introuvable") && !clean.includes("placeholder");
}

if (!filePath) {
  console.error("❌ Argument requis : --file <chemin_vers_csv>");
  process.exit(1);
}
if (!categorySlug) {
  console.error("❌ Argument requis : --category-slug <slug_categorie>");
  process.exit(1);
}

// ─── Helpers de Parsing ──────────────────────────────────────────────────────

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== "\\") {
      inQuotes = !inQuotes;
    } else if (c === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Fichier introuvable : ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  // Enlever le BOM s'il est présent
  const cleanContent = content.startsWith("\ufeff") ? content.slice(1) : content;
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  
  if (lines.length < 2) {
    console.error("❌ Le fichier CSV est vide ou ne contient pas de données.");
    process.exit(1);
  }

  const header = lines[0].split(";").map((h) => h.trim().replace(/^"/, "").replace(/"$/, ""));
  const idx = {
    name: header.indexOf("Nom"),
    city: header.indexOf("Ville"),
    rating: header.indexOf("Note Google"),
    reviewsCount: header.indexOf("Nombre d'avis"),
    phone: header.indexOf("Téléphone"),
    email: header.indexOf("Email"),
    website: header.indexOf("Site Web"),
    address: header.indexOf("Adresse"),
    postalCode: header.indexOf("Code Postal"),
    placeId: header.indexOf("Place ID"),
  };

  if (idx.name === -1) {
    console.error("❌ La colonne 'Nom' est obligatoire dans le CSV.");
    process.exit(1);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]).map(c => c.trim().replace(/^"/, "").replace(/"$/, ""));
    const row = {
      name: cols[idx.name] || "",
      city: idx.city !== -1 ? cols[idx.city] : "",
      rating: idx.rating !== -1 ? cols[idx.rating] : "",
      reviewsCount: idx.reviewsCount !== -1 ? cols[idx.reviewsCount] : "",
      phone: idx.phone !== -1 ? cols[idx.phone] : "",
      email: idx.email !== -1 ? cols[idx.email] : "",
      website: idx.website !== -1 ? cols[idx.website] : "",
      address: idx.address !== -1 ? cols[idx.address] : "",
      postalCode: idx.postalCode !== -1 ? cols[idx.postalCode] : "",
      placeId: idx.placeId !== -1 ? cols[idx.placeId] : "",
    };
    if (row.name) {
      rows.push(row);
    }
  }

  return rows;
}

const ALIAS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function makeRandomAlias() {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ALIAS_CHARS[Math.floor(Math.random() * ALIAS_CHARS.length)];
  }
  return `#${suffix}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 Démarrage de l'import des professionnels scrapés`);
  console.log(`   Fichier         : ${filePath}`);
  console.log(`   Catégorie Slug  : ${categorySlug}`);
  console.log(`   Simulé (DryRun) : ${dryRun ? "OUI" : "NON"}`);
  console.log(`   Limite          : ${limit > 0 ? limit : "Aucune"}`);
  console.log(`   Parallélisme    : ${concurrency}`);
  console.log(`------------------------------------------------------------\n`);

  // 1. Charger la catégorie en DB pour obtenir son ID
  const { data: categoryData, error: catError } = await supabase
    .schema("winelio")
    .from("categories")
    .select("id, name")
    .eq("slug", categorySlug)
    .maybeSingle();

  if (catError || !categoryData) {
    console.error(`❌ Catégorie introuvable pour le slug '${categorySlug}' :`, catError?.message || "Non trouvée");
    process.exit(1);
  }
  console.log(`📍 Catégorie résolue : ${categoryData.name} (${categoryData.id})`);

  // 2. Parser le fichier CSV
  const allRows = parseCSV(filePath);
  console.log(`📄 ${allRows.length} lignes chargées depuis le CSV.`);

  const rowsToProcess = limit > 0 ? allRows.slice(0, limit) : allRows;
  console.log(`🎯 ${rowsToProcess.length} lignes vont être traitées.`);

  // 3. Charger le cache local pour le dédoublonnage afin d'éviter des requêtes SQL pour chaque ligne
  console.log("🔍 Chargement des profils et entreprises de la DB pour dédoublonnage...");
  
  // E-mails existants dans profiles
  const { data: existingProfiles, error: profErr } = await supabase
    .schema("winelio")
    .from("profiles")
    .select("email");
  if (profErr) {
    console.error("❌ Impossible de charger les profils existants :", profErr.message);
    process.exit(1);
  }
  const dbEmails = new Set((existingProfiles || []).map(p => p.email.toLowerCase().trim()));

  // E-mails et téléphones existants dans companies
  const { data: existingCompanies, error: compErr } = await supabase
    .schema("winelio")
    .from("companies")
    .select("email, phone");
  if (compErr) {
    console.error("❌ Impossible de charger les compagnies existantes :", compErr.message);
    process.exit(1);
  }
  
  const companyEmails = new Set();
  const companyPhones = new Set();
  (existingCompanies || []).forEach(c => {
    if (c.email) companyEmails.add(c.email.toLowerCase().trim());
    if (c.phone) {
      // Nettoyer les espaces du téléphone en DB pour comparaison
      const cleanDbPhone = c.phone.replace(/\s+/g, "").trim();
      if (cleanDbPhone) companyPhones.add(cleanDbPhone);
    }
  });

  console.log(`   Cache initialisé : ${dbEmails.size} profils, ${companyEmails.size} e-mails d'entreprises, ${companyPhones.size} numéros de téléphone.`);

  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // 4. Fonction de traitement pour une seule ligne
  async function processRow(row, index) {
    const rowNum = index + 1;
    const name = row.name;
    const email = row.email?.toLowerCase().trim();
    const phone = row.phone?.replace(/\s+/g, "").trim(); // Supprimer les espaces pour la comparaison

    if (onlyEmail && !isValidEmail(email)) {
      skippedCount++;
      return;
    }

    // Dédoublonnage E-mail
    if (email) {
      if (dbEmails.has(email) || companyEmails.has(email)) {
        // console.log(`   [Ligne ${rowNum}] ⏭️ Ignoré (Doublon e-mail : ${email})`);
        skippedCount++;
        return;
      }
    }

    // Dédoublonnage Téléphone
    if (phone) {
      if (companyPhones.has(phone)) {
        // console.log(`   [Ligne ${rowNum}] ⏭️ Ignoré (Doublon téléphone : ${row.phone})`);
        skippedCount++;
        return;
      }
    }

    if (dryRun) {
      console.log(`   [Ligne ${rowNum}] 🧪 [Simulation] Création pour : ${name} (${row.city})`);
      createdCount++;
      // Ajouter au cache local de simulation pour les lignes suivantes du même CSV
      if (email) {
        dbEmails.add(email);
        companyEmails.add(email);
      }
      if (phone) {
        companyPhones.add(phone);
      }
      return;
    }

    // Processus de création réel
    try {
      // 1. Créer un shadow user dans auth
      const placeholderEmail = `pro.${crypto.randomUUID().split("-")[0]}@winelio-scraped.local`;
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: true,
        user_metadata: { scraped: true, app: "winelio" },
      });

      if (authErr || !authUser?.user) {
        console.error(`❌ [Ligne ${rowNum}] Erreur auth pour ${name} :`, authErr?.message || "Unknown error");
        errorCount++;
        return;
      }

      const userId = authUser.user.id;

      // 2. Mettre à jour le profil créé par le trigger
      const { error: profileErr } = await supabase
        .schema("winelio")
        .from("profiles")
        .upsert({
          id: userId,
          email: placeholderEmail,
          is_professional: true,
          city: row.city || null,
          postal_code: row.postalCode || null,
          address: row.address || null,
        });

      if (profileErr) {
        console.error(`❌ [Ligne ${rowNum}] Erreur mise à jour profil pour ${name} :`, profileErr.message);
        // Nettoyage de l'utilisateur auth créé
        await supabase.auth.admin.deleteUser(userId);
        errorCount++;
        return;
      }

      // 3. Insérer la compagnie
      const alias = makeRandomAlias();
      const { error: companyErr } = await supabase
        .schema("winelio")
        .from("companies")
        .insert({
          owner_id: userId,
          name: name,
          alias: alias,
          email: row.email || null,
          phone: row.phone || null,
          city: row.city || null,
          postal_code: row.postalCode || null,
          address: row.address || null,
          website: row.website || null,
          category_id: categoryData.id,
          source: "scraped",
          is_verified: false,
          country: "FR",
        });

      if (companyErr) {
        console.error(`❌ [Ligne ${rowNum}] Erreur insertion compagnie pour ${name} :`, companyErr.message);
        // Nettoyage de l'utilisateur auth créé
        await supabase.auth.admin.deleteUser(userId);
        errorCount++;
        return;
      }

      // Ajouter au cache local pour éviter les doublons au sein du même import
      if (email) {
        dbEmails.add(email);
        companyEmails.add(email);
      }
      if (phone) {
        companyPhones.add(phone);
      }

      createdCount++;
      if (createdCount % 50 === 0) {
        console.log(`🔹 Progrès : ${createdCount} professionnels créés...`);
      }

    } catch (err) {
      console.error(`❌ [Ligne ${rowNum}] Exception critique lors du traitement de ${name} :`, err.message);
      errorCount++;
    }
  }

  // 5. Exécution avec parallélisme contrôlé (concurrency)
  console.log(`\n📥 Début de l'importation de ${rowsToProcess.length} lignes...`);
  
  const queue = [...rowsToProcess];
  const activeWorkers = [];
  let index = 0;

  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift();
      const currentIndex = index++;
      await processRow(row, currentIndex);
    }
  }

  // Lancer le nombre d'ouvriers concurrents souhaité
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    activeWorkers.push(worker());
  }

  // Attendre que tous les ouvriers aient fini
  await Promise.all(activeWorkers);

  console.log(`\n============================================================`);
  console.log(`🏁 Importation terminée !`);
  console.log(`   Créés avec succès       : ${createdCount}`);
  console.log(`   Ignorés (doublons)       : ${skippedCount}`);
  console.log(`   Erreurs rencontrées     : ${errorCount}`);
  console.log(`============================================================`);
}

main().catch(console.error);
