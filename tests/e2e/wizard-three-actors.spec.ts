import { test, expect } from "./fixtures/test";
import { loginAsFast } from "./helpers/auth";
import { createBasicChain } from "./helpers/scenarios";

test("wizard reco : professionnel, besoin, puis recommandé", async ({ page }) => {
  const { referrer, pro } = await createBasicChain();
  await page.route("https://geo.api.gouv.fr/communes?**", route => route.fulfill({
    json: [{ nom: "Lyon", centre: { coordinates: [4.83, 45.76] } }],
  }));
  await page.route("**/api/professionals/search", route => route.fulfill({
    json: { professionals: [{ profile_id: pro.id, company_name: "E2E Plomberie SA", company_source: "owner", city: "Lyon" }] },
  }));
  await loginAsFast(page, referrer.email);

  await page.goto("/recommendations/new");
  await expect(page.getByRole("heading", { name: "Nouvelle recommandation" })).toBeVisible();
  await expect(page.getByText("Pour moi-même")).toHaveCount(0);
  await expect(page.getByText("Pour quelqu'un d'autre")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Quel professionnel recommandez-vous ?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suivant" })).toBeDisabled();
  await page.getByPlaceholder("Code postal", { exact: true }).fill("69001");
  await page.getByRole("button", { name: "Sélectionner E2E Plomberie SA" }).click();
  await expect(page.getByRole("heading", { name: "Décrivez le besoin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suivant" })).toBeDisabled();
  await page.getByRole("textbox").fill("Une fuite dans la salle de bain, disponible en semaine.");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { name: "Qui est le recommandé ?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer la recommandation" })).toBeDisabled();

  await page.getByRole("button", { name: "Ajouter un nouveau recommandé" }).click();
  await page.getByPlaceholder("Pierre").fill("Léa");
  await page.getByPlaceholder("Dupont").fill("Martin");
  await page.getByPlaceholder("pierre.dupont@email.com").fill(referrer.email);
  await page.getByPlaceholder("6 12 34 56 78").fill("0611223344");
  await page.getByPlaceholder("123 rue de la Paix").fill("1 rue Test");
  await page.getByPlaceholder("Paris").fill("Lyon");
  await page.getByPlaceholder("75000").fill("69001");
  await page.getByText("Je confirme avoir obtenu le consentement").click();
  await expect(page.getByRole("button", { name: "Envoyer la recommandation" })).toBeDisabled();

  await page.getByPlaceholder("pierre.dupont@email.com").fill("adresse-invalide");
  await page.getByRole("button", { name: "Envoyer la recommandation" }).click();
  await expect(page.getByText("Format d'email invalide")).toBeVisible();
  await page.getByPlaceholder("pierre.dupont@email.com").fill("lea.martin@example.com");
  await expect(page.getByRole("button", { name: "Envoyer la recommandation" })).toBeEnabled();

  const previous = page.getByRole("button", { name: "Retour", exact: true }).last();
  await previous.click();
  await expect(page.getByRole("textbox")).toHaveValue("Une fuite dans la salle de bain, disponible en semaine.");
  await previous.click();
  await expect(page.getByPlaceholder("Code postal", { exact: true })).toHaveValue("69001");
  await expect(page.getByRole("button", { name: "Sélectionner E2E Plomberie SA" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByPlaceholder("Pierre")).toHaveValue("Léa");
  await expect(page.getByRole("checkbox")).toBeChecked();
});
