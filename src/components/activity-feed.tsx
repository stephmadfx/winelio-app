"use client";
import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import type { FeedEvent } from "@/lib/feed-utils";
import { useActivityEvents } from "@/hooks/use-activity-events";
import { ActivityEventRow } from "@/components/activity-event-row";
import { Card, CardContent } from "@/components/ui/card";

type Props = { initialEvents: FeedEvent[]; demoMode: boolean; className?: string; initialError?: boolean; initialNow?: string; viewport?: "mobile" | "desktop" };
export function ActivityFeed({ className, ...options }: Props) {
  const { events, failed, loading, now, refresh } = useActivityEvents(options);
  return <Card className={`activity-feed-preview gap-0 rounded-[22px] py-0 shadow-sm ${className ?? ""}`}>
    <CardContent className="!p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0"><h3 className="text-[18px] font-bold leading-6 tracking-tight text-foreground">Ça bouge sur Winelio</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Tout le réseau, partout en France{options.demoMode ? " · Démonstration" : ""}</p></div>
        <Link href="/settings#activity-preferences" aria-label="Gérer la visibilité de mon activité" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-winelio-orange"><Settings size={20} strokeWidth={1.7} /></Link>
      </div>
      <div className="px-5" aria-busy={loading}>
        {failed ? <div role="status" className="py-5 text-sm"><p>Les actualités sont momentanément indisponibles.</p><button disabled={loading} onClick={() => void refresh()} className="mt-2 min-h-11 text-winelio-orange underline">Réessayer</button></div> : events.length ? <ul aria-label="Dernières actualités du réseau" className="divide-y divide-border/60">{events.slice(0, options.viewport === "desktop" ? 5 : 3).map(event => <ActivityEventRow key={event.id} event={event} referenceTime={now} />)}</ul> : <p className="py-6 text-sm leading-6 text-muted-foreground">Le réseau prépare ses prochaines actualités. Faites votre première recommandation !</p>}
        <Link href="/activity" className="mb-4 flex min-h-12 items-center justify-center gap-3 rounded-xl bg-winelio-orange/10 px-4 py-3 text-sm font-semibold text-winelio-orange transition-colors hover:bg-winelio-orange/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-winelio-orange">Toute l’activité<ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </CardContent>
  </Card>;
}
