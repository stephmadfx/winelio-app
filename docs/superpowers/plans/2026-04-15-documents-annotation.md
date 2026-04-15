# Documents annotables (super admin) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une section `/gestion-reseau/documents` permettant aux super admins d'annoter et de valider des documents légaux (CGU, chartes) directement dans l'interface admin.

**Architecture:** Server components pour le chargement des données (supabaseAdmin), client components pour l'interactivité (annotations, placeholders, statut). 4 nouvelles tables Supabase dans le schéma `winelio`. Server actions pour les mutations. Layout 2 colonnes : document à gauche, panel d'annotations à droite.

**Tech Stack:** Next.js 15 App Router, Supabase (schéma `winelio`), Tailwind CSS v4, TypeScript

---

## Carte des fichiers

| Fichier | Action | Rôle |
|---------|--------|------|
| `supabase/migrations/20260415_legal_documents.sql` | Créer | 4 nouvelles tables |
| `supabase/seeds/legal_documents_cgu_pro.sql` | Créer | Seed CGU Pro v1.0 (1 doc + 13 sections) |
| `src/app/gestion-reseau/documents/actions.ts` | Créer | Server actions : addAnnotation, fillPlaceholder, updateDocumentStatus |
| `src/components/admin/AdminLayoutShell.tsx` | Modifier | Ajouter item "Documents" + sous-menu |
| `src/app/gestion-reseau/documents/page.tsx` | Créer | Liste des documents (cartes) |
| `src/app/gestion-reseau/documents/[id]/page.tsx` | Créer | Server component viewer |
| `src/components/admin/DocumentViewer.tsx` | Créer | Client component layout 2 colonnes |
| `src/components/admin/AnnotationPanel.tsx` | Créer | Client component threads d'annotations |
| `src/components/admin/PlaceholderEditor.tsx` | Créer | Client component champ inline + renderContent |

---

## Task 1 : Migration SQL — 4 nouvelles tables

**Files:**
- Create: `supabase/migrations/20260415_legal_documents.sql`

- [ ] **Étape 1 : Créer le fichier de migration**

```sql
-- supabase/migrations/20260415_legal_documents.sql

-- Documents légaux
CREATE TABLE IF NOT EXISTS winelio.legal_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  version      text NOT NULL DEFAULT '1.0',
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'reviewing', 'validated')),
  created_by   uuid REFERENCES winelio.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Sections (articles) d'un document
CREATE TABLE IF NOT EXISTS winelio.document_sections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES winelio.legal_documents(id) ON DELETE CASCADE,
  order_index    int NOT NULL,
  article_number text NOT NULL,
  title          text NOT NULL,
  content        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Annotations par section
CREATE TABLE IF NOT EXISTS winelio.document_annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES winelio.document_sections(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES winelio.profiles(id),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Valeurs des placeholders
CREATE TABLE IF NOT EXISTS winelio.document_placeholder_values (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES winelio.legal_documents(id) ON DELETE CASCADE,
  placeholder_key  text NOT NULL,
  value            text NOT NULL,
  filled_by        uuid NOT NULL REFERENCES winelio.profiles(id),
  filled_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, placeholder_key)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
  ON winelio.document_sections(document_id, order_index);

CREATE INDEX IF NOT EXISTS idx_document_annotations_section_id
  ON winelio.document_annotations(section_id, created_at);

CREATE INDEX IF NOT EXISTS idx_document_placeholder_values_document_id
  ON winelio.document_placeholder_values(document_id);

-- Trigger updated_at pour legal_documents
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON winelio.legal_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger updated_at pour document_annotations
CREATE TRIGGER update_document_annotations_updated_at
  BEFORE UPDATE ON winelio.document_annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE winelio.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.document_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.document_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.document_placeholder_values ENABLE ROW LEVEL SECURITY;

-- Politiques : lecture et écriture super_admin uniquement
CREATE POLICY "super_admin_all_legal_documents"
  ON winelio.legal_documents FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

CREATE POLICY "super_admin_all_document_sections"
  ON winelio.document_sections FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

CREATE POLICY "super_admin_all_document_annotations"
  ON winelio.document_annotations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

CREATE POLICY "super_admin_all_document_placeholder_values"
  ON winelio.document_placeholder_values FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
```

- [ ] **Étape 2 : Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260415_legal_documents.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260415_legal_documents.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260415_legal_documents.sql"
```

Résultat attendu : `CREATE TABLE` × 4, `CREATE INDEX` × 3, `CREATE TRIGGER` × 2, `CREATE POLICY` × 4

- [ ] **Étape 3 : Vérifier les tables créées**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -c \"SELECT tablename FROM pg_tables WHERE schemaname='winelio' AND tablename LIKE '%document%' ORDER BY tablename;\""
```

Résultat attendu : 4 lignes (`document_annotations`, `document_placeholder_values`, `document_sections`, `legal_documents`)

- [ ] **Étape 4 : Commit**

```bash
git add supabase/migrations/20260415_legal_documents.sql
git commit -m "feat(db): tables legal_documents, document_sections, annotations, placeholders"
```

---

## Task 2 : Seed — CGU Professionnels v1.0

**Files:**
- Create: `supabase/seeds/legal_documents_cgu_pro.sql`

- [ ] **Étape 1 : Créer le dossier seeds et le fichier**

```bash
mkdir -p supabase/seeds
```

- [ ] **Étape 2 : Écrire le seed**

```sql
-- supabase/seeds/legal_documents_cgu_pro.sql
-- Insère les CGU Professionnels v1.0 (13 articles)
-- Idempotent : ne réinsère pas si le titre existe déjà

DO $$
DECLARE
  v_doc_id uuid;
BEGIN
  -- Vérification idempotence
  SELECT id INTO v_doc_id
  FROM winelio.legal_documents
  WHERE title = 'CGU Professionnels' AND version = '1.0';

  IF v_doc_id IS NOT NULL THEN
    RAISE NOTICE 'CGU Professionnels v1.0 déjà présentes, seed ignoré.';
    RETURN;
  END IF;

  -- Insertion du document
  INSERT INTO winelio.legal_documents (title, version, status)
  VALUES ('CGU Professionnels', '1.0', 'reviewing')
  RETURNING id INTO v_doc_id;

  -- Article 1
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 1, '1', 'Objet',
$ART1$Les présentes Conditions Générales d'Utilisation (ci-après « CGU ») régissent les relations contractuelles entre la société **[RAISON SOCIALE]**, immatriculée au RCS sous le numéro **[SIREN]**, dont le siège social est situé **[ADRESSE]** (ci-après « Winelio »), et toute personne physique ou morale exerçant une activité professionnelle ayant accepté les présentes CGU lors de l'activation de son compte Professionnel sur la plateforme Winelio (ci-après « le Professionnel »).

La plateforme Winelio est un service de mise en relation par recommandation entre des clients potentiels (ci-après « Clients ») et des Professionnels référencés.$ART1$);

  -- Article 2
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 2, '2', 'Acceptation des CGU',
$ART2$L'activation du statut Professionnel sur la plateforme vaut acceptation pleine et entière des présentes CGU. Cette acceptation est matérialisée par le cochage de la case prévue à cet effet lors de la procédure d'enregistrement.

Les présentes CGU prévalent sur tout autre document, sauf accord écrit contraire signé par Winelio.

Winelio se réserve le droit de modifier les présentes CGU à tout moment. Le Professionnel sera informé de toute modification par email. La poursuite de l'utilisation de la plateforme après notification vaudra acceptation des nouvelles CGU.$ART2$);

  -- Article 3
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 3, '3', 'Mandat de prospection',
$ART3$En acceptant les présentes CGU, le Professionnel **donne mandat exprès à Winelio** d'agir en son nom pour la recherche et la mise en relation avec des clients potentiels correspondant à son activité professionnelle déclarée.

Ce mandat est :
- **Non-exclusif** : le Professionnel reste libre d'exercer son activité par tous autres canaux ;
- **À titre onéreux** : il donne lieu au versement de la commission définie à l'Article 5 ;
- **Révocable** : il prend fin à la résiliation du compte Professionnel.$ART3$);

  -- Article 4
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 4, '4', 'Obligations du Professionnel',
$ART4$Le Professionnel s'engage à :

1. **Traiter chaque mise en relation avec sérieux et réactivité**, en répondant à toute recommandation dans un délai raisonnable ;
2. **Renseigner fidèlement** ses informations professionnelles (activité, SIRET le cas échéant, zone d'intervention) et les tenir à jour ;
3. **Suivre l'avancement de chaque mission** directement via l'application Winelio, en complétant les étapes du workflow de recommandation ;
4. **Déclarer le montant réel de la facture** émise à l'issue d'une mission issue d'une mise en relation Winelio ;
5. **Régler la commission due** à Winelio dans les conditions définies à l'Article 5 ;
6. **Ne pas contourner la commission** dans les conditions définies à l'Article 6.$ART4$);

  -- Article 5
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 5, '5', 'Commission',
$ART5$**5.1 Taux**

En contrepartie de chaque mise en relation ayant donné lieu à la conclusion d'une affaire, le Professionnel s'engage à verser à Winelio une commission calculée sur le montant **TTC de la facture émise au Client**.

Le taux de commission est fixé à **10 % maximum TTC**, selon le barème en vigueur publié sur la plateforme. Des réductions de taux peuvent s'appliquer en fonction du montant de la facture, conformément audit barème.

**5.2 Fait générateur**

La commission est due dès lors que :
- un Client mis en relation via la plateforme Winelio a conclu un contrat ou passé une commande auprès du Professionnel ;
- le Professionnel a validé l'étape « Devis accepté » dans son workflow de recommandation.

**5.3 Modalités de règlement**

La commission est prélevée ou facturée selon les modalités définies dans la plateforme. Le Professionnel s'engage à s'acquitter de la commission dans un délai de **15 jours** à compter de la validation de la mission.$ART5$);

  -- Article 6
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 6, '6', 'Interdiction de contournement',
$ART6$Il est **formellement interdit** au Professionnel de solliciter ou de traiter directement avec un Client mis en relation via la plateforme Winelio dans le but de contourner le paiement de la commission, notamment :

- en proposant au Client de traiter hors plateforme après une première mise en relation ;
- en ne déclarant pas une mission réalisée suite à une recommandation Winelio ;
- en sous-déclarant le montant réel de la facture.

**Sanctions**

Tout manquement avéré à cette obligation autorise Winelio à :

1. **Réclamer immédiatement la commission due, majorée de 50 %** à titre de pénalité forfaitaire ;
2. **Suspendre ou résilier le compte** du Professionnel sans préavis ni indemnité ;
3. **Engager toute procédure nécessaire** au recouvrement des sommes dues, y compris judiciaire, les frais de recouvrement restant à la charge du Professionnel.

Ces sanctions sont cumulatives et sans préjudice de tout autre recours.$ART6$);

  -- Article 7
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 7, '7', 'Obligations de Winelio',
$ART7$Winelio s'engage à :

1. Mettre à disposition une plateforme fonctionnelle permettant la réception et le suivi des recommandations ;
2. Notifier le Professionnel de toute nouvelle mise en relation ;
3. Assurer la confidentialité des données du Professionnel conformément à l'Article 9 ;
4. Informer le Professionnel de toute modification tarifaire au moins **30 jours à l'avance**.$ART7$);

  -- Article 8
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 8, '8', 'Durée et résiliation',
$ART8$**8.1 Durée**

Les présentes CGU entrent en vigueur à la date d'activation du statut Professionnel et sont conclues pour une **durée indéterminée**.

**8.2 Résiliation à l'initiative du Professionnel**

Le Professionnel peut résilier son compte Professionnel à tout moment depuis les paramètres de l'application, sous réserve de s'acquitter de l'ensemble des commissions dues au titre des missions en cours ou terminées.

**8.3 Résiliation à l'initiative de Winelio**

Winelio peut suspendre ou résilier le compte Professionnel :
- **Sans préavis**, en cas de manquement grave (notamment violation de l'Article 6) ;
- **Avec un préavis de 30 jours**, pour tout autre motif légitime.

**8.4 Effets de la résiliation**

La résiliation met fin au mandat défini à l'Article 3. Les commissions dues au titre des missions initiées avant la date de résiliation restent exigibles.$ART8$);

  -- Article 9
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 9, '9', 'Données personnelles (RGPD)',
$ART9$Winelio collecte et traite les données personnelles du Professionnel dans le cadre de l'exécution du contrat et du respect de ses obligations légales, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.

Le Professionnel dispose d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition sur ses données, exerceable à l'adresse : **[EMAIL RGPD]**.

Pour plus d'informations, se référer à la Politique de Confidentialité disponible sur la plateforme.$ART9$);

  -- Article 10
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 10, '10', 'Responsabilité',
$ART10$Winelio est un intermédiaire de mise en relation. Elle ne peut être tenue responsable :
- de la qualité des prestations réalisées par le Professionnel ;
- d'un différend entre le Professionnel et un Client ;
- de l'absence de mise en relation en cas de faible activité sur la plateforme.

La responsabilité de Winelio est en tout état de cause limitée au montant des commissions effectivement perçues au titre des trois (3) derniers mois précédant le fait générateur du litige.$ART10$);

  -- Article 11
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 11, '11', 'Cas particuliers — Agents immobiliers',
$ART11$Les agents immobiliers et tout professionnel soumis à la loi Hoguet sont **exclus du champ des présentes CGU**. Ils sont soumis à des Conditions Générales spécifiques distinctes, conclues par voie de **signature électronique**. Les modalités seront précisées lors de l'ouverture de ce parcours dédié.$ART11$);

  -- Article 12
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 12, '12', 'Droit applicable et juridiction',
$ART12$Les présentes CGU sont soumises au **droit français**.

En cas de litige, les parties s'engagent à rechercher une solution amiable préalablement à tout recours judiciaire. À défaut d'accord dans un délai de 30 jours, le litige sera porté devant le **[TRIBUNAL COMPÉTENT]**.$ART12$);

  -- Article 13
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 13, '13', 'Dispositions diverses',
$ART13$- **Intégralité** : les présentes CGU constituent l'intégralité de l'accord entre les parties sur leur objet ;
- **Divisibilité** : si une clause est déclarée nulle, les autres clauses restent en vigueur ;
- **Non-renonciation** : le fait pour Winelio de ne pas se prévaloir d'un manquement ne vaut pas renonciation à s'en prévaloir ultérieurement.

*En cochant la case prévue à cet effet lors de l'activation de son compte Professionnel, le Professionnel reconnaît avoir lu, compris et accepté sans réserve les présentes Conditions Générales d'Utilisation.*$ART13$);

  RAISE NOTICE 'CGU Professionnels v1.0 insérées avec succès (id: %).', v_doc_id;
END $$;
```

- [ ] **Étape 3 : Appliquer le seed sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/seeds/legal_documents_cgu_pro.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/legal_documents_cgu_pro.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/legal_documents_cgu_pro.sql"
```

Résultat attendu : `NOTICE: CGU Professionnels v1.0 insérées avec succès (id: <uuid>).`

- [ ] **Étape 4 : Vérifier le seed**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -c \"SELECT COUNT(*) FROM winelio.document_sections;\""
```

Résultat attendu : `count = 13`

- [ ] **Étape 5 : Commit**

```bash
git add supabase/seeds/legal_documents_cgu_pro.sql
git commit -m "feat(db): seed CGU Professionnels v1.0 (13 articles)"
```

---

## Task 3 : Server actions

**Files:**
- Create: `src/app/gestion-reseau/documents/actions.ts`

- [ ] **Étape 1 : Créer le fichier**

```typescript
// src/app/gestion-reseau/documents/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  if (user.app_metadata?.role !== "super_admin") throw new Error("Accès refusé");
  return user;
}

export async function addAnnotation(sectionId: string, content: string) {
  const user = await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("document_annotations")
    .insert({ section_id: sectionId, author_id: user.id, content: content.trim() });

  if (error) throw new Error(`Erreur annotation : ${error.message}`);

  revalidatePath("/gestion-reseau/documents", "layout");
}

export async function fillPlaceholder(
  documentId: string,
  placeholderKey: string,
  value: string
) {
  const user = await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("document_placeholder_values")
    .upsert(
      {
        document_id: documentId,
        placeholder_key: placeholderKey,
        value: value.trim(),
        filled_by: user.id,
        filled_at: new Date().toISOString(),
      },
      { onConflict: "document_id,placeholder_key" }
    );

  if (error) throw new Error(`Erreur placeholder : ${error.message}`);

  revalidatePath("/gestion-reseau/documents", "layout");
}

export async function updateDocumentStatus(
  documentId: string,
  status: "draft" | "reviewing" | "validated"
) {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("legal_documents")
    .update({ status })
    .eq("id", documentId);

  if (error) throw new Error(`Erreur statut : ${error.message}`);

  revalidatePath("/gestion-reseau/documents", "layout");
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error|✓" | head -20
```

Résultat attendu : pas d'erreur TypeScript dans le nouveau fichier.

- [ ] **Étape 3 : Commit**

```bash
git add src/app/gestion-reseau/documents/actions.ts
git commit -m "feat(admin): server actions documents (addAnnotation, fillPlaceholder, updateStatus)"
```

---

## Task 4 : Mise à jour AdminLayoutShell — item "Documents"

**Files:**
- Modify: `src/components/admin/AdminLayoutShell.tsx`

- [ ] **Étape 1 : Ajouter les types pour les items avec sous-menu**

Dans `AdminLayoutShell.tsx`, remplacer la définition de `navItems` par celle-ci qui supporte des sous-éléments optionnels :

```typescript
type NavItem = {
  label: string;
  href: string;
  icon: string;
  children?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/gestion-reseau",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    label: "Recommandations",
    href: "/gestion-reseau/recommandations",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    label: "Réseau MLM",
    href: "/gestion-reseau/reseau",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    label: "Utilisateurs",
    href: "/gestion-reseau/utilisateurs",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
  {
    label: "Professionnels",
    href: "/gestion-reseau/professionnels",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  },
  {
    label: "Retraits",
    href: "/gestion-reseau/retraits",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    label: "Documents",
    href: "/gestion-reseau/documents",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
];
```

- [ ] **Étape 2 : Ajouter les props `documents` au composant et le state du sous-menu**

Modifier la signature du composant pour recevoir la liste des documents :

```typescript
export function AdminLayoutShell({
  children,
  userEmail,
  documents = [],
}: {
  children: React.ReactNode;
  userEmail: string;
  documents?: { id: string; title: string; status: string }[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin-sidebar-collapsed") === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(() =>
    typeof window !== "undefined"
      ? pathname.startsWith("/gestion-reseau/documents")
      : false
  );
  // ... reste du composant inchangé
```

- [ ] **Étape 3 : Modifier le rendu nav pour gérer le sous-menu Documents**

Dans la fonction `sidebarContent`, remplacer le bloc `{navItems.map(...)}` par :

```typescript
{navItems.map((item) => {
  const isActive =
    item.href === "/gestion-reseau"
      ? pathname === "/gestion-reseau"
      : pathname.startsWith(item.href);

  // Item Documents avec sous-menu
  if (item.href === "/gestion-reseau/documents" && documents.length > 0) {
    return (
      <div key={item.href}>
        <button
          onClick={() => !collapsed && setDocsOpen((p) => !p)}
          title={collapsed && !mobile ? item.label : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
            collapsed && !mobile ? "justify-center" : "justify-between"
          } ${
            isActive
              ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
            </svg>
            {(!collapsed || mobile) && (
              <span className="text-sm font-medium">{item.label}</span>
            )}
          </div>
          {(!collapsed || mobile) && (
            <svg
              className={`w-4 h-4 shrink-0 transition-transform ${docsOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        {docsOpen && (!collapsed || mobile) && (
          <div className="ml-8 mt-1 flex flex-col gap-1">
            {documents.map((doc) => {
              const docActive = pathname === `/gestion-reseau/documents/${doc.id}`;
              return (
                <Link
                  key={doc.id}
                  href={`/gestion-reseau/documents/${doc.id}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    docActive
                      ? "text-winelio-orange bg-orange-50 dark:bg-orange-950/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    doc.status === "validated" ? "bg-green-500" :
                    doc.status === "reviewing" ? "bg-winelio-orange" : "bg-gray-400"
                  }`} />
                  <span className="truncate">{doc.title}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Items standard (code existant inchangé)
  return (
    <Link
      key={item.href}
      href={item.href}
      title={collapsed && !mobile ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        collapsed && !mobile ? "justify-center" : ""
      } ${
        isActive
          ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
      </svg>
      {(!collapsed || mobile) && (
        <span className="text-sm font-medium truncate">{item.label}</span>
      )}
    </Link>
  );
})}
```

- [ ] **Étape 4 : Mettre à jour le layout admin pour passer les documents**

Modifier `src/app/gestion-reseau/layout.tsx` pour charger la liste des documents et les passer au shell :

```typescript
// src/app/gestion-reseau/layout.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function GestionReseauLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "super_admin") {
    redirect("/dashboard");
  }

  const { data: documents } = await supabaseAdmin
    .from("legal_documents")
    .select("id, title, status")
    .order("created_at", { ascending: true });

  return (
    <AdminLayoutShell userEmail={user.email ?? ""} documents={documents ?? []}>
      {children}
    </AdminLayoutShell>
  );
}
```

> **Note :** Si ce layout n'existe pas encore, le créer. S'il existe déjà, ajouter uniquement le chargement des documents et la prop `documents`.

- [ ] **Étape 5 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Résultat attendu : aucune erreur TypeScript.

- [ ] **Étape 6 : Commit**

```bash
git add src/components/admin/AdminLayoutShell.tsx src/app/gestion-reseau/layout.tsx
git commit -m "feat(admin): navigation Documents avec sous-menu dynamique"
```

---

## Task 5 : Page liste des documents

**Files:**
- Create: `src/app/gestion-reseau/documents/page.tsx`

- [ ] **Étape 1 : Créer la page**

```typescript
// src/app/gestion-reseau/documents/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

const STATUS_LABELS = {
  draft: { label: "Brouillon", classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  reviewing: { label: "En révision", classes: "bg-orange-100 text-winelio-orange dark:bg-orange-950/30" },
  validated: { label: "Validé", classes: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400" },
} as const;

export default async function DocumentsPage() {
  const { data: documents } = await supabaseAdmin
    .from("legal_documents")
    .select("id, title, version, status, created_at")
    .order("created_at", { ascending: true });

  // Compteurs annotations et placeholders par document
  const counts = await Promise.all(
    (documents ?? []).map(async (doc) => {
      const [{ count: annotCount }, { data: placeholders }] = await Promise.all([
        supabaseAdmin
          .from("document_annotations")
          .select("id", { count: "exact", head: true })
          .in(
            "section_id",
            (await supabaseAdmin
              .from("document_sections")
              .select("id")
              .eq("document_id", doc.id)
            ).data?.map((s) => s.id) ?? []
          ),
        supabaseAdmin
          .from("document_placeholder_values")
          .select("placeholder_key")
          .eq("document_id", doc.id),
      ]);

      // Compter les placeholders uniques dans les sections
      const { data: sections } = await supabaseAdmin
        .from("document_sections")
        .select("content")
        .eq("document_id", doc.id);

      const allContent = (sections ?? []).map((s) => s.content).join("\n");
      const allKeys = [...allContent.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      const uniqueKeys = [...new Set(allKeys)];
      const filledKeys = new Set((placeholders ?? []).map((p) => p.placeholder_key));
      const remainingPlaceholders = uniqueKeys.filter((k) => !filledKeys.has(k)).length;

      return { docId: doc.id, annotations: annotCount ?? 0, remainingPlaceholders };
    })
  );

  const countMap = Object.fromEntries(counts.map((c) => [c.docId, c]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Documents légaux à réviser et valider
          </p>
        </div>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium cursor-not-allowed opacity-50"
          title="Disponible prochainement"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau document
        </button>
      </div>

      {(!documents || documents.length === 0) ? (
        <div className="text-center py-20 text-muted-foreground">
          Aucun document pour l'instant.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const status = STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.draft;
            const c = countMap[doc.id];
            return (
              <Link
                key={doc.id}
                href={`/gestion-reseau/documents/${doc.id}`}
                className="block bg-card border border-border rounded-2xl p-5 hover:border-winelio-orange/50 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-winelio-orange to-winelio-amber rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.classes}`}>
                    {status.label}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-winelio-orange transition-colors">
                  {doc.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 mb-4">Version {doc.version}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-3">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                    </svg>
                    {c?.annotations ?? 0} annotation{(c?.annotations ?? 0) !== 1 ? "s" : ""}
                  </span>
                  {(c?.remainingPlaceholders ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-winelio-orange font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {c.remainingPlaceholders} placeholder{c.remainingPlaceholders !== 1 ? "s" : ""} restant{c.remainingPlaceholders !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/app/gestion-reseau/documents/page.tsx
git commit -m "feat(admin): page liste des documents annotables"
```

---

## Task 6 : Page viewer serveur

**Files:**
- Create: `src/app/gestion-reseau/documents/[id]/page.tsx`

- [ ] **Étape 1 : Créer la page**

```typescript
// src/app/gestion-reseau/documents/[id]/page.tsx
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import { addAnnotation, fillPlaceholder, updateDocumentStatus } from "@/app/gestion-reseau/documents/actions";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [
    { data: document },
    { data: sections },
    { data: annotations },
    { data: placeholderValues },
  ] = await Promise.all([
    supabaseAdmin
      .from("legal_documents")
      .select("id, title, version, status")
      .eq("id", id)
      .single(),
    supabaseAdmin
      .from("document_sections")
      .select("id, order_index, article_number, title, content")
      .eq("document_id", id)
      .order("order_index"),
    supabaseAdmin
      .from("document_annotations")
      .select(`
        id, content, created_at,
        section_id,
        author:profiles!author_id(id, first_name, last_name)
      `)
      .in(
        "section_id",
        (await supabaseAdmin
          .from("document_sections")
          .select("id")
          .eq("document_id", id)
        ).data?.map((s) => s.id) ?? []
      )
      .order("created_at"),
    supabaseAdmin
      .from("document_placeholder_values")
      .select("placeholder_key, value, filled_at, filled_by:profiles!filled_by(first_name)")
      .eq("document_id", id),
  ]);

  if (!document) notFound();

  // Construire la map placeholder_key → { value, filledBy }
  const placeholderMap: Record<string, { value: string; filledBy: string }> = {};
  for (const pv of placeholderValues ?? []) {
    const filledBy = Array.isArray(pv.filled_by) ? pv.filled_by[0] : pv.filled_by;
    placeholderMap[pv.placeholder_key] = {
      value: pv.value,
      filledBy: (filledBy as { first_name: string } | null)?.first_name ?? "?",
    };
  }

  // Construire la map sectionId → annotations[]
  type Annotation = {
    id: string;
    content: string;
    created_at: string;
    section_id: string;
    author: { id: string; first_name: string; last_name: string } | null;
  };

  const annotationsBySectionId: Record<string, Annotation[]> = {};
  for (const ann of (annotations ?? []) as Annotation[]) {
    if (!annotationsBySectionId[ann.section_id]) {
      annotationsBySectionId[ann.section_id] = [];
    }
    annotationsBySectionId[ann.section_id].push(ann);
  }

  // Construire la palette couleurs par auteur (ordre d'apparition dans les annotations)
  const authorOrder: string[] = [];
  for (const ann of (annotations ?? []) as Annotation[]) {
    const authorId = ann.author?.id;
    if (authorId && !authorOrder.includes(authorId)) authorOrder.push(authorId);
  }
  const COLORS = ["bg-winelio-orange", "bg-blue-500", "bg-green-500"];
  const authorColorMap: Record<string, string> = {};
  authorOrder.forEach((id, i) => {
    authorColorMap[id] = COLORS[i % COLORS.length];
  });

  return (
    <DocumentViewer
      document={document}
      sections={sections ?? []}
      annotationsBySectionId={annotationsBySectionId}
      placeholderMap={placeholderMap}
      authorColorMap={authorColorMap}
      onAddAnnotation={addAnnotation}
      onFillPlaceholder={fillPlaceholder}
      onUpdateStatus={updateDocumentStatus}
    />
  );
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/app/gestion-reseau/documents/[id]/page.tsx
git commit -m "feat(admin): page serveur viewer document"
```

---

## Task 7 : Composant DocumentViewer

**Files:**
- Create: `src/components/admin/DocumentViewer.tsx`

- [ ] **Étape 1 : Créer le composant**

```typescript
// src/components/admin/DocumentViewer.tsx
"use client";

import { useState } from "react";
import { AnnotationPanel } from "./AnnotationPanel";
import { renderContentWithPlaceholders } from "./PlaceholderEditor";

type Section = {
  id: string;
  order_index: number;
  article_number: string;
  title: string;
  content: string;
};

type Annotation = {
  id: string;
  content: string;
  created_at: string;
  section_id: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

type PlaceholderMap = Record<string, { value: string; filledBy: string }>;

const STATUS_CONFIG = {
  draft: { label: "Brouillon", classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  reviewing: { label: "En révision", classes: "bg-orange-100 text-winelio-orange" },
  validated: { label: "Validé", classes: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400" },
} as const;

export function DocumentViewer({
  document,
  sections,
  annotationsBySectionId,
  placeholderMap,
  authorColorMap,
  onAddAnnotation,
  onFillPlaceholder,
  onUpdateStatus,
}: {
  document: { id: string; title: string; version: string; status: string };
  sections: Section[];
  annotationsBySectionId: Record<string, Annotation[]>;
  placeholderMap: PlaceholderMap;
  authorColorMap: Record<string, string>;
  onAddAnnotation: (sectionId: string, content: string) => Promise<void>;
  onFillPlaceholder: (documentId: string, key: string, value: string) => Promise<void>;
  onUpdateStatus: (documentId: string, status: "draft" | "reviewing" | "validated") => Promise<void>;
}) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const statusConf = STATUS_CONFIG[document.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft;

  const totalAnnotations = Object.values(annotationsBySectionId).reduce(
    (acc, arr) => acc + arr.length, 0
  );

  return (
    <div className="flex flex-col h-full">
      {/* En-tête document */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold">{document.title}</h1>
          <p className="text-sm text-muted-foreground">Version {document.version} · {totalAnnotations} annotation{totalAnnotations !== 1 ? "s" : ""}</p>
        </div>
        <select
          defaultValue={document.status}
          onChange={async (e) => {
            await onUpdateStatus(document.id, e.target.value as "draft" | "reviewing" | "validated");
          }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 cursor-pointer ${statusConf.classes}`}
        >
          <option value="draft">Brouillon</option>
          <option value="reviewing">En révision</option>
          <option value="validated">Validé</option>
        </select>
      </div>

      {/* Layout 2 colonnes */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Colonne gauche — Document */}
        <div className="flex-[65] overflow-y-auto pr-2 space-y-6">
          {sections.map((section) => {
            const sectionAnnotations = annotationsBySectionId[section.id] ?? [];
            return (
              <div
                key={section.id}
                id={`section-${section.id}`}
                className={`bg-card border rounded-2xl p-5 transition-colors ${
                  activeSectionId === section.id
                    ? "border-winelio-orange/50 shadow-sm"
                    : "border-border"
                }`}
              >
                {/* Header article */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-winelio-orange to-winelio-amber text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {section.article_number}
                    </span>
                    <h3 className="font-semibold text-sm">{section.title}</h3>
                  </div>
                  <button
                    onClick={() => setActiveSectionId(section.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-winelio-orange transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                    </svg>
                    Annoter
                    {sectionAnnotations.length > 0 && (
                      <span className="ml-0.5 bg-winelio-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {sectionAnnotations.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Contenu avec placeholders */}
                <div className="text-sm text-foreground leading-relaxed">
                  {renderContentWithPlaceholders(
                    section.content,
                    placeholderMap,
                    (key, value) => onFillPlaceholder(document.id, key, value)
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Colonne droite — Panel annotations */}
        <div className="flex-[35] overflow-y-auto">
          <AnnotationPanel
            sections={sections}
            annotationsBySectionId={annotationsBySectionId}
            activeSectionId={activeSectionId}
            authorColorMap={authorColorMap}
            onAddAnnotation={onAddAnnotation}
            onSectionSelect={setActiveSectionId}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/components/admin/DocumentViewer.tsx
git commit -m "feat(admin): DocumentViewer layout 2 colonnes"
```

---

## Task 8 : Composant AnnotationPanel

**Files:**
- Create: `src/components/admin/AnnotationPanel.tsx`

- [ ] **Étape 1 : Créer le composant**

```typescript
// src/components/admin/AnnotationPanel.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Section = { id: string; article_number: string; title: string };
type Annotation = {
  id: string;
  content: string;
  created_at: string;
  section_id: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function AnnotationThread({
  section,
  annotations,
  authorColorMap,
  isActive,
  onAddAnnotation,
  onSelect,
}: {
  section: Section;
  annotations: Annotation[];
  authorColorMap: Record<string, string>;
  isActive: boolean;
  onAddAnnotation: (sectionId: string, content: string) => Promise<void>;
  onSelect: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && threadRef.current) {
      threadRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isActive]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const val = inputValue;
    setInputValue("");
    startTransition(async () => {
      await onAddAnnotation(section.id, val);
    });
  }

  return (
    <div
      ref={threadRef}
      className={`rounded-xl border transition-colors ${
        isActive ? "border-winelio-orange/50 shadow-sm" : "border-border"
      }`}
    >
      {/* Header thread */}
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 rounded-t-xl transition-colors"
      >
        <span className="text-xs font-bold text-winelio-orange w-6 shrink-0">
          {section.article_number}
        </span>
        <span className="text-xs font-medium text-foreground truncate flex-1">
          {section.title}
        </span>
        {annotations.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {annotations.length}
          </span>
        )}
      </button>

      {/* Annotations */}
      {annotations.length > 0 && (
        <div className="px-3 pb-2 space-y-2 border-t border-border">
          {annotations.map((ann) => {
            const authorId = ann.author?.id ?? "";
            const color = authorColorMap[authorId] ?? "bg-gray-400";
            const initials = ann.author
              ? `${ann.author.first_name[0]}${ann.author.last_name[0]}`.toUpperCase()
              : "?";
            return (
              <div key={ann.id} className="flex gap-2 pt-2">
                <div className={`w-6 h-6 rounded-full ${color} text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5`}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {ann.author?.first_name ?? "?"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(ann.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{ann.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Champ de saisie */}
      {isActive && (
        <form
          onSubmit={handleSubmit}
          className="border-t border-border px-3 py-2"
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ajouter une annotation..."
            rows={2}
            className="w-full text-xs bg-muted/50 rounded-lg px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-winelio-orange/50 placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e as unknown as React.FormEvent);
            }}
          />
          <div className="flex justify-end mt-1.5">
            <button
              type="submit"
              disabled={!inputValue.trim() || isPending}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-winelio-orange to-winelio-amber text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Envoi..." : "Publier"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AnnotationPanel({
  sections,
  annotationsBySectionId,
  activeSectionId,
  authorColorMap,
  onAddAnnotation,
  onSectionSelect,
}: {
  sections: Section[];
  annotationsBySectionId: Record<string, Annotation[]>;
  activeSectionId: string | null;
  authorColorMap: Record<string, string>;
  onAddAnnotation: (sectionId: string, content: string) => Promise<void>;
  onSectionSelect: (sectionId: string) => void;
}) {
  const totalAnnotations = Object.values(annotationsBySectionId).reduce(
    (acc, arr) => acc + arr.length, 0
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Annotations · {totalAnnotations}
      </p>
      {sections.map((section) => (
        <AnnotationThread
          key={section.id}
          section={section}
          annotations={annotationsBySectionId[section.id] ?? []}
          authorColorMap={authorColorMap}
          isActive={activeSectionId === section.id}
          onAddAnnotation={onAddAnnotation}
          onSelect={() => onSectionSelect(section.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/components/admin/AnnotationPanel.tsx
git commit -m "feat(admin): AnnotationPanel avec threads par section"
```

---

## Task 9 : PlaceholderEditor + renderContent

**Files:**
- Create: `src/components/admin/PlaceholderEditor.tsx`

- [ ] **Étape 1 : Créer le composant**

```typescript
// src/components/admin/PlaceholderEditor.tsx
"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";

type PlaceholderMap = Record<string, { value: string; filledBy: string }>;

// Composant inline pour éditer un placeholder
export function PlaceholderEditor({
  placeholderKey,
  currentEntry,
  onSave,
}: {
  placeholderKey: string;
  currentEntry?: { value: string; filledBy: string };
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentEntry?.value ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!inputValue.trim()) return;
    startTransition(async () => {
      await onSave(placeholderKey, inputValue.trim());
      setIsEditing(false);
    });
  }

  if (currentEntry && !isEditing) {
    return (
      <button
        onClick={() => { setInputValue(currentEntry.value); setIsEditing(true); }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 hover:opacity-80 transition-opacity"
        title={`Rempli par ${currentEntry.filledBy} — cliquer pour modifier`}
      >
        {currentEntry.value}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="text-xs border border-winelio-orange/50 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-winelio-orange/50 bg-background"
          placeholder={placeholderKey}
        />
        <button
          onClick={handleSave}
          disabled={isPending || !inputValue.trim()}
          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-winelio-orange text-white disabled:opacity-50"
        >
          {isPending ? "..." : "OK"}
        </button>
        <button
          onClick={() => setIsEditing(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </span>
    );
  }

  // Non rempli
  return (
    <button
      onClick={() => setIsEditing(true)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-winelio-orange dark:bg-orange-950/30 border border-winelio-orange/30 hover:bg-orange-200 dark:hover:bg-orange-950/50 transition-colors"
      title="Cliquer pour remplir"
    >
      [{placeholderKey}]
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

// Utilitaire : transforme le texte markdown avec [CLE] en éléments React
export function renderContentWithPlaceholders(
  content: string,
  placeholderMap: PlaceholderMap,
  onSave: (key: string, value: string) => Promise<void>
): ReactNode {
  // Découpe le texte par lignes, puis chaque ligne par placeholders
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\[[^\]]+\])/g);
    const rendered = parts.map((part, partIndex) => {
      const match = part.match(/^\[([^\]]+)\]$/);
      if (match) {
        const key = match[1];
        return (
          <PlaceholderEditor
            key={`${lineIndex}-${partIndex}-${key}`}
            placeholderKey={key}
            currentEntry={placeholderMap[key]}
            onSave={onSave}
          />
        );
      }
      // Rendu markdown minimal : **gras**, *italique*, listes
      return <span key={`${lineIndex}-${partIndex}`}>{renderMarkdownInline(part)}</span>;
    });

    // Détecter le type de ligne
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      return <p key={lineIndex} className="font-bold text-sm mt-3 mb-1">{rendered}</p>;
    }
    if (trimmed.startsWith("**") && trimmed.endsWith("**") && !trimmed.slice(2, -2).includes("**")) {
      return <p key={lineIndex} className="font-semibold text-sm mt-3 mb-1">{rendered}</p>;
    }
    if (trimmed.match(/^(\d+)\. /)) {
      return <p key={lineIndex} className="ml-4 text-sm">{rendered}</p>;
    }
    if (trimmed.startsWith("- ")) {
      return <p key={lineIndex} className="ml-4 text-sm before:content-['•'] before:mr-2 before:text-winelio-orange">{rendered}</p>;
    }
    if (trimmed === "") {
      return <br key={lineIndex} />;
    }
    if (trimmed.startsWith("*") && trimmed.endsWith("*")) {
      return <p key={lineIndex} className="text-sm italic text-muted-foreground mt-2">{rendered}</p>;
    }
    return <p key={lineIndex} className="text-sm">{rendered}</p>;
  });
}

// Rendu inline markdown : **gras**
function renderMarkdownInline(text: string): React.ReactNode {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  if (boldParts.length === 1) return text;
  return boldParts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) return <strong key={i} className="font-semibold">{boldMatch[1]}</strong>;
    return part;
  });
}
```

- [ ] **Étape 2 : Vérifier le build complet**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : `✓ Compiled successfully` ou nombre de pages générées sans erreur.

- [ ] **Étape 3 : Commit**

```bash
git add src/components/admin/PlaceholderEditor.tsx
git commit -m "feat(admin): PlaceholderEditor inline + renderContentWithPlaceholders"
```

---

## Task 10 : Test end-to-end + push

- [ ] **Étape 1 : Démarrer le serveur dev local**

```bash
pm2 restart winelio
pm2 logs winelio --lines 20
```

Résultat attendu : `Ready on http://localhost:3002`

- [ ] **Étape 2 : Vérifier la navigation admin**

Ouvrir `http://localhost:3002/gestion-reseau`. Vérifier que :
- L'item "Documents" apparaît dans la sidebar
- Le sous-menu se déplie et liste "CGU Professionnels"
- Le badge de statut est orange ("En révision")

- [ ] **Étape 3 : Vérifier la page liste**

Naviguer vers `/gestion-reseau/documents`. Vérifier :
- La carte "CGU Professionnels v1.0" est présente
- Le badge statut "En révision" s'affiche
- Le compteur "6 placeholders restants" s'affiche

- [ ] **Étape 4 : Vérifier le viewer**

Cliquer sur la carte. Vérifier :
- Les 13 articles s'affichent à gauche
- Les placeholders `[RAISON SOCIALE]` etc. sont en orange et cliquables
- Le panel d'annotations est vide à droite
- Cliquer "Annoter" sur un article → le panel droite focus cet article
- Écrire une annotation et la publier → elle apparaît avec le prénom de l'auteur

- [ ] **Étape 5 : Vérifier les placeholders**

Cliquer sur `[RAISON SOCIALE]` → champ de saisie apparaît → saisir une valeur → OK → le texte passe en vert avec la valeur saisie.

- [ ] **Étape 6 : Push**

```bash
git push origin dev2
```

---

## Résumé des commits attendus

1. `feat(db): tables legal_documents, document_sections, annotations, placeholders`
2. `feat(db): seed CGU Professionnels v1.0 (13 articles)`
3. `feat(admin): server actions documents (addAnnotation, fillPlaceholder, updateStatus)`
4. `feat(admin): navigation Documents avec sous-menu dynamique`
5. `feat(admin): page liste des documents annotables`
6. `feat(admin): page serveur viewer document`
7. `feat(admin): DocumentViewer layout 2 colonnes`
8. `feat(admin): AnnotationPanel avec threads par section`
9. `feat(admin): PlaceholderEditor inline + renderContentWithPlaceholders`
