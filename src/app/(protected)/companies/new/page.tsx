import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewCompanyForm } from "@/components/new-company-form";

export default async function NewCompanyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="">
      <h2 className="text-2xl font-bold text-kiparlo-dark mb-6">
        Nouvelle entreprise
      </h2>
      <NewCompanyForm categories={categories ?? []} userId={user.id} />
    </div>
  );
}
