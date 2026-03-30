/**
 * Seed recommandations + commissions pour le réseau démo existant
 * (les membres sont déjà créés par seed-demo-network.mjs)
 *
 * Usage: node scripts/seed-demo-recommendations.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dxnebmxtkvauergvrmod.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bmVibXh0a3ZhdWVyZ3ZybW9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg4MDIxNywiZXhwIjoyMDkwNDU2MjE3fQ.PAYAJ43V9WAgfy1Pi-sZlR-TU68Qqodcgz3r_8cz5aU";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STEPHAN_ID = "73dddec2-6f36-4b88-a3be-36730e134665";

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
const COMMISSION_RATE = 0.60;

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ~30% des dates en mars 2026, reste dans les 6 derniers mois
function randomDate() {
  if (Math.random() < 0.30) {
    // Mars 2026
    const day = randInt(1, 28);
    return new Date(2026, 2, day).toISOString();
  } else {
    const daysAgo = randInt(10, 180);
    return new Date(Date.now() - daysAgo * 86400000).toISOString();
  }
}

const VALIDATED_STATUSES = ["QUOTE_VALIDATED", "PAYMENT_RECEIVED", "COMPLETED"];

async function createRecommendations(referrerId, count, sponsorChain) {
  let totalRecos = 0;
  let totalCommissions = 0;

  for (let i = 0; i < count; i++) {
    const proId = rand(PROS);
    const status = rand(STATUSES);
    const amount = rand(AMOUNTS);
    const createdAt = randomDate();

    const hasAmount = ["QUOTE_SUBMITTED","QUOTE_VALIDATED","PAYMENT_RECEIVED","COMPLETED"].includes(status);

    const { data: reco, error } = await supabase.from("recommendations").insert({
      referrer_id: referrerId,
      professional_id: proId,
      status,
      amount: hasAmount ? amount : null,
      created_at: createdAt,
      updated_at: createdAt,
    }).select("id").single();

    if (error) {
      process.stdout.write(` [reco error: ${error.message}]`);
      continue;
    }

    totalRecos++;

    // Commissions si statut validé
    if (VALIDATED_STATUSES.includes(status) && hasAmount) {
      const isEarned = status === "COMPLETED" || Math.random() < 0.6;
      const commStatus = isEarned ? "EARNED" : "PENDING";

      // Commission directe du referrer (60%)
      const directCommission = Math.round(amount * COMMISSION_RATE);
      await supabase.from("commission_transactions").insert({
        user_id: referrerId,
        referrer_id: referrerId,
        recommendation_id: reco.id,
        amount: directCommission,
        type: "recommendation",
        level: 0,
        status: commStatus,
        created_at: createdAt,
      });
      totalCommissions++;

      // Commissions réseau vers les sponsors (niveaux 1-5)
      const LEVEL_RATES = [0.04, 0.04, 0.04, 0.04, 0.04];
      for (let lvl = 0; lvl < Math.min(sponsorChain.length, 5); lvl++) {
        const sponsorId = sponsorChain[lvl];
        const levelCommission = Math.round(amount * LEVEL_RATES[lvl]);
        await supabase.from("commission_transactions").insert({
          user_id: sponsorId,
          referrer_id: referrerId,
          recommendation_id: reco.id,
          amount: levelCommission,
          type: `referral_level_${lvl + 1}`,
          level: lvl + 1,
          status: commStatus,
          created_at: createdAt,
        });
        totalCommissions++;
      }
    }

    await sleep(30);
  }

  return { totalRecos, totalCommissions };
}

async function getAllDemoMembers() {
  // Récupère tous les membres du réseau démo (sponsorisés par Stéphane ou dans sa lignée)
  const allMembers = [];

  // Récupère récursivement tous les membres par niveau
  async function getChildren(parentId, level, chain) {
    if (level > 5) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("sponsor_id", parentId)
      .neq("id", STEPHAN_ID);

    if (error || !data) return;

    for (const member of data) {
      allMembers.push({ ...member, level, chain: [...chain, parentId] });
      await getChildren(member.id, level + 1, [...chain, parentId]);
    }
  }

  await getChildren(STEPHAN_ID, 1, []);
  return allMembers;
}

async function main() {
  console.log("🌱 Seed recommandations pour le réseau démo\n");

  // Récupère tous les membres du réseau
  console.log("📋 Récupération des membres du réseau...");
  const members = await getAllDemoMembers();
  console.log(`   ${members.length} membres trouvés\n`);

  if (members.length === 0) {
    console.error("❌ Aucun membre trouvé. Lancez d'abord seed-demo-network.mjs");
    process.exit(1);
  }

  let totalRecos = 0;
  let totalCommissions = 0;

  // Recommandations de Stéphane lui-même
  console.log("👤 Recommandations de Stéphane...");
  const stephanRecos = await createRecommendations(STEPHAN_ID, randInt(4, 7), []);
  totalRecos += stephanRecos.totalRecos;
  totalCommissions += stephanRecos.totalCommissions;
  console.log(`   ${stephanRecos.totalRecos} recos, ${stephanRecos.totalCommissions} commissions`);

  // Recommandations par niveau
  const byLevel = {};
  for (const m of members) {
    if (!byLevel[m.level]) byLevel[m.level] = [];
    byLevel[m.level].push(m);
  }

  for (const [level, levelMembers] of Object.entries(byLevel)) {
    console.log(`\n📊 Niveau ${level} (${levelMembers.length} membres)...`);
    for (const member of levelMembers) {
      const count = randInt(2, 5);
      // La chaîne des sponsors: [sponsor direct, sponsor du sponsor, ...]
      // member.chain = [STEPHAN_ID, L1_member_id, L2_member_id, ...]
      // On inverse pour avoir les sponsors directs en premier
      const sponsorChain = member.chain.slice().reverse();
      // sponsorChain[0] = sponsor direct du membre actuel

      process.stdout.write(`  ${member.first_name} ${member.last_name} (${count} recos)...`);
      const result = await createRecommendations(member.id, count, sponsorChain);
      totalRecos += result.totalRecos;
      totalCommissions += result.totalCommissions;
      process.stdout.write(` ✓\n`);
      await sleep(50);
    }
  }

  // Vérification: commissions de Stéphane en mars 2026
  const { data: marchCommissions } = await supabase
    .from("commission_transactions")
    .select("id, amount, type")
    .eq("user_id", STEPHAN_ID)
    .gte("created_at", "2026-03-01T00:00:00Z")
    .lt("created_at", "2026-04-01T00:00:00Z");

  console.log(`\n✅ Terminé !`);
  console.log(`   Recommandations créées : ${totalRecos}`);
  console.log(`   Commissions créées     : ${totalCommissions}`);
  console.log(`   Commissions Stéphane en mars 2026 : ${marchCommissions?.length || 0}`);
  if (marchCommissions?.length > 0) {
    const total = marchCommissions.reduce((s, c) => s + c.amount, 0);
    console.log(`   Montant total mars 2026 : ${total}€`);
  }
}

main().catch(console.error);
