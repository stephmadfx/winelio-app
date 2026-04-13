// src/app/(protected)/profile/pro-onboarding/page.tsx
import { createClient } from "@/lib/supabase/server";
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

  // Charger les catégories
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  // Charger la company existante (s'il en a une)
  const { data: company } = await supabase
    .from("companies")
    .select("siret, category_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <ProOnboardingWizard
        categories={categories ?? []}
        defaultSiret={company?.siret ?? ""}
        defaultCategoryId={company?.category_id ?? ""}
      />
    </div>
  );
}
