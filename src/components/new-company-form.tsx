"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { geocodeAddress } from "@/lib/geocode";
import { generateUniqueAlias } from "@/lib/generate-alias";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
}

export function NewCompanyForm({
  categories,
  userId,
}: {
  categories: Category[];
  userId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    postal_code: "",
    siret: "",
    category_id: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const alias = await generateUniqueAlias(supabase);

    const { error: insertError } = await supabase.from("companies").insert({
      name: form.name,
      legal_name: form.legal_name || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      address: form.address || null,
      city: form.city || null,
      postal_code: form.postal_code || null,
      siret: form.siret || null,
      category_id: form.category_id || null,
      owner_id: userId,
      alias,
    });

    if (insertError) {
      setError("Erreur lors de la création. Veuillez réessayer.");
      setSaving(false);
      return;
    }

    // Auto-geocode address and update profile with coordinates
    if (form.city || form.postal_code) {
      const coords = await geocodeAddress(
        form.address,
        form.city,
        form.postal_code
      );
      if (coords) {
        await supabase
          .from("profiles")
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude,
            city: form.city || undefined,
            postal_code: form.postal_code || undefined,
          })
          .eq("id", userId);
      }
    }

    router.push("/companies");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-winelio-dark mb-6">
          Informations de l&apos;entreprise
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nom *" name="name" value={form.name} onChange={handleChange} />
          <Field label="Raison sociale" name="legal_name" value={form.legal_name} onChange={handleChange} />
          <Field label="Email" name="email" value={form.email} onChange={handleChange} type="email" />
          <Field label="Téléphone" name="phone" value={form.phone} onChange={handleChange} />
          <Field label="Site web" name="website" value={form.website} onChange={handleChange} />
          <Field label="SIRET" name="siret" value={form.siret} onChange={handleChange} />
          <Field label="Adresse" name="address" value={form.address} onChange={handleChange} />
          <Field label="Ville" name="city" value={form.city} onChange={handleChange} />
          <Field label="Code postal" name="postal_code" value={form.postal_code} onChange={handleChange} />

          {/* Category select */}
          <div>
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Catégorie
            </label>
            <select
              name="category_id"
              value={form.category_id}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white"
            >
              <option value="">Sélectionner une catégorie</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Création..." : "Créer l'entreprise"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/companies")}
            className="px-6 py-3 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-winelio-gray mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
      />
    </div>
  );
}
