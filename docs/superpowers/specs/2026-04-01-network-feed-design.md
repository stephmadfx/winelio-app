# Design : Feed Réseau Temps Réel — Dashboard

**Date :** 2026-04-01  
**Statut :** Approuvé

---

## Objectif

Ajouter un feed d'actualités réseau en bas du dashboard (sous les stats cards), affichant en temps réel les événements clés de la plateforme Winelio et du réseau personnel de l'utilisateur.

---

## Placement

- Sous les 4 stats cards, pleine largeur
- Deux sections visuellement distinctes dans la même card :
  1. **Highlights plateforme** (global, tous utilisateurs)
  2. **Mon réseau** (personnel, filtrés sur les 5 niveaux de filleuls)

---

## Affichage des identités

Vrais noms + ville : `"Jean D. (Paris) vient de recevoir 312€"`

---

## Architecture

### Pattern : SSR initial + Supabase Realtime client

- `DashboardPage` (Server Component) charge les 10 derniers événements de chaque section en parallèle côté serveur
- Passe les données initiales à `<NetworkFeed>` (Client Component)
- `<NetworkFeed>` s'abonne à 2 canaux Supabase Realtime :
  - `global-highlights` : écoute `recommendations` et `commission_transactions`
  - `my-network` : écoute les mêmes tables filtrées sur les IDs du réseau personnel
- Nouvel événement → insertion en tête de liste avec animation `slide-down + fade-in`

---

## Types d'événements

```ts
type FeedEvent =
  | { kind: "top_sponsor"; user: string; city: string; count: number; period: "week" }
  | { kind: "top_reco"; amount: number; city: string; date: string }
  | { kind: "big_commission"; user: string; city: string; amount: number }
  | { kind: "new_referral"; user: string; city: string; level: number }
  | { kind: "reco_validated"; user: string; city: string; amount?: number }
  | { kind: "commission_received"; user: string; city: string; amount: number }
  | { kind: "referral_sponsored"; user: string; city: string }
```

---

## Requêtes Supabase

### Highlights globaux

| Événement | Table | Filtre |
|-----------|-------|--------|
| Top parrain semaine | `profiles` groupé par `sponsor_id` | filleuls actifs, fenêtre 7 jours |
| Plus grosse reco du jour | `recommendations` | `status = COMPLETED`, `created_at >= today`, ORDER BY `amount DESC LIMIT 1` |
| Plus grosse commission du jour | `commission_transactions` | `amount > 100`, `created_at >= today`, ORDER BY `amount DESC LIMIT 1` |

### Réseau personnel

| Événement | Table | Filtre |
|-----------|-------|--------|
| Nouveau filleul | `profiles` | `sponsor_id IN [network_ids]`, triés par `created_at DESC` |
| Reco validée | `recommendations` | `referrer_id IN [network_ids]`, `status = COMPLETED` |
| Commission > 100€ | `commission_transactions` | `user_id IN [network_ids]`, `amount > 100` |
| Filleul qui parraine | `profiles` | `sponsor_id IN [direct_referrals_ids]` |

> Les `network_ids` (5 niveaux) sont calculés une fois côté serveur et passés au composant client.

---

## Composants

### `src/components/network-feed.tsx` (Client Component)
- Reçoit `initialGlobalEvents`, `initialPersonalEvents`, `networkIds` en props
- Gère l'état local du feed avec `useState`
- S'abonne aux canaux Realtime dans `useEffect`
- Transforme les payloads Realtime en `FeedEvent` et insère en tête
- Limite à 20 événements par section (sliding window)

### `src/components/feed-item.tsx`
- Affiche un événement : icône emoji, texte, badge montant, ville, timestamp relatif
- Supporte l'animation d'entrée via une prop `isNew`

---

## Animations

- Entrée : `transition-all duration-500 ease-out` + `translate-y-[-8px] opacity-0` → `translate-y-0 opacity-100`
- Utiliser `useState` avec un flag `isNew` retiré après 600ms pour déclencher l'animation

---

## UI / Layout

```
┌─────────────────────────────────────────────┐
│  🔥 Actualités réseau                        │
│  ─────────────────────────────────────────  │
│  🌍 HIGHLIGHTS PLATEFORME                    │
│  🏆 Marie L. (Lyon) — top parrain semaine    │
│     27 filleuls actifs                       │
│  💰 Reco validée à 1 200€ — Bordeaux         │
│  ⚡ Thomas K. (Paris) — commission 340€      │
│  ─────────────────────────────────────────  │
│  👤 MON RÉSEAU                               │
│  👤 Sophie M. (Nantes) a rejoint (niv. 1)   │
│  ✅ Paul R. (Toulouse) — reco validée        │
│  💸 Julie F. (Lille) — commission 180€       │
│                              [voir plus ↓]   │
└─────────────────────────────────────────────┘
```

- `max-h-96 overflow-y-auto` pour le scroll interne
- Timestamp relatif : "il y a 3 min", "il y a 2h"

---

## Contraintes

- Aucun nom affiché si `first_name` ou `last_name` est null (fallback : "Un membre")
- Aucune ville affichée si `city` est null dans le profil (fallback : silencieux)
- Seuil commission : 100€ minimum pour apparaître dans le feed
- RLS : les données personnelles ne sont accessibles qu'à l'utilisateur connecté. Les highlights globaux nécessitent une fonction RPC Supabase `get_global_highlights()` avec `SECURITY DEFINER` pour contourner le RLS sur les données agrégées anonymisées.

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `src/components/network-feed.tsx` | Créer |
| `src/components/feed-item.tsx` | Créer |
| `src/app/(protected)/dashboard/page.tsx` | Modifier (ajouter fetch + intégrer `<NetworkFeed>`) |
| `supabase/migrations/get_global_highlights.sql` | Créer (fonction RPC) |
