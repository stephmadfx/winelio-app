import { test, expect } from "./fixtures/test";
import { createTestUser } from "./helpers/factories";
import { loginAsFast } from "./helpers/auth";
import { db } from "./helpers/supabase";

test("le super-admin crée une newsletter et dispose du ciblage avancé", async ({ page }) => {
  const admin = await createTestUser({
    email: `newsletter-admin-${Date.now()}@winelio-e2e.local`,
    firstName: "Admin",
    lastName: "Newsletter",
  });
  const { error } = await db().auth.admin.updateUserById(admin.id, {
    app_metadata: { role: "super_admin" },
  });
  if (error) throw new Error(error.message);

  await loginAsFast(page, admin.email);
  await page.goto("/gestion-reseau/newsletters/new");

  await expect(page.getByRole("heading", { name: "Éditeur newsletter" })).toBeVisible();
  await expect(page.getByText("Dernière connexion")).toBeVisible();
  await expect(page.getByText("Affiliation", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer la campagne" })).toBeVisible();

  await page.getByLabel("Nom du template").fill("Test ciblage newsletter");
  await page.getByLabel("Sujet de l'email").fill("Les nouvelles Winelio");
  await page.getByLabel("Preheader").fill("Un aperçu personnalisé et responsive.");
  await page.getByLabel("Dernière connexion").selectOption("less_active");
  await page.getByLabel("Affiliation").selectOption("network");
  const saveButton = page.getByRole("button", { name: "Sauvegarder" });
  await expect(saveButton).toBeEnabled();
  const saveResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/newsletters") && response.request().method() === "POST"
  );
  await saveButton.click();
  const response = await saveResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  await expect(page.getByText(/Sauvegardé à/)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/gestion-reseau\/newsletters\/[0-9a-f-]+$/);
});
