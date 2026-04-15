import { supabaseAdmin } from "@/lib/supabase/admin";
import { ProfessionnelsTable } from "@/components/admin/ProfessionnelsTable";
import { verifyCompany } from "@/app/gestion-reseau/actions";

export default async function AdminProfessionnels() {
  const [{ data: companies }, { data: categories }] = await Promise.all([
    supabaseAdmin
      .from("companies")
      .select(
        `id, name, legal_name, alias, email, phone, website,
         address, city, postal_code, country,
         latitude, longitude, siret, is_verified, created_at,
         owner:profiles!owner_id(first_name, last_name, email),
         category:categories!category_id(name)`
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("categories")
      .select("id, name")
      .order("name"),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          Professionnels{" "}
          <span className="text-gray-500 text-base font-normal">
            ({companies?.length ?? 0})
          </span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Annuaire complet des entreprises inscrites sur Winelio
        </p>
      </div>

      <ProfessionnelsTable
        companies={companies ?? []}
        categories={categories ?? []}
        onVerify={verifyCompany}
      />
    </div>
  );
}
