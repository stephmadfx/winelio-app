import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  orange: "#FF6B35",
  amber: "#F7931E",
  dark: "#2D3436",
  gray: "#636E72",
  light: "#F8F9FA",
  white: "#FFFFFF",
  slate900: "#0F172A",
  slate800: "#1E293B",
  border: "#E5E7EB",
  muted: "#F3F4F6",
  danger: "#EF4444",
  dangerSoft: "#FEF2F2",
  success: "#059669",
  successSoft: "#D1FAE5",
  orangeSoft: "#FFF1EB",
  amberSoft: "#FFF7E8",
  transparent: "transparent",
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 28,
  pill: 999,
} as const;

export const typography = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
} as const;

export const shadows = {
  card: {
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 8,
  } satisfies ViewStyle,
  floating: {
    shadowColor: colors.orange,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 15,
    elevation: 7,
  } satisfies ViewStyle,
  soft: {
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  } satisfies ViewStyle,
} as const;

export const textStyles = {
  eyebrow: {
    color: colors.gray,
    fontFamily: typography.semibold,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: "uppercase",
  } satisfies TextStyle,
  title: {
    color: colors.dark,
    fontFamily: typography.semibold,
    fontSize: 24,
    lineHeight: 30,
  } satisfies TextStyle,
  body: {
    color: colors.gray,
    fontFamily: typography.regular,
    fontSize: 14,
    lineHeight: 24,
  } satisfies TextStyle,
} as const;
