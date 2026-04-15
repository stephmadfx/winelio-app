# Spec — Système de documents annotables (super admin)

**Date :** 2026-04-15
**Projet :** Winelio (`dev2`)
**Statut :** Approuvé — prêt pour implémentation

---

## Contexte

Les associés (Stéphane, Thierry Carlier, Christophe Carlier — tous trois super admins et têtes de lignée MLM) ont besoin de réviser et valider des documents légaux (CGU, chartes, règlements) directement depuis l'interface d'administration. Chaque associé annote les sections, remplit les placeholders, et suit l'avancement de la validation. Le premier document est les CGU Professionnels v1.0.

---

## Périmètre

- **Utilisateurs :** super admins uniquement (accès via rôle `super_admin` dans `app_metadata`)
- **Collaboration :** asynchrone, annotations attribuées automatiquement au prénom du profil connecté
- **Extensible :** conçu pour gérer N documents, pas seulement les CGU
- **Hors scope v1 :** import de nouveaux documents via l'interface (bouton présent mais désactivé), notifications email, export PDF depuis l'interface

---

## Navigation admin

Nouvel item **"Documents"** dans `AdminLayoutShell.tsx`, après "Retraits" :

```
Tableau de bord
Utilisateurs
Professionnels
Recommandations
Réseau
Retraits
─────────────
Documents
  └ [titre du document 1]
  └ [titre du document 2]  ← futurs
```

- Si 1 seul document : lien direct vers ce document
- Si plusieurs : sous-menu dépliable avec un item par document (titre + badge statut)
- Le sous-menu est chargé côté serveur depuis `legal_documents`

---

## Page liste — `/gestion-reseau/documents`

Grille de cartes, une par document. Chaque carte affiche :

- Titre + version (ex: "CGU Professionnels — v1.0")
- Badge statut coloré : `Brouillon` (gris) / `En révision` (orange) / `Validé` (vert)
- Compteur : "X annotations · Y placeholders restants"
- Avatars des 3 associés avec indicateur visuel si chacun a posté au moins une annotation
- Lien vers la vue document

Bouton **"+ Nouveau document"** visible mais désactivé (hors scope v1).

---

## Vue document — `/gestion-reseau/documents/[id]`

### Layout

Deux colonnes fixes :
- **Gauche (65%) :** document
- **Droite (35%) :** panel d'annotations

### Colonne gauche — Document

- En-tête : titre, version, dropdown statut (modifiable par tout super admin)
- Articles affichés séquentiellement dans des blocs distincts
- Chaque article a un bouton **"Annoter"** discret → scrolle le panel droit jusqu'au thread de cet article et le focus
- Les placeholders `[CLE]` sont :
  - Surlignés en orange si non remplis
  - Affichés en vert avec la valeur si remplis
  - Cliquables → `PlaceholderEditor` inline apparaît (champ texte + bouton Valider)
  - La valeur enregistrée affiche le prénom de celui qui l'a remplie

### Colonne droite — Panel d'annotations

- Par défaut : toutes les annotations groupées par article, ordre chronologique
- Au clic "Annoter" sur un article : scroll + focus sur le thread de cet article
- Chaque annotation affiche : avatar coloré + prénom + texte + date relative
- Couleurs des 3 associés : orange (Stéphane) / bleu (Thierry) / vert (Christophe) — assignées dynamiquement par ordre de création de compte
- Champ de saisie en bas de chaque thread (textarea + bouton "Publier")
- Pas de suppression d'annotation en v1

---

## Base de données

### Migration : `supabase/migrations/20260415_legal_documents.sql`

```sql
-- Documents
CREATE TABLE winelio.legal_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  version      text NOT NULL DEFAULT '1.0',
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'reviewing', 'validated')),
  created_by   uuid REFERENCES winelio.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Sections (articles)
CREATE TABLE winelio.document_sections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES winelio.legal_documents(id) ON DELETE CASCADE,
  order_index    int NOT NULL,
  article_number text NOT NULL,   -- ex: "1", "5.2", "11"
  title          text NOT NULL,
  content        text NOT NULL,   -- markdown, placeholders sous forme [CLE]
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Annotations
CREATE TABLE winelio.document_annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES winelio.document_sections(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES winelio.profiles(id),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Valeurs des placeholders
CREATE TABLE winelio.document_placeholder_values (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES winelio.legal_documents(id) ON DELETE CASCADE,
  placeholder_key  text NOT NULL,   -- ex: "RAISON_SOCIALE"
  value            text NOT NULL,
  filled_by        uuid NOT NULL REFERENCES winelio.profiles(id),
  filled_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, placeholder_key)
);

-- Triggers updated_at
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON winelio.legal_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_annotations_updated_at
  BEFORE UPDATE ON winelio.document_annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### RLS

Toutes les tables : lecture et écriture réservées aux `super_admin` via `auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'`.

---

## Seed — CGU Professionnels v1.0

Un script de seed insère :
1. Un enregistrement dans `legal_documents` (title: "CGU Professionnels", version: "1.0", status: "reviewing")
2. 13 enregistrements dans `document_sections` (un par article des CGU)

Le contenu des sections est extrait du fichier `docs/superpowers/specs/2026-04-15-cgu-professionnels-design.md`.

---

## Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/app/gestion-reseau/documents/page.tsx` | Server component : liste des documents |
| `src/app/gestion-reseau/documents/[id]/page.tsx` | Server component : charge document + sections + annotations + placeholders |
| `src/components/admin/DocumentViewer.tsx` | Client component : layout 2 colonnes |
| `src/components/admin/AnnotationPanel.tsx` | Client component : threads par section |
| `src/components/admin/PlaceholderEditor.tsx` | Client component : champ inline placeholder |
| `src/app/gestion-reseau/documents/actions.ts` | Server actions : addAnnotation, fillPlaceholder, updateDocumentStatus |
| `supabase/migrations/20260415_legal_documents.sql` | Migration SQL |
| `supabase/seeds/legal_documents_cgu_pro.sql` | Seed CGU Professionnels v1.0 |

## Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/components/admin/AdminLayoutShell.tsx` | Ajouter item "Documents" + sous-menu dynamique |

---

## Hors scope v1

- Import de nouveaux documents via l'interface
- Notifications email lors d'une nouvelle annotation
- Export PDF depuis l'interface
- Suppression ou édition d'une annotation existante
- Historique des versions d'un document
- Résolution / archivage d'une annotation
