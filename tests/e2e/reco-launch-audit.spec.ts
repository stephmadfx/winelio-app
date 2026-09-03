import { test, expect } from "./fixtures/test";
import { wn } from "./helpers/supabase";
import { loginAsFast, logout } from "./helpers/auth";
import { createBasicChain } from "./helpers/scenarios";
import { createTestUser, createTestCompany } from "./helpers/factories";
import { recoCreateBody } from "./helpers/reco";
import { e2eEmail } from "./helpers/env";
import { signFollowupToken } from "./helpers/followup";
import { readQueuedEmails } from "./helpers/email";
import { notifyProFollowup } from "../../src/lib/notify-pro-followup";

const FUTURE = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

function clientTokenFromEmail(html: string): string {
  const match = html.match(/\/recommendations\/client\/([A-Za-z0-9._-]+)/);
  if (!match?.[1]) throw new Error("Token client introuvable dans l'email");
  return match[1];
}

function followupTokenFromEmail(html: string): string {
  const match = html.match(/\/recommendations\/followup\/([A-Za-z0-9._-]+)\/done/);
  if (!match?.[1]) throw new Error("Token de relance introuvable dans l'email");
  return match[1];
}

async function stepIds(recoId: string): Promise<Map<number, string>> {
  const { data } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recoId);
  const map = new Map<number, string>();
  for (const row of data ?? []) {
    const step = Array.isArray(row.step) ? row.step[0] : row.step;
    if (step?.order_index) map.set(step.order_index, row.id);
  }
  return map;
}

async function recoStatus(recoId: string): Promise<string | null> {
  const { data } = await wn()
    .from("recommendations")
    .select("status")
    .eq("id", recoId)
    .single();
  return data?.status ?? null;
}

test("lancement : 8 étapes + urgence flexible + refus CANCELLED", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain();

  await loginAsFast(page, referrer.email);
  const created = await page.request.post("/api/recommendations/create", {
    data: {
      ...recoCreateBody(pro.id, contactId, "Audit lancement — flexible"),
      urgency: "flexible",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const recoId = (await created.json()).recommendation.id as string;

  const { data: reco } = await wn()
    .from("recommendations")
    .select("status, urgency_level")
    .eq("id", recoId)
    .single();
  expect(reco?.urgency_level).toBe("flexible");
  expect(reco?.status).toBe("PENDING");
  expect((await stepIds(recoId)).size, "la reco doit avoir 8 étapes").toBe(8);

  await loginAsFast(page, pro.email);
  const refused = await page.request.post(`/api/recommendations/${recoId}/refuse`);
  expect(refused.ok(), await refused.text()).toBe(true);
  expect(await recoStatus(recoId)).toBe("CANCELLED");
});

test("lancement : middleware relances public + cron Bearer", async ({ page }) => {
  const done = await page.request.get("/api/recommendations/followup-action?token=test&action=done");
  expect(done.status()).toBe(200);
  expect(await done.text()).toMatch(/expiré|invalide/i);

  const postpone = await page.request.get("/recommendations/followup/testtoken/postpone");
  expect(postpone.status(), "la page postpone ne doit plus exiger une session").toBe(200);
  expect(postpone.status()).not.toBe(401);

  const followups = await page.request.post("/api/recommendations/process-followups");
  expect(followups.status()).toBe(401);
  expect(await followups.json()).toMatchObject({ error: "Unauthorized" });

  const scraped = await page.request.get("/api/recommendations/cron-scraped-reminder");
  expect(scraped.status()).toBe(401);
  expect(await scraped.json()).toMatchObject({ error: "Unauthorized" });
});

test("lancement : golden path 8 étapes jusqu'aux travaux, sans Checkout live", async ({ page, context }) => {
  const { referrer, pro, contactId } = await createBasicChain();

  await loginAsFast(page, referrer.email);
  const created = await page.request.post("/api/recommendations/create", {
    data: recoCreateBody(pro.id, contactId, "Audit lancement — golden path"),
  });
  expect(created.ok(), await created.text()).toBe(true);
  const recoId = (await created.json()).recommendation.id as string;
  const steps = await stepIds(recoId);
  expect(steps.size).toBe(8);

  await loginAsFast(page, pro.email);
  const accept = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: steps.get(2) },
  });
  expect(accept.ok(), await accept.text()).toBe(true);
  expect(await recoStatus(recoId)).toBe("ACCEPTED");

  const { data: after2 } = await wn()
    .from("recommendation_followups")
    .select("id, after_step_order, status")
    .eq("recommendation_id", recoId)
    .eq("after_step_order", 2)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(after2?.after_step_order).toBe(2);
  expect(after2?.status).toBe("pending");

  await logout(page, context);
  const after2Token = signFollowupToken(after2!.id);
  const contactPreview = await page.request.get(
    `/api/recommendations/followup-action?token=${encodeURIComponent(after2Token)}&action=done`,
    { maxRedirects: 0 },
  );
  expect(contactPreview.status()).toBe(307);
  const contactConfirmationPage = await page.request.get(
    `/recommendations/followup/${encodeURIComponent(after2Token)}/done`,
  );
  expect(contactConfirmationPage.status()).toBe(200);
  expect(await contactConfirmationPage.text()).toMatch(/Confirmer l.avancement/i);
  expect(await recoStatus(recoId), "un GET/scanner email ne doit jamais valider l'étape").toBe("ACCEPTED");

  const contactDone = await page.request.post("/api/recommendations/followup-action", {
    data: { token: after2Token, action: "done" },
  });
  expect(contactDone.status()).toBe(200);
  expect(await contactDone.json()).toMatchObject({ ok: true });
  expect(await recoStatus(recoId)).toBe("CONTACT_MADE");

  await loginAsFast(page, pro.email);
  const meeting = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: steps.get(4) },
  });
  expect(meeting.ok(), await meeting.text()).toBe(true);
  expect(await recoStatus(recoId)).toBe("MEETING_SCHEDULED");

  const { data: after4 } = await wn()
    .from("recommendation_followups")
    .select("id")
    .eq("recommendation_id", recoId)
    .eq("after_step_order", 4)
    .eq("status", "pending")
    .maybeSingle();
  expect(after4?.id, "relance après RDV (étape 4)").toBeTruthy();

  await logout(page, context);
  const devisViaEmail = await page.request.post("/api/recommendations/followup-action", {
    data: { token: signFollowupToken(after4!.id), action: "done" },
  });
  expect(devisViaEmail.status()).toBe(409);
  expect((await devisViaEmail.json()).error).toMatch(/devis|montant/i);
  expect(await recoStatus(recoId)).toBe("MEETING_SCHEDULED");

  await loginAsFast(page, pro.email);
  const quote = await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recoId,
      step_id: steps.get(5),
      quote_amount: 2500,
      expected_completion_at: FUTURE(),
    },
  });
  expect(quote.ok(), await quote.text()).toBe(true);
  expect(await recoStatus(recoId)).toBe("QUOTE_SUBMITTED");

  const { data: followupsAfterQuote } = await wn()
    .from("recommendation_followups")
    .select("id")
    .eq("recommendation_id", recoId)
    .eq("after_step_order", 6);
  expect(followupsAfterQuote ?? []).toHaveLength(0);

  const { data: contact } = await wn()
    .from("contacts")
    .select("email")
    .eq("id", contactId)
    .single();
  const quoteEmails = await readQueuedEmails(contact!.email, {
    subjectMatch: /Confirmez-vous ce devis/i,
  });
  expect(quoteEmails).toHaveLength(1);
  const quoteApproval = await page.request.post("/api/recommendations/client-action", {
    data: { token: clientTokenFromEmail(quoteEmails[0].html), decision: "confirm" },
  });
  expect(quoteApproval.ok(), await quoteApproval.text()).toBe(true);
  expect(await recoStatus(recoId)).toBe("QUOTE_VALIDATED");

  const { data: worksFollowup } = await wn()
    .from("recommendation_followups")
    .select("id, after_step_order, status")
    .eq("recommendation_id", recoId)
    .eq("after_step_order", 6)
    .eq("status", "pending")
    .maybeSingle();
  expect(worksFollowup?.after_step_order).toBe(6);

  await logout(page, context);
  await notifyProFollowup({
    followupId: worksFollowup!.id,
    recommendationId: recoId,
    afterStep: 6,
    cycleIndex: 1,
  });
  const paymentQuestionEmails = await readQueuedEmails(pro.email, {
    subjectMatch: /travaux.*terminés/i,
  });
  expect(paymentQuestionEmails).toHaveLength(1);
  expect(paymentQuestionEmails[0].html).toContain("Oui, j’ai été payé");
  expect(paymentQuestionEmails[0].html).not.toContain("/api/recommendations/followup-action");
  const worksToken = followupTokenFromEmail(paymentQuestionEmails[0].html);
  const worksPreview = await page.request.get(
    `/api/recommendations/followup-action?token=${encodeURIComponent(worksToken)}&action=done`,
    { maxRedirects: 0 },
  );
  expect(worksPreview.status()).toBe(307);
  const worksConfirmationPage = await page.request.get(
    `/recommendations/followup/${encodeURIComponent(worksToken)}/done`,
  );
  expect(worksConfirmationPage.status()).toBe(200);
  expect(await worksConfirmationPage.text()).toMatch(/Avez-vous bien encaissé votre client/i);
  expect(await recoStatus(recoId), "l'ouverture du lien ne doit pas déclarer le paiement").toBe("QUOTE_VALIDATED");

  const worksDone = await page.request.post("/api/recommendations/followup-action", {
    data: { token: worksToken, action: "done" },
  });
  expect(worksDone.status()).toBe(200);
  expect(await worksDone.json()).toMatchObject({
    ok: true,
    payment: { mode: "test", status: "skipped" },
  });
  expect(await recoStatus(recoId)).toBe("PAYMENT_RECEIVED");

  const repeatedDone = await page.request.post("/api/recommendations/followup-action", {
    data: { token: worksToken, action: "done" },
  });
  expect(repeatedDone.status()).toBe(200);
  expect(await repeatedDone.json()).toMatchObject({ ok: true, alreadyCompleted: true });

  const { data: completionState } = await wn()
    .from("recommendations")
    .select("client_completion_status")
    .eq("id", recoId)
    .single();
  expect(completionState?.client_completion_status).toBe("pending");

  const { count: paymentAttempts } = await wn()
    .from("stripe_payment_sessions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recoId);
  expect(paymentAttempts, "une recommandation E2E ne doit jamais toucher Stripe").toBe(0);
});

test("lancement : abandon email pose CANCELLED", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain();

  await loginAsFast(page, referrer.email);
  const created = await page.request.post("/api/recommendations/create", {
    data: recoCreateBody(pro.id, contactId, "Audit lancement — abandon"),
  });
  const recoId = (await created.json()).recommendation.id as string;
  const steps = await stepIds(recoId);

  await loginAsFast(page, pro.email);
  await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: steps.get(2) },
  });

  const { data: fu } = await wn()
    .from("recommendation_followups")
    .select("id")
    .eq("recommendation_id", recoId)
    .eq("after_step_order", 2)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const abandon = await page.request.post("/api/recommendations/followup-action", {
    data: { token: signFollowupToken(fu!.id), action: "abandon" },
  });
  expect(abandon.ok(), await abandon.text()).toBe(true);
  expect(await recoStatus(recoId)).toBe("CANCELLED");
});

test("lancement : transfert après acceptation / abandon toujours bloqué", async ({ page }) => {
  const chain = await createBasicChain();
  const otherPro = await createTestUser({
    email: e2eEmail("pro2"),
    firstName: "Pro2",
    sponsorId: chain.referrer.id,
    isProfessional: true,
  });
  await createTestCompany({
    ownerId: otherPro.id,
    name: "E2E Autre Pro SA",
    categoryId: chain.categoryId,
    email: e2eEmail("company2"),
  });

  await loginAsFast(page, chain.referrer.email);
  const created = await page.request.post("/api/recommendations/create", {
    data: recoCreateBody(chain.pro.id, chain.contactId, "Audit lancement — transfert"),
  });
  const recoId = (await created.json()).recommendation.id as string;
  const steps = await stepIds(recoId);

  await loginAsFast(page, chain.pro.email);
  await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recoId, step_id: steps.get(2) },
  });

  const transferAfterAccept = await page.request.post(`/api/recommendations/${recoId}/transfer`, {
    data: { target_professional_id: otherPro.id },
  });
  expect(transferAfterAccept.status()).toBe(400);

  const { data: fu } = await wn()
    .from("recommendation_followups")
    .select("id")
    .eq("recommendation_id", recoId)
    .eq("after_step_order", 2)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  await page.request.post("/api/recommendations/followup-action", {
    data: { token: signFollowupToken(fu!.id), action: "abandon" },
  });
  expect(await recoStatus(recoId)).toBe("CANCELLED");

  const transferAfterCancel = await page.request.post(`/api/recommendations/${recoId}/transfer`, {
    data: { target_professional_id: otherPro.id },
  });
  expect(transferAfterCancel.status()).toBe(400);

  await loginAsFast(page, chain.referrer.email);
  const referrerTransfer = await page.request.post(`/api/recommendations/${recoId}/transfer`, {
    data: { target_professional_id: otherPro.id },
  });
  expect(referrerTransfer.status()).toBe(403);
});
