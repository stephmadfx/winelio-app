"use client";

import { useState, useEffect, useMemo } from "react";
import { Professional, Category } from "./types";
import { ProfessionalList } from "./ProfessionalList";
import { GeoStatusBanner, GeoStatus } from "./GeoStatusBanner";
import { fakeLastActive } from "@/lib/fake-last-active";

interface StepProfessionalProps {
  userId: string | null;
  selectedProId: string | null;
  onSelect: (id: string) => void;
}

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const StepProfessional = ({ userId, selectedProId, onSelect }: StepProfessionalProps) => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [proSearch, setProSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [sortBy, setSortBy] = useState<"distance" | "name">("name");
  const [locationQuery, setLocationQuery] = useState("");
  const [communes, setCommunes] = useState<{ code: string; nom: string; codesPostaux: string[]; departement?: { nom: string; code: string }; centre?: { coordinates: [number, number] } }[]>([]);
  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSelected, setLocationSelected] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Sans ce délai, chaque frappe déclenchait une requête renvoyant jusqu'à 250 pros.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(proSearch), 350);
    return () => clearTimeout(timer);
  }, [proSearch]);

  useEffect(() => {
    let active = true;
    fetch("/api/recommendations/options", { cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then(body => { if (active) { setCategories(body.categories ?? []); setIsPro(Boolean(body.profile?.is_professional)); } })
      .catch(error => { if (active) setSearchError(error.message || "Impossible de charger les catégories."); });
    return () => { active = false; };
  }, [userId]);

  const lat = userLocation?.lat ?? null;
  const lng = userLocation?.lng ?? null;

  useEffect(() => {
    if (lat === null || lng === null) {
      setProfessionals([]);
      setSearchError(null);
      return;
    }

    // Une réponse lente ne doit pas écraser le résultat d'une recherche plus récente.
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);

    const controller = new AbortController();
    fetch("/api/professionals/search", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ latitude: lat, longitude: lng, category: selectedCategory, commune: selectedCommune, search: debouncedSearch }),
    }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then(body => {
        if (cancelled) return;
        setProfessionals(
          (body.professionals ?? []).map((p: any) => ({
            id: p.profile_id,
            first_name: p.first_name,
            last_name: p.last_name,
            company_name: p.company_name ?? null,
            category_name: p.category_name ?? null,
            city: p.city ?? null,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            distance: p.distance_km ?? null,
            avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null,
            review_count: Number(p.review_count ?? 0),
            is_claimed: p.company_source === "owner",
            last_active_at: fakeLastActive(p.profile_id),
            company_source: p.company_source ?? null,
            company_description: p.company_description ?? null,
            geo_precision: p.geo_precision ?? null,
          }))
        );
      }).catch(error => { if (!cancelled) { setSearchError(error.message || "La recherche est indisponible."); setProfessionals([]); } })
      .finally(() => { if (!cancelled) setSearchLoading(false); });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearch, selectedCategory, lat, lng, selectedCommune]);

  // Le rayon et l'exclusion de sa propre fiche sont purement locaux : les filtrer ici
  // évite de relancer la requête serveur à chaque ajustement du curseur.
  const visibleProfessionals = useMemo(() => {
    let results = professionals;
    if (userId) results = results.filter((p) => p.id !== userId);
    if (sortBy === "distance" && radius < 99999) {
      results = results.filter((p) => p.distance === null || p.distance <= radius);
    }
    return results;
  }, [professionals, userId, sortBy, radius]);

  useEffect(() => {
    const query = locationQuery.trim();
    setCommunes([]);
    setLocationError(null);
    setLocationLoading(false);
    if (locationSelected || query.length < 2 || (/^\d+$/.test(query) && query.length !== 5)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const params = new URLSearchParams({ fields: "nom,code,codesPostaux,departement,centre", limit: "10" });
        params.set(/^\d{5}$/.test(query) ? "codePostal" : "nom", query);
        const response = await fetch(`https://geo.api.gouv.fr/communes?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error();
        if (!controller.signal.aborted) {
          setCommunes(data.filter(c => c.centre?.coordinates?.length === 2));
          if (!data.some(c => c.centre?.coordinates?.length === 2)) setLocationError("Aucune ville trouvée. Vérifiez la saisie.");
        }
      } catch {
        if (!controller.signal.aborted) setLocationError("Recherche de villes indisponible. Réessayez ou utilisez la géolocalisation.");
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [locationQuery, locationSelected]);

  const requestGeo = () => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocationQuery(""); setLocationSelected(false); setCommunes([]); setSelectedCommune(null); setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus("granted"); setSortBy("distance"); setRadius(99999); },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-winelio-dark">Quel professionnel recommandez-vous ?</h2>
        <p className="mt-1 text-sm text-winelio-gray">Choisissez un professionnel Winelio — si l’affaire aboutit, vous recevez une commission.</p>
      </div>

      <GeoStatusBanner status={geoStatus} radius={radius} onRequestGeo={requestGeo} onRadiusChange={setRadius} />

      <div className="mb-4">
        <label htmlFor="professional-location" className="block text-xs font-semibold text-winelio-dark mb-1.5">Ville ou code postal</label>
        <div className="flex gap-2">
          <input id="professional-location" type="search" autoComplete="off" placeholder="Ex. Lyon ou 69003" value={locationQuery}
            aria-describedby="professional-location-status" aria-controls="professional-location-results"
            onChange={(e) => { setLocationQuery(e.target.value); setLocationSelected(false); }}
            className="w-full rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15" />
          {locationQuery && <button type="button" aria-label="Effacer la localisation" onClick={() => { setLocationQuery(""); setLocationSelected(false); setSelectedCommune(null); setUserLocation(null); setGeoStatus("idle"); }}
            className="rounded-xl border border-winelio-gray/20 px-4 text-winelio-gray">×</button>}
        </div>
        <p id="professional-location-status" role="status" className="mt-1 text-xs text-winelio-gray">
          {locationLoading ? "Recherche des villes…" : locationError || (locationSelected ? `Recherche autour de ${selectedCommune}` : "Saisissez une ville ou un code postal, puis choisissez une proposition.")}
        </p>
        {communes.length > 0 && <ul id="professional-location-results" aria-label="Villes proposées" className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-winelio-gray/20 bg-white">
          {communes.map(commune => <li key={commune.code}>
            <button type="button" className="w-full px-4 py-3 text-left text-sm hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
              onClick={() => {
                const [lng, lat] = commune.centre!.coordinates;
                setLocationQuery(`${commune.nom} (${commune.departement?.code ?? commune.codesPostaux.join(", ")})`);
                setLocationSelected(true); setCommunes([]); setSelectedCommune(commune.nom);
                setUserLocation({ lat, lng }); setGeoStatus("idle"); setSortBy("distance"); setRadius(99999);
              }}>
              <span className="font-medium">{commune.nom}</span>
              <span className="ml-2 text-winelio-gray">{commune.departement?.nom} ({commune.departement?.code}) · {commune.codesPostaux.join(", ")}</span>
            </button>
          </li>)}
        </ul>}
      </div>

      {/* Recherche + catégorie */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-winelio-gray/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Rechercher par nom..." value={proSearch} onChange={(e) => setProSearch(e.target.value)}
            disabled={!userLocation}
            className="w-full rounded-xl border border-winelio-gray/20 pl-10 pr-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 disabled:opacity-50 disabled:bg-gray-50" />
        </div>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
          disabled={!userLocation}
          className="rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 bg-white cursor-pointer disabled:opacity-50 disabled:bg-gray-50">
          <option value="all">Toutes les catégories</option>
          {categories.map((cat) => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
        </select>
      </div>

      {!userLocation ? (
        <div className="rounded-2xl border border-dashed border-winelio-orange/30 bg-winelio-orange/5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-winelio-orange/10 text-winelio-orange">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-winelio-dark">Localisation requise</h3>
          <p className="mt-1 text-xs text-winelio-gray max-w-sm mx-auto">
            Pour rechercher et recommander un professionnel, vous devez activer la géolocalisation ou choisir une ville ou un code postal.
          </p>
        </div>
      ) : (
        <>
          {searchError && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <svg className="w-4 h-4 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374l7.108-12.748c.866-1.5 3.032-1.5 3.898 0l7.6 12.748zM12 15.75h.007v.008H12v-.008z" /></svg>
              <span>{searchError} Réessayez dans un instant ou contactez le support si cela persiste.</span>
            </div>
          )}

          <p className="mb-3 flex items-center gap-2 text-xs text-winelio-gray/70">
            {searchLoading && <span className="w-3 h-3 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />}
            <span>
              {visibleProfessionals.length} professionnel{visibleProfessionals.length !== 1 ? "s" : ""} trouvé{visibleProfessionals.length !== 1 ? "s" : ""}
              {selectedCategory !== "all" && ` · ${selectedCategory}`}
              {selectedCommune && ` · ${selectedCommune}`}
              {geoStatus === "granted" && radius < 99999 && ` · ${radius} km`}
            </span>
          </p>

          {isPro && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-winelio-light border border-winelio-gray/10 px-3 py-2 text-xs text-winelio-gray">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Votre propre fiche pro n&apos;apparaît pas dans cette liste — vous ne pouvez pas vous recommander vous-même.</span>
            </div>
          )}

          <ProfessionalList
            professionals={visibleProfessionals}
            selectedProId={selectedProId}
            onSelect={onSelect}
            geoGranted={geoStatus === "granted"}
            radius={radius}
            onExpandRadius={() => setRadius(99999)}
          />
        </>
      )}
    </div>
  );
};
