import Link from "next/link";
import { AccountingDocumentsList } from "@/components/accounting-documents-list";

export default async function PayoutDocumentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <div className="space-y-6">
    <Link href="/wallet" className="text-sm text-winelio-orange">← Portefeuille</Link>
    <div><h1 className="text-2xl font-bold">Mes attestations de versement</h1>
      <p className="mt-2 text-sm text-muted-foreground">Chaque versement confirmé donne lieu à une attestation. Vos documents conservent les informations et les soldes enregistrés à leur émission.</p></div>
    <Link href="/wallet/history" className="inline-block text-sm text-winelio-orange">Consulter toutes mes commissions et mes retraits →</Link>
    <AccountingDocumentsList kind="payout" page={Number(page ?? 1)} basePath="/wallet/documents" />
  </div>;
}
