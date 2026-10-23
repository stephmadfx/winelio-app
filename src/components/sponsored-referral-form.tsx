"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type FormState = {
  firstName: string; lastName: string; email: string; phone: string; birthDate: string;
  address: string; postalCode: string; city: string;
};

const EMPTY_FORM: FormState = {
  firstName: "", lastName: "", email: "", phone: "", birthDate: "", address: "",
  postalCode: "", city: "",
};

const INPUT_CLASS = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-winelio-dark outline-none transition focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15 dark:border-border dark:bg-background";

function Field({ label, name, value, onChange, type = "text", placeholder, required = true, inputMode }: {
  label: string; name: keyof FormState; value: string; onChange: (name: keyof FormState, value: string) => void;
  type?: string; placeholder?: string; required?: boolean; inputMode?: "text" | "email" | "tel" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-winelio-gray">{label}{required && <span className="text-winelio-orange"> *</span>}</span>
      <input className={INPUT_CLASS} name={name} value={value} onChange={(event) => onChange(name, event.target.value)} type={type} placeholder={placeholder} required={required} inputMode={inputMode} autoComplete="off" />
    </label>
  );
}

export function SponsoredReferralForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const update = (name: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/network/pre-register-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Impossible d’envoyer la préinscription.");
      setSuccess(true);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-lg font-bold text-winelio-dark">Préinscription envoyée</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-winelio-gray">Le filleul apparaît maintenant dans votre réseau avec le statut « En attente ». Il vient de recevoir le lien lui permettant de confirmer son compte et de créer son mot de passe.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/network" className="rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3 text-sm font-semibold text-white">Voir mon réseau</Link>
          <button type="button" onClick={() => { setForm(EMPTY_FORM); setSuccess(false); }} className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-winelio-dark">Ajouter un autre filleul</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <p className="text-sm text-winelio-gray">Votre filleul rejoint Winelio comme particulier. Il pourra créer sa fiche professionnelle depuis son compte.</p>

      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-winelio-dark">Informations personnelles</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" name="firstName" value={form.firstName} onChange={update} />
          <Field label="Nom" name="lastName" value={form.lastName} onChange={update} />
          <Field label="E-mail personnel" name="email" value={form.email} onChange={update} type="email" inputMode="email" />
          <div>
            <Field label="Téléphone" name="phone" value={form.phone} onChange={update} type="tel" inputMode="tel" placeholder="0612345678 ou +32…" />
            <p className="mt-1.5 text-[11px] leading-4 text-winelio-gray">Un seul compte est autorisé par numéro de téléphone.</p>
          </div>
          <Field label="Date de naissance" name="birthDate" value={form.birthDate} onChange={update} type="date" />
          <div className="sm:col-span-2"><Field label="Adresse" name="address" value={form.address} onChange={update} /></div>
          <Field label="Code postal" name="postalCode" value={form.postalCode} onChange={update} inputMode="numeric" />
          <Field label="Ville" name="city" value={form.city} onChange={update} />
        </div>
      </section>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs leading-relaxed text-violet-800">
        Le filleul recevra un e-mail de validation. Il acceptera lui-même les <Link href="/documents-legaux" target="_blank" className="font-bold underline">conditions générales</Link> et créera son mot de passe ; celui-ci ne vous sera jamais communiqué.
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "Envoi en cours…" : "Préinscrire ce particulier"}
      </button>
    </form>
  );
}
