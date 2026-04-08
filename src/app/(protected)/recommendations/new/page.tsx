"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StickyFormActions } from "@/components/StickyFormActions";

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

interface Professional {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_alias: string | null;
  category_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  avg_rating: number | null;
  review_count: number;
}

interface Category {
  id: string;
  name: string;
}

type Urgency = "urgent" | "normal" | "flexible";

function Initials({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  const cls = size === "sm" ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm";
  return (
    <div className={`${cls} rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center shrink-0`}>
      <span className="font-bold text-white uppercase">{init}</span>
    </div>
  );
}

const STEPS_META = [
  { number: 1, label: "Contact" },
  { number: 2, label: "Professionnel" },
  { number: 3, label: "Projet" },
];

export default function NewRecommendationPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 - Contact
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createContact, setCreateContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    country_code: "+33",
  });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});

  // Step 2 - Professional
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [proSearch, setProSearch] = useState("");
  const [selectedProId, setSelectedProId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "granted" | "denied" | "unavailable">("idle");
  const [radius, setRadius] = useState<number>(25);
  const [sortBy, setSortBy] = useState<"distance" | "name">("name");

  // Recherche par code postal
  const [postalCode, setPostalCode] = useState("");
  const [postalCommunes, setPostalCommunes] = useState<string[]>([]);
  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
  const [postalLoading, setPostalLoading] = useState(false);

  // Step 3 - Project
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");

  useEffect(() => {
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone")
      .order("last_name")
      .then(({ data }) => setContacts(data ?? []));
  }, [supabase]);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCategories(data ?? []));
  }, [supabase]);

  function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function requestGeo() {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("granted");
        setSortBy("distance");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  useEffect(() => {
    let query = supabase
      .from("profiles")
      .select("id, first_name, last_name, city, latitude, longitude, company:companies(name, alias, category:categories(name)), reviews!professional_id(rating)")
      .eq("is_professional", true)
      .order("last_name");

    query.then(({ data }) => {
      let results: Professional[] = (data ?? []).map((p) => {
        const company = Array.isArray(p.company) ? p.company[0] : p.company;
        const cat = company?.category;
        const catName = Array.isArray(cat) ? cat[0]?.name ?? null : (cat as { name: string } | null)?.name ?? null;
        let dist: number | null = null;
        if (userLocation && p.latitude && p.longitude) {
          dist = getDistance(userLocation.lat, userLocation.lng, p.latitude, p.longitude);
        }
        const reviews = Array.isArray((p as Record<string, unknown>).reviews)
          ? (p as Record<string, unknown>).reviews as { rating: number }[]
          : [];
        const reviewCount = reviews.length;
        const avgRating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : null;
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          company_name: company?.name ?? null,
          company_alias: (company as { alias?: string | null } | null)?.alias ?? null,
          category_name: catName,
          city: p.city,
          latitude: p.latitude,
          longitude: p.longitude,
          distance: dist,
          avg_rating: avgRating,
          review_count: reviewCount,
        };
      });

      // Filtre de recherche : alias direct (#...) OU nom entreprise OU nom professionnel
      if (proSearch.length >= 2) {
        const q = proSearch.toLowerCase();
        results = results.filter((p) => {
          if (proSearch.startsWith("#")) {
            return (p.company_alias ?? "").toLowerCase().startsWith(q);
          }
          return (
            (p.company_name ?? "").toLowerCase().includes(q) ||
            (p.first_name ?? "").toLowerCase().includes(q) ||
            (p.last_name ?? "").toLowerCase().includes(q)
          );
        });
      }

      if (selectedCategory !== "all") {
        results = results.filter((p) => p.category_name === selectedCategory);
      }
      if (userLocation && sortBy === "distance") {
        results = results.filter((p) => p.distance === null || p.distance <= radius);
        results.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      }
      if (selectedCommune) {
        const commune = selectedCommune.toLowerCase();
        results = results.filter((p) => (p.city ?? "").toLowerCase().includes(commune));
      }
      setProfessionals(results);
    });
  }, [proSearch, supabase, selectedCategory, userLocation, radius, sortBy, selectedCommune]);

  useEffect(() => {
    if (postalCode.length !== 5) {
      setPostalCommunes([]);
      setSelectedCommune(null);
      return;
    }
    setPostalLoading(true);
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom`)
      .then((res) => res.json())
      .then((data: { nom: string }[]) => {
        const noms = data.map((c) => c.nom);
        setPostalCommunes(noms);
        if (noms.length === 1) setSelectedCommune(noms[0]);
        else setSelectedCommune(null);
      })
      .catch(() => setPostalCommunes([]))
      .finally(() => setPostalLoading(false));
  }, [postalCode]);

  const handleClearPostal = () => {
    setPostalCode("");
    setPostalCommunes([]);
    setSelectedCommune(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      let contactId = selectedContactId;
      if (createContact) {
        const { data: newContact, error: contactErr } = await supabase
          .from("contacts")
          .insert({ ...contactForm, user_id: user.id })
          .select("id")
          .single();
        if (contactErr) throw new Error("Erreur création contact");
        contactId = newContact.id;
      }

      if (!contactId || !selectedProId) throw new Error("Contact et professionnel requis");

      const { data: recommendation, error: recError } = await supabase
        .from("recommendations")
        .insert({
          referrer_id: user.id,
          professional_id: selectedProId,
          contact_id: contactId,
          project_description: description,
          urgency_level: urgency,
          status: "PENDING",
        })
        .select("id")
        .single();

      if (recError) throw new Error("Erreur création recommandation");

      // Les étapes sont créées automatiquement par le trigger on_recommendation_created
      router.push(`/recommendations/${recommendation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSubmitting(false);
    }
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^[0-9\s\-().+]{6,20}$/;

  const validateContact = (): boolean => {
    const errors: Record<string, string> = {};
    if (!contactForm.first_name.trim()) errors.first_name = "Prénom obligatoire";
    if (!contactForm.last_name.trim()) errors.last_name = "Nom obligatoire";
    if (!contactForm.email.trim()) errors.email = "Email obligatoire";
    else if (!EMAIL_REGEX.test(contactForm.email)) errors.email = "Format d'email invalide";
    if (!contactForm.phone.trim()) errors.phone = "Téléphone obligatoire";
    else if (!PHONE_REGEX.test(contactForm.phone)) errors.phone = "Format de téléphone invalide";
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canProceed = () => {
    if (step === 1) {
      if (selectedContactId) return true;
      if (createContact) return contactForm.first_name.trim() && contactForm.last_name.trim() && contactForm.email.trim() && contactForm.phone.trim();
      return false;
    }
    if (step === 2) return selectedProId !== null;
    if (step === 3) return description.length > 0;
    return false;
  };

  const handleNext = () => {
    if (step === 1 && createContact) {
      if (!validateContact()) return;
    }
    setStep(step + 1);
  };

  const inputCls = (hasError?: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors ${
      hasError
        ? "border-red-400 focus:border-red-400 focus:ring-red-100"
        : "border-winelio-gray/20 focus:border-winelio-orange focus:ring-winelio-orange/15"
    }`;

  return (
    <div className="pb-24 lg:pb-0">

      {/* ── Header ── */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/recommendations")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <h1 className="text-2xl font-bold text-winelio-dark tracking-tight">Nouvelle recommandation</h1>
        <p className="mt-1 text-sm text-winelio-gray">Mettez en relation un contact avec un professionnel de confiance</p>
      </div>

      {/* ── Progress steps ── */}
      <div className="mb-8">
        <div className="flex items-center gap-0">
          {STEPS_META.map((s, idx) => (
            <div key={s.number} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    s.number < step
                      ? "bg-green-500 text-white"
                      : s.number === step
                        ? "bg-winelio-orange text-white shadow-md shadow-winelio-orange/30"
                        : "bg-winelio-light text-winelio-gray/50 border border-winelio-gray/15"
                  }`}
                >
                  {s.number < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    s.number
                  )}
                </div>
                <span className={`text-xs font-medium ${s.number === step ? "text-winelio-dark" : "text-winelio-gray/50"}`}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS_META.length - 1 && (
                <div className={`flex-1 h-0.5 mb-5 mx-1 rounded-full transition-colors ${s.number < step ? "bg-green-400" : "bg-winelio-gray/15"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {/* ────────────────── STEP 1: Contact ────────────────── */}
      {step === 1 && (
        <div>
          <div className="mb-6">
            <h2 className="text-lg font-bold text-winelio-dark">Qui a besoin d&apos;un professionnel ?</h2>
            <p className="mt-1 text-sm text-winelio-gray">
              La personne que vous souhaitez mettre en relation — un ami, un voisin, un collègue...
            </p>
          </div>

          {!createContact ? (
            <div className="space-y-3">
              {contacts.length > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-widest text-winelio-gray/60">
                    Contacts existants
                  </p>
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContactId(c.id)}
                      className={`w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                        selectedContactId === c.id
                          ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
                          : "border-transparent bg-white hover:border-winelio-orange/20 shadow-sm"
                      }`}
                    >
                      <Initials name={`${c.first_name} ${c.last_name}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-winelio-dark">{c.first_name} {c.last_name}</p>
                        <p className="text-sm text-winelio-gray truncate">{c.email}</p>
                      </div>
                      {selectedContactId === c.id && (
                        <div className="w-5 h-5 rounded-full bg-winelio-orange flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-winelio-gray/10" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-winelio-light px-3 text-xs text-winelio-gray">ou</span>
                    </div>
                  </div>
                </>
              )}
              <button
                onClick={() => { setCreateContact(true); setSelectedContactId(null); }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-winelio-orange/40 px-5 py-4 text-sm font-semibold text-winelio-orange hover:border-winelio-orange hover:bg-winelio-orange/5 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Ajouter un nouveau contact
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-winelio-gray/10 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-winelio-dark">Nouveau contact</p>
                <button
                  onClick={() => {
                    setCreateContact(false);
                    setContactErrors({});
                    setContactForm({ first_name: "", last_name: "", email: "", phone: "", country_code: "+33" });
                  }}
                  className="text-xs text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer"
                >
                  Annuler
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-winelio-dark">
                    Prénom <span className="text-winelio-orange">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactForm.first_name}
                    onChange={(e) => {
                      setContactForm({ ...contactForm, first_name: e.target.value });
                      if (contactErrors.first_name) setContactErrors({ ...contactErrors, first_name: "" });
                    }}
                    placeholder="Pierre"
                    className={inputCls(!!contactErrors.first_name)}
                  />
                  {contactErrors.first_name && <p className="mt-1 text-xs text-red-500">{contactErrors.first_name}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-winelio-dark">
                    Nom <span className="text-winelio-orange">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactForm.last_name}
                    onChange={(e) => {
                      setContactForm({ ...contactForm, last_name: e.target.value });
                      if (contactErrors.last_name) setContactErrors({ ...contactErrors, last_name: "" });
                    }}
                    placeholder="Dupont"
                    className={inputCls(!!contactErrors.last_name)}
                  />
                  {contactErrors.last_name && <p className="mt-1 text-xs text-red-500">{contactErrors.last_name}</p>}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-winelio-dark">
                  Email <span className="text-winelio-orange">*</span>
                </label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => {
                    setContactForm({ ...contactForm, email: e.target.value });
                    if (contactErrors.email) setContactErrors({ ...contactErrors, email: "" });
                  }}
                  placeholder="pierre.dupont@email.com"
                  className={inputCls(!!contactErrors.email)}
                />
                {contactErrors.email && <p className="mt-1 text-xs text-red-500">{contactErrors.email}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-winelio-dark">
                  Téléphone <span className="text-winelio-orange">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={contactForm.country_code}
                    onChange={(e) => setContactForm({ ...contactForm, country_code: e.target.value })}
                    className="rounded-xl border border-winelio-gray/20 px-2 py-3 text-sm bg-white focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 w-24 shrink-0 cursor-pointer"
                  >
                    <option value="+33">FR +33</option>
                    <option value="+32">BE +32</option>
                    <option value="+41">CH +41</option>
                    <option value="+352">LU +352</option>
                    <option value="+377">MC +377</option>
                    <option value="+1">US +1</option>
                    <option value="+44">UK +44</option>
                    <option value="+49">DE +49</option>
                    <option value="+39">IT +39</option>
                    <option value="+34">ES +34</option>
                    <option value="+351">PT +351</option>
                    <option value="+31">NL +31</option>
                    <option value="+212">MA +212</option>
                    <option value="+216">TN +216</option>
                    <option value="+213">DZ +213</option>
                    <option value="+225">CI +225</option>
                    <option value="+221">SN +221</option>
                    <option value="+237">CM +237</option>
                  </select>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => {
                      setContactForm({ ...contactForm, phone: e.target.value });
                      if (contactErrors.phone) setContactErrors({ ...contactErrors, phone: "" });
                    }}
                    placeholder="6 12 34 56 78"
                    className={inputCls(!!contactErrors.phone)}
                  />
                </div>
                {contactErrors.phone && <p className="mt-1 text-xs text-red-500">{contactErrors.phone}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── STEP 2: Professional ────────────────── */}
      {step === 2 && (
        <div>
          <div className="mb-6">
            <h2 className="text-lg font-bold text-winelio-dark">Quel professionnel recommandez-vous ?</h2>
            <p className="mt-1 text-sm text-winelio-gray">
              Choisissez un professionnel Winelio — si le deal aboutit, vous touchez une commission.
            </p>
          </div>

          {/* Geo buttons */}
          {geoStatus === "idle" && (
            <button
              onClick={requestGeo}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-winelio-orange/40 px-4 py-3.5 text-sm font-semibold text-winelio-orange hover:border-winelio-orange hover:bg-winelio-orange/5 transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Trouver les pros autour de moi
            </button>
          )}
          {geoStatus === "loading" && (
            <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-winelio-orange/8 px-4 py-3.5 text-sm font-medium text-winelio-orange">
              <div className="w-4 h-4 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
              Localisation en cours...
            </div>
          )}
          {geoStatus === "unavailable" && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3.5 text-sm text-amber-700">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Géolocalisation indisponible. Recherchez par nom ou catégorie.
            </div>
          )}
          {geoStatus === "denied" && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-red-50 border border-red-100 px-4 py-3.5 text-sm text-red-600">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Géolocalisation refusée. Recherchez par nom ou catégorie.
            </div>
          )}
          {geoStatus === "granted" && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-green-50 border border-green-100 px-4 py-3.5">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold text-green-800 flex-1">Position activée</span>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-green-700">Rayon :</label>
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="rounded-lg border border-green-200 bg-white px-2 py-1 text-xs text-green-800 focus:outline-none cursor-pointer"
                >
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                  <option value={50}>50 km</option>
                  <option value={100}>100 km</option>
                  <option value={99999}>Toute la France</option>
                </select>
              </div>
            </div>
          )}

          {/* Recherche par code postal */}
          <div className="mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-[160px]">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Code postal"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  className="w-full rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15"
                />
                {postalLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {postalCommunes.length > 0 && (
                <>
                  {postalCommunes.length === 1 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                      <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {postalCommunes[0]}
                    </div>
                  ) : (
                    <select
                      value={selectedCommune ?? ""}
                      onChange={(e) => setSelectedCommune(e.target.value || null)}
                      className="flex-1 rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 bg-white cursor-pointer"
                    >
                      <option value="">Toutes les communes</option>
                      {postalCommunes.map((nom) => (
                        <option key={nom} value={nom}>{nom}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={handleClearPostal}
                    className="flex items-center justify-center w-10 rounded-xl border border-winelio-gray/20 text-winelio-gray hover:text-red-500 hover:border-red-200 transition-colors cursor-pointer"
                    title="Effacer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search + Category */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-winelio-gray/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Rechercher par nom..."
                value={proSearch}
                onChange={(e) => setProSearch(e.target.value)}
                className="w-full rounded-xl border border-winelio-gray/20 pl-10 pr-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-winelio-gray/20 px-4 py-3 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 bg-white cursor-pointer"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          <p className="mb-3 text-xs text-winelio-gray/70">
            {professionals.length} professionnel{professionals.length !== 1 ? "s" : ""} trouvé{professionals.length !== 1 ? "s" : ""}
            {selectedCategory !== "all" && ` · ${selectedCategory}`}
            {selectedCommune && ` · ${selectedCommune}`}
            {geoStatus === "granted" && radius < 99999 && ` · ${radius} km`}
          </p>

          {/* Pro list */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {professionals.map((p) => {
              const displayLabel = p.company_alias ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProId(p.id)}
                  className={`w-full flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                    selectedProId === p.id
                      ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
                      : "border-transparent bg-white hover:border-winelio-orange/20 shadow-sm"
                  }`}
                >
                  <Initials name={displayLabel} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-winelio-dark text-sm font-mono">{displayLabel}</p>
                    {p.company_name && (
                      <p className="text-xs text-winelio-gray truncate">{p.company_name}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {p.avg_rating !== null && (
                        <span className="inline-flex items-center gap-0.5 text-xs">
                          {[1,2,3,4,5].map((s) => (
                            <svg key={s} className="w-3 h-3" viewBox="0 0 20 20" fill={s <= Math.round(p.avg_rating!) ? "#F7931E" : "#E5E7EB"}>
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                          ))}
                          <span className="text-winelio-gray ml-0.5 text-xs">({p.review_count})</span>
                        </span>
                      )}
                      {p.category_name && (
                        <span className="text-xs bg-winelio-orange/10 text-winelio-orange px-2 py-0.5 rounded-full font-medium">
                          {p.category_name}
                        </span>
                      )}
                      {p.city && (
                        <span className="text-xs text-winelio-gray/70">{p.city}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {p.distance !== null && (
                      <span className="text-xs font-bold text-winelio-orange bg-winelio-orange/10 px-2.5 py-1 rounded-full">
                        {p.distance < 1 ? `${Math.round(p.distance * 1000)} m` : `${Math.round(p.distance)} km`}
                      </span>
                    )}
                    {selectedProId === p.id && (
                      <div className="w-5 h-5 rounded-full bg-winelio-orange flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {professionals.length === 0 && (
              <div className="rounded-2xl border border-winelio-gray/10 bg-white py-12 text-center">
                <p className="text-sm font-medium text-winelio-dark">Aucun résultat</p>
                <p className="mt-1 text-xs text-winelio-gray">
                  {geoStatus === "granted" && radius < 99999 ? `Aucun pro dans un rayon de ${radius} km.` : "Modifiez votre recherche."}
                </p>
                {geoStatus === "granted" && radius < 99999 && (
                  <button
                    onClick={() => setRadius(99999)}
                    className="mt-3 text-sm font-medium text-winelio-orange hover:underline cursor-pointer"
                  >
                    Élargir à toute la France
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── STEP 3: Project ────────────────── */}
      {step === 3 && (
        <div>
          <div className="mb-6">
            <h2 className="text-lg font-bold text-winelio-dark">Décrivez le besoin</h2>
            <p className="mt-1 text-sm text-winelio-gray">
              Donnez un contexte au professionnel pour qu&apos;il prépare sa prise de contact.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-winelio-dark">
                Description du projet <span className="text-winelio-orange">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-winelio-gray/20 px-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 resize-none transition-colors"
                placeholder="Ex : Mon ami Pierre cherche un plombier pour une fuite dans sa salle de bain. Il est disponible en semaine..."
              />
              <p className="mt-1.5 text-xs text-winelio-gray/60 text-right">{description.length} caractères</p>
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-winelio-dark">
                Niveau d&apos;urgence
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    { value: "urgent", label: "Urgent", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", active: "border-red-400 bg-red-50 text-red-700" },
                    { value: "normal", label: "Normal", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", active: "border-winelio-orange bg-winelio-orange/8 text-winelio-orange" },
                    { value: "flexible", label: "Flexible", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5", active: "border-green-500 bg-green-50 text-green-700" },
                  ] as const
                ).map((u) => (
                  <button
                    key={u.value}
                    onClick={() => setUrgency(u.value)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-sm font-semibold transition-all cursor-pointer ${
                      urgency === u.value
                        ? u.active
                        : "border-winelio-gray/15 bg-white text-winelio-gray hover:border-winelio-gray/30"
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={u.icon} />
                    </svg>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <StickyFormActions>
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-winelio-gray/20 px-5 py-2.5 text-sm font-semibold text-winelio-gray hover:border-winelio-gray/40 hover:text-winelio-dark transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer"
          >
            Suivant
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canProceed() || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                Envoyer la recommandation
              </>
            )}
          </button>
        )}
      </StickyFormActions>
    </div>
  );
}
