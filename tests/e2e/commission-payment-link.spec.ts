import { config } from "dotenv";
import Stripe from "stripe";
import { test, expect } from "./fixtures/test";
import { loginAsFast } from "./helpers/auth";
import { createTestContact, createTestUser } from "./helpers/factories";
import { e2eEmail } from "./helpers/env";
import { wn } from "./helpers/supabase";

config({ path: ".env.local", override: false, quiet: true });

test("le professionnel retrouve un lien Stripe actif depuis les étapes", async ({ page }) => {
  const referrer = await createTestUser({ email: e2eEmail("payment-link-referrer") });
  const professional = await createTestUser({
    email: e2eEmail("payment-link-professional"),
    isProfessional: true,
    sponsorId: referrer.id,
  });
  await wn()
    .from("profiles")
    .update({ pro_prompt_dismissed_at: new Date().toISOString() })
    .eq("id", professional.id);
  const contact = await createTestContact({
    userId: referrer.id,
    firstName: "Client",
    lastName: "Paiement",
    email: `payment-ui-${crypto.randomUUID()}@example.invalid`,
  });

  const { data: recommendation, error: recommendationError } = await wn()
    .from("recommendations")
    .insert({
      referrer_id: referrer.id,
      professional_id: professional.id,
      contact_id: contact.id,
      project_description: "Test lien Stripe depuis les étapes",
      urgency_level: "normal",
      status: "COMPLETED",
      amount: 100,
      is_demo: false,
    })
    .select("id")
    .single();
  expect(recommendationError).toBeNull();
  expect(recommendation).toBeTruthy();

  const stripeSessionIds: string[] = [];
  try {
    await page.addInitScript(() => {
      localStorage.setItem(
        "winelio_cookie_consent",
        JSON.stringify({ value: "accepted", date: new Date().toISOString(), version: 1 }),
      );
      sessionStorage.setItem("winelio-pro-prompt-snoozed", "1");
    });
    await loginAsFast(page, referrer.email);
    const forbidden = await page.request.post(
      `/api/recommendations/${recommendation!.id}/commission-payment-link`,
    );
    expect(forbidden.status()).toBe(403);

    await loginAsFast(page, professional.email);
    await page.goto(`/recommendations/${recommendation!.id}`);

    await expect(page.getByText("Commission Winelio à régler")).toBeVisible();
    const paymentButton = page.getByRole("button", { name: /Accéder au paiement Stripe/i });
    await expect(paymentButton).toBeVisible();

    await paymentButton.click();
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 20_000 });

    const { data: paymentSession, error: paymentSessionError } = await wn()
      .from("stripe_payment_sessions")
      .select("stripe_session_id, status, amount")
      .eq("recommendation_id", recommendation!.id)
      .eq("status", "pending")
      .single();
    expect(paymentSessionError).toBeNull();
    expect(paymentSession?.amount).toBe(10);
    const firstStripeSessionId = paymentSession?.stripe_session_id ?? null;
    expect(firstStripeSessionId).toBeTruthy();
    stripeSessionIds.push(firstStripeSessionId!);

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    expect(stripeKey?.startsWith("sk_test_")).toBe(true);
    const stripe = new Stripe(stripeKey!);
    const liveSession = await stripe.checkout.sessions.retrieve(firstStripeSessionId!);
    expect(liveSession.status).toBe("open");
    expect(liveSession.url).toBe(page.url());

    await stripe.checkout.sessions.expire(firstStripeSessionId!);
    await page.goto(`/recommendations/${recommendation!.id}`);

    const renewedButton = page.getByRole("button", { name: "Payer 10,00 € sur Stripe" });
    await expect(renewedButton).toBeVisible();
    await renewedButton.click();
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 20_000 });

    const { data: renewedPayment, error: renewedPaymentError } = await wn()
      .from("stripe_payment_sessions")
      .select("stripe_session_id, status")
      .eq("recommendation_id", recommendation!.id)
      .eq("status", "pending")
      .single();
    expect(renewedPaymentError).toBeNull();
    expect(renewedPayment?.stripe_session_id).not.toBe(firstStripeSessionId);
    stripeSessionIds.push(renewedPayment!.stripe_session_id);

    const renewedStripeSession = await stripe.checkout.sessions.retrieve(
      renewedPayment!.stripe_session_id,
    );
    expect(renewedStripeSession.status).toBe("open");
    expect(renewedStripeSession.url).toBe(page.url());

    const { error: markPaidError } = await wn()
      .from("stripe_payment_sessions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("stripe_session_id", renewedPayment!.stripe_session_id);
    expect(markPaidError).toBeNull();

    await page.goto(`/recommendations/${recommendation!.id}`);
    await expect(page.getByText("Commission Winelio à régler")).toHaveCount(0);
    const alreadyPaid = await page.request.post(
      `/api/recommendations/${recommendation!.id}/commission-payment-link`,
    );
    expect(alreadyPaid.status()).toBe(409);
  } finally {
    if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      for (const sessionId of stripeSessionIds) {
        await stripe.checkout.sessions.expire(sessionId).catch(() => undefined);
      }
    }
  }
});
