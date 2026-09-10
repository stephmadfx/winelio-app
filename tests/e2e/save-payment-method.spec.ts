import type { Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "./fixtures/test";
import { e2eEmail } from "./helpers/env";
import {
  createTestUser,
  createTestCompany,
  createTestContact,
  pickCategory,
} from "./helpers/factories";
import { db, wn } from "./helpers/supabase";

const TEST_PASSWORD = "E2eCardTest-4242!";

async function loginWithPassword(page: Page, userId: string, email: string) {
  const { error } = await db().auth.admin.updateUserById(userId, { password: TEST_PASSWORD });
  if (error) throw new Error(`set password: ${error.message}`);
  const res = await page.request.post("/api/auth/login-password", {
    data: { email, password: TEST_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`login-password ${email}: HTTP ${res.status()} ${await res.text()}`);
  }
  await page.goto("/dashboard");
}

/**
 * Surface unique d'enregistrement carte : SavePaymentMethodDialog
 * sur la fiche reco (bouton 💳 Accéder). Le wizard pro / claim / profil
 * n'embarquent pas Stripe Elements.
 */
test("carte Stripe — le formulaire Elements s'affiche sans erreur CSP", async ({ page }) => {
  if (process.env.E2E_IOS_DEVICE) test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "winelio_cookie_consent",
      JSON.stringify({ value: "declined", date: new Date().toISOString(), version: 1 }),
    );
  });

  const cspViolations: string[] = [];
  const stripeRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "js.stripe.com") stripeRequests.push(request.url());
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (/content security policy|refused to frame|Framing .* violates/i.test(text)) {
      cspViolations.push(text);
    }
  });

  const referrer = await createTestUser({
    email: e2eEmail("card-ref"),
    firstName: "RefCard",
    lastName: "E2E",
  });
  const pro = await createTestUser({
    email: e2eEmail("card-pro"),
    firstName: "ProCard",
    lastName: "E2E",
    sponsorId: referrer.id,
    isProfessional: true,
  });
  const categoryId = await pickCategory();
  const company = await createTestCompany({
    ownerId: pro.id,
    name: "E2E Card Pro",
    categoryId,
    email: e2eEmail("card-co"),
  });
  await wn().from("companies").update({ siret: "55204932700026" }).eq("id", company.id);
  await wn()
    .from("profiles")
    .update({
      postal_code: "75001",
      city: "Paris",
      address: "1 rue de la Carte",
      birth_date: "1990-01-15",
      pro_prompt_dismissed_at: new Date().toISOString(),
    })
    .in("id", [referrer.id, pro.id]);
  const contact = await createTestContact({
    userId: referrer.id,
    firstName: "Lead",
    lastName: "Carte",
    email: e2eEmail("card-lead"),
    phone: "0611223344",
  });

  const { data: rec, error: recErr } = await wn()
    .from("recommendations")
    .insert({
      referrer_id: referrer.id,
      professional_id: pro.id,
      contact_id: contact.id,
      project_description: "Reco test enregistrement carte",
      urgency_level: "normal",
      status: "PENDING",
      is_demo: true,
    })
    .select("id")
    .single();
  if (recErr || !rec) throw new Error(`create reco: ${recErr?.message}`);

  // Un recommandeur doit pouvoir consulter et recharger la fiche sans Stripe.
  await loginWithPassword(page, referrer.id, referrer.email);
  await page.goto(`/recommendations/${rec.id}`);
  await expect(page.getByText("Reco test enregistrement carte")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Reco test enregistrement carte")).toBeVisible();
  expect(stripeRequests, "Stripe ne doit pas charger pendant la consultation").toEqual([]);
  await page.screenshot({ path: "output/playwright/recommendation-without-stripe.png", fullPage: true });
  if (process.env.E2E_IOS_DEVICE) {
    await promisify(execFile)("maestro", [
      "--device", process.env.E2E_IOS_DEVICE, "test", ".maestro/stripe-recommendation-ios.yaml",
    ], {
      env: { ...process.env, MAESTRO_TEST_EMAIL: referrer.email, MAESTRO_TEST_PASSWORD: TEST_PASSWORD },
      timeout: 180_000,
    }).catch(() => { throw new Error("Le parcours iOS a échoué ; consulter les captures Maestro."); });
  }

  await loginWithPassword(page, pro.id, pro.email);
  await page.goto(`/recommendations/${rec.id}`);
  await expect(page.getByRole("button", { name: /accéder/i }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /accéder/i }).first().click();

  await expect(page.getByRole("heading", { name: /enregistrer votre carte/i })).toBeVisible();

  await expect(page.getByText("Autorisation de débits futurs", { exact: true })).toBeVisible();
  const consentCheckbox = page.getByRole("checkbox");
  const continueButton = page.getByRole("button", { name: /continuer vers la saisie de la carte/i });
  await expect(consentCheckbox).not.toBeChecked();
  await expect(continueButton).toBeDisabled();
  expect(stripeRequests, "Stripe ne doit pas charger avant le consentement").toEqual([]);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByRole("heading", { name: /enregistrer votre carte/i })).not.toBeVisible();
  await page.getByRole("button", { name: /accéder/i }).first().click();
  await expect(consentCheckbox).not.toBeChecked();
  await consentCheckbox.check();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  const stripeFrame = page.frameLocator("iframe[src*='js.stripe.com'], iframe[src*='stripe.com']").first();
  await expect(
    stripeFrame.locator("input, [name='number'], [autocomplete='cc-number']").first(),
  ).toBeVisible({ timeout: 20_000 });

  await expect(page.getByRole("button", { name: /enregistrer et autoriser/i })).toBeEnabled();
  expect(stripeRequests.length).toBeGreaterThan(0);
  await page.screenshot({ path: "output/playwright/stripe-form-after-consent.png", fullPage: true });
  expect(cspViolations, `CSP bloquait Stripe :\n${cspViolations.join("\n")}`).toEqual([]);
});
