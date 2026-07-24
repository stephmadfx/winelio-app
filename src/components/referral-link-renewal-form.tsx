"use client";

import { FormEvent, useState } from "react";

export function ReferralLinkRenewalForm({ dark = false }: { dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/resend-referral-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return <p role="status" className={`rounded-xl border p-3 text-sm ${dark ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-green-200 bg-green-50 text-green-700"}`}>Si votre compte attend encore son activation, un nouveau lien vient de vous être envoyé.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className={`text-sm ${dark ? "text-gray-400" : "text-winelio-gray"}`}>Lien déjà utilisé, expiré ou téléphone interrompu ? Recevez-en un nouveau.</p>
      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="votre@email.com" className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15 ${dark ? "border-white/20 bg-white/10 text-white placeholder:text-gray-500" : "border-gray-200 bg-white text-winelio-dark"}`} />
      <button type="submit" disabled={loading} className="w-full rounded-xl border border-winelio-orange px-4 py-3 text-sm font-semibold text-winelio-orange transition-colors hover:bg-winelio-orange hover:text-white disabled:opacity-60">{loading ? "Envoi…" : "Recevoir un nouveau lien"}</button>
    </form>
  );
}
