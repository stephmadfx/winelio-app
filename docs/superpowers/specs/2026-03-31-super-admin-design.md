# Super Admin Kiparlo — Design Spec

**Date :** 2026-03-31
**Statut :** Approuvé

---

## Contexte

Interface super admin pour Kiparlo, accessible à un nombre restreint de personnes. Elle offre une vue globale du réseau MLM, des recommandations et des transactions, avec capacité d'intervention sur les éléments critiques.

---

## 1. Architecture & Sécurité

### Route cachée

- URL : `/gestion-reseau` (non listée dans l'UI normale, non évocatrice)
- Si accès non autorisé : redirect silencieux vers `/dashboard` (pas de 404)

### Double protection

1. Session Supabase valide (middleware existant)
2. `profiles.role = 'super_admin'` vérifié dans `middleware.ts`

Chaque Server Action re-vérifie le rôle en début de fonction (défense en profondeur).

### Migration DB

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- Attribuer le rôle super admin
UPDATE profiles SET role = 'super_admin' WHERE id = '<uuid>';
```

### Client Supabase admin

`src/lib/supabase/admin.ts` — client avec `SUPABASE_SERVICE_ROLE_KEY`, server-only, bypass RLS complet.

---

## 2. Structure des fichiers

```
src/
├── lib/supabase/
│   └── admin.ts                        # client service role (server-only)
├── components/admin/
│   └── NetworkTree.tsx                 # arbre MLM (Client Component)
└── app/
    └── gestion-reseau/
        ├── layout.tsx                  # layout admin (sidebar icons + topbar)
        ├── page.tsx                    # dashboard KPIs
        ├── actions.ts                  # toutes les Server Actions admin
        ├── reseau/
        │   └── page.tsx                # arbre MLM interactif
        ├── recommandations/
        │   ├── page.tsx                # liste globale des recommandations
        │   └── [id]/page.tsx           # détail + actions sur une recommandation
        ├── utilisateurs/
        │   ├── page.tsx                # liste des membres
        │   └── [id]/page.tsx           # fiche complète + actions
        └── retraits/
            └── page.tsx                # file des demandes de retrait
```

---

## 3. Layout

**Sidebar icônes (compacte) + topbar**

- Sidebar gauche : icônes de navigation vers les 5 sections, sans texte (compact)
- Topbar : titre de la section courante + email de l'admin connecté
- Thème sombre, couleurs Kiparlo orange/amber

**Sections de navigation (ordre sidebar) :**
1. ⊞ Dashboard (`/gestion-reseau`)
2. ↗ Recommandations (`/gestion-reseau/recommandations`)
3. ⬡ Réseau MLM (`/gestion-reseau/reseau`)
4. 👤 Utilisateurs (`/gestion-reseau/utilisateurs`)
5. 💶 Retraits (`/gestion-reseau/retraits`)

---

## 4. Pages et fonctionnalités

### 4.1 Dashboard (`/gestion-reseau`)

4 KPIs globaux en lecture seule :
- Membres actifs (total `profiles` non suspendus)
- Commissions distribuées (somme `commission_transactions` EARNED)
- Recommandations en cours (count `recommendations` status != terminé)
- Retraits en attente (count `withdrawals` PENDING)

Données fraîches à chaque visite (`cache: 'no-store'`).

### 4.2 Recommandations (`/gestion-reseau/recommandations`)

**Liste :**
- Colonnes : Referrer → Professionnel, Statut, Montant, Étape courante, Actions
- Filtres : statut, étape, date, montant min/max
- Recherche par nom de referrer ou professionnel
- Pagination

**Page détail (`[id]`) :**
- Toutes les infos de la recommandation + historique des étapes
- Actions disponibles :
  - **Avancer une étape** (passe `recommendation_steps.completed = true` pour l'étape ciblée)
  - **Bloquer/débloquer** (change `recommendations.status`)
  - Si avancement à l'étape 6 : déclenche la création des commissions (même logique que le flow normal)

### 4.3 Réseau MLM (`/gestion-reseau/reseau`)

**Arbre interactif (seul Client Component de l'admin) :**
- Lib : `@xyflow/react` (React Flow) — flexible, performant, bien maintenu
- Données chargées côté serveur (tous les profiles avec `id`, `full_name`, `sponsor_id`) puis passées en props au composant client
- Interactions : zoom, drag, clic sur un nœud
- Panel latéral au clic sur un nœud : nom, email, niveau, nb de filleuls, commissions totales, lien vers fiche utilisateur

**Recherche :** champ de recherche qui centre l'arbre sur le nœud correspondant.

### 4.4 Utilisateurs (`/gestion-reseau/utilisateurs`)

**Liste paginée :**
- Colonnes : Nom, Email, Type (pro/particulier), Statut (actif/suspendu), Nb filleuls, Date inscription
- Filtres : type, statut
- Recherche par nom ou email

**Fiche utilisateur (`[id]`) :**
- Profil complet : infos personnelles, sponsor, position dans le réseau
- Wallet : EUR disponible, Wins, historique transactions
- Historique recommandations (en tant que referrer et professionnel)
- Actions :
  - **Suspendre** : `profiles.is_suspended = true` + désactivation Supabase Auth via Admin API
  - **Réactiver** : inverse de la suspension
  - **Ajuster commission manuellement** : crée une `commission_transaction` de type `manual_adjustment` avec montant et motif, recalcule `user_wallet_summaries`

### 4.5 Retraits (`/gestion-reseau/retraits`)

- File des demandes PENDING triée par date
- Colonnes : Membre, Montant, IBAN (masqué sauf 4 derniers chiffres), Date demande
- Actions :
  - **Valider** : `withdrawals.status = 'approved'`, décrémente `user_wallet_summaries.available`
  - **Rejeter** : `withdrawals.status = 'rejected'` + champ `reason` obligatoire, recrédite `available`
  - **Marquer payé** : `withdrawals.status = 'paid'`

---

## 5. Flux de données

### Lecture (Server Components)

```
Page Server Component
  → supabaseAdmin (service role, bypass RLS)
  → PostgreSQL
  → Props vers composants (dont NetworkTree pour l'arbre)
```

### Mutations (Server Actions — `actions.ts`)

```
Server Action
  → Vérification rôle super_admin (re-check)
  → supabaseAdmin
  → Mutation DB
  → revalidatePath() pour rafraîchir la vue
```

### Tableau des actions et effets secondaires

| Action | Table(s) touchée(s) | Effet secondaire |
|--------|---------------------|-----------------|
| Avancer étape reco | `recommendation_steps` | Si étape 6 : crée les `commission_transactions` |
| Bloquer/débloquer reco | `recommendations.status` | — |
| Ajuster commission | `commission_transactions` | Recalcule `user_wallet_summaries` |
| Suspendre utilisateur | `profiles.is_suspended` | Supabase Auth Admin API : désactive l'utilisateur |
| Réactiver utilisateur | `profiles.is_suspended` | Supabase Auth Admin API : réactive l'utilisateur |
| Valider retrait | `withdrawals.status` | Décrémente `user_wallet_summaries.available` |
| Rejeter retrait | `withdrawals.status` + `reason` | Recrédite `user_wallet_summaries.available` |

---

## 6. Hors scope (v1)

- Logs d'audit des actions admin
- Gestion des catégories et steps (tables de config statiques)
- Export CSV
- Notifications email à l'utilisateur après action admin
- Gestion multi-admin avec permissions granulaires

---

## 7. Dépendances à ajouter

- `@xyflow/react` — arbre MLM interactif

---

## 8. Règles de sécurité

- `src/lib/supabase/admin.ts` ne doit jamais être importé dans un Client Component
- Le `SUPABASE_SERVICE_ROLE_KEY` ne transite jamais côté client
- Toute Server Action commence par une vérification du rôle `super_admin`
- La route `/gestion-reseau` n'est jamais liée depuis l'interface utilisateur normale
