import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import {
  buildPaymentLinkEmail,
  buildReminderEmail,
} from "../../src/lib/notify-commission-payment";
import { buildPaymentMethodResetEmail } from "../../src/lib/notify-payment-method-reset";

const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_example?prefilled_email=a%40b.fr&locale=fr";

for (const [name, html] of [
  ["initial", buildPaymentLinkEmail("Thierry", "Sacha CARLIER", 1, checkoutUrl)],
  ["reminder", buildReminderEmail("Thierry", "Sacha CARLIER", 1, checkoutUrl)],
] as const) {
  assert.match(html, /https:\/\/pub-e56c979d6a904d1ea7337ebd66a974a5\.r2\.dev\/winelio\/logo-color\.png/);
  assert.doesNotMatch(html, /data:image\//);
  assert.match(html, /Thierry/);
  assert.match(html, /Sacha CARLIER/);
  assert.match(html, /1,00&nbsp;€/);
  assert.match(html, /Payer ma commission d'intermédiation/);
  assert.match(html, /Ouvrir la page de paiement/);
  assert.equal((html.match(/https:\/\/checkout\.stripe\.com/g) ?? []).length, 2);
  assert.ok(html.length < 15_000, `${name}: HTML anormalement volumineux (${html.length} caractères)`);
}

const failedAutomaticPaymentHtml = buildPaymentLinkEmail(
  "Thierry",
  "Sacha CARLIER",
  1,
  checkoutUrl,
  true,
);
assert.match(failedAutomaticPaymentHtml, /n'a pas pu être débitée automatiquement/);
assert.match(failedAutomaticPaymentHtml, /choisir une autre carte/);
assert.equal((failedAutomaticPaymentHtml.match(/https:\/\/checkout\.stripe\.com/g) ?? []).length, 2);

const resetEmailHtml = buildPaymentMethodResetEmail("Thierry");
assert.match(resetEmailHtml, /Veuillez réenregistrer votre carte/);
assert.match(resetEmailHtml, /recommandation de test concernant Sacha Carlier a été annulée/);
assert.match(resetEmailHtml, /Aucun paiement n'a été prélevé/);
assert.match(resetEmailHtml, /10 % jusqu'à 25 000 € TTC/);
assert.match(resetEmailHtml, /5 % sur la totalité de l'affaire au-delà/);
assert.match(resetEmailHtml, /https:\/\/winelio\.app\/profile/);
assert.doesNotMatch(resetEmailHtml, /<div/i);

console.log("commission-payment-email: OK");

async function verifyBrowserRender() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
    const html = buildPaymentLinkEmail("Thierry", "Sacha CARLIER", 1, checkoutUrl);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await assert.doesNotReject(() => page.getByRole("heading", {
      name: "Commission d'intermédiation à régler",
    }).waitFor({ state: "visible" }));
    await assert.doesNotReject(() => page.getByText("1,00 €", { exact: true }).waitFor({ state: "visible" }));

    const paymentLinks = page.locator(`a[href="${checkoutUrl}"]`);
    assert.equal(await paymentLinks.count(), 2);
    await assert.doesNotReject(() => page.getByRole("link", {
      name: "Payer ma commission d'intermédiation →",
    }).waitFor({ state: "visible" }));
    await assert.doesNotReject(() => page.getByRole("link", {
      name: "Ouvrir la page de paiement",
    }).waitFor({ state: "visible" }));
  } finally {
    await browser.close();
  }

  console.log("commission-payment-email-render: OK");
}

verifyBrowserRender().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
