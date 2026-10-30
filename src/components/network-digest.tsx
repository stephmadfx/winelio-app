"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function NetworkDigest({ request = fetch }: { request?: typeof fetch } = {}) {
  const [digest, setDigest] = useState<{ id: string; created_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await request("/api/feed/digest", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setDigest(data.digest);
      } catch { /* Optional reminder must not block the dashboard. */ }
    }
    void load();
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    return () => { active = false; window.removeEventListener("focus", focus); };
  }, [request]);
  async function dismiss() {
    if (!digest) return;
    setBusy(true); setError("");
    try {
      const res = await request("/api/feed/digest", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: digest.id }) });
      if (!res.ok) throw new Error();
      setDigest(null);
    } catch { setError("Impossible de fermer le résumé. Réessayez."); }
    finally { setBusy(false); }
  }
  if (!digest) return null;
  return <aside className="rounded-2xl border border-orange-200 bg-winelio-orange/5 p-4 mb-4" aria-label="Résumé quotidien du réseau">
    <div className="flex items-start justify-between gap-3"><div>
      <p className="font-semibold text-winelio-dark">Ça bouge sur Winelio !</p>
      <p className="text-sm text-winelio-gray mt-1">Découvrez les nouvelles recommandations et les réussites du réseau dans le fil d’actualité ci-dessous.</p>
      <Link href="/settings" className="text-xs text-winelio-orange underline">Gérer mes rappels</Link>
    </div><button onClick={() => void dismiss()} disabled={busy} aria-label="Fermer le résumé" className="rounded-lg px-3 py-1 text-xl disabled:opacity-50">×</button></div>
    {error && <p role="alert" className="text-sm mt-2">{error}</p>}
  </aside>;
}
