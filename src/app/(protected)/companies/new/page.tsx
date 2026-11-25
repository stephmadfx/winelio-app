import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewCompanyForm } from "@/components/new-company-form";
import { CATEGORY_SELECT } from "@/components/category-options";

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
    .select(CATEGORY_SELECT)
    .order("name");

  return (
    <div className="">
      <h2 className="text-2xl font-bold text-winelio-dark mb-6">
        Nouvelle entreprise
      </h2>
      <NewCompanyForm categories={categories ?? []} personalEmail={user.email ?? ""} />
    </div>
  );
}
