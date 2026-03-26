"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  sponsored_by: string | null;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [form, setForm] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    postal_code: profile.postal_code ?? "",
    is_professional: profile.is_professional ?? false,
  });
  const [sponsorInput, setSponsorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        postal_code: form.postal_code || null,
        is_professional: form.is_professional,
      })
      .eq("id", profile.id);

    if (error) {
      setMessage({ type: "error", text: "Erreur lors de la sauvegarde." });
    } else {
      setMessage({ type: "success", text: "Profil mis à jour avec succès." });
    }
    setSaving(false);
  };

  const handleSponsor = async () => {
    if (!sponsorInput.trim()) return;
    setSaving(true);
    setMessage(null);
    const supabase = createClient();

    // Find the sponsor by their sponsor_code
    const { data: sponsor } = await supabase
      .from("profiles")
      .select("id")
      .eq("sponsor_code", sponsorInput.trim())
      .single();

    if (!sponsor) {
      setMessage({ type: "error", text: "Code parrain invalide." });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ sponsored_by: sponsor.id })
      .eq("id", profile.id);

    if (error) {
      setMessage({ type: "error", text: "Erreur lors de l'ajout du parrain." });
    } else {
      setMessage({ type: "success", text: "Parrain ajouté avec succès." });
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
        <h3 className="text-lg font-semibold text-kiparlo-dark mb-4">
          Votre code parrain
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            readOnly
            value={profile.sponsor_code ?? ""}
            className="flex-1 px-4 py-2.5 bg-kiparlo-light border border-gray-200 rounded-xl text-kiparlo-dark font-mono text-lg tracking-wider"
          />
          <button
            onClick={copyCode}
            className="px-4 py-2.5 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
          >
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>
      </div>

      {/* Sponsor input (if not already sponsored) */}
      {!profile.sponsored_by && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-kiparlo-dark mb-4">
            Entrer un code parrain
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={sponsorInput}
              onChange={(e) => setSponsorInput(e.target.value)}
              placeholder="Code parrain"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-kiparlo-dark focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/50 focus:border-kiparlo-orange"
            />
            <button
              onClick={handleSponsor}
              disabled={saving}
              className="px-4 py-2.5 border-2 border-kiparlo-orange text-kiparlo-orange font-medium rounded-xl hover:bg-kiparlo-orange hover:text-white transition-colors disabled:opacity-50"
            >
              Valider
            </button>
          </div>
        </div>
      )}

      {/* Profile form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-kiparlo-dark mb-6">
          Informations personnelles
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Prénom" name="first_name" value={form.first_name} onChange={handleChange} />
          <Field label="Nom" name="last_name" value={form.last_name} onChange={handleChange} />
          <Field label="Téléphone" name="phone" value={form.phone} onChange={handleChange} />
          <Field label="Code postal" name="postal_code" value={form.postal_code} onChange={handleChange} />
          <Field label="Ville" name="city" value={form.city} onChange={handleChange} />
          <Field label="Adresse" name="address" value={form.address} onChange={handleChange} />
        </div>

        {/* Toggle is_professional */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.is_professional}
            onClick={() => setForm((prev) => ({ ...prev, is_professional: !prev.is_professional }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              form.is_professional ? "bg-kiparlo-orange" : "bg-gray-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                form.is_professional ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-kiparlo-dark">
            Compte professionnel
          </span>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
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
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-kiparlo-gray mb-1">
        {label}
      </label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-kiparlo-dark focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/50 focus:border-kiparlo-orange"
      />
    </div>
  );
}
