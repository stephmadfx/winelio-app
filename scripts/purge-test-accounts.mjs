/**
 * Supprime les comptes de test non-démo de la base Winelio (self-hosted).
 *
 * Conserve :
 *   - @kiparlo-demo.fr, @demo-kiparlo.fr, @kiparlo-pro.fr  (démo réseau MLM)
 *   - @gmail.com, @orange.fr et autres pros scrapés
 *   - contact@aide-multimedia.fr (compte racine Stéphane)
 *   - thierry.carlier.pro@gmail.com, christophe.carlier.professionnel@gmail.com (super_admins)
 *
 * Supprime :
 *   - @example.com (comptes fake)
 *   - @deltajohnsons.com, @mailinator.com, @fpxnet.com, @sharklasers.com, @forliion.com (emails jetables)
 *   - emails corrompus (contenant ".jpeg" etc.)
 *   - stephmadfx@netcourrier.com (compte test)
 *
 * Usage:
 *   node scripts/purge-test-accounts.mjs --dry-run
 *   node scripts/purge-test-accounts.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.aide-multimedia.fr";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.YJaG6JP4aadbwKUpNhLpx6j_F5F_oCvW5rCVn_FZn-o";
const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "winelio" },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Domaines/emails à supprimer
const DELETE_DOMAINS = [
  "%@example.com",
  "%@deltajohnsons.com",
  "%@mailinator.com",
  "%@fpxnet.com",
  "%@sharklasers.com",
  "%@forliion.com",
  "%.jpeg",   // emails corrompus
];
const DELETE_EXACT = [
  "stephmadfx@netcourrier.com",
];

async function getAccountsToDelete() {
  let allIds = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    // Build OR filter
    const orFilters = [
      ...DELETE_DOMAINS.map(d => `email.like.${d}`),
      ...DELETE_EXACT.map(e => `email.eq.${e}`),
    ].join(",");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .or(orFilters)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) { console.error("Erreur fetch:", error.message); break; }
    if (!data || data.length === 0) break;

    allIds = allIds.concat(data.map(p => ({ id: p.id, email: p.email, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() })));
    if (data.length < pageSize) break;
    page++;
  }

  return allIds;
}

async function main() {
  console.log(`\n🗑️  Purge des comptes test Winelio ${DRY_RUN ? "(DRY-RUN)" : "(LIVE)"}\n`);

  const accounts = await getAccountsToDelete();
  const allIds = accounts.map(a => a.id);

  console.log(`📊 Comptes à supprimer : ${allIds.length}\n`);
  accounts.forEach(a => console.log(`  - ${a.email} ${a.name ? `(${a.name})` : ""}`));

  if (DRY_RUN) {
    console.log("\n✅ Mode DRY-RUN — aucune suppression effectuée.");
    return;
  }

  if (allIds.length === 0) {
    console.log("Aucun compte à supprimer.");
    return;
  }

  // 1. Récupère les IDs des recommendations liées
  console.log("\n🔸 Nettoyage des recommendations...");
  const { data: recoIds } = await supabase
    .from("recommendations")
    .select("id")
    .or(`professional_id.in.(${allIds.join(",")}),referrer_id.in.(${allIds.join(",")})`);

  if (recoIds && recoIds.length > 0) {
    const ids = recoIds.map(r => r.id);
    console.log(`   ${ids.length} recommendations trouvées`);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("recommendation_steps").delete().in("recommendation_id", batch);
    }
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("commission_transactions").delete().in("recommendation_id", batch);
    }
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase.from("recommendations").delete().in("id", batch);
    }
    console.log("   ✅ recommendations + steps + commissions supprimés");
  }

  // 2. Commissions directes
  console.log("🔸 Nettoyage des commissions restantes...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("commission_transactions").delete().in("user_id", batch);
    await supabase.from("commission_transactions").delete().in("referrer_id", batch);
  }

  // 3. Wallets
  console.log("🔸 Nettoyage des wallets...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("user_wallet_summaries").delete().in("user_id", batch);
  }

  // 4. Contacts, withdrawals, devices
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("withdrawals").delete().in("user_id", batch);
    await supabase.from("contacts").delete().in("user_id", batch);
    await supabase.from("devices").delete().in("user_id", batch);
  }

  // 5. Reset sponsor_id qui pointent vers ces comptes
  console.log("🔸 Reset des sponsor_id orphelins...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("profiles").update({ sponsor_id: null }).in("sponsor_id", batch);
  }

  // 6. Companies
  console.log("🔸 Nettoyage des companies...");
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    await supabase.from("companies").delete().in("owner_id", batch);
  }

  // 7. Suppression des auth users (cascade → profiles)
  console.log(`🔸 Suppression de ${allIds.length} auth users...`);
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < allIds.length; i++) {
    const { error } = await supabase.auth.admin.deleteUser(allIds[i]);
    if (error) {
      errors++;
      if (errors <= 5) console.error(`   ❌ ${accounts[i].email}: ${error.message}`);
    } else {
      deleted++;
      if (deleted % 25 === 0) process.stdout.write(`   ${deleted}/${allIds.length}...\n`);
    }
    if (i % 10 === 0) await sleep(100);
  }

  console.log(`\n✅ Terminé !`);
  console.log(`   Supprimés : ${deleted}`);
  console.log(`   Erreurs   : ${errors}`);
}

main().catch(console.error);
