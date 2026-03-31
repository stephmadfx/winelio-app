import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      <AdminSidebar userEmail={user.email ?? ""} />

      <div className="ml-16 flex flex-col min-h-dvh">
        {/* Topbar */}
        <header className="h-12 bg-gray-900 border-b border-white/5 flex items-center px-6 gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-kiparlo-orange">
            Super Admin
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-sm text-gray-300">Kiparlo</span>
          <span className="ml-auto text-xs text-gray-500">{user.email}</span>
        </header>

        {/* Contenu */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
