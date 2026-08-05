import { Tabs } from "expo-router";

import { WinelioTabBar } from "@/components/WinelioTabBar";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <WinelioTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="recommendations" />
      <Tabs.Screen name="network" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
