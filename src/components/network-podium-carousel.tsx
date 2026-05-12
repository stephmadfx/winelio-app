"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { NetworkPodiumSlide } from "@/components/network-podium-slide";
import type { PodiumEntry, MyPosition } from "@/lib/leaderboard";

interface Props {
  monthLabel: string;       // ex: "Mai 2026"
  currentUserId: string;
  topSponsors: PodiumEntry[];
  topRevenue: PodiumEntry[];
  topRecos: PodiumEntry[];
  myPositions: {
    sponsors: MyPosition;
    revenue: MyPosition;
    recos: MyPosition;
  };
}

const ROTATION_MS = 8_000;
const SLIDES = ["sponsors", "revenue", "recos"] as const;
type SlideKey = typeof SLIDES[number];

const SLIDE_META: Record<SlideKey, { emoji: string; titlePrefix: string; suffix: string }> = {
  sponsors: { emoji: "🏆", titlePrefix: "Top Parrains", suffix: " pts" },
  revenue:  { emoji: "💰", titlePrefix: "Top Revenus", suffix: "" },
  recos:    { emoji: "📋", titlePrefix: "Top Recos",   suffix: "" },
};

export function NetworkPodiumCarousel({
  monthLabel,
  currentUserId,
  topSponsors,
  topRevenue,
  topRecos,
  myPositions,
}: Props) {
  const [index, setIndex] = useState(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prefersReducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (pausedByUser || prefersReducedMotion) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pausedByUser, prefersReducedMotion]);

  const current = SLIDES[index];
  const meta = SLIDE_META[current];

  const entries = current === "sponsors" ? topSponsors
                : current === "revenue"  ? topRevenue
                : topRecos;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Classements Winelio du mois"
    >
      <Card className="!rounded-2xl">
        <CardContent
          className="p-4 sm:p-5 cursor-pointer select-none min-h-[280px]"
          onClick={() => setPausedByUser(true)}
        >
          <div aria-live="polite" className="sr-only">
            {meta.titlePrefix} · {monthLabel}
          </div>
          <NetworkPodiumSlide
            category={current}
            title={`${meta.titlePrefix} · ${monthLabel}`}
            emoji={meta.emoji}
            unitSuffix={meta.suffix}
            topEntries={entries}
            myPosition={myPositions[current]}
            currentUserId={currentUserId}
          />

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-3">
            {SLIDES.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                  setPausedByUser(true);
                }}
                aria-label={`Aller au podium ${SLIDE_META[s].titlePrefix}`}
                className={`h-2 rounded-full transition-all ${
                  i === index
                    ? "w-6 bg-winelio-orange"
                    : "w-2 bg-gray-300 hover:bg-gray-400"
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-center mt-3">
        <Link
          href="/network/leaderboard"
          className="text-sm text-winelio-orange hover:text-winelio-amber font-medium inline-flex items-center gap-1"
        >
          Voir le palmarès historique →
        </Link>
      </div>
    </section>
  );
}
