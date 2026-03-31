import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dxnebmxtkvauergvrmod.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Données aléatoires ───────────────────────────────────────────────────────

const PRENOMS = ["Lucas","Emma","Noah","Léa","Gabriel","Manon","Louis","Chloé","Raphaël","Camille","Arthur","Inès","Hugo","Jade","Thomas","Sarah","Théo","Zoé","Maxime","Alice","Antoine","Clara","Quentin","Lucie","Clément","Pauline","Nathan","Julie","Alexis","Marie","Baptiste","Laura","Romain","Margot","Julien","Anaïs","Pierre","Charlotte","Nicolas","Elisa","Florian","Océane","Mathieu","Céline","Victor","Elise","Simon","Noemie","Luca","Mélanie"];

const NOMS = ["Martin","Bernard","Thomas","Petit","Robert","Richard","Durand","Dubois","Moreau","Laurent","Simon","Michel","Lefebvre","Leroy","Roux","David","Bertrand","Morel","Fournier","Girard","Bonnet","Dupont","Lambert","Fontaine","Rousseau","Vincent","Muller","Lefevre","Faure","Andre","Mercier","Blanc","Guerin","Boyer","Garnier","Chevalier","Francois","Legrand","Gauthier","Garcia","Perrin","Robin","Clement","Morin","Nicolas","Henry","Roussel","Mathieu","Gautier","Masson"];

const DESCRIPTIONS_RECO = [
  "Client cherche une rénovation complète de sa salle de bain",
  "Besoin d'un électricien pour mise aux normes",
  "Installation d'une pompe à chaleur",
  "Réfection de toiture urgente",
  "Aménagement d'une terrasse en bois",
  "Pose de carrelage dans cuisine et couloir",
  "Peinture intérieure d'un appartement 3 pièces",
  "Installation d'une cuisine équipée",
  "Création d'une salle de bain complète",
  "Remplacement de fenêtres double vitrage",
  "Rénovation de parquet ancien",
  "Installation système de climatisation",
  "Travaux de plomberie salle de bain",
  "Extension maison 20m²",
  "Isolation des combles perdus",
];

const CATEGORIES_PRO = ["Plombier","Électricien","Menuisier","Carreleur","Peintre","Maçon","Couvreur","Chauffagiste","Jardinier","Architecte"];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(monthsAgo = 12) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * monthsAgo * 30));
  return d.toISOString();
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toLowerCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Recherche de Sandrine...");

  // Trouver l'utilisateur auth de Sandrine (pagination complète)
  let page = 1;
  let sandrine = null;
  while (!sandrine) {
    const { data, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 50, page });
    if (usersErr) throw usersErr;
    if (!data.users.length) break;
    sandrine = data.users.find(u => u.email === "degueille.sandrine@orange.fr");
    if (data.users.length < 50) break;
    page++;
  }
  if (!sandrine) throw new Error("Utilisateur Sandrine introuvable !");

  console.log(`✅ Sandrine trouvée : ${sandrine.id}`);

  // Récupérer son profil
  const { data: sandrineProfile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, sponsor_code")
    .eq("id", sandrine.id)
    .single();

  if (!sandrineProfile) throw new Error("Profil Sandrine introuvable !");
  console.log(`✅ Profil : ${sandrineProfile.first_name} ${sandrineProfile.last_name} (code: ${sandrineProfile.sponsor_code})`);

  // ─── Créer 200 membres en hiérarchie ────────────────────────────────────────
  // L1 : 5 membres (sponsor = Sandrine)
  // L2 : ~45 membres (répartis aléatoirement sur L1)
  // L3 : ~80 membres (répartis aléatoirement sur L2)
  // L4 : ~50 membres (répartis aléatoirement sur L3)
  // L5 : ~20 membres (répartis aléatoirement sur L4)
  // Total : 5+45+80+50+20 = 200

  const PLAN = [
    { count: 5,  label: "L1" },
    { count: 45, label: "L2" },
    { count: 80, label: "L3" },
    { count: 50, label: "L4" },
    { count: 20, label: "L5" },
  ];

  let previousLevel = [sandrine.id]; // parents disponibles pour ce niveau
  const allCreatedProfiles = []; // tous les profils créés

  for (const { count, label } of PLAN) {
    console.log(`\n📦 Création niveau ${label} (${count} membres)...`);
    const levelProfiles = [];

    for (let i = 0; i < count; i++) {
      const firstName = random(PRENOMS);
      const lastName = random(NOMS);
      const email = `kiparlo.test.${Date.now()}.${Math.random().toString(36).slice(2,6)}@example.com`;
      const sponsorId = random(previousLevel);

      // Créer l'utilisateur auth
      const { data: { user: newUser }, error: authErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

      if (authErr || !newUser) {
        console.warn(`  ⚠️  Erreur création auth user ${i+1}/${count}: ${authErr?.message}`);
        continue;
      }

      // Créer le profil
      const sponsorCode = generateCode();
      const createdAt = randomDate(14);

      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert({
          id: newUser.id,
          email,
          first_name: firstName,
          last_name: lastName,
          sponsor_id: sponsorId,
          sponsor_code: sponsorCode,
          created_at: createdAt,
        });

      if (profileErr) {
        console.warn(`  ⚠️  Erreur profil ${firstName}: ${profileErr.message}`);
      } else {
        levelProfiles.push(newUser.id);
        process.stdout.write(".");
      }

      // Petite pause pour ne pas surcharger
      if (i % 10 === 9) await sleep(200);
    }

    allCreatedProfiles.push(...levelProfiles);
    previousLevel = levelProfiles;
    console.log(`\n  ✅ ${levelProfiles.length}/${count} créés`);
  }

  console.log(`\n✅ Total membres réseau créés : ${allCreatedProfiles.length}`);

  // ─── Créer des professionnels fictifs ───────────────────────────────────────
  console.log("\n👷 Création de professionnels...");
  const proIds = [];

  for (let i = 0; i < 10; i++) {
    const firstName = random(PRENOMS);
    const lastName = random(NOMS);
    const email = `pro.kiparlo.${Date.now()}.${Math.random().toString(36).slice(2,5)}@example.com`;

    const { data: { user: proUser }, error: proAuthErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (proAuthErr || !proUser) continue;

    const { error: proProfileErr } = await supabase
      .from("profiles")
      .upsert({
        id: proUser.id,
        email,
        first_name: firstName,
        last_name: lastName,
        sponsor_code: generateCode(),
        is_professional: true,
      });

    if (!proProfileErr) {
      proIds.push(proUser.id);
      process.stdout.write(".");
    }
    await sleep(100);
  }
  console.log(`\n  ✅ ${proIds.length} professionnels créés`);

  if (proIds.length === 0) {
    console.log("⚠️  Aucun professionnel créé, impossible de créer des recommandations");
    return;
  }

  // ─── Créer des recommandations pour Sandrine ────────────────────────────────
  console.log("\n📋 Création des recommandations...");

  // 8 recommandations en cours (PENDING / IN_PROGRESS)
  // 12 recommandations terminées (COMPLETED)
  const recosConfig = [
    ...Array(12).fill("PENDING"),
    ...Array(12).fill("COMPLETED"),
  ];

  for (const status of recosConfig) {
    // Créer un contact
    const cFirstName = random(PRENOMS);
    const cLastName = random(NOMS);
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        first_name: cFirstName,
        last_name: cLastName,
        email: `contact.${Date.now()}.${Math.random().toString(36).slice(2,5)}@example.com`,
        phone: `06${Math.floor(10000000 + Math.random() * 89999999)}`,
        user_id: sandrine.id,
      })
      .select("id")
      .single();

    if (contactErr || !contact) {
      console.warn(`  ⚠️  Erreur contact: ${contactErr?.message}`);
      continue;
    }

    const professionalId = random(proIds);
    const createdAt = randomDate(6);

    const { error: recoErr } = await supabase
      .from("recommendations")
      .insert({
        referrer_id: sandrine.id,
        professional_id: professionalId,
        contact_id: contact.id,
        project_description: random(DESCRIPTIONS_RECO),
        urgency_level: random(["urgent", "normal", "flexible"]),
        status,
        amount: status === "COMPLETED" ? parseFloat((Math.random() * 500 + 50).toFixed(2)) : null,
        created_at: createdAt,
      });

    if (recoErr) {
      console.warn(`  ⚠️  Erreur reco (${status}): ${recoErr.message}`);
    } else {
      process.stdout.write(status === "COMPLETED" ? "✓" : "○");
    }

    await sleep(50);
  }

  console.log("\n\n🎉 Seed terminé avec succès !");
  console.log(`   Réseau : ${allCreatedProfiles.length} membres`);
  console.log(`   Recommandations : ${recosConfig.length} (${recosConfig.filter(s=>s==="COMPLETED").length} terminées, ${recosConfig.filter(s=>s!=="COMPLETED").length} en cours)`);
}

main().catch(err => {
  console.error("\n❌ Erreur fatale:", err.message);
  process.exit(1);
});
