import type { Page, BrowserContext } from "@playwright/test";
import { db } from "./supabase";
import { readOtpCode } from "./otp";

/**
 * Connecte un compte test rapidement via magic link admin.
 * Utilisé par défaut dans les tests qui ne valident pas le flow OTP UI.
 */
export async function loginAsFast(page: Page, email: string): Promise<void> {
  const { data, error } = await db().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(`generateLink ${email}: ${error?.message ?? "no action_link"}`);
  }

  await page.goto(data.properties.action_link);
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
