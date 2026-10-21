import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type AccountingDocument = {
  id: string;
  kind: "invoice" | "payout";
  number: string;
  issued_at: string;
  event_at: string;
  owner_id: string;
  source_id: string;
  is_demo: boolean;
  template_version: number;
  issuer: { legal_name: string; address: string; postal_code: string; city: string; rcs: string;
    siren: string; siret: string; naf_code: string; vat_number: string; operator_description: string;
    legal_form?: string; share_capital?: number };
  recipient: { name: string; address: string | null; postal_code: string | null; city: string | null;
    country: string; siret: string | null; vat_number: string | null; is_professional: boolean };
  amounts: { total_ttc?: number; total_ht?: number; vat?: number; vat_rate?: number;
    withdrawn?: number; fees?: number; paid?: number };
  details: { payment_method: string; description?: string; deal_amount_ttc?: number; commission_rate?: number;
    balance_before?: number | null; balance_after?: number | null; balance_date?: string;
    tax_notice?: string; status_notice?: string };
};

export const accountingMoney = (value: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency", currency: "EUR",
}).format(value);
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

// Version figée : toute évolution des pièces futures doit utiliser une nouvelle version.
export async function accountingDocumentHtml(document: AccountingDocument): Promise<string> {
  if (document.template_version !== 1) throw new Error("Version de document inconnue");
  if (!document.number || !document.issued_at) throw new Error("Document non émis");
  const { issuer, recipient, amounts, details } = document;
  const invoice = document.kind === "invoice";
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const logo = (await readFile(join(process.cwd(), "public/logo-color.png"))).toString("base64");
  const row = (label: string, value: string, total = false) => `<tr${total ? ' class="total"' : ""}><td>${escape(label)}</td><td>${escape(value)}</td></tr>`;
  const money = (value: number | undefined) => accountingMoney(value!);
  const content = invoice ? `
    <h2>${escape(details.description)}</h2>
    <p>Référence du paiement : ${escape(document.source_id)}<br> Paiement reçu le ${date(document.event_at)} · ${escape(details.payment_method)}</p>
    ${details.deal_amount_ttc != null ? `<p class="muted small">Affaire : ${money(details.deal_amount_ttc)} TTC${details.commission_rate != null ? ` · Taux de commission : ${escape(details.commission_rate)} %` : ""}. La répartition des commissions est calculée sur le TTC.</p>` : ""}
    <table class="amounts"><tbody>
      ${row("Commission hors taxes", money(amounts.total_ht))}
      ${row(`TVA ${amounts.vat_rate} %`, money(amounts.vat))}
      ${row("Total TTC acquitté", money(amounts.total_ttc), true)}
    </tbody></table>
    <p class="small">Paiement comptant, acquitté le ${date(document.event_at)}. Escompte pour paiement anticipé : néant. Pénalités de retard : trois fois le taux d’intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 € en cas de retard de paiement professionnel.</p>
  ` : `
    <p>Référence du retrait : ${escape(document.source_id)}<br>Date du versement : ${date(document.event_at)}<br>Mode de règlement : ${escape(details.payment_method)}</p>
    <table class="amounts"><tbody>
      ${row("Solde avant demande de retrait", details.balance_before == null ? "Non disponible (retrait antérieur)" : money(details.balance_before))}
      ${row("Montant débité de la cagnotte", money(amounts.withdrawn))}
      ${row("Frais de retrait", money(amounts.fees))}
      ${row("Montant versé", money(amounts.paid), true)}
      ${row("Solde après demande de retrait", details.balance_after == null ? "Non disponible (retrait antérieur)" : money(details.balance_after))}
    </tbody></table>
    ${details.balance_date ? `<p class="small muted">Situation de la cagnotte figée à la demande du ${date(details.balance_date)}. Les mouvements ultérieurs restent consultables dans votre espace personnel.</p>` : ""}
    <p class="small">${recipient.is_professional ? "Cette attestation constate un versement. Elle ne remplace pas les justificatifs fiscaux requis par votre statut professionnel." : "Attestation de versement à un particulier non assujetti : aucune TVA facturée sur ce versement."}</p>
    <div class="notice small"><p>${escape(details.tax_notice)}</p><p>${escape(details.status_notice)}</p></div>
    <p class="small">Le relevé exhaustif de vos commissions et l’historique des mouvements et retraits sont consultables dans votre espace personnel WINELIO.</p>
  `;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escape(document.number)}</title>
    <style>
      @page { size: A4; margin: 16mm 18mm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #636E72; } }
      body { font-family: DejaVu Sans, sans-serif; font-size: 8.5pt; color: #2D3436; line-height: 1.45; }
      header { border-top: 4px solid #FF6B35; padding-top: 18px; margin-bottom: 18px; }
      header img { width: 160px; height: auto; display: block; }
      h1 { font-size: 20pt; margin: 16px 0 3px; } h2 { font-size: 11pt; margin: 0 0 8px; }
      p { margin: 8px 0; } .muted { color: #636E72; } .small { font-size: 8pt; }
      .parties { width: 100%; margin: 16px 0; } .parties td { width: 50%; vertical-align: top; padding: 0 18px 0 0; }
      .amounts { width: 100%; border-collapse: collapse; margin: 16px 0; } .amounts td { padding: 8px 12px; border-bottom: 1px solid #E8EBED; }
      .amounts td:last-child { text-align: right; white-space: nowrap; } .total { background: #FFF5F0; font-weight: bold; }
      .notice { border-left: 3px solid #FF6B35; background: #FFF5F0; padding: 10px 16px; margin: 12px 0; }
      footer { border-top: 1px solid #E8EBED; margin-top: 14px; padding-top: 10px; color: #636E72; font-size: 7.5pt; }
      tr, footer { break-inside: avoid; } .demo { color: #C2410C; font-weight: bold; }
    </style></head><body>
    <header><img src="data:image/png;base64,${logo}" width="160" height="44" alt="Winelio">
      <h1>${invoice ? "Facture de commission" : "Attestation de versement"}</h1>
      <p class="muted">N° ${escape(document.number)} · Émise le ${date(document.issued_at)}</p>
      ${document.is_demo ? '<p class="demo">DÉMONSTRATION - Sans valeur comptable</p>' : ""}
    </header>
    <table class="parties"><tbody><tr><td><h2>${escape(issuer.legal_name)}</h2>
      <p>${escape(issuer.operator_description)}<br>${escape(issuer.address)}<br>${escape(issuer.postal_code)} ${escape(issuer.city)}</p>
      <p class="small">${issuer.legal_form ? `${escape(issuer.legal_form)}${issuer.share_capital != null ? ` au capital de ${money(issuer.share_capital)}` : ""}<br>` : ""}RCS ${escape(issuer.rcs)} · SIREN ${escape(issuer.siren)}<br>SIRET ${escape(issuer.siret)} · NAF ${escape(issuer.naf_code)}<br>TVA : ${escape(issuer.vat_number)}</p>
    </td><td><h2>${invoice ? "Professionnel facturé" : "Affilié bénéficiaire"}</h2>
      <p><strong>${escape(recipient.name)}</strong><br>${escape(recipient.address || "Adresse non renseignée")}<br>${escape(recipient.postal_code)} ${escape(recipient.city)}<br>${escape(recipient.country)}</p>
      ${recipient.siret ? `<p class="small">SIRET : ${escape(recipient.siret)}<br>${recipient.vat_number ? `TVA : ${escape(recipient.vat_number)}` : ""}</p>` : ""}
    </td></tr></tbody></table>
    ${content}
    <footer>Document généré électroniquement par WINELIO, exploitée par ${escape(issuer.legal_name)}, et conservé dans votre espace personnel. Les informations sont celles enregistrées à l’émission.</footer>
    </body></html>`;
}
