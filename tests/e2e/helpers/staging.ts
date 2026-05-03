import type { BrowserContext } from "@playwright/test";
import { E2E } from "./env";

/**
 * Pose le cookie d'auth staging directement (le middleware Next.js compare
 * uniquement la valeur du cookie au STAGING_PASSWORD côté serveur).
 * Ne PAS passer par /api/staging-auth : cette route est protégée par le
 * middleware Supabase et renvoie 401 sans session.
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
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Sanity check : la racine doit répondre 200 (pas redirect /staging-login)
  const probe = await context.request.get(`${E2E.baseUrl}/`, { maxRedirects: 0 });
  if (probe.status() === 307 || probe.status() === 302) {
    throw new Error(
      `staging cookie rejeté (HTTP ${probe.status()} → ${probe.headers().location}). ` +
      `Vérifier E2E_STAGING_PASSWORD dans .env.test (Coolify a peut-être 2 valeurs : utiliser la dernière).`,
    );
  }
}
