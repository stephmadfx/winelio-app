"use client";

import { useState, useMemo } from "react";
import { User, Network, Trophy, TrendingUp } from "lucide-react";
import { AnimatedCounter } from "@/components/animated-counter";

const F_FACTOR = 0.704; // Factor of downline deal activity/success to match illustration

interface AffiliateSimulatorProps {
  plan?: {
    commission_rate?: string | number | null;
    referrer_percentage?: string | number | null;
    level_1_percentage?: string | number | null;
    level_2_percentage?: string | number | null;
    level_3_percentage?: string | number | null;
    level_4_percentage?: string | number | null;
    level_5_percentage?: string | number | null;
    high_amount_threshold?: string | number | null;
    high_amount_commission_rate?: string | number | null;
  } | null;
}

export function AffiliateSimulator({ plan }: AffiliateSimulatorProps) {
  // State for Personnel section
  const [dealAmount, setDealAmount] = useState(5000);
  
  // State for Réseau section
  const [networkEnabled, setNetworkEnabled] = useState(true);
  const [avgDealAmount, setAvgDealAmount] = useState(2500);
  const [level1, setLevel1] = useState(4);
  const [level2, setLevel2] = useState(16);
  const [level3, setLevel3] = useState(23);
  const [level4, setLevel4] = useState(37);
  const [level5, setLevel5] = useState(50);
  const [pareto, setPareto] = useState(20); // Pareto active percentage

  // Resolve plan numbers with robust fallbacks
  const getPlanNumber = (val: string | number | null | undefined, fallback: number): number => {
    if (val === null || val === undefined) return fallback;
    const num = Number(val);
    return Number.isFinite(num) ? num : fallback;
  };

  const planBaseRate = getPlanNumber(plan?.commission_rate, 10);
  const planReferrerPct = getPlanNumber(plan?.referrer_percentage, 60);
  const planL1Pct = getPlanNumber(plan?.level_1_percentage, 3);
  const planL2Pct = getPlanNumber(plan?.level_2_percentage, 3);
  const planL3Pct = getPlanNumber(plan?.level_3_percentage, 3);
  const planL4Pct = getPlanNumber(plan?.level_4_percentage, 3);
  const planL5Pct = getPlanNumber(plan?.level_5_percentage, 3);

  const highAmountThreshold = plan?.high_amount_threshold ? Number(plan.high_amount_threshold) : 25000;
  const highAmountCommissionRate = plan?.high_amount_commission_rate !== undefined && plan?.high_amount_commission_rate !== null 
    ? Number(plan.high_amount_commission_rate) 
    : null;

  // Calculations
  const results = useMemo(() => {
    // 1. Resolve commission rate for personal dealAmount
    let personalCommRate = planBaseRate;
    if (highAmountCommissionRate !== null && dealAmount > highAmountThreshold) {
      personalCommRate = highAmountCommissionRate;
    }
    const personalBaseCommission = dealAmount * (personalCommRate / 100);
    const personalGain = personalBaseCommission * (planReferrerPct / 100);

    // 2. Resolve commission rate for average network deal amount
    let networkCommRate = planBaseRate;
    if (highAmountCommissionRate !== null && avgDealAmount > highAmountThreshold) {
      networkCommRate = highAmountCommissionRate;
    }

    let networkGain = 0;
    let actL1 = 0, actL2 = 0, actL3 = 0, actL4 = 0, actL5 = 0;
    let totalL1 = 0, totalL2 = 0, totalL3 = 0, totalL4 = 0, totalL5 = 0;
    let totalDownlines = 0;
    let totalActiveDownlines = 0;

    if (networkEnabled) {
      const baseCommNetwork = avgDealAmount * (networkCommRate / 100);
      const paretoFactor = pareto / 100;

      // Active members calculation per level
      // Niveau 1 active members
      actL1 = level1 * paretoFactor;
      // Niveau 2 active members (recursive sponsored by Level 1 active)
      actL2 = actL1 * level2 * paretoFactor * F_FACTOR;
      // Niveau 3 active members
      actL3 = actL2 * level3 * paretoFactor * F_FACTOR;
      // Niveau 4 active members
      actL4 = actL3 * level4 * paretoFactor * F_FACTOR;
      // Niveau 5 active members
      actL5 = actL4 * level5 * paretoFactor * F_FACTOR;

      // Total theoretical members per level (without Pareto/F_FACTOR)
      totalL1 = level1;
      totalL2 = totalL1 * level2;
      totalL3 = totalL2 * level3;
      totalL4 = totalL3 * level4;
      totalL5 = totalL4 * level5;

      // Round active members to 1 decimal place as in math explanation
      const rL1 = Math.round(actL1 * 10) / 10;
      const rL2 = Math.round(actL2 * 10) / 10;
      const rL3 = Math.round(actL3 * 10) / 10;
      const rL4 = Math.round(actL4 * 10) / 10;
      const rL5 = Math.round(actL5 * 10) / 10;

      // Calculate network gain per level based on the plan percentages
      const gainL1 = rL1 * baseCommNetwork * (planL1Pct / 100);
      const gainL2 = rL2 * baseCommNetwork * (planL2Pct / 100);
      const gainL3 = rL3 * baseCommNetwork * (planL3Pct / 100);
      const gainL4 = rL4 * baseCommNetwork * (planL4Pct / 100);
      const gainL5 = rL5 * baseCommNetwork * (planL5Pct / 100);

      networkGain = gainL1 + gainL2 + gainL3 + gainL4 + gainL5;
      totalDownlines = totalL1 + totalL2 + totalL3 + totalL4 + totalL5;
      totalActiveDownlines = rL1 + rL2 + rL3 + rL4 + rL5;
    }

    const totalMonthly = personalGain + networkGain;

    return {
      personalGain,
      networkGain,
      totalMonthly,
      totalDownlines,
      totalActiveDownlines,
    };
  }, [
    dealAmount,
    networkEnabled,
    avgDealAmount,
    level1,
    level2,
    level3,
    level4,
    level5,
    pareto,
    planBaseRate,
    planReferrerPct,
    planL1Pct,
    planL2Pct,
    planL3Pct,
    planL4Pct,
    planL5Pct,
    highAmountThreshold,
    highAmountCommissionRate
  ]);

  // Utility to generate dynamic slider track gradient background
  const getSliderBackground = (value: number, max: number) => {
    const pct = (value / max) * 100;
    return `linear-gradient(to right, #FF6B35 0%, #F7931E ${pct}%, #E2E8F0 ${pct}%, #E2E8F0 100%)`;
  };

  return (
    <div className="w-full max-w-5xl mx-auto my-2 font-sans flex flex-col justify-between flex-1">
      <style dangerouslySetInnerHTML={{ __html: `
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
          appearance: textfield;
        }
        .winelio-range-input {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 8px;
          border-radius: 9999px;
          outline: none;
          transition: background 0.15s ease-in-out;
        }
        .winelio-range-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffffff;
          border: 4px solid #FF6B35;
          cursor: pointer;
          box-shadow: 0 4px 10px rgba(255, 107, 53, 0.3);
          transition: transform 0.1s ease;
        }
        .winelio-range-input::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .winelio-range-input::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffffff;
          border: 4px solid #FF6B35;
          cursor: pointer;
          box-shadow: 0 4px 10px rgba(255, 107, 53, 0.3);
          transition: transform 0.1s ease;
        }
        .winelio-range-input::-moz-range-thumb:hover {
          transform: scale(1.15);
        }
      `}} />
      {/* Main Title */}
      <div className="text-center mb-6 shrink-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-winelio-dark dark:text-white tracking-tight">
          Simulateur de gains
        </h1>
        <div className="h-1 w-12 mx-auto mt-2 rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber" />
      </div>
 
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch flex-1">
        {/* ================= COLUMN 1: PERSONNEL & TOTAL ================= */}
        <div className="flex flex-col gap-6 h-full justify-between">
          {/* Personnel Card */}
          <div className="bg-white dark:bg-card border border-winelio-gray/10 dark:border-white/10 rounded-3xl p-5 shadow-[0_20px_50px_-24px_rgba(45,52,54,0.08)] flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-winelio-orange/10 flex items-center justify-center text-winelio-orange">
                  <User className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-winelio-dark dark:text-white">
                  Personnel
                </h2>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <span className="text-xs font-semibold text-winelio-gray dark:text-white/70">
                      Montant du deal
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={dealAmount}
                        min={0}
                        max={1000000}
                        onChange={(e) => setDealAmount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-24 shrink-0 text-right px-2 py-1 text-xs font-bold border border-winelio-gray/15 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-winelio-dark dark:text-white outline-none focus:border-winelio-orange transition"
                      />
                      <span className="text-xs font-bold text-winelio-dark dark:text-white">€</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={30000}
                    step={500}
                    value={Math.min(dealAmount, 30000)}
                    onChange={(e) => setDealAmount(parseInt(e.target.value))}
                    className="winelio-range-input cursor-pointer"
                    style={{
                      background: getSliderBackground(Math.min(dealAmount, 30000), 30000)
                    }}
                  />

                  {/* Slider Ticks */}
                  <div className="flex justify-between mt-2 px-1 text-[10px] font-bold text-winelio-gray/60 dark:text-white/40">
                    <span>0 €</span>
                    <span>15k €</span>
                    <span>30k €</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Gain Output Card */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-orange-50/50 dark:bg-winelio-orange/5 border border-winelio-orange/10 mt-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center text-white">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-winelio-dark dark:text-white/80">
                  Gain perso
                </span>
              </div>
              <span className="text-lg font-black text-winelio-orange">
                <AnimatedCounter to={results.personalGain} suffix=" €" decimals={2} />
              </span>
            </div>
          </div>

          {/* ================= BOTTOM PANEL: MONTANT MENSUEL ================= */}
          <div className="bg-[#1E2528] dark:bg-black/40 border border-white/5 rounded-3xl p-5 shadow-xl text-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-winelio-amber">
                  <Trophy className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold tracking-wide">
                  Montant mensuel
                </span>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-white">
                <AnimatedCounter to={results.totalMonthly} suffix=" €" decimals={2} />
              </span>
            </div>
          </div>
        </div>

        {/* ================= COLUMN 2: RÉSEAU PARAMS ================= */}
        <div className="bg-white dark:bg-card border border-winelio-gray/10 dark:border-white/10 rounded-3xl p-5 shadow-[0_20px_50px_-24px_rgba(45,52,54,0.08)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-winelio-orange/10 flex items-center justify-center text-winelio-orange">
                  <Network className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-winelio-dark dark:text-white">
                  Réseau
                </h2>
              </div>

              {/* Network Toggle Switch */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-winelio-gray dark:text-white/70">
                  Réseau activé
                </span>
                <button
                  type="button"
                  onClick={() => setNetworkEnabled(!networkEnabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    networkEnabled ? "bg-winelio-orange" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      networkEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className={`space-y-5 transition-all duration-300 ${networkEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              {/* Average Deal Amount */}
              <div>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className="text-xs font-semibold text-winelio-gray dark:text-white/70">
                    Montant moyen du deal
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={avgDealAmount}
                      min={0}
                      max={1000000}
                      onChange={(e) => setAvgDealAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-24 shrink-0 text-right px-2 py-1 text-xs font-bold border border-winelio-gray/15 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-winelio-dark dark:text-white outline-none focus:border-winelio-orange transition"
                    />
                    <span className="text-xs font-bold text-winelio-dark dark:text-white">€</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={30000}
                  step={500}
                  value={Math.min(avgDealAmount, 30000)}
                  onChange={(e) => setAvgDealAmount(parseInt(e.target.value))}
                  className="winelio-range-input cursor-pointer"
                  style={{
                    background: getSliderBackground(Math.min(avgDealAmount, 30000), 30000)
                  }}
                />

                <div className="flex justify-between mt-2 px-1 text-[10px] font-bold text-winelio-gray/60 dark:text-white/40">
                  <span>0 €</span>
                  <span>15k €</span>
                  <span>30k €</span>
                </div>
              </div>

              {/* Pareto active percentage */}
              <div className="border-t border-winelio-gray/5 dark:border-white/5 pt-5">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className="text-xs font-bold text-winelio-dark dark:text-white">
                    Actifs — Loi de Pareto
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={pareto}
                      min={0}
                      max={100}
                      onChange={(e) => setPareto(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-14 text-right px-2 py-1 text-xs font-bold border border-winelio-gray/15 dark:border-white/10 rounded-lg bg-white dark:bg-black/20 text-winelio-dark dark:text-white outline-none focus:border-winelio-orange transition"
                    />
                    <span className="text-xs font-bold text-winelio-dark dark:text-white">%</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pareto}
                  onChange={(e) => setPareto(parseInt(e.target.value))}
                  className="winelio-range-input cursor-pointer"
                  style={{
                    background: getSliderBackground(pareto, 100)
                  }}
                />

                <div className="flex justify-between mt-2 px-1 text-[10px] font-bold text-winelio-gray/60 dark:text-white/40">
                  <span>0 %</span>
                  <span>50 %</span>
                  <span>100 %</span>
                </div>
              </div>
            </div>
          </div>

          {/* Network Gain Output Card */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-orange-50/50 dark:bg-winelio-orange/5 border border-winelio-orange/10 mt-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center text-white">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-winelio-dark dark:text-white/80">
                Gain réseau
              </span>
            </div>
            <span className="text-lg font-black text-winelio-orange">
              <AnimatedCounter to={results.networkGain} suffix=" €" decimals={2} />
            </span>
          </div>
        </div>

        {/* ================= COLUMN 3: RÉSEAU LEVELS ================= */}
        <div className="bg-white dark:bg-card border border-winelio-gray/10 dark:border-white/10 rounded-3xl p-5 shadow-[0_20px_50px_-24px_rgba(45,52,54,0.08)] flex flex-col justify-between">
          <div className={`space-y-4 transition-all duration-300 h-full flex flex-col justify-between ${networkEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div>
              <h3 className="text-xs font-bold text-winelio-dark dark:text-white uppercase tracking-wider mb-4 border-b border-winelio-gray/5 pb-2">
                Filleuls par niveau
              </h3>

              {/* Levels 1 to 5 sliders */}
              <div className="space-y-3.5">
                {[
                  { label: "Niveau 1", val: level1, setVal: setLevel1 },
                  { label: "Niveau 2", val: level2, setVal: setLevel2 },
                  { label: "Niveau 3", val: level3, setVal: setLevel3 },
                  { label: "Niveau 4", val: level4, setVal: setLevel4 },
                  { label: "Niveau 5", val: level5, setVal: setLevel5 },
                ].map((lvl) => (
                  <div key={lvl.label} className="flex items-center justify-between gap-4">
                    <span className="text-[11px] font-semibold text-winelio-gray dark:text-white/70 w-14 shrink-0">
                      {lvl.label}
                    </span>
                    
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={lvl.val}
                        onChange={(e) => lvl.setVal(parseInt(e.target.value))}
                        className="winelio-range-input cursor-pointer flex-1"
                        style={{
                          background: getSliderBackground(lvl.val, 100)
                        }}
                      />
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={lvl.val}
                          onChange={(e) => lvl.setVal(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-10 text-right px-1 py-0.5 text-xs font-bold border border-winelio-gray/15 dark:border-white/10 rounded bg-white dark:bg-black/20 text-winelio-dark dark:text-white outline-none focus:border-winelio-orange transition"
                        />
                        <span className="text-[9px] font-semibold text-winelio-gray/70 dark:text-white/50 w-8">
                          fil.
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Levels Ticks Label */}
            <div className="flex justify-between pr-10 pl-16 text-[9px] font-bold text-winelio-gray/40 dark:text-white/30 select-none border-t border-winelio-gray/5 pt-2">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>

            {/* Total Downlines Summary */}
            <div className="border-t border-winelio-gray/10 dark:border-white/10 pt-3 mt-2">
              <div className="flex items-center justify-between text-xs text-winelio-gray dark:text-white/70">
                <span>Total filleuls</span>
                <span className="font-black text-winelio-orange text-sm">
                  {results.totalDownlines.toLocaleString("fr-FR")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Disclaimer */}
      <p className="text-center text-[9px] text-winelio-gray/60 dark:text-white/40 leading-relaxed max-w-lg mx-auto mt-4 shrink-0">
        Les résultats sont estimatifs et peuvent varier en fonction des paramètres et des performances réelles.
      </p>
    </div>
  );
}
