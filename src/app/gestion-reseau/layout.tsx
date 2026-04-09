import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Vérifie le rôle super_admin dans app_metadata (JWT)
  if (user.app_metadata?.role !== "super_admin") redirect("/dashboard");

  return (
    <AdminLayoutShell userEmail={user.email ?? ""}>
      {children}
    </AdminLayoutShell>
  );
}
