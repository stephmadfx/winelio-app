# Architecture Relationnelle - Winelio

> Plateforme de recommandations professionnelles avec reseau de parrainage multi-niveaux.
> Stack : Next.js 15 + Supabase (self-hosted Coolify) + Tailwind CSS 4

---

## Arbre d'Architecture

```
[CORE] Supabase Config (lib/supabase/)
├── config.ts                    Exporte SUPABASE_URL + ANON_KEY
├── client.ts                    Client navigateur (PKCE flow)
└── server.ts                    Client serveur (cookie-based SSR)

[CORE] Auth System
├── middleware.ts                 [DÉPEND DE] -> Supabase Server
│   ├── [DÉCLENCHE] -> Redirect /auth/login (non-authentifié)
│   └── [DÉCLENCHE] -> Redirect /dashboard (déjà authentifié)
├── [FEATURE] Login Flow (auth/login/page.tsx) [CLIENT]
│   ├── [UTILISE] -> Supabase Client
│   ├── [DÉCLENCHE] -> signInWithOtp (Magic Link email)
│   └── [DÉCLENCHE] -> Envoi email via GOTRUE_SMTP (Coolify)
├── [SUB] Auth Callback Page (auth/callback/page.tsx) [CLIENT]
│   ├── [UTILISE] -> Supabase Client
│   ├── [DÉCLENCHE] -> exchangeCodeForSession (PKCE)
│   └── [DÉCLENCHE] -> Redirect /dashboard
└── [SUB] Auth Callback API (api/auth/callback/route.ts) [SERVER]
    ├── [UTILISE] -> Supabase Server
    ├── [DÉCLENCHE] -> exchangeCodeForSession
    └── [DÉCLENCHE] -> Redirect sécurisé (anti open-redirect)

[CORE] Layout & Navigation
├── app/layout.tsx [SERVER]      Root layout (Montserrat font, metadata)
├── (protected)/layout.tsx [SERVER]
│   ├── [DÉPEND DE] -> Auth (getUser check)
│   ├── [UTILISE] -> Sidebar (desktop lg:)
│   ├── [UTILISE] -> MobileHeader (mobile <lg)
│   └── [UTILISE] -> MobileNav (mobile <lg)
├── [SUB] Sidebar (components/sidebar.tsx) [CLIENT]
│   └── 6 nav items : Dashboard, Recos, Réseau, Wallet, Entreprises, Profil
├── [SUB] MobileNav (components/mobile-nav.tsx) [CLIENT]
│   └── Bottom tab : Accueil, Recos, Réseau, Wallet, Profil
├── [SUB] MobileHeader (components/mobile-header.tsx) [CLIENT]
│   └── Logo + hamburger menu (Entreprises, Déconnexion)
└── [SUB] SignOutButton (components/sign-out-button.tsx) [CLIENT]
    └── [DÉCLENCHE] -> supabase.auth.signOut()

[FEATURE] Dashboard (dashboard/page.tsx) [SERVER]
├── [DÉPEND DE] -> Auth
├── [UTILISE] -> StatCard (locale)
│   └── 4 cards : Recommandations, Gains, Réseau, Taux de succès
└── Welcome Card avec CTA -> Recommandation + Invitation

[FEATURE] Recommendations System
├── Liste (recommendations/page.tsx) [CLIENT]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> recommendations (select, filter)
│   ├── [PERSISTE DANS] -> contacts (join)
│   ├── [PERSISTE DANS] -> profiles (join professional)
│   └── Tabs: Envoyées / Reçues + Filtres statut
├── Création (recommendations/new/page.tsx) [CLIENT]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> contacts (select + insert)
│   ├── [PERSISTE DANS] -> profiles (select pro, ilike search)
│   ├── [PERSISTE DANS] -> recommendations (insert)
│   ├── [PERSISTE DANS] -> recommendation_steps (insert batch)
│   ├── [PERSISTE DANS] -> steps (select templates)
│   └── Multi-step : Contact -> Professionnel -> Description
├── Détail (recommendations/[id]/page.tsx) [CLIENT]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> recommendations (select + update)
│   ├── [PERSISTE DANS] -> recommendation_steps (select + update)
│   ├── [UTILISE] -> StepTimeline (components/step-timeline.tsx)
│   ├── [UTILISE] -> createCommissions (lib/commission.ts)
│   └── [DÉCLENCHE] -> Création commissions à la completion
└── [UTILITY] Commission Logic (lib/commission.ts)
    ├── calculateCommissions() : Calcul 5 niveaux de commissions
    ├── createCommissions() : Insert dans commission_transactions
    ├── [PERSISTE DANS] -> commission_transactions (insert)
    ├── [PERSISTE DANS] -> compensation_plans (select taux)
    └── [PERSISTE DANS] -> profiles (select chaîne sponsors)

[FEATURE] Wallet
├── Vue principale (wallet/page.tsx) [SERVER]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> user_wallet_summaries (select)
│   ├── [PERSISTE DANS] -> commission_transactions (select recent)
│   ├── [PERSISTE DANS] -> withdrawals (select recent)
│   └── [UTILISE] -> WalletCard (components/wallet-card.tsx)
├── Retrait (wallet/withdraw/page.tsx) [CLIENT]
│   ├── [DÉPEND DE] -> Auth
│   ├── [DÉCLENCHE] -> POST /api/wallet/withdraw
│   └── Multi-step : Montant -> Confirmation -> Succès
├── [SUB] API Retrait (api/wallet/withdraw/route.ts) [SERVER]
│   ├── [DÉPEND DE] -> Auth (getUser server-side)
│   ├── Validation : montant, IBAN regex, email PayPal
│   ├── [PERSISTE DANS] -> user_wallet_summaries (select + update)
│   └── [PERSISTE DANS] -> withdrawals (insert)
└── Historique (wallet/history/page.tsx) [CLIENT]
    ├── [DÉPEND DE] -> Auth
    ├── [PERSISTE DANS] -> commission_transactions (select paginated)
    └── [PERSISTE DANS] -> withdrawals (select paginated)

[FEATURE] Network / Parrainage
├── Vue principale (network/page.tsx) [SERVER]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> profiles (select filleuls + stats)
│   ├── [PERSISTE DANS] -> commission_transactions (select gains)
│   ├── [PERSISTE DANS] -> user_wallet_summaries (select)
│   ├── [UTILISE] -> NetworkTree (components/network-tree.tsx)
│   ├── [UTILISE] -> CopyButton / ShareButton (locale)
│   └── Sponsor code + Filleuls directs + Arbre réseau
├── Stats détaillées (network/stats/page.tsx) [SERVER]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> profiles (select réseau)
│   ├── [PERSISTE DANS] -> commission_transactions (select 5 niveaux)
│   └── Bar chart commissions par niveau + historique
└── [SUB] NetworkTree (components/network-tree.tsx) [CLIENT]
    ├── [UTILISE] -> Supabase Client
    ├── [PERSISTE DANS] -> profiles (select récursif par sponsor_id)
    └── Arbre expandable multi-niveaux

[FEATURE] Companies / Entreprises
├── Liste (companies/page.tsx) [SERVER]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> companies (select + join categories)
│   └── Grid cards avec statut vérification
├── Création (companies/new/page.tsx) [SERVER]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> categories (select)
│   └── [UTILISE] -> NewCompanyForm
└── [SUB] NewCompanyForm (components/new-company-form.tsx) [CLIENT]
    ├── [UTILISE] -> Supabase Client
    ├── [PERSISTE DANS] -> companies (insert)
    └── Formulaire : nom, SIRET, adresse, catégorie

[FEATURE] Profile
├── Page (profile/page.tsx) [SERVER]
│   ├── [DÉPEND DE] -> Auth
│   ├── [PERSISTE DANS] -> profiles (select)
│   └── [UTILISE] -> ProfileForm
└── [SUB] ProfileForm (components/profile-form.tsx) [CLIENT]
    ├── [UTILISE] -> Supabase Client
    ├── [PERSISTE DANS] -> profiles (update + select sponsor)
    └── Édition : nom, téléphone, adresse, code parrain

[UTILITY] Globals
├── globals.css                  Thème Winelio (orange, amber, dark, gray, light)
├── next.config.ts               Headers sécurité (HSTS, CSP, X-Frame-Options)
└── middleware.ts                 Auth routing + protection routes
```

---

## Flux Principaux

### Flux d'Authentification
```
Utilisateur -> /auth/login [signInWithOtp]
    -> Email envoyé (GOTRUE SMTP)
    -> Clic lien -> Supabase /auth/v1/verify
    -> Redirect -> /auth/callback [exchangeCodeForSession PKCE]
    -> Session établie -> /dashboard
```

### Flux de Recommandation
```
Utilisateur -> /recommendations/new
    Step 1: Sélection/création contact [PERSISTE -> contacts]
    Step 2: Recherche professionnel [SELECT -> profiles WHERE is_professional]
    Step 3: Description + urgence
    -> [INSERT -> recommendations + recommendation_steps]
    -> Professionnel complète les étapes [UPDATE -> recommendation_steps]
    -> Deal conclu [UPDATE -> recommendations.deal_amount]
    -> [DÉCLENCHE] createCommissions()
        -> [INSERT -> commission_transactions] (5 niveaux)
```

### Flux de Retrait
```
Utilisateur -> /wallet/withdraw (client)
    Step 1: Montant + méthode (IBAN/PayPal)
    Step 2: Confirmation
    -> POST /api/wallet/withdraw (serveur)
        -> Validation montant/IBAN/email
        -> Vérification solde [SELECT -> user_wallet_summaries]
        -> [INSERT -> withdrawals]
        -> [UPDATE -> user_wallet_summaries]
    Step 3: Succès
```

### Flux Parrainage
```
Utilisateur A partage son sponsor_code
    -> Utilisateur B s'inscrit avec le code
    -> profiles.sponsor_id = A.id
    -> B fait une recommandation -> deal conclu
    -> createCommissions() remonte la chaîne :
        Niveau 1: A (sponsor direct)
        Niveau 2: Sponsor de A
        ... jusqu'au Niveau 5
```

---

## Matrice de Dépendances

| Module | Auth | Supabase | Profiles | Recommendations | Commissions | Wallet |
|--------|------|----------|----------|-----------------|-------------|--------|
| Dashboard | X | X | - | - | - | - |
| Recommendations | X | X | X | X | X | - |
| Network | X | X | X | - | X | X |
| Wallet | X | X | - | - | X | X |
| Companies | X | X | - | - | - | - |
| Profile | X | X | X | - | - | - |
