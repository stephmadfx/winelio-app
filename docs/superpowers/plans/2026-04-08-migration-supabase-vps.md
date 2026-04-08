# Migration Supabase Cloud → VPS + Backups Google Drive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer la base de données Winelio de Supabase Cloud (`dxnebmxtkvauergvrmod.supabase.co`) vers le Supabase self-hosted VPS (`supabase.aide-multimedia.fr`) dans un schéma `winelio`, avec backups automatiques 2x/jour vers Google Drive.

**Architecture:** Création d'un schéma `winelio` dans la base `postgres` du VPS (suit la convention des projets existants : `formations`, `hesbydesign`, `onibradio`). Export pg_dump depuis Cloud, transformation `public→winelio`, import sur VPS. Mise à jour des clients Supabase pour préciser `db: { schema: 'winelio' }`. Script de backup pg_dump + rclone via cron.

**Tech Stack:** PostgreSQL 15, pg_dump, sshpass, sed, rclone, Coolify API, Next.js 15 / Supabase JS SSR

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `src/lib/supabase/client.ts` | Modifier — ajouter `db: { schema: 'winelio' }` |
| `src/lib/supabase/server.ts` | Modifier — ajouter `db: { schema: 'winelio' }` |
| `src/lib/supabase/admin.ts` | Modifier — ajouter `db: { schema: 'winelio' }` |
| `.env.local` | Modifier — URL et clés VPS |
| `/root/scripts/backup-winelio.sh` | Créer sur VPS |
| `crontab` (VPS root) | Modifier — ajouter 2 entrées backup |

---

## Task 1 : Récupérer le mot de passe PostgreSQL de Supabase Cloud

**Files:** aucun fichier modifié

- [ ] **Step 1 : Ouvrir le dashboard Supabase Cloud**

  Aller sur : https://supabase.com/dashboard/project/dxnebmxtkvauergvrmod/settings/database

  Dans la section "Connection string", sélectionner le mode "URI" ou "Connection pooling: off".
  Copier le mot de passe du champ `postgres` (le même que dans l'URL directe).

- [ ] **Step 2 : Tester la connexion depuis le Mac**

  ```bash
  PGPASSWORD="<MOT_DE_PASSE>" psql \
    -h db.dxnebmxtkvauergvrmod.supabase.co \
    -p 5432 \
    -U postgres \
    -d postgres \
    -c "SELECT COUNT(*) FROM auth.users;"
  ```

  Résultat attendu : un nombre (ex. `5`) — confirme que la connexion fonctionne.

---

## Task 2 : Exporter la base depuis Supabase Cloud

**Files:** génère des fichiers dans `/tmp/winelio-migration/`

- [ ] **Step 1 : Créer le dossier de travail**

  ```bash
  mkdir -p /tmp/winelio-migration
  ```

- [ ] **Step 2 : Exporter le schéma public (données + structure)**

  ```bash
  PGPASSWORD="<MOT_DE_PASSE>" pg_dump \
    -h db.dxnebmxtkvauergvrmod.supabase.co \
    -p 5432 \
    -U postgres \
    -d postgres \
    --schema=public \
    --no-owner \
    --no-acl \
    --inserts \
    --on-conflict-do-nothing \
    -f /tmp/winelio-migration/winelio_public_dump.sql
  ```

  Résultat attendu : fichier `/tmp/winelio-migration/winelio_public_dump.sql` non vide.

  ```bash
  wc -l /tmp/winelio-migration/winelio_public_dump.sql
  # Attendu : plusieurs milliers de lignes
  ```

- [ ] **Step 3 : Exporter les utilisateurs auth (données uniquement)**

  ```bash
  PGPASSWORD="<MOT_DE_PASSE>" pg_dump \
    -h db.dxnebmxtkvauergvrmod.supabase.co \
    -p 5432 \
    -U postgres \
    -d postgres \
    --table=auth.users \
    --table=auth.identities \
    --data-only \
    --no-owner \
    --no-acl \
    --inserts \
    --on-conflict-do-nothing \
    -f /tmp/winelio-migration/winelio_auth_dump.sql
  ```

  Résultat attendu : fichier contenant les INSERT INTO auth.users et auth.identities.

  ```bash
  grep -c "INSERT INTO auth.users" /tmp/winelio-migration/winelio_auth_dump.sql
  # Attendu : nombre d'utilisateurs existants (ex. 5, 10, ...)
  ```

---

## Task 3 : Transformer le dump (public → winelio)

**Files:** génère `/tmp/winelio-migration/winelio_dump_transformed.sql`

- [ ] **Step 1 : Appliquer la transformation**

  ```bash
  # Renommer public → winelio dans toutes les références de schéma
  # Note : pas d'ancre ^ pour capturer aussi les SET search_path dans les corps de fonctions
  sed -E \
    -e 's/SET search_path = public/SET search_path = winelio/g' \
    -e 's/\bpublic\./winelio\./g' \
    -e 's/SCHEMA public/SCHEMA winelio/g' \
    /tmp/winelio-migration/winelio_public_dump.sql \
    > /tmp/winelio-migration/winelio_dump_transformed.sql

  # Ajouter la création du schéma en début de fichier
  echo "CREATE SCHEMA IF NOT EXISTS winelio;" | cat - /tmp/winelio-migration/winelio_dump_transformed.sql > /tmp/winelio-migration/winelio_dump_final.sql
  ```

- [ ] **Step 2 : Vérifier la transformation**

  ```bash
  # Vérifier qu'il ne reste plus de références à 'public.' (hors commentaires)
  grep -v "^--" /tmp/winelio-migration/winelio_dump_final.sql | grep "public\." | head -5
  # Attendu : aucune ligne (ou seulement des faux positifs dans des strings)

  # Vérifier que winelio est bien présent
  grep -c "winelio\." /tmp/winelio-migration/winelio_dump_final.sql
  # Attendu : plusieurs centaines

  # Vérifier que auth.users est inchangé (on ne renomme pas auth)
  grep "REFERENCES auth.users" /tmp/winelio-migration/winelio_dump_final.sql | head -3
  # Attendu : "REFERENCES auth.users(id)"
  ```

---

## Task 4 : Créer le schéma winelio et importer les données sur VPS

**Files:** modifie la base `postgres` sur VPS container `supabase-db-ixlhs1fg5t2n8c4zsgvnys0r`

- [ ] **Step 1 : Copier les fichiers SQL sur le VPS**

  ```bash
  sshpass -p '04660466aA@@@' scp \
    /tmp/winelio-migration/winelio_dump_final.sql \
    /tmp/winelio-migration/winelio_auth_dump.sql \
    root@31.97.152.195:/tmp/
  ```

  Résultat attendu : pas d'erreur.

- [ ] **Step 2 : Désactiver temporairement les FK constraints et importer**

  ```bash
  # Prépend le SET avant le dump, puis pipe tout vers psql sur le VPS
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    (echo 'SET session_replication_role = replica;'; cat /tmp/winelio_dump_final.sql) | \
    docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres
  "
  ```

  Note : `SET session_replication_role = replica` désactive les FK checks et triggers pendant l'import — obligatoire car les FK vers `auth.users` n'existent pas encore au moment des INSERTs. Le fichier est lu sur le VPS (copié en Task 4 Step 1).

- [ ] **Step 3 : Vérifier le nombre de tables créées**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres \
      -c \"\dt winelio.*\"
  "
  ```

  Résultat attendu : 13+ tables listées (profiles, categories, companies, contacts, compensation_plans, steps, recommendations, recommendation_steps, commission_transactions, user_wallet_summaries, withdrawals, devices, audit_logs, reviews, otp_codes...).

- [ ] **Step 4 : Vérifier les données importées**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres -c \"
        SELECT 'profiles' as t, COUNT(*) FROM winelio.profiles
        UNION ALL SELECT 'recommendations', COUNT(*) FROM winelio.recommendations
        UNION ALL SELECT 'commission_transactions', COUNT(*) FROM winelio.commission_transactions
        UNION ALL SELECT 'categories', COUNT(*) FROM winelio.categories;
      \"
  "
  ```

  Comparer ces counts avec ceux de Supabase Cloud (vérifier manuellement depuis le dashboard Cloud).

---

## Task 5 : Importer les auth.users sur VPS

**Files:** modifie `auth.users` et `auth.identities` dans la base `postgres` VPS

- [ ] **Step 1 : Vérifier les users avant import**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres -c 'SELECT COUNT(*) FROM auth.users;'
  "
  # Note le nombre avant import (actuellement 4)
  ```

- [ ] **Step 2 : Importer auth.users et auth.identities**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres < /tmp/winelio_auth_dump.sql
  " 2>&1
  ```

  Résultat attendu : séquence d'INSERT sans erreur (les ON CONFLICT DO NOTHING gèrent les éventuels doublons).

- [ ] **Step 3 : Vérifier l'import**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres -c \"
        SELECT COUNT(*) as total_users FROM auth.users;
        SELECT COUNT(*) as total_identities FROM auth.identities;
      \"
  "
  ```

  Le total doit correspondre aux counts Supabase Cloud + les 4 users VPS préexistants.

- [ ] **Step 4 : Vérifier l'intégrité des FK profiles → auth.users**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres -c \"
        SELECT COUNT(*) FROM winelio.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE u.id IS NULL;
      \"
  "
  # Attendu : 0 (aucun profil orphelin)
  ```

---

## Task 6 : Recréer les fonctions et triggers winelio sur VPS

**Files:** modifie la base `postgres` VPS (schéma `winelio`)

- [ ] **Step 1 : Créer les fonctions dans le schéma winelio**

  ```bash
  # Écrire le SQL dans un fichier temporaire local
  cat > /tmp/winelio_triggers.sql << 'ENDSQL'
  -- Fonction handle_new_user pour winelio
  CREATE OR REPLACE FUNCTION winelio.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  AS $$
  BEGIN
    INSERT INTO winelio.profiles (id, email) VALUES (NEW.id, NEW.email)
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO winelio.user_wallet_summaries (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END;
  $$;

  -- Fonction update_updated_at pour winelio
  CREATE OR REPLACE FUNCTION winelio.update_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

  -- Trigger inscription → crée profil + wallet dans winelio
  DROP TRIGGER IF EXISTS on_auth_user_created_winelio ON auth.users;
  CREATE TRIGGER on_auth_user_created_winelio
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION winelio.handle_new_user();

  -- Triggers updated_at
  DROP TRIGGER IF EXISTS update_profiles_updated_at ON winelio.profiles;
  CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON winelio.profiles
    FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at();

  DROP TRIGGER IF EXISTS update_companies_updated_at ON winelio.companies;
  CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON winelio.companies
    FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at();

  DROP TRIGGER IF EXISTS update_contacts_updated_at ON winelio.contacts;
  CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON winelio.contacts
    FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at();

  DROP TRIGGER IF EXISTS update_recommendations_updated_at ON winelio.recommendations;
  CREATE TRIGGER update_recommendations_updated_at
    BEFORE UPDATE ON winelio.recommendations
    FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at();

  DROP TRIGGER IF EXISTS update_withdrawals_updated_at ON winelio.withdrawals;
  CREATE TRIGGER update_withdrawals_updated_at
    BEFORE UPDATE ON winelio.withdrawals
    FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at();
  ENDSQL

  # Copier sur VPS et exécuter
  sshpass -p '04660466aA@@@' scp /tmp/winelio_triggers.sql root@31.97.152.195:/tmp/
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres < /tmp/winelio_triggers.sql
  "
  ```

  Résultat attendu : `CREATE FUNCTION`, `CREATE TRIGGER` pour chaque commande.

- [ ] **Step 2 : Créer la fonction get_global_highlights dans winelio**

  ```bash
  cat > /tmp/winelio_highlights.sql << 'ENDSQL'
  CREATE OR REPLACE FUNCTION winelio.get_global_highlights()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = winelio
  AS \$\$
  DECLARE
    v_top_sponsor jsonb := NULL;
    v_top_reco    jsonb := NULL;
    v_top_comm    jsonb := NULL;
    v_today       timestamptz := date_trunc('day', now());
    v_week_start  timestamptz := date_trunc('week', now());
    v_result      jsonb := '[]'::jsonb;
  BEGIN
    SELECT jsonb_build_object(
      'kind',      'top_sponsor',
      'user',      COALESCE(
                     CASE
                       WHEN p.first_name IS NOT NULL AND p.last_name IS NOT NULL
                         THEN p.first_name || ' ' || LEFT(p.last_name, 1) || '.'
                       WHEN p.first_name IS NOT NULL THEN p.first_name
                       WHEN p.last_name IS NOT NULL THEN LEFT(p.last_name, 1) || '.'
                       ELSE NULL
                     END, 'Un membre'),
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

    SELECT jsonb_build_object(
      'kind',      'top_reco',
      'amount',    r.amount,
      'city',      p.city,
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

    SELECT jsonb_build_object(
      'kind',      'big_commission',
      'user',      COALESCE(
                     CASE
                       WHEN p.first_name IS NOT NULL AND p.last_name IS NOT NULL
                         THEN p.first_name || ' ' || LEFT(p.last_name, 1) || '.'
                       WHEN p.first_name IS NOT NULL THEN p.first_name
                       WHEN p.last_name IS NOT NULL THEN LEFT(p.last_name, 1) || '.'
                       ELSE NULL
                     END, 'Un membre'),
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

    IF v_top_sponsor IS NOT NULL THEN v_result := v_result || jsonb_build_array(v_top_sponsor); END IF;
    IF v_top_reco IS NOT NULL THEN v_result := v_result || jsonb_build_array(v_top_reco); END IF;
    IF v_top_comm IS NOT NULL THEN v_result := v_result || jsonb_build_array(v_top_comm); END IF;
    RETURN v_result;
  END;
  \$\$;

  GRANT EXECUTE ON FUNCTION winelio.get_global_highlights() TO anon, authenticated;
  ENDSQL

  sshpass -p '04660466aA@@@' scp /tmp/winelio_highlights.sql root@31.97.152.195:/tmp/
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres < /tmp/winelio_highlights.sql
  "
  ```

  Résultat attendu : `CREATE FUNCTION`, `GRANT`.

- [ ] **Step 3 : Vérifier les triggers créés**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
      psql -U postgres -d postgres -c \"
        SELECT trigger_name, event_object_table, action_statement
        FROM information_schema.triggers
        WHERE trigger_name LIKE '%winelio%' OR action_statement LIKE '%winelio%'
        ORDER BY trigger_name;
      \"
  "
  ```

  Résultat attendu : `on_auth_user_created_winelio` + les 5 triggers `updated_at`.

---

## Task 7 : Configurer PostgREST (Coolify)

**Files:** modifie la config du service Supabase dans Coolify

- [ ] **Step 1 : Récupérer l'ID du service Supabase dans Coolify**

  ```bash
  curl -s "http://31.97.152.195:8000/api/v1/services" \
    -H "Authorization: Bearer 3|hl7ZoqoMXj49ATKNPBgiIFuzvdQNbW6tnER3CRCNae88c4fa" \
    | python3 -c "import json,sys; [print(s['uuid'], s.get('name','')) for s in json.load(sys.stdin)['data']]"
  ```

  Repérer le service Supabase self-hosted (celui qui contient `supabase`).

- [ ] **Step 2 : Modifier PGRST_DB_SCHEMAS via Coolify Dashboard**

  Ouvrir : http://31.97.152.195:8000

  Dans le service Supabase → onglet "Environment Variables" → trouver `PGRST_DB_SCHEMAS`.

  Valeur actuelle : `public,storage,graphql_public,formations`
  Nouvelle valeur : `public,storage,graphql_public,formations,winelio`

  Sauvegarder.

- [ ] **Step 3 : Redémarrer le container supabase-rest**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "docker restart supabase-rest-ixlhs1fg5t2n8c4zsgvnys0r"
  ```

  Attendre 5 secondes puis vérifier :

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "docker ps | grep supabase-rest"
  # Attendu : "Up X seconds (healthy)" ou "Up X seconds"
  ```

- [ ] **Step 4 : Tester PostgREST sur le schéma winelio**

  ```bash
  curl -s \
    -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.6kmELDu05wXO2ZifJV2ZsWUsK6Zt1Gf6A3KwSiZQV5s" \
    -H "Accept-Profile: winelio" \
    "https://supabase.aide-multimedia.fr/rest/v1/categories?limit=3" \
    | python3 -m json.tool | head -20
  ```

  Résultat attendu : JSON avec les catégories Winelio (15 catégories).

---

## Task 8 : Mettre à jour les clients Supabase (code)

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/admin.ts`

- [ ] **Step 1 : Mettre à jour client.ts**

  Remplacer le contenu de `src/lib/supabase/client.ts` :

  ```ts
  import { createBrowserClient } from "@supabase/ssr";
  import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

  export function createClient() {
    return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "winelio" },
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
      },
      cookieOptions: {
        lifetime: 60 * 60 * 24 * 365,
        sameSite: "lax",
      },
    });
  }
  ```

- [ ] **Step 2 : Mettre à jour server.ts**

  Remplacer le contenu de `src/lib/supabase/server.ts` :

  ```ts
  import { createServerClient } from "@supabase/ssr";
  import { cookies } from "next/headers";
  import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

  export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        db: { schema: "winelio" },
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Called from Server Component — ignore
            }
          },
        },
      }
    );
  }
  ```

- [ ] **Step 3 : Mettre à jour admin.ts**

  Remplacer le contenu de `src/lib/supabase/admin.ts` :

  ```ts
  // src/lib/supabase/admin.ts
  import { createClient } from "@supabase/supabase-js";
  import { SUPABASE_URL } from "./config";

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  export const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
    db: { schema: "winelio" },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  ```

- [ ] **Step 4 : Commit des changements code**

  ```bash
  git add src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/admin.ts
  git commit -m "feat: migrer clients Supabase vers schéma winelio sur VPS"
  ```

---

## Task 9 : Mettre à jour les variables d'environnement et tester en local

**Files:**
- Modify: `.env.local`

- [ ] **Step 1 : Mettre à jour .env.local**

  Remplacer les lignes Supabase dans `.env.local` :

  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://supabase.aide-multimedia.fr
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.6kmELDu05wXO2ZifJV2ZsWUsK6Zt1Gf6A3KwSiZQV5s
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.YJaG6JP4aadbwKUpNhLpx6j_F5F_oCvW5rCVn_FZn-o
  NEXT_PUBLIC_SITE_URL=http://localhost:3000
  SMTP_HOST=dahu.o2switch.net
  SMTP_PORT=587
  SMTP_USER=contact@aide-multimedia.fr
  SMTP_PASS=04660466aA@@@
  SMTP_SENDER_NAME=Winelio
  SMTP_ADMIN_EMAIL=contact@aide-multimedia.fr
  NEXT_PUBLIC_DEMO_MODE=true
  ```

- [ ] **Step 2 : Relancer le serveur de dev**

  ```bash
  pkill -f "next dev"; sleep 1; npm run dev &
  # Attendre "Ready in Xms"
  ```

- [ ] **Step 3 : Tester la connexion en local**

  Ouvrir http://localhost:3000/auth/login dans le navigateur.
  Entrer un email d'un utilisateur existant migré.
  Vérifier que l'email Magic Link est envoyé (logs SMTP) et que la connexion fonctionne.

- [ ] **Step 4 : Vérifier que les données s'affichent**

  Après connexion, vérifier dans le navigateur :
  - `/dashboard` — affiche les stats
  - `/network` — affiche l'arbre réseau
  - `/recommendations` — liste les recommandations migrées

  Si une page affiche "0 résultats" alors qu'on attend des données → vérifier les RLS policies (voir note ci-dessous).

  > **Note RLS** : Si les données ne s'affichent pas, vérifier que les RLS policies ont bien été importées dans le schéma `winelio`. Exécuter :
  > ```bash
  > sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres -c \"SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'winelio' ORDER BY tablename;\""
  > ```
  > Résultat attendu : 20+ policies listées.

---

## Task 10 : Mettre à jour Coolify (production)

**Files:** modifie les variables d'environnement dans Coolify

- [ ] **Step 1 : Identifier l'UUID de l'app Winelio dans Coolify**

  Vérifier dans CLAUDE.md — l'UUID de l'app Winelio production n'est pas encore documenté.
  Chercher via :

  ```bash
  curl -s "http://31.97.152.195:8000/api/v1/applications" \
    -H "Authorization: Bearer 3|hl7ZoqoMXj49ATKNPBgiIFuzvdQNbW6tnER3CRCNae88c4fa" \
    | python3 -c "
  import json, sys
  apps = json.load(sys.stdin)
  for a in apps.get('data', []):
      print(a.get('uuid'), a.get('name',''), a.get('fqdn',''))
  "
  ```

  Repérer l'app Winelio (vérifier le FQDN).

- [ ] **Step 2 : Mettre à jour les variables dans Coolify Dashboard**

  Ouvrir http://31.97.152.195:8000 → application Winelio → onglet "Environment Variables".

  Mettre à jour :
  - `NEXT_PUBLIC_SUPABASE_URL` → `https://supabase.aide-multimedia.fr`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.6kmELDu05wXO2ZifJV2ZsWUsK6Zt1Gf6A3KwSiZQV5s`
  - `SUPABASE_SERVICE_ROLE_KEY` → `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.YJaG6JP4aadbwKUpNhLpx6j_F5F_oCvW5rCVn_FZn-o`

  Sauvegarder et redéployer l'application.

- [ ] **Step 3 : Vérifier le déploiement**

  ```bash
  ~/bin/coolify-status prod
  ```

  Ou surveiller les logs dans le dashboard Coolify jusqu'à "Running".

---

## Task 11 : Configurer rclone Google Drive sur VPS

**Files:** modifie `/root/.config/rclone/rclone.conf` sur VPS

- [ ] **Step 1 : Vérifier si rclone est installé sur le VPS**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "which rclone && rclone version | head -1"
  ```

  Si absent, installer :

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "curl https://rclone.org/install.sh | bash"
  ```

- [ ] **Step 2 : Lancer la configuration rclone (interactive)**

  Comme le VPS est headless, utiliser le mode `--auto-confirm` avec un token généré localement.

  **Sur le Mac **, lancer rclone pour générer un token Google Drive :

  ```bash
  rclone authorize "drive"
  ```

  Suivre les instructions : un navigateur s'ouvre → se connecter avec le compte Google → autoriser → copier le token JSON affiché dans le terminal.

- [ ] **Step 3 : Créer la config rclone sur le VPS**

  Remplacer `<TOKEN_JSON>` par le token copié à l'étape précédente.

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "mkdir -p /root/.config/rclone && cat > /root/.config/rclone/rclone.conf << 'EOF'
  [gdrive]
  type = drive
  scope = drive
  token = <TOKEN_JSON>
  EOF"
  ```

- [ ] **Step 4 : Tester la connexion Google Drive**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "rclone lsd gdrive: 2>&1 | head -10"
  ```

  Résultat attendu : liste des dossiers Google Drive du compte.

- [ ] **Step 5 : Créer le dossier de backups sur Google Drive**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "rclone mkdir gdrive:backups/winelio"
  ```

---

## Task 12 : Script de backup + cron

**Files:** crée `/root/scripts/backup-winelio.sh` sur VPS, modifie crontab

- [ ] **Step 1 : Créer le script de backup**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "mkdir -p /root/scripts && cat > /root/scripts/backup-winelio.sh << 'SCRIPT'
  #!/bin/bash
  set -e

  TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR=/root/backups/winelio
  CONTAINER=supabase-db-ixlhs1fg5t2n8c4zsgvnys0r
  LOG=/var/log/backup-winelio.log

  mkdir -p \$BACKUP_DIR

  echo \"[\$TIMESTAMP] Démarrage backup winelio\" >> \$LOG

  # Dump PostgreSQL schéma winelio
  docker exec \$CONTAINER pg_dump \
    -U postgres \
    -d postgres \
    --schema=winelio \
    --no-owner \
    --no-acl \
    | gzip > \$BACKUP_DIR/winelio_\$TIMESTAMP.sql.gz

  echo \"[\$TIMESTAMP] Dump créé : winelio_\$TIMESTAMP.sql.gz\" >> \$LOG

  # Upload vers Google Drive
  rclone copy \$BACKUP_DIR/winelio_\$TIMESTAMP.sql.gz gdrive:backups/winelio/

  echo \"[\$TIMESTAMP] Upload Google Drive OK\" >> \$LOG

  # Nettoyage local : garder 7 jours
  find \$BACKUP_DIR -name \"*.sql.gz\" -mtime +7 -delete

  echo \"[\$TIMESTAMP] Backup terminé\" >> \$LOG
  SCRIPT
  chmod +x /root/scripts/backup-winelio.sh"
  ```

- [ ] **Step 2 : Tester le script manuellement**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "/root/scripts/backup-winelio.sh && echo 'OK'"
  ```

  Résultat attendu : `OK` sans erreur.

  Vérifier le fichier créé :

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "ls -lh /root/backups/winelio/"
  # Attendu : fichier winelio_YYYYMMDD_HHMMSS.sql.gz (quelques MB)
  ```

  Vérifier sur Google Drive :

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
    "rclone ls gdrive:backups/winelio/"
  # Attendu : le fichier backup vient d'apparaître
  ```

- [ ] **Step 3 : Ajouter le cron (2x/jour à 6h et 18h)**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "
    (crontab -l 2>/dev/null; echo '0 6,18 * * * /root/scripts/backup-winelio.sh >> /var/log/backup-winelio.log 2>&1') | crontab -
  "
  ```

- [ ] **Step 4 : Vérifier le cron**

  ```bash
  sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "crontab -l | grep backup-winelio"
  # Attendu : 0 6,18 * * * /root/scripts/backup-winelio.sh >> /var/log/backup-winelio.log 2>&1
  ```

- [ ] **Step 5 : Commit final**

  ```bash
  git add src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/admin.ts
  git commit -m "feat: migration Supabase Cloud → VPS, schéma winelio + backups Google Drive"
  ```

---

## Critères de succès finaux

- [ ] Toutes les tables présentes dans `winelio` avec les données migrées
- [ ] Aucun profil orphelin (FK profiles → auth.users valide)
- [ ] Login Magic Link fonctionnel sur VPS
- [ ] PostgREST répond sur le schéma winelio (`/rest/v1/categories`)
- [ ] App locale pointe sur VPS et affiche les données
- [ ] Production Coolify redéployée et fonctionnelle
- [ ] Backup test exécuté avec succès
- [ ] Fichier backup visible sur Google Drive
- [ ] Cron actif (2x/jour)
