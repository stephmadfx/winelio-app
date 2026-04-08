# Spec : Migration Supabase Cloud → VPS + Backups Google Drive

**Date** : 2026-04-08  
**Projet** : Winelio  
**Statut** : Approuvé

---

## Contexte

Winelio utilise actuellement Supabase Cloud (`dxnebmxtkvauergvrmod.supabase.co`). L'objectif est de migrer la base de données vers le Supabase self-hosted sur VPS (`supabase.aide-multimedia.fr`) afin de réduire les coûts et centraliser l'infrastructure. Les données réelles (utilisateurs, recommandations, wallets, etc.) doivent être préservées intégralement.

---

## Architecture cible

### Base de données VPS

- **Instance PostgreSQL** : container `supabase-db-ixlhs1fg5t2n8c4zsgvnys0r` sur VPS `31.97.152.195`
- **Base de données** : `postgres` (la seule connectée au stack Supabase : Auth, PostgREST, Realtime)
- **Schéma Winelio** : `winelio` (suit la convention des autres projets : `formations`, `hesbydesign`, `onibradio`)
- **Schéma auth** : `auth` partagé entre tous les projets sur le VPS

### Stack Supabase VPS (inchangé)

Les containers existants (`supabase-auth`, `supabase-rest`, `supabase-kong`, etc.) restent en place. Seule la config PostgREST est mise à jour pour exposer le schéma `winelio`.

---

## Plan de migration (Option A — pg_dump/restore)

### Étape 1 — Export depuis Supabase Cloud

- Connexion via l'URL directe PostgreSQL Supabase Cloud :
  `postgresql://postgres:[password]@db.dxnebmxtkvauergvrmod.supabase.co:5432/postgres`
  Le mot de passe est disponible dans le dashboard Supabase Cloud → Settings → Database → Connection string (champ `password`)
- Export du schéma applicatif :
  ```bash
  pg_dump --schema=public --no-owner --no-acl -F p -f winelio_public.sql "postgresql://..."
  ```
- Export séparé des utilisateurs auth :
  ```bash
  pg_dump --schema=auth --table=auth.users --table=auth.identities --no-owner --no-acl -F p -f winelio_auth.sql "postgresql://..."
  ```

### Étape 2 — Transformation du dump

- Renommer toutes les occurrences `public.` → `winelio.` dans `winelio_public.sql`
- Remplacer `SET search_path = public` → `SET search_path = winelio`
- Ajouter en tête : `CREATE SCHEMA IF NOT EXISTS winelio;`

### Étape 3 — Import sur VPS

- Copier les fichiers SQL sur le VPS via `scp`
- Injecter dans le container PostgreSQL :
  ```bash
  docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres < winelio_public_transformed.sql
  ```
- Import auth (INSERT avec `ON CONFLICT DO NOTHING` pour éviter les doublons) :
  ```bash
  docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres < winelio_auth.sql
  ```
  Note : utiliser `postgres` (superuser) car `supabase_auth_admin` n'a pas les droits INSERT directs sur `auth.users`
- Les UUIDs de `auth.users` sont préservés → les FK dans `winelio.profiles` restent valides

### Étape 4 — Recréation des triggers

Les triggers Supabase (`on_auth_user_created`, `update_*_updated_at`) référencent le schéma `public`. Ils doivent être recréés pour pointer sur `winelio` :
- `on_auth_user_created` → crée un enregistrement dans `winelio.profiles` + `winelio.user_wallet_summaries`
- `update_*_updated_at` → sur chaque table `winelio.*`

---

## Configuration PostgREST

Mettre à jour la variable d'environnement `PGRST_DB_SCHEMAS` dans Coolify pour le service Supabase :

```
PGRST_DB_SCHEMAS=public,storage,graphql_public,formations,winelio
```

Redémarrer le container `supabase-rest-ixlhs1fg5t2n8c4zsgvnys0r` après modification.

---

## Mise à jour de l'application

### Variables d'environnement

Remplacer dans `.env.local` et dans Coolify (variables de build) :

| Variable | Avant (Cloud) | Après (VPS) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dxnebmxtkvauergvrmod.supabase.co` | `https://supabase.aide-multimedia.fr` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé Cloud | Clé VPS (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé Cloud | Clé VPS (service role) |

Les clés VPS sont déjà documentées dans `CLAUDE.md` (global).

### Code — Client Supabase

Dans `lib/supabase/client.ts`, `lib/supabase/server.ts` et `lib/supabase/admin.ts`, préciser le schéma `winelio` :

```ts
createClient(url, key, {
  db: { schema: 'winelio' }
})
```

### RLS (Row Level Security)

Les politiques RLS existantes utilisent `auth.uid()` qui est global au stack Supabase — aucune modification nécessaire. Les policies doivent être recréées dans le schéma `winelio` lors de l'import.

---

## Backups automatiques 2x/jour → Google Drive

### Script de backup (`/root/scripts/backup-winelio.sh`)

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/root/backups/winelio
mkdir -p $BACKUP_DIR

# Dump PostgreSQL schéma winelio
docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r pg_dump \
  -U postgres -d postgres --schema=winelio --no-owner --no-acl \
  | gzip > $BACKUP_DIR/winelio_$TIMESTAMP.sql.gz

# Upload vers Google Drive
rclone copy $BACKUP_DIR/winelio_$TIMESTAMP.sql.gz gdrive:backups/winelio/

# Nettoyage local : garder 7 jours
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

### Configuration rclone

Sur le VPS, configurer un remote Google Drive :
```bash
rclone config
# → Créer remote "gdrive" de type "drive"
# → Authentification OAuth via navigateur (ou service account)
```

### Cron (sur le VPS)

```cron
0 6,18 * * * /root/scripts/backup-winelio.sh >> /var/log/backup-winelio.log 2>&1
```

Backups à 6h00 et 18h00 chaque jour.

---

## Tables migrées

| Table | Description |
|---|---|
| `profiles` | Utilisateurs (nom, sponsor_code, is_professional) |
| `categories` | 15 catégories de services |
| `companies` | Entreprises des professionnels |
| `contacts` | Prospects |
| `compensation_plans` | Plans de commission |
| `steps` | 8 étapes du workflow |
| `recommendations` | Recommandations |
| `recommendation_steps` | Étapes complétées |
| `commission_transactions` | Commissions |
| `user_wallet_summaries` | Cache wallet |
| `withdrawals` | Demandes de retrait |
| `devices` | Tokens push |
| `audit_logs` | Journal d'audit |

---

## Critères de succès

- [ ] Toutes les tables présentes dans le schéma `winelio` sur VPS
- [ ] `auth.users` importés avec UUIDs identiques à ceux de Cloud
- [ ] Login Magic Link fonctionnel sur VPS
- [ ] PostgREST expose le schéma `winelio` (test via `curl https://supabase.aide-multimedia.fr/rest/v1/profiles`)
- [ ] App Next.js pointe sur VPS et fonctionne en local (`localhost:3000`)
- [ ] Backups Google Drive créés 2x/jour
