"use client"

import { useEffect, useState } from "react"
import { FeedEvent, feedEventLabel, feedEventIcon, formatRelativeTime } from "@/lib/feed-utils"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type Props = { initialEvents: FeedEvent[]; demoMode: boolean; className?: string; initialError?: boolean }

export function ActivityFeed({ initialEvents, demoMode, className, initialError = false }: Props) {
  const [events, setEvents] = useState(initialEvents)
  const [failed, setFailed] = useState(initialError)
  const [loading, setLoading] = useState(false)
  async function refresh(signal?: AbortSignal) {
    setLoading(true)
    try {
      const res = await fetch("/api/feed", { cache: "no-store", signal })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEvents(data.events)
      setFailed(false)
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        // Clear stale names/amounts when current consent cannot be checked.
        setEvents([])
        setFailed(true)
      }
    } finally { setLoading(false) }
  }
  useEffect(() => {
    if (demoMode) return
    const controller = new AbortController()
    const timer = setInterval(() => { if (!document.hidden) void refresh(controller.signal) }, 30_000)
    const onFocus = () => { void refresh(controller.signal) }
    window.addEventListener("focus", onFocus)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", onFocus) }
  }, [demoMode])

  const rows = (list: FeedEvent[]) => list.map(event => (
    <div key={event.id} className="feed-item-row flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-3">
      <span aria-hidden="true" className="shrink-0 rounded-full bg-winelio-orange/10 p-2">{feedEventIcon(event.kind)}</span>
      <div className="min-w-0">
        <p className="text-sm text-winelio-dark leading-relaxed break-words">{feedEventLabel(event)}</p>
        {event.kind === "network_summary" && <p className="text-xs text-winelio-orange font-medium">Bilan collectif · historique</p>}
        <time dateTime={event.timestamp} title={new Date(event.timestamp).toLocaleString("fr-FR")} className="text-xs text-winelio-gray">{formatRelativeTime(event.timestamp)}</time>
      </div>
    </div>
  ))
  return (
    <Card className={`!rounded-2xl shadow-sm overflow-hidden ${className ?? ""}`}>
      <CardContent className="p-0 flex flex-col h-[360px]">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-gray-100">
          <div><h3 className="font-bold text-lg text-winelio-dark">Ça bouge sur Winelio</h3><p className="text-xs text-winelio-gray">Tout le réseau, partout en France{demoMode ? " · Démonstration" : ""} · <Link href="/settings" className="underline">Gérer ma visibilité</Link></p></div>
          <Dialog>
            <DialogTrigger className="text-winelio-orange font-bold text-sm shrink-0 hover:underline">Voir tout</DialogTrigger>
            <DialogContent className="sm:max-w-xl max-h-[85dvh] flex flex-col">
              <DialogHeader><DialogTitle>Les actualités Winelio</DialogTitle><DialogDescription>Les événements des 30 derniers jours, du plus récent au plus ancien.</DialogDescription></DialogHeader>
              <div className="min-h-0 overflow-y-auto flex flex-col gap-2">{rows(events)}{!events.length && <p>Aucune actualité à afficher.</p>}</div>
              <Link href="/settings" className="text-sm text-winelio-orange">Gérer ma confidentialité et mes rappels</Link>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" aria-busy={loading}>
          {failed ? <div role="status"><p className="text-sm">Les actualités sont momentanément indisponibles.</p><button disabled={loading} onClick={() => void refresh()} className="text-winelio-orange text-sm underline">Réessayer</button></div> : events.length ? rows(events.slice(0, 5)) : <p className="text-sm text-winelio-gray py-4">Le réseau prépare ses prochaines actualités. Faites votre première recommandation !</p>}
        </div>
      </CardContent>
    </Card>
  )
}
