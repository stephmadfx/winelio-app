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
    .from("profiles")
    .select(
      "id, first_name, last_name, is_professional, is_active, created_at, sponsor_id, company:companies(name, siret)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.search) {
    query = query.or(`first_name.ilike.%${params.search}%,last_name.ilike.%${params.search}%`);
  }

  const { data: users, count } = await query;
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
            className="bg-muted border border-border rounded-l-xl px-4 py-2 text-sm text-foreground placeholder-muted-foreground w-56 focus:outline-none focus:border-kiparlo-orange/50"
          />
          <button
            type="submit"
            className="bg-kiparlo-orange hover:bg-kiparlo-amber text-white text-sm font-medium px-4 py-2 rounded-r-xl transition-colors"
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SIRET</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inscrit le</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(users ?? []).map((user) => {
              const company = Array.isArray(user.company) ? user.company[0] : user.company;
              const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?";
              return (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                        user.is_professional ? "bg-blue-500/80" : "bg-kiparlo-orange/80"
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
                      className="text-xs font-medium text-kiparlo-orange hover:text-kiparlo-amber transition-colors"
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
        {(users ?? []).map((user) => {
          const company = Array.isArray(user.company) ? user.company[0] : user.company;
          const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?";
          return (
            <Link
              key={user.id}
              href={`/gestion-reseau/utilisateurs/${user.id}`}
              className="flex items-center gap-3 bg-card rounded-xl border border-border px-4 py-3 hover:border-kiparlo-orange/30 transition-colors"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                user.is_professional ? "bg-blue-500/80" : "bg-kiparlo-orange/80"
              }`}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "—"}</p>
                <p className="text-xs text-muted-foreground">{company?.name ?? (user.is_professional ? "Pro" : "Particulier")}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded border ${
                  !user.is_active ? "bg-red-400/10 text-red-400 border-red-400/20" : "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                }`}>
                  {!user.is_active ? "Suspendu" : "Actif"}
                </span>
                <span className="text-[10px] text-muted-foreground">{new Date(user.created_at).toLocaleDateString("fr-FR")}</span>
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
                p === page ? "bg-kiparlo-orange text-white" : "bg-muted text-muted-foreground hover:text-foreground"
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
