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
    <div className="relative min-h-screen bg-winelio-light overflow-hidden flex flex-col justify-center px-4 py-12">
      <AppBackground />

      <div className="w-full max-w-4xl mx-auto z-10">
        {/* Centered Logo */}
        <div className="flex justify-center mb-6">
          <WinelioLogo variant="color" height={44} />
        </div>

        {/* Affiliate Simulator Card */}
        <div className="relative overflow-hidden">
          <AffiliateSimulator plan={plan} />
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-winelio-gray mt-6">
          © 2026 Winelio · Recommandez. Connectez. Gagnez.
        </p>
      </div>
    </div>
  );
}

