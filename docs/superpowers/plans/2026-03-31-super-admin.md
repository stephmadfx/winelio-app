# Super Admin Kiparlo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'interface super admin accessible via `/gestion-reseau`, protégée par double vérification (session + rôle `super_admin`), avec 5 sections : dashboard KPIs, recommandations, réseau MLM, utilisateurs, retraits.

**Architecture:** Server Components pour toutes les pages (données via service role, bypass RLS), Server Actions pour toutes les mutations, un seul Client Component (`NetworkTree`) pour l'arbre interactif. Double protection : middleware vérifie le rôle avant d'atteindre le layout.

**Tech Stack:** Next.js 15 (App Router), Supabase service role, Tailwind CSS v4, `react-d3-tree` (arbre MLM)

---

## Fichiers créés / modifiés

| Fichier | Action | Rôle |
|---------|--------|------|
| `src/middleware.ts` | Modifier | Ajouter vérification rôle `super_admin` sur `/gestion-reseau` |
| `src/lib/supabase/admin.ts` | Créer | Client Supabase service role (server-only) |
| `src/app/gestion-reseau/layout.tsx` | Créer | Layout admin : sidebar icônes + topbar |
| `src/components/admin/AdminSidebar.tsx` | Créer | Sidebar icônes (Client Component) |
| `src/app/gestion-reseau/page.tsx` | Créer | Dashboard KPIs |
| `src/app/gestion-reseau/actions.ts` | Créer | Toutes les Server Actions admin |
| `src/app/gestion-reseau/recommandations/page.tsx` | Créer | Liste des recommandations |
| `src/app/gestion-reseau/recommandations/[id]/page.tsx` | Créer | Détail + actions recommandation |
| `src/app/gestion-reseau/retraits/page.tsx` | Créer | File des retraits PENDING |
| `src/app/gestion-reseau/utilisateurs/page.tsx` | Créer | Liste des utilisateurs |
| `src/app/gestion-reseau/utilisateurs/[id]/page.tsx` | Créer | Fiche utilisateur + actions |
| `src/components/admin/NetworkTree.tsx` | Créer | Arbre MLM interactif (Client Component) |
| `src/app/gestion-reseau/reseau/page.tsx` | Créer | Page réseau MLM |

---

## Task 1 : Migration DB

**Files:**
- Aucun fichier à créer — exécution SQL directe sur le VPS

- [ ] **Step 1 : Exécuter la migration**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-r9bbynb4m22odtnie78je6fx psql -U supabase_admin -d postgres -c \"ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'; ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;\""
```

Résultat attendu : `ALTER TABLE` x2

- [ ] **Step 2 : Vérifier les colonnes**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-r9bbynb4m22odtnie78je6fx psql -U supabase_admin -d postgres -c \"SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('role', 'is_suspended');\""
```

Résultat attendu : 2 lignes avec `role` (text, default 'user') et `is_suspended` (boolean, default false)

- [ ] **Step 3 : Attribuer le rôle super_admin** (remplacer `<uuid>` par l'UUID de l'admin)

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-r9bbynb4m22odtnie78je6fx psql -U supabase_admin -d postgres -c \"UPDATE profiles SET role = 'super_admin' WHERE id = '<uuid>';\""
```

- [ ] **Step 4 : Commit**

```bash
git commit --allow-empty -m "chore: DB migration - add role and is_suspended to profiles"
```

---

## Task 2 : Client Supabase admin (service role)

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1 : Créer le client**

```typescript
// src/lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Résultat attendu : aucune erreur sur ce fichier

- [ ] **Step 3 : Commit**

```bash
git add src/lib/supabase/admin.ts
git commit -m "feat: add supabase admin client with service role"
```

---

## Task 3 : Protection middleware

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1 : Ajouter la vérification du rôle super_admin**

Dans `src/middleware.ts`, après la vérification `!user && !request.nextUrl.pathname.startsWith("/auth")`, ajouter ce bloc avant le `return supabaseResponse` final :

```typescript
  // Protect super admin route — require super_admin role
  if (request.nextUrl.pathname.startsWith("/gestion-reseau")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "super_admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }
```

Le bloc complet du middleware après modification ressemble à :

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase/config";

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

if (typeof globalThis !== "undefined") {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, val] of rateMap) {
      if (now > val.resetAt) rateMap.delete(key);
    }
  };
  setInterval(cleanup, 5 * 60_000);
}

export async function middleware(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname.startsWith("/auth/")
  ) {
    if (isRateLimited(ip)) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as Record<string, string>)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !request.nextUrl.pathname.startsWith("/api/auth/")
  ) {
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
  }

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/auth") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Protect super admin route — require super_admin role
  if (request.nextUrl.pathname.startsWith("/gestion-reseau")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "super_admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 3 : Test manuel**
Ouvrir http://localhost:3002/gestion-reseau avec un compte non-admin → doit rediriger vers `/dashboard`.

- [ ] **Step 4 : Commit**

```bash
git add src/middleware.ts
git commit -m "feat: protect /gestion-reseau with super_admin role check"
```

---

## Task 4 : Layout admin + sidebar

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Create: `src/app/gestion-reseau/layout.tsx`

- [ ] **Step 1 : Créer la sidebar admin**

```typescript
// src/components/admin/AdminSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";

const navItems = [
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
    label: "Retraits",
    href: "/gestion-reseau/retraits",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export function AdminSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-kiparlo-dark text-white flex flex-col items-center py-4 z-50">
      {/* Logo compact */}
      <Link href="/gestion-reseau" className="mb-6">
        <span className="text-xs font-extrabold tracking-tight text-kiparlo-orange">KP</span>
      </Link>

      {/* Navigation icônes */}
      <nav className="flex-1 flex flex-col gap-1 w-full px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/gestion-reseau"
              ? pathname === "/gestion-reseau"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center w-full aspect-square rounded-xl transition-colors ${
                isActive
                  ? "bg-gradient-to-br from-kiparlo-orange to-kiparlo-amber text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="mt-auto px-2 w-full flex flex-col items-center gap-2">
        <p className="text-xs text-gray-500 text-center break-all leading-tight">
          {userEmail.split("@")[0]}
        </p>
        <SignOutButton iconOnly />
      </div>
    </aside>
  );
}
```

**Note :** `SignOutButton` accepte une prop `iconOnly` optionnelle. Si elle n'existe pas encore, ajouter `iconOnly?: boolean` à ses props et conditionner l'affichage du texte. Voir `src/components/sign-out-button.tsx`.

- [ ] **Step 2 : Créer le layout admin**

```typescript
// src/app/gestion-reseau/layout.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      <AdminSidebar userEmail={user.email ?? ""} />

      <div className="ml-16 flex flex-col min-h-dvh">
        {/* Topbar */}
        <header className="h-12 bg-gray-900 border-b border-white/5 flex items-center px-6 gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-kiparlo-orange">
            Super Admin
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-sm text-gray-300">Kiparlo</span>
          <span className="ml-auto text-xs text-gray-500">{user.email}</span>
        </header>

        {/* Contenu */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier `SignOutButton` — ajouter `iconOnly` si nécessaire**

Lire `src/components/sign-out-button.tsx`. Si le composant n'a pas de prop `iconOnly`, modifier pour l'accepter :

```typescript
// Ajouter à la signature si besoin
export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  // ... dans le JSX, conditionner le texte :
  // {!iconOnly && <span>Se déconnecter</span>}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 5 : Commit**

```bash
git add src/components/admin/AdminSidebar.tsx src/app/gestion-reseau/layout.tsx
git add src/components/sign-out-button.tsx
git commit -m "feat: admin layout with icon sidebar and topbar"
```

---

## Task 5 : Dashboard KPIs

**Files:**
- Create: `src/app/gestion-reseau/page.tsx`

- [ ] **Step 1 : Créer la page dashboard**

```typescript
// src/app/gestion-reseau/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getKPIs() {
  const [membersRes, commissionsRes, recosRes, withdrawalsRes] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_suspended", false)
        .neq("role", "super_admin"),
      supabaseAdmin
        .from("commission_transactions")
        .select("amount")
        .eq("status", "EARNED"),
      supabaseAdmin
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("completed","cancelled")'),
      supabaseAdmin
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING"),
    ]);

  const totalCommissions = (commissionsRes.data ?? []).reduce(
    (sum, t) => sum + (t.amount ?? 0),
    0
  );

  return {
    activeMembers: membersRes.count ?? 0,
    totalCommissions,
    ongoingRecos: recosRes.count ?? 0,
    pendingWithdrawals: withdrawalsRes.count ?? 0,
  };
}

export default async function AdminDashboard() {
  const kpis = await getKPIs();

  const cards = [
    {
      label: "Membres actifs",
      value: kpis.activeMembers.toLocaleString("fr-FR"),
      color: "text-kiparlo-orange",
      bg: "bg-orange-500/10",
    },
    {
      label: "Commissions distribuées",
      value: `${kpis.totalCommissions.toLocaleString("fr-FR")} €`,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Recommandations en cours",
      value: kpis.ongoingRecos.toLocaleString("fr-FR"),
      color: "text-kiparlo-amber",
      bg: "bg-amber-500/10",
    },
    {
      label: "Retraits en attente",
      value: kpis.pendingWithdrawals.toLocaleString("fr-FR"),
      color: kpis.pendingWithdrawals > 0 ? "text-red-400" : "text-gray-400",
      bg: kpis.pendingWithdrawals > 0 ? "bg-red-500/10" : "bg-white/5",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Vue d'ensemble</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl p-5 ${card.bg} border border-white/5`}>
            <p className="text-xs text-gray-400 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 3 : Test manuel**
Naviguer vers http://localhost:3002/gestion-reseau avec un compte super_admin → les 4 KPIs s'affichent.

- [ ] **Step 4 : Commit**

```bash
git add src/app/gestion-reseau/page.tsx
git commit -m "feat: admin dashboard with global KPIs"
```

---

## Task 6 : Server Actions admin

**Files:**
- Create: `src/app/gestion-reseau/actions.ts`

- [ ] **Step 1 : Créer le fichier d'actions**

```typescript
// src/app/gestion-reseau/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") {
    throw new Error("Accès refusé");
  }
  return user;
}

// ─── Recommandations ──────────────────────────────────────────────────────────

export async function advanceRecommendationStep(
  recommendationId: string,
  stepOrder: number
) {
  await assertSuperAdmin();

  // Marquer l'étape comme complétée
  await supabaseAdmin
    .from("recommendation_steps")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("recommendation_id", recommendationId)
    .eq("step_order", stepOrder);

  // Si étape 6 (devis validé) : déclencher les commissions
  if (stepOrder === 6) {
    // Récupérer la recommandation pour avoir le montant
    const { data: reco } = await supabaseAdmin
      .from("recommendations")
      .select("id, referrer_id, professional_id, deal_amount")
      .eq("id", recommendationId)
      .single();

    if (reco && reco.deal_amount) {
      await createCommissionsForReco(reco);
    }
  }

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

async function createCommissionsForReco(reco: {
  id: string;
  referrer_id: string;
  professional_id: string;
  deal_amount: number;
}) {
  // Récupérer la chaîne de sponsors du referrer (5 niveaux)
  const commissions: Array<{
    recommendation_id: string;
    user_id: string;
    source_user_id: string;
    amount: number;
    type: string;
    level: number;
    status: string;
  }> = [];

  // Referrer : 60%
  commissions.push({
    recommendation_id: reco.id,
    user_id: reco.referrer_id,
    source_user_id: reco.referrer_id,
    amount: reco.deal_amount * 0.6,
    type: "referrer",
    level: 0,
    status: "EARNED",
  });

  // Remonter la chaîne de parrainage (niveaux 1-5 : 4% chacun)
  let currentId = reco.referrer_id;
  for (let level = 1; level <= 5; level++) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();

    if (!profile?.sponsor_id) break;

    commissions.push({
      recommendation_id: reco.id,
      user_id: profile.sponsor_id,
      source_user_id: reco.referrer_id,
      amount: reco.deal_amount * 0.04,
      type: "mlm",
      level,
      status: "EARNED",
    });

    currentId = profile.sponsor_id;
  }

  if (commissions.length > 0) {
    await supabaseAdmin.from("commission_transactions").insert(commissions);
    // Recalculer les wallets des bénéficiaires
    for (const c of commissions) {
      await recalculateWallet(c.user_id);
    }
  }
}

export async function toggleRecommendationStatus(
  recommendationId: string,
  newStatus: string
) {
  await assertSuperAdmin();

  await supabaseAdmin
    .from("recommendations")
    .update({ status: newStatus })
    .eq("id", recommendationId);

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

// ─── Commissions ──────────────────────────────────────────────────────────────

export async function adjustCommission(
  userId: string,
  amount: number,
  reason: string
) {
  await assertSuperAdmin();

  await supabaseAdmin.from("commission_transactions").insert({
    user_id: userId,
    source_user_id: userId,
    amount,
    type: "manual_adjustment",
    level: 0,
    status: "EARNED",
    recommendation_id: null,
  });

  await recalculateWallet(userId);
  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
}

async function recalculateWallet(userId: string) {
  const { data: earned } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "EARNED");

  const totalEarned = (earned ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

  const { data: withdrawn } = await supabaseAdmin
    .from("withdrawals")
    .select("amount")
    .eq("user_id", userId)
    .in("status", ["approved", "paid"]);

  const totalWithdrawn = (withdrawn ?? []).reduce(
    (s, w) => s + (w.amount ?? 0),
    0
  );

  const { data: pending } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "PENDING");

  const totalPending = (pending ?? []).reduce(
    (s, t) => s + (t.amount ?? 0),
    0
  );

  await supabaseAdmin.from("user_wallet_summaries").upsert(
    {
      user_id: userId,
      total_earned: totalEarned,
      total_withdrawn: totalWithdrawn,
      pending_commissions: totalPending,
      available: totalEarned - totalWithdrawn,
    },
    { onConflict: "user_id" }
  );
}

// ─── Utilisateurs ─────────────────────────────────────────────────────────────

export async function suspendUser(userId: string) {
  await assertSuperAdmin();

  await supabaseAdmin
    .from("profiles")
    .update({ is_suspended: true })
    .eq("id", userId);

  // Désactiver via Supabase Auth Admin API
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h", // ~100 ans
  });

  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
  revalidatePath("/gestion-reseau/utilisateurs");
}

export async function reactivateUser(userId: string) {
  await assertSuperAdmin();

  await supabaseAdmin
    .from("profiles")
    .update({ is_suspended: false })
    .eq("id", userId);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
  revalidatePath("/gestion-reseau/utilisateurs");
}

// ─── Retraits ─────────────────────────────────────────────────────────────────

export async function validateWithdrawal(withdrawalId: string, userId: string) {
  await assertSuperAdmin();

  await supabaseAdmin
    .from("withdrawals")
    .update({ status: "approved" })
    .eq("id", withdrawalId);

  await recalculateWallet(userId);
  revalidatePath("/gestion-reseau/retraits");
}

export async function rejectWithdrawal(
  withdrawalId: string,
  userId: string,
  reason: string
) {
  await assertSuperAdmin();

  // Récupérer le montant pour recréditer
  const { data: withdrawal } = await supabaseAdmin
    .from("withdrawals")
    .select("amount")
    .eq("id", withdrawalId)
    .single();

  await supabaseAdmin
    .from("withdrawals")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", withdrawalId);

  // Recréditer : recalculer le wallet (le retrait rejeté est exclu du total_withdrawn)
  await recalculateWallet(userId);
  revalidatePath("/gestion-reseau/retraits");
}

export async function markWithdrawalPaid(withdrawalId: string, userId: string) {
  await assertSuperAdmin();

  await supabaseAdmin
    .from("withdrawals")
    .update({ status: "paid" })
    .eq("id", withdrawalId);

  await recalculateWallet(userId);
  revalidatePath("/gestion-reseau/retraits");
}
```

**Note :** si la table `withdrawals` n'a pas de colonne `rejection_reason`, ajouter :
```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "docker exec supabase-db-r9bbynb4m22odtnie78je6fx psql -U supabase_admin -d postgres -c \"ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejection_reason TEXT;\""
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 3 : Commit**

```bash
git add src/app/gestion-reseau/actions.ts
git commit -m "feat: admin server actions (recommendations, commissions, users, withdrawals)"
```

---

## Task 7 : Pages Recommandations

**Files:**
- Create: `src/app/gestion-reseau/recommandations/page.tsx`
- Create: `src/app/gestion-reseau/recommandations/[id]/page.tsx`

- [ ] **Step 1 : Créer la liste des recommandations**

```typescript
// src/app/gestion-reseau/recommandations/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "text-yellow-400 bg-yellow-400/10" },
  accepted: { label: "Acceptée", color: "text-blue-400 bg-blue-400/10" },
  in_progress: { label: "En cours", color: "text-orange-400 bg-orange-400/10" },
  completed: { label: "Terminée", color: "text-emerald-400 bg-emerald-400/10" },
  cancelled: { label: "Annulée", color: "text-red-400 bg-red-400/10" },
};

export default async function AdminRecommandations({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const pageSize = 25;

  let query = supabaseAdmin
    .from("recommendations")
    .select(
      `id, status, deal_amount, created_at,
       referrer:profiles!referrer_id(full_name),
       professional:profiles!professional_id(full_name),
       recommendation_steps(step_order, completed)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.status) query = query.eq("status", params.status);

  const { data: recos, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Recommandations</h1>

      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["", "pending", "accepted", "in_progress", "completed", "cancelled"].map(
          (s) => (
            <Link
              key={s}
              href={`/gestion-reseau/recommandations${s ? `?status=${s}` : ""}`}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                (params.status ?? "") === s
                  ? "bg-kiparlo-orange text-white"
                  : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {s === "" ? "Toutes" : STATUS_LABELS[s]?.label ?? s}
            </Link>
          )
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Referrer</th>
              <th className="text-left px-4 py-3">Professionnel</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-left px-4 py-3">Montant</th>
              <th className="text-left px-4 py-3">Étape</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(recos ?? []).map((reco) => {
              const steps = reco.recommendation_steps ?? [];
              const completedSteps = steps.filter((s: { completed: boolean }) => s.completed).length;
              const st = STATUS_LABELS[reco.status] ?? { label: reco.status, color: "text-gray-400 bg-white/5" };
              const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
              const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;
              return (
                <tr key={reco.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 text-white">
                    {referrer?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {professional?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-emerald-400">
                    {reco.deal_amount ? `${reco.deal_amount.toLocaleString("fr-FR")} €` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {completedSteps}/{steps.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/gestion-reseau/recommandations/${reco.id}`}
                      className="text-kiparlo-orange text-xs hover:underline"
                    >
                      Détail →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-end">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/gestion-reseau/recommandations?page=${p}${params.status ? `&status=${params.status}` : ""}`}
              className={`px-3 py-1 rounded text-xs ${
                p === page
                  ? "bg-kiparlo-orange text-white"
                  : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Créer la page détail recommandation**

```typescript
// src/app/gestion-reseau/recommandations/[id]/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { advanceRecommendationStep, toggleRecommendationStatus } from "../../actions";

const STEP_NAMES = [
  "Recommandation reçue",
  "Acceptée par le professionnel",
  "Contact établi",
  "Rendez-vous fixé",
  "Devis soumis",
  "Devis validé",
  "Paiement reçu",
  "Affaire terminée",
];

export default async function AdminRecoDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select(
      `*, 
       referrer:profiles!referrer_id(id, full_name, email),
       professional:profiles!professional_id(id, full_name, email),
       recommendation_steps(id, step_order, completed, completed_at)`
    )
    .eq("id", id)
    .single();

  if (!reco) notFound();

  const steps = (reco.recommendation_steps ?? []).sort(
    (a: { step_order: number }, b: { step_order: number }) => a.step_order - b.step_order
  );
  const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
  const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/gestion-reseau/recommandations" className="text-gray-500 hover:text-white text-sm">
          ← Recommandations
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold">Détail recommandation</h1>
      </div>

      {/* Infos générales */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Referrer</p>
          <p className="text-white font-medium">{referrer?.full_name}</p>
          <p className="text-gray-400 text-xs">{referrer?.email}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Professionnel</p>
          <p className="text-white font-medium">{professional?.full_name}</p>
          <p className="text-gray-400 text-xs">{professional?.email}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Montant deal</p>
          <p className="text-emerald-400 font-bold">
            {reco.deal_amount ? `${reco.deal_amount.toLocaleString("fr-FR")} €` : "Non défini"}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Statut</p>
          <p className="text-white">{reco.status}</p>
        </div>
      </div>

      {/* Étapes */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Étapes du workflow
        </h2>
        <div className="space-y-2">
          {steps.map((step: { id: string; step_order: number; completed: boolean; completed_at: string | null }) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                step.completed ? "bg-emerald-500/10" : "bg-white/5"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.completed
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {step.completed ? "✓" : step.step_order}
              </div>
              <div className="flex-1">
                <p className={`text-sm ${step.completed ? "text-emerald-300" : "text-gray-300"}`}>
                  {STEP_NAMES[step.step_order - 1] ?? `Étape ${step.step_order}`}
                </p>
                {step.completed_at && (
                  <p className="text-xs text-gray-500">
                    {new Date(step.completed_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
              {!step.completed && (
                <form
                  action={async () => {
                    "use server";
                    await advanceRecommendationStep(id, step.step_order);
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs bg-kiparlo-orange/20 text-kiparlo-orange hover:bg-kiparlo-orange/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Valider →
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions sur le statut */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Changer le statut
        </h2>
        <div className="flex gap-2 flex-wrap">
          {["pending", "accepted", "in_progress", "completed", "cancelled"].map((s) => (
            <form
              key={s}
              action={async () => {
                "use server";
                await toggleRecommendationStatus(id, s);
              }}
            >
              <button
                type="submit"
                disabled={reco.status === s}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                → {s}
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4 : Commit**

```bash
git add src/app/gestion-reseau/recommandations/
git commit -m "feat: admin recommendations list and detail pages"
```

---

## Task 8 : Page Retraits

**Files:**
- Create: `src/app/gestion-reseau/retraits/page.tsx`

- [ ] **Step 1 : Créer la page retraits**

```typescript
// src/app/gestion-reseau/retraits/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  validateWithdrawal,
  rejectWithdrawal,
  markWithdrawalPaid,
} from "../actions";

export default async function AdminRetraits() {
  const { data: withdrawals } = await supabaseAdmin
    .from("withdrawals")
    .select(`*, user:profiles!user_id(id, full_name, email)`)
    .order("created_at", { ascending: true });

  const pending = (withdrawals ?? []).filter((w) => w.status === "PENDING");
  const others = (withdrawals ?? []).filter((w) => w.status !== "PENDING");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Retraits</h1>

      {/* PENDING */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        En attente ({pending.length})
      </h2>
      <div className="bg-gray-900 rounded-xl border border-white/5 divide-y divide-white/5 mb-8">
        {pending.length === 0 && (
          <p className="p-4 text-gray-500 text-sm">Aucun retrait en attente.</p>
        )}
        {pending.map((w) => {
          const user = Array.isArray(w.user) ? w.user[0] : w.user;
          const userId: string = user?.id ?? "";
          return (
            <div key={w.id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{user?.full_name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <p className="text-lg font-bold text-emerald-400">
                {w.amount?.toLocaleString("fr-FR")} €
              </p>
              <div className="flex gap-2">
                <form
                  action={async () => {
                    "use server";
                    await validateWithdrawal(w.id, userId);
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ✓ Valider
                  </button>
                </form>
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    const reason = formData.get("reason") as string;
                    await rejectWithdrawal(w.id, userId, reason || "Refusé par l'admin");
                  }}
                  className="flex gap-1"
                >
                  <input
                    name="reason"
                    placeholder="Motif de rejet"
                    className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white placeholder-gray-600 w-36"
                  />
                  <button
                    type="submit"
                    className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ✕ Rejeter
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historique */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Historique
      </h2>
      <div className="bg-gray-900 rounded-xl border border-white/5 divide-y divide-white/5">
        {others.slice(0, 50).map((w) => {
          const user = Array.isArray(w.user) ? w.user[0] : w.user;
          const userId: string = user?.id ?? "";
          const statusColors: Record<string, string> = {
            approved: "text-emerald-400",
            paid: "text-blue-400",
            rejected: "text-red-400",
          };
          return (
            <div key={w.id} className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-white">{user?.full_name}</p>
                <p className="text-xs text-gray-500">
                  {new Date(w.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <p className="text-sm font-medium text-white">
                {w.amount?.toLocaleString("fr-FR")} €
              </p>
              <span
                className={`text-xs font-medium ${statusColors[w.status] ?? "text-gray-400"}`}
              >
                {w.status}
              </span>
              {w.status === "approved" && (
                <form
                  action={async () => {
                    "use server";
                    await markWithdrawalPaid(w.id, userId);
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-2 py-1 rounded-lg transition-colors"
                  >
                    Marquer payé
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 3 : Commit**

```bash
git add src/app/gestion-reseau/retraits/page.tsx
git commit -m "feat: admin withdrawals page with validate/reject/paid actions"
```

---

## Task 9 : Pages Utilisateurs

**Files:**
- Create: `src/app/gestion-reseau/utilisateurs/page.tsx`
- Create: `src/app/gestion-reseau/utilisateurs/[id]/page.tsx`

- [ ] **Step 1 : Créer la liste des utilisateurs**

```typescript
// src/app/gestion-reseau/utilisateurs/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function AdminUtilisateurs({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const pageSize = 30;

  let query = supabaseAdmin
    .from("profiles")
    .select("id, full_name, is_professional, is_suspended, created_at, sponsor_id, role", {
      count: "exact",
    })
    .neq("role", "super_admin")
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.search) {
    query = query.ilike("full_name", `%${params.search}%`);
  }

  const { data: users, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Utilisateurs{" "}
        <span className="text-gray-500 text-base font-normal">({count ?? 0})</span>
      </h1>

      {/* Recherche */}
      <form className="mb-4">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="Rechercher par nom..."
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-72"
        />
      </form>

      <div className="bg-gray-900 rounded-xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nom</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-left px-4 py-3">Inscrit le</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(users ?? []).map((user) => (
              <tr key={user.id} className="hover:bg-white/2">
                <td className="px-4 py-3 text-white">{user.full_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      user.is_professional
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-white/5 text-gray-400"
                    }`}
                  >
                    {user.is_professional ? "Pro" : "Particulier"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      user.is_suspended
                        ? "bg-red-500/10 text-red-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {user.is_suspended ? "Suspendu" : "Actif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(user.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/gestion-reseau/utilisateurs/${user.id}`}
                    className="text-kiparlo-orange text-xs hover:underline"
                  >
                    Fiche →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-end">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/gestion-reseau/utilisateurs?page=${p}${
                params.search ? `&search=${params.search}` : ""
              }`}
              className={`px-3 py-1 rounded text-xs ${
                p === page
                  ? "bg-kiparlo-orange text-white"
                  : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Créer la fiche utilisateur**

```typescript
// src/app/gestion-reseau/utilisateurs/[id]/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import {
  suspendUser,
  reactivateUser,
  adjustCommission,
} from "../../actions";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [profileRes, walletRes, recoCountRes, sponsorCountRes] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("*, sponsor:profiles!sponsor_id(full_name)")
        .eq("id", id)
        .single(),
      supabaseAdmin
        .from("user_wallet_summaries")
        .select("*")
        .eq("user_id", id)
        .single(),
      supabaseAdmin
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", id),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", id),
    ]);

  if (!profileRes.data) notFound();

  const profile = profileRes.data;
  const wallet = walletRes.data;
  const sponsor = Array.isArray(profile.sponsor) ? profile.sponsor[0] : profile.sponsor;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/gestion-reseau/utilisateurs" className="text-gray-500 hover:text-white text-sm">
          ← Utilisateurs
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold">{profile.full_name}</h1>
        {profile.is_suspended && (
          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Suspendu</span>
        )}
      </div>

      {/* Profil */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Type</p>
          <p className="text-white">{profile.is_professional ? "Professionnel" : "Particulier"}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Parrain</p>
          <p className="text-white">{sponsor?.full_name ?? "Aucun"}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Code parrainage</p>
          <p className="text-white font-mono">{profile.sponsor_code ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Filleuls directs</p>
          <p className="text-white">{sponsorCountRes.count ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Recommandations émises</p>
          <p className="text-white">{recoCountRes.count ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Inscrit le</p>
          <p className="text-white">
            {new Date(profile.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>

      {/* Wallet */}
      {wallet && (
        <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Wallet
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Total gagné</p>
              <p className="text-white font-medium">
                {wallet.total_earned?.toLocaleString("fr-FR")} €
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Disponible</p>
              <p className="text-emerald-400 font-bold">
                {wallet.available?.toLocaleString("fr-FR")} €
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Retiré</p>
              <p className="text-white">{wallet.total_withdrawn?.toLocaleString("fr-FR")} €</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">En attente</p>
              <p className="text-yellow-400">{wallet.pending_commissions?.toLocaleString("fr-FR")} €</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Actions admin
        </h2>

        {/* Suspendre / Réactiver */}
        <form
          action={async () => {
            "use server";
            if (profile.is_suspended) {
              await reactivateUser(id);
            } else {
              await suspendUser(id);
            }
          }}
        >
          <button
            type="submit"
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${
              profile.is_suspended
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
          >
            {profile.is_suspended ? "✓ Réactiver le compte" : "⊘ Suspendre le compte"}
          </button>
        </form>

        {/* Ajuster commission */}
        <form
          action={async (formData: FormData) => {
            "use server";
            const amount = parseFloat(formData.get("amount") as string);
            const reason = formData.get("reason") as string;
            if (!isNaN(amount) && reason) {
              await adjustCommission(id, amount, reason);
            }
          }}
          className="flex gap-2 items-end flex-wrap"
        >
          <div>
            <label className="text-xs text-gray-500 block mb-1">Montant (€)</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              placeholder="ex: 50"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-28"
              required
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">Motif</label>
            <input
              name="reason"
              placeholder="Motif de l'ajustement"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-full"
              required
            />
          </div>
          <button
            type="submit"
            className="text-sm bg-kiparlo-orange/20 text-kiparlo-orange hover:bg-kiparlo-orange/30 px-4 py-1.5 rounded-lg transition-colors"
          >
            + Appliquer commission
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 4 : Commit**

```bash
git add src/app/gestion-reseau/utilisateurs/
git commit -m "feat: admin users list and profile detail pages"
```

---

## Task 10 : Réseau MLM — arbre interactif

**Files:**
- Create: `src/components/admin/NetworkTree.tsx`
- Create: `src/app/gestion-reseau/reseau/page.tsx`

- [ ] **Step 1 : Installer react-d3-tree**

```bash
npm install react-d3-tree
npm install --save-dev @types/react-d3-tree
```

- [ ] **Step 2 : Créer le composant NetworkTree (Client Component)**

```typescript
// src/components/admin/NetworkTree.tsx
"use client";

import { useCallback, useState } from "react";
import Tree, { RawNodeDatum, CustomNodeElementProps } from "react-d3-tree";
import Link from "next/link";

interface NetworkNode {
  id: string;
  full_name: string;
  is_professional: boolean;
  is_suspended: boolean;
  children?: NetworkNode[];
}

function buildTree(
  nodes: Array<{ id: string; full_name: string | null; sponsor_id: string | null; is_professional: boolean; is_suspended: boolean }>,
  rootIds: string[]
): RawNodeDatum[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.sponsor_id) {
      if (!childrenMap.has(node.sponsor_id)) childrenMap.set(node.sponsor_id, []);
      childrenMap.get(node.sponsor_id)!.push(node.id);
    }
  }

  function buildSubtree(id: string): RawNodeDatum {
    const node = nodeMap.get(id)!;
    const childIds = childrenMap.get(id) ?? [];
    return {
      name: node.full_name ?? id,
      attributes: {
        id,
        is_professional: String(node.is_professional),
        is_suspended: String(node.is_suspended),
      },
      children: childIds.map(buildSubtree),
    };
  }

  return rootIds.map(buildSubtree);
}

function CustomNode({ nodeDatum, toggleNode }: CustomNodeElementProps) {
  const isPro = nodeDatum.attributes?.is_professional === "true";
  const isSuspended = nodeDatum.attributes?.is_suspended === "true";
  const userId = nodeDatum.attributes?.id as string;

  return (
    <g onClick={toggleNode}>
      <circle
        r={20}
        fill={isSuspended ? "#ef4444" : isPro ? "#3b82f6" : "#FF6B35"}
        stroke={isSuspended ? "#dc2626" : isPro ? "#2563eb" : "#F7931E"}
        strokeWidth={2}
      />
      <text
        fill="white"
        fontSize={9}
        textAnchor="middle"
        dy={35}
        fontWeight="500"
      >
        {nodeDatum.name.length > 16
          ? nodeDatum.name.slice(0, 14) + "…"
          : nodeDatum.name}
      </text>
    </g>
  );
}

export function NetworkTree({
  nodes,
  rootIds,
}: {
  nodes: Array<{ id: string; full_name: string | null; sponsor_id: string | null; is_professional: boolean; is_suspended: boolean }>;
  rootIds: string[];
}) {
  const treeData = buildTree(nodes, rootIds);
  const [search, setSearch] = useState("");

  const handleNodeClick = useCallback(
    (nodeDatum: RawNodeDatum) => {
      const userId = nodeDatum.attributes?.id as string;
      if (userId) {
        window.open(`/gestion-reseau/utilisateurs/${userId}`, "_blank");
      }
    },
    []
  );

  const filteredRootIds =
    search.trim() === ""
      ? rootIds
      : nodes
          .filter((n) =>
            n.full_name?.toLowerCase().includes(search.toLowerCase())
          )
          .map((n) => {
            // Remonter jusqu'à la racine
            let curr = n;
            while (curr.sponsor_id) {
              curr = nodes.find((x) => x.id === curr.sponsor_id) ?? curr;
              if (curr.id === n.id) break;
            }
            return curr.id;
          })
          .filter((id, i, arr) => arr.indexOf(id) === i);

  const displayData =
    search.trim() === "" ? treeData : buildTree(nodes, filteredRootIds);

  if (displayData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <p>Aucun résultat pour "{search}"</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3 mb-4 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un membre..."
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-72"
        />
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#FF6B35] inline-block" />
            Particulier
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            Professionnel
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Suspendu
          </span>
        </div>
        <p className="ml-auto text-xs text-gray-500">
          Clic sur un nœud → ouvre la fiche utilisateur
        </p>
      </div>
      <div
        className="bg-gray-900 rounded-xl border border-white/5 overflow-hidden"
        style={{ height: "70vh" }}
      >
        <Tree
          data={displayData.length === 1 ? displayData[0] : { name: "Réseau", children: displayData }}
          orientation="vertical"
          pathFunc="step"
          onNodeClick={({ data }) => handleNodeClick(data)}
          renderCustomNodeElement={(props) => <CustomNode {...props} />}
          separation={{ siblings: 1.5, nonSiblings: 2 }}
          translate={{ x: 600, y: 60 }}
          zoom={0.7}
          nodeSize={{ x: 160, y: 100 }}
          pathClassFunc={() => "stroke-gray-700 fill-none"}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Créer la page réseau**

```typescript
// src/app/gestion-reseau/reseau/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NetworkTree } from "@/components/admin/NetworkTree";

export default async function AdminReseau() {
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, sponsor_id, is_professional, is_suspended")
    .neq("role", "super_admin");

  const nodes = profiles ?? [];

  // Les racines sont les profils sans sponsor (ou sponsor introuvable dans le dataset)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const rootIds = nodes
    .filter((n) => !n.sponsor_id || !nodeIds.has(n.sponsor_id))
    .map((n) => n.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Réseau MLM</h1>
        <span className="text-sm text-gray-500">
          {nodes.length} membre{nodes.length > 1 ? "s" : ""} ·{" "}
          {rootIds.length} racine{rootIds.length > 1 ? "s" : ""}
        </span>
      </div>
      <NetworkTree nodes={nodes} rootIds={rootIds} />
    </div>
  );
}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 5 : Test manuel**
Naviguer vers http://localhost:3002/gestion-reseau/reseau → l'arbre s'affiche avec les nœuds colorés.

- [ ] **Step 6 : Ajouter `.superpowers/` au `.gitignore`**

```bash
echo ".superpowers/" >> .gitignore
```

- [ ] **Step 7 : Commit final**

```bash
git add src/components/admin/NetworkTree.tsx src/app/gestion-reseau/reseau/ .gitignore package.json package-lock.json
git commit -m "feat: admin MLM network tree with react-d3-tree"
```

---

## Vérification finale

- [ ] Accès non-admin à `/gestion-reseau` → redirige vers `/dashboard`
- [ ] Dashboard affiche les 4 KPIs
- [ ] Liste recommandations → filtres fonctionnels → détail → avancer une étape
- [ ] Liste retraits → valider / rejeter avec motif
- [ ] Liste utilisateurs → fiche → suspendre → ajuster commission
- [ ] Arbre réseau → affiche les nœuds → clic → ouvre fiche dans nouvel onglet
