import Link from "next/link";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";
import { NetworkBackground } from "@/components/NetworkBackground";
import { BetaBanner } from "@/components/BetaBanner";
import { PromoVideo } from "@/components/PromoVideo";

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
        </div>
      </main>
    </div>
  );
}
