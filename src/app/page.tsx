import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { NetworkBackground } from "@/components/NetworkBackground";
import { BetaBanner } from "@/components/BetaBanner";
import { LandingHero } from "@/components/LandingHero";
import { getUser } from "@/lib/supabase/get-user";
import { WinelioLogoWithTagline } from "@/components/winelio-logo";
import { PromoVideo } from "@/components/PromoVideo";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <BetaBanner />
      <AppBackground />
      <NetworkBackground />
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 pt-[calc(var(--beta-banner-h,28px)+12px)]">
        <div className="w-full max-w-sm text-center">
          <WinelioLogoWithTagline variant="color" height={64} />

          {/* Vidéo promo */}
          <div className="mt-6">
            <PromoVideo />
          </div>

          {/* CTAs */}
          <div className="mt-6 flex flex-col gap-3">
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

          <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-winelio-gray">
            <Link href="/documents-legaux/mentions-legales" className="hover:text-winelio-orange">
              Mentions légales
            </Link>
            <Link href="/documents-legaux/conditions-generales-utilisation" className="hover:text-winelio-orange">
              CGU
            </Link>
            <Link href="/documents-legaux/politique-confidentialite" className="hover:text-winelio-orange">
              Confidentialité
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
