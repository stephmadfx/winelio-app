import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, typography } from "@/design-system/tokens";

export type AuthMethod = "code" | "password";

export const AuthMethodSwitch = ({
  value,
  onChange,
}: {
  value: AuthMethod;
  onChange: (method: AuthMethod) => void;
}) => (
  <View style={styles.shell}>
    <MethodButton active={value === "code"} label="Code par email" onPress={() => onChange("code")} />
    <MethodButton active={value === "password"} label="Mot de passe" onPress={() => onChange("password")} />
  </View>
);

const MethodButton = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.button, active && styles.buttonActive]}>
    <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.muted,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing[1],
    padding: spacing[1],
  },
  button: {
    alignItems: "center",
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: "center",
    minHeight: 36,
  },
  buttonActive: {
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  label: { fontFamily: typography.medium, fontSize: 13 },
  labelActive: { color: colors.dark },
  labelInactive: { color: colors.gray },
});
