# Kiparlo - Instructions pour Claude Code

## Projet
Kiparlo est une plateforme de recommandations professionnelles avec système MLM (réseau de parrainage à 5 niveaux). Migration depuis React Native + FastAPI vers Next.js + Supabase.

## Stack technique
- **Frontend** : Next.js 15 (App Router, Server Components)
- **Styling** : Tailwind CSS v4 avec @theme (couleurs dans src/app/globals.css)
- **Auth** : Supabase Auth (Magic Link / OTP par email)
- **Base de données** : PostgreSQL via Supabase (self-hosted)
- **Déploiement** : Coolify sur VPS Hostinger (31.97.152.195)
- **Repo** : https://github.com/stephmadfx/kiparlo.git

## Couleurs Kiparlo
- Orange : #FF6B35 (`kiparlo-orange`)
- Amber : #F7931E (`kiparlo-amber`)
- Dark : #2D3436 (`kiparlo-dark`)
- Gray : #636E72 (`kiparlo-gray`)
- Light : #F8F9FA (`kiparlo-light`)

## Architecture des dossiers
```
src/
├── app/
│   ├── (protected)/          # Routes authentifiées (avec sidebar)
│   │   ├── layout.tsx        # Layout avec sidebar
│   │   ├── dashboard/        # Tableau de bord
│   │   ├── profile/          # Profil utilisateur
│   │   ├── companies/        # Gestion entreprises
│   │   ├── recommendations/  # Workflow 8 étapes
│   │   ├── network/          # Réseau MLM (arbre 5 niveaux)
│   │   └── wallet/           # Wallet EUR + Wins
│   ├── auth/
│   │   ├── login/            # Page de connexion (Magic Link)
│   │   └── callback/         # Callback après vérification email
│   ├── api/auth/callback/    # Route API callback (PKCE flow)
│   └── page.tsx              # Landing page
├── components/               # Composants réutilisables
├── lib/
│   ├── supabase/
│   │   ├── config.ts         # URL + Anon Key (depuis env vars)
│   │   ├── client.ts         # Client browser
│   │   └── server.ts         # Client server
│   └── commission.ts         # Logique calcul commissions MLM
└── middleware.ts              # Protection des routes
```

## Supabase (self-hosted sur VPS)
- **URL API (Kong)** : http://supabasekong-r9bbynb4m22odtnie78je6fx.31.97.152.195.sslip.io
- **Container DB** : supabase-db-r9bbynb4m22odtnie78je6fx
- **Container Auth** : supabase-auth-r9bbynb4m22odtnie78je6fx

### Variables d'environnement (dans Coolify, PAS dans le code)
- `NEXT_PUBLIC_SUPABASE_URL` — URL du Kong API Gateway
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clé publique anon
- `SUPABASE_SERVICE_ROLE_KEY` — Clé admin (server-side uniquement)

### Tables de la base de données
| Table | Description |
|-------|-------------|
| profiles | Extends auth.users (nom, phone, sponsor_code, sponsor_id, is_professional) |
| categories | 15 catégories de services (plomberie, électricité, etc.) |
| companies | Entreprises des professionnels |
| contacts | Prospects pour les recommandations |
| compensation_plans | Plans de commission (taux, pourcentages par niveau) |
| steps | 8 étapes du workflow de recommandation |
| recommendations | Recommandations (referrer → professional, statut, montant) |
| recommendation_steps | Junction table (étape complétée ou non, données associées) |
| commission_transactions | Commissions (type, level, montant, statut PENDING/EARNED) |
| user_wallet_summaries | Cache dénormalisé du wallet (EUR + Wins) |
| withdrawals | Demandes de retrait |
| devices | Tokens push notification |
| audit_logs | Journal d'audit |

### Triggers Supabase
- `on_auth_user_created` : auto-crée le profil + wallet summary à l'inscription
- `update_*_updated_at` : met à jour le champ updated_at automatiquement

### RLS (Row Level Security)
Toutes les tables ont des politiques RLS actives. Les utilisateurs ne voient que leurs propres données (sauf profiles et categories qui sont publics en lecture).

## Logique métier

### Auth (Magic Link)
1. User entre son email → `signInWithOtp()` → email envoyé via SMTP o2switch
2. User clique le lien → Supabase vérifie → redirige vers `/auth/callback`
3. Callback page gère le token (hash fragment ou PKCE code) → session créée → redirect `/dashboard`

### Workflow de recommandation (8 étapes)
1. Recommandation reçue (auto)
2. Acceptée par le professionnel
3. Contact établi
4. Rendez-vous fixé
5. Devis soumis (avec montant)
6. **Devis validé** → déclenche la création des commissions (PENDING → EARNED)
7. Paiement reçu
8. Affaire terminée

### Système MLM (5 niveaux)
- Chaque user a un `sponsor_code` unique (6 chars)
- `sponsor_id` pointe vers le parrain
- Quand une reco est validée (étape 6) :
  - Referrer reçoit 60% de la commission
  - Niveau 1 (sponsor du referrer) : 4%
  - Niveau 2-5 : 4% chacun
  - Affiliation bonus (sponsor du pro) : 1%
  - Cashback pro (en Wins) : 1%
  - Plateforme : 14%

### Wallet
- **EUR** : total_earned, total_withdrawn, pending_commissions, available
- **Wins** : total_wins, available_wins, redeemed_wins (monnaie interne)

## VPS Hostinger
- **IP** : 31.97.152.195
- **SSH** : root / 04660466aA@@@
- **Coolify** : http://31.97.152.195:8000 (contact@aide-multimedia.fr / 04660466aA@@@)
- **SMTP** : dahu.o2switch.net port 587 (contact@aide-multimedia.fr)

## Commandes utiles
```bash
# Build local
npm run build

# Accéder à la DB Supabase
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-r9bbynb4m22odtnie78je6fx psql -U supabase_admin -d postgres"

# Voir les logs auth
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker logs supabase-auth-r9bbynb4m22odtnie78je6fx 2>&1 | tail -20"

# Voir les containers Supabase
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker ps --filter name=supabase --format 'table {{.Names}}\t{{.Status}}'"
```

## Code source de l'ancien développeur
Décompressé dans `/Users/steph/PROJETS/WINKO/_old_app/` (frontend React Native) et `/Users/steph/PROJETS/WINKO/_old_backend/` (backend FastAPI + backoffice Nuxt). À utiliser comme référence pour la logique métier.

## Règles
- Ne jamais commiter de credentials dans le code (utiliser les env vars Coolify)
- Les `NEXT_PUBLIC_*` doivent être des "Build Variables" dans Coolify
- Le config.ts applique `.replace(/\s/g, "")` pour nettoyer les espaces parasites des env vars
- Toujours tester le build (`npm run build`) avant de push
