import { test, expect } from "./fixtures/test";
import { wn } from "./helpers/supabase";
import { loginAsFast } from "./helpers/auth";
import { createBasicChain } from "./helpers/scenarios";
import { e2eEmail } from "./helpers/env";
import { createTestUser } from "./helpers/factories";

/* ──────────────────────────────────────────────────────────── */
/* Happy path : un nouveau pro clique le lien claim et hérite   */
/* de la company + de la reco                                    */
/* ──────────────────────────────────────────────────────────── */
test("claim — finalize transfère company + reco au user authentifié", async ({ page }) => {
  // Setup : referrer + pro scraped + reco en cours
  const { referrer, pro, contactId, companyId } = await createBasicChain({
    scrapedPro: true,
    proCompanyEmail: e2eEmail("scraped-company"),
  });

  // Crée la reco vers le pro scraped
  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Test claim", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  expect(createRes.ok()).toBe(true);
  const recoId = (await createRes.json()).recommendation.id as string;

  // Le "vrai" pro (qui claim) crée son compte et clique le lien claim
  const claimingPro = await createTestUser({
    email: e2eEmail("claiming-pro"), firstName: "ClaimingPro",
    sponsorId: referrer.id, isProfessional: false,
  });

  await loginAsFast(page, claimingPro.email);
  const claimRes = await page.request.post("/api/claim/finalize", {
    data: { recommendationId: recoId },
  });
  expect(claimRes.ok(), `claim finalize: ${await claimRes.text()}`).toBe(true);

  // 1) la company doit avoir changé d'owner_id → claimingPro
  const { data: company } = await wn()
    .from("companies")
    .select("owner_id, source")
    .eq("id", companyId)
    .single();
  expect(company?.owner_id).toBe(claimingPro.id);
  expect(company?.source).toBe("owner");

  // 2) la reco doit avoir changé de professional_id → claimingPro
  const { data: rec } = await wn()
    .from("recommendations")
    .select("professional_id")
    .eq("id", recoId)
    .single();
  expect(rec?.professional_id).toBe(claimingPro.id);

  // 3) le profile claimingPro doit être passé en pro
  const { data: prof } = await wn()
    .from("profiles")
    .select("is_professional")
    .eq("id", claimingPro.id)
    .single();
  expect(prof?.is_professional).toBe(true);
});

/* ──────────────────────────────────────────────────────────── */
/* Idempotence : second claim par le même user → no-op           */
/* ──────────────────────────────────────────────────────────── */
test("claim — second appel par le même user est idempotent", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain({
    scrapedPro: true,
    proCompanyEmail: e2eEmail("scraped"),
  });

  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Test idem", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  const recoId = (await createRes.json()).recommendation.id as string;

  const claiming = await createTestUser({
    email: e2eEmail("claiming"), sponsorId: referrer.id,
  });

  await loginAsFast(page, claiming.email);
  await page.request.post("/api/claim/finalize", { data: { recommendationId: recoId } });

  // Deuxième claim par le même user
  const secondRes = await page.request.post("/api/claim/finalize", {
    data: { recommendationId: recoId },
  });
  expect(secondRes.ok()).toBe(true);
  const body = await secondRes.json();
  expect(body.alreadyClaimed).toBe(true);
});

/* ──────────────────────────────────────────────────────────── */
/* Conflit : un autre user tente de claimer une fiche déjà prise */
/* ──────────────────────────────────────────────────────────── */
test("claim — refuse si la fiche a déjà été claimée par un autre", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain({
    scrapedPro: true,
    proCompanyEmail: e2eEmail("scraped-conflict"),
  });

  await loginAsFast(page, referrer.email);
  const recoId = (await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Test conflit", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  }).then((r) => r.json())).recommendation.id;

  const proA = await createTestUser({ email: e2eEmail("pro-a"), sponsorId: referrer.id });
  const proB = await createTestUser({ email: e2eEmail("pro-b"), sponsorId: referrer.id });

  // proA claim en premier → succès
  await loginAsFast(page, proA.email);
  await page.request.post("/api/claim/finalize", { data: { recommendationId: recoId } });

  // proB tente de claimer après → 409
  await loginAsFast(page, proB.email);
  const bRes = await page.request.post("/api/claim/finalize", {
    data: { recommendationId: recoId },
  });
  expect(bRes.status()).toBe(409);
});

/* ──────────────────────────────────────────────────────────── */
/* 404 : reco inexistante                                        */
/* ──────────────────────────────────────────────────────────── */
test("claim — 404 si recommendationId inconnu", async ({ page }) => {
  const claiming = await createTestUser({ email: e2eEmail("claim-404") });
  await loginAsFast(page, claiming.email);
  const res = await page.request.post("/api/claim/finalize", {
    data: { recommendationId: "00000000-0000-0000-0000-000000000000" },
  });
  expect(res.status()).toBe(404);
});
