/**
 * Scraping emails avec Puppeteer (navigateur headless)
 * Pour les pros dont le simple fetch n'a pas trouvé d'email
 * (sites avec emails en JS, Cloudflare obfuscation, etc.)
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/scrape-emails-puppeteer.mjs
 *   node scripts/scrape-emails-puppeteer.mjs --dry-run
 *   node scripts/scrape-emails-puppeteer.mjs --limit 50
 */

import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL       = process.env.SUPABASE_URL || "https://dxnebmxtkvauergvrmod.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args    = process.argv.slice(2);
const getArg  = (name) => { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : null; };
const dryRun  = args.includes("--dry-run");
const limit   = parseInt(getArg("limit") || "0", 10);
const onlyId  = getArg("user-id");

// ─── Filtres email ────────────────────────────────────────────────────────────

const EXCLUDED_DOMAINS = [
  "example.com","test.com","sentry.io","sentry-next.wixpress.com","google.com",
  "facebook.com","instagram.com","twitter.com","linkedin.com","youtube.com",
  "wordpress.com","wixsite.com","wixpress.com","jimdo.com","squarespace.com",
  "w3.org","schema.org","mozilla.org","apple.com","microsoft.com",
  "amazon.com","cloudflare.com","datatables.net","webador.fr","webador.com",
  "wix.com","godaddy.com","ovh.com","ionos.fr",
  "wixpress.com","sentry.wixpress.com","sentry-next.wixpress.com",
  "sentry.io","hubspot.com","mailchimp.com","sendinblue.com","brevo.com",
];
const EXCLUDED_PATTERNS = [".png",".jpg",".gif",".svg",".webp",".css",".js",".php",".woff",".ttf"];
const GENERIC_LOCAL     = [
  "john","jane","test","demo","admin","webmaster","noreply","no-reply",
  "donotreply","example","user","sample","info123","contact123","support123",
  "firstname","lastname","email","votre","votremail",
];

function isValidEmail(email) {
  const lower = email.toLowerCase();
  if (EXCLUDED_PATTERNS.some((p) => lower.includes(p))) return false;
  if (EXCLUDED_DOMAINS.some((d) => lower.endsWith("@" + d) || lower.includes("@" + d + "."))) return false;
  if (email.length > 80) return false;
  if (!/^.{2,}@.+\..{2,}$/.test(email)) return false;
  const local = lower.split("@")[0];
  if (GENERIC_LOCAL.some((g) => local === g)) return false;
  return true;
}

const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})/gi;
const EMAIL_REGEX  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;

function extractEmails(text) {
  const mailto = [...text.matchAll(MAILTO_REGEX)].map((m) => m[1]);
  const fromMailto = mailto.filter(isValidEmail);
  if (fromMailto.length > 0) return fromMailto;
  return (text.match(EMAIL_REGEX) || []).filter(isValidEmail);
}

function normalizeUrl(url) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/$/, "");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Scraping Puppeteer ───────────────────────────────────────────────────────

async function scrapeWithPuppeteer(browser, websiteUrl) {
  const base = normalizeUrl(websiteUrl);
  if (!base) return null;

  const pagesToTry = [
    base,
    `${base}/contact`,
    `${base}/nous-contacter`,
    `${base}/contactez-nous`,
    `${base}/contact.html`,
  ];

  for (const url of pagesToTry) {
    let page;
    try {
      page = await browser.newPage();

      // Bloque images/fonts/CSS pour aller plus vite
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const type = req.resourceType();
        if (["image","font","stylesheet","media"].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

      // Attend un peu que le JS s'exécute (Cloudflare decode, etc.)
      await sleep(1200);

      // Récupère le contenu rendu (après JS)
      const content = await page.content();
      await page.close();

      const emails = extractEmails(content);
      if (emails.length > 0) return emails[0];

    } catch {
      try { await page?.close(); } catch {}
    }

    await sleep(400);
  }

  return null;
}

// ─── Charge les pros avec email fictif ───────────────────────────────────────

async function loadTargets() {
  const allFakeUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    allFakeUsers.push(...data.users.filter((u) => u.email?.endsWith("@kiparlo-pro.fr")));
    if (data.users.length < 1000) break;
    page++;
  }

  if (onlyId) return allFakeUsers.filter((u) => u.id === onlyId);

  console.log(`   ${allFakeUsers.length} pros avec email fictif`);

  // Récupère les sites web par batches
  const userIds = allFakeUsers.map((u) => u.id);
  const companies = [];
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabase
      .from("companies")
      .select("owner_id, name, website")
      .in("owner_id", userIds.slice(i, i + 200))
      .not("website", "is", null);
    if (data) companies.push(...data);
  }

  const websiteMap = Object.fromEntries(
    companies.filter((c) => c.website).map((c) => [c.owner_id, { website: c.website, name: c.name }])
  );

  const targets = allFakeUsers
    .filter((u) => websiteMap[u.id])
    .map((u) => ({ ...u, website: websiteMap[u.id].website, companyName: websiteMap[u.id].name }));

  console.log(`   ${targets.length} ont encore un site web à scraper`);

  const sliced = limit > 0 ? targets.slice(0, limit) : targets;
  console.log(`   Traitement de ${sliced.length} pros\n`);
  return sliced;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🤖 Scraping Puppeteer — pros avec email fictif restants");
  console.log(`   Mode: ${dryRun ? "DRY-RUN" : "LIVE"}\n`);

  const targets = await loadTargets();
  if (!targets.length) { console.log("Aucun pro à traiter."); return; }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
  });

  let found = 0, updated = 0, skipped = 0, errors = 0;

  try {
    for (let i = 0; i < targets.length; i++) {
      const pro = targets[i];
      const progress = `[${i + 1}/${targets.length}]`;
      const label = (pro.companyName || "").slice(0, 42).padEnd(42);

      process.stdout.write(`${progress} ${label} `);

      let email = null;
      try {
        email = await scrapeWithPuppeteer(browser, pro.website);
      } catch (e) {
        process.stdout.write(`❌ ${e.message}\n`);
        errors++;
        continue;
      }

      if (!email) {
        process.stdout.write("⚪ introuvable\n");
        skipped++;
        continue;
      }

      found++;
      process.stdout.write(`📧 ${email} `);

      if (dryRun) { process.stdout.write("(dry-run)\n"); continue; }

      const { error } = await supabase.auth.admin.updateUserById(pro.id, {
        email,
        email_confirm: true,
      });

      if (error) {
        process.stdout.write(`❌ ${error.message}\n`);
        errors++;
      } else {
        process.stdout.write("✅\n");
        updated++;
      }

      await sleep(300);
    }
  } finally {
    await browser.close();
  }

  console.log("\n" + "─".repeat(60));
  console.log(`✅ Terminé !`);
  console.log(`   Emails trouvés  : ${found} / ${targets.length}`);
  console.log(`   Mis à jour      : ${updated}`);
  console.log(`   Introuvables    : ${skipped}`);
  console.log(`   Erreurs         : ${errors}`);
}

main().catch(console.error);
