import type { Page, BrowserContext } from "@playwright/test";
import { readOtpCode } from "./otp";

/**
 * Connecte un compte test rapidement via les routes API custom (send-code + verify-code).
 * Le SMTP est déjà skippé pour les emails @winelio-e2e.local : on lit le code OTP
 * directement en DB. Les cookies HttpOnly de session sont posés par /api/auth/verify-code.
 */
export async function loginAsFast(page: Page, email: string): Promise<void> {
  // 1. Demande l'OTP (insère dans winelio.otp_codes, skip SMTP pour @winelio-e2e.local)
  const sendRes = await page.request.post("/api/auth/send-code", { data: { email } });
  if (!sendRes.ok()) {
    throw new Error(`send-code ${email}: HTTP ${sendRes.status()} ${await sendRes.text()}`);
  }

  // 2. Lit le code en DB
  const code = await readOtpCode(email);

  // 3. Vérifie le code → la route pose les cookies de session HttpOnly
  const verifyRes = await page.request.post("/api/auth/verify-code", {
    data: { email, code },
  });
  if (!verifyRes.ok()) {
    throw new Error(`verify-code ${email}: HTTP ${verifyRes.status()} ${await verifyRes.text()}`);
  }

  // 4. Confirme la session côté browser via /dashboard
  await page.goto("/dashboard");
  await page.waitForURL(/\/(dashboard|profile|recommendations|network|wallet)/, { timeout: 15_000 });
}

/**
 * Connecte un compte test via le vrai flow UI (email + OTP).
 * Utilisé pour valider explicitement le parcours d'auth.
 */
export async function loginViaUI(page: Page, email: string): Promise<void> {
  await page.goto("/auth/login");
  // Sélectionne l'onglet "Code email" (par défaut c'est "password")
  await page.getByRole("button", { name: /code/i }).first().click();

  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: /recevoir le code/i }).click();

  const code = await readOtpCode(email);
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: /se connecter/i }).click();

  await page.waitForURL(/\/(dashboard|profile)/, { timeout: 15_000 });
}

/**
 * Vide le state d'auth (logout via API + clear cookies sauf staging).
 */
export async function logout(page: Page, context: BrowserContext): Promise<void> {
  await page.request.post("/api/auth/sign-out").catch(() => undefined);
  // Conserve uniquement le cookie staging_auth
  const all = await context.cookies();
  const staging = all.filter((c) => c.name === "staging_auth");
  await context.clearCookies();
  if (staging.length) await context.addCookies(staging);
}
