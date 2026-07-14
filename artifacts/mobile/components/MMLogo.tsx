import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText, Filter, FeDropShadow } from 'react-native-svg';

interface MMLogoProps {
  size?: number;
}

export function MMLogo({ size = 60 }: MMLogoProps) {
  const topM = size * 0.48;
  const bottomM = size * 0.56;
  const totalHeight = topM + bottomM * 0.72; // overlap
  const width = size * 1.1;

  return (
    <View style={[styles.container, { width, height: totalHeight }]}>
      <Svg width={width} height={totalHeight} viewBox={`0 0 ${width} ${totalHeight}`}>
        <Defs>
          {/* Main silver metallic gradient — vertical sweep */}
          <LinearGradient id="silverMain" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#e8e8e8" stopOpacity="1" />
            <Stop offset="18%" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="35%" stopColor="#c0c0c0" stopOpacity="1" />
            <Stop offset="52%" stopColor="#8a8a8a" stopOpacity="1" />
            <Stop offset="68%" stopColor="#d4d4d4" stopOpacity="1" />
            <Stop offset="82%" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="100%" stopColor="#9a9a9a" stopOpacity="1" />
          </LinearGradient>

          {/* Darker silver for the bottom (shadow) M */}
          <LinearGradient id="silverDark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#c8c8c8" stopOpacity="1" />
            <Stop offset="20%" stopColor="#ebebeb" stopOpacity="1" />
            <Stop offset="40%" stopColor="#a0a0a0" stopOpacity="1" />
            <Stop offset="60%" stopColor="#686868" stopOpacity="1" />
            <Stop offset="80%" stopColor="#b8b8b8" stopOpacity="1" />
            <Stop offset="100%" stopColor="#787878" stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Bottom (larger) M — rendered first so top M overlaps */}
        <SvgText
          x={width / 2}
          y={totalHeight}
          textAnchor="middle"
          fontSize={bottomM}
          fontWeight="900"
          fontFamily="Arial Black, Arial, sans-serif"
          fill="url(#silverDark)"
          letterSpacing={-2}
        >
          M
        </SvgText>

        {/* Top (smaller) M */}
        <SvgText
          x={width / 2}
          y={topM * 0.92}
          textAnchor="middle"
          fontSize={topM}
          fontWeight="900"
          fontFamily="Arial Black, Arial, sans-serif"
          fill="url(#silverMain)"
          letterSpacing={-2}
        >
          M
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
