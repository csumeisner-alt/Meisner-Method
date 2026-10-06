import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import type { ColorScheme } from "@/constants/colors";
import type { HeatMapInstrumentIconKind } from "@/lib/heatMapInstrumentDisplay";

interface HeatMapInstrumentIconProps {
  kind: HeatMapInstrumentIconKind;
  colors: ColorScheme;
  testID: string;
}

function CurrencyGlyph({ kind }: { kind: HeatMapInstrumentIconKind }) {
  switch (kind) {
    case "euro":
      return "€";
    case "yen":
      return "¥";
    case "pound":
      return "£";
    case "canadianDollar":
      return "C$";
    default:
      return "$";
  }
}

export function HeatMapInstrumentIcon({
  kind,
  colors,
  testID,
}: HeatMapInstrumentIconProps) {
  const isCurrency = ["euro", "yen", "pound", "canadianDollar", "dollarIndex"].includes(kind);

  return (
    <View testID={testID} accessible={false} style={styles.root}>
      <Svg width="100%" height="100%" viewBox="0 0 48 36" style={StyleSheet.absoluteFill}>
        {kind === "goldBar" && <>
          <Polygon points="8,10 19,5 38,5 43,10 26,17" fill={colors.gold} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="8,10 26,17 26,31 6,24" fill={colors.goldMuted} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="26,17 43,10 40,25 26,31" fill={colors.gold} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="12,12 22,17 22,19 11,15" fill={colors.heading} />
        </>}
        {kind === "silverBar" && <>
          <Polygon points="8,10 19,5 38,5 43,10 26,17" fill={colors.foreground} stroke={colors.mutedForeground} strokeWidth={1} />
          <Polygon points="8,10 26,17 26,31 6,24" fill={colors.mutedForeground} stroke={colors.border} strokeWidth={1} />
          <Polygon points="26,17 43,10 40,25 26,31" fill={colors.holdColor} stroke={colors.border} strokeWidth={1} />
          <Polygon points="12,12 22,17 22,19 11,15" fill={colors.heading} />
        </>}
        {kind === "copperBar" && <>
          <Polygon points="8,10 19,5 38,5 43,10 26,17" fill={colors.gradeCaution} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="8,10 26,17 26,31 6,24" fill={colors.goldMuted} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="26,17 43,10 40,25 26,31" fill={colors.gradeWarning} stroke={colors.goldMuted} strokeWidth={1} />
        </>}
        {(kind === "platinumBar" || kind === "palladiumBar") && <>
          <Polygon points="8,10 19,5 38,5 43,10 26,17" fill={colors.heading} stroke={colors.mutedForeground} strokeWidth={1} />
          <Polygon points="8,10 26,17 26,31 6,24" fill={colors.mutedForeground} stroke={colors.border} strokeWidth={1} />
          <Polygon points="26,17 43,10 40,25 26,31" fill={colors.holdColor} stroke={colors.border} strokeWidth={1} />
        </>}
        {kind === "corn" && <>
          <Polygon points="21,29 7,32 14,23 9,12 23,19" fill={colors.buyColor} />
          <Polygon points="25,29 41,32 34,22 39,12 25,19" fill={colors.buyColor} />
          <Polygon points="18,5 30,5 35,25 24,32 13,25" fill={colors.gradeCaution} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="19,10 21,9 22,12 20,13" fill={colors.goldMuted} />
          <Polygon points="25,9 27,9 28,12 26,12" fill={colors.goldMuted} />
          <Polygon points="21,15 23,14 24,17 22,18" fill={colors.goldMuted} />
          <Polygon points="27,14 29,14 30,17 28,18" fill={colors.goldMuted} />
          <Polygon points="23,20 25,19 26,22 24,23" fill={colors.goldMuted} />
          <Polygon points="29,19 31,19 32,22 30,23" fill={colors.goldMuted} />
        </>}
        {kind === "wheat" && <>
          <Polygon points="22,31 25,31 28,5 25,5" fill={colors.goldMuted} />
          <Polygon points="23,12 14,7 12,10 22,16" fill={colors.gradeCaution} />
          <Polygon points="24,17 33,11 35,14 25,21" fill={colors.gradeCaution} />
          <Polygon points="24,22 15,18 13,21 24,26" fill={colors.gradeCaution} />
          <Polygon points="25,27 34,21 36,24 25,31" fill={colors.gradeCaution} />
          <Polygon points="20,30 9,34 15,26 23,24" fill={colors.buyColor} />
          <Polygon points="27,30 39,34 33,25 26,24" fill={colors.buyColor} />
        </>}
        {kind === "soybeans" && <>
          <Polygon points="8,19 13,10 23,7 34,11 41,18 36,27 25,30 14,27" fill={colors.buyColor} stroke={colors.vaultBlueMuted} strokeWidth={1} />
          <Polygon points="12,19 18,12 22,17 17,24" fill={colors.gradeCaution} />
          <Polygon points="20,17 26,12 30,17 25,24" fill={colors.gradeCaution} />
          <Polygon points="28,18 34,14 37,19 32,25" fill={colors.gradeCaution} />
        </>}
        {kind === "coffee" && <>
          <Polygon points="24,4 34,8 39,16 35,26 25,32 15,28 10,20 13,10" fill={colors.goldMuted} stroke={colors.heading} strokeWidth={1} />
          <Polygon points="23,6 25,11 23,16 25,21 22,29 26,30 28,22 26,17 28,12 26,7" fill={colors.heading} />
        </>}
        {kind === "cotton" && <>
          <Polygon points="21,29 24,29 26,17 23,17" fill={colors.buyColor} />
          <Polygon points="24,7 29,9 31,15 27,20 21,19 17,14 19,9" fill={colors.foreground} />
          <Polygon points="13,14 17,11 21,14 21,20 16,23 11,20" fill={colors.heading} />
          <Polygon points="29,14 34,11 38,15 37,21 32,23 28,20" fill={colors.mutedForeground} />
          <Polygon points="19,19 24,17 29,21 28,27 22,29 17,25" fill={colors.foreground} />
        </>}
        {kind === "sugar" && <>
          <Polygon points="8,18 19,12 29,17 18,24" fill={colors.foreground} />
          <Polygon points="18,24 29,17 29,28 18,34" fill={colors.mutedForeground} />
          <Polygon points="8,18 18,24 18,34 8,28" fill={colors.heading} />
          <Polygon points="23,9 32,4 41,9 32,15" fill={colors.foreground} />
          <Polygon points="32,15 41,9 41,19 32,24" fill={colors.mutedForeground} />
          <Polygon points="23,9 32,15 32,24 23,19" fill={colors.heading} />
        </>}
        {kind === "crudeOil" && <>
          <Polygon points="14,5 34,5 38,10 36,29 12,29 10,10" fill={colors.steelShadow} stroke={colors.mutedForeground} strokeWidth={2} />
          <Polygon points="12,12 36,12 36,15 12,15" fill={colors.gold} />
          <Polygon points="12,21 36,21 36,24 12,24" fill={colors.goldMuted} />
          <Polygon points="18,7 30,7 30,10 18,10" fill={colors.heading} />
        </>}
        {kind === "naturalGas" && <>
          <Polygon points="24,3 31,13 38,19 36,27 31,32 19,32 12,26 13,18 19,12" fill={colors.gradeWarning} />
          <Polygon points="25,13 29,21 27,28 21,28 18,24 21,19" fill={colors.gradeCaution} />
        </>}
        {kind === "cattle" && <>
          <Polygon points="7,8 16,10 17,16 11,19" fill={colors.foreground} />
          <Polygon points="41,8 32,10 31,16 37,19" fill={colors.foreground} />
          <Polygon points="13,8 18,12 30,12 35,8 33,25 24,31 15,25" fill={colors.mutedForeground} stroke={colors.foreground} strokeWidth={1} />
          <Polygon points="17,22 31,22 29,29 19,29" fill={colors.heading} />
          <Polygon points="18,16 21,16 21,18 18,18" fill={colors.steelShadow} />
          <Polygon points="27,16 30,16 30,18 27,18" fill={colors.steelShadow} />
        </>}
        {kind === "hogs" && <>
          <Polygon points="11,12 11,4 20,9" fill={colors.sellColor} />
          <Polygon points="37,12 37,4 28,9" fill={colors.sellColor} />
          <Polygon points="12,13 18,9 30,9 36,13 36,24 30,30 18,30 12,24" fill={colors.gradeWarning} />
          <Polygon points="18,20 30,20 31,27 17,27" fill={colors.heading} />
          <Polygon points="20,22 22,22 22,25 20,25" fill={colors.sellColor} />
          <Polygon points="26,22 28,22 28,25 26,25" fill={colors.sellColor} />
        </>}
        {kind === "equityIndex" && <>
          <Polygon points="6,28 6,20 13,20 13,28" fill={colors.vaultBlueMuted} />
          <Polygon points="17,28 17,14 24,14 24,28" fill={colors.vaultBlue} />
          <Polygon points="28,28 28,9 35,9 35,28" fill={colors.buyColor} />
          <Polygon points="7,17 9,19 17,13 23,16 34,5 37,8 24,20 18,17 10,23" fill={colors.heading} />
        </>}
        {kind === "treasury" && <>
          <Polygon points="10,5 38,5 38,30 10,30" fill={colors.vaultBlueMuted} stroke={colors.vaultBlue} strokeWidth={2} />
          <Polygon points="15,10 33,10 33,12 15,12" fill={colors.heading} />
          <Polygon points="15,16 22,16 22,18 15,18" fill={colors.foreground} />
          <Polygon points="26,16 33,16 33,18 26,18" fill={colors.foreground} />
          <Polygon points="18,22 30,22 24,28" fill={colors.gold} />
        </>}
        {kind === "genericCommodity" && <>
          <Polygon points="8,13 24,5 40,13 24,21" fill={colors.gold} stroke={colors.goldMuted} strokeWidth={1} />
          <Polygon points="8,13 24,21 24,31 8,23" fill={colors.goldMuted} />
          <Polygon points="24,21 40,13 40,23 24,31" fill={colors.gradeWarning} />
        </>}
        {isCurrency && <>
          <Polygon points="12,3 36,3 44,12 44,24 36,33 12,33 4,24 4,12" fill={colors.goldMuted} stroke={colors.gold} strokeWidth={2} />
          <Polygon points="16,7 32,7 37,13 37,23 32,29 16,29 11,23 11,13" fill={colors.accent} />
        </>}
      </Svg>
      {isCurrency && (
        <Text style={[
          styles.currencyGlyph,
          { color: colors.heading, fontSize: kind === "canadianDollar" ? 9 : 13 },
        ]}>
          {CurrencyGlyph({ kind })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 27,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyGlyph: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 1,
    bottom: 0,
    textAlign: "center",
    textAlignVertical: "center",
    fontFamily: "Inter_700Bold",
  },
});
