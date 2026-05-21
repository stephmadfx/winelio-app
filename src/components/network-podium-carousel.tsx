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
  topN1Total: PodiumEntry[];
  myPositions: {
    sponsors: MyPosition;
    n1_total: MyPosition;
  };
}

const ROTATION_MS = 8_000;
const SLIDES = ["n1_total", "sponsors"] as const;
type SlideKey = typeof SLIDES[number];

const SLIDE_META: Record<SlideKey, { emoji: string; titlePrefix: string; suffix: string }> = {
  n1_total: { emoji: "👥", titlePrefix: "Filleuls 1er niveau", suffix: "" },
  sponsors:  { emoji: "🏆", titlePrefix: "Top Parrainage",      suffix: " pts" },
};

const SWIPE_THRESHOLD_PX = 40;

export function NetworkPodiumCarousel({
  monthLabel,
  currentUserId,
  topSponsors,
  topN1Total,
  myPositions,
}: Props) {
  const [index, setIndex] = useState(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tracking du swipe tactile (et souris pour desktop)
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeHandledRef = useRef(false);

  const goToSlide = (i: number) => {
    setIndex(((i % SLIDES.length) + SLIDES.length) % SLIDES.length);
    setPausedByUser(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
    swipeHandledRef.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartXRef.current;
    const dy = t.clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Geste horizontal dominant ET amplitude suffisante = swipe
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      swipeHandledRef.current = true;
      e.preventDefault();
      if (dx < 0) goToSlide(index + 1);  // swipe gauche → suivant
      else        goToSlide(index - 1);  // swipe droit  → précédent
    }
  };

  const handleClick = () => {
    // Si un swipe vient d'être détecté, ne pas re-pauser
    if (swipeHandledRef.current) {
      swipeHandledRef.current = false;
      return;
    }
    setPausedByUser(true);
  };

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

  const entries = current === "sponsors" ? topSponsors : topN1Total;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Classements Winelio du mois"
    >
      <Card className="!rounded-2xl">
        <CardContent
          className="p-4 sm:p-5 cursor-pointer select-none min-h-[280px] touch-pan-y"
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div aria-live="polite" className="sr-only">
            {meta.titlePrefix} · {current === "n1_total" ? "Tout temps" : monthLabel}
          </div>
          <NetworkPodiumSlide
            category={current}
            title={current === "sponsors"
              ? `${meta.titlePrefix} · ${monthLabel}`
              : meta.titlePrefix}
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
