/**
 * Seed réseau démo sous contact@aide-multimedia.fr (Stéphane Mairiaux)
 * Crée 5 niveaux de membres + recommandations + commissions
 *
 * Usage: node scripts/seed-demo-network.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dxnebmxtkvauergvrmod.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bmVibXh0a3ZhdWVyZ3ZybW9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg4MDIxNywiZXhwIjoyMDkwNDU2MjE3fQ.PAYAJ43V9WAgfy1Pi-sZlR-TU68Qqodcgz3r_8cz5aU";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Données ──────────────────────────────────────────────────────────────────

const PRENOMS = ["Lucas","Emma","Noah","Léa","Gabriel","Manon","Louis","Chloé","Raphaël","Camille","Arthur","Inès","Hugo","Jade","Thomas","Sarah","Théo","Zoé","Maxime","Alice","Antoine","Clara","Nathan","Julie","Alexis","Marie","Baptiste","Laura","Romain","Margot","Julien","Anaïs","Pierre","Charlotte","Nicolas","Elisa","Florian","Océane","Simon","Noemie"];
const NOMS = ["Martin","Bernard","Thomas","Petit","Robert","Richard","Durand","Dubois","Moreau","Laurent","Simon","Michel","Lefebvre","Leroy","Roux","David","Bertrand","Morel","Fournier","Girard","Bonnet","Dupont","Lambert","Fontaine","Rousseau","Vincent","Muller","Faure","Andre","Mercier","Blanc","Guerin","Boyer","Garnier","Chevalier","Henry","Roussel","Mathieu","Gautier","Masson"];

// IDs de vrais professionnels scrapés
const PROS = [
  "91c94f8b-981b-40a0-ab25-b55118552033",
  "eeee4190-0e33-484f-929d-1c1eec33c84f",
  "a88e435d-336e-4a00-9316-a860d5d81901",
  "368c7360-8588-453a-883b-4555fe4e50aa",
  "08ce8781-6d9d-41cc-82af-18b77e922cc0",
  "fef0c32d-79fd-43a7-bec4-e97dfc860b7f",
  "2b59d54f-5502-40c2-89eb-e57dd4c1969c",
  "cb5835a9-a0b6-4313-9efa-6b1b1263154a",
  "1cd45772-d722-4643-a7d6-d8553d3e5d27",
  "bb021201-002f-4bc5-82f4-41f9c7ac94ac",
  "78aed7a1-c614-49e3-b932-78b14c17b6dd",
  "7f605d43-80d0-44e4-9dae-c51f1cc969fe",
  "03303c7e-7b82-4129-9617-834e1cb87dec",
  "8b93ddf2-00b9-45c0-96e4-1e4bdc8d2b33",
  "60076b15-51e4-431a-9087-fe9484fc91eb",
];

const STATUSES = ["PENDING","ACCEPTED","CONTACT_MADE","MEETING_SCHEDULED","QUOTE_SUBMITTED","QUOTE_VALIDATED","PAYMENT_RECEIVED","COMPLETED"];
const AMOUNTS = [800, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const VILLES = ["Paris","Lyon","Marseille","Toulouse","Bordeaux","Nantes","Lille","Rennes"];

// Stéphane Mairiaux
const STEPHAN_ID = "73dddec2-6f36-4b88-a3be-36730e134665";

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let counter = 0;
function uniqueEmail() {
  counter++;
  return `demo.member.${Date.now()}.${counter}@demo-kiparlo.fr`;
}

// ─── Crée un membre ───────────────────────────────────────────────────────────

async function createMember(sponsorId, level) {
  const prenom = rand(PRENOMS);
  const nom = rand(NOMS);
  const email = uniqueEmail();

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "demo_seed", level },
  });

  if (authErr) {
    console.error(`  ❌ createUser: ${authErr.message}`);
    return null;
  }

  const userId = authData.user.id;

  await supabase.from("profiles").update({
    first_name: prenom,
    last_name: nom,
    sponsor_id: sponsorId,
    city: rand(VILLES),
    is_professional: false,
  }).eq("id", userId);

  return { id: userId, name: `${prenom} ${nom}`, email };
}

// ─── Crée des recommandations pour un membre ─────────────────────────────────

async function createRecommendations(referrerId, count) {
  const created = [];
  for (let i = 0; i < count; i++) {
    const proId = rand(PROS);
    const status = rand(STATUSES);
    const amount = rand(AMOUNTS);
    const daysAgo = randInt(5, 180);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

    const { data: reco, error } = await supabase.from("recommendations").insert({
      referrer_id: referrerId,
      professional_id: proId,
      status,
      amount: ["QUOTE_SUBMITTED","QUOTE_VALIDATED","PAYMENT_RECEIVED","COMPLETED"].includes(status) ? amount : null,
      created_at: createdAt,
      updated_at: createdAt,
    }).select("id").single();

    if (error || !reco) continue;
    created.push({ id: reco.id, status, amount });

    // Commissions si validée ou complétée
    if (["QUOTE_VALIDATED","PAYMENT_RECEIVED","COMPLETED"].includes(status)) {
      const commission = Math.round(amount * 0.60);
      await supabase.from("commission_transactions").insert({
        user_id: referrerId,
        referrer_id: referrerId,
        recommendation_id: reco.id,
        amount: commission,
        type: "REFERRAL",
        level: 0,
        status: status === "COMPLETED" ? "EARNED" : "PENDING",
        created_at: createdAt,
      });

      // Met à jour le wallet
      await supabase.from("user_wallet_summaries").upsert({
        user_id: referrerId,
        total_earned: commission,
        available: commission,
        pending_commissions: 0,
        total_withdrawn: 0,
        total_wins: 0,
        available_wins: 0,
        redeemed_wins: 0,
      }, { onConflict: "user_id", ignoreDuplicates: false });
    }

    await sleep(50);
  }
  return created;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seed réseau démo sous Stéphane Mairiaux\n");

  // Structure du réseau :
  // Stéphane → 4 membres niveau 1
  //   → chacun 3 membres niveau 2
  //     → chacun 2 membres niveau 3
  //       → chacun 1 membre niveau 4
  //         → chacun 1 membre niveau 5

  let totalMembers = 0;
  let totalRecos = 0;

  const level1 = [];
  for (let i = 0; i < 4; i++) {
    const m = await createMember(STEPHAN_ID, 1);
    if (!m) continue;
    level1.push(m);
    totalMembers++;
    const recos = await createRecommendations(m.id, randInt(3, 6));
    totalRecos += recos.length;
    process.stdout.write(`  L1 ${m.name} (${recos.length} recos)\n`);
    await sleep(200);
  }

  const level2 = [];
  for (const parent of level1) {
    for (let i = 0; i < randInt(2, 4); i++) {
      const m = await createMember(parent.id, 2);
      if (!m) continue;
      level2.push(m);
      totalMembers++;
      const recos = await createRecommendations(m.id, randInt(2, 5));
      totalRecos += recos.length;
      process.stdout.write(`    L2 ${m.name} (${recos.length} recos)\n`);
      await sleep(150);
    }
  }

  const level3 = [];
  for (const parent of level2) {
    for (let i = 0; i < randInt(1, 3); i++) {
      const m = await createMember(parent.id, 3);
      if (!m) continue;
      level3.push(m);
      totalMembers++;
      const recos = await createRecommendations(m.id, randInt(1, 4));
      totalRecos += recos.length;
      process.stdout.write(`      L3 ${m.name}\n`);
      await sleep(100);
    }
  }

  const level4 = [];
  for (const parent of level3) {
    if (Math.random() < 0.7) {
      const m = await createMember(parent.id, 4);
      if (m) {
        level4.push(m);
        totalMembers++;
        await createRecommendations(m.id, randInt(1, 3));
        process.stdout.write(`        L4 ${m.name}\n`);
        await sleep(100);
      }
    }
  }

  for (const parent of level4) {
    if (Math.random() < 0.5) {
      const m = await createMember(parent.id, 5);
      if (m) {
        totalMembers++;
        await createRecommendations(m.id, randInt(1, 2));
        process.stdout.write(`          L5 ${m.name}\n`);
        await sleep(100);
      }
    }
  }

  // Quelques recommandations de Stéphane lui-même
  const stephanRecos = await createRecommendations(STEPHAN_ID, 5);
  totalRecos += stephanRecos.length;

  console.log(`\n✅ Réseau créé !`);
  console.log(`   Membres : ${totalMembers}`);
  console.log(`   Recommandations : ${totalRecos}`);
}

main().catch(console.error);
