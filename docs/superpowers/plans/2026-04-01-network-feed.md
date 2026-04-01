# Network Feed Temps Réel — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un feed d'actualités réseau temps réel en bas du dashboard (highlights plateforme + activité du réseau personnel), alimenté par Supabase Realtime avec animations d'entrée fluides.

**Architecture:** Données initiales chargées côté serveur (SSR) dans `DashboardPage`, passées en props à `<NetworkFeed>` (Client Component) qui s'abonne aux canaux Supabase Realtime pour insérer les nouveaux événements en tête avec animation slide+fade.

**Tech Stack:** Next.js 15 App Router, Supabase SSR + Realtime, Tailwind CSS v4, TypeScript

---

## Structure des fichiers

| Fichier | Action |
|---------|--------|
| `supabase/migrations/003_global_highlights_fn.sql` | Créer — fonction RPC SECURITY DEFINER |
| `src/lib/feed-utils.ts` | Créer — types FeedEvent + helpers formatage |
| `src/components/feed-item.tsx` | Créer — affichage d'un événement avec animation |
| `src/components/network-feed.tsx` | Créer — Client Component avec Realtime |
| `src/app/(protected)/dashboard/page.tsx` | Modifier — fetch initial + intégrer NetworkFeed |

---

## Task 1 : Fonction SQL `get_global_highlights`

**Files:**
- Create: `supabase/migrations/003_global_highlights_fn.sql`

- [ ] **Step 1 : Créer la migration SQL**

```sql
-- supabase/migrations/003_global_highlights_fn.sql

CREATE OR REPLACE FUNCTION public.get_global_highlights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_sponsor jsonb := NULL;
  v_top_reco    jsonb := NULL;
  v_top_comm    jsonb := NULL;
  v_today       timestamptz := date_trunc('day', now());
  v_week_start  timestamptz := date_trunc('week', now());
  v_result      jsonb := '[]'::jsonb;
BEGIN
  -- Top parrain de la semaine (le plus de nouveaux filleuls sur 7 jours)
  SELECT jsonb_build_object(
    'kind',      'top_sponsor',
    'user',      COALESCE(
                   p.first_name || ' ' ||
                   LEFT(COALESCE(p.last_name, ''), 1) ||
                   CASE WHEN p.last_name IS NOT NULL THEN '.' ELSE '' END,
                   'Un membre'
                 ),
    'city',      p.city,
    'count',     COUNT(f.id)::int,
    'period',    'week',
    'timestamp', now()::text
  )
  INTO v_top_sponsor
  FROM profiles p
  JOIN profiles f ON f.sponsor_id = p.id
  WHERE f.created_at >= v_week_start
  GROUP BY p.id, p.first_name, p.last_name, p.city
  ORDER BY COUNT(f.id) DESC
  LIMIT 1;

  -- Plus grosse reco complétée du jour
  SELECT jsonb_build_object(
    'kind',      'top_reco',
    'amount',    r.amount,
    'city',      p.city,
    'date',      r.created_at::text,
    'timestamp', r.created_at::text
  )
  INTO v_top_reco
  FROM recommendations r
  JOIN profiles p ON p.id = r.referrer_id
  WHERE r.status = 'COMPLETED'
    AND r.created_at >= v_today
    AND r.amount IS NOT NULL
  ORDER BY r.amount DESC
  LIMIT 1;

  -- Plus grosse commission EARNED du jour > 100€
  SELECT jsonb_build_object(
    'kind',      'big_commission',
    'user',      COALESCE(
                   p.first_name || ' ' ||
                   LEFT(COALESCE(p.last_name, ''), 1) ||
                   CASE WHEN p.last_name IS NOT NULL THEN '.' ELSE '' END,
                   'Un membre'
                 ),
    'city',      p.city,
    'amount',    ct.amount,
    'timestamp', ct.created_at::text
  )
  INTO v_top_comm
  FROM commission_transactions ct
  JOIN profiles p ON p.id = ct.user_id
  WHERE ct.amount > 100
    AND ct.status = 'EARNED'
    AND ct.created_at >= v_today
  ORDER BY ct.amount DESC
  LIMIT 1;

  -- Assembler les résultats non-nuls
  IF v_top_sponsor IS NOT NULL THEN
    v_result := v_result || jsonb_build_array(v_top_sponsor);
  END IF;
  IF v_top_reco IS NOT NULL THEN
    v_result := v_result || jsonb_build_array(v_top_reco);
  END IF;
  IF v_top_comm IS NOT NULL THEN
    v_result := v_result || jsonb_build_array(v_top_comm);
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_highlights() TO anon, authenticated;
```

- [ ] **Step 2 : Appliquer la migration en production**

Via le dashboard Supabase → SQL Editor → coller et exécuter le contenu du fichier.
Ou via CLI si configuré : `supabase db push`

- [ ] **Step 3 : Vérifier l'exécution**

Dans le SQL Editor Supabase, lancer :
```sql
SELECT get_global_highlights();
```
Résultat attendu : un tableau JSON (peut être `[]` si aucune donnée du jour).

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/003_global_highlights_fn.sql
git commit -m "feat: fonction RPC get_global_highlights SECURITY DEFINER"
```

---

## Task 2 : Types et helpers `feed-utils.ts`

**Files:**
- Create: `src/lib/feed-utils.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/lib/feed-utils.ts

export type FeedEvent = {
  id: string        // UUID unique pour la key React
  timestamp: string // ISO string
} & (
  | { kind: "top_sponsor"; user: string; city: string | null; count: number; period: "week" }
  | { kind: "top_reco"; amount: number; city: string | null; date: string }
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
  if (!lastName) return firstName!
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
```

- [ ] **Step 2 : Commit**

```bash
git add src/lib/feed-utils.ts
git commit -m "feat: types FeedEvent et helpers formatage feed réseau"
```

---

## Task 3 : Composant `FeedItem`

**Files:**
- Create: `src/components/feed-item.tsx`

- [ ] **Step 1 : Créer le composant**

```tsx
// src/components/feed-item.tsx
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
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/feed-item.tsx
git commit -m "feat: composant FeedItem avec animation entrée"
```

---

## Task 4 : Composant `NetworkFeed` (SSR only, sans Realtime)

**Files:**
- Create: `src/components/network-feed.tsx`

- [ ] **Step 1 : Créer le composant (version statique d'abord)**

```tsx
// src/components/network-feed.tsx
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
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/network-feed.tsx
git commit -m "feat: composant NetworkFeed statique (SSR props)"
```

---

## Task 5 : Fetch initial dans `DashboardPage`

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`

- [ ] **Step 1 : Ajouter les imports en tête de fichier**

Ajouter après la ligne `import { Card, CardContent } from "@/components/ui/card";` :

```tsx
import { NetworkFeed } from "@/components/network-feed"
import { FeedEvent } from "@/lib/feed-utils"
import { formatUserName } from "@/lib/feed-utils"
```

- [ ] **Step 2 : Ajouter le fetch des données feed dans `DashboardPage`**

Après le bloc `const { data: profile }` (ligne ~56), ajouter :

```tsx
  // --- Feed réseau ---
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Récupérer tous les IDs du réseau (déjà calculé ci-dessus via networkCount)
  // On refait une collecte propre pour avoir les IDs
  const allNetworkIds: string[] = []
  let levelIds = [user.id]
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (levelIds.length === 0) break
    const { data: lvlProfiles } = await supabase
      .from("profiles")
      .select("id")
      .in("sponsor_id", levelIds)
    if (!lvlProfiles || lvlProfiles.length === 0) break
    allNetworkIds.push(...lvlProfiles.map((p) => p.id))
    levelIds = lvlProfiles.map((p) => p.id)
  }

  // Highlights globaux via RPC
  const { data: globalRaw } = await supabase.rpc("get_global_highlights")
  const globalHighlights = (globalRaw as FeedEvent[] | null) ?? []
  // Ajouter un id unique à chaque event global
  const globalEvents: FeedEvent[] = globalHighlights.map((e, i) => ({
    ...e,
    id: e.id ?? `global-${i}-${Date.now()}`,
  }))

  // Événements personnels
  const personalEvents: FeedEvent[] = []

  if (allNetworkIds.length > 0) {
    const [
      { data: newReferrals },
      { data: validatedRecos },
      { data: bigCommissions },
      { data: referralSponsored },
    ] = await Promise.all([
      // Nouveaux filleuls directs (sponsor_id = user.id)
      supabase
        .from("profiles")
        .select("id, first_name, last_name, city, created_at, sponsor_id")
        .eq("sponsor_id", user.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),

      // Recos validées dans le réseau
      supabase
        .from("recommendations")
        .select("id, referrer_id, amount, created_at")
        .in("referrer_id", allNetworkIds)
        .eq("status", "COMPLETED")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),

      // Commissions > 100€ dans le réseau
      supabase
        .from("commission_transactions")
        .select("id, user_id, amount, created_at")
        .in("user_id", allNetworkIds)
        .gt("amount", 100)
        .eq("status", "EARNED")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),

      // Filleuls directs qui ont eux-mêmes parrainé quelqu'un
      supabase
        .from("profiles")
        .select("id, first_name, last_name, city, created_at, sponsor_id")
        .in("sponsor_id", allNetworkIds)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),
    ])

    // Récupérer les profils des référents pour recos et commissions
    const referrerIds = [
      ...(validatedRecos?.map((r) => r.referrer_id) ?? []),
      ...(bigCommissions?.map((c) => c.user_id) ?? []),
      ...(referralSponsored?.map((p) => p.sponsor_id).filter(Boolean) ?? []),
    ]
    const uniqueReferrerIds = [...new Set(referrerIds)]
    const profilesMap: Record<string, { first_name: string | null; last_name: string | null; city: string | null }> = {}

    if (uniqueReferrerIds.length > 0) {
      const { data: refProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, city")
        .in("id", uniqueReferrerIds)
      refProfiles?.forEach((p) => { profilesMap[p.id] = p })
    }

    // Transformer en FeedEvent
    newReferrals?.forEach((p) => {
      personalEvents.push({
        id: `nr-${p.id}`,
        kind: "new_referral",
        user: formatUserName(p.first_name, p.last_name),
        city: p.city,
        level: 1,
        timestamp: p.created_at,
      })
    })

    validatedRecos?.forEach((r) => {
      const prof = profilesMap[r.referrer_id]
      personalEvents.push({
        id: `rv-${r.id}`,
        kind: "reco_validated",
        user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
        city: prof?.city ?? null,
        amount: r.amount ?? undefined,
        timestamp: r.created_at,
      })
    })

    bigCommissions?.forEach((c) => {
      const prof = profilesMap[c.user_id]
      personalEvents.push({
        id: `cr-${c.id}`,
        kind: "commission_received",
        user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
        city: prof?.city ?? null,
        amount: c.amount,
        timestamp: c.created_at,
      })
    })

    referralSponsored?.forEach((p) => {
      const sponsorProf = p.sponsor_id ? profilesMap[p.sponsor_id] : null
      if (sponsorProf) {
        personalEvents.push({
          id: `rs-${p.id}`,
          kind: "referral_sponsored",
          user: formatUserName(sponsorProf.first_name, sponsorProf.last_name),
          city: sponsorProf.city,
          timestamp: p.created_at,
        })
      }
    })

    // Trier par timestamp décroissant
    personalEvents.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }
```

- [ ] **Step 3 : Ajouter `<NetworkFeed>` dans le JSX retourné**

Après la fermeture de `</div>` du bloc des stats cards (après la ligne `</div>` qui ferme le `grid`), ajouter :

```tsx
      <NetworkFeed
        initialGlobalEvents={globalEvents}
        initialPersonalEvents={personalEvents}
        networkIds={allNetworkIds}
        userId={user.id}
      />
```

- [ ] **Step 4 : Supprimer la double boucle réseau**

La boucle `networkCount` existante (lignes ~63-74) et la nouvelle boucle `allNetworkIds` font la même chose. Fusionner les deux :

Remplacer le bloc de calcul `networkCount` existant :
```tsx
  // Total network members across ALL levels (up to 5) recursively
  let networkCount = 0;
  let currentLevelIds = [user.id];
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (currentLevelIds.length === 0) break;
    const { data: lvlMembers } = await supabase
      .from("profiles")
      .select("id")
      .in("sponsor_id", currentLevelIds);
    if (!lvlMembers || lvlMembers.length === 0) break;
    networkCount += lvlMembers.length;
    currentLevelIds = lvlMembers.map((m) => m.id);
  }
```

Par :
```tsx
  // Total network members across ALL levels (up to 5) recursively
  // On collecte aussi les IDs pour le feed
  const allNetworkIds: string[] = []
  let networkCount = 0
  let currentLevelIds = [user.id]
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (currentLevelIds.length === 0) break
    const { data: lvlMembers } = await supabase
      .from("profiles")
      .select("id")
      .in("sponsor_id", currentLevelIds)
    if (!lvlMembers || lvlMembers.length === 0) break
    networkCount += lvlMembers.length
    allNetworkIds.push(...lvlMembers.map((m) => m.id))
    currentLevelIds = lvlMembers.map((m) => m.id)
  }
```

Et supprimer la deuxième boucle `allNetworkIds` ajoutée au Step 2.

- [ ] **Step 5 : Build de vérification**

```bash
npm run build
```

Résultat attendu : compilation sans erreurs TypeScript.

- [ ] **Step 6 : Commit**

```bash
git add src/app/(protected)/dashboard/page.tsx
git commit -m "feat: fetch initial feed réseau dans DashboardPage"
```

---

## Task 6 : Supabase Realtime dans `NetworkFeed`

**Files:**
- Modify: `src/components/network-feed.tsx`

- [ ] **Step 1 : Ajouter l'import du client Supabase browser**

En tête de `network-feed.tsx`, ajouter :

```tsx
import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { v4 as uuidv4 } from "uuid"
```

> Note : `uuid` est déjà dans les dépendances Next.js via Supabase. Si absent : `npm install uuid @types/uuid`

- [ ] **Step 2 : Remplacer le `useState` d'import par `useEffect` + `useRef` + Realtime**

Modifier la liste d'imports React en tête de fichier :
```tsx
import { useState, useEffect, useRef } from "react"
```

Ajouter l'abonnement Realtime dans le composant, **avant le `return`** :

```tsx
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Nettoyer tout canal précédent
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel("network-feed-realtime")

      // --- Global : nouvelle commission EARNED > 100€ ---
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

          // Récupérer le profil
          const { data: prof } = await supabase
            .from("profiles")
            .select("first_name, last_name, city")
            .eq("id", row.user_id)
            .single()

          const event: FeedEvent = {
            id: uuidv4(),
            kind: "big_commission",
            user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
            city: prof?.city ?? null,
            amount: row.amount,
            timestamp: row.created_at,
          }

          // Global si pas dans le réseau perso
          if (!networkIds.includes(row.user_id)) {
            prependGlobal(event)
          } else {
            prependPersonal({ ...event, kind: "commission_received" })
          }
        }
      )

      // --- Global : reco COMPLETED ---
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

          const event: FeedEvent = {
            id: uuidv4(),
            kind: "reco_validated",
            user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
            city: prof?.city ?? null,
            amount: row.amount ?? undefined,
            timestamp: row.created_at,
          }

          if (networkIds.includes(row.referrer_id)) {
            prependPersonal(event)
          } else if (row.amount && row.amount > 500) {
            // Reco notable sur la plateforme (> 500€)
            prependGlobal({ ...event, kind: "top_reco", date: row.created_at })
          }
        }
      )

      // --- Personnel : nouveau filleul direct ---
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
            id: uuidv4(),
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
  }, [userId, networkIds]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3 : Supprimer les `void prependGlobal / void prependPersonal`**

Ces deux lignes n'ont plus lieu d'être.

- [ ] **Step 4 : Vérifier que Realtime est activé dans Supabase**

Dashboard Supabase → Database → Replication → s'assurer que les tables `recommendations`, `commission_transactions`, `profiles` ont la réplication activée (cocher si nécessaire).

- [ ] **Step 5 : Build**

```bash
npm run build
```

Résultat attendu : pas d'erreur TypeScript.

- [ ] **Step 6 : Commit**

```bash
git add src/components/network-feed.tsx
git commit -m "feat: abonnement Supabase Realtime dans NetworkFeed"
```

---

## Task 7 : Vérification visuelle et push

- [ ] **Step 1 : Tester en local**

```bash
npm run dev
```

Ouvrir `http://localhost:3001` → vérifier que le feed apparaît sous les stats cards avec les données mockées (ou vides si aucune activité récente).

- [ ] **Step 2 : Tester le Realtime**

Dans le SQL Editor Supabase, insérer une commission test :
```sql
-- Remplacer par un vrai user_id existant
INSERT INTO commission_transactions (user_id, recommendation_id, amount, status, earned_at)
VALUES (
  (SELECT id FROM profiles LIMIT 1),
  (SELECT id FROM recommendations LIMIT 1),
  250,
  'EARNED',
  now()
);
```

Vérifier qu'un item apparaît dans le feed sans rechargement de page.

- [ ] **Step 3 : Push et déploiement**

```bash
git push origin main
```

Redémarrer le serveur dev local :
```bash
pkill -f "next dev" ; sleep 1 ; npm run dev &
```

---

## Checklist finale

- [ ] Fonction `get_global_highlights()` déployée sur Supabase
- [ ] Réplication Realtime activée sur `recommendations`, `commission_transactions`, `profiles`
- [ ] Feed visible sous les stats cards sur le dashboard
- [ ] Nouveaux événements apparaissent sans rechargement
- [ ] Animation slide+fade visible sur les nouveaux items
- [ ] Fallback "Un membre" si profil incomplet
- [ ] Build sans erreur TypeScript
