"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Professional, Category } from "./types";
import { ProfessionalList } from "./ProfessionalList";
import { GeoStatusBanner, GeoStatus } from "./GeoStatusBanner";

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

  useEffect(() => {
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("id, first_name, last_name, city, latitude, longitude, company:companies(name, alias, category:categories(name))")
      .eq("is_professional", true)
      .neq("id", userId)
      .order("last_name")
      .then(({ data }) => {
        let results: Professional[] = (data ?? []).map((p) => {
          const company = Array.isArray(p.company) ? p.company[0] : p.company;
          const cat = company?.category;
          const catName = Array.isArray(cat) ? cat[0]?.name ?? null : (cat as { name: string } | null)?.name ?? null;
          return {
            id: p.id, first_name: p.first_name, last_name: p.last_name,
            company_name: company?.name ?? null,
            company_alias: (company as { alias?: string | null } | null)?.alias ?? null,
            category_name: catName, city: p.city, latitude: p.latitude, longitude: p.longitude,
            distance: userLocation && p.latitude && p.longitude ? haversineKm(userLocation.lat, userLocation.lng, p.latitude, p.longitude) : null,
            avg_rating: null,
            review_count: 0,
          };
        });
        if (proSearch.length >= 2) {
          const q = proSearch.toLowerCase();
          results = results.filter((p) => proSearch.startsWith("#")
            ? (p.company_alias ?? "").toLowerCase().startsWith(q)
            : (p.company_name ?? "").toLowerCase().includes(q) || (p.first_name ?? "").toLowerCase().includes(q) || (p.last_name ?? "").toLowerCase().includes(q)
          );
        }
        if (selectedCategory !== "all") results = results.filter((p) => p.category_name === selectedCategory);
        if (userLocation && sortBy === "distance") {
          results = results.filter((p) => p.distance === null || p.distance <= radius);
          results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
        }
        if (selectedCommune) results = results.filter((p) => (p.city ?? "").toLowerCase().includes(selectedCommune.toLowerCase()));
        setProfessionals(results);
      });
  }, [proSearch, userId, selectedCategory, userLocation, radius, sortBy, selectedCommune]);

  useEffect(() => {
    if (postalCode.length !== 5) { setPostalCommunes([]); setSelectedCommune(null); return; }
    setPostalLoading(true);
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom`)
      .then((r) => r.json())
      .then((data: { nom: string }[]) => {
        const noms = data.map((c) => c.nom);
        setPostalCommunes(noms);
        setSelectedCommune(noms.length === 1 ? noms[0] : null);
      })
      .catch(() => setPostalCommunes([]))
      .finally(() => setPostalLoading(false));
  }, [postalCode]);

  const requestGeo = () => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus("granted"); setSortBy("distance"); },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 }
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

      <ProfessionalList
        professionals={professionals}
        selectedProId={selectedProId}
        onSelect={onSelect}
        geoGranted={geoStatus === "granted"}
        radius={radius}
        onExpandRadius={() => setRadius(99999)}
      />
    </div>
  );
};

