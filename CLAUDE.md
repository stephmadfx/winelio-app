# Winelio / Winelio - Instructions pour Claude Code

## Projet
Winelio (nom de marque) / Winelio (nom technique du repo) est une plateforme de recommandations professionnelles avec système MLM (réseau de parrainage à 5 niveaux). Migration depuis React Native + FastAPI vers Next.js + Supabase.

## Stack technique
- **Frontend** : Next.js 15 (App Router, Server Components)
- **Styling** : Tailwind CSS v4 avec @theme (couleurs dans src/app/globals.css)
- **Auth** : Supabase Auth (Magic Link / OTP par email)
- **Base de données** : PostgreSQL via Supabase (self-hosted)
- **Déploiement** : Coolify sur VPS Hostinger (31.97.152.195)
- **Repo** : https://github.com/stephmadfx/winelio-app.git
- **Branche de dev active** : `dev2` → déployée sur https://dev2.winelio.app

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
│   ├── (protected)/          # Routes authentifiées (avec sidebar)
│   │   ├── layout.tsx        # Layout avec sidebar + DemoBanner + AppBackground
│   │   ├── dashboard/        # Tableau de bord
│   │   ├── profile/          # Profil utilisateur
│   │   ├── companies/        # Gestion entreprises
│   │   ├── recommendations/  # Workflow 8 étapes
│   │   ├── network/          # Réseau MLM (arbre 5 niveaux)
│   │   ├── wallet/           # Wallet EUR + Wins
│   │   └── settings/         # Paramètres (thème clair/sombre)
│   ├── gestion-reseau/       # Super admin (role super_admin requis)
│   │   ├── layout.tsx        # AdminLayoutShell (sidebar collapsible)
│   │   ├── page.tsx          # Dashboard admin
│   │   ├── recommandations/  # Liste + détail recommandations
│   │   ├── retraits/         # Gestion des demandes de retrait
│   │   ├── utilisateurs/     # Liste + fiche utilisateurs
│   │   ├── professionnels/   # Liste professionnels avec SIRET
│   │   ├── reseau/           # Arbre MLM global
│   │   └── actions.ts        # Server actions admin
│   ├── auth/
│   │   ├── login/            # Page de connexion (Magic Link)
│   │   └── callback/         # Callback après vérification email
│   ├── api/
│   │   ├── auth/callback/    # Route API callback (PKCE flow)
│   │   └── network/send-invite/ # Envoi email d'invitation parrainage
│   └── page.tsx              # Landing page
├── components/
│   ├── ui/                   # Composants shadcn (dialog, button, etc.)
│   ├── admin/
│   │   ├── AdminLayoutShell.tsx  # Layout admin avec sidebar collapsible
│   │   └── ProfessionnelsTable.tsx
│   ├── referral-buttons.tsx  # Boutons Copier/Inviter/Partager (QR code + email invite)
│   ├── AppBackground.tsx     # Fond animé de l'app
│   ├── sidebar.tsx           # Sidebar desktop
│   ├── mobile-nav.tsx        # Nav bar mobile bas d'écran
│   └── mobile-header.tsx     # Header mobile
├── lib/
│   ├── supabase/
│   │   ├── config.ts         # URL + Anon Key (depuis env vars)
│   │   ├── client.ts         # Client browser
│   │   ├── server.ts         # Client server
│   │   └── admin.ts          # Client admin (service role)
│   └── commission.ts         # Logique calcul commissions MLM
└── middleware.ts              # Protection des routes
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
- `NEXT_PUBLIC_SUPABASE_URL` — https://supabase.aide-multimedia.fr
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clé publique anon
- `SUPABASE_SERVICE_ROLE_KEY` — Clé admin (server-side uniquement)
- `NEXT_PUBLIC_DEMO_MODE` — `"true"` pour afficher le bandeau démo
- `NEXT_PUBLIC_APP_URL` — URL publique de l'app (pour les liens d'invitation)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME` — Config email

### Rôle super_admin
Stocké dans `auth.users.app_metadata.role` (JWT). Jamais dans `profiles`.
Pour attribuer : `PUT /auth/v1/admin/users/{id}` avec `{"app_metadata": {"role": "super_admin"}}`

### Tables de la base de données
| Table | Description |
|-------|-------------|
| profiles | Extends auth.users (nom, phone, sponsor_code, sponsor_id, is_professional) |
| categories | 15 catégories de services (plomberie, électricité, etc.) |
| companies | Entreprises des professionnels (siret, siren, vat_number, is_verified) |
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
| deleted_sponsor_codes | Codes parrain de comptes supprimés (jamais réutilisables) |

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

### Inscription obligatoire par parrainage
**Règle absolue** : impossible de s'inscrire sans code parrain valide. C'est une règle métier fondamentale du MLM. Ne jamais la retirer ni la contourner.

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

## Serveur de développement local
- Port : variable selon les autres projets ouverts — actuellement **3003** (`http://localhost:3003`). Vérifier avec `ps aux | grep "next dev"` ou tester les ports 3000-3010.
- **Après chaque `git push`, relancer le serveur dev** :
  ```bash
  pkill -f "next dev" ; sleep 1 ; cd /Users/steph/PROJETS/WINELIO/winelio && npm run dev &
  ```
- Vérifier que le serveur tourne bien avant de tester dans le navigateur.

## Commandes utiles
```bash
# Build local
npm run build

# Serveur dev (port 3001)
npm run dev

# Relancer le serveur dev (après un push)
pkill -f "next dev" ; sleep 1 ; npm run dev &

# Accéder à la DB Supabase (production sur VPS — container temp-supabase-db)
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec temp-supabase-db psql -U supabase_admin -d postgres"
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
- Le flux auth utilise PKCE (pas implicit) — voir `lib/supabase/client.ts`
- Les operations financieres (retraits) passent par l'API Route serveur `/api/wallet/withdraw`
- Les headers de securite sont configures dans `next.config.ts`
- **Après chaque `git push`, relancer le serveur dev local** (voir commande ci-dessus)

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
