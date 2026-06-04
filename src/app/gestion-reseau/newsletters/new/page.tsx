import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getNewsletterTestEmailPresets } from "@/lib/newsletter-test-presets";
import { NewsletterEditor } from "@/components/admin/newsletters/NewsletterEditor";

export default async function NewNewsletterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserEmail = user?.email ?? "";
  const [{ data: categories }, testEmailPresets] = await Promise.all([
    supabaseAdmin.from("categories").select("id, name").order("name"),
    getNewsletterTestEmailPresets(currentUserEmail),
  ]);

  return (
    <NewsletterEditor
      initialTemplate={null}
      currentUserEmail={currentUserEmail}
      audienceCategories={categories ?? []}
      testEmailPresets={testEmailPresets}
    />
  );
}
