import { test, expect } from "./fixtures/test";
import { createBasicChain } from "./helpers/scenarios";
import { loginAsFast } from "./helpers/auth";
import { recoCreateBody } from "./helpers/reco";
import { readQueuedEmails } from "./helpers/email";
import { wn } from "./helpers/supabase";

function tokenFromEmail(html: string): string {
  const match = html.match(/\/recommendations\/client\/([A-Za-z0-9._-]+)/);
  if (!match?.[1]) throw new Error("Token client introuvable dans l'email");
  return match[1];
}

test("validation client : devis, litige, renvoi et confirmation finale", async ({ page }) => {
  const { referrer, pro, contactId } = await createBasicChain();
  const { data: contact } = await wn()
    .from("contacts")
    .select("email")
    .eq("id", contactId)
    .single();
  expect(contact?.email).toBeTruthy();

  await loginAsFast(page, referrer.email);
  const createResponse = await page.request.post("/api/recommendations/create", {
    data: recoCreateBody(pro.id, contactId, "Parcours validation client E2E"),
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const { recommendation } = await createResponse.json();
  const recommendationId = recommendation.id as string;

  const { data: stepRows, error: stepError } = await wn()
    .from("recommendation_steps")
    .select("id, step:steps(order_index, completion_role)")
    .eq("recommendation_id", recommendationId);
  expect(stepError).toBeNull();
  expect(stepRows).toHaveLength(8);
  const stepByOrder = new Map<number, string>();
  for (const row of stepRows ?? []) {
    const step = Array.isArray(row.step) ? row.step[0] : row.step;
    if (step?.order_index) stepByOrder.set(step.order_index, row.id);
  }

  await page.request.post("/api/auth/sign-out");
  await loginAsFast(page, pro.email);
  for (const order of [2, 3, 4]) {
    const response = await page.request.post("/api/recommendations/complete-step", {
      data: { recommendation_id: recommendationId, step_id: stepByOrder.get(order) },
    });
    expect(response.ok(), `étape ${order}: ${await response.text()}`).toBe(true);
  }

  const quoteResponse = await page.request.post("/api/recommendations/complete-step", {
    data: {
      recommendation_id: recommendationId,
      step_id: stepByOrder.get(5),
      quote_amount: 1850,
      work_already_completed: true,
    },
  });
  expect(quoteResponse.ok(), await quoteResponse.text()).toBe(true);

  const quoteEmails = await readQueuedEmails(contact!.email, {
    subjectMatch: /Confirmez-vous ce devis/i,
  });
  expect(quoteEmails).toHaveLength(1);
  const quoteToken = tokenFromEmail(quoteEmails[0].html);

  const tampered = `${quoteToken.slice(0, -1)}${quoteToken.endsWith("a") ? "b" : "a"}`;
  const tamperedResponse = await page.request.get(
    `/api/recommendations/client-action?token=${encodeURIComponent(tampered)}`,
  );
  expect(tamperedResponse.status()).toBe(400);

  const quoteDetails = await page.request.get(
    `/api/recommendations/client-action?token=${encodeURIComponent(quoteToken)}`,
  );
  expect(quoteDetails.ok(), await quoteDetails.text()).toBe(true);
  await expect(quoteDetails.json()).resolves.toMatchObject({
    purpose: "quote",
    status: "pending",
    amount: 1850,
  });

  const confirmQuote = await page.request.post("/api/recommendations/client-action", {
    data: { token: quoteToken, decision: "confirm" },
  });
  expect(confirmQuote.ok(), await confirmQuote.text()).toBe(true);

  // Un double clic/rejeu du même lien reste sans effet secondaire.
  const replayQuote = await page.request.post("/api/recommendations/client-action", {
    data: { token: quoteToken, decision: "confirm" },
  });
  expect(replayQuote.ok(), await replayQuote.text()).toBe(true);
  await expect(replayQuote.json()).resolves.toMatchObject({ alreadyProcessed: true });

  const { data: afterQuote } = await wn()
    .from("recommendations")
    .select("status, expected_completion_at, client_quote_status")
    .eq("id", recommendationId)
    .single();
  expect(afterQuote).toMatchObject({
    status: "QUOTE_VALIDATED",
    expected_completion_at: null,
    client_quote_status: "accepted",
  });

  const workDone = await page.request.post("/api/recommendations/complete-step", {
    data: { recommendation_id: recommendationId, step_id: stepByOrder.get(7) },
  });
  expect(workDone.ok(), await workDone.text()).toBe(true);

  const completionEmails = await readQueuedEmails(contact!.email, {
    subjectMatch: /prestation est-elle terminée/i,
  });
  expect(completionEmails).toHaveLength(1);
  const firstCompletionToken = tokenFromEmail(completionEmails[0].html);

  const dispute = await page.request.post("/api/recommendations/client-action", {
    data: {
      token: firstCompletionToken,
      decision: "dispute",
      note: "Une finition reste à reprendre dans la salle de bain.",
    },
  });
  expect(dispute.ok(), await dispute.text()).toBe(true);

  const { data: disputed } = await wn()
    .from("recommendations")
    .select("status, client_completion_status, client_completion_note")
    .eq("id", recommendationId)
    .single();
  expect(disputed).toMatchObject({
    status: "PAYMENT_RECEIVED",
    client_completion_status: "disputed",
  });
  expect(disputed?.client_completion_note).toContain("finition");

  const resend = await page.request.post(
    `/api/recommendations/${recommendationId}/client-confirmation`,
    { data: { purpose: "completion" } },
  );
  expect(resend.ok(), await resend.text()).toBe(true);

  const resentEmails = await readQueuedEmails(contact!.email, {
    subjectMatch: /prestation est-elle terminée/i,
  });
  expect(resentEmails).toHaveLength(2);
  const secondCompletionToken = tokenFromEmail(resentEmails[0].html);
  expect(secondCompletionToken).not.toBe(firstCompletionToken);

  const confirmCompletion = await page.request.post(
    "/api/recommendations/client-action",
    { data: { token: secondCompletionToken, decision: "confirm" } },
  );
  expect(confirmCompletion.ok(), await confirmCompletion.text()).toBe(true);

  const { data: completed } = await wn()
    .from("recommendations")
    .select("status, client_completion_status")
    .eq("id", recommendationId)
    .single();
  expect(completed).toMatchObject({
    status: "COMPLETED",
    client_completion_status: "confirmed",
  });

  const { data: finalStep } = await wn()
    .from("recommendation_steps")
    .select("completed_at, data")
    .eq("id", stepByOrder.get(8))
    .single();
  expect(finalStep?.completed_at).toBeTruthy();
  expect(finalStep?.data).toMatchObject({ confirmation_client: true });
});
