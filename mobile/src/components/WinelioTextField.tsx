import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";

import { colors, radii, spacing, typography } from "@/design-system/tokens";

type WinelioTextFieldProps = TextInputProps & {
  label: string;
  accessory?: React.ReactNode;
};

export const WinelioTextField = forwardRef<TextInput, WinelioTextFieldProps>(
  ({ label, accessory, style, ...props }, ref) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          ref={ref}
          placeholderTextColor="rgba(99,110,114,0.55)"
          selectionColor={colors.orange}
          style={[styles.input, accessory ? styles.inputWithAccessory : null, style]}
          {...props}
        />
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>
    </View>
  )
);

WinelioTextField.displayName = "WinelioTextField";

const styles = StyleSheet.create({
  field: { gap: spacing[2] },
  label: {
    color: colors.dark,
    fontFamily: typography.medium,
    fontSize: 14,
  },
  inputShell: { position: "relative" },
  input: {
    minHeight: 50,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    backgroundColor: "rgba(248,249,250,0.72)",
    color: colors.dark,
    fontFamily: typography.regular,
    fontSize: 16,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  inputWithAccessory: { paddingRight: 52 },
  accessory: {
    position: "absolute",
    right: spacing[4],
    top: 13,
  },
});
