import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "@/design-system/tokens";

const actions: { label: string; icon: keyof typeof Feather.glyphMap; route: "/(tabs)/recommendations" | "/(tabs)/wallet" | "/(tabs)/network" }[] = [
  { label: "Reco", icon: "plus", route: "/(tabs)/recommendations" },
  { label: "Simuler", icon: "file-text", route: "/(tabs)/wallet" },
  { label: "Inviter", icon: "user-plus", route: "/(tabs)/network" },
  { label: "Gains", icon: "dollar-sign", route: "/(tabs)/wallet" },
  { label: "Réseau", icon: "bar-chart-2", route: "/(tabs)/network" },
];

export const QuickActions = () => {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Actions rapides</Text>
      <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
        {actions.map((action) => (
          <Pressable key={action.label} onPress={() => router.push(action.route)} style={styles.chip}>
            <Feather color={colors.orange} name={action.icon} size={17} />
            <Text style={styles.label}>{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: spacing[3] },
  title: { color: colors.dark, fontFamily: typography.bold, fontSize: 16 },
  row: { gap: spacing[3], paddingBottom: spacing[1] },
  chip: { alignItems: "center", backgroundColor: colors.orangeSoft, borderColor: "rgba(255,107,53,0.2)", borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: 11 },
  label: { color: colors.orange, fontFamily: typography.bold, fontSize: 13 },
});
