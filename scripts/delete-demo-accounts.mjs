/**
 * Supprime tous les comptes @demo-kiparlo.fr
 *
 * Usage:
 *   node scripts/delete-demo-accounts.mjs
 *   node scripts/delete-demo-accounts.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dxnebmxtkvauergvrmod.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`🗑️  Suppression des comptes @demo-kiparlo.fr ${DRY_RUN ? "(DRY-RUN)" : "(LIVE)"}\n`);

  // 1. Récupère tous les IDs des comptes demo
  let allIds = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, is_professional")
      .like("email", "%demo-kiparlo%")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) { console.error("Erreur fetch:", error.message); break; }
    if (!data || data.length === 0) break;

    allIds = allIds.concat(data.map(p => p.id));
    console.log(`  Page ${page + 1}: ${data.length} comptes trouvés (total: ${allIds.length})`);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`\n📊 Total comptes à supprimer: ${allIds.length}\n`);

  if (DRY_RUN) {
    console.log("Mode DRY-RUN: aucune suppression effectuée.");
    return;
  }

  if (allIds.length === 0) {
    console.log("Aucun compte à supprimer.");
    return;
  }

  // 2. Supprime les recommendation_steps liés
  console.log("🔸 Suppression des recommendation_steps...");
  const { data: recoIds } = await supabase
    .from("recommendations")
    .select("id")
    .or(`professional_id.in.(${allIds.join(",")}),referrer_id.in.(${allIds.join(",")})`);

  if (recoIds && recoIds.length > 0) {
    const ids = recoIds.map(r => r.id);
    console.log(`   ${ids.length} recommendations trouvées`);

    // Supprime par batch de 100
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("recommendation_steps").delete().in("recommendation_id", batch);
    }
    console.log("   ✅ recommendation_steps supprimés");

    // 3. Supprime les commission_transactions
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("commission_transactions").delete().in("recommendation_id", batch);
    }
    console.log("   ✅ commission_transactions supprimés");

    // 4. Supprime les recommendations
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("recommendations").delete().in("id", batch);
    }
    console.log("   ✅ recommendations supprimées");
  }

  // 5. Supprime les commissions liées aux profils directement
  console.log("🔸 Suppression des commission_transactions restantes...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("commission_transactions").delete().in("user_id", batch);
    await supabase.from("commission_transactions").delete().in("referrer_id", batch);
  }
  console.log("   ✅ commissions supprimées");

  // 6. Supprime les user_wallet_summaries
  console.log("🔸 Suppression des wallets...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("user_wallet_summaries").delete().in("user_id", batch);
  }
  console.log("   ✅ wallets supprimés");

  // 7. Supprime les withdrawals
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("withdrawals").delete().in("user_id", batch);
  }

  // 8. Supprime les contacts
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("contacts").delete().in("user_id", batch);
  }

  // 9. Supprime les devices
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("devices").delete().in("user_id", batch);
  }

  // 10. Supprime les reviews
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("reviews").delete().in("professional_id", batch);
  }

  // 11. Reset les sponsor_id qui pointent vers ces comptes
  console.log("🔸 Reset des sponsor_id...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("profiles").update({ sponsor_id: null }).in("sponsor_id", batch);
  }
  console.log("   ✅ sponsor_id nettoyés");

  // 12. Supprime les companies
  console.log("🔸 Suppression des companies...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("companies").delete().in("owner_id", batch);
  }
  console.log("   ✅ companies supprimées");

  // 13. Supprime les auth users (cascade → profiles)
  console.log(`🔸 Suppression de ${allIds.length} auth users...`);
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < allIds.length; i++) {
    const { error } = await supabase.auth.admin.deleteUser(allIds[i]);
    if (error) {
      errors++;
      if (errors <= 3) console.error(`   ❌ ${allIds[i]}: ${error.message}`);
    } else {
      deleted++;
      if (deleted % 50 === 0) process.stdout.write(`   ${deleted}/${allIds.length}...\n`);
    }
    // Rate limiting léger
    if (i % 10 === 0) await sleep(100);
  }

  console.log(`\n✅ Terminé!`);
  console.log(`   Supprimés: ${deleted}`);
  console.log(`   Erreurs:   ${errors}`);
}

main().catch(console.error);
