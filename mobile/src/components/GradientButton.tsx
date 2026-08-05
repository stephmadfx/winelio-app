import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, typography } from "@/design-system/tokens";

type GradientButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
};

export const GradientButton = ({ label, onPress, disabled, loading, icon }: GradientButtonProps) => (
  <Pressable
    accessibilityRole="button"
    disabled={disabled || loading}
    onPress={onPress}
    style={({ pressed }) => [styles.pressable, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
  >
    <LinearGradient colors={[colors.orange, colors.amber]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.gradient}>
      {loading ? <ActivityIndicator color={colors.white} /> : (
        <View style={styles.content}>
          <Text style={styles.label}>{label}</Text>
          {icon}
        </View>
      )}
    </LinearGradient>
  </Pressable>
);

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadows.floating,
  },
  gradient: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
    paddingVertical: 14,
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "center",
  },
  label: {
    color: colors.white,
    fontFamily: typography.semibold,
    fontSize: 14,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.96 },
  disabled: { opacity: 0.6 },
});
