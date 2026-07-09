import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { NetworkBackground } from "@/components/NetworkBackground";
import { LandingHero } from "@/components/LandingHero";
import { getUser } from "@/lib/supabase/get-user";
import { WinelioLogoWithTagline } from "@/components/winelio-logo";
import { PromoVideo } from "@/components/PromoVideo";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
      <NetworkBackground />
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 pt-12">
        <div className="w-full max-w-sm text-center">
          <WinelioLogoWithTagline variant="color" height={64} />

          <Suspense fallback={<div className="h-48" />}>
            <LandingHero />
          </Suspense>

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
