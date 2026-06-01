import { NewsletterManager } from "@/components/admin/newsletters/NewsletterManager";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function AdminNewslettersPage() {
  const [{ data: newsletters }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("newsletters")
      .select("id, subject, content, status, recipient_filters, selected_recipient_ids, excluded_recipient_ids, manual_emails, recipient_count, sent_count, failed_count, opened_count, clicked_count, sent_at, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name, is_professional, is_active")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <NewsletterManager
      initialNewsletters={newsletters ?? []}
      profiles={profiles ?? []}
    />
  );
}
