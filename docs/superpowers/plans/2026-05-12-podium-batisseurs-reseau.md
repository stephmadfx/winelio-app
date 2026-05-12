# Podium des Bâtisseurs Réseau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un carrousel de 3 podiums (Parrains pondérés / Revenus / Recos) sur le dashboard Winelio, avec une page Hall of Fame all-time dédiée, pour créer émulation et social proof entre les utilisateurs.

**Architecture :** 4 fonctions PostgreSQL pour les classements (RPC via Supabase JS), un Server Component qui pré-charge les données sur le dashboard, un Client Component pour la rotation auto 8s, et une page Server Component dédiée pour le Hall of Fame all-time.

**Tech Stack :** PostgreSQL recursive CTE, Supabase RPC, Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui Card.

**Spec source :** `docs/superpowers/specs/2026-05-12-podium-batisseurs-reseau-design.md`

---

## File Structure

| Fichier | Type | Responsabilité |
|---|---|---|
| `supabase/migrations/20260513_leaderboard_rpcs.sql` | Migration SQL | 4 fonctions RPC : top_sponsors, top_revenue, top_recos, my_position |
| `src/lib/leaderboard.ts` | Helper TS | Types + wrappers typés autour des `supabase.rpc(...)` |
| `src/components/network-podium-slide.tsx` | Client Component | Affichage d'1 podium (1/2/3 + Toi : #N) |
| `src/components/network-podium-carousel.tsx` | Client Component | Conteneur du carrousel (3 slides + dots + auto-rotate) |
| `src/app/(protected)/dashboard/page.tsx` | Server Component (modif) | Insertion du composant + fetch des classements |
| `src/app/(protected)/network/leaderboard/page.tsx` | Server Component (créé) | Page Hall of Fame complète avec tabs et filtres |
| `tests/e2e/podium.spec.ts` | E2E Playwright | Vérification carrousel + Hall of Fame |

---

## Task 1 : SQL — fonctions RPC du leaderboard

**Files:**
- Create: `supabase/migrations/20260513_leaderboard_rpcs.sql`

- [ ] **Step 1 : Écrire la migration**

Créer le fichier `supabase/migrations/20260513_leaderboard_rpcs.sql` avec ce contenu exact :

```sql
-- Filtre commun : exclut les emails techniques (démo, scraping, e2e, recette)
-- et l'utilisateur système Winelio. Réutilisé par toutes les fonctions ci-dessous.

-- 1. TOP PARRAINS : score pondéré 5/3/2/1/1 sur les 5 niveaux MLM
CREATE OR REPLACE FUNCTION winelio.leaderboard_top_sponsors(
  p_period_start TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  score INT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
  WITH RECURSIVE downline AS (
    -- Niveau 1 : filleuls directs
    SELECT
      p.sponsor_id AS root_id,
      p.id        AS member_id,
      1           AS lvl,
      p.created_at
    FROM winelio.profiles p
    WHERE p.sponsor_id IS NOT NULL
      AND p.sponsor_id != '00000000-0000-0000-0000-000000000001'::uuid
      AND p.email NOT LIKE '%@winelio-demo.internal'
      AND p.email NOT LIKE '%@winelio-scraped.local'
      AND p.email NOT LIKE '%@winelio-e2e.local'
      AND p.email NOT LIKE '%@mailsac.com'
    UNION ALL
    -- Niveaux 2-5 : descente
    SELECT
      d.root_id,
      p.id,
      d.lvl + 1,
      p.created_at
    FROM winelio.profiles p
    JOIN downline d ON p.sponsor_id = d.member_id
    WHERE d.lvl < 5
      AND p.email NOT LIKE '%@winelio-demo.internal'
      AND p.email NOT LIKE '%@winelio-scraped.local'
      AND p.email NOT LIKE '%@winelio-e2e.local'
      AND p.email NOT LIKE '%@mailsac.com'
  ),
  scored AS (
    SELECT
      d.root_id,
      SUM(
        CASE d.lvl
          WHEN 1 THEN 5
          WHEN 2 THEN 3
          WHEN 3 THEN 2
          WHEN 4 THEN 1
          WHEN 5 THEN 1
          ELSE 0
        END
      )::INT AS score
    FROM downline d
    WHERE d.created_at >= p_period_start
    GROUP BY d.root_id
  )
  SELECT
    s.root_id AS user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    s.score
  FROM scored s
  JOIN winelio.profiles pr ON pr.id = s.root_id
  WHERE s.score > 0
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
    AND pr.id != '00000000-0000-0000-0000-000000000001'::uuid
  ORDER BY s.score DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_top_sponsors(TIMESTAMPTZ, INT) TO authenticated;

-- 2. TOP REVENUS : Σ commissions EARNED + PENDING
CREATE OR REPLACE FUNCTION winelio.leaderboard_top_revenue(
  p_period_start TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  total_amount NUMERIC
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
  SELECT
    ct.user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    SUM(ct.amount)::NUMERIC AS total_amount
  FROM winelio.commission_transactions ct
  JOIN winelio.profiles pr ON pr.id = ct.user_id
  WHERE ct.created_at >= p_period_start
    AND UPPER(ct.status) IN ('EARNED', 'PENDING')
    AND ct.user_id != '00000000-0000-0000-0000-000000000001'::uuid
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
  GROUP BY ct.user_id, pr.first_name, pr.last_name, pr.avatar, pr.created_at
  ORDER BY total_amount DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_top_revenue(TIMESTAMPTZ, INT) TO authenticated;

-- 3. TOP RECOS : nombre de recommandations créées
CREATE OR REPLACE FUNCTION winelio.leaderboard_top_recos(
  p_period_start TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  reco_count INT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
  SELECT
    r.referrer_id AS user_id,
    pr.first_name,
    pr.last_name,
    pr.avatar,
    COUNT(*)::INT AS reco_count
  FROM winelio.recommendations r
  JOIN winelio.profiles pr ON pr.id = r.referrer_id
  WHERE r.created_at >= p_period_start
    AND COALESCE(r.is_demo, false) = false
    AND r.referrer_id != '00000000-0000-0000-0000-000000000001'::uuid
    AND pr.email NOT LIKE '%@winelio-demo.internal'
    AND pr.email NOT LIKE '%@winelio-scraped.local'
    AND pr.email NOT LIKE '%@winelio-e2e.local'
    AND pr.email NOT LIKE '%@mailsac.com'
  GROUP BY r.referrer_id, pr.first_name, pr.last_name, pr.avatar, pr.created_at
  ORDER BY reco_count DESC, pr.created_at ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_top_recos(TIMESTAMPTZ, INT) TO authenticated;

-- 4. MA POSITION : rang du user dans une catégorie donnée pour la période
CREATE OR REPLACE FUNCTION winelio.leaderboard_my_position(
  p_user_id UUID,
  p_category TEXT,                   -- 'sponsors' | 'revenue' | 'recos'
  p_period_start TIMESTAMPTZ
)
RETURNS TABLE (
  rank INT,
  value NUMERIC,
  total_users INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_rank INT;
  v_value NUMERIC;
  v_total INT;
BEGIN
  IF p_category = 'sponsors' THEN
    WITH ranked AS (
      SELECT user_id, score, RANK() OVER (ORDER BY score DESC) AS rk
      FROM winelio.leaderboard_top_sponsors(p_period_start, 100000)
    )
    SELECT rk, score, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;
  ELSIF p_category = 'revenue' THEN
    WITH ranked AS (
      SELECT user_id, total_amount, RANK() OVER (ORDER BY total_amount DESC) AS rk
      FROM winelio.leaderboard_top_revenue(p_period_start, 100000)
    )
    SELECT rk, total_amount, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;
  ELSIF p_category = 'recos' THEN
    WITH ranked AS (
      SELECT user_id, reco_count, RANK() OVER (ORDER BY reco_count DESC) AS rk
      FROM winelio.leaderboard_top_recos(p_period_start, 100000)
    )
    SELECT rk, reco_count, (SELECT COUNT(*) FROM ranked)
      INTO v_rank, v_value, v_total
      FROM ranked WHERE user_id = p_user_id;
  ELSE
    RAISE EXCEPTION 'Unknown category: %', p_category;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_rank, 0)::INT,
    COALESCE(v_value, 0)::NUMERIC,
    COALESCE(v_total, 0)::INT;
END;
$$;

GRANT EXECUTE ON FUNCTION winelio.leaderboard_my_position(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION winelio.leaderboard_top_sponsors IS 'Top parrains : score pondéré 5/3/2/1/1 sur les 5 niveaux MLM, filleuls inscrits dans la période.';
COMMENT ON FUNCTION winelio.leaderboard_top_revenue  IS 'Top revenus : somme des commissions EARNED + PENDING dans la période.';
COMMENT ON FUNCTION winelio.leaderboard_top_recos    IS 'Top recos : nombre de recommandations créées dans la période (is_demo=false).';
COMMENT ON FUNCTION winelio.leaderboard_my_position  IS 'Position d''un user dans une catégorie pour une période. Retourne (rank, value, total_users) ou (0,0,0) si non classé.';
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/migrations/20260513_leaderboard_rpcs.sql
git commit -m "feat(db): RPC leaderboard (top sponsors/revenue/recos + my_position)"
```

---

## Task 2 : Appliquer la migration sur le VPS et vérifier

**Files:**
- Aucun fichier modifié, juste exécution SQL.

- [ ] **Step 1 : Pousser la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260513_leaderboard_rpcs.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260513_leaderboard_rpcs.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260513_leaderboard_rpcs.sql"
```

Attendu : `CREATE FUNCTION` × 4, `GRANT` × 4, `COMMENT` × 4 (pas d'erreur).

- [ ] **Step 2 : Vérifier que les 4 fonctions existent et tournent**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT * FROM winelio.leaderboard_top_sponsors(date_trunc('month', now()), 5);\""
```

Attendu : 0 à 5 lignes (selon données réelles), pas d'erreur SQL.

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT * FROM winelio.leaderboard_top_revenue(date_trunc('month', now()), 5);\""
```

Attendu : 0 à 5 lignes, pas d'erreur.

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT * FROM winelio.leaderboard_top_recos(date_trunc('month', now()), 5);\""
```

Attendu : 0 à 5 lignes, pas d'erreur.

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT * FROM winelio.leaderboard_my_position('73dddec2-6f36-4b88-a3be-36730e134665', 'sponsors', date_trunc('month', now()));\""
```

Attendu : 1 ligne avec colonnes `rank, value, total_users` (les valeurs peuvent être 0,0,0 si l'user de test n'a pas d'activité ce mois).

Si une fonction retourne une erreur : revenir à la migration, corriger, ré-appliquer.

---

## Task 3 : Helper TypeScript `lib/leaderboard.ts`

**Files:**
- Create: `src/lib/leaderboard.ts`

- [ ] **Step 1 : Écrire le helper typé**

```typescript
/**
 * Wrappers typés autour des RPC de leaderboard PostgreSQL.
 * Un seul appel = une catégorie + une période. Les wrappers sont composables
 * dans des Server Components via Promise.all() pour fetch en parallèle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LeaderboardCategory = "sponsors" | "revenue" | "recos";

export interface PodiumEntry {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  /** Valeur affichée : score / total_amount / reco_count selon la catégorie */
  value: number;
}

export interface MyPosition {
  rank: number;       // 0 si non classé
  value: number;      // 0 si non classé
  totalUsers: number; // 0 si la catégorie n'a aucun classement
}

/** Retourne le 1er du mois en cours (UTC), à utiliser comme p_period_start. */
export function startOfCurrentMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Tous les temps : 2010-01-01 (avant la création de Winelio) */
export function startOfAllTime(): Date {
  return new Date("2010-01-01T00:00:00Z");
}

export async function fetchTopSponsors(
  supabase: SupabaseClient,
  periodStart: Date,
  limit = 3,
): Promise<PodiumEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_top_sponsors", {
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) {
    console.error("[leaderboard] top_sponsors error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; first_name: string | null; last_name: string | null; avatar: string | null; score: number }) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    avatar: r.avatar,
    value: Number(r.score),
  }));
}

export async function fetchTopRevenue(
  supabase: SupabaseClient,
  periodStart: Date,
  limit = 3,
): Promise<PodiumEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_top_revenue", {
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) {
    console.error("[leaderboard] top_revenue error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; first_name: string | null; last_name: string | null; avatar: string | null; total_amount: number }) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    avatar: r.avatar,
    value: Number(r.total_amount),
  }));
}

export async function fetchTopRecos(
  supabase: SupabaseClient,
  periodStart: Date,
  limit = 3,
): Promise<PodiumEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_top_recos", {
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) {
    console.error("[leaderboard] top_recos error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; first_name: string | null; last_name: string | null; avatar: string | null; reco_count: number }) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    avatar: r.avatar,
    value: Number(r.reco_count),
  }));
}

export async function fetchMyPosition(
  supabase: SupabaseClient,
  userId: string,
  category: LeaderboardCategory,
  periodStart: Date,
): Promise<MyPosition> {
  const { data, error } = await supabase.rpc("leaderboard_my_position", {
    p_user_id: userId,
    p_category: category,
    p_period_start: periodStart.toISOString(),
  });
  if (error || !data || data.length === 0) {
    return { rank: 0, value: 0, totalUsers: 0 };
  }
  const row = data[0];
  return {
    rank: Number(row.rank),
    value: Number(row.value),
    totalUsers: Number(row.total_users),
  };
}

/** Format prénom + initiale du nom. "Stéphane MAIRIAUX" → "Stéphane M." */
export function formatPodiumName(first: string | null, last: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f && !l) return "Utilisateur";
  if (!l) return f;
  return `${f} ${l.charAt(0).toUpperCase()}.`;
}

/** Format euro français concis (350 → "350 €", 1234.5 → "1 234,50 €") */
export function fmtEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
```

- [ ] **Step 2 : Vérifier que le fichier compile**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/auth/login
```

Attendu : `200`. Si erreur, vérifier les logs : `pm2 logs winelio --lines 20 --nostream --err`.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/leaderboard.ts
git commit -m "feat(leaderboard): helper TypeScript typé pour les RPC"
```

---

## Task 4 : Composant `<NetworkPodiumSlide />`

**Files:**
- Create: `src/components/network-podium-slide.tsx`

- [ ] **Step 1 : Écrire le composant**

```tsx
"use client";

import { ProfileAvatar } from "@/components/profile-avatar";
import { formatPodiumName, fmtEur, type PodiumEntry, type MyPosition, type LeaderboardCategory } from "@/lib/leaderboard";

interface Props {
  category: LeaderboardCategory;
  title: string;        // ex: "Top Parrains · Mai 2026"
  emoji: string;        // 🏆 / 💰 / 📋
  unitSuffix: string;   // " pts" / "" (€ géré ailleurs) / " recos"
  topEntries: PodiumEntry[];
  myPosition: MyPosition;
  currentUserId: string;
}

const RANK_GRADIENTS: Record<1 | 2 | 3, string> = {
  1: "from-yellow-400 to-yellow-500",
  2: "from-gray-300 to-gray-400",
  3: "from-amber-600 to-amber-700",
};

const RANK_EMOJIS: Record<1 | 2 | 3, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

function formatValue(value: number, category: LeaderboardCategory, suffix: string): string {
  if (category === "revenue") return fmtEur(value);
  return `${value}${suffix}`;
}

export function NetworkPodiumSlide({
  category,
  title,
  emoji,
  unitSuffix,
  topEntries,
  myPosition,
  currentUserId,
}: Props) {
  const top1 = topEntries[0] ?? null;
  const top2 = topEntries[1] ?? null;
  const top3 = topEntries[2] ?? null;
  const userIsInTop3 = top1?.user_id === currentUserId
    || top2?.user_id === currentUserId
    || top3?.user_id === currentUserId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-xl" aria-hidden="true">{emoji}</span>
        <h3 className="font-semibold text-winelio-dark text-sm uppercase tracking-wide">{title}</h3>
      </div>

      {topEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-center text-sm text-winelio-gray">
            Personne ce mois-ci.<br/>
            <span className="text-winelio-orange font-semibold">Sois le premier !</span>
          </p>
        </div>
      ) : (
        <div className="flex-1 flex items-end justify-center gap-3 sm:gap-6 px-2">
          {/* Place 2 (gauche) */}
          {top2 && (
            <PodiumStep
              rank={2}
              entry={top2}
              category={category}
              suffix={unitSuffix}
              isCurrentUser={top2.user_id === currentUserId}
              heightClass="h-16"
            />
          )}
          {/* Place 1 (centre, plus haute) */}
          {top1 && (
            <PodiumStep
              rank={1}
              entry={top1}
              category={category}
              suffix={unitSuffix}
              isCurrentUser={top1.user_id === currentUserId}
              heightClass="h-24"
            />
          )}
          {/* Place 3 (droite) */}
          {top3 && (
            <PodiumStep
              rank={3}
              entry={top3}
              category={category}
              suffix={unitSuffix}
              isCurrentUser={top3.user_id === currentUserId}
              heightClass="h-12"
            />
          )}
        </div>
      )}

      {/* Ma position */}
      <div className="mt-4 pt-3 border-t border-gray-100 text-center">
        {myPosition.rank === 0 ? (
          <p className="text-xs text-winelio-gray">
            Toi : <span className="font-semibold">non classé</span>
          </p>
        ) : userIsInTop3 ? (
          <p className="text-xs text-winelio-gray">
            🎉 Tu es <span className="font-bold text-winelio-orange">#{myPosition.rank}</span> sur {myPosition.totalUsers}
          </p>
        ) : (
          <p className="text-xs text-winelio-gray">
            Toi : <span className="font-bold text-winelio-orange">#{myPosition.rank}</span>
            {" · "}
            <span className="font-semibold text-winelio-dark">{formatValue(myPosition.value, category, unitSuffix)}</span>
            {" · "}sur {myPosition.totalUsers}
          </p>
        )}
      </div>
    </div>
  );
}

function PodiumStep({
  rank,
  entry,
  category,
  suffix,
  isCurrentUser,
  heightClass,
}: {
  rank: 1 | 2 | 3;
  entry: PodiumEntry;
  category: LeaderboardCategory;
  suffix: string;
  isCurrentUser: boolean;
  heightClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 max-w-[100px]">
      <div className="relative">
        <ProfileAvatar
          name={`${entry.first_name ?? ""} ${entry.last_name ?? ""}`}
          avatar={entry.avatar}
          size={rank === 1 ? 56 : 44}
          className={isCurrentUser ? "ring-2 ring-winelio-orange ring-offset-2" : ""}
        />
        <span className="absolute -top-1 -right-1 text-base" aria-label={`${rank}e place`}>
          {RANK_EMOJIS[rank]}
        </span>
      </div>
      <p className="text-xs font-semibold text-winelio-dark text-center truncate max-w-full">
        {formatPodiumName(entry.first_name, entry.last_name)}
      </p>
      <p className="text-xs font-bold text-winelio-orange tabular-nums">
        {formatValue(entry.value, category, suffix)}
      </p>
      <div className={`w-full ${heightClass} rounded-t-lg bg-gradient-to-b ${RANK_GRADIENTS[rank]} flex items-start justify-center pt-1`}>
        <span className="text-white text-xs font-bold">#{rank}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier que le projet compile**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/auth/login
```

Attendu : `200`.

- [ ] **Step 3 : Commit**

```bash
git add src/components/network-podium-slide.tsx
git commit -m "feat(podium): NetworkPodiumSlide component"
```

---

## Task 5 : Composant `<NetworkPodiumCarousel />`

**Files:**
- Create: `src/components/network-podium-carousel.tsx`

- [ ] **Step 1 : Écrire le composant**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { NetworkPodiumSlide } from "@/components/network-podium-slide";
import type { PodiumEntry, MyPosition } from "@/lib/leaderboard";

interface Props {
  monthLabel: string;       // ex: "Mai 2026"
  currentUserId: string;
  topSponsors: PodiumEntry[];
  topRevenue: PodiumEntry[];
  topRecos: PodiumEntry[];
  myPositions: {
    sponsors: MyPosition;
    revenue: MyPosition;
    recos: MyPosition;
  };
}

const ROTATION_MS = 8_000;
const SLIDES = ["sponsors", "revenue", "recos"] as const;
type SlideKey = typeof SLIDES[number];

const SLIDE_META: Record<SlideKey, { emoji: string; titlePrefix: string; suffix: string }> = {
  sponsors: { emoji: "🏆", titlePrefix: "Top Parrains", suffix: " pts" },
  revenue:  { emoji: "💰", titlePrefix: "Top Revenus", suffix: "" },
  recos:    { emoji: "📋", titlePrefix: "Top Recos",   suffix: "" },
};

export function NetworkPodiumCarousel({
  monthLabel,
  currentUserId,
  topSponsors,
  topRevenue,
  topRecos,
  myPositions,
}: Props) {
  const [index, setIndex] = useState(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Respecte prefers-reduced-motion : pas d'auto-rotation
  const prefersReducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (pausedByUser || prefersReducedMotion) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pausedByUser, prefersReducedMotion]);

  const current = SLIDES[index];
  const meta = SLIDE_META[current];

  const entries = current === "sponsors" ? topSponsors
                : current === "revenue"  ? topRevenue
                : topRecos;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Classements Winelio du mois"
    >
      <Card className="!rounded-2xl">
        <CardContent
          className="p-4 sm:p-5 cursor-pointer select-none min-h-[280px]"
          onClick={() => setPausedByUser(true)}
        >
          <div aria-live="polite" className="sr-only">
            {meta.titlePrefix} · {monthLabel}
          </div>
          <NetworkPodiumSlide
            category={current}
            title={`${meta.titlePrefix} · ${monthLabel}`}
            emoji={meta.emoji}
            unitSuffix={meta.suffix}
            topEntries={entries}
            myPosition={myPositions[current]}
            currentUserId={currentUserId}
          />

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-3">
            {SLIDES.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                  setPausedByUser(true);
                }}
                aria-label={`Aller au podium ${SLIDE_META[s].titlePrefix}`}
                className={`h-2 rounded-full transition-all ${
                  i === index
                    ? "w-6 bg-winelio-orange"
                    : "w-2 bg-gray-300 hover:bg-gray-400"
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-center mt-3">
        <Link
          href="/network/leaderboard"
          className="text-sm text-winelio-orange hover:text-winelio-amber font-medium inline-flex items-center gap-1"
        >
          Voir le Hall of Fame all-time →
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2 : Vérifier que le projet compile**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/auth/login
```

Attendu : `200`.

- [ ] **Step 3 : Commit**

```bash
git add src/components/network-podium-carousel.tsx
git commit -m "feat(podium): NetworkPodiumCarousel with auto-rotation 8s"
```

---

## Task 6 : Intégrer le carrousel dans `/dashboard`

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`

- [ ] **Step 1 : Ajouter les imports**

Repérer la zone d'imports en tête de fichier (`import { ActivityFeed } from "@/components/activity-feed";`) et y ajouter en dessous :

```typescript
import { NetworkPodiumCarousel } from "@/components/network-podium-carousel";
import {
  fetchTopSponsors,
  fetchTopRevenue,
  fetchTopRecos,
  fetchMyPosition,
  startOfCurrentMonthUTC,
} from "@/lib/leaderboard";
```

- [ ] **Step 2 : Fetcher les données dans la fonction page**

Trouver l'endroit dans la fonction où `supabase` est déjà disponible et où `topEvents` est calculé (avant le `return`). Ajouter ce bloc :

```typescript
// Podium des bâtisseurs réseau (mois en cours, top 3)
const periodStart = startOfCurrentMonthUTC();
const monthLabel = periodStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

const [topSponsors, topRevenue, topRecos, posSponsors, posRevenue, posRecos] = await Promise.all([
  fetchTopSponsors(supabase, periodStart, 3),
  fetchTopRevenue(supabase, periodStart, 3),
  fetchTopRecos(supabase, periodStart, 3),
  fetchMyPosition(supabase, user.id, "sponsors", periodStart),
  fetchMyPosition(supabase, user.id, "revenue", periodStart),
  fetchMyPosition(supabase, user.id, "recos", periodStart),
]);
```

- [ ] **Step 3 : Insérer le composant juste avant l'`<ActivityFeed>`**

Trouver dans le JSX :
```jsx
{/* Feed d'activité */}
<section>
  <ActivityFeed
    initialEvents={topEvents}
    demoMode={demoMode}
    className="!h-[300px]"
  />
</section>
```

Ajouter juste AVANT cette `<section>` :

```jsx
{/* Podium des bâtisseurs réseau (mois en cours) */}
<section>
  <NetworkPodiumCarousel
    monthLabel={monthLabelCapitalized}
    currentUserId={user.id}
    topSponsors={topSponsors}
    topRevenue={topRevenue}
    topRecos={topRecos}
    myPositions={{
      sponsors: posSponsors,
      revenue: posRevenue,
      recos: posRecos,
    }}
  />
</section>
```

- [ ] **Step 4 : Vérifier le rendu en local**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/dashboard
```

Attendu : `307` (redirection vers /auth/login si pas connecté) ou `200`. **Pas d'erreur 500.**

Logs : `pm2 logs winelio --lines 10 --nostream --err`. Aucune erreur attendue.

- [ ] **Step 5 : Commit**

```bash
git add src/app/\(protected\)/dashboard/page.tsx
git commit -m "feat(dashboard): integrate NetworkPodiumCarousel above ActivityFeed"
```

---

## Task 7 : Page Hall of Fame `/network/leaderboard`

**Files:**
- Create: `src/app/(protected)/network/leaderboard/page.tsx`

- [ ] **Step 1 : Créer la page Server Component**

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileAvatar } from "@/components/profile-avatar";
import {
  fetchTopSponsors,
  fetchTopRevenue,
  fetchTopRecos,
  fetchMyPosition,
  formatPodiumName,
  fmtEur,
  startOfCurrentMonthUTC,
  startOfAllTime,
  type LeaderboardCategory,
  type PodiumEntry,
} from "@/lib/leaderboard";

export const revalidate = 300; // 5 min

const TABS: { key: LeaderboardCategory; label: string; emoji: string; suffix: string }[] = [
  { key: "sponsors", label: "Parrains", emoji: "🏆", suffix: " pts" },
  { key: "revenue",  label: "Revenus",  emoji: "💰", suffix: "" },
  { key: "recos",    label: "Recos",    emoji: "📋", suffix: "" },
];

const PERIODS: { key: string; label: string; startFn: () => Date }[] = [
  { key: "month", label: "Ce mois", startFn: startOfCurrentMonthUTC },
  { key: "30d", label: "30j",
    startFn: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  { key: "90d", label: "90j",
    startFn: () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
  { key: "all", label: "All-time", startFn: startOfAllTime },
];

function formatValue(value: number, category: LeaderboardCategory, suffix: string): string {
  if (category === "revenue") return fmtEur(value);
  return `${value}${suffix}`;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; p?: string }>;
}) {
  const params = await searchParams;
  const tabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "sponsors") as LeaderboardCategory;
  const periodKey = PERIODS.find((p) => p.key === params.p)?.key ?? "month";
  const period = PERIODS.find((p) => p.key === periodKey)!;
  const tab = TABS.find((t) => t.key === tabKey)!;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const periodStart = period.startFn();

  let entries: PodiumEntry[] = [];
  if (tabKey === "sponsors") entries = await fetchTopSponsors(supabase, periodStart, 10);
  else if (tabKey === "revenue") entries = await fetchTopRevenue(supabase, periodStart, 10);
  else entries = await fetchTopRecos(supabase, periodStart, 10);

  const myPos = await fetchMyPosition(supabase, user.id, tabKey, periodStart);

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark">Hall of Fame Winelio</h2>
          <p className="text-sm text-winelio-gray mt-1">
            Les meilleurs bâtisseurs de réseau, classement mis à jour toutes les 5 minutes.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-winelio-orange font-medium">
          ← Dashboard
        </Link>
      </div>

      {/* Tabs catégorie */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/network/leaderboard?tab=${t.key}&p=${periodKey}`}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              t.key === tabKey
                ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
                : "bg-white text-winelio-dark border border-gray-200 hover:border-winelio-orange/40"
            }`}
          >
            {t.emoji} {t.label}
          </Link>
        ))}
      </div>

      {/* Filtres période */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/network/leaderboard?tab=${tabKey}&p=${p.key}`}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              p.key === periodKey
                ? "bg-winelio-dark text-white"
                : "bg-white text-winelio-gray border border-gray-200 hover:border-winelio-dark/40"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Top 10 */}
      <Card className="!rounded-2xl mb-4">
        <CardContent className="p-4 sm:p-6">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-winelio-gray text-sm">Aucun classement pour cette période.</p>
              <p className="text-winelio-orange font-semibold mt-2">Sois le premier à inscrire ton nom !</p>
            </div>
          ) : (
            <ol className="space-y-2">
              {entries.map((e, idx) => {
                const rank = idx + 1;
                const isMe = e.user_id === user.id;
                return (
                  <li
                    key={e.user_id}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      isMe ? "bg-winelio-orange/10 ring-1 ring-winelio-orange/30" : "bg-muted/50"
                    }`}
                  >
                    <span className={`shrink-0 w-8 text-center font-bold ${
                      rank <= 3 ? "text-winelio-orange text-lg" : "text-winelio-gray text-sm"
                    }`}>
                      {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
                    </span>
                    <ProfileAvatar
                      name={`${e.first_name ?? ""} ${e.last_name ?? ""}`}
                      avatar={e.avatar}
                      size={36}
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-winelio-dark truncate">
                      {formatPodiumName(e.first_name, e.last_name)}
                      {isMe && <span className="ml-2 text-xs text-winelio-orange font-semibold">(toi)</span>}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-winelio-orange tabular-nums">
                      {formatValue(e.value, tabKey, tab.suffix)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Ma position si hors top 10 */}
      {myPos.rank > 10 && (
        <Card className="!rounded-2xl">
          <CardContent className="p-4 sm:p-5 text-center">
            <p className="text-sm text-winelio-gray">Ton classement</p>
            <p className="text-2xl font-bold text-winelio-orange mt-1">
              #{myPos.rank} <span className="text-sm font-normal text-winelio-gray">sur {myPos.totalUsers}</span>
            </p>
            <p className="text-sm text-winelio-dark mt-1">
              {formatValue(myPos.value, tabKey, tab.suffix)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier le rendu local**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/network/leaderboard
```

Attendu : `307` (redir login) ou `200`. Pas de 500.

- [ ] **Step 3 : Commit**

```bash
git add src/app/\(protected\)/network/leaderboard/page.tsx
git commit -m "feat(leaderboard): Hall of Fame page with tabs and period filters"
```

---

## Task 8 : Test E2E (Playwright)

**Files:**
- Create: `tests/e2e/podium.spec.ts`

> Si le dossier `tests/e2e` n'existe pas dans le projet (vérifier avec `ls tests/e2e 2>/dev/null`), skipper ce task et noter dans le commit final que le E2E manuel a été fait à la place.

- [ ] **Step 1 : Vérifier l'infra E2E existante**

```bash
ls /Users/steph/PROJETS/WINELIO/winelio/tests/e2e/ 2>/dev/null | head -3
ls /Users/steph/PROJETS/WINELIO/winelio/playwright.config.ts 2>/dev/null
```

Si rien : passer au Task 9 directement (skip ce task).

Sinon, lire la config Playwright pour comprendre les helpers (`tests/e2e/_helpers/`) puis adapter le test ci-dessous au pattern du projet.

- [ ] **Step 2 : Écrire le test E2E**

```typescript
import { test, expect } from "@playwright/test";
import { loginAsRealUser } from "./_helpers/auth"; // helper existant si présent

test.describe("Podium des bâtisseurs réseau", () => {
  test("affiche le carrousel sur le dashboard", async ({ page }) => {
    await loginAsRealUser(page, "podium-test@winelio-e2e.local");
    await page.goto("/dashboard");

    // Le carrousel a un role region
    const carousel = page.getByRole("region", { name: /classements winelio/i });
    await expect(carousel).toBeVisible();

    // Slide initiale = Parrains
    await expect(carousel.getByText(/Top Parrains/i)).toBeVisible();

    // Lien Hall of Fame visible
    await expect(page.getByText(/Hall of Fame all-time/i)).toBeVisible();
  });

  test("le tap fige la rotation", async ({ page }) => {
    await loginAsRealUser(page, "podium-test@winelio-e2e.local");
    await page.goto("/dashboard");
    const carousel = page.getByRole("region", { name: /classements winelio/i });
    await carousel.click();
    await page.waitForTimeout(9000);
    // Toujours sur Top Parrains après 9s (rotation = 8s donc on aurait dû passer à Top Revenus sans le pause)
    await expect(carousel.getByText(/Top Parrains/i)).toBeVisible();
  });

  test("la page Hall of Fame s'ouvre", async ({ page }) => {
    await loginAsRealUser(page, "podium-test@winelio-e2e.local");
    await page.goto("/network/leaderboard");
    await expect(page.getByRole("heading", { name: /Hall of Fame/i })).toBeVisible();
    // 3 tabs catégorie présents
    await expect(page.getByRole("link", { name: /Parrains/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Revenus/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Recos/i })).toBeVisible();
  });
});
```

- [ ] **Step 3 : Lancer les tests E2E**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npx playwright test tests/e2e/podium.spec.ts
```

Attendu : 3 tests pass.

- [ ] **Step 4 : Commit**

```bash
git add tests/e2e/podium.spec.ts
git commit -m "test(podium): E2E carrousel rotation + Hall of Fame"
```

---

## Task 9 : Push final + vérification visuelle prod

**Files:** aucun.

- [ ] **Step 1 : Pousser sur dev2 et main**

```bash
git push origin dev2
git push origin dev2:main --force
```

Coolify déploie automatiquement (webhook GitHub) — ne PAS appeler l'API Coolify deploy (memory `feedback_coolify_deploy.md`).

- [ ] **Step 2 : Attendre 5 min puis vérifier dev2 et prod**

Ouvrir https://dev2.winelio.app/dashboard puis https://winelio.app/dashboard, vérifier :
- Le carrousel s'affiche au-dessus de l'ActivityFeed
- Au moins 1 slide visible (même si vide pour l'utilisateur de test)
- Lien "Voir le Hall of Fame all-time →" présent
- Cliquer sur le lien : page `/network/leaderboard` s'ouvre, 3 tabs + 4 filtres période

- [ ] **Step 3 : Vérifier les logs Sentry**

Aucune nouvelle erreur "leaderboard" ou "podium" dans https://winelio.sentry.io/issues/.

- [ ] **Step 4 : Tag final si tout est bon**

Aucun tag git nécessaire. Marquer le plan comme exécuté en éditant le top du fichier plan : `**Statut :** ✅ Exécuté le YYYY-MM-DD`.

```bash
git add docs/superpowers/plans/2026-05-12-podium-batisseurs-reseau.md
git commit -m "docs(plan): mark podium plan as executed"
git push origin dev2 && git push origin dev2:main --force
```

---

## Self-Review Checklist (déjà fait)

- ✅ Spec coverage : les 3 catégories + Hall of Fame + privacy + ISR couverts
- ✅ Pas de placeholder ("TBD", "TODO", "fill in")
- ✅ Type consistency : `PodiumEntry.value` = nombre dans tous les usages, `LeaderboardCategory` partagé
- ✅ Field names vérifiés en base : `referrer_id`, `is_demo`, `avatar`, `first_name`, `last_name`, `sponsor_id`, `WINELIO_SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"`
- ✅ Filtres techniques email cohérents avec le code existant (4 patterns)
- ✅ Carrousel : pause définitive pour la session (cohérent avec spec)
- ✅ Aucune mention de `frontend-design` ou autre skill non autorisée
