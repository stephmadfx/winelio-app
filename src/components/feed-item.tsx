"use client"

import { useEffect, useState } from "react"
import { FeedEvent, feedEventIcon, feedEventLabel, formatRelativeTime } from "@/lib/feed-utils"

interface FeedItemProps {
  event: FeedEvent
  isNew?: boolean
}

export function FeedItem({ event, isNew = false }: FeedItemProps) {
  const [visible, setVisible] = useState(!isNew)

  useEffect(() => {
    if (isNew) {
      // Déclenche l'animation d'entrée au prochain tick
      const timer = setTimeout(() => setVisible(true), 10)
      return () => clearTimeout(timer)
    }
  }, [isNew])

  const isAmountEvent =
    event.kind === "big_commission" ||
    event.kind === "commission_received" ||
    event.kind === "top_reco" ||
    (event.kind === "reco_validated" && event.amount)

  const amount =
    event.kind === "big_commission" || event.kind === "commission_received"
      ? event.amount
      : event.kind === "top_reco"
      ? event.amount
      : event.kind === "reco_validated"
      ? event.amount
      : null

  return (
    <div
      className={[
        "flex items-start gap-3 py-3 px-1 border-b border-gray-100 last:border-0",
        "transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
      ].join(" ")}
    >
      <span className="text-lg shrink-0 mt-0.5">{feedEventIcon(event.kind)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-kiparlo-dark leading-snug">
          {feedEventLabel(event)}
        </p>
        <p className="text-xs text-kiparlo-gray mt-0.5">
          {formatRelativeTime(event.timestamp)}
        </p>
      </div>
      {isAmountEvent && amount != null && (
        <span className="shrink-0 text-xs font-semibold text-kiparlo-orange bg-kiparlo-orange/10 px-2 py-0.5 rounded-full">
          {amount.toFixed(0)}€
        </span>
      )}
    </div>
  )
}
