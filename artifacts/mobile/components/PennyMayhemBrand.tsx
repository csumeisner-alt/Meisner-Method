import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient as SvgGradient, Path, Pattern, Rect, Stop, Text as SvgText, Ellipse } from 'react-native-svg';

/**
 * Penny Stock Mayhem brand pieces: brushed-platinum / crimson metallic
 * title, brushed-steel "STOCKS & ETFs UNDER $20" nameplate and a metallic
 * championship trophy. Penny-only; other events never render these.
 */

const TITLE_FONT = 'Inter_700Bold';

export function PennyMayhemTitle({ testID, compact = false }: { testID?: string; compact?: boolean }) {
  // ViewBox scaling keeps the lockup enormous yet always inside its card
  // at 320/375/390. Tall font size + forced textLength = condensed poster type.
  return (
    <View style={{ width: '100%' }}>
      <View testID={testID} accessibilityRole="header" accessibilityLabel="Penny Stock" style={{ width: '100%', aspectRatio: 300 / 62 }}>
        <Svg width="100%" height="100%" viewBox="0 0 300 62">
          <Defs>
            <SvgGradient id="pm-plat" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FBFCFD" />
              <Stop offset="0.3" stopColor="#D9E0E4" />
              <Stop offset="0.48" stopColor="#7F8B94" />
              <Stop offset="0.53" stopColor="#E9EEF1" />
              <Stop offset="0.78" stopColor="#A4AFB7" />
              <Stop offset="1" stopColor="#ECF0F2" />
            </SvgGradient>
          </Defs>
          <SvgText x="150" y="55" fontFamily={TITLE_FONT} fontWeight="700" fontSize="60" textAnchor="middle" textLength="290" lengthAdjust="spacingAndGlyphs" fill="url(#pm-plat)" stroke="#5E6A72" strokeWidth={0.6}>PENNY STOCK</SvgText>
        </Svg>
      </View>
      <View accessible={false} style={{ width: '100%', aspectRatio: 300 / (compact ? 86 : 90), marginTop: 1 }}>
        <Svg width="100%" height="100%" viewBox={`0 0 300 ${compact ? 86 : 90}`}>
          <Defs>
            <SvgGradient id="pm-crim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF9AA0" />
              <Stop offset="0.22" stopColor="#F2323F" />
              <Stop offset="0.5" stopColor="#B10C1C" />
              <Stop offset="0.56" stopColor="#E92636" />
              <Stop offset="0.85" stopColor="#7E0713" />
              <Stop offset="1" stopColor="#C81C2B" />
            </SvgGradient>
          </Defs>
          <SvgText x="151" y={compact ? 83 : 87} fontFamily={TITLE_FONT} fontWeight="700" fontSize="94" textAnchor="middle" textLength="290" lengthAdjust="spacingAndGlyphs" fill="#14040A" opacity={0.6}>MAYHEM</SvgText>
          <SvgText x="150" y={compact ? 81 : 85} fontFamily={TITLE_FONT} fontWeight="700" fontSize="94" textAnchor="middle" textLength="290" lengthAdjust="spacingAndGlyphs" fill="url(#pm-crim)" stroke="#FF8A92" strokeOpacity={0.35} strokeWidth={0.7}>MAYHEM</SvgText>
        </Svg>
        <Text style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>MAYHEM</Text>
      </View>
    </View>
  );
}

export function PennyMayhemNameplate({ testID, compact = false }: { testID?: string; compact?: boolean }) {
  return (
    <View
      testID={testID}
      accessibilityLabel="Stocks and ETFs under $20"
      style={{ width: '100%', aspectRatio: 300 / 64, marginTop: compact ? 6 : 9 }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 300 64">
        <Defs>
          <SvgGradient id="pm-steel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E7ECEA" />
            <Stop offset="0.45" stopColor="#A9B3AF" />
            <Stop offset="0.55" stopColor="#8D9894" />
            <Stop offset="1" stopColor="#C9D1CD" />
          </SvgGradient>
          <SvgGradient id="pm-sheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.38" stopColor="#FFFFFF" stopOpacity="0.32" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.12" />
          </SvgGradient>
          <SvgGradient id="pm-ink" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1E2724" />
            <Stop offset="1" stopColor="#0B120F" />
          </SvgGradient>
          <Pattern id="pm-grain" width="300" height="3" patternUnits="userSpaceOnUse">
            <Rect x="0" y="0" width="300" height="1" fill="#FFFFFF" opacity={0.16} />
            <Rect x="0" y="2" width="300" height="0.6" fill="#36403C" opacity={0.14} />
          </Pattern>
        </Defs>
        {/* emerald rim */}
        <Rect x="0.75" y="0.75" width="298.5" height="62.5" rx="4" fill="#0A2418" stroke="#2FA56A" strokeOpacity={0.75} strokeWidth={1.5} />
        {/* steel plate */}
        <Rect x="3" y="3" width="294" height="58" rx="2.5" fill="url(#pm-steel)" />
        <Rect x="3" y="3" width="294" height="58" rx="2.5" fill="url(#pm-grain)" />
        <Rect x="3" y="3" width="294" height="58" rx="2.5" fill="url(#pm-sheen)" />
        <Path d="M5.5 3.8 H294.5" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={0.8} />
        <Path d="M5.5 60.2 H294.5" stroke="#4C5753" strokeOpacity={0.9} strokeWidth={0.9} />
        {/* rivets */}
        {[[10, 10], [290, 10], [10, 54], [290, 54]].map(([cx, cy]) => (
          <G key={`${cx}-${cy}`}>
            <Ellipse cx={cx} cy={cy} rx="2.3" ry="2.3" fill="#6E7975" />
            <Ellipse cx={cx - 0.5} cy={cy - 0.6} rx="1.3" ry="1.3" fill="#F1F4F2" />
          </G>
        ))}
        {/* engraved copy */}
        <SvgText x="19" y="40.5" fontFamily={TITLE_FONT} fontWeight="700" fontSize="17" textLength="176" lengthAdjust="spacingAndGlyphs" fill="#FFFFFF" opacity={0.7}>STOCKS &amp; ETFs UNDER</SvgText>
        <SvgText x="18" y="39.5" fontFamily={TITLE_FONT} fontWeight="700" fontSize="17" textLength="176" lengthAdjust="spacingAndGlyphs" fill="url(#pm-ink)">STOCKS &amp; ETFs UNDER</SvgText>
        <Path d="M204 12 V52" stroke="#5F6A66" strokeWidth={0.8} />
        <Path d="M205 12 V52" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={0.8} />
        <SvgText x="249" y="51" fontFamily={TITLE_FONT} fontWeight="700" fontSize="44" textAnchor="middle" textLength="78" lengthAdjust="spacingAndGlyphs" fill="#FFFFFF" opacity={0.7}>$20</SvgText>
        <SvgText x="248" y="50" fontFamily={TITLE_FONT} fontWeight="700" fontSize="44" textAnchor="middle" textLength="78" lengthAdjust="spacingAndGlyphs" fill="url(#pm-ink)" stroke="#0E5A35" strokeOpacity={0.55} strokeWidth={0.6}>$20</SvgText>
      </Svg>
      <Text style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>STOCKS &amp; ETFs UNDER $20</Text>
    </View>
  );
}

export function PennyMayhemTrophy({ size = 96 }: { size?: number }) {
  return (
    <View accessible={false} style={{ width: size, height: size }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <SvgGradient id="pt-gold" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7A5A1E" />
            <Stop offset="0.22" stopColor="#E9CB7A" />
            <Stop offset="0.4" stopColor="#FFF3C8" />
            <Stop offset="0.6" stopColor="#C99A3F" />
            <Stop offset="0.85" stopColor="#8E6A26" />
            <Stop offset="1" stopColor="#D9B762" />
          </SvgGradient>
          <SvgGradient id="pt-plinth" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2C3A33" />
            <Stop offset="1" stopColor="#0D1612" />
          </SvgGradient>
          <SvgGradient id="pt-emerald" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#0E5A35" />
            <Stop offset="0.5" stopColor="#3FCB84" />
            <Stop offset="1" stopColor="#0E5A35" />
          </SvgGradient>
        </Defs>
        <Ellipse cx="50" cy="93" rx="30" ry="3" fill="#000000" opacity={0.35} />
        {/* handles */}
        <Path d="M27 20 C12 20 12 44 33 47" stroke="url(#pt-gold)" strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d="M73 20 C88 20 88 44 67 47" stroke="url(#pt-gold)" strokeWidth={4} fill="none" strokeLinecap="round" />
        {/* cup */}
        <Path d="M25 12 H75 V22 C75 41 64 53 50 54 C36 53 25 41 25 22 Z" fill="url(#pt-gold)" stroke="#6A4C16" strokeWidth={0.8} />
        <Ellipse cx="50" cy="12" rx="25" ry="3.2" fill="#FFF0BE" stroke="#8E6A26" strokeWidth={0.6} />
        <Path d="M33 18 C33 34 38 44 44 48" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        <Rect x="27" y="25" width="46" height="2.4" fill="url(#pt-emerald)" opacity={0.9} />
        {/* stem + knot */}
        <Path d="M46 54 H54 L53 66 H47 Z" fill="url(#pt-gold)" />
        <Ellipse cx="50" cy="60" rx="6.5" ry="2.4" fill="url(#pt-gold)" stroke="#6A4C16" strokeWidth={0.5} />
        <Path d="M38 66 H62 L65 72 H35 Z" fill="url(#pt-gold)" stroke="#6A4C16" strokeWidth={0.5} />
        {/* plinth */}
        <Rect x="30" y="72" width="40" height="18" rx="1.5" fill="url(#pt-plinth)" stroke="#C99A3F" strokeWidth={0.8} />
        <Rect x="30" y="78.5" width="40" height="1.6" fill="url(#pt-emerald)" />
        <Path d="M31 73 H69" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={0.6} />
      </Svg>
    </View>
  );
}
