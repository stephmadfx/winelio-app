"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { verifySiren, isValidSirenOrSiret, type SirenVerification } from "@/lib/siren";
import { checkNafCode, type NafCheckResult } from "@/lib/naf-rules";
import { createCompany } from "@/lib/company-actions";
import { validateCompanyDescription } from "@/lib/company-name-validator";

interface Category {
  id: string;
  name: string;
}

export function NewCompanyForm({
  categories,
  personalEmail,
}: {
  categories: Category[];
  personalEmail: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sirenData, setSirenData] = useState<SirenVerification | null>(null);
  const [nafCheck, setNafCheck] = useState<NafCheckResult | null>(null);
  const [usePersonalEmail, setUsePersonalEmail] = useState(false);
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
    insurance_number: "",
    category_id: "",
    description: "",
  });
  const companyEmail = usePersonalEmail ? personalEmail.trim() : form.email.trim();
  const lastVerifiedInputRef = useRef<string>("");

  const runVerify = useCallback(async (rawInput: string): Promise<{
    data: SirenVerification | null;
    naf: NafCheckResult | null;
    err: string | null;
  }> => {
    setVerifying(true);
    setVerifyError(null);
    setSirenData(null);
    setNafCheck(null);
    try {
      const data = await verifySiren(rawInput);
      if (!data) {
        const err = "SIRET/SIREN introuvable dans le registre des entreprises.";
        setVerifyError(err);
        return { data: null, naf: null, err };
      }
      setSirenData(data);
      const naf = checkNafCode(data.naf);
      setNafCheck(naf);
      let err: string | null = null;
      if (!data.actif) {
        err = "⚠️ Cette entreprise est cessée ou radiée.";
        setVerifyError(err);
      } else if (!naf.allowed) {
        err = naf.reason;
        setVerifyError(err);
      }
      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : data.nom,
        legal_name: prev.legal_name.trim() ? prev.legal_name : (data.legal_name || ""),
        address: prev.address.trim() ? prev.address : (data.adresse || ""),
        city: prev.city.trim() ? prev.city : (data.city || ""),
        postal_code: prev.postal_code.trim() ? prev.postal_code : (data.postal_code || ""),
        siret: data.siret || prev.siret,
      }));
      if (data.siret) {
        lastVerifiedInputRef.current = data.siret.replace(/\D/g, "");
      }
      return { data, naf, err };
    } catch {
      const err = "Erreur de connexion au service de vérification.";
      setVerifyError(err);
      return { data: null, naf: null, err };
    } finally {
      setVerifying(false);
    }
  }, []);

  const handleVerify = async () => {
    const parsed = isValidSirenOrSiret(form.siret);
    if (!parsed) return;
    lastVerifiedInputRef.current = parsed.value;
    await runVerify(form.siret);
  };

  // Auto-vérification dès que l'utilisateur saisit un SIREN (9 chiffres) ou SIRET (14 chiffres)
  useEffect(() => {
    const parsed = isValidSirenOrSiret(form.siret);
    if (!parsed) return;
    if (lastVerifiedInputRef.current === parsed.value) return;

    const timer = setTimeout(() => {
      lastVerifiedInputRef.current = parsed.value;
      void runVerify(parsed.value);
    }, 350);

    return () => clearTimeout(timer);
  }, [form.siret, runVerify]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let activeSirenData = sirenData;
    let activeNafCheck = nafCheck;
    let activeName = form.name;
    let activeLegalName = form.legal_name;
    let activeAddress = form.address;
    let activeCity = form.city;
    let activePostalCode = form.postal_code;
    let activeSiret = form.siret;

    // Si un SIRET/SIREN est renseigné mais pas encore vérifié, on le vérifie automatiquement
    if (form.siret.trim() && !activeSirenData) {
      const parsed = isValidSirenOrSiret(form.siret);
      if (!parsed) {
        setError("Le numéro SIREN (9 chiffres) ou SIRET (14 chiffres) est invalide.");
        return;
      }
      const res = await runVerify(form.siret);
      if (res.err || !res.data) {
        setError(res.err ?? "Impossible de vérifier ce SIRET/SIREN.");
        return;
      }
      activeSirenData = res.data;
      activeNafCheck = res.naf;
      activeName = activeName.trim() || res.data.nom;
      activeLegalName = activeLegalName.trim() || res.data.legal_name || "";
      activeAddress = activeAddress.trim() || res.data.adresse || "";
      activeCity = activeCity.trim() || res.data.city || "";
      activePostalCode = activePostalCode.trim() || res.data.postal_code || "";
      activeSiret = res.data.siret || activeSiret;
    }

    if (form.siret.trim() && activeSirenData && !activeSirenData.actif) {
      setError("⚠️ Cette entreprise est cessée ou radiée.");
      return;
    }
    if (form.siret.trim() && activeNafCheck && !activeNafCheck.allowed) {
      setError(activeNafCheck.reason);
      return;
    }
    if (!activeName.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    if (!companyEmail) {
      setError("L’e-mail professionnel est obligatoire pour cette entreprise.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      setError("E-mail professionnel invalide.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Le téléphone est obligatoire.");
      return;
    }
    if (!form.category_id) {
      setError("La catégorie est obligatoire.");
      return;
    }
    if (!form.insurance_number.trim()) {
      setError("Le numéro d'assurance professionnelle est obligatoire.");
      return;
    }

    if (form.description.trim()) {
      const descCheck = validateCompanyDescription(form.description);
      if (!descCheck.ok) {
        setError(descCheck.error ?? "La présentation est invalide.");
        return;
      }
    }

    setSaving(true);

    const result = await createCompany({
      name: activeName,
      legal_name: activeLegalName || undefined,
      email: companyEmail,
      phone: form.phone,
      website: form.website || undefined,
      address: activeAddress || undefined,
      city: activeCity || undefined,
      postal_code: activePostalCode || undefined,
      siret: activeSiret || undefined,
      siren: activeSirenData?.siren || undefined,
      insurance_number: form.insurance_number || undefined,
      // Toute fiche créée manuellement par son owner est marquée vérifiée
      // (l'utilisateur a déclaré sa propre fiche professionnelle).
      // Les fiches scrapées restent is_verified=false côté API import.
      is_verified: true,
      category_id: form.category_id,
      description: form.description || undefined,
    });

    if (result.error) {
      setError(result.error || "Erreur lors de la création. Veuillez réessayer.");
      setSaving(false);
      return;
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
        <div className="mb-4">
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            SIRET / SIREN{" "}
            <span className="text-gray-400 text-xs font-normal">
              (auto-remplit nom, adresse et ville)
            </span>
          </label>
          <div className="flex flex-wrap sm:flex-nowrap gap-2">
            <input
              type="text"
              inputMode="numeric"
              name="siret"
              value={form.siret}
              onChange={(e) => {
                handleChange(e);
                const digits = e.target.value.replace(/\D/g, "");
                if (digits !== lastVerifiedInputRef.current) {
                  setSirenData(null);
                  setNafCheck(null);
                  setVerifyError(null);
                }
              }}
              placeholder="123 456 789 00012"
              className="min-w-0 flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
            />
            <button
              type="button"
              onClick={handleVerify}
              disabled={!isValidSirenOrSiret(form.siret) || verifying}
              className="px-4 py-2.5 bg-winelio-dark text-white text-sm font-semibold rounded-xl hover:bg-winelio-dark/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {verifying ? "Vérification…" : "Vérifier"}
            </button>
          </div>
          {sirenData && sirenData.actif && nafCheck?.allowed && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <div>
                  <div className="font-semibold text-green-800">{sirenData.nom}</div>
                  {(sirenData.adresse || sirenData.postal_code || sirenData.city) && (
                    <div className="text-xs text-green-700 mt-0.5">
                      {[sirenData.adresse, sirenData.postal_code, sirenData.city].filter(Boolean).join(" ")}
                    </div>
                  )}
                  <div className="text-xs text-green-600 mt-1">
                    Active — SIREN {sirenData.siren} — NAF {nafCheck.code}
                  </div>
                </div>
              </div>
            </div>
          )}
          {verifyError && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {verifyError}
              {nafCheck && !nafCheck.allowed && (
                <div className="mt-1.5 text-xs text-red-600">
                  Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez le support.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nom *" name="name" value={form.name} onChange={handleChange} required />
          <Field label="Raison sociale" name="legal_name" value={form.legal_name} onChange={handleChange} />
          <div>
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              E-mail professionnel *
            </label>
            <input
              type="email"
              name="email"
              value={usePersonalEmail ? personalEmail : form.email}
              onChange={handleChange}
              disabled={usePersonalEmail}
              required={!usePersonalEmail}
              placeholder="contact@monentreprise.fr"
              autoComplete="email"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-winelio-gray"
            />
            <p className="mt-1.5 text-xs leading-5 text-winelio-gray">
              Chaque entreprise possède sa propre adresse de contact pour les recommandations.
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-2.5">
              <input
                type="checkbox"
                checked={usePersonalEmail}
                onChange={(e) => setUsePersonalEmail(e.target.checked)}
                disabled={!personalEmail}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#FF6B35]"
              />
              <span className="text-xs leading-5 text-winelio-dark">
                Utiliser mon e-mail personnel <strong>{personalEmail || "indisponible"}</strong>.
              </span>
            </label>
          </div>
          <Field label="Téléphone *" name="phone" value={form.phone} onChange={handleChange} required />
          <Field label="Site web" name="website" value={form.website} onChange={handleChange} />
          <Field label="Adresse" name="address" value={form.address} onChange={handleChange} />
          <Field label="Ville" name="city" value={form.city} onChange={handleChange} />
          <Field label="Code postal" name="postal_code" value={form.postal_code} onChange={handleChange} />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Numéro d&apos;assurance professionnelle *
            </label>
            <input
              type="text"
              name="insurance_number"
              value={form.insurance_number}
              onChange={handleChange}
              required
              placeholder="N° contrat RC pro"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
            />
            <p className="mt-1.5 text-xs text-winelio-gray">
              Obligatoire. Une fois enregistré, ce numéro ne pourra être modifié que via le support.
            </p>
          </div>

          {/* Category select */}
          <div>
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Catégorie *
            </label>
            <select
              name="category_id"
              value={form.category_id}
              onChange={handleChange}
              required
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

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Présentation de l&apos;entreprise / personnelle
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Décrivez votre activité, vos spécialités et vos valeurs en quelques lignes..."
              rows={4}
              maxLength={500}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white resize-none"
            />
            <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-winelio-gray">
              <span>⚠️ Les numéros de téléphone, adresses email et adresses web (liens/URL) ne sont pas autorisés.</span>
              <span className={`shrink-0 font-medium ${form.description.length >= 500 ? "text-red-500" : ""}`}>
                {form.description.length} / 500 caractères
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={saving || verifying || (!!sirenData && !sirenData.actif) || (!!nafCheck && !nafCheck.allowed)}
            className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Création..." : verifying ? "Vérification..." : "Créer l'entreprise"}
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
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
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
        required={required}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
      />
    </div>
  );
}
