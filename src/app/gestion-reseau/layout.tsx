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

  const { count: openBugCount } = await supabaseAdmin
    .from("bug_reports")
    .select("id", { count: "exact", head: true })
    .neq("tracking_status", "done");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();

  const bugDeleteAllowed = Boolean(profile?.is_founder);

  return (
    <AdminLayoutShell
      userEmail={user.email ?? ""}
      documents={documents ?? []}
      bugCount={openBugCount ?? 0}
      bugDeleteAllowed={bugDeleteAllowed}
    >
      {children}
    </AdminLayoutShell>
  );
}
