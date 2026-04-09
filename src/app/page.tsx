import Link from "next/link";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";

const highlights = [
  {
    title: "Recommandations utiles",
    description: "Des mises en relation concrètes avec un suivi clair du résultat.",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Réseau MLM à 5 niveaux",
    description: "Une mécanique de parrainage structurée, lisible et cohérente.",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    title: "Wallet EUR + Wins",
    description: "Des gains suivis dans un espace unique, sans perdre le fil.",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Expérience mobile",
    description: "Un rendu pensé pour être net et confortable sur petit écran.",
    icon: "M12 18h.01M8 4h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z",
  },
];

const steps = [
  "Recevez un code de connexion par email",
  "Accédez à votre espace Winelio",
  "Déposez vos recommandations et suivez vos gains",
];

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
          <section className="flex flex-col justify-between rounded-[30px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(45,52,54,0.12)] backdrop-blur-xl sm:p-8 lg:p-10">
            <div>
              <div className="inline-flex w-fit items-center rounded-full bg-winelio-orange/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-winelio-orange">
                Plateforme de recommandations
              </div>

              <div className="mt-5 flex items-center">
                <WinelioLogo variant="color" height={44} />
              </div>

              <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-winelio-dark sm:text-5xl lg:text-6xl">
                Recommandez des pros, structurez votre réseau, suivez vos gains.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-winelio-gray sm:text-lg">
                Winelio réunit la recommandation professionnelle, un système de parrainage à 5 niveaux
                et un wallet clair pour suivre les commissions EUR et Wins.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105"
                >
                  Se connecter
                </Link>
                <Link
                  href="/auth/login?mode=register"
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-winelio-dark transition hover:border-winelio-orange/30 hover:text-winelio-orange"
                >
                  Créer un compte
                </Link>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { value: "5", label: "niveaux de parrainage" },
                { value: "8", label: "étapes de suivi" },
                { value: "2", label: "monnaies suivies" },
              ].map((item) => (
                <article key={item.label} className="rounded-2xl border border-gray-100 bg-winelio-light/80 p-4">
                  <div className="text-2xl font-semibold text-winelio-dark">{item.value}</div>
                  <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-winelio-gray">
                    {item.label}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="flex flex-col rounded-[30px] bg-white p-5 shadow-[0_24px_80px_rgba(45,52,54,0.12)] ring-1 ring-black/5 sm:p-6 lg:p-8">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-winelio-orange" />

            <div className="mt-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-winelio-gray">
                  Expérience produit
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-winelio-dark">
                  Une interface qui ressemble au dashboard
                </h2>
                <p className="mt-2 text-sm leading-6 text-winelio-gray">
                  Même structure visuelle que l’espace connecté pour éviter la rupture de style.
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-orange/10 text-winelio-orange">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h13" />
                </svg>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {highlights.map((item) => (
                <article key={item.title} className="rounded-2xl border border-gray-100 bg-winelio-light/80 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-white shadow-sm shadow-winelio-orange/20">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-winelio-dark">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-winelio-gray">{item.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-winelio-orange/10 bg-[linear-gradient(90deg,rgba(255,107,53,0.08),rgba(247,147,30,0.08))] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-winelio-gray">Comment ça marche</p>
              <div className="mt-3 space-y-3">
                {steps.map((step, index) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-winelio-orange shadow-sm">
                      {index + 1}
                    </div>
                    <p className="pt-1 text-sm leading-6 text-winelio-dark">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-winelio-light/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-winelio-dark">L’accès est réservé aux membres invités</p>
                <p className="mt-1 text-sm text-winelio-gray">Le code parrain reste obligatoire pour créer un compte.</p>
              </div>
              <Link
                href="/auth/login?mode=register"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-winelio-orange ring-1 ring-winelio-orange/15 transition hover:ring-winelio-orange/30"
              >
                J’ai un code
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 pb-6 text-center text-sm text-winelio-gray">
        © {new Date().getFullYear()} Winelio. Tous droits réservés.
      </footer>
    </div>
  );
}
