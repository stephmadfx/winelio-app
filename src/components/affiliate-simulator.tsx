"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Calculator,
  Home,
  Network,
  Percent,
  PiggyBank,
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

const projectPresets = [
  { label: "Cuisine", value: 12000 },
  { label: "Salle de bain", value: 8500 },
  { label: "Isolation", value: 15000 },
  { label: "Honoraires", value: 4000 },
];

const levelAccentClasses = [
  "bg-winelio-orange",
  "bg-winelio-amber",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-winelio-dark",
];

type RangeControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  helper?: string;
  onChange: (value: number) => void;
};

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  helper,
  onChange,
}: RangeControlProps) {
  return (
    <label className="block rounded-xl border border-winelio-gray/10 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/8">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-winelio-dark dark:text-white">
          {label}
        </span>
        <span className="min-w-[4.5rem] rounded-lg bg-winelio-light px-2.5 py-1 text-right text-sm font-black tabular-nums text-winelio-dark dark:bg-white/10 dark:text-white">
          {formatNumber(value)}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </span>
      <input
        aria-label={label}
        className="mt-3 h-2 w-full cursor-pointer accent-winelio-orange"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {helper ? (
        <span className="mt-1 block text-xs leading-5 text-winelio-gray dark:text-white/55">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

export function AffiliateSimulator() {
  const [dealAmount, setDealAmount] = useState(5000);
  const [commissionRate, setCommissionRate] = useState(10);
  const [directRecommendations, setDirectRecommendations] = useState(3);
  const [activeNetworkLevels, setActiveNetworkLevels] = useState(5);
  const [directActiveMembers, setDirectActiveMembers] = useState(4);
  const [activeRelaysPerMember, setActiveRelaysPerMember] = useState(1.5);
  const [networkDealsPerMember, setNetworkDealsPerMember] = useState(1);

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
      const monthlyDeals = active ? members * networkDealsPerMember : 0;
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
    commissionRate,
    dealAmount,
    directActiveMembers,
    directRecommendations,
    networkDealsPerMember,
  ]);

  const distribution = [
    { label: "Direct", percentage: DIRECT_REFERRER_SHARE },
    { label: "Reseau 5 niveaux", percentage: NETWORK_LEVEL_SHARE * MAX_NETWORK_LEVELS },
    { label: "Winelio", percentage: PLATFORM_SHARE },
    { label: "Affiliation", percentage: AFFILIATION_SHARE },
    { label: "Wins pro", percentage: CASHBACK_SHARE },
  ];

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
                Direct + reseau, avec niveaux a 3%
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-winelio-gray dark:text-white/68">
                Projection indicative basee sur le plan standard Winelio :
                commission pro, part directe et reseau MLM jusqu'a 5 niveaux.
              </p>
            </div>
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-dark text-white shadow-lg shadow-winelio-dark/15 dark:bg-white dark:text-winelio-dark">
              <SlidersHorizontal className="size-5" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <label className="block rounded-xl border border-winelio-gray/10 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/8">
              <span className="flex items-center gap-2 text-sm font-semibold text-winelio-dark dark:text-white">
                <Home className="size-4 text-winelio-orange" />
                Montant moyen du deal
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

            <RangeControl
              helper="Taux preleve au professionnel sur le montant du deal."
              label="Commission Winelio"
              max={20}
              min={1}
              step={0.5}
              suffix="%"
              value={commissionRate}
              onChange={setCommissionRate}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {projectPresets.map((preset) => (
              <button
                key={preset.label}
                className="rounded-xl border border-winelio-gray/10 bg-white px-3 py-2 text-sm font-semibold text-winelio-dark shadow-sm transition hover:-translate-y-0.5 hover:border-winelio-orange/35 hover:text-winelio-orange dark:border-white/10 dark:bg-white/8 dark:text-white"
                type="button"
                onClick={() => setDealAmount(preset.value)}
              >
                <span>{preset.label}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-winelio-gray dark:text-white/55">
                  {formatCurrency(preset.value)}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <RangeControl
              helper={`${DIRECT_REFERRER_SHARE}% de la commission Winelio par recommandation directe.`}
              label="Recos directes par mois"
              max={20}
              min={0}
              step={1}
              value={directRecommendations}
              onChange={setDirectRecommendations}
            />
            <RangeControl
              helper="Nombre de filleuls directs qui generent eux-memes des deals."
              label="Filleuls directs actifs"
              max={30}
              min={0}
              step={1}
              value={directActiveMembers}
              onChange={setDirectActiveMembers}
            />
            <RangeControl
              helper="Moyenne de relais actifs creee par membre a chaque niveau."
              label="Relais actifs par membre"
              max={4}
              min={0}
              step={0.25}
              value={activeRelaysPerMember}
              onChange={setActiveRelaysPerMember}
            />
            <RangeControl
              helper="Activite moyenne des membres de votre reseau."
              label="Deals par membre reseau"
              max={6}
              min={0}
              step={0.25}
              value={networkDealsPerMember}
              onChange={setNetworkDealsPerMember}
            />
          </div>

          <div className="mt-5 rounded-xl border border-winelio-gray/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Network className="size-4 text-emerald-600" />
                <p className="text-sm font-semibold text-winelio-dark dark:text-white">
                  Profondeur reseau simulee
                </p>
              </div>
              <div className="grid grid-cols-6 gap-1 rounded-xl bg-winelio-light p-1 dark:bg-black/20">
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    className={`h-9 min-w-9 rounded-lg px-2 text-sm font-black transition ${
                      activeNetworkLevels === level
                        ? "bg-winelio-dark text-white shadow-sm dark:bg-white dark:text-winelio-dark"
                        : "text-winelio-gray hover:bg-white dark:text-white/60 dark:hover:bg-white/10"
                    }`}
                    type="button"
                    onClick={() => setActiveNetworkLevels(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-winelio-gray dark:text-white/55">
              Le reseau est remunere a {NETWORK_LEVEL_SHARE}% par niveau actif,
              de N1 a N5.
            </p>
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
              <p className="mt-3 text-sm leading-6 text-white/58">
                {formatCurrency(dealAmount)} x {formatNumber(commissionRate)}%
                = {formatCurrency(results.baseCommission)} de commission par
                deal.
              </p>
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
                Reseau
              </p>
              <p className="mt-1 text-xl font-black">
                {formatCurrency(results.networkMonthlyGain)}
              </p>
              <p className="mt-1 text-xs text-winelio-gray">
                {formatNumber(results.networkMonthlyDeals)} deals x 3%
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
              <p className="flex items-center gap-2 text-sm font-bold">
                <Percent className="size-4 text-winelio-amber" />
                Repartition d'un deal
              </p>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white/75">
                base 100%
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-white/12">
              <div className="flex h-full w-full">
                {distribution.map((part, index) => (
                  <div
                    key={part.label}
                    className={levelAccentClasses[index]}
                    style={{ width: `${part.percentage}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-white/62 sm:grid-cols-2">
              {distribution.map((part, index) => (
                <div key={part.label} className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${levelAccentClasses[index]}`}
                  />
                  <span className="flex-1">{part.label}</span>
                  <span className="font-bold text-white">{part.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/8 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Detail reseau</p>
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
