"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { assignSponsor, updateProfile, updateCompanyEmail } from "@/app/(protected)/profile/actions";
import { triggerDemoSeed } from "@/components/DemoSeedBanner";
import { resolveProfileAvatarUrl } from "@/lib/profile-avatar";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AvatarCropModal } from "@/components/avatar-crop-modal";
import { isAtLeastAge, maxBirthDate } from "@/lib/age";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  birth_date: string | null;
  terms_accepted: boolean;
  terms_accepted_at: string | null;
  avatar: string | null;
  is_professional: boolean;
  pro_engagement_accepted: boolean;
  sponsor_code: string | null;
  sponsor_id: string | null;
}

const REQUIRED_FIELDS = ["first_name", "last_name", "phone", "postal_code", "city", "address", "birth_date", "terms_accepted"] as const;

function isComplete(data: Record<string, unknown>) {
  return REQUIRED_FIELDS.every((f) => typeof data[f] === "string" && (data[f] as string).trim() !== "");
}

export function ProfileForm({ profile, userEmail, companyEmail }: { profile: Profile; userEmail: string; companyEmail?: string | null }) {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    postal_code: profile.postal_code ?? "",
    birth_date: profile.birth_date ?? "",
    terms_accepted: profile.terms_accepted ?? false,
    is_professional: profile.is_professional ?? false,
  });
  const [proEmailInput, setProEmailInput] = useState(companyEmail ?? "");
  const [proEmailSaving, setProEmailSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [showEmailTooltip, setShowEmailTooltip] = useState(false);
  const [sponsorInput, setSponsorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(resolveProfileAvatarUrl(profile.avatar));
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const formRef = useRef(form);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToDb = async (data: typeof form) => {
    if (data.birth_date && !isAtLeastAge(data.birth_date)) {
      setBirthDateError("Vous devez avoir au moins 18 ans pour utiliser Winelio.");
      return false;
    }
    setBirthDateError(null);
    setAutoSaveStatus("saving");
    const result = await updateProfile(data);
    if (!result.error) {
      setAutoSaveStatus("saved");
      // Rafraîchit le layout serveur après chaque save :
      // - profil complet → modal disparaît
      // - champ supprimé → modal réapparaît
      router.refresh();
      // Première complétion du profil → déclencher le seed demo si actif
      if (result.firstCompletion && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        triggerDemoSeed();
      }
    } else {
      setAutoSaveStatus("error");
      return false;
    }
    setTimeout(() => setAutoSaveStatus("idle"), 3000);
    return !result.error;
  };

  // Garde formRef toujours à jour
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => {
    setAvatarPreview(resolveProfileAvatarUrl(profile.avatar));
  }, [profile.avatar]);

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
    const saved = await saveToDb(form);
    if (saved) {
      setMessage({ type: "success", text: "Profil mis à jour avec succès." });
    }
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

  const uploadAvatar = async (blob: Blob) => {
    setCropSrc(null);
    setAvatarUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "avatar.webp");
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Impossible d'envoyer la photo. Réessayez." });
        return;
      }
      setAvatarPreview(resolveProfileAvatarUrl(data.key));
      setMessage({ type: "success", text: "Photo de profil mise à jour." });
      router.refresh();
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    setAvatarUploading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Impossible de supprimer la photo." });
        return;
      }

      setAvatarPreview(null);
      setMessage({ type: "success", text: "Photo de profil supprimée." });
      router.refresh();
    } finally {
      setAvatarUploading(false);
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

      {/* Photo de profil */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Avatar cliquable avec badge ✏️ */}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="relative h-20 w-20 shrink-0 self-center cursor-pointer rounded-full disabled:opacity-50"
            aria-label="Changer la photo de profil"
          >
            <ProfileAvatar
              name={`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || userEmail}
              avatar={avatarPreview}
              className="h-20 w-20 ring-4 ring-winelio-orange/10"
              initialsClassName="text-lg font-extrabold"
            />
            <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-winelio-orange to-winelio-amber text-xs">
              ✏️
            </span>
          </button>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-winelio-dark">Photo de profil</h3>
            <p className="text-sm text-winelio-gray mt-1">
              Recadrée en carré et optimisée automatiquement.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="px-4 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {avatarUploading ? "Envoi..." : (avatarPreview ? "Changer la photo" : "Ajouter une photo")}
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={avatarUploading}
                  className="px-4 py-2.5 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith("image/")) {
              setMessage({ type: "error", text: "Merci de choisir une image valide." });
              return;
            }
            const reader = new FileReader();
            reader.addEventListener("load", () => {
              setCropSrc(reader.result as string);
            });
            reader.readAsDataURL(file);
            if (avatarInputRef.current) avatarInputRef.current.value = "";
          }}
        />
      </div>

      {/* Modal de recadrage */}
      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onComplete={uploadAvatar}
          onCancel={() => setCropSrc(null)}
        />
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


      {/* Email professionnel — visible uniquement pour les pros */}
      {profile.is_professional && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-winelio-dark mb-1">Email professionnel</h3>
          <p className="text-sm text-winelio-gray mb-4">
            Optionnel. C&apos;est l&apos;adresse où vous serez notifié lors d&apos;une nouvelle recommandation,
            en plus de votre email de connexion Winelio.
          </p>
          <div className="flex gap-3 items-start">
            <input
              type="email"
              value={proEmailInput}
              onChange={(e) => setProEmailInput(e.target.value)}
              placeholder="contact@monentreprise.fr"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
            />
            <button
              type="button"
              disabled={proEmailSaving === "saving"}
              onClick={async () => {
                setProEmailSaving("saving");
                const result = await updateCompanyEmail(proEmailInput.trim() || null);
                setProEmailSaving(result.error ? "error" : "saved");
                setTimeout(() => setProEmailSaving("idle"), 3000);
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
            >
              {proEmailSaving === "saving" ? "…" : "Enregistrer"}
            </button>
          </div>
          {proEmailSaving === "saved" && (
            <p className="mt-2 text-xs text-green-600 font-medium">✓ Email professionnel sauvegardé</p>
          )}
          {proEmailSaving === "error" && (
            <p className="mt-2 text-xs text-red-500 font-medium">⚠ Adresse email invalide</p>
          )}
        </div>
      )}

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
          {/* Date de naissance — vérification d'âge 18+ */}
          <div>
            <label className="block text-sm font-medium text-winelio-gray mb-1">
              Date de naissance <span className="text-winelio-orange">*</span>
            </label>
            <input
              type="date"
              name="birth_date"
              value={form.birth_date}
              max={maxBirthDate()}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange"
            />
            <p className="mt-1 text-xs text-winelio-gray">
              La date de naissance sert à vérifier que l'accès est réservé aux personnes majeures.
            </p>
            {birthDateError && (
              <p className="mt-1 text-xs text-red-500">{birthDateError}</p>
            )}
          </div>
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
            onClick={() => {
              if (!form.is_professional) {
                // Activer → rediriger vers onboarding sauf si déjà fait
                if (profile.pro_engagement_accepted) {
                  const updated = { ...form, is_professional: true };
                  setForm(updated);
                  saveToDb(updated);  // sauvegarde immédiate
                } else {
                  router.push("/profile/pro-onboarding");
                }
              } else {
                // Désactiver → sauvegarde immédiate
                const updated = { ...form, is_professional: false };
                setForm(updated);
                saveToDb(updated);
              }
            }}
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

        {/* CGU — placée juste avant le bouton Sauvegarder pour un flow de lecture naturel */}
        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <input
            type="checkbox"
            name="terms_accepted"
            checked={form.terms_accepted}
            onChange={(e) => {
              const updated = { ...formRef.current, terms_accepted: e.target.checked };
              formRef.current = updated;
              setForm(updated);
              saveToDb(updated);
            }}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-winelio-orange focus:ring-winelio-orange"
          />
          <span className="text-sm leading-6 text-winelio-gray">
            J&apos;ai lu et j&apos;accepte les{" "}
            <a
              href="/conditions-generales-utilisation"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-winelio-orange underline underline-offset-2"
            >
              Conditions Générales d&apos;Utilisation Winelio
            </a>
            , y compris les règles d&apos;utilisation de la plateforme, la protection des données et les conditions d&apos;accès aux fonctionnalités de mise en relation et de gains.
          </span>
        </label>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || !form.terms_accepted}
            className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
          {!form.terms_accepted && (
            <span className="text-xs font-medium text-red-500">
              Vous devez accepter les CGU pour finaliser votre profil.
            </span>
          )}
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
