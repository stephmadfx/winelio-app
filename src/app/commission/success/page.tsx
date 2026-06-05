import Link from "next/link";
import { WinelioLogo } from "@/components/winelio-logo";

type CommissionSuccessPageProps = {
  searchParams: Promise<{
    session_id?: string;
    status?: string;
  }>;
};

export default async function CommissionSuccessPage({
  searchParams,
}: CommissionSuccessPageProps) {
  const params = await searchParams;
  const isCancelled = params.status === "cancelled";

  return (
    <main className="min-h-screen bg-[#F8F9FA] px-6 py-10 text-winelio-dark">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl flex-col items-center justify-center text-center">
        <WinelioLogo height={48} />

        <section className="mt-10 w-full rounded-[8px] border border-[#E7EAED] bg-white px-6 py-8 shadow-sm sm:px-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#FFF5F0] text-2xl font-extrabold text-winelio-orange">
            {isCancelled ? "!" : "€"}
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-normal sm:text-3xl">
            {isCancelled
              ? "Paiement annulé"
              : "Paiement de commission confirmé"}
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-winelio-gray sm:text-base">
            {isCancelled
              ? "Aucun paiement n'a été enregistré. Vous pouvez reprendre le règlement depuis le lien reçu par email."
              : "Merci, le paiement a bien été transmis à Winelio. La cagnotte du recommandeur sera créditée dès validation automatique Stripe."}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-[8px] bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
            >
              Retour au tableau de bord
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-[8px] border border-[#DDE2E6] px-5 text-sm font-semibold text-winelio-dark transition hover:bg-[#F0F2F4]"
            >
              Se connecter
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
