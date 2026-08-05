import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WinelioLogo } from "@/components/WinelioLogo";
import { colors, shadows, spacing, typography } from "@/design-system/tokens";

export const MobileHeader = ({ firstName = "Mon profil" }: { firstName?: string }) => {
  const insets = useSafeAreaInsets();
  const hour = new Date().getHours();
  const greeting = hour >= 19 || hour < 6 ? "Bonsoir," : "Bonjour,";
  const initials = firstName.trim().slice(0, 2).toUpperCase() || "MP";

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <WinelioLogo width={96} />
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.greeting}>
            <Text style={styles.eyebrow}>{greeting}</Text>
            <Text numberOfLines={1} style={styles.name}>{firstName} 👋</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityLabel="Signaler un problème" hitSlop={8} style={styles.iconButton}>
            <Feather color={colors.gray} name="message-circle" size={19} />
          </Pressable>
          <Pressable accessibilityLabel="Ouvrir le menu" hitSlop={8} style={styles.iconButton}>
            <Feather color={colors.gray} name="menu" size={20} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: "rgba(248,249,250,0.97)",
    borderBottomColor: "rgba(0,0,0,0.05)",
    borderBottomWidth: 1,
    ...shadows.soft,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    height: 64,
    paddingHorizontal: spacing[4],
  },
  identity: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "center",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.orangeSoft,
    borderColor: "rgba(255,107,53,0.2)",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  avatarText: { color: colors.orange, fontFamily: typography.bold, fontSize: 10 },
  greeting: { maxWidth: 100 },
  eyebrow: {
    color: colors.gray,
    fontFamily: typography.bold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  name: { color: colors.orange, fontFamily: typography.bold, fontSize: 13 },
  actions: { flexDirection: "row" },
  iconButton: { alignItems: "center", height: 40, justifyContent: "center", width: 34 },
});
