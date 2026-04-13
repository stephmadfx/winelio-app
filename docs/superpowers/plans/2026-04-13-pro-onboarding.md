# Pro Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un wizard guidé 3 étapes (`/profile/pro-onboarding`) déclenché quand un utilisateur active le toggle "Compte professionnel" dans son profil.

**Architecture:** Server component pour le chargement des données (catégories, profil, company existante) + client component `ProOnboardingWizard` gérant le state des 3 étapes. La server action `completeProOnboarding()` sauvegarde tout en une fois à la fin. Migration SQL pour ajouter `work_mode` et `pro_engagement_accepted` dans `winelio.profiles`.

**Tech Stack:** Next.js 15 App Router, Supabase (schéma `winelio`), Tailwind CSS v4, TypeScript

---

## Carte des fichiers

| Fichier | Action | Rôle |
|---------|--------|------|
| `supabase/migrations/20260413_pro_fields.sql` | Créer | Ajouter `work_mode` + `pro_engagement_accepted` à `profiles` |
| `src/app/(protected)/profile/actions.ts` | Modifier | Ajouter `completeProOnboarding()` server action |
| `src/app/(protected)/profile/pro-onboarding/page.tsx` | Créer | Server component : charge catégories + profil + company |
| `src/components/ProOnboardingWizard.tsx` | Créer | Client component : wizard 3 étapes |
| `src/components/profile-form.tsx` | Modifier | Toggle ON → redirect (sauf si déjà onboardé) |
| `src/app/(protected)/profile/page.tsx` | Modifier | Lire `?pro=1` pour afficher message de bienvenue Pro |

---

## Task 1 : Migration DB

**Files:**
- Créer : `supabase/migrations/20260413_pro_fields.sql`

- [ ] **Créer le fichier de migration**

```sql
-- supabase/migrations/20260413_pro_fields.sql
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS work_mode TEXT
    CHECK (work_mode IN ('remote', 'onsite', 'both')),
  ADD COLUMN IF NOT EXISTS pro_engagement_accepted BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260413_pro_fields.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260413_pro_fields.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260413_pro_fields.sql"
```

Résultat attendu : `ALTER TABLE` (deux fois, une par colonne).

- [ ] **Vérifier les colonnes**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='winelio' AND table_name='profiles' AND column_name IN ('work_mode','pro_engagement_accepted');\""
```

Résultat attendu : 2 lignes — `work_mode` (text) et `pro_engagement_accepted` (boolean).

- [ ] **Committer**

```bash
git add supabase/migrations/20260413_pro_fields.sql
git commit -m "feat(db): add work_mode + pro_engagement_accepted to profiles"
```

---

## Task 2 : Server action `completeProOnboarding()`

**Files:**
- Modifier : `src/app/(protected)/profile/actions.ts`

- [ ] **Ajouter la server action** en bas du fichier `src/app/(protected)/profile/actions.ts`

```typescript
/**
 * Finalise l'onboarding Pro :
 * 1. Met à jour profiles (is_professional, work_mode, pro_engagement_accepted)
 * 2. Crée ou met à jour la company principale (siret, category_id)
 */
export async function completeProOnboarding(data: {
  work_mode: "remote" | "onsite" | "both";
  category_id: string;
  siret: string | null;
}): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const supabase = await createClient();

  // 1. Mettre à jour le profil
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      is_professional: true,
      work_mode: data.work_mode,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  if (profileError) return { error: "Erreur lors de la mise à jour du profil." };

  // 2. Récupérer le profil pour le nom (fallback name)
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const fallbackName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mon entreprise";

  // 3. Vérifier si une company existe déjà
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingCompany) {
    // Mettre à jour la company existante
    const patch: Record<string, string | null> = {};
    if (data.category_id) patch.category_id = data.category_id;
    if (data.siret !== null) patch.siret = data.siret;

    if (Object.keys(patch).length > 0) {
      const { error: companyError } = await supabase
        .from("companies")
        .update(patch)
        .eq("id", existingCompany.id);
      if (companyError) return { error: "Erreur lors de la mise à jour de l'entreprise." };
    }
  } else {
    // Créer une nouvelle company
    const { generateUniqueAlias } = await import("@/lib/generate-alias");
    const alias = await generateUniqueAlias(supabase);

    const { error: companyError } = await supabase.from("companies").insert({
      owner_id: user.id,
      name: fallbackName,
      category_id: data.category_id || null,
      siret: data.siret || null,
      alias,
    });
    if (companyError) return { error: "Erreur lors de la création de l'entreprise." };
  }

  return {};
}
```

- [ ] **Vérifier que le fichier compile sans erreur**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Résultat attendu : aucune erreur TypeScript.

- [ ] **Committer**

```bash
git add src/app/(protected)/profile/actions.ts
git commit -m "feat(profile): add completeProOnboarding server action"
```

---

## Task 3 : Page server `/profile/pro-onboarding`

**Files:**
- Créer : `src/app/(protected)/profile/pro-onboarding/page.tsx`

- [ ] **Créer la page server component**

```typescript
// src/app/(protected)/profile/pro-onboarding/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProOnboardingWizard } from "@/components/ProOnboardingWizard";

export default async function ProOnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Si déjà onboardé → retour au profil directement
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, pro_engagement_accepted, work_mode")
    .eq("id", user.id)
    .single();

  if (profile?.pro_engagement_accepted) {
    redirect("/profile");
  }

  // Charger les catégories
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  // Charger la company existante (s'il en a une)
  const { data: company } = await supabase
    .from("companies")
    .select("siret, category_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <ProOnboardingWizard
        categories={categories ?? []}
        defaultSiret={company?.siret ?? ""}
        defaultCategoryId={company?.category_id ?? ""}
      />
    </div>
  );
}
```

- [ ] **Vérifier que TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Committer**

```bash
git add src/app/(protected)/profile/pro-onboarding/page.tsx
git commit -m "feat(profile): add pro-onboarding server page"
```

---

## Task 4 : Composant `ProOnboardingWizard` — squelette + étape 1

**Files:**
- Créer : `src/components/ProOnboardingWizard.tsx`

- [ ] **Créer le composant avec le squelette et l'étape 1 (work_mode)**

```typescript
// src/components/ProOnboardingWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeProOnboarding } from "@/app/(protected)/profile/actions";

type WorkMode = "remote" | "onsite" | "both";

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  defaultSiret: string;
  defaultCategoryId: string;
}

const WORK_MODES: { value: WorkMode; label: string; sub: string; icon: string }[] = [
  { value: "remote",  label: "Distanciel", sub: "En ligne",    icon: "💻" },
  { value: "onsite",  label: "Présentiel", sub: "En personne", icon: "🤝" },
  { value: "both",    label: "Les deux",   sub: "Flexible",    icon: "🌍" },
];

export function ProOnboardingWizard({ categories, defaultSiret, defaultCategoryId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [siret, setSiret] = useState(defaultSiret);
  const [siretSkipped, setSiretSkipped] = useState(false);
  const [engagementChecked, setEngagementChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const result = await completeProOnboarding({
      work_mode: workMode!,
      category_id: categoryId,
      siret: siretSkipped ? null : siret.trim() || null,
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/profile?pro=1");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Barre de progression */}
      <StepBar current={step} />

      {/* Étape 1 */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <span className="inline-block bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
            ÉTAPE 1 / 3
          </span>
          <h2 className="text-xl font-bold text-winelio-dark mb-1">Comment tu travailles avec tes clients ?</h2>
          <p className="text-sm text-winelio-gray mb-6">Cela aide tes futurs clients à savoir comment te contacter.</p>
          <div className="grid grid-cols-3 gap-3">
            {WORK_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setWorkMode(m.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  workMode === m.value
                    ? "border-winelio-orange bg-orange-50"
                    : "border-gray-200 hover:border-winelio-orange/40"
                }`}
              >
                <span className="text-3xl">{m.icon}</span>
                <span className={`text-sm font-semibold ${workMode === m.value ? "text-winelio-orange" : "text-winelio-dark"}`}>
                  {m.label}
                </span>
                <span className="text-xs text-winelio-gray">{m.sub}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={!workMode}
              onClick={() => setStep(2)}
              className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* Étape 2 */}
      {step === 2 && (
        <Step2
          categories={categories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          siret={siret}
          setSiret={setSiret}
          siretSkipped={siretSkipped}
          setSiretSkipped={setSiretSkipped}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {/* Étape 3 */}
      {step === 3 && (
        <Step3
          checked={engagementChecked}
          setChecked={setEngagementChecked}
          saving={saving}
          error={error}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

/* ── Barre de progression ── */
function StepBar({ current }: { current: number }) {
  const steps = ["Mon activité", "Mon entreprise", "Engagement"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={n} className="flex-1 flex flex-col items-center gap-1 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                done
                  ? "bg-green-500 text-white"
                  : active
                  ? "bg-gradient-to-br from-winelio-orange to-winelio-amber text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {done ? "✓" : n}
            </div>
            <span className={`text-xs font-medium ${active ? "text-winelio-orange" : "text-gray-400"}`}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`absolute top-4 left-1/2 w-full h-0.5 -z-10 ${done ? "bg-green-400" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Étape 2 ── */
function Step2({
  categories, categoryId, setCategoryId, siret, setSiret,
  siretSkipped, setSiretSkipped, onBack, onNext,
}: {
  categories: Category[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  siret: string;
  setSiret: (v: string) => void;
  siretSkipped: boolean;
  setSiretSkipped: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 2 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-6">Ton activité professionnelle</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Catégorie d&apos;activité <span className="text-winelio-orange">*</span>
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white"
          >
            <option value="">Sélectionner une catégorie…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Numéro SIRET{" "}
            <span className="text-gray-400 text-xs font-normal">(fortement recommandé)</span>
          </label>
          <input
            type="text"
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            disabled={siretSkipped}
            placeholder="123 456 789 00012"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={() => { setSiretSkipped(!siretSkipped); setSiret(""); }}
            className="mt-1.5 text-xs text-winelio-orange hover:underline"
          >
            {siretSkipped ? "← Renseigner mon SIRET" : "Je n'ai pas encore de SIRET →"}
          </button>
        </div>
      </div>
      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          ← Retour
        </button>
        <button
          type="button"
          disabled={!categoryId}
          onClick={onNext}
          className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}

/* ── Étape 3 ── */
function Step3({
  checked, setChecked, saving, error, onBack, onSubmit,
}: {
  checked: boolean;
  setChecked: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 3 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-1">Tu as tout à gagner 🚀</h2>
      <p className="text-sm text-winelio-gray mb-4">Lis et accepte cet engagement pour activer ton compte Pro.</p>
      <div className="bg-orange-50 border-l-4 border-winelio-orange rounded-r-xl p-4 mb-5 text-sm text-winelio-dark leading-relaxed">
        Je m&apos;engage à traiter chaque recommandation avec sérieux et réactivité. Je comprends que chaque lead
        Winelio est une opportunité concrète d&apos;augmenter mon chiffre d&apos;affaires. Je m&apos;engage à suivre
        l&apos;avancement de chaque mission directement via l&apos;application Winelio, car c&apos;est ce qui me
        garantit d&apos;être recommandé à nouveau, de gagner en visibilité et de fidéliser ma clientèle sur le
        long terme.
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <div
          onClick={() => setChecked(!checked)}
          className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
            checked
              ? "bg-gradient-to-br from-winelio-orange to-winelio-amber border-winelio-orange"
              : "border-gray-300"
          }`}
        >
          {checked && <span className="text-white text-xs font-bold">✓</span>}
        </div>
        <span className="text-sm text-winelio-dark font-medium">
          J&apos;ai lu et j&apos;accepte cet engagement — je suis prêt à booster mon activité avec Winelio.
        </span>
      </label>
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="mt-6 flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          ← Retour
        </button>
        <button
          type="button"
          disabled={!checked || saving}
          onClick={onSubmit}
          className="px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:opacity-90 transition-opacity disabled:opacity-40 text-base"
        >
          {saving ? "Activation…" : "🚀 Devenir Pro !"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Vérifier que TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Committer**

```bash
git add src/components/ProOnboardingWizard.tsx
git commit -m "feat(profile): ProOnboardingWizard - 3-step Pro onboarding"
```

---

## Task 5 : Modifier `profile-form.tsx` — comportement du toggle

**Files:**
- Modifier : `src/components/profile-form.tsx`

Le toggle "Compte professionnel" doit rediriger vers `/profile/pro-onboarding` à l'activation, sauf si l'utilisateur a déjà fait l'onboarding.

- [ ] **Mettre à jour l'interface `Profile`** pour inclure `pro_engagement_accepted`

Localiser la ligne `interface Profile {` (ligne ~8) et ajouter le champ :

```typescript
interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  is_professional: boolean;
  pro_engagement_accepted: boolean;   // ← ajouter
  sponsor_code: string | null;
  sponsor_id: string | null;
}
```

- [ ] **Remplacer le gestionnaire du toggle** (le `onClick` du switch `is_professional`, actuellement ligne ~247)

Remplacer :

```typescript
onClick={() => setForm((prev) => ({ ...prev, is_professional: !prev.is_professional }))}
```

Par :

```typescript
onClick={() => {
  if (!form.is_professional) {
    // Activer → rediriger vers onboarding sauf si déjà fait
    if (profile.pro_engagement_accepted) {
      const updated = { ...form, is_professional: true };
      setForm(updated);
      saveToDb(updated);  // sauvegarde immédiate
    } else {
      router.push("/profile/pro-onboarding");
    }
  } else {
    // Désactiver → sauvegarde immédiate
    const updated = { ...form, is_professional: false };
    setForm(updated);
    saveToDb(updated);
  }
}}
```

- [ ] **Mettre à jour la page `profile/page.tsx`** pour passer `pro_engagement_accepted` dans le select et dans les props

Dans `src/app/(protected)/profile/page.tsx`, mettre à jour le select :

```typescript
const { data: profile } = await supabase
  .from("profiles")
  .select("id, first_name, last_name, phone, address, city, postal_code, is_professional, pro_engagement_accepted, sponsor_code, sponsor_id")
  .eq("id", user.id)
  .single();
```

- [ ] **Vérifier que TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Committer**

```bash
git add src/components/profile-form.tsx src/app/(protected)/profile/page.tsx
git commit -m "feat(profile): toggle Pro redirects to onboarding wizard"
```

---

## Task 6 : Message de bienvenue Pro après onboarding

**Files:**
- Modifier : `src/app/(protected)/profile/page.tsx`

Afficher un bandeau "Félicitations, vous êtes Pro !" si `?pro=1` est présent dans l'URL.

- [ ] **Mettre à jour `profile/page.tsx`** pour lire le searchParam et le transmettre

```typescript
// src/app/(protected)/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ pro?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, address, city, postal_code, is_professional, pro_engagement_accepted, sponsor_code, sponsor_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/auth/login");

  const params = await searchParams;
  const showProWelcome = params.pro === "1";

  return (
    <div className="">
      <h2 className="text-2xl font-bold text-winelio-dark mb-6">Mon profil</h2>
      {showProWelcome && (
        <div className="mb-6 p-4 bg-orange-50 border border-winelio-orange/30 rounded-2xl flex items-start gap-3">
          <span className="text-2xl">🚀</span>
          <div>
            <p className="font-semibold text-winelio-orange">Félicitations, vous êtes Pro !</p>
            <p className="text-sm text-winelio-gray mt-0.5">
              Votre compte professionnel est actif. Vous allez commencer à recevoir des recommandations.
            </p>
          </div>
        </div>
      )}
      <ProfileForm profile={profile} userEmail={user.email ?? ""} />
    </div>
  );
}
```

- [ ] **Vérifier que TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Lancer le build complet pour valider**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : `✓ Compiled successfully` sans erreurs.

- [ ] **Committer**

```bash
git add src/app/(protected)/profile/page.tsx
git commit -m "feat(profile): show Pro welcome banner after onboarding"
```

---

## Task 7 : Test manuel bout en bout

- [ ] **Relancer le serveur dev**

```bash
pkill -f "next dev"; sleep 1; npm run dev &
```

- [ ] **Ouvrir http://localhost:3002/profile**

Vérifier que le toggle "Compte professionnel" redirige bien vers `/profile/pro-onboarding`.

- [ ] **Parcourir les 3 étapes du wizard**

  - Étape 1 : sélectionner un mode de travail → "Suivant" devient actif
  - Étape 2 : choisir une catégorie + SIRET optionnel → tester "Je n'ai pas encore de SIRET"
  - Étape 3 : cocher l'engagement → "Devenir Pro !" devient actif → cliquer

- [ ] **Vérifier le redirect et le bandeau de bienvenue**

Après soumission, vérifier que `/profile?pro=1` s'affiche avec le bandeau orange.

- [ ] **Vérifier en DB**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -c \"SELECT id, is_professional, work_mode, pro_engagement_accepted FROM winelio.profiles WHERE is_professional = true LIMIT 5;\""
```

Résultat attendu : le compte testé apparaît avec `is_professional=t`, `work_mode` rempli, `pro_engagement_accepted=t`.

- [ ] **Tester la désactivation du toggle**

Désactiver le toggle depuis `/profile` → `is_professional` repasse à `false`, pas de re-onboarding. Réactiver → sauvegarde directe (pas de wizard, car `pro_engagement_accepted = true`).

- [ ] **Commit final + push**

```bash
git push origin dev2
```
