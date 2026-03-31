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
      "id, first_name, last_name, is_professional, is_active, created_at, sponsor_id, company:companies(name, siret, siren)",
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
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Utilisateurs{" "}
        <span className="text-gray-500 text-base font-normal">({count ?? 0})</span>
      </h1>

      {/* Recherche */}
      <form className="mb-4">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="Rechercher par nom..."
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-72"
        />
      </form>

      <div className="bg-gray-900 rounded-xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nom</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">SIRET</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-left px-4 py-3">Inscrit le</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(users ?? []).map((user) => {
              const company = Array.isArray(user.company) ? user.company[0] : user.company;
              return (
              <tr key={user.id} className="hover:bg-white/2">
                <td className="px-4 py-3">
                  <p className="text-white">{`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "—"}</p>
                  {company?.name && <p className="text-gray-500 text-xs">{company.name}</p>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      user.is_professional
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-white/5 text-gray-400"
                    }`}
                  >
                    {user.is_professional ? "Pro" : "Particulier"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono">
                  {company?.siret ? (
                    <span className="text-gray-300">{company.siret}</span>
                  ) : user.is_professional ? (
                    <span className="text-gray-600 italic">non renseigné</span>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      !user.is_active
                        ? "bg-red-500/10 text-red-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {!user.is_active ? "Suspendu" : "Actif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(user.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/gestion-reseau/utilisateurs/${user.id}`}
                    className="text-kiparlo-orange text-xs hover:underline"
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

      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-end">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/gestion-reseau/utilisateurs?page=${p}${
                params.search ? `&search=${params.search}` : ""
              }`}
              className={`px-3 py-1 rounded text-xs ${
                p === page
                  ? "bg-kiparlo-orange text-white"
                  : "bg-white/5 text-gray-400 hover:text-white"
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
