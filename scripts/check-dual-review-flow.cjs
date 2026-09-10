// Scénario isolé : comptes @winelio-e2e.local, aucun débit Stripe ni email réel.
// Le règlement est représenté par une ligne de test, pas par un paiement bancaire.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
require("@next/env").loadEnvConfig(process.cwd());
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { Client } = require("pg");
const BASE = process.env.REVIEW_TEST_BASE_URL || "http://localhost:3001";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) throw Error("Ce scénario est réservé au serveur local.");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false } });
const db = admin.schema("winelio");
const run = crypto.randomUUID().slice(0,8);
const userIds = [];
const recommendationIds = [];
const emails = [];
let browser;
const sql = new Client({ connectionString: process.env.SUPABASE_DB_URL });
function checked(result) { if (result.error) throw Error(result.error.message); return result.data; }
function loadToken() {
  const file = path.resolve("src/lib/client-recommendation-token.ts");
  const m = new Module(file, module); m.paths = module.paths;
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
  return m.exports;
}
async function user(role, sponsorId, customEmail) {
  const email = customEmail || `review-${role}-${run}@winelio-e2e.local`;
  emails.push(email);
  const password = crypto.randomBytes(24).toString("base64url");
  const phone = `06${crypto.randomInt(10000000,99999999)}`;
  const data = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { app: "winelio", first_name: "Élodie", last_name: "Test", phone } }));
  const id = data.user.id; userIds.push(id);
  checked(await db.from("profiles").update({ is_demo: true, sponsor_id: sponsorId || null, is_founder: !sponsorId, is_professional: role === "pro", first_name: "Élodie", last_name: "Test", phone, address: "1 rue du Test", city: "Paris", postal_code: "75001", birth_date: "1990-01-01", terms_accepted: true, terms_accepted_at: new Date().toISOString() }).eq("id", id));
  const context = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: process.env.E2E_BYPASS_TOKEN ? { "x-e2e-bypass-token": process.env.E2E_BYPASS_TOKEN } : {} });
  const login = await context.request.post("/api/auth/login-password", { data: { email, password } });
  assert.equal(login.status(), 200, `Connexion test ${role}`);
  return { id, email, context };
}
async function post(context, url, data, expected = 200) {
  const response = await context.request.post(url, { data });
  if (response.status() !== expected) {
    const body = await response.json().catch(() => ({}));
    throw Error(`${url.replace(/[0-9a-f-]{36}/g,"ID")} : attendu ${expected}, reçu ${response.status()} (${body.error || ""})`);
  }
  return response.json();
}
async function main() {
  await sql.connect();
  browser = await chromium.launch({ headless: true });
  const ref = await user("ref");
  const pro = await user("pro", ref.id);
  const other = await user("other", ref.id);
  const category = checked(await db.from("categories").select("id").limit(1).single());
  checked(await db.from("companies").insert({ owner_id: pro.id, name: `Professionnel test avis ${run}`, alias: run.slice(0,7).toUpperCase(), category_id: category.id, source: "owner", is_verified: true, siret: "12345678901234", email: pro.email, latitude: 48.8566, longitude: 2.3522, city: "Paris", postal_code: "75001", address: "1 rue du Test", country: "FR" }));
  const clientEmail = `review-client-${run}@winelio-e2e.local`; emails.push(clientEmail);
  const contact = checked(await db.from("contacts").insert({ user_id: ref.id, first_name: "Clément", last_name: "Test", email: clientEmail, phone: "0600000000" }).select("id").single());
  const created = await post(ref.context, "/api/recommendations/create", { selectedProId: pro.id, selectedContactId: contact.id, description: "Vérification du parcours d’avis", urgency: "normal", thirdPartyConsent: true, createContact: false });
  const rid = created.recommendation.id; recommendationIds.push(rid);
  const rows = checked(await db.from("recommendation_steps").select("id,step:steps(order_index)").eq("recommendation_id", rid));
  const steps = new Map(rows.map(r => [r.step.order_index, r.id]));
  assert.equal(steps.size, 8);
  const complete = (actor, step, extra = {}, expected = 200) => post(actor.context, "/api/recommendations/complete-step", { recommendation_id: rid, step_id: steps.get(step), ...extra }, expected);
  await complete(ref, 2, {}, 403);
  await complete(pro, 7, {}, 409);
  await complete(pro, 2);
  await complete(pro, 3, {}, 403);
  await complete(ref, 3);
  await complete(ref, 4);
  await complete(pro, 5, { quote_amount: 1000 });
  await complete(pro, 6, {}, 403);
  await complete(ref, 6);
  await complete(ref, 7, {}, 403);
  await complete(pro, 7);
  let clientMails = checked(await db.from("email_queue").select("id").eq("to_email", clientEmail));
  assert.equal(clientMails.length, 0, "Aucun email intermédiaire client");
  await complete(ref, 8);
  clientMails = checked(await db.from("email_queue").select("id").eq("to_email", clientEmail));
  assert.equal(clientMails.length, 0, "Pas d’invitation avant règlement Winelio");
  await post(ref.context, `/api/recommendations/${rid}/review`, { rating: 5 }, 409);
  checked(await db.from("stripe_payment_sessions").insert({ recommendation_id: rid, stripe_session_id: `cs_test_review_${run}`, amount: 100, status: "paid" }));
  checked(await db.from("commission_transactions").insert({ recommendation_id: rid, user_id: ref.id, type: "recommendation", level: 0, amount: 60, status: "PENDING", is_demo: true }));
  await complete(ref, 8);
  await complete(ref, 8);
  console.log("Étapes et invitations vérifiées.");
  clientMails = checked(await db.from("email_queue").select("id,html").eq("to_email", clientEmail));
  assert.equal(clientMails.length, 1, "Un seul email client malgré les reprises");
  assert.ok(clientMails[0].html.includes("M’affilier") || clientMails[0].html.includes("Rejoignez Winelio"));
  assert.ok(!clientMails[0].html.includes("<div"));
  await post(other.context, `/api/recommendations/${rid}/review`, { rating: 5 }, 403);
  await post(ref.context, `/api/recommendations/${rid}/review`, { rating: 5, comment: "exemple.fr" }, 400);
  const refPage = await ref.context.newPage();
  await refPage.goto(`${BASE}/recommendations/${rid}`);
  await refPage.getByRole("radio", { name: "1 étoile", exact: true }).check();
  await refPage.getByLabel("Commentaire facultatif").fill("Suivi décevant, mais la prestation est terminée.");
  await refPage.getByRole("button", { name: "Publier mon avis" }).click();
  await refPage.getByText("Avis reçu", { exact: true }).waitFor();
  const commission = checked(await db.from("commission_transactions").select("status").eq("recommendation_id", rid).eq("type", "recommendation").single());
  assert.equal(commission.status, "EARNED", "Une étoile débloque aussi la commission");
  await post(ref.context, `/api/recommendations/${rid}/review`, { rating: 5, comment: "Tentative de remplacement" });
  let review = checked(await db.from("reviews").select("id,rating").eq("recommendation_id", rid).eq("author_role", "referrer").single());
  assert.equal(review.rating, 1, "Un avis déjà déposé est immuable");
  const summaryBefore = checked(await db.from("professional_review_summaries").select("avg_rating,review_count").eq("professional_id", pro.id).single());
  assert.equal(Number(summaryBefore.avg_rating), 1);
  assert.equal(summaryBefore.review_count, 1, "Le client silencieux ne compte pas");
  console.log("Avis du recommandeur et déblocage vérifiés.");
  await post(other.context, `/api/reviews/${review.id}/reply`, { comment: "Réponse" }, 404);
  const token = clientMails[0].html.match(/client-review\/([A-Za-z0-9._-]+)/)?.[1];
  assert.ok(token);
  const publicContext = await browser.newContext({ baseURL: BASE });
  const clientPage = await publicContext.newPage();
  await clientPage.goto(`${BASE}/recommendations/client-review/${token}`);
  await clientPage.getByRole("radio", { name: "5 étoiles", exact: true }).check();
  await clientPage.getByRole("button", { name: "Publier mon avis" }).click();
  await clientPage.getByText("Merci, votre avis a été enregistré.", { exact: true }).waitFor();
  await clientPage.reload();
  await clientPage.getByText("Merci, votre avis a déjà été enregistré.", { exact: true }).waitFor();
  await post(publicContext, "/api/recommendations/client-review", { token, rating: 2 });
  const summary = checked(await db.from("professional_review_summaries").select("avg_rating,review_count").eq("professional_id", pro.id).single());
  assert.equal(Number(summary.avg_rating), 3);
  assert.equal(summary.review_count, 2);
  console.log("Avis client et moyenne vérifiés.");
  const clientReview = checked(await db.from("reviews").select("id").eq("recommendation_id", rid).eq("author_role", "client").single());
  await post(pro.context, `/api/reviews/${clientReview.id}/reply`, { comment: "Réponse à des étoiles seules" }, 409);
  const proPage = await pro.context.newPage();
  await proPage.goto(`${BASE}/professionnels/${pro.id}/avis?avis=${review.id}#avis-${review.id}`);
  const dismissCookies = proPage.getByRole("button", { name: "Continuer sans accepter" });
  await dismissCookies.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await dismissCookies.isVisible()) await dismissCookies.click();
  await proPage.getByRole("button", { name: "Répondre au commentaire" }).click();
  await proPage.getByLabel("Votre réponse publique").fill("Merci pour votre retour. Nous améliorerons notre suivi.");
  await proPage.getByRole("button", { name: "Publier ma réponse" }).click();
  await proPage.getByText("Réponse du professionnel", { exact: true }).waitFor();
  await proPage.reload();
  assert.equal(await proPage.getByRole("button", { name: "Répondre au commentaire" }).count(), 0);
  await post(pro.context, `/api/reviews/${review.id}/reply`, { comment: "Seconde réponse" }, 409);
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`${BASE}/professionnels/${pro.id}/avis`);
  const dismissPublicCookies = publicPage.getByRole("button", { name: "Continuer sans accepter" });
  await dismissPublicCookies.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await dismissPublicCookies.isVisible()) await dismissPublicCookies.click();
  assert.equal(await publicPage.getByRole("button", { name: "Répondre au commentaire" }).count(), 0);
  await publicPage.screenshot({ path: "output/playwright/dual-reviews-desktop.png", fullPage: true });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.screenshot({ path: "output/playwright/dual-reviews-mobile.png", fullPage: true });
  assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await ref.context.grantPermissions(["geolocation"]);
  await ref.context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });
  await refPage.goto(`${BASE}/recommendations/new`);
  const refCookies = refPage.getByRole("button", { name: "Continuer sans accepter" });
  await refCookies.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await refCookies.isVisible()) await refCookies.click();
  await refPage.getByRole("button", { name: /Clément Test/ }).click();
  await refPage.locator("label").filter({ hasText: "Je confirme avoir obtenu le consentement explicite" }).click();
  await refPage.getByRole("button", { name: "Suivant", exact: true }).click();
  await refPage.getByRole("button", { name: "Trouver les pros autour de moi" }).click();
  await refPage.getByPlaceholder("Rechercher par nom...").fill(run);
  const reviewLink = refPage.getByRole("link", { name: new RegExp(`Voir les avis sur Professionnel test avis ${run}`) });
  await reviewLink.waitFor();
  assert.ok((await reviewLink.getAttribute("href")).endsWith(`/professionnels/${pro.id}/avis`));
  assert.equal(await refPage.getByText("3,0/5", { exact: true }).count(), 1);
  assert.equal(await refPage.getByText("Suivi décevant, mais la prestation est terminée.", { exact: true }).count(), 0);
  await refPage.getByRole("button", { name: `Sélectionner Professionnel test avis ${run}`, exact: true }).click();
  await refPage.screenshot({ path: "output/playwright/dual-reviews-search.png", fullPage: true });
  assert.equal(await refPage.getByRole("button", { name: "Suivant", exact: true }).isEnabled(), true);
  console.log("Recherche : moyenne, étoiles, lien d’avis et sélection vérifiés.");
  assert.equal(checked(await db.from("email_queue").select("id").eq("to_email", clientEmail)).length, 1, "Aucune relance ni réponse envoyée au client");
  const proMails = checked(await db.from("email_queue").select("dedupe_key").eq("to_email", pro.email).like("dedupe_key", "professional-review:%"));
  assert.equal(proMails.length, 2);
  const { signClientRecommendationToken } = loadToken();
  const expired = signClientRecommendationToken({ recommendationId: rid, purpose: "review", tokenVersion: 1, expiresAt: new Date(Date.now()-1000) });
  await post(publicContext, "/api/recommendations/client-review", { token: expired, rating: 5 }, 410);
  await post(publicContext, "/api/recommendations/client-action", { token, decision: "confirm" }, 410);
  // Un client déjà affilié ne reçoit aucune proposition d’inscription.
  await user("client", ref.id, clientEmail);
  const affiliated = await publicContext.request.get(`/api/recommendations/client-review?token=${token}`);
  assert.equal((await affiliated.json()).affiliationUrl, null);
  checked(await db.from("contacts").update({ email: ref.email }).eq("id", contact.id));
  await post(publicContext, "/api/recommendations/client-review", { token, rating: 5 }, 410);
  console.log("Parcours réel vérifié : 8 étapes et rôles, email client unique, deux avis, moyenne, une réponse, mauvaise note rémunérée, liens expirés, affiliation et affichage mobile.");
}
async function cleanup() {
  if (browser) await browser.close();
  if (userIds.length) {
    await sql.query("BEGIN");
    try {
      const recs = await sql.query("SELECT id FROM winelio.recommendations WHERE referrer_id = ANY($1::uuid[]) OR professional_id = ANY($1::uuid[])", [userIds]);
      const ids = recs.rows.map(r => r.id);
      for (const table of ["recommendation_followups", "recommendation_steps", "stripe_payment_sessions", "reviews", "commission_transactions"]) await sql.query(`DELETE FROM winelio.${table} WHERE recommendation_id = ANY($1::uuid[])`, [ids]);
      await sql.query("DELETE FROM winelio.recommendations WHERE id = ANY($1::uuid[])", [ids]);
      for (const table of ["contacts", "user_wallet_summaries", "commission_transactions"]) await sql.query(`DELETE FROM winelio.${table} WHERE user_id = ANY($1::uuid[])`, [userIds]);
      await sql.query("DELETE FROM winelio.companies WHERE owner_id = ANY($1::uuid[])", [userIds]);
      await sql.query("UPDATE winelio.profiles SET sponsor_id = NULL WHERE id = ANY($1::uuid[])", [userIds]);
      await sql.query("DELETE FROM winelio.profiles WHERE id = ANY($1::uuid[])", [userIds]);
      await sql.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [userIds]);
      for (const table of ["email_queue", "email_sent_log"]) await sql.query(`DELETE FROM winelio.${table} WHERE to_email = ANY($1::text[])`, [emails]);
      await sql.query("DELETE FROM winelio.otp_codes WHERE email = ANY($1::text[])", [emails]);
      await sql.query("COMMIT");
      const remains = await sql.query("SELECT (SELECT count(*) FROM auth.users WHERE id = ANY($1::uuid[])) + (SELECT count(*) FROM winelio.profiles WHERE id = ANY($1::uuid[])) AS n", [userIds]);
      assert.equal(Number(remains.rows[0].n), 0);
      console.log("Nettoyage vérifié : comptes Auth, profils, recommandations, avis, paiements de test, wallets et emails supprimés.");
    } catch (err) { await sql.query("ROLLBACK"); throw err; }
  }
  await sql.end();
}
main().catch(error => { console.error("Échec du contrôle :", error.message); process.exitCode = 1; }).finally(async () => { try { await cleanup(); } catch (error) { console.error("Nettoyage à reprendre :", error.message); process.exitCode = 1; } });
