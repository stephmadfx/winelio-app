import { supabaseAdmin } from "@/lib/supabase/admin";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";
import { AffiliateSimulator } from "@/components/affiliate-simulator";

export const revalidate = 3600; // Cache page for 1 hour

export default async function PlanRemunerationPage() {
  // Fetch active/default plan from DB with service role to bypass RLS for anonymous view
  const { data: plan } = await supabaseAdmin
    .from("compensation_plans")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .single();

  return (
    <div className="relative min-h-screen lg:h-screen lg:overflow-hidden bg-winelio-light flex flex-col justify-between px-4 py-4 lg:py-6">
      <AppBackground />

      <div className="w-full max-w-6xl mx-auto z-10 flex-1 flex flex-col justify-center gap-2">
        {/* Centered Logo */}
        <div className="flex justify-center mb-2 shrink-0">
          <WinelioLogo variant="color" height={38} />
        </div>

        {/* Affiliate Simulator Card */}
        <div className="relative overflow-hidden flex-1 flex flex-col justify-center">
          <AffiliateSimulator plan={plan} />
        </div>

        {/* Footer info */}
        <p className="text-center text-[10px] sm:text-xs text-winelio-gray mt-2 shrink-0">
          © 2026 Winelio · Recommandez. Connectez. Gagnez.
        </p>
      </div>
    </div>
  );
}

