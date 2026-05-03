import { test, expect } from "./fixtures/test";
import { wn } from "./helpers/supabase";
import { loginAsFast } from "./helpers/auth";
import { cron } from "./helpers/cron";
import { createBasicChain } from "./helpers/scenarios";

/* ---------------------------------------------------------------- */
/* Chemin 2 — Reco vers un pro scraped (sans email réel)             */
/* ---------------------------------------------------------------- */
test("chemin 2 : reco vers pro scraped sans email → pas de relance ni alerte", async ({ page }) => {
  // pro scraped + company.email = null (placeholder)
  const { referrer, pro, contactId } = await createBasicChain({
    scrapedPro: true,
    proCompanyEmail: null,
  });

  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId,
      selectedProId:     pro.id,
      description:       "Reco scraped sans email",
      urgency:           "normal",
      selfForMe:         false,
      createContact:     false,
      selfProfile:       null,
      contactForm:       null,
    },
  });
  expect(createRes.ok()).toBe(true);
  const { recommendation } = await createRes.json();
  const recoId = recommendation.id as string;

  // Forcer le cron ; doit ignorer cette reco (filtre placeholder/null email)
  await cron.scrapedReminder();

  const { data: rec } = await wn()
    .from("recommendations")
    .select("scraped_reminder_sent_at, referrer_no_response_notified_at")
    .eq("id", recoId)
    .single();

  expect(rec?.scraped_reminder_sent_at, "le cron ne doit pas marquer scraped_reminder pour un email null").toBeNull();
  expect(rec?.referrer_no_response_notified_at, "aucune alerte referrer ne doit être déclenchée").toBeNull();
});

/* ---------------------------------------------------------------- */
/* Chemin 3 — Auto-recommandation ("Pour moi-même")                  */
/* ---------------------------------------------------------------- */
test("chemin 3 : auto-reco — referrer touche bien la commission de 60 %", async ({ page }) => {
  const { referrer, pro } = await createBasicChain();

  await loginAsFast(page, referrer.email);

  const selfRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: null,
      selectedProId:     pro.id,
      description:       "Auto-reco test",
      urgency:           "normal",
      selfForMe:         true,
      createContact:     false,
      selfProfile: {
        first_name: "Refer", last_name: "E2E",
        email: referrer.email,
        phone: "0600000000",
      },
      contactForm: null,
    },
  });
  expect(selfRes.ok(), `auto-reco create: ${await selfRes.text()}`).toBe(true);
  const { recommendation } = await selfRes.json();
  const recoId = recommendation.id as string;

  // Le contact créé doit pointer vers le profil du referrer (email identique)
  const { data: rec } = await wn()
    .from("recommendations")
    .select("contact:contacts(email, user_id)")
    .eq("id", recoId)
    .single();
  const contact = Array.isArray(rec?.contact) ? rec.contact[0] : rec?.contact;
  expect(contact?.email).toBe(referrer.email);
  expect(contact?.user_id).toBe(referrer.id);
});

/* ---------------------------------------------------------------- */
/* Chemin 4 — Trigger auto recommendation_followups après étape 2    */
/* ---------------------------------------------------------------- */
test("chemin 4 : étape 2 complétée → ligne dans recommendation_followups", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain();

  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Test follow-up trigger", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  expect(createRes.ok()).toBe(true);
  const recoId = (await createRes.json()).recommendation.id as string;

  // Récup step_id de l'étape 2
  const { data: stepsRows } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const step2Id = stepsRows
    ?.map((r) => ({ id: r.id, idx: (Array.isArray(r.step) ? r.step[0] : r.step)?.order_index }))
    .find((x) => x.idx === 2)?.id;
  expect(step2Id).toBeTruthy();

  // Pro complète l'étape 2
  await loginAsFast(page, pro.email);
  const stepRes = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: step2Id },
  });
  expect(stepRes.ok()).toBe(true);

  // Le trigger trg_recommendation_step_followup doit insérer une ligne
  const { data: followups } = await wn()
    .from("recommendation_followups")
    .select("id, status, after_step_order")
    .eq("recommendation_id", recoId);

  expect(followups?.length, "le trigger SQL n'a pas créé de followup pour l'étape 2").toBeGreaterThan(0);
  expect(followups![0].after_step_order).toBe(2);
});

/* ---------------------------------------------------------------- */
/* Chemin 5 — Cron scraped : alerte referrer après H+12 + H+36       */
/* ---------------------------------------------------------------- */
test("chemin 5 : cron scraped envoie relance + alerte si email valide", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain({
    scrapedPro: true,
    proCompanyEmail: `pro-real-${Math.random().toString(36).slice(2, 6)}@winelio-e2e.local`,
  });

  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Test cron scraped", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  expect(createRes.ok()).toBe(true);
  const recoId = (await createRes.json()).recommendation.id as string;

  // Antidate la reco pour qu'elle soit éligible à la fois H+12 et H+36
  // (sinon la fenêtre 7 jours coupe et on ne peut pas tester en une passe)
  const antidate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await wn().from("recommendations").update({ created_at: antidate }).eq("id", recoId);

  // Passe 1 : doit poser scraped_reminder_sent_at
  await cron.scrapedReminder();
  const { data: r1 } = await wn()
    .from("recommendations")
    .select("scraped_reminder_sent_at")
    .eq("id", recoId).single();
  expect(r1?.scraped_reminder_sent_at).toBeTruthy();

  // Antidate la 1ère relance pour passer la fenêtre des 24h
  const reminderAntidate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  await wn().from("recommendations")
    .update({ scraped_reminder_sent_at: reminderAntidate }).eq("id", recoId);

  // Passe 2 : doit poser referrer_no_response_notified_at
  await cron.scrapedReminder();
  const { data: r2 } = await wn()
    .from("recommendations")
    .select("referrer_no_response_notified_at")
    .eq("id", recoId).single();
  expect(r2?.referrer_no_response_notified_at, "la passe H+36 doit notifier le referrer").toBeTruthy();
});

/* ---------------------------------------------------------------- */
/* Chemin 6 — MLM chaîne courte : spillover vers cagnotte Winelio   */
/* ---------------------------------------------------------------- */
test("chemin 6 : chaîne MLM courte → spillover sur platform_winelio", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain();
  // chaîne = founder → referrer → pro (longueur 2 niveaux seulement)
  // → niveaux 3, 4, 5 ne peuvent être attribués → leurs montants doivent
  //   atterrir sur platform_winelio.

  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Test spillover", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  expect(createRes.ok()).toBe(true);
  const recoId = (await createRes.json()).recommendation.id as string;

  // Compléter jusqu'à étape 6
  const { data: stepsRows } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const stepIdx = new Map<number, string>();
  for (const r of stepsRows ?? []) {
    const s = Array.isArray(r.step) ? r.step[0] : r.step;
    if (s?.order_index) stepIdx.set(s.order_index, r.id);
  }

  await loginAsFast(page, pro.email);
  for (const i of [2, 3, 4]) {
    const res = await page.request.post("/api/recommendations/complete-step", {
      data: { recommendation_id: recoId, step_id: stepIdx.get(i) },
    });
    expect(res.ok()).toBe(true);
  }
  await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recoId,
      step_id: stepIdx.get(5),
      quote_amount: 1000,
      expected_completion_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepIdx.get(6) },
  });

  // platform_winelio doit recevoir > 14 % de la commission (14% de base + spillover des niveaux 3-5)
  const { data: commissions } = await wn()
    .from("commission_transactions")
    .select("type, amount")
    .eq("recommendation_id", recoId);

  const platform = commissions?.find((c) => c.type === "platform_winelio");
  expect(platform, "platform_winelio absent").toBeTruthy();

  const referrerCom = commissions?.find((c) => c.type === "recommendation");
  // Si chaîne courte → platform > niveau classique (14% + spillover des niveaux manquants)
  expect(Number(platform!.amount)).toBeGreaterThan(0);
  expect(Number(platform!.amount)).toBeLessThanOrEqual(Number(referrerCom!.amount));
});

/* ---------------------------------------------------------------- */
/* Chemin 8 — Edge cases : devis invalides à l'étape 5               */
/* ---------------------------------------------------------------- */
test("chemin 8 : devis invalides (0, négatif, > 1M) sont rejetés", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain();

  await loginAsFast(page, referrer.email);
  const createRes = await page.request.post("/api/recommendations/create", {
    data: {
      selectedContactId: contactId, selectedProId: pro.id,
      description: "Edge case test", urgency: "normal",
      selfForMe: false, createContact: false, selfProfile: null, contactForm: null,
    },
  });
  const recoId = (await createRes.json()).recommendation.id as string;

  // Aller jusqu'à l'étape 5
  const { data: stepsRows } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const stepIdx = new Map<number, string>();
  for (const r of stepsRows ?? []) {
    const s = Array.isArray(r.step) ? r.step[0] : r.step;
    if (s?.order_index) stepIdx.set(s.order_index, r.id);
  }

  await loginAsFast(page, pro.email);
  for (const i of [2, 3, 4]) {
    await page.request.post("/api/recommendations/complete-step", {
      data: { recommendation_id: recoId, step_id: stepIdx.get(i) },
    });
  }

  const validDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // Montant 0 → rejet
  const r0 = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepIdx.get(5), quote_amount: 0, expected_completion_at: validDate },
  });
  expect(r0.status()).toBe(400);

  // Montant négatif → rejet
  const rNeg = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepIdx.get(5), quote_amount: -100, expected_completion_at: validDate },
  });
  expect(rNeg.status()).toBe(400);

  // Montant > 1M → rejet
  const rHuge = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: stepIdx.get(5), quote_amount: 2_000_000, expected_completion_at: validDate },
  });
  expect(rHuge.status()).toBe(400);

  // Date passée → rejet
  const rPast = await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recoId, step_id: stepIdx.get(5),
      quote_amount: 500, expected_completion_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
  });
  expect(rPast.status()).toBe(400);
});
