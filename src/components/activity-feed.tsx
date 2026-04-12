"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  FeedEvent,
  feedEventLabel,
  feedEventColor,
  feedEventIcon,
  formatRelativeTime,
} from "@/lib/feed-utils"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"

/* ── Types internes ── */
type FeedItem = FeedEvent & {
  _key: string          // clé unique React (id + timestamp)
  _phase: "entering" | "idle" | "exiting"
}

type Props = {
  initialEvents: FeedEvent[]
  demoMode: boolean
  className?: string
}

const MAX_VISIBLE = 5
const DEMO_MIN_MS = 1500
const DEMO_MAX_MS = 4000
const IDLE_THRESHOLD_MS = 30_000  // 30s sans événement réel → mode veille
const IDLE_RECYCLE_MS  = 5_000   // cadence recycle en mode veille

/* ── Helpers ── */
function randomDelay(): number {
  return DEMO_MIN_MS + Math.random() * (DEMO_MAX_MS - DEMO_MIN_MS)
}

function toFeedItem(event: FeedEvent): FeedItem {
  return { ...event, _key: event.id + "-" + Date.now(), _phase: "entering" }
}

/* ── Composant ── */
export function ActivityFeed({ initialEvents, demoMode, className }: Props) {
  const [items, setItems] = useState<FeedItem[]>(
    () => initialEvents.slice(0, MAX_VISIBLE).map((e) => ({ ...e, _key: e.id, _phase: "idle" as const }))
  )

  // Refs pour les éléments DOM (animation cascade)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Refs pour les timers
  const demoTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEventTimeRef = useRef<number>(Date.now())
  const demoIndexRef     = useRef<number>(0)
  const initialEventsRef = useRef<FeedEvent[]>(initialEvents)

  /* ── Fonction centrale : ajouter un événement avec animation ── */
  const pushEvent = useCallback((event: FeedEvent) => {
    lastEventTimeRef.current = Date.now()
    let keyToRemove: string | null = null

    setItems((prev) => {
      const active = prev.filter((i) => i._phase !== "exiting")

      // Collecter les keys existants pour animer en cascade après le setState
      const existingKeys = active.map((i) => i._key)

      // Programmer l'animation cascade via RAF (après que React ait rendu)
      requestAnimationFrame(() => {
        existingKeys.forEach((key, i) => {
          const el = itemRefs.current.get(key)
          if (!el) return
          el.classList.remove("feed-cascade-active")
          void el.offsetWidth // reflow pour reset animation
          el.style.setProperty("--fd-offset", `${-(10 + i * 4)}px`)
          el.style.setProperty("--fd-delay",  `${i * 45}ms`)
          el.style.setProperty("--fd-dur",    `${0.45 + i * 0.04}s`)
          el.classList.add("feed-cascade-active")
        })
      })

      // Sortir le dernier si déjà MAX_VISIBLE
      let next = [...active]
      if (next.length >= MAX_VISIBLE) {
        const last = next[next.length - 1]
        keyToRemove = last._key
        next[next.length - 1] = { ...last, _phase: "exiting" }
      }

      return [toFeedItem(event), ...next]
    })

    if (keyToRemove) {
      const key = keyToRemove
      setTimeout(() => {
        setItems((p) => p.filter((i) => i._key !== key))
      }, 300)
    }

    // Retirer la classe "entering" après la fin de l'animation
    setTimeout(() => {
      setItems((p) =>
        p.map((i) => (i._phase === "entering" ? { ...i, _phase: "idle" } : i))
      )
    }, 1500)
  }, [])

  /* ── Mode démo : rotation aléatoire des initialEvents ── */
  useEffect(() => {
    if (!demoMode) return

    function scheduleNext() {
      demoTimerRef.current = setTimeout(() => {
        const events = initialEventsRef.current
        if (events.length === 0) return
        const event = events[demoIndexRef.current % events.length]
        demoIndexRef.current++
        pushEvent({ ...event, id: event.id + "-demo-" + demoIndexRef.current, timestamp: new Date().toISOString() })
        scheduleNext()
      }, randomDelay())
    }

    scheduleNext()
    return () => { if (demoTimerRef.current) clearTimeout(demoTimerRef.current) }
  }, [demoMode, pushEvent])

  /* ── Mode production : Supabase Realtime + mode veille ── */
  useEffect(() => {
    if (demoMode) return

    const supabase = createClient()

    /* Supabase Realtime — écoute les INSERTs/UPDATEs sur 4 tables */
    const channel = supabase
      .channel("activity-feed-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "winelio", table: "profiles" },
        (payload) => {
          const row = payload.new as { id: string; first_name: string | null; last_name: string | null; city: string | null; sponsor_id: string | null; created_at: string }
          pushEvent({
            id: "rt-profile-" + row.id,
            kind: "new_referral",
            user: [row.first_name, row.last_name?.charAt(0)].filter(Boolean).join(" ") || "Un membre",
            city: row.city,
            level: 1,
            timestamp: row.created_at,
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "winelio", table: "recommendations" },
        (payload) => {
          const row = payload.new as { id: string; status: string; amount: string | null; updated_at: string }
          if (row.status !== "COMPLETED") return
          pushEvent({
            id: "rt-reco-" + row.id,
            kind: "reco_validated",
            user: "Votre réseau",
            city: null,
            amount: row.amount ? Number(row.amount) : undefined,
            timestamp: row.updated_at,
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "winelio", table: "commission_transactions" },
        (payload) => {
          const row = payload.new as { id: string; user_id: string; amount: string; created_at: string }
          pushEvent({
            id: "rt-commission-" + row.id,
            kind: "commission_received",
            user: "Réseau",
            city: null,
            amount: Number(row.amount),
            timestamp: row.created_at,
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "winelio", table: "withdrawals" },
        (payload) => {
          const row = payload.new as { id: string; amount: string; status: string; updated_at: string }
          if (row.status !== "COMPLETED") return
          pushEvent({
            id: "rt-withdrawal-" + row.id,
            kind: "withdrawal_done",
            amount: Number(row.amount),
            timestamp: row.updated_at,
          })
        }
      )
      .subscribe()

    /* Mode veille : si 30s sans événement réel, recycler à 5s */
    function scheduleIdleCheck() {
      idleTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - lastEventTimeRef.current
        if (elapsed >= IDLE_THRESHOLD_MS) {
          const events = initialEventsRef.current
          if (events.length > 0) {
            const event = events[demoIndexRef.current % events.length]
            demoIndexRef.current++
            pushEvent({ ...event, id: event.id + "-idle-" + demoIndexRef.current, timestamp: new Date().toISOString() })
          }
          idleTimerRef.current = setTimeout(scheduleIdleCheck, IDLE_RECYCLE_MS)
        } else {
          scheduleIdleCheck()
        }
      }, IDLE_THRESHOLD_MS)
    }

    scheduleIdleCheck()

    return () => {
      supabase.removeChannel(channel)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [demoMode, pushEvent])

  /* ── Render ── */
  const hasEvents = items.length > 0

  return (
    <Card className={`!rounded-2xl shadow-sm overflow-hidden ${className ?? ""}`}>
      <CardContent className="p-0 flex flex-col h-[360px] lg:h-[360px]">
        {/* Header fixe */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-winelio-dark">Activité réseau</h3>
            <div className="inline-flex items-center gap-1.5 bg-winelio-orange/10 text-winelio-orange text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
              <span
                className="w-1.5 h-1.5 rounded-full bg-winelio-orange"
                style={{ animation: "feed-live-pulse 1.5s ease-in-out infinite" }}
              />
              Live
            </div>
          </div>
          <Link href="/recommendations" className="text-winelio-orange font-bold text-sm hover:underline">
            Voir tout
          </Link>
        </div>

        {/* Zone de feed — hauteur fixe, overflow hidden */}
        <div className="flex-1 overflow-hidden relative px-4 py-3">
          {/* Fondu en bas */}
          <div
            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none z-10"
            style={{ background: "linear-gradient(to bottom, transparent, white)" }}
          />

          {hasEvents ? (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <FeedItemRow
                  key={item._key}
                  item={item}
                  refCallback={(el) => {
                    if (el) itemRefs.current.set(item._key, el)
                    else itemRefs.current.delete(item._key)
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <p className="text-winelio-gray text-sm">Aucune activité récente.</p>
              <Link href="/network" className="text-winelio-orange font-bold text-sm hover:underline">
                Inviter des membres →
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Ligne d'événement ── */
function FeedItemRow({
  item,
  refCallback,
}: {
  item: FeedItem
  refCallback: (el: HTMLDivElement | null) => void
}) {
  const color  = feedEventColor(item.kind)
  const icon   = feedEventIcon(item.kind)
  const label  = feedEventLabel(item)
  const amount = "amount" in item ? (item as { amount: number }).amount : undefined

  const colorMap = {
    orange: { bg: "bg-winelio-orange/15 text-winelio-orange", badge: "bg-winelio-orange/10 text-winelio-orange", cardBorder: "#FF6B35" },
    amber:  { bg: "bg-winelio-amber/15 text-winelio-amber",   badge: "bg-winelio-amber/10 text-winelio-amber",   cardBorder: "#F7931E" },
    teal:   { bg: "bg-teal-500/15 text-teal-600",             badge: "bg-teal-50 text-teal-600",                 cardBorder: "#14B8A6" },
    purple: { bg: "bg-purple-500/15 text-purple-600",         badge: "bg-purple-50 text-purple-600",             cardBorder: "#8B5CF6" },
  }
  const c = colorMap[color]

  const isEntering = item._phase === "entering"
  const isExiting  = item._phase === "exiting"

  return (
    <div
      ref={refCallback}
      className="feed-item-row flex items-center gap-3 px-3 py-2.5 rounded-2xl relative overflow-hidden flex-shrink-0"
      style={{
        border: `2px solid ${isEntering ? "rgba(255,107,53,0.4)" : c.cardBorder}`,
        animation: isEntering
          ? "feed-push-in 0.42s cubic-bezier(0.34,1.45,0.64,1) forwards, feed-glow-fade 1.5s ease forwards"
          : isExiting
          ? "feed-exit 0.28s ease forwards"
          : undefined,
      }}
    >
      {/* Shimmer sur entrée */}
      {isEntering && (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,107,53,0.08), transparent)",
            animation: "feed-shimmer-in 0.8s ease 0.1s forwards",
            transform: "translateX(-100%)",
          }}
        />
      )}

      {/* Avatar / icône */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 ${c.bg}`}>
        {icon}
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-winelio-dark leading-snug truncate">{label}</p>
        <p className="text-[11px] text-winelio-gray mt-0.5">{formatRelativeTime(item.timestamp)}</p>
      </div>

      {/* Badge montant */}
      {amount !== undefined && amount > 0 && (
        <div className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${c.badge}`}>
          +{Number(amount).toFixed(0)} €
        </div>
      )}

      {/* Badge "Nouveau" */}
      {isEntering && (
        <span
          className="absolute top-1.5 right-2 text-[9px] font-extrabold text-winelio-orange uppercase tracking-wide"
          style={{ animation: "fade-up 2s ease forwards" }}
        >
          Nouveau
        </span>
      )}
    </div>
  )
}
