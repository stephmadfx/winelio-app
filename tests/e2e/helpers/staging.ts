import type { BrowserContext } from "@playwright/test";
import { E2E } from "./env";

/**
 * Pose le cookie d'auth staging (middleware) pour que toutes les requêtes
 * du contexte Playwright dépassent le mur /staging-login.
 */
export async function injectStagingCookie(context: BrowserContext): Promise<void> {
  const url = new URL(E2E.baseUrl);
  await context.addCookies([
    {
      name: "staging_auth",
      value: E2E.stagingPwd,
      domain: url.hostname,
      path: "/",
      secure: url.protocol === "https:",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}
