import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, typography } from "@/design-system/tokens";
import type { DashboardSummary } from "@/features/dashboard/useDashboardSummary";

export const DashboardHero = ({ inProgress }: { inProgress: number }) => {
  const router = useRouter();
  return (
    <LinearGradient colors={[colors.orange, colors.amber]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
      <View style={[styles.heroOrb, styles.heroOrbTop]} />
      <View style={[styles.heroOrb, styles.heroOrbBottom]} />
      <Text style={styles.heroTitle}>Recommandez. Gagnez. Grandissez.</Text>
      <Pressable onPress={() => router.push("/(tabs)/recommendations")} style={styles.primaryAction}>
        <Text style={styles.primaryActionText}>Faire une recommandation</Text>
        <Feather color={colors.orange} name="arrow-right" size={17} />
      </Pressable>
      <Pressable onPress={() => router.push("/(tabs)/recommendations")} style={styles.secondaryAction}>
        <Text style={styles.secondaryActionText}>Recommandations en cours</Text>
        {inProgress > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{inProgress}</Text></View> : null}
        <Feather color={colors.white} name="chevron-right" size={17} />
      </Pressable>
    </LinearGradient>
  );
};

const kpis: { key: keyof DashboardSummary; label: string; suffix?: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "recommendationsThisMonth", label: "Recos ce mois", icon: "clipboard" },
  { key: "totalEarned", label: "Gains totaux", suffix: " €", icon: "dollar-sign" },
  { key: "networkCount", label: "Membres réseau", icon: "users" },
  { key: "successRate", label: "Taux de succès", suffix: " %", icon: "check-circle" },
];

export const KpiGrid = ({ summary }: { summary: DashboardSummary }) => (
  <View style={styles.kpiGrid}>
    {kpis.map((kpi, index) => {
      const accent = index % 2 === 0 ? colors.orange : colors.amber;
      return (
        <View key={kpi.key} style={styles.kpiCard}>
          <View style={[styles.kpiIcon, { backgroundColor: `${accent}18` }]}>
            <Feather color={accent} name={kpi.icon} size={18} />
          </View>
          <Text style={[styles.kpiValue, { color: accent }]}>{summary[kpi.key]}{kpi.suffix}</Text>
          <Text style={styles.kpiLabel}>{kpi.label}</Text>
        </View>
      );
    })}
  </View>
);

export const EmptyPodium = () => (
  <View style={styles.card}>
    <View style={styles.cardTitleRow}><Text style={styles.cardEmoji}>👥</Text><Text style={styles.cardTitle}>Filleuls 1er niveau</Text></View>
    <View style={styles.emptyPodium}>
      <Text style={styles.emptyText}>Personne ce mois-ci.</Text>
      <Text style={styles.emptyAccent}>Sois le premier !</Text>
    </View>
    <View style={styles.divider} />
    <Text style={styles.position}>Toi : <Text style={styles.positionStrong}>non classé</Text></Text>
    <View style={styles.dots}><View style={styles.dotActive} /><View style={styles.dot} /></View>
  </View>
);

export const ActivityCard = () => (
  <View style={styles.card}>
    <View style={styles.activityHeader}>
      <View style={styles.activityTitle}><Text style={styles.cardTitle}>Activité réseau</Text><View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>Live</Text></View></View>
      <Text style={styles.seeAll}>Voir tout</Text>
    </View>
    <View style={styles.activityEmpty}>
      <View style={styles.activityIcon}><Feather color={colors.orange} name="activity" size={24} /></View>
      <Text style={styles.emptyText}>L’activité de votre réseau apparaîtra ici.</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  hero: { borderRadius: radii.lg, gap: 10, overflow: "hidden", padding: spacing[6], ...shadows.floating },
  heroOrb: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, position: "absolute" },
  heroOrbTop: { height: 160, right: -45, top: -55, width: 160 },
  heroOrbBottom: { bottom: -40, height: 125, left: -35, width: 125 },
  heroTitle: { color: colors.white, fontFamily: typography.bold, fontSize: 20, lineHeight: 26, marginBottom: spacing[1] },
  primaryAction: { alignItems: "center", backgroundColor: colors.white, borderRadius: radii.pill, flexDirection: "row", gap: spacing[2], justifyContent: "center", minHeight: 42, paddingHorizontal: spacing[5] },
  primaryActionText: { color: colors.orange, fontFamily: typography.bold, fontSize: 13 },
  secondaryAction: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.3)", borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", gap: spacing[2], justifyContent: "center", minHeight: 42, paddingHorizontal: spacing[5] },
  secondaryActionText: { color: colors.white, fontFamily: typography.semibold, fontSize: 13 },
  badge: { alignItems: "center", backgroundColor: colors.white, borderRadius: radii.pill, height: 20, justifyContent: "center", minWidth: 20, paddingHorizontal: 5 },
  badgeText: { color: colors.orange, fontFamily: typography.bold, fontSize: 11 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  kpiCard: { backgroundColor: colors.white, borderColor: "#F1F3F4", borderRadius: radii.lg, borderWidth: 1, minHeight: 120, padding: spacing[4], width: "48%", ...shadows.soft },
  kpiIcon: { alignItems: "center", borderRadius: radii.md, height: 36, justifyContent: "center", width: 36 },
  kpiValue: { fontFamily: typography.bold, fontSize: 22, marginTop: spacing[3] },
  kpiLabel: { color: colors.gray, fontFamily: typography.medium, fontSize: 11, marginTop: 2 },
  card: { backgroundColor: colors.white, borderColor: "#F1F3F4", borderRadius: radii.lg, borderWidth: 1, minHeight: 230, padding: spacing[4], ...shadows.soft },
  cardTitleRow: { alignItems: "center", flexDirection: "row", gap: spacing[2], justifyContent: "center" },
  cardEmoji: { fontSize: 20 },
  cardTitle: { color: colors.dark, fontFamily: typography.semibold, fontSize: 15 },
  emptyPodium: { alignItems: "center", flex: 1, justifyContent: "center" },
  emptyText: { color: colors.gray, fontFamily: typography.regular, fontSize: 13, textAlign: "center" },
  emptyAccent: { color: colors.orange, fontFamily: typography.semibold, fontSize: 13, marginTop: 2 },
  divider: { backgroundColor: "#F3F4F6", height: 1 },
  position: { color: colors.gray, fontFamily: typography.regular, fontSize: 11, marginTop: spacing[3], textAlign: "center" },
  positionStrong: { fontFamily: typography.semibold },
  dots: { flexDirection: "row", gap: spacing[2], justifyContent: "center", marginTop: spacing[3] },
  dotActive: { backgroundColor: colors.orange, borderRadius: radii.pill, height: 8, width: 24 },
  dot: { backgroundColor: "#D1D5DB", borderRadius: radii.pill, height: 8, width: 8 },
  activityHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  activityTitle: { alignItems: "center", flexDirection: "row", gap: spacing[2] },
  live: { alignItems: "center", backgroundColor: colors.orangeSoft, borderRadius: radii.pill, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 4 },
  liveDot: { backgroundColor: colors.orange, borderRadius: 3, height: 6, width: 6 },
  liveText: { color: colors.orange, fontFamily: typography.bold, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase" },
  seeAll: { color: colors.orange, fontFamily: typography.bold, fontSize: 12 },
  activityEmpty: { alignItems: "center", flex: 1, gap: spacing[3], justifyContent: "center" },
  activityIcon: { alignItems: "center", backgroundColor: colors.orangeSoft, borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
});
