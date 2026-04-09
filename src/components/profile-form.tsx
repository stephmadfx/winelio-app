"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assignSponsor } from "@/app/(protected)/profile/actions";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  is_professional: boolean;
  sponsor_code: string | null;
  sponsor_id: string | null;
}

const REQUIRED_FIELDS = ["first_name", "last_name", "phone", "postal_code", "city", "address"] as const;

function isComplete(data: Record<string, unknown>) {
  return REQUIRED_FIELDS.every((f) => typeof data[f] === "string" && (data[f] as string).trim() !== "");
}

export function ProfileForm({ profile, userEmail }: { profile: Profile; userEmail: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    postal_code: profile.postal_code ?? "",
    is_professional: profile.is_professional ?? false,
  });
  const [showEmailTooltip, setShowEmailTooltip] = useState(false);
  const [sponsorInput, setSponsorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef(form);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToDb = async (data: typeof form) => {
    setAutoSaveStatus("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        postal_code: data.postal_code || null,
        is_professional: data.is_professional,
      })
      .eq("id", profile.id);
    if (!error) {
      setAutoSaveStatus("saved");
      // Si le profil est maintenant complet, rafraîchit le layout serveur
      // pour que le modal disparaisse sans race condition
      if (isComplete(data)) router.refresh();
    } else {
      setAutoSaveStatus("error");
    }
    setTimeout(() => setAutoSaveStatus("idle"), 3000);
  };

  // Garde formRef toujours à jour
  useEffect(() => { formRef.current = form; }, [form]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Sauvegarde immédiate quand l'utilisateur quitte un champ
  const handleBlur = () => {
    saveToDb(formRef.current);
  };

  const fetchCities = async (postalCode: string) => {
    if (postalCode.length !== 5) { setCitySuggestions([]); return; }
    try {
      const res = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom&format=json`);
      const data: { nom: string }[] = await res.json();
      setCitySuggestions(data.map((c) => c.nom));
    } catch {
      setCitySuggestions([]);
    }
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(e);
    fetchCities(e.target.value);
  };

  const selectCity = (city: string) => {
    const updated = { ...formRef.current, city };
    formRef.current = updated;
    setForm(updated);
    setShowSuggestions(false);
    saveToDb(updated); // Sauvegarde immédiate avec la ville sélectionnée
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    await saveToDb(form);
    setMessage({ type: "success", text: "Profil mis à jour avec succès." });
    setSaving(false);
  };

  const handleSponsor = async () => {
    if (!sponsorInput.trim()) return;
    setSaving(true);
    setMessage(null);
    const result = await assignSponsor(sponsorInput);
    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Parrain ajouté avec succès." });
      setSponsorInput("");
    }
    setSaving(false);
  };

  const copyCode = async () => {
    if (profile.sponsor_code) {
      await navigator.clipboard.writeText(profile.sponsor_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-xl text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Sponsor code (read-only) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-winelio-dark mb-4">
          Votre code parrain
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            readOnly
            value={profile.sponsor_code ?? ""}
            className="flex-1 min-w-0 px-4 py-2.5 bg-winelio-light border border-gray-200 rounded-xl text-winelio-dark font-mono text-lg tracking-wider"
          />
          <button
            onClick={copyCode}
            className="px-4 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
          >
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>
      </div>


      {/* Profile form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-winelio-dark mb-6">
          Informations personnelles
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Email en lecture seule */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Adresse email
            </label>
            <div className="relative">
              <input
                type="email"
                value={userEmail}
                readOnly
                onClick={() => setShowEmailTooltip(true)}
                onBlur={() => setShowEmailTooltip(false)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-gray/60 bg-gray-50 cursor-pointer focus:outline-none"
              />
              {showEmailTooltip && (
                <div className="absolute left-0 top-full mt-2 z-50 bg-winelio-dark text-white text-xs rounded-xl px-4 py-3 shadow-lg max-w-xs leading-relaxed">
                  Pour changer votre adresse email, contactez le support à{" "}
                  <span className="text-winelio-amber font-semibold">support@winelio.app</span>
                  <div className="absolute -top-1.5 left-6 w-3 h-3 bg-winelio-dark rotate-45" />
                </div>
              )}
            </div>
          </div>
          <Field label="Prénom" name="first_name" value={form.first_name} onChange={handleChange} onBlur={handleBlur} required />
          <Field label="Nom" name="last_name" value={form.last_name} onChange={handleChange} onBlur={handleBlur} required />
          <Field label="Téléphone" name="phone" value={form.phone} onChange={handleChange} onBlur={handleBlur} required />
          <Field label="Code postal" name="postal_code" value={form.postal_code} onChange={handlePostalCodeChange} onBlur={handleBlur} required />
          {/* Ville avec autocomplétion */}
          <div className="relative">
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Ville <span className="text-winelio-orange">*</span>
            </label>
            <input
              type="text"
              name="city"
              value={form.city}
              onChange={handleChange}
              onFocus={() => { if (citySuggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); handleBlur(); }}
              autoComplete="off"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
            />
            {showSuggestions && citySuggestions.length > 0 && (
              <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {citySuggestions.map((city) => (
                  <li
                    key={city}
                    onMouseDown={() => selectCity(city)}
                    className="px-4 py-2.5 text-sm text-winelio-dark hover:bg-winelio-orange/5 hover:text-winelio-orange cursor-pointer transition-colors"
                  >
                    {city}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Field label="Adresse" name="address" value={form.address} onChange={handleChange} onBlur={handleBlur} required />
        </div>

        {/* Toggle is_professional */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.is_professional}
            onClick={() => setForm((prev) => ({ ...prev, is_professional: !prev.is_professional }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              form.is_professional ? "bg-winelio-orange" : "bg-gray-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                form.is_professional ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-winelio-dark">
            Compte professionnel
          </span>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
          {autoSaveStatus === "saving" && (
            <span className="text-xs text-winelio-gray animate-pulse">Sauvegarde...</span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="text-xs text-green-500 font-medium">✓ Sauvegardé</span>
          )}
          {autoSaveStatus === "error" && (
            <span className="text-xs text-red-500 font-medium">⚠ Erreur de sauvegarde, réessayez</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  onBlur,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-winelio-gray mb-1">
        {label}
        {required && <span className="text-winelio-orange ml-1">*</span>}
      </label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
      />
    </div>
  );
}
