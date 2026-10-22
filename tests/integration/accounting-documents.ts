import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { accountingDocumentHtml, type AccountingDocument } from "../../src/lib/accounting-document-template";
import { htmlToPdf } from "../../src/lib/html-to-pdf";
import { calculateCommissions, type CompensationPlan } from "../../src/lib/commission";

async function main() {
  const document: AccountingDocument = {
    id: "00000000-0000-0000-0000-000000000100", kind: "invoice", number: "TEST-FAC-2026-0001",
    issued_at: "2026-10-21T10:00:00Z", event_at: "2026-10-21T09:00:00Z",
    owner_id: "00000000-0000-0000-0000-000000000101", source_id: "00000000-0000-0000-0000-000000000102",
    is_demo: true, template_version: 1,
    issuer: { legal_name: "EXASUD", address: "133 rue des Thons", postal_code: "11100", city: "NARBONNE",
      rcs: "NARBONNE", siren: "422432864", siret: "42243286400029", naf_code: "7022Z", vat_number: "FR06422432864",
      operator_description: "Société exploitant provisoirement la plateforme WINELIO", legal_form: "SAS", share_capital: 7622.45 },
    recipient: { name: "Entreprise de démonstration", address: "1 rue de Démonstration", postal_code: "75001", city: "Paris", country: "FR", siret: null, vat_number: null, is_professional: true },
    amounts: { total_ttc: 100, total_ht: 83.33, vat: 16.67, vat_rate: 20 },
    details: { payment_method: "Carte bancaire (Stripe)", description: "Commission d’intermédiation WINELIO", deal_amount_ttc: 1000, commission_rate: 10 },
  };
  const html = await accountingDocumentHtml(document);
  assert.match(html, /83,33/);
  assert.match(html, /16,67/);
  assert.match(html, /100,00/);
  assert.match(html, /FR06422432864/);
  const escaped = await accountingDocumentHtml({ ...document, recipient: { ...document.recipient, name: '<img src="file:///etc/passwd">' } });
  assert.ok(escaped.includes("&lt;img src=&quot;file:///etc/passwd&quot;&gt;"));
  await assert.rejects(() => accountingDocumentHtml({ ...document, template_version: 2 }), /Version/);
  await assert.rejects(() => accountingDocumentHtml({ ...document, number: "" }), /non émis/);
  const plan: CompensationPlan = { id: "test", commission_rate: 10, referrer_percentage: 60,
    level_1_percentage: 3, level_2_percentage: 3, level_3_percentage: 3, level_4_percentage: 3, level_5_percentage: 3,
    platform_percentage: 24, affiliation_percentage: 1, cashback_wins_percentage: 0 };
  const commissions = calculateCommissions(1000, plan);
  assert.equal(commissions.referrer_commission, 60, "Commission conservée sur le TTC");
  assert.equal(commissions.platform_commission, 24);
  assert.ok(commissions.level_commissions.every((level) => level.amount === 3));

  const payout: AccountingDocument = { ...document, kind: "payout", number: "TEST-ATT-2026-0001",
    recipient: { ...document.recipient, name: "Affilié de démonstration", is_professional: false },
    amounts: { withdrawn: 25, fees: 0.25, paid: 24.75 },
    details: { payment_method: "Virement bancaire", balance_before: 300, balance_after: 275, balance_date: document.event_at,
      tax_notice: "Les sommes perçues doivent être déclarées selon les modalités fiscales applicables à votre situation. Pour les affiliés particuliers concernés, elles relèvent des BNC non professionnels, à déclarer notamment au moyen du formulaire 2042 C PRO. La société émettrice déclare les commissions versées selon les obligations applicables de l’article 240 du CGI (DAS2).",
      status_notice: "En cas d’activité habituelle ou de versements récurrents ou significatifs, il vous appartient d’adopter un statut professionnel déclaré. Informez la société de tout changement de statut fiscal, social ou professionnel avant tout nouveau versement." },
  };
  const payoutHtml = await accountingDocumentHtml(payout);
  assert.match(payoutHtml, /24,75/);
  assert.match(payoutHtml, /275,00/);
  assert.doesNotMatch(payoutHtml, /24,75[^<]*TTC/);
  await mkdir("output/pdf/accounting-preview", { recursive: true });
  for (const [name, content] of [["facture-exasud", html], ["attestation-exasud", payoutHtml]]) {
    const pdf = await htmlToPdf(content);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    await writeFile(`output/pdf/accounting-preview/${name}.pdf`, pdf);
  }
  console.log("accounting-documents: TTC, arrondis, échappement, modèles et PDF OK");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
