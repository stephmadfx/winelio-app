import { Image, type ImageStyle, StyleSheet } from "react-native";

type WinelioLogoProps = {
  width?: number;
  style?: ImageStyle;
};

const logoSource = require("../../assets/images/logo-color.png");

export const WinelioLogo = ({ width = 154, style }: WinelioLogoProps) => (
  <Image
    accessibilityIgnoresInvertColors
    accessibilityLabel="Winelio"
    resizeMode="contain"
    source={logoSource}
    style={[styles.logo, { width, height: width * 0.275 }, style]}
  />
);

const styles = StyleSheet.create({
  logo: {
    alignSelf: "center",
  },
});
