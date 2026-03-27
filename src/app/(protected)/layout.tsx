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

  return (
    <div className="min-h-dvh bg-kiparlo-light">
      {/* Desktop: sidebar */}
      <div className="hidden lg:block">
        <Sidebar userEmail={user.email ?? ""} />
      </div>

      {/* Mobile: header + bottom nav */}
      <MobileHeader userEmail={user.email ?? ""} />
      <MobileNav />

      {/* Main content: adaptatif mobile/desktop */}
      <main className="pt-14 pb-20 px-4 lg:pt-0 lg:pb-0 lg:ml-64 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
