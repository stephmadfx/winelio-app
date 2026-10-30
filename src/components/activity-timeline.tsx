"use client";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { FeedEvent } from "@/lib/feed-utils";
import { activityFilters, groupActivityEvents, activityDayLabel, parseActivityFilter, type ActivityFilter } from "@/lib/activity-presentation";
import { useActivityEvents } from "@/hooks/use-activity-events";
import { ActivityEventRow } from "@/components/activity-event-row";

export function ActivityTimeline({ initialEvents, initialError = false, initialNow, demoMode = false }: { initialEvents: FeedEvent[]; initialError?: boolean; initialNow: string; demoMode?: boolean }) {
  const params = useSearchParams();
  const selected = parseActivityFilter(params.get("type"));
  const { events, failed, loading, now, refresh } = useActivityEvents({ initialEvents, initialError, initialNow, demoMode });
  const groups = groupActivityEvents(events, selected);
  function select(filter: ActivityFilter) {
    const url = new URL(window.location.href);
    if (filter === "all") url.searchParams.delete("type"); else url.searchParams.set("type", filter);
    // Pass fresh state so Next updates useSearchParams as well as the URL.
    window.history.replaceState(null, "", url);
  }
  return <section className="-mx-4 -mt-16 min-h-[calc(100dvh-6rem)] bg-card lg:mx-0 lg:mt-0 lg:rounded-2xl lg:ring-1 lg:ring-border" aria-label="Toute l’activité du réseau">
    <header className="sticky top-0 z-20 border-b border-border/60 bg-card/95 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm lg:static lg:rounded-t-2xl lg:px-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/dashboard" aria-label="Retour à l’accueil" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-winelio-orange/10 text-winelio-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-winelio-orange"><ArrowLeft size={22} /></Link>
        <h1 className="text-center text-[20px] font-bold leading-6 tracking-tight text-foreground">Activité du réseau</h1>
        <Link href="/settings#activity-preferences" aria-label="Gérer la visibilité de mon activité" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-winelio-orange"><Settings size={20} /></Link>
      </div>
      <p className="mt-2 text-center text-sm text-muted-foreground">Les nouvelles de toute la France</p>
      {demoMode && <p className="mt-1 text-center text-xs text-winelio-orange">Démonstration</p>}
      <div role="group" aria-label="Filtrer les actualités" className="mt-5 grid grid-cols-[0.8fr_1fr_1.35fr_0.8fr] gap-1.5">{activityFilters.map(filter => <button key={filter.value} onClick={() => select(filter.value)} aria-pressed={selected === filter.value} className={`min-h-11 rounded-xl px-1 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-winelio-orange ${selected === filter.value ? "bg-winelio-orange text-white" : "bg-muted/70 text-foreground hover:bg-muted"}`}>{filter.label}</button>)}</div>
    </header>
    <div className="px-5 pb-5 lg:px-6" aria-busy={loading}>
      {failed ? <div role="status" className="py-8 text-sm leading-6"><p>Les actualités sont momentanément indisponibles.</p><button disabled={loading} onClick={() => void refresh()} className="mt-2 min-h-11 text-winelio-orange underline">Réessayer</button></div> : groups.length ? <div className="space-y-5 pt-5">{groups.map(group => <section key={group.day} aria-label={activityDayLabel(group.day, now)}>
        <h2 className="rounded-lg bg-muted/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{activityDayLabel(group.day, now)}</h2>
        <ul className="divide-y divide-border/60">{group.items.map(event => <ActivityEventRow key={event.id} event={event} referenceTime={now} timeMode="clock" />)}</ul>
      </section>)}</div> : <div role="status" className="py-10 text-center"><p className="text-sm leading-6 text-muted-foreground">{selected === "all" ? "Aucune actualité récente pour le moment." : "Aucune actualité de ce type pour le moment."}</p>{selected !== "all" && <button onClick={() => select("all")} className="mt-3 min-h-11 text-sm font-semibold text-winelio-orange">Afficher toutes les actualités</button>}</div>}
      {!failed && events.length > 0 && <p className="mt-4 text-center text-xs text-muted-foreground">{events.length >= 100 ? "Les 100 actualités les plus récentes · " : ""}Historique des 30 derniers jours</p>}
    </div>
  </section>;
}
