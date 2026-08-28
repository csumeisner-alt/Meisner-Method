import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
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
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { ColorScheme } from '@/constants/colors';
import {
  BREW_BANK_KEY_PRICE,
  DAIQUIRI_BOTTLE_PRICE,
  DAIQUIRI_LOSS_PROBABILITY,
  DAIQUIRI_PAYOUT_MULTIPLIER,
  DAIQUIRI_UNLOCK_PRICE,
  QUICK_REVIVE_BOTTLE_PRICE,
  QUICK_REVIVE_UNLOCK_PRICE,
  STAMIN_UP_BOTTLE_PRICE,
  STAMIN_UP_UNLOCK_PRICE,
  type BrewBetEffect,
  formatBrewBankAccessRemaining,
  getDaiquiriWinProbability,
  getBrewWinProbability,
  hasBrewBankAccess,
  isWeekday,
} from '@/lib/brewTokenLogic';

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
  const glass = muted ? '#617b8a' : '#a9f0ff';
  const liquid = muted ? '#345a75' : '#1aaef2';
  const label = muted ? '#274d68' : '#086cae';
  const labelInk = muted ? '#90a5af' : '#dffaff';
  const cap = muted ? '#263d50' : '#061d38';
  return (
    <Svg width={size} height={size * 1.34} viewBox="0 0 60 80" accessibilityLabel="Quick Revive glowing blue soda bottle">
      <Path d="M23 4h14v10l5 7v45c0 6-5 10-12 10s-12-4-12-10V21l5-7V4Z" fill="rgba(184,244,255,0.16)" stroke={glass} strokeWidth="2.2" />
      <Path d="M21 27h18v39c0 4-3.3 7-9 7s-9-3-9-7V27Z" fill={liquid} opacity={muted ? 0.56 : 0.94} />
      <Path d="M23 19h14l2 13H21l2-13Z" fill={label} opacity={muted ? 0.74 : 0.94} />
      <Path d="M25 4h10v5H25z" fill={cap} />
      <Path d="M24 7h12" stroke={glass} strokeWidth="1.2" opacity="0.7" />
      <Path d="M23 22h14" stroke={glass} strokeWidth="1.3" opacity="0.72" />
      <Circle cx="30" cy="25.5" r="3.2" fill="none" stroke={labelInk} strokeWidth="1" opacity="0.9" />
      <Path d="M27.3 25.5h5.4M30 22.8v5.4" stroke={labelInk} strokeWidth="0.8" opacity="0.8" />
      <Circle cx="30" cy="50" r="13.5" fill={label} stroke={labelInk} strokeWidth="1.4" opacity={muted ? 0.75 : 0.98} />
      <SvgText x="30" y="42" fill={labelInk} fontSize="5.2" fontWeight="700" textAnchor="middle" letterSpacing="0.35">REVIVE</SvgText>
      <Path d="M25.5 48l4.5-2.5 4.5 2.5v5.3c0 3-4.5 5.2-4.5 5.2s-4.5-2.2-4.5-5.2V48Z" fill="none" stroke={labelInk} strokeWidth="1.3" />
      <Path d="M27.8 52.5h4.4M30 49.5v6" stroke={labelInk} strokeWidth="1.1" strokeLinecap="round" />
      <SvgText x="30" y="63" fill={labelInk} fontSize="4.3" fontWeight="600" textAnchor="middle" letterSpacing="0.25">SODA</SvgText>
      <Circle cx="24.5" cy="35" r="1.1" fill="#e8ffff" opacity={muted ? 0.35 : 0.9} />
      <Circle cx="35.5" cy="37" r="0.8" fill="#e8ffff" opacity={muted ? 0.3 : 0.8} />
      <Circle cx="25.5" cy="68" r="0.75" fill="#f1ffff" opacity={muted ? 0.3 : 0.86} />
      <Circle cx="34.5" cy="69" r="1.1" fill="#f1ffff" opacity={muted ? 0.25 : 0.8} />
      <Circle cx="29" cy="33.5" r="0.65" fill="#fff" opacity={muted ? 0.28 : 0.82} />
      <Circle cx="33" cy="34.5" r="0.45" fill="#fff" opacity={muted ? 0.25 : 0.76} />
      <Path d="M23 31c-1 8-1 24 1 34" stroke="#efffff" strokeOpacity={muted ? 0.26 : 0.58} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M21 61c5 2 13 2 18 0" stroke="#e5ffff" strokeOpacity={muted ? 0.38 : 0.78} strokeWidth="1.2" />
    </Svg>
  );
}

function DaiquiriBottle({ size = 54, muted = false }: { size?: number; muted?: boolean }) {
  const glass = muted ? '#77808b' : '#b9eaff';
  const yellow = muted ? '#6e6940' : '#f6d64a';
  const blue = muted ? '#4f6572' : '#69c8ff';
  const cap = muted ? '#58616b' : '#d7eefb';
  return (
    <Svg width={size} height={size * 1.34} viewBox="0 0 60 80" accessibilityLabel="Dave Ramsey Daiquiri light blue bottle with yellow liquid and white D">
      <Path d="M23 4h14v10l5 7v45c0 6-5 10-12 10s-12-4-12-10V21l5-7V4Z" fill="rgba(205,244,255,0.14)" stroke={glass} strokeWidth="2.2" />
      <Path d="M21 37h18v29c0 4-3.3 7-9 7s-9-3-9-7V37Z" fill={yellow} opacity={muted ? 0.48 : 0.92} />
      <Path d="M21 37h18v10H21z" fill={blue} opacity={muted ? 0.44 : 0.8} />
      <Path d="M25 4h10v5H25z" fill={cap} />
      <Path d="M23 22h14" stroke={glass} strokeWidth="1.5" opacity="0.85" />
      <Path d="M25 29h5.4c5.2 0 7.6 2.5 7.6 6.3 0 3.9-2.4 6.5-7.6 6.5H25V29Zm4 3.4v6h1.2c2.4 0 3.6-1.1 3.6-3.1 0-1.9-1.2-2.9-3.6-2.9H29Z" fill="#fff" />
      <Path d="M21 61c5 2 13 2 18 0" stroke="#fff5ad" strokeOpacity="0.7" strokeWidth="1.2" />
    </Svg>
  );
}

function StaminUpBottle({ size = 54, muted = false }: { size?: number; muted?: boolean }) {
  const glass = muted ? '#85755d' : '#ffd08a';
  const liquid = muted ? '#7f5426' : '#f28a1c';
  const highlight = muted ? '#9f7e47' : '#ffd35c';
  const cap = muted ? '#786443' : '#ffe55c';
  return (
    <Svg width={size} height={size * 1.34} viewBox="0 0 60 80" accessibilityLabel="Stamin Up amber orange glass soda bottle">
      <Path d="M23 4h14v10l5 7v45c0 6-5 10-12 10s-12-4-12-10V21l5-7V4Z" fill="rgba(255,221,153,0.14)" stroke={glass} strokeWidth="2.2" />
      <Path d="M21 33h18v33c0 4-3.3 7-9 7s-9-3-9-7V33Z" fill={liquid} opacity={muted ? 0.52 : 0.9} />
      <Path d="M25 4h10v5H25z" fill={cap} />
      <Path d="M24 7h12" stroke="#6e5317" strokeWidth="1.1" opacity="0.7" />
      <Path d="M23 22h14" stroke={glass} strokeWidth="1.5" opacity="0.86" />
      <Circle cx="30" cy="49" r="10.5" fill="#e67b17" stroke={highlight} strokeWidth="1.4" />
      <Path d="M21.5 49h17" stroke={highlight} strokeWidth="0.9" opacity="0.75" />
      <Path d="M25 45c2-2.4 8-2.4 10 0M25 53c2 2.4 8 2.4 10 0" fill="none" stroke="#fff5c6" strokeWidth="1" />
      <Path d="M28 44l5 5-5 5M32 44l-5 5 5 5" fill="none" stroke="#fff" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M23 61c5 2 13 2 18 0" stroke="#ffec9d" strokeOpacity="0.75" strokeWidth="1.2" />
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
  darkBrewTokens: number;
  onClose: () => void;
  onResolveBet: (bet: number, won: boolean, effect?: BrewBetEffect) => Promise<void>;
  onSoundEnabledChange: (value: boolean) => Promise<void>;
  onHapticsEnabledChange: (value: boolean) => Promise<void>;
  onBuyBankKey: () => Promise<boolean>;
  onActivateBankKey: () => Promise<boolean>;
  onUnlockQuickRevive: () => Promise<boolean>;
  onBuyQuickReviveBottle: () => Promise<boolean>;
  onRedeemQuickRevive: () => Promise<boolean>;
  onUnlockDaiquiri: () => Promise<boolean>;
  onBuyDaiquiriBottle: () => Promise<boolean>;
  onRedeemDaiquiri: () => Promise<boolean>;
  onUnlockStaminUp: () => Promise<boolean>;
  onBuyStaminUpBottle: () => Promise<boolean>;
  onRedeemStaminUp: () => Promise<boolean>;
};

type AudioPlayerHandle = {
  play: () => void;
  remove: () => void;
};

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
  darkBrewTokens,
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
  const [payoutPreviewOpen, setPayoutPreviewOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState<string | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [quickReviveBurstVisible, setQuickReviveBurstVisible] = useState(false);
  const [daiquiriBurstVisible, setDaiquiriBurstVisible] = useState(false);
  const [staminUpBurstVisible, setStaminUpBurstVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const balanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const machineStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lossVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const machineSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const reelStopTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const quickReviveBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daiquiriBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staminUpBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coinProgress = useSharedValue(0);
  const vaultPulse = useSharedValue(0);
  const resultProgress = useSharedValue(0);
  const reelOnePosition = useSharedValue(0);
  const reelTwoPosition = useSharedValue(0);
  const reelThreePosition = useSharedValue(0);
  const quickReviveProgress = useSharedValue(0);
  const daiquiriProgress = useSharedValue(0);
  const staminUpProgress = useSharedValue(0);

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

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    if (quickReviveBurstTimerRef.current) clearTimeout(quickReviveBurstTimerRef.current);
    if (daiquiriBurstTimerRef.current) clearTimeout(daiquiriBurstTimerRef.current);
    if (staminUpBurstTimerRef.current) clearTimeout(staminUpBurstTimerRef.current);
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
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
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
      { translateY: interpolate(daiquiriProgress.value, [0, 0.4, 1], [0, -12, 14]) },
      { rotateZ: `${interpolate(daiquiriProgress.value, [0, 0.38, 1], [14, -22])}deg` },
      { scale: interpolate(daiquiriProgress.value, [0, 0.5, 1], [0.9, 1.12, 0.58]) },
    ],
  }));
  const daiquiriOozeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(daiquiriProgress.value, [0, 0.35, 0.55, 1], [0, 0, 0.95, 0]),
    transform: [
      { translateY: interpolate(daiquiriProgress.value, [0, 0.55, 1], [-18, 4, 35]) },
      { scaleX: interpolate(daiquiriProgress.value, [0, 0.55, 1], [0.45, 1.16, 1.6]) },
      { scaleY: interpolate(daiquiriProgress.value, [0, 0.55, 1], [0.3, 1.08, 0.72]) },
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

  const bet = Math.min(Math.max(selectedBet, 1), Math.max(tokens, 1));
  const canPlay = tokens > 0 && !resolving && !protectedVoicePlaying;
  const bankAccessActive = hasBrewBankAccess(bankAccessExpiresAt, countdownNow);
  const canActivateKey = isWeekday(new Date().getDay()) && bankKeys > 0 && !bankAccessActive && !resolving;
  const activeWinProbability = daiquiriArmed
    ? getDaiquiriWinProbability(true)
    : getBrewWinProbability(quickReviveArmed);
  const activeOddsLabel = `${Math.round(activeWinProbability * 100)}%`;

  const handleBuyKey = async () => {
    if (tokens < BREW_BANK_KEY_PRICE || resolving || shopBusy) return;
    setShopBusy(true);
    const purchased = await onBuyBankKey();
    setShopMessage(purchased ? 'KEY ADDED TO INVENTORY' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
  };

  const handleActivateKey = async () => {
    if (!canActivateKey || shopBusy) return;
    setShopBusy(true);
    const activated = await onActivateBankKey();
    setShopMessage(activated ? 'ACCESS GRANTED FOR 12 HOURS' : 'KEYS CAN ONLY BE ACTIVATED ON WEEKDAYS');
    setShopBusy(false);
  };

  const handleUnlockQuickRevive = async () => {
    if (tokens < QUICK_REVIVE_UNLOCK_PRICE || quickReviveUnlocked || resolving || shopBusy) return;
    setShopBusy(true);
    const unlocked = await onUnlockQuickRevive();
    setShopMessage(unlocked ? 'QUICK REVIVE UNLOCKED · BOTTLES ARE NOW 2 TOKENS' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
  };

  const handleBuyQuickReviveBottle = async () => {
    if (!quickReviveUnlocked || tokens < QUICK_REVIVE_BOTTLE_PRICE || resolving || shopBusy) return;
    setShopBusy(true);
    const purchased = await onBuyQuickReviveBottle();
    setShopMessage(purchased ? 'QUICK REVIVE BOTTLE ADDED TO INVENTORY' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
  };

  const handleRedeemQuickRevive = async () => {
    if (!quickReviveUnlocked || quickReviveBottles < 1 || quickReviveArmed || daiquiriArmed || staminUpArmed || resolving || shopBusy) return;
    setShopBusy(true);
    const redeemed = await onRedeemQuickRevive();
    setShopBusy(false);
    if (!redeemed) return;

    setShopMessage('QUICK REVIVE ARMED · NEXT TOSS HAS 62% ODDS');
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    if (quickReviveBurstTimerRef.current) clearTimeout(quickReviveBurstTimerRef.current);
    setQuickReviveBurstVisible(true);
    quickReviveProgress.value = 0;
    quickReviveProgress.value = reduceMotion
      ? withTiming(1, { duration: 160 })
      : withSequence(
        withTiming(0.43, { duration: 240, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 980, easing: Easing.inOut(Easing.cubic) }),
      );
    quickReviveBurstTimerRef.current = setTimeout(
      () => setQuickReviveBurstVisible(false),
      reduceMotion ? 220 : 1_380,
    );
    void playQuickReviveVoice();
  };

  const handleUnlockDaiquiri = async () => {
    if (tokens < DAIQUIRI_UNLOCK_PRICE || daiquiriUnlocked || resolving || shopBusy) return;
    setShopBusy(true);
    const unlocked = await onUnlockDaiquiri();
    setShopMessage(unlocked ? 'DAIQUIRI UNLOCKED · BOTTLES ARE NOW 8 TOKENS' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
  };

  const handleBuyDaiquiriBottle = async () => {
    if (!daiquiriUnlocked || tokens < DAIQUIRI_BOTTLE_PRICE || resolving || shopBusy) return;
    setShopBusy(true);
    const purchased = await onBuyDaiquiriBottle();
    setShopMessage(purchased ? 'DAIQUIRI BOTTLE ADDED TO INVENTORY' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
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
    if (!daiquiriUnlocked || daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy) return;
    setShopBusy(true);
    const redeemed = await onRedeemDaiquiri();
    setShopBusy(false);
    if (!redeemed) return;

    setShopMessage('DAIQUIRI ARMED · 45% WIN · 65% LOSS · DOUBLE AWARD');
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    if (daiquiriBurstTimerRef.current) clearTimeout(daiquiriBurstTimerRef.current);
    setDaiquiriBurstVisible(true);
    daiquiriProgress.value = 0;
    daiquiriProgress.value = reduceMotion
      ? withTiming(1, { duration: 160 })
      : withSequence(
        withTiming(0.43, { duration: 240, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 720, easing: Easing.inOut(Easing.cubic) }),
      );
    daiquiriBurstTimerRef.current = setTimeout(
      () => setDaiquiriBurstVisible(false),
      reduceMotion ? 220 : 1080,
    );
    void playDaiquiriVoice();
  };

  const handleUnlockStaminUp = async () => {
    if (tokens < STAMIN_UP_UNLOCK_PRICE || staminUpUnlocked || resolving || shopBusy) return;
    setShopBusy(true);
    const unlocked = await onUnlockStaminUp();
    setShopMessage(unlocked ? 'STAMIN UP UNLOCKED · BOTTLES ARE NOW 16 TOKENS' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
  };

  const handleBuyStaminUpBottle = async () => {
    if (!staminUpUnlocked || tokens < STAMIN_UP_BOTTLE_PRICE || resolving || shopBusy) return;
    setShopBusy(true);
    const purchased = await onBuyStaminUpBottle();
    setShopMessage(purchased ? 'STAMIN UP BOTTLE ADDED TO INVENTORY' : 'NOT ENOUGH BREW TOKENS');
    setShopBusy(false);
  };

  const handleRedeemStaminUp = async () => {
    if (!staminUpUnlocked || staminUpBottles < 1 || staminUpArmed || quickReviveArmed || daiquiriArmed || resolving || shopBusy) return;
    setShopBusy(true);
    const redeemed = await onRedeemStaminUp();
    setShopBusy(false);
    if (!redeemed) return;

    setShopMessage('STAMIN UP ARMED · NEXT WIN PAYS DARK BREW TOKENS');
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    if (staminUpBurstTimerRef.current) clearTimeout(staminUpBurstTimerRef.current);
    setStaminUpBurstVisible(true);
    staminUpProgress.value = 0;
    staminUpProgress.value = reduceMotion
      ? withTiming(1, { duration: 180 })
      : withSequence(
        withTiming(0.58, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 670, easing: Easing.out(Easing.cubic) }),
      );
    staminUpBurstTimerRef.current = setTimeout(
      () => setStaminUpBurstVisible(false),
      reduceMotion ? 240 : 1_380,
    );
    void playStaminUpVoice();
  };

  const accessExpiryLabel = bankAccessExpiresAt
    ? new Date(bankAccessExpiresAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : null;
  const accessRemainingLabel = formatBrewBankAccessRemaining(bankAccessExpiresAt, countdownNow);

  const playMachineStartSound = async () => {
    if (!soundEnabled || Constants.appOwnership === 'expo') return;
    stopMachineSound();
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(require('../assets/sounds/gunfire_burst.wav'), { downloadFirst: true });
      machinePlayerRef.current = player;
      player.play();
      machineSoundTimerRef.current = setTimeout(stopMachineSound, 1300);
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
      await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
      const player = createAudioPlayer(phrase.source, { downloadFirst: true });
      lossPlayerRef.current = player;
      player.play();
      lossVoiceTimerRef.current = setTimeout(finish, phrase.durationMs + 250);
    } catch {
      Speech.speak(phrase.text, {
        rate: 0.94,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    }
  };

  const handleClose = () => {
    if (protectedVoicePlaying) return;
    stopMachineStatus();
    stopLossVoice(true);
    stopMachineSound();
    stopDaiquiriVoice();
    onClose();
  };

  const handleBet = () => {
    if (!canPlay) return;
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
    setResolving(true);
    reelStopTimersRef.current.forEach(timer => clearTimeout(timer));
    reelStopTimersRef.current = [];
    const reelPositions = [reelOnePosition, reelTwoPosition, reelThreePosition];
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
    const finalIndexes = won ? [0, 0, 0] : [1, 3, 4];
    [1_700, 2_900, 4_600].forEach((delay, index) => {
      reelStopTimersRef.current.push(setTimeout(() => {
        cancelAnimation(reelPositions[index]!);
        reelPositions[index]!.value = withTiming(-finalIndexes[index]! * SLOT_REEL_HEIGHT, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
      }, delay));
    });
    setMachineStatusIndex(0);
    stopMachineStatus();
    machineStatusTimerRef.current = setInterval(() => {
      setMachineStatusIndex(index => (index + 1) % MACHINE_STATUS_LINES.length);
    }, 260);
    resultProgress.value = 0;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    void playMachineStartSound();
    coinProgress.value = withSequence(
      withTiming(0.45, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(0.8, { duration: 210, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) }),
    );
    vaultPulse.value = withSequence(
      withTiming(0.5, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 250, easing: Easing.inOut(Easing.cubic) }),
    );
    timerRef.current = setTimeout(() => {
      void onResolveBet(bet, won, effect).finally(() => {
        stopMachineStatus();
        if (won) void playWinSound();
        if (hapticsEnabled) {
          Haptics.notificationAsync(
            won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
          ).catch(() => {});
        }
        setResult({ won, bet, quickRevive, daiquiri, staminUp, award: won ? bet * payoutMultiplier : bet });
        setResolving(false);
        resultProgress.value = withSpring(1, { damping: 13, stiffness: 180 });
        vaultPulse.value = withSequence(
          withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
        );
        if (!won) void playLossVoice();
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
          <View style={[styles.shell, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>WEEKEND FEATURE</Text>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>THE CENTRAL BANK</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>OF BAD DECISIONS</Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={protectedVoicePlaying}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={protectedVoicePlaying ? 'Voice message is playing' : 'Close Central Bank'}
            >
              <Feather name="x" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => stopLossVoice()}
            disabled={!lossVoicePlaying || protectedVoicePlaying}
            style={[styles.vault, { backgroundColor: colors.steelShadow, borderColor: colors.goldMuted }]}
            accessibilityRole={lossVoicePlaying && !protectedVoicePlaying ? 'button' : undefined}
            accessibilityLabel={lossVoicePlaying && !protectedVoicePlaying ? 'Stop vault voice message' : 'Brew Token reserve'}
          >
            <Animated.View pointerEvents="none" style={[styles.vaultPerspectiveFrame, vaultPerspectiveStyle]}>
              <View style={[styles.vaultBackplate, { backgroundColor: colors.card, borderColor: colors.border }]} />
              <View style={[styles.vaultTopDepth, { backgroundColor: colors.goldMuted }]} />
              <View style={[styles.vaultLeftDepth, { backgroundColor: colors.border }]} />
              <View style={[styles.vaultRightDepth, { backgroundColor: colors.border }]} />
              <LinearGradient
                pointerEvents="none"
                colors={['transparent', colors.foreground, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.vaultSheen, vaultSheenStyle]}
              />
              <View style={[styles.vaultRivet, styles.vaultRivetTopLeft, { backgroundColor: colors.goldMuted }]} />
              <View style={[styles.vaultRivet, styles.vaultRivetTopRight, { backgroundColor: colors.goldMuted }]} />
              <View style={[styles.vaultRivet, styles.vaultRivetBottomLeft, { backgroundColor: colors.goldMuted }]} />
              <View style={[styles.vaultRivet, styles.vaultRivetBottomRight, { backgroundColor: colors.goldMuted }]} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.vaultGlow, { backgroundColor: colors.gold }, vaultGlowAnimatedStyle]}
            />
            <View pointerEvents="none" style={[styles.vaultFloorShadow, { backgroundColor: colors.background }]} />
             {quickReviveBurstVisible && (
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
              {daiquiriBurstVisible && (
                <View pointerEvents="none" style={styles.daiquiriBurst}>
                  <Animated.View style={[styles.quickReviveBurstBottle, daiquiriBottleStyle]}>
                    <DaiquiriBottle size={40} />
                  </Animated.View>
                  <Animated.View style={[styles.daiquiriOoze, daiquiriOozeStyle]}>
                    <View style={styles.daiquiriOozeDrop} />
                    <View style={[styles.daiquiriOozeDrop, styles.daiquiriOozeDropWide]} />
                    <View style={[styles.daiquiriOozeDrop, styles.daiquiriOozeDropSmall]} />
                  </Animated.View>
                </View>
              )}
              {staminUpBurstVisible && (
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
            <View style={styles.slotMachine}>
              {renderReel(reelOneStyle, 0, result ? (result.won ? colors.buyColor : colors.sellColor) : colors.gold)}
              {renderReel(reelTwoStyle, 1, result ? (result.won ? colors.buyColor : colors.sellColor) : colors.gold)}
              {renderReel(reelThreeStyle, 2, result ? (result.won ? colors.buyColor : colors.sellColor) : colors.gold)}
            </View>
            <Text style={[styles.vaultLabel, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>BREW TOKEN RESERVE</Text>
            <Text style={[styles.balance, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{displayedTokens}</Text>
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
              <Text style={[styles.skipVoiceHint, { color: protectedVoicePlaying ? colors.gold : colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                {protectedVoicePlaying ? 'LISTEN CLOSELY' : 'TAP ANYWHERE TO SKIP VOICE'}
              </Text>
            )}
            {resolving && (
              <Text style={[styles.machineStatus, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>
                {MACHINE_STATUS_LINES[machineStatusIndex]}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => { setShopOpen(value => !value); setShopMessage(null); }}
            style={[styles.shopToggle, { borderColor: colors.goldMuted, backgroundColor: colors.steelShadow }]}
            accessibilityRole="button"
            accessibilityLabel={shopOpen ? 'Close Central Bank shop and inventory' : 'Open Central Bank shop and inventory'}
            accessibilityState={{ expanded: shopOpen }}
          >
            <View style={styles.shopToggleCopy}>
              <Feather name="briefcase" size={15} color={colors.gold} />
              <Text style={[styles.shopToggleText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                SHOP / INVENTORY
              </Text>
            </View>
            <View style={styles.shopToggleRight}>
              <Text style={[styles.keyCount, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>{bankKeys}</Text>
              <Feather name={shopOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>

          {shopOpen && (
            <View style={[styles.shopPanel, { backgroundColor: colors.steelShadow, borderColor: colors.border }]}>
              <View style={styles.shopHeadingRow}>
                <View>
                  <Text style={[styles.shopTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>BANK ACCESS KEY</Text>
                  <Text style={[styles.shopDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Weekday entry requires a key. Buy one for {BREW_BANK_KEY_PRICE} Brew Tokens, then activate it to unlock 12 hours inside the Central Bank.
                  </Text>
                </View>
                <Feather name="key" size={23} color={colors.gold} />
              </View>
              <View style={styles.inventoryRow}>
                <Text style={[styles.inventoryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>IN INVENTORY</Text>
                <Text style={[styles.inventoryValue, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
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
                  style={[styles.shopButton, { borderColor: colors.goldMuted }, (tokens < BREW_BANK_KEY_PRICE || resolving || shopBusy) && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy a bank access key for ${BREW_BANK_KEY_PRICE} Brew Tokens`}
                >
                  <Text style={[styles.shopButtonText, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                    BUY KEY · {BREW_BANK_KEY_PRICE} TOKENS
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { void handleActivateKey(); }}
                  disabled={!canActivateKey || shopBusy}
                  style={[styles.shopButton, { backgroundColor: colors.gold }, (!canActivateKey || shopBusy) && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Activate bank access key"
                >
                  <Text style={[styles.shopButtonText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
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
                   </View>
                   <QuickReviveBottle size={31} muted={!quickReviveUnlocked} />
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
                     </View>
                     <StaminUpBottle size={31} muted={!staminUpUnlocked} />
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
                       disabled={tokens < STAMIN_UP_UNLOCK_PRICE || resolving || shopBusy}
                       style={[
                         styles.shopButton,
                         { borderColor: colors.border, backgroundColor: colors.card },
                         (tokens < STAMIN_UP_UNLOCK_PRICE || resolving || shopBusy) && styles.disabled,
                       ]}
                       accessibilityRole="button"
                       accessibilityLabel={`Unlock Stamin Up for ${STAMIN_UP_UNLOCK_PRICE} Brew Tokens`}
                     >
                       <Text style={[styles.shopButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                         UNLOCK RECIPE · {STAMIN_UP_UNLOCK_PRICE} TOKENS
                       </Text>
                     </Pressable>
                   ) : (
                     <Pressable
                       onPress={() => { void handleBuyStaminUpBottle(); }}
                       disabled={tokens < STAMIN_UP_BOTTLE_PRICE || resolving || shopBusy}
                       style={[
                         styles.shopButton,
                         { borderColor: '#f29b38' },
                         (tokens < STAMIN_UP_BOTTLE_PRICE || resolving || shopBusy) && styles.disabled,
                       ]}
                       accessibilityRole="button"
                       accessibilityLabel={`Buy one Stamin Up bottle for ${STAMIN_UP_BOTTLE_PRICE} Brew Tokens`}
                     >
                       <Text style={[styles.shopButtonText, { color: '#ffc169', fontFamily: 'Inter_700Bold' }]}>
                         BUY BOTTLE · {STAMIN_UP_BOTTLE_PRICE} TOKENS
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
                     disabled={tokens < QUICK_REVIVE_UNLOCK_PRICE || resolving || shopBusy}
                     style={[
                       styles.shopButton,
                       { borderColor: colors.border, backgroundColor: colors.card },
                       (tokens < QUICK_REVIVE_UNLOCK_PRICE || resolving || shopBusy) && styles.disabled,
                     ]}
                     accessibilityRole="button"
                     accessibilityLabel={`Unlock Quick Revive for ${QUICK_REVIVE_UNLOCK_PRICE} Brew Tokens`}
                   >
                     <Text style={[styles.shopButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                       UNLOCK RECIPE · {QUICK_REVIVE_UNLOCK_PRICE} TOKENS
                     </Text>
                   </Pressable>
                 ) : (
                   <Pressable
                     onPress={() => { void handleBuyQuickReviveBottle(); }}
                     disabled={tokens < QUICK_REVIVE_BOTTLE_PRICE || resolving || shopBusy}
                     style={[
                       styles.shopButton,
                       { borderColor: colors.goldMuted },
                       (tokens < QUICK_REVIVE_BOTTLE_PRICE || resolving || shopBusy) && styles.disabled,
                     ]}
                     accessibilityRole="button"
                     accessibilityLabel={`Buy one Quick Revive bottle for ${QUICK_REVIVE_BOTTLE_PRICE} Brew Tokens`}
                   >
                     <Text style={[styles.shopButtonText, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                       BUY BOTTLE · {QUICK_REVIVE_BOTTLE_PRICE} TOKENS
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
                        Crack one into the machine before a toss: 45% win odds, 65% loss odds, and a double award if it pays.
                      </Text>
                    </View>
                    <DaiquiriBottle size={31} muted={!daiquiriUnlocked} />
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
                      disabled={tokens < DAIQUIRI_UNLOCK_PRICE || resolving || shopBusy}
                      style={[
                        styles.shopButton,
                        { borderColor: colors.border, backgroundColor: colors.card },
                        (tokens < DAIQUIRI_UNLOCK_PRICE || resolving || shopBusy) && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Unlock Dave Ramsey Daiquiri for ${DAIQUIRI_UNLOCK_PRICE} Brew Tokens`}
                    >
                      <Text style={[styles.shopButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                        UNLOCK RECIPE · {DAIQUIRI_UNLOCK_PRICE} TOKENS
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => { void handleBuyDaiquiriBottle(); }}
                      disabled={tokens < DAIQUIRI_BOTTLE_PRICE || resolving || shopBusy}
                      style={[
                        styles.shopButton,
                        { borderColor: '#8edbff' },
                        (tokens < DAIQUIRI_BOTTLE_PRICE || resolving || shopBusy) && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Buy one Dave Ramsey Daiquiri bottle for ${DAIQUIRI_BOTTLE_PRICE} Brew Tokens`}
                    >
                      <Text style={[styles.shopButtonText, { color: '#a8e5ff', fontFamily: 'Inter_700Bold' }]}>
                        BUY BOTTLE · {DAIQUIRI_BOTTLE_PRICE} TOKENS
                      </Text>
                    </Pressable>
                  )}
                </View>
              {shopMessage && (
                <Text style={[styles.shopMessage, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>{shopMessage}</Text>
              )}
            </View>
          )}

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

          {quickReviveUnlocked && (
            <Pressable
              onPress={() => { void handleRedeemQuickRevive(); }}
              disabled={quickReviveBottles < 1 || quickReviveArmed || daiquiriArmed || staminUpArmed || resolving || shopBusy}
              style={[
                styles.quickReviveArm,
                { borderColor: quickReviveArmed ? colors.buyColor : colors.goldMuted, backgroundColor: colors.steelShadow },
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
              <Feather name={quickReviveArmed ? 'check-circle' : 'zap'} size={17} color={quickReviveArmed ? colors.buyColor : colors.gold} />
            </Pressable>
          )}
          {daiquiriUnlocked && (
            <Pressable
              onPress={() => { void handleRedeemDaiquiri(); }}
              disabled={daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy}
              style={[
                styles.quickReviveArm,
                { borderColor: daiquiriArmed ? '#8edbff' : '#e9c64d', backgroundColor: colors.steelShadow },
                (daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy) && !daiquiriArmed && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                daiquiriArmed
                  ? 'Dave Ramsey Daiquiri armed. Your next toss has 45 percent win odds, 65 percent loss odds, and double award on a win.'
                  : `Redeem a Dave Ramsey Daiquiri bottle. ${daiquiriBottles} bottles available.`
              }
              accessibilityState={{ disabled: daiquiriBottles < 1 || daiquiriArmed || quickReviveArmed || staminUpArmed || resolving || shopBusy }}
            >
              <DaiquiriBottle size={26} muted={!daiquiriArmed && daiquiriBottles < 1} />
              <View style={styles.quickReviveArmCopy}>
                <Text style={[styles.quickReviveArmTitle, { color: daiquiriArmed ? '#a8e5ff' : colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {daiquiriArmed ? 'DAIQUIRI ARMED · 45% WIN · DOUBLE AWARD' : 'REDEEM DAIQUIRI · DOUBLE WIN AWARD'}
                </Text>
                <Text style={[styles.quickReviveArmDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {daiquiriArmed
                    ? 'Light blue and yellow liquid is in the machine. It applies to your next toss only.'
                    : `${daiquiriBottles} ${daiquiriBottles === 1 ? 'BOTTLE' : 'BOTTLES'} READY · 45% WIN · 65% LOSS`}
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
                { borderColor: staminUpArmed ? '#ffc169' : '#d27620', backgroundColor: colors.steelShadow },
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
              { backgroundColor: colors.steelShadow, borderColor: colors.border },
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
            <View style={[styles.payoutPreview, { backgroundColor: colors.steelShadow, borderColor: colors.border }]}>
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
                  <Text style={[styles.payoutValue, { color: daiquiriArmed ? '#a8e5ff' : quickReviveArmed ? colors.buyColor : colors.gold, fontFamily: 'Inter_700Bold' }]}>{activeOddsLabel}</Text>
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
            <Text style={[styles.emptyMessage, { color: colors.gold, fontFamily: 'Inter_500Medium' }]}>
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
                   DAIQUIRI APPLIED · 45% WIN / 65% LOSS · {result.won ? 'DOUBLE AWARD PAID' : 'BOTTLE CONSUMED'}
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
            style={[styles.depositButton, { backgroundColor: colors.gold }, !canPlay && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Deposit Brew Tokens"
          >
            {resolving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.depositButtonText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
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
              trackColor={{ false: colors.border, true: colors.goldMuted }}
              thumbColor={soundEnabled ? colors.gold : colors.mutedForeground}
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
              trackColor={{ false: colors.border, true: colors.goldMuted }}
              thumbColor={hapticsEnabled ? colors.gold : colors.mutedForeground}
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
  daiquiriOoze: { position: 'absolute', top: 63, flexDirection: 'row', alignItems: 'center', gap: 5 },
  daiquiriOozeDrop: { width: 26, height: 17, borderRadius: 13, backgroundColor: '#69c8ff', borderWidth: 1, borderColor: '#f6d64a', shadowColor: '#69c8ff', shadowOpacity: 0.92, shadowRadius: 9, elevation: 6 },
  daiquiriOozeDropWide: { width: 39, height: 11, opacity: 0.84 },
  daiquiriOozeDropSmall: { width: 12, height: 12, opacity: 0.74 },
  staminUpBurst: { position: 'absolute', top: 5, bottom: 6, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  staminUpTornadoRing: { position: 'absolute', height: 11, borderWidth: 2, borderColor: '#ffc169', borderRadius: 22, backgroundColor: 'rgba(242,138,28,0.14)', shadowColor: '#f28a1c', shadowOpacity: 0.8, shadowRadius: 7, elevation: 5 },
  staminUpTornadoUpper: { top: 20, width: 30 },
  staminUpTornadoMiddle: { top: 47, width: 38 },
  staminUpTornadoBase: { top: 73, width: 45 },
  staminUpSplash: { position: 'absolute', top: 75, flexDirection: 'row', gap: 5, alignItems: 'center' },
  staminUpSplashDrop: { width: 27, height: 17, borderRadius: 14, backgroundColor: '#f28a1c', borderWidth: 1, borderColor: '#ffdf77', shadowColor: '#f28a1c', shadowOpacity: 0.95, shadowRadius: 9, elevation: 6 },
  staminUpSplashDropWide: { width: 43, height: 11, opacity: 0.84 },
  staminUpSplashDropSmall: { width: 13, height: 13, opacity: 0.76 },
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
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  shopToggle: { minHeight: 44, borderWidth: 1, borderRadius: 9, marginTop: 14, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shopToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopToggleText: { fontSize: 10, letterSpacing: 0.8 },
  keyCount: { fontSize: 15 },
  shopPanel: { borderWidth: 1, borderRadius: 9, marginTop: 8, padding: 12 },
  shopHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  shopTitle: { fontSize: 11, letterSpacing: 0.8 },
  shopDescription: { fontSize: 10, lineHeight: 15, marginTop: 4, maxWidth: 270 },
  inventoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 },
  inventoryLabel: { fontSize: 9, letterSpacing: 0.9 },
  inventoryValue: { fontSize: 13 },
  accessStatus: { fontSize: 9, letterSpacing: 0.6, marginTop: 9 },
  shopActions: { gap: 8, marginTop: 12 },
  shopButton: { minHeight: 38, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  shopButtonText: { fontSize: 10, letterSpacing: 0.5 },
  quickReviveShop: { borderTopWidth: 1, marginTop: 14, paddingTop: 13 },
  quickReviveShopCopy: { flex: 1 },
  shopMessage: { fontSize: 9, letterSpacing: 0.7, textAlign: 'center', marginTop: 10 },
  sectionLabel: { fontSize: 9, letterSpacing: 1 },
  betValue: { fontSize: 18, marginTop: 3 },
  stepper: { flexDirection: 'row', gap: 7 },
  stepButton: { width: 36, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  quickReviveArm: { minHeight: 58, borderWidth: 1, borderRadius: 9, marginTop: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  quickReviveArmCopy: { flex: 1, gap: 3 },
  quickReviveArmTitle: { fontSize: 9, letterSpacing: 0.55 },
  quickReviveArmDescription: { fontSize: 8, lineHeight: 12, letterSpacing: 0.15 },
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
});