# Design Spec — Feed d'activité animé (Dashboard)

## Date
2026-04-12

## Contexte
Le dashboard Winelio affiche actuellement un feed d'activité statique (Server Component, max 4 événements, 3 types, aucune animation). L'objectif est de le transformer en un feed animé "push-down" qui donne une impression de réseau vivant, avec 11 types d'événements et une rotation automatique.

---

## Vue d'ensemble

Remplacer la section "Activité" du dashboard par un **Client Component** `<ActivityFeed>` à hauteur fixe, qui :
- Affiche jusqu'à 5 événements simultanément
- Anime chaque nouvelle entrée avec un effet **push-down cascade** (slide depuis le haut + rebond, les items existants descendent en vague décalée)
- Tourne automatiquement selon le mode (démo vs production)
- Reste dans un container à hauteur fixe (la card ne bouge jamais)

---

## Architecture

### Composant principal

`src/components/activity-feed.tsx` — Client Component (`"use client"`)

Props :
```ts
type ActivityFeedProps = {
  initialEvents: FeedEvent[]   // données SSR passées depuis le Server Component
  demoMode: boolean            // depuis process.env.NEXT_PUBLIC_DEMO_MODE
}
```

Le Server Component `dashboard/page.tsx` continue de faire le fetch initial et passe les données à `<ActivityFeed>`. Pas de fetch côté client au chargement.

### Données initiales enrichies

Le fetch du dashboard est étendu pour couvrir les 11 types d'événements (7 jours glissants, max 5 par type) :

| # | Type | Source | Requête |
|---|---|---|---|
| 1 | `new_referral` (niv. 1) | `profiles` | `sponsor_id = user.id` |
| 2 | `new_referral` (niv. 2-5) | `profiles` | `id IN allNetworkIds` (hors niv.1) |
| 3 | `referral_sponsored` | `profiles` | parrain dans le réseau, filleul = nouveau |
| 4 | `reco_validated` | `recommendations` | `status = COMPLETED`, referrer dans réseau |
| 5 | `step_advanced` | `recommendation_steps` | étapes récentes des recos du réseau |
| 6 | `commission_received` | `commission_transactions` | `user_id = user.id`, status EARNED |
| 7 | `big_commission` | `commission_transactions` | `user_id IN networkIds`, amount > 50 |
| 8 | `milestone` | calculé côté serveur | seuils : 5, 10, 25, 50, 100 membres réseau |
| 9 | `withdrawal_done` | `withdrawals` | `user_id = user.id`, status COMPLETED |
| 10 | `top_sponsor` | calculé (ranking hebdo) | top 3 parrains du réseau |
| 11 | `reco_completed` | `recommendations` | `status = COMPLETED`, montant > 0 |

Tous les événements sont triés par `created_at DESC`, tronqués à 20 au total, passés comme `initialEvents`.

### Nouveaux types dans `feed-utils.ts`

Ajouter au type union `FeedEvent` :
```ts
| { kind: "step_advanced";    user: string; city: string | null; step: number; stepLabel: string }
| { kind: "withdrawal_done";  amount: number }
| { kind: "milestone";        count: number; label: string }
| { kind: "reco_completed";   user: string; city: string | null; amount: number }
```

Et les entrées correspondantes dans `feedEventIcon` et `feedEventLabel`.

---

## Comportement du feed

### Hauteur fixe
La card du feed a une hauteur fixe (desktop : `360px`, mobile : `300px`). `overflow: hidden` sur la zone interne. Fondu CSS en bas pour couper proprement les items partiels.

### Animation push-down cascade
À chaque nouvel événement :
1. Si 5 items déjà présents → le dernier sort avec `exitItem` (collapse height vers 0, opacity 0, 280ms)
2. Les items existants reçoivent la classe `cascade` avec des CSS custom properties calculées selon leur index :
   - `--delay` : `index × 45ms`
   - `--offset-start` : `-(10 + index × 4)px`
   - `--dur` : `0.45 + index × 0.04s`
3. Le nouvel item est inséré en premier avec la classe `is-new` : slide depuis le haut + rebond spring + shimmer sweep + glow orange qui s'estompe

### Timer automatique
```
Mode démo (NEXT_PUBLIC_DEMO_MODE=true)
  → rotation des initialEvents
  → délai aléatoire entre 1 500ms et 4 000ms après chaque affichage

Mode production
  → Supabase Realtime sur tables : profiles, recommendations, commission_transactions, withdrawals
  → événements apparaissent dès qu'ils se produisent en DB
  → si aucun événement pendant 30s → recycle les 5 derniers toutes les 5s ("mode veille")
  → dès qu'un vrai événement arrive → sort du mode veille immédiatement
```

### Badge "Nouveau"
Affiché en haut à droite du nouvel item, disparaît en fondu après 2s.

### Dot "Live"
Badge `●  Live` orange pulsant dans le header de la card, toujours visible.

---

## Intégration dans le dashboard

### Desktop
La section "Activité récente — pleine largeur" existante est remplacée par `<ActivityFeed>`. Même position dans la grille.

### Mobile
La section "Feed d'activité" mobile est également remplacée par `<ActivityFeed>` (mêmes props, hauteur réduite).

Le composant est identique sur les deux breakpoints — la hauteur fixe est gérée via une prop ou une classe Tailwind conditionnelle.

---

## Ce qui ne change pas
- Le Server Component `dashboard/page.tsx` conserve son rôle de fetch principal
- Aucune nouvelle route API nécessaire pour le chargement initial
- Le Supabase Realtime est ajouté uniquement côté client dans `<ActivityFeed>`
- Les autres sections du dashboard (KPIs, tableau recos, graphe, wallet) sont intactes

---

## Fichiers à créer / modifier

| Action | Fichier |
|---|---|
| **Créer** | `src/components/activity-feed.tsx` |
| **Modifier** | `src/lib/feed-utils.ts` — 4 nouveaux types + icons + labels |
| **Modifier** | `src/app/(protected)/dashboard/page.tsx` — fetch étendu + import `<ActivityFeed>` |
| **Modifier** | `src/app/globals.css` — si nouvelles animations Tailwind nécessaires |

---

## Hors scope
- Pas de page dédiée au feed
- Pas de persistance des événements vus/non-vus
- Pas de notifications push liées au feed
- Pas de filtre ou de pagination
