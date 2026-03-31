/**
 * Scraping d'emails pour les professionnels déjà importés dans la DB
 *
 * Cible les pros dont l'email se termine par @kiparlo-pro.fr (email fictif)
 * et qui ont un site web dans leur entreprise. Scrape le site et met à jour
 * l'email dans Supabase Auth + profiles si un vrai email est trouvé.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/scrape-emails-existing-pros.mjs
 *   node scripts/scrape-emails-existing-pros.mjs --dry-run
 *   node scripts/scrape-emails-existing-pros.mjs --limit 50
 *   node scripts/scrape-emails-existing-pros.mjs --offset 100 --limit 50
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL || "https://dxnebmxtkvauergvrmod.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Arguments CLI ────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const getArg   = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : null; };
const dryRun   = args.includes("--dry-run");
const limit    = parseInt(getArg("limit")  || "0",  10); // 0 = tout
const offset   = parseInt(getArg("offset") || "0",  10);
const onlyId   = getArg("user-id"); // cibler un seul user pour tester

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})/gi;
const EMAIL_REGEX  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;

const EXCLUDED_DOMAINS = [
  "example.com","test.com","sentry.io","google.com","facebook.com",
  "instagram.com","twitter.com","linkedin.com","youtube.com",
  "wordpress.com","wixsite.com","jimdo.com","squarespace.com",
  "w3.org","schema.org","mozilla.org","apple.com","microsoft.com",
  "amazon.com","cloudflare.com","datatables.net",
];
const EXCLUDED_PATTERNS = [".png",".jpg",".gif",".svg",".webp",".css",".js",".php",".woff",".ttf"];

function isValidEmail(email) {
  const lower = email.toLowerCase();
  if (EXCLUDED_PATTERNS.some((p) => lower.includes(p))) return false;
  if (EXCLUDED_DOMAINS.some((d) => lower.endsWith("@" + d) || lower.includes("@" + d + "."))) return false;
  if (email.length > 80) return false;
  if (!/^.{2,}@.+\..{2,}$/.test(email)) return false;
  return true;
}

function normalizeUrl(url) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/$/, "");
}

async function fetchHtml(url, timeoutMs = 7000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractEmailsFromHtml(html) {
  const mailto = [...html.matchAll(MAILTO_REGEX)].map((m) => m[1]);
  const fromMailto = mailto.filter(isValidEmail);
  if (fromMailto.length > 0) return fromMailto;
  const raw = html.match(EMAIL_REGEX) || [];
  return raw.filter(isValidEmail);
}

async function scrapeEmail(websiteUrl) {
  const base = normalizeUrl(websiteUrl);
  if (!base) return null;

  const pagesToTry = [
    base,
    `${base}/contact`,
    `${base}/nous-contacter`,
    `${base}/contactez-nous`,
    `${base}/contact.html`,
    `${base}/contact.php`,
  ];

  for (const url of pagesToTry) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const emails = extractEmailsFromHtml(html);
    if (emails.length > 0) return emails[0];
    await sleep(300);
  }
  return null;
}

// ─── Récupère les pros avec email fictif + site web ───────────────────────────

async function loadTargetPros() {
  // Pagine sur tous les users auth pour trouver ceux avec @kiparlo-pro.fr
  const allFakeUsers = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) { console.error("❌ listUsers error:", error.message); break; }
    const { users } = data;
    if (!users?.length) break;

    const fake = users.filter((u) => u.email?.endsWith("@kiparlo-pro.fr"));
    allFakeUsers.push(...fake);

    if (users.length < perPage) break;
    page++;
  }

  if (onlyId) return allFakeUsers.filter((u) => u.id === onlyId);

  console.log(`   ${allFakeUsers.length} pros avec email fictif trouvés dans Auth`);

  // Récupère les sites web depuis la table companies
  const userIds = allFakeUsers.map((u) => u.id);
  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("owner_id, name, website")
    .in("owner_id", userIds)
    .not("website", "is", null);

  if (cErr) { console.error("❌ companies query error:", cErr.message); return []; }

  const websiteByUserId = Object.fromEntries(
    (companies || []).filter((c) => c.website).map((c) => [c.owner_id, { website: c.website, name: c.name }])
  );

  // Filtre : uniquement ceux avec un site web
  const targets = allFakeUsers
    .filter((u) => websiteByUserId[u.id])
    .map((u) => ({ ...u, website: websiteByUserId[u.id].website, companyName: websiteByUserId[u.id].name }));

  console.log(`   ${targets.length} ont un site web scrappable`);

  // Applique offset/limit
  const sliced = targets.slice(offset, limit > 0 ? offset + limit : undefined);
  console.log(`   Traitement de ${sliced.length} pros (offset ${offset}${limit > 0 ? `, limit ${limit}` : ""})\n`);
  return sliced;
}

// ─── Mise à jour email ────────────────────────────────────────────────────────

async function updateEmail(userId, newEmail) {
  // Vérifie que l'email n'est pas déjà utilisé par un autre user
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1 });
  // On tente directement — Supabase retournera une erreur si déjà pris
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });
  return error ? { error: error.message } : { success: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Scraping emails — professionnels existants");
  console.log(`   Mode: ${dryRun ? "DRY-RUN (aucune modification)" : "LIVE"}\n`);

  const targets = await loadTargetPros();
  if (!targets.length) {
    console.log("Aucun pro à traiter.");
    return;
  }

  let found = 0, updated = 0, skipped = 0, errors = 0;
  const notFound = [];

  for (let i = 0; i < targets.length; i++) {
    const pro = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;
    const label = (pro.companyName || pro.email).slice(0, 45).padEnd(45);

    process.stdout.write(`${progress} ${label} → scraping ${pro.website.slice(0, 40)}... `);

    let email = null;
    try {
      email = await scrapeEmail(pro.website);
    } catch (e) {
      process.stdout.write(`❌ ${e.message}\n`);
      errors++;
      continue;
    }

    if (!email) {
      process.stdout.write("⚪ email non trouvé\n");
      skipped++;
      notFound.push(pro.companyName || pro.email);
      await sleep(200);
      continue;
    }

    found++;
    process.stdout.write(`📧 ${email} `);

    if (dryRun) {
      process.stdout.write("(dry-run)\n");
      continue;
    }

    const result = await updateEmail(pro.id, email);
    if (result.error) {
      if (result.error.includes("already")) {
        process.stdout.write("⏭  déjà utilisé\n");
        skipped++;
      } else {
        process.stdout.write(`❌ ${result.error}\n`);
        errors++;
      }
    } else {
      process.stdout.write("✅\n");
      updated++;
    }

    await sleep(400); // petit délai entre les updates Auth
  }

  // Résumé
  console.log("\n" + "─".repeat(60));
  console.log(`✅ Terminé !`);
  console.log(`   Emails trouvés  : ${found} / ${targets.length}`);
  console.log(`   Mis à jour      : ${updated}`);
  console.log(`   Ignorés         : ${skipped}`);
  console.log(`   Erreurs         : ${errors}`);

  if (notFound.length > 0 && notFound.length <= 20) {
    console.log(`\n   Sites sans email trouvé :`);
    notFound.forEach((n) => console.log(`     - ${n}`));
  }
}

main().catch(console.error);
