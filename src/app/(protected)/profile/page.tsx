import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, address, city, postal_code, is_professional, pro_engagement_accepted, sponsor_code, sponsor_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/auth/login");
  }

  return (
    <div className="">
      <h2 className="text-2xl font-bold text-winelio-dark mb-6">Mon profil</h2>
      <ProfileForm profile={profile} userEmail={user.email ?? ""} />
    </div>
  );
}
