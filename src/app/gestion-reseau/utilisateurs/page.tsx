import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function AdminUtilisateurs({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const pageSize = 30;

  let query = supabaseAdmin
    .from("profiles_real")
    .select(
      "id, first_name, last_name, is_professional, is_active, created_at, sponsor_id",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.search) {
    query = query.or(`first_name.ilike.%${params.search}%,last_name.ilike.%${params.search}%`);
  }

  const { data: users, count } = await query;

  const userIds = (users ?? []).map((u) => u.id);

  // Récupère les noms des parrains (self-join non supporté par PostgREST sur schéma custom)
  const sponsorIds = [...new Set((users ?? []).map((u) => u.sponsor_id).filter(Boolean))];
  const { data: sponsorProfiles } = sponsorIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", sponsorIds)
    : { data: [] };

  const sponsorMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
  for (const s of sponsorProfiles ?? []) {
    sponsorMap[s.id] = { first_name: s.first_name, last_name: s.last_name };
  }

  // Récupère le nb de parrainages directs pour chaque user de la page
  const { data: sponsorCounts } = userIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("sponsor_id")
        .in("sponsor_id", userIds)
    : { data: [] };

  const referralCount: Record<string, number> = {};
  for (const row of sponsorCounts ?? []) {
    if (row.sponsor_id) {
      referralCount[row.sponsor_id] = (referralCount[row.sponsor_id] ?? 0) + 1;
    }
  }

  // Récupérer les companies des users (la vue profiles_real n'expose pas les FKs)
  const { data: userCompanies } = userIds.length
    ? await supabaseAdmin
        .from("companies")
        .select("owner_id, name, siret")
        .in("owner_id", userIds)
    : { data: [] };
  const companyMap: Record<string, { name: string | null; siret: string | null }> = {};
  for (const c of userCompanies ?? []) {
    if (c.owner_id) companyMap[c.owner_id] = { name: c.name, siret: c.siret };
  }

  // Réinjecter company dans chaque user pour conserver le format attendu plus bas
  const usersWithCompany = (users ?? []).map((u) => ({
    ...u,
    company: companyMap[u.id] ?? null,
  }));

  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{count ?? 0} membres inscrits</p>
        </div>
        <form className="flex">
          <input
            name="search"
            defaultValue={params.search}
            placeholder="Rechercher par nom…"
            className="bg-muted border border-border rounded-l-xl px-4 py-2 text-sm text-foreground placeholder-muted-foreground w-56 focus:outline-none focus:border-winelio-orange/50"
          />
          <button
            type="submit"
            className="bg-winelio-orange hover:bg-winelio-amber text-white text-sm font-medium px-4 py-2 rounded-r-xl transition-colors"
          >
            Chercher
          </button>
        </form>
      </div>

      {/* Table desktop */}
      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Membre</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parrain</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filleuls</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SIRET</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inscrit le</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {usersWithCompany.map((user) => {
              const company = Array.isArray(user.company) ? user.company[0] : user.company;
              const sponsor = user.sponsor_id ? sponsorMap[user.sponsor_id] : null;
              const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?";
              const sponsorName = sponsor
                ? `${sponsor.first_name ?? ""} ${sponsor.last_name ?? ""}`.trim()
                : null;
              const filleuls = referralCount[user.id] ?? 0;
              return (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                        user.is_professional ? "bg-blue-500/80" : "bg-winelio-orange/80"
                      }`}>
                        {initials}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "—"}</p>
                        {company?.name && <p className="text-xs text-muted-foreground">{company.name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
                      user.is_professional
                        ? "bg-blue-400/10 text-blue-400 border-blue-400/20"
                        : "bg-muted text-muted-foreground border-border"
                    }`}>
                      {user.is_professional ? "Pro" : "Particulier"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {sponsorName ? (
                      <span className="text-xs text-foreground">{sponsorName}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {filleuls > 0 ? (
                      <span className="text-xs font-semibold text-winelio-orange">{filleuls}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {company?.siret
                      ? <span className="text-foreground">{company.siret}</span>
                      : user.is_professional
                        ? <span className="text-muted-foreground italic">—</span>
                        : <span className="text-muted-foreground/40">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
                      !user.is_active
                        ? "bg-red-400/10 text-red-400 border-red-400/20"
                        : "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                    }`}>
                      {!user.is_active ? "Suspendu" : "Actif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/gestion-reseau/utilisateurs/${user.id}`}
                      className="text-xs font-medium text-winelio-orange hover:text-winelio-amber transition-colors"
                    >
                      Fiche →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="md:hidden space-y-2">
        {usersWithCompany.map((user) => {
          const company = Array.isArray(user.company) ? user.company[0] : user.company;
          const sponsor = user.sponsor_id ? sponsorMap[user.sponsor_id] : null;
          const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?";
          const sponsorName = sponsor
            ? `${sponsor.first_name ?? ""} ${sponsor.last_name ?? ""}`.trim()
            : null;
          const filleuls = referralCount[user.id] ?? 0;
          return (
            <Link
              key={user.id}
              href={`/gestion-reseau/utilisateurs/${user.id}`}
              className="flex items-center gap-3 bg-card rounded-xl border border-border px-4 py-3 hover:border-winelio-orange/30 transition-colors"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                user.is_professional ? "bg-blue-500/80" : "bg-winelio-orange/80"
              }`}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {sponsorName ? `Parrain : ${sponsorName}` : (company?.name ?? (user.is_professional ? "Pro" : "Particulier"))}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded border ${
                  !user.is_active ? "bg-red-400/10 text-red-400 border-red-400/20" : "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                }`}>
                  {!user.is_active ? "Suspendu" : "Actif"}
                </span>
                {filleuls > 0 && (
                  <span className="text-[10px] text-winelio-orange font-semibold">{filleuls} filleul{filleuls > 1 ? "s" : ""}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-end flex-wrap">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/gestion-reseau/utilisateurs?page=${p}${params.search ? `&search=${params.search}` : ""}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                p === page ? "bg-winelio-orange text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
