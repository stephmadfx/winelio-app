# Spec — Organigramme du processus de recommandation

**Date** : 2026-04-23  
**Statut** : Approuvé  
**Auteur** : Steph

---

## Objectif

Ajouter une page dédiée dans le dashboard super administrateur qui affiche l'organigramme complet du processus de recommandation Winelio. La page est purement documentaire (générique, pas liée à une recommandation spécifique) et permet à l'administrateur d'ajouter des notes sur chaque nœud du diagramme.

---

## Emplacement dans l'application

- **Route** : `/gestion-reseau/processus`
- **Accès** : Super administrateur uniquement (garanti par le layout `/gestion-reseau`)
- **Menu** : Nouvel élément dans `AdminSidebar` avec une icône et le libellé "Processus"

---

## Architecture

### Fichiers à créer

| Fichier | Rôle |
|---|---|
| `src/app/gestion-reseau/processus/page.tsx` | Page serveur — charge les notes existantes depuis Supabase |
| `src/app/gestion-reseau/processus/actions.ts` | Server actions — ajout et suppression de notes |
| `src/components/admin/RecoFlowchart.tsx` | Composant React Flow du flowchart (Client Component) |
| `src/components/admin/FlowAnnotationDialog.tsx` | Dialog shadcn pour consulter/ajouter une note |
| `supabase/migrations/20260423_process_flow_annotations.sql` | Migration — nouvelle table `process_flow_annotations` |

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `src/components/admin/AdminSidebar.tsx` | Ajouter l'entrée de menu "Processus" |

---

## Base de données

### Nouvelle table : `winelio.process_flow_annotations`

```sql
CREATE TABLE winelio.process_flow_annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     text NOT NULL,
  content     text NOT NULL,
  author_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS : lecture par tout super_admin, écriture par l'auteur uniquement
ALTER TABLE winelio.process_flow_annotations ENABLE ROW LEVEL SECURITY;
```

`node_id` est une chaîne libre correspondant à l'identifiant du nœud dans le flowchart (ex : `"etape-2"`, `"email-inscrit"`, `"commissions"`, etc.).

---

## Composant React Flow — `RecoFlowchart.tsx`

### Technologie
`@xyflow/react` v12 (déjà installé). Le flowchart est **statique** : `nodesDraggable: false`, `nodesConnectable: false`, `panOnDrag: true`, `zoomOnScroll: true`.

### Types de nœuds custom

| Type | Couleur | Usage |
|---|---|---|
| `start-end` | Orange `#FF6B35` / Vert `#27AE60` | Départ et fin |
| `action` | Blanc, bordure `#2D3436` | Étapes numérotées + revendication |
| `action-orange` | Blanc, bordure `#FF6B35` | Étape 5 (devis — déclenche les commissions) |
| `email` | Orange `#F7931E` | Emails automatiques |
| `tracking` | Bleu clair `#EBF5FB`, bordure pointillée | Suivi ouverture et clic |
| `decision` | Blanc, bordure bleue `#2980B9` | Losanges de décision |
| `decision-orange` | Blanc, bordure `#FF6B35` | Losange validation devis |
| `commissions` | Dark `#2D3436` | Bloc commissions MLM |
| `negative` | Rouge clair `#FDECEA` | Fins négatives (rejetée, annulée) |

Chaque nœud custom affiche un badge 💬 dans son coin supérieur droit si des notes existent pour ce `node_id`.

### Structure des données du flowchart

Les nœuds et les edges sont définis en tant que constantes TypeScript dans `RecoFlowchart.tsx`. Ils ne sont jamais stockés en base — seules les annotations le sont.

### Nœuds du flowchart (dans l'ordre)

| node_id | Libellé | Type |
|---|---|---|
| `depart` | Le recommandeur crée une recommandation | `start-end` |
| `pro-inscrit` | Professionnel déjà inscrit ? | `decision` |
| `email-inscrit` | Email "Nouvelle recommandation" | `email` |
| `email-non-inscrit` | Email "Un client vous recommande" | `email` |
| `ouverture-inscrit` | Email ouvert (professionnel inscrit) | `tracking` |
| `ouverture-non-inscrit` | Email ouvert (professionnel non inscrit) | `tracking` |
| `clic-inscrit` | Bouton cliqué dans l'email | `tracking` |
| `revendication` | Revendication de fiche | `action` |
| `clic-non-inscrit` | Bouton cliqué dans l'email | `tracking` |
| `acceptation` | Le professionnel accepte ? | `decision` |
| `rejetee` | Rejetée | `negative` |
| `etape-2` | Étape 2 — Recommandation acceptée | `action` |
| `etape-3` | Étape 3 — Contact établi | `action` |
| `etape-4` | Étape 4 — Rendez-vous fixé | `action` |
| `etape-5` | Étape 5 — Devis soumis | `action-orange` |
| `devis` | Le recommandeur valide le devis ? | `decision-orange` |
| `annulee` | Annulée | `negative` |
| `commissions` | Commissions créées automatiquement — 5 niveaux | `commissions` |
| `email-commission` | Email "Commission à régler" | `email` |
| `etape-7` | Étape 7 — Paiement confirmé | `action` |
| `fin` | Étape 8 — Affaire terminée | `start-end` (vert) |

---

## Dialog d'annotation — `FlowAnnotationDialog.tsx`

Composant Dialog shadcn déclenché par le clic sur un nœud React Flow.

### Contenu
- **En-tête** : titre du nœud cliqué, fond dégradé orange Winelio
- **Informations du nœud** : libellé et node_id dans un encadré gris
- **Liste des notes existantes** : triées par `created_at` DESC, chacune avec auteur + date + texte
- **Zone de saisie** : textarea pour une nouvelle note
- **Actions** : Annuler | Enregistrer (appelle la server action `addFlowAnnotation`)

### Suppression
Chaque note peut être supprimée (bouton ✕) par tout super administrateur — la page étant réservée aux super admins, aucune distinction d'auteur n'est nécessaire.

---

## Server Actions — `actions.ts`

```typescript
// Ajouter une note sur un nœud
addFlowAnnotation(nodeId: string, content: string): Promise<void>

// Supprimer une note
deleteFlowAnnotation(annotationId: string): Promise<void>
```

Les deux actions vérifient que l'utilisateur est super administrateur avant d'agir.

---

## Page serveur — `page.tsx`

Charge toutes les annotations au rendu côté serveur :

```typescript
const annotations = await supabaseAdmin
  .schema("winelio")
  .from("process_flow_annotations")
  .select("id, node_id, content, created_at, author:profiles!author_id(first_name, last_name)")
  .order("created_at", { ascending: false })
```

Passe `annotations` au composant `RecoFlowchart` qui les distribue à chaque nœud selon `node_id`.

---

## Menu — `AdminSidebar.tsx`

Ajouter une entrée entre "Réseau" et "Bugs" :

```typescript
{ href: "/gestion-reseau/processus", label: "Processus", icon: GitBranch }
```

---

## Migration SQL

```sql
-- supabase/migrations/20260423_process_flow_annotations.sql
CREATE TABLE winelio.process_flow_annotations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    text NOT NULL,
  content    text NOT NULL,
  author_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON winelio.process_flow_annotations (node_id);

ALTER TABLE winelio.process_flow_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON winelio.process_flow_annotations
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  );
```

---

## Ce qui est déjà en place dans le code

Tout le processus représenté dans le flowchart est déjà implémenté :

| Élément | Fichier |
|---|---|
| Création de recommandation | `/api/recommendations/create/route.ts` |
| Email pro inscrit + non inscrit | `lib/notify-new-recommendation.ts` |
| Suivi ouverture `email_opened_at` | `/api/email-track/open/route.ts` |
| Suivi clic `email_clicked_at` | `/api/email-track/click/route.ts` |
| Revendication de fiche | `/api/claim/finalize/route.ts` |
| Étapes 1→8 + validation devis | `/api/recommendations/complete-step/route.ts` |
| Commissions MLM 5 niveaux | `lib/commission.ts` |
| Email commission + relances | `lib/notify-commission-payment.ts` |

La page organigramme est donc **uniquement une couche de visualisation** — elle ne modifie aucune logique métier existante.

---

## Hors périmètre

- Lier l'organigramme à une recommandation spécifique (suivi en temps réel d'une reco)
- Modifier les étapes depuis l'organigramme
- Export PDF ou image du diagramme
