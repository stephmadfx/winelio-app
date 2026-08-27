import { test, expect } from "./fixtures/test";
import { loginAsFast } from "./helpers/auth";
import { createBasicChain } from "./helpers/scenarios";

test("wizard reco : saisie du recommandé, pas de Pour moi-même", async ({ page }) => {
  const { referrer } = await createBasicChain();
  await loginAsFast(page, referrer.email);

  await page.goto("/recommendations/new");
  await expect(page.getByRole("heading", { name: "Nouvelle recommandation" })).toBeVisible();
  await expect(page.getByText("Pour moi-même")).toHaveCount(0);
  await expect(page.getByText("Pour quelqu'un d'autre")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Qui est le recommandé ?" })).toBeVisible();
  await expect(page.getByText("Recommandeur")).toBeVisible();
  await expect(page.getByText("Professionnel")).toBeVisible();

  await page.getByRole("button", { name: "Ajouter un recommandé" }).click();
  await page.getByPlaceholder("Pierre").fill("Léa");
  await page.getByPlaceholder("Dupont").fill("Martin");
  await page.getByPlaceholder("pierre.dupont@email.com").fill(referrer.email);
  await page.getByPlaceholder("6 12 34 56 78").fill("0611223344");
  await page.getByPlaceholder("123 rue de la Paix").fill("1 rue Test");
  await page.getByPlaceholder("Paris").fill("Lyon");
  await page.getByPlaceholder("75000").fill("69001");
  await page.getByText("Je confirme avoir obtenu le consentement").click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("Le recommandé ne peut pas être vous-même")).toBeVisible();

  await page.getByPlaceholder("pierre.dupont@email.com").fill("lea.martin@example.com");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { name: "Quel professionnel recommandez-vous ?" })).toBeVisible();
});
