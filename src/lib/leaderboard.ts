/**
 * Wrappers typés autour des RPC de leaderboard PostgreSQL.
 * Un seul appel = une catégorie + une période. Les wrappers sont composables
 * dans des Server Components via Promise.all() pour fetch en parallèle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LeaderboardCategory = "sponsors" | "revenue" | "recos";

export interface PodiumEntry {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  /** Valeur affichée : score / total_amount / reco_count selon la catégorie */
  value: number;
}

export interface MyPosition {
  rank: number;       // 0 si non classé
  value: number;      // 0 si non classé
  totalUsers: number; // 0 si la catégorie n'a aucun classement
}

/** Retourne le 1er du mois en cours (UTC), à utiliser comme p_period_start. */
export function startOfCurrentMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Tous les temps : 2010-01-01 (avant la création de Winelio) */
export function startOfAllTime(): Date {
  return new Date("2010-01-01T00:00:00Z");
}

export async function fetchTopSponsors(
  supabase: SupabaseClient,
  periodStart: Date,
  limit = 3,
): Promise<PodiumEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_top_sponsors", {
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) {
    console.error("[leaderboard] top_sponsors error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; first_name: string | null; last_name: string | null; avatar: string | null; score: number }) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    avatar: r.avatar,
    value: Number(r.score),
  }));
}

export async function fetchTopRevenue(
  supabase: SupabaseClient,
  periodStart: Date,
  limit = 3,
): Promise<PodiumEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_top_revenue", {
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) {
    console.error("[leaderboard] top_revenue error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; first_name: string | null; last_name: string | null; avatar: string | null; total_amount: number }) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    avatar: r.avatar,
    value: Number(r.total_amount),
  }));
}

export async function fetchTopRecos(
  supabase: SupabaseClient,
  periodStart: Date,
  limit = 3,
): Promise<PodiumEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_top_recos", {
    p_period_start: periodStart.toISOString(),
    p_limit: limit,
  });
  if (error) {
    console.error("[leaderboard] top_recos error:", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string; first_name: string | null; last_name: string | null; avatar: string | null; reco_count: number }) => ({
    user_id: r.user_id,
    first_name: r.first_name,
    last_name: r.last_name,
    avatar: r.avatar,
    value: Number(r.reco_count),
  }));
}

export async function fetchMyPosition(
  supabase: SupabaseClient,
  userId: string,
  category: LeaderboardCategory,
  periodStart: Date,
): Promise<MyPosition> {
  const { data, error } = await supabase.rpc("leaderboard_my_position", {
    p_user_id: userId,
    p_category: category,
    p_period_start: periodStart.toISOString(),
  });
  if (error || !data || data.length === 0) {
    return { rank: 0, value: 0, totalUsers: 0 };
  }
  const row = data[0];
  return {
    rank: Number(row.rank),
    value: Number(row.value),
    totalUsers: Number(row.total_users),
  };
}

/** Format prénom + initiale du nom. "Stéphane MAIRIAUX" → "Stéphane M." */
export function formatPodiumName(first: string | null, last: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f && !l) return "Utilisateur";
  if (!l) return f;
  return `${f} ${l.charAt(0).toUpperCase()}.`;
}

/** Format euro français concis (350 → "350 €", 1234.5 → "1 234,50 €") */
export function fmtEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
