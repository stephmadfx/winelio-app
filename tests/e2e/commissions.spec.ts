import { test, expect } from "./fixtures/test";
import { wn } from "./helpers/supabase";
import { loginAsFast } from "./helpers/auth";
import {
  createTestUser,
  createTestCompany,
  createTestContact,
  pickCategory,
} from "./helpers/factories";
import { e2eEmail } from "./helpers/env";

const PLAN = {
  rate: 10,           // 10 % du dealAmount = baseCommission
  referrer: 60,       // 60 % de baseCommission
  level: 4,           // 4 % par niveau MLM × 5
  platform: 14,
  affiliation: 1,
  cashback: 1,
};
const DEAL = 1000;
const BASE = DEAL * PLAN.rate / 100;        // 100 €
const expected = {
  recommendation: BASE * PLAN.referrer / 100,    // 60 €
  level:          BASE * PLAN.level / 100,        // 4 €
  platform:       BASE * PLAN.platform / 100,     // 14 €
  affiliation:    BASE * PLAN.affiliation / 100,  // 1 €
  cashback:       BASE * PLAN.cashback / 100,     // 1 €
};

/** Crée une chaîne MLM complète : root → L5 → L4 → L3 → L2 → L1 → referrer → pro. */
async function buildFullChain() {
  const root = await createTestUser({ email: e2eEmail("root"), isFounder: true });
  const l5 = await createTestUser({ email: e2eEmail("l5"), sponsorId: root.id });
  const l4 = await createTestUser({ email: e2eEmail("l4"), sponsorId: l5.id });
  const l3 = await createTestUser({ email: e2eEmail("l3"), sponsorId: l4.id });
  const l2 = await createTestUser({ email: e2eEmail("l2"), sponsorId: l3.id });
  const l1 = await createTestUser({ email: e2eEmail("l1"), sponsorId: l2.id });
  const referrer = await createTestUser({ email: e2eEmail("ref"), sponsorId: l1.id });
  const pro = await createTestUser({
    email: e2eEmail("pro"), sponsorId: referrer.id, isProfessional: true,
  });

  const categoryId = await pickCategory();
  await createTestCompany({ ownerId: pro.id, name: "E2E SA", categoryId });
  const { id: contactId } = await createTestContact({ userId: referrer.id });

  return { root, l5, l4, l3, l2, l1, referrer, pro, contactId };
}

/** Lance une reco + complète les 7 étapes (pour déclencher createCommissions). */
async function runFullRecoFlow(page: import("@playwright/test").Page, opts: {
  referrerEmail: string;
  proEmail: string;
  contactId: string;
  proId: string;
  dealAmount: number;
}) {
  await loginAsFast(page, opts.referrerEmail);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: opts.contactId, selectedProId: opts.proId,
      description: "Commission test", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  expect(createRes.ok()).toBe(true);
  const recoId = (await createRes.json()).recommendation.id as string;

  // Récupérer step_id par order_index
  const { data: stepsRows } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const stepIdx = new Map<number, string>();
  for (const r of stepsRows ?? []) {
    const s = Array.isArray(r.step) ? r.step[0] : r.step;
    if (s?.order_index) stepIdx.set(s.order_index, r.id);
  }

  await loginAsFast(page, opts.proEmail);
  for (const i of [2, 3, 4]) {
    await page.request.post("/api/recommendations/complete-step", {
      data: { recommendation_id: recoId, step_id: stepIdx.get(i) },
    });
  }
  await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recoId,
      step_id: stepIdx.get(5),
      quote_amount: opts.dealAmount,
      expected_completion_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
    },
  });
  await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepIdx.get(6) },
  });

  return recoId;
}

/* ──────────────────────────────────────────────────────────── */
/* Test 1 : chaîne MLM complète → tous les % attendus           */
/* ──────────────────────────────────────────────────────────── */
test("commissions — chaîne MLM 6 niveaux : 60% + 5×4% + 14% + 1% + 1% Wins", async ({ page }) => {
  const chain = await buildFullChain();

  const recoId = await runFullRecoFlow(page, {
    referrerEmail: chain.referrer.email,
    proEmail: chain.pro.email,
    contactId: chain.contactId,
    proId: chain.pro.id,
    dealAmount: DEAL,
  });

  const { data: commissions } = await wn()
    .from("commission_transactions")
    .select("type, level, amount, user_id")
    .eq("recommendation_id", recoId);
  expect(commissions).toBeTruthy();

  // Index par type
  const byType = new Map<string, { amount: number; user_id: string; level: number }>();
  for (const c of commissions!) byType.set(c.type, { amount: Number(c.amount), user_id: c.user_id, level: c.level });

  // 1) referrer : 60 €
  const reco = byType.get("recommendation");
  expect(reco?.amount).toBeCloseTo(expected.recommendation, 2);
  expect(reco?.user_id).toBe(chain.referrer.id);

  // 2) 5 niveaux MLM : 4 € chacun, à L1, L2, L3, L4, L5
  const expectedLevels = [
    { type: "referral_level_1", recipientId: chain.l1.id },
    { type: "referral_level_2", recipientId: chain.l2.id },
    { type: "referral_level_3", recipientId: chain.l3.id },
    { type: "referral_level_4", recipientId: chain.l4.id },
    { type: "referral_level_5", recipientId: chain.l5.id },
  ];
  for (const lvl of expectedLevels) {
    const c = byType.get(lvl.type);
    expect(c?.amount, `${lvl.type} amount`).toBeCloseTo(expected.level, 2);
    expect(c?.user_id, `${lvl.type} recipient`).toBe(lvl.recipientId);
  }

  // 3) plateforme Winelio : 14 € (pro a un sponsor donc pas de spillover)
  const platform = byType.get("platform_winelio");
  expect(platform?.amount).toBeCloseTo(expected.platform, 2);

  // 4) affiliation_bonus : 1 € au sponsor du pro = referrer
  const aff = byType.get("affiliation_bonus");
  expect(aff?.amount).toBeCloseTo(expected.affiliation, 2);
  expect(aff?.user_id).toBe(chain.referrer.id);

  // 5) cashback Wins : 1 € au pro lui-même
  const cb = byType.get("professional_cashback");
  expect(cb?.amount).toBeCloseTo(expected.cashback, 2);
  expect(cb?.user_id).toBe(chain.pro.id);

  // 6) total distribué ≈ 96% × baseCommission
  const total = commissions!.reduce((s, c) => s + Number(c.amount), 0);
  const expectedTotal = expected.recommendation + 5 * expected.level
    + expected.platform + expected.affiliation + expected.cashback;
  expect(total).toBeCloseTo(expectedTotal, 2);
});

/* ──────────────────────────────────────────────────────────── */
/* Test 2 : spillover — chaîne courte → manquants vers cagnotte */
/* ──────────────────────────────────────────────────────────── */
test("commissions — spillover : chaîne courte L0+L1 → niveaux 2-5 + affiliation absorbés par platform_winelio", async ({ page }) => {
  // Chaîne minimale : root → referrer → pro (sponsor=referrer)
  // Niveaux 2..5 ne peuvent pas être attribués (manque ancêtres)
  const root = await createTestUser({ email: e2eEmail("root2"), isFounder: true });
  const referrer = await createTestUser({ email: e2eEmail("ref2"), sponsorId: root.id });
  const pro = await createTestUser({
    email: e2eEmail("pro2"), sponsorId: referrer.id, isProfessional: true,
  });
  const categoryId = await pickCategory();
  await createTestCompany({ ownerId: pro.id, name: "Spillover SA", categoryId });
  const { id: contactId } = await createTestContact({ userId: referrer.id });

  const recoId = await runFullRecoFlow(page, {
    referrerEmail: referrer.email,
    proEmail: pro.email,
    contactId,
    proId: pro.id,
    dealAmount: DEAL,
  });

  const { data: commissions } = await wn()
    .from("commission_transactions")
    .select("type, level, amount, user_id")
    .eq("recommendation_id", recoId);

  const byType = new Map(commissions!.map((c) => [c.type, c]));

  // referrer touche bien 60 € + level_1 (root) touche 4 €
  expect(Number(byType.get("recommendation")?.amount)).toBeCloseTo(expected.recommendation, 2);
  expect(Number(byType.get("referral_level_1")?.amount)).toBeCloseTo(expected.level, 2);
  expect(byType.get("referral_level_1")?.user_id).toBe(root.id);

  // Niveaux 2, 3, 4, 5 : absents (chaîne cassée après root)
  expect(byType.has("referral_level_2")).toBe(false);
  expect(byType.has("referral_level_3")).toBe(false);
  expect(byType.has("referral_level_4")).toBe(false);
  expect(byType.has("referral_level_5")).toBe(false);

  // platform_winelio = 14% + spillover (4 niveaux × 4% manquants)
  // affiliation_bonus va au referrer (pro.sponsor=referrer existe), pas de spillover dessus
  const undistributedLevels = 4 * expected.level;          // 16 €
  const expectedPlatform = expected.platform + undistributedLevels;  // 30 €
  expect(Number(byType.get("platform_winelio")?.amount)).toBeCloseTo(expectedPlatform, 1);
});

/* ──────────────────────────────────────────────────────────── */
/* Test 3 : idempotence — re-trigger ne crée pas de doublons    */
/* ──────────────────────────────────────────────────────────── */
test("commissions — idempotence : retrigger createCommissions ne double pas", async ({ page, request }) => {
  const chain = await buildFullChain();
  const recoId = await runFullRecoFlow(page, {
    referrerEmail: chain.referrer.email,
    proEmail: chain.pro.email,
    contactId: chain.contactId,
    proId: chain.pro.id,
    dealAmount: DEAL,
  });

  const { count: firstCount } = await wn()
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recoId);

  // Re-tenter de compléter l'étape 6 — doit retourner 400 ("déjà complétée")
  const { data: stepsRows } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const step6Id = stepsRows
    ?.map((r) => ({ id: r.id, idx: (Array.isArray(r.step) ? r.step[0] : r.step)?.order_index }))
    .find((x) => x.idx === 6)?.id;

  await loginAsFast(page, chain.pro.email);
  const retryRes = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: step6Id },
  });
  expect(retryRes.status()).toBe(400);  // étape déjà complétée

  // Pas de nouvelles commissions créées
  const { count: secondCount } = await wn()
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recoId);
  expect(secondCount).toBe(firstCount);
});

/* ──────────────────────────────────────────────────────────── */
/* Test 4 : pro orphelin → affiliation_bonus va à platform     */
/* ──────────────────────────────────────────────────────────── */
test("commissions — pro sans sponsor : affiliation_bonus absorbé par platform_winelio", async ({ page }) => {
  // Pro sans sponsor : on doit forcer sponsor_id=null APRÈS chaque login,
  // car /api/auth/verify-code → assignSponsorIfNeeded ré-attribue
  // automatiquement un fondateur si l'user n'a pas de sponsor.
  const root = await createTestUser({ email: e2eEmail("root3"), isFounder: true });
  const referrer = await createTestUser({ email: e2eEmail("ref3"), sponsorId: root.id });
  const orphanPro = await createTestUser({
    email: e2eEmail("pro-orphan"),
    sponsorId: null,
    isProfessional: true,
  });
  const categoryId = await pickCategory();
  await createTestCompany({ ownerId: orphanPro.id, name: "Orphan SA", categoryId });
  const { id: contactId } = await createTestContact({ userId: referrer.id });

  // Login referrer + créer reco
  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: orphanPro.id,
      description: "Orphan test", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  const recoId = (await createRes.json()).recommendation.id as string;

  // Récupérer step_ids
  const { data: stepsRows } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const stepIdx = new Map<number, string>();
  for (const r of stepsRows ?? []) {
    const s = Array.isArray(r.step) ? r.step[0] : r.step;
    if (s?.order_index) stepIdx.set(s.order_index, r.id);
  }

  // Login pro PUIS forcer sponsor_id=null (annule l'auto-assign de verify-code)
  await loginAsFast(page, orphanPro.email);
  await wn().from("profiles").update({ sponsor_id: null }).eq("id", orphanPro.id);

  // Compléter étapes 2-6
  for (const i of [2, 3, 4]) {
    await page.request.post("/api/recommendations/complete-step", {
      data: { recommendation_id: recoId, step_id: stepIdx.get(i) },
    });
  }
  await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recoId, step_id: stepIdx.get(5),
      quote_amount: DEAL,
      expected_completion_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
    },
  });
  await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepIdx.get(6) },
  });

  const { data: commissions } = await wn()
    .from("commission_transactions")
    .select("type, amount, user_id")
    .eq("recommendation_id", recoId);

  const byType = new Map(commissions!.map((c) => [c.type, c]));

  // affiliation_bonus est absent
  expect(byType.has("affiliation_bonus")).toBe(false);

  // platform_winelio absorbe les 1% d'affiliation + les 4×4% niveaux 2-5 manquants (chaîne courte)
  const expectedPlatform = expected.platform + expected.affiliation + 4 * expected.level;
  expect(Number(byType.get("platform_winelio")?.amount)).toBeCloseTo(expectedPlatform, 1);

  // referrer touche toujours 60% (recommendation)
  expect(Number(byType.get("recommendation")?.amount)).toBeCloseTo(expected.recommendation, 2);
});
