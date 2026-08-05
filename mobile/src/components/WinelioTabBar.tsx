import { Feather } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, shadows, spacing, typography } from "@/design-system/tokens";

const tabs: Record<string, { label: string; icon: keyof typeof Feather.glyphMap }> = {
  index: { label: "Accueil", icon: "home" },
  recommendations: { label: "Recos", icon: "clipboard" },
  network: { label: "Réseau", icon: "users" },
  wallet: { label: "Gains", icon: "dollar-sign" },
  profile: { label: "Profil", icon: "user" },
};

export const WinelioTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
      {state.routes.map((route, index) => {
        const tab = tabs[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
            key={route.key}
            onPress={onPress}
            style={styles.tab}
          >
            {focused ? (
              <LinearGradient colors={[colors.orange, colors.amber]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={[styles.iconShell, styles.iconShellActive]}>
                <Feather color={colors.white} name={tab.icon} size={20} strokeWidth={2.3} />
              </LinearGradient>
            ) : (
              <View style={styles.iconShell}>
                <Feather color={colors.gray} name={tab.icon} size={20} strokeWidth={1.7} />
              </View>
            )}
            <Text style={[styles.label, focused && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderTopColor: "rgba(0,0,0,0.05)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    ...shadows.soft,
  },
  tab: { alignItems: "center", flex: 1, gap: 2, minHeight: 50 },
  iconShell: {
    alignItems: "center",
    borderRadius: radii.lg,
    height: 34,
    justifyContent: "center",
    width: 46,
  },
  iconShellActive: {
    transform: [{ translateY: -4 }, { scale: 1.07 }],
    ...shadows.floating,
  },
  label: {
    color: colors.gray,
    fontFamily: typography.semibold,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  labelActive: { color: colors.orange },
});
