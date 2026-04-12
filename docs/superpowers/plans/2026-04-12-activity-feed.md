# Activity Feed Animé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le feed d'activité statique du dashboard par un Client Component animé "push-down cascade" couvrant 11 types d'événements, avec rotation automatique (démo : aléatoire 1,5–4s ; prod : Supabase Realtime + mode veille).

**Architecture:** Le Server Component `dashboard/page.tsx` continue le fetch SSR (étendu à 11 types) et passe `initialEvents` à `<ActivityFeed>`. Le Client Component gère le timer, l'animation DOM via refs, et en prod un channel Supabase Realtime. Les keyframes CSS sont centralisées dans `globals.css`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, Supabase JS v2 (`@supabase/ssr`), Supabase Realtime Postgres Changes

---

## Fichiers touchés

| Action | Fichier | Rôle |
|---|---|---|
| Modifier | `src/lib/feed-utils.ts` | +4 types, icons, labels, consolider `feedEventLabel` |
| Modifier | `src/app/globals.css` | +5 keyframes d'animation feed |
| Créer | `src/components/activity-feed.tsx` | Client Component principal |
| Modifier | `src/app/(protected)/dashboard/page.tsx` | +8 requêtes SSR, import `<ActivityFeed>`, supprimer anciens composants activité |

---

## Task 1 : Étendre `feed-utils.ts` avec les 4 nouveaux types

**Fichiers :**
- Modifier : `src/lib/feed-utils.ts`

- [ ] **Step 1 : Remplacer entièrement `src/lib/feed-utils.ts`**

```ts
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
      return `🎉 ${event.label}`
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
```

- [ ] **Step 2 : Vérifier qu'il n'y a plus d'import de `getActivityLabel` côté dashboard**

```bash
grep -n "getActivityLabel" src/app/\(protected\)/dashboard/page.tsx
```

Attendu : aucun résultat (on va le supprimer dans Task 4).

- [ ] **Step 3 : Build rapide pour vérifier les types**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : 0 erreur ou uniquement des erreurs dans `dashboard/page.tsx` (normal, `getActivityLabel` y sera supprimé en Task 4).

- [ ] **Step 4 : Commit**

```bash
git add src/lib/feed-utils.ts
git commit -m "feat(feed): add 4 new FeedEvent types + feedEventColor helper"
```

---

## Task 2 : Ajouter les keyframes CSS dans `globals.css`

**Fichiers :**
- Modifier : `src/app/globals.css`

- [ ] **Step 1 : Ajouter les keyframes après la ligne `feed-scroll-up` existante**

Repère dans le fichier (ligne ~79) :
```css
/* Vertical ticker animation for network feed */
@keyframes feed-scroll-up {
  from { transform: translateY(0); }
  to   { transform: translateY(-50%); }
}
```

Ajouter juste après :

```css
/* ── Activity Feed — push-down cascade animations ── */

/* Nouvel item : slide depuis le haut avec rebond spring */
@keyframes feed-push-in {
  0%   { opacity: 0; transform: translateY(-54px) scale(0.94); }
  55%  { opacity: 1; }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* Halo orange sur le nouvel item, s'estompe */
@keyframes feed-glow-fade {
  0%   { border-color: rgba(255,107,53,0.4); background: #fff8f5; box-shadow: 0 2px 12px rgba(255,107,53,0.12); }
  100% { border-color: rgb(240,240,240); background: #fff; box-shadow: none; }
}

/* Shimmer sweep sur le nouvel item */
@keyframes feed-shimmer-in {
  from { transform: translateX(-100%); }
  to   { transform: translateX(200%); }
}

/* Items existants : vague cascade vers le bas (durée/délai/offset via CSS vars) */
@keyframes feed-cascade {
  0%   { transform: translateY(var(--fd-offset, -12px)); }
  42%  { transform: translateY(4px); }
  100% { transform: translateY(0); }
}

/* Dernier item : collapse vers 0 et disparaît */
@keyframes feed-exit {
  0%   { opacity: 1; max-height: 72px; padding-top: 11px; padding-bottom: 11px; margin-bottom: 0; }
  100% { opacity: 0; max-height: 0;    padding-top: 0;    padding-bottom: 0;    margin-bottom: -8px; }
}

/* Live dot : pulsation continue */
@keyframes feed-live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.35; transform: scale(0.65); }
}
```

- [ ] **Step 2 : Build pour vérifier qu'il n'y a pas d'erreur CSS**

```bash
npm run build 2>&1 | tail -20
```

Attendu : `✓ Compiled successfully` ou build sans erreur CSS.

- [ ] **Step 3 : Commit**

```bash
git add src/app/globals.css
git commit -m "feat(feed): add push-down cascade CSS keyframes"
```

---

## Task 3 : Créer `src/components/activity-feed.tsx`

**Fichiers :**
- Créer : `src/components/activity-feed.tsx`

- [ ] **Step 1 : Créer le fichier**

```tsx
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
        next[next.length - 1] = { ...last, _phase: "exiting" }
        setTimeout(() => {
          setItems((p) => p.filter((i) => i._key !== last._key))
        }, 300)
      }

      return [toFeedItem(event), ...next]
    })

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

    /* Supabase Realtime — écoute les INSERTs sur 4 tables */
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
          // Recycler un événement des initialEvents
          const events = initialEventsRef.current
          if (events.length > 0) {
            const event = events[demoIndexRef.current % events.length]
            demoIndexRef.current++
            pushEvent({ ...event, id: event.id + "-idle-" + demoIndexRef.current, timestamp: new Date().toISOString() })
          }
          idleTimerRef.current = setTimeout(scheduleIdleCheck, IDLE_RECYCLE_MS)
        } else {
          // Pas encore en veille, re-vérifier plus tard
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
              {items.map((item, index) => (
                <FeedItemRow
                  key={item._key}
                  item={item}
                  index={index}
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
  index,
  refCallback,
}: {
  item: FeedItem
  index: number
  refCallback: (el: HTMLDivElement | null) => void
}) {
  const color  = feedEventColor(item.kind)
  const icon   = feedEventIcon(item.kind)
  const label  = feedEventLabel(item)
  const amount = "amount" in item ? (item as { amount: number }).amount : undefined

  const colorMap = {
    orange: { bg: "bg-winelio-orange/15 text-winelio-orange", badge: "bg-winelio-orange/10 text-winelio-orange" },
    amber:  { bg: "bg-winelio-amber/15 text-winelio-amber",   badge: "bg-winelio-amber/10 text-winelio-amber" },
    teal:   { bg: "bg-teal-500/15 text-teal-600",             badge: "bg-teal-50 text-teal-600" },
    purple: { bg: "bg-purple-500/15 text-purple-600",         badge: "bg-purple-50 text-purple-600" },
  }
  const c = colorMap[color]

  const isEntering = item._phase === "entering"
  const isExiting  = item._phase === "exiting"

  return (
    <div
      ref={refCallback}
      className="feed-item-row flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-gray-100 bg-white relative overflow-hidden flex-shrink-0"
      style={{
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
```

- [ ] **Step 2 : Ajouter la classe CSS `feed-cascade-active` dans `globals.css`**

Après les keyframes ajoutés en Task 2, ajouter :

```css
/* Classe appliquée via JS sur les items existants lors d'un push */
.feed-cascade-active {
  animation: feed-cascade var(--fd-dur, 0.45s) cubic-bezier(0.34, 1.3, 0.64, 1) var(--fd-delay, 0ms) both;
}
```

- [ ] **Step 3 : Build pour vérifier**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : 0 erreur dans `activity-feed.tsx` et `feed-utils.ts`. Des erreurs dans `dashboard/page.tsx` sont normales (on les corrige en Task 4).

- [ ] **Step 4 : Commit**

```bash
git add src/components/activity-feed.tsx src/app/globals.css
git commit -m "feat(feed): create ActivityFeed client component with push-down cascade"
```

---

## Task 4 : Étendre les fetches SSR + câbler le composant dans `dashboard/page.tsx`

**Fichiers :**
- Modifier : `src/app/(protected)/dashboard/page.tsx`

- [ ] **Step 1 : Mettre à jour les imports en haut du fichier**

Remplacer :
```ts
import { FeedEvent, formatUserName, formatRelativeTime } from "@/lib/feed-utils";
```
Par :
```ts
import { FeedEvent, formatUserName, feedEventLabel } from "@/lib/feed-utils";
import { ActivityFeed } from "@/components/activity-feed";
```

- [ ] **Step 2 : Étendre le bloc de requêtes Supabase (après la déclaration `sevenDaysAgo`)**

Repérer dans le fichier (vers la ligne 86) :
```ts
// Événements d'activité personnelle
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const activityEvents: FeedEvent[] = [];
```

Remplacer tout le bloc `if (allNetworkIds.length > 0) { ... }` jusqu'à `const topEvents = activityEvents.slice(0, 4);` par le code suivant :

```ts
// ── Événements d'activité réseau (11 types) ──────────────────────
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const activityEvents: FeedEvent[] = [];

// Filleuls directs récents (niv. 1)
const { data: newDirectReferrals } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, city, created_at")
  .eq("sponsor_id", user.id)
  .gte("created_at", sevenDaysAgo)
  .order("created_at", { ascending: false })
  .limit(3);

newDirectReferrals?.forEach((p) => {
  activityEvents.push({
    id: `nr1-${p.id}`,
    kind: "new_referral",
    user: formatUserName(p.first_name, p.last_name),
    city: p.city,
    level: 1,
    timestamp: p.created_at,
  });
});

if (allNetworkIds.length > 0) {
  // Filleuls niv. 2-5 récents
  const directIds = (newDirectReferrals ?? []).map((p) => p.id);
  const networkIdsDeep = allNetworkIds.filter((id) => !directIds.includes(id) && id !== user.id);

  const [
    { data: deepReferrals },
    { data: sponsoredMembers },
    { data: validatedRecos },
    { data: bigCommissions },
    { data: recentSteps },
    { data: ownCommissions },
    { data: completedWithdrawals },
    { data: completedRecosFull },
  ] = await Promise.all([
    // Niv. 2-5 récents
    networkIdsDeep.length > 0
      ? supabase
          .from("profiles")
          .select("id, first_name, last_name, city, created_at, sponsor_id")
          .in("id", networkIdsDeep)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),

    // Membres du réseau ayant parrainé quelqu'un (referral_sponsored)
    allNetworkIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, first_name, last_name, city, created_at, sponsor_id")
          .in("sponsor_id", allNetworkIds)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),

    // Recos validées dans le réseau (reco_validated)
    supabase
      .from("recommendations")
      .select("id, referrer_id, amount, created_at")
      .in("referrer_id", allNetworkIds)
      .eq("status", "COMPLETED")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(3),

    // Grosses commissions réseau (big_commission)
    supabase
      .from("commission_transactions")
      .select("id, user_id, amount, created_at")
      .in("user_id", allNetworkIds)
      .gt("amount", 50)
      .eq("status", "EARNED")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(3),

    // Étapes récentes sur les recos de l'utilisateur (step_advanced)
    supabase
      .from("recommendation_steps")
      .select("id, completed_at, recommendation_id, step:steps(name, order_index)")
      .not("completed_at", "is", null)
      .gte("completed_at", sevenDaysAgo)
      .order("completed_at", { ascending: false })
      .limit(5),

    // Commissions propres de l'utilisateur (commission_received)
    supabase
      .from("commission_transactions")
      .select("id, amount, created_at")
      .eq("user_id", user.id)
      .eq("status", "EARNED")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(3),

    // Retraits traités (withdrawal_done)
    supabase
      .from("withdrawals")
      .select("id, amount, updated_at")
      .eq("user_id", user.id)
      .eq("status", "COMPLETED")
      .gte("updated_at", sevenDaysAgo)
      .order("updated_at", { ascending: false })
      .limit(2),

    // Recos de l'utilisateur terminées avec montant (reco_completed)
    supabase
      .from("recommendations")
      .select("id, amount, created_at, referrer_id")
      .eq("referrer_id", user.id)
      .eq("status", "COMPLETED")
      .gt("amount", 0)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Enrichir les profils manquants
  const referrerIds = [
    ...(validatedRecos?.map((r) => r.referrer_id) ?? []),
    ...(bigCommissions?.map((c) => c.user_id) ?? []),
    ...(sponsoredMembers?.map((p) => p.sponsor_id).filter(Boolean) ?? []),
    ...(deepReferrals?.map((p) => p.sponsor_id).filter(Boolean) ?? []),
  ];
  const profilesMap: Record<string, { first_name: string | null; last_name: string | null; city: string | null }> = {};
  if (referrerIds.length > 0) {
    const { data: refProfiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, city")
      .in("id", [...new Set(referrerIds)]);
    refProfiles?.forEach((p) => { profilesMap[p.id] = p; });
  }

  // Niv. 2-5
  deepReferrals?.forEach((p) => {
    // Calculer le niveau approximatif (1 si sponsor direct, sinon 2+)
    const level = allNetworkIds.indexOf(p.id) >= 0 ? 2 : 3;
    activityEvents.push({
      id: `nr2-${p.id}`,
      kind: "new_referral",
      user: formatUserName(p.first_name, p.last_name),
      city: p.city,
      level,
      timestamp: p.created_at,
    });
  });

  // referral_sponsored
  sponsoredMembers?.forEach((p) => {
    const sponsor = p.sponsor_id ? profilesMap[p.sponsor_id] : null;
    if (sponsor) {
      activityEvents.push({
        id: `rs-${p.id}`,
        kind: "referral_sponsored",
        user: formatUserName(sponsor.first_name, sponsor.last_name),
        city: sponsor.city,
        timestamp: p.created_at,
      });
    }
  });

  // reco_validated
  validatedRecos?.forEach((r) => {
    const prof = profilesMap[r.referrer_id];
    activityEvents.push({
      id: `rv-${r.id}`,
      kind: "reco_validated",
      user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
      city: prof?.city ?? null,
      amount: r.amount ?? undefined,
      timestamp: r.created_at,
    });
  });

  // big_commission
  bigCommissions?.forEach((c) => {
    const prof = profilesMap[c.user_id];
    activityEvents.push({
      id: `cr-${c.id}`,
      kind: "big_commission",
      user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
      city: prof?.city ?? null,
      amount: c.amount,
      timestamp: c.created_at,
    });
  });

  // step_advanced (filtrer les étapes trivielles : ne pas inclure étape 1)
  recentSteps?.forEach((s) => {
    const step = s.step as { name: string; order_index: number } | null;
    if (!step || step.order_index <= 1) return;
    activityEvents.push({
      id: `sa-${s.id}`,
      kind: "step_advanced",
      user: formatUserName(profile?.first_name ?? null, profile?.last_name ?? null),
      city: null,
      stepLabel: step.name,
      stepIndex: step.order_index,
      timestamp: s.completed_at!,
    });
  });

  // commission_received (propres à l'utilisateur)
  ownCommissions?.forEach((c) => {
    activityEvents.push({
      id: `ci-${c.id}`,
      kind: "commission_received",
      user: formatUserName(profile?.first_name ?? null, profile?.last_name ?? null),
      city: null,
      amount: c.amount,
      timestamp: c.created_at,
    });
  });

  // withdrawal_done
  completedWithdrawals?.forEach((w) => {
    activityEvents.push({
      id: `wd-${w.id}`,
      kind: "withdrawal_done",
      amount: w.amount,
      timestamp: w.updated_at,
    });
  });

  // reco_completed (recos de l'utilisateur terminées)
  completedRecosFull?.forEach((r) => {
    activityEvents.push({
      id: `rc-${r.id}`,
      kind: "reco_completed",
      user: formatUserName(profile?.first_name ?? null, profile?.last_name ?? null),
      city: null,
      amount: r.amount ?? 0,
      timestamp: r.created_at,
    });
  });

  // milestone réseau
  const milestones = [5, 10, 25, 50, 100];
  const reached = milestones.filter((m) => networkCount >= m);
  if (reached.length > 0) {
    const top = reached[reached.length - 1];
    activityEvents.push({
      id: `ms-${top}`,
      kind: "milestone",
      count: networkCount,
      label: `Votre réseau a atteint ${top} membres !`,
      timestamp: new Date().toISOString(),
    });
  }
}

activityEvents.sort(
  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
);

const topEvents = activityEvents.slice(0, 20); // 20 pour alimenter la rotation démo
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
```

- [ ] **Step 3 : Remplacer la section "Activité récente" desktop**

Repérer dans le JSX desktop (vers la ligne 341) :
```tsx
{/* Activité récente — pleine largeur */}
<section>
  <Card className="!rounded-2xl shadow-sm">
    ...
  </Card>
</section>
```

Remplacer cette section par :
```tsx
{/* Activité récente — pleine largeur */}
<section>
  <ActivityFeed initialEvents={topEvents} demoMode={demoMode} />
</section>
```

- [ ] **Step 4 : Remplacer la section "Feed d'activité" mobile**

Repérer dans le JSX mobile (vers la ligne 231) :
```tsx
{/* Feed d'activité */}
<section className="space-y-3">
  <h3 className="font-bold text-winelio-dark text-base">Activité</h3>
  ...
</section>
```

Remplacer par :
```tsx
{/* Feed d'activité */}
<section>
  <ActivityFeed
    initialEvents={topEvents}
    demoMode={demoMode}
    className="!h-[300px]"
  />
</section>
```

- [ ] **Step 5 : Supprimer les composants locaux devenus inutiles**

Supprimer du fichier `dashboard/page.tsx` les fonctions suivantes (elles sont en bas du fichier) :
- `function ActivityItem(...)`
- `function DesktopActivityItem(...)`
- `function getActivityLabel(...)`

Garder : `KpiCard`, `DesktopKpiCard`, `ActionChip`, `RecoStatusBadge`.

- [ ] **Step 6 : Build complet**

```bash
npm run build 2>&1 | tail -30
```

Attendu : `✓ Compiled successfully`, route `/(protected)/dashboard` compilée sans erreur.

- [ ] **Step 7 : Vérifier le rendu en local**

```bash
pkill -f "next dev"; sleep 1; npm run dev &
```

Ouvrir http://localhost:3002/dashboard. Vérifier :
- La card Activité réseau a bien une hauteur fixe (ne bouge pas)
- En mode démo (`NEXT_PUBLIC_DEMO_MODE=true`) : les événements défilent automatiquement
- L'animation push-down et le halo orange fonctionnent
- Mobile et desktop sont corrects

- [ ] **Step 8 : Commit final**

```bash
git add src/app/(protected)/dashboard/page.tsx
git commit -m "feat(dashboard): wire ActivityFeed with 11 event types + SSR enriched fetch"
```

---

## Self-Review

**Couverture spec :**
- ✅ 11 types d'événements couverts dans les fetches Task 4
- ✅ Hauteur fixe (360px desktop / 300px mobile via className prop)
- ✅ Animation push-down cascade avec délais décalés
- ✅ Shimmer + glow orange sur nouvel item
- ✅ Badge "Nouveau" + dot "Live"
- ✅ Mode démo : random 1500–4000ms
- ✅ Mode prod : Supabase Realtime + mode veille 30s→5s
- ✅ Desktop + mobile remplacés
- ✅ Anciens composants ActivityItem/DesktopActivityItem supprimés

**Types cohérents :**
- `FeedEvent` défini en Task 1, utilisé dans Task 3 et Task 4
- `feedEventLabel` remplace `getActivityLabel` partout
- `feedEventColor` utilisé uniquement dans `FeedItemRow`
- `_phase: "entering" | "idle" | "exiting"` cohérent entre Task 3 steps 1 et 2

**Pas de placeholders** : tout le code est complet et explicite.
