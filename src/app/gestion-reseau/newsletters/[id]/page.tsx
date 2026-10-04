import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getNewsletterTestEmailPresets } from "@/lib/newsletter-test-presets";
import { NewsletterEditor } from "@/components/admin/newsletters/NewsletterEditor";
import type { NewsletterTemplate } from "@/components/admin/newsletters/newsletter-types";

export default async function EditNewsletterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserEmail = user?.email ?? "";

  const [{ data }, { data: categories }, testEmailPresets] = await Promise.all([
    supabaseAdmin
      .schema("winelio")
      .from("newsletter_templates")
      .select("id, name, subject, preheader, mjml_content, html_content, project_data, status, updated_at, last_campaign_id, last_test_campaign_id")
      .eq("id", id)
      .eq("user_id", user?.id ?? "")
      .single(),
    supabaseAdmin.from("categories").select("id, name").order("name"),
    getNewsletterTestEmailPresets(currentUserEmail),
  ]);

  if (!data) notFound();

  const template: NewsletterTemplate = {
    id: data.id,
    name: data.name,
    subject: data.subject,
    preheader: data.preheader,
    mjmlContent: data.mjml_content,
    htmlContent: data.html_content,
    projectData: data.project_data ?? {},
    status: data.status,
    updatedAt: data.updated_at,
  };

  return (
    <div>
    {data.last_campaign_id && <Link href={`/gestion-reseau/newsletters/campagnes/${data.last_campaign_id}`} className="mb-4 inline-flex rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-winelio-orange">Voir les statistiques du dernier envoi →</Link>}
    {data.last_test_campaign_id && <Link href={`/gestion-reseau/newsletters/campagnes/${data.last_test_campaign_id}`} className="mb-4 ml-2 inline-flex rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-winelio-orange">Statistiques du dernier test →</Link>}
    <NewsletterEditor
      initialTemplate={template}
      currentUserEmail={currentUserEmail}
      audienceCategories={categories ?? []}
      testEmailPresets={testEmailPresets}
    />
    </div>
  );
}
