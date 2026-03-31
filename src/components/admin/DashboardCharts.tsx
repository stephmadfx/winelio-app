"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export type MonthStat = { month: string; count: number };
export type StatusStat = { name: string; value: number; color: string };

const STATUS_COLORS: Record<string, string> = {
  "En attente":  "#636E72",
  "Acceptée":    "#F7931E",
  "En cours":    "#3B82F6",
  "Terminée":    "#10B981",
  "Annulée":     "#EF4444",
};

const FALLBACK_COLORS = ["#FF6B35","#F7931E","#10B981","#3B82F6","#8B5CF6","#EF4444"];

export function InscriptionsChart({ data }: { data: MonthStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="month"
          tick={{ fill: "#636E72", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#636E72", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ background: "#1F2937", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
          cursor={{ fill: "rgba(255,107,53,0.08)" }}
        />
        <Bar dataKey="count" name="Inscriptions" fill="#FF6B35" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RecosStatusChart({ data }: { data: StatusStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={STATUS_COLORS[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#1F2937", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ color: "#9CA3AF", fontSize: 11 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
