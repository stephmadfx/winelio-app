"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { FeedItem } from "@/components/feed-item"
import { FeedEvent } from "@/lib/feed-utils"

interface NetworkFeedProps {
  initialGlobalEvents: FeedEvent[]
  initialPersonalEvents: FeedEvent[]
  networkIds: string[]
  userId: string
}

export function NetworkFeed({
  initialGlobalEvents,
  initialPersonalEvents,
}: NetworkFeedProps) {
  const [globalEvents, setGlobalEvents] = useState<FeedEvent[]>(initialGlobalEvents)
  const [personalEvents, setPersonalEvents] = useState<FeedEvent[]>(initialPersonalEvents)
  // newIds tracks which events need the "isNew" animation
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  // Fonction utilitaire pour ajouter un événement en tête (utilisée au step Realtime)
  const prependGlobal = (event: FeedEvent) => {
    setNewIds((prev) => new Set(prev).add(event.id))
    setGlobalEvents((prev) => [event, ...prev].slice(0, 20))
    // Retirer le flag isNew après 600ms
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

  // prependGlobal et prependPersonal seront utilisés au Task 6
  void prependGlobal
  void prependPersonal

  return (
    <Card className="!rounded-2xl mt-6">
      <CardContent className="p-6">
        <h3 className="text-lg font-bold text-kiparlo-dark mb-4">
          🔥 Actualités réseau
        </h3>

        {/* Section globale */}
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-kiparlo-gray mb-2">
            🌍 Highlights plateforme
          </p>
          {globalEvents.length === 0 ? (
            <p className="text-sm text-kiparlo-gray py-4 text-center">
              Pas encore d'activité aujourd'hui
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {globalEvents.map((event) => (
                <FeedItem
                  key={event.id}
                  event={event}
                  isNew={newIds.has(event.id)}
                />
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-100 mb-4" />

        {/* Section réseau personnel */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-kiparlo-gray mb-2">
            👤 Mon réseau
          </p>
          {personalEvents.length === 0 ? (
            <p className="text-sm text-kiparlo-gray py-4 text-center">
              Aucune activité récente dans ton réseau
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {personalEvents.map((event) => (
                <FeedItem
                  key={event.id}
                  event={event}
                  isNew={newIds.has(event.id)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
