import { ActivityIndicator, StyleSheet, View } from "react-native";

import { WinelioScreen } from "@/components/WinelioScreen";
import { colors } from "@/design-system/tokens";
import { ActivityCard, DashboardHero, EmptyPodium, KpiGrid } from "@/features/dashboard/DashboardCards";
import { QuickActions } from "@/features/dashboard/QuickActions";
import { useDashboardSummary } from "@/features/dashboard/useDashboardSummary";

export const DashboardScreen = () => {
  const { summary, isLoading } = useDashboardSummary();
  return (
    <WinelioScreen firstName={summary.firstName}>
      <DashboardHero inProgress={summary.inProgress} />
      <EmptyPodium />
      <ActivityCard />
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.orange} /></View> : <KpiGrid summary={summary} />}
      <QuickActions />
    </WinelioScreen>
  );
};

const styles = StyleSheet.create({
  loading: { alignItems: "center", minHeight: 120, justifyContent: "center" },
});
