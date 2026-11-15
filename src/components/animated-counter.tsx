"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({
  to,
  suffix = "",
  decimals = 0,
  duration = 850,
  delay = 0,
}: {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
  delay?: number;
}) {
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (duration <= 0) {
      currentRef.current = to;
      setCurrent(to);
      return;
    }

    const from = currentRef.current;
    const startAt = performance.now() + delay;

    const tick = (now: number) => {
      if (now < startAt) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - startAt;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress < 1 ? from + (to - from) * eased : to;
      currentRef.current = next;
      setCurrent(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration, delay]);

  return (
    <>
      {current.toLocaleString("fr-FR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  );
}
