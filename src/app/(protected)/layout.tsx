import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { MobileHeader } from "@/components/mobile-header";
import { AppBackground } from "@/components/AppBackground";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const isSuperAdmin = user.app_metadata?.role === "super_admin";

  return (
    <div className={`relative min-h-dvh bg-winelio-light dark:bg-slate-900 transition-colors duration-200 ${DEMO_MODE ? "pt-6" : ""}`}>
      <AppBackground />
      <DemoBanner />

      {/* Desktop: sidebar */}
      <div className="hidden lg:block">
        <Sidebar userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} />
      </div>

      {/* Mobile: header + bottom nav */}
      <MobileHeader userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} />
      <MobileNav />

      {/* Main content: adaptatif mobile/desktop */}
      <main className="relative z-10 pt-14 pb-20 px-4 lg:pt-0 lg:pb-0 lg:ml-64 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
