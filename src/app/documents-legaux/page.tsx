import Link from "next/link";
import type { Metadata } from "next";
import { AppBackground } from "@/components/AppBackground";
import { BetaBanner } from "@/components/BetaBanner";
import { DemoSeedBanner } from "@/components/DemoSeedBanner";
import { MobileHeader } from "@/components/mobile-header";
import { MobileNav } from "@/components/mobile-nav";
import { WinelioLogo } from "@/components/winelio-logo";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { legalDocuments } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "Documents légaux - Winelio",
  description: "Mentions légales, CGU, CGV, affiliation et politique de confidentialité Winelio.",
};

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default async function LegalDocumentsIndexPage() {
  const user = await getUser();
  const inApp = Boolean(user);
  const isSuperAdmin = user?.app_metadata?.role === "super_admin";

  let firstName: string | undefined;
  let avatar: string | null | undefined;

  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, avatar")
      .eq("id", user.id)
      .single();

    firstName = profile?.first_name ?? undefined;
    avatar = profile?.avatar ?? undefined;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
      {inApp && (
        <>
          <BetaBanner />
          {DEMO_MODE && <DemoSeedBanner />}
          <MobileHeader
            userEmail={user?.email ?? ""}
            firstName={firstName}
            avatar={avatar}
            isSuperAdmin={isSuperAdmin}
            demoBanner={DEMO_MODE}
            userId={user?.id ?? ""}
          />
          <MobileNav />
        </>
      )}
      <main
        className={`relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 ${
          inApp ? "pb-28 pt-24 lg:py-8" : "py-8"
        }`}
      >
        <Link
          href={inApp ? "/dashboard" : "/"}
          aria-label="Winelio — Accueil"
          className={inApp ? "hidden lg:inline-flex" : "inline-flex"}
        >
          <WinelioLogo variant="color" height={40} gradientId="wGrad-legal-index" />
        </Link>

        <section className={inApp ? "mt-2 lg:mt-10" : "mt-10"}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-winelio-orange">
            Winelio
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-winelio-dark">
            Documents légaux
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-winelio-gray">
            Retrouvez les textes applicables à l'utilisation de Winelio, aux professionnels,
            au programme d'affiliation et au traitement des données personnelles.
          </p>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {legalDocuments.map((document) => (
            <Link
              key={document.slug}
              href={`/documents-legaux/${document.slug}`}
              className="group rounded-2xl border border-black/5 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-winelio-orange/20 hover:shadow-md"
            >
              <h2 className="text-lg font-bold text-winelio-dark group-hover:text-winelio-orange">
                {document.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-winelio-gray">{document.description}</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-winelio-orange">
                Lire le document →
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
