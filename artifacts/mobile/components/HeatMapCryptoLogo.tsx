import React from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import type { HeatMapCryptoLogoCode } from "@/lib/heatMapCryptoLogo";

const CRYPTO_LOGO_ASSETS: Record<HeatMapCryptoLogoCode, ImageSourcePropType> = {
  BTC: require("../assets/crypto-logos/btc.png"),
  ETH: require("../assets/crypto-logos/eth.png"),
  SOL: require("../assets/crypto-logos/sol.png"),
  XRP: require("../assets/crypto-logos/xrp.png"),
  BNB: require("../assets/crypto-logos/bnb.png"),
  DOGE: require("../assets/crypto-logos/doge.png"),
  ADA: require("../assets/crypto-logos/ada.png"),
  TRX: require("../assets/crypto-logos/trx.png"),
  AVAX: require("../assets/crypto-logos/avax.png"),
  LINK: require("../assets/crypto-logos/link.png"),
  LTC: require("../assets/crypto-logos/ltc.png"),
  BCH: require("../assets/crypto-logos/bch.png"),
  SUI: require("../assets/crypto-logos/sui.png"),
  DOT: require("../assets/crypto-logos/dot.png"),
  SHIB: require("../assets/crypto-logos/shib.png"),
  TON: require("../assets/crypto-logos/ton.png"),
};

export function HeatMapCryptoLogo({
  code,
  testID,
}: {
  code: HeatMapCryptoLogoCode;
  testID: string;
}) {
  return (
    <View testID={testID} accessible={false} style={styles.root}>
      <Image
        source={CRYPTO_LOGO_ASSETS[code]}
        resizeMode="contain"
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 25,
    height: 25,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -2 }],
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
