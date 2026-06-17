# Winelio — Architecture modules

> Régénéré le 2026-05-07 depuis les fichiers source.
> Stack : Next.js 15 App Router · React 19 · Tailwind v4 · Supabase (schéma `winelio`) · Stripe · Cloudflare R2

---

## Arbre des modules

```
[CORE] Config & Infrastructure
├── src/lib/supabase/config.ts          — SUPABASE_URL / ANON_KEY (nettoyage espaces)
├── src/lib/supabase/admin.ts           — supabaseAdmin (service role, schema winelio)
├── src/lib/supabase/server.ts          — createClient() côté serveur (SSR cookies)
├── src/lib/supabase/client.ts          — createBrowserClient() côté client
├── src/lib/supabase/get-user.ts        — getUser() helper serveur
├── src/lib/constants.ts                — RECOMMENDATION_STATUS, COMMISSION_TYPE, etc.
├── src/lib/utils.ts                    — cn() et helpers génériques
├── src/instrumentation.ts              — Sentry init (prod+dev2) [DÉCLENCHE] → monitoring
└── src/middleware.ts                   — Rate-limit IP (60/min/IP) + protection routes + redirection auth
                                          [DÉPEND DE] → supabase/config
                                          Exemptions : cron, claim, conditions, followup, staging-login

[CORE] Auth
└── [FEATURE] Auth Flow [PERSISTE DANS] → public.otp_codes, auth.users, winelio.profiles
    ├── src/app/auth/login/             — Saisie email (OTP) ou password
    ├── src/app/auth/verify/            — Saisie code OTP 6 chiffres
    ├── src/app/auth/callback/          — Callback PKCE legacy
    ├── /api/auth/send-code             — Rate-limit 5/h/IP ; génère OTP, envoie SMTP inline
    │   [DÉCLENCHE] → envoi email SMTP direct (pas via queue), stockage otp_codes
    ├── /api/auth/verify-code           — Vérifie OTP (brute-force: max 5 attempts), crée session
    │   [UTILISE] → Pool pg direct (SUPABASE_DB_URL) [DÉCLENCHE] → assignSponsorIfNeeded
    ├── /api/auth/login-password        — Login email+password via GoTrue
    ├── /api/auth/reset-password        — Reset mdp via OTP (vérifie OTP puis update via admin API)
    ├── /api/auth/set-password          — Définit mdp pour user connecté (via admin API)
    ├── /api/auth/sign-out              — Invalide session + efface cookies
    ├── /api/auth/whoami                — GET : retourne id+email de la session courante
    ├── /api/auth/assign-sponsor        — POST : assignSponsorIfNeeded(code|null)
    ├── /api/auth/callback              — Callback PKCE (legacy)
    └── /api/admin/auth-health          — Diagnostic fantômes profils/sessions manquantes (public, SMTP alert)

[CORE] Sponsor & Inscription MLM
└── [SUB] Assignation sponsor [PERSISTE DANS] → winelio.profiles.sponsor_id
    ├── src/lib/assign-sponsor.ts       — assignSponsorIfNeeded(userId, code?)
    │   Si code fourni → cherche profil avec ce sponsor_code
    │   Sinon → appelle get_next_open_registration_sponsor() (round-robin fondateurs)
    │   [UTILISE] → supabaseAdmin, winelio.founder_rotation
    └── /api/network/assign-open-registration-sponsor — Assigne si pas de parrain


[FEATURE] Recommendations (workflow 7 étapes)
├── src/app/(protected)/recommendations/
│   ├── new/                            — Formulaire création (7 sous-composants)
│   │   ├── StepContact.tsx             — Sélection/création contact
│   │   ├── StepProfessional.tsx        — Sélection pro (avec anonymat)
│   │   ├── StepProject.tsx             — Description + urgence
│   │   ├── StepProgress.tsx            — Barre de progression
│   │   ├── ProfessionalList.tsx        — Liste pros filtrée par catégorie/géo
│   │   └── GeoStatusBanner.tsx         — Banner géolocalisation
│   ├── [id]/                           — Détail + timeline
│   └── followup/[token]/               — Pages publiques relances
│       ├── postpone/                   — Formulaire report (max 5)
│       └── abandon/                    — Confirmation abandon

├── [SUB] Création reco [PERSISTE DANS] → winelio.recommendations, winelio.recommendation_steps
│   └── /api/recommendations/create     — POST : crée reco + 7 steps [DÉCLENCHE] → notifyNewRecommendation

├── [SUB] Complétion étape [PERSISTE DANS] → winelio.recommendation_steps, winelio.recommendations
│   └── /api/recommendations/complete-step — POST : valide étape (check completion_role)
│       Étape 6 : [DÉCLENCHE] → Stripe checkout (stripe-checkout.ts)
│       [DÉCLENCHE] → notifyReferrerStep, [UTILISE] → createCommissions si webhook Stripe

├── [SUB] Webhook Stripe [PERSISTE DANS] → winelio.stripe_payment_sessions, commission_transactions
│   └── /api/stripe/webhook             — checkout.session.completed → createCommissions + recalculateWallet

├── [SUB] Claim flow (pro inconnu) [PERSISTE DANS] → winelio.companies, winelio.profiles
│   ├── src/app/claim/[recommendationId]/page.tsx — Page publique
│   └── /api/claim/finalize             — Lie le user connecté à la company scraped

├── [SUB] Relances auto [PERSISTE DANS] → winelio.recommendation_followups
│   ├── /api/recommendations/process-followups — Cron 15min (Bearer CRON_SECRET)
│   ├── /api/recommendations/followup-action  — GET/POST : actions email HMAC (done/postpone/abandon)
│   └── src/lib/followup-token.ts       — HMAC signé TTL 30j (FOLLOWUP_ACTION_SECRET)

├── [SUB] Autres actions reco
│   ├── /api/recommendations/[id]       — GET : détail (anonymat pro pré-acceptation)
│   ├── /api/recommendations/[id]/refuse — POST : refus par le pro
│   ├── /api/recommendations/[id]/transfer — POST : transfert à un autre pro
│   ├── /api/recommendations/list       — GET : liste ?tab=sent|received
│   └── /api/recommendations/cron-scraped-reminder — Cron relances pros scrapés (12h/24h)

└── src/components/step-timeline.tsx    — Visualisation timeline 7 étapes


[FEATURE] Network MLM (5 niveaux)
├── src/app/(protected)/network/        — Page arbre réseau
│   └── stats/                          — Stats réseau
├── src/components/network-graph.tsx    — Visualisation react-d3-tree
├── src/components/network-tree.tsx     — Visualisation @xyflow
├── src/components/network-feed.tsx     — Feed événements réseau
├── src/components/referral-buttons.tsx — Copier/Inviter/Partager/QR
├── /api/network/tree                   — GET : arbre récursif 5 niveaux (anti-IDOR)
│   [UTILISE] → RPC get_network_ids
├── /api/network/children               — GET : filleuls directs d'un nœud
├── /api/network/user-events            — GET : événements feed (recos actives réseau)
├── /api/network/send-invite            — POST : email d'invitation [DÉCLENCHE] → email_queue
└── /api/network/new-referral           — POST : notifie le parrain [DÉCLENCHE] → notifyNewReferral


[FEATURE] Wallet & Commissions
├── src/app/(protected)/wallet/         — Page wallet (EUR + Wins)
│   ├── history/                        — Historique transactions
│   └── withdraw/                       — Formulaire retrait
├── src/components/wallet-card.tsx      — Widget solde
├── src/lib/wallet.ts                   — recalculateWallet() (admin override)
├── src/lib/commission.ts               — calculateCommissions() + createCommissions()
│   [UTILISE] → supabaseAdmin, WINELIO_SYSTEM_USER_ID (spillover cagnotte)
├── /api/wallet/withdraw                — POST : validation IBAN, appelle process_withdrawal RPC
└── src/app/(protected)/wallet/withdraw/page.tsx — formulaire


[FEATURE] Profile & Onboarding
├── src/app/(protected)/profile/        — Page profil (avatar, infos, Wins)
│   └── pro-onboarding/                 — Parcours onboarding pro
├── src/components/ProOnboardingWizard.tsx — Wizard 6 étapes (SIRET → CGU → paiement)
│   [UTILISE] → /api/profile/*, /api/stripe/*, src/lib/siren.ts
├── src/components/SignatureModal.tsx   — Modal CGU
├── src/components/SignaturePad.tsx     — Canvas HTML5 signature
├── src/components/profile-form.tsx     — Formulaire profil
├── src/components/onboarding-modal.tsx — Onboarding user standard (bienvenue)
├── src/components/profile-incomplete-modal.tsx — Rappel profil incomplet
├── src/lib/siren.ts                    — API SIRENE (vérification SIRET)
├── src/lib/geocode.ts                  — Géocodage adresse → lat/lng
├── src/lib/naf-rules.ts                — Règles codes NAF (types d'activité autorisés)
├── src/lib/generate-signed-pdf.ts      — PDF CGU signé (puppeteer) [PERSISTE DANS] → Storage legal-signatures
├── /api/profile/avatar                 — POST : upload avatar → Cloudflare R2 [UTILISE] → r2-avatars
├── /api/profile/payment-method-status — GET : vérifie stripe_payment_method_id
├── /api/profile/complete-tour          — POST : marque tour_completed_at
└── /api/avatars/[...path]              — GET : stream avatar R2 (auth: owner | sponsor N1 | super_admin)


[FEATURE] Companies
├── src/app/(protected)/companies/      — Liste entreprises
│   ├── new/                            — Formulaire création
│   └── [id]/edit/                      — Édition
├── src/components/new-company-form.tsx — Formulaire création
├── src/components/edit-company-form.tsx — Formulaire édition
├── src/lib/company-actions.ts          — Actions CRUD companies (RLS bypass admin)
├── src/lib/company-display.ts          — Formatage affichage
└── src/lib/generate-alias.ts          — Génération alias #XXXXXX


[FEATURE] Admin (gestion-reseau)
[DÉPEND DE] → rôle super_admin dans app_metadata.role (JWT)
├── src/app/gestion-reseau/
│   ├── layout.tsx                      — AdminLayoutShell + check super_admin
│   ├── page.tsx                        — Dashboard KPI [UTILISE] → vues *_real
│   ├── recommandations/                — Liste + détail + annotations
│   │   └── [id]/actions.ts             — Server Actions : addRecoAnnotation, deleteRecoAnnotation
│   ├── utilisateurs/                   — Liste + fiche user
│   │   └── [id]/audit-actions.ts       — Server Action : verifyDocumentIntegrity
│   ├── professionnels/                 — Liste pros (audit onboarding)
│   ├── documents/                      — CGU/CGV viewer + annotations + placeholders
│   │   └── actions.ts                  — Server Actions : addAnnotation, fillPlaceholder, publishDocument
│   ├── processus/                      — Organigrammes (ReactFlow)
│   │   └── actions.ts                  — Server Actions : addFlowAnnotation, deleteFlowAnnotation
│   ├── retraits/                       — Gestion demandes retrait
│   ├── reseau/                         — Arbre MLM global
│   └── bugs/                           — Kanban bug tracker
├── src/components/admin/
│   ├── AdminLayoutShell.tsx            — Sidebar collapsible admin
│   ├── BugTrackerBoard.tsx             — Board Kanban (Drag & Drop)
│   ├── DashboardCharts.tsx             — Recharts KPI
│   ├── NetworkTree.tsx                 — Arbre MLM admin
│   ├── AnnotationPanel.tsx             — Panel annotations reco
│   ├── RecoJourneyView.tsx             — Timeline reco côté admin
│   ├── ProOnboardingAuditTimeline.tsx  — Timeline audit onboarding pro
│   ├── DocumentViewer.tsx              — Viewer CGU avec sections
│   ├── PlaceholderEditor.tsx           — Éditeur placeholders CGU
│   ├── ProfessionnelsTable.tsx         — Tableau pros avec filtres
│   └── RecoFlowchartClient.tsx         — Organigramme ReactFlow process
└── /api/admin/scraping/import          — POST : import CSV companies scraped (super_admin only)


[FEATURE] Email System (asynchrone)
├── src/lib/email-queue.ts              — queueEmail() [PERSISTE DANS] → winelio.email_queue
├── src/lib/email-transporter.ts        — sendMailWithTimeout() (Nodemailer SMTP)
├── src/lib/email-logo.ts              — LOGO_IMG_HTML (constante HTML)
├── /api/email/process-queue            — POST cron (Bearer CRON_SECRET) : dépile email_queue, skip @winelio-e2e.local → test_skipped
├── /api/email/welcome                  — POST : enqueue email bienvenue
├── /api/email-template/               — GET : template email paramétré (preview admin)
├── /api/email-template/preview/        — GET : preview template
├── /api/email-track/open               — GET : pixel tracking (met à jour email_opened_at)
└── /api/email-track/click              — GET : redirect tracking (met à jour email_clicked_at)

[SUB] Notifications métier (toutes dans src/lib/notify-*.ts)
├── notify-new-recommendation.ts       — Email pro + referrer à création reco
├── notify-new-referral.ts             — Email parrain à inscription filleul
├── notify-new-pro-in-network.ts       — Email parrain quand filleul devient pro
├── notify-reco-refused.ts             — Email referrer si pro refuse
├── notify-referrer-step.ts            — Email referrer à chaque étape validée
├── notify-referrer-no-response.ts     — Email referrer si pro scrappé ne répond pas
├── notify-scraped-reminder.ts         — Relance pro scrappé 12h
├── notify-commission-payment.ts       — Relances Stripe (J+2, J+4)
├── notify-pro-followup.ts             — Email relance auto pro (cycle 3x)
├── notify-pro-abandoned.ts            — Email referrer si 3 relances sans réponse
├── notify-pro-onboarding.ts           — Email à l'activation pro
├── notify-signature-cgu.ts            — Email confirmation CGU signée
├── notify-siret-reminder.ts           — Relance SIRET manquant
├── notify-bug-status.ts               — Email user sur changement statut bug
└── notify-company-modification-request.ts — Email support demande modif company


[FEATURE] Bug Tracker
├── src/components/bug-report-button.tsx   — Bouton flottant global
├── src/components/bug-report/
│   ├── ReportFormDialog.tsx               — Formulaire signalement
│   ├── ReplyDialog.tsx                    — Dialog réponse admin
│   └── HistoryDialog.tsx                  — Historique échanges
├── /api/bugs/report                       — POST FormData (message + screenshot) [PERSISTE DANS] → bug_reports, Storage bug-screenshots
├── /api/bugs/imap-poll                    — GET cron : polling IMAP support@winelio.app
└── /api/bugs/imap-debug                   — GET debug : test connexion IMAP


[FEATURE] Cron Jobs
├── /api/email/process-queue            — Dépile email_queue (Bearer CRON_SECRET)
├── /api/recommendations/process-followups — Scanne followups pending échus (Bearer CRON_SECRET, 15min)
├── /api/recommendations/cron-scraped-reminder — Relances pro scrappé (Bearer CRON_SECRET)
├── /api/stripe/cron-reminders          — Relances Stripe paiements (GET, Bearer CRON_SECRET)
└── /api/bugs/imap-poll                 — Polling IMAP support@ (Bearer CRON_SECRET)


[FEATURE] Demo Mode
├── src/components/DemoSeedBanner.tsx   — Bandeau mode démo
├── /api/demo/seed-network              — POST : appelle winelio.seed_demo_network() (DEMO_MODE only)
└── /api/demo/status                    — GET : statut réseau demo


[FEATURE] Staging Auth
├── src/app/staging-login/page.tsx      — Formulaire mot de passe basique
└── /api/staging-auth                   — POST : vérifie STAGING_PASSWORD, pose cookie staging_auth


[UTILITY] Librairies transversales
├── src/lib/stripe.ts                   — Client Stripe (STRIPE_SECRET_KEY)
├── src/lib/stripe-checkout.ts          — Création Stripe Checkout session (étape 6)
├── src/lib/r2.ts                       — Upload R2 (S3 SDK, bucket winelio)
├── src/lib/r2-avatars.ts               — Upload/delete/stream avatars R2
├── src/lib/profile-avatar.ts           — resolveProfileAvatarUrl()
├── src/lib/audit.ts                    — insertAuditLog() + getDocumentHash()
├── src/lib/feed-utils.ts               — Formatage événements feed réseau
├── src/lib/age.ts                      — isAtLeastAge() (vérif 18+ depuis birth_date)
├── src/lib/html-escape.ts              — he() pour emails
├── src/lib/fake-last-active.ts         — Génère date "dernière activité" fake (demo)
└── src/lib/generate-alias.ts           — Alias unique #XXXXXX

[HOOK] Hooks React custom
└── src/hooks/useKeyboardScroll.ts     — Scroll champ actif visible sur mobile iOS/Android
(1 seul hook custom identifié dans le projet)
```

---

## Layouts et protection des routes

| Segment | Fichier | Protection |
|---|---|---|
| Racine | `src/app/layout.tsx` | Aucune |
| `/(protected)/*` | `src/app/(protected)/layout.tsx` | getUser() + redirect login si absent |
| `/gestion-reseau/*` | `src/app/gestion-reseau/layout.tsx` | super_admin JWT + redirect dashboard |
| Middleware global | `src/middleware.ts` | Rate-limit + redirection auth + staging password |

[CORE] Logique Métier
├── src/lib/commission.ts [UTILITY]
│       calculateCommissions() · createCommissions()
│       Distribue : 60% referrer · 3%×5 niveaux · 23% plateforme · 1% Wins
├── src/lib/assign-sponsor.ts [UTILITY]
│       assignSponsorIfNeeded(userId, sponsorCode?)
│       Fallback : round-robin is_founder=true via RPC
├── src/lib/notify-new-referral.ts [UTILITY]
│       Envoie email aux 5 niveaux de sponsors
│       [UTILISE] nodemailer, supabaseAdmin
├── src/lib/geocode.ts [UTILITY]
│       API Adresse GouV (api-adresse.data.gouv.fr)
│       Retourne lat/lon pour les entreprises
├── src/lib/generate-alias.ts [UTILITY]
│       Génère alias unique #XXXXXX (6 hex chars)
│       [PERSISTE DANS] companies (vérif unicité)
├── src/lib/feed-utils.ts [UTILITY]
│       Types FeedEvent · formatUserName() · feedEventIcon()
├── src/lib/company-display.ts [UTILITY]
│       getCompanyDisplay() · affichage conditionnel user/admin
├── src/lib/html-escape.ts [UTILITY]
│       he(string) · protection XSS dans emails HTML
├── src/lib/email-logo.ts [UTILITY]
│       LOGO_IMG_HTML · <img> R2 inline pour emails
└── src/lib/utils.ts [UTILITY]
        cn() · clsx + tailwind-merge

[HOOK] Hooks React
└── src/hooks/useKeyboardScroll.ts [HOOK]
        Navigation clavier ↑↓ · [UTILISE] KeyboardScrollProvider
```

---

## FLUX CRITIQUES

### Flux Auth (OTP → Session)
```
User (email) → /auth/login
  → POST /api/auth/send-code
      → otp_codes UPSERT + SMTP email
  → POST /api/auth/verify-code
      → otp_codes vérif + delete
      → generateLink() → session tokens
      → cookies HttpOnly
      → assignSponsorIfNeeded()
          → profiles.sponsor_id = sponsor trouvé
          → OU : RPC get_next_open_registration_sponsor()
  → redirect /dashboard
```

### Flux Commission (étape 6)
```
POST /api/recommendations/complete-step {step: 6}
  → recommendation_steps.completed_at = NOW()
  → createCommissions() [IDEMPOTENT]
      → calcule montant depuis recommendation_steps.data (step devis)
      → commission_transactions INSERT (60% referrer + 5×3% niveaux)
      → user_wallet_summaries UPDATE (recalcul available)
```

### Flux Retrait
```
POST /api/wallet/withdraw {amount, method, details}
  → vérif session + solde disponible
  → RPC process_withdrawal() [TRANSACTION ATOMIQUE]
      → withdrawals INSERT (pending)
      → user_wallet_summaries.available -= amount
  → Admin : gestion-reseau/retraits → validateWithdrawal()
      → withdrawals.status = approved/paid/rejected
```
