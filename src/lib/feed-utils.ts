export type FeedEvent = {
  id: string        // UUID unique pour la key React
  timestamp: string // ISO string
} & (
  | { kind: "top_sponsor"; user: string; city: string | null; count: number; period: "week" }
  | { kind: "top_reco"; amount: number; city: string | null }
  | { kind: "big_commission"; user: string; city: string | null; amount: number }
  | { kind: "new_referral"; user: string; city: string | null; level: number }
  | { kind: "reco_validated"; user: string; city: string | null; amount?: number }
  | { kind: "commission_received"; user: string; city: string | null; amount: number }
  | { kind: "referral_sponsored"; user: string; city: string | null }
)

export function formatUserName(
  firstName: string | null,
  lastName: string | null
): string {
  if (!firstName && !lastName) return "Un membre"
  if (!lastName) return firstName || "Un membre"
  return `${firstName} ${lastName.charAt(0)}.`
}

export function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

export function feedEventIcon(kind: FeedEvent["kind"]): string {
  const icons: Record<FeedEvent["kind"], string> = {
    top_sponsor:        "🏆",
    top_reco:           "💰",
    big_commission:     "⚡",
    new_referral:       "👤",
    reco_validated:     "✅",
    commission_received:"💸",
    referral_sponsored: "🌟",
  }
  return icons[kind]
}

export function feedEventLabel(event: FeedEvent): string {
  switch (event.kind) {
    case "top_sponsor":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — top parrain de la semaine · ${event.count} filleuls`
    case "top_reco":
      return `Plus grosse reco du jour · ${event.amount.toFixed(0)}€${event.city ? ` — ${event.city}` : ""}`
    case "big_commission":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — commission ${event.amount.toFixed(0)}€`
    case "new_referral":
      return `${event.user}${event.city ? ` (${event.city})` : ""} a rejoint ton réseau (niv. ${event.level})`
    case "reco_validated":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — reco validée${event.amount ? ` · ${event.amount.toFixed(0)}€` : ""}`
    case "commission_received":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — commission ${event.amount.toFixed(0)}€`
    case "referral_sponsored":
      return `${event.user}${event.city ? ` (${event.city})` : ""} a parrainé quelqu'un`
  }
}
