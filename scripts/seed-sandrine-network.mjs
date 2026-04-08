/**
 * Ajoute 3 filleuls directs à Sandrine Degueuille
 * Chaque nœud génère 2-6 filleuls, jusqu'au niveau 5 max.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-sandrine-network.mjs
 *   node scripts/seed-sandrine-network.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL || "https://dxnebmxtkvauergvrmod.supabase.co";
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) { console.error("❌ SUPABASE_SERVICE_ROLE_KEY manquant"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const dryRun = process.argv.includes("--dry-run");

// ─── Données aléatoires ───────────────────────────────────────────────────────

const PRENOMS = [
  "Lucas","Emma","Noah","Léa","Gabriel","Manon","Louis","Chloé","Raphaël","Camille",
  "Arthur","Inès","Hugo","Jade","Thomas","Sarah","Théo","Zoé","Maxime","Alice",
  "Antoine","Clara","Quentin","Lucie","Clément","Pauline","Nathan","Julie","Alexis","Marie",
  "Baptiste","Laura","Romain","Margot","Julien","Anaïs","Pierre","Charlotte","Nicolas","Elisa",
  "Florian","Océane","Mathieu","Céline","Victor","Elise","Simon","Noémie","Luca","Mélanie",
  "Dylan","Ambre","Axel","Eléonore","Adrien","Yasmine","Samuel","Lilou","Kevin","Audrey",
];

const NOMS = [
  "Martin","Bernard","Thomas","Petit","Robert","Richard","Durand","Dubois","Moreau","Laurent",
  "Simon","Michel","Lefebvre","Leroy","Roux","David","Bertrand","Morel","Fournier","Girard",
  "Bonnet","Dupont","Lambert","Fontaine","Rousseau","Vincent","Muller","Lefevre","Faure","Andre",
  "Mercier","Blanc","Guerin","Boyer","Garnier","Chevalier","Francois","Legrand","Gauthier","Garcia",
  "Perrin","Robin","Clement","Morin","Nicolas","Henry","Roussel","Mathieu","Gautier","Masson",
  "Renard","Lemaire","Berger","Leclerc","Aubert","Noel","Picard","Vidal","Conte","Caron",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function randomDate(daysAgoMax = 365) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgoMax));
  return d.toISOString();
}

// ─── Création d'un membre ─────────────────────────────────────────────────────

let totalCreated = 0;

async function createMember(firstName, lastName, sponsorId, level) {
  const email = `demo.winelio.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@winelio-demo.fr`;
  const sponsorCode = generateCode();
  const createdAt = randomDate(30 * (6 - level)); // plus récent = niveau plus profond

  if (dryRun) {
    totalCreated++;
    return { id: `dry-${totalCreated}`, firstName, lastName };
  }

  // 1. Crée l'utilisateur auth
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });

  if (authErr || !authData?.user) {
    console.warn(`  ⚠️  Auth error: ${authErr?.message}`);
    return null;
  }

  const userId = authData.user.id;

  // 2. Met à jour le profil (le trigger l'a déjà créé)
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      sponsor_id: sponsorId,
      sponsor_code: sponsorCode,
    })
    .eq("id", userId);

  if (profileErr) {
    console.warn(`  ⚠️  Profile error pour ${firstName} ${lastName}: ${profileErr.message}`);
    return null;
  }

  totalCreated++;
  return { id: userId, firstName, lastName };
}

// ─── Peuplement récursif ──────────────────────────────────────────────────────

async function populate(parentId, parentName, currentLevel, maxLevel, childrenCount) {
  if (currentLevel > maxLevel) return;

  const indent = "  ".repeat(currentLevel);
  console.log(`${indent}📌 Niveau ${currentLevel} → ${childrenCount} filleuls sous ${parentName}`);

  const children = [];

  for (let i = 0; i < childrenCount; i++) {
    const firstName = pick(PRENOMS);
    const lastName  = pick(NOMS);

    process.stdout.write(`${indent}  ↳ ${firstName} ${lastName}... `);

    const member = await createMember(firstName, lastName, parentId, currentLevel);

    if (member) {
      process.stdout.write(dryRun ? "(dry-run)\n" : "✅\n");
      children.push(member);
    } else {
      process.stdout.write("❌\n");
    }

    await sleep(150);
  }

  // Récursion vers le niveau suivant
  for (const child of children) {
    const nextCount = randInt(2, 6);
    await populate(child.id, `${child.firstName} ${child.lastName}`, currentLevel + 1, maxLevel, nextCount);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌳 Seed réseau Sandrine Degueuille");
  console.log(`   Mode: ${dryRun ? "DRY-RUN" : "LIVE"}\n`);

  // Trouver Sandrine dans les profils
  const { data: profiles, error: searchErr } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, sponsor_code")
    .eq("id", "894ee44e-8846-437a-a227-221ef9b661b4");

  if (searchErr) throw new Error(`Erreur recherche: ${searchErr.message}`);
  if (!profiles?.length) throw new Error("Sandrine Degueuille introuvable dans les profils !");

  const sandrine = profiles[0];
  console.log(`✅ Sandrine trouvée : ${sandrine.first_name} ${sandrine.last_name} (id: ${sandrine.id})`);
  console.log(`   Code parrainage : ${sandrine.sponsor_code}\n`);

  // 3 filleuls directs (niveau 1), chacun avec 2-6 filleuls récursivement jusqu'au niveau 5
  await populate(sandrine.id, `${sandrine.first_name} ${sandrine.last_name}`, 1, 5, 3);

  console.log("\n" + "─".repeat(60));
  console.log(`✅ Terminé !`);
  console.log(`   Total membres créés : ${totalCreated}`);
}

main().catch(err => {
  console.error("\n❌ Erreur fatale:", err.message);
  process.exit(1);
});
