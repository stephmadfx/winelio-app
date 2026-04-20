import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ pro?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, address, city, postal_code, birth_date, is_professional, pro_engagement_accepted, sponsor_code, sponsor_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/auth/login");

  const params = await searchParams;
  const showProWelcome = params.pro === "1";

  return (
    <div className="">
      <h2 className="text-2xl font-bold text-winelio-dark mb-6">Mon profil</h2>
      {showProWelcome && (
        <div className="mb-6 p-4 bg-orange-50 border border-winelio-orange/30 rounded-2xl flex items-start gap-3">
          <span className="text-2xl">🚀</span>
          <div>
            <p className="font-semibold text-winelio-orange">Félicitations, vous êtes Pro !</p>
            <p className="text-sm text-winelio-gray mt-0.5">
              Votre compte professionnel est actif. Vous allez commencer à recevoir des recommandations.
            </p>
          </div>
        </div>
      )}
      <ProfileForm profile={profile} userEmail={user.email ?? ""} />
    </div>
  );
}
