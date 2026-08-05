import { useEffect, useState } from "react";

import { useWinelioAuth } from "@/auth/WinelioAuthProvider";
import { getMobileSupabase } from "@/infrastructure/supabase/mobileSupabase";

export type DashboardSummary = {
  firstName: string;
  inProgress: number;
  networkCount: number;
  recommendationsThisMonth: number;
  successRate: number;
  totalEarned: number;
};

const emptySummary: DashboardSummary = {
  firstName: "Mon profil",
  inProgress: 0,
  networkCount: 0,
  recommendationsThisMonth: 0,
  successRate: 0,
  totalEarned: 0,
};

export const useDashboardSummary = () => {
  const { session } = useWinelioAuth();
  const [summary, setSummary] = useState(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getMobileSupabase();
    const userId = session?.user.id;
    if (!supabase || !userId) {
      setIsLoading(false);
      return;
    }

    let active = true;
    const loadSummary = async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [profile, wallet, monthly, total, completed, network, inProgress] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle(),
        supabase.from("user_wallet_summaries").select("total_earned").eq("user_id", userId).maybeSingle(),
        supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("referrer_id", userId).gte("created_at", startOfMonth.toISOString()),
        supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("referrer_id", userId),
        supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("referrer_id", userId).eq("status", "COMPLETED"),
        supabase.rpc("get_network_ids", { p_user_id: userId, p_max_depth: 5 }),
        supabase.from("recommendations").select("id", { count: "exact", head: true }).or(`referrer_id.eq.${userId},professional_id.eq.${userId}`).in("status", ["PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED", "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED"]),
      ]);
      if (!active) return;
      const totalCount = total.count ?? 0;
      setSummary({
        firstName: profile.data?.first_name?.trim() || "Mon profil",
        inProgress: inProgress.count ?? 0,
        networkCount: network.data?.length ?? 0,
        recommendationsThisMonth: monthly.count ?? 0,
        successRate: totalCount > 0 ? Math.round(((completed.count ?? 0) / totalCount) * 100) : 0,
        totalEarned: Number(wallet.data?.total_earned ?? 0),
      });
      setIsLoading(false);
    };

    void loadSummary();
    return () => { active = false; };
  }, [session?.user.id]);

  return { summary, isLoading };
};
