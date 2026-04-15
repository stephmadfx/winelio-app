# Parcours recommandation annoté — Super Admin

## Date
2026-04-15

## Contexte

La page de détail d'une recommandation (`/gestion-reseau/recommandations/[id]`) est actuellement fonctionnelle mais minimale : liste verticale d'étapes avec boutons "Valider →", sans possibilité de communication entre admins.

Ce design ajoute une **vue visuelle enrichie du parcours** avec un système d'annotations par étape et une zone de commentaires généraux, inspiré du système d'annotations existant sur les documents légaux.

## Objectif

Permettre aux super admins de suivre visuellement l'avancement d'une recommandation et d'échanger des notes contextuelles attachées à chaque étape ou à la recommandation globalement.

## Design retenu

### Structure de la page

La page est réorganisée en **deux onglets** au-dessus de la timeline :

- **Onglet "Parcours"** (actif par défaut) : timeline verticale enrichie + annotations
- **Onglet "Infos & Actions"** : contenu actuel (statut, boutons de changement de statut)

En entête (commune aux deux onglets) :
- Infos synthèse : referrer, professionnel, montant deal, commission calculée
- Zone **Commentaires généraux** : annotations libres sur la recommandation entière

### Onglet Parcours — Timeline enrichie

Chaque étape est une carte avec :
- **Cercle numéroté** à gauche (vert ✓ si complétée, orange pulsant si active, gris si future)
- **Ligne de connexion** verticale entre les étapes (verte jusqu'à l'étape active, grise après)
- **Carte de l'étape** :
  - Étapes complétées : fond vert subtil, date de complétion, annotations existantes affichées
  - Étape active : fond orange subtil, bordure orange, bouton "Valider →", champ d'ajout d'annotation
  - Étapes futures : grisées, non interactives, pas de champ annotation
- **Annotations inline** : affichées sous le titre de l'étape, colorées par auteur (couleur fixe par admin, même logique que DocumentViewer), icône 🗑 visible uniquement sur les annotations de l'admin connecté

### Système d'annotations

Deux niveaux :

1. **Annotations par étape** — liées à `recommendation_step_id`
2. **Commentaires généraux** — liés à `recommendation_id` (sans étape)

Règles :
- Un admin peut ajouter autant d'annotations qu'il veut sur n'importe quelle étape (complétée ou active)
- Un admin peut supprimer uniquement ses propres annotations
- Pas d'édition (traçabilité)
- Affichage : `Auteur · date · contenu` + icône 🗑 si auteur = admin connecté

## Table DB — `recommendation_annotations`

```sql
CREATE TABLE winelio.recommendation_annotations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id         UUID NOT NULL REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  recommendation_step_id    UUID REFERENCES winelio.recommendation_steps(id) ON DELETE CASCADE,
  -- NULL = commentaire général sur la recommandation
  author_id                 UUID NOT NULL REFERENCES winelio.profiles(id),
  content                   TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reco_annotations_reco_id
  ON winelio.recommendation_annotations(recommendation_id, created_at);

ALTER TABLE winelio.recommendation_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_reco_annotations"
  ON winelio.recommendation_annotations FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  );
```

`recommendation_step_id` est nullable : `NULL` = commentaire général, valeur = annotation sur une étape précise.

## Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `supabase/migrations/20260415_recommendation_annotations.sql` | Migration DB |
| `src/app/gestion-reseau/recommandations/[id]/actions.ts` | Server Actions : `addRecoAnnotation`, `deleteRecoAnnotation` |
| `src/components/admin/RecoJourneyView.tsx` | Composant Client : onglets + timeline + annotations |

## Fichiers à modifier

| Fichier | Modification |
|---------|--------------|
| `src/app/gestion-reseau/recommandations/[id]/page.tsx` | Charger les annotations en DB, récupérer l'ID de l'admin connecté via `createClient().auth.getUser()`, passer tout au composant `RecoJourneyView` |

## Composant `RecoJourneyView`

Composant Client (`"use client"`) qui reçoit :

```typescript
type Props = {
  reco: RecoWithRelations;
  steps: StepRow[];
  annotations: AnnotationRow[];  // toutes les annotations (step + générales)
  currentAdminId: string;
  onAddAnnotation: (recommendationId: string, stepId: string | null, content: string) => Promise<void>;
  onDeleteAnnotation: (annotationId: string) => Promise<void>;
  onAdvanceStep: (recommendationId: string, stepId: string) => Promise<void>;
  onToggleStatus: (recommendationId: string, status: string) => Promise<void>;
};
```

Les types de base :
- `RecoWithRelations` : ligne `recommendations` avec joins `referrer`, `professional`, `recommendation_steps` (chacun avec `step:steps(order_index, name)`)
- `StepRow` : `{ id, completed_at, step: { order_index, name } }`
- `AnnotationRow` : `{ id, recommendation_step_id, content, created_at, author: { id, first_name, last_name } }`

State interne :
- `activeTab: "parcours" | "actions"` — onglet actif
- `pendingStepId: string | null` — étape en cours de validation (optimistic UI)
- `deletingId: string | null` — annotation en cours de suppression

Couleurs des auteurs : même logique que `DocumentViewer` — tableau `AUTHOR_COLORS` attribué par ordre d'apparition.

## Server Actions — `actions.ts` (nouveau fichier dédié)

```typescript
// src/app/gestion-reseau/recommandations/[id]/actions.ts

export async function addRecoAnnotation(
  recommendationId: string,
  stepId: string | null,  // null = commentaire général
  content: string
): Promise<void>

export async function deleteRecoAnnotation(
  annotationId: string
): Promise<void>
// Vérifie que l'auteur = admin connecté avant de supprimer
```

Les actions existantes (`advanceRecommendationStep`, `toggleRecommendationStatus`) restent dans `src/app/gestion-reseau/actions.ts`.

## Sécurité

- `assertSuperAdmin()` dans chaque Server Action (même helper que `actions.ts`)
- `deleteRecoAnnotation` vérifie `author_id = currentUser.id` avant de supprimer (double garde : RLS + applicatif)
- `content` limité à 1000 caractères (contrainte DB + validation côté action)

## Hors périmètre

- Notifications entre admins (mentions `@`)
- Édition d'une annotation existante
- Export des annotations
- Annotations côté utilisateur (professionnel ou referrer)
