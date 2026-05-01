# Winelio / Winelio - Instructions pour Claude Code

## Projet
Winelio (nom de marque) / Winelio (nom technique du repo) est une plateforme de recommandations professionnelles avec système MLM (réseau de parrainage à 5 niveaux). Migration depuis React Native + FastAPI vers Next.js + Supabase.

## Stack technique
- **Frontend** : Next.js 15 (App Router, Server Components, React 19)
- **Styling** : Tailwind CSS v4 avec @theme (couleurs dans src/app/globals.css)
- **Auth** : Supabase Auth (code OTP à 6 chiffres envoyé par email SMTP o2switch)
- **Base de données** : PostgreSQL via Supabase (self-hosted VPS)
- **Paiements** : Stripe (SetupIntent + webhooks pour les commissions pro)
- **Stockage** : Cloudflare R2 (logos, avatars) + Supabase Storage (PDF signés)
- **Déploiement** : Coolify sur VPS Hostinger (31.97.152.195)
- **Repo** : https://github.com/stephmadfx/winelio-app.git
- **Branche production** : `main` → déployée sur https://winelio.app (app Coolify UUID `e13u8cq02wlio12lfj7a165h`)
- **Branche staging** : `dev2` → déployée sur https://dev2.winelio.app (app Coolify UUID `eo5jc02jc760apovne577bln`)
- **Workflow** : développer sur `dev2`, puis `git push origin dev2:main --force` pour mettre en production

## Couleurs Winelio
- Orange : #FF6B35 (`winelio-orange`)
- Amber : #F7931E (`winelio-amber`)
- Dark : #2D3436 (`winelio-dark`)
- Gray : #636E72 (`winelio-gray`)
- Light : #F8F9FA (`winelio-light`)

## Architecture des dossiers
```
src/
├── app/
│   ├── (protected)/                  # Routes authentifiées (sidebar + nav mobile)
│   │   ├── layout.tsx                # Sidebar + DemoBanner + BetaBanner + AppBackground
│   │   ├── dashboard/                # Tableau de bord
│   │   ├── profile/                  # Profil utilisateur (avatar, infos perso)
│   │   ├── companies/                # Gestion entreprises (liste + /new)
│   │   ├── recommendations/          # Workflow 7 étapes (liste, /new, /[id])
│   │   ├── network/                  # Réseau MLM (arbre 5 niveaux) + /stats
│   │   ├── wallet/                   # Wallet EUR + Wins + retraits
│   │   ├── settings/                 # Paramètres (thème clair/sombre, RGPD)
│   │   ├── gestion-reseau/scraping/  # (protected) scraping CSV admin
│   │   └── test-recommendation/      # Page de test interne
│   ├── gestion-reseau/               # Super admin (role super_admin requis)
│   │   ├── layout.tsx                # AdminLayoutShell (sidebar collapsible)
│   │   ├── page.tsx                  # Dashboard admin + KPI + charts
│   │   ├── recommandations/          # Liste + détail recommandations + annotations
│   │   ├── retraits/                 # Gestion des demandes de retrait
│   │   ├── utilisateurs/             # Liste + fiche utilisateurs
│   │   ├── professionnels/           # Liste professionnels (SIRET, onboarding audit)
│   │   ├── reseau/                   # Arbre MLM global
│   │   ├── bugs/                     # Tracker de bugs (board Kanban)
│   │   ├── documents/                # Viewer documents (CGU signées, PDF)
│   │   └── actions.ts                # Server actions admin
│   ├── claim/[recommendationId]/     # Page de claim publique (pro pas encore inscrit)
│   ├── conditions-generales-utilisation/ # CGU publiques
│   ├── staging-login/                # Auth basique pour dev2.winelio.app
│   ├── auth/
│   │   ├── login/                    # Page login (OTP 6 chiffres)
│   │   ├── verify/                   # Saisie du code OTP
│   │   └── callback/                 # Callback session (legacy PKCE)
│   ├── api/
│   │   ├── auth/                     # send-code, verify-code, login-password,
│   │   │                             # set-password, sign-out, whoami, assign-sponsor, callback
│   │   ├── recommendations/          # create, list, [id], complete-step
│   │   ├── network/                  # send-invite, new-referral, children,
│   │   │                             # user-events, assign-open-registration-sponsor
│   │   ├── claim/finalize/           # Finalisation claim pro depuis email reco
│   │   ├── admin/scraping/           # Import CSV entreprises scrapées
│   │   ├── wallet/withdraw/          # Demande de retrait
│   │   ├── stripe/                   # webhook, setup-intent, payment-method, cron-reminders
│   │   ├── email/                    # process-queue, welcome
│   │   ├── email-template/           # Route unique (GET template paramétré)
│   │   ├── email-track/              # click, open (tracking pixel + redirect)
│   │   ├── bugs/                     # report, imap-poll, imap-debug
│   │   ├── profile/                  # avatar, payment-method-status
│   │   ├── account/delete/           # Suppression RGPD
│   │   ├── demo/                     # seed-network, status
│   │   ├── video/promo/              # Stream vidéo promo
│   │   └── staging-auth/             # Auth basique staging
│   └── page.tsx                      # Landing page
├── components/
│   ├── ui/                           # shadcn (button, card, dialog, sheet, chart)
│   ├── admin/                        # AdminLayoutShell, AdminSidebar, BugTrackerBoard,
│   │                                 # DashboardCharts, NetworkTree, AnnotationPanel,
│   │                                 # ProOnboardingAuditTimeline, RecoJourneyView,
│   │                                 # DocumentViewer, PlaceholderEditor, ProfessionnelsTable
│   ├── bug-report/                   # Dialog de signalement de bug (reply, history, lightbox)
│   ├── ProOnboardingWizard.tsx       # Parcours onboarding pro (SIRET, CGU, paiement)
│   ├── SignatureModal.tsx            # Modal de signature CGU
│   ├── SignaturePad.tsx              # Canvas signature
│   ├── save-payment-method-dialog.tsx # Stripe Elements (SetupIntent)
│   ├── onboarding-modal.tsx          # Onboarding user standard
│   ├── profile-incomplete-modal.tsx  # Rappel profil incomplet
│   ├── network-graph.tsx / tree.tsx  # Visualisation MLM (react-d3-tree, xyflow)
│   ├── network-feed.tsx              # Feed d'événements réseau
│   ├── step-timeline.tsx             # Timeline workflow 7 étapes
│   ├── PromoVideo.tsx                # Player vidéo landing
│   ├── BetaBanner.tsx                # Bandeau bêta
│   ├── DemoSeedBanner.tsx            # Bandeau mode démo
│   ├── referral-buttons.tsx          # Copier / Inviter / Partager (QR + email)
│   └── [utils composants app : sidebar, mobile-nav, mobile-header, wallet-card, ...]
├── lib/
│   ├── supabase/                     # config, client, server, admin, get-user
│   ├── commission.ts                 # Calcul commissions MLM (5 niveaux + spillover)
│   ├── wallet.ts                     # Helpers wallet + computation
│   ├── assign-sponsor.ts             # Logique d'assignation sponsor (rotation fondateur)
│   ├── stripe.ts + stripe-checkout.ts # Config Stripe + helpers
│   ├── email-queue.ts                # Enqueue + process email_queue
│   ├── email-transporter.ts          # Nodemailer SMTP wrapper
│   ├── email-logo.ts                 # Constante LOGO_IMG_HTML (img R2)
│   ├── notify-*.ts                   # Notifications métier (bug, commission, onboarding,
│   │                                 # new-recommendation, new-referral, signature-cgu, siret)
│   ├── generate-signed-pdf.ts        # Génération PDF CGU signé (puppeteer)
│   ├── r2.ts                         # Upload Cloudflare R2 (S3 SDK)
│   ├── profile-avatar.ts             # Helpers avatar (Supabase Storage)
│   ├── company-actions.ts + display.ts # Actions + affichage entreprises
│   ├── generate-alias.ts             # Alias auto pour companies scrapées
│   ├── siren.ts + geocode.ts         # API SIRENE + géocodage adresse
│   ├── age.ts                        # Calcul âge depuis birth_date
│   ├── audit.ts                      # Insertion audit_logs
│   ├── feed-utils.ts                 # Formatage feed réseau
│   ├── html-escape.ts                # Escape HTML pour emails
│   └── constants.ts + utils.ts       # Constantes + helpers génériques
└── middleware.ts                      # Protection routes + redirections
```

## Supabase self-hosted (VPS)
- **URL publique** : https://supabase.aide-multimedia.fr (frontend + dev local via tunnel SSH)
- **URL interne Docker** : http://supabase-kong:8000 (utilisée côté serveur en production)
- **Studio admin** : http://31.97.152.195:54323
- **Container DB** : `supabase-db-ixlhs1fg5t2n8c4zsgvnys0r`
- **Schéma** : `winelio` (toutes les tables applicatives)
- **Accès direct DB** : `docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres`

### Appliquer une migration
```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/XXX.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/XXX.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/XXX.sql"
```

### Variables d'environnement (dans Coolify, PAS dans le code)
**Supabase**
- `NEXT_PUBLIC_SUPABASE_URL` — https://supabase.aide-multimedia.fr
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clé publique anon
- `SUPABASE_SERVICE_ROLE_KEY` — Clé admin (server-side uniquement)

**App**
- `NEXT_PUBLIC_APP_URL` — URL publique de l'app (pour les liens d'invitation et de claim)
- `NEXT_PUBLIC_DEMO_MODE` — `"true"` pour afficher le bandeau démo
- `STAGING_AUTH_PASSWORD` — Mot de passe basique pour dev2.winelio.app

**Email (SMTP o2switch)**
- `SMTP_HOST`, `SMTP_PORT` (465 SSL), `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME`
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS` — Polling réponses support

**Stripe**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Cloudflare R2**
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`, `R2_PUBLIC_URL`

### Rôle super_admin
Stocké dans `auth.users.app_metadata.role` (JWT). Jamais dans `profiles`.
Pour attribuer : `PUT /auth/v1/admin/users/{id}` avec `{"app_metadata": {"role": "super_admin"}}`

### Schéma des tables — IMPORTANT
**Les tables Winelio sont TOUTES dans le schéma `winelio`** (pas le schéma `public` par défaut). Toujours utiliser `.schema("winelio")` dans les requêtes Supabase.
```typescript
// ✅ CORRECT — utilise le schéma winelio
await supabase.schema("winelio").from("recommendations").insert(...)

// ❌ FAUX — cherche dans le schéma public qui ne contient pas les tables Winelio
await supabase.from("recommendations").insert(...)
```

### Tables de la base de données
| Table | Description |
|-------|-------------|
| profiles | Extends auth.users (nom, phone, sponsor_code, sponsor_id, is_professional, avatar_url, birth_date, terms_accepted, terms_accepted_at) |
| categories | Catégories de services (plomberie, électricité…) + flag `is_hoguet` (immo) |
| companies | Entreprises des pros (siret, siren, vat_number, is_verified, alias, `source` ∈ {owner, scraped}, deleted_at) |
| contacts | Prospects pour les recommandations (nom, email, phone, address, postal_code) |
| compensation_plans | Plans de commission (taux, pourcentages par niveau) |
| steps | 7 étapes du workflow de recommandation |
| recommendations | Recommandations (referrer → professional, statut, montant, email_opened_at, email_clicked_at, expected_completion_at, abandoned_by_pro_at) |
| recommendation_followups | Suivi des relances pro après acceptation (cycle 3 relances par étape, max 5 reports) |
| recommendation_steps | Junction table (étape complétée, données associées) |
| recommendation_annotations | Notes admin sur une reco ou une étape |
| commission_transactions | Commissions (type, level, montant, statut PENDING/EARNED) |
| user_wallet_summaries | Cache dénormalisé du wallet (EUR + Wins) |
| withdrawals | Demandes de retrait (+ `fee_amount` frais SEPA Stripe) |
| stripe_payment_sessions | Suivi paiements Stripe commission pro (pending/paid/expired) |
| email_queue | File d'attente pour envois SMTP asynchrones |
| bug_reports | Tracker de bugs (board Kanban admin, sources manual/imap/ui) |
| legal_documents | Versions CGU/CGV publiées (markdown + PDF généré) |
| legal_signatures | Signatures utilisateur (pad canvas + PDF stocké bucket privé) |
| pro_onboarding_events | Audit trail onboarding professionnel |
| founder_rotation | État round-robin assignation fondateur (inscrits sans code parrain) |
| devices | Tokens push notification |
| audit_logs | Journal d'audit |
| deleted_sponsor_codes | Codes parrain de comptes supprimés (jamais réutilisables) |
| otp_codes | Codes OTP 6 chiffres (table hors schéma winelio) |

### Triggers Supabase
- `on_auth_user_created` : auto-crée le profil + wallet summary à l'inscription
- `update_*_updated_at` : met à jour le champ updated_at automatiquement
- Trigger commissions : création auto des `commission_transactions` quand l'étape 6 passe à `completed`
- `trg_recommendation_step_followup` : insertion auto dans `recommendation_followups` à la complétion d'une étape 2/4/5 ; cancelle les relances pending si l'étape suivante est déjà complétée

### Storage Supabase
- `avatars` (public) : photos de profil utilisateur
- `legal-signatures` (privé) : PDF CGU signés — lecture restreinte à l'owner + super_admin

### RLS (Row Level Security)
Toutes les tables ont des politiques RLS actives. Les utilisateurs ne voient que leurs propres données (sauf `profiles` et `categories` publics en lecture). Les routes serveur sensibles utilisent `supabaseAdmin` pour bypasser RLS quand nécessaire.

## Logique métier

### Auth (OTP 6 chiffres par email)
1. User entre son email sur `/auth/login` → `POST /api/auth/send-code`
2. Code 6 chiffres généré, stocké dans `otp_codes` (avec expires_at + attempts), envoyé par SMTP
3. User entre le code sur `/auth/verify` → `POST /api/auth/verify-code`
4. Vérification (brute-force protection via compteur `attempts`) → création session via `supabaseAdmin.auth.admin.generateLink()` → cookies → redirect `/dashboard`
5. Routes alternatives : `login-password` / `set-password` (flux mot de passe)

### Inscription obligatoire par parrainage (2 chemins)
**Règle absolue** : impossible de s'inscrire sans sponsor assigné. C'est une règle métier fondamentale du MLM. Ne jamais la retirer ni la contourner.

Chemins valides :
- **Code parrain explicite** (lien `/?ref=CODE` ou saisie manuelle)
- **Inscription "libre"** (sans code) → assignation automatique à un fondateur via `founder_rotation` (round-robin séquentiel, voir `lib/assign-sponsor.ts`)
- **Claim depuis une reco** : un pro inconnu reçoit une reco par email et finalise son inscription via `/claim/[recommendationId]` → `POST /api/claim/finalize`

### Sponsor codes
- Format : **8 caractères alphanumériques** (A-Z + 0-9) — plus 6 hex
- Génération : `winelio.generate_unique_sponsor_code()` avec retry anti-collision
- Unicité garantie via table `deleted_sponsor_codes` (pas de réutilisation après suppression)

### Workflow de recommandation (7 étapes)
1. Recommandation reçue (auto)
2. Acceptée par le professionnel
3. Contact établi
4. Rendez-vous fixé
5. Devis soumis (avec montant)
6. **Travaux + paiement** → déclenche la création des commissions (PENDING → EARNED)
7. Affaire terminée

**Anonymat pro** : l'identité du pro reste masquée côté referrer jusqu'à l'acceptation de la reco (étape 2).

**Tracking email** : `email_opened_at` (pixel) et `email_clicked_at` (redirect) sur la recommandation, enregistrés seulement à la première interaction.

Schéma textuel du workflow avec relances :

```
Étape 1 : Recommandation reçue
   │
   ▼
Étape 2 : Acceptée par le pro ─────────────► [Relance auto T+24h, cycle 3×]
   │                                         ✅ C'est fait → étape 3
   ▼                                         📅 Reporter (max 5)
Étape 3 : Contact établi                     ❌ Abandon → reco refusée
   │
   ▼
Étape 4 : Rendez-vous fixé ────────────────► [Relance auto T+72h, cycle 3×]
   │
   ▼
Étape 5 : Devis soumis ────────────────────► [Relance auto à expected_completion_at, cycle 3×]
   │  (champ obligatoire : délai estimé)
   ▼
Étape 6 : Travaux + paiement (déclenche commissions MLM)
   │
   ▼
Étape 7 : Affaire terminée
```

### Relances automatiques pro (depuis 2026-05)
Système de relances email automatiques au pro après acceptation, pour pousser
l'avancement du workflow.

**Cycle** : 3 relances espacées (1ère / +48h / +5j) par étape déclenchée. Les
étapes qui déclenchent un cycle sont 2, 4 et 5.

**Délais de la 1ère relance** :
- Étape 2 (Acceptée) → 24h après complétion
- Étape 4 (RDV fixé) → 72h après complétion
- Étape 5 (Devis soumis) → date `expected_completion_at` saisie obligatoirement par le pro

**Actions email** (token HMAC signé, pas de session requise) :
- ✅ "C'est fait" → complète l'étape suivante (`POST /api/recommendations/followup-action?action=done`)
- 📅 "Reporter" → page publique `/recommendations/followup/[token]/postpone` (max 5 reports par étape)
- ❌ "Je ne peux pas donner suite" → page publique `/recommendations/followup/[token]/abandon`

**Fin de cycle** : si le pro ne répond pas après 3 relances, `recommendations.abandoned_by_pro_at`
est posé et le referrer reçoit un email "soft" l'invitant à reprendre la main. La reco reste
assignée au pro (badge "Abandonnée par le pro" côté referrer).

**Architecture** :
- Table `winelio.recommendation_followups` (état explicite du cycle)
- Trigger SQL `trg_recommendation_step_followup` : insertion auto à la complétion d'une étape 2/4/5
- Cron worker `POST /api/recommendations/process-followups` (à déclencher toutes les 15 min, auth `Bearer CRON_SECRET`)
- Module HMAC `src/lib/followup-token.ts` (env var `FOLLOWUP_ACTION_SECRET`, min 32 chars)

**Cron à enregistrer côté infra** :
```
*/15 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
              https://winelio.app/api/recommendations/process-followups > /dev/null 2>&1
```

### Système MLM (5 niveaux)
- Chaque user a un `sponsor_code` unique (8 chars)
- `sponsor_id` pointe vers le parrain
- Quand une reco atteint l'étape 6 (travaux + paiement) :
  - Referrer reçoit 60% de la commission (`recommendation`)
  - Niveau 1 (sponsor du referrer) : 4% (`referral_level_1`)
  - Niveau 2-5 : 4% chacun (`referral_level_2` … `referral_level_5`)
  - Affiliation bonus (sponsor du pro) : 1% (`affiliation_bonus`)
  - Cashback pro (en Wins) : 1% (`professional_cashback`)
  - Cagnotte Winelio : 14% (`platform_winelio`) → toujours distribuée, même en mode démo

### Cagnotte Winelio
- **UUID système fixe** : `00000000-0000-0000-0000-000000000001` (`WINELIO_SYSTEM_USER_ID`)
- Profil système : email `system@winelio.app`, prénom `Cagnotte`, nom `Winelio`
- Toutes les commissions non distribuables (chaîne MLM trop courte, pas de sponsor pro) sont automatiquement redirigées vers cette cagnotte (règle du spillover)
- Visible uniquement dans le dashboard super admin (`/gestion-reseau`) — jamais côté utilisateur
- Les KPI "commissions distribuées" et "en attente" excluent `platform_winelio` (`.neq("type", "platform_winelio")`)
- Migrations : `supabase/migrations/20260414_cagnotte_winelio.sql` + `20260414_backfill_platform_winelio.sql`

### Règle spillover MLM
Quand la chaîne de parrainage est plus courte que 5 niveaux (ou que le sponsor du professionnel est absent) :
- Les montants non attribuables s'accumulent dans `undistributed`
- Après la boucle, `undistributed` est ajouté à l'entrée `platform_winelio` existante
- Optimisation : flag `chainBroken` pour éviter les requêtes DB redondantes une fois la chaîne rompue

### Auto-recommandation ("Pour moi-même")
Un user peut se recommander un pro pour lui-même :
- Contact auto-créé depuis son profil
- Il touche ses 60% (`recommendation`) normalement
- Sa propre fiche pro (s'il en a une) est exclue du sélecteur de pro

### Wallet
- **EUR** : total_earned, total_withdrawn, pending_commissions, available
- **Wins** : total_wins, available_wins, redeemed_wins (monnaie interne)
- **Retraits** : fee_amount = 0,25 € si montant < 50 €, gratuit sinon (frais SEPA Stripe)

### Companies owner vs scraped
- `source = 'owner'` : entreprise créée via le formulaire par le pro lui-même (il connaît Winelio)
- `source = 'scraped'` : entreprise injectée par campagne d'acquisition (CSV via `/api/admin/scraping`). Le pro ne connaît pas Winelio jusqu'à son claim.
- Différenciation visuelle admin + emails de notification distincts (owner vs scraped)
- Placeholder email connu → company marquée scraped

### Bug tracker
- Board Kanban admin sur `/gestion-reseau/bugs`
- 3 sources : `ui` (bouton BugReportButton), `imap` (polling support@winelio.app), `manual` (création admin)
- Notifications email automatiques sur changement de statut
- Cron IMAP via `/api/bugs/imap-poll` (à déclencher par cron externe)

### CGU et signatures légales
- `legal_documents` : versions CGU publiées (markdown)
- `SignaturePad` (canvas) capture la signature → PDF généré avec puppeteer (`generate-signed-pdf.ts`) → bucket privé `legal-signatures`
- Signature demandée lors de l'onboarding pro (wizard) + à la complétion de profil standard
- `profiles.terms_accepted` + `terms_accepted_at` = acceptation CGU globale

### Email queue (envoi asynchrone)
- Table `email_queue` : enqueue depuis les routes (pas d'envoi SMTP bloquant)
- `/api/email/process-queue` : worker qui dépile et envoie (à déclencher par cron)
- Évite les timeouts Next.js sur les emails batch

## VPS Hostinger
- **IP** : 31.97.152.195
- **SSH** : root / 04660466aA@@@
- **Coolify** : http://31.97.152.195:8000 (contact@aide-multimedia.fr / 04660466aA@@@)
- **SMTP** : ssl0.ovh.net port **465 SSL** (support@winelio.app) — guillemets obligatoires si le mot de passe contient `#`

## Serveur de développement local
- Port : **3002** fixe (`http://localhost:3002`) — défini via `--port 3002` dans `package.json`.
- **Le serveur dev est géré par PM2** — ne pas utiliser `pkill -f "next dev"` directement.
- Commandes PM2 :
  ```bash
  pm2 list                        # voir tous les process
  pm2 stop winelio winelio-dev    # arrêter
  pm2 start winelio               # redémarrer
  pm2 logs winelio --lines 50     # voir les logs
  ```
- Vérifier que le serveur tourne bien avant de tester dans le navigateur.

## Commandes utiles
```bash
# Build local
npm run build

# Serveur dev (port 3002, géré par PM2)
pm2 restart winelio

# Accéder à la DB Supabase (production sur VPS)
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres"
```

## Code source de l'ancien développeur
Décompressé dans `/Users/steph/PROJETS/WINKO/_old_app/` (frontend React Native) et `/Users/steph/PROJETS/WINKO/_old_backend/` (backend FastAPI + backoffice Nuxt). À utiliser comme référence pour la logique métier.

## Documentation Architecture

> Régénérée le 2026-04-09 par analyse froide des fichiers source.

Fichiers de référence dans `/doc/` :
- `@doc/architecture.md` — Arbre relationnel complet (CORE/FEATURE/SUB/HOOK/UTILITY + verbes de relation [UTILISE/DÉCLENCHE/DÉPEND DE/PERSISTE DANS])
- `@doc/database.md` — Schéma complet des tables, colonnes, contraintes, triggers, RPC et migrations
- `@doc/api-routes.md` — Tous les endpoints API (méthode, accès, body, logique), Server Actions et routes pages

## Règles

### Général
- Ne jamais commiter de credentials dans le code (utiliser les env vars Coolify)
- Les `NEXT_PUBLIC_*` doivent être des "Build Variables" dans Coolify
- Le config.ts applique `.replace(/\s/g, "")` pour nettoyer les espaces parasites des env vars
- Toujours tester le build (`npm run build`) avant de push
- Ne jamais pousser automatiquement — attendre une instruction explicite de Steph
- Les operations financieres (retraits, paiements Stripe) passent par une API Route serveur (`/api/wallet/withdraw`, `/api/stripe/*`)
- Les headers de securite sont configures dans `next.config.ts`
- **Après chaque `git push`, PM2 recompile automatiquement** — vérifier avec `pm2 logs winelio`

### Tailwind CSS v4 — IMPORTANT
- **Ne jamais construire des classes dynamiques partielles** : Tailwind JIT scanne statiquement le code.
  - ❌ `md:${collapsed ? "ml-16" : "ml-64"}` — la classe n'est PAS détectée
  - ✅ `${collapsed ? "md:ml-16" : "md:ml-64"}` — les deux classes complètes sont détectées
- Toujours écrire les classes Tailwind en entier dans le code source.

### shadcn/ui
- Les composants générés par `npx shadcn@latest add` dans `src/components/ui/` doivent toujours être commités.
- Ne pas oublier de commiter les nouveaux fichiers `ui/*.tsx` après installation.

### Logo Winelio dans le code
- **Dans l'app** (sidebar, header, pages) → utiliser `<WinelioLogo>` depuis `src/components/winelio-logo.tsx`
  - Variantes : `color` (fond clair), `white` (tout blanc), `on-dark` (W gradient + inelio blanc, fond sombre)
  - Ex: `<WinelioLogo variant="on-dark" height={38} />`
- **Dans les emails HTML** → utiliser `<img>` avec les URLs R2 publiques :
  - Fond clair : `https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png`
  - Fond sombre : `https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-on-dark.png`
  - Toujours `width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;"`
  - Constante `LOGO_IMG_HTML` disponible dans `src/lib/email-logo.ts`

### Templates email — Charte visuelle obligatoire
Tout nouvel email doit respecter cette structure :

```
fond outer #F0F2F4
  └─ container 520px
       ├─ barre accent 4px : linear-gradient(90deg,#FF6B35,#F7931E), border-radius 4px 4px 0 0
       ├─ carte blanche border-radius 0 0 16px 16px, padding 40px 48px 36px
       │    ├─ logo R2 (img centré, width=160, height=44) + séparateur #F0F2F4
       │    └─ contenu spécifique
       └─ footer : © 2026 Winelio (#B2BAC0) + tagline orange #FF6B35
```

**Règles techniques email :**
- 100% `<table>/<tr>/<td>` — aucun `<div>` dans le corps
- Pas de `margin-top`/`margin-bottom` sur `<td>` → utiliser des rangées spacer ou `padding`
- Rangée spacer : `<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>`
- Icônes emoji : `<td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;">`
- Boutons CTA via table : `<table><tr><td><a style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);...">Texte →</a></td></tr></table>`
- Blocs accent : fond `#FFF5F0`, bordure gauche `3px solid #FF6B35`

Templates de référence : `src/app/api/auth/send-code/route.ts` (le plus complet)
