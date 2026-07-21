import type { Metadata } from "next";
import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { WinelioLogo } from "@/components/winelio-logo";

export const metadata: Metadata = {
  title: "Suppression du compte - Winelio",
  description: "Procédure de suppression d'un compte Winelio et des données associées.",
};

export default function AccountDeletionPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-14">
        <Link href="/" aria-label="Winelio — Accueil" className="inline-flex">
          <WinelioLogo variant="color" height={40} gradientId="wGrad-account-deletion" />
        </Link>

        <section className="mt-10 rounded-3xl border border-black/5 bg-white/95 p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-winelio-orange">
            Données personnelles
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-winelio-dark sm:text-4xl">
            Supprimer votre compte Winelio
          </h1>
          <p className="mt-4 text-sm leading-7 text-winelio-gray">
            Vous pouvez demander à tout moment la suppression définitive de votre compte et des
            données personnelles qui lui sont associées.
          </p>

          <div className="mt-8 space-y-6 text-sm leading-7 text-winelio-gray">
            <section>
              <h2 className="text-lg font-bold text-winelio-dark">Depuis l’application</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5">
                <li>Connectez-vous à Winelio.</li>
                <li>Ouvrez « Paramètres ».</li>
                <li>Sélectionnez « Supprimer mon compte ».</li>
                <li>Lisez les conséquences, puis confirmez en saisissant « SUPPRIMER ».</li>
              </ol>
              <p className="mt-3">La suppression est déclenchée immédiatement et est irréversible.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-winelio-dark">Si vous ne pouvez plus vous connecter</h2>
              <p className="mt-3">
                Écrivez à{" "}
                <a className="font-semibold text-winelio-orange underline" href="mailto:contact@aide-multimedia.fr?subject=Suppression%20de%20mon%20compte%20Winelio">
                  contact@aide-multimedia.fr
                </a>{" "}
                depuis l’adresse email liée au compte, avec l’objet « Suppression de mon compte
                Winelio ». Une vérification d’identité pourra être demandée avant traitement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-winelio-dark">Données supprimées</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>compte de connexion et profil ;</li>
                <li>coordonnées et contacts personnels ;</li>
                <li>jetons d’appareil et données techniques rattachées au compte ;</li>
                <li>résumé du portefeuille et demandes de retrait encore en attente.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-winelio-dark">Données pouvant être conservées</h2>
              <p className="mt-3">
                Les éléments comptables, transactions, commissions versées, factures, retraits
                traités et journaux nécessaires au respect de nos obligations légales, fiscales,
                de lutte contre la fraude ou à la défense de droits peuvent être conservés pendant
                la durée imposée par la réglementation, puis supprimés ou anonymisés.
              </p>
              <p className="mt-3">
                Le code parrain supprimé reste uniquement réservé afin d’éviter sa réattribution à
                une autre personne. Les liens de réseau des filleuls sont réorganisés sans conserver
                le profil supprimé.
              </p>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
