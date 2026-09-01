import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Line,
  Path,
  Stop,
  Image as SvgImage,
  Text as SvgText,
} from 'react-native-svg';
import type { ColorScheme } from '@/constants/colors';
import type { BrewActionResult } from '@/hooks/useBrewTokens';
import {
  BREW_BANK_KEY_PRICE,
  DAIQUIRI_BOTTLE_PRICE,
  DAIQUIRI_LOSS_PROBABILITY,
  DAIQUIRI_PAYOUT_MULTIPLIER,
  DAIQUIRI_UNLOCK_PRICE,
  DAIQUIRI_WIN_PROBABILITY,
  QUICK_REVIVE_BOTTLE_PRICE,
  QUICK_REVIVE_UNLOCK_PRICE,
  SMART_PRO_BOTTLE_PRICE,
  SMART_PRO_SALE_DURATION_MS,
  SMART_PRO_UNLOCK_PRICE,
  STAMIN_UP_BOTTLE_PRICE,
  STAMIN_UP_UNLOCK_PRICE,
  BREW_TOKEN_WIN_PROBABILITY,
  NEON_GUCCI_PHRASE_PACK_PRICE,
  type BrewBottlePreviewKind,
  type BrewBetEffect,
  formatBrewBankAccessRemaining,
  formatSmartProRemaining,
  getBrewBottleInspection,
  getDaiquiriWinProbability,
  getBrewWinProbability,
  hasBrewBankAccess,
  getSmartProBottleSalePrice,
  hasSmartProSale,
  isWeekday,
  getNeonGucciPhrasePackDisplay,
} from '@/lib/brewTokenLogic';

const DAIQUIRI_WIN_PERCENT = Math.round(DAIQUIRI_WIN_PROBABILITY * 100);
const DAIQUIRI_LOSS_PERCENT = Math.round(DAIQUIRI_LOSS_PROBABILITY * 100);
const DAIQUIRI_ODDS_LABEL = `${DAIQUIRI_WIN_PERCENT}% WIN · ${DAIQUIRI_LOSS_PERCENT}% LOSS`;
const DAIQUIRI_DESCRIPTION = `Crack one into the machine before a toss: ${DAIQUIRI_WIN_PERCENT}% win odds, ${DAIQUIRI_LOSS_PERCENT}% loss odds, and a double award if it pays.`;
const STAMIN_UP_WIN_PERCENT = Math.round(BREW_TOKEN_WIN_PROBABILITY * 100);
const SHOP_ACTION_COOLDOWN_MS = 350;

const getActionFailureMessage = (result: BrewActionResult, unavailableMessage: string) =>
  result.ok
    ? null
    : result.reason === 'save_failed'
      ? 'COULD NOT SAVE CHANGE · TRY AGAIN'
      : unavailableMessage;

export function BrewCoin({ colors, size = 66 }: { colors: ColorScheme; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 66 66" accessibilityLabel="Gold Brew Token with beer outline">
      <Circle cx="33" cy="33" r="29" fill={colors.goldMuted} opacity={0.35} />
      <Circle cx="33" cy="33" r="25" fill={colors.gold} stroke={colors.foreground} strokeOpacity={0.55} strokeWidth="1.5" />
      <Circle cx="33" cy="33" r="20" fill="none" stroke={colors.primaryForeground} strokeOpacity={0.32} strokeWidth="1" />
      <Path d="M24 27h15v13H24z" fill="none" stroke={colors.primaryForeground} strokeWidth="2" />
      <Path d="M39 30h3.5a3 3 0 0 1 0 6H39" fill="none" stroke={colors.primaryForeground} strokeWidth="2" />
      <Path d="M24 31h15M27 23v4M31 23v4M35 23v4" fill="none" stroke={colors.primaryForeground} strokeWidth="2" strokeLinecap="round" />
      <Line x1="27" y1="44" x2="39" y2="44" stroke={colors.primaryForeground} strokeOpacity={0.5} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function QuickReviveBottle({ size = 54, muted = false }: { size?: number; muted?: boolean }) {
  const prefix = `quick-revive-${size}-${muted ? 'muted' : 'live'}`;
  const glass = muted ? '#617b8a' : '#b6f5ff';
  const glassDeep = muted ? '#273b4b' : '#061c35';
  const liquidBright = muted ? '#587b92' : '#c8ffff';
  const liquid = muted ? '#345a75' : '#159ed7';
  const label = muted ? '#274d68' : '#0873aa';
  const labelInk = muted ? '#90a5af' : '#edffff';
  const cap = muted ? '#263d50' : '#061c37';
  return (
    <Svg width={size} height={size * 1.96} viewBox="0 0 260 510" accessibilityLabel="Quick Revive glowing cyan soda bottle">
      <Defs>
        <SvgLinearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <Stop stopColor={glassDeep} />
          <Stop offset="0.2" stopColor={muted ? '#315b70' : '#165b7d'} />
          <Stop offset="0.43" stopColor={muted ? '#1b3b53' : '#092f53'} />
          <Stop offset="0.74" stopColor={muted ? '#112b40' : '#06213e'} />
          <Stop offset="1" stopColor={muted ? '#456d7f' : '#5aa7c1'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor={liquidBright} />
          <Stop offset="0.2" stopColor={muted ? '#3f9bb8' : '#5be3ff'} />
          <Stop offset="0.62" stopColor={liquid} />
          <Stop offset="1" stopColor={muted ? '#214c6a' : '#075589'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-cap`} x1="0" x2="1" y1="0" y2="1">
          <Stop stopColor={muted ? '#172b3d' : '#020b1c'} />
          <Stop offset="0.42" stopColor={muted ? '#2c5870' : '#123b5d'} />
          <Stop offset="0.68" stopColor={cap} />
          <Stop offset="1" stopColor={muted ? '#0e1d2d' : '#010914'} />
        </SvgLinearGradient>
        <ClipPath id={`${prefix}-liquid-clip`}>
          <Path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" />
        </ClipPath>
      </Defs>
      <Path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill={`url(#${prefix}-glass)`} stroke={glass} strokeOpacity={muted ? 0.42 : 0.76} strokeWidth="3" />
      <Path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill={glassDeep} fillOpacity={muted ? 0.58 : 0.42} />
      <Path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill={`url(#${prefix}-liquid)`} fillOpacity={muted ? 0.52 : 0.96} />
      <G clipPath={`url(#${prefix}-liquid-clip)`}>
        {[
          [58, 424, 3.5], [78, 391, 2.4], [101, 448, 3], [124, 410, 4],
          [151, 438, 2.6], [173, 370, 2.2], [190, 426, 3.3], [86, 345, 2],
          [117, 362, 2.8], [143, 332, 1.8], [69, 454, 1.7], [181, 391, 2],
        ].map(([cx, cy, r], index) => (
          <Circle key={index} cx={cx} cy={cy} r={r} fill="#eaffff" fillOpacity={muted ? 0.22 : 0.72} />
        ))}
      </G>
      <Path d="M102 72c-8 54-6 102-6 157v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V213c0-57-2-101 8-146Z" fill="#dcffff" fillOpacity={muted ? 0.06 : 0.12} />
      <G opacity={muted ? 0.56 : 1}>
        <Path d="M98 106h64v39H98Z" fill="#075b91" fillOpacity={muted ? 0.7 : 0.94} stroke="#a5f5ff" strokeOpacity={muted ? 0.3 : 0.56} strokeWidth="1.5" />
        <Path d="M102 110h56v31h-56Z" fill="#0b77ad" fillOpacity={muted ? 0.26 : 0.42} stroke="#d9ffff" strokeOpacity="0.2" />
        <Circle cx="130" cy="125.5" r="12.5" fill="#f0ffff" fillOpacity={muted ? 0.08 : 0.14} stroke="#d8ffff" strokeOpacity={muted ? 0.34 : 0.64} strokeWidth="1.3" />
        <Path d="M126 119h8v3l2.5 3.5v8c0 2-2.3 3.4-6.5 3.4s-6.5-1.4-6.5-3.4v-8L126 122v-3Z" fill="none" stroke={labelInk} strokeOpacity="0.9" strokeWidth="1.2" />
        <Path d="M124 126h12M127 121h6" stroke={labelInk} strokeOpacity="0.8" strokeWidth="1" strokeLinecap="round" />
      </G>
      <G opacity={muted ? 0.58 : 1}>
        <Circle cx="130" cy="322" r="80" fill="#dfffff" fillOpacity={muted ? 0.48 : 0.94} stroke="#b7f8ff" strokeWidth="2" />
        <Circle cx="130" cy="322" r="72" fill={label} stroke="#dfffff" strokeOpacity="0.58" strokeWidth="2.5" />
        <SvgText x="130" y="280" fill={labelInk} fontSize="13" fontWeight="700" textAnchor="middle" letterSpacing="1.2">REVIVE</SvgText>
        <Path d="M118 301h24v7l4 5v27c0 5-5.4 9-16 9s-16-4-16-9v-27l4-5v-7Z" fill="none" stroke={labelInk} strokeOpacity="0.96" strokeWidth="2" />
        <Path d="M118 316h24M123 306h14M125 328h10M130 321v14" fill="none" stroke={labelInk} strokeOpacity="0.94" strokeWidth="1.7" strokeLinecap="round" />
        <SvgText x="130" y="373" fill={labelInk} fontSize="12" fontWeight="600" textAnchor="middle" letterSpacing="2.4">SODA</SvgText>
      </G>
      <G>
        <Path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={`url(#${prefix}-cap)`} stroke="#8fdff3" strokeOpacity={muted ? 0.28 : 0.72} strokeWidth="2" />
        <Path d="M101 34h58" stroke="#d8fbff" strokeOpacity={muted ? 0.1 : 0.22} strokeWidth="2" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function DaiquiriBottle({ size = 54, muted = false }: { size?: number; muted?: boolean }) {
  const prefix = `daiquiri-${size}-${muted ? 'muted' : 'live'}`;
  const glass = muted ? '#5c6b78' : '#b9eaff';
  const glassDeep = muted ? '#273b4b' : '#08192f';
  const yellow = muted ? '#6e6940' : '#f6d64a';
  const yellowBright = muted ? '#8b7944' : '#ffe979';
  const blue = muted ? '#304b60' : '#123d69';
  const cap = muted ? '#273442' : '#061429';
  const daiquiriLabel = require('../assets/daiquiri/dave-ramsey-label.png');
  const daiquiriNeckLabel = require('../assets/daiquiri/dave-ramsey-neck-label.png');
  return (
    <Svg width={size} height={size * 1.96} viewBox="0 0 260 510" accessibilityLabel="Dave Ramsey Daiquiri navy and gold collectible bottle with sparkling yellow liquid">
      <Defs>
        <SvgLinearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <Stop offset="0" stopColor={glassDeep} />
          <Stop offset="0.22" stopColor="#234f75" />
          <Stop offset="0.5" stopColor={glassDeep} />
          <Stop offset="0.78" stopColor="#0b2948" />
          <Stop offset="1" stopColor="#547991" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor={yellowBright} />
          <Stop offset="0.28" stopColor={yellow} />
          <Stop offset="0.72" stopColor="#c58b25" />
          <Stop offset="1" stopColor="#ffe878" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-label`} x1="0" x2="1">
          <Stop stopColor="#061a36" />
          <Stop offset="0.5" stopColor={blue} />
          <Stop offset="1" stopColor="#06152b" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-cap`} x1="0" x2="1" y1="0" y2="1">
          <Stop stopColor={muted ? '#4c3714' : '#6f5016'} />
          <Stop offset="0.22" stopColor={muted ? '#9a7832' : '#f9df76'} />
          <Stop offset="0.5" stopColor={muted ? '#aa8b45' : '#fff1a1'} />
          <Stop offset="0.76" stopColor={muted ? '#76551f' : '#c89b32'} />
          <Stop offset="1" stopColor={muted ? '#3d2a0d' : '#624411'} />
        </SvgLinearGradient>
        <ClipPath id={`${prefix}-liquid-clip`}>
          <Path d="M70 202h120v246c0 25-24 42-60 42s-60-17-60-42V202Z" />
        </ClipPath>
      </Defs>
      <Path d="M83 30h94v43l19 31v320c0 50-28 73-66 73s-66-23-66-73V104l19-31V30Z" fill={`url(#${prefix}-glass)`} stroke={glass} strokeOpacity={muted ? 0.45 : 0.78} strokeWidth="3" />
      <Path d="M93 35h74v43l17 30v314c0 39-20 58-54 58s-54-19-54-58V108l17-30V35Z" fill="#06182d" fillOpacity={muted ? 0.62 : 0.28} />
      <Path d="M70 202h120v246c0 25-24 42-60 42s-60-17-60-42V202Z" fill={`url(#${prefix}-liquid)`} opacity={muted ? 0.46 : 0.95} clipPath={`url(#${prefix}-liquid-clip)`} />
      <G clipPath={`url(#${prefix}-liquid-clip)`}>
        <Path d="M53 238c33-21 75 10 154-17v225H53Z" fill="#ffec7d" fillOpacity={muted ? 0.1 : 0.3} />
        {[
          [88, 357, 4], [109, 296, 3], [127, 386, 4], [147, 332, 3], [166, 374, 5],
          [101, 414, 2.5], [151, 421, 3], [119, 249, 2.5], [138, 282, 2], [176, 301, 2.5],
        ].map(([cx, cy, r], index) => (
          <Circle key={index} cx={cx} cy={cy} r={r} fill="#fff4a1" fillOpacity={muted ? 0.22 : 0.78} />
        ))}
      </G>
      <SvgImage
        href={daiquiriNeckLabel}
        x="91"
        y="105"
        width="78"
        height="40"
        opacity={muted ? 0.5 : 1}
        preserveAspectRatio="xMidYMid slice"
      />
      <SvgImage
        href={daiquiriLabel}
        x="51"
        y="220"
        width="158"
        height="205"
        opacity={muted ? 0.48 : 0.98}
        preserveAspectRatio="xMidYMid slice"
      />
      <Path d="M51 322c0-57 35-103 79-103s79 46 79 103-35 103-79 103-79-46-79-103Z" fill="none" stroke={yellowBright} strokeOpacity={muted ? 0.28 : 0.72} strokeWidth="2" />
      <Path d="M99 46c-12 36-7 80-7 122v221c0 45 11 70 21 78" fill="none" stroke="#dff8ff" strokeOpacity={muted ? 0.24 : 0.7} strokeWidth="5" strokeLinecap="round" />
      <Path d="M157 52c13 33 8 72 9 116" fill="none" stroke="#fff" strokeOpacity={muted ? 0.14 : 0.42} strokeWidth="3" strokeLinecap="round" />
      <Path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={`url(#${prefix}-cap)`} stroke="#fff0a0" strokeOpacity={muted ? 0.32 : 0.9} strokeWidth="2" />
      <Circle cx="130" cy="38" r="10" fill={muted ? '#8c6e2d' : '#e4b843'} stroke={muted ? '#25394b' : '#0a2242'} strokeWidth="1.5" />
      <SvgText x="130" y="44" textAnchor="middle" fill={muted ? '#25394b' : '#0a2242'} fontSize="13" fontWeight="700">R</SvgText>
      <Path d="M86 50h88" stroke={muted ? '#70551f' : '#a77a25'} strokeWidth="5" opacity={muted ? 0.25 : 0.7} />
    </Svg>
  );
}

function StaminUpBottle({ size = 54, muted = false }: { size?: number; muted?: boolean }) {
  const prefix = `stamin-up-${size}-${muted ? 'muted' : 'live'}`;
  const glass = muted ? '#85755d' : '#ffd38c';
  const glassDeep = muted ? '#4b2a13' : '#211006';
  const liquid = muted ? '#7f5426' : '#c45d12';
  const liquidBright = muted ? '#b18a51' : '#ffd779';
  const highlight = muted ? '#9f7e47' : '#ffd66c';
  const cap = muted ? '#786443' : '#fff0a0';
  return (
    <Svg width={size} height={size * 1.96} viewBox="0 0 260 510" accessibilityLabel="Stamin Up premium amber glass soda bottle">
      <Defs>
        <SvgLinearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <Stop stopColor={glassDeep} />
          <Stop offset="0.18" stopColor={muted ? '#5b3215' : '#7a3c14'} />
          <Stop offset="0.42" stopColor={muted ? '#2e1709' : '#3f1b08'} />
          <Stop offset="0.72" stopColor={muted ? '#211006' : '#281006'} />
          <Stop offset="1" stopColor={muted ? '#76502a' : '#b16a27'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor={liquidBright} />
          <Stop offset="0.2" stopColor={muted ? '#bb7731' : '#f5a32c'} />
          <Stop offset="0.6" stopColor={liquid} />
          <Stop offset="1" stopColor={muted ? '#4a1c0b' : '#70260d'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-cap`} x1="0" x2="1" y1="0" y2="1">
          <Stop stopColor={muted ? '#513712' : '#7d4a12'} />
          <Stop offset="0.22" stopColor={muted ? '#9b7430' : '#f8cf5d'} />
          <Stop offset="0.5" stopColor={cap} />
          <Stop offset="0.78" stopColor={muted ? '#76501a' : '#c18722'} />
          <Stop offset="1" stopColor={muted ? '#42280b' : '#6a3d0b'} />
        </SvgLinearGradient>
        <ClipPath id={`${prefix}-liquid-clip`}>
          <Path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" />
        </ClipPath>
      </Defs>
      <Path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill={`url(#${prefix}-glass)`} stroke={glass} strokeOpacity={muted ? 0.44 : 0.78} strokeWidth="3" />
      <Path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill={glassDeep} fillOpacity={muted ? 0.58 : 0.38} />
      <Path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill={`url(#${prefix}-liquid)`} fillOpacity={muted ? 0.55 : 0.96} />
      <G clipPath={`url(#${prefix}-liquid-clip)`}>
        {[
          [58, 432, 3.2], [79, 393, 2.3], [101, 449, 3.5], [124, 408, 2.7],
          [150, 437, 3.1], [177, 382, 2.1], [193, 424, 3.5], [86, 355, 2.2],
          [117, 372, 2.8], [144, 339, 1.8], [70, 461, 1.6], [181, 403, 2],
        ].map(([cx, cy, r], index) => (
          <Circle key={index} cx={cx} cy={cy} r={r} fill="#fff0b0" fillOpacity={muted ? 0.2 : 0.66} />
        ))}
      </G>
      <Path d="M103 70c-8 55-6 104-6 158v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V212c0-56-2-101 8-145Z" fill="#fff0bd" fillOpacity={muted ? 0.06 : 0.1} />
      <G opacity={muted ? 0.62 : 1}>
        <Path d="M98 106h64v39H98Z" fill="#132c43" fillOpacity="0.94" stroke="#f2bd55" strokeOpacity={muted ? 0.36 : 0.76} strokeWidth="1.5" />
        <Path d="M102 110h56v31h-56Z" fill="#214968" fillOpacity={muted ? 0.26 : 0.46} stroke="#ffe2a1" strokeOpacity="0.2" />
        <Circle cx="130" cy="125.5" r="12.5" fill="#f6c65b" fillOpacity={muted ? 0.2 : 0.45} stroke="#ffe5a1" strokeOpacity={muted ? 0.38 : 0.8} strokeWidth="1.3" />
        <Path d="M130 116v19M123 125.5h14" stroke="#172b3c" strokeOpacity="0.92" strokeWidth="2.2" strokeLinecap="round" />
        <Circle cx="130" cy="125.5" r="4" fill="none" stroke="#172b3c" strokeOpacity="0.72" strokeWidth="1" />
        <Path d="M104 111h52" stroke="#fff0bd" strokeOpacity="0.2" strokeWidth="1.5" strokeLinecap="round" />
      </G>
      <G opacity={muted ? 0.62 : 1}>
        <Circle cx="130" cy="322" r="80" fill="#ffe4a0" fillOpacity={muted ? 0.48 : 0.94} stroke="#fff0bd" strokeWidth="2" />
        <Circle cx="130" cy="322" r="72" fill="#16324a" stroke="#f8c95f" strokeOpacity={muted ? 0.38 : 0.9} strokeWidth="3" />
        <SvgText x="130" y="280" fill="#ffe7aa" fontSize="12" fontWeight="700" textAnchor="middle" letterSpacing="1.1">STAMIN UP</SvgText>
        <G>
          <Path d="M103 303c10-12 43-14 54 0 5 7-3 14-17 15-13 1-23 3-23 10 0 8 12 10 21 10 13 0 18 4 15 10-3 7-11 11-18 14" fill="none" stroke="#ffd66c" strokeWidth="4.2" strokeLinecap="round" />
          <Path d="M108 305c10 5 30 5 44 0M115 319c8 4 20 4 29 0M122 333c5 3 11 3 16 0M127 349h7" fill="none" stroke="#fff0bb" strokeOpacity="0.86" strokeWidth="2.2" strokeLinecap="round" />
        </G>
        <Path d="M113 350c10 5 24 5 34 0" fill="none" stroke="#f5c65b" strokeOpacity="0.62" strokeWidth="1.5" strokeLinecap="round" />
      </G>
      <G>
        <Path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={`url(#${prefix}-cap)`} stroke="#fff0bd" strokeOpacity={muted ? 0.3 : 0.8} strokeWidth="2" />
        <Path d="M101 34h58" stroke="#fff8cf" strokeOpacity={muted ? 0.1 : 0.28} strokeWidth="2" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function SmartProBottle({ size = 54, muted = false }: { size?: number; muted?: boolean }) {
  const prefix = `smart-pro-${size}-${muted ? 'muted' : 'live'}`;
  const glass = muted ? '#718878' : '#ddffd0';
  const glassDeep = muted ? '#183426' : '#071c17';
  const liquid = muted ? '#567b35' : '#a8f52b';
  const liquidBright = muted ? '#91b96b' : '#f2ffd0';
  const green = muted ? '#668c43' : '#b9ff45';
  const blue = muted ? '#38516a' : '#1e5b9b';
  const label = muted ? '#253f36' : '#092c3c';
  const ink = muted ? '#a6b8a8' : '#f7fff0';
  return (
    <Svg width={size} height={size * 1.96} viewBox="0 0 260 510" accessibilityLabel="SmartPro Soda glowing lime-green bottle">
      <Defs>
        <SvgLinearGradient id={`${prefix}-glass`} x1="0" x2="1">
          <Stop stopColor={glassDeep} />
          <Stop offset="0.2" stopColor={muted ? '#315542' : '#2c7d45'} />
          <Stop offset="0.46" stopColor={muted ? '#163525' : '#0c3a2b'} />
          <Stop offset="0.76" stopColor={muted ? '#10271c' : '#09251d'} />
          <Stop offset="1" stopColor={muted ? '#56745b' : '#96d86d'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor={liquidBright} />
          <Stop offset="0.2" stopColor={muted ? '#86b55b' : '#d9ff65'} />
          <Stop offset="0.62" stopColor={liquid} />
          <Stop offset="1" stopColor={muted ? '#315b2c' : '#51a51f'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${prefix}-cap`} x1="0" x2="1" y1="0" y2="1">
          <Stop stopColor={muted ? '#263a4a' : '#173f74'} />
          <Stop offset="0.42" stopColor={muted ? '#426a8a' : '#4fa0de'} />
          <Stop offset="0.68" stopColor={blue} />
          <Stop offset="1" stopColor={muted ? '#172a3a' : '#0d2d59'} />
        </SvgLinearGradient>
        <ClipPath id={`${prefix}-liquid-clip`}>
          <Path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" />
        </ClipPath>
      </Defs>
      <Path d="M92 29h76v47c0 20 5 34 14 47l24 34c8 12 12 26 12 42v239c0 34-32 52-88 52s-88-18-88-52V199c0-16 4-30 12-42l24-34c9-13 14-27 14-47V29Z" fill={`url(#${prefix}-glass)`} stroke={glass} strokeOpacity={muted ? 0.42 : 0.86} strokeWidth="3" />
      <Path d="M99 34h62v43c0 22 5 37 15 51l22 32c6 10 9 22 9 35v239c0 25-25 40-77 40s-77-15-77-40V195c0-13 3-25 9-35l22-32c10-14 15-29 15-51V34Z" fill={glassDeep} fillOpacity={muted ? 0.6 : 0.34} />
      <Path d="M46 202h168v236c0 34-29 54-84 54s-84-20-84-54V202Z" fill={`url(#${prefix}-liquid)`} fillOpacity={muted ? 0.5 : 0.97} />
      <G clipPath={`url(#${prefix}-liquid-clip)`}>
        <Path d="M42 245c45-18 88 12 177-20v220H42Z" fill="#f4ffd4" fillOpacity={muted ? 0.08 : 0.25} />
        {[
          [58, 424, 3.5], [78, 391, 2.4], [101, 448, 3], [124, 410, 4],
          [151, 438, 2.6], [173, 370, 2.2], [190, 426, 3.3], [86, 345, 2],
          [117, 362, 2.8], [143, 332, 1.8], [69, 454, 1.7], [181, 391, 2],
        ].map(([cx, cy, r], index) => (
          <Circle key={index} cx={cx} cy={cy} r={r} fill="#f4ffd9" fillOpacity={muted ? 0.2 : 0.78} />
        ))}
      </G>
      <Path d="M103 70c-8 55-6 104-6 158v183c0 28 8 51 18 67l11-5c-10-22-14-41-14-66V212c0-56-2-101 8-145Z" fill="#f4ffe9" fillOpacity={muted ? 0.06 : 0.17} />
      <G opacity={muted ? 0.58 : 1}>
        <Path d="M98 106h64v39H98Z" fill={label} stroke={green} strokeOpacity={muted ? 0.3 : 0.74} strokeWidth="1.5" />
        <Path d="M102 110h56v31h-56Z" fill="#2e7b49" fillOpacity={muted ? 0.22 : 0.44} stroke={ink} strokeOpacity="0.2" />
        <SvgText x="130" y="133" fill={ink} fontSize="23" fontWeight="900" textAnchor="middle">S</SvgText>
      </G>
      <G opacity={muted ? 0.58 : 1}>
        <Circle cx="130" cy="322" r="80" fill="#e8ffd4" fillOpacity={muted ? 0.38 : 0.96} stroke={green} strokeWidth="2" />
        <Circle cx="130" cy="322" r="72" fill={label} stroke="#dcffc0" strokeOpacity="0.65" strokeWidth="2.5" />
        <Circle cx="130" cy="322" r="50" fill="none" stroke={green} strokeOpacity="0.7" strokeWidth="1.5" />
        <SvgText x="130" y="283" fill={ink} fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="1.4">SMARTPRO</SvgText>
        <SvgText x="130" y="350" fill={green} fontSize="62" fontWeight="900" textAnchor="middle">S</SvgText>
        <SvgText x="130" y="375" fill={ink} fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="2.2">SODA</SvgText>
      </G>
      <G>
        <Path d="M88 27h84v17c0 8-7 13-16 13h-52c-9 0-16-5-16-13V27Z" fill={`url(#${prefix}-cap)`} stroke="#b9e7ff" strokeOpacity={muted ? 0.3 : 0.86} strokeWidth="2" />
        <Path d="M101 34h58" stroke="#e8f6ff" strokeOpacity={muted ? 0.1 : 0.34} strokeWidth="2" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

type Props = {
  visible: boolean;
  colors: ColorScheme;
  tokens: number;
  quotesViewed: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  bankKeys: number;
  bankAccessExpiresAt: number | null;
  quickReviveUnlocked: boolean;
  quickReviveBottles: number;
  quickReviveArmed: boolean;
  daiquiriUnlocked: boolean;
  daiquiriBottles: number;
  daiquiriArmed: boolean;
  staminUpUnlocked: boolean;
  staminUpBottles: number;
  staminUpArmed: boolean;
  smartProUnlocked: boolean;
  smartProBottles: number;
  smartProSaleExpiresAt: number | null;
  darkBrewTokens: number;
  neonGucciPhrasesUnlocked: boolean;
  neonGucciPhrasesActive: boolean;
  activityLog: Array<{
    id: string;
    kind: string;
    label: string;
    detail: string;
    createdAt: number;
  }>;
  onClose: () => void;
  onResolveBet: (bet: number, won: boolean, effect?: BrewBetEffect) => Promise<void>;
  onSoundEnabledChange: (value: boolean) => Promise<void>;
  onHapticsEnabledChange: (value: boolean) => Promise<void>;
  onBuyBankKey: () => Promise<BrewActionResult>;
  onActivateBankKey: () => Promise<BrewActionResult>;
  onUnlockQuickRevive: () => Promise<BrewActionResult>;
  onBuyQuickReviveBottle: () => Promise<BrewActionResult>;
  onRedeemQuickRevive: () => Promise<BrewActionResult>;
  onUnlockDaiquiri: () => Promise<BrewActionResult>;
  onBuyDaiquiriBottle: () => Promise<BrewActionResult>;
  onRedeemDaiquiri: () => Promise<BrewActionResult>;
  onUnlockStaminUp: () => Promise<BrewActionResult>;
  onBuyStaminUpBottle: () => Promise<BrewActionResult>;
  onRedeemStaminUp: () => Promise<BrewActionResult>;
  onUnlockSmartPro: () => Promise<BrewActionResult>;
  onBuySmartProBottle: () => Promise<BrewActionResult>;
  onRedeemSmartPro: () => Promise<BrewActionResult>;
  onUnlockNeonGucciPhrases: () => Promise<BrewActionResult>;
  onSetNeonGucciPhrasesActive: (value: boolean) => Promise<BrewActionResult>;
};

type AudioPlayerHandle = {
  play: () => void;
  remove: () => void;
  isLoaded?: boolean;
  addListener?: (
    eventName: 'playbackStatusUpdate',
    listener: (status: { isLoaded?: boolean }) => void,
  ) => { remove: () => void };
};

function waitForAudioPlayerLoaded(player: AudioPlayerHandle, timeoutMs = 2_500): Promise<boolean> {
  if (player.isLoaded) return Promise.resolve(true);
  if (!player.addListener) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscription: { remove: () => void } | undefined;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      resolve(loaded);
    };

    subscription = player.addListener!('playbackStatusUpdate', (status) => {
      if (status.isLoaded) finish(true);
    });
    timeout = setTimeout(() => finish(false), timeoutMs);
  });
}

type BottleBurstKind = BrewBottlePreviewKind;
type BottleBurstLocation = 'vault' | 'preview';

type LossPhrase = {
  text: string;
  source: number;
  durationMs: number;
  protectedFromDismiss?: boolean;
};

type DaiquiriVoiceClip = {
  source: number;
  durationMs: number;
};

// These recordings are bundled from the supplied vault-voice session. Keeping
// them local makes loss feedback work offline without a per-play voice request.
const VAULT_LOSS_PHRASES: readonly LossPhrase[] = [
  { text: "You were right on the edge of something sharp. One more breath and you'll land it.", source: require('../assets/vault-loss/loss01.m4a'), durationMs: 8010 },
  { text: 'That was inches away from clicking into place. Your instincts are warming up.', source: require('../assets/vault-loss/loss02.m4a'), durationMs: 8740 },
  { text: "You almost hit a perfect line of truth. Hold that tension — it's working. It's working.", source: require('../assets/vault-loss/loss03.m4a'), durationMs: 11060 },
  { text: 'You brushed right up against the moment.', source: require('../assets/vault-loss/loss04.m4a'), durationMs: 4470 },
  { text: "Stay with it — it's opening.", source: require('../assets/vault-loss/loss05.m4a'), durationMs: 3050 },
  { text: "You were a breath away from real precision. That's where the good work lives.", source: require('../assets/vault-loss/loss06.m4a'), durationMs: 7910 },
  { text: "It almost snapped into clarity. Keep that pressure — you're close.", source: require('../assets/vault-loss/loss07.m4a'), durationMs: 6670 },
  { text: 'You nearly locked into the rhythm. Your timing is waking up.', source: require('../assets/vault-loss/loss08.m4a'), durationMs: 7850 },
  { text: "You hovered right over a breakthrough. That's the zone you want.", source: require('../assets/vault-loss/loss09.m4a'), durationMs: 6190 },
  { text: "It was sitting just under the surface. You're circling the right place.", source: require('../assets/vault-loss/loss10.m4a'), durationMs: 7490 },
  { text: "You're not a gambler, you're a sophisticated investor.", source: require('../assets/vault-loss/loss11.m4a'), durationMs: 4690 },
  { text: "You're so close to that big win, I can feel it.", source: require('../assets/vault-loss/loss12.m4a'), durationMs: 4350 },
  {
    text: 'How bad do you want to unlock this super secret hidden theme?',
    source: require('../assets/vault-loss/loss13.m4a'),
    durationMs: 6520,
    protectedFromDismiss: true,
  },
];

const DAIQUIRI_VOICE_CLIPS: readonly DaiquiriVoiceClip[] = [
  { source: require('../assets/daiquiri-voice/voice01.m4a'), durationMs: 5_060 },
  { source: require('../assets/daiquiri-voice/voice02.m4a'), durationMs: 2_150 },
  { source: require('../assets/daiquiri-voice/voice03.m4a'), durationMs: 4_120 },
  { source: require('../assets/daiquiri-voice/voice04.m4a'), durationMs: 7_055 },
  { source: require('../assets/daiquiri-voice/voice05.m4a'), durationMs: 2_670 },
];

const MACHINE_STATUS_LINES = [
  'RUNNING THE NUMBERS',
  'CONSULTING THE RESERVE',
  'CHECKING THE VAULT',
  'PRICING YOUR CONFIDENCE',
] as const;

const SLOT_SYMBOLS = ['coffee', 'star', 'zap', 'award', 'trending-up'] as const;
type SlotSymbol = typeof SLOT_SYMBOLS[number];
const SLOT_REEL_HEIGHT = 58;
const BREW_BET_RESOLUTION_MS = 5_000;
const SLOT_ANTICIPATION_DURATION_MS = 5_000;

export function BrewTokenBank({
  visible,
  colors,
  tokens,
  quotesViewed,
  soundEnabled,
  hapticsEnabled,
  bankKeys,
  bankAccessExpiresAt,
  quickReviveUnlocked,
  quickReviveBottles,
  quickReviveArmed,
  daiquiriUnlocked,
  daiquiriBottles,
  daiquiriArmed,
  staminUpUnlocked,
  staminUpBottles,
  staminUpArmed,
  smartProUnlocked,
  smartProBottles,
  smartProSaleExpiresAt,
  darkBrewTokens,
  neonGucciPhrasesUnlocked,
  neonGucciPhrasesActive,
  activityLog,
  onClose,
  onResolveBet,
  onSoundEnabledChange,
  onHapticsEnabledChange,
  onBuyBankKey,
  onActivateBankKey,
  onUnlockQuickRevive,
  onBuyQuickReviveBottle,
  onRedeemQuickRevive,
  onUnlockDaiquiri,
  onBuyDaiquiriBottle,
  onRedeemDaiquiri,
  onUnlockStaminUp,
  onBuyStaminUpBottle,
  onRedeemStaminUp,
  onUnlockSmartPro,
  onBuySmartProBottle,
  onRedeemSmartPro,
  onUnlockNeonGucciPhrases,
  onSetNeonGucciPhrasesActive,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedBet, setSelectedBet] = useState(1);
  const [result, setResult] = useState<{ won: boolean; bet: number; quickRevive: boolean; daiquiri: boolean; staminUp: boolean; award: number } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [displayedTokens, setDisplayedTokens] = useState(tokens);
  const [lossVoicePlaying, setLossVoicePlaying] = useState(false);
  const [protectedVoicePlaying, setProtectedVoicePlaying] = useState(false);
  const [machineStatusIndex, setMachineStatusIndex] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [bottlePreview, setBottlePreview] = useState<BrewBottlePreviewKind | null>(null);
  const [payoutPreviewOpen, setPayoutPreviewOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState<string | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [phrasePackOpen, setPhrasePackOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [quickReviveBurstVisible, setQuickReviveBurstVisible] = useState(false);
  const [daiquiriBurstVisible, setDaiquiriBurstVisible] = useState(false);
  const [staminUpBurstVisible, setStaminUpBurstVisible] = useState(false);
  const [smartProBurstVisible, setSmartProBurstVisible] = useState(false);
  const [bottleBurstLocation, setBottleBurstLocation] = useState<BottleBurstLocation | null>(null);
  const reduceMotion = useReduceMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const balanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const machineStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lossVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const machineSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shopCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickReviveVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staminUpVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daiquiriVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedTokensRef = useRef(tokens);
  const lossPlayerRef = useRef<AudioPlayerHandle | null>(null);
  const machinePlayerRef = useRef<AudioPlayerHandle | null>(null);
  const winPlayerRef = useRef<AudioPlayerHandle | null>(null);
  const quickReviveVoicePlayerRef = useRef<AudioPlayerHandle | null>(null);
  const staminUpVoicePlayerRef = useRef<AudioPlayerHandle | null>(null);
  const daiquiriVoicePlayerRef = useRef<AudioPlayerHandle | null>(null);
  const activeLossPhraseRef = useRef<LossPhrase | null>(null);
  const shopBusyRef = useRef(false);
  const resolvingRef = useRef(false);
  const reelStopTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const quickReviveBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daiquiriBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staminUpBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smartProBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coinProgress = useSharedValue(0);
  const vaultPulse = useSharedValue(0);
  const resultProgress = useSharedValue(0);
  const reelOnePosition = useSharedValue(0);
  const reelTwoPosition = useSharedValue(0);
  const reelThreePosition = useSharedValue(0);
  const quickReviveProgress = useSharedValue(0);
  const daiquiriProgress = useSharedValue(0);
  const staminUpProgress = useSharedValue(0);
  const smartProProgress = useSharedValue(0);

  const beginShopAction = () => {
    if (shopBusyRef.current) return false;
    if (shopCooldownTimerRef.current) {
      clearTimeout(shopCooldownTimerRef.current);
      shopCooldownTimerRef.current = null;
    }
    shopBusyRef.current = true;
    setShopBusy(true);
    return true;
  };

  const endShopAction = () => {
    if (shopCooldownTimerRef.current) clearTimeout(shopCooldownTimerRef.current);
    shopCooldownTimerRef.current = setTimeout(() => {
      shopBusyRef.current = false;
      shopCooldownTimerRef.current = null;
      setShopBusy(false);
    }, SHOP_ACTION_COOLDOWN_MS);
  };

  const runShopAction = async (action: () => Promise<BrewActionResult>) => {
    if (!beginShopAction()) return null;
    try {
      return await action();
    } catch {
      return { ok: false, reason: 'save_failed' as const };
    } finally {
      endShopAction();
    }
  };

  const stopLossVoice = (force = false) => {
    if (!force && activeLossPhraseRef.current?.protectedFromDismiss) return;
    if (lossVoiceTimerRef.current) clearTimeout(lossVoiceTimerRef.current);
    lossVoiceTimerRef.current = null;
    try { lossPlayerRef.current?.remove(); } catch (_) {}
    lossPlayerRef.current = null;
    try { Speech.stop(); } catch (_) {}
    activeLossPhraseRef.current = null;
    setLossVoicePlaying(false);
    setProtectedVoicePlaying(false);
  };

  const stopMachineSound = () => {
    if (machineSoundTimerRef.current) clearTimeout(machineSoundTimerRef.current);
    machineSoundTimerRef.current = null;
    try { machinePlayerRef.current?.remove(); } catch (_) {}
    machinePlayerRef.current = null;
  };

  const stopWinSound = () => {
    if (winSoundTimerRef.current) clearTimeout(winSoundTimerRef.current);
    winSoundTimerRef.current = null;
    try { winPlayerRef.current?.remove(); } catch (_) {}
    winPlayerRef.current = null;
  };

  const stopQuickReviveVoice = () => {
    if (quickReviveVoiceTimerRef.current) clearTimeout(quickReviveVoiceTimerRef.current);
    quickReviveVoiceTimerRef.current = null;
    try { quickReviveVoicePlayerRef.current?.remove(); } catch (_) {}
    quickReviveVoicePlayerRef.current = null;
  };

  const stopStaminUpVoice = () => {
    if (staminUpVoiceTimerRef.current) clearTimeout(staminUpVoiceTimerRef.current);
    staminUpVoiceTimerRef.current = null;
    try { staminUpVoicePlayerRef.current?.remove(); } catch (_) {}
    staminUpVoicePlayerRef.current = null;
  };

  const stopDaiquiriVoice = () => {
    if (daiquiriVoiceTimerRef.current) clearTimeout(daiquiriVoiceTimerRef.current);
    daiquiriVoiceTimerRef.current = null;
    try { daiquiriVoicePlayerRef.current?.remove(); } catch (_) {}
    daiquiriVoicePlayerRef.current = null;
  };

  const stopMachineStatus = () => {
    if (machineStatusTimerRef.current) clearInterval(machineStatusTimerRef.current);
    machineStatusTimerRef.current = null;
  };

  const triggerBottleBurst = (kind: BottleBurstKind, location: BottleBurstLocation) => {
    if (quickReviveBurstTimerRef.current) clearTimeout(quickReviveBurstTimerRef.current);
    if (daiquiriBurstTimerRef.current) clearTimeout(daiquiriBurstTimerRef.current);
    if (staminUpBurstTimerRef.current) clearTimeout(staminUpBurstTimerRef.current);
    if (smartProBurstTimerRef.current) clearTimeout(smartProBurstTimerRef.current);
    quickReviveBurstTimerRef.current = null;
    daiquiriBurstTimerRef.current = null;
    staminUpBurstTimerRef.current = null;
    smartProBurstTimerRef.current = null;

    [
      quickReviveProgress,
      daiquiriProgress,
      staminUpProgress,
      smartProProgress,
    ].forEach(position => cancelAnimation(position));
    setQuickReviveBurstVisible(false);
    setDaiquiriBurstVisible(false);
    setStaminUpBurstVisible(false);
    setSmartProBurstVisible(false);
    if (reduceMotion) {
      setBottleBurstLocation(null);
      return;
    }
    setBottleBurstLocation(location);

    if (kind === 'quickRevive') {
      cancelAnimation(quickReviveProgress);
      setQuickReviveBurstVisible(true);
      quickReviveProgress.value = 0;
      quickReviveProgress.value = reduceMotion
        ? withTiming(1, { duration: 160 })
        : withSequence(
          withTiming(0.43, { duration: 240, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 980, easing: Easing.inOut(Easing.cubic) }),
        );
      quickReviveBurstTimerRef.current = setTimeout(
        () => {
          setQuickReviveBurstVisible(false);
          setBottleBurstLocation(current => current === location ? null : current);
        },
        reduceMotion ? 220 : 1_380,
      );
      return;
    }

    if (kind === 'daiquiri') {
      cancelAnimation(daiquiriProgress);
      setDaiquiriBurstVisible(true);
      daiquiriProgress.value = 0;
      daiquiriProgress.value = reduceMotion
        ? withTiming(1, { duration: 160 })
        : withSequence(
          withTiming(0.38, { duration: 220, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 1_080, easing: Easing.inOut(Easing.cubic) }),
        );
      daiquiriBurstTimerRef.current = setTimeout(
        () => {
          setDaiquiriBurstVisible(false);
          setBottleBurstLocation(current => current === location ? null : current);
        },
        reduceMotion ? 220 : 1_420,
      );
      return;
    }

    if (kind === 'staminUp') {
      cancelAnimation(staminUpProgress);
      setStaminUpBurstVisible(true);
      staminUpProgress.value = 0;
      staminUpProgress.value = reduceMotion
        ? withTiming(1, { duration: 180 })
        : withSequence(
          withTiming(0.58, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
          withTiming(1, { duration: 670, easing: Easing.out(Easing.cubic) }),
        );
      staminUpBurstTimerRef.current = setTimeout(
        () => {
          setStaminUpBurstVisible(false);
          setBottleBurstLocation(current => current === location ? null : current);
        },
        reduceMotion ? 240 : 1_380,
      );
      return;
    }

    cancelAnimation(smartProProgress);
    setSmartProBurstVisible(true);
    smartProProgress.value = 0;
    smartProProgress.value = reduceMotion
      ? withTiming(1, { duration: 180 })
      : withSequence(
        withTiming(0.44, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 1_080, easing: Easing.inOut(Easing.cubic) }),
      );
    smartProBurstTimerRef.current = setTimeout(
      () => {
        setSmartProBurstVisible(false);
        setBottleBurstLocation(current => current === location ? null : current);
      },
      reduceMotion ? 240 : 1_420,
    );
  };

  const stopPreviewBottleBurst = () => {
    if (bottleBurstLocation !== 'preview') return;
    if (bottlePreview === 'quickRevive' && quickReviveBurstTimerRef.current) {
      clearTimeout(quickReviveBurstTimerRef.current);
      quickReviveBurstTimerRef.current = null;
      setQuickReviveBurstVisible(false);
    }
    if (bottlePreview === 'daiquiri' && daiquiriBurstTimerRef.current) {
      clearTimeout(daiquiriBurstTimerRef.current);
      daiquiriBurstTimerRef.current = null;
      setDaiquiriBurstVisible(false);
    }
    if (bottlePreview === 'staminUp' && staminUpBurstTimerRef.current) {
      clearTimeout(staminUpBurstTimerRef.current);
      staminUpBurstTimerRef.current = null;
      setStaminUpBurstVisible(false);
    }
    if (bottlePreview === 'smartPro' && smartProBurstTimerRef.current) {
      clearTimeout(smartProBurstTimerRef.current);
      smartProBurstTimerRef.current = null;
      setSmartProBurstVisible(false);
    }
    setBottleBurstLocation(null);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    if (shopCooldownTimerRef.current) clearTimeout(shopCooldownTimerRef.current);
    if (quickReviveBurstTimerRef.current) clearTimeout(quickReviveBurstTimerRef.current);
    if (daiquiriBurstTimerRef.current) clearTimeout(daiquiriBurstTimerRef.current);
    if (staminUpBurstTimerRef.current) clearTimeout(staminUpBurstTimerRef.current);
    if (smartProBurstTimerRef.current) clearTimeout(smartProBurstTimerRef.current);
    reelStopTimersRef.current.forEach(timer => clearTimeout(timer));
    reelStopTimersRef.current = [];
    [reelOnePosition, reelTwoPosition, reelThreePosition].forEach(position => cancelAnimation(position));
    stopMachineStatus();
    stopLossVoice(true);
    stopMachineSound();
    stopWinSound();
    stopQuickReviveVoice();
    stopStaminUpVoice();
    stopDaiquiriVoice();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const refreshCountdown = () => setCountdownNow(Date.now());
    refreshCountdown();
    const countdownTimer = setInterval(() => setCountdownNow(Date.now()), 1000);
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') refreshCountdown();
    });
    return () => {
      clearInterval(countdownTimer);
      appStateSubscription.remove();
    };
  }, [visible]);

  useEffect(() => {
    const from = displayedTokensRef.current;
    if (from === tokens) return;

    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    const startedAt = Date.now();
    const duration = 420;
    balanceTimerRef.current = setInterval(() => {
      const progress = Math.min((Date.now() - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (tokens - from) * eased);
      displayedTokensRef.current = next;
      setDisplayedTokens(next);
      if (progress >= 1) {
        if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
        balanceTimerRef.current = null;
        displayedTokensRef.current = tokens;
        setDisplayedTokens(tokens);
      }
    }, 32);

    return () => {
      if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    };
  }, [tokens]);

  const coinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(coinProgress.value, [0, 0.45, 0.8, 1], [0, -26, 8, 0]) },
      { scale: interpolate(coinProgress.value, [0, 0.45, 0.8, 1], [1, 1.18, 0.94, 1]) },
      { rotateZ: `${interpolate(coinProgress.value, [0, 0.45, 0.8, 1], [0, 155, 315, 360])}deg` },
    ],
  }));

  const vaultGlowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(vaultPulse.value, [0, 0.25, 0.65, 1], [0, 0.8, 0.45, 0]),
    transform: [{ scale: interpolate(vaultPulse.value, [0, 0.5, 1], [0.78, 1.12, 1.34]) }],
  }));

  const vaultPerspectiveStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 520 },
      { rotateX: `${interpolate(coinProgress.value, [0, 0.45, 0.8, 1], [0, -3.5, 3, 0])}deg` },
      { rotateY: `${interpolate(coinProgress.value, [0, 0.45, 0.8, 1], [0, 5, -4, 0])}deg` },
    ],
  }));

  const vaultSheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(coinProgress.value, [0, 0.25, 0.55, 0.9, 1], [0.12, 0.3, 0.58, 0.2, 0.12]),
    transform: [{ translateX: interpolate(coinProgress.value, [0, 1], [-170, 170]) }],
  }));

  const resultAnimatedStyle = useAnimatedStyle(() => ({
    opacity: resultProgress.value,
    transform: [
      { translateY: interpolate(resultProgress.value, [0, 1], [8, 0]) },
      { scale: interpolate(resultProgress.value, [0, 1], [0.94, 1]) },
    ],
  }));
  const reelOneStyle = useAnimatedStyle(() => ({ transform: [{ translateY: reelOnePosition.value }] }));
  const reelTwoStyle = useAnimatedStyle(() => ({ transform: [{ translateY: reelTwoPosition.value }] }));
  const reelThreeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: reelThreePosition.value }] }));
  const quickReviveBottleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(quickReviveProgress.value, [0, 0.46, 0.74, 1], [1, 1, 0.38, 0]),
    transform: [
      { translateY: interpolate(quickReviveProgress.value, [0, 0.4, 0.72, 1], [10, -20, -7, 22]) },
      { translateX: interpolate(quickReviveProgress.value, [0, 0.38, 0.7, 1], [0, -8, 10, 3]) },
      { rotateZ: `${interpolate(quickReviveProgress.value, [0, 0.36, 0.74, 1], [0, -12, 15, 32])}deg` },
      { scale: interpolate(quickReviveProgress.value, [0, 0.46, 1], [0.9, 1.17, 0.55]) },
    ],
  }));
  const quickReviveOozeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(quickReviveProgress.value, [0, 0.35, 0.55, 1], [0, 0, 0.92, 0]),
    transform: [
      { translateY: interpolate(quickReviveProgress.value, [0, 0.55, 1], [-18, 4, 35]) },
      { scaleX: interpolate(quickReviveProgress.value, [0, 0.55, 1], [0.45, 1.1, 1.55]) },
      { scaleY: interpolate(quickReviveProgress.value, [0, 0.55, 1], [0.3, 1, 0.72]) },
    ],
  }));
  const quickReviveBubbleFieldStyle = useAnimatedStyle(() => ({
    opacity: interpolate(quickReviveProgress.value, [0, 0.22, 0.65, 1], [0, 0.96, 0.78, 0]),
    transform: [
      { translateY: interpolate(quickReviveProgress.value, [0, 1], [22, -44]) },
      { scale: interpolate(quickReviveProgress.value, [0, 0.55, 1], [0.46, 1.18, 1.5]) },
    ],
  }));
  const daiquiriBottleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.42, 0.72, 1], [1, 1, 0.2, 0]),
    transform: [
      { translateY: interpolate(daiquiriProgress.value, [0, 0.38, 0.72, 1], [0, -18, -5, 0]) },
      { translateX: interpolate(daiquiriProgress.value, [0, 0.38, 0.72, 1], [0, -3, 3, 0]) },
      { rotateZ: `${interpolate(daiquiriProgress.value, [0, 0.38, 0.72, 1], [0, -7, 5, 0])}deg` },
      { scale: interpolate(daiquiriProgress.value, [0, 0.5, 0.78, 1], [0.82, 1.06, 0.92, 0.72]) },
    ],
  }));
  const daiquiriWarmGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.18, 0.58, 1], [0, 0.22, 0.72, 0]),
    transform: [
      { scale: interpolate(daiquiriProgress.value, [0, 0.5, 1], [0.72, 1.18, 1.5]) },
    ],
  }));
  const daiquiriBubbleFieldStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.14, 0.72, 1], [0, 0.92, 0.68, 0]),
    transform: [
      { translateY: interpolate(daiquiriProgress.value, [0, 1], [24, -38]) },
      { scale: interpolate(daiquiriProgress.value, [0, 0.54, 1], [0.42, 1.08, 1.45]) },
    ],
  }));
  const daiquiriSurgeRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.35, 0.68, 1], [0, 0.2, 0.78, 0]),
    transform: [
      { scaleX: interpolate(daiquiriProgress.value, [0, 0.62, 1], [0.26, 1.06, 2.2]) },
      { scaleY: interpolate(daiquiriProgress.value, [0, 0.62, 1], [0.3, 1, 0.72]) },
    ],
  }));
  const daiquiriLabelFlareStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.36, 0.62, 1], [0, 0, 0.95, 0]),
    transform: [{ scale: interpolate(daiquiriProgress.value, [0, 0.6, 1], [0.4, 1, 1.75]) }],
  }));
  const daiquiriSplashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.58, 0.76, 1], [0, 0, 1, 0]),
    transform: [
      { translateY: interpolate(daiquiriProgress.value, [0, 0.75, 1], [18, 3, 40]) },
      { scaleX: interpolate(daiquiriProgress.value, [0, 0.74, 1], [0.2, 1.25, 2.1]) },
      { scaleY: interpolate(daiquiriProgress.value, [0, 0.74, 1], [0.12, 1, 0.62]) },
    ],
  }));
  const staminUpBottleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(staminUpProgress.value, [0, 0.62, 0.84, 1], [1, 1, 0.32, 0]),
    transform: [
      { translateY: interpolate(staminUpProgress.value, [0, 0.55, 1], [0, -28, -54]) },
      { translateX: interpolate(staminUpProgress.value, [0, 0.3, 0.6, 1], [0, 18, -20, 5]) },
      { rotateZ: `${interpolate(staminUpProgress.value, [0, 1], [0, 780])}deg` },
      { scale: interpolate(staminUpProgress.value, [0, 0.6, 1], [0.92, 1.05, 0.4]) },
    ],
  }));
  const staminUpTornadoUpperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(staminUpProgress.value, [0, 0.12, 0.84, 1], [0, 0.86, 0.72, 0]),
    transform: [
      { translateY: interpolate(staminUpProgress.value, [0, 1], [18, -42]) },
      { scaleX: interpolate(staminUpProgress.value, [0, 0.58, 1], [0.22, 1.25, 1.65]) },
      { rotateZ: `${interpolate(staminUpProgress.value, [0, 1], [0, 520])}deg` },
    ],
  }));
  const staminUpTornadoMiddleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(staminUpProgress.value, [0, 0.12, 0.9, 1], [0, 0.9, 0.72, 0]),
    transform: [
      { translateY: interpolate(staminUpProgress.value, [0, 1], [26, -4]) },
      { scaleX: interpolate(staminUpProgress.value, [0, 0.6, 1], [0.3, 1.48, 1.9]) },
      { rotateZ: `${interpolate(staminUpProgress.value, [0, 1], [0, -480])}deg` },
    ],
  }));
  const staminUpTornadoBaseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(staminUpProgress.value, [0, 0.18, 0.95, 1], [0, 0.85, 0.72, 0]),
    transform: [
      { translateY: interpolate(staminUpProgress.value, [0, 1], [34, 27]) },
      { scaleX: interpolate(staminUpProgress.value, [0, 0.65, 1], [0.4, 1.7, 2.15]) },
      { rotateZ: `${interpolate(staminUpProgress.value, [0, 1], [0, 430])}deg` },
    ],
  }));
  const staminUpSplashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(staminUpProgress.value, [0, 0.54, 0.76, 1], [0, 0, 1, 0]),
    transform: [
      { translateY: interpolate(staminUpProgress.value, [0, 0.74, 1], [24, 10, 45]) },
      { scaleX: interpolate(staminUpProgress.value, [0, 0.76, 1], [0.18, 1.7, 2.4]) },
      { scaleY: interpolate(staminUpProgress.value, [0, 0.76, 1], [0.1, 1.08, 0.55]) },
    ],
  }));
  const smartProBottleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(smartProProgress.value, [0, 0.42, 0.74, 1], [1, 1, 0.25, 0]),
    transform: [
      { translateY: interpolate(smartProProgress.value, [0, 0.38, 0.7, 1], [8, -30, -5, 18]) },
      { translateX: interpolate(smartProProgress.value, [0, 0.4, 0.72, 1], [0, -5, 8, 1]) },
      { rotateZ: `${interpolate(smartProProgress.value, [0, 0.35, 0.72, 1], [0, 9, -7, 18])}deg` },
      { scale: interpolate(smartProProgress.value, [0, 0.45, 0.74, 1], [0.86, 1.14, 0.93, 0.5]) },
    ],
  }));
  const smartProHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(smartProProgress.value, [0, 0.18, 0.62, 1], [0, 0.82, 0.54, 0]),
    transform: [
      { scale: interpolate(smartProProgress.value, [0, 0.5, 1], [0.45, 1.2, 2]) },
      { rotateZ: `${interpolate(smartProProgress.value, [0, 1], [0, 180])}deg` },
    ],
  }));
  const smartProBubbleFieldStyle = useAnimatedStyle(() => ({
    opacity: interpolate(smartProProgress.value, [0, 0.18, 0.72, 1], [0, 0.96, 0.66, 0]),
    transform: [
      { translateY: interpolate(smartProProgress.value, [0, 1], [28, -48]) },
      { scale: interpolate(smartProProgress.value, [0, 0.54, 1], [0.42, 1.12, 1.55]) },
    ],
  }));
  const smartProSparkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(smartProProgress.value, [0, 0.36, 0.7, 1], [0, 0.2, 0.98, 0]),
    transform: [
      { translateY: interpolate(smartProProgress.value, [0, 0.72, 1], [12, -34, -46]) },
      { scale: interpolate(smartProProgress.value, [0, 0.62, 1], [0.4, 1.1, 1.8]) },
    ],
  }));

  const bet = Math.min(Math.max(selectedBet, 1), Math.max(tokens, 1));
  const canPlay = tokens > 0 && !resolving && !protectedVoicePlaying && !shopBusy;
  const bankAccessActive = hasBrewBankAccess(bankAccessExpiresAt, countdownNow);
  const smartProSaleActive = hasSmartProSale(smartProSaleExpiresAt, countdownNow);
  const smartProRemainingLabel = formatSmartProRemaining(smartProSaleExpiresAt, countdownNow);
  const quickReviveUnlockPrice = QUICK_REVIVE_UNLOCK_PRICE;
  const quickReviveBottlePrice = getSmartProBottleSalePrice(QUICK_REVIVE_BOTTLE_PRICE, smartProSaleActive);
  const daiquiriUnlockPrice = DAIQUIRI_UNLOCK_PRICE;
  const daiquiriBottlePrice = getSmartProBottleSalePrice(DAIQUIRI_BOTTLE_PRICE, smartProSaleActive);
  const staminUpUnlockPrice = STAMIN_UP_UNLOCK_PRICE;
  const staminUpBottlePrice = getSmartProBottleSalePrice(STAMIN_UP_BOTTLE_PRICE, smartProSaleActive);
  const bankAccent = smartProSaleActive ? '#b9ff45' : colors.gold;
  const bankAccentMuted = smartProSaleActive ? '#5c9b36' : colors.goldMuted;
  const bankSurface = smartProSaleActive ? '#071b13' : colors.card;
  const bankSteel = smartProSaleActive ? '#0b2719' : colors.steelShadow;
  const bankWhite = smartProSaleActive ? '#f5fff0' : colors.foreground;
  const canActivateKey = isWeekday(new Date().getDay()) && bankKeys > 0 && !bankAccessActive && !resolving && !shopBusy;
  const activeWinProbability = daiquiriArmed
    ? getDaiquiriWinProbability(true)
    : getBrewWinProbability(quickReviveArmed);
  const activeOddsLabel = `${Math.round(activeWinProbability * 100)}%`;
  const activeEffectStatus = staminUpArmed
    ? {
        title: `STAMIN UP ARMED · ${STAMIN_UP_WIN_PERCENT}% ODDS`,
        detail: 'NEXT WIN PAYS DARK BREW · STAKE STAYS IN BREW',
        color: '#ffc169',
        icon: 'wind' as const,
      }
    : daiquiriArmed
      ? {
          title: `DAIQUIRI ARMED · ${DAIQUIRI_WIN_PERCENT}% WIN · DOUBLE AWARD`,
          detail: `NEXT TOSS ONLY · ${DAIQUIRI_LOSS_PERCENT}% LOSS ODDS`,
          color: '#a8e5ff',
          icon: 'droplet' as const,
        }
      : quickReviveArmed
        ? {
            title: 'QUICK REVIVE ARMED · 62% ODDS',
            detail: 'NEXT TOSS ONLY · ONE BOTTLE CONSUMED',
            color: colors.buyColor,
            icon: 'zap' as const,
          }
        : {
            title: `STANDARD TOSS · ${Math.round(BREW_TOKEN_WIN_PROBABILITY * 100)}% ODDS`,
            detail: 'NO SODA EFFECT ARMED · STAKE IS AT RISK',
            color: bankAccent,
            icon: 'circle' as const,
          };
  const selectedBottleInspection = bottlePreview
    ? getBrewBottleInspection(bottlePreview, {
        tokens,
        quickReviveUnlocked,
        quickReviveBottles,
        quickReviveArmed,
        daiquiriUnlocked,
        daiquiriBottles,
        daiquiriArmed,
        staminUpUnlocked,
        staminUpBottles,
        staminUpArmed,
         smartProUnlocked,
         smartProBottles,
         smartProActive: smartProSaleActive,
      })
    : null;
  const selectedBottlePreview = selectedBottleInspection?.preview ?? null;
  const selectedBottleUnlocked = selectedBottleInspection?.unlocked ?? false;
  const selectedBottleCount = selectedBottleInspection?.bottleCount ?? 0;
  const selectedBottleArmed = selectedBottleInspection?.armed ?? false;
  const handleReplayBottlePreview = () => {
    if (!bottlePreview || !selectedBottleUnlocked) return;
    triggerBottleBurst(bottlePreview, 'preview');
  };

  const confirmExpensiveAction = (title: string, message: string, action: () => void) => {
    Alert.alert(title, message, [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'CONFIRM', onPress: action },
    ]);
  };

  const handleBuyKey = async (confirmed = false) => {
    if (tokens < BREW_BANK_KEY_PRICE || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed) {
      confirmExpensiveAction(
        'BUY CENTRAL BANK KEY?',
        `Spend ${BREW_BANK_KEY_PRICE} Brew Tokens for one weekday access key?`,
        () => { void handleBuyKey(true); },
      );
      return;
    }
    const purchased = await runShopAction(onBuyBankKey);
    if (!purchased) return;
    setShopMessage(purchased.ok ? 'KEY ADDED TO INVENTORY' : getActionFailureMessage(purchased, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleActivateKey = async () => {
    if (!canActivateKey || resolvingRef.current || shopBusyRef.current) return;
    const activated = await runShopAction(onActivateBankKey);
    if (!activated) return;
    setShopMessage(activated.ok ? 'ACCESS GRANTED FOR 12 HOURS' : getActionFailureMessage(activated, 'KEYS CAN ONLY BE ACTIVATED ON WEEKDAYS'));
  };

  const handleUnlockQuickRevive = async (confirmed = false) => {
    if (tokens < quickReviveUnlockPrice || quickReviveUnlocked || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed) {
      confirmExpensiveAction(
        'UNLOCK QUICK REVIVE?',
        `Spend ${quickReviveUnlockPrice} Brew Tokens to unlock this recipe?`,
        () => { void handleUnlockQuickRevive(true); },
      );
      return;
    }
    const unlocked = await runShopAction(onUnlockQuickRevive);
    if (!unlocked) return;
    setShopMessage(unlocked.ok
      ? `QUICK REVIVE UNLOCKED · BOTTLES ARE NOW ${quickReviveBottlePrice} ${quickReviveBottlePrice === 1 ? 'TOKEN' : 'TOKENS'}`
      : getActionFailureMessage(unlocked, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleBuyQuickReviveBottle = async () => {
    if (!quickReviveUnlocked || tokens < quickReviveBottlePrice || resolvingRef.current || shopBusyRef.current) return;
    const purchased = await runShopAction(onBuyQuickReviveBottle);
    if (!purchased) return;
    setShopMessage(purchased.ok ? 'QUICK REVIVE BOTTLE ADDED TO INVENTORY' : getActionFailureMessage(purchased, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleRedeemQuickRevive = async () => {
    if (!quickReviveUnlocked || quickReviveBottles < 1 || quickReviveArmed || daiquiriArmed || staminUpArmed || resolvingRef.current || shopBusyRef.current) return;
    const redeemed = await runShopAction(onRedeemQuickRevive);
    if (!redeemed) return;
    if (!redeemed.ok) {
      setShopMessage(getActionFailureMessage(redeemed, 'QUICK REVIVE IS NOT AVAILABLE RIGHT NOW'));
      return;
    }

    setShopMessage('QUICK REVIVE ARMED · NEXT TOSS HAS 62% ODDS');
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    triggerBottleBurst('quickRevive', 'vault');
    void playQuickReviveVoice();
  };

  const handleUnlockDaiquiri = async (confirmed = false) => {
    if (tokens < daiquiriUnlockPrice || daiquiriUnlocked || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed) {
      confirmExpensiveAction(
        'UNLOCK DAIQUIRI?',
        `Spend ${daiquiriUnlockPrice} Brew Tokens to unlock the 45% win recipe?`,
        () => { void handleUnlockDaiquiri(true); },
      );
      return;
    }
    const unlocked = await runShopAction(onUnlockDaiquiri);
    if (!unlocked) return;
    setShopMessage(unlocked.ok ? `DAIQUIRI UNLOCKED · BOTTLES ARE NOW ${daiquiriBottlePrice} TOKENS` : getActionFailureMessage(unlocked, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleBuyDaiquiriBottle = async (confirmed = false) => {
    if (!daiquiriUnlocked || tokens < daiquiriBottlePrice || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed && daiquiriBottlePrice >= 8) {
      confirmExpensiveAction(
        'BUY DAIQUIRI?',
        `Spend ${daiquiriBottlePrice} Brew Tokens for one 45% win bottle?`,
        () => { void handleBuyDaiquiriBottle(true); },
      );
      return;
    }
    const purchased = await runShopAction(onBuyDaiquiriBottle);
    if (!purchased) return;
    setShopMessage(purchased.ok ? 'DAIQUIRI BOTTLE ADDED TO INVENTORY' : getActionFailureMessage(purchased, 'NOT ENOUGH BREW TOKENS'));
  };

  const playDaiquiriVoice = async () => {
    if (!soundEnabled || Constants.appOwnership === 'expo') return;
    stopDaiquiriVoice();
    const clip = DAIQUIRI_VOICE_CLIPS[Math.floor(Math.random() * DAIQUIRI_VOICE_CLIPS.length)]!;
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(clip.source, { downloadFirst: true });
      daiquiriVoicePlayerRef.current = player;
      player.play();
      daiquiriVoiceTimerRef.current = setTimeout(stopDaiquiriVoice, clip.durationMs + 250);
    } catch {
      // The redemption animation remains useful if native audio is unavailable.
    }
  };

  const playQuickReviveVoice = async () => {
    if (!soundEnabled || Constants.appOwnership === 'expo') return;
    stopQuickReviveVoice();
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(require('../assets/quick-revive-voice/revive-soda.m4a'), { downloadFirst: true });
      quickReviveVoicePlayerRef.current = player;
      player.play();
      quickReviveVoiceTimerRef.current = setTimeout(stopQuickReviveVoice, 6_150);
    } catch {
      // The glowing bottle animation remains useful if native audio is unavailable.
    }
  };

  const playStaminUpVoice = async () => {
    if (!soundEnabled || Constants.appOwnership === 'expo') return;
    stopStaminUpVoice();
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(require('../assets/stamin-up-voice/stamin-up.m4a'), { downloadFirst: true });
      staminUpVoicePlayerRef.current = player;
      player.play();
      staminUpVoiceTimerRef.current = setTimeout(stopStaminUpVoice, 6_070);
    } catch {
      // The tornado and bottle-break animation remain useful if native audio is unavailable.
    }
  };

  const handleRedeemDaiquiri = async () => {
    if (!daiquiriUnlocked || daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolvingRef.current || shopBusyRef.current) return;
    const redeemed = await runShopAction(onRedeemDaiquiri);
    if (!redeemed) return;
    if (!redeemed.ok) {
      setShopMessage(getActionFailureMessage(redeemed, 'DAIQUIRI IS NOT AVAILABLE RIGHT NOW'));
      return;
    }

    setShopMessage(`DAIQUIRI ARMED · ${DAIQUIRI_ODDS_LABEL} · DOUBLE AWARD`);
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    triggerBottleBurst('daiquiri', 'vault');
    void playDaiquiriVoice();
  };

  const handleUnlockStaminUp = async (confirmed = false) => {
    if (tokens < staminUpUnlockPrice || staminUpUnlocked || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed) {
      confirmExpensiveAction(
        'UNLOCK STAMIN UP?',
        `Spend ${staminUpUnlockPrice} Brew Tokens to unlock the Dark Brew recipe?`,
        () => { void handleUnlockStaminUp(true); },
      );
      return;
    }
    const unlocked = await runShopAction(onUnlockStaminUp);
    if (!unlocked) return;
    setShopMessage(unlocked.ok ? `STAMIN UP UNLOCKED · BOTTLES ARE NOW ${staminUpBottlePrice} TOKENS` : getActionFailureMessage(unlocked, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleBuyStaminUpBottle = async (confirmed = false) => {
    if (!staminUpUnlocked || tokens < staminUpBottlePrice || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed && staminUpBottlePrice >= 8) {
      confirmExpensiveAction(
        'BUY STAMIN UP?',
        `Spend ${staminUpBottlePrice} Brew Tokens for one ${STAMIN_UP_WIN_PERCENT}% win bottle?`,
        () => { void handleBuyStaminUpBottle(true); },
      );
      return;
    }
    const purchased = await runShopAction(onBuyStaminUpBottle);
    if (!purchased) return;
    setShopMessage(purchased.ok ? 'STAMIN UP BOTTLE ADDED TO INVENTORY' : getActionFailureMessage(purchased, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleRedeemStaminUp = async () => {
    if (!staminUpUnlocked || staminUpBottles < 1 || staminUpArmed || quickReviveArmed || daiquiriArmed || resolvingRef.current || shopBusyRef.current) return;
    const redeemed = await runShopAction(onRedeemStaminUp);
    if (!redeemed) return;
    if (!redeemed.ok) {
      setShopMessage(getActionFailureMessage(redeemed, 'STAMIN UP IS NOT AVAILABLE RIGHT NOW'));
      return;
    }

    setShopMessage('STAMIN UP ARMED · NEXT WIN PAYS DARK BREW TOKENS');
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    triggerBottleBurst('staminUp', 'vault');
    void playStaminUpVoice();
  };

  const handleUnlockSmartPro = async (confirmed = false) => {
    if (tokens < SMART_PRO_UNLOCK_PRICE || smartProUnlocked || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed) {
      confirmExpensiveAction(
        'UNLOCK SMARTPRO?',
        `Spend ${SMART_PRO_UNLOCK_PRICE} Brew Tokens to unlock the flash-sale recipe?`,
        () => { void handleUnlockSmartPro(true); },
      );
      return;
    }
    const unlocked = await runShopAction(onUnlockSmartPro);
    if (!unlocked) return;
    setShopMessage(unlocked.ok ? `SMARTPRO RECIPE UNLOCKED · BOTTLES ARE ${SMART_PRO_BOTTLE_PRICE} TOKENS` : getActionFailureMessage(unlocked, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleBuySmartProBottle = async () => {
    if (!smartProUnlocked || tokens < SMART_PRO_BOTTLE_PRICE || resolvingRef.current || shopBusyRef.current) return;
    const purchased = await runShopAction(onBuySmartProBottle);
    if (!purchased) return;
    setShopMessage(purchased.ok ? 'SMARTPRO SODA ADDED TO INVENTORY' : getActionFailureMessage(purchased, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleRedeemSmartPro = async () => {
    if (!smartProUnlocked || smartProBottles < 1 || smartProSaleActive || resolvingRef.current || shopBusyRef.current) return;
    const redeemed = await runShopAction(onRedeemSmartPro);
    if (!redeemed) return;
    if (!redeemed.ok) {
      setShopMessage(getActionFailureMessage(redeemed, 'SMARTPRO IS NOT AVAILABLE RIGHT NOW'));
      return;
    }

    setShopMessage('SMARTPRO SALE ACTIVE · NON-KEY SHOP ITEMS ARE HALF PRICE');
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    triggerBottleBurst('smartPro', 'vault');
  };

  const handleUnlockNeonGucciPhrases = async (confirmed = false) => {
    if (tokens < NEON_GUCCI_PHRASE_PACK_PRICE || neonGucciPhrasesUnlocked || resolvingRef.current || shopBusyRef.current) return;
    if (!confirmed) {
      confirmExpensiveAction(
        'UNLOCK NEON GUCCI PHRASES?',
        `Spend ${NEON_GUCCI_PHRASE_PACK_PRICE} Brew Tokens for 15 unhinged analysis loading lines?`,
        () => { void handleUnlockNeonGucciPhrases(true); },
      );
      return;
    }
    const unlocked = await runShopAction(onUnlockNeonGucciPhrases);
    if (!unlocked) return;
    setShopMessage(unlocked.ok ? 'NEON GUCCI PHRASES UNLOCKED · NOW ON' : getActionFailureMessage(unlocked, 'NOT ENOUGH BREW TOKENS'));
  };

  const handleSetNeonGucciPhrasesActive = async (value: boolean) => {
    if (!neonGucciPhrasesUnlocked || resolvingRef.current || shopBusyRef.current) return;
    const updated = await runShopAction(() => onSetNeonGucciPhrasesActive(value));
    if (!updated) return;
    if (updated.ok) {
      setShopMessage(value ? 'NEON GUCCI PHRASES ON · ANALYSIS IS NOW UNHINGED' : 'NEON GUCCI PHRASES OFF · NORMAL LOADING RESTORED');
    } else {
      setShopMessage(getActionFailureMessage(updated, 'PHRASE SETTING COULD NOT BE UPDATED'));
    }
  };

  const accessExpiryLabel = bankAccessExpiresAt
    ? new Date(bankAccessExpiresAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : null;
  const accessRemainingLabel = formatBrewBankAccessRemaining(bankAccessExpiresAt, countdownNow);
  const phrasePackDisplay = getNeonGucciPhrasePackDisplay(neonGucciPhrasesUnlocked, neonGucciPhrasesActive);

  const playMachineStartSound = async () => {
    if (!soundEnabled || Constants.appOwnership === 'expo') return;
    stopMachineSound();
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(require('../assets/sounds/casino_slot_anticipation.wav'), { downloadFirst: true });
      machinePlayerRef.current = player;
      player.play();
      machineSoundTimerRef.current = setTimeout(stopMachineSound, SLOT_ANTICIPATION_DURATION_MS + 250);
    } catch {
      // The animation and haptics remain useful if native audio is unavailable.
    }
  };

  const playWinSound = async () => {
    if (!soundEnabled || Constants.appOwnership === 'expo') return;
    stopWinSound();
    stopMachineSound();
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(require('../assets/sounds/win_chime.wav'), { downloadFirst: true });
      winPlayerRef.current = player;
      player.play();
      winSoundTimerRef.current = setTimeout(stopWinSound, 900);
    } catch {
      // The success haptic and result card remain useful if native audio is unavailable.
    }
  };

  const playLossVoice = async () => {
    if (!soundEnabled) return;

    stopLossVoice(true);
    const phrase = VAULT_LOSS_PHRASES[Math.floor(Math.random() * VAULT_LOSS_PHRASES.length)]!;
    activeLossPhraseRef.current = phrase;
    setLossVoicePlaying(true);
    setProtectedVoicePlaying(!!phrase.protectedFromDismiss);

    const finish = () => {
      if (activeLossPhraseRef.current !== phrase) return;
      stopLossVoice(true);
    };

    if (Constants.appOwnership === 'expo') {
      Speech.speak(phrase.text, {
        rate: 0.94,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
      return;
    }

    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const player = createAudioPlayer(phrase.source, { downloadFirst: true });
      lossPlayerRef.current = player;
      const loaded = await waitForAudioPlayerLoaded(player);
      if (activeLossPhraseRef.current !== phrase || lossPlayerRef.current !== player) {
        return;
      }
      if (!loaded) {
        throw new Error('Loss voice recording did not finish loading');
      }
      player.play();
      lossVoiceTimerRef.current = setTimeout(finish, phrase.durationMs + 250);
    } catch {
      if (activeLossPhraseRef.current !== phrase) return;
      try { lossPlayerRef.current?.remove(); } catch (_) {}
      lossPlayerRef.current = null;
      Speech.speak(phrase.text, {
        rate: 0.94,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    }
  };

  const handleClose = () => {
    if (protectedVoicePlaying || resolving || resolvingRef.current || shopBusyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    reelStopTimersRef.current.forEach(timer => clearTimeout(timer));
    reelStopTimersRef.current = [];
    [reelOnePosition, reelTwoPosition, reelThreePosition].forEach(position => cancelAnimation(position));
    [coinProgress, vaultPulse, resultProgress].forEach(position => cancelAnimation(position));
    stopPreviewBottleBurst();
    setBottlePreview(null);
    setQuickReviveBurstVisible(false);
    setDaiquiriBurstVisible(false);
    setStaminUpBurstVisible(false);
    setSmartProBurstVisible(false);
    setBottleBurstLocation(null);
    stopMachineStatus();
    stopLossVoice(true);
    stopMachineSound();
    stopDaiquiriVoice();
    stopWinSound();
    stopQuickReviveVoice();
    stopStaminUpVoice();
    onClose();
  };

  const handleBet = () => {
    if (!canPlay || resolvingRef.current || shopBusyRef.current) return;
    // A normal loss voice may still be finishing after the result card appears.
    // A new gamble should replace it cleanly with the next anticipation track.
    stopLossVoice(true);
    const staminUp = staminUpArmed;
    const daiquiri = daiquiriArmed && !staminUp;
    const quickRevive = quickReviveArmed && !daiquiri && !staminUp;
    const payoutMultiplier = daiquiri ? DAIQUIRI_PAYOUT_MULTIPLIER : 1;
    const won = Math.random() < (daiquiri ? getDaiquiriWinProbability(true) : getBrewWinProbability(quickRevive));
    const effect: BrewBetEffect = staminUp
      ? { rewardAsDarkBrew: true }
      : daiquiri
        ? { payoutMultiplier }
        : {};
    setResult(null);
    resolvingRef.current = true;
    setResolving(true);
    reelStopTimersRef.current.forEach(timer => clearTimeout(timer));
    reelStopTimersRef.current = [];
    const reelPositions = [reelOnePosition, reelTwoPosition, reelThreePosition];
    const finalIndexes = won ? [0, 0, 0] : [1, 3, 4];
    if (reduceMotion) {
      reelPositions.forEach((position, index) => {
        position.value = -finalIndexes[index]! * SLOT_REEL_HEIGHT;
      });
    } else {
      reelPositions.forEach(position => {
        cancelAnimation(position);
        position.value = withRepeat(
          withSequence(
            withTiming(-SLOT_REEL_HEIGHT * (SLOT_SYMBOLS.length - 1), { duration: 560, easing: Easing.linear }),
            withTiming(0, { duration: 1 }),
          ),
          -1,
          false,
        );
      });
      [1_700, 2_900, 4_600].forEach((delay, index) => {
        reelStopTimersRef.current.push(setTimeout(() => {
          cancelAnimation(reelPositions[index]!);
          reelPositions[index]!.value = withTiming(-finalIndexes[index]! * SLOT_REEL_HEIGHT, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
          });
        }, delay));
      });
    }
    setMachineStatusIndex(0);
    stopMachineStatus();
    if (!reduceMotion) {
      machineStatusTimerRef.current = setInterval(() => {
        setMachineStatusIndex(index => (index + 1) % MACHINE_STATUS_LINES.length);
      }, 260);
    }
    resultProgress.value = 0;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    void playMachineStartSound();
    if (reduceMotion) {
      coinProgress.value = 1;
      vaultPulse.value = 0;
    } else {
      coinProgress.value = withSequence(
        withTiming(0.45, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withTiming(0.8, { duration: 210, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) }),
      );
      vaultPulse.value = withSequence(
        withTiming(0.5, { duration: 200, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 250, easing: Easing.inOut(Easing.cubic) }),
      );
    }
    timerRef.current = setTimeout(() => {
      // The anticipation track is exactly five seconds, so begin the outcome
      // feedback at the same resolution point instead of waiting for storage.
      stopMachineSound();
      if (won) void playWinSound();
      else void playLossVoice();
      void onResolveBet(bet, won, effect).finally(() => {
        stopMachineStatus();
        if (hapticsEnabled) {
          Haptics.notificationAsync(
            won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
          ).catch(() => {});
        }
        setResult({ won, bet, quickRevive, daiquiri, staminUp, award: won ? bet * payoutMultiplier : bet });
        resolvingRef.current = false;
        setResolving(false);
        if (reduceMotion) {
          resultProgress.value = 1;
          vaultPulse.value = 0;
        } else {
          resultProgress.value = withSpring(1, { damping: 13, stiffness: 180 });
          vaultPulse.value = withSequence(
            withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
          );
        }
      });
    }, BREW_BET_RESOLUTION_MS);
  };

  const renderReel = (
    positionStyle: any,
    reelIndex: number,
    tint: string,
  ) => (
    <View style={[styles.reelWindow, { borderColor: tint }]}>
      <Animated.View style={positionStyle}>
        {SLOT_SYMBOLS.map((symbol, symbolIndex) => (
          <View style={styles.reelSymbol} key={`${reelIndex}-${symbol}`}>
            <Feather name={symbol as SlotSymbol} size={reelIndex === 0 ? 28 : 31} color={tint} />
          </View>
        ))}
      </Animated.View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, Constants.statusBarHeight ?? 0) + 12,
            paddingBottom: Math.max(insets.bottom, 8) + 12,
          },
        ]}
        onTouchEnd={() => stopLossVoice()}
      >
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={[styles.shell, { backgroundColor: bankSurface, borderColor: bankAccentMuted }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: bankAccent, fontFamily: 'Inter_600SemiBold' }]}>
                {smartProSaleActive ? 'SMARTPRO FLASH SALE' : 'WEEKEND FEATURE'}
              </Text>
              <Text style={[styles.title, { color: bankWhite, fontFamily: 'Inter_700Bold' }]}>THE CENTRAL BANK</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>OF BAD DECISIONS</Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={protectedVoicePlaying || resolving || shopBusy}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                protectedVoicePlaying
                  ? 'Voice message is playing'
                  : shopBusy
                    ? 'Central Bank is saving a change'
                    : 'Close Central Bank'
              }
              accessibilityState={{ disabled: protectedVoicePlaying || resolving || shopBusy }}
            >
              <Feather name="x" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {smartProSaleActive && smartProRemainingLabel && (
            <View style={[styles.smartProSaleBanner, { borderColor: bankAccent }]}>
              <View style={styles.smartProSaleBannerIcon}>
                <Feather name="zap" size={16} color="#17361c" />
              </View>
              <View style={styles.smartProSaleBannerCopy}>
                <Text style={[styles.smartProSaleBannerTitle, { fontFamily: 'Inter_700Bold' }]}>50% OFF · {smartProRemainingLabel}</Text>
                <Text style={[styles.smartProSaleBannerText, { fontFamily: 'Inter_500Medium' }]}>
                  OTHER BOTTLES & RECIPES · BANK KEY EXCLUDED
                </Text>
              </View>
            </View>
          )}

          <Pressable
            onPress={() => stopLossVoice()}
            disabled={!lossVoicePlaying || protectedVoicePlaying}
            style={[styles.vault, { backgroundColor: bankSteel, borderColor: bankAccentMuted }]}
            accessibilityRole={lossVoicePlaying && !protectedVoicePlaying ? 'button' : undefined}
            accessibilityLabel={lossVoicePlaying && !protectedVoicePlaying ? 'Stop vault voice message' : 'Brew Token reserve'}
          >
            <Animated.View pointerEvents="none" style={[styles.vaultPerspectiveFrame, vaultPerspectiveStyle]}>
              <View style={[styles.vaultBackplate, { backgroundColor: bankSurface, borderColor: smartProSaleActive ? '#315f3f' : colors.border }]} />
              <View style={[styles.vaultTopDepth, { backgroundColor: bankAccentMuted }]} />
              <View style={[styles.vaultLeftDepth, { backgroundColor: colors.border }]} />
              <View style={[styles.vaultRightDepth, { backgroundColor: colors.border }]} />
              <LinearGradient
                pointerEvents="none"
                colors={['transparent', bankWhite, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.vaultSheen, vaultSheenStyle]}
              />
              <View style={[styles.vaultRivet, styles.vaultRivetTopLeft, { backgroundColor: bankAccentMuted }]} />
              <View style={[styles.vaultRivet, styles.vaultRivetTopRight, { backgroundColor: bankAccentMuted }]} />
              <View style={[styles.vaultRivet, styles.vaultRivetBottomLeft, { backgroundColor: bankAccentMuted }]} />
              <View style={[styles.vaultRivet, styles.vaultRivetBottomRight, { backgroundColor: bankAccentMuted }]} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.vaultGlow, { backgroundColor: bankAccent }, vaultGlowAnimatedStyle]}
            />
            <View pointerEvents="none" style={[styles.vaultFloorShadow, { backgroundColor: colors.background }]} />
             {quickReviveBurstVisible && bottleBurstLocation === 'vault' && (
               <View pointerEvents="none" style={styles.quickReviveBurst}>
                  <Animated.View style={[styles.quickReviveBubbleField, quickReviveBubbleFieldStyle]}>
                    <View style={[styles.quickReviveBubble, styles.quickReviveBubbleOne]} />
                    <View style={[styles.quickReviveBubble, styles.quickReviveBubbleTwo]} />
                    <View style={[styles.quickReviveBubble, styles.quickReviveBubbleThree]} />
                    <View style={[styles.quickReviveBubble, styles.quickReviveBubbleFour]} />
                  </Animated.View>
                 <Animated.View style={[styles.quickReviveBurstBottle, quickReviveBottleStyle]}>
                   <QuickReviveBottle size={40} />
                 </Animated.View>
                 <Animated.View style={[styles.quickReviveOoze, quickReviveOozeStyle]}>
                   <View style={styles.quickReviveOozeDrop} />
                   <View style={[styles.quickReviveOozeDrop, styles.quickReviveOozeDropWide]} />
                   <View style={[styles.quickReviveOozeDrop, styles.quickReviveOozeDropSmall]} />
                 </Animated.View>
               </View>
             )}
               {daiquiriBurstVisible && bottleBurstLocation === 'vault' && (
                <View pointerEvents="none" style={styles.daiquiriBurst}>
                   <Animated.View style={[styles.daiquiriWarmGlow, daiquiriWarmGlowStyle]} />
                   <Animated.View style={[styles.daiquiriBubbleField, daiquiriBubbleFieldStyle]}>
                     <View style={[styles.daiquiriBubble, styles.daiquiriBubbleOne]} />
                     <View style={[styles.daiquiriBubble, styles.daiquiriBubbleTwo]} />
                     <View style={[styles.daiquiriBubble, styles.daiquiriBubbleThree]} />
                     <View style={[styles.daiquiriBubble, styles.daiquiriBubbleFour]} />
                     <View style={[styles.daiquiriBubble, styles.daiquiriBubbleFive]} />
                  </Animated.View>
                   <Animated.View style={[styles.daiquiriSurgeRing, daiquiriSurgeRingStyle]} />
                    <View style={styles.daiquiriPedestal}>
                      <View style={styles.daiquiriPedestalTop} />
                      <View style={styles.daiquiriPedestalBody} />
                    </View>
                    <Animated.View style={[styles.daiquiriBurstBottle, daiquiriBottleStyle]}>
                     <DaiquiriBottle size={42} />
                   </Animated.View>
                   <Animated.View style={[styles.daiquiriLabelFlare, daiquiriLabelFlareStyle]} />
                   <Animated.View style={[styles.daiquiriSplash, daiquiriSplashStyle]}>
                     <View style={styles.daiquiriSplashDrop} />
                     <View style={[styles.daiquiriSplashDrop, styles.daiquiriSplashDropWide]} />
                     <View style={[styles.daiquiriSplashDrop, styles.daiquiriSplashDropSmall]} />
                  </Animated.View>
                </View>
              )}
               {staminUpBurstVisible && bottleBurstLocation === 'vault' && (
                <View pointerEvents="none" style={styles.staminUpBurst}>
                  <Animated.View style={[styles.staminUpTornadoRing, styles.staminUpTornadoUpper, staminUpTornadoUpperStyle]} />
                  <Animated.View style={[styles.staminUpTornadoRing, styles.staminUpTornadoMiddle, staminUpTornadoMiddleStyle]} />
                  <Animated.View style={[styles.staminUpTornadoRing, styles.staminUpTornadoBase, staminUpTornadoBaseStyle]} />
                  <Animated.View style={[styles.quickReviveBurstBottle, staminUpBottleStyle]}>
                    <StaminUpBottle size={42} />
                  </Animated.View>
                  <Animated.View style={[styles.staminUpSplash, staminUpSplashStyle]}>
                    <View style={styles.staminUpSplashDrop} />
                    <View style={[styles.staminUpSplashDrop, styles.staminUpSplashDropWide]} />
                    <View style={[styles.staminUpSplashDrop, styles.staminUpSplashDropSmall]} />
                  </Animated.View>
                </View>
              )}
               {smartProBurstVisible && bottleBurstLocation === 'vault' && (
                 <View pointerEvents="none" style={styles.smartProBurst}>
                   <Animated.View style={[styles.smartProHalo, smartProHaloStyle]} />
                   <Animated.View style={[styles.smartProBubbleField, smartProBubbleFieldStyle]}>
                     <View style={[styles.smartProBubble, styles.smartProBubbleOne]} />
                     <View style={[styles.smartProBubble, styles.smartProBubbleTwo]} />
                     <View style={[styles.smartProBubble, styles.smartProBubbleThree]} />
                     <View style={[styles.smartProBubble, styles.smartProBubbleFour]} />
                     <View style={[styles.smartProBubble, styles.smartProBubbleFive]} />
                   </Animated.View>
                   <Animated.View style={[styles.smartProSpark, smartProSparkStyle]}>
                     <Feather name="zap" size={36} color="#f6ffdf" />
                   </Animated.View>
                   <Animated.View style={[styles.quickReviveBurstBottle, smartProBottleStyle]}>
                     <SmartProBottle size={42} />
                   </Animated.View>
                 </View>
               )}
            <View style={styles.slotMachine}>
              {renderReel(reelOneStyle, 0, result ? (result.won ? colors.buyColor : colors.sellColor) : bankAccent)}
              {renderReel(reelTwoStyle, 1, result ? (result.won ? colors.buyColor : colors.sellColor) : bankAccent)}
              {renderReel(reelThreeStyle, 2, result ? (result.won ? colors.buyColor : colors.sellColor) : bankAccent)}
            </View>
            <Text style={[styles.vaultLabel, { color: bankAccent, fontFamily: 'Inter_600SemiBold' }]}>
              {smartProSaleActive ? 'SMARTPRO RESERVE' : 'BREW TOKEN RESERVE'}
            </Text>
            <Text style={[styles.balance, { color: bankWhite, fontFamily: 'Inter_700Bold' }]}>{displayedTokens}</Text>
            <Text style={[styles.balanceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {displayedTokens === 1 ? 'TOKEN AVAILABLE' : 'TOKENS AVAILABLE'}
            </Text>
             {darkBrewTokens > 0 && (
               <View style={styles.darkBrewBalance}>
                 <Feather name="moon" size={12} color="#f29b38" />
                 <Text style={[styles.darkBrewBalanceText, { fontFamily: 'Inter_700Bold' }]}>
                   {darkBrewTokens} DARK BREW {darkBrewTokens === 1 ? 'TOKEN' : 'TOKENS'}
                 </Text>
               </View>
             )}
            {lossVoicePlaying && (
              <Text style={[styles.skipVoiceHint, { color: protectedVoicePlaying ? bankAccent : colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                {protectedVoicePlaying ? 'LISTEN CLOSELY' : 'TAP ANYWHERE TO SKIP VOICE'}
              </Text>
            )}
            {resolving && (
              <Text style={[styles.machineStatus, { color: bankAccent, fontFamily: 'Inter_600SemiBold' }]}>
                {MACHINE_STATUS_LINES[machineStatusIndex]}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => { setShopOpen(value => !value); setShopMessage(null); }}
            style={[styles.shopToggle, { borderColor: bankAccentMuted, backgroundColor: bankSteel }]}
            accessibilityRole="button"
            accessibilityLabel={shopOpen ? 'Close Central Bank shop and inventory' : 'Open Central Bank shop and inventory'}
            accessibilityState={{ expanded: shopOpen }}
          >
            <View style={styles.shopToggleCopy}>
              <Feather name="briefcase" size={15} color={bankAccent} />
              <Text style={[styles.shopToggleText, { color: bankWhite, fontFamily: 'Inter_600SemiBold' }]}>
                 BOTTLE LAB / INVENTORY
              </Text>
            </View>
            <View style={styles.shopToggleRight}>
              <Text style={[styles.keyCount, { color: bankAccent, fontFamily: 'Inter_700Bold' }]}>{bankKeys}</Text>
              <Feather name={shopOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>

          {shopOpen && (
            <View style={[styles.shopPanel, { backgroundColor: bankSteel, borderColor: smartProSaleActive ? '#315f3f' : colors.border }]}>
               <View style={[styles.labHeader, { borderColor: bankAccentMuted, backgroundColor: bankSurface }]}>
                 <View style={styles.labHeaderIcon}>
                   <Feather name="activity" size={15} color={bankAccent} />
                 </View>
                 <View style={styles.labHeaderCopy}>
                   <Text style={[styles.labHeaderTitle, { color: bankWhite, fontFamily: 'Inter_700Bold' }]}>BOTTLE LAB</Text>
                   <Text style={[styles.labHeaderSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                     RECIPE · ODDS · EFFECT · INVENTORY · REDEMPTION
                   </Text>
                 </View>
                 <Text style={[styles.labHeaderBalance, { color: bankAccent, fontFamily: 'Inter_700Bold' }]}>{tokens} TOKENS</Text>
               </View>
              <View style={styles.shopHeadingRow}>
                <View>
                  <Text style={[styles.shopTitle, { color: bankWhite, fontFamily: 'Inter_700Bold' }]}>BANK ACCESS KEY</Text>
                  <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Weekday entry requires a key. Buy one for {BREW_BANK_KEY_PRICE} Brew Tokens, then activate it to unlock 12 hours inside the Central Bank.
                  </Text>
                </View>
                <Feather name="key" size={23} color={bankAccent} />
              </View>
              <View style={styles.inventoryRow}>
                <Text style={[styles.inventoryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>IN INVENTORY</Text>
                <Text style={[styles.inventoryValue, { color: bankAccent, fontFamily: 'Inter_700Bold' }]}>
                  {bankKeys} {bankKeys === 1 ? 'KEY' : 'KEYS'}
                </Text>
              </View>
              {bankAccessActive && accessExpiryLabel && accessRemainingLabel && (
                <Text style={[styles.accessStatus, { color: colors.buyColor, fontFamily: 'Inter_600SemiBold' }]}>
                  ACCESS ACTIVE · {accessRemainingLabel.toUpperCase()} · EXPIRES {accessExpiryLabel.toUpperCase()}
                </Text>
              )}
              {!bankAccessActive && bankKeys > 0 && !isWeekday(new Date().getDay()) && (
                <Text style={[styles.accessStatus, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  KEYS CAN BE ACTIVATED MONDAY–FRIDAY
                </Text>
              )}
              <View style={styles.shopActions}>
                <Pressable
                  onPress={() => { void handleBuyKey(); }}
                  disabled={tokens < BREW_BANK_KEY_PRICE || resolving || shopBusy}
                  style={[styles.shopButton, { borderColor: bankAccentMuted }, (tokens < BREW_BANK_KEY_PRICE || resolving || shopBusy) && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy a bank access key for ${BREW_BANK_KEY_PRICE} Brew Tokens`}
                >
                  <Text style={[styles.shopButtonText, { color: bankAccent, fontFamily: 'Inter_700Bold' }]}>
                    BUY KEY · {BREW_BANK_KEY_PRICE} TOKENS
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { void handleActivateKey(); }}
                  disabled={!canActivateKey || shopBusy}
                  style={[styles.shopButton, { backgroundColor: bankAccent }, (!canActivateKey || shopBusy) && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Activate bank access key"
                >
                  <Text style={[styles.shopButtonText, { color: smartProSaleActive ? '#102817' : colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                    {bankAccessActive ? 'ACCESS ACTIVE' : 'ACTIVATE KEY · 12H ENTRY'}
                  </Text>
                </Pressable>
              </View>
               <View style={[styles.quickReviveShop, { borderTopColor: colors.border }]}>
                 <View style={styles.shopHeadingRow}>
                   <View style={styles.quickReviveShopCopy}>
                     <Text style={[styles.shopTitle, { color: quickReviveUnlocked ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                       QUICK REVIVE
                     </Text>
                     <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                       Break one into the machine before a toss to raise your next win chance by 7 points, from 55% to 62%.
                     </Text>
                      <View style={styles.bottleSpecRow}>
                        <Text style={[styles.bottleSpec, { color: colors.buyColor, fontFamily: 'Inter_700Bold' }]}>62% WIN · +7 POINTS</Text>
                        <Text style={[styles.bottleSpec, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>NEXT TOSS</Text>
                      </View>
                   </View>
                    <Pressable
                      onPress={() => setBottlePreview('quickRevive')}
                      style={styles.bottleInspectButton}
                      accessibilityRole="button"
                      accessibilityLabel="Inspect Quick Revive bottle"
                      testID="inspect-quick-revive"
                    >
                      <QuickReviveBottle size={31} muted={!quickReviveUnlocked} />
                      <Feather name="maximize-2" size={13} color={colors.mutedForeground} />
                    </Pressable>
                 </View>
                 <View style={[styles.quickReviveShop, { borderTopColor: colors.border }]}>
                   <View style={styles.shopHeadingRow}>
                     <View style={styles.quickReviveShopCopy}>
                       <Text style={[styles.shopTitle, { color: staminUpUnlocked ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                         STAMIN UP
                       </Text>
                       <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                         A rare amber soda. Break one into the machine and a winning toss pays Dark Brew Tokens instead of normal Brew Token winnings.
                       </Text>
                        <View style={styles.bottleSpecRow}>
                        <Text style={[styles.bottleSpec, { color: '#f2ad55', fontFamily: 'Inter_700Bold' }]}>{STAMIN_UP_WIN_PERCENT}% WIN · DARK BREW</Text>
                          <Text style={[styles.bottleSpec, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>NEXT TOSS</Text>
                        </View>
                     </View>
                      <Pressable
                        onPress={() => setBottlePreview('staminUp')}
                        style={styles.bottleInspectButton}
                        accessibilityRole="button"
                        accessibilityLabel="Inspect Stamin Up bottle"
                        testID="inspect-stamin-up"
                      >
                        <StaminUpBottle size={31} muted={!staminUpUnlocked} />
                        <Feather name="maximize-2" size={13} color={colors.mutedForeground} />
                      </Pressable>
                   </View>
                   <View style={styles.inventoryRow}>
                     <Text style={[styles.inventoryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>BOTTLES IN INVENTORY</Text>
                     <Text style={[styles.inventoryValue, { color: staminUpUnlocked ? '#f29b38' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                       {staminUpUnlocked ? staminUpBottles : 'LOCKED'}
                     </Text>
                   </View>
                   {!staminUpUnlocked ? (
                     <Pressable
                       onPress={() => { void handleUnlockStaminUp(); }}
                        disabled={tokens < staminUpUnlockPrice || resolving || shopBusy}
                       style={[
                         styles.shopButton,
                         { borderColor: colors.border, backgroundColor: colors.card },
                          (tokens < staminUpUnlockPrice || resolving || shopBusy) && styles.disabled,
                       ]}
                       accessibilityRole="button"
                        accessibilityLabel={`Unlock Stamin Up for ${staminUpUnlockPrice} Brew Tokens`}
                     >
                       <Text style={[styles.shopButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                          UNLOCK RECIPE · {staminUpUnlockPrice} TOKENS{smartProSaleActive ? ' · 50% OFF' : ''}
                       </Text>
                     </Pressable>
                   ) : (
                     <Pressable
                       onPress={() => { void handleBuyStaminUpBottle(); }}
                        disabled={tokens < staminUpBottlePrice || resolving || shopBusy}
                       style={[
                         styles.shopButton,
                         { borderColor: '#f29b38' },
                          (tokens < staminUpBottlePrice || resolving || shopBusy) && styles.disabled,
                       ]}
                       accessibilityRole="button"
                        accessibilityLabel={`Buy one Stamin Up bottle for ${staminUpBottlePrice} Brew Tokens`}
                     >
                       <Text style={[styles.shopButtonText, { color: '#ffc169', fontFamily: 'Inter_700Bold' }]}>
                          BUY BOTTLE · {staminUpBottlePrice} TOKENS{smartProSaleActive ? ' · 50% OFF' : ''}
                       </Text>
                     </Pressable>
                   )}
                 </View>
                 <View style={styles.inventoryRow}>
                   <Text style={[styles.inventoryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>BOTTLES IN INVENTORY</Text>
                   <Text style={[styles.inventoryValue, { color: quickReviveUnlocked ? colors.gold : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                     {quickReviveUnlocked ? quickReviveBottles : 'LOCKED'}
                   </Text>
                 </View>
                 {!quickReviveUnlocked ? (
                   <Pressable
                     onPress={() => { void handleUnlockQuickRevive(); }}
                      disabled={tokens < quickReviveUnlockPrice || resolving || shopBusy}
                     style={[
                       styles.shopButton,
                       { borderColor: colors.border, backgroundColor: colors.card },
                        (tokens < quickReviveUnlockPrice || resolving || shopBusy) && styles.disabled,
                     ]}
                     accessibilityRole="button"
                      accessibilityLabel={`Unlock Quick Revive for ${quickReviveUnlockPrice} Brew Tokens`}
                   >
                     <Text style={[styles.shopButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                        UNLOCK RECIPE · {quickReviveUnlockPrice} TOKENS{smartProSaleActive ? ' · 50% OFF' : ''}
                     </Text>
                   </Pressable>
                 ) : (
                   <Pressable
                     onPress={() => { void handleBuyQuickReviveBottle(); }}
                      disabled={tokens < quickReviveBottlePrice || resolving || shopBusy}
                     style={[
                       styles.shopButton,
                       { borderColor: colors.goldMuted },
                        (tokens < quickReviveBottlePrice || resolving || shopBusy) && styles.disabled,
                     ]}
                     accessibilityRole="button"
                      accessibilityLabel={`Buy one Quick Revive bottle for ${quickReviveBottlePrice} Brew Tokens`}
                   >
                     <Text style={[styles.shopButtonText, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                        BUY BOTTLE · {quickReviveBottlePrice} {quickReviveBottlePrice === 1 ? 'TOKEN' : 'TOKENS'}{smartProSaleActive ? ' · 50% OFF' : ''}
                     </Text>
                   </Pressable>
                 )}
               </View>
                <View style={[styles.quickReviveShop, { borderTopColor: colors.border }]}>
                  <View style={styles.shopHeadingRow}>
                    <View style={styles.quickReviveShopCopy}>
                      <Text style={[styles.shopTitle, { color: daiquiriUnlocked ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                        DAVE RAMSEY DAIQUIRI
                      </Text>
                      <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {DAIQUIRI_DESCRIPTION}
                      </Text>
                       <View style={styles.bottleSpecRow}>
                         <Text style={[styles.bottleSpec, { color: '#8edbff', fontFamily: 'Inter_700Bold' }]}>{DAIQUIRI_ODDS_LABEL}</Text>
                         <Text style={[styles.bottleSpec, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>2× WIN AWARD</Text>
                       </View>
                    </View>
                    <Pressable
                      onPress={() => setBottlePreview('daiquiri')}
                      style={styles.bottleInspectButton}
                      accessibilityRole="button"
                      accessibilityLabel="Inspect Dave Ramsey Daiquiri bottle"
                      testID="inspect-daiquiri"
                    >
                      <DaiquiriBottle size={31} muted={!daiquiriUnlocked} />
                      <Feather name="maximize-2" size={13} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <View style={styles.inventoryRow}>
                    <Text style={[styles.inventoryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>BOTTLES IN INVENTORY</Text>
                    <Text style={[styles.inventoryValue, { color: daiquiriUnlocked ? colors.gold : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {daiquiriUnlocked ? daiquiriBottles : 'LOCKED'}
                    </Text>
                  </View>
                  {!daiquiriUnlocked ? (
                    <Pressable
                      onPress={() => { void handleUnlockDaiquiri(); }}
                      disabled={tokens < daiquiriUnlockPrice || resolving || shopBusy}
                      style={[
                        styles.shopButton,
                        { borderColor: colors.border, backgroundColor: colors.card },
                        (tokens < daiquiriUnlockPrice || resolving || shopBusy) && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Unlock Dave Ramsey Daiquiri for ${daiquiriUnlockPrice} Brew Tokens`}
                    >
                      <Text style={[styles.shopButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                        UNLOCK RECIPE · {daiquiriUnlockPrice} TOKENS{smartProSaleActive ? ' · 50% OFF' : ''}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => { void handleBuyDaiquiriBottle(); }}
                      disabled={tokens < daiquiriBottlePrice || resolving || shopBusy}
                      style={[
                        styles.shopButton,
                        { borderColor: '#8edbff' },
                        (tokens < daiquiriBottlePrice || resolving || shopBusy) && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Buy one Dave Ramsey Daiquiri bottle for ${daiquiriBottlePrice} Brew Tokens`}
                    >
                      <Text style={[styles.shopButtonText, { color: '#a8e5ff', fontFamily: 'Inter_700Bold' }]}>
                        BUY BOTTLE · {daiquiriBottlePrice} TOKENS{smartProSaleActive ? ' · 50% OFF' : ''}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View style={[styles.quickReviveShop, styles.phrasePackShop, { borderTopColor: colors.border }]}>
                  <Pressable
                    onPress={() => setPhrasePackOpen(value => !value)}
                    style={styles.phrasePackHeader}
                    accessibilityRole="button"
                    accessibilityLabel={phrasePackOpen ? 'Collapse Neon Gucci loading phrase pack' : 'Inspect Neon Gucci loading phrase pack'}
                    accessibilityState={{ expanded: phrasePackOpen }}
                  >
                    <View style={styles.quickReviveShopCopy}>
                      <View style={styles.smartProTitleRow}>
                        <Text style={[styles.shopTitle, { color: neonGucciPhrasesUnlocked ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                          NEON GUCCI LOADING PACK
                        </Text>
                        <View style={styles.phrasePackPill}>
                          <Text style={[styles.phrasePackPillText, { fontFamily: 'Inter_700Bold' }]}>
                            {phrasePackDisplay.pill}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        Swap the normal analysis loading steps for 15 chaotic one-liners. It changes the copy only — your analysis, data, and trades stay exactly the same.
                      </Text>
                      <View style={styles.bottleSpecRow}>
                        <Text style={[styles.bottleSpec, { color: '#d8a4ff', fontFamily: 'Inter_700Bold' }]}>15 LINES · COPY ONLY</Text>
                        <Text style={[styles.bottleSpec, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                          {neonGucciPhrasesUnlocked ? 'TAP TO TOGGLE' : 'NEW SHOP ITEM'}
                        </Text>
                      </View>
                    </View>
                    <Feather name={phrasePackOpen ? 'chevron-up' : 'chevron-down'} size={17} color={neonGucciPhrasesUnlocked ? '#d8a4ff' : colors.mutedForeground} />
                  </Pressable>
                  {phrasePackOpen && (
                    <View style={styles.phrasePackDetails}>
                      <Text style={[styles.phrasePackDetailsText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {neonGucciPhrasesUnlocked
                          ? 'When on, these lines appear while stock analysis is loading. Turn them off any time; the pack stays yours permanently.'
                          : 'A tiny luxury purchase for a very specific kind of financial chaos. Unlock once, then decide whether your loading screen gets the unhinged version.'}
                      </Text>
                      {!neonGucciPhrasesUnlocked ? (
                        <Pressable
                          onPress={() => { void handleUnlockNeonGucciPhrases(); }}
                          disabled={tokens < NEON_GUCCI_PHRASE_PACK_PRICE || resolving || shopBusy}
                          style={[
                            styles.shopButton,
                            { borderColor: '#9e62c9', backgroundColor: 'rgba(158,98,201,0.12)' },
                            (tokens < NEON_GUCCI_PHRASE_PACK_PRICE || resolving || shopBusy) && styles.disabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Unlock Neon Gucci loading phrases for ${NEON_GUCCI_PHRASE_PACK_PRICE} Brew Tokens`}
                        >
                          <Text style={[styles.shopButtonText, { color: '#e2b8ff', fontFamily: 'Inter_700Bold' }]}>
                            UNLOCK 15 PHRASES · {NEON_GUCCI_PHRASE_PACK_PRICE} TOKENS
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={[styles.phrasePackToggleRow, { borderColor: '#9e62c9', backgroundColor: 'rgba(158,98,201,0.1)' }]}>
                          <View style={styles.phrasePackToggleCopy}>
                            <Text style={[styles.phrasePackToggleTitle, { color: '#e2b8ff', fontFamily: 'Inter_700Bold' }]}>
                              {phrasePackDisplay.title}
                            </Text>
                            <Text style={[styles.phrasePackToggleSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                              {phrasePackDisplay.subtitle}
                            </Text>
                          </View>
                          <Switch
                            value={neonGucciPhrasesActive}
                            onValueChange={(value) => { void handleSetNeonGucciPhrasesActive(value); }}
                            disabled={resolving || shopBusy}
                            trackColor={{ false: colors.border, true: '#9e62c9' }}
                            thumbColor={neonGucciPhrasesActive ? '#f2dcff' : colors.mutedForeground}
                            accessibilityLabel="Toggle Neon Gucci loading phrases"
                          />
                        </View>
                      )}
                    </View>
                  )}
                </View>
                <View style={[styles.quickReviveShop, styles.smartProShop, { borderTopColor: smartProSaleActive ? '#78c84b' : colors.border }]}>
                  <View style={styles.shopHeadingRow}>
                    <View style={styles.quickReviveShopCopy}>
                      <View style={styles.smartProTitleRow}>
                        <Text style={[styles.shopTitle, { color: smartProUnlocked ? '#b9ff45' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                          SMARTPRO SODA
                        </Text>
                        <View style={styles.smartProNewPill}>
                          <Text style={[styles.smartProNewPillText, { fontFamily: 'Inter_700Bold' }]}>FLASH SALE</Text>
                        </View>
                      </View>
                      <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        Redeem one to make every other bottle half price for {SMART_PRO_SALE_DURATION_MS / 1000} seconds. Recipe unlocks and the bank key stay full price.
                      </Text>
                      <View style={styles.bottleSpecRow}>
                        <Text style={[styles.bottleSpec, { color: '#b9ff45', fontFamily: 'Inter_700Bold' }]}>90 SEC · 50% SALE</Text>
                        <Text style={[styles.bottleSpec, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>SHOP EFFECT</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => setBottlePreview('smartPro')}
                      style={styles.bottleInspectButton}
                      accessibilityRole="button"
                      accessibilityLabel="Inspect SmartPro Soda bottle"
                      testID="inspect-smart-pro"
                    >
                      <SmartProBottle size={31} muted={!smartProUnlocked} />
                      <Feather name="maximize-2" size={13} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <View style={styles.inventoryRow}>
                    <Text style={[styles.inventoryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>BOTTLES IN INVENTORY</Text>
                    <Text style={[styles.inventoryValue, { color: smartProUnlocked ? '#b9ff45' : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {smartProUnlocked ? smartProBottles : 'LOCKED'}
                    </Text>
                  </View>
                  {!smartProUnlocked ? (
                    <Pressable
                      onPress={() => { void handleUnlockSmartPro(); }}
                      disabled={tokens < SMART_PRO_UNLOCK_PRICE || resolving || shopBusy}
                      style={[
                        styles.shopButton,
                        { borderColor: '#4f8c3b', backgroundColor: colors.card },
                        (tokens < SMART_PRO_UNLOCK_PRICE || resolving || shopBusy) && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Unlock SmartPro Soda for ${SMART_PRO_UNLOCK_PRICE} Brew Tokens`}
                    >
                      <Text style={[styles.shopButtonText, { color: '#b9ff45', fontFamily: 'Inter_700Bold' }]}>
                        UNLOCK RECIPE · {SMART_PRO_UNLOCK_PRICE} TOKENS
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => { void handleBuySmartProBottle(); }}
                      disabled={tokens < SMART_PRO_BOTTLE_PRICE || resolving || shopBusy}
                      style={[
                        styles.shopButton,
                        { borderColor: '#8fe35a' },
                        (tokens < SMART_PRO_BOTTLE_PRICE || resolving || shopBusy) && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Buy one SmartPro Soda for ${SMART_PRO_BOTTLE_PRICE} Brew Tokens`}
                    >
                      <Text style={[styles.shopButtonText, { color: '#dfffc8', fontFamily: 'Inter_700Bold' }]}>
                        BUY BOTTLE · {SMART_PRO_BOTTLE_PRICE} TOKENS
                      </Text>
                    </Pressable>
                  )}
                </View>
              {shopMessage && (
                <Text style={[styles.shopMessage, { color: bankAccent, fontFamily: 'Inter_600SemiBold' }]}>{shopMessage}</Text>
              )}
            </View>
          )}

           <Pressable
             onPress={() => setActivityOpen(value => !value)}
             style={[styles.activityToggle, { borderColor: bankAccentMuted, backgroundColor: bankSteel }]}
             accessibilityRole="button"
             accessibilityLabel={activityOpen ? 'Close token activity history' : 'Open token activity history'}
             accessibilityState={{ expanded: activityOpen }}
           >
             <View style={styles.shopToggleCopy}>
               <Feather name="clock" size={15} color={bankAccent} />
               <Text style={[styles.shopToggleText, { color: bankWhite, fontFamily: 'Inter_600SemiBold' }]}>TOKEN ACTIVITY</Text>
             </View>
             <View style={styles.shopToggleRight}>
               <Text style={[styles.activityCount, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                 {activityLog.length ? `${Math.min(activityLog.length, 8)} RECENT` : 'NO EVENTS'}
               </Text>
               <Feather name={activityOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
             </View>
           </Pressable>
           {activityOpen && (
             <View style={[styles.activityPanel, { backgroundColor: bankSteel, borderColor: colors.border }]}>
               {activityLog.length === 0 ? (
                 <Text style={[styles.activityEmpty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                   Your token, bottle, and effect history will appear here.
                 </Text>
               ) : activityLog.slice(-8).reverse().map((entry) => (
                 <View key={entry.id} style={[styles.activityRow, { borderBottomColor: colors.border }]}>
                   <View style={[styles.activityDot, { backgroundColor: entry.kind === 'toss' ? colors.buyColor : bankAccent }]} />
                   <View style={styles.activityCopy}>
                     <Text style={[styles.activityLabel, { color: bankWhite, fontFamily: 'Inter_700Bold' }]}>{entry.label}</Text>
                     <Text style={[styles.activityDetail, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{entry.detail}</Text>
                   </View>
                   <Text style={[styles.activityTime, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                     {new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                   </Text>
                 </View>
               ))}
             </View>
           )}

           <View style={[styles.armedStatus, { borderColor: activeEffectStatus.color, backgroundColor: bankSteel }]}>
             <View style={[styles.armedStatusIcon, { backgroundColor: `${activeEffectStatus.color}22` }]}>
               <Feather name={activeEffectStatus.icon} size={14} color={activeEffectStatus.color} />
             </View>
             <View style={styles.armedStatusCopy}>
               <Text style={[styles.armedStatusTitle, { color: activeEffectStatus.color, fontFamily: 'Inter_700Bold' }]}>
                 {activeEffectStatus.title}
               </Text>
               <Text style={[styles.armedStatusDetail, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                 {activeEffectStatus.detail}
               </Text>
             </View>
           </View>

           <View style={styles.betRow}>
            <View>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>DEPOSIT</Text>
              <Text style={[styles.betValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{bet} {bet === 1 ? 'TOKEN' : 'TOKENS'}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setSelectedBet(value => Math.max(1, value - 1))}
                disabled={!canPlay || bet <= 1}
                style={[styles.stepButton, { borderColor: colors.border }, (!canPlay || bet <= 1) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Decrease Brew Token deposit"
              >
                <Feather name="minus" size={16} color={colors.foreground} />
              </Pressable>
              <Pressable
                onPress={() => setSelectedBet(value => Math.min(Math.max(tokens, 1), value + 1))}
                disabled={!canPlay || bet >= tokens}
                style={[styles.stepButton, { borderColor: colors.border }, (!canPlay || bet >= tokens) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Increase Brew Token deposit"
              >
                <Feather name="plus" size={16} color={colors.foreground} />
              </Pressable>
            </View>
          </View>

          {smartProUnlocked && (
            <Pressable
              onPress={() => { void handleRedeemSmartPro(); }}
              disabled={smartProBottles < 1 || smartProSaleActive || resolving || shopBusy}
              style={[
                styles.quickReviveArm,
                styles.smartProArm,
                { borderColor: smartProSaleActive ? '#dfffc8' : '#79c94c', backgroundColor: bankSteel },
                (smartProBottles < 1 || smartProSaleActive || resolving || shopBusy) && !smartProSaleActive && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                smartProSaleActive
                  ? `SmartPro sale active. ${smartProRemainingLabel ?? 'Less than one second'} remaining.`
                  : `Redeem a SmartPro Soda. ${smartProBottles} bottles available.`
              }
              accessibilityState={{ disabled: smartProBottles < 1 || smartProSaleActive || resolving || shopBusy }}
            >
              <SmartProBottle size={26} muted={!smartProSaleActive && smartProBottles < 1} />
              <View style={styles.quickReviveArmCopy}>
                <Text style={[styles.quickReviveArmTitle, { color: smartProSaleActive ? '#dfffc8' : bankWhite, fontFamily: 'Inter_700Bold' }]}>
                  {smartProSaleActive ? `SMARTPRO SALE ACTIVE · ${smartProRemainingLabel ?? '0:01'}` : 'REDEEM SMARTPRO · 90-SECOND SALE'}
                </Text>
                <Text style={[styles.quickReviveArmDescription, { color: smartProSaleActive ? '#b9eaaa' : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {smartProSaleActive
                    ? 'OTHER BOTTLES ARE HALF PRICE · UNLOCKS & BANK KEY FULL PRICE'
                    : `${smartProBottles} ${smartProBottles === 1 ? 'BOTTLE' : 'BOTTLES'} READY · SMARTPRO STAYS 3 TOKENS`}
                </Text>
              </View>
              <Feather name={smartProSaleActive ? 'clock' : 'zap'} size={17} color="#b9ff45" />
            </Pressable>
          )}

          {quickReviveUnlocked && (
            <Pressable
              onPress={() => { void handleRedeemQuickRevive(); }}
              disabled={quickReviveBottles < 1 || quickReviveArmed || daiquiriArmed || staminUpArmed || resolving || shopBusy}
              style={[
                styles.quickReviveArm,
                { borderColor: quickReviveArmed ? colors.buyColor : bankAccentMuted, backgroundColor: bankSteel },
                (quickReviveBottles < 1 || quickReviveArmed || daiquiriArmed || staminUpArmed || resolving || shopBusy) && !quickReviveArmed && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                quickReviveArmed
                  ? 'Quick Revive armed. Your next toss has 62 percent odds.'
                  : `Redeem a Quick Revive bottle. ${quickReviveBottles} bottles available.`
              }
              accessibilityState={{ disabled: quickReviveBottles < 1 || quickReviveArmed || daiquiriArmed || staminUpArmed || resolving || shopBusy }}
            >
              <QuickReviveBottle size={26} muted={!quickReviveArmed && quickReviveBottles < 1} />
              <View style={styles.quickReviveArmCopy}>
                <Text style={[styles.quickReviveArmTitle, { color: quickReviveArmed ? colors.buyColor : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {quickReviveArmed ? 'QUICK REVIVE ARMED · 62% ODDS' : 'REDEEM QUICK REVIVE · +7% ODDS'}
                </Text>
                <Text style={[styles.quickReviveArmDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {quickReviveArmed
                    ? 'Blue liquid is in the machine. It applies to your next toss only.'
                    : `${quickReviveBottles} ${quickReviveBottles === 1 ? 'BOTTLE' : 'BOTTLES'} READY · CONSUMES ONE BOTTLE`}
                </Text>
              </View>
              <Feather name={quickReviveArmed ? 'check-circle' : 'zap'} size={17} color={quickReviveArmed ? colors.buyColor : bankAccent} />
            </Pressable>
          )}
          {daiquiriUnlocked && (
            <Pressable
              onPress={() => { void handleRedeemDaiquiri(); }}
              disabled={daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy}
              style={[
                styles.quickReviveArm,
                { borderColor: daiquiriArmed ? '#8edbff' : '#e9c64d', backgroundColor: bankSteel },
                (daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy) && !daiquiriArmed && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                daiquiriArmed
                  ? `Dave Ramsey Daiquiri armed. Your next toss has ${DAIQUIRI_WIN_PERCENT} percent win odds, ${DAIQUIRI_LOSS_PERCENT} percent loss odds, and double award on a win.`
                  : `Redeem a Dave Ramsey Daiquiri bottle. ${daiquiriBottles} bottles available.`
              }
              accessibilityState={{ disabled: daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy }}
            >
              <DaiquiriBottle size={26} muted={!daiquiriArmed && daiquiriBottles < 1} />
              <View style={styles.quickReviveArmCopy}>
                <Text style={[styles.quickReviveArmTitle, { color: daiquiriArmed ? '#a8e5ff' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {daiquiriArmed ? `DAIQUIRI ARMED · ${DAIQUIRI_WIN_PERCENT}% WIN · DOUBLE AWARD` : 'REDEEM DAIQUIRI · DOUBLE WIN AWARD'}
                </Text>
                <Text style={[styles.quickReviveArmDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {daiquiriArmed
                    ? 'Light blue and yellow liquid is in the machine. It applies to your next toss only.'
                    : `${daiquiriBottles} ${daiquiriBottles === 1 ? 'BOTTLE' : 'BOTTLES'} READY · ${DAIQUIRI_ODDS_LABEL}`}
                </Text>
              </View>
              <Feather name={daiquiriArmed ? 'check-circle' : 'droplet'} size={17} color={daiquiriArmed ? '#a8e5ff' : '#f6d64a'} />
            </Pressable>
          )}
          {staminUpUnlocked && (
            <Pressable
              onPress={() => { void handleRedeemStaminUp(); }}
              disabled={staminUpBottles < 1 || staminUpArmed || quickReviveArmed || daiquiriArmed || resolving || shopBusy}
              style={[
                styles.quickReviveArm,
                { borderColor: staminUpArmed ? '#ffc169' : '#d27620', backgroundColor: bankSteel },
                (staminUpBottles < 1 || staminUpArmed || quickReviveArmed || daiquiriArmed || resolving || shopBusy) && !staminUpArmed && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                staminUpArmed
                  ? 'Stamin Up armed. The next winning toss pays Dark Brew Tokens instead of regular Brew Tokens.'
                  : `Redeem a Stamin Up bottle. ${staminUpBottles} bottles available.`
              }
              accessibilityState={{ disabled: staminUpBottles < 1 || staminUpArmed || quickReviveArmed || daiquiriArmed || resolving || shopBusy }}
            >
              <StaminUpBottle size={26} muted={!staminUpArmed && staminUpBottles < 1} />
              <View style={styles.quickReviveArmCopy}>
                <Text style={[styles.quickReviveArmTitle, { color: staminUpArmed ? '#ffc169' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {staminUpArmed ? 'STAMIN UP ARMED · DARK BREW WIN' : 'REDEEM STAMIN UP · DARK BREW WIN'}
                </Text>
                <Text style={[styles.quickReviveArmDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {staminUpArmed
                    ? 'The amber liquid is in the machine. Your stake stays regular; one win pays Dark Brew Tokens.'
                    : `${staminUpBottles} ${staminUpBottles === 1 ? 'BOTTLE' : 'BOTTLES'} READY · CONSUMES ONE BOTTLE`}
                </Text>
              </View>
              <Feather name={staminUpArmed ? 'check-circle' : 'wind'} size={17} color={staminUpArmed ? '#ffc169' : '#f29b38'} />
            </Pressable>
          )}

          <Pressable
            onPress={() => setPayoutPreviewOpen(value => !value)}
            style={[
              styles.payoutToggle,
              { backgroundColor: bankSteel, borderColor: colors.border },
              payoutPreviewOpen && styles.payoutToggleOpen,
            ]}
            accessibilityRole="button"
            accessibilityLabel={payoutPreviewOpen ? 'Hide payout preview' : 'Show payout preview'}
            accessibilityState={{ expanded: payoutPreviewOpen }}
          >
            <Text style={[styles.payoutHeading, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
              PAYOUT PREVIEW
            </Text>
            <Feather name={payoutPreviewOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.mutedForeground} />
          </Pressable>
          {payoutPreviewOpen && (
            <View style={[styles.payoutPreview, { backgroundColor: bankSteel, borderColor: colors.border }]}>
              <View style={styles.payoutColumns}>
                <View style={styles.payoutColumn}>
                  <Text style={[styles.payoutLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>WIN</Text>
                  <Text style={[styles.payoutValue, { color: staminUpArmed ? '#ffc169' : daiquiriArmed ? '#a8e5ff' : colors.buyColor, fontFamily: 'Inter_700Bold' }]}>+{daiquiriArmed ? bet * DAIQUIRI_PAYOUT_MULTIPLIER : bet}</Text>
                  <Text style={[styles.payoutUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {staminUpArmed ? `DARK BREW ${bet === 1 ? 'TOKEN' : 'TOKENS'}` : bet === 1 ? 'TOKEN' : 'TOKENS'}
                  </Text>
                </View>
                <View style={[styles.payoutDivider, { backgroundColor: colors.border }]} />
                <View style={styles.payoutColumn}>
                  <Text style={[styles.payoutLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>LOSS</Text>
                  <Text style={[styles.payoutValue, { color: colors.sellColor, fontFamily: 'Inter_700Bold' }]}>−{bet}</Text>
                  <Text style={[styles.payoutUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {bet === 1 ? 'TOKEN' : 'TOKENS'}
                  </Text>
                </View>
                <View style={[styles.payoutDivider, { backgroundColor: colors.border }]} />
                <View style={styles.payoutColumn}>
                  <Text style={[styles.payoutLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>ODDS</Text>
                  <Text style={[styles.payoutValue, { color: daiquiriArmed ? '#a8e5ff' : quickReviveArmed ? colors.buyColor : bankAccent, fontFamily: 'Inter_700Bold' }]}>{activeOddsLabel}</Text>
                  <Text style={[styles.payoutUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>TO WIN</Text>
                  {daiquiriArmed && (
                    <Text style={[styles.payoutUnit, { color: '#f6d64a', fontFamily: 'Inter_500Medium' }]}>
                      {Math.round(DAIQUIRI_LOSS_PROBABILITY * 100)}% LOSS
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          <Text style={[styles.rules, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {staminUpArmed
              ? 'Stamin Up keeps your Brew Token stake on a win and sends an equal reward to Dark Brew Tokens. Dark Brew Tokens cannot be bet or lost.'
              : daiquiriArmed
              ? 'Daiquiri doubles this toss’s winning award. Lose only the tokens deposited.'
              : 'Win returns your deposit plus an equal payout. Lose only the tokens deposited.'}
          </Text>

          {tokens === 0 && (
            <Text style={[styles.emptyMessage, { color: bankAccent, fontFamily: 'Inter_500Medium' }]}>
              The reserve is empty. View another Biden quote during the week to earn a Brew Token.
            </Text>
          )}

          {result && (
            <Animated.View
              accessibilityLiveRegion="polite"
              style={[
                styles.resultCard,
                { borderColor: result.won ? colors.buyColor : colors.sellColor },
                resultAnimatedStyle,
              ]}
            >
              <Feather
                name={result.won ? 'check-circle' : 'x-circle'}
                size={17}
                color={result.won ? colors.buyColor : colors.sellColor}
              />
              <View style={styles.resultCopy}>
              <Text style={[styles.resultHeadline, { color: result.won ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
                {result.won ? 'THE BANK PAID' : 'THE BANK KEPT ITS CUT'}
              </Text>
              <Text style={[styles.result, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {result.won
                  ? result.staminUp
                    ? `+${result.award} DARK BREW ${result.award === 1 ? 'TOKEN' : 'TOKENS'} · BREW BALANCE ${tokens}`
                    : `+${result.award} ${result.award === 1 ? 'TOKEN' : 'TOKENS'} · NEW BALANCE ${tokens}`
                  : `−${result.bet} ${result.bet === 1 ? 'TOKEN' : 'TOKENS'} · NEW BALANCE ${tokens}`}
              </Text>
               {result.quickRevive && (
                <Text style={[styles.resultHint, { color: colors.buyColor, fontFamily: 'Inter_600SemiBold' }]}>
                  QUICK REVIVE APPLIED · 62% ODDS WERE ACTIVE
                </Text>
              )}
               {result.daiquiri && (
                 <Text style={[styles.resultHint, { color: '#a8e5ff', fontFamily: 'Inter_600SemiBold' }]}>
                    DAIQUIRI APPLIED · {DAIQUIRI_WIN_PERCENT}% WIN / {DAIQUIRI_LOSS_PERCENT}% LOSS · {result.won ? 'DOUBLE AWARD PAID' : 'BOTTLE CONSUMED'}
                 </Text>
               )}
               {result.staminUp && (
                 <Text style={[styles.resultHint, { color: '#ffc169', fontFamily: 'Inter_600SemiBold' }]}>
                   STAMIN UP APPLIED · {result.won ? `DARK BREW BALANCE ${darkBrewTokens}` : 'BOTTLE CONSUMED'}
                 </Text>
               )}
              {!result.won && soundEnabled && (
                <Text style={[styles.resultHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  A message from the vault is incoming.
                </Text>
              )}
              </View>
            </Animated.View>
          )}

          <Pressable
            onPress={handleBet}
            disabled={!canPlay}
            style={[styles.depositButton, { backgroundColor: bankAccent }, !canPlay && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Deposit Brew Tokens"
          >
            {resolving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.depositButtonText, { color: smartProSaleActive ? '#102817' : colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                {tokens === 0 ? 'RESERVE EMPTY' : protectedVoicePlaying ? 'VOICE MESSAGE PLAYING' : 'TOSS TOKENS INTO THE BANK'}
              </Text>
            )}
          </Pressable>

          <Text style={[styles.feedbackHeading, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>FEEDBACK</Text>
          <View style={[styles.feedbackRow, { borderTopColor: colors.border }]}>
            <View style={styles.feedbackLabel}>
              <Feather name="volume-2" size={15} color={colors.mutedForeground} />
              <Text style={[styles.feedbackText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>SOUND</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={value => { void onSoundEnabledChange(value); }}
              trackColor={{ false: colors.border, true: bankAccentMuted }}
              thumbColor={soundEnabled ? bankAccent : colors.mutedForeground}
              accessibilityLabel="Brew Bank celebration sound"
              accessibilityState={{ checked: soundEnabled }}
            />
          </View>
          <View style={[styles.feedbackRow, { borderTopColor: colors.border }]}>
            <View style={styles.feedbackLabel}>
              <Feather name="smartphone" size={15} color={colors.mutedForeground} />
              <Text style={[styles.feedbackText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>HAPTICS</Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={value => { void onHapticsEnabledChange(value); }}
              trackColor={{ false: colors.border, true: bankAccentMuted }}
              thumbColor={hapticsEnabled ? bankAccent : colors.mutedForeground}
              accessibilityLabel="Brew Bank haptic feedback"
              accessibilityState={{ checked: hapticsEnabled }}
            />
          </View>

          <Text style={[styles.footnote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Fictional tokens only · no cash value · earn 1 token per weekday quote · {quotesViewed} quotes logged
          </Text>
          </View>
        </ScrollView>
      </View>
      <Modal
        visible={selectedBottlePreview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          stopPreviewBottleBurst();
          setBottlePreview(null);
        }}
      >
        <View
          style={[
            styles.previewOverlay,
            {
              paddingTop: Math.max(insets.top, Constants.statusBarHeight ?? 0) + 12,
              paddingBottom: Math.max(insets.bottom, 8) + 12,
            },
          ]}
        >
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {selectedBottlePreview && (
              <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}>
                <View style={styles.previewHeader}>
                  <View style={styles.previewHeaderCopy}>
                    <Text style={[styles.previewEyebrow, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>
                      BOTTLE INSPECTION
                    </Text>
                    <Text style={[styles.previewTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {selectedBottlePreview.title}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      stopPreviewBottleBurst();
                      setBottlePreview(null);
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Close bottle inspection"
                    testID="close-bottle-inspection"
                  >
                    <Feather name="x" size={21} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                <Pressable
                  onPress={handleReplayBottlePreview}
                  disabled={!selectedBottleUnlocked}
                  style={[styles.previewBottleStage, { backgroundColor: colors.steelShadow, borderColor: selectedBottleUnlocked ? colors.goldMuted : colors.border }]}
                  accessibilityRole={selectedBottleUnlocked ? 'button' : undefined}
                  accessibilityLabel={selectedBottleUnlocked ? `Replay ${selectedBottlePreview.title} animation` : `${selectedBottlePreview.title} recipe locked`}
                  testID="replay-bottle-animation"
                >
                  {bottlePreview === 'quickRevive' && <QuickReviveBottle size={112} muted={!selectedBottleUnlocked} />}
                  {bottlePreview === 'daiquiri' && <DaiquiriBottle size={112} muted={!selectedBottleUnlocked} />}
                  {bottlePreview === 'staminUp' && <StaminUpBottle size={112} muted={!selectedBottleUnlocked} />}
                  {bottlePreview === 'smartPro' && <SmartProBottle size={112} muted={!selectedBottleUnlocked} />}
                  {quickReviveBurstVisible && bottleBurstLocation === 'preview' && bottlePreview === 'quickRevive' && (
                    <View pointerEvents="none" style={[styles.quickReviveBurst, styles.previewBurst]}>
                      <Animated.View style={[styles.quickReviveBubbleField, quickReviveBubbleFieldStyle]}>
                        <View style={[styles.quickReviveBubble, styles.quickReviveBubbleOne]} />
                        <View style={[styles.quickReviveBubble, styles.quickReviveBubbleTwo]} />
                        <View style={[styles.quickReviveBubble, styles.quickReviveBubbleThree]} />
                        <View style={[styles.quickReviveBubble, styles.quickReviveBubbleFour]} />
                      </Animated.View>
                      <Animated.View style={[styles.quickReviveBurstBottle, quickReviveBottleStyle]}>
                        <QuickReviveBottle size={72} />
                      </Animated.View>
                      <Animated.View style={[styles.quickReviveOoze, quickReviveOozeStyle]}>
                        <View style={styles.quickReviveOozeDrop} />
                        <View style={[styles.quickReviveOozeDrop, styles.quickReviveOozeDropWide]} />
                        <View style={[styles.quickReviveOozeDrop, styles.quickReviveOozeDropSmall]} />
                      </Animated.View>
                    </View>
                  )}
                  {daiquiriBurstVisible && bottleBurstLocation === 'preview' && bottlePreview === 'daiquiri' && (
                    <View pointerEvents="none" style={[styles.daiquiriBurst, styles.previewBurst]}>
                      <Animated.View style={[styles.daiquiriWarmGlow, daiquiriWarmGlowStyle]} />
                      <Animated.View style={[styles.daiquiriBubbleField, daiquiriBubbleFieldStyle]}>
                        <View style={[styles.daiquiriBubble, styles.daiquiriBubbleOne]} />
                        <View style={[styles.daiquiriBubble, styles.daiquiriBubbleTwo]} />
                        <View style={[styles.daiquiriBubble, styles.daiquiriBubbleThree]} />
                        <View style={[styles.daiquiriBubble, styles.daiquiriBubbleFour]} />
                        <View style={[styles.daiquiriBubble, styles.daiquiriBubbleFive]} />
                      </Animated.View>
                      <Animated.View style={[styles.daiquiriSurgeRing, daiquiriSurgeRingStyle]} />
                      <View style={styles.daiquiriPedestal}>
                        <View style={styles.daiquiriPedestalTop} />
                        <View style={styles.daiquiriPedestalBody} />
                      </View>
                      <Animated.View style={[styles.daiquiriBurstBottle, daiquiriBottleStyle]}>
                        <DaiquiriBottle size={74} />
                      </Animated.View>
                      <Animated.View style={[styles.daiquiriLabelFlare, daiquiriLabelFlareStyle]} />
                      <Animated.View style={[styles.daiquiriSplash, daiquiriSplashStyle]}>
                        <View style={styles.daiquiriSplashDrop} />
                        <View style={[styles.daiquiriSplashDrop, styles.daiquiriSplashDropWide]} />
                        <View style={[styles.daiquiriSplashDrop, styles.daiquiriSplashDropSmall]} />
                      </Animated.View>
                    </View>
                  )}
                  {staminUpBurstVisible && bottleBurstLocation === 'preview' && bottlePreview === 'staminUp' && (
                    <View pointerEvents="none" style={[styles.staminUpBurst, styles.previewBurst]}>
                      <Animated.View style={[styles.staminUpTornadoRing, styles.staminUpTornadoUpper, staminUpTornadoUpperStyle]} />
                      <Animated.View style={[styles.staminUpTornadoRing, styles.staminUpTornadoMiddle, staminUpTornadoMiddleStyle]} />
                      <Animated.View style={[styles.staminUpTornadoRing, styles.staminUpTornadoBase, staminUpTornadoBaseStyle]} />
                      <Animated.View style={[styles.quickReviveBurstBottle, staminUpBottleStyle]}>
                        <StaminUpBottle size={74} />
                      </Animated.View>
                      <Animated.View style={[styles.staminUpSplash, staminUpSplashStyle]}>
                        <View style={styles.staminUpSplashDrop} />
                        <View style={[styles.staminUpSplashDrop, styles.staminUpSplashDropWide]} />
                        <View style={[styles.staminUpSplashDrop, styles.staminUpSplashDropSmall]} />
                      </Animated.View>
                    </View>
                  )}
                  {smartProBurstVisible && bottleBurstLocation === 'preview' && bottlePreview === 'smartPro' && (
                    <View pointerEvents="none" style={[styles.smartProBurst, styles.previewBurst]}>
                      <Animated.View style={[styles.smartProHalo, smartProHaloStyle]} />
                      <Animated.View style={[styles.smartProBubbleField, smartProBubbleFieldStyle]}>
                        <View style={[styles.smartProBubble, styles.smartProBubbleOne]} />
                        <View style={[styles.smartProBubble, styles.smartProBubbleTwo]} />
                        <View style={[styles.smartProBubble, styles.smartProBubbleThree]} />
                        <View style={[styles.smartProBubble, styles.smartProBubbleFour]} />
                        <View style={[styles.smartProBubble, styles.smartProBubbleFive]} />
                      </Animated.View>
                      <Animated.View style={[styles.smartProSpark, smartProSparkStyle]}>
                        <Feather name="zap" size={42} color="#f6ffdf" />
                      </Animated.View>
                      <Animated.View style={[styles.quickReviveBurstBottle, smartProBottleStyle]}>
                        <SmartProBottle size={74} />
                      </Animated.View>
                    </View>
                  )}
                  <View pointerEvents="none" style={styles.previewBottleHint}>
                    <Feather name={selectedBottleUnlocked ? 'play-circle' : 'lock'} size={12} color={selectedBottleUnlocked ? colors.gold : colors.mutedForeground} />
                    <Text style={[styles.previewBottleHintText, { color: selectedBottleUnlocked ? colors.gold : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {selectedBottleUnlocked ? 'TAP TO REPLAY ANIMATION' : 'RECIPE LOCKED'}
                    </Text>
                  </View>
                </Pressable>

                <Text style={[styles.previewDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {selectedBottlePreview.description}
                </Text>

                <View style={[styles.previewDetails, { borderColor: colors.border }]}>
                  <View style={styles.previewDetailRow}>
                    <Text style={[styles.previewDetailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>RECIPE UNLOCK</Text>
                    <Text style={[styles.previewDetailValue, { color: selectedBottleUnlocked ? colors.buyColor : colors.gold, fontFamily: 'Inter_700Bold' }]}>
                      {selectedBottlePreview.unlockPrice} TOKENS{selectedBottleUnlocked ? ' · UNLOCKED' : ''}
                    </Text>
                  </View>
                  <View style={[styles.previewDetailDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.previewDetailRow}>
                    <Text style={[styles.previewDetailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>BOTTLE COST</Text>
                    <Text style={[styles.previewDetailValue, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                      {selectedBottlePreview.bottlePrice} TOKENS
                    </Text>
                  </View>
                  <View style={[styles.previewDetailDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.previewDetailRow}>
                    <Text style={[styles.previewDetailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TOSS ODDS</Text>
                    <Text style={[styles.previewDetailValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {Math.round(selectedBottlePreview.winProbability * 100)}% WIN · {Math.round(selectedBottlePreview.lossProbability * 100)}% LOSS
                    </Text>
                  </View>
                  <View style={[styles.previewDetailDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.previewDetailRow}>
                    <Text style={[styles.previewDetailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>INVENTORY</Text>
                    <Text style={[styles.previewDetailValue, { color: selectedBottleUnlocked ? colors.gold : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {selectedBottleUnlocked ? `${selectedBottleCount} ${selectedBottleCount === 1 ? 'BOTTLE' : 'BOTTLES'}` : 'LOCKED'}
                    </Text>
                  </View>
                  <View style={[styles.previewDetailDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.previewDetailRow}>
                    <Text style={[styles.previewDetailLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>STATUS</Text>
                    <Text style={[styles.previewDetailValue, { color: selectedBottleArmed ? colors.buyColor : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {selectedBottleArmed
                        ? bottlePreview === 'smartPro' ? '90-SECOND SALE ACTIVE' : 'ARMED FOR NEXT TOSS'
                        : selectedBottleUnlocked ? 'READY TO REDEEM' : 'RECIPE LOCKED'}
                    </Text>
                  </View>
                </View>

                {selectedBottlePreview.conversionCopy && (
                  <View style={[styles.previewConversion, { backgroundColor: colors.steelShadow, borderColor: bottlePreview === 'smartPro' ? '#78c84b' : '#b36321' }]}>
                    <Feather name={bottlePreview === 'smartPro' ? 'zap' : 'moon'} size={15} color={bottlePreview === 'smartPro' ? '#b9ff45' : '#f29b38'} />
                    <Text style={[styles.previewConversionText, { fontFamily: 'Inter_500Medium' }]}>
                      {selectedBottlePreview.conversionCopy}
                    </Text>
                  </View>
                )}

                <Text style={[styles.previewSafetyNote, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  INSPECTION ONLY · NOTHING SPENT OR CONSUMED
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  modalScroll: { width: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 4 },
  shell: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17 },
  headerCopy: { gap: 2 },
  eyebrow: { fontSize: 9, letterSpacing: 1.2 },
  title: { fontSize: 19, letterSpacing: 1.1, marginTop: 2 },
  subtitle: { fontSize: 11, letterSpacing: 2.5 },
  smartProSaleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#efffe6',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: -6,
    marginBottom: 12,
  },
  smartProSaleBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#b9ff45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartProSaleBannerCopy: { flex: 1, gap: 2 },
  smartProSaleBannerTitle: { color: '#12351d', fontSize: 12, letterSpacing: 0.8 },
  smartProSaleBannerText: { color: '#31523b', fontSize: 8, letterSpacing: 0.45, lineHeight: 12 },
  vault: { alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 16, overflow: 'hidden' },
  vaultPerspectiveFrame: { position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, borderRadius: 8, overflow: 'hidden' },
  vaultBackplate: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1, borderRadius: 7, opacity: 0.78 },
  vaultTopDepth: { position: 'absolute', top: 0, left: 14, right: 14, height: 5, borderRadius: 3, opacity: 0.85 },
  vaultLeftDepth: { position: 'absolute', top: 12, bottom: 12, left: 0, width: 5, borderRadius: 3, opacity: 0.6 },
  vaultRightDepth: { position: 'absolute', top: 12, bottom: 12, right: 0, width: 5, borderRadius: 3, opacity: 0.35 },
  vaultSheen: { position: 'absolute', top: -20, bottom: -20, width: 34, transform: [{ rotateZ: '16deg' }], opacity: 0.2 },
  vaultRivet: { position: 'absolute', width: 5, height: 5, borderRadius: 3, opacity: 0.9 },
  vaultRivetTopLeft: { top: 8, left: 8 },
  vaultRivetTopRight: { top: 8, right: 8 },
  vaultRivetBottomLeft: { bottom: 8, left: 8 },
  vaultRivetBottomRight: { bottom: 8, right: 8 },
  vaultGlow: { position: 'absolute', top: 12, width: 128, height: 128, borderRadius: 64 },
  vaultFloorShadow: { position: 'absolute', bottom: 21, width: 86, height: 10, borderRadius: 43, opacity: 0.42, transform: [{ scaleX: 1.35 }] },
  quickReviveBurst: { position: 'absolute', top: 10, bottom: 8, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  quickReviveBurstBottle: { position: 'absolute', top: 3 },
  quickReviveBubbleField: { position: 'absolute', top: 26, width: 118, height: 104 },
  quickReviveBubble: { position: 'absolute', borderRadius: 99, borderWidth: 1, borderColor: '#d9ffff', backgroundColor: 'rgba(26,174,242,0.3)', shadowColor: '#35ccff', shadowOpacity: 0.95, shadowRadius: 8, elevation: 5 },
  quickReviveBubbleOne: { width: 18, height: 18, left: 7, top: 54 },
  quickReviveBubbleTwo: { width: 10, height: 10, right: 8, top: 60 },
  quickReviveBubbleThree: { width: 13, height: 13, left: 25, top: 10 },
  quickReviveBubbleFour: { width: 8, height: 8, right: 28, top: 21 },
  quickReviveOoze: { position: 'absolute', top: 63, flexDirection: 'row', alignItems: 'center', gap: 5 },
  quickReviveOozeDrop: { width: 26, height: 17, borderRadius: 13, backgroundColor: '#168df2', shadowColor: '#168df2', shadowOpacity: 0.9, shadowRadius: 9, elevation: 6 },
  quickReviveOozeDropWide: { width: 39, height: 11, opacity: 0.82 },
  quickReviveOozeDropSmall: { width: 12, height: 12, opacity: 0.72 },
  daiquiriBurst: { position: 'absolute', top: 10, bottom: 8, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
   daiquiriWarmGlow: { position: 'absolute', top: 13, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(246,214,74,0.28)', shadowColor: '#f6d64a', shadowOpacity: 0.92, shadowRadius: 24, elevation: 10 },
   daiquiriBubbleField: { position: 'absolute', top: 12, width: 132, height: 155 },
   daiquiriBubble: { position: 'absolute', borderRadius: 99, borderWidth: 1, borderColor: '#fff0a0', backgroundColor: 'rgba(255,233,121,0.2)', shadowColor: '#f6d64a', shadowOpacity: 0.88, shadowRadius: 7, elevation: 5 },
   daiquiriBubbleOne: { width: 12, height: 12, left: 12, top: 91 },
   daiquiriBubbleTwo: { width: 7, height: 7, left: 35, top: 56 },
   daiquiriBubbleThree: { width: 15, height: 15, right: 13, top: 83 },
   daiquiriBubbleFour: { width: 8, height: 8, right: 39, top: 31 },
   daiquiriBubbleFive: { width: 10, height: 10, left: 55, top: 11 },
   daiquiriSurgeRing: { position: 'absolute', top: 81, width: 82, height: 24, borderWidth: 1.5, borderColor: '#ffe979', borderRadius: 42, backgroundColor: 'rgba(246,214,74,0.1)', shadowColor: '#f6d64a', shadowOpacity: 0.9, shadowRadius: 9, elevation: 6 },
   daiquiriPedestal: { position: 'absolute', top: 84, width: 104, height: 22, alignItems: 'center', zIndex: 1 },
   daiquiriPedestalTop: { position: 'absolute', top: 0, width: 104, height: 10, borderWidth: 1, borderColor: '#e4c45b', borderRadius: 52, backgroundColor: '#3b4a55', shadowColor: '#f6d64a', shadowOpacity: 0.65, shadowRadius: 7, elevation: 5 },
   daiquiriPedestalBody: { position: 'absolute', top: 5, width: 82, height: 17, borderWidth: 1, borderColor: '#7f8e96', borderRadius: 5, backgroundColor: '#111b25', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 5, elevation: 4 },
   daiquiriBurstBottle: { position: 'absolute', top: 3, zIndex: 2 },
   daiquiriLabelFlare: { position: 'absolute', top: 34, width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, borderColor: '#fff1a3', shadowColor: '#f6d64a', shadowOpacity: 0.96, shadowRadius: 13, elevation: 7 },
   daiquiriSplash: { position: 'absolute', top: 91, flexDirection: 'row', gap: 6, alignItems: 'center' },
   daiquiriSplashDrop: { width: 7, height: 16, borderRadius: 8, backgroundColor: '#ffe979', shadowColor: '#f6d64a', shadowOpacity: 0.95, shadowRadius: 8, elevation: 6 },
   daiquiriSplashDropWide: { width: 40, height: 9, opacity: 0.84 },
   daiquiriSplashDropSmall: { width: 12, height: 12, opacity: 0.72 },
  staminUpBurst: { position: 'absolute', top: 5, bottom: 6, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  staminUpTornadoRing: { position: 'absolute', height: 11, borderWidth: 2, borderColor: '#ffc169', borderRadius: 22, backgroundColor: 'rgba(242,138,28,0.14)', shadowColor: '#f28a1c', shadowOpacity: 0.8, shadowRadius: 7, elevation: 5 },
  staminUpTornadoUpper: { top: 20, width: 30 },
  staminUpTornadoMiddle: { top: 47, width: 38 },
  staminUpTornadoBase: { top: 73, width: 45 },
  staminUpSplash: { position: 'absolute', top: 75, flexDirection: 'row', gap: 5, alignItems: 'center' },
  staminUpSplashDrop: { width: 27, height: 17, borderRadius: 14, backgroundColor: '#f28a1c', borderWidth: 1, borderColor: '#ffdf77', shadowColor: '#f28a1c', shadowOpacity: 0.95, shadowRadius: 9, elevation: 6 },
  staminUpSplashDropWide: { width: 43, height: 11, opacity: 0.84 },
  staminUpSplashDropSmall: { width: 13, height: 13, opacity: 0.76 },
  smartProBurst: { position: 'absolute', top: 5, bottom: 6, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  smartProHalo: {
    position: 'absolute',
    top: 7,
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 2,
    borderColor: '#b9ff45',
    backgroundColor: 'rgba(185,255,69,0.12)',
    shadowColor: '#9dff39',
    shadowOpacity: 0.95,
    shadowRadius: 20,
    elevation: 9,
  },
  smartProBubbleField: { position: 'absolute', top: 7, width: 132, height: 150 },
  smartProBubble: {
    position: 'absolute',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#efffdc',
    backgroundColor: 'rgba(185,255,69,0.27)',
    shadowColor: '#a6ff3e',
    shadowOpacity: 0.92,
    shadowRadius: 8,
    elevation: 6,
  },
  smartProBubbleOne: { width: 13, height: 13, left: 9, top: 82 },
  smartProBubbleTwo: { width: 8, height: 8, left: 37, top: 42 },
  smartProBubbleThree: { width: 16, height: 16, right: 10, top: 79 },
  smartProBubbleFour: { width: 9, height: 9, right: 35, top: 28 },
  smartProBubbleFive: { width: 7, height: 7, left: 61, top: 4 },
  smartProSpark: {
    position: 'absolute',
    top: 43,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(185,255,69,0.14)',
    shadowColor: '#b9ff45',
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 8,
  },
  slotMachine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, height: SLOT_REEL_HEIGHT, marginBottom: 11 },
  reelWindow: { width: 64, height: SLOT_REEL_HEIGHT, borderWidth: 1, borderRadius: 9, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.22)' },
  reelSymbol: { width: 64, height: SLOT_REEL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  vaultLabel: { fontSize: 9, letterSpacing: 1.3 },
  balance: { fontSize: 35, lineHeight: 40, marginTop: 2 },
  balanceLabel: { fontSize: 9, letterSpacing: 1.1 },
  darkBrewBalance: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(242,138,28,0.12)', borderWidth: 1, borderColor: '#b36321' },
  darkBrewBalanceText: { color: '#ffc169', fontSize: 8, letterSpacing: 0.8 },
  skipVoiceHint: { fontSize: 8, letterSpacing: 0.8, marginTop: 9 },
  machineStatus: { fontSize: 8, letterSpacing: 1.15, marginTop: 9 },
  armedStatus: { minHeight: 53, borderWidth: 1, borderRadius: 9, marginTop: 16, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  armedStatusIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  armedStatusCopy: { flex: 1, gap: 3 },
  armedStatusTitle: { fontSize: 9, letterSpacing: 0.65 },
  armedStatusDetail: { fontSize: 8, lineHeight: 12, letterSpacing: 0.2 },
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  shopToggle: { minHeight: 44, borderWidth: 1, borderRadius: 9, marginTop: 14, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shopToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopToggleText: { fontSize: 10, letterSpacing: 0.8 },
  keyCount: { fontSize: 15 },
  shopPanel: { borderWidth: 1, borderRadius: 9, marginTop: 8, padding: 12 },
  labHeader: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  labHeaderIcon: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  labHeaderCopy: { flex: 1, gap: 2 },
  labHeaderTitle: { fontSize: 10, letterSpacing: 1 },
  labHeaderSubtitle: { fontSize: 7, letterSpacing: 0.45 },
  labHeaderBalance: { fontSize: 8, letterSpacing: 0.5 },
  shopHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  shopTitle: { fontSize: 11, letterSpacing: 0.8 },
  shopDescription: { fontSize: 10, lineHeight: 15, marginTop: 4, maxWidth: 270 },
  bottleSpecRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 7 },
  bottleSpec: { fontSize: 8, letterSpacing: 0.45 },
  bottleInspectButton: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 2 },
  inventoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 },
  inventoryLabel: { fontSize: 9, letterSpacing: 0.9 },
  inventoryValue: { fontSize: 13 },
  accessStatus: { fontSize: 9, letterSpacing: 0.6, marginTop: 9 },
  shopActions: { gap: 8, marginTop: 12 },
  shopButton: { minHeight: 38, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  shopButtonText: { fontSize: 10, letterSpacing: 0.5 },
  quickReviveShop: { borderTopWidth: 1, marginTop: 14, paddingTop: 13 },
  quickReviveShopCopy: { flex: 1 },
  smartProShop: { backgroundColor: 'rgba(116,199,70,0.055)' },
  phrasePackShop: { backgroundColor: 'rgba(158,98,201,0.055)' },
  phrasePackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  phrasePackPill: { borderRadius: 9, backgroundColor: 'rgba(158,98,201,0.2)', paddingHorizontal: 6, paddingVertical: 2 },
  phrasePackPillText: { color: '#e2b8ff', fontSize: 7, letterSpacing: 0.6 },
  phrasePackDetails: { gap: 10, marginTop: 11 },
  phrasePackDetailsText: { fontSize: 10, lineHeight: 15 },
  phrasePackToggleRow: { minHeight: 54, borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  phrasePackToggleCopy: { flex: 1, gap: 3 },
  phrasePackToggleTitle: { fontSize: 9, letterSpacing: 0.6 },
  phrasePackToggleSubtitle: { fontSize: 9 },
  smartProTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  smartProNewPill: { borderRadius: 9, backgroundColor: '#b9ff45', paddingHorizontal: 6, paddingVertical: 2 },
  smartProNewPillText: { color: '#17361c', fontSize: 7, letterSpacing: 0.6 },
  shopMessage: { fontSize: 9, letterSpacing: 0.7, textAlign: 'center', marginTop: 10 },
  activityToggle: { minHeight: 44, borderWidth: 1, borderRadius: 9, marginTop: 8, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityCount: { fontSize: 8, letterSpacing: 0.6 },
  activityPanel: { borderWidth: 1, borderRadius: 9, marginTop: 8, paddingHorizontal: 12, paddingVertical: 2 },
  activityEmpty: { fontSize: 10, lineHeight: 15, paddingVertical: 12 },
  activityRow: { minHeight: 48, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityCopy: { flex: 1, gap: 2 },
  activityLabel: { fontSize: 8, letterSpacing: 0.45 },
  activityDetail: { fontSize: 9 },
  activityTime: { fontSize: 8 },
  sectionLabel: { fontSize: 9, letterSpacing: 1 },
  betValue: { fontSize: 18, marginTop: 3 },
  stepper: { flexDirection: 'row', gap: 7 },
  stepButton: { width: 36, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  quickReviveArm: { minHeight: 58, borderWidth: 1, borderRadius: 9, marginTop: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  quickReviveArmCopy: { flex: 1, gap: 3 },
  quickReviveArmTitle: { fontSize: 9, letterSpacing: 0.55 },
  quickReviveArmDescription: { fontSize: 8, lineHeight: 12, letterSpacing: 0.15 },
  smartProArm: { shadowColor: '#9dff39', shadowOpacity: 0.24, shadowRadius: 10, elevation: 3 },
  disabled: { opacity: 0.4 },
  payoutPreview: { borderWidth: 1, borderRadius: 9, marginTop: 13, paddingVertical: 10, paddingHorizontal: 12 },
  payoutToggle: { minHeight: 36, borderWidth: 1, borderRadius: 9, marginTop: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payoutToggleOpen: { borderBottomLeftRadius: 5, borderBottomRightRadius: 5, marginBottom: -13 },
  payoutHeading: { fontSize: 8, letterSpacing: 1.05, marginBottom: 8 },
  payoutColumns: { flexDirection: 'row', alignItems: 'center' },
  payoutColumn: { flex: 1, alignItems: 'center' },
  payoutDivider: { height: 30, width: 1 },
  payoutLabel: { fontSize: 8, letterSpacing: 0.9 },
  payoutValue: { fontSize: 19, lineHeight: 23, marginTop: 1 },
  payoutUnit: { fontSize: 8, letterSpacing: 0.7 },
  rules: { fontSize: 11, lineHeight: 17, marginTop: 10 },
  emptyMessage: { fontSize: 11, lineHeight: 17, marginTop: 12 },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginTop: 12 },
  resultCopy: { flex: 1, gap: 3 },
  resultHeadline: { fontSize: 11, letterSpacing: 1 },
  result: { fontSize: 12, letterSpacing: 0.35 },
  resultHint: { fontSize: 9, lineHeight: 13, marginTop: 1 },
  depositButton: { minHeight: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 17, paddingHorizontal: 12 },
  depositButtonText: { fontSize: 11, letterSpacing: 0.7, textAlign: 'center' },
  feedbackHeading: { fontSize: 9, letterSpacing: 1, marginTop: 18 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42, borderTopWidth: 1 },
  feedbackLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackText: { fontSize: 10, letterSpacing: 0.8 },
  footnote: { fontSize: 9, textAlign: 'center', marginTop: 13 },
  previewOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, backgroundColor: 'rgba(0,0,0,0.9)' },
  previewScroll: { width: '100%' },
  previewScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 4 },
  previewCard: { width: '100%', maxWidth: 460, alignSelf: 'center', borderWidth: 1, borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 16 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 13 },
  previewHeaderCopy: { gap: 3 },
  previewEyebrow: { fontSize: 9, letterSpacing: 1.2 },
  previewTitle: { fontSize: 18, letterSpacing: 0.9 },
  previewBottleStage: { minHeight: 245, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  previewBurst: { transform: [{ scale: 1.45 }] },
  previewBottleHint: { position: 'absolute', left: 10, right: 10, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 5, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.42)' },
  previewBottleHintText: { fontSize: 8, letterSpacing: 0.9 },
  previewDescription: { fontSize: 11, lineHeight: 17, marginTop: 13 },
  previewDetails: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 3, marginTop: 13 },
  previewDetailRow: { minHeight: 38, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  previewDetailLabel: { fontSize: 8, letterSpacing: 0.8 },
  previewDetailValue: { fontSize: 10, textAlign: 'right', flexShrink: 1 },
  previewDetailDivider: { height: 1, width: '100%' },
  previewConversion: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, marginTop: 12 },
  previewConversionText: { flex: 1, color: '#ffc169', fontSize: 10, lineHeight: 15 },
  previewSafetyNote: { fontSize: 8, letterSpacing: 0.8, textAlign: 'center', marginTop: 14 },
});
