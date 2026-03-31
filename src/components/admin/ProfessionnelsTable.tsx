"use client";

import { useState, useMemo, useCallback } from "react";

type OwnerRow = { first_name: string | null; last_name: string | null; email: string | null };
type CategoryRow = { name: string };

type Company = {
  id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  siret: string | null;
  is_verified: boolean;
  created_at: string;
  owner: OwnerRow | OwnerRow[] | null;
  category: CategoryRow | CategoryRow[] | null;
};

function getOwner(c: Company): OwnerRow | null {
  if (!c.owner) return null;
  return Array.isArray(c.owner) ? c.owner[0] ?? null : c.owner;
}

function getCategory(c: Company): CategoryRow | null {
  if (!c.category) return null;
  return Array.isArray(c.category) ? c.category[0] ?? null : c.category;
}

function formatSiret(siret: string) {
  return siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, "$1 $2 $3 $4");
}

type Category = { id: string; name: string };

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PAGE_SIZE = 25;

export function ProfessionnelsTable({
  companies,
  categories,
}: {
  companies: Company[];
  categories: Category[];
}) {
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityInput, setCityInput] = useState("");
  const [radius, setRadius] = useState(50);
  const [geocoded, setGeocoded] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [page, setPage] = useState(1);

  const geocodeCity = useCallback(async () => {
    if (!cityInput.trim()) return;
    setIsGeocoding(true);
    setGeoError("");
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(cityInput)}&type=municipality&limit=1`
      );
      const data = await res.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        setGeocoded({ lat, lng, label: data.features[0].properties.label });
        setPage(1);
      } else {
        setGeoError("Ville introuvable");
      }
    } catch {
      setGeoError("Erreur de géocodage");
    } finally {
      setIsGeocoding(false);
    }
  }, [cityInput]);

  const clearGeo = () => {
    setGeocoded(null);
    setCityInput("");
    setGeoError("");
    setPage(1);
  };

  const filtered = useMemo(() => {
    let list = companies;
    if (nameFilter.trim()) {
      const q = nameFilter.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.legal_name ?? "").toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "all") {
      list = list.filter((c) => getCategory(c)?.name === categoryFilter);
    }
    if (geocoded) {
      list = list
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          ...c,
          _distance: haversineKm(geocoded.lat, geocoded.lng, c.latitude!, c.longitude!),
        }))
        .filter((c) => (c as Company & { _distance: number })._distance <= radius)
        .sort(
          (a, b) =>
            (a as Company & { _distance: number })._distance -
            (b as Company & { _distance: number })._distance
        );
    }
    return list;
  }, [companies, nameFilter, categoryFilter, geocoded, radius]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterChange = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      {/* ── Filtres ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={nameFilter}
          onChange={(e) => handleFilterChange(() => setNameFilter(e.target.value))}
          placeholder="Rechercher par nom..."
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-full sm:w-56"
        />
        <select
          value={categoryFilter}
          onChange={(e) => handleFilterChange(() => setCategoryFilter(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white w-full sm:w-52"
        >
          <option value="all">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && geocodeCity()}
              placeholder="Ville (ex: Toulouse)"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-44"
            />
            <button
              onClick={geocodeCity}
              disabled={!cityInput.trim() || isGeocoding}
              className="px-3 py-2 bg-kiparlo-orange/90 hover:bg-kiparlo-orange text-white text-sm rounded-xl disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {isGeocoding ? "..." : "Chercher"}
            </button>
            {geocoded && (
              <button onClick={clearGeo} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-gray-400 text-sm rounded-xl transition-colors">
                ✕
              </button>
            )}
          </div>
          {geocoded && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-kiparlo-orange">{geocoded.label}</span>
              <input
                type="range" min={10} max={200} step={10} value={radius}
                onChange={(e) => handleFilterChange(() => setRadius(Number(e.target.value)))}
                className="w-32 accent-kiparlo-orange"
              />
              <span className="text-xs text-gray-400 w-16">{radius} km</span>
            </div>
          )}
          {geoError && <p className="text-xs text-red-400">{geoError}</p>}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {filtered.length} professionnel{filtered.length !== 1 ? "s" : ""}
        {geocoded ? ` dans un rayon de ${radius} km autour de ${geocoded.label}` : ""}
      </p>

      {/* ── Table desktop (md+) ─────────────────────── */}
      <div className="hidden md:block bg-gray-900 rounded-xl border border-white/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Entreprise</th>
              <th className="text-left px-4 py-3">Propriétaire</th>
              <th className="text-left px-4 py-3">Catégorie</th>
              <th className="text-left px-4 py-3">Contact &amp; Ville</th>
              {geocoded && <th className="text-left px-4 py-3">Distance</th>}
              <th className="text-left px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={geocoded ? 6 : 5} className="px-4 py-8 text-center text-gray-600">
                  Aucun professionnel trouvé
                </td>
              </tr>
            ) : (
              paginated.map((company) => {
                const c = company as Company & { _distance?: number };
                const owner = getOwner(c);
                const cat = getCategory(c);
                return (
                  <tr key={c.id} className="hover:bg-white/2">
                    {/* Entreprise + SIRET */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-white font-medium truncate">{c.name}</p>
                      {c.legal_name && c.legal_name !== c.name && (
                        <p className="text-gray-500 text-xs truncate">{c.legal_name}</p>
                      )}
                      {c.siret ? (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{formatSiret(c.siret)}</p>
                      ) : (
                        <p className="text-gray-700 text-xs italic mt-0.5">SIRET non renseigné</p>
                      )}
                      {c.website && (
                        <a
                          href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-kiparlo-orange/60 hover:text-kiparlo-orange truncate block max-w-[200px]"
                        >
                          {c.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </td>
                    {/* Propriétaire */}
                    <td className="px-4 py-3">
                      <p className="text-white text-xs">
                        {[owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || "—"}
                      </p>
                      {owner?.email && <p className="text-gray-500 text-xs truncate max-w-[160px]">{owner.email}</p>}
                    </td>
                    {/* Catégorie */}
                    <td className="px-4 py-3">
                      {cat?.name ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 whitespace-nowrap">
                          {cat.name}
                        </span>
                      ) : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    {/* Contact + Ville */}
                    <td className="px-4 py-3">
                      {c.phone && <p className="text-gray-300 text-xs">{c.phone}</p>}
                      {c.email && <p className="text-gray-500 text-xs truncate max-w-[150px]">{c.email}</p>}
                      {c.city && (
                        <p className="text-gray-400 text-xs mt-0.5">
                          {c.city}{c.postal_code ? ` ${c.postal_code}` : ""}
                        </p>
                      )}
                    </td>
                    {geocoded && (
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {c._distance != null ? `${c._distance.toFixed(0)} km` : <span className="text-gray-600">N/A</span>}
                      </td>
                    )}
                    {/* Statut */}
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                        c.is_verified ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-gray-500"
                      }`}>
                        {c.is_verified ? "✓ Vérifié" : "Non vérifié"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Cards mobile (<md) ──────────────────────── */}
      <div className="md:hidden space-y-3">
        {paginated.length === 0 ? (
          <p className="text-center text-gray-600 py-8">Aucun professionnel trouvé</p>
        ) : (
          paginated.map((company) => {
            const c = company as Company & { _distance?: number };
            const owner = getOwner(c);
            const cat = getCategory(c);
            return (
              <div key={c.id} className="bg-gray-900 rounded-xl border border-white/5 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{c.name}</p>
                    {c.legal_name && c.legal_name !== c.name && (
                      <p className="text-gray-500 text-xs">{c.legal_name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      c.is_verified ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-gray-500"
                    }`}>
                      {c.is_verified ? "✓ Vérifié" : "Non vérifié"}
                    </span>
                    {cat?.name && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        {cat.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* SIRET */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 text-xs uppercase tracking-wide">SIRET</span>
                  {c.siret ? (
                    <span className="text-gray-300 text-xs font-mono">{formatSiret(c.siret)}</span>
                  ) : (
                    <span className="text-gray-700 text-xs italic">non renseigné</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1 border-t border-white/5">
                  {owner && (
                    <div>
                      <p className="text-gray-600 uppercase text-[10px] tracking-wide">Propriétaire</p>
                      <p className="text-gray-300">{[owner.first_name, owner.last_name].filter(Boolean).join(" ") || "—"}</p>
                    </div>
                  )}
                  {(c.city || c.postal_code) && (
                    <div>
                      <p className="text-gray-600 uppercase text-[10px] tracking-wide">Ville</p>
                      <p className="text-gray-300">{c.city}{c.postal_code ? ` ${c.postal_code}` : ""}</p>
                    </div>
                  )}
                  {c.phone && (
                    <div>
                      <p className="text-gray-600 uppercase text-[10px] tracking-wide">Téléphone</p>
                      <p className="text-gray-300">{c.phone}</p>
                    </div>
                  )}
                  {c.email && (
                    <div className="col-span-2">
                      <p className="text-gray-600 uppercase text-[10px] tracking-wide">Email</p>
                      <p className="text-gray-300 truncate">{c.email}</p>
                    </div>
                  )}
                  {geocoded && c._distance != null && (
                    <div>
                      <p className="text-gray-600 uppercase text-[10px] tracking-wide">Distance</p>
                      <p className="text-kiparlo-orange">{c._distance.toFixed(0)} km</p>
                    </div>
                  )}
                </div>

                {c.website && (
                  <a
                    href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-kiparlo-orange/70 hover:text-kiparlo-orange truncate block"
                  >
                    {c.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Pagination ─────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex flex-wrap gap-2 mt-4 justify-end">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                p === page ? "bg-kiparlo-orange text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
