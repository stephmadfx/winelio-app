// src/components/network-feed.tsx
"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { FeedItem } from "@/components/feed-item"
import { FeedEvent, formatUserName } from "@/lib/feed-utils"
import { createClient } from "@/lib/supabase/client"

interface NetworkFeedProps {
  initialGlobalEvents: FeedEvent[]
  initialPersonalEvents: FeedEvent[]
  networkIds: string[]
  userId: string
}

// Génère un ID unique simple sans dépendance externe
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function NetworkFeed({
  initialGlobalEvents,
  initialPersonalEvents,
  networkIds,
  userId,
}: NetworkFeedProps) {
  const [globalEvents, setGlobalEvents] = useState<FeedEvent[]>(initialGlobalEvents)
  const [personalEvents, setPersonalEvents] = useState<FeedEvent[]>(initialPersonalEvents)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  const prependGlobal = (event: FeedEvent) => {
    setNewIds((prev) => new Set(prev).add(event.id))
    setGlobalEvents((prev) => [event, ...prev].slice(0, 20))
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev)
        next.delete(event.id)
        return next
      })
    }, 600)
  }

  const prependPersonal = (event: FeedEvent) => {
    setNewIds((prev) => new Set(prev).add(event.id))
    setPersonalEvents((prev) => [event, ...prev].slice(0, 20))
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev)
        next.delete(event.id)
        return next
      })
    }, 600)
  }

  useEffect(() => {
    const supabase = createClient()

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel("network-feed-realtime")

      // Commission EARNED > 100€
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "commission_transactions",
          filter: "status=eq.EARNED",
        },
        async (payload) => {
          const row = payload.new as {
            id: string
            user_id: string
            amount: number
            status: string
            created_at: string
          }
          if (row.amount <= 100) return

          const { data: prof } = await supabase
            .from("profiles")
            .select("first_name, last_name, city")
            .eq("id", row.user_id)
            .single()

          const eventId = uid()

          if (networkIds.includes(row.user_id)) {
            prependPersonal({
              id: eventId,
              kind: "commission_received",
              user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
              city: prof?.city ?? null,
              amount: row.amount,
              timestamp: row.created_at,
            })
          } else {
            prependGlobal({
              id: eventId,
              kind: "big_commission",
              user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
              city: prof?.city ?? null,
              amount: row.amount,
              timestamp: row.created_at,
            })
          }
        }
      )

      // Reco COMPLETED
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "recommendations",
          filter: "status=eq.COMPLETED",
        },
        async (payload) => {
          const row = payload.new as {
            id: string
            referrer_id: string
            amount: number | null
            status: string
            created_at: string
          }

          const { data: prof } = await supabase
            .from("profiles")
            .select("first_name, last_name, city")
            .eq("id", row.referrer_id)
            .single()

          const eventId = uid()

          if (networkIds.includes(row.referrer_id)) {
            prependPersonal({
              id: eventId,
              kind: "reco_validated",
              user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
              city: prof?.city ?? null,
              amount: row.amount ?? undefined,
              timestamp: row.created_at,
            })
          } else if (row.amount && row.amount > 500) {
            prependGlobal({
              id: eventId,
              kind: "top_reco",
              amount: row.amount,
              city: prof?.city ?? null,
              timestamp: row.created_at,
            })
          }
        }
      )

      // Nouveau filleul direct
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profiles",
          filter: `sponsor_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            first_name: string | null
            last_name: string | null
            city: string | null
            created_at: string
          }
          prependPersonal({
            id: uid(),
            kind: "new_referral",
            user: formatUserName(row.first_name, row.last_name),
            city: row.city,
            level: 1,
            timestamp: row.created_at,
          })
        }
      )

      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // networkIds est une prop SSR statique (jamais re-passée côté client), et
  // prependGlobal/prependPersonal ferment sur des setState stables de React.
  // Ajouter networkIds en dep causerait une reconnexion inutile à chaque render.
  }, [userId])

  return (
    <Card className="!rounded-2xl mt-6">
      <CardContent className="p-6">
        <h3 className="text-lg font-bold text-winelio-dark mb-4">
          🔥 Actualités réseau
        </h3>

        {/* Section globale */}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-winelio-gray mb-2">
            🌍 Highlights plateforme
          </p>
          {globalEvents.length === 0 ? (
            <p className="text-sm text-winelio-gray py-4 text-center">
              Pas encore d&apos;activité aujourd&apos;hui
            </p>
          ) : (
            <div className="h-48 overflow-hidden feed-ticker-wrap">
              <div
                className="feed-ticker-inner"
                style={{
                  animation: `feed-scroll-up ${Math.max(globalEvents.length * 4, 8)}s linear infinite`,
                }}
              >
                {[...globalEvents, ...globalEvents].map((event, i) => (
                  <FeedItem
                    key={`${event.id}-${i}`}
                    event={event}
                    isNew={i < globalEvents.length && newIds.has(event.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <hr className="border-gray-100 mb-4" />

        {/* Section réseau personnel */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-winelio-gray mb-2">
            👤 Mon réseau
          </p>
          {personalEvents.length === 0 ? (
            <p className="text-sm text-winelio-gray py-4 text-center">
              Aucune activité récente dans ton réseau
            </p>
          ) : (
            <div className="h-48 overflow-hidden feed-ticker-wrap">
              <div
                className="feed-ticker-inner"
                style={{
                  animation: `feed-scroll-up ${Math.max(personalEvents.length * 4, 8)}s linear infinite`,
                }}
              >
                {[...personalEvents, ...personalEvents].map((event, i) => (
                  <FeedItem
                    key={`${event.id}-${i}`}
                    event={event}
                    isNew={i < personalEvents.length && newIds.has(event.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
