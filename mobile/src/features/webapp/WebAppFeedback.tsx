import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { WinelioLogo } from "@/components/WinelioLogo";
import { colors, radii, spacing, typography } from "@/design-system/tokens";

export const WebAppLoading = ({ progress }: { progress: number }) => (
  <View pointerEvents="none" style={styles.loading} testID="webapp-loading">
    <WinelioLogo width={144} />
    <ActivityIndicator color={colors.orange} size="small" />
    <View style={styles.progressTrack}>
      <View style={[styles.progressValue, { width: `${Math.max(8, progress * 100)}%` }]} />
    </View>
  </View>
);

export const WebAppError = ({ message, onRetry }: { message?: string; onRetry: () => void }) => (
  <View style={styles.error} testID="webapp-error">
    <View style={styles.errorIcon}><Feather color={colors.orange} name="wifi-off" size={28} /></View>
    <Text style={styles.title}>Connexion impossible</Text>
    <Text style={styles.copy}>{message ?? "Vérifiez votre connexion internet, puis réessayez."}</Text>
    <Pressable onPress={onRetry} style={styles.retry} testID="webapp-retry-button">
      <Feather color={colors.white} name="refresh-cw" size={16} />
      <Text style={styles.retryText}>Réessayer</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", backgroundColor: colors.light, gap: spacing[5], justifyContent: "center", zIndex: 4 },
  progressTrack: { backgroundColor: colors.border, borderRadius: radii.pill, height: 4, overflow: "hidden", width: 150 },
  progressValue: { backgroundColor: colors.orange, borderRadius: radii.pill, height: 4 },
  error: { alignItems: "center", backgroundColor: colors.light, flex: 1, gap: spacing[3], justifyContent: "center", padding: spacing[8] },
  errorIcon: { alignItems: "center", backgroundColor: colors.orangeSoft, borderRadius: 30, height: 60, justifyContent: "center", width: 60 },
  title: { color: colors.dark, fontFamily: typography.bold, fontSize: 22, marginTop: spacing[2] },
  copy: { color: colors.gray, fontFamily: typography.regular, fontSize: 14, lineHeight: 22, maxWidth: 280, textAlign: "center" },
  retry: { alignItems: "center", backgroundColor: colors.orange, borderRadius: radii.pill, flexDirection: "row", gap: spacing[2], marginTop: spacing[3], paddingHorizontal: spacing[6], paddingVertical: spacing[3] },
  retryText: { color: colors.white, fontFamily: typography.bold, fontSize: 14 },
});
