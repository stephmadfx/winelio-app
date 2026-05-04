import { supabaseAdmin } from "@/lib/supabase/admin";
import { ProfessionnelsTable } from "@/components/admin/ProfessionnelsTable";
import { verifyCompany } from "@/app/gestion-reseau/actions";
import { fakeLastActive } from "@/lib/fake-last-active";

export default async function AdminProfessionnels() {
  const [{ data: companies }, { data: categories }, { data: recosRaw }] = await Promise.all([
    supabaseAdmin
      .from("companies_real")
      .select(
        `id, name, legal_name, alias, email, phone, website,
         address, city, postal_code, country,
         latitude, longitude, siret, is_verified, created_at, owner_id,
         category:categories!category_id(name)`
      )
      .limit(1000),
    supabaseAdmin
      .from("categories")
      .select("id, name")
      .order("name"),
    supabaseAdmin
      .from("recommendations_real")
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

  // Récupérer les owners en lot (la vue companies_real n'a pas de FK
  // déclarée vers profiles, donc le join PostgREST inline ne marche pas).
  const ownerIds = [...new Set((companies ?? []).map((c) => c.owner_id).filter(Boolean))];
  const { data: owners } = ownerIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ownerIds)
    : { data: [] };
  const ownerMap: Record<string, { id: string; first_name: string | null; last_name: string | null; email: string | null }> = {};
  for (const o of owners ?? []) ownerMap[o.id] = o;

  // Enrichir les entreprises : connexion réelle si disponible, sinon date fictive déterministe
  const enriched = (companies ?? []).map((c) => {
    const owner = c.owner_id ? ownerMap[c.owner_id] ?? null : null;
    const realSignIn = owner?.id ? (lastSignInMap[owner.id] ?? null) : null;
    return {
      ...c,
      owner,
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
