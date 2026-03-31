import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { MobileHeader } from "@/components/mobile-header";

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
    <div className="min-h-dvh bg-kiparlo-light dark:bg-slate-900 transition-colors duration-200">
      {/* Desktop: sidebar */}
      <div className="hidden lg:block">
        <Sidebar userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} />
      </div>

      {/* Mobile: header + bottom nav */}
      <MobileHeader userEmail={user.email ?? ""} isSuperAdmin={isSuperAdmin} />
      <MobileNav />

      {/* Main content: adaptatif mobile/desktop */}
      <main className="pt-14 pb-20 px-4 lg:pt-0 lg:pb-0 lg:ml-64 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
