import Link from "next/link";
import { AccountingDocumentsList } from "@/components/accounting-documents-list";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <div className="space-y-6">
    <Link href="/companies" className="text-sm text-winelio-orange">← Mes entreprises</Link>
    <div><h1 className="text-2xl font-bold">Mes factures de commission</h1>
      <p className="mt-2 text-sm text-muted-foreground">Vos commissions sont calculées sur le TTC, TVA incluse. Chaque facture acquittée est archivée avec les informations de son émetteur et de votre entreprise au moment de l’émission.</p></div>
    <AccountingDocumentsList kind="invoice" page={Number(page ?? 1)} basePath="/companies/invoices" />
  </div>;
}
