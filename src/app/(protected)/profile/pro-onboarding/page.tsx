// src/app/(protected)/profile/pro-onboarding/page.tsx
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ProOnboardingWizard } from "@/components/ProOnboardingWizard";

export default async function ProOnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Si déjà onboardé → retour au profil directement
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, pro_engagement_accepted, work_mode")
    .eq("id", user.id)
    .single();

  if (profile?.pro_engagement_accepted) {
    redirect("/profile");
  }

  // Charger catégories, company et CGU en parallèle
  const [
    { data: categories },
    { data: company },
    { data: cguAiDoc },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, is_hoguet")
      .order("name"),
    supabase
      .from("companies")
      .select("siret, category_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("legal_documents")
      .select("id")
      .eq("title", "CGU Agents Immobiliers")
      .eq("version", "1.0")
      .single(),
  ]);

  const { data: cguAiSections } = cguAiDoc
    ? await supabaseAdmin
        .from("document_sections")
        .select("article_number, title, content")
        .eq("document_id", cguAiDoc.id)
        .order("order_index")
    : { data: [] };

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <ProOnboardingWizard
        categories={categories ?? []}
        defaultSiret={company?.siret ?? ""}
        defaultCategoryId={company?.category_id ?? ""}
        cguAgentsImmoDocumentId={cguAiDoc?.id ?? null}
        cguAgentsImmoSections={cguAiSections ?? []}
      />
    </div>
  );
}
