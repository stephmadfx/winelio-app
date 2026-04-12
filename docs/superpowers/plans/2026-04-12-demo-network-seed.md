# Demo Network Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically populate a new user's network with ~60 realistic demo profiles (5 MLM levels), fake recommendations in various states, and fake commissions — triggered when they complete their profile for the first time.

**Architecture:** A PostgreSQL function `winelio.seed_demo_network(p_user_id)` creates all data in one transaction. The profile save action detects first completion and calls `/api/demo/seed-network` fire-and-forget. A banner component polls `/api/demo/status` and shows progress. Demo data is flagged `is_demo = true` and linked to the real user via `demo_owner_id`.

**Tech Stack:** Next.js 15 App Router, Supabase (self-hosted), PostgreSQL plpgsql, Tailwind CSS v4, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-12-demo-network-seed-design.md`

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/015_demo_network.sql` | CREATE — columns + SQL functions |
| `src/app/api/demo/seed-network/route.ts` | CREATE — POST (seed) + DELETE (purge) |
| `src/app/api/demo/status/route.ts` | CREATE — GET |
| `src/app/(protected)/profile/actions.ts` | MODIFY — firstCompletion detection |
| `src/components/DemoSeedBanner.tsx` | CREATE |
| `src/app/(protected)/layout.tsx` | MODIFY — add DemoSeedBanner |
| `src/app/api/network/children/route.ts` | MODIFY — add is_demo to payload |
| `src/components/network-graph.tsx` | MODIFY — Demo badge on NodeView |
| `src/components/network-tree.tsx` | MODIFY — Demo badge on TreeNodeRow |
| `src/app/(protected)/network/page.tsx` | MODIFY — Demo badge on filleuls list |
| `src/app/(protected)/settings/page.tsx` | MODIFY — purge card |
| `src/lib/notify-new-referral.ts` | MODIFY — extend email filter |

---

## Task 1 — Migration 015 : colonnes is_demo

**Files:**
- Create: `supabase/migrations/015_demo_network.sql` (partie 1 : colonnes)

- [ ] **Step 1.1 — Créer le début du fichier de migration**

```sql
-- supabase/migrations/015_demo_network.sql
-- ============================================================
-- Migration 015 : réseau demo automatique
-- ============================================================

-- ─── Colonnes is_demo + demo_owner_id ─────────────────────

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS is_demo        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_owner_id  uuid REFERENCES winelio.profiles(id) ON DELETE CASCADE;

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

ALTER TABLE winelio.commission_transactions
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Index pour purge rapide
CREATE INDEX IF NOT EXISTS idx_profiles_demo_owner     ON winelio.profiles(demo_owner_id) WHERE demo_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recommendations_is_demo ON winelio.recommendations(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_commissions_is_demo     ON winelio.commission_transactions(is_demo) WHERE is_demo = true;
```

- [ ] **Step 1.2 — Commit intermédiaire**

```bash
git add supabase/migrations/015_demo_network.sql
git commit -m "feat(demo): migration 015 colonnes is_demo + demo_owner_id"
```

---

## Task 2 — Fonction SQL seed_demo_network

**Files:**
- Modify: `supabase/migrations/015_demo_network.sql` (ajout de la fonction)

- [ ] **Step 2.1 — Ajouter la fonction seed dans la migration**

Ajouter à la suite du fichier `supabase/migrations/015_demo_network.sql` :

```sql
-- ─── Fonction seed_demo_network ───────────────────────────

CREATE OR REPLACE FUNCTION winelio.seed_demo_network(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_first_names text[] := ARRAY[
    'Marie','Thomas','Sophie','Pierre','Emma','Nicolas','Julie','Antoine',
    'Camille','Lucas','Laura','Maxime','Alice','Julien','Manon','Romain',
    'Lea','Alexandre','Chloe','Mathieu','Ines','Clement','Pauline',
    'Francois','Sarah','Quentin','Elodie','Baptiste','Claire','Guillaume'
  ];
  v_last_names text[] := ARRAY[
    'Martin','Bernard','Dubois','Moreau','Laurent','Simon','Michel',
    'Lefebvre','Leroy','Roux','David','Bertrand','Morel','Fournier',
    'Girard','Bonnet','Dupont','Lambert','Fontaine','Rousseau','Vincent',
    'Muller','Lefevre','Faure','Andre','Mercier','Blanc','Guerin','Boyer','Garnier'
  ];
  v_cities text[] := ARRAY[
    'Lyon','Marseille','Bordeaux','Nantes','Toulouse','Strasbourg',
    'Montpellier','Rennes','Lille','Nice','Grenoble','Rouen','Toulon',
    'Saint-Etienne','Dijon','Angers','Brest','Clermont-Ferrand',
    'Aix-en-Provence','Reims'
  ];
  v_reco_descs text[] := ARRAY[
    'Renovation salle de bain complete','Installation electrique maison neuve',
    'Travaux toiture et etancheite','Pose de parquet et carrelage',
    'Extension garage et amenagement','Remplacement chaudiere et radiateurs',
    'Amenagement cuisine equipee','Peinture interieure appartement 4 pieces',
    'Isolation combles perdus','Creation terrasse bois'
  ];
  v_amounts     numeric[]  := ARRAY[800,1200,1500,2000,2500,3000,4000,5000,7500,10000,12000,15000];
  v_active_st   text[]     := ARRAY['ACCEPTED','CONTACT_MADE','MEETING_SCHEDULED','QUOTE_SUBMITTED'];
  v_valid_st    text[]     := ARRAY['QUOTE_VALIDATED','COMPLETED'];

  v_id          uuid;
  v_reco_id     uuid;
  v_pro_id      uuid;
  v_amount      numeric;
  v_status      text;
  v_is_pro      boolean;
  v_cat_ids     uuid[];
  v_cat_id      uuid;
  v_n1          uuid[] := '{}';
  v_n2          uuid[] := '{}';
  v_n3          uuid[] := '{}';
  v_n4          uuid[] := '{}';
  v_rnd         float;
  i int; j int; n int;
BEGIN
  -- Guard : ne pas re-seeder
  IF EXISTS (SELECT 1 FROM winelio.profiles WHERE demo_owner_id = p_user_id LIMIT 1) THEN
    RETURN;
  END IF;

  -- Catégories disponibles
  SELECT ARRAY(SELECT id FROM winelio.categories WHERE is_active = true ORDER BY random())
  INTO v_cat_ids;

  -- ── NIVEAU 1 : 8 filleuls directs ───────────────────────
  FOR i IN 1..8 LOOP
    v_id     := gen_random_uuid();
    v_is_pro := random() < 0.5;
    INSERT INTO winelio.profiles
      (id, email, first_name, last_name, city, is_professional,
       sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
    VALUES (
      v_id,
      'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
      v_first_names[1 + (floor(random() * 30))::int],
      v_last_names [1 + (floor(random() * 30))::int],
      v_cities     [1 + (floor(random() * 20))::int],
      v_is_pro,
      upper(substr(md5(v_id::text), 1, 6)),
      p_user_id, true, p_user_id,
      now() - ((30 + floor(random() * 150))::text || ' days')::interval
    );
    v_n1 := v_n1 || v_id;
  END LOOP;

  -- ── NIVEAU 2 : 2-3 par N1 ─────────────────────────────
  FOR i IN 1..array_length(v_n1, 1) LOOP
    n := 2 + floor(random() * 2)::int;
    FOR j IN 1..n LOOP
      v_id     := gen_random_uuid();
      v_is_pro := random() < 0.4;
      INSERT INTO winelio.profiles
        (id, email, first_name, last_name, city, is_professional,
         sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
      VALUES (
        v_id,
        'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
        v_first_names[1 + (floor(random() * 30))::int],
        v_last_names [1 + (floor(random() * 30))::int],
        v_cities     [1 + (floor(random() * 20))::int],
        v_is_pro,
        upper(substr(md5(v_id::text), 1, 6)),
        v_n1[i], true, p_user_id,
        now() - ((20 + floor(random() * 120))::text || ' days')::interval
      );
      v_n2 := v_n2 || v_id;
    END LOOP;
  END LOOP;

  -- ── NIVEAU 3 : 1-2 pour ~65% des N2 ──────────────────
  FOR i IN 1..array_length(v_n2, 1) LOOP
    IF random() < 0.65 THEN
      n := 1 + floor(random() * 2)::int;
      FOR j IN 1..n LOOP
        v_id     := gen_random_uuid();
        v_is_pro := random() < 0.3;
        INSERT INTO winelio.profiles
          (id, email, first_name, last_name, city, is_professional,
           sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
        VALUES (
          v_id,
          'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
          v_first_names[1 + (floor(random() * 30))::int],
          v_last_names [1 + (floor(random() * 30))::int],
          v_cities     [1 + (floor(random() * 20))::int],
          v_is_pro,
          upper(substr(md5(v_id::text), 1, 6)),
          v_n2[i], true, p_user_id,
          now() - ((10 + floor(random() * 90))::text || ' days')::interval
        );
        v_n3 := v_n3 || v_id;
      END LOOP;
    END IF;
  END LOOP;

  -- ── NIVEAU 4 : 1-2 pour ~60% des N3 ──────────────────
  IF array_length(v_n3, 1) > 0 THEN
    FOR i IN 1..array_length(v_n3, 1) LOOP
      IF random() < 0.6 THEN
        n := 1 + floor(random() * 2)::int;
        FOR j IN 1..n LOOP
          v_id     := gen_random_uuid();
          v_is_pro := random() < 0.2;
          INSERT INTO winelio.profiles
            (id, email, first_name, last_name, city, is_professional,
             sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
          VALUES (
            v_id,
            'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
            v_first_names[1 + (floor(random() * 30))::int],
            v_last_names [1 + (floor(random() * 30))::int],
            v_cities     [1 + (floor(random() * 20))::int],
            v_is_pro,
            upper(substr(md5(v_id::text), 1, 6)),
            v_n3[i], true, p_user_id,
            now() - ((5 + floor(random() * 60))::text || ' days')::interval
          );
          v_n4 := v_n4 || v_id;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ── NIVEAU 5 : 1 pour ~55% des N4 (max 12) ───────────
  IF array_length(v_n4, 1) > 0 THEN
    FOR i IN 1..LEAST(array_length(v_n4, 1), 12) LOOP
      IF random() < 0.55 THEN
        v_id := gen_random_uuid();
        INSERT INTO winelio.profiles
          (id, email, first_name, last_name, city, is_professional,
           sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
        VALUES (
          v_id,
          'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
          v_first_names[1 + (floor(random() * 30))::int],
          v_last_names [1 + (floor(random() * 30))::int],
          v_cities     [1 + (floor(random() * 20))::int],
          random() < 0.1,
          upper(substr(md5(v_id::text), 1, 6)),
          v_n4[i], true, p_user_id,
          now() - ((1 + floor(random() * 30))::text || ' days')::interval
        );
      END IF;
    END LOOP;
  END IF;

  -- ── ENTREPRISES pour les pros demo ───────────────────
  IF array_length(v_cat_ids, 1) > 0 THEN
    INSERT INTO winelio.companies
      (owner_id, name, legal_name, alias, city, category_id, is_verified, created_at)
    SELECT
      p.id,
      p.last_name || ' Travaux',
      p.last_name || ' Travaux SARL',
      '#' || upper(substr(replace(p.id::text, '-', ''), 1, 6)),
      p.city,
      v_cat_ids[1 + (floor(random() * array_length(v_cat_ids, 1)))::int],
      random() < 0.7,
      p.created_at
    FROM winelio.profiles p
    WHERE p.demo_owner_id = p_user_id AND p.is_professional = true;
  END IF;

  -- ── RECOMMANDATIONS N1 (2-3 chacun) ────────────────
  FOR i IN 1..array_length(v_n1, 1) LOOP
    -- Trouver un professionnel demo différent du referrer
    SELECT id INTO v_pro_id
    FROM winelio.profiles
    WHERE demo_owner_id = p_user_id AND is_professional = true AND id <> v_n1[i]
    ORDER BY random() LIMIT 1;

    IF v_pro_id IS NULL THEN CONTINUE; END IF;

    n := 2 + floor(random() * 2)::int;
    FOR j IN 1..n LOOP
      v_reco_id := gen_random_uuid();
      v_amount  := v_amounts[1 + (floor(random() * 12))::int];
      v_rnd     := random();
      IF v_rnd < 0.30 THEN
        v_status := 'PENDING';
      ELSIF v_rnd < 0.70 THEN
        v_status := v_active_st[1 + (floor(random() * 4))::int];
      ELSE
        v_status := v_valid_st[1 + (floor(random() * 2))::int];
      END IF;

      INSERT INTO winelio.recommendations
        (id, referrer_id, professional_id, project_description,
         status, amount, is_demo, created_at, updated_at)
      VALUES (
        v_reco_id, v_n1[i], v_pro_id,
        v_reco_descs[1 + (floor(random() * 10))::int],
        v_status, v_amount, true,
        now() - ((floor(random() * 100))::text || ' days')::interval,
        now() - ((floor(random() * 20))::text  || ' days')::interval
      );

      -- Commission pour reco validée (niveau 1 = 4% de la commission 10%)
      IF v_status = ANY(v_valid_st) THEN
        INSERT INTO winelio.commission_transactions
          (user_id, recommendation_id, amount, level, type, status,
           referrer_id, is_demo, earned_at, created_at)
        VALUES (
          p_user_id, v_reco_id,
          ROUND(v_amount * 0.10 * 0.04, 2),
          1, 'referral_level_1', 'EARNED',
          v_n1[i], true, now(), now()
        );
      ELSIF v_status = ANY(v_active_st) THEN
        INSERT INTO winelio.commission_transactions
          (user_id, recommendation_id, amount, level, type, status,
           referrer_id, is_demo, created_at)
        VALUES (
          p_user_id, v_reco_id,
          ROUND(v_amount * 0.10 * 0.04, 2),
          1, 'referral_level_1', 'PENDING',
          v_n1[i], true, now()
        );
      END IF;
    END LOOP;
  END LOOP;

  -- ── RECOMMANDATIONS N2 (1 chacun, 70% de chance) ───
  FOR i IN 1..array_length(v_n2, 1) LOOP
    IF random() > 0.7 THEN CONTINUE; END IF;

    SELECT id INTO v_pro_id
    FROM winelio.profiles
    WHERE demo_owner_id = p_user_id AND is_professional = true AND id <> v_n2[i]
    ORDER BY random() LIMIT 1;

    IF v_pro_id IS NULL THEN CONTINUE; END IF;

    v_reco_id := gen_random_uuid();
    v_amount  := v_amounts[1 + (floor(random() * 12))::int];
    v_rnd     := random();
    IF v_rnd < 0.30 THEN
      v_status := 'PENDING';
    ELSIF v_rnd < 0.70 THEN
      v_status := v_active_st[1 + (floor(random() * 4))::int];
    ELSE
      v_status := v_valid_st[1 + (floor(random() * 2))::int];
    END IF;

    INSERT INTO winelio.recommendations
      (id, referrer_id, professional_id, project_description,
       status, amount, is_demo, created_at, updated_at)
    VALUES (
      v_reco_id, v_n2[i], v_pro_id,
      v_reco_descs[1 + (floor(random() * 10))::int],
      v_status, v_amount, true,
      now() - ((floor(random() * 60))::text || ' days')::interval,
      now() - ((floor(random() * 10))::text  || ' days')::interval
    );

    IF v_status = ANY(v_valid_st) THEN
      INSERT INTO winelio.commission_transactions
        (user_id, recommendation_id, amount, level, type, status,
         referrer_id, is_demo, earned_at, created_at)
      VALUES (
        p_user_id, v_reco_id,
        ROUND(v_amount * 0.10 * 0.04, 2),
        2, 'referral_level_2', 'EARNED',
        v_n2[i], true, now(), now()
      );
    ELSIF v_status = ANY(v_active_st) THEN
      INSERT INTO winelio.commission_transactions
        (user_id, recommendation_id, amount, level, type, status,
         referrer_id, is_demo, created_at)
      VALUES (
        p_user_id, v_reco_id,
        ROUND(v_amount * 0.10 * 0.04, 2),
        2, 'referral_level_2', 'PENDING',
        v_n2[i], true, now()
      );
    END IF;
  END LOOP;

  -- Note : le trigger winelio.update_wallet_on_commission met à jour
  -- automatiquement user_wallet_summaries à chaque INSERT commission.

END;
$$;
```

- [ ] **Step 2.2 — Commit**

```bash
git add supabase/migrations/015_demo_network.sql
git commit -m "feat(demo): fonction SQL seed_demo_network"
```

---

## Task 3 — Fonction SQL purge_demo_network

**Files:**
- Modify: `supabase/migrations/015_demo_network.sql` (ajout purge)

- [ ] **Step 3.1 — Ajouter la fonction purge à la fin du fichier**

```sql
-- ─── Fonction purge_demo_network ──────────────────────────

CREATE OR REPLACE FUNCTION winelio.purge_demo_network(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_earned  numeric;
  v_pending numeric;
BEGIN
  -- Calcul des montants demo avant suppression (pour recalcul wallet)
  SELECT COALESCE(SUM(amount), 0) INTO v_earned
  FROM winelio.commission_transactions
  WHERE user_id = p_user_id AND status = 'EARNED' AND is_demo = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM winelio.commission_transactions
  WHERE user_id = p_user_id AND status = 'PENDING' AND is_demo = true;

  -- 1. Commissions liées aux recos demo
  DELETE FROM winelio.commission_transactions
  WHERE is_demo = true
    AND recommendation_id IN (
      SELECT id FROM winelio.recommendations
      WHERE is_demo = true
        AND referrer_id IN (
          SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id
        )
    );

  -- 2. Commissions is_demo du vrai user (réseau)
  DELETE FROM winelio.commission_transactions
  WHERE user_id = p_user_id AND is_demo = true;

  -- 3. Recommandations demo
  DELETE FROM winelio.recommendations
  WHERE is_demo = true
    AND referrer_id IN (
      SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id
    );

  -- 4. Entreprises des profils demo
  DELETE FROM winelio.companies
  WHERE owner_id IN (SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id);

  -- 5. Profils demo
  DELETE FROM winelio.profiles WHERE demo_owner_id = p_user_id;

  -- 6. Recalcul wallet (available inclus)
  UPDATE winelio.user_wallet_summaries SET
    total_earned        = GREATEST(0, total_earned - v_earned),
    available           = GREATEST(0, available    - v_earned),
    pending_commissions = GREATEST(0, pending_commissions - v_pending)
  WHERE user_id = p_user_id;
END;
$$;
```

- [ ] **Step 3.2 — Commit**

```bash
git add supabase/migrations/015_demo_network.sql
git commit -m "feat(demo): fonction SQL purge_demo_network"
```

---

## Task 4 — Appliquer la migration sur le VPS

**Files:** aucun fichier source modifié

- [ ] **Step 4.1 — Copier et appliquer la migration**

```bash
sshpass -p '04660466aA@@@' scp \
  supabase/migrations/015_demo_network.sql \
  root@31.97.152.195:/tmp/

sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/015_demo_network.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -f /tmp/015_demo_network.sql"
```

- [ ] **Step 4.2 — Vérifier que les colonnes et fonctions existent**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
  \"SELECT column_name FROM information_schema.columns WHERE table_schema='winelio' AND table_name='profiles' AND column_name IN ('is_demo','demo_owner_id');\""
```

Résultat attendu : 2 lignes (`is_demo`, `demo_owner_id`).

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
  \"SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='winelio' AND proname IN ('seed_demo_network','purge_demo_network');\""
```

Résultat attendu : 2 lignes.

- [ ] **Step 4.3 — Test rapide de la fonction seed (avec un UUID fictif)**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
  \"SELECT winelio.seed_demo_network('00000000-0000-0000-0000-000000000001');\""
```

Vérifier qu'aucune erreur SQL ne survient, puis nettoyer :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
  \"DELETE FROM winelio.profiles WHERE demo_owner_id='00000000-0000-0000-0000-000000000001';\""
```

---

## Task 5 — API GET /api/demo/status

**Files:**
- Create: `src/app/api/demo/status/route.ts`

- [ ] **Step 5.1 — Créer la route**

```typescript
// src/app/api/demo/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (!DEMO_MODE) {
    return NextResponse.json({ status: "unavailable" });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "unauthenticated" }, { status: 401 });

  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("demo_owner_id", user.id);

  return NextResponse.json({ status: (count ?? 0) > 0 ? "ready" : "none" });
}
```

- [ ] **Step 5.2 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error|✓" | head -20
```

Résultat attendu : aucune erreur TypeScript.

---

## Task 6 — API POST /api/demo/seed-network + DELETE

**Files:**
- Create: `src/app/api/demo/seed-network/route.ts`

- [ ] **Step 6.1 — Créer la route**

```typescript
// src/app/api/demo/seed-network/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEMO_MODE = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export async function POST() {
  if (!DEMO_MODE()) {
    return NextResponse.json({ error: "Demo mode désactivé" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Vérifier que le profil est complet
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!profile?.first_name || !profile?.last_name) {
    return NextResponse.json({ error: "Profil incomplet" }, { status: 400 });
  }

  // Guard : déjà seedé
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("demo_owner_id", user.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ already_seeded: true });
  }

  const { error } = await supabaseAdmin.rpc("seed_demo_network", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("seed_demo_network error:", error);
    return NextResponse.json({ error: "Erreur lors du seed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  if (!DEMO_MODE()) {
    return NextResponse.json({ error: "Demo mode désactivé" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { error } = await supabaseAdmin.rpc("purge_demo_network", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("purge_demo_network error:", error);
    return NextResponse.json({ error: "Erreur lors de la purge" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6.2 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 6.3 — Commit**

```bash
git add src/app/api/demo/
git commit -m "feat(demo): routes API seed-network + status"
```

---

## Task 7 — Filtre email demo (notify-new-referral.ts)

**Files:**
- Modify: `src/lib/notify-new-referral.ts`

- [ ] **Step 7.1 — Étendre le filtre**

Dans `src/lib/notify-new-referral.ts`, à la ligne qui contient :
```typescript
if (!email || email.endsWith("@winelio-pro.fr")) continue;
```

Remplacer par :
```typescript
if (!email || email.endsWith("@winelio-pro.fr") || email.endsWith("@winelio-demo.internal")) continue;
```

- [ ] **Step 7.2 — Commit**

```bash
git add src/lib/notify-new-referral.ts
git commit -m "feat(demo): exclure les emails demo des notifications"
```

---

## Task 8 — Détection première complétion du profil

**Files:**
- Modify: `src/app/(protected)/profile/actions.ts`

- [ ] **Step 8.1 — Modifier updateProfile pour détecter firstCompletion**

Remplacer la fonction `updateProfile` existante par :

```typescript
export async function updateProfile(data: {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  is_professional?: boolean;
}): Promise<{ error?: string; firstCompletion?: boolean }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const patch: Record<string, string | boolean | null> = {};

  if ("first_name" in data) {
    const v = (data.first_name ?? "").trim().slice(0, 100);
    patch.first_name = v || null;
  }
  if ("last_name" in data) {
    const v = (data.last_name ?? "").trim().slice(0, 100);
    patch.last_name = v || null;
  }
  if ("phone" in data) {
    const v = (data.phone ?? "").trim().slice(0, 20);
    if (v && !PHONE_RE.test(v)) return { error: "Numéro de téléphone invalide." };
    patch.phone = v || null;
  }
  if ("postal_code" in data) {
    const v = (data.postal_code ?? "").trim();
    if (v && !POSTAL_CODE_RE.test(v)) return { error: "Code postal invalide (5 chiffres)." };
    patch.postal_code = v || null;
  }
  if ("city" in data) {
    const v = (data.city ?? "").trim().slice(0, 100);
    patch.city = v || null;
  }
  if ("address" in data) {
    const v = (data.address ?? "").trim().slice(0, 200);
    patch.address = v || null;
  }
  if ("is_professional" in data) {
    patch.is_professional = !!data.is_professional;
  }

  const supabase = await createClient();

  // Lire le profil AVANT update pour détecter la première complétion
  const { data: before } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const wasIncomplete = !before?.first_name || !before?.last_name;
  const willBeComplete =
    (patch.first_name ?? before?.first_name) &&
    (patch.last_name  ?? before?.last_name);

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (error) return { error: "Erreur lors de la sauvegarde." };

  const firstCompletion = !!(wasIncomplete && willBeComplete);
  return { firstCompletion };
}
```

- [ ] **Step 8.2 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 8.3 — Commit**

```bash
git add src/app/(protected)/profile/actions.ts
git commit -m "feat(demo): détection première complétion du profil"
```

---

## Task 9 — Composant DemoSeedBanner

**Files:**
- Create: `src/components/DemoSeedBanner.tsx`

- [ ] **Step 9.1 — Créer le composant**

```typescript
// src/components/DemoSeedBanner.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SeedStatus = "idle" | "pending" | "ready" | "dismissed";

export function DemoSeedBanner() {
  const [status, setStatus] = useState<SeedStatus>("idle");

  // Rehydration depuis localStorage
  useEffect(() => {
    const stored = localStorage.getItem("demo_seed_status") as SeedStatus | null;
    if (stored === "dismissed") { setStatus("dismissed"); return; }
    if (stored === "ready")     { setStatus("ready"); return; }
    if (stored === "pending")   { setStatus("pending"); return; }
  }, []);

  // Polling quand pending
  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/demo/status");
        const { status: s } = await res.json();
        if (s === "ready") {
          setStatus("ready");
          localStorage.setItem("demo_seed_status", "ready");
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  function dismiss() {
    setStatus("dismissed");
    localStorage.removeItem("demo_seed_status");
  }

  if (status === "idle" || status === "dismissed") return null;

  if (status === "pending") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>
            <strong>Réseau démo en cours de création...</strong>{" "}
            Cela vous permettra de vivre l&apos;expérience complète de Winelio.
          </span>
        </div>
        <button onClick={dismiss} className="text-amber-500 hover:text-amber-700 shrink-0">✕</button>
      </div>
    );
  }

  // ready
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-orange-50 border-b border-winelio-orange/30 text-winelio-dark text-sm">
      <div className="flex items-center gap-3">
        <span className="text-base">✅</span>
        <span>
          <strong>Votre réseau démo est prêt !</strong>{" "}
          Découvrez ce que Winelio peut vous apporter.
        </span>
        <Link
          href="/network"
          className="shrink-0 font-semibold text-winelio-orange hover:text-winelio-amber underline underline-offset-2"
        >
          Voir mon réseau →
        </Link>
      </div>
      <button onClick={dismiss} className="text-winelio-gray hover:text-winelio-dark shrink-0">✕</button>
    </div>
  );
}

// Hook exporté pour déclencher le seed depuis le profil
export function triggerDemoSeed() {
  if (typeof window === "undefined") return;
  localStorage.setItem("demo_seed_status", "pending");
  fetch("/api/demo/seed-network", { method: "POST" }).catch(() => {});
}
```

- [ ] **Step 9.2 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

---

## Task 10 — Intégrer DemoSeedBanner dans le layout protégé

**Files:**
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 10.1 — Lire le layout actuel**

```bash
head -30 "src/app/(protected)/layout.tsx"
```

- [ ] **Step 10.2 — Ajouter le banner**

En haut du fichier, ajouter l'import :
```typescript
import { DemoSeedBanner } from "@/components/DemoSeedBanner";
```

Dans le JSX retourné, ajouter `<DemoSeedBanner />` comme premier enfant du fragment racine, avant le `<Sidebar>` ou le `<div>` principal :
```typescript
return (
  <>
    <DemoSeedBanner />
    {/* reste du layout existant */}
  </>
);
```

- [ ] **Step 10.3 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 10.4 — Commit**

```bash
git add src/components/DemoSeedBanner.tsx src/app/(protected)/layout.tsx
git commit -m "feat(demo): composant DemoSeedBanner + intégration layout"
```

---

## Task 11 — Déclencher le seed depuis la page profil

**Files:**
- Modify: `src/app/(protected)/profile/page.tsx`

- [ ] **Step 11.1 — Lire la page profil**

```bash
grep -n "updateProfile\|onSubmit\|handleSubmit\|firstCompletion" "src/app/(protected)/profile/page.tsx" | head -20
```

- [ ] **Step 11.2 — Appeler triggerDemoSeed après firstCompletion**

Dans le handler de soumission du formulaire profil (là où `updateProfile` est appelée), ajouter après le check d'erreur :

```typescript
import { triggerDemoSeed } from "@/components/DemoSeedBanner";

// Dans le handler :
const result = await updateProfile(formData);
if (result.error) { setError(result.error); return; }
if (result.firstCompletion && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  triggerDemoSeed();
}
// ... reste du handler (toast succès, router.refresh(), etc.)
```

- [ ] **Step 11.3 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 11.4 — Commit**

```bash
git add "src/app/(protected)/profile/page.tsx"
git commit -m "feat(demo): déclencher seed au premier enregistrement du profil"
```

---

## Task 12 — Ajouter is_demo au payload /api/network/children

**Files:**
- Modify: `src/app/api/network/children/route.ts`

- [ ] **Step 12.1 — Ajouter is_demo dans la requête et le retour**

Dans `src/app/api/network/children/route.ts`, la requête principale est :
```typescript
const { data: children } = await supabaseAdmin
  .from("profiles")
  .select("id, first_name, last_name, city, is_professional, companies!owner_id(alias, category:categories(name))")
  .eq("sponsor_id", parentId);
```

Modifier le `.select()` pour inclure `is_demo` :
```typescript
const { data: children } = await supabaseAdmin
  .from("profiles")
  .select("id, first_name, last_name, city, is_professional, is_demo, companies!owner_id(alias, category:categories(name))")
  .eq("sponsor_id", parentId);
```

Dans l'objet retourné par `.map()`, ajouter :
```typescript
return {
  id: child.id,
  first_name: child.first_name,
  last_name: child.last_name,
  city: child.city,
  is_professional: (child as { is_professional?: boolean }).is_professional ?? false,
  is_demo: (child as { is_demo?: boolean }).is_demo ?? false,   // ← ajouter
  company_alias: ...,
  company_category: ...,
  childCount: childCount ?? 0,
  activeRecos: activeRecos ?? 0,
  completedRecos: completedRecos ?? 0,
};
```

- [ ] **Step 12.2 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

---

## Task 13 — Badge Demo dans NetworkGraph

**Files:**
- Modify: `src/components/network-graph.tsx`

- [ ] **Step 13.1 — Ajouter is_demo à l'interface GraphNode**

Dans l'interface `GraphNode`, ajouter :
```typescript
is_demo: boolean;
```

- [ ] **Step 13.2 — Propager is_demo dans fetchChildren**

Dans la fonction `fetchChildren`, le mapping des enfants utilise le type `c`. Ajouter `is_demo` au type et à l'objet retourné :

```typescript
// Type du paramètre c :
c: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  is_professional: boolean;
  is_demo: boolean;           // ← ajouter
  company_alias: string | null;
  company_category: string | null;
  childCount: number;
  activeRecos: number;
  completedRecos: number;
}

// Objet retourné :
return {
  ...
  is_demo: c.is_demo,         // ← ajouter
  ...
};
```

- [ ] **Step 13.3 — Initialiser is_demo dans le nœud root**

Dans le `useEffect` qui crée le `root` :
```typescript
const root: GraphNode = {
  ...
  is_demo: false,   // ← ajouter
  ...
};
```

- [ ] **Step 13.4 — Ajouter le badge Demo dans NodeView**

Dans la fonction `NodeView`, après le `<span className="relative z-10">{initials}</span>` dans le cercle principal, ajouter :

```typescript
{/* Badge Demo */}
{node.is_demo && !isRoot && (
  <div
    className="absolute flex items-center justify-center rounded-full bg-orange-100 border border-orange-200"
    style={{ width: 16, height: 16, bottom: -4, left: -4, zIndex: 3 }}
    title="Profil de démonstration"
  >
    <span style={{ fontSize: 7, fontWeight: 800, color: "#FF6B35", lineHeight: 1 }}>D</span>
  </div>
)}
```

- [ ] **Step 13.5 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

---

## Task 14 — Badge Demo dans NetworkTree

**Files:**
- Modify: `src/components/network-tree.tsx`

- [ ] **Step 14.1 — Ajouter is_demo à l'interface TreeNode**

```typescript
interface TreeNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  is_professional: boolean;
  is_demo: boolean;          // ← ajouter
  company_alias: string | null;
  company_category: string | null;
  referral_count: number;
  total_earned: number;
  children: TreeNode[];
  loaded: boolean;
  expanded: boolean;
}
```

- [ ] **Step 14.2 — Propager is_demo dans fetchChildren**

Dans la fonction `fetchChildren`, l'objet retourné :
```typescript
return {
  ...
  is_demo: (child as { is_demo?: boolean }).is_demo ?? false,   // ← ajouter
  ...
};
```

La requête `.select()` doit aussi inclure `is_demo` :
```typescript
.select("id, first_name, last_name, city, is_professional, is_demo, companies!owner_id(...)")
```

- [ ] **Step 14.3 — Ajouter le badge dans TreeNodeRow**

Dans `TreeNodeRow`, dans le `<div className="flex items-center gap-2">` qui contient le nom et le badge de niveau, ajouter après le badge `N{level}` :

```typescript
{node.is_demo && (
  <span className="inline-flex items-center justify-center px-1 py-0.5 rounded text-[8px] font-bold text-orange-400 bg-orange-50 border border-orange-200 shrink-0">
    demo
  </span>
)}
```

- [ ] **Step 14.4 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 14.5 — Commit**

```bash
git add src/app/api/network/children/route.ts src/components/network-graph.tsx src/components/network-tree.tsx
git commit -m "feat(demo): badge Demo dans NetworkGraph et NetworkTree"
```

---

## Task 15 — Badge Demo dans la liste filleuls directs (page /network)

**Files:**
- Modify: `src/app/(protected)/network/page.tsx`

- [ ] **Step 15.1 — Ajouter is_demo à la requête referrals**

Dans la requête qui récupère les filleuls directs :
```typescript
const { data: referrals, count: totalReferrals } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, city, created_at, avatar, is_professional, is_demo, companies!owner_id(...)")
  .eq("sponsor_id", user.id);
```

- [ ] **Step 15.2 — Passer is_demo dans referralsWithStats**

Dans le `.map()` de `referralsWithStats`, ajouter `is_demo: ref.is_demo ?? false` à l'objet retourné.

- [ ] **Step 15.3 — Afficher le badge dans la liste**

Dans le JSX de chaque filleul, dans le `<div className="min-w-0">` (là où se trouve le nom), ajouter après le `displayName` :

```typescript
{ref.is_demo && (
  <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold text-orange-400 bg-orange-50 border border-orange-100">
    demo
  </span>
)}
```

- [ ] **Step 15.4 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 15.5 — Commit**

```bash
git add "src/app/(protected)/network/page.tsx"
git commit -m "feat(demo): badge Demo dans la liste des filleuls directs"
```

---

## Task 16 — Carte purge Demo dans /settings

**Files:**
- Modify: `src/app/(protected)/settings/page.tsx`

- [ ] **Step 16.1 — Lire la fin du fichier settings**

```bash
tail -80 "src/app/(protected)/settings/page.tsx"
```

- [ ] **Step 16.2 — Ajouter l'état et la fonction de purge**

Dans la partie `useState` du composant, ajouter :
```typescript
const [demoDeleting, setDemoDeleting] = useState(false);
const [demoDeleteOpen, setDemoDeleteOpen] = useState(false);
const [demoDeleteDone, setDemoDeleteDone] = useState(false);
```

Ajouter la fonction de purge :
```typescript
async function handlePurgeDemo() {
  setDemoDeleting(true);
  try {
    const res = await fetch("/api/demo/seed-network", { method: "DELETE" });
    if (res.ok) {
      setDemoDeleteDone(true);
      setDemoDeleteOpen(false);
      localStorage.removeItem("demo_seed_status");
      router.refresh();
    }
  } finally {
    setDemoDeleting(false);
  }
}
```

- [ ] **Step 16.3 — Ajouter la carte Demo dans le JSX**

Ajouter la carte suivante dans le JSX, visible uniquement si `process.env.NEXT_PUBLIC_DEMO_MODE === "true"` :

```typescript
{process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
  <Card className="!rounded-2xl border-orange-100">
    <CardContent className="p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-winelio-gray uppercase tracking-wider mb-3">
        Réseau démo
      </h3>
      {demoDeleteDone ? (
        <p className="text-sm text-green-600">✓ Données demo supprimées.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Votre réseau contient des profils de démonstration pour vous montrer le potentiel de Winelio.
            Vous pouvez les supprimer à tout moment.
          </p>
          <button
            onClick={() => setDemoDeleteOpen(true)}
            className="px-4 py-2 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Supprimer les données demo
          </button>
        </>
      )}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 16.4 — Ajouter le Dialog de confirmation**

```typescript
<Dialog open={demoDeleteOpen} onOpenChange={setDemoDeleteOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Supprimer le réseau démo ?</DialogTitle>
    </DialogHeader>
    <p className="text-sm text-muted-foreground py-2">
      Tous les profils, recommandations et commissions de démonstration seront supprimés.
      Vos vrais filleuls et données réelles ne seront pas affectés.
    </p>
    <DialogFooter>
      <button
        onClick={() => setDemoDeleteOpen(false)}
        className="px-4 py-2 rounded-xl border text-sm"
      >
        Annuler
      </button>
      <button
        onClick={handlePurgeDemo}
        disabled={demoDeleting}
        className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
      >
        {demoDeleting ? "Suppression..." : "Supprimer"}
      </button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 16.5 — Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 16.6 — Commit**

```bash
git add "src/app/(protected)/settings/page.tsx"
git commit -m "feat(demo): carte purge réseau demo dans les paramètres"
```

---

## Task 17 — Test end-to-end + push

- [ ] **Step 17.1 — Redémarrer le serveur dev**

```bash
pkill -f "next dev"; sleep 1; npm run dev &
```

- [ ] **Step 17.2 — Tester le seed via l'interface**

1. Naviguer vers `http://localhost:3002/profile`
2. Renseigner prénom + nom (s'ils ne sont pas encore définis)
3. Sauvegarder → vérifier que le banner "Réseau démo en cours de création..." apparaît
4. Attendre 3-5s → le banner doit passer à "Votre réseau démo est prêt !"
5. Cliquer "Voir mon réseau →" → vérifier que l'organigramme affiche plusieurs niveaux avec des badges "demo"

- [ ] **Step 17.3 — Vérifier l'organigramme**

- NetworkGraph : nœuds avec pastille "D" sur les profils demo
- NetworkTree : badges "demo" sur les lignes
- Liste filleuls : badges "demo" sur les filleuls directs
- Wallet (si visible) : gains demo affichés

- [ ] **Step 17.4 — Tester la purge**

1. Naviguer vers `http://localhost:3002/settings`
2. Trouver la carte "Réseau démo"
3. Cliquer "Supprimer les données demo" → confirmer
4. Vérifier que le réseau est vide après suppression

- [ ] **Step 17.5 — Build final**

```bash
npm run build
```

Résultat attendu : `✓ Compiled successfully` sans erreurs TypeScript.

- [ ] **Step 17.6 — Push**

```bash
git push origin dev2
```
