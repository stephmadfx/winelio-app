# Winelio — Schéma base de données

> Régénéré le 2026-05-07 depuis les 60 migrations SQL.
> Schéma PostgreSQL principal : `winelio` (Supabase self-hosted VPS)
> La migration `002_initial_schema.sql` crée des tables dans `public` (schéma legacy cloud, non utilisé en prod). Toute la prod est dans `winelio`.

---

## Tables `winelio.*`

### `profiles` (extension de `auth.users`)
Colonnes clés (état final après migrations) :

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | FK → auth.users(id) ON DELETE CASCADE |
| email | text NOT NULL | |
| first_name, last_name, phone | text | |
| avatar | text | URL R2 ou null — c'est `avatar`, pas `avatar_url` |
| is_professional | boolean DEFAULT false | |
| is_admin | boolean DEFAULT false | non utilisé en prod (admin = app_metadata.role) |
| sponsor_code | text UNIQUE DEFAULT generate_unique_sponsor_code() | 8 chars A-Z0-9 [20260415_sponsor_code_8chars.sql] |
| sponsor_id | uuid FK profiles(id) | null pour les fondateurs |
| is_founder | boolean DEFAULT false | têtes de lignée pour la rotation [010_founder_flag.sql] |
| is_active | boolean DEFAULT true | |
| address, city, postal_code, country | text | country DEFAULT 'FR' |
| latitude, longitude | double precision | géocodage [lib/geocode.ts] |
| work_mode | text CHECK ('remote','onsite','both') | [20260413_pro_fields.sql] |
| pro_engagement_accepted | boolean DEFAULT false | [20260413_pro_fields.sql] |
| stripe_customer_id | text | [20260417_stripe_setup_intent.sql] |
| stripe_payment_method_id | text | [20260417_stripe_setup_intent.sql] |
| stripe_payment_method_brand | text | ex: 'visa' |
| stripe_payment_method_last4 | text | [20260417_stripe_setup_intent.sql] |
| stripe_payment_method_saved_at | timestamptz | |
| terms_accepted | boolean DEFAULT false | [20260420_profile_terms_acceptance.sql] |
| terms_accepted_at | timestamptz | |
| birth_date | date CHECK (>= 18 ans) | [20260420_profiles_birth_date.sql] |
| is_demo | boolean DEFAULT false | profils de démo [015_demo_network.sql] |
| demo_owner_id | uuid FK profiles(id) ON DELETE CASCADE | [015_demo_network.sql] |
| tour_completed_at | timestamptz | visite guidée driver.js [20260501_tour_completed_at.sql] |
| avatar_visible_to_network | boolean DEFAULT true | RGPD Art. 21 [20260501_avatar_visibility.sql] |
| created_at, updated_at | timestamptz | updated_at via trigger |

RLS : SELECT public, INSERT/UPDATE owner-only. Écriture admin via `supabaseAdmin`.

---

### `companies`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid FK profiles(id) ON DELETE CASCADE | |
| name | text NOT NULL | |
| legal_name, email, phone, website | text | |
| address, city, postal_code, country | text | |
| latitude, longitude | numeric | |
| radius | integer DEFAULT 50 | rayon d'intervention (km) |
| category_id | uuid FK categories(id) | |
| siret, siren, vat_number | text | |
| is_verified | boolean DEFAULT false | |
| alias | varchar(7) UNIQUE | format `#XXXXXX` [004_add_company_alias.sql] |
| deleted_at | timestamptz | soft delete [20260417_company_soft_delete.sql] |
| source | text DEFAULT 'owner' CHECK ('owner','scraped') | [20260417_company_source.sql] |
| naf_code | text | code APE SIRENE [20260501_companies_naf_code.sql] |
| insurance_number | text | RC pro, optionnel [20260501_companies_insurance.sql] |
| created_at, updated_at | timestamptz | |

RLS : SELECT public, écriture owner-only. Index partiel sur `deleted_at IS NULL`.

---

### `contacts`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles(id) ON DELETE CASCADE | |
| first_name, last_name | text NOT NULL | |
| email, phone | text | |
| address, city, postal_code, country, company_name, job_title | text | |
| created_at, updated_at | timestamptz | |

RLS : CRUD owner-only. En plus : SELECT pour le professionnel d'une reco concernée [20260417_contacts_rls_pros.sql].

---

### `categories`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name, slug | text NOT NULL | |
| description, icon | text | |
| is_active | boolean DEFAULT true | |
| is_hoguet | boolean DEFAULT false | activités soumises à la loi Hoguet (immo) [20260415_is_hoguet_and_storage.sql] |
| created_at | timestamptz | |

RLS : SELECT public.

---

### `compensation_plans`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name, description | text | |
| commission_rate | numeric DEFAULT 10 | % appliqué sur le montant deal |
| referrer_percentage | numeric DEFAULT 60 | |
| level_1..5_percentage | numeric DEFAULT 4 each | niveaux MLM |
| platform_percentage | numeric DEFAULT 14 | cagnotte Winelio [20260414_cagnotte_winelio.sql] |
| affiliation_percentage | numeric DEFAULT 1 | sponsor du pro [20260414_cagnotte_winelio.sql] |
| cashback_wins_percentage | numeric DEFAULT 1 | cashback pro en Wins [20260414_cagnotte_winelio.sql] |
| priority, conditions | int / jsonb | |
| is_default, is_active | boolean | |
| created_at, updated_at | timestamptz | |

RLS : SELECT public.

---

### `steps` (7 étapes workflow)

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name, description | text | |
| order_index | integer NOT NULL | 1–7 |
| completion_role | text | 'PROFESSIONAL' ou 'REFERRER'. Étape 6 = REFERRER [20260417_fix_step_completion_role.sql] |
| is_active | boolean DEFAULT true | |
| created_at | timestamptz | |

Restructuration : migration 20260427 supprime l'ancienne étape 7 "Paiement reçu" et renumérote → 7 étapes au total (étape 6 = "Travaux terminés + Paiement", étape 7 = "Affaire terminée").

---

### `recommendations`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| referrer_id | uuid FK profiles(id) NOT NULL | |
| professional_id | uuid FK profiles(id) NOT NULL | |
| company_id | uuid FK companies(id) | |
| contact_id | uuid FK contacts(id) | |
| compensation_plan_id | uuid FK compensation_plans(id) | |
| project_description | text | |
| urgency_level | text DEFAULT 'normal' CHECK ('low','normal','high','urgent') | |
| status | text CHECK (...) | voir enum ci-dessous |
| amount | numeric | montant deal (saisi à étape 5) |
| professional_response_at, contact_made_at, validation_date | timestamptz | |
| rejection_reason | text | |
| expires_at | timestamptz DEFAULT now()+7j | |
| email_opened_at, email_clicked_at | timestamptz | tracking pixel/CTA [20260422_email_tracking.sql] |
| scraped_reminder_sent_at | timestamptz | relance 12h scraped [20260426_scraped_reminder.sql] |
| referrer_no_response_notified_at | timestamptz | alerte referrer 24h [20260426_referrer_no_response.sql] |
| transferred_at, transfer_reason | timestamptz / text | [20260429_transfer_recommendation.sql] |
| original_recommendation_id | uuid FK recommendations(id) | [20260429_transfer_recommendation.sql] |
| expected_completion_at | timestamptz | date fin travaux saisie étape 5 [20260501_recommendation_followups.sql] |
| abandoned_by_pro_at | timestamptz | fin cycle 3 relances sans réponse [20260501_recommendation_followups.sql] |
| is_demo | boolean DEFAULT false | [015_demo_network.sql] |
| created_at, updated_at | timestamptz | |

**Statuts valides** : PENDING, ACCEPTED, CONTACT_MADE, MEETING_SCHEDULED, QUOTE_SUBMITTED, QUOTE_VALIDATED, PAYMENT_RECEIVED, COMPLETED, REJECTED, TRANSFERRED, EXPIRED, CANCELLED (noté dans le code).

**Contrainte** : `referrer_id <> professional_id` [014_no_self_recommendation.sql] (exception : auto-reco "pour moi-même" contournée côté app).

RLS : SELECT/UPDATE pour referrer ou professional_id = auth.uid(). INSERT pour referrer_id = auth.uid().

---

### `recommendation_steps`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| recommendation_id | uuid FK recommendations(id) ON DELETE CASCADE | |
| step_id | uuid FK steps(id) | |
| completed_at | timestamptz | null = non complétée |
| data | jsonb DEFAULT '{}' | données de l'étape (ex: amount à étape 5) |
| created_at | timestamptz | |

UNIQUE `(recommendation_id, step_id)` [20260503_fix_recommendation_triggers.sql]. Création 100% applicative (suppression du trigger `init_recommendation_steps` corrigé dans cette même migration).

---

### `recommendation_followups`
[20260501_recommendation_followups.sql] — relances automatiques pro

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| recommendation_id | uuid FK NOT NULL | |
| after_step_order | smallint CHECK IN (2,4,5) | étape qui déclenche le cycle |
| cycle_index | smallint CHECK 1-3 | numéro de relance dans le cycle |
| scheduled_at | timestamptz NOT NULL | date d'envoi planifiée |
| status | text CHECK ('pending','sent','cancelled','superseded') | |
| sent_at | timestamptz | |
| report_count | smallint DEFAULT 0 | max 5 reports (reporter) |
| cancel_reason | text | |
| email_queue_id | uuid FK email_queue(id) | |
| created_at, updated_at | timestamptz | |

UNIQUE partiel : une seule ligne `pending` par `(recommendation_id, after_step_order)`.

RLS : SELECT pour le pro ET le referrer concernés, SELECT pour super_admin [20260501_recommendation_followups_rls.sql].

---

### `recommendation_annotations`
[20260415_recommendation_annotations.sql]

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| recommendation_id | uuid FK ON DELETE CASCADE | |
| recommendation_step_id | uuid FK ON DELETE CASCADE | optionnel |
| author_id | uuid FK profiles(id) | |
| content | text CHECK (1–1000 chars) | |
| created_at | timestamptz | |

RLS : super_admin only.

---

### `commission_transactions`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles(id) NOT NULL | bénéficiaire |
| recommendation_id | uuid FK (nullable) | null pour ajustements manuels |
| amount | numeric DEFAULT 0 NOT NULL | |
| level | integer | 0=referrer, 1-5=niveaux MLM |
| type | text CHECK (...) | voir enum |
| status | text DEFAULT 'PENDING' CHECK ('PENDING','EARNED','CANCELLED') | |
| referrer_id | uuid FK profiles(id) | referrer de la reco |
| notes | text | [011_fix_commissions_and_withdrawals.sql] |
| earned_at | timestamptz | |
| is_demo | boolean DEFAULT false | [015_demo_network.sql] |
| created_at | timestamptz | |

**Types valides** : recommendation, referral_level_1..5, affiliation_bonus, professional_cashback, manual_adjustment, platform_winelio.

UNIQUE : `(recommendation_id, type, level, user_id)` [007_atomic_withdrawal.sql].

RLS : SELECT only pour user_id = auth.uid() ou super_admin. Toute écriture via `supabaseAdmin` (lib/commission.ts). Trigger `on_commission_change` met à jour `user_wallet_summaries` [011_fix_commissions_and_withdrawals.sql]. RLS lockdown [20260504_lockdown_financial_rls.sql].

---

### `user_wallet_summaries`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid UNIQUE FK profiles(id) ON DELETE CASCADE | |
| total_earned | numeric DEFAULT 0 | |
| total_withdrawn | numeric DEFAULT 0 | |
| pending_commissions | numeric DEFAULT 0 | |
| available | numeric DEFAULT 0 CHECK (>= 0) | [013_security_fixes.sql] |
| total_wins | numeric DEFAULT 0 | |
| available_wins | numeric DEFAULT 0 | |
| redeemed_wins | numeric DEFAULT 0 | |
| created_at, updated_at | timestamptz | |

RLS : SELECT only pour user_id = auth.uid() ou super_admin. Aucune policy INSERT/UPDATE/DELETE côté client. Toutes mutations via trigger `on_commission_change` ou `supabaseAdmin` (lib/wallet.ts). [20260504_lockdown_financial_rls.sql]

---

### `withdrawals`

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles(id) NOT NULL | |
| amount | numeric NOT NULL | montant demandé (frais inclus) |
| fee_amount | numeric DEFAULT 0 | 0,25€ si < 50€, 0 sinon [20260417_withdrawal_fees.sql] |
| status | text DEFAULT 'PENDING' CHECK ('PENDING','PROCESSING','COMPLETED','REJECTED') | |
| method | text DEFAULT 'bank_transfer' | |
| bank_details | jsonb | IBAN et BIC chiffrés |
| rejection_reason | text | [012_withdrawals_missing_columns.sql] |
| processed_at | timestamptz | |
| created_at, updated_at | timestamptz | |

RLS : SELECT only pour user_id = auth.uid() ou super_admin. Création via RPC `winelio.process_withdrawal` (SECURITY DEFINER). [20260504_lockdown_financial_rls.sql]

---

### `stripe_payment_sessions`
[20260415_stripe_payment_sessions.sql]

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| recommendation_id | uuid FK ON DELETE CASCADE | |
| stripe_session_id | text UNIQUE NOT NULL | |
| amount | numeric(10,2) NOT NULL | |
| status | text DEFAULT 'pending' CHECK ('pending','paid','expired') | |
| reminder_sent_at, alert_sent_at, paid_at | timestamptz | |
| created_at | timestamptz | |

UNIQUE partiel : une seule session `pending` par `recommendation_id`. RLS : service_role only.

---

### `email_queue`
[20260415_email_queue.sql]

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| to_email, to_name, subject, html, text_body | text | |
| from_email | text DEFAULT 'support@winelio.app' | |
| from_name | text DEFAULT 'Winelio' | |
| reply_to | text | |
| priority | int CHECK (1-10) DEFAULT 5 | |
| status | text CHECK ('pending','sending','sent','failed','test_skipped') | test_skipped [20260503_email_queue_test_skipped.sql] |
| attempts, max_attempts | int DEFAULT 0/3 | |
| scheduled_at | timestamptz DEFAULT now() | |
| sent_at, error | timestamptz / text | |
| created_at | timestamptz | |

RLS : deny-all pour anon/authenticated (service_role only). Index partiel sur status='pending'.

---

### `bug_reports`
[20260410_bug_reports.sql + 20260420_bug_reports_board.sql]

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK auth.users(id) ON DELETE CASCADE | |
| message | text NOT NULL | |
| screenshot_url | text | URL bucket bug-screenshots |
| page_url | text | |
| status | text DEFAULT 'pending' CHECK ('pending','replied') | |
| admin_reply | text | |
| replied_at | timestamptz | |
| tracking_status | text DEFAULT 'todo' CHECK ('todo','in_progress','blocked','done') | |
| ticket_type | text DEFAULT 'bug' CHECK ('bug','improvement','site_change') | |
| priority | text DEFAULT 'medium' CHECK ('low','medium','high','urgent') | |
| internal_note | text | admin seulement |
| source | text DEFAULT 'user' CHECK ('user','manual') | [20260420_bug_reports_manual_source.sql] |
| in_progress_notified_at, done_notified_at | timestamptz | [20260420_bug_reports_status_notifications.sql] |
| updated_at | timestamptz | |
| created_at | timestamptz | |

RLS : SELECT/INSERT pour user_id = auth.uid(). UPDATE/SELECT admin via supabaseAdmin.
Realtime activé sur cette table.

---

### `legal_documents`, `document_sections`, `document_annotations`, `document_placeholder_values`
[20260415_legal_documents.sql]

`legal_documents` : id, title, version, status CHECK ('draft','reviewing','validated'), created_by, created_at, updated_at.
`document_sections` : id, document_id FK (CASCADE), order_index, article_number, title, content, created_at.
`document_annotations` : id, section_id FK (CASCADE), author_id FK, content, created_at, updated_at.
`document_placeholder_values` : id, document_id FK (CASCADE), placeholder_key, value, filled_by FK, filled_at. UNIQUE (document_id, placeholder_key).

RLS : super_admin ALL sur les 4 tables.

---

### `pro_onboarding_events`
[20260415_pro_onboarding_audit.sql]

id, user_id FK profiles, event_type CHECK ('cgu_accepted','engagement_accepted','siret_provided','category_set','pro_activated','signature_completed'), ip_address, user_agent, document_id FK, document_version, document_hash, metadata jsonb, created_at.

RLS : SELECT super_admin, INSERT deny-all (écriture via supabaseAdmin uniquement).

---

### `recommendation_annotations`
Voir section dédiée ci-dessus.

---

### `founder_rotation`
[20260417_founder_rotation.sql]

id INTEGER PK DEFAULT 1 CHECK (id=1) — table singleton. last_founder_id uuid FK profiles, updated_at.

---

### `deleted_sponsor_codes`
[006_deleted_accounts.sql]

sponsor_code TEXT PK, deleted_at TIMESTAMPTZ. RLS : SELECT public (validation unicité). Codes de comptes supprimés ne pouvant jamais être réattribués.

---

### `process_flow_annotations`
[20260423_process_flow_annotations.sql]

id, node_id text (ID du nœud organigramme), content text CHECK (1-1000), author_id FK auth.users ON DELETE CASCADE, created_at. RLS : super_admin ALL.

---

### `devices`
[002_initial_schema.sql]

id, user_id FK profiles (ON DELETE CASCADE), token text, platform DEFAULT 'web', is_active boolean DEFAULT true, created_at. RLS : ALL pour user_id = auth.uid().

---

### `audit_logs`
[002_initial_schema.sql]

id, user_id uuid, action text NOT NULL, entity_type, entity_id uuid, old_value/new_value jsonb, ip_address, success boolean DEFAULT true, error_message, created_at. RLS : activée, pas de policies visibles → accès service_role only.

---

## Table hors schéma `winelio`

### `public.otp_codes`
[001_otp_codes.sql]

email TEXT PK, code TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, attempts INT DEFAULT 0 [013_security_fixes.sql], created_at. RLS activée, service_role only. Pas de policy → deny-all anon/authenticated. Utilisée par `/api/auth/send-code` et `/api/auth/verify-code` via `supabaseAdmin`.

### `public.registration_rotation_state`
[009_open_registration_rotation.sql, 010_founder_flag.sql]

name TEXT PK, next_index INTEGER DEFAULT 0, created_at, updated_at. État du round-robin pour l'assignation des fondateurs. Utilisée par `public.get_next_open_registration_sponsor()`.

---

## Vues `winelio.*` (admin, filtrage E2E)
[20260504_admin_real_views.sql]

6 vues qui excluent les comptes `@winelio-e2e.local` :
- `profiles_real`, `recommendations_real`, `commissions_real`, `withdrawals_real`, `wallet_summaries_real`, `companies_real`

Helper : `winelio.is_e2e_email(addr text) RETURNS boolean IMMUTABLE`.

Ces vues sont utilisées par les pages `/gestion-reseau/` pour les KPI super_admin.

---

## Triggers notables

| Trigger | Table | Fonction | Description |
|---|---|---|---|
| `on_auth_user_created` | auth.users | `winelio.handle_new_user()` | Crée profil + wallet à l'inscription. Filtre sur `raw_user_meta_data->>'app' = 'winelio'` [20260501_app_marker.sql] |
| `on_commission_change` | commission_transactions | `winelio.update_wallet_on_commission()` | Met à jour user_wallet_summaries sur INSERT/UPDATE commission [011_fix_commissions_and_withdrawals.sql] |
| `trg_recommendation_step_followup` | recommendation_steps | `winelio.handle_recommendation_step_completion()` | Insère auto un followup à la complétion d'étape 2/4/5 ; cancelle les pending si étape suivante déjà faite. SECURITY DEFINER [20260503_fix_recommendation_triggers.sql] |
| `update_*_updated_at` | profiles, companies, contacts, recommendations, withdrawals, etc. | `winelio.update_updated_at_column()` | MAJ automatique du champ updated_at |

---

## RPC functions notables

| Fonction | Schéma | Description |
|---|---|---|
| `generate_unique_sponsor_code()` | winelio | Génère 8 chars A-Z0-9, retry anti-collision contre profiles + deleted_sponsor_codes [20260415_sponsor_code_8chars.sql] |
| `get_network_ids(user_id, max_depth)` | winelio | CTE récursive renvoyant tous les membres du réseau jusqu'à depth=5 [008_mlm_network_rpc.sql] |
| `process_withdrawal(user_id, amount, method, details, fee)` | winelio | Retrait atomique avec lock FOR UPDATE, SECURITY DEFINER [20260417_withdrawal_fees.sql] |
| `handle_new_user()` | winelio | Trigger fonction pour on_auth_user_created [20260501_app_marker.sql] |
| `seed_demo_network(user_id)` | winelio | Génère réseau MLM 4-5 niveaux fictif (guard idempotent) [015_demo_network.sql] |
| `purge_demo_network(user_id)` | winelio | Supprime le réseau demo + recalcule wallet [015_demo_network.sql] |
| `get_global_highlights()` | public | Retourne top sponsor semaine, top reco jour, grosse commission >100€ [003_global_highlights_fn.sql] |
| `get_next_open_registration_sponsor(exclude_id)` | public | Round-robin sur les fondateurs (is_founder=true) [010_founder_flag.sql] |

---

## Buckets Supabase Storage

| Bucket | Accès | Notes |
|---|---|---|
| `profile-avatars` | public | Photos de profil. RLS fine : insert/update/delete owner, select owner + super_admin [20260420_profile_avatars.sql] |
| `legal-signatures` | privé | PDF CGU signés. SELECT owner ou super_admin [20260415_is_hoguet_and_storage.sql + 20260415_legal_signatures_private.sql] |
| `bug-screenshots` | privé | Captures bugs. INSERT owner (par chemin uid) [20260410_bug_reports.sql] |

Note : les avatars publics passent aussi par Cloudflare R2 (lib/r2-avatars.ts) — `profile-avatars` bucket Supabase reste le fallback.

---

## Migrations notables

| Fichier | Ce qu'il fait |
|---|---|
| `002_initial_schema.sql` | Schéma initial legacy (cloud, schéma `public`) — contexte historique uniquement |
| `006_deleted_accounts.sql` | Table deleted_sponsor_codes (schéma winelio) |
| `007_atomic_withdrawal.sql` | RPC process_withdrawal + contrainte UNIQUE commissions |
| `008_mlm_network_rpc.sql` | RPC get_network_ids (CTE récursive) |
| `011_fix_commissions_and_withdrawals.sql` | Trigger wallet, fix colonnes withdrawals, manual_adjustment |
| `20260414_cagnotte_winelio.sql` | UUID système `00000000-...0001`, type platform_winelio |
| `20260427_restructure_steps.sql` | Fusionné étape 6+7, renumérote → 7 étapes finales |
| `20260503_fix_recommendation_triggers.sql` | Supprime trigger init_recommendation_steps (bug doublons), fixe SECURITY DEFINER sur followups |
| `20260504_lockdown_financial_rls.sql` | Lockdown RLS : wallet/commissions/withdrawals en lecture seule côté client |
| `20260504_admin_real_views.sql` | Vues _real pour KPI admin (filtre E2E) |
| `20260501_app_marker.sql` | Filtre `raw_user_meta_data->>'app'='winelio'` dans handle_new_user (instance Supabase partagée) |