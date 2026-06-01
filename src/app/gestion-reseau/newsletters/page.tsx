import { NewsletterManager } from "@/components/admin/newsletters/NewsletterManager";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminNewslettersPage() {
  const [{ data: newsletters }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("newsletters")
      .select("id, subject, content, status, recipient_filters, selected_recipient_ids, excluded_recipient_ids, manual_emails, recipient_count, sent_count, failed_count, opened_count, clicked_count, sent_at, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name, is_professional, is_active, companies!owner_id(source, deleted_at)")
      .eq("is_demo", false)
      .not("email", "ilike", "%@winelio-demo.internal")
      .not("email", "ilike", "%@kiparlo-demo.fr")
      .not("email", "ilike", "%@demo-winelio.fr")
      .not("email", "ilike", "%@winelio-scraped.local")
      .not("email", "ilike", "%@kiparlo-pro.fr")
      .not("email", "ilike", "%@winelio-pro.fr")
      .not("email", "ilike", "%@winko%")
      .not("email", "ilike", "demo.%")
      .not("email", "ilike", "demo_%")
      .not("email", "ilike", "demo-%")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const selectableProfiles = (profiles ?? []).filter((profile) => {
    const companies = Array.isArray(profile.companies)
      ? profile.companies
      : profile.companies
        ? [profile.companies]
        : [];
    const activeCompanies = companies.filter((company) => !company.deleted_at);
    return activeCompanies.length === 0 || activeCompanies.some((company) => company.source === "owner");
  });

  return (
    <NewsletterManager
      initialNewsletters={newsletters ?? []}
      profiles={selectableProfiles}
    />
  );
}
