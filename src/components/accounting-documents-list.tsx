import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AccountingDocument } from "@/lib/accounting-document-template";

const PAGE_SIZE = 20;
const money = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

export async function AccountingDocumentsList({ kind, page = 1, basePath, admin = false }: {
  kind?: "invoice" | "payout"; page?: number; basePath: string; admin?: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const currentPage = Number.isSafeInteger(page) && page > 0 && page <= 100_000 ? page : 1;
  let query = supabase.from("accounting_documents")
    .select("id,kind,number,issued_at,event_at,amounts,recipient,issuer,is_demo", { count: "exact" })
    .order("issued_at", { ascending: false }).order("id");
  if (!admin) query = query.eq("owner_id", user.id);
  else query = query.eq("is_demo", false);
  if (kind) query = query.eq("kind", kind);
  const { data, error, count } = await query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
  if (error) return <p role="alert" className="rounded-xl border border-red-200 p-4 text-red-700">Les documents sont temporairement indisponibles. Rechargez la page pour réessayer.</p>;
  const documents = (data ?? []) as Pick<AccountingDocument, "id" | "kind" | "number" | "issued_at" | "event_at" | "amounts" | "recipient" | "issuer" | "is_demo">[];
  return <div className="space-y-4">
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Documents comptables archivés</caption>
        <thead className="border-b border-border text-muted-foreground"><tr>
          <th className="p-4">Document</th><th className="hidden p-4 sm:table-cell">Émission</th>
          {admin && <th className="p-4">Bénéficiaire / professionnel</th>}
          <th className="p-4 text-right">Montant</th><th className="p-4"><span className="sr-only">Téléchargement</span></th>
        </tr></thead><tbody className="divide-y divide-border">
          {documents.map((document) => <tr key={document.id}>
            <td className="p-4"><p className="font-semibold">{document.number}</p>
              <p className="text-xs text-muted-foreground">{document.kind === "invoice" ? "Facture" : "Attestation de versement"} · {document.issuer.legal_name}</p>
              <p className="text-xs text-muted-foreground sm:hidden">{new Date(document.issued_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p>
              {document.is_demo && <p className="text-xs text-amber-700">Démonstration, sans valeur comptable</p>}
              {(!document.recipient.address || !document.recipient.postal_code || !document.recipient.city) && <p className="text-xs text-amber-700">Coordonnées incomplètes à l’émission</p>}
            </td>
            <td className="hidden p-4 whitespace-nowrap sm:table-cell">{new Date(document.issued_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</td>
            {admin && <td className="p-4">{document.recipient.name}</td>}
            <td className="p-4 text-right whitespace-nowrap">{money(document.kind === "invoice" ? document.amounts.total_ttc! : document.amounts.paid!)}{document.kind === "invoice" && " TTC"}</td>
            <td className="p-4 text-right"><a href={`/api/accounting/documents/${document.id}`} className="font-medium text-winelio-orange hover:underline" aria-label={`Télécharger ${document.number} en PDF`}>PDF</a></td>
          </tr>)}
          {documents.length === 0 && <tr><td colSpan={admin ? 5 : 4} className="p-8 text-center text-muted-foreground">{kind === "payout" ? "Votre attestation sera disponible après confirmation du versement." : kind === "invoice" ? "Vos factures apparaîtront ici après confirmation du paiement de vos commissions." : "Aucun document comptable émis."}</td></tr>}
        </tbody></table>
    </div>
    <nav aria-label="Pagination des documents" className="flex items-center justify-between text-sm">
      {currentPage > 1 ? <Link href={`${basePath}?page=${currentPage - 1}`} className="text-winelio-orange">Précédent</Link> : <span />}
      <span className="text-muted-foreground">Page {currentPage} · {count ?? 0} document(s)</span>
      {currentPage * PAGE_SIZE < (count ?? 0) ? <Link href={`${basePath}?page=${currentPage + 1}`} className="text-winelio-orange">Suivant</Link> : <span />}
    </nav>
  </div>;
}
