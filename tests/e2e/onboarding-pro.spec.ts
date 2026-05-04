import { test, expect } from "./fixtures/test";
import { wn } from "./helpers/supabase";
import { loginAsFast } from "./helpers/auth";
import { createTestUser } from "./helpers/factories";
import { e2eEmail } from "./helpers/env";

/* ──────────────────────────────────────────────────────────── */
/* Status payment-method : initialement aucun                    */
/* ──────────────────────────────────────────────────────────── */
test("onboarding pro — état initial : pas de payment method", async ({ page }) => {
  const pro = await createTestUser({
    email: e2eEmail("pro-onb"), isProfessional: true,
  });

  await loginAsFast(page, pro.email);
  const res = await page.request.get("/api/profile/payment-method-status");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.hasPaymentMethod).toBe(false);
});

/* ──────────────────────────────────────────────────────────── */
/* setup-intent : crée un Stripe Customer + retourne clientSecret */
/* ──────────────────────────────────────────────────────────── */
test("onboarding pro — setup-intent crée le customer Stripe et retourne clientSecret", async ({ page }) => {
  const pro = await createTestUser({
    email: e2eEmail("pro-setup"), isProfessional: true,
  });

  await loginAsFast(page, pro.email);

  // Avant : pas de stripe_customer_id sur le profil
  const { data: before } = await wn()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", pro.id)
    .single();
  expect(before?.stripe_customer_id).toBeFalsy();

  const res = await page.request.post("/api/stripe/setup-intent");
  expect(res.ok(), `setup-intent: ${await res.text()}`).toBe(true);
  const body = await res.json();

  // clientSecret est de la forme seti_<id>_secret_<random>
  expect(body.clientSecret).toMatch(/^seti_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/);
  // customerId Stripe : cus_<id>
  expect(body.customerId).toMatch(/^cus_[A-Za-z0-9]+$/);

  // Après : le profil a son stripe_customer_id persisté
  const { data: after } = await wn()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", pro.id)
    .single();
  expect(after?.stripe_customer_id).toBe(body.customerId);
});

/* ──────────────────────────────────────────────────────────── */
/* setup-intent appelée 2× : réutilise le même customer          */
/* ──────────────────────────────────────────────────────────── */
test("onboarding pro — setup-intent idempotent sur le customer (pas de doublon Stripe)", async ({ page }) => {
  const pro = await createTestUser({
    email: e2eEmail("pro-idem"), isProfessional: true,
  });

  await loginAsFast(page, pro.email);

  const first = await page.request.post("/api/stripe/setup-intent");
  const second = await page.request.post("/api/stripe/setup-intent");
  const a = await first.json();
  const b = await second.json();

  expect(a.customerId).toBe(b.customerId);
  // Mais 2 SetupIntents distincts (chaque appel en crée un nouveau)
  expect(a.clientSecret).not.toBe(b.clientSecret);
});

/* ──────────────────────────────────────────────────────────── */
/* payment-method : refus si SetupIntent inexistant              */
/* ──────────────────────────────────────────────────────────── */
test("onboarding pro — payment-method refuse un SetupIntent inexistant", async ({ page }) => {
  const pro = await createTestUser({
    email: e2eEmail("pro-bad-si"), isProfessional: true,
  });

  await loginAsFast(page, pro.email);
  const res = await page.request.post("/api/stripe/payment-method", {
    data: { setupIntentId: "seti_inexistant_test_E2E" },
  });
  expect(res.ok()).toBe(false);
  // Stripe peut renvoyer 404 ou notre route renvoie 500/400
  expect([400, 404, 500]).toContain(res.status());
});

/* ──────────────────────────────────────────────────────────── */
/* payment-method : refus si SetupIntent appartient à un autre user */
/* ──────────────────────────────────────────────────────────── */
test("onboarding pro — payment-method refuse un SetupIntent d'un autre profil (anti-vol carte)", async ({ page }) => {
  const proA = await createTestUser({
    email: e2eEmail("pro-a"), isProfessional: true,
  });
  const proB = await createTestUser({
    email: e2eEmail("pro-b"), isProfessional: true,
  });

  // proA crée un SetupIntent avec metadata.profile_id = proA.id
  await loginAsFast(page, proA.email);
  const aRes = await page.request.post("/api/stripe/setup-intent");
  const { clientSecret } = await aRes.json();
  // clientSecret contient seti_<id>_secret_xxx → on extrait l'id
  const setupIntentId = clientSecret.split("_secret_")[0];

  // proB tente d'utiliser le SetupIntent de proA
  await loginAsFast(page, proB.email);
  const bRes = await page.request.post("/api/stripe/payment-method", {
    data: { setupIntentId },
  });
  expect(bRes.status()).toBe(403);
});

/* ──────────────────────────────────────────────────────────── */
/* DELETE payment-method sans carte : ne plante pas              */
/* ──────────────────────────────────────────────────────────── */
test("onboarding pro — DELETE payment-method sans carte retourne 200 (idempotent)", async ({ page }) => {
  const pro = await createTestUser({
    email: e2eEmail("pro-del"), isProfessional: true,
  });

  await loginAsFast(page, pro.email);
  const res = await page.request.delete("/api/stripe/payment-method");
  expect(res.ok()).toBe(true);
  expect((await res.json()).success).toBe(true);
});
