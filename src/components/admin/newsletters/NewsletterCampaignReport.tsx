"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

type Recipient = {
  id: string; email: string; recipient_type: string; sent_at: string | null;
  opened_at: string | null; clicked_at: string | null; failed_at: string | null;
  failure_reason: string | null; unsubscribed_at: string | null;
};
type Report = {
  newsletter: { is_test?: boolean; subject: string; status: string; sent_at: string | null; created_at: string;
    recipient_count: number; sent_count: number; failed_count: number; opened_count: number; clicked_count: number };
  recipients: Recipient[];
  events: { event_type: string; url: string | null; created_at: string }[];
  unsubscribedCount: number; total: number; pageSize: number;
};
const date = (value: string | null) => value ? new Date(value).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
const rate = (count: number, sent: number) => sent ? `${(count / sent * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—";
const statuses: Record<string, string> = { sent: "Envoyée", sending: "En cours d’envoi", failed: "Échec", draft: "Brouillon", scheduled: "Programmée" };
const eventsLabels: Record<string, string> = { sent: "Envoi accepté", failed: "Échec", opened: "Ouverture", clicked: "Clic", unsubscribed: "Désinscription" };

export function NewsletterCampaignReport({ campaignId }: { campaignId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState("all");
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/admin/newsletters/${campaignId}/stats?${new URLSearchParams({ page: String(page), search, filter })}`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chargement impossible");
      if (!controller.signal.aborted) {
        setReport(data); setUpdatedAt(new Date().toISOString());
      }
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Chargement impossible");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [campaignId, page, search, filter, revision]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setRevision(v => v + 1); };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const newsletter = report?.newsletter;
  const pages = Math.max(1, Math.ceil((report?.total ?? 0) / (report?.pageSize ?? 50)));
  return <div className="space-y-6 pb-8">
    <Link href="/gestion-reseau/newsletters" className="inline-flex items-center gap-2 text-sm text-winelio-orange"><ArrowLeft className="size-4" />Toutes les newsletters</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">{newsletter?.is_test ? "Statistiques du mail de test" : "Statistiques de la campagne"}</h1>
        {newsletter && <><p className="mt-2 font-medium">{newsletter.subject}</p><p className="mt-1 text-sm text-muted-foreground">{statuses[newsletter.status] || newsletter.status} · {date(newsletter.sent_at || newsletter.created_at)}</p></>}
      </div>
      <button type="button" disabled={loading} onClick={() => setRevision(v => v + 1)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Actualiser</button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error} <button type="button" onClick={() => setRevision(v => v + 1)} className="ml-2 underline">Réessayer</button></div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Chargement des statistiques…</p>}
    {report && newsletter && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Destinataires", newsletter.recipient_count, "Audience de l’envoi"],
          ["Envois acceptés", newsletter.sent_count, "Par le service email"],
          ["Échecs d’envoi", newsletter.failed_count, "Envois refusés"],
          ["Ouvertures détectées", newsletter.opened_count, rate(newsletter.opened_count, newsletter.sent_count)],
          ["Destinataires ayant cliqué", newsletter.clicked_count, rate(newsletter.clicked_count, newsletter.sent_count)],
          ["Désinscriptions", report.unsubscribedCount, rate(report.unsubscribedCount, newsletter.sent_count)],
        ].map(([label, value, detail]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>)}
      </div>
      {newsletter.is_test && <p className="rounded-xl border border-border bg-card p-4 text-sm">Cet envoi de test possède ses propres statistiques. Sa désinscription est simulée et ne retire personne des futures campagnes.</p>}
      <p className="text-sm text-muted-foreground">Les ouvertures et clics sont comptés par destinataire. Les taux sont calculés sur les envois acceptés. Le blocage des images et les protections des messageries peuvent fausser les ouvertures ou clics. Un envoi accepté ne confirme pas sa réception en boîte de réception.</p>
      <section className="rounded-xl border border-border bg-card p-4 md:p-5" aria-busy={loading}>
        <h2 className="text-lg font-semibold">Détail des destinataires</h2>
        <div className="my-4 flex flex-wrap gap-3">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
            <input type="search" aria-label="Rechercher un destinataire" placeholder="Rechercher un email" value={searchInput} onChange={e => setSearchInput(e.target.value)} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <button className="rounded-lg border border-border px-3 py-2 text-sm" type="submit">Rechercher</button>
          </form>
          <select aria-label="Filtrer les destinataires" value={filter} onChange={e => { setPage(1); setFilter(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">Tous les destinataires</option><option value="opened">Ouverture détectée</option><option value="clicked">Ont cliqué</option><option value="unsubscribed">Désinscrits</option><option value="failed">Échecs</option>
          </select>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">{report.total} résultat{report.total > 1 ? "s" : ""}</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border">{["Email", "Envoi", "Ouverture", "Clic", "Désinscription"].map(label => <th key={label} scope="col" className="p-2 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{report.recipients.map(recipient => <tr key={recipient.id} className="border-b border-border last:border-0"><td className="p-2">{recipient.email}{recipient.failure_reason && <p className="mt-1 max-w-xs text-xs text-red-600">{recipient.failure_reason}</p>}</td>
            <td className="whitespace-nowrap p-2">{recipient.failed_at ? "Échec" : recipient.sent_at ? "Accepté" : "En attente"}<p className="text-xs text-muted-foreground">{date(recipient.failed_at || recipient.sent_at)}</p></td>
            <td className="whitespace-nowrap p-2">{date(recipient.opened_at)}</td><td className="whitespace-nowrap p-2">{date(recipient.clicked_at)}</td><td className="whitespace-nowrap p-2">{date(recipient.unsubscribed_at)}</td></tr>)}</tbody>
        </table></div>
        {!report.recipients.length && <p className="py-6 text-center text-muted-foreground">Aucun destinataire ne correspond à ces critères.</p>}
        <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={page === 1 || loading} onClick={() => setPage(v => v - 1)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Précédent</button><p className="text-sm">Page {page} sur {pages}</p><button type="button" disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Suivant</button></div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4 md:p-5"><h2 className="text-lg font-semibold">Activité récente</h2><p className="mt-1 text-sm text-muted-foreground">Les 100 derniers événements, avec la destination des clics.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Événement</th><th scope="col" className="p-2">Lien cliqué</th></tr></thead><tbody>{report.events.map((event, i) => <tr key={i} className="border-b border-border last:border-0"><td className="whitespace-nowrap p-2">{date(event.created_at)}</td><td className="p-2">{eventsLabels[event.event_type] || event.event_type}</td><td className="max-w-lg break-all p-2 text-muted-foreground">{event.url || "—"}</td></tr>)}</tbody></table></div>{!report.events.length && <p className="py-6 text-muted-foreground">Aucune activité enregistrée pour cette campagne.</p>}
      </section>
      <p className="text-xs text-muted-foreground">Dernière actualisation : {date(updatedAt)} · Actualisation automatique toutes les 30 secondes</p>
    </>}
  </div>;
}
