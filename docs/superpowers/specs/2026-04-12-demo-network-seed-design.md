# Spec — Réseau démo automatique à l'inscription

**Date** : 2026-04-12  
**Projet** : Winelio  
**Statut** : Approuvé, prêt pour implémentation

---

## Contexte

Chaque nouveau filleul (inscrit via un lien de parrainage) doit recevoir automatiquement un réseau fictif d'environ 60 personnes réparties sur 5 niveaux, avec des recommandations en cours et validées. L'objectif est de lui faire vivre l'expérience complète de l'application dès la première connexion.

Ce réseau reste actif tant que `NEXT_PUBLIC_DEMO_MODE=true`. L'utilisateur peut le supprimer manuellement. En production (DEMO_MODE désactivé), toutes les données demo sont purgées globalement.

---

## Architecture générale

### Déclencheur

La création du réseau demo se déclenche lors de la **première complétion du profil** (sauvegarde avec `first_name` + `last_name` renseignés pour la première fois, alors qu'ils étaient vides avant).

Point d'accroche : page `/settings` ou `/profile` → action serveur de sauvegarde → appel fire-and-forget à `/api/demo/seed-network`.

### Cœur technique

Une fonction PostgreSQL `winelio.seed_demo_network(p_user_id uuid)` génère tout en une seule transaction DB :
- ~60 faux profils dans `winelio.profiles`
- Recommandations dans `winelio.recommendations`
- Commissions dans `winelio.commission_transactions`
- Mise à jour du `winelio.user_wallet_summaries` du vrai utilisateur

Appelée via `supabaseAdmin.rpc('seed_demo_network', { p_user_id })`. Durée estimée : < 500ms.

---

## Migration DB (015_demo_network.sql)

### Colonnes ajoutées

```sql
-- Identifie un profil fictif
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_owner_id uuid REFERENCES winelio.profiles(id) ON DELETE CASCADE;

-- Identifie une recommandation fictive
ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Identifie une commission fictive
ALTER TABLE winelio.commission_transactions
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
```

### Fonction seed_demo_network

La fonction SQL :
1. Génère 8 profils N1 (filleuls directs du vrai user), avec `sponsor_id = p_user_id`
2. Génère 18 profils N2 répartis sur les N1
3. Génère 14 profils N3 répartis sur certains N2
4. Génère 12 profils N4 répartis sur certains N3
5. Génère 8 profils N5 feuilles
6. Pour N1 et N2 : crée 1-3 recommandations par profil (voir distribution statuts)
7. Pour les recos QUOTE_VALIDATED/COMPLETED : crée des `commission_transactions` de type `referral_level_N` pour le vrai user (statut EARNED)
8. Met à jour `user_wallet_summaries` du vrai user (total_earned, pending_commissions)

Tous les profils sont marqués `is_demo = true`, `demo_owner_id = p_user_id`.

### Fonction purge_demo_network

La FK `demo_owner_id` sur `profiles` ne cascade pas automatiquement vers `recommendations` (qui référence `referrer_id`). La purge est donc explicite par flag `is_demo` :

```sql
CREATE OR REPLACE FUNCTION winelio.purge_demo_network(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 1. Supprimer les commissions is_demo liées aux recos demo
  DELETE FROM winelio.commission_transactions
    WHERE is_demo = true
      AND recommendation_id IN (
        SELECT id FROM winelio.recommendations
        WHERE is_demo = true
          AND referrer_id IN (
            SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id
          )
      );
  -- 2. Supprimer les commissions is_demo du vrai user (commissions réseau)
  DELETE FROM winelio.commission_transactions
    WHERE user_id = p_user_id AND is_demo = true;
  -- 3. Supprimer les recommandations demo
  DELETE FROM winelio.recommendations
    WHERE is_demo = true
      AND referrer_id IN (
        SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id
      );
  -- 4. Supprimer les profils demo
  DELETE FROM winelio.profiles WHERE demo_owner_id = p_user_id;
  -- 5. Recalculer le wallet (uniquement sur les vraies données)
  UPDATE winelio.user_wallet_summaries SET
    total_earned = COALESCE((
      SELECT SUM(amount) FROM winelio.commission_transactions
      WHERE user_id = p_user_id AND status = 'EARNED' AND is_demo = false
    ), 0),
    pending_commissions = COALESCE((
      SELECT SUM(amount) FROM winelio.commission_transactions
      WHERE user_id = p_user_id AND status = 'PENDING' AND is_demo = false
    ), 0)
  WHERE user_id = p_user_id;
END;
$$;
```

---

## Distribution des profils demo

| Niveau | Nombre | % Pros | Recommandations |
|--------|--------|--------|-----------------|
| N1 | 8 | 50% | 2-3 recos chacun |
| N2 | 18 | 40% | 1-2 recos chacun |
| N3 | 14 | 30% | quelques-uns |
| N4 | 12 | 20% | aucune |
| N5 | 8 | 10% | aucune |
| **Total** | **~60** | | |

### Distribution des statuts de recommandations

- **30% PENDING** : demandes reçues, pas encore acceptées
- **40% en cours** : ACCEPTED / CONTACT_MADE / MEETING_SCHEDULED / QUOTE_SUBMITTED
- **30% validées** : QUOTE_VALIDATED / COMPLETED (génèrent des commissions EARNED)

### Montants

- Recommandations : 800€ à 15 000€ (travaux du bâtiment réalistes)
- Commissions résultantes pour le vrai user : ~500-1000€ total_earned, ~200-400€ pending

### Données fictives embarquées dans la fonction SQL

- **Prénoms** : 30 prénoms français courants (Marie, Thomas, Sophie, Pierre…)
- **Noms** : 30 noms français courants (Martin, Bernard, Dubois, Moreau…)
- **Villes** : 20 villes françaises (Lyon, Marseille, Bordeaux, Nantes…)
- **Catégories entreprises** : issues de la table `winelio.categories` (plomberie, électricité, etc.)
- **Descriptions recos** : 10 descriptions génériques ("Rénovation salle de bain", "Installation électrique"…)
- **Emails** : `demo_<8 chars random>@winelio-demo.internal` (exclus des notifications)

---

## API Routes

### POST /api/demo/seed-network

Déclenché depuis le frontend après la première complétion du profil.

```
Guards :
- DEMO_MODE doit être true
- User authentifié
- Profil pas encore seedé (COUNT profiles WHERE demo_owner_id = user.id = 0)
- Profil complet (first_name et last_name non vides)

Action :
- supabaseAdmin.rpc('seed_demo_network', { p_user_id: user.id })
- Retourne { success: true } immédiatement (ou { already_seeded: true })
```

### GET /api/demo/status

Retourne l'état du seeding pour le user connecté.

```
Retourne :
- { status: 'none' }      — pas encore déclenché
- { status: 'ready' }     — COUNT demo profiles > 0
- { status: 'unavailable' } — DEMO_MODE = false
```

### DELETE /api/demo/seed-network

Purge le réseau demo du user connecté.

```
Guards : DEMO_MODE = true, user authentifié
Action : supabaseAdmin.rpc('purge_demo_network', { p_user_id: user.id })
```

---

## Frontend

### Détection de la première complétion du profil

Dans la server action (ou API route) de sauvegarde du profil :
1. Lire le profil avant update → vérifier que `first_name` était `null`
2. Après update réussi → si premier renseignement → retourner `{ firstCompletion: true }` au client
3. Le client déclenche le seed et affiche le banner

### Banner de progression

Composant `DemoSeedBanner` affiché dans le layout `(protected)` :

**État "en cours"** (pendant le seeding, polling /api/demo/status toutes les 2s) :
```
🚀  Votre réseau démo est en cours de création...
    Cela vous permettra de vivre l'expérience complète de Winelio.    [×]
```
Style : fond amber clair, bordure gauche winelio-amber, spinner animé.

**État "prêt"** :
```
✅  Votre réseau démo est prêt ! Découvrez ce que Winelio peut vous apporter.
    [Voir mon réseau →]                                                [×]
```
Style : fond orange clair, bordure gauche winelio-orange.

**Persistance** : `localStorage` clé `demo_seed_status` = `pending` | `ready` | `dismissed`. Si dismissed, le banner ne réapparaît pas.

### Badge "Demo" sur les profils fictifs

API `/api/network/children` retourne déjà les données des profils. Il faudra inclure `is_demo` dans le payload.

- **NetworkGraph** (`NodeView`) : pastille `DEMO` orange pâle, petite, en bas à gauche du cercle
- **NetworkTree** (`TreeNodeRow`) : badge `DEMO` en gris clair à côté du nom
- **Liste filleuls directs** (page `/network`) : badge `Demo` discret en gris

Tooltip (desktop) : "Profil de démonstration — sera remplacé par vos vrais filleuls"

### Bouton de purge (Settings)

Dans `/settings`, nouvelle carte "Réseau démo" visible uniquement si `DEMO_MODE = true` :
- Texte explicatif
- Bouton "Supprimer les données demo" (rouge outline)
- Dialog de confirmation avant suppression
- Après suppression : router.refresh() + localStorage `demo_seed_status = null`

---

## Notifications email

Le filtre existant dans `notify-new-referral.ts` :
```typescript
if (!email || email.endsWith("@winelio-pro.fr")) continue;
```
Doit être étendu à :
```typescript
if (!email || email.endsWith("@winelio-pro.fr") || email.endsWith("@winelio-demo.internal")) continue;
```
Ainsi les faux profils ne génèrent aucune notification email.

---

## Purge globale en production

Quand `DEMO_MODE` passe à `false`, une route admin ou un script exécute :
```sql
DELETE FROM winelio.profiles WHERE is_demo = true;
-- Le CASCADE sur demo_owner_id et les FK existantes nettoient le reste
-- Puis recalculer tous les wallets affectés
```

Les vrais filleuls (ceux qui ont rejoint manuellement via un lien) ne sont jamais touchés (`is_demo = false`).

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `supabase/migrations/015_demo_network.sql` | Créer — colonnes + fonctions SQL |
| `src/app/api/demo/seed-network/route.ts` | Créer — POST + DELETE |
| `src/app/api/demo/status/route.ts` | Créer — GET |
| `src/app/api/network/children/route.ts` | Modifier — ajouter `is_demo` au payload |
| `src/components/network-graph.tsx` | Modifier — badge Demo sur NodeView |
| `src/components/network-tree.tsx` | Modifier — badge Demo sur TreeNodeRow |
| `src/app/(protected)/network/page.tsx` | Modifier — badge Demo dans liste filleuls |
| `src/components/DemoSeedBanner.tsx` | Créer — banner de progression |
| `src/app/(protected)/layout.tsx` | Modifier — intégrer DemoSeedBanner |
| `src/app/(protected)/settings/page.tsx` | Modifier — carte purge demo |
| `src/lib/notify-new-referral.ts` | Modifier — filtre email étendu |
| `src/app/(protected)/profile/actions.ts` | Modifier — détection firstCompletion + appel seed |
