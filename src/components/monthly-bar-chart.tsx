"use client";

import { useEffect, useState } from "react";

type BarData = { label: string; count: number; isCurrent: boolean };

export function MonthlyBarChart({ data, maxCount }: { data: BarData[]; maxCount: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-40 flex items-end justify-between gap-3 px-1">
      {data.map((m, i) => (
        <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full bg-gray-100 rounded-t-lg h-full relative overflow-hidden">
            <div
              className={`w-full absolute bottom-0 rounded-t-lg ${
                m.isCurrent
                  ? "bg-gradient-to-t from-winelio-orange to-winelio-amber shadow-[0_0_15px_rgba(255,107,53,0.3)]"
                  : "bg-gray-200 hover:bg-winelio-orange/20"
              }`}
              style={{
                height: ready ? `${Math.max((m.count / maxCount) * 100, 4)}%` : "4%",
                transition: "height 0.55s cubic-bezier(0.34, 1.3, 0.64, 1)",
                transitionDelay: `${i * 70}ms`,
              }}
            />
          </div>
          <span className={`text-xs font-semibold ${m.isCurrent ? "text-winelio-orange" : "text-winelio-gray"}`}>
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}
