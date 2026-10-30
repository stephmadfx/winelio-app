"use client";
import { Handshake, Link2, UserRound, UserRoundPlus, CircleCheck } from "lucide-react";
import type { FeedEvent } from "@/lib/feed-utils";
import { activityCategory, activityCopy } from "@/lib/activity-presentation";

export function ActivityEventRow({ event, timeMode = "relative", referenceTime }: { event: FeedEvent; timeMode?: "relative" | "clock"; referenceTime: string }) {
  const { name, action, initials } = activityCopy(event);
  const category = activityCategory(event.kind);
  const isMember = category === "members", isSponsor = category === "sponsorships";
  const tone = isMember ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" : isSponsor ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300";
  const Icon = isMember ? UserRoundPlus : isSponsor ? Link2 : category === "recommendations" ? Handshake : CircleCheck;
  const date = new Date(event.timestamp);
  const fullDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" }).format(date);
  const clock = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(date);
  const elapsed = Math.max(0, Date.parse(referenceTime) - date.getTime());
  const relative = elapsed < 60_000 ? "À l’instant" : elapsed < 3_600_000 ? `Il y a ${Math.floor(elapsed / 60_000)} min` : elapsed < 86_400_000 ? `Il y a ${Math.floor(elapsed / 3_600_000)} h` : `Il y a ${Math.floor(elapsed / 86_400_000)} j`;
  return <li className="feed-item-row flex items-start gap-3 py-4" data-event-kind={event.kind}>
    <span aria-hidden="true" className={`relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}>
      {initials || <UserRound size={19} />}
      <span className={`absolute -bottom-0.5 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-card ${tone}`}><Icon size={12} strokeWidth={1.8} /></span>
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        {name && <p className="min-w-0 break-words text-[15px] font-semibold leading-6 text-foreground">{name}</p>}
        {timeMode === "clock" && <time dateTime={event.timestamp} title={fullDate} className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{clock}</time>}
      </div>
      <p className="break-words text-[15px] leading-6 text-foreground/90">{action}</p>
      {timeMode === "relative" && <time dateTime={event.timestamp} title={fullDate} className="mt-0.5 block text-xs text-muted-foreground">{relative}</time>}
    </div>
  </li>;
}
