"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

type Preferences = { share_activity: boolean; share_gains: boolean; daily_digest_frequency: number };
export function FeedPreferences({ request = fetch }: { request?: typeof fetch } = {}) {
  const [value, setValue] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function load() {
    setFailed(false);
    try {
      const res = await request("/api/feed/preferences", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setValue(await res.json());
    } catch { setFailed(true); }
  }
  useEffect(() => { void load(); }, [request]);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const res = await request("/api/feed/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      if (!res.ok) throw new Error();
      setMessage("Vos choix ont été enregistrés.");
    } catch { setMessage("Enregistrement impossible. Vos changements ne sont pas enregistrés. Réessayez."); }
    finally { setBusy(false); }
  }
  return <Card className="!rounded-2xl mb-4"><CardContent className="p-5 sm:p-6 space-y-4">
    <h3 className="font-semibold text-winelio-dark">Actualités du réseau et confidentialité</h3>
    <p className="text-sm text-winelio-gray">Le fil est visible par les membres connectés de Winelio dans toute la France. Votre prénom et l’initiale de votre nom restent des données personnelles. Aucun client, dossier ou coordonnée n’est publié.</p>
    <Link href="/documents-legaux/politique-confidentialite" className="text-sm text-winelio-orange underline">Consulter la politique de confidentialité et exercer mes droits</Link>
    {failed ? <p role="alert">Préférences indisponibles. <button onClick={() => void load()} className="underline">Réessayer</button></p> : !value ? <p role="status">Chargement…</p> : <fieldset disabled={busy} className="space-y-4">
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={value.share_activity} onChange={e => { setMessage(""); setValue({ ...value, share_activity: e.target.checked, share_gains: e.target.checked && value.share_gains }); }} className="mt-1"/><span>Afficher mon activité (arrivée, parrainages et recommandations) avec mon prénom et l’initiale de mon nom.</span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" disabled={!value.share_activity} checked={value.share_gains} onChange={e => { setMessage(""); setValue({ ...value, share_gains: e.target.checked }); }} className="mt-1"/><span>J’accepte aussi de publier le montant de mes gains de recommandation réellement crédités. Les sommes en attente restent privées.</span></label>
      <label className="block text-sm font-medium">Résumés visibles dans l’application
        <select value={value.daily_digest_frequency} onChange={e => { setMessage(""); setValue({ ...value, daily_digest_frequency: Number(e.target.value) }); }} className="block mt-2 w-full rounded-xl border border-gray-200 bg-background px-3 py-2">
          <option value={0}>Désactivés</option><option value={1}>Un résumé par jour maximum</option><option value={2}>Deux résumés par jour maximum</option>
        </select>
      </label>
      <p className="text-xs text-winelio-gray">Les résumés apparaissent à l’ouverture ou au retour dans l’application, uniquement si le réseau a de nouvelles actualités. Aucun email ni notification push. Pour deux résumés : un avant 14 h et un à partir de 14 h, heure de Paris.</p>
      <p className="text-xs text-winelio-gray">L’activité est visible par défaut sous ce format, y compris pour les événements récents déjà survenus. Vous pouvez la masquer ici à tout moment : vos publications seront retirées du fil. Les gains restent privés tant que vous n’avez pas donné votre accord distinct. Les événements sont affichés pendant 30 jours. Vos choix et leur date sont conservés, notamment pour prouver un éventuel accord de publication des gains.</p>
      <button onClick={() => void save()} disabled={busy} className="rounded-xl bg-winelio-orange text-white px-4 py-2 text-sm disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer mes choix"}</button>
    </fieldset>}
    <p role="status" className="text-sm">{message}</p>
  </CardContent></Card>;
}
