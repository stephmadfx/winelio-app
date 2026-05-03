import { test as base, expect } from "@playwright/test";
import { injectStagingCookie } from "../helpers/staging";
import { cleanupE2EAccounts } from "../helpers/cleanup";

/**
 * Fixture de base : tous les tests E2E démarrent avec :
 *   - le cookie staging_auth posé (pas de mur /staging-login)
 *   - une DB nettoyée de tout compte E2E résiduel (auto-isolation)
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await injectStagingCookie(context);
    await use(context);
  },
});

test.beforeAll(async () => {
  await cleanupE2EAccounts();
});

test.afterAll(async () => {
  await cleanupE2EAccounts();
});

export { expect };
