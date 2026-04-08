# Alias Professionnels — Design Spec
**Date :** 2026-04-01  
**Statut :** Validé

---

## Contexte

Les entreprises professionnelles sur Winelio sont actuellement identifiées par leur vrai nom (`companies.name`). Pour des raisons de confidentialité et de neutralité dans le réseau MLM, les utilisateurs lambda ne doivent pas voir le nom réel des entreprises — uniquement un alias opaque et unique.

---

## Objectif

Associer un alias unique (ex. `#154RD7`) à chaque entreprise (`companies`). Les utilisateurs lambda voient l'alias + catégorie + ville. Les super admins voient le nom complet en titre et l'alias en sous-titre.

---

## 1. Modèle de données

### Colonne ajoutée sur `companies`

```sql
ALTER TABLE companies ADD COLUMN alias VARCHAR(7) UNIQUE;
CREATE INDEX idx_companies_alias ON companies(alias);
```

- **Format :** `#` + 6 caractères alphanumériques uppercase (`A–Z`, `0–9`)
- **Exemple :** `#154RD7`, `#9AZK31`
- **Espace de noms :** 36⁶ ≈ 2,1 milliards de combinaisons
- **Contrainte UNIQUE** en base = filet de sécurité absolu contre les doublons
- Nullable initialement pour permettre le backfill, puis NOT NULL après migration

### RLS

Pas de changement — `alias` est une colonne publique de `companies`, accessible en lecture par tous les rôles existants.

---

## 2. Génération de l'alias

### Algorithme

```typescript
// lib/generate-alias.ts
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export async function generateUniqueAlias(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join("");
    const alias = `#${suffix}`;

    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("alias", alias)
      .maybeSingle();

    if (!data) return alias;
  }
  throw new Error("Impossible de générer un alias unique après 10 tentatives");
}
```

- Appelée **avant** l'INSERT lors de la création d'une entreprise
- 10 tentatives max (en pratique jamais plus d'1 à cette échelle)
- La contrainte UNIQUE en DB reste le dernier rempart contre les race conditions

---

## 3. Logique d'affichage

### Helper central

```typescript
// lib/company-display.ts
type CompanyDisplay = {
  primary: string;
  secondary: string | null;
};

export function getCompanyDisplay(
  company: { name: string; alias: string; category?: string | null; city?: string | null },
  isAdmin: boolean
): CompanyDisplay {
  if (isAdmin) {
    return {
      primary: company.name,
      secondary: company.alias,
    };
  }
  return {
    primary: company.alias,
    secondary: [company.category, company.city].filter(Boolean).join(" · ") || null,
  };
}
```

### Rendu utilisateur lambda

```
┌─────────────────────────────────────┐
│ [avatar]  #154RD7                   │
│           [Plomberie]  Paris        │
└─────────────────────────────────────┘
```

- Titre : alias (`#154RD7`)
- Sous-titre : badge catégorie coloré + ville

### Rendu super admin

```
┌─────────────────────────────────────┐
│ [avatar]  Plomberie Durand SARL     │
│           #154RD7  [Plomberie]  Paris│
└─────────────────────────────────────┘
```

- Titre : nom complet de l'entreprise
- Sous-titre : alias en orange + badge catégorie + ville

### Composants à mettre à jour

| Fichier | Changement |
|---|---|
| `src/app/(protected)/recommendations/page.tsx` | Nom pro → `getCompanyDisplay` |
| `src/app/(protected)/recommendations/new/page.tsx` | Résultats → alias affiché, query sur `name` |
| `src/app/(protected)/network/page.tsx` | Filleuls pros → alias |
| `src/components/network-tree.tsx` | Nœuds pros → alias |
| `src/components/network-graph.tsx` | Nœuds pros → alias |
| `src/components/admin/ProfessionnelsTable.tsx` | Nom complet titre + alias sous-titre |
| `src/app/gestion-reseau/utilisateurs/[id]/page.tsx` | Idem admin |

---

## 4. Recherche

La recherche reste fonctionnelle sur le vrai nom pour les utilisateurs lambda, avec support de la recherche directe par alias.

```typescript
// Détection automatique : si la query commence par #, cherche par alias
const isAliasSearch = query.startsWith("#");

const { data } = await supabase
  .from("companies")
  .select("id, alias, name, city, category:categories(name)")
  .or(
    isAliasSearch
      ? `alias.ilike.${query}%`
      : `name.ilike.%${query}%, legal_name.ilike.%${query}%`
  )
  .limit(10);
```

- **Utilisateur lambda :** tape le nom réel OU l'alias — les résultats affichent l'alias
- **Admin (`ProfessionnelsTable`) :** recherche sur `name`, `legal_name` et `alias`

---

## 5. Migration

### Ordre d'exécution

1. **Migration 1** — ajouter la colonne nullable
   ```sql
   -- supabase/migrations/YYYYMMDD_add_company_alias.sql
   ALTER TABLE companies ADD COLUMN alias VARCHAR(7) UNIQUE;
   CREATE INDEX idx_companies_alias ON companies(alias);
   ```

2. **Script backfill** — générer les alias pour les entreprises existantes
   ```bash
   npx tsx scripts/backfill-aliases.ts
   ```

3. **Migration 2** — passer la colonne en NOT NULL
   ```sql
   -- supabase/migrations/YYYYMMDD_company_alias_not_null.sql
   ALTER TABLE companies ALTER COLUMN alias SET NOT NULL;
   ```

### Script backfill (`scripts/backfill-aliases.ts`)

```typescript
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateUniqueAlias } from "@/lib/generate-alias";

async function main() {
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .is("alias", null);

  console.log(`${companies?.length ?? 0} entreprises à migrer`);

  for (const company of companies ?? []) {
    const alias = await generateUniqueAlias(supabaseAdmin);
    await supabaseAdmin
      .from("companies")
      .update({ alias })
      .eq("id", company.id);
    console.log(`✓ ${company.name} → ${alias}`);
  }

  console.log("Backfill terminé.");
}

main().catch(console.error);
```

---

## Périmètre hors scope

- Changement d'alias après création (pas de besoin identifié)
- Historique des alias
- Alias sur `profiles` (uniquement sur `companies`)
- Affichage de l'alias dans les emails transactionnels
