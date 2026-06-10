"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Calculator,
  GitBranch,
  Home,
  PiggyBank,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

// Taux du Plan Standard (source de vérité : winelio.compensation_plans).
// À garder synchronisés si le plan par défaut change.
const PRO_COMMISSION_RATE = 10; // % du deal facturé au professionnel
const DIRECT_SHARE = 60; // % de la commission reversés au recommandeur
const NETWORK_LEVEL_SHARE = 3; // % de la commission par niveau de parrainage
const LEVELS = 5;
const MAX_PER_LEVEL = 2000;

export function AffiliateSimulator() {
  const [dealAmount, setDealAmount] = useState(5000);
  const [monthlyRecommendations, setMonthlyRecommendations] = useState(3);
  const [networkEnabled, setNetworkEnabled] = useState(false);

  // Mode simple : le réseau se déduit de 3 curseurs parlants
  const [directRecruits, setDirectRecruits] = useState(3);
  const [duplication, setDuplication] = useState(1.5);
  const [activityRate, setActivityRate] = useState(40);
  const [networkRecos, setNetworkRecos] = useState(1);
  const [networkDealAmount, setNetworkDealAmount] = useState(5000);

  // Mode expert : override manuel des effectifs par niveau
  const [expertMode, setExpertMode] = useState(false);
  const [levelOverrides, setLevelOverrides] = useState<number[] | null>(null);

  // Effectifs théoriques par niveau (croissance géométrique)
  const geometricCounts = useMemo(() => {
    const counts: number[] = [];
    for (let level = 0; level < LEVELS; level++) {
      const raw = directRecruits * Math.pow(duplication, level);
      counts.push(clampNumber(Math.round(raw), 0, MAX_PER_LEVEL));
    }
    return counts;
  }, [directRecruits, duplication]);

  const levelCounts = expertMode && levelOverrides ? levelOverrides : geometricCounts;

  const results = useMemo(() => {
    const proCommission = dealAmount * (PRO_COMMISSION_RATE / 100);
    const directGain = proCommission * (DIRECT_SHARE / 100);
    const directMonthly = directGain * monthlyRecommendations;

    const networkProCommission = networkDealAmount * (PRO_COMMISSION_RATE / 100);
    const levelDetails = levelCounts.map((count, index) => {
      const active = Math.round(count * (activityRate / 100));
      const amount =
        active * networkRecos * networkProCommission * (NETWORK_LEVEL_SHARE / 100);
      return { level: index + 1, count, active, amount };
    });
    const networkMonthly = levelDetails.reduce((sum, l) => sum + l.amount, 0);
    const totalMonthly = directMonthly + (networkEnabled ? networkMonthly : 0);

    // Projection 12 mois : le réseau monte en puissance linéairement (complet à M12).
    // Cumul annuel = 12 × direct + réseau × (1+2+…+12)/12 = 12 × direct + 6,5 × réseau.
    let cumulDirect = 0;
    let cumulNetwork = 0;
    const projection = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      cumulDirect += directMonthly;
      cumulNetwork += networkEnabled ? networkMonthly * (month / 12) : 0;
      return {
        month: `M${month}`,
        direct: Math.round(cumulDirect),
        reseau: Math.round(cumulNetwork),
      };
    });
    const yearlyGain = cumulDirect + cumulNetwork;

    return {
      proCommission,
      directGain,
      directMonthly,
      networkMonthly,
      totalMonthly,
      yearlyGain,
      levelDetails,
      projection,
    };
  }, [
    dealAmount,
    monthlyRecommendations,
    networkEnabled,
    networkDealAmount,
    networkRecos,
    activityRate,
    levelCounts,
  ]);

  const toggleExpertMode = () => {
    if (!expertMode) setLevelOverrides([...geometricCounts]);
    setExpertMode(!expertMode);
  };

  const updateLevelOverride = (levelIndex: number, value: number) => {
    setLevelOverrides((current) => {
      const base = current ?? [...geometricCounts];
      return base.map((item, index) =>
        index === levelIndex ? clampNumber(value, 0, MAX_PER_LEVEL) : item
      );
    });
  };

  const maxActive = Math.max(...results.levelDetails.map((l) => l.active), 1);
  const totalActive = results.levelDetails.reduce((sum, l) => sum + l.active, 0);

  return (
    <section
      id="simulateur"
      className="scroll-mt-24 relative overflow-hidden rounded-2xl border border-winelio-orange/20 bg-white shadow-[0_24px_70px_-42px_rgba(45,52,54,0.45)] dark:border-white/10 dark:bg-card"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,107,53,0.16),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(247,147,30,0.16),transparent_26%),linear-gradient(135deg,rgba(255,245,240,0.96),rgba(255,255,255,0.82)_46%,rgba(248,249,250,0.94))] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(255,107,53,0.20),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(247,147,30,0.18),transparent_26%),linear-gradient(135deg,rgba(45,52,54,0.98),rgba(35,39,40,0.96)_52%,rgba(22,24,25,0.98))]" />
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-winelio-orange" />

      <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
        {/* ── Colonne contrôles ── */}
        <div className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-winelio-orange/20 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-winelio-orange shadow-sm dark:bg-white/10">
                <Calculator className="size-3.5" />
                Simulateur de gains
              </div>
              <h2 className="text-xl font-bold text-winelio-dark sm:text-2xl dark:text-white">
                Estimez votre potentiel
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-winelio-gray dark:text-white/68">
                Réglez les curseurs et visualisez vos gains directs. Activez le
                réseau pour projeter vos commissions sur 5 niveaux.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-white shadow-lg shadow-winelio-orange/25">
              <Sparkles className="size-5" />
            </div>
          </div>

          {/* Montant des travaux */}
          <label className="block rounded-2xl border border-white/80 bg-white/82 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8">
            <span className="flex items-center gap-2 text-sm font-semibold text-winelio-dark dark:text-white">
              <Home className="size-4 text-winelio-orange" />
              Montant des travaux que vous recommandez
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
                  setDealAmount(clampNumber(Number(event.target.value) || 0, 0, 500000))
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
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {projectPresets.map((preset) => (
                <button
                  key={preset.label}
                  className="rounded-xl border border-winelio-orange/15 bg-white/76 px-2 py-1.5 text-xs font-semibold text-winelio-dark transition hover:border-winelio-orange/35 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12"
                  type="button"
                  onClick={() => setDealAmount(preset.value)}
                >
                  <span>{preset.label}</span>
                  {"caption" in preset ? (
                    <span className="block text-[10px] font-medium text-winelio-gray dark:text-white/55">
                      {preset.caption}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </label>

          {/* Recos directes par mois */}
          <label className="block rounded-2xl border border-white/80 bg-white/82 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-winelio-dark dark:text-white">
                <TrendingUp className="size-4 text-winelio-orange" />
                Vos recommandations par mois
              </span>
              <span className="rounded-lg bg-winelio-orange/10 px-2.5 py-1 text-sm font-bold text-winelio-orange">
                {monthlyRecommendations}
              </span>
            </div>
            <input
              aria-label="Nombre de recommandations par mois"
              className="mt-3 h-2 w-full cursor-pointer accent-winelio-orange"
              max={10}
              min={1}
              step={1}
              type="range"
              value={monthlyRecommendations}
              onChange={(event) => setMonthlyRecommendations(Number(event.target.value))}
            />
          </label>

          {/* Toggle réseau */}
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
                Projetez les commissions de vos filleuls sur {LEVELS} niveaux,
                à {NETWORK_LEVEL_SHARE}&nbsp;% par niveau.
              </span>
            </span>
          </label>

          {networkEnabled ? (
            <div className="space-y-4 rounded-2xl border border-winelio-orange/20 bg-white/86 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-bold text-winelio-dark dark:text-white">
                  <Users className="size-4 text-winelio-orange" />
                  Votre réseau
                </p>
                <button
                  type="button"
                  onClick={toggleExpertMode}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition ${
                    expertMode
                      ? "border-winelio-orange bg-winelio-orange/10 text-winelio-orange"
                      : "border-winelio-gray/20 text-winelio-gray hover:border-winelio-orange/40 hover:text-winelio-orange dark:border-white/15 dark:text-white/55"
                  }`}
                >
                  <SlidersHorizontal className="size-3" />
                  Mode expert
                </button>
              </div>

              {!expertMode ? (
                <>
                  <SliderRow
                    label="Je parraine"
                    value={directRecruits}
                    display={`${directRecruits} pers.`}
                    min={0}
                    max={20}
                    step={1}
                    onChange={setDirectRecruits}
                  />
                  <SliderRow
                    label="Chacun parraine en moyenne"
                    value={duplication}
                    display={`${duplication.toLocaleString("fr-FR")} pers.`}
                    min={0}
                    max={5}
                    step={0.5}
                    onChange={setDuplication}
                  />
                </>
              ) : (
                <div className="space-y-2">
                  {levelCounts.map((count, index) => (
                    <SliderRow
                      key={index}
                      label={`Niveau ${index + 1}`}
                      value={count}
                      display={`${count} pers.`}
                      min={0}
                      max={index < 2 ? 100 : 500}
                      step={1}
                      onChange={(v) => updateLevelOverride(index, v)}
                    />
                  ))}
                  <p className="text-[11px] leading-4 text-winelio-gray dark:text-white/50">
                    Effectifs réglés manuellement — désactivez le mode expert
                    pour revenir au calcul automatique.
                  </p>
                </div>
              )}

              <SliderRow
                label="Filleuls réellement actifs"
                value={activityRate}
                display={`${activityRate} %`}
                min={10}
                max={100}
                step={5}
                onChange={setActivityRate}
              />
              <SliderRow
                label="Recos par filleul actif / mois"
                value={networkRecos}
                display={`${networkRecos}`}
                min={0}
                max={5}
                step={1}
                onChange={setNetworkRecos}
              />
              <SliderRow
                label="Montant moyen des travaux du réseau"
                value={networkDealAmount}
                display={formatCurrency(networkDealAmount)}
                min={500}
                max={30000}
                step={500}
                onChange={setNetworkDealAmount}
              />

              {/* ── Pyramide du réseau ── */}
              <div className="rounded-xl border border-winelio-orange/10 bg-white/75 p-3 dark:border-white/10 dark:bg-black/20">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-winelio-gray dark:text-white/55">
                  Votre pyramide · {totalActive} affilié{totalActive > 1 ? "s" : ""} actif{totalActive > 1 ? "s" : ""}
                </p>
                <div className="space-y-1.5">
                  {results.levelDetails.map((level) => {
                    const widthPct = clampNumber(
                      Math.sqrt(level.active / maxActive) * 100,
                      level.active > 0 ? 14 : 4,
                      100
                    );
                    return (
                      <div key={level.level} className="flex items-center gap-2">
                        <span className="w-7 shrink-0 text-[11px] font-black text-winelio-orange">
                          N{level.level}
                        </span>
                        <div className="flex-1">
                          <div
                            className="flex h-7 items-center justify-between rounded-lg bg-gradient-to-r from-winelio-orange to-winelio-amber px-2 text-white shadow-sm transition-all duration-500"
                            style={{ width: `${widthPct}%`, opacity: level.active > 0 ? 1 : 0.25 }}
                          >
                            <span className="text-[11px] font-bold whitespace-nowrap">
                              {level.active}
                            </span>
                          </div>
                        </div>
                        <span className="w-20 shrink-0 text-right text-[11px] font-semibold text-winelio-dark dark:text-white/80 whitespace-nowrap">
                          {formatCurrency(level.amount)}/mois
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Colonne résultats ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-winelio-dark p-5 text-white shadow-2xl shadow-winelio-dark/20 dark:border-white/10 dark:bg-black/28">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-winelio-orange/30 to-transparent" />
          <div className="absolute right-5 top-5 h-2 w-2 rounded-full bg-winelio-amber shadow-[0_0_22px_rgba(247,147,30,0.9)]" />

          <div className="relative">
            <p className="text-sm font-medium text-white/68">
              {networkEnabled ? "Potentiel mensuel total" : "Vous touchez par reco"}
            </p>
            <div className="mt-3 flex items-end gap-2">
              <p className="text-4xl font-black leading-none tracking-normal text-white sm:text-5xl">
                <AnimatedCounter
                  key={`${networkEnabled}-${results.totalMonthly}-${results.directGain}`}
                  decimals={0}
                  suffix=" EUR"
                  to={networkEnabled ? results.totalMonthly : results.directGain}
                />
              </p>
              <ArrowUpRight className="mb-1 size-6 text-winelio-amber" />
            </div>
            <p className="mt-3 text-sm leading-6 text-white/62">
              {networkEnabled
                ? `${formatCurrency(results.directMonthly)} d'activité directe + ${formatCurrency(results.networkMonthly)} générés par votre réseau.`
                : `${formatCurrency(dealAmount)} × ${PRO_COMMISSION_RATE} % de commission × ${DIRECT_SHARE} % reversés au recommandeur.`}
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-white/10 bg-white/8 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/64">Commission générée par deal</span>
                  <span className="font-bold text-white">
                    {formatCurrency(results.proCommission)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber transition-all duration-500"
                    style={{ width: `${DIRECT_SHARE}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-white/45">
                  <span>Votre part directe</span>
                  <span>{DIRECT_SHARE} %</span>
                </div>
              </div>

              {/* Courbe de projection 12 mois */}
              <div className="rounded-xl border border-white/10 bg-white/8 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-white/72">
                    <TrendingUp className="size-4 text-winelio-amber" />
                    Cumul sur 12 mois
                  </span>
                  <span className="font-bold text-white">
                    {formatCurrency(results.yearlyGain)}
                  </span>
                </div>
                <div className="mt-3 h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={results.projection} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="simDirect" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#FF6B35" stopOpacity={0.25} />
                        </linearGradient>
                        <linearGradient id="simReseau" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F7931E" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#F7931E" stopOpacity={0.2} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip
                        cursor={{ stroke: "rgba(255,255,255,0.2)" }}
                        contentStyle={{
                          background: "#2D3436",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                        formatter={(value, name) => [
                          formatCurrency(Number(value)),
                          String(name) === "direct" ? "Direct cumulé" : "Réseau cumulé",
                        ]}
                      />
                      <Area
                        dataKey="direct"
                        stackId="gains"
                        stroke="#FF6B35"
                        strokeWidth={2}
                        fill="url(#simDirect)"
                        type="monotone"
                      />
                      {networkEnabled ? (
                        <Area
                          dataKey="reseau"
                          stackId="gains"
                          stroke="#F7931E"
                          strokeWidth={2}
                          fill="url(#simReseau)"
                          type="monotone"
                        />
                      ) : null}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {networkEnabled ? (
                  <p className="mt-2 text-[11px] leading-4 text-white/45">
                    Projection prudente : votre réseau monte en puissance
                    progressivement et n&apos;atteint sa taille cible qu&apos;au 12ᵉ mois.
                  </p>
                ) : null}
              </div>

              {networkEnabled ? (
                <div className="rounded-xl border border-white/10 bg-white/8 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-white/72">
                      <GitBranch className="size-4 text-winelio-amber" />
                      Effet réseau mensuel
                    </span>
                    <span className="font-bold text-white">
                      {formatCurrency(results.networkMonthly)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-4 text-white/45">
                    {NETWORK_LEVEL_SHARE} % de la commission sur chaque reco
                    aboutie de vos {totalActive} affiliés actifs.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white px-4 py-3 text-winelio-dark">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-winelio-gray">
                  Direct mensuel
                </p>
                <p className="mt-1 text-xl font-black">
                  {formatCurrency(results.directMonthly)}
                </p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber px-4 py-3 text-white">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/78">
                  <PiggyBank className="size-3.5" />
                  Cumul 1ʳᵉ année
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

/* ── Curseur générique avec étiquette et valeur ── */
function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-winelio-dark dark:text-white/80">
          {label}
        </span>
        <span className="rounded-lg bg-winelio-orange/10 px-2 py-0.5 text-[13px] font-bold text-winelio-orange whitespace-nowrap">
          {display}
        </span>
      </div>
      <input
        aria-label={label}
        className="mt-2 h-2 w-full cursor-pointer accent-winelio-orange"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
