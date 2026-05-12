# Podium des Bâtisseurs de Réseau

**Date :** 2026-05-12
**Auteur :** Stéphane (brainstorm avec Claude)
**Statut :** Spec validée, à implémenter

## Contexte et objectifs

La page d'accueil (`/dashboard`) affiche aujourd'hui un `ActivityFeed` qui fait défiler les évènements récents du réseau (300 px). Cet affichage est informationnel mais **ne crée pas d'émulation** : aucun classement, aucun objectif chiffré, aucun social proof.

L'idée est d'ajouter un **podium des bâtisseurs de réseau** qui répond à 3 objectifs simultanés :

1. **Motiver à parrainer plus** — voir son rang pousse à monter dans le classement.
2. **Récompenser ceux qui font tourner la business** — mettre en avant les utilisateurs qui génèrent vraiment de la valeur (commissions, recos abouties).
3. **Créer du social proof** — montrer aux nouveaux que des gens réussissent vraiment sur Winelio.

L'`ActivityFeed` actuel **est conservé** (il garde l'ambiance "vivante"), le podium se place **au-dessus**.

## Décisions clés (issues du brainstorming)

| Dimension | Choix |
|---|---|
| Nombre de classements | **3 catégories** : Parrains / Revenus / Recos |
| Période principale | **Mois en cours** (reset auto le 1er du mois) |
| Période secondaire | **All-time** ("Hall of Fame") sur page dédiée |
| Périmètre | **Top global** sur le dashboard, **classement perso "Toi : #N"** intégré |
| Layout | **Carrousel auto** (8 s par slide, tap pour figer, dots cliquables) |
| Identité affichée | **Prénom + initiale du nom** ("Stéphane M.") + avatar |
| Devenir de l'`ActivityFeed` | **Conservé**, sous le podium |

## Architecture

### Vue d'ensemble

```
┌─────────────────────────────────────────────┐
│  /dashboard (Server Component existant)     │
│                                             │
│  ┌───────────────────────────────────┐     │
│  │  <NetworkPodiumCarousel />        │     │  ← NOUVEAU
│  │  Server: fetch initial            │     │
│  │  Client: rotation 8s              │     │
│  └───────────────────────────────────┘     │
│                                             │
│  ┌───────────────────────────────────┐     │
│  │  Lien : Voir le Hall of Fame →    │     │  ← NOUVEAU
│  └───────────────────────────────────┘     │
│                                             │
│  ┌───────────────────────────────────┐     │
│  │  <ActivityFeed /> (existant)      │     │
│  └───────────────────────────────────┘     │
│  ...                                        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  /network/leaderboard (NOUVELLE PAGE)       │
│  Tabs : Parrains | Revenus | Recos          │
│  Filtre période : Mois | 30j | 90j | All    │
│  Top 10 de la catégorie + ta position       │
└─────────────────────────────────────────────┘
```

### Composants à créer

| Fichier | Type | Rôle |
|---|---|---|
| `supabase/migrations/20260513_leaderboard_rpcs.sql` | Migration | 3 fonctions SQL pour les classements |
| `src/lib/leaderboard.ts` | Helper | Fetch typé des classements (server-side) |
| `src/components/network-podium-carousel.tsx` | Client Component | Carrousel auto + interactions |
| `src/components/network-podium-slide.tsx` | Client Component | 1 slide podium 1/2/3 réutilisable |
| `src/app/(protected)/network/leaderboard/page.tsx` | Server Component | Page Hall of Fame complète |
| `src/app/(protected)/dashboard/page.tsx` | Modif | Insertion du carrousel |

## Métriques détaillées

### 1. Top Parrains (score pondéré)

Score = somme pondérée des filleuls par niveau, **inscrits durant la période** :

```
score = 5×N1 + 3×N2 + 2×N3 + 1×N4 + 1×N5
```

où `Nk` = nombre de filleuls du user au niveau k qui ont leur `profiles.created_at` dans la période.

**Justification de la pondération :** standard MLM, valorise le parrainage direct sans écraser l'effet réseau.

**Filtres :**
- Exclure les emails techniques : `%@winelio-demo.internal`, `%@winelio-scraped.local`, `%@winelio-e2e.local`, `%@mailsac.com`
- Exclure le user système (`WINELIO_SYSTEM_USER_ID`)

### 2. Top Revenus (commissions générées)

Somme des `commission_transactions.amount` du user durant la période, **status IN ('EARNED', 'PENDING')**.

Affiché en € (`fmtEur`).

**Note métier :** on inclut PENDING pour montrer du dynamisme. Le label utilisateur sera "Commissions générées" (pas "touchées") pour rester honnête. Une mention "incluant en attente" en tooltip/légende est optionnelle.

### 3. Top Recos (recommandations créées)

Comptage des `recommendations` créées par le user (`referrer_id = user.id`) durant la période, **toutes étapes confondues**.

## SQL — 3 RPC functions

### `winelio.leaderboard_top_sponsors(p_period_start TIMESTAMPTZ, p_limit INT)`

```sql
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  score INT
)
```

Implémentation : recursive CTE qui descend la chaîne `sponsor_id` sur 5 niveaux pour chaque user, additionne les filleuls par niveau pondérés, filtre `created_at >= p_period_start`. ORDER BY score DESC LIMIT p_limit.

### `winelio.leaderboard_top_revenue(p_period_start TIMESTAMPTZ, p_limit INT)`

```sql
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  total_amount NUMERIC
)
```

```sql
SELECT user_id, ..., SUM(amount) AS total
FROM winelio.commission_transactions
WHERE status IN ('EARNED','PENDING')
  AND created_at >= p_period_start
  AND user_id != WINELIO_SYSTEM_USER_ID
GROUP BY user_id
ORDER BY total DESC LIMIT p_limit
```

### `winelio.leaderboard_top_recos(p_period_start TIMESTAMPTZ, p_limit INT)`

```sql
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  reco_count INT
)
```

```sql
SELECT referrer_id AS user_id, ..., COUNT(*) AS reco_count
FROM winelio.recommendations
WHERE created_at >= p_period_start
GROUP BY referrer_id
ORDER BY reco_count DESC LIMIT p_limit
```

### Helper RPC : ma position personnelle

`winelio.leaderboard_my_position(p_user_id UUID, p_category TEXT, p_period_start TIMESTAMPTZ)` retourne `{ rank: INT, value: NUMERIC, total_users: INT }` pour les 3 catégories. Une seule fonction paramétrée par `p_category ∈ ('sponsors', 'revenue', 'recos')`.

### Permissions
- `GRANT EXECUTE ... TO authenticated` sur toutes les RPC.
- `SECURITY DEFINER` + `SET search_path = winelio, public`.
- Pas de RLS-bypass nécessaire : les fonctions ne renvoient que des données agrégées + first_name/avatar (déjà publics dans `profiles`).

## Composants UI

### `<NetworkPodiumCarousel />` (Client Component)

**Props :**
```ts
interface Props {
  slides: PodiumSlideData[];      // 3 slides (chargées server-side)
  myPositions: { sponsors: number; revenue: number; recos: number };
}
```

**Comportement :**
- État interne : `currentSlide` (0..2), `pausedByUser` (boolean, default false).
- `useEffect` avec `setInterval(8000)` qui incrémente `currentSlide` modulo 3, sauf si `pausedByUser === true`.
- Au tap sur la slide → `pausedByUser = true`, le carrousel se fige.
- Sur les 3 dots → clic = saut direct + `pausedByUser = true`.
- **La pause est définitive pour la durée de la page.** Pas de bouton "Reprendre". Décision UX : un user qui interagit a manifesté un intérêt explicite pour figer le carrousel ; rotation auto reprendra au prochain chargement de la page.
- Animation : transition CSS `translateX` (slide horizontal) ou simple `opacity` cross-fade.

**Accessibilité :**
- `role="region"` + `aria-roledescription="carousel"`.
- `aria-label` sur chaque dot ("Aller au podium des parrains", etc.).
- Annonce `aria-live="polite"` pour le titre de la slide active.
- `prefers-reduced-motion` : désactive l'auto-rotation, garde les dots cliquables.

### `<NetworkPodiumSlide />` (sub-component)

```
┌────────────────────────────────────┐
│  🏆 TOP PARRAINS · Mai 2026        │
├────────────────────────────────────┤
│                                    │
│           [ avatar ]               │
│           Stéphane M.              │
│              45 pts                │
│              ─ 1er ─               │
│                                    │
│   [avatar]         [avatar]        │
│   Léa R.            Bob T.         │
│   32 pts            28 pts         │
│   ─ 2e ─            ─ 3e ─         │
│                                    │
│  ───────────────────────────────   │
│  Toi : #14 · 6 pts                 │
└────────────────────────────────────┘
```

Les médailles or/argent/bronze sont des gradients Tailwind cohérents avec la charte Winelio :
- 1er : `from-yellow-400 to-yellow-500` (or)
- 2e : `from-gray-300 to-gray-400` (argent)
- 3e : `from-amber-600 to-amber-700` (bronze)

Avatar : composant `<ProfileAvatar>` existant (fallback initiale colorée).

**Cas particuliers :**
- Si moins de 3 utilisateurs dans le classement → on affiche juste les places existantes (pas de podium fantôme).
- Si l'user actuel est dans le top 3 → la ligne "Toi : #N" est masquée (déjà visible).
- Si l'user n'a aucune activité dans la période → "Toi : non classé".

### Page `/network/leaderboard` (Server Component)

```
┌──────────────────────────────────────┐
│  Hall of Fame Winelio                │
│                                      │
│  [Parrains][Revenus][Recos]          │  ← Tabs (URL ?tab=...)
│  [Mois][30j][90j][All-time]          │  ← Period filter (?p=...)
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Podium 1/2/3 (gros)           │  │
│  └────────────────────────────────┘  │
│                                      │
│  Tableau top 10                      │
│  ┌────────────────────────────────┐  │
│  │ #4  Marie D.       18 pts      │  │
│  │ #5  Paul R.        15 pts      │  │
│  │ ...                            │  │
│  │ #10 Tom L.         8 pts       │  │
│  └────────────────────────────────┘  │
│                                      │
│  Ton classement : #14 (6 pts)        │
└──────────────────────────────────────┘
```

Tabs et filtres via querystring (`?tab=sponsors&p=month`). Server Component lit `searchParams`, fait l'appel RPC adapté.

## Flux de données

```
[1er chargement /dashboard]
       │
       ▼
Server Component
  ├── RPC leaderboard_top_sponsors(month_start, 3)
  ├── RPC leaderboard_top_revenue(month_start, 3)
  ├── RPC leaderboard_top_recos(month_start, 3)
  └── RPC leaderboard_my_position(user_id, 'sponsors|revenue|recos', month_start)
       │
       ▼
Hydratation NetworkPodiumCarousel (Client)
  └── Auto-rotation 8s
```

**Cache / fraîcheur :**
- `revalidate = 900` (15 min) sur la route `/dashboard` (ISR).
- Pas de polling temps réel : pas critique, et limite la charge DB.
- Sur `/network/leaderboard`, `revalidate = 300` (5 min) car page plus dédiée.

## Privacy & RGPD

- **Données affichées publiquement :** prénom, initiale du nom, avatar (s'il existe), score.
- **Pas affichées :** email, téléphone, adresse, code parrain, montants exacts si l'user n'est pas top.
- **Mention CGU :** ajouter une ligne dans les CGU "Les classements anonymisés (prénom + initiale + avatar) sont visibles par les autres utilisateurs Winelio." (Hors scope de cette spec, à faire séparément.)
- **Opt-out futur (out of scope ici)** : ajout d'un toggle `profiles.is_visible_in_leaderboard` (default true) — peut être ajouté en V2 si demande utilisateur.

## Tests

- Test E2E (Playwright) : ouverture dashboard → carrousel visible → après 8s la slide 2 s'affiche → tap fige → dot 3 affiche slide 3.
- Test unitaire : composant `<NetworkPodiumSlide>` rend correctement avec 0/1/2/3 entrées.
- Test SQL : seed de 5 users avec 3 niveaux de filleuls, vérifier que le score pondéré matche la formule.
- Test RGPD manuel : un user non top voit ses données seulement dans "Toi : #N" mais pas dans le top des autres.

## Risques et points d'attention

1. **Recursive CTE coût DB** — la fonction `leaderboard_top_sponsors` peut être lente avec un gros réseau. Mitigation : LIMIT au top 100 candidats avant le tri final ; ajouter un index sur `profiles(sponsor_id, created_at)` si besoin.
2. **Faible volume initial** — les 3 podiums seront probablement creux pendant les premiers mois (peu d'utilisateurs réels). Solution : afficher un message d'encouragement plutôt qu'un podium vide ("Sois le premier sur le podium ce mois-ci !").
3. **Émulation excessive / frustration** — si seul Top 3 est récompensé, les #4 et au-delà se sentent invisibles. Mitigation : "Toi : #14" toujours visible + page Hall of Fame avec top 10.
4. **Données de démo polluent le classement** — déjà géré : on filtre les emails `@winelio-demo.internal`, `@winelio-scraped.local`, etc. dans toutes les RPC.
5. **Charge cognitive sur le dashboard** — l'ajout du carrousel allonge la page. Mitigation : carrousel rotatif (1 slide visible à la fois) → empreinte verticale unique de ~280 px (similaire à l'ActivityFeed actuel).

## Hors scope (V2 éventuel)

- Notifications push "Tu es passé #1 dans le classement Parrains de mai !"
- Badges / récompenses physiques pour les tops mensuels
- Système de saisons (trimestres / saisons thématiques)
- Toggle opt-out individuel pour ne pas apparaître publiquement
- Filtres géographiques / par catégorie pro
- Top des sponsors qui font monter leurs filleuls (mentor score)
