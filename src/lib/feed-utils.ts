export type FeedEvent = {
  id: string        // identifiant unique pour la key React
  timestamp: string // ISO string
} & (
  | { kind: "top_sponsor";         user: string; city: string | null; count: number; period: "week" }
  | { kind: "top_reco";            amount: number; city: string | null }
  | { kind: "big_commission";      user: string; city: string | null; amount: number }
  | { kind: "new_referral";        user: string; city: string | null; level: number }
  | { kind: "reco_validated";      user: string; city: string | null; amount?: number }
  | { kind: "commission_received"; user: string; city: string | null; amount: number }
  | { kind: "referral_sponsored";  user: string; city: string | null }
  | { kind: "step_advanced";       user: string; city: string | null; stepLabel: string; stepIndex: number }
  | { kind: "withdrawal_done";     amount: number }
  | { kind: "milestone";           count: number; label: string }
  | { kind: "reco_completed";      user: string; city: string | null; amount: number }
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
  const diff = Math.max(0, Date.now() - new Date(timestamp).getTime())
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
    top_sponsor:         "🏆",
    top_reco:            "💰",
    big_commission:      "⚡",
    new_referral:        "👤",
    reco_validated:      "✅",
    commission_received: "💸",
    referral_sponsored:  "🌟",
    step_advanced:       "📋",
    withdrawal_done:     "💳",
    milestone:           "🎉",
    reco_completed:      "🏁",
  }
  return icons[kind]
}

export function feedEventLabel(event: FeedEvent): string {
  switch (event.kind) {
    case "top_sponsor":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — top parrain · ${event.count} filleuls`
    case "top_reco":
      return `Plus grosse reco du jour · ${event.amount.toFixed(0)} €${event.city ? ` — ${event.city}` : ""}`
    case "big_commission":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — commission ${event.amount.toFixed(0)} €`
    case "new_referral":
      return `${event.user}${event.city ? ` (${event.city})` : ""} a rejoint votre réseau (niv. ${event.level})`
    case "reco_validated":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — reco validée${event.amount ? ` · ${event.amount.toFixed(0)} €` : ""}`
    case "commission_received":
      return `Commission reçue — ${event.user}${event.city ? ` (${event.city})` : ""}`
    case "referral_sponsored":
      return `${event.user}${event.city ? ` (${event.city})` : ""} a parrainé un nouveau membre`
    case "step_advanced":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — étape ${event.stepIndex} : ${event.stepLabel}`
    case "withdrawal_done":
      return `Votre retrait de ${event.amount.toFixed(0)} € a été traité`
    case "milestone":
      return event.label
    case "reco_completed":
      return `${event.user}${event.city ? ` (${event.city})` : ""} — affaire conclue · ${event.amount.toFixed(0)} €`
  }
}

/** Couleur d'accent d'un type d'événement ("orange" | "amber" | "teal" | "purple") */
export function feedEventColor(kind: FeedEvent["kind"]): "orange" | "amber" | "teal" | "purple" {
  switch (kind) {
    case "new_referral":
    case "referral_sponsored":
    case "milestone":
      return "amber"
    case "reco_validated":
    case "reco_completed":
    case "step_advanced":
      return "teal"
    case "big_commission":
    case "top_sponsor":
    case "top_reco":
      return "purple"
    default:
      return "orange"
  }
}
