"use client";

import { useState } from "react";
import { NetworkGraph } from "@/components/network-graph";
import { NetworkTree } from "@/components/network-tree";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/referral-buttons";

interface DirectReferral {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  is_professional: boolean;
  is_demo: boolean;
  company_alias: string | null;
  company_category: string | null;
  created_at: string;
  sub_referrals: number;
  total_commissions: number;
}

interface RootData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  sponsor_code: string | null;
  directCount: number;
  networkSize: number;
  totalCommissions: number;
  commissionsThisMonth: number;
  directReferrals: DirectReferral[];
}

export function AdminNetworkContent({
  roots,
}: {
  roots: RootData[];
}) {
  const [activeTab, setActiveTab] = useState<string>("global");

  const totalMembers = roots.reduce((s, r) => s + r.networkSize, 0);
  const totalCommissions = roots.reduce((s, r) => s + r.totalCommissions, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-winelio-dark">Réseau MLM</h1>
        <span className="text-sm text-winelio-gray">
          {totalMembers} membre{totalMembers > 1 ? "s" : ""} ·{" "}
          {roots.length} tête{roots.length > 1 ? "s" : ""} de réseau
        </span>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(
          [
            {
              title: "Total membres",
              value: String(totalMembers),
              sub: "Réseau global N1–N5",
              icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
              accent: false,
            },
            {
              title: "Têtes de réseau",
              value: String(roots.length),
              sub: "Branches indépendantes",
              icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
              accent: false,
            },
            {
              title: "Commissions totales",
              value: `${totalCommissions.toFixed(2)} €`,
              sub: "Toutes branches confondues",
              icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
              accent: true,
            },
          ] as { title: string; value: string; sub: string; icon: string; accent: boolean }[]
        ).map((s) => (
          <Card key={s.title} className="!rounded-2xl">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-winelio-gray uppercase tracking-wider">
                  {s.title}
                </span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    s.accent ? "bg-winelio-orange/10" : "bg-muted"
                  }`}
                >
                  <svg
                    className={`w-4 h-4 ${s.accent ? "text-winelio-orange" : "text-muted-foreground"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={s.icon}
                    />
                  </svg>
                </div>
              </div>
              <p
                className={`text-xl font-extrabold tabular-nums ${
                  s.accent ? "text-winelio-orange" : "text-winelio-dark"
                }`}
              >
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        <TabBtn active={activeTab === "global"} onClick={() => setActiveTab("global")}>
          Vue globale
        </TabBtn>
        {roots.map((root) => {
          const name =
            [root.first_name, root.last_name].filter(Boolean).join(" ") ||
            root.email;
          return (
            <TabBtn
              key={root.id}
              active={activeTab === root.id}
              onClick={() => setActiveTab(root.id)}
            >
              {name}
              <span className="ml-1.5 text-[10px] font-normal opacity-60">
                {root.networkSize} m.
              </span>
            </TabBtn>
          );
        })}
      </div>

      {/* Vue globale */}
      {activeTab === "global" && (
        <div className="space-y-8">
          {roots.map((root) => {
            const displayName =
              [root.first_name, root.last_name].filter(Boolean).join(" ") ||
              root.email;
            return (
              <div key={root.id}>
                {/* Séparateur racine */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {[root.first_name, root.last_name]
                      .filter(Boolean)
                      .map((n) => n![0])
                      .join("")
                      .toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="font-bold text-winelio-dark">{displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {root.networkSize} membre{root.networkSize > 1 ? "s" : ""} ·{" "}
                      {root.directCount} filleul{root.directCount > 1 ? "s" : ""} direct{root.directCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab(root.id)}
                    className="ml-auto text-xs text-winelio-orange hover:text-winelio-amber transition-colors font-medium"
                  >
                    Vue détaillée →
                  </button>
                </div>

                {/* Vue graphique */}
                <Card className="!rounded-2xl mb-4">
                  <CardContent className="p-4 sm:p-6">
                    <h3 className="text-sm font-semibold text-winelio-dark mb-1">
                      Vue graphique
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Pincez pour zoomer · Glissez pour naviguer
                    </p>
                    <NetworkGraph
                      userId={root.id}
                      userName={displayName}
                      rootLabel={root.first_name ?? displayName}
                    />
                  </CardContent>
                </Card>

                {/* Liste réseau */}
                <Card className="!rounded-2xl">
                  <CardContent className="p-4 sm:p-6">
                    <h3 className="text-sm font-semibold text-winelio-dark mb-1">
                      Liste détaillée
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Réseau complet sur 5 niveaux
                    </p>
                    <NetworkTree userId={root.id} />
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Vues par racine */}
      {roots.map(
        (root) => activeTab === root.id && <RootView key={root.id} root={root} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
        active
          ? "border-winelio-orange text-winelio-orange"
          : "border-transparent text-winelio-gray hover:text-winelio-dark hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function RootView({ root }: { root: RootData }) {
  const displayName =
    [root.first_name, root.last_name].filter(Boolean).join(" ") || root.email;
  const sponsorCode = root.sponsor_code ?? "";

  const kpis: { title: string; value: string; sub: string; icon: string; accent: boolean }[] = [
    {
      title: "Total membres",
      value: String(root.networkSize),
      sub: `dont ${root.directCount} directs`,
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
      accent: false,
    },
    {
      title: "Filleuls directs",
      value: String(root.directCount),
      sub: "Niveau 1",
      icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
      accent: false,
    },
    {
      title: "Gains réseau",
      value: `${root.totalCommissions.toFixed(2)} €`,
      sub: "Total cumulé",
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      accent: true,
    },
    {
      title: "Ce mois",
      value: `${root.commissionsThisMonth.toFixed(2)} €`,
      sub: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z",
      accent: false,
    },
  ];

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((s) => (
          <Card key={s.title} className="!rounded-2xl">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-winelio-gray uppercase tracking-wider">
                  {s.title}
                </span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    s.accent ? "bg-winelio-orange/10" : "bg-muted"
                  }`}
                >
                  <svg
                    className={`w-4 h-4 ${s.accent ? "text-winelio-orange" : "text-muted-foreground"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={s.icon}
                    />
                  </svg>
                </div>
              </div>
              <p
                className={`text-xl font-extrabold tabular-nums ${
                  s.accent ? "text-winelio-orange" : "text-winelio-dark"
                }`}
              >
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Code parrain */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-winelio-gray uppercase tracking-wider mb-4">
            Code parrain — {displayName}
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-winelio-light dark:bg-muted rounded-xl border-2 border-dashed border-winelio-orange px-8 py-3 text-center w-full sm:w-auto">
              <span className="text-3xl font-extrabold tracking-[0.2em] bg-gradient-to-r from-winelio-orange to-winelio-amber bg-clip-text text-transparent select-all">
                {sponsorCode || "—"}
              </span>
            </div>
            {sponsorCode && (
              <div className="flex gap-3">
                <CopyButton code={sponsorCode} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filleuls directs */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-5">
            Filleuls directs
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({root.directCount})
            </span>
          </h3>
          {root.directReferrals.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-winelio-orange"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">Aucun filleul pour le moment.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Code parrain à partager : <strong>{sponsorCode}</strong>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {root.directReferrals.map((ref) => {
                const initials =
                  [ref.first_name, ref.last_name]
                    .filter(Boolean)
                    .map((n) => n![0])
                    .join("")
                    .toUpperCase() || "?";
                const isPro = ref.is_professional && ref.company_alias;
                const refName = isPro
                  ? ref.company_alias!
                  : (
                      (ref.first_name ?? "") +
                      " " +
                      (ref.last_name ?? "")
                    ).trim() || "Sans nom";
                const refSub = isPro
                  ? [ref.company_category, ref.city].filter(Boolean).join(" · ")
                  : null;
                return (
                  <div
                    key={ref.id}
                    className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`font-semibold text-sm truncate ${
                            isPro
                              ? "font-mono text-winelio-orange"
                              : "text-winelio-dark"
                          }`}
                        >
                          {refName}
                          {ref.is_demo && (
                            <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold text-orange-400 bg-orange-50 border border-orange-100">
                              demo
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {refSub ? (
                            <span className="mr-1">{refSub} ·</span>
                          ) : ref.city ? (
                            <span className="mr-1">{ref.city} ·</span>
                          ) : null}
                          {new Date(ref.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 shrink-0 ml-2">
                      <div className="text-center">
                        <p className="font-bold text-winelio-dark text-sm tabular-nums">
                          {ref.sub_referrals}
                        </p>
                        <p className="text-[10px] text-muted-foreground">filleuls</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-winelio-orange text-sm tabular-nums">
                          {ref.total_commissions.toFixed(2)} €
                        </p>
                        <p className="text-[10px] text-muted-foreground">commissions</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vue graphique */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-1">Vue graphique</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Pincez pour zoomer · Glissez pour naviguer
          </p>
          <NetworkGraph
            userId={root.id}
            userName={displayName}
            rootLabel={root.first_name ?? displayName}
          />
        </CardContent>
      </Card>

      {/* Liste détaillée */}
      <Card className="!rounded-2xl">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-1">Liste détaillée</h3>
          <p className="text-xs text-muted-foreground mb-4">Réseau complet sur 5 niveaux</p>
          <NetworkTree userId={root.id} />
        </CardContent>
      </Card>
    </div>
  );
}
