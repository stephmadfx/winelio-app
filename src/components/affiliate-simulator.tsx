"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Calculator,
  GitBranch,
  Home,
  PiggyBank,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { AnimatedCounter } from "@/components/animated-counter";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const projectPresets = [
  { label: "Cuisine", value: 12000 },
  { label: "Salle de bain", value: 8500 },
  { label: "Isolation", value: 15000 },
  { label: "Maison", value: 4000, caption: "Honoraires" },
];

const professionalCommissionRate = 10;
const directAffiliateRate = 60;
const networkLevelRate = 4;
const defaultActiveAffiliatesByLevel = [5, 8, 12, 18, 25];

export function AffiliateSimulator() {
  const [dealAmount, setDealAmount] = useState(5000);
  const [monthlyRecommendations, setMonthlyRecommendations] = useState(3);
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [networkRecommendations, setNetworkRecommendations] = useState(1);
  const [activeAffiliatesByLevel, setActiveAffiliatesByLevel] = useState(
    defaultActiveAffiliatesByLevel
  );

  const results = useMemo(() => {
    const proCommission = dealAmount * (professionalCommissionRate / 100);
    const directGain = proCommission * (directAffiliateRate / 100);
    const monthlyGain = directGain * monthlyRecommendations;
    const levelCommissions = activeAffiliatesByLevel.map((affiliates, index) => {
      const amount =
        affiliates *
        networkRecommendations *
        proCommission *
        (networkLevelRate / 100);

      return {
        level: index + 1,
        affiliates,
        amount,
      };
    });
    const networkMonthlyGain = levelCommissions.reduce(
      (total, level) => total + level.amount,
      0
    );
    const totalMonthlyGain = monthlyGain + (networkEnabled ? networkMonthlyGain : 0);
    const yearlyGain = totalMonthlyGain * 12;

    return {
      proCommission,
      directGain,
      monthlyGain,
      networkMonthlyGain,
      totalMonthlyGain,
      yearlyGain,
      levelCommissions,
    };
  }, [
    activeAffiliatesByLevel,
    dealAmount,
    monthlyRecommendations,
    networkEnabled,
    networkRecommendations,
  ]);

  const updateActiveAffiliates = (levelIndex: number, value: number) => {
    setActiveAffiliatesByLevel((current) =>
      current.map((item, index) =>
        index === levelIndex ? clampNumber(value, 0, 500) : item
      )
    );
  };

  const maxLevelCommission = Math.max(
    ...results.levelCommissions.map((level) => level.amount),
    1
  );

  return (
    <section
      id="simulateur"
      className="scroll-mt-24 relative overflow-hidden rounded-2xl border border-winelio-orange/20 bg-white shadow-[0_24px_70px_-42px_rgba(45,52,54,0.45)] dark:border-white/10 dark:bg-card"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,107,53,0.16),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(247,147,30,0.16),transparent_26%),linear-gradient(135deg,rgba(255,245,240,0.96),rgba(255,255,255,0.82)_46%,rgba(248,249,250,0.94))] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(255,107,53,0.20),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(247,147,30,0.18),transparent_26%),linear-gradient(135deg,rgba(45,52,54,0.98),rgba(35,39,40,0.96)_52%,rgba(22,24,25,0.98))]" />
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-winelio-orange" />
      <div className="absolute -right-16 top-16 hidden h-44 w-44 rounded-full border border-winelio-orange/20 md:block" />
      <div className="absolute -right-8 top-24 hidden h-24 w-24 rounded-full border border-winelio-amber/30 md:block" />

      <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-winelio-orange/20 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-winelio-orange shadow-sm dark:bg-white/10">
                <Calculator className="size-3.5" />
                Simulateur affilié
              </div>
              <h2 className="text-xl font-bold text-winelio-dark sm:text-2xl dark:text-white">
                Estimez votre gain direct
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-winelio-gray dark:text-white/68">
                Entrez le montant des travaux et visualisez ce qui arrive
                directement dans votre poche. Activez le mode réseau pour
                projeter vos commissions jusqu&apos;à 5 niveaux.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-white shadow-lg shadow-winelio-orange/25">
              <Sparkles className="size-5" />
            </div>
          </div>

          <div className="grid gap-4">
            <label className="rounded-2xl border border-white/80 bg-white/82 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8">
              <span className="flex items-center gap-2 text-sm font-semibold text-winelio-dark dark:text-white">
                <Home className="size-4 text-winelio-orange" />
                Montant des travaux
              </span>
              <div className="mt-3 flex items-center rounded-xl border border-winelio-orange/15 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20">
                <input
                  className="min-w-0 flex-1 bg-transparent text-lg font-bold text-winelio-dark outline-none dark:text-white"
                  inputMode="numeric"
                  min={0}
                  max={500000}
                  type="number"
                  value={dealAmount}
                  onChange={(event) =>
                    setDealAmount(
                      clampNumber(Number(event.target.value) || 0, 0, 500000)
                    )
                  }
                />
                <span className="text-sm font-semibold text-winelio-gray dark:text-white/60">
                  EUR
                </span>
              </div>
              <input
                aria-label="Montant des travaux"
                className="mt-4 h-2 w-full cursor-pointer accent-winelio-orange"
                max={50000}
                min={500}
                step={500}
                type="range"
                value={Math.min(dealAmount, 50000)}
                onChange={(event) => setDealAmount(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {projectPresets.map((preset) => (
              <button
                key={preset.label}
                className="rounded-xl border border-winelio-orange/15 bg-white/76 px-3 py-2 text-sm font-semibold text-winelio-dark transition hover:-translate-y-0.5 hover:border-winelio-orange/35 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                type="button"
                onClick={() => setDealAmount(preset.value)}
              >
                <span>{preset.label}</span>
                {"caption" in preset ? (
                  <span className="mt-0.5 block text-[11px] font-medium text-winelio-gray dark:text-white/55">
                    {preset.caption}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-winelio-orange/20 bg-white/82 p-4 shadow-sm backdrop-blur transition hover:border-winelio-orange/35 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:hover:bg-white/12">
            <input
              checked={networkEnabled}
              className="mt-1 size-5 cursor-pointer accent-winelio-orange"
              type="checkbox"
              onChange={(event) => setNetworkEnabled(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-bold text-winelio-dark dark:text-white">
                <GitBranch className="size-4 text-winelio-orange" />
                Simuler avec mon réseau affilié
              </span>
              <span className="mt-1 block text-sm leading-5 text-winelio-gray dark:text-white/62">
                Ajoutez les recommandations générées par vos filleuls sur 5
                niveaux, avec {networkLevelRate}% par niveau.
              </span>
            </span>
          </label>

          {networkEnabled ? (
            <div className="rounded-2xl border border-winelio-orange/20 bg-white/86 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-winelio-dark dark:text-white">
                    <Users className="size-4 text-winelio-orange" />
                    Affiliés actifs par niveau
                  </p>
                  <p className="mt-1 text-xs leading-5 text-winelio-gray dark:text-white/58">
                    Ceux qui génèrent au moins une recommandation régulière.
                  </p>
                </div>
                <label className="rounded-xl border border-winelio-orange/15 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-winelio-gray dark:text-white/50">
                    Recos / affilié / mois
                  </span>
                  <input
                    className="mt-1 w-20 bg-transparent text-lg font-black text-winelio-dark outline-none dark:text-white"
                    inputMode="numeric"
                    max={10}
                    min={0}
                    type="number"
                    value={networkRecommendations}
                    onChange={(event) =>
                      setNetworkRecommendations(
                        clampNumber(Number(event.target.value) || 0, 0, 10)
                      )
                    }
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {activeAffiliatesByLevel.map((affiliates, index) => (
                  <label
                    key={index}
                    className="rounded-xl border border-winelio-orange/10 bg-white/75 p-2 text-center dark:border-white/10 dark:bg-black/20"
                  >
                    <span className="block text-[11px] font-bold text-winelio-orange">
                      N{index + 1}
                    </span>
                    <input
                      aria-label={`Affiliés actifs niveau ${index + 1}`}
                      className="mt-1 w-full bg-transparent text-center text-base font-black text-winelio-dark outline-none dark:text-white"
                      inputMode="numeric"
                      max={500}
                      min={0}
                      type="number"
                      value={affiliates}
                      onChange={(event) =>
                        updateActiveAffiliates(
                          index,
                          Number(event.target.value) || 0
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-winelio-dark p-5 text-white shadow-2xl shadow-winelio-dark/20 dark:border-white/10 dark:bg-black/28">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-winelio-orange/30 to-transparent" />
          <div className="absolute right-5 top-5 h-2 w-2 rounded-full bg-winelio-amber shadow-[0_0_22px_rgba(247,147,30,0.9)]" />

          <div className="relative">
            <p className="text-sm font-medium text-white/68">
              {networkEnabled
                ? "Potentiel mensuel total"
                : "Vous touchez directement"}
            </p>
            <div className="mt-3 flex items-end gap-2">
              <p className="text-4xl font-black leading-none tracking-normal text-white sm:text-5xl">
                <AnimatedCounter
                  key={`${networkEnabled}-${results.totalMonthlyGain}-${results.directGain}`}
                  decimals={0}
                  suffix=" EUR"
                  to={networkEnabled ? results.totalMonthlyGain : results.directGain}
                />
              </p>
              <ArrowUpRight className="mb-1 size-6 text-winelio-amber" />
            </div>
            <p className="mt-3 text-sm leading-6 text-white/62">
              {networkEnabled
                ? `Votre activité directe + ${networkLevelRate}% sur les recommandations de votre réseau actif.`
                : `Base actuelle : ${formatCurrency(dealAmount)} x ${professionalCommissionRate}% x ${directAffiliateRate}% reversés à l'affilié.`}
            </p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-xl border border-white/10 bg-white/8 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/64">
                    Commission totale générée
                  </span>
                  <span className="font-bold text-white">
                    {formatCurrency(results.proCommission)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber transition-all duration-500"
                    style={{
                      width: `${clampNumber(
                        (results.directGain / Math.max(results.proCommission, 1)) *
                          100,
                        0,
                        100
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-white/45">
                  <span>Part directe</span>
                  <span>{directAffiliateRate}%</span>
                </div>
              </div>

              <label className="rounded-xl border border-white/10 bg-white/8 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-white/72">
                    <TrendingUp className="size-4 text-winelio-amber" />
                    Recos par mois
                  </span>
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 text-sm font-bold">
                    {monthlyRecommendations}
                  </span>
                </div>
                <input
                  aria-label="Nombre de recommandations par mois"
                  className="mt-4 h-2 w-full cursor-pointer accent-winelio-amber"
                  max={10}
                  min={1}
                  step={1}
                  type="range"
                  value={monthlyRecommendations}
                  onChange={(event) =>
                    setMonthlyRecommendations(Number(event.target.value))
                  }
                />
              </label>

              {networkEnabled ? (
                <div className="rounded-xl border border-white/10 bg-white/8 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-white/72">
                      <GitBranch className="size-4 text-winelio-amber" />
                      Effet réseau mensuel
                    </span>
                    <span className="font-bold text-white">
                      {formatCurrency(results.networkMonthlyGain)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {results.levelCommissions.map((level) => (
                      <div key={level.level} className="grid grid-cols-[42px_1fr_72px] items-center gap-2 text-xs">
                        <span className="font-bold text-white/58">
                          N{level.level}
                        </span>
                        <div className="h-2 overflow-hidden rounded-full bg-white/12">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber transition-all duration-500"
                            style={{
                              width: `${clampNumber(
                                (level.amount / maxLevelCommission) * 100,
                                3,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-right font-semibold text-white/78">
                          {formatCurrency(level.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white px-4 py-3 text-winelio-dark">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-winelio-gray">
                  {networkEnabled ? "Direct mensuel" : "Projection mois"}
                </p>
                <p className="mt-1 text-xl font-black">
                  {formatCurrency(results.monthlyGain)}
                </p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber px-4 py-3 text-white">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/78">
                  <PiggyBank className="size-3.5" />
                  Projection an
                </p>
                <p className="mt-1 text-xl font-black">
                  {formatCurrency(results.yearlyGain)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
