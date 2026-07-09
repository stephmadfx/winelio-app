import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { MobileHeader } from "@/components/mobile-header";
import { DesktopHeader } from "@/components/desktop-header";
import { AppBackground } from "@/components/AppBackground";
import { BugReportButton } from "@/components/bug-report-button";
import { DemoSeedBanner } from "@/components/DemoSeedBanner";
import { isAtLeastAge } from "@/lib/age";
import { ProfessionalPromptModal } from "@/components/professional-prompt-modal";
import { ProfileGraceTimer } from "@/components/ProfileGraceTimer";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const PRO_PROMPT_DELAY_ROLLOUT_AT = new Date("2026-06-03T20:40:00.000Z");
const PROFILE_SELECT = "first_name, last_name, phone, postal_code, city, address, birth_date, terms_accepted, avatar, is_professional, pro_engagement_accepted";

type ProfileCompletionRecord = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;
  birth_date: string | null;
  terms_accepted: boolean | null;
  avatar: string | null;
  is_professional: boolean | null;
  pro_engagement_accepted: boolean | null;
};

function hasHeaderIdentity(profile: ProfileCompletionRecord | null) {
  return !!(profile?.first_name?.trim() || profile?.avatar?.trim());
}

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
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();
  let profile = profileData as ProfileCompletionRecord | null;

  if (!hasHeaderIdentity(profile)) {
    const { data: adminProfileData } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", user.id)
      .maybeSingle();

    if (adminProfileData) {
      profile = adminProfileData as ProfileCompletionRecord;
    }
  }

  const { data: proPromptData, error: proPromptError } = await supabase
    .from("profiles")
    .select("pro_prompt_dismissed_at")
    .eq("id", user.id)
    .maybeSingle();
  const proPromptDismissedAt = proPromptError
    ? new Date().toISOString()
    : (proPromptData as { pro_prompt_dismissed_at: string | null } | null)
      ?.pro_prompt_dismissed_at ?? null;

  const isProfileComplete = !!(
    profile?.first_name?.trim() &&
    profile?.last_name?.trim() &&
    profile?.phone?.trim() &&
    profile?.postal_code?.trim() &&
    profile?.city?.trim() &&
    profile?.address?.trim() &&
    profile?.birth_date?.trim() &&
    profile?.terms_accepted
  );

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  const emailConfirmedAt = user.email_confirmed_at ? new Date(user.email_confirmed_at) : null;
  const now = new Date();
  const isGracePeriod = emailConfirmedAt && (now.getTime() - emailConfirmedAt.getTime() < 60_000);

  if (pathname && !isProfileComplete && !isGracePeriod && !pathname.startsWith("/profile")) {
    redirect("/profile");
  }
  const ageVerified = profile?.birth_date ? isAtLeastAge(profile.birth_date) : null;
  const accountCreatedAt = user.created_at ? new Date(user.created_at) : null;
  const isNewAccountForProPrompt = !accountCreatedAt || accountCreatedAt >= PRO_PROMPT_DELAY_ROLLOUT_AT;
  const professionalPromptDelayMs = isNewAccountForProPrompt ? 30_000 : 0;
  const showProfessionalPrompt = !!(
    profile &&
    !profile.pro_engagement_accepted &&
    !proPromptDismissedAt
  );

  if (ageVerified === false) {
    return (
      <div
        className="relative min-h-dvh bg-winelio-light dark:bg-slate-900 transition-colors duration-200"
      >
        <AppBackground />
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
      <ProfileGraceTimer
        emailConfirmedAtStr={user.email_confirmed_at || null}
        isProfileComplete={isProfileComplete}
      />
      {DEMO_MODE && <DemoSeedBanner />}

      {showProfessionalPrompt && <ProfessionalPromptModal delayMs={professionalPromptDelayMs} />}

      {/* Desktop: sidebar + top bar avec greeting & avatar */}
      <div className="hidden lg:block">
        <Sidebar userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} />
      </div>
      <DesktopHeader
        userEmail={user.email ?? ""}
        firstName={profile?.first_name ?? undefined}
        avatar={profile?.avatar ?? undefined}
      />

      {/* Mobile: header + bottom nav */}
      <MobileHeader
        userEmail={user.email ?? ""}
        firstName={profile?.first_name ?? undefined}
        avatar={profile?.avatar ?? undefined}
        isSuperAdmin={isSuperAdmin}
        userId={user.id}
        allBugReports={allBugReports ?? []}
      />
      <MobileNav />

      {/* Bug report button — mobile: dans le header / desktop: floating */}
      <BugReportButton userId={user.id} allBugReports={allBugReports ?? []} />

      <main
        className="relative z-10 pb-24 px-4 lg:pb-8 lg:ml-64 lg:px-8 pt-16 lg:pt-[5.5rem]"
      >
        {children}
      </main>
    </div>
  );
}
