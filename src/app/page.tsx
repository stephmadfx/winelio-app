import { Suspense } from "react";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";
import { NetworkBackground } from "@/components/NetworkBackground";
import { BetaBanner } from "@/components/BetaBanner";
import { LandingHero } from "@/components/LandingHero";

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <BetaBanner />
      <AppBackground />
      <NetworkBackground />
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 pt-7">
        <div className="w-full max-w-xs text-center">
          <WinelioLogo variant="color" height={64} />
          <p className="mt-3 text-sm text-winelio-gray">
            Recommandez. Connectez.{" "}
            <span className="text-winelio-orange font-semibold">Gagnez.</span>
          </p>

          {/* Suspense requis car LandingHero utilise useSearchParams (lecture de ?ref) */}
          <Suspense fallback={null}>
            <LandingHero />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
