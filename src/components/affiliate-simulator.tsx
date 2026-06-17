"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Calculator,
  Home,
  Network,
  PiggyBank,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from "lucide-react";
import { AnimatedCounter } from "@/components/animated-counter";

const DIRECT_REFERRER_SHARE = 60;
const NETWORK_LEVEL_SHARE = 3;
const PLATFORM_SHARE = 23;
const AFFILIATION_SHARE = 1;
const CASHBACK_SHARE = 1;
const MAX_NETWORK_LEVELS = 5;

const formatCurrency = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits,
  }).format(value);

const formatNumber = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(value);

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const levelAccentClasses = [
  "bg-winelio-orange",
  "bg-winelio-amber",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-winelio-dark",
];

// Scénarios de simulation de réseau montrant le potentiel de recommandation
const SCENARIOS = [
  {
    name: "Scénario Bâtisseur",
    description: "Une partie de vos partenaires s'active efficacement et déploie le réseau sur 5 niveaux.",
    directRecommendations: 2,
    directActiveMembers: 4,
    activeRelaysPerMember: 1.5,
    networkDealsPerMember: 0.8,
    activeNetworkLevels: 5,
  },
  {
    name: "Scénario Duplication",
    description: "Le potentiel de la recommandation en cascade : votre réseau grandit naturellement jusqu'à 5 niveaux grâce à des partenaires engagés.",
    directRecommendations: 3,
    directActiveMembers: 5,
    activeRelaysPerMember: 1.6,
    networkDealsPerMember: 1.0,
    activeNetworkLevels: 5,
  },
  {
    name: "Scénario Ambassadeur Actif",
    description: "Vous recommandez très régulièrement et vos partenaires transmettent la méthode avec régularité sur 5 niveaux.",
    directRecommendations: 4,
    directActiveMembers: 6,
    activeRelaysPerMember: 1.3,
    networkDealsPerMember: 0.75,
    activeNetworkLevels: 5,
  },
  {
    name: "Scénario Club Winelio",
    description: "Un réseau plus concentré mais très dynamique où l'entraide génère un maximum de deals et de commissions.",
    directRecommendations: 1,
    directActiveMembers: 3,
    activeRelaysPerMember: 1.8,
    networkDealsPerMember: 1.2,
    activeNetworkLevels: 5,
  }
];

export function AffiliateSimulator() {
  const [dealAmount, setDealAmount] = useState(5000);
  const commissionRate = 10;
  
  // Utiliser un index fixe par défaut pour le SSR, puis randomiser au montage
  const [scenarioIndex, setScenarioIndex] = useState(0);

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * SCENARIOS.length);
    setScenarioIndex(randomIndex);
  }, []);

  const scenario = SCENARIOS[scenarioIndex];

  const {
    directRecommendations,
    activeNetworkLevels,
    directActiveMembers,
    activeRelaysPerMember,
    networkDealsPerMember,
  } = scenario;

  const results = useMemo(() => {
    const baseCommission = dealAmount * (commissionRate / 100);
    const directPerDeal = baseCommission * (DIRECT_REFERRER_SHARE / 100);
    const directMonthlyGain = directPerDeal * directRecommendations;

    let previousLevelMembers = directActiveMembers;
    const networkLevels = Array.from({ length: MAX_NETWORK_LEVELS }, (_, index) => {
      const level = index + 1;
      const members =
        level === 1
          ? directActiveMembers
          : Math.round(previousLevelMembers * activeRelaysPerMember);
      previousLevelMembers = members;

      const active = level <= activeNetworkLevels;
      const monthlyDeals = active ? Math.round(members * networkDealsPerMember) : 0;
      const gain = monthlyDeals * baseCommission * (NETWORK_LEVEL_SHARE / 100);

      return {
        active,
        gain,
        level,
        members: active ? members : 0,
        monthlyDeals,
      };
    });

    const networkMonthlyGain = networkLevels.reduce(
      (sum, level) => sum + level.gain,
      0
    );
    const networkMonthlyDeals = networkLevels.reduce(
      (sum, level) => sum + level.monthlyDeals,
      0
    );
    const monthlyGain = directMonthlyGain + networkMonthlyGain;
    const yearlyGain = monthlyGain * 12;

    return {
      baseCommission,
      directMonthlyGain,
      directPerDeal,
      monthlyGain,
      networkLevels,
      networkMonthlyDeals,
      networkMonthlyGain,
      yearlyGain,
    };
  }, [
    activeNetworkLevels,
    activeRelaysPerMember,
    dealAmount,
    directActiveMembers,
    directRecommendations,
    networkDealsPerMember,
  ]);

  return (
    <section
      id="simulateur"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-winelio-gray/10 bg-white shadow-[0_24px_70px_-46px_rgba(45,52,54,0.45)] dark:border-white/10 dark:bg-card"
    >
      <div className="h-1 w-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-emerald-500" />

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(23rem,0.92fr)]">
        <div className="bg-[#fbfcfc] p-4 sm:p-6 lg:p-7 dark:bg-white/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-winelio-orange/20 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-winelio-orange shadow-sm dark:bg-white/10">
                <Calculator className="size-3.5" />
                Simulateur de gains
              </div>
              <h2 className="mt-3 text-xl font-bold text-winelio-dark sm:text-2xl dark:text-white">
                Direct + réseau, avec niveaux à 3%
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-winelio-gray dark:text-white/68">
                Projection indicative basée sur le plan standard Winelio :
                commission pro, part directe et réseau MLM jusqu'à 5 niveaux.
              </p>
            </div>
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-dark text-white shadow-lg shadow-winelio-dark/15 dark:bg-white dark:text-winelio-dark">
              <SlidersHorizontal className="size-5" />
            </div>
          </div>

          {/* Deal Amount Slider Control */}
          <div className="mt-6">
            <label className="block rounded-xl border border-winelio-gray/10 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/8">
              <span className="flex items-center gap-2 text-sm font-semibold text-winelio-dark dark:text-white">
                <Home className="size-4 text-winelio-orange" />
                Montant moyen du deal (travaux)
              </span>
              <div className="mt-3 flex items-center rounded-xl border border-winelio-gray/15 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20">
                <input
                  className="min-w-0 flex-1 bg-transparent text-lg font-bold text-winelio-dark outline-none dark:text-white"
                  inputMode="numeric"
                  max={500000}
                  min={0}
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
                aria-label="Montant moyen du deal"
                className="mt-3 h-2 w-full cursor-pointer accent-winelio-orange"
                max={50000}
                min={500}
                step={500}
                type="range"
                value={Math.min(dealAmount, 50000)}
                onChange={(event) => setDealAmount(Number(event.target.value))}
              />
            </label>
          </div>

          {/* Active Scenario Card */}
          <div className="mt-5 rounded-2xl border border-winelio-orange/20 bg-gradient-to-br from-orange-50/50 to-amber-50/30 p-5 dark:from-winelio-orange/5 dark:to-winelio-amber/5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-winelio-orange/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-winelio-orange dark:bg-winelio-orange/20">
                <Network className="size-3" />
                Simulation Réseau
              </span>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-1.5 text-xs font-extrabold text-winelio-dark shadow-sm border border-winelio-gray/15 hover:border-winelio-orange/30 hover:text-winelio-orange transition active:scale-95 dark:bg-white/10 dark:text-white dark:border-white/10 cursor-pointer animate-none"
                type="button"
                onClick={() => {
                  setScenarioIndex((prev) => (prev + 1) % SCENARIOS.length);
                }}
              >
                <RefreshCw className="size-3 text-winelio-orange hover:rotate-180 transition-transform duration-500" />
                Autre scénario
              </button>
            </div>

            <h3 className="mt-4 text-base font-extrabold text-winelio-dark dark:text-white">
              {scenario.name}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-winelio-gray dark:text-white/60">
              {scenario.description}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-winelio-gray/10 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-black/10">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-winelio-gray dark:text-white/40">
                  Vos recos
                </span>
                <span className="mt-1 block text-base font-black text-winelio-dark dark:text-white">
                  {directRecommendations} / mois
                </span>
              </div>
              <div className="rounded-xl border border-winelio-gray/10 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-black/10">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-winelio-gray dark:text-white/40">
                  Partenaires
                </span>
                <span className="mt-1 block text-base font-black text-winelio-dark dark:text-white">
                  {directActiveMembers} direct(s)
                </span>
              </div>
              <div className="rounded-xl border border-winelio-gray/10 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-black/10">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-winelio-gray dark:text-white/40">
                  Bouche-à-oreille
                </span>
                <span className="mt-1 block text-base font-black text-winelio-dark dark:text-white">
                  x{activeRelaysPerMember} / membre
                </span>
              </div>
              <div className="rounded-xl border border-winelio-gray/10 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-black/10">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-winelio-gray dark:text-white/40">
                  Deals par membre
                </span>
                <span className="mt-1 block text-base font-black text-winelio-dark dark:text-white">
                  {networkDealsPerMember} / membre
                </span>
              </div>
              <div className="rounded-xl border border-winelio-gray/10 bg-white p-3 shadow-sm dark:border-white/5 dark:bg-black/10">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-winelio-gray dark:text-white/40">
                  Niveaux du réseau
                </span>
                <span className="mt-1 block text-base font-black text-winelio-dark dark:text-white">
                  {activeNetworkLevels} niveaux
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-winelio-dark p-4 text-white sm:p-6 lg:p-7">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/8 p-5">
              <p className="text-sm font-medium text-white/65">
                Projection mensuelle totale
              </p>
              <div className="mt-3 flex items-end gap-2">
                <p className="text-4xl font-black leading-none tracking-normal text-white sm:text-5xl">
                  <AnimatedCounter
                    key={results.monthlyGain}
                    decimals={0}
                    suffix=" EUR"
                    to={results.monthlyGain}
                  />
                </p>
                <ArrowUpRight className="mb-1 size-6 text-winelio-amber" />
              </div>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-white/70">
                <p className="leading-relaxed">
                  Sur un deal de <span className="font-bold text-white">{formatCurrency(dealAmount)}</span>, le professionnel verse <span className="font-bold text-winelio-amber">{formatCurrency(results.baseCommission)}</span> (10% de commission).
                </p>
                <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-winelio-orange/50">
                  <p>
                    • <span className="font-bold text-white">Direct (60%) :</span> Vous touchez{" "}
                    <span className="font-bold text-white">{formatCurrency(results.directPerDeal)}</span> sur vos recommandations directes.
                  </p>
                  <p>
                    • <span className="font-bold text-white">Réseau (3%) :</span> Vous touchez{" "}
                    <span className="font-bold text-white">{formatCurrency(results.baseCommission * 0.03)}</span> par deal réalisé dans votre réseau (niveaux 1 à 5).
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white px-4 py-3 text-winelio-dark">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-winelio-gray">
                <TrendingUp className="size-3.5 text-winelio-orange" />
                Direct
              </p>
              <p className="mt-1 text-xl font-black">
                {formatCurrency(results.directMonthlyGain)}
              </p>
              <p className="mt-1 text-xs text-winelio-gray">
                {directRecommendations} recos x{" "}
                {formatCurrency(results.directPerDeal)}
              </p>
            </div>

            <div className="rounded-xl bg-white px-4 py-3 text-winelio-dark">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-winelio-gray">
                <Users className="size-3.5 text-emerald-600" />
                Réseau
              </p>
              <p className="mt-1 text-xl font-black">
                {formatCurrency(results.networkMonthlyGain)}
              </p>
              <p className="mt-1 text-xs text-winelio-gray">
                {formatNumber(results.networkMonthlyDeals)} deals x{" "}
                {formatCurrency(results.baseCommission * 0.03)}
              </p>
            </div>

            <div className="sm:col-span-2 rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber px-4 py-3 text-white">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-white/80">
                <PiggyBank className="size-3.5" />
                Projection annuelle
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatCurrency(results.yearlyGain)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/8 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Détail réseau</p>
              <span className="text-xs font-semibold text-white/55">
                {NETWORK_LEVEL_SHARE}% par niveau
              </span>
            </div>
            <div className="space-y-2">
              {results.networkLevels.map((level, index) => (
                <div
                  key={level.level}
                  className={`grid grid-cols-[3.25rem_1fr_5.5rem] items-center gap-3 rounded-xl border px-3 py-2 ${
                    level.active
                      ? "border-white/10 bg-white/8"
                      : "border-white/5 bg-black/10 opacity-45"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${levelAccentClasses[index]}`}
                    />
                    <span className="text-sm font-black">N{level.level}</span>
                  </div>
                  <p className="min-w-0 text-xs text-white/58">
                    {level.members} membres actifs ·{" "}
                    {formatNumber(level.monthlyDeals)} deals/mois
                  </p>
                  <p className="text-right text-sm font-black">
                    {formatCurrency(level.gain)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
