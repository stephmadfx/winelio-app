# Architecture Relationnelle — Winelio

> Analyse froide des fichiers source. Généré le 2026-04-09.
> Stack : Next.js 15 (App Router) · TypeScript · Supabase · Tailwind CSS v4

---

## LÉGENDE

| Symbole | Signification |
|---------|--------------|
| `[CORE]` | Fondation : Auth, DB, Config |
| `[FEATURE]` | Fonctionnalité principale visible utilisateur |
| `[SUB]` | Sous-composant ou logique métier spécifique |
| `[HOOK]` | Logique d'état ou effets |
| `[UTILITY]` | Fonctions transversales, helpers |
| `[UTILISE]` | Appel simple de fonction/composant |
| `[DÉCLENCHE]` | Side-effect ou action asynchrone |
| `[DÉPEND DE]` | Requis pour le fonctionnement |
| `[PERSISTE DANS]` | Interaction avec la base de données |

---

## ARBRE RELATIONNEL COMPLET

```
[CORE] Supabase Auth (OTP par email)
├── [SUB] src/lib/supabase/config.ts
│       Fournit URL + ANON_KEY (nettoyage espaces)
├── [SUB] src/lib/supabase/client.ts
│       Client browser (PKCE flow, createBrowserClient)
├── [SUB] src/lib/supabase/server.ts
│       Client SSR (createServerClient, cookies Next.js)
├── [SUB] src/lib/supabase/admin.ts
│       Client admin (SERVICE_ROLE_KEY, schéma winelio)
├── [SUB] src/lib/supabase/get-user.ts
│       [UTILISE] server.ts → getUser() avec cache React
└── [SUB] src/middleware.ts
        [DÉPEND DE] server.ts → vérifie session
        [DÉCLENCHE] redirect /auth/login si non-authentifié
        Rate-limit : 60 req/min par IP (Map en mémoire)
        Role-based redirect : super_admin → /gestion-reseau

[CORE] Next.js App Router (src/app/)
│
├── [FEATURE] Landing Page
│   └── src/app/page.tsx
│           [UTILISE] WinelioLogo, AppBackground, NetworkBackground
│           [UTILISE] Link → /auth/login
│
├── [FEATURE] Authentification (Magic Link OTP)
│   ├── src/app/auth/login/page.tsx
│   │       [DÉCLENCHE] POST /api/auth/send-code (envoi OTP)
│   │       [DÉCLENCHE] POST /api/auth/verify-code (validation)
│   │       [UTILISE] sessionStorage (code parrain temporaire)
│   │       [DÉPEND DE] searchParams.get('ref') → sponsor code
│   │
│   ├── src/app/auth/callback/page.tsx
│   │       [DÉCLENCHE] échange token PKCE → session
│   │       [DÉCLENCHE] redirect /dashboard
│   │
│   ├── src/app/api/auth/send-code/route.ts
│   │       [PERSISTE DANS] otp_codes (INSERT/UPSERT)
│   │       [DÉCLENCHE] SMTP nodemailer → email OTP
│   │       [UTILISE] supabaseAdmin, html-escape
│   │
│   ├── src/app/api/auth/verify-code/route.ts
│   │       [PERSISTE DANS] otp_codes (vérifie + supprime)
│   │       [UTILISE] supabaseAdmin.auth.admin.generateLink()
│   │       [DÉCLENCHE] assignSponsorIfNeeded(userId, sponsorCode)
│   │       [DÉCLENCHE] cookies session HttpOnly
│   │
│   ├── src/app/api/auth/callback/route.ts
│   │       PKCE code exchange → session
│   │       [DÉCLENCHE] redirect /dashboard
│   │
│   ├── src/app/api/auth/assign-sponsor/route.ts
│   │       [DÉCLENCHE] assignSponsorIfNeeded(userId, code)
│   │
│   └── src/app/api/auth/sign-out/route.ts
│           [DÉCLENCHE] supabase.auth.signOut() + clear cookies
│
├── [CORE] Layout Protégé
│   └── src/app/(protected)/layout.tsx
│           [DÉPEND DE] getUser() → redirect si non-auth
│           [UTILISE] Sidebar (desktop), MobileHeader, MobileNav
│           [UTILISE] ProfileIncompleteModal (si profil incomplet)
│           [UTILISE] DemoBanner (si NEXT_PUBLIC_DEMO_MODE=true)
│           [UTILISE] AppBackground, KeyboardScrollProvider
│           [PERSISTE DANS] profiles (lecture first_name, sponsor_code)
│
│   ├── [FEATURE] Dashboard
│   │   └── src/app/(protected)/dashboard/page.tsx
│   │           [UTILISE] server.ts → statistiques
│   │           [UTILISE] AnimatedCounter, MonthlyBarChart
│   │           [PERSISTE DANS] commission_transactions, recommendations
│   │
│   ├── [FEATURE] Profil Utilisateur
│   │   ├── src/app/(protected)/profile/page.tsx
│   │   │       [UTILISE] ProfileForm
│   │   │       [UTILISE] ReferralButtons
│   │   │       [PERSISTE DANS] profiles (lecture)
│   │   │
│   │   ├── src/app/(protected)/profile/actions.ts  [SERVER ACTION]
│   │   │       updateProfile() [PERSISTE DANS] profiles
│   │   │       assignSponsor() [PERSISTE DANS] profiles
│   │   │       [DÉPEND DE] deleted_sponsor_codes (validation unicité)
│   │   │
│   │   └── src/components/profile-form.tsx
│   │           [UTILISE] actions.ts → updateProfile()
│   │           [UTILISE] StickyFormActions
│   │
│   ├── [FEATURE] Recommandations (Workflow 7 étapes)
│   │   ├── src/app/(protected)/recommendations/page.tsx
│   │   │       [PERSISTE DANS] recommendations, profiles
│   │   │       Filtre : envoyées / reçues / toutes
│   │   │
│   │   ├── src/app/(protected)/recommendations/[id]/page.tsx
│   │   │       [PERSISTE DANS] recommendations, recommendation_steps, steps
│   │   │       [UTILISE] StepTimeline
│   │   │       [DÉCLENCHE] POST /api/recommendations/complete-step
│   │   │
│   │   ├── src/app/(protected)/recommendations/new/page.tsx
│   │   │       [PERSISTE DANS] recommendations (création)
│   │   │       [PERSISTE DANS] contacts (création prospect)
│   │   │       [UTILISE] compensation_plans, companies
│   │   │
│   │   ├── src/app/api/recommendations/complete-step/route.ts
│   │   │       [PERSISTE DANS] recommendation_steps (completed_at)
│   │   │       [DÉCLENCHE] createCommissions() si step=6 (idempotent)
│   │   │       [PERSISTE DANS] commission_transactions
│   │   │       [PERSISTE DANS] user_wallet_summaries (recalcul)
│   │   │
│   │   ├── [FEATURE] Relances automatiques pro (depuis 2026-05)
│   │   │   ├── src/app/api/recommendations/process-followups/route.ts
│   │   │   │       [PERSISTE DANS] recommendation_followups (état cycle)
│   │   │   │       [DÉCLENCHE] notify-pro-followup (email relance)
│   │   │   │       [DÉCLENCHE] notify-pro-abandoned (email referrer si 3 relances sans réponse)
│   │   │   │       [UTILISE] email-queue
│   │   │   │       [DÉPEND DE] recommendation_followups (pending échus)
│   │   │   │
│   │   │   ├── src/app/api/recommendations/followup-action/route.ts
│   │   │   │       [DÉPEND DE] followup-token (validation HMAC)
│   │   │   │       [PERSISTE DANS] recommendation_followups (status → done/postponed/abandoned)
│   │   │   │       [PERSISTE DANS] recommendations (abandoned_by_pro_at)
│   │   │   │       [DÉCLENCHE] complete-step si action=done
│   │   │   │
│   │   │   ├── src/app/recommendations/followup/[token]/postpone/page.tsx
│   │   │   │       [PUBLIC] token HMAC · choix du délai (menu)
│   │   │   │       [DÉCLENCHE] POST /api/recommendations/followup-action {action: postpone}
│   │   │   │
│   │   │   └── src/app/recommendations/followup/[token]/abandon/page.tsx
│   │   │           [PUBLIC] token HMAC · page de confirmation
│   │   │           [DÉCLENCHE] POST /api/recommendations/followup-action {action: abandon}
│   │   │
│   │   └── (trigger DB)
│   │           trg_recommendation_step_followup → handle_recommendation_step_completion()
│   │           [DÉCLENCHE] INSERT recommendation_followups à la complétion étape 2/4/5
│   │           [DÉCLENCHE] CANCEL followups pending si étape suivante déjà complétée
│   │
│   ├── [FEATURE] Réseau MLM
│   │   ├── src/app/(protected)/network/page.tsx
│   │   │       [UTILISE] NetworkGraph (D3 force-directed)
│   │   │       [UTILISE] NetworkFeed
│   │   │       [PERSISTE DANS] profiles (sponsor_id chain)
│   │   │
│   │   ├── src/app/(protected)/network/stats/page.tsx
│   │   │       [PERSISTE DANS] profiles (métriques réseau)
│   │   │
│   │   ├── src/app/api/network/children/route.ts
│   │   │       [PERSISTE DANS] profiles (SELECT WHERE sponsor_id=X)
│   │   │
│   │   ├── src/app/api/network/send-invite/route.ts
│   │   │       [DÉCLENCHE] SMTP → email invitation avec lien ref
│   │   │
│   │   ├── src/app/api/network/new-referral/route.ts
│   │   │       [DÉCLENCHE] notifyNewReferral(userId)
│   │   │       [UTILISE] lib/notify-new-referral.ts
│   │   │
│   │   └── src/app/api/network/assign-open-registration-sponsor/route.ts
│   │           [DÉCLENCHE] RPC get_next_open_registration_sponsor()
│   │           [PERSISTE DANS] profiles (sponsor_id assigné)
│   │
│   ├── [FEATURE] Wallet (Portefeuille)
│   │   ├── src/app/(protected)/wallet/page.tsx
│   │   │       [UTILISE] WalletCard
│   │   │       [PERSISTE DANS] user_wallet_summaries, commission_transactions, withdrawals
│   │   │
│   │   ├── src/app/(protected)/wallet/history/page.tsx
│   │   │       [PERSISTE DANS] commission_transactions, withdrawals
│   │   │
│   │   ├── src/app/(protected)/wallet/withdraw/page.tsx
│   │   │       [DÉCLENCHE] POST /api/wallet/withdraw
│   │   │       [PERSISTE DANS] user_wallet_summaries (lecture solde)
│   │   │
│   │   └── src/app/api/wallet/withdraw/route.ts
│   │           [DÉPEND DE] session auth (userId)
│   │           [DÉCLENCHE] RPC process_withdrawal() (transaction atomique)
│   │           [PERSISTE DANS] withdrawals, user_wallet_summaries
│   │
│   ├── [FEATURE] Entreprises
│   │   ├── src/app/(protected)/companies/page.tsx
│   │   │       [PERSISTE DANS] companies (liste par owner_id)
│   │   │
│   │   ├── src/app/(protected)/companies/new/page.tsx
│   │   │       [UTILISE] NewCompanyForm
│   │   │       [PERSISTE DANS] companies
│   │   │
│   │   └── src/components/new-company-form.tsx
│   │           [UTILISE] geocode.ts → API Adresse GouV
│   │           [UTILISE] generateUniqueAlias()
│   │           [PERSISTE DANS] companies, categories
│   │
│   └── [FEATURE] Paramètres
│       └── src/app/(protected)/settings/page.tsx
│               [UTILISE] ThemeProvider (light/dark)
│
├── [FEATURE] Administration (Super Admin)
│   ├── src/app/gestion-reseau/layout.tsx
│   │       [DÉPEND DE] getUser() + app_metadata.role === 'super_admin'
│   │       [UTILISE] AdminLayoutShell
│   │
│   ├── src/app/gestion-reseau/page.tsx
│   │       [UTILISE] DashboardCharts
│   │       [PERSISTE DANS] profiles, recommendations, commission_transactions
│   │
│   ├── src/app/gestion-reseau/recommandations/page.tsx
│   │       [PERSISTE DANS] recommendations, profiles
│   │
│   ├── src/app/gestion-reseau/recommandations/[id]/page.tsx
│   │       [DÉCLENCHE] advanceRecommendationStep() [SERVER ACTION]
│   │       [PERSISTE DANS] recommendations, recommendation_steps, commission_transactions
│   │
│   ├── src/app/gestion-reseau/utilisateurs/page.tsx
│   │       [PERSISTE DANS] profiles, commission_transactions (agrégats)
│   │
│   ├── src/app/gestion-reseau/utilisateurs/[id]/page.tsx
│   │       [DÉCLENCHE] adjustCommission(), suspendUser() [SERVER ACTIONS]
│   │       [PERSISTE DANS] profiles, commission_transactions, withdrawals
│   │
│   ├── src/app/gestion-reseau/reseau/page.tsx
│   │       [UTILISE] NetworkTreeWrapper (admin)
│   │       [PERSISTE DANS] profiles (arbre complet)
│   │
│   ├── src/app/gestion-reseau/retraits/page.tsx
│   │       [DÉCLENCHE] validateWithdrawal() [SERVER ACTION]
│   │       [PERSISTE DANS] withdrawals, user_wallet_summaries
│   │
│   ├── src/app/gestion-reseau/professionnels/page.tsx
│   │       [UTILISE] ProfessionnelsTable
│   │       [PERSISTE DANS] profiles (is_professional=true)
│   │
│   └── src/app/gestion-reseau/actions.ts  [SERVER ACTIONS ADMIN]
│           advanceRecommendationStep() → recommendation_steps, commission_transactions
│           adjustCommission() → commission_transactions (manual_adjustment)
│           suspendUser() → profiles (is_active=false)
│           validateWithdrawal() → withdrawals (status=approved/paid/rejected)
│
└── [FEATURE] Suppression de Compte
    └── src/app/api/account/delete/route.ts
            [DÉCLENCHE] Réassignation enfants (sponsor_id → grand-parent)
            [PERSISTE DANS] deleted_sponsor_codes (réservation code)
            [DÉCLENCHE] supabaseAdmin.auth.admin.deleteUser()
            [PERSISTE DANS] profiles (suppression cascade)
```

---

## COMPOSANTS TRANSVERSAUX

```
[CORE] Composants Layout
├── src/components/sidebar.tsx [FEATURE]
│       Nav desktop · [DÉPEND DE] session user (email, role)
├── src/components/mobile-nav.tsx [FEATURE]
│       Bottom nav mobile · icônes + active state
├── src/components/mobile-header.tsx [FEATURE]
│       Header mobile · burger menu + prénom user
├── src/components/AppBackground.tsx [UTILITY]
│       SVG animé fond dégradé
└── src/components/NetworkBackground.tsx [UTILITY]
        SVG réseau nodes (landing page)

[CORE] Logique Métier
├── src/lib/commission.ts [UTILITY]
│       calculateCommissions() · createCommissions()
│       Distribue : 60% referrer · 4%×5 niveaux · 14% plateforme · 1% Wins
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
├── src/lib/followup-token.ts [UTILITY]
│       signFollowupToken() · verifyFollowupToken()
│       HMAC-SHA256 signé avec FOLLOWUP_ACTION_SECRET (min 32 chars)
│       [UTILISÉ PAR] notify-pro-followup, followup-action route
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
      → commission_transactions INSERT (60% referrer + 5×4% niveaux)
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
