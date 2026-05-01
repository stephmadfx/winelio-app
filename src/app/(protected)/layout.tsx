import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { MobileHeader } from "@/components/mobile-header";
import { AppBackground } from "@/components/AppBackground";
import { ProfileIncompleteModal } from "@/components/profile-incomplete-modal";
import { BugReportButton } from "@/components/bug-report-button";
import { DemoSeedBanner } from "@/components/DemoSeedBanner";
import { BetaBanner } from "@/components/BetaBanner";
import { isAtLeastAge } from "@/lib/age";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

type ProfileCompletionRecord = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;
  birth_date: string | null;
  terms_accepted: boolean | null;
};

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const supabase = await createClient();

  const isSuperAdmin = user.app_metadata?.role === "super_admin";

  // Tous les rapports de bug de l'utilisateur (pour l'historique + détection non-lus)
  const { data: allBugReports } = await supabase
    .from("bug_reports")
    .select("id, message, page_url, status, admin_reply, reply_images, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: profileData } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, postal_code, city, address, birth_date, terms_accepted, avatar")
    .eq("id", user.id)
    .single();
  const profile = profileData as (ProfileCompletionRecord & { avatar?: string | null }) | null;

  const isProfileComplete = !!(
    profile?.first_name?.trim() &&
    profile?.last_name?.trim() &&
    profile?.phone?.trim() &&
    profile?.postal_code?.trim() &&
    profile?.city?.trim() &&
    profile?.address?.trim() &&
    profile?.terms_accepted
  );
  const ageVerified = profile?.birth_date ? isAtLeastAge(profile.birth_date) : null;

  if (ageVerified === false) {
    return (
      <div
        className="relative min-h-dvh bg-winelio-light dark:bg-slate-900 transition-colors duration-200"
        style={DEMO_MODE ? { paddingTop: "var(--beta-banner-h, 0px)" } : undefined}
      >
        <AppBackground />
        <BetaBanner />
        {DEMO_MODE && <DemoSeedBanner />}

        <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.14 14.09A2 2 0 0 0 3.88 21h16.24a2 2 0 0 0 1.73-3.05L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              </div>
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-winelio-dark">Accès réservé aux majeurs</h1>
                  <p className="mt-2 text-sm leading-6 text-winelio-gray">
                    Winelio permet de générer des revenus. Pour cette raison, le compte ne peut pas être utilisé si la date de naissance indique moins de 18 ans.
                  </p>
                </div>
                <p className="text-sm leading-6 text-winelio-gray">
                  Si votre date de naissance est erronée, corrigez-la depuis votre profil. Sinon, contactez le support pour faire vérifier votre dossier.
                </p>
                <a
                  href="/profile"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  Corriger mon profil
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-winelio-light dark:bg-slate-900 transition-colors duration-200">
      <AppBackground />
      <BetaBanner />
      {DEMO_MODE && <DemoSeedBanner />}

      {/* Modal profil incomplet */}
      {!isProfileComplete && <ProfileIncompleteModal />}

      {/* Desktop: sidebar */}
      <div className="hidden lg:block">
        <Sidebar userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} demoBanner={DEMO_MODE} />
      </div>

      {/* Mobile: header + bottom nav */}
      <MobileHeader
        userEmail={user.email ?? ""}
        firstName={profile?.first_name ?? undefined}
        avatar={profile?.avatar ?? undefined}
        isSuperAdmin={isSuperAdmin}
        demoBanner={DEMO_MODE}
        userId={user.id}
        allBugReports={allBugReports ?? []}
      />
      <MobileNav />

      {/* Bug report button — mobile: dans le header / desktop: floating */}
      <BugReportButton userId={user.id} allBugReports={allBugReports ?? []} />

      {/* Main content: adaptatif mobile/desktop. Le padding-top inclut la hauteur réelle du bandeau démo (var --beta-banner-h, 0 si absent) + la hauteur du header mobile (4rem). */}
      <main
        className="relative z-10 pb-24 px-4 lg:pb-0 lg:ml-64 lg:px-8 lg:py-8 pt-[calc(var(--beta-banner-h,0px)+4rem)] lg:pt-[var(--beta-banner-h,0px)]"
      >
        {children}
      </main>
    </div>
  );
}
