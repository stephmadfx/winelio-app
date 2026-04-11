import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { MobileHeader } from "@/components/mobile-header";
import { AppBackground } from "@/components/AppBackground";
import { ProfileIncompleteModal } from "@/components/profile-incomplete-modal";
import { BugReportButton } from "@/components/bug-report-button";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-6 bg-amber-400/90 backdrop-blur-sm flex items-center justify-center gap-2 text-amber-900 text-[11px] font-medium tracking-wide select-none pointer-events-none">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-700 animate-pulse" />
      Mode démonstration — données fictives
    </div>
  );
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, postal_code, city, address")
    .eq("id", user.id)
    .single();

  const isProfileComplete = !!(
    profile?.first_name?.trim() &&
    profile?.last_name?.trim() &&
    profile?.phone?.trim() &&
    profile?.postal_code?.trim() &&
    profile?.city?.trim() &&
    profile?.address?.trim()
  );

  return (
    <div className={`relative min-h-dvh bg-winelio-light dark:bg-slate-900 transition-colors duration-200 ${DEMO_MODE ? "pt-6" : ""}`}>
      <AppBackground />
      <DemoBanner />

      {/* Modal profil incomplet */}
      {!isProfileComplete && <ProfileIncompleteModal />}

      {/* Desktop: sidebar */}
      <div className="hidden lg:block">
        <Sidebar userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} demoBanner={DEMO_MODE} />
      </div>

      {/* Mobile: header + bottom nav */}
      <MobileHeader userEmail={user.email ?? ""} firstName={profile?.first_name ?? undefined} isSuperAdmin={isSuperAdmin} demoBanner={DEMO_MODE} />
      <MobileNav />

      {/* Bug report button (toutes pages) */}
      <BugReportButton userId={user.id} allBugReports={allBugReports ?? []} />

      {/* Main content: adaptatif mobile/desktop */}
      <main className={`relative z-10 pb-24 px-4 lg:pb-0 lg:ml-64 lg:px-8 lg:py-8 ${DEMO_MODE ? "pt-22 lg:pt-6" : "pt-16 lg:pt-0"}`}>
        {children}
      </main>
    </div>
  );
}
