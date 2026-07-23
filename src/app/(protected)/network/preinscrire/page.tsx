import Link from "next/link";
import { SponsoredReferralForm } from "@/components/sponsored-referral-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function PreRegisterReferralPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const initialType = params.type === "professional" ? "professional" : "individual";
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/network" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-winelio-gray hover:text-winelio-orange">← Retour au réseau</Link>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-winelio-dark sm:text-2xl">Préinscrire un filleul</h1>
        <p className="mt-1 text-sm text-winelio-gray">Renseignez ses informations pour le placer immédiatement dans votre réseau.</p>
      </div>
      <Card className="!rounded-2xl"><CardContent className="p-5 sm:p-7"><SponsoredReferralForm initialType={initialType} /></CardContent></Card>
    </div>
  );
}
