"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CreatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (password !== confirmation) return setError("Les deux mots de passe ne correspondent pas.");
    if (!termsAccepted) return setError("Vous devez accepter les conditions générales.");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, termsAccepted, activation: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Activation impossible.");
      await fetch("/api/network/new-referral", { method: "POST" }).catch(() => undefined);
      try { localStorage.setItem("winelio_known_user", "1"); } catch {}
      router.replace("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-winelio-dark px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-white">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h1 className="text-center text-2xl font-bold text-winelio-dark">Créez votre mot de passe</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-winelio-gray">Votre adresse e-mail est confirmée. Choisissez maintenant un mot de passe personnel pour activer votre compte.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-winelio-gray">Mot de passe</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15" /><span className="mt-1 block text-[10px] text-gray-400">8 caractères minimum</span></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-winelio-gray">Confirmer le mot de passe</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15" /></label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-winelio-light p-3 text-xs leading-relaxed text-winelio-gray"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-winelio-orange" />J’accepte les <Link href="/documents-legaux" target="_blank" className="font-semibold text-winelio-orange underline">conditions générales et la politique de confidentialité</Link>.</label>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60">{loading ? "Activation…" : "Activer mon compte"}</button>
        </form>
      </div>
    </main>
  );
}
