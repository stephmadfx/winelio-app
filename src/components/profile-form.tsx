"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { assignSponsor, updateProfile, updateCompanyEmail } from "@/app/(protected)/profile/actions";
import { triggerDemoSeed } from "@/components/DemoSeedBanner";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AvatarCropModal } from "@/components/avatar-crop-modal";
import { WelcomeModal } from "@/components/welcome-modal";
import { isAtLeastAge, maxBirthDate } from "@/lib/age";
import { ProOnboardingVideoReplayButton } from "@/components/pro-onboarding-video";

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
  avatar_visible_to_network?: boolean;
  is_professional: boolean;
  pro_engagement_accepted: boolean;
  sponsor_code: string | null;
  sponsor_id: string | null;
}

const REQUIRED_STRING_FIELDS = ["first_name", "last_name", "phone", "postal_code", "city", "address", "birth_date"] as const;

const FIELD_LABELS: Record<typeof REQUIRED_STRING_FIELDS[number], string> = {
  first_name: "Prénom",
  last_name: "Nom",
  phone: "Téléphone",
  postal_code: "Code postal",
  city: "Ville",
  address: "Adresse",
  birth_date: "Date de naissance",
};

function isComplete(data: Record<string, unknown>) {
  return REQUIRED_STRING_FIELDS.every((f) => typeof data[f] === "string" && (data[f] as string).trim() !== "") &&
    data.terms_accepted === true;
}

function getMissingFields(data: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const f of REQUIRED_STRING_FIELDS) {
    if (!(typeof data[f] === "string" && (data[f] as string).trim() !== "")) {
      missing.push(FIELD_LABELS[f]);
    }
  }
  if (!data.terms_accepted) missing.push("Acceptation des CGU");
  return missing;
}

export function ProfileForm({
  profile,
  userEmail,
  companyEmail,
  companyId,
}: {
  profile: Profile;
  userEmail: string;
  companyEmail?: string | null;
  companyId?: string | null;
}) {
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
  // On stocke la clé brute (ex: "users/<id>/<file>.webp"). ProfileAvatar la résout
  // en interne via resolveProfileAvatarUrl — passer une URL déjà résolue produirait
  // un double préfixe `/api/avatars/api/avatars/...` qui 404.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarVisibleToNetwork, setAvatarVisibleToNetwork] = useState(profile.avatar_visible_to_network !== false);
  const [avatarVisibilitySaving, setAvatarVisibilitySaving] = useState<"idle" | "saving" | "saved">("idle");
  const [showWelcome, setShowWelcome] = useState(false);
  const formRef = useRef(form);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sélecteur date de naissance en 3 parties
  const parseBirthDate = (d: string) => ({ y: d.slice(0, 4), m: d.slice(5, 7), day: d.slice(8, 10) });
  const [birthParts, setBirthParts] = useState(() =>
    form.birth_date ? parseBirthDate(form.birth_date) : { y: "", m: "", day: "" }
  );
  const handleBirthPart = (part: "day" | "m" | "y", value: string) => {
    const next = { ...birthParts, [part]: value };
    setBirthParts(next);
    if (next.y && next.m && next.day) {
      const dateStr = `${next.y}-${next.m}-${next.day}`;
      if (!isAtLeastAge(dateStr)) {
        setBirthDateError("Vous devez avoir au moins 18 ans pour utiliser Winelio.");
        return;
      }
      setBirthDateError(null);
      const updated = { ...formRef.current, birth_date: dateStr };
      formRef.current = updated;
      setForm(updated);
      saveToDb(updated);
    } else {
      const updated = { ...formRef.current, birth_date: "" };
      formRef.current = updated;
      setForm(updated);
    }
  };

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
      // Première complétion du profil
      if (result.firstCompletion) {
        setShowWelcome(true);
        // Desactive pour la production
        // if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        //   triggerDemoSeed();
        // }
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
    setAvatarPreview(profile.avatar);
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
      setAvatarPreview(data.key);
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
      {showWelcome && (
        <WelcomeModal
          firstName={form.first_name || profile.first_name}
          onClose={() => setShowWelcome(false)}
        />
      )}
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

      {/* Bannière d'inscription incomplète */}
      {!isComplete(form) && (() => {
        const missing = getMissingFields(form);
        return (
          <div className="p-4 rounded-xl border-2 border-winelio-orange/40 bg-gradient-to-r from-winelio-orange/5 to-winelio-amber/5 flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-winelio-orange/15 text-winelio-orange text-lg animate-pulse">
              ⚠️
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-winelio-dark">
                Finalisation de votre inscription requise
              </h4>
              <p className="text-xs text-winelio-gray mt-1 leading-relaxed">
                Les champs ci-dessous sont obligatoires pour accéder à l&apos;application. Ils sont mis en surbrillance dans le formulaire.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missing.map((label) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-winelio-orange/10 border border-winelio-orange/30 text-winelio-orange text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-winelio-orange inline-block" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

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

        {/* Toggle RGPD : visibilité de la photo dans le réseau */}
        <div className="mt-5 pt-5 border-t border-gray-100 flex items-start gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={avatarVisibleToNetwork}
            onClick={async () => {
              const next = !avatarVisibleToNetwork;
              setAvatarVisibleToNetwork(next);
              setAvatarVisibilitySaving("saving");
              const result = await updateProfile({ avatar_visible_to_network: next });
              if (result.error) {
                setAvatarVisibleToNetwork(!next);
                setMessage({ type: "error", text: result.error });
                setAvatarVisibilitySaving("idle");
              } else {
                setAvatarVisibilitySaving("saved");
                setTimeout(() => setAvatarVisibilitySaving("idle"), 2500);
                router.refresh();
              }
            }}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              avatarVisibleToNetwork ? "bg-winelio-orange" : "bg-gray-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                avatarVisibleToNetwork ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <div className="flex-1">
            <span className="text-sm font-medium text-winelio-dark">
              Afficher ma photo dans mon réseau
            </span>
            <p className="text-xs text-winelio-gray mt-0.5 leading-relaxed">
              Si désactivé, votre parrain et vos filleuls voient uniquement vos initiales. Vous restez libre de désactiver à tout moment (RGPD Art. 21).
            </p>
            {avatarVisibilitySaving === "saved" && (
              <p className="text-xs text-green-600 font-medium mt-1">✓ Préférence enregistrée</p>
            )}
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


      {/* Profil professionnel — visible uniquement pour les pros */}
      {profile.is_professional && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-winelio-dark">Profil professionnel</h3>
              <p className="mt-1 text-sm text-winelio-gray">
                Retrouvez ici vos réglages pro et la vidéo de rappel du parcours.
              </p>
            </div>
            <ProOnboardingVideoReplayButton label="Revoir la vidéo pro" className="w-full sm:w-auto" />
          </div>

          {/* Lien d'accès direct à la fiche pro */}
          <div className="mb-6 pb-6 border-b border-gray-100 flex flex-col gap-4">
            {!companyId && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                <span className="text-xl">⚠️</span>
                <div>
                  <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide">Fiche entreprise manquante</h5>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Vous devez obligatoirement créer et configurer votre fiche entreprise pour pouvoir recevoir des leads et accéder à l'application.
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-winelio-dark">Ma fiche professionnelle</h4>
                <p className="text-xs text-winelio-gray mt-1">
                  Visualisez et modifiez les informations de votre entreprise (Siret, adresse, etc.).
                </p>
              </div>
              <Link
                href={companyId ? `/companies/${companyId}/edit` : "/companies"}
                className={`inline-flex items-center justify-center px-5 py-2.5 ${!companyId ? 'bg-winelio-orange shadow-[0_4px_12px_rgba(255,107,53,0.2)]' : 'bg-gradient-to-r from-winelio-orange to-winelio-amber'} text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap`}
              >
                {!companyId ? "Créer ma fiche pro →" : "Gérer ma fiche pro →"}
              </Link>
            </div>
          </div>

          {/* Email professionnel */}
          <h4 className="text-sm font-semibold text-winelio-dark mb-1">E-mail professionnel</h4>
          <p className="text-xs text-winelio-gray mb-4">
            Adresse de contact de votre entreprise pour les nouvelles recommandations. Elle peut être identique à votre e-mail personnel.
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
              className="px-5 py-2.5 bg-winelio-dark text-white font-medium rounded-xl hover:bg-winelio-dark/90 transition-colors disabled:opacity-50 whitespace-nowrap"
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
              E-mail personnel de connexion
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
          <Field label="Prénom" name="first_name" value={form.first_name} onChange={handleChange} onBlur={handleBlur} required missing={!form.first_name.trim()} />
          <Field label="Nom" name="last_name" value={form.last_name} onChange={handleChange} onBlur={handleBlur} required missing={!form.last_name.trim()} />
          <Field label="Téléphone" name="phone" value={form.phone} onChange={handleChange} onBlur={handleBlur} required missing={!form.phone.trim()} />
          {/* Date de naissance — vérification d'âge 18+ */}
          <BirthDateField
            birthParts={birthParts}
            handleBirthPart={handleBirthPart}
            missing={!form.birth_date.trim()}
            birthDateError={birthDateError}
          />
          <Field label="Code postal" name="postal_code" value={form.postal_code} onChange={handlePostalCodeChange} onBlur={handleBlur} required missing={!form.postal_code.trim()} />
          {/* Ville avec autocomplétion */}
          <CityField
            value={form.city}
            missing={!form.city.trim()}
            onChange={handleChange}
            onBlur={handleBlur}
            citySuggestions={citySuggestions}
            showSuggestions={showSuggestions}
            setShowSuggestions={setShowSuggestions}
            selectCity={selectCity}
          />

          <Field label="Adresse" name="address" value={form.address} onChange={handleChange} onBlur={handleBlur} required missing={!form.address.trim()} />
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
  missing,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  required?: boolean;
  missing?: boolean;
}) {
  return (
    <div className={missing ? "rounded-xl p-3 -m-3 border-2 border-winelio-orange/50 bg-winelio-orange/5" : ""}>
      <label className="block text-sm font-medium mb-1">
        <span className={missing ? "text-winelio-orange font-semibold" : "text-winelio-gray"}>
          {label}
        </span>
        {required && <span className="text-winelio-orange ml-1">*</span>}
        {missing && (
          <span className="ml-2 text-xs font-semibold text-winelio-orange bg-winelio-orange/10 px-2 py-0.5 rounded-full">
            Requis
          </span>
        )}
      </label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={`w-full px-4 py-2.5 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange border ${
          missing ? "border-winelio-orange/50" : "border-gray-200"
        }`}
      />
    </div>
  );
}

function BirthDateField({
  birthParts,
  handleBirthPart,
  missing,
  birthDateError,
}: {
  birthParts: { day: string; m: string; y: string };
  handleBirthPart: (part: "day" | "m" | "y", value: string) => void;
  missing: boolean;
  birthDateError: string | null;
}) {
  const borderClass = missing ? "border-winelio-orange/50" : "border-gray-200";
  return (
    <div className={missing ? "rounded-xl border-2 border-winelio-orange/50 bg-winelio-orange/5 p-3" : ""}>
      <label className="block text-sm font-medium mb-1">
        <span className={missing ? "text-winelio-orange font-semibold" : "text-winelio-gray"}>
          Date de naissance
        </span>
        {" "}<span className="text-winelio-orange">*</span>
        {missing && (
          <span className="ml-2 text-xs font-semibold text-winelio-orange bg-winelio-orange/10 px-2 py-0.5 rounded-full">
            Requis
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <select
          value={birthParts.day}
          onChange={(e) => handleBirthPart("day", e.target.value)}
          className={`flex-1 px-3 py-2.5 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white border ${borderClass}`}
        >
          <option value="">Jour</option>
          {Array.from({ length: 31 }, (_, i) => {
            const v = String(i + 1).padStart(2, "0");
            return <option key={v} value={v}>{i + 1}</option>;
          })}
        </select>
        <select
          value={birthParts.m}
          onChange={(e) => handleBirthPart("m", e.target.value)}
          className={`flex-[1.4] px-3 py-2.5 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white border ${borderClass}`}
        >
          <option value="">Mois</option>
          {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map((name, i) => {
            const v = String(i + 1).padStart(2, "0");
            return <option key={v} value={v}>{name}</option>;
          })}
        </select>
        <select
          value={birthParts.y}
          onChange={(e) => handleBirthPart("y", e.target.value)}
          className={`flex-[1.2] px-3 py-2.5 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white border ${borderClass}`}
        >
          <option value="">Année</option>
          {Array.from({ length: new Date().getFullYear() - 18 - 1919 }, (_, i) => {
            const y = new Date().getFullYear() - 18 - i;
            return <option key={y} value={String(y)}>{y}</option>;
          })}
        </select>
      </div>
      <p className="mt-1 text-xs text-winelio-gray">
        La date de naissance sert à vérifier que l&apos;accès est réservé aux personnes majeures.
      </p>
      {birthDateError && (
        <p className="mt-1 text-xs text-red-500">{birthDateError}</p>
      )}
    </div>
  );
}

function CityField({
  value,
  missing,
  onChange,
  onBlur,
  citySuggestions,
  showSuggestions,
  setShowSuggestions,
  selectCity,
}: {
  value: string;
  missing: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  citySuggestions: string[];
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  selectCity: (city: string) => void;
}) {
  return (
    <div className={`relative${missing ? " rounded-xl border-2 border-winelio-orange/50 bg-winelio-orange/5 p-3" : ""}`}>
      <label className="block text-sm font-medium mb-1">
        <span className={missing ? "text-winelio-orange font-semibold" : "text-winelio-gray"}>
          Ville
        </span>
        {" "}<span className="text-winelio-orange">*</span>
        {missing && (
          <span className="ml-2 text-xs font-semibold text-winelio-orange bg-winelio-orange/10 px-2 py-0.5 rounded-full">
            Requis
          </span>
        )}
      </label>
      <input
        type="text"
        name="city"
        value={value}
        onChange={onChange}
        onFocus={() => { if (citySuggestions.length > 0) setShowSuggestions(true); }}
        onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); onBlur(); }}
        autoComplete="off"
        className={`w-full px-4 py-2.5 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange border ${
          missing ? "border-winelio-orange/50" : "border-gray-200"
        }`}
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
  );
}
