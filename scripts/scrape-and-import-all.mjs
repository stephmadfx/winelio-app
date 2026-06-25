/**
 * Script d'orchestration pour lancer séquentiellement le scraping,
 * l'import (filtré par email) et le géocodage de toutes les catégories vides.
 * 
 * Usage :
 *   node scripts/scrape-and-import-all.mjs
 */

import fs from "fs";
import { execSync } from "child_process";

const categories = [
  { slug: "jardinage", query: "paysagiste jardinier elagage" },
  { slug: "comptabilite", query: "expert comptable cabinet comptable" },
  { slug: "assurance", query: "courtier assurance agence assurance" },
  { slug: "automobile", query: "garage automobile reparation auto" },
  { slug: "demenagement", query: "demenageur entreprise demenagement" },
  { slug: "informatique", query: "depannage informatique agence web" },
  { slug: "juridique", query: "avocat notaire" },
  { slug: "menuiserie", query: "menuisier menuiserie" },
  { slug: "nettoyage", query: "entreprise nettoyage nettoyage bureaux" },
  { slug: "peinture", query: "artisan peintre peintre batiment" },
  { slug: "courtier-credit", query: "courtier credit courtier pret courtier taux" }
];

function runCommand(cmd) {
  console.log(`\n============================================================`);
  console.log(`🏃 Execution de : ${cmd}`);
  console.log(`============================================================\n`);
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch (err) {
    console.error(`❌ Echec de la commande : ${cmd}`);
    console.error(err.message);
    return false;
  }
}

async function main() {
  console.log("🚀 DÉMARRAGE DU WORKFLOW GLOBAL POUR LES 10 CATÉGORIES VIDES");
  console.log(`   Nombre de catégories à traiter : ${categories.length}`);
  console.log("------------------------------------------------------------\n");

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const catUpper = cat.slug.toUpperCase();
    console.log(`\n🎬 [${i + 1}/${categories.length}] DÉBUT DU WORKFLOW : ${catUpper}`);

    // 1. Scraping des 100 villes pour cette catégorie
    const scrapeCmd = `node scripts/scrape-generic.mjs --slug ${cat.slug} --query "${cat.query}"`;
    const scrapeSuccess = runCommand(scrapeCmd);
    if (!scrapeSuccess) {
      console.error(`⚠️ Scraping échoué ou interrompu pour ${cat.slug}. Passage à l'import des données déjà existantes s'il y en a.`);
    }

    // 2. Importation dans la base de données (uniquement avec email réel)
    const csvPath = `outputs/${cat.slug}_france.csv`;
    if (fs.existsSync(csvPath)) {
      const importCmd = `node scripts/import-scraped-pros.mjs --file ${csvPath} --category-slug ${cat.slug} --only-email`;
      runCommand(importCmd);
    } else {
      console.log(`⚠️ Aucun fichier CSV trouvé pour ${cat.slug}, import sauté.`);
    }

    // 3. Géocodage des adresses et codes postaux importés
    const backfillCmd = `node scripts/backfill-coordinates.mjs`;
    runCommand(backfillCmd);

    console.log(`🏁 [${i + 1}/${categories.length}] WORKFLOW TERMINÉ : ${catUpper}`);
  }

  console.log("\n============================================================");
  console.log("🎉 TOUTES LES CATÉGORIES ONT ÉTÉ TRAITÉES AVEC SUCCÈS !");
  console.log("============================================================");
}

main().catch(console.error);
