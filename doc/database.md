# Schéma Base de Données — Winelio

> Analyse froide des fichiers source + migrations SQL. Généré le 2026-04-09.
> Instance : Supabase self-hosted · Schéma PostgreSQL : `winelio`

---

## ORGANISATION

- **Schéma applicatif** : `winelio` (toutes les tables métier)
- **Schéma auth** : `auth` (géré par Supabase — `auth.users`)
- **RLS** : activé sur toutes les tables applicatives
- **Triggers** : `update_*_updated_at` sur toutes les tables avec `updated_at`

---

## TABLES

### `winelio.profiles`
Extension de `auth.users`. Créé automatiquement par le trigger `on_auth_user_created`.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK, FK → `auth.users.id` | Identifiant utilisateur Supabase |
| `email` | `text` | NOT NULL, UNIQUE | Email (synchronisé depuis auth.users) |
| `first_name` | `text` | | Prénom |
| `last_name` | `text` | | Nom |
| `phone` | `text` | | Téléphone |
| `postal_code` | `text` | | Code postal |
| `city` | `text` | | Ville |
| `address` | `text` | | Adresse |
| `is_professional` | `boolean` | DEFAULT false | Est-il professionnel ? |
| `sponsor_id` | `uuid` | FK → `profiles.id` | Parrain direct (MLM niveau 1) |
| `sponsor_code` | `text` | UNIQUE | Code parrain unique (6 chars alphanum) |
| `is_founder` | `boolean` | DEFAULT false | Fondateur (pool round-robin inscription) |
| `is_active` | `boolean` | DEFAULT true | Compte actif (false = suspendu) |
| `compensation_plan_id` | `uuid` | FK → `compensation_plans.id` | Plan de commission assigné |
| `created_at` | `timestamptz` | DEFAULT NOW() | Date création |
| `updated_at` | `timestamptz` | AUTO via trigger | Date dernière modification |

**Relations** :
- `profiles.sponsor_id → profiles.id` (auto-jointure, arbre MLM)
- `profiles.compensation_plan_id → compensation_plans.id`
- `profiles.id → recommendations.referrer_id`
- `profiles.id → recommendations.professional_id`
- `profiles.id → companies.owner_id`
- `profiles.id → commission_transactions.user_id`
- `profiles.id → user_wallet_summaries.user_id`
- `profiles.id → withdrawals.user_id`

**RLS** : SELECT public (tout le monde peut lire), INSERT/UPDATE self only

---

### `winelio.otp_codes`
Codes OTP temporaires pour l'authentification.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `email` | `text` | PK | Email cible |
| `code` | `text` | NOT NULL | Code à 6 chiffres |
| `expires_at` | `timestamptz` | NOT NULL | Expiration (10 min) |
| `created_at` | `timestamptz` | DEFAULT NOW() | Date création |

**Logique** : UPSERT à chaque demande (1 code actif par email). Suppression après validation réussie.

---

### `winelio.categories`
Catégories de services professionnels. Données statiques (15 catégories).

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | Identifiant |
| `name` | `text` | NOT NULL | Nom affiché (ex: "Plomberie") |
| `slug` | `text` | UNIQUE | Slug URL (ex: "plomberie") |
| `description` | `text` | | Description |
| `icon` | `text` | | Nom icône (Lucide) |
| `created_at` | `timestamptz` | DEFAULT NOW() | |

**RLS** : SELECT public (lecture libre).

---

### `winelio.companies`
Entreprises des professionnels.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | |
| `owner_id` | `uuid` | NOT NULL, FK → `profiles.id` | Propriétaire |
| `name` | `text` | NOT NULL | Nom commercial |
| `alias` | `text` | NOT NULL, UNIQUE | Alias interne #XXXXXX |
| `legal_name` | `text` | | Raison sociale |
| `category_id` | `uuid` | FK → `categories.id` | Catégorie métier |
| `email` | `text` | | Email professionnel |
| `phone` | `text` | | Téléphone |
| `website` | `text` | | Site web |
| `address` | `text` | | Adresse |
| `city` | `text` | | Ville |
| `postal_code` | `text` | | Code postal |
| `siret` | `text` | | N° SIRET |
| `siren` | `text` | | N° SIREN |
| `vat_number` | `text` | | N° TVA intracommunautaire |
| `is_verified` | `boolean` | DEFAULT false | Vérifié par admin |
| `lat` | `decimal` | | Latitude (geocodage) |
| `lon` | `decimal` | | Longitude (geocodage) |
| `created_at` | `timestamptz` | DEFAULT NOW() | |
| `updated_at` | `timestamptz` | AUTO via trigger | |

**Trigger** : `update_companies_updated_at` → met à jour `updated_at`.

---

### `winelio.contacts`
Prospects/clients pour les recommandations.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `created_by` | `uuid` | FK → `profiles.id` | Utilisateur ayant créé le contact |
| `first_name` | `text` | | |
| `last_name` | `text` | | |
| `email` | `text` | | |
| `phone` | `text` | | |
| `created_at` | `timestamptz` | DEFAULT NOW() | |

---

### `winelio.compensation_plans`
Plans de commission MLM. Définit les taux de redistribution.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `name` | `text` | NOT NULL | Nom du plan (ex: "Standard") |
| `commission_rate` | `decimal` | | Taux global de commission (%) |
| `referrer_percentage` | `decimal` | | Part du referrer (60%) |
| `level_1_percentage` | `decimal` | | Part parrain N1 (4%) |
| `level_2_percentage` | `decimal` | | Part parrain N2 (4%) |
| `level_3_percentage` | `decimal` | | Part parrain N3 (4%) |
| `level_4_percentage` | `decimal` | | Part parrain N4 (4%) |
| `level_5_percentage` | `decimal` | | Part parrain N5 (4%) |
| `affiliation_bonus_percentage` | `decimal` | | Bonus sponsor du professionnel (1%) |
| `cashback_wins_percentage` | `decimal` | | Cashback Wins professionnel (1%) |
| `platform_percentage` | `decimal` | | Part plateforme (14%) |
| `created_at` | `timestamptz` | DEFAULT NOW() | |

---

### `winelio.steps`
Définition des 8 étapes du workflow de recommandation.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `name` | `text` | NOT NULL | Nom de l'étape |
| `description` | `text` | | Description |
| `order_index` | `integer` | NOT NULL | Ordre (1 à 8) |
| `completion_role` | `text` | CHECK(IN('REFERRER','PROFESSIONAL')) | Qui peut compléter cette étape |

**Données statiques** :

| order_index | name | completion_role |
|-------------|------|-----------------|
| 1 | Recommandation reçue | AUTO |
| 2 | Acceptée | PROFESSIONAL |
| 3 | Contact établi | PROFESSIONAL |
| 4 | Rendez-vous fixé | PROFESSIONAL |
| 5 | Devis soumis | PROFESSIONAL |
| 6 | **Devis validé** ← déclenche commissions | REFERRER |
| 7 | Paiement reçu | PROFESSIONAL |
| 8 | Affaire terminée | PROFESSIONAL |

---

### `winelio.recommendations`
Recommandations entre utilisateurs (cœur du système).

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `referrer_id` | `uuid` | NOT NULL, FK → `profiles.id` | Qui recommande |
| `professional_id` | `uuid` | NOT NULL, FK → `profiles.id` | Le professionnel recommandé |
| `contact_id` | `uuid` | FK → `contacts.id` | Le prospect concerné |
| `status` | `text` | NOT NULL | Statut global (pending/active/completed/cancelled) |
| `amount` | `decimal` | | Montant de la transaction (renseigné à l'étape 5) |
| `company_id` | `uuid` | FK → `companies.id` | Entreprise concernée |
| `notes` | `text` | | Notes |
| `created_at` | `timestamptz` | DEFAULT NOW() | |
| `updated_at` | `timestamptz` | AUTO via trigger | |

---

### `winelio.recommendation_steps`
Table de jonction : suivi des étapes par recommandation.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `recommendation_id` | `uuid` | NOT NULL, FK → `recommendations.id` | |
| `step_id` | `uuid` | NOT NULL, FK → `steps.id` | |
| `completed_at` | `timestamptz` | | NULL si non complétée |
| `completed_by` | `uuid` | FK → `profiles.id` | Qui a complété |
| `data` | `jsonb` | | Données associées (ex: `{amount: 5000}` pour l'étape 5) |
| `created_at` | `timestamptz` | DEFAULT NOW() | |

**Contrainte** : UNIQUE(recommendation_id, step_id)

---

### `winelio.commission_transactions`
Transactions de commission générées à l'étape 6.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `recommendation_id` | `uuid` | NOT NULL, FK → `recommendations.id` | Source |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | Bénéficiaire |
| `source_user_id` | `uuid` | FK → `profiles.id` | Utilisateur source de la commission |
| `amount` | `decimal` | NOT NULL | Montant en EUR |
| `wins_amount` | `decimal` | | Montant en Wins (monnaie interne) |
| `type` | `text` | NOT NULL | `referrer` / `sponsor` / `affiliation` / `cashback_wins` / `manual_adjustment` |
| `level` | `integer` | | Niveau MLM (0=referrer, 1-5=sponsors) |
| `status` | `text` | NOT NULL | `PENDING` → `EARNED` (déclenché à l'étape 6) |
| `notes` | `text` | | Notes admin |
| `created_at` | `timestamptz` | DEFAULT NOW() | |
| `updated_at` | `timestamptz` | AUTO via trigger | |

**Logique idempotence** : création vérifiée par `recommendation_id` + `user_id` + `type` avant insert.

---

### `winelio.user_wallet_summaries`
Cache dénormalisé du wallet utilisateur. Mis à jour à chaque transaction.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `user_id` | `uuid` | PK, FK → `profiles.id` | |
| `total_earned` | `decimal` | DEFAULT 0 | Total commissions gagnées (EUR) |
| `total_withdrawn` | `decimal` | DEFAULT 0 | Total retiré (EUR) |
| `pending_commissions` | `decimal` | DEFAULT 0 | Commissions en attente (PENDING) |
| `available` | `decimal` | DEFAULT 0 | Solde disponible = total_earned - total_withdrawn |
| `total_wins` | `decimal` | DEFAULT 0 | Total Wins gagnés |
| `available_wins` | `decimal` | DEFAULT 0 | Wins disponibles |
| `redeemed_wins` | `decimal` | DEFAULT 0 | Wins utilisés |
| `updated_at` | `timestamptz` | AUTO via trigger | |

**Créé automatiquement** par trigger `on_auth_user_created` → initialize à 0.

---

### `winelio.withdrawals`
Demandes de retrait des utilisateurs.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | |
| `amount` | `decimal` | NOT NULL | Montant demandé |
| `payment_method` | `text` | NOT NULL | `bank_transfer` / `paypal` |
| `payment_details` | `jsonb` | NOT NULL | `{iban: "..."}` ou `{email: "..."}` |
| `status` | `text` | DEFAULT 'pending' | `pending` → `approved` → `paid` / `rejected` |
| `rejection_reason` | `text` | | Motif de rejet (admin) |
| `created_at` | `timestamptz` | DEFAULT NOW() | |
| `updated_at` | `timestamptz` | AUTO via trigger | |

---

### `winelio.deleted_sponsor_codes`
Protection contre la réutilisation des codes parrain supprimés.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `sponsor_code` | `text` | PK | Code parrain supprimé |
| `deleted_at` | `timestamptz` | DEFAULT NOW() | Date suppression |

---

### `winelio.audit_logs`
Journal d'audit des actions sensibles.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → `profiles.id` | Acteur |
| `action` | `text` | NOT NULL | Type d'action (ex: `WITHDRAWAL_APPROVED`) |
| `entity_type` | `text` | | Type d'entité concernée |
| `entity_id` | `uuid` | | ID de l'entité |
| `old_value` | `jsonb` | | Valeur avant |
| `new_value` | `jsonb` | | Valeur après |
| `ip_address` | `text` | | IP de l'action |
| `created_at` | `timestamptz` | DEFAULT NOW() | |

---

## FONCTIONS & RPC

### `process_withdrawal(p_user_id, p_amount, p_method, p_details)`
**Fichier** : `supabase/migrations/007_atomic_withdrawal.sql`
Transaction atomique :
1. Vérifie solde disponible ≥ montant
2. INSERT withdrawals (status='pending')
3. UPDATE user_wallet_summaries (available -= amount, total_withdrawn += amount)

Retourne : `{success: bool, withdrawal_id: uuid, error?: text}`

### `get_mlm_network(p_user_id, p_max_levels)`
**Fichier** : `supabase/migrations/008_mlm_network_rpc.sql`
Remonte la chaîne de sponsors jusqu'à N niveaux via CTE récursive.
Retourne : tableau de `{user_id, sponsor_id, level, ...}`

### `get_next_open_registration_sponsor()`
**Fichier** : `supabase/migrations/009_open_registration_rotation.sql` + `010_founder_flag.sql`
Round-robin parmi les utilisateurs `is_founder=true`.
Utilise une table d'état `open_registration_rotation_state`.
Retourne : `uuid` (prochain sponsor à assigner)

### `global_highlights()`
**Fichier** : `supabase/migrations/003_global_highlights_fn.sql`
Calcul top sponsors, top performers pour le dashboard.

---

## TRIGGERS

| Trigger | Table | Action | Fonction |
|---------|-------|--------|----------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Crée `profiles` + `user_wallet_summaries` |
| `update_profiles_updated_at` | `winelio.profiles` | BEFORE UPDATE | SET updated_at = NOW() |
| `update_companies_updated_at` | `winelio.companies` | BEFORE UPDATE | SET updated_at = NOW() |
| `update_recommendations_updated_at` | `winelio.recommendations` | BEFORE UPDATE | SET updated_at = NOW() |
| `update_withdrawals_updated_at` | `winelio.withdrawals` | BEFORE UPDATE | SET updated_at = NOW() |
| `update_commission_transactions_updated_at` | `winelio.commission_transactions` | BEFORE UPDATE | SET updated_at = NOW() |

---

## DIAGRAMME ERD SIMPLIFIÉ

```
auth.users (Supabase)
    │ 1:1
    ▼
winelio.profiles ──────────────────── winelio.compensation_plans
    │ (sponsor_id FK self)
    │
    ├── 1:N ──► winelio.companies
    │
    ├── 1:1 ──► winelio.user_wallet_summaries
    │
    ├── 1:N ──► winelio.withdrawals
    │
    ├── 1:N ──► winelio.commission_transactions
    │               │ N:1
    │               ▼
    ├── 1:N ──► winelio.recommendations
    │               │ 1:N
    │               ▼
    │           winelio.recommendation_steps
    │               │ N:1
    │               ▼
    │           winelio.steps (static data)
    │
    └── 1:N ──► winelio.contacts
```

---

## MIGRATIONS (ordre d'application)

| # | Fichier | Contenu |
|---|---------|---------|
| 001 | `001_otp_codes.sql` | Table `otp_codes` |
| 002 | `002_initial_schema.sql` | Toutes les tables principales + triggers + RLS |
| 003 | `003_global_highlights_fn.sql` | Fonction `global_highlights()` |
| 004 | `004_add_company_alias.sql` | Colonne `alias` sur `companies` |
| 005 | `005_company_alias_not_null.sql` | `alias` NOT NULL + trigger `updated_at` |
| 006 | `006_deleted_accounts.sql` | Table `deleted_sponsor_codes` |
| 007 | `007_atomic_withdrawal.sql` | RPC `process_withdrawal()` |
| 008 | `008_mlm_network_rpc.sql` | RPC `get_mlm_network()` |
| 009 | `009_open_registration_rotation.sql` | RPC round-robin + table état |
| 010 | `010_founder_flag.sql` | Colonne `is_founder` + mise à jour RPC |

### Commande pour appliquer une migration

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/XXX.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/XXX.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/XXX.sql"
```
