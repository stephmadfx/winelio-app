import { feedEventLabel, type FeedEvent } from "@/lib/feed-utils";

export const activityFilters = [
  { value: "all", label: "Tous" },
  { value: "members", label: "Membres" },
  { value: "sponsorships", label: "Parrainages" },
  { value: "recommendations", label: "Recos" },
] as const;
export type ActivityFilter = typeof activityFilters[number]["value"];
export function parseActivityFilter(value: string | null): ActivityFilter {
  return activityFilters.find(filter => filter.value === value)?.value ?? "all";
}
export function activityCategory(kind: FeedEvent["kind"]): ActivityFilter {
  if (kind === "member_joined" || kind === "new_referral") return "members";
  if (kind === "member_sponsored" || kind === "referral_sponsored" || kind === "top_sponsor") return "sponsorships";
  if (["recommendation_created", "reco_validated", "reco_completed", "step_advanced", "top_reco", "gain_credited", "commission_received", "big_commission"].includes(kind)) return "recommendations";
  return "all";
}
export function activityCopy(event: FeedEvent): { name: string | null; action: string; initials: string } {
  const name = "user" in event ? event.user.trim() : null;
  let action: string;
  switch (event.kind) {
    case "member_joined": action = "a rejoint Winelio"; break;
    case "member_sponsored": action = "a accueilli un filleul"; break;
    case "recommendation_created": action = "a fait une recommandation"; break;
    default: {
      const label = feedEventLabel(event);
      action = name && label.startsWith(name) ? label.slice(name.length).trim() : label;
    }
  }
  const parts = name && name !== "Un membre" ? name.split(/\s+/) : [];
  const initials = parts.length ? `${parts[0].charAt(0)}${parts.length > 1 ? parts[parts.length - 1].charAt(0) : ""}`.toLocaleUpperCase("fr-FR") : "";
  return { name, action, initials };
}
const parisDay = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export function activityDayKey(timestamp: string): string { return parisDay.format(new Date(timestamp)); }
export function activityDayLabel(key: string, referenceTime: string): string {
  const today = activityDayKey(referenceTime);
  if (key === today) return "Aujourd’hui";
  // Calendar arithmetic in UTC avoids 23/25-hour days around the Paris DST change.
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (key === yesterday) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" as const } : {}) }).format(new Date(`${key}T12:00:00Z`));
}
export function groupActivityEvents(events: FeedEvent[], filter: ActivityFilter) {
  const groups = new Map<string, FeedEvent[]>();
  const sorted = [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
  for (const event of sorted) {
    if (filter !== "all" && activityCategory(event.kind) !== filter) continue;
    const day = activityDayKey(event.timestamp);
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return [...groups].map(([day, items]) => ({ day, items }));
}
