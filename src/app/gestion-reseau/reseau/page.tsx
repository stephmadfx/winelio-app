import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminNetworkContent } from "./AdminNetworkContent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminReseau() {
  // 1. Identifier les super_admin (= têtes de réseau)
  // On pagine toutes les pages car il peut y avoir des milliers d'auth.users (comptes test inclus)
  type AuthUser = { id: string; email?: string; app_metadata?: Record<string, unknown> };
  const superAdmins: AuthUser[] = [];
  let page = 1;
  while (true) {
    const { data: batch } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = (batch?.users ?? []) as AuthUser[];
    superAdmins.push(...users.filter((u) => u.app_metadata?.role === "super_admin"));
    if (users.length < 1000) break;
    page++;
  }

  // 2. Profils des racines
  const superAdminIds = superAdmins.map((u) => u.id);
  const { data: rootProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, sponsor_code")
    .in("id", superAdminIds);

  // 3. Stats par racine
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const roots = await Promise.all(
    (rootProfiles ?? []).map(async (profile) => {
      const authUser = superAdmins.find((u) => u.id === profile.id);

      // Taille réseau (niveaux 1-5)
      let networkSize = 0;
      let currentLevelIds = [profile.id];
      for (let lvl = 1; lvl <= 5; lvl++) {
        if (currentLevelIds.length === 0) break;
        const { data: lvlMembers } = await supabaseAdmin
          .from("profiles_real")
          .select("id")
          .in("sponsor_id", currentLevelIds);
        if (!lvlMembers || lvlMembers.length === 0) break;
        networkSize += lvlMembers.length;
        currentLevelIds = lvlMembers.map((m) => m.id);
      }

      // Nombre de filleuls directs
      const { count: directCount } = await supabaseAdmin
        .from("profiles_real")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", profile.id);

      // Liste filleuls directs avec stats
      const { data: directReferrals } = await supabaseAdmin
        .from("profiles_real")
        .select("id, first_name, last_name, city, is_professional, is_demo, created_at")
        .eq("sponsor_id", profile.id);

      const directIds = (directReferrals ?? []).map((ref) => ref.id);
      const { data: directCompanies } = directIds.length
        ? await supabaseAdmin
            .from("companies_real")
            .select("owner_id, category_id")
            .in("owner_id", directIds)
        : { data: [] };
      const categoryIds = [
        ...new Set((directCompanies ?? []).map((company) => company.category_id).filter(Boolean)),
      ];
      const { data: categories } = categoryIds.length
        ? await supabaseAdmin.from("categories").select("id, name").in("id", categoryIds)
        : { data: [] };
      const categoryNameById = new Map(
        (categories ?? []).map((category) => [category.id, category.name])
      );
      const companyCategoryByOwner = new Map(
        (directCompanies ?? []).map((company) => [
          company.owner_id,
          company.category_id ? categoryNameById.get(company.category_id) ?? null : null,
        ])
      );

      const directWithStats = await Promise.all(
        (directReferrals ?? []).map(async (ref) => {
          const { count: subCount } = await supabaseAdmin
            .from("profiles_real")
            .select("id", { count: "exact", head: true })
            .eq("sponsor_id", ref.id);

          const { data: commData } = await supabaseAdmin
            .from("commissions_real")
            .select("amount")
            .eq("user_id", ref.id)
            .eq("status", "EARNED");

          return {
            id: ref.id,
            first_name: ref.first_name ?? null,
            last_name: ref.last_name ?? null,
            city: (ref as { city?: string | null }).city ?? null,
            is_professional:
              (ref as { is_professional?: boolean }).is_professional ?? false,
            is_demo: (ref as { is_demo?: boolean }).is_demo ?? false,
            company_category: companyCategoryByOwner.get(ref.id) ?? null,
            created_at: ref.created_at,
            sub_referrals: subCount ?? 0,
            total_commissions: (commData ?? []).reduce(
              (s, c) => s + (c.amount ?? 0),
              0
            ),
          };
        })
      );

      // Commissions gagnées par cette racine (depuis son réseau)
      const { data: commData } = await supabaseAdmin
        .from("commissions_real")
        .select("amount, earned_at")
        .eq("user_id", profile.id)
        .eq("status", "EARNED")
        .gt("level", 0);

      const totalCommissions = (commData ?? []).reduce(
        (s, c) => s + (c.amount ?? 0),
        0
      );
      const commissionsThisMonth = (commData ?? [])
        .filter((c) => c.earned_at && c.earned_at >= firstOfMonth)
        .reduce((s, c) => s + (c.amount ?? 0), 0);

      return {
        id: profile.id,
        first_name: profile.first_name ?? null,
        last_name: profile.last_name ?? null,
        email: authUser?.email ?? "",
        sponsor_code: profile.sponsor_code ?? null,
        directCount: directCount ?? 0,
        networkSize,
        totalCommissions,
        commissionsThisMonth,
        directReferrals: directWithStats,
      };
    })
  );

  return (
    <AdminNetworkContent roots={roots} />
  );
}
