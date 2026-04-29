# Spec — Organigramme du processus de recommandation

**Date** : 2026-04-23  
**Statut** : Approuvé  
**Auteur** : Steph

---

## Objectif

> **Dernière mise à jour : 2026-04-29** — Spec mise à jour pour correspondre au code implémenté (SVG pur, nouveaux nœuds cron/refus/étape 6, EmailPreviewDialog).

Ajouter une page dédiée dans le dashboard super administrateur qui affiche l'organigramme complet du processus de recommandation Winelio. La page est purement documentaire (générique, pas liée à une recommandation spécifique) et permet à l'administrateur d'ajouter des notes sur chaque nœud du diagramme.

---

## Emplacement dans l'application

- **Route** : `/gestion-reseau/processus`
- **Accès** : Super administrateur uniquement (garanti par le layout `/gestion-reseau`)
- **Menu** : Nouvel élément dans `AdminLayoutShell` (sidebar admin) avec une icône et le libellé "Processus"

---

## Architecture

### Fichiers créés

| Fichier | Rôle |
|---|---|
| `src/app/gestion-reseau/processus/page.tsx` | Page serveur — charge les notes existantes depuis Supabase |
| `src/app/gestion-reseau/processus/actions.ts` | Server actions — ajout et suppression de notes |
| `src/components/admin/RecoFlowchart.tsx` | Composant SVG interactif du flowchart (Client Component) — pan/zoom custom |
| `src/components/admin/RecoFlowchartClient.tsx` | Wrapper dynamic import (SSR: false) pour éviter les erreurs SSR |
| `src/components/admin/FlowAnnotationDialog.tsx` | Dialog shadcn pour consulter/ajouter une note |
| `src/components/admin/EmailPreviewDialog.tsx` | Dialog de prévisualisation des templates email (ouvert au clic sur un nœud email) |
| `supabase/migrations/20260423_process_flow_annotations.sql` | Migration — nouvelle table `process_flow_annotations` |

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/components/admin/AdminLayoutShell.tsx` | Ajouter l'entrée de menu "Processus" |
| `src/components/admin/AdminSidebar.tsx` | Ajouter l'entrée de menu "Processus" (sidebar héritée) |

---

## Base de données

### Nouvelle table : `winelio.process_flow_annotations`

```sql
CREATE TABLE winelio.process_flow_annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     text NOT NULL,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  author_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON winelio.process_flow_annotations (node_id);
ALTER TABLE winelio.process_flow_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON winelio.process_flow_annotations
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
```

`node_id` est une chaîne libre correspondant à l'identifiant du nœud dans le flowchart (ex : `"etape-2"`, `"email-inscrit"`, `"commissions"`, etc.).

---

## Composant SVG — `RecoFlowchart.tsx`

### Technologie
**SVG pur** (pas React Flow). Pan/zoom custom avec gestion via refs + scaling CSS. Le flowchart est **statique** (drag pour pan, molette pour zoom, clic sur nœud).

- `SVG_W = 1200`, `SVG_H = 1240` — dimensions du viewport
- Zoom molette, pan par drag, boutons +/-/⊙ pour contrôles
- `MIN_SCALE = 0.15`, `MAX_SCALE = 3`, scale initial `~0.65`
- Nœuds email → ouvrent `EmailPreviewDialog` au clic (ID dans `EMAIL_NODE_TYPES`)
- Autres nœuds → ouvrent `FlowAnnotationDialog`

### Helpers SVG

| Helper | Description |
|---|---|
| `PillNode` | Forme ovale (départ/fin) — fond orange ou vert |
| `RectNode` | Rectangle arrondi — pour actions, emails, tracking, commissions |
| `DiamondNode` | Losange — pour les décisions (inscrit ?, accepte ?) |
| `NegNode` | Rectangle rouge bordure rouge — pour fins négatives |
| `Badge` | Cercle orange avec 💬 — annotations existantes |

### Légende

| Couleur | Libellé |
|---|---|
| 🟠 Orange plein | Départ / Fin |
| ⬜ Blanc bordure foncée | Étape / Action |
| 🟠 Orange foncé | Email automatique |
| 🟡 Jaune (F59E0B) | Relance automatique (cron) |
| 🔵 Bleu clair pointillé | Suivi automatique |
| 🔵 Losange bleu | Décision |
| ⬛ Gris foncé | Commissions |
| 🔴 Rouge clair | Fin négative |

### Nœuds du flowchart (dans l'ordre)

| node_id | Libellé | Type visuel |
|---|---|---|
| `depart` | ✨ Le recommandeur crée une recommandation | Orange pill |
| `pro-inscrit` | Professionnel déjà inscrit ? | Losange bleu |
| `email-inscrit` | 📧 "Nouvelle recommandation" — Email connexion + email pro | Orange rect |
| `email-non-inscrit` | 📧 "Un client vous recommande" — Bouton "Revendiquer ma fiche" | Orange rect |
| `ouverture-inscrit` | 👁 Email ouvert — email_opened_at enregistré (1ère fois) | Bleu pointillé |
| `ouverture-non-inscrit` | 👁 Email ouvert — email_opened_at enregistré (1ère fois) | Bleu pointillé |
| `cron-condition-1` | ⏱ H+12 · si email non ouvert | Jaune pointillé |
| `cron-relance` | 📧 Relance → pro scrappé — 1 envoi max | Orange rect |
| `cron-condition-2` | ⏱ H+36 · si toujours non ouvert | Jaune pointillé |
| `cron-alerte` | 📭 Alerte → recommandeur — CTA "Recommander un autre pro" | Orange rect |
| `clic-inscrit` | 👆 Bouton cliqué dans l'email — redirection vers la reco | Bleu pointillé |
| `revendication` | 🔗 Revendication de fiche — Le pro s'inscrit et valide sa fiche | Blanc rect |
| `clic-non-inscrit` | 👆 Bouton cliqué dans l'email — déclenche la revendication | Bleu pointillé |
| `acceptation` | Le pro accepte ? | Losange bleu |
| `rejetee` | ❌ Rejetée | Rouge rect |
| `email-refus` | 📧 Reco déclinée → Recommandeur — CTA "Recommander un autre pro" | Orange rect |
| `nouvelle-reco` | ↩ Nouvelle reco possible | Orange pill |
| `etape-2` | Étape 2 — Recommandation acceptée — Identité pro dévoilée | Blanc rect |
| `etape-3` | Étape 3 — Contact établi — Pro contacte le client | Blanc rect |
| `etape-4` | Étape 4 — Rendez-vous fixé — Pro fixe un RDV | Blanc rect |
| `etape-5` | Étape 5 — Devis soumis — Pro renseigne le montant | Blanc rect |
| `etape-6` | **Étape 6 — Travaux terminés + Paiement reçu** — Pro confirme, commissions déclenchées | Orange border |
| `commissions` | 💰 Commissions déclenchées — 5 niveaux MLM | Gris foncé rect |
| `email-commission` | 📧 Commission à régler → Pro (J+0 · Relance J+2 · Alerte J+4) | Orange rect |
| `etape-7` | Étape 7 — Affaire terminée — Clôture de la recommandation | Blanc rect |
| `fin` | ✅ Recommandation complétée | Vert pill |

### Flux (edges)

1. Départ → Losange inscrit → (✅ déjà inscrit) Email inscrit → Suivi ouverture → Suivi clic → Losange acceptation
2. Départ → Losange inscrit → (❌ non inscrit) Email non inscrit → Suivi ouverture → Revendication → Suivi clic → Losange acceptation
   - *Branche parallèle* : Email non inscrit → **Cron H+12** → Relance → **Cron H+36** → Alerte recommandeur
3. Losange acceptation → (✅ OUI) Étape 2 → 3 → 4 → 5 → 6 → Commissions → Email commission → Étape 7 → Fin
4. Losange acceptation → (❌ NON) Rejetée → Email refus → Nouvelle reco possible

---

## Dialog d'annotation — `FlowAnnotationDialog.tsx`

Composant Dialog shadcn déclenché par le clic sur un nœud du flowchart (sauf nœuds email qui ouvrent l'EmailPreviewDialog).

### Contenu
- **En-tête** : titre du nœud cliqué, fond dégradé orange Winelio
- **Informations du nœud** : libellé dans un encadré gris
- **Liste des notes existantes** : triées par `created_at` DESC, chacune avec auteur + date + texte
- **Zone de saisie** : textarea pour une nouvelle note (max 1000 caractères)
- **Actions** : Annuler | Enregistrer (appelle la server action `addFlowAnnotation`)

### Suppression
Chaque note peut être supprimée (bouton ✕) par tout super administrateur — la page étant réservée aux super admins, aucune distinction d'auteur n'est nécessaire.

### Optimistic updates
L'ajout et la suppression se font côté client immédiatement (via `onAnnotationAdded` / `onAnnotationDeleted`) sans attendre le revalidatePath.

---

## Dialog preview email — `EmailPreviewDialog.tsx`

Déclenché au clic sur un nœud de type email. Affiche le template HTML réel dans un iframe (via `srcdoc` pour contourner la CSP).

Types d'email prévisualisables :
- `new-reco-inscrit` — 📧 Nouvelle recommandation → Pro inscrit
- `new-reco-scraped` — 📧 Un client vous recommande → Pro scrappé
- `relance-scraped` — ⏱ Relance automatique → Pro scrappé (H+12)
- `alerte-recommandeur` — 📭 Alerte → Recommandeur (H+36)
- `reco-refusee` — 📧 Recommandation déclinée → Recommandeur
- `commission` — 📧 Commission à régler → Professionnel
- `step-2` → `step-6` — ✉️ Étape X → Recommandeur

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

Charge toutes les annotations au rendu côté serveur, utilise `RecoFlowchartClient` (dynamic import SSR:false) :

```typescript
import { RecoFlowchartClient } from "@/components/admin/RecoFlowchartClient";

const annotations = await supabaseAdmin
  .schema("winelio")
  .from("process_flow_annotations")
  .select("id, node_id, content, created_at, author:profiles!author_id(first_name, last_name)")
  .order("created_at", { ascending: false })
```

---

## Menu — `AdminLayoutShell.tsx` / `AdminSidebar.tsx`

Entrée de menu entre "Réseau MLM" et "Utilisateurs" :

```typescript
{ href: "/gestion-reseau/processus", label: "Processus", icon: "M9 17V7..." }
```

---

## Migration SQL

```sql
-- supabase/migrations/20260423_process_flow_annotations.sql
CREATE TABLE IF NOT EXISTS winelio.process_flow_annotations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    text NOT NULL,
  content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  author_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS process_flow_annotations_node_id_idx
  ON winelio.process_flow_annotations (node_id);

ALTER TABLE winelio.process_flow_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all" ON winelio.process_flow_annotations;

CREATE POLICY "super_admin_all" ON winelio.process_flow_annotations
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
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
| Relance cron pro scrappé H+12 | `lib/notify-scraped-reminder.ts` |
| Alerte recommandeur si pas de réponse | `lib/notify-referrer-no-response.ts` |
| Étapes 1→8 | `/api/recommendations/complete-step/route.ts` |
| Commissions MLM 5 niveaux (déclenchées sur Étape 6) | `lib/commission.ts` |
| Email commission + relances | `lib/notify-commission-payment.ts` |

La page organigramme est donc **uniquement une couche de visualisation** — elle ne modifie aucune logique métier existante.

---

## Hors périmètre

- Lier l'organigramme à une recommandation spécifique (suivi en temps réel d'une reco)
- Modifier les étapes depuis l'organigramme
