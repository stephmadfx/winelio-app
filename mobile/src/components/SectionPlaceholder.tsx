import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { WinelioScreen } from "@/components/WinelioScreen";
import { colors, radii, shadows, spacing, typography } from "@/design-system/tokens";

export const SectionPlaceholder = ({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}) => (
  <WinelioScreen>
    <View style={styles.card}>
      <View style={styles.icon}><Feather color={colors.orange} name={icon} size={28} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  </WinelioScreen>
);

const styles = StyleSheet.create({
  card: { alignItems: "center", backgroundColor: colors.white, borderColor: "#F1F3F4", borderRadius: radii.lg, borderWidth: 1, gap: spacing[3], minHeight: 260, justifyContent: "center", padding: spacing[6], ...shadows.soft },
  icon: { alignItems: "center", backgroundColor: colors.orangeSoft, borderRadius: 28, height: 56, justifyContent: "center", width: 56 },
  title: { color: colors.dark, fontFamily: typography.bold, fontSize: 22, textAlign: "center" },
  description: { color: colors.gray, fontFamily: typography.regular, fontSize: 14, lineHeight: 22, textAlign: "center" },
});
