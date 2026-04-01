# Alias Professionnels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Associer un alias unique `#XXXXXX` à chaque entreprise (`companies`) et masquer le vrai nom pour les utilisateurs lambda, tout en montrant nom complet + alias aux super admins.

**Architecture:** Colonne `alias VARCHAR(7) UNIQUE` sur `companies`, générée aléatoirement avec vérification d'unicité. Un helper `lib/generate-alias.ts` encapsule la génération. Un helper `lib/company-display.ts` centralise la logique d'affichage selon le rôle. Les composants affichant des pros sont mis à jour pour utiliser ces helpers.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgREST), TypeScript, Tailwind CSS v4

---

## Fichiers touchés

| Action | Fichier |
|---|---|
| CREATE | `supabase/migrations/004_add_company_alias.sql` |
| CREATE | `supabase/migrations/005_company_alias_not_null.sql` |
| CREATE | `src/lib/generate-alias.ts` |
| CREATE | `src/lib/company-display.ts` |
| CREATE | `scripts/backfill-aliases.ts` |
| MODIFY | `src/components/new-company-form.tsx` |
| MODIFY | `src/app/(protected)/recommendations/page.tsx` |
| MODIFY | `src/app/(protected)/recommendations/new/page.tsx` |
| MODIFY | `src/app/(protected)/network/page.tsx` |
| MODIFY | `src/components/network-tree.tsx` |
| MODIFY | `src/components/network-graph.tsx` |
| MODIFY | `src/app/api/network/children/route.ts` |
| MODIFY | `src/components/admin/ProfessionnelsTable.tsx` |
| MODIFY | `src/app/gestion-reseau/utilisateurs/[id]/page.tsx` |
| MODIFY | `src/app/gestion-reseau/professionnels/page.tsx` |

---

## Task 1 : Migration SQL — colonne `alias` nullable

**Files:**
- Create: `supabase/migrations/004_add_company_alias.sql`

- [ ] **Step 1 : Créer la migration**

Créer `supabase/migrations/004_add_company_alias.sql` avec ce contenu exact :

```sql
-- Add unique alias column to companies
-- Nullable first to allow backfill of existing rows
ALTER TABLE companies ADD COLUMN IF NOT EXISTS alias VARCHAR(7);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_alias ON companies(alias);
```

- [ ] **Step 2 : Appliquer sur la base Supabase Cloud**

```bash
# Depuis le projet, utiliser le client Supabase ou exécuter via le dashboard SQL Editor
# URL dashboard : https://supabase.com/dashboard/project/dxnebmxtkvauergvrmod/editor

# Commande alternative via psql (VPS) :
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec temp-supabase-db psql -U supabase_admin -d postgres -c \
  'ALTER TABLE companies ADD COLUMN IF NOT EXISTS alias VARCHAR(7); CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_alias ON companies(alias);'"
```

Résultat attendu : `ALTER TABLE` + `CREATE INDEX` sans erreur.

- [ ] **Step 3 : Vérifier la colonne**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec temp-supabase-db psql -U supabase_admin -d postgres -c \
  '\d companies' | grep alias"
```

Résultat attendu : `alias | character varying(7) | |`

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/004_add_company_alias.sql
git commit -m "feat: migration add alias column to companies (nullable)"
```

---

## Task 2 : Helper `lib/generate-alias.ts`

**Files:**
- Create: `src/lib/generate-alias.ts`

- [ ] **Step 1 : Créer le fichier**

Créer `src/lib/generate-alias.ts` :

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Génère un alias unique de format #XXXXXX (6 chars alphanumériques uppercase).
 * Vérifie l'unicité en base avant de retourner. Lance une erreur après 10 tentatives.
 */
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

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
cd /Users/steph/PROJETS/BUZRECO/buzreco
npx tsc --noEmit 2>&1 | grep "generate-alias"
```

Résultat attendu : aucune erreur sur ce fichier.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/generate-alias.ts
git commit -m "feat: add generateUniqueAlias helper"
```

---

## Task 3 : Helper `lib/company-display.ts`

**Files:**
- Create: `src/lib/company-display.ts`

- [ ] **Step 1 : Créer le fichier**

Créer `src/lib/company-display.ts` :

```typescript
export type CompanyForDisplay = {
  name: string;
  alias: string | null;
  category?: string | null;
  city?: string | null;
};

export type CompanyDisplay = {
  /** Texte principal affiché (alias pour users, nom réel pour admins) */
  primary: string;
  /** Sous-texte (alias pour admins, "Catégorie · Ville" pour users) */
  secondary: string | null;
};

/**
 * Retourne l'objet d'affichage selon le rôle.
 * - isAdmin=false → primary: alias (#XXXXXX), secondary: "Catégorie · Ville"
 * - isAdmin=true  → primary: nom complet, secondary: alias + éventuellement "Catégorie · Ville"
 */
export function getCompanyDisplay(
  company: CompanyForDisplay,
  isAdmin: boolean
): CompanyDisplay {
  const alias = company.alias ?? "—";
  const context = [company.category, company.city].filter(Boolean).join(" · ") || null;

  if (isAdmin) {
    return {
      primary: company.name,
      secondary: alias,
    };
  }

  return {
    primary: alias,
    secondary: context,
  };
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "company-display"
```

Résultat attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/company-display.ts
git commit -m "feat: add getCompanyDisplay helper (alias vs nom complet selon rôle)"
```

---

## Task 4 : `new-company-form.tsx` — génération de l'alias à la création

**Files:**
- Modify: `src/components/new-company-form.tsx`

Le fichier actuel insère une entreprise sans `alias`. Il faut appeler `generateUniqueAlias` avant l'INSERT.

- [ ] **Step 1 : Ajouter l'import**

Dans `src/components/new-company-form.tsx`, ajouter en haut du fichier (après les imports existants) :

```typescript
import { generateUniqueAlias } from "@/lib/generate-alias";
```

- [ ] **Step 2 : Modifier la fonction de soumission**

Localiser le bloc d'insertion (lignes ~54-66) :

```typescript
const { error: insertError } = await supabase.from("companies").insert({
  name: form.name,
  legal_name: form.legal_name || null,
  email: form.email || null,
  phone: form.phone || null,
  website: form.website || null,
  address: form.address || null,
  city: form.city || null,
  postal_code: form.postal_code || null,
  siret: form.siret || null,
  category_id: form.category_id || null,
  owner_id: userId,
});
```

Remplacer par :

```typescript
const alias = await generateUniqueAlias(supabase);

const { error: insertError } = await supabase.from("companies").insert({
  name: form.name,
  legal_name: form.legal_name || null,
  email: form.email || null,
  phone: form.phone || null,
  website: form.website || null,
  address: form.address || null,
  city: form.city || null,
  postal_code: form.postal_code || null,
  siret: form.siret || null,
  category_id: form.category_id || null,
  owner_id: userId,
  alias,
});
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "new-company-form"
```

Résultat attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/components/new-company-form.tsx
git commit -m "feat: generate unique alias on company creation"
```

---

## Task 5 : Script backfill + migration NOT NULL

**Files:**
- Create: `scripts/backfill-aliases.ts`
- Create: `supabase/migrations/005_company_alias_not_null.sql`

- [ ] **Step 1 : Créer le script de backfill**

Créer `scripts/backfill-aliases.ts` :

```typescript
import { supabaseAdmin } from "../src/lib/supabase/admin";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

async function generateUniqueAlias(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join("");
    const alias = `#${suffix}`;

    const { data } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("alias", alias)
      .maybeSingle();

    if (!data) return alias;
  }
  throw new Error("Impossible de générer un alias unique après 10 tentatives");
}

async function main() {
  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .is("alias", null);

  if (error) {
    console.error("Erreur fetch companies:", error.message);
    process.exit(1);
  }

  console.log(`${companies?.length ?? 0} entreprise(s) à migrer...`);

  for (const company of companies ?? []) {
    const alias = await generateUniqueAlias();
    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update({ alias })
      .eq("id", company.id);

    if (updateError) {
      console.error(`✗ ${company.name}: ${updateError.message}`);
    } else {
      console.log(`✓ ${company.name} → ${alias}`);
    }
  }

  console.log("Backfill terminé.");
}

main().catch(console.error);
```

- [ ] **Step 2 : Exécuter le backfill**

```bash
cd /Users/steph/PROJETS/BUZRECO/buzreco
npx tsx scripts/backfill-aliases.ts
```

Résultat attendu : une ligne `✓ <NomEntreprise> → #XXXXXX` par entreprise existante, puis "Backfill terminé."

- [ ] **Step 3 : Vérifier que toutes les companies ont un alias**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec temp-supabase-db psql -U supabase_admin -d postgres -c \
  'SELECT COUNT(*) FROM companies WHERE alias IS NULL;'"
```

Résultat attendu : `count = 0`

- [ ] **Step 4 : Créer la migration NOT NULL**

Créer `supabase/migrations/005_company_alias_not_null.sql` :

```sql
-- After backfill, enforce NOT NULL constraint on alias
ALTER TABLE companies ALTER COLUMN alias SET NOT NULL;
```

- [ ] **Step 5 : Appliquer la migration NOT NULL**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec temp-supabase-db psql -U supabase_admin -d postgres -c \
  'ALTER TABLE companies ALTER COLUMN alias SET NOT NULL;'"
```

Résultat attendu : `ALTER TABLE` sans erreur.

- [ ] **Step 6 : Commit**

```bash
git add scripts/backfill-aliases.ts supabase/migrations/005_company_alias_not_null.sql
git commit -m "feat: backfill script + migration alias NOT NULL"
```

---

## Task 6 : `recommendations/page.tsx` — affichage alias

**Files:**
- Modify: `src/app/(protected)/recommendations/page.tsx`

Ce composant client affiche la liste des recommandations. Le professionnel est affiché via `proName`. Il faut récupérer le company alias du professionnel et l'afficher.

- [ ] **Step 1 : Mettre à jour l'interface `Recommendation`**

Localiser l'interface `Recommendation` (lignes ~16-18). Remplacer la ligne du `professional` :

Avant :
```typescript
professional: { first_name: string | null; last_name: string | null } | null;
```

Après :
```typescript
professional: {
  first_name: string | null;
  last_name: string | null;
  companies: { alias: string | null; city: string | null; category: { name: string } | null } | null;
} | null;
```

- [ ] **Step 2 : Mettre à jour la requête Supabase**

Localiser la requête `.select(...)` dans `fetchRecommendations` (ligne ~127). Remplacer :

```typescript
"id, status, amount, created_at, contact:contacts(first_name, last_name), professional:profiles!recommendations_professional_id_fkey(first_name, last_name)"
```

Par :

```typescript
`id, status, amount, created_at,
 contact:contacts(first_name, last_name),
 professional:profiles!recommendations_professional_id_fkey(
   first_name, last_name,
   companies!owner_id(alias, city, category:categories(name))
 )`
```

- [ ] **Step 3 : Normaliser les données après fetch**

Localiser le `.map((r) => ({ ...r, ... }))` (lignes ~133-139). Ajouter la normalisation du `companies` imbriqué :

```typescript
setAllRecommendations(
  (data ?? []).map((r) => {
    const pro = Array.isArray(r.professional) ? r.professional[0] ?? null : r.professional;
    const rawCompany = pro ? (Array.isArray(pro.companies) ? pro.companies[0] ?? null : pro.companies) : null;
    const rawCat = rawCompany?.category;
    const companyNormalized = rawCompany ? {
      alias: rawCompany.alias ?? null,
      city: rawCompany.city ?? null,
      category: Array.isArray(rawCat) ? (rawCat[0] ?? null) : (rawCat ?? null),
    } : null;
    return {
      ...r,
      contact: Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact,
      professional: pro ? { ...pro, companies: companyNormalized } : null,
    };
  }) as Recommendation[]
);
```

- [ ] **Step 4 : Mettre à jour l'affichage du `proName`**

Localiser (lignes ~300-302) :

```typescript
const proName = rec.professional
  ? [rec.professional.first_name, rec.professional.last_name].filter(Boolean).join(" ") || "Professionnel inconnu"
  : "Professionnel inconnu";
```

Remplacer par :

```typescript
const proAlias = rec.professional?.companies?.alias;
const proCategory = rec.professional?.companies?.category?.name;
const proCity = rec.professional?.companies?.city;
const proDisplay = proAlias ?? "Professionnel inconnu";
const proSub = [proCategory, proCity].filter(Boolean).join(" · ");
```

- [ ] **Step 5 : Mettre à jour le rendu JSX**

Localiser l'affichage du nom du professionnel (ligne ~323) :

```tsx
<span className="truncate">{proName}</span>
```

Remplacer par :

```tsx
<span className="truncate font-mono font-semibold text-kiparlo-orange">{proDisplay}</span>
{proSub && <span className="text-[10px] text-kiparlo-gray/70 ml-1">{proSub}</span>}
```

- [ ] **Step 6 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "recommendations/page"
```

Résultat attendu : aucune erreur.

- [ ] **Step 7 : Commit**

```bash
git add src/app/\(protected\)/recommendations/page.tsx
git commit -m "feat: afficher alias professionnel dans liste recommandations"
```

---

## Task 7 : `recommendations/new/page.tsx` — affichage alias + recherche

**Files:**
- Modify: `src/app/(protected)/recommendations/new/page.tsx`

Ce composant permet de sélectionner un professionnel. Il faut afficher son alias à la place du nom de son entreprise. La recherche reste fonctionnelle sur le nom réel ET supporte la recherche directe par alias.

- [ ] **Step 1 : Mettre à jour l'interface `Professional`**

Localiser l'interface `Professional` (lignes ~15-27). Ajouter `company_alias` :

```typescript
interface Professional {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_alias: string | null;   // ← ajouter
  category_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  avg_rating: number | null;
  review_count: number;
}
```

- [ ] **Step 2 : Mettre à jour la requête**

Localiser la `.select(...)` dans `useEffect` (ligne ~138). Remplacer :

```typescript
.select("id, first_name, last_name, city, latitude, longitude, company:companies(name, category:categories(name)), reviews!professional_id(rating)")
```

Par :

```typescript
.select("id, first_name, last_name, city, latitude, longitude, company:companies(name, alias, category:categories(name)), reviews!professional_id(rating)")
```

- [ ] **Step 3 : Mettre à jour le mapping des résultats**

Localiser le `.map((p) => { ... })` (lignes ~150-175). Ajouter `company_alias` dans l'objet retourné :

Localiser :
```typescript
return {
  id: p.id,
  first_name: p.first_name,
  last_name: p.last_name,
  company_name: company?.name ?? null,
  category_name: catName,
```

Remplacer par :

```typescript
return {
  id: p.id,
  first_name: p.first_name,
  last_name: p.last_name,
  company_name: company?.name ?? null,
  company_alias: (company as { alias?: string | null } | null)?.alias ?? null,
  category_name: catName,
```

- [ ] **Step 4 : Mettre à jour le filtre de recherche client-side**

Localiser le filtre `proSearch` (vers ligne ~142-146). Remplacer le filtre uniquement serveur par un filtre client-side plus complet. Supprimer la condition PostgREST `.or(...)` sur first_name/last_name et la remplacer par un filtre après le fetch :

Supprimer :
```typescript
if (proSearch.length >= 2) {
  const sanitized = proSearch.replace(/[^a-zA-Z0-9À-ÿ\s\-']/g, "");
  if (sanitized.length >= 2) {
    query = query.or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`);
  }
}
```

Et après `setProfessionals(results)` (ligne ~189), le filtrage client est déjà appliqué via `useMemo` ou dans le même bloc. Ajouter le filtre de recherche dans le bloc `.then()` après construction de `results` :

```typescript
// Filtre de recherche : alias direct (#...) OU nom entreprise OU nom professionnel
if (proSearch.length >= 2) {
  const q = proSearch.toLowerCase();
  results = results.filter((p) => {
    if (proSearch.startsWith("#")) {
      return (p.company_alias ?? "").toLowerCase().startsWith(q);
    }
    return (
      (p.company_name ?? "").toLowerCase().includes(q) ||
      (p.first_name ?? "").toLowerCase().includes(q) ||
      (p.last_name ?? "").toLowerCase().includes(q)
    );
  });
}
```

- [ ] **Step 5 : Mettre à jour l'affichage dans la liste des pros**

Localiser (ligne ~620) :
```typescript
const fullName = `${p.first_name} ${p.last_name}`;
```

Remplacer par :
```typescript
const displayLabel = p.company_alias ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
```

Puis localiser l'endroit où `fullName` (ou le nom de l'entreprise) est affiché dans la carte pro. Chercher `p.company_name` ou le rendu du nom. Remplacer l'affichage du nom de l'entreprise par `displayLabel` :

Avant (utilisation de `fullName` ou `p.company_name`) :
```tsx
<p className="font-semibold text-kiparlo-dark text-sm">{fullName}</p>
```

Après :
```tsx
<p className="font-semibold text-kiparlo-dark text-sm font-mono">{displayLabel}</p>
```

- [ ] **Step 6 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "recommendations/new"
```

Résultat attendu : aucune erreur.

- [ ] **Step 7 : Commit**

```bash
git add src/app/\(protected\)/recommendations/new/page.tsx
git commit -m "feat: afficher alias pro dans recherche de professionnels"
```

---

## Task 8 : `network/page.tsx` — filleuls directs pro → alias

**Files:**
- Modify: `src/app/(protected)/network/page.tsx`

La section "Filleuls directs" affiche les profils (pas les entreprises). Si un filleul est professionnel (`is_professional=true`), il faut afficher son alias d'entreprise.

- [ ] **Step 1 : Mettre à jour la requête des filleuls**

Localiser (ligne ~25-28) :

```typescript
const { data: referrals, count: totalReferrals } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, city, created_at, avatar", { count: "exact" })
  .eq("sponsor_id", user.id);
```

Remplacer par :

```typescript
const { data: referrals, count: totalReferrals } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, city, created_at, avatar, is_professional, companies!owner_id(alias, city, category:categories(name))", { count: "exact" })
  .eq("sponsor_id", user.id);
```

- [ ] **Step 2 : Mettre à jour le mapping `referralsWithStats`**

Localiser le `.map(async (ref) => { ... return { ...ref, ... } })`. Dans le `return`, normaliser les données company :

```typescript
return {
  ...ref,
  sub_referrals: count ?? 0,
  total_commissions: totalCommissions,
  company: (() => {
    const rawCompany = Array.isArray(ref.companies) ? ref.companies[0] ?? null : (ref.companies ?? null);
    if (!rawCompany) return null;
    const rawCat = (rawCompany as Record<string, unknown>).category;
    const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;
    return {
      alias: (rawCompany as { alias?: string | null }).alias ?? null,
      city: (rawCompany as { city?: string | null }).city ?? null,
      category: catName,
    };
  })(),
};
```

- [ ] **Step 3 : Mettre à jour l'affichage du nom dans la section "Filleuls directs"**

Localiser (ligne ~182-183) :
```typescript
const initials = [ref.first_name, ref.last_name].filter(Boolean).map((n: string) => n[0]).join("").toUpperCase() || "?";
const fullName = ((ref.first_name ?? "") + " " + (ref.last_name ?? "")).trim() || "Sans nom";
```

Remplacer par :
```typescript
const initials = [ref.first_name, ref.last_name].filter(Boolean).map((n: string) => n[0]).join("").toUpperCase() || "?";
const isPro = ref.is_professional && ref.company?.alias;
const displayName = isPro
  ? ref.company!.alias!
  : (((ref.first_name ?? "") + " " + (ref.last_name ?? "")).trim() || "Sans nom");
const displaySub = isPro
  ? [ref.company!.category, ref.company!.city ?? ref.city].filter(Boolean).join(" · ")
  : null;
```

- [ ] **Step 4 : Mettre à jour le JSX**

Localiser :
```tsx
<p className="font-semibold text-kiparlo-dark text-sm truncate">{fullName}</p>
<p className="text-xs text-muted-foreground truncate">
  {ref.city && <span className="mr-1">{ref.city} ·</span>}
  {new Date(ref.created_at)...}
</p>
```

Remplacer par :
```tsx
<p className={`font-semibold text-sm truncate ${isPro ? "font-mono text-kiparlo-orange" : "text-kiparlo-dark"}`}>
  {displayName}
</p>
<p className="text-xs text-muted-foreground truncate">
  {displaySub
    ? <span className="mr-1">{displaySub} ·</span>
    : ref.city && <span className="mr-1">{ref.city} ·</span>}
  {new Date(ref.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
</p>
```

- [ ] **Step 5 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "network/page"
```

Résultat attendu : aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/app/\(protected\)/network/page.tsx
git commit -m "feat: afficher alias pour filleuls professionnels dans le réseau"
```

---

## Task 9 : `network-tree.tsx` — nœuds professionnels → alias

**Files:**
- Modify: `src/components/network-tree.tsx`

- [ ] **Step 1 : Mettre à jour l'interface `TreeNode`**

Ajouter `is_professional` et `company_alias`/`company_category` :

```typescript
interface TreeNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  is_professional: boolean;
  company_alias: string | null;
  company_category: string | null;
  referral_count: number;
  total_earned: number;
  children: TreeNode[];
  loaded: boolean;
  expanded: boolean;
}
```

- [ ] **Step 2 : Mettre à jour `fetchChildren`**

Localiser la requête `.select("id, first_name, last_name, city")` dans `fetchChildren`. Remplacer par :

```typescript
const { data: children } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, city, is_professional, companies!owner_id(alias, category:categories(name))")
  .eq("sponsor_id", parentId);
```

Dans le `return` du `Promise.all`, ajouter les nouveaux champs :

```typescript
const rawCompany = Array.isArray(child.companies) ? child.companies[0] ?? null : (child.companies ?? null);
const rawCat = rawCompany ? (rawCompany as Record<string, unknown>).category : null;
const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;

return {
  id: child.id,
  first_name: child.first_name,
  last_name: child.last_name,
  city: child.city,
  is_professional: (child as { is_professional?: boolean }).is_professional ?? false,
  company_alias: rawCompany ? (rawCompany as { alias?: string | null }).alias ?? null : null,
  company_category: catName,
  referral_count: count ?? 0,
  total_earned: totalEarned,
  children: [],
  loaded: false,
  expanded: false,
};
```

- [ ] **Step 3 : Mettre à jour `TreeNodeRow` — logique d'affichage**

Localiser dans `TreeNodeRow` :

```typescript
const displayName =
  level === 1
    ? ([node.first_name, node.last_name].filter(Boolean).join(" ") || "Sans nom")
    : ([node.first_name, node.last_name]
        .filter(Boolean)
        .map((n) => `${n![0].toUpperCase()}.`)
        .join(" ") || "?");
```

Remplacer par :

```typescript
const isPro = node.is_professional && node.company_alias;

const displayName = isPro
  ? node.company_alias!
  : level === 1
  ? ([node.first_name, node.last_name].filter(Boolean).join(" ") || "Sans nom")
  : ([node.first_name, node.last_name]
      .filter(Boolean)
      .map((n) => `${n![0].toUpperCase()}.`)
      .join(" ") || "?");
```

- [ ] **Step 4 : Mettre à jour le rendu du sous-texte**

Localiser :
```tsx
<span className="font-semibold text-kiparlo-dark text-sm truncate">
  {displayName}
</span>
```

Remplacer par :
```tsx
<span className={`font-semibold text-sm truncate ${isPro ? "font-mono text-kiparlo-orange" : "text-kiparlo-dark"}`}>
  {displayName}
</span>
```

Mettre à jour le sous-texte (city + referral_count) pour inclure la catégorie si pro :

```tsx
<p className="text-[11px] text-kiparlo-gray mt-0.5 truncate">
  {[
    isPro ? node.company_category : null,
    node.city,
    node.referral_count > 0
      ? `${node.referral_count} membre${node.referral_count > 1 ? "s" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")}
</p>
```

- [ ] **Step 5 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "network-tree"
```

Résultat attendu : aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/components/network-tree.tsx
git commit -m "feat: afficher alias dans network-tree pour nœuds professionnels"
```

---

## Task 10 : `network-graph.tsx` + API route — nœuds pros → alias

**Files:**
- Modify: `src/app/api/network/children/route.ts`
- Modify: `src/components/network-graph.tsx`

### Partie A — API route

- [ ] **Step 1 : Mettre à jour la requête dans la route API**

Dans `src/app/api/network/children/route.ts`, localiser :

```typescript
const { data: children } = await supabaseAdmin
  .from("profiles")
  .select("id, first_name, last_name, city")
  .eq("sponsor_id", parentId);
```

Remplacer par :

```typescript
const { data: children } = await supabaseAdmin
  .from("profiles")
  .select("id, first_name, last_name, city, is_professional, companies!owner_id(alias, category:categories(name))")
  .eq("sponsor_id", parentId);
```

- [ ] **Step 2 : Mettre à jour le `return` dans la route API**

Localiser :
```typescript
return {
  id: child.id,
  first_name: child.first_name,
  last_name: child.last_name,
  city: child.city,
  childCount: childCount ?? 0,
  activeRecos: activeRecos ?? 0,
  completedRecos: completedRecos ?? 0,
};
```

Remplacer par :
```typescript
const rawCompany = Array.isArray(child.companies) ? child.companies[0] ?? null : (child.companies ?? null);
const rawCat = rawCompany ? (rawCompany as Record<string, unknown>).category : null;
const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;

return {
  id: child.id,
  first_name: child.first_name,
  last_name: child.last_name,
  city: child.city,
  is_professional: (child as { is_professional?: boolean }).is_professional ?? false,
  company_alias: rawCompany ? (rawCompany as { alias?: string | null }).alias ?? null : null,
  company_category: catName,
  childCount: childCount ?? 0,
  activeRecos: activeRecos ?? 0,
  completedRecos: completedRecos ?? 0,
};
```

### Partie B — Composant `network-graph.tsx`

- [ ] **Step 3 : Mettre à jour l'interface `GraphNode`**

Ajouter `is_professional`, `company_alias`, `company_category` :

```typescript
interface GraphNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  is_professional: boolean;
  company_alias: string | null;
  company_category: string | null;
  level: number;
  children: GraphNode[];
  childCount: number;
  loaded: boolean;
  expanded: boolean;
  activeRecos: number;
  completedRecos: number;
}
```

- [ ] **Step 4 : Mettre à jour `fetchChildren` dans le composant**

Localiser le `.map((c: { id: string; ... }) => ({ ... }))`. Mettre à jour le type et le mapping :

```typescript
return (children ?? []).map((c: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  is_professional: boolean;
  company_alias: string | null;
  company_category: string | null;
  childCount: number;
  activeRecos: number;
  completedRecos: number;
}) => ({
  id: c.id,
  first_name: c.first_name,
  last_name: c.last_name,
  city: c.city,
  is_professional: c.is_professional,
  company_alias: c.company_alias,
  company_category: c.company_category,
  level,
  children: [],
  childCount: c.childCount,
  loaded: false,
  expanded: false,
  activeRecos: c.activeRecos,
  completedRecos: c.completedRecos,
}));
```

- [ ] **Step 5 : Mettre à jour le nœud root**

Localiser la création du nœud root `const root: GraphNode = { ... }`. Ajouter les nouveaux champs :

```typescript
const root: GraphNode = {
  id: userId,
  first_name: userName.split(" ")[0] ?? "Moi",
  last_name: userName.split(" ").slice(1).join(" ") ?? "",
  city: null,
  is_professional: false,
  company_alias: null,
  company_category: null,
  level: 0,
  children,
  childCount: totalDirect ?? 0,
  loaded: true,
  expanded: true,
  activeRecos: 0,
  completedRecos: 0,
};
```

- [ ] **Step 6 : Mettre à jour `NodeView` — label sous le nœud**

Localiser dans `NodeView` la span du nom :

```tsx
{isRoot
  ? "Vous"
  : node.level === 1
  ? (node.first_name ?? "")
  : [node.first_name, node.last_name]
      .filter(Boolean)
      .map((n) => `${n![0].toUpperCase()}.`)
      .join("")}
```

Remplacer par :

```tsx
{isRoot
  ? "Vous"
  : node.is_professional && node.company_alias
  ? node.company_alias
  : node.level === 1
  ? (node.first_name ?? "")
  : [node.first_name, node.last_name]
      .filter(Boolean)
      .map((n) => `${n![0].toUpperCase()}.`)
      .join("")}
```

- [ ] **Step 7 : Mettre à jour le panneau "selected node"**

Localiser le bloc `selectedNode && selectedNode.id !== userId` qui affiche les détails. Mettre à jour le nom affiché :

```tsx
<p className="font-semibold text-kiparlo-dark text-sm">
  {selectedNode.is_professional && selectedNode.company_alias
    ? selectedNode.company_alias
    : selectedNode.level === 1
    ? ([selectedNode.first_name, selectedNode.last_name].filter(Boolean).join(" ") || "Sans nom")
    : ([selectedNode.first_name, selectedNode.last_name]
        .filter(Boolean)
        .map((n) => `${n![0].toUpperCase()}.`)
        .join(" ") || "?")}
</p>
<p className="text-xs text-kiparlo-gray">
  {selectedNode.is_professional && selectedNode.company_category && (
    <span className="mr-2">{selectedNode.company_category}</span>
  )}
  {selectedNode.city && <span className="mr-2">{selectedNode.city}</span>}
  Niveau {selectedNode.level} · {selectedNode.childCount} membre{selectedNode.childCount !== 1 ? "s" : ""}
  {selectedNode.activeRecos > 0 && <span className="ml-2 text-kiparlo-orange font-medium">{selectedNode.activeRecos} en cours</span>}
  {selectedNode.completedRecos > 0 && <span className="ml-2 text-green-600 font-medium">{selectedNode.completedRecos} terminee{selectedNode.completedRecos > 1 ? "s" : ""}</span>}
</p>
```

- [ ] **Step 8 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep -E "network-graph|children/route"
```

Résultat attendu : aucune erreur.

- [ ] **Step 9 : Commit**

```bash
git add src/components/network-graph.tsx src/app/api/network/children/route.ts
git commit -m "feat: afficher alias dans network-graph pour nœuds professionnels"
```

---

## Task 11 : `ProfessionnelsTable.tsx` — vue super admin

**Files:**
- Modify: `src/components/admin/ProfessionnelsTable.tsx`
- Modify: `src/app/gestion-reseau/professionnels/page.tsx`

- [ ] **Step 1 : Ajouter `alias` à la requête admin**

Dans `src/app/gestion-reseau/professionnels/page.tsx`, localiser la `.select(...)` :

```typescript
`id, name, legal_name, email, phone, website,
 address, city, postal_code, country,
 latitude, longitude, siret, is_verified, created_at,
 owner:profiles!owner_id(first_name, last_name, email),
 category:categories!category_id(name)`
```

Remplacer par :

```typescript
`id, name, legal_name, alias, email, phone, website,
 address, city, postal_code, country,
 latitude, longitude, siret, is_verified, created_at,
 owner:profiles!owner_id(first_name, last_name, email),
 category:categories!category_id(name)`
```

- [ ] **Step 2 : Ajouter `alias` à l'interface de `ProfessionnelsTable`**

Dans `src/components/admin/ProfessionnelsTable.tsx`, localiser l'interface de la company (ligne ~16) et ajouter :

```typescript
alias: string | null;
```

- [ ] **Step 3 : Afficher alias en titre secondaire dans la table**

Dans `ProfessionnelsTable.tsx`, localiser l'endroit où `c.name` (nom de l'entreprise) est affiché dans le tableau. C'est typiquement dans la colonne principale des entreprises. Ajouter l'alias en orange dessous :

```tsx
<div>
  <p className="font-semibold text-white text-sm">{c.name}</p>
  {c.alias && (
    <p className="text-xs font-mono text-kiparlo-orange mt-0.5">{c.alias}</p>
  )}
</div>
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep -E "ProfessionnelsTable|professionnels/page"
```

Résultat attendu : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/components/admin/ProfessionnelsTable.tsx src/app/gestion-reseau/professionnels/page.tsx
git commit -m "feat: afficher alias + nom complet dans table admin professionnels"
```

---

## Task 12 : `gestion-reseau/utilisateurs/[id]/page.tsx` — vue admin détail

**Files:**
- Modify: `src/app/gestion-reseau/utilisateurs/[id]/page.tsx`

- [ ] **Step 1 : Ajouter `alias` à la requête**

Localiser (ligne ~38) :

```typescript
.select("name, legal_name, siret, siren, vat_number, email, phone, website, address, city, postal_code, is_verified")
```

Remplacer par :

```typescript
.select("name, legal_name, alias, siret, siren, vat_number, email, phone, website, address, city, postal_code, is_verified")
```

- [ ] **Step 2 : Afficher alias sous le nom dans la fiche**

Localiser (ligne ~108) :

```tsx
<p className="text-white">{company.legal_name || company.name || "—"}</p>
```

Remplacer par :

```tsx
<p className="text-white">{company.legal_name || company.name || "—"}</p>
{company.alias && (
  <p className="text-xs font-mono text-kiparlo-orange mt-0.5">{company.alias}</p>
)}
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
npx tsc --noEmit 2>&1 | grep "utilisateurs"
```

Résultat attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add "src/app/gestion-reseau/utilisateurs/[id]/page.tsx"
git commit -m "feat: afficher alias dans fiche utilisateur admin"
```

---

## Task 13 : Build final + push

- [ ] **Step 1 : Build complet**

```bash
cd /Users/steph/PROJETS/BUZRECO/buzreco
npm run build 2>&1 | tail -20
```

Résultat attendu : `✓ Compiled successfully` ou équivalent, sans erreur TypeScript ni erreur de build.

- [ ] **Step 2 : Corriger les éventuelles erreurs de build**

Si des erreurs apparaissent, les corriger avant de continuer. Erreurs TypeScript fréquentes à surveiller :
- Types manquants sur les données company dans les composants réseau
- `company.alias` potentiellement `null` là où on attend `string`

- [ ] **Step 3 : Push + relancer le serveur dev**

```bash
git push origin main
pkill -f "next dev" ; sleep 1 ; cd /Users/steph/PROJETS/BUZRECO/buzreco && npm run dev &
```

- [ ] **Step 4 : Vérification manuelle**

Vérifier dans le navigateur (http://localhost:3001) :
1. **Créer une entreprise** → vérifier qu'un alias `#XXXXXX` est bien généré en base
2. **Page réseau** → les filleuls professionnels affichent leur alias orange
3. **Network tree** → nœuds pros = alias orange, nœuds users = nom/initiales selon niveau
4. **Recommandations** → le nom du professionnel est remplacé par son alias
5. **Recherche pros** (`/recommendations/new`) → taper `#` + début d'alias → trouve le pro
6. **Admin professionnels** (`/gestion-reseau/professionnels`) → nom complet en titre, alias orange en sous-titre
