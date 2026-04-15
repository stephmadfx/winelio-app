import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  const { data: documents } = await supabaseAdmin
    .schema("winelio")
    .from("legal_documents")
    .select("id, title, status")
    .order("created_at", { ascending: true });

  return (
    <AdminLayoutShell userEmail={user.email ?? ""} documents={documents ?? []}>
      {children}
    </AdminLayoutShell>
  );
}
