import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { colors } from "@/design-system/tokens";

const useFloatingValue = (duration: number, delay = 0) => {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [delay, duration, value]);

  return value;
};

const FloatingOrb = ({
  animation,
  style,
}: {
  animation: Animated.Value;
  style: object;
}) => (
  <Animated.View
    style={[
      styles.orb,
      style,
      {
        transform: [
          { translateX: animation.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
          { translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) },
          { scale: animation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
        ],
      },
    ]}
  />
);

export const WinelioBackground = () => {
  const first = useFloatingValue(14000);
  const second = useFloatingValue(17000, 900);
  const third = useFloatingValue(11000, 500);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <FloatingOrb animation={first} style={styles.orbTop} />
      <FloatingOrb animation={second} style={styles.orbBottom} />
      <FloatingOrb animation={third} style={styles.orbRight} />
      <Svg height="100%" style={styles.network} width="100%">
        <Line stroke={colors.orange} strokeOpacity={0.08} x1="80%" x2="96%" y1="5%" y2="23%" />
        <Line stroke={colors.amber} strokeOpacity={0.07} x1="96%" x2="88%" y1="23%" y2="42%" />
        <Line stroke={colors.orange} strokeOpacity={0.06} x1="2%" x2="7%" y1="32%" y2="57%" />
        <Circle cx="80%" cy="5%" fill={colors.orange} fillOpacity={0.11} r="3" />
        <Circle cx="96%" cy="23%" fill={colors.amber} fillOpacity={0.11} r="2.5" />
        <Circle cx="7%" cy="57%" fill={colors.orange} fillOpacity={0.09} r="2" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbTop: {
    width: 360,
    height: 360,
    right: -160,
    top: -120,
    backgroundColor: "rgba(255,107,53,0.07)",
  },
  orbBottom: {
    width: 330,
    height: 330,
    bottom: -150,
    left: -150,
    backgroundColor: "rgba(247,147,30,0.06)",
  },
  orbRight: {
    width: 220,
    height: 220,
    right: -130,
    top: "36%",
    backgroundColor: "rgba(255,107,53,0.04)",
  },
  network: {
    ...StyleSheet.absoluteFillObject,
  },
});
