import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { EditCompanyForm } from "@/components/edit-company-form";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, legal_name, email, phone, website, address, city, postal_code, siret, siren, naf_code, insurance_number, category_id, owner_id"
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company) notFound();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div>
      <h2 className="text-2xl font-bold text-winelio-dark mb-6">
        Modifier l&apos;entreprise
      </h2>
      <EditCompanyForm
        company={company}
        categories={categories ?? []}
      />
    </div>
  );
}
