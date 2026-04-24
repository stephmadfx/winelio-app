import { supabaseAdmin } from "@/lib/supabase/admin";
import { ProfessionnelsTable } from "@/components/admin/ProfessionnelsTable";
import { verifyCompany } from "@/app/gestion-reseau/actions";
import { fakeLastActive } from "@/lib/fake-last-active";

export default async function AdminProfessionnels() {
  const [{ data: companies }, { data: categories }, { data: recosRaw }] = await Promise.all([
    supabaseAdmin
      .from("companies")
      .select(
        `id, name, legal_name, alias, email, phone, website,
         address, city, postal_code, country,
         latitude, longitude, siret, is_verified, created_at,
         owner:profiles!owner_id(id, first_name, last_name, email),
         category:categories!category_id(name)`
      )
      .limit(1000),
    supabaseAdmin
      .from("categories")
      .select("id, name")
      .order("name"),
    supabaseAdmin
      .from("recommendations")
      .select("company_id")
      .eq("status", "COMPLETED"),
  ]);

  // Map company_id → nombre de recos finalisées
  const recoCountMap: Record<string, number> = {};
  for (const r of recosRaw ?? []) {
    if (r.company_id) recoCountMap[r.company_id] = (recoCountMap[r.company_id] ?? 0) + 1;
  }

  // Récupérer last_sign_in_at pour tous les owners via l'API Auth admin
  const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const lastSignInMap: Record<string, string | null> = {};
  for (const u of authData?.users ?? []) {
    lastSignInMap[u.id] = u.last_sign_in_at ?? null;
  }

  // Enrichir les entreprises : connexion réelle si disponible, sinon date fictive déterministe
  const enriched = (companies ?? []).map((c) => {
    const owner = Array.isArray(c.owner) ? c.owner[0] : c.owner;
    const realSignIn = owner?.id ? (lastSignInMap[owner.id] ?? null) : null;
    return {
      ...c,
      last_sign_in_at: realSignIn ?? fakeLastActive(c.id),
      finalized_recos_count: recoCountMap[c.id] ?? 0,
    };
  });

  // Tri par défaut : connexion la plus récente en premier
  enriched.sort((a, b) =>
    new Date(b.last_sign_in_at).getTime() - new Date(a.last_sign_in_at).getTime()
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          Professionnels{" "}
          <span className="text-gray-500 text-base font-normal">
            ({enriched.length})
          </span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Annuaire complet des entreprises inscrites sur Winelio
        </p>
      </div>

      <ProfessionnelsTable
        companies={enriched}
        categories={categories ?? []}
        onVerify={verifyCompany}
      />
    </div>
  );
}
