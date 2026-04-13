# Spec — Wizard "Passer Pro"

**Date :** 2026-04-13  
**Projet :** Winelio (`dev2`)  
**Statut :** Approuvé — prêt pour implémentation

---

## Contexte

Actuellement, le passage en mode Pro est un simple toggle `is_professional` dans la page profil, sans aucun formulaire dédié. Aucune information complémentaire n'est collectée (mode de travail, SIRET, catégorie, engagement). L'objectif est d'ajouter un wizard guidé en 3 étapes déclenché lors de l'activation du toggle.

---

## Comportement du toggle

Dans `src/components/profile-form.tsx` :

- **Activer le toggle Pro** → `router.push('/profile/pro-onboarding')` (pas de sauvegarde immédiate)
- **Désactiver le toggle Pro** → sauvegarde directe `is_professional: false` (les données Pro sont conservées)
- **Exception** : si `pro_engagement_accepted === true` (onboarding déjà effectué), le toggle sauvegarde directement dans les deux sens — pas de re-onboarding

---

## Structure du wizard

**Route :** `/profile/pro-onboarding`  
**Architecture :** Server component wrapper + client component wizard

### Étape 1 — Mon activité

**Champ :** `work_mode`  
**UI :** 3 grandes cartes sélectionnables (une seule sélection possible)

| Carte | Valeur DB | Label | Icône |
|-------|-----------|-------|-------|
| Distanciel | `remote` | En ligne | 💻 |
| Présentiel | `onsite` | En personne | 🤝 |
| Les deux | `both` | Flexible | 🌍 |

- Aucune sauvegarde DB à cette étape (stocké dans le state React)
- Le bouton "Suivant" est désactivé tant qu'aucune carte n'est sélectionnée

### Étape 2 — Mon entreprise

**Champs :** `category_id` (obligatoire) + `siret` (fortement recommandé)

- **Catégorie** : select parmi la table `winelio.categories`, obligatoire (bloque le "Suivant" si vide)
- **SIRET** : input texte libre, 14 chiffres, non obligatoire
  - Lien "Je n'ai pas encore de SIRET →" permet de passer l'étape sans renseigner le champ
- **Pré-remplissage** : si l'utilisateur a déjà une entrée dans `companies` (`owner_id = user.id`), les champs sont pré-remplis

### Étape 3 — Engagement

**Texte d'engagement (non modifiable) :**

> "Je m'engage à traiter chaque recommandation avec sérieux et réactivité. Je comprends que chaque lead Winelio est une opportunité concrète d'augmenter mon chiffre d'affaires. Je m'engage à suivre l'avancement de chaque mission directement via l'application Winelio, car c'est ce qui me garantit d'être recommandé à nouveau, de gagner en visibilité et de fidéliser ma clientèle sur le long terme."

- **Checkbox** : "J'ai lu et j'accepte cet engagement — je suis prêt à booster mon activité avec Winelio."
- Checkbox obligatoire — le bouton "Devenir Pro !" est désactivé tant qu'elle n'est pas cochée
- Bouton principal : `🚀 Devenir Pro !` (gradient orange, prominent)

---

## Base de données

### Migration : nouveaux champs dans `winelio.profiles`

```sql
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS work_mode TEXT
    CHECK (work_mode IN ('remote', 'onsite', 'both')),
  ADD COLUMN IF NOT EXISTS pro_engagement_accepted BOOLEAN NOT NULL DEFAULT false;
```

### Table `winelio.companies` (existante — pas de modification de schéma)

Les champs `siret` et `category_id` existent déjà. La logique est :
- Si l'utilisateur n'a **aucune** company → `INSERT` avec siret + category_id + name = `"{prénom} {nom}"`
- Si l'utilisateur en a **au moins une** → `UPDATE` de la première (ORDER BY created_at ASC LIMIT 1) — siret + category_id uniquement, sans toucher au nom

> Note : il n'y a pas de contrainte unique sur `owner_id` dans `companies` (un pro peut avoir plusieurs entreprises). On cible toujours la première company créée pour le pré-remplissage et la mise à jour.

---

## Fichiers à créer / modifier

### Créer

| Fichier | Rôle |
|---------|------|
| `src/app/(protected)/profile/pro-onboarding/page.tsx` | Server component : charge les catégories + le profil + company existante, passe en props au wizard |
| `src/components/ProOnboardingWizard.tsx` | Client component : gère le state des 3 étapes, navigation Précédent/Suivant |

### Modifier

| Fichier | Modification |
|---------|-------------|
| `src/components/profile-form.tsx` | Toggle ON → redirect au lieu de sauvegarder (sauf si `pro_engagement_accepted`) |
| `src/app/(protected)/profile/actions.ts` | Ajouter `completeProOnboarding()` server action |
| `supabase/migrations/` | Nouvelle migration SQL pour `work_mode` + `pro_engagement_accepted` |

---

## Server action `completeProOnboarding()`

```typescript
// Paramètres
{
  work_mode: 'remote' | 'onsite' | 'both'
  category_id: string
  siret: string | null
}

// Étapes
1. profiles.update({ is_professional: true, work_mode, pro_engagement_accepted: true })
2. companies.upsert(
     { owner_id, siret, category_id, name: fallback },
     { onConflict: 'owner_id' }
   )
3. Retourne { error? } | { success: true }
```

Après succès → `router.push('/profile?pro=1')` pour afficher un message de bienvenue.

---

## Réversibilité

| Action | Effet |
|--------|-------|
| Toggle OFF (après onboarding) | `is_professional: false` uniquement — `work_mode`, `pro_engagement_accepted`, company conservés |
| Toggle ON à nouveau | Sauvegarde directe `is_professional: true` — pas de re-onboarding |
| Édition des données Pro | Via `/companies` (page existante) |

---

## Hors scope

- Vérification SIRET via API INSEE (envisageable plus tard)
- Validation format SIRET (14 chiffres) — uniquement côté client, avertissement non bloquant
- Email de bienvenue "Vous êtes Pro" — hors scope v1
- Upload de logo ou photo professionnelle — hors scope v1
