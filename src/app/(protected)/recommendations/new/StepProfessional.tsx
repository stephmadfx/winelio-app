"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const supabase = createClient();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [proSearch, setProSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [sortBy, setSortBy] = useState<"distance" | "name">("name");
  const [postalCode, setPostalCode] = useState("");
  const [postalCommunes, setPostalCommunes] = useState<string[]>([]);
  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
  const [postalLoading, setPostalLoading] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [postalData, setPostalData] = useState<{ nom: string; centre?: { coordinates: [number, number] } }[]>([]);

  useEffect(() => {
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("is_professional").eq("id", userId).maybeSingle().then(({ data }) => {
      setIsPro(!!data?.is_professional);
    });
    supabase.auth.getUser().then(({ data }) => {
      setIsSuperAdmin(data?.user?.app_metadata?.role === "super_admin");
    });
  }, [userId]);

  useEffect(() => {
    const rpcParams = {
      p_latitude: userLocation?.lat ?? null,
      p_longitude: userLocation?.lng ?? null,
      p_category_name: selectedCategory,
      p_commune: selectedCommune || null,
      p_search: proSearch.length >= 2 ? proSearch.trim() : null,
      p_limit: 250
    };

    supabase
      .rpc("search_professionals_by_distance", rpcParams)
      .then(({ data, error }) => {
        if (error) {
          console.error("[StepProfessional] query error:", error);
          return;
        }

        let results: Professional[] = (data ?? []).map((p: any) => {
          return {
            id: p.profile_id,
            first_name: p.first_name,
            last_name: p.last_name,
            company_name: p.company_name ?? null,
            company_alias: p.company_alias ?? null,
            category_name: p.category_name ?? null,
            city: p.city ?? null,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            distance: p.distance_km ?? null,
            avg_rating: null,
            review_count: 0,
            is_claimed: p.company_source === "owner",
            last_active_at: fakeLastActive(p.profile_id),
          };
        });

        if (userId) {
          results = results.filter((p) => p.id !== userId);
        }

        if (userLocation && sortBy === "distance" && radius < 99999) {
          results = results.filter((p) => p.distance === null || p.distance <= radius);
        }

        setProfessionals(results);
      });
  }, [proSearch, userId, selectedCategory, userLocation, radius, sortBy, selectedCommune]);

  useEffect(() => {
    if (postalCode.length !== 5) {
      setPostalCommunes([]);
      setSelectedCommune(null);
      setPostalData([]);
      if (geoStatus !== "granted") {
        setUserLocation(null);
      }
      return;
    }
    setPostalLoading(true);
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,centre`)
      .then((r) => r.json())
      .then((data: { nom: string; centre?: { coordinates: [number, number] } }[]) => {
        setPostalData(data);
        const noms = data.map((c) => c.nom);
        setPostalCommunes(noms);
        setSelectedCommune(noms.length === 1 ? noms[0] : null);

        if (geoStatus !== "granted" && data.length > 0 && data[0].centre?.coordinates) {
          const [lng, lat] = data[0].centre.coordinates;
          setUserLocation({ lat, lng });
          setSortBy("distance");
          setRadius(99999);
        }
      })
      .catch(() => {
        setPostalCommunes([]);
        setPostalData([]);
      })
      .finally(() => setPostalLoading(false));
  }, [postalCode, geoStatus]);

  useEffect(() => {
    if (geoStatus === "granted") return;
    if (selectedCommune) {
      const match = postalData.find((c) => c.nom === selectedCommune);
      if (match?.centre?.coordinates) {
        const [lng, lat] = match.centre.coordinates;
        setUserLocation({ lat, lng });
      }
    } else if (postalData.length > 0 && postalData[0].centre?.coordinates) {
      const [lng, lat] = postalData[0].centre.coordinates;
      setUserLocation({ lat, lng });
    }
  }, [selectedCommune, postalData, geoStatus]);

  const requestGeo = () => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus("granted"); setSortBy("distance"); setRadius(99999); },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-winelio-dark">Quel professionnel recommandez-vous ?</h2>
        <p className="mt-1 text-sm text-winelio-gray">Choisissez un professionnel Winelio — si le deal aboutit, vous touchez une commission.</p>
      </div>

      <GeoStatusBanner status={geoStatus} radius={radius} onRequestGeo={requestGeo} onRadiusChange={setRadius} />

      {/* Code postal */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-[160px]">
          <input type="text" inputMode="numeric" maxLength={5} placeholder="Code postal" value={postalCode}
            onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="w-full rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15" />
          {postalLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />}
        </div>
        {postalCommunes.length > 0 && (
          <>
            {postalCommunes.length === 1 ? (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">{postalCommunes[0]}</div>
            ) : (
              <select value={selectedCommune ?? ""} onChange={(e) => setSelectedCommune(e.target.value || null)}
                className="flex-1 rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 bg-white cursor-pointer">
                <option value="">Toutes les communes</option>
                {postalCommunes.map((nom) => <option key={nom} value={nom}>{nom}</option>)}
              </select>
            )}
            <button onClick={() => { setPostalCode(""); setPostalCommunes([]); setSelectedCommune(null); }}
              className="flex items-center justify-center w-10 rounded-xl border border-winelio-gray/20 text-winelio-gray hover:text-red-500 hover:border-red-200 transition-colors cursor-pointer" title="Effacer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </>
        )}
      </div>

      {/* Recherche + catégorie */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-winelio-gray/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Rechercher par nom..." value={proSearch} onChange={(e) => setProSearch(e.target.value)}
            className="w-full rounded-xl border border-winelio-gray/20 pl-10 pr-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15" />
        </div>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 bg-white cursor-pointer">
          <option value="all">Toutes les catégories</option>
          {categories.map((cat) => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
        </select>
      </div>

      <p className="mb-3 text-xs text-winelio-gray/70">
        {professionals.length} professionnel{professionals.length !== 1 ? "s" : ""} trouvé{professionals.length !== 1 ? "s" : ""}
        {selectedCategory !== "all" && ` · ${selectedCategory}`}
        {selectedCommune && ` · ${selectedCommune}`}
        {geoStatus === "granted" && radius < 99999 && ` · ${radius} km`}
      </p>

      {isPro && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-winelio-light border border-winelio-gray/10 px-3 py-2 text-xs text-winelio-gray">
          <svg className="w-4 h-4 shrink-0 mt-0.5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Votre propre fiche pro n&apos;apparaît pas dans cette liste — vous ne pouvez pas vous recommander vous-même.</span>
        </div>
      )}

      <ProfessionalList
        professionals={professionals}
        selectedProId={selectedProId}
        onSelect={onSelect}
        geoGranted={geoStatus === "granted"}
        radius={radius}
        onExpandRadius={() => setRadius(99999)}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
};

