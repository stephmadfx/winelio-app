import { ScrollView, StyleSheet, View } from "react-native";

import { MobileHeader } from "@/components/MobileHeader";
import { WinelioBackground } from "@/components/WinelioBackground";
import { colors, spacing } from "@/design-system/tokens";

export const WinelioScreen = ({ children, firstName }: { children: React.ReactNode; firstName?: string }) => (
  <View style={styles.screen}>
    <WinelioBackground />
    <MobileHeader firstName={firstName} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.light, flex: 1 },
  content: { gap: spacing[5], padding: spacing[4], paddingBottom: spacing[8] },
});
