import { AccountingDocumentsList } from "@/components/accounting-documents-list";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "super_admin") redirect("/dashboard");
  const { data: issuer, error } = await supabase.from("accounting_issuers").select("*").eq("active", true).single();
  const { data: toReview, error: reviewError, count: reviewCount } = await supabaseAdmin.from("accounting_payments_to_review")
    .select("id,recommendation_id,amount,paid_at", { count: "exact" }).order("paid_at").limit(20);
  const year = Number(new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "Europe/Paris" }).format(new Date()));
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Comptabilité</h1><p className="mt-2 text-sm text-muted-foreground">Factures, attestations et suivi des versements dès le premier euro.</p></div>
    {error ? <p role="alert">Impossible de charger l’émetteur comptable.</p> : <section className="rounded-2xl border border-border bg-card p-5 text-sm">
      <h2 className="mb-2 font-semibold">Émetteur actuel : {issuer.legal_name}</h2>
      <p>{issuer.operator_description}<br />{issuer.legal_form}{issuer.share_capital != null && ` au capital de ${new Intl.NumberFormat("fr-FR", { style:"currency",currency:"EUR" }).format(issuer.share_capital)}`}<br />{issuer.address}, {issuer.postal_code} {issuer.city}<br />
        RCS {issuer.rcs} · SIREN {issuer.siren} · SIRET {issuer.siret}<br />NAF {issuer.naf_code} · TVA {issuer.vat_number} ({issuer.vat_rate} %)</p>
      <p className="mt-3 text-muted-foreground">Les documents déjà émis sont figés. Un changement de société s’applique aux nouvelles émissions.</p>
    </section>}
    <section className="rounded-2xl border border-border bg-card p-5 text-sm">
      <h2 className="font-semibold">Suivi annuel des versements / préparation DAS2</h2>
      <p className="my-2 text-muted-foreground">Export de tous les versements attestés, avec montants bruts, frais et nets. Le seuil déclaratif est un dépassement de 2 400 € par an et par bénéficiaire. Cet export prépare le contrôle comptable ; il n’effectue aucune déclaration fiscale.</p>
      <form action="/api/accounting/payouts" method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">Année<input name="year" type="number" min="2026" max="9998" defaultValue={year} required className="rounded-lg border border-border bg-background px-3 py-2" /></label>
        <button type="submit" className="rounded-lg bg-winelio-orange px-4 py-2 font-medium text-white">Télécharger le suivi CSV</button>
      </form>
    </section>
    {reviewError ? <p role="alert">Le contrôle des paiements sans facture est temporairement indisponible.</p> : (reviewCount ?? 0) > 0 && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
      <h2 className="font-semibold">{reviewCount} paiement(s) sans facture Winelio à vérifier</h2>
      <p className="my-2">Contrôlez les coordonnées de facturation et les éventuelles pièces déjà émises avant une régularisation. Les paiements antérieurs ne sont pas refacturés automatiquement.</p>
      <ul className="space-y-1">{toReview?.map((payment) => <li key={payment.id}><Link href={`/gestion-reseau/recommandations/${payment.recommendation_id}`} className="underline">Paiement du {new Date(payment.paid_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} · {new Intl.NumberFormat("fr-FR", { style:"currency",currency:"EUR" }).format(payment.amount)} TTC</Link></li>)}</ul>
    </section>}
    <AccountingDocumentsList page={Number(page ?? 1)} basePath="/gestion-reseau/comptabilite" admin />
  </div>;
}
