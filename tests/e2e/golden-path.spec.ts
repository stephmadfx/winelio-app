import { test, expect } from "./fixtures/test";
import { e2eEmail } from "./helpers/env";
import {
  createTestUser,
  createTestCompany,
  createTestContact,
  pickCategory,
} from "./helpers/factories";
import { wn } from "./helpers/supabase";
import { loginAsFast, logout } from "./helpers/auth";
import { cron } from "./helpers/cron";
import { readQueuedEmails } from "./helpers/email";

const QUOTE_AMOUNT = 1200; // €

test("golden path : reco standard 7 étapes + commissions MLM", async ({ page, context }) => {
  // 1) Chaîne MLM minimale (founder → L1 → L2 → L3 → L4 → referrer → pro)
  const founder = await createTestUser({
    email: e2eEmail("founder"), firstName: "Found", lastName: "E2E",
    sponsorId: null, isFounder: true,
  });
  const l1 = await createTestUser({
    email: e2eEmail("l1"), firstName: "L1", lastName: "E2E",
    sponsorId: founder.id,
  });
  const l2 = await createTestUser({
    email: e2eEmail("l2"), firstName: "L2", lastName: "E2E",
    sponsorId: l1.id,
  });
  const l3 = await createTestUser({
    email: e2eEmail("l3"), firstName: "L3", lastName: "E2E",
    sponsorId: l2.id,
  });
  const l4 = await createTestUser({
    email: e2eEmail("l4"), firstName: "L4", lastName: "E2E",
    sponsorId: l3.id,
  });
  const referrer = await createTestUser({
    email: e2eEmail("referrer"), firstName: "Refer", lastName: "E2E",
    sponsorId: l4.id,
  });
  const pro = await createTestUser({
    email: e2eEmail("pro"), firstName: "Pro", lastName: "E2E",
    sponsorId: referrer.id, isProfessional: true,
  });

  const categoryId = await pickCategory();
  await createTestCompany({
    ownerId: pro.id, name: "E2E Plomberie SA", categoryId,
    email: e2eEmail("company-pro"), source: "owner",
  });
  const contact = await createTestContact({
    userId: referrer.id, firstName: "Clément", lastName: "Test",
  });

  // 2) Le referrer crée la recommandation via l'API
  await loginAsFast(page, referrer.email);

  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contact.id,
      selectedProId:     pro.id,
      description:       "Travaux de plomberie — test E2E",
      urgency:           "normal",
      selfForMe:         false,
      createContact:     false,
      selfProfile:       null,
      contactForm:       null,
    },
  });
  expect(createRes.ok(), `create reco: ${await createRes.text()}`).toBe(true);
  const { recommendation } = await createRes.json();
  const recoId = recommendation.id as string;

  // 3) Récupérer les step_id de la reco
  const { data: stepsRows, error: stepsErr } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  expect(stepsErr).toBeNull();
  const stepByIndex = new Map<number, string>();
  for (const row of stepsRows ?? []) {
    const s = Array.isArray(row.step) ? row.step[0] : row.step;
    if (s?.order_index) stepByIndex.set(s.order_index, row.id);
  }
  expect(stepByIndex.size).toBe(7);

  // 4) Le pro complète les étapes 2 → 6
  await logout(page, context);
  await loginAsFast(page, pro.email);

  for (const stepIndex of [2, 3, 4]) {
    const res = await page.request.post("/api/recommendations/complete-step", {
      data: { recommendation_id: recoId, step_id: stepByIndex.get(stepIndex) },
    });
    expect(res.ok(), `step ${stepIndex} échec: ${await res.text()}`).toBe(true);
  }

  // Étape 5 : nécessite quote_amount + expected_completion_at
  const expectedCompletion = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const step5Res = await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recoId,
      step_id:           stepByIndex.get(5),
      quote_amount:      QUOTE_AMOUNT,
      expected_completion_at: expectedCompletion,
    },
  });
  expect(step5Res.ok(), `step 5 échec: ${await step5Res.text()}`).toBe(true);

  // Étape 6 : déclenche les commissions MLM
  const step6Res = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepByIndex.get(6) },
  });
  expect(step6Res.ok(), `step 6 échec: ${await step6Res.text()}`).toBe(true);

  // 5) Vérification : les commissions ont été créées
  const { data: commissions, error: commErr } = await wn()
    .from("commission_transactions")
    .select("id, type, level, amount, user_id, status")
    .eq("recommendation_id", recoId);
  expect(commErr).toBeNull();
  expect(commissions, "commissions vides — étape 6 n'a pas déclenché createCommissions").toBeTruthy();
  expect(commissions!.length).toBeGreaterThanOrEqual(5);

  const types = new Set(commissions!.map((c) => c.type));
  // Au minimum : 60% referrer + 14% plateforme + au moins 1 niveau MLM
  expect(types).toContain("recommendation");
  expect(types).toContain("platform_winelio");
  expect(
    [...types].some((t) => /^referral_level_/.test(t as string)),
    "aucune commission de niveau MLM créée",
  ).toBe(true);

  const recommendationCommission = commissions!.find((c) => c.type === "recommendation");
  expect(recommendationCommission?.user_id).toBe(referrer.id);
  expect(Number(recommendationCommission?.amount)).toBeGreaterThan(0);

  // Total des commissions ≈ commission_rate du plan × montant (typiquement 10% × 1200 = 120€)
  const total = commissions!.reduce((s, c) => s + Number(c.amount), 0);
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(QUOTE_AMOUNT);

  // 6) Vérification : emails envoyés au referrer + pro pendant le flow
  await cron.processQueue();
  const referrerEmails = await readQueuedEmails(referrer.email);
  expect(referrerEmails.length, "le referrer aurait dû recevoir au moins 1 email").toBeGreaterThan(0);
  // Tous les emails E2E doivent être marqués test_skipped (pas envoyés en vrai)
  for (const m of referrerEmails) {
    expect(["test_skipped", "pending"]).toContain(m.status);
  }
});
