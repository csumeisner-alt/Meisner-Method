import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  Image,
  ScrollView,
  AppState,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  RefreshControl,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useApi } from '@/hooks/useApi';
import * as Speech from 'expo-speech';
import Constants from 'expo-constants';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useAmericanMode } from '@/contexts/AmericanModeContext';
import { BottomTabBar } from '@/components/BottomTabBar';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { PortfolioFilterBar } from '@/components/PortfolioFilterBar';
import { GRADE_ORDER, GradeHistoryChart, type GradeHistoryPoint } from '@/components/GradeHistoryChart';
import { TrainingTapeModal } from '@/components/TrainingTapeModal';
import { BrewTokenBank } from '@/components/BrewTokenBank';
import { BrewTokenUnlockCelebration } from '@/components/BrewTokenUnlockCelebration';
import {
  availableToSell,
  computeDividendTotal,
  computeClosedTrades,
  computePositions,
  computeTradeReconciliation,
  computeTradeSummary,
  type ClosedTrade,
  type UnmatchedSell,
  type Position,
  type Quote,
  type Trade,
} from '@/lib/portfolioMath';
import { getTradeGradeFeedback } from '@/lib/tradeGradeFeedback';
import { canEnterBrewBank, formatBrewBankAccessRemaining, hasBrewBankAccess } from '@/lib/brewTokenLogic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeGrade {
  grade: string;
  color: string;
  bgColor: string;
  label: string;
  context: string;
  returnPct: number;
  holdDays: number;
  profit: number;
  avgCost: number;
  compositeScore: number;
  celebrate: boolean; // A- or better gets the cinematic overlay
}

type PortfolioTab = 'positions' | 'trades';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const BREW_BANK_ENABLED = true;

// ─── Local cache ──────────────────────────────────────────────────────────────

const TRADES_CACHE_KEY = '@stocksense/portfolio_trades_v1';

async function readTradesCache(): Promise<Trade[]> {
  try {
    const raw = await AsyncStorage.getItem(TRADES_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Trade[];
  } catch { return []; }
}

async function writeTradesCache(trades: Trade[]) {
  try { await AsyncStorage.setItem(TRADES_CACHE_KEY, JSON.stringify(trades)); } catch { /* non-fatal */ }
}

async function clearTradesCache() {
  try { await AsyncStorage.removeItem(TRADES_CACHE_KEY); } catch { /* non-fatal */ }
}

const SPARKLE_EMOJIS = ['✨', '⭐', '💫', '🌟', '🎉', '💎', '🏆', '🔥'];

// Celebration woman images — AI-generated, rotated randomly each time
const CELEBRATION_IMAGES = [
  require('../assets/celebration/woman1.jpg'),
  require('../assets/celebration/woman2.jpg'),
  require('../assets/celebration/woman3.jpg'),
  require('../assets/celebration/woman4.jpg'),
  require('../assets/celebration/woman5.jpg'),
  require('../assets/celebration/woman6.jpg'),
  require('../assets/celebration/woman7.jpg'),
  require('../assets/celebration/woman8.jpg'),
  require('../assets/celebration/woman9.jpg'),
  require('../assets/celebration/woman10.jpg'),
];

// Expo Go bundles a fixed set of native modules; expo-audio's native player can
// hard-crash there. In Expo Go we use on-device speech; in a standalone build
// we play the user's bundled recordings so no network voice service is needed.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

function speakOnDevice(text: string) {
  try { Speech.speak(text, { language: 'en-US', pitch: 1.12, rate: 0.9 }); } catch (_) {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _celebPlayer: any = null;
function waitForPlayerLoaded(player: any, timeoutMs = 2500): Promise<boolean> {
  if (player.isLoaded) return Promise.resolve(true);

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

    subscription = player.addListener('playbackStatusUpdate', (status: { isLoaded?: boolean }) => {
      if (status.isLoaded) finish(true);
    });
    timeout = setTimeout(() => finish(false), timeoutMs);
  });
}

interface CelebrationPhrase {
  text: string;
  source: number;
}

async function playCelebrationVoice(phrase: CelebrationPhrase): Promise<void> {
  if (IS_EXPO_GO) {
    speakOnDevice(phrase.text);
    return;
  }
  try {
    // Lazy-load expo-audio so Expo Go never touches its native module. The
    // recording is bundled in the app, so playback is offline and free.
    const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    _celebPlayer = createAudioPlayer(phrase.source, { downloadFirst: true });
    const loaded = await waitForPlayerLoaded(_celebPlayer);
    if (loaded) {
      _celebPlayer.play();
    } else {
      try { _celebPlayer.remove(); } catch (_) {}
      _celebPlayer = null;
      speakOnDevice(phrase.text);
    }
  } catch (_) {
    // Fallback to on-device speech (no native audio / no network).
    speakOnDevice(phrase.text);
  }
}
function stopCelebrationVoice() {
  try { if (_celebPlayer) { _celebPlayer.remove(); _celebPlayer = null; } } catch (_) {}
  try { Speech.stop(); } catch (_) {}
}

const CELEBRATION_PHRASES: CelebrationPhrase[] = [
  {
    text: "Mm, congrats, you really are a true crypto bro. Why don't you come see what's inside my special vault?",
    source: require('../assets/celebration/voice01.m4a'),
  },
  {
    text: "Nice job, trader. Keep up the good work, and maybe I'll have a little surprise for you later.",
    source: require('../assets/celebration/voice02.m4a'),
  },
  {
    text: "You didn't just catch that trend. You seduced it.",
    source: require('../assets/celebration/voice03.m4a'),
  },
  {
    text: "That was a spicy little profit. I see you.",
    source: require('../assets/celebration/voice04.m4a'),
  },
  {
    text: "You flirted with the market, and it definitely flirted back.",
    source: require('../assets/celebration/voice05.m4a'),
  },
  {
    text: "Mmm... that entry was dirty, but it came out clean. Almost too clean.",
    source: require('../assets/celebration/voice06.m4a'),
  },
  {
    text: "You handled those candles like someone who knows exactly where they're going.",
    source: require('../assets/celebration/voice07.m4a'),
  },
  {
    text: "You really like making the market behave for you, don't you?",
    source: require('../assets/celebration/voice08.m4a'),
  },
  {
    text: "That move was bold... and honestly, I'm all about the way you move.",
    source: require('../assets/celebration/voice09.m4a'),
  },
  {
    text: "Well, well... look at you moving those charts like you know exactly what you're doing.",
    source: require('../assets/celebration/voice10.m4a'),
  },
  {
    text: "You guided those candles exactly where you wanted them. Very assertive of you.",
    source: require('../assets/celebration/voice11.m4a'),
  },
  {
    text: "Look at you go. If I helped you catch that move, you can send a little love right back.",
    source: require('../assets/celebration/voice12.m4a'),
  },
  {
    text: "You held that trade with confidence... and the payoff was downright attractive.",
    source: require('../assets/celebration/voice13.m4a'),
  },
  {
    text: "You are clearly the alpha trader. I'm into that. Real alphas like yourself would consider leaving me a tip.",
    source: require('../assets/celebration/voice14.m4a'),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtNum = (n: number, d = 4) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
const A_PLUS_SCORE_THRESHOLD = 65;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

async function fetchQuote(symbol: string): Promise<Quote> {
  const res = await fetch(`${BASE_URL}/api/stocks/quote/${symbol}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as Quote & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

/** Compute A+→F- grade for a sell trade from its matched FIFO lots. */
function computeSellGrade(sellTrade: Trade, closedTrade: ClosedTrade | null): TradeGrade | null {
  if (sellTrade.type !== 'sell' || !closedTrade) return null;

  const { avgCost, holdDays } = closedTrade;
  const profit = closedTrade.gross;
  const returnPct = ((sellTrade.pricePerShare - avgCost) / avgCost) * 100;

  // Time multiplier — reward quick profits, penalise slow losses
  function timeMult(days: number, positive: boolean): number {
    if (positive) {
      if (days <= 3)   return 3.0;
      if (days <= 7)   return 2.5;
      if (days <= 14)  return 2.0;
      if (days <= 30)  return 1.6;
      if (days <= 60)  return 1.3;
      if (days <= 90)  return 1.1;
      if (days <= 180) return 1.0;
      if (days <= 365) return 0.85;
      return 0.7;
    } else {
      if (days <= 3)   return 0.3;
      if (days <= 7)   return 0.4;
      if (days <= 14)  return 0.55;
      if (days <= 30)  return 0.7;
      if (days <= 60)  return 0.85;
      if (days <= 90)  return 1.0;
      if (days <= 180) return 1.15;
      if (days <= 365) return 1.3;
      return 1.5;
    }
  }

  const compositeScore = returnPct * timeMult(holdDays, returnPct >= 0);

  // Grade mapping
  let grade: string, color: string, bgColor: string, label: string;
  if      (compositeScore >= A_PLUS_SCORE_THRESHOLD)  { grade = 'A+'; color = '#00e5a0'; bgColor = '#001a12'; label = 'Market Genius' }
  else if (compositeScore >= 45)  { grade = 'A';  color = '#00e5a0'; bgColor = '#001a12'; label = 'Excellent Trade' }
  else if (compositeScore >= 25)  { grade = 'A-'; color = '#00e5a0'; bgColor = '#001a12'; label = 'Great Trade' }
  else if (compositeScore >= 18)  { grade = 'B+'; color = '#4ade80'; bgColor = '#0a1a0e'; label = 'Solid Profit' }
  else if (compositeScore >= 10)  { grade = 'B';  color = '#4ade80'; bgColor = '#0a1a0e'; label = 'Good Trade' }
  else if (compositeScore >= 4)   { grade = 'B-'; color = '#86efac'; bgColor = '#0a1a0e'; label = 'Decent Trade' }
  else if (compositeScore >= 1)   { grade = 'C+'; color = '#fbbf24'; bgColor = '#1a1200'; label = 'Small Gain' }
  else if (compositeScore >= -2)  { grade = 'C';  color = '#f59e0b'; bgColor = '#1a1200'; label = 'Break Even' }
  else if (compositeScore >= -6)  { grade = 'C-'; color = '#f59e0b'; bgColor = '#1a1200'; label = 'Minor Loss' }
  else if (compositeScore >= -12) { grade = 'D+'; color = '#fb923c'; bgColor = '#1a0800'; label = 'Weak Trade' }
  else if (compositeScore >= -20) { grade = 'D';  color = '#f97316'; bgColor = '#1a0800'; label = 'Poor Trade' }
  else if (compositeScore >= -30) { grade = 'D-'; color = '#f97316'; bgColor = '#1a0800'; label = 'Bad Trade' }
  else if (compositeScore >= -45) { grade = 'F+'; color = '#ff3b3b'; bgColor = '#1a0000'; label = 'Big Loss' }
  else if (compositeScore >= -60) { grade = 'F';  color = '#ff3b3b'; bgColor = '#1a0000'; label = 'Heavy Loss' }
  else                             { grade = 'F-'; color = '#ff3b3b'; bgColor = '#1a0000'; label = 'Wipeout' }

  const holdStr = holdDays === 0 ? 'same day'
    : holdDays === 1 ? '1 day' : `${holdDays} days`;
  let context: string;
  if (returnPct >= 0) {
    if (holdDays <= 7) context = `Lightning flip — ${returnPct.toFixed(1)}% in ${holdStr}`;
    else if (holdDays <= 30) context = `Quick win — ${returnPct.toFixed(1)}% in ${holdStr}`;
    else context = `Patient hold — ${returnPct.toFixed(1)}% over ${holdStr}`;
  } else {
    if (holdDays <= 14) context = `Cut losses fast in ${holdStr} — disciplined exit`;
    else context = `Held ${holdStr} and lost ${Math.abs(returnPct).toFixed(1)}% — exit sooner next time`;
  }

  const celebrate = ['A+', 'A', 'A-'].includes(grade);
  return { grade, color, bgColor, label, context, returnPct, holdDays, profit, avgCost, compositeScore, celebrate };
}

function pickCompliment(_grade: string): CelebrationPhrase {
  return CELEBRATION_PHRASES[Math.floor(Math.random() * CELEBRATION_PHRASES.length)]!;
}

function feedbackHapticType(grade: string): Haptics.NotificationFeedbackType {
  if (grade.startsWith('A') || grade.startsWith('B')) return Haptics.NotificationFeedbackType.Success;
  if (grade.startsWith('C')) return Haptics.NotificationFeedbackType.Warning;
  return Haptics.NotificationFeedbackType.Error;
}

// ─── Celebration Overlay ──────────────────────────────────────────────────────

// Safety net: if anything inside the celebration throws while rendering, swallow
// it and dismiss instead of crashing the whole app.
class CelebrationBoundary extends React.Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function CelebrationOverlay({
  gradeInfo,
  onDismiss,
}: {
  gradeInfo: TradeGrade;
  onDismiss: () => void;
}) {
  const womanImage = useRef(CELEBRATION_IMAGES[Math.floor(Math.random() * CELEBRATION_IMAGES.length)]).current;
  const compliment = useRef(pickCompliment(gradeInfo.grade)).current;

  const overlayOp  = useRef(new Animated.Value(0)).current;
  const cardY      = useRef(new Animated.Value(80)).current;
  const cardScale  = useRef(new Animated.Value(0.88)).current;
  const cardOp     = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(1)).current;
  const glowPulse  = useRef(new Animated.Value(0)).current;

  const NUM_PARTICLES = 20;
  const particles = useRef(
    Array.from({ length: NUM_PARTICLES }, (_, i) => {
      const angle = (i / NUM_PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 110 + Math.random() * 130;
      return {
        angle, dist,
        tx: new Animated.Value(0),
        ty: new Animated.Value(0),
        op: new Animated.Value(0),
        sc: new Animated.Value(0.2),
      };
    })
  ).current;
  const reduceMotion = useReduceMotion();
  const [voiceReady, setVoiceReady] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    let cancelled = false;
    void playCelebrationVoice(compliment)
      .then(() => {
        if (!cancelled) setVoiceReady(true);
      })
      .catch(() => {
        if (!cancelled) setVoiceReady(true);
      });
    return () => {
      cancelled = true;
      stopCelebrationVoice();
    };
  }, [compliment]);

  useEffect(() => {
    Haptics.notificationAsync(feedbackHapticType(gradeInfo.grade)).catch(() => {});
  }, [gradeInfo.grade]);

  useEffect(() => {
    if (!voiceReady) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const runningAnimations: Animated.CompositeAnimation[] = [];

    try {
      if (reduceMotion) {
        overlayOp.setValue(1);
        cardY.setValue(0);
        cardScale.setValue(1);
        cardOp.setValue(1);
        imageScale.setValue(1);
        glowPulse.setValue(0);
        particles.forEach(p => {
          p.tx.setValue(0);
          p.ty.setValue(0);
          p.op.setValue(0);
          p.sc.setValue(0.2);
        });
      } else {
        // Fade in overlay (single value — avoids Animated.multiply crash)
        const overlayAnimation = Animated.timing(overlayOp, { toValue: 1, duration: 280, useNativeDriver: true });
        runningAnimations.push(overlayAnimation);
        overlayAnimation.start();

        // Card slides up + springs in
        const cardAnimation = Animated.parallel([
          Animated.spring(cardY,     { toValue: 0, tension: 65, friction: 9, useNativeDriver: true }),
          Animated.spring(cardScale, { toValue: 1, tension: 65, friction: 9, useNativeDriver: true }),
          Animated.timing(cardOp,    { toValue: 1, duration: 300, useNativeDriver: true }),
        ]);
        runningAnimations.push(cardAnimation);
        cardAnimation.start();

        // Subtle image breathe
        const imageAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(imageScale, { toValue: 1.04, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(imageScale, { toValue: 1.00, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
        runningAnimations.push(imageAnimation);
        imageAnimation.start();

        // Glow pulse
        const glowAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(glowPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
            Animated.timing(glowPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
          ])
        );
        runningAnimations.push(glowAnimation);
        glowAnimation.start();

        // Particle burst
        function burst() {
          particles.forEach((p, i) => {
            p.tx.setValue(0); p.ty.setValue(0); p.op.setValue(0); p.sc.setValue(0.2);
            Animated.sequence([
              Animated.delay(i * 30),
              Animated.parallel([
                Animated.spring(p.tx, { toValue: Math.cos(p.angle) * p.dist, tension: 40, friction: 7, useNativeDriver: true }),
                Animated.spring(p.ty, { toValue: Math.sin(p.angle) * p.dist, tension: 40, friction: 7, useNativeDriver: true }),
                Animated.timing(p.op, { toValue: 1, duration: 180, useNativeDriver: true }),
                Animated.spring(p.sc, { toValue: 1, useNativeDriver: true }),
              ]),
              Animated.delay(1400),
              Animated.timing(p.op, { toValue: 0, duration: 700, useNativeDriver: true }),
            ]).start();
          });
        }
        burst();
        interval = setInterval(burst, 3000);
      }

      // Auto-dismiss after 7.5 s — fade the whole overlay out then call onDismiss
      fadeTimer = setTimeout(() => {
        const fadeAnimation = Animated.timing(overlayOp, {
          toValue: 0,
          duration: reduceMotion ? 0 : 600,
          useNativeDriver: true,
        });
        runningAnimations.push(fadeAnimation);
        fadeAnimation.start(() => onDismissRef.current());
      }, 7500);
    } catch (_) {
      // Effect-time failure — dismiss instead of crashing the app.
      onDismissRef.current();
    }

    return () => {
      if (interval) clearInterval(interval);
      if (fadeTimer) clearTimeout(fadeTimer);
      runningAnimations.forEach((animation) => animation.stop());
    };
  }, [reduceMotion, voiceReady]);

  const glowOp = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.30] });

  return (
    <Animated.View
      style={[celebStyles.overlay, { opacity: overlayOp }]}
      pointerEvents="box-none"
    >
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />

      {/* Particles — radiating from center */}
      <View style={celebStyles.particleAnchor} pointerEvents="none">
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              transform: [{ translateX: p.tx }, { translateY: p.ty }, { scale: p.sc }],
              opacity: p.op,
            }}
          >
            <Text style={celebStyles.particle}>{SPARKLE_EMOJIS[i % SPARKLE_EMOJIS.length]}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Main card */}
      <Animated.View style={[
        celebStyles.card,
        { transform: [{ translateY: cardY }, { scale: cardScale }], opacity: cardOp },
      ]}>
        {/* Woman image */}
        <View style={celebStyles.imageWrap}>
          <Animated.Image
            source={womanImage}
            style={[celebStyles.womanImage, { transform: [{ scale: imageScale }] }]}
            resizeMode="cover"
          />
          {/* Color glow tint over image */}
          <Animated.View style={[
            celebStyles.imageTint,
            { backgroundColor: gradeInfo.color, opacity: glowOp },
          ]} />
          {/* Grade badge overlaid bottom-right */}
          <View style={[celebStyles.gradeOverlay, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color }]}>
            <Text style={[celebStyles.gradeOverlayTxt, { color: gradeInfo.color }]}>{gradeInfo.grade}</Text>
          </View>
        </View>

        {/* Content below image */}
        <View style={celebStyles.cardContent}>
          <Text style={celebStyles.starsRow}>⭐ ⭐ ⭐</Text>
          <Text style={[celebStyles.gradeLabel, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
            {gradeInfo.label.toUpperCase()}
          </Text>
          <Text style={[celebStyles.profitAmt, { color: gradeInfo.profit >= 0 ? '#00e5a0' : '#ff3b3b' }]}>
            {gradeInfo.profit >= 0 ? '+' : ''}{fmtCurrency(gradeInfo.profit)}
          </Text>
          <Text style={celebStyles.profitPct}>
            {fmtPct(gradeInfo.returnPct)}{'  ·  '}
            {gradeInfo.holdDays === 0 ? 'same day' : gradeInfo.holdDays === 1 ? '1 day hold' : `${gradeInfo.holdDays}d hold`}
          </Text>
          <Text style={celebStyles.tapDismiss}>tap anywhere to dismiss</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function TradeFeedbackPopup({
  gradeInfo,
  onDismiss,
  bottomInset,
}: {
  gradeInfo: TradeGrade;
  onDismiss: () => void;
  bottomInset: number;
}) {
  const feedback = getTradeGradeFeedback(gradeInfo.grade, gradeInfo.context);
  const popupY = useRef(new Animated.Value(24)).current;
  const popupOp = useRef(new Animated.Value(0)).current;
  const bellRotate = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.65)).current;
  const ringOp = useRef(new Animated.Value(0.85)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    Haptics.notificationAsync(feedbackHapticType(gradeInfo.grade)).catch(() => {});
  }, [gradeInfo.grade]);

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const runningAnimations: Animated.CompositeAnimation[] = [];
    try {
      if (reduceMotion) {
        popupY.setValue(0);
        popupOp.setValue(1);
        bellRotate.setValue(0);
        ringScale.setValue(1);
        ringOp.setValue(0);
      } else {
        const entranceAnimation = Animated.parallel([
          Animated.spring(popupY, { toValue: 0, tension: 70, friction: 9, useNativeDriver: true }),
          Animated.timing(popupOp, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]);
        runningAnimations.push(entranceAnimation);
        entranceAnimation.start();

        const bellAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(bellRotate, { toValue: -1, duration: 90, useNativeDriver: true }),
            Animated.timing(bellRotate, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(bellRotate, { toValue: -0.65, duration: 140, useNativeDriver: true }),
            Animated.timing(bellRotate, { toValue: 0, duration: 140, useNativeDriver: true }),
            Animated.delay(900),
          ]),
          { iterations: 2 },
        );
        runningAnimations.push(bellAnimation);
        bellAnimation.start();

        const ringAnimation = Animated.parallel([
          Animated.timing(ringScale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(ringOp, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]);
        runningAnimations.push(ringAnimation);
        ringAnimation.start();
      }

      dismissTimer = setTimeout(() => {
        const fadeAnimation = Animated.timing(popupOp, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true });
        runningAnimations.push(fadeAnimation);
        fadeAnimation.start(onDismiss);
      }, 4800);
    } catch (_) {
      onDismiss();
    }

    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      runningAnimations.forEach((animation) => animation.stop());
    };
  }, [onDismiss, reduceMotion]);

  const bellTilt = bellRotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-16deg', '16deg'],
  });

  return (
    <Animated.View
      style={[
        feedbackStyles.anchor,
        { bottom: Math.max(bottomInset + 78, 92), opacity: popupOp, transform: [{ translateY: popupY }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onDismiss}
        style={[feedbackStyles.card, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color + '90' }]}
      >
        <View style={feedbackStyles.iconWrap}>
          <Animated.View
            style={[
              feedbackStyles.ring,
              { borderColor: gradeInfo.color, opacity: ringOp, transform: [{ scale: ringScale }] },
            ]}
          />
          <Animated.View style={{ transform: [{ rotate: bellTilt }] }}>
            <Feather name="bell" size={21} color={gradeInfo.color} />
          </Animated.View>
        </View>
        <View style={feedbackStyles.copy}>
          <View style={feedbackStyles.titleRow}>
            <Text style={[feedbackStyles.eyebrow, { color: gradeInfo.color, fontFamily: 'Inter_600SemiBold' }]}>
              TRADE GRADE
            </Text>
            <Text style={[feedbackStyles.grade, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
              {gradeInfo.grade}
            </Text>
          </View>
          <Text style={[feedbackStyles.headline, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
            {feedback.headline}
          </Text>
          <Text style={feedbackStyles.note}>{feedback.guidance}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const celebStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  particleAnchor: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: { fontSize: 22 },
  card: {
    borderRadius: 24,
    backgroundColor: '#0e0e0e',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.18)',
    overflow: 'hidden',
    width: 290,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  imageWrap: {
    width: '100%',
    height: 320,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  womanImage: {
    width: '100%',
    height: '100%',
  },
  imageTint: {
    ...StyleSheet.absoluteFillObject,
  },
  gradeOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gradeOverlayTxt: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  cardContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    gap: 5,
  },
  starsRow: { fontSize: 18, letterSpacing: 6, marginBottom: 2 },
  gradeLabel: { fontSize: 13, letterSpacing: 1.5 },
  profitAmt: { fontSize: 28, fontFamily: 'Inter_700Bold', marginTop: 2 },
  profitPct: { fontSize: 13, color: 'rgba(192,192,192,0.65)', fontFamily: 'Inter_400Regular' },
  tapDismiss: { fontSize: 10, color: 'rgba(192,192,192,0.3)', fontFamily: 'Inter_400Regular', marginTop: 6 },
});

const feedbackStyles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 998,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  ring: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
  },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 9, letterSpacing: 1.1 },
  grade: { fontSize: 20, lineHeight: 22 },
  headline: { fontSize: 12, letterSpacing: 0.3 },
  note: { color: 'rgba(255,255,255,0.72)', fontSize: 11, lineHeight: 15 },
});

// ─── Compact Position Row ─────────────────────────────────────────────────────

function PositionRow({
  position, onSell, onBuyMore, colors,
}: {
  position: Position; onSell: () => void; onBuyMore: () => void; colors: any;
}) {
  const isLong = position.netShares > 0;
  const pnl = position.unrealizedPnL;
  const pnlColor = pnl > 0 ? colors.buyColor : pnl < 0 ? colors.sellColor : colors.mutedForeground;

  return (
    <View style={[rowStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={rowStyles.leftCol}>
        <Text style={[rowStyles.sym, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{position.symbol}</Text>
        <View style={[rowStyles.badge, {
          backgroundColor: isLong ? colors.buyBg : colors.sellBg,
          borderColor: isLong ? colors.buyColor : colors.sellColor,
        }]}>
          <Text style={[rowStyles.badgeTxt, { color: isLong ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
            {isLong ? 'LONG' : 'SHORT'}
          </Text>
        </View>
      </View>
      <View style={rowStyles.midCol}>
        <Text style={[rowStyles.midTop, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {fmtNum(Math.abs(position.netShares), 2)} sh
        </Text>
        <Text style={[rowStyles.midBot, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          avg {fmtCurrency(position.avgCost)}
        </Text>
      </View>
      <View style={rowStyles.pnlCol}>
        <Text style={[rowStyles.pnlTop, { color: position.currentPrice != null ? pnlColor : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          {position.currentPrice != null ? `${pnl >= 0 ? '+' : ''}${fmtCurrency(pnl)}` : '—'}
        </Text>
        <Text style={[rowStyles.pnlBot, { color: position.currentPrice != null ? pnlColor : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          {position.currentPrice != null && position.pctChange != null ? fmtPct(position.pctChange) : '—'}
        </Text>
      </View>
      <TouchableOpacity
        style={[rowStyles.actionBtn, { borderColor: isLong ? colors.sellColor : colors.buyColor }]}
        onPress={isLong ? onSell : onBuyMore}
        activeOpacity={0.7}
      >
        <Text style={[rowStyles.actionTxt, { color: isLong ? colors.sellColor : colors.buyColor, fontFamily: 'Inter_700Bold' }]}>
          {isLong ? 'SELL' : 'CLOSE'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { borderRadius: 10, borderWidth: 1, marginBottom: 6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  leftCol: { width: 68, gap: 2 },
  sym: { fontSize: 18 },
  badge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 9, letterSpacing: 0.4 },
  midCol: { flex: 1, gap: 1 },
  midTop: { fontSize: 15 },
  midBot: { fontSize: 13 },
  pnlCol: { alignItems: 'flex-end', gap: 1, minWidth: 86 },
  pnlTop: { fontSize: 15 },
  pnlBot: { fontSize: 13 },
  actionBtn: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6, minWidth: 52, alignItems: 'center' },
  actionTxt: { fontSize: 13, letterSpacing: 0.5 },
});

// ─── Trade History Card ────────────────────────────────────────────────────────

function TradeCard({
  trade,
  quote,
  gradeInfo,
  closed,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  colors,
}: {
  trade: Trade;
  quote: Quote | null | undefined;
  gradeInfo: TradeGrade | null;
  closed: ClosedTrade | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  colors: any;
}) {
  const isBuy = trade.type === 'buy';
  const isDividend = trade.type === 'dividend';
  const badgeColor = isDividend ? colors.primary : isBuy ? colors.buyColor : colors.sellColor;
  const badgeBg = isDividend ? colors.primary + '20' : isBuy ? colors.buyBg : colors.sellBg;

  return (
    <View style={[tcStyles.card, { backgroundColor: colors.card, borderColor: gradeInfo ? gradeInfo.color + '60' : colors.border }]}>
      {/* Top row: symbol / type badge / grade / actions */}
      <TouchableOpacity style={tcStyles.top} onPress={onToggleExpand} activeOpacity={0.75}>
        <View style={tcStyles.topLeft}>
          <Text style={[tcStyles.symbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{trade.symbol}</Text>
          <View style={[tcStyles.typeBadge, {
            backgroundColor: badgeBg,
            borderColor: badgeColor,
          }]}>
            <Text style={[tcStyles.typeBadgeTxt, { color: badgeColor, fontFamily: 'Inter_700Bold' }]}>
              {isDividend ? 'DIVIDEND' : isBuy ? 'BUY' : 'SELL'}
            </Text>
          </View>
          <Text style={[tcStyles.date, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {formatDateShort(trade.date)}
          </Text>
        </View>

        <View style={tcStyles.topRight}>
          <TouchableOpacity onPress={onEdit} style={tcStyles.iconBtn} activeOpacity={0.7}>
            <Feather name="edit-2" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={tcStyles.iconBtn} activeOpacity={0.7}>
            <Feather name="trash-2" size={13} color={colors.sellColor} />
          </TouchableOpacity>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>

      {/* Tap-for-details hint — only on collapsed sell cards */}
      {gradeInfo && !expanded && (
        <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.7}
          style={[tcStyles.tapHint, { borderTopColor: colors.border }]}>
          <Feather name="chevron-up" size={10} color={colors.mutedForeground} />
          <Text style={[tcStyles.tapHintTxt, { color: colors.mutedForeground }]}>TAP FOR TRADE ANALYSIS</Text>
          <Feather name="chevron-up" size={10} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      <View style={[tcStyles.divider, { backgroundColor: colors.border }]} />

      {/* Core metrics row */}
      <View style={tcStyles.metrics}>
        {/* Left col: SHARES + TOTAL */}
        <View style={tcStyles.metricCol}>
          {[
            { label: 'SHARES', value: fmtNum(trade.shares, 4) },
            { label: 'TOTAL RECEIVED', value: fmtCurrency(trade.shares * trade.pricePerShare) },
          ].map(c => (
            <View key={c.label} style={tcStyles.metricCell}>
              <Text style={[tcStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{c.label}</Text>
              <Text style={[tcStyles.metricVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{c.value}</Text>
            </View>
          ))}
        </View>
        {/* Middle col: SELL/BUY PRICE + CURRENT */}
        <View style={tcStyles.metricCol}>
          {[
            { label: isDividend ? 'DIV / SHARE' : isBuy ? 'BUY PRICE' : 'SELL PRICE', value: fmtCurrency(trade.pricePerShare) },
            { label: isDividend ? 'STATUS' : 'CURRENT', value: isDividend ? 'RECEIVED' : quote ? fmtCurrency(quote.currentPrice) : '—' },
          ].map(c => (
            <View key={c.label} style={tcStyles.metricCell}>
              <Text style={[tcStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{c.label}</Text>
              <Text style={[tcStyles.metricVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{c.value}</Text>
            </View>
          ))}
        </View>
        {/* Right col: grade badge (sell trades only) */}
        {gradeInfo && (
          <View style={[tcStyles.gradeBadge, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color }]}>
            <Text style={[tcStyles.gradeBadgeTxt, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
              {gradeInfo.grade}
            </Text>
            <Text style={[tcStyles.gradeBadgeAmt, { color: gradeInfo.profit >= 0 ? '#00e5a0' : '#ff3b3b' }]}>
              {gradeInfo.profit >= 0 ? '+' : ''}{fmtCurrency(gradeInfo.profit)}
            </Text>
            <Text style={[tcStyles.gradeBadgePct, { color: gradeInfo.color }]}>
              {fmtPct(gradeInfo.returnPct)}
            </Text>
          </View>
        )}
      </View>

      {/* Expanded analysis — sell trades only */}
      {expanded && gradeInfo && (
        <View style={[tcStyles.analysis, { borderTopColor: colors.border, backgroundColor: gradeInfo.bgColor + '80' }]}>
          <Text style={[tcStyles.analysisTitle, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
            TRADE ANALYSIS
          </Text>

          <View style={tcStyles.analysisGrid}>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>AVG BUY PRICE</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {fmtCurrency(gradeInfo.avgCost)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>PROFIT / LOSS</Text>
              <Text style={[tcStyles.aVal, {
                color: gradeInfo.profit >= 0 ? colors.buyColor : colors.sellColor,
                fontFamily: 'Inter_700Bold',
              }]}>
                {gradeInfo.profit >= 0 ? '+' : ''}{fmtCurrency(gradeInfo.profit)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>RETURN %</Text>
              <Text style={[tcStyles.aVal, {
                color: gradeInfo.returnPct >= 0 ? colors.buyColor : colors.sellColor,
                fontFamily: 'Inter_700Bold',
              }]}>
                {fmtPct(gradeInfo.returnPct)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>HELD FOR</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {gradeInfo.holdDays === 0 ? 'same day'
                  : gradeInfo.holdDays === 1 ? '1 day'
                  : `${gradeInfo.holdDays} days`}
              </Text>
            </View>
            {closed && closed.fee > 0 && (
              <>
                <View style={tcStyles.analysisCell}>
                  <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>FUND FEE</Text>
                  <Text style={[tcStyles.aVal, { color: colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
                    −{fmtCurrency(closed.fee)}
                  </Text>
                </View>
                <View style={tcStyles.analysisCell}>
                  <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>NET P&L</Text>
                  <Text style={[tcStyles.aVal, {
                    color: closed.net >= 0 ? colors.buyColor : colors.sellColor,
                    fontFamily: 'Inter_700Bold',
                  }]}>
                    {closed.net >= 0 ? '+' : ''}{fmtCurrency(closed.net)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Grade breakdown */}
          <View style={[tcStyles.gradeBreakdown, { borderColor: gradeInfo.color + '50' }]}>
            <View style={[tcStyles.gradeLargePill, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color }]}>
              <Text style={[tcStyles.gradeLarge, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
                {gradeInfo.grade}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[tcStyles.gradeTitle, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
                {gradeInfo.label}
              </Text>
              <Text style={[tcStyles.gradeContext, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {gradeInfo.context}
              </Text>
            </View>
          </View>

          {/* Scoring explanation */}
          <Text style={[tcStyles.scoringNote, { color: colors.mutedForeground }]}>
            Score: {gradeInfo.compositeScore.toFixed(1)} pts  ·  A+ requires ≥{A_PLUS_SCORE_THRESHOLD} pts (high return × fast execution)
          </Text>
        </View>
      )}

      {/* Expanded analysis — buy trades */}
      {expanded && isDividend && (
        <View style={[tcStyles.analysis, { borderTopColor: colors.border }]}>
          <Text style={[tcStyles.analysisTitle, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
            DIVIDEND RECEIVED
          </Text>
          <View style={tcStyles.analysisGrid}>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>SHARES HELD</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {fmtNum(trade.shares, 4)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>PER SHARE</Text>
              <Text style={[tcStyles.aVal, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                {fmtCurrency(trade.pricePerShare)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>CASH RECEIVED</Text>
              <Text style={[tcStyles.aVal, { color: colors.buyColor, fontFamily: 'Inter_700Bold' }]}>
                +{fmtCurrency(trade.shares * trade.pricePerShare)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {expanded && !gradeInfo && !isDividend && (
        <View style={[tcStyles.analysis, { borderTopColor: colors.border }]}>
          <Text style={[tcStyles.analysisTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            OPEN POSITION COST
          </Text>
          <View style={tcStyles.analysisGrid}>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>COST BASIS</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {fmtCurrency(trade.shares * trade.pricePerShare)}
              </Text>
            </View>
            {quote && (
              <>
                <View style={tcStyles.analysisCell}>
                  <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>MKT VALUE</Text>
                  <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                    {fmtCurrency(trade.shares * quote.currentPrice)}
                  </Text>
                </View>
                <View style={tcStyles.analysisCell}>
                  <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>UNREALIZED</Text>
                  <Text style={[tcStyles.aVal, {
                    color: (quote.currentPrice - trade.pricePerShare) >= 0 ? colors.buyColor : colors.sellColor,
                    fontFamily: 'Inter_700Bold',
                  }]}>
                    {fmtPct(((quote.currentPrice - trade.pricePerShare) / trade.pricePerShare) * 100)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const tcStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 10 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, flexWrap: 'wrap' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  symbol: { fontSize: 18 },
  typeBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeTxt: { fontSize: 11, letterSpacing: 0.5 },
  date: { fontSize: 13 },
  gradeBadge: {
    borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 64,
  },
  gradeBadgeTxt: { fontSize: 26, letterSpacing: 0.5, lineHeight: 30 },
  gradeBadgeAmt: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2, marginTop: 3 },
  gradeBadgePct: { fontSize: 12, fontFamily: 'Inter_400Regular', letterSpacing: 0.2, marginTop: 1 },
  tapHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 5, borderTopWidth: 1,
  },
  tapHintTxt: { fontSize: 10, letterSpacing: 1, fontFamily: 'Inter_500Medium' },
  iconBtn: { padding: 4 },
  divider: { height: 1, marginHorizontal: 12 },
  metrics: { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'center' },
  metricCol: { flex: 1, gap: 10 },
  metricCell: {},
  metricLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  metricVal: { fontSize: 16 },
  analysis: { borderTopWidth: 1, padding: 12, gap: 10 },
  analysisTitle: { fontSize: 12, letterSpacing: 1.2, marginBottom: 2 },
  analysisGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  analysisCell: { width: '44%' },
  aLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 2, fontFamily: 'Inter_400Regular' },
  aVal: { fontSize: 16 },
  gradeBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
  },
  gradeLargePill: {
    borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  gradeLarge: { fontSize: 24 },
  gradeTitle: { fontSize: 15, marginBottom: 2 },
  gradeContext: { fontSize: 13, lineHeight: 18 },
  scoringNote: { fontSize: 11, letterSpacing: 0.3, fontFamily: 'Inter_400Regular', marginTop: 2 },
});

// ─── Add/Edit Trade Modal ─────────────────────────────────────────────────────

interface TradeForm { symbol: string; type: 'buy' | 'sell' | 'dividend'; shares: string; price: string; }

function TradeModal({
  visible, initial, defaultType, defaultSymbol, allTrades, onSave, onClose, colors,
}: {
  visible: boolean; initial?: Trade | null; defaultType?: 'buy' | 'sell' | 'dividend'; defaultSymbol?: string;
  allTrades: Trade[]; onSave: (t: Omit<Trade, 'id' | 'date'>) => void; onClose: () => void; colors: any;
}) {
  const [form, setForm] = useState<TradeForm>({ symbol: '', type: 'buy', shares: '', price: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof TradeForm, string>>>({});

  useEffect(() => {
    if (visible) {
      setErrors({});
      if (initial) {
        setForm({ symbol: initial.symbol, type: initial.type, shares: String(initial.shares), price: String(initial.pricePerShare) });
      } else {
        setForm({ symbol: defaultSymbol ?? '', type: defaultType ?? 'buy', shares: '', price: '' });
      }
    }
  }, [visible, initial, defaultType, defaultSymbol]);

  const available = form.type === 'sell' && form.symbol
    ? availableToSell(form.symbol.trim().toUpperCase(), allTrades, initial?.id) : null;

  function validate() {
    const e: Partial<Record<keyof TradeForm, string>> = {};
    if (!form.symbol.trim()) e.symbol = 'Required';
    const s = parseFloat(form.shares);
    if (!form.shares || isNaN(s) || s <= 0) { e.shares = 'Enter valid shares'; }
    else if (form.type === 'sell' && available != null && s > available) {
      e.shares = available <= 0
        ? `No long position in ${form.symbol.trim().toUpperCase()}`
        : `Max ${fmtNum(available, 2)} shares available`;
    }
    const p = parseFloat(form.price);
    if (!form.price || isNaN(p) || p <= 0) e.price = 'Enter valid price';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onSave({ symbol: form.symbol.trim().toUpperCase(), type: form.type, shares: parseFloat(form.shares), pricePerShare: parseFloat(form.price) });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[mStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
          >
            <Text style={[mStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {initial ? 'Edit Trade' : 'Add Trade'}
            </Text>

            <Text style={[mStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TICKER SYMBOL</Text>
            <TextInput
              style={[mStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: errors.symbol ? colors.sellColor : colors.border, fontFamily: 'Inter_600SemiBold' }]}
              value={form.symbol} onChangeText={v => setForm({ ...form, symbol: v.toUpperCase() })}
              placeholder="AAPL" placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters" autoCorrect={false}
            />
            {errors.symbol && <Text style={[mStyles.error, { color: colors.sellColor }]}>{errors.symbol}</Text>}

            <Text style={[mStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TYPE</Text>
            <View style={mStyles.toggle}>
              {(['buy', 'sell', 'dividend'] as const).map(t => (
                <TouchableOpacity key={t}
                  style={[mStyles.toggleBtn, {
                    backgroundColor: form.type === t ? (t === 'buy' ? colors.buyBg : t === 'sell' ? colors.sellBg : colors.primary + '20') : 'transparent',
                    borderColor: form.type === t ? (t === 'buy' ? colors.buyColor : t === 'sell' ? colors.sellColor : colors.primary) : colors.border,
                  }]}
                  onPress={() => setForm({ ...form, type: t })} activeOpacity={0.75}
                >
                  <Text style={[mStyles.toggleText, { color: form.type === t ? (t === 'buy' ? colors.buyColor : t === 'sell' ? colors.sellColor : colors.primary) : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                    {t === 'dividend' ? 'DIV' : t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.type === 'sell' && form.symbol.trim() && available != null && (
              <Text style={[mStyles.hint, { color: available > 0 ? colors.buyColor : colors.sellColor }]}>
                {available > 0 ? `Available to sell: ${fmtNum(available, 2)} shares` : `No long position in ${form.symbol.trim().toUpperCase()} — buy first`}
              </Text>
            )}

            <View style={mStyles.row}>
              {[
                { key: 'shares' as const, label: form.type === 'dividend' ? 'SHARES HELD' : 'SHARES', ph: '10' },
                { key: 'price' as const, label: form.type === 'dividend' ? 'DIV / SHARE' : 'PRICE / SHARE', ph: form.type === 'dividend' ? '0.83' : '150.00' },
              ].map(f => (
                <View key={f.key} style={{ flex: 1 }}>
                  <Text style={[mStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>{f.label}</Text>
                  <TextInput
                    style={[mStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: errors[f.key] ? colors.sellColor : colors.border, fontFamily: 'Inter_600SemiBold' }]}
                    value={form[f.key]} onChangeText={v => setForm({ ...form, [f.key]: v })}
                    placeholder={f.ph} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad"
                  />
                  {errors[f.key] && <Text style={[mStyles.error, { color: colors.sellColor }]}>{errors[f.key]}</Text>}
                </View>
              ))}
            </View>

            <View style={mStyles.btnRow}>
              <TouchableOpacity style={[mStyles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
                <Text style={[mStyles.cancelText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.saveBtn, { backgroundColor: colors.primary }]} onPress={submit} activeOpacity={0.8}>
                <Text style={[mStyles.saveText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  {initial ? 'Save Changes' : form.type === 'dividend' ? 'Add Dividend' : 'Add Trade'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderBottomWidth: 0, padding: 24, paddingBottom: Platform.OS === 'web' ? 24 : 36, maxHeight: '85%' },
  title: { fontSize: 18, marginBottom: 8 },
  label: { fontSize: 10, letterSpacing: 0.8, marginBottom: 5, marginTop: 10 },
  hint: { fontSize: 11, marginTop: -2, marginBottom: 4, fontFamily: 'Inter_500Medium' },
  input: { height: 46, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  error: { fontSize: 11, marginTop: 3, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', gap: 12 },
  toggle: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14 },
  saveBtn: { flex: 2, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, letterSpacing: 0.5 },
});

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ positions, trades, closedTrades, unmatchedSells, onReset, onAddDividend, colors }: { positions: Position[]; trades: Trade[]; closedTrades: ClosedTrade[]; unmatchedSells: UnmatchedSell[]; onReset: () => void; onAddDividend: () => void; colors: any }) {
  const open = positions.filter(p => p.netShares !== 0);
  const totalCost = open.reduce((s, p) => s + Math.max(p.costBasis, 0), 0);
  const totalMkt = open.reduce((s, p) => s + p.marketValue, 0);
  const totalUnreal = open.reduce((s, p) => s + p.unrealizedPnL, 0);
  // Realized P&L and fees are computed per closing trade (net of fund fees).
  const { totalReal, totalFees, wins, totalClosed, winRate } = computeTradeSummary(closedTrades);
  const totalDividends = computeDividendTotal(trades);
  const totalPnL = totalUnreal + totalReal;
  const totalPct = totalCost > 0 ? (totalUnreal / totalCost) * 100 : 0;
  const isGain = totalPnL >= 0;

  return (
    <View style={[smStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={smStyles.titleRow}>
        <Text style={[smStyles.heading, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>PORTFOLIO SUMMARY</Text>
        <View style={smStyles.titleActions}>
          <TouchableOpacity style={smStyles.resetBtn} onPress={onAddDividend} activeOpacity={0.7}>
            <Feather name="dollar-sign" size={12} color={colors.primary} />
            <Text style={[smStyles.resetTxt, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>DIVIDEND</Text>
          </TouchableOpacity>
          <TouchableOpacity style={smStyles.resetBtn} onPress={onReset} activeOpacity={0.7}>
            <Feather name="trash-2" size={12} color={colors.sellColor} />
            <Text style={[smStyles.resetTxt, { color: colors.sellColor, fontFamily: 'Inter_600SemiBold' }]}>RESET</Text>
          </TouchableOpacity>
        </View>
      </View>
      {unmatchedSells.length > 0 && (
        <View style={[smStyles.warning, { backgroundColor: colors.holdBg, borderColor: colors.gradeWarning }]}>
          <View style={smStyles.warningHeading}>
            <Feather name="alert-triangle" size={15} color={colors.gradeWarning} />
            <Text style={[smStyles.warningTitle, { color: colors.gradeWarning, fontFamily: 'Inter_700Bold' }]}>
              TRADE HISTORY NEEDS ATTENTION
            </Text>
          </View>
          <Text style={[smStyles.warningCopy, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
            {unmatchedSells.reduce((sum, sell) => sum + sell.unmatchedShares, 0).toLocaleString('en-US', {
              maximumFractionDigits: 4,
            })} shares from {unmatchedSells.length === 1 ? 'this sell' : `${unmatchedSells.length} sells`} could not be matched to earlier buys. Realized P&L excludes those shares.
          </Text>
          <Text style={[smStyles.warningHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Add the missing BUY or edit/remove the affected SELL in History.
          </Text>
          {unmatchedSells.map(sell => (
            <View key={sell.sellId} style={smStyles.warningDetail}>
              <Text style={[smStyles.warningDetailSymbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {sell.symbol}
              </Text>
              <Text style={[smStyles.warningDetailText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {fmtNum(sell.unmatchedShares)} unmatched · {formatDateShort(sell.date)}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={smStyles.metricsRow}>
        {[
          { label: 'COST BASIS', val: fmtCurrency(totalCost), color: colors.foreground },
          { label: 'MKT VALUE', val: fmtCurrency(totalMkt), color: colors.foreground },
          { label: 'REALIZED', val: `${totalReal >= 0 ? '+' : ''}${fmtCurrency(totalReal)}`, color: totalReal > 0 ? colors.buyColor : totalReal < 0 ? colors.sellColor : colors.mutedForeground },
        ].map((m, i) => (
          <React.Fragment key={m.label}>
            {i > 0 && <View style={[smStyles.divider, { backgroundColor: colors.border }]} />}
            <View style={smStyles.metricCell}>
              <Text style={[smStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{m.label}</Text>
              <Text style={[smStyles.metricVal, { color: m.color, fontFamily: 'Inter_700Bold' }]}>{m.val}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <View style={smStyles.metricsRow}>
        {[
          { label: 'WIN RATE', val: winRate != null ? `${winRate}%` : '—', sub: totalClosed > 0 ? `${wins}/${totalClosed} wins` : 'no closed trades', color: colors.foreground, flex: totalDividends > 0 ? 1 : 2 },
          ...(totalDividends > 0
            ? [{ label: 'DIVIDENDS', val: `+${fmtCurrency(totalDividends)}`, sub: 'received', color: colors.buyColor, flex: 1 }]
            : []),
          { label: 'FUND FEES', val: totalFees > 0 ? `-${fmtCurrency(totalFees)}` : fmtCurrency(0), sub: 'expense ratios', color: totalFees > 0 ? colors.sellColor : colors.mutedForeground, flex: 1 },
        ].map((m, i) => (
          <React.Fragment key={m.label}>
            {i > 0 && <View style={[smStyles.divider, { backgroundColor: colors.border }]} />}
            <View style={[smStyles.metricCell, { flex: m.flex }]}>
              <Text style={[smStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{m.label}</Text>
              <Text style={[smStyles.metricVal, { color: m.color, fontFamily: 'Inter_700Bold' }]}>{m.val}</Text>
              <Text style={[smStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{m.sub}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <View style={[smStyles.plStrip, { backgroundColor: isGain ? colors.buyBg : colors.sellBg, borderColor: isGain ? colors.buyColor : colors.sellColor }]}>
        <View style={smStyles.plTopRow}>
          <Text style={[smStyles.plLabel, { color: colors.mutedForeground }]}>UNREALIZED</Text>
        </View>
        <View style={smStyles.plBottomRow}>
          <Text style={[smStyles.plTotal, { color: isGain ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
            TOTAL  {totalPnL >= 0 ? '+' : ''}{fmtCurrency(totalPnL)}
          </Text>
          <Text style={[smStyles.plVal, { color: totalUnreal >= 0 ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
            {totalUnreal >= 0 ? '+' : ''}{fmtCurrency(totalUnreal)}{totalPct !== 0 ? `  ${fmtPct(totalPct)}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const smStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { fontSize: 12, letterSpacing: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetTxt: { fontSize: 12, letterSpacing: 0.5 },
  warning: { borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 10, gap: 6 },
  warningHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningTitle: { fontSize: 10, letterSpacing: 0.6 },
  warningCopy: { fontSize: 12, lineHeight: 17 },
  warningHint: { fontSize: 11, lineHeight: 16 },
  warningDetail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningDetailSymbol: { fontSize: 11, minWidth: 48 },
  warningDetailText: { fontSize: 11 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  metricCell: { flex: 1, gap: 2 },
  divider: { width: 1, height: 36, marginHorizontal: 8 },
  metricLabel: { fontSize: 10, letterSpacing: 0.5 },
  metricVal: { fontSize: 16 },
  plStrip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'column', gap: 2 },
  plTopRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  plBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plLabel: { fontSize: 10, letterSpacing: 0.5, fontFamily: 'Inter_400Regular' },
  plVal: { fontSize: 15 },
  plTotal: { fontSize: 15 },
});

function GradeHistoryModal({
  visible,
  points,
  colors,
  onClose,
}: {
  visible: boolean;
  points: GradeHistoryPoint[];
  colors: any;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The chart sits inside the modal content padding and the card's padding.
  // Keep its detail card aligned with the chart instead of overflowing right.
  const chartWidth = Math.max(width - 48, 280);
  const chartHeight = Math.max(Math.min(height * 0.58, 560), 360);
  const topPad = Platform.OS === 'web' ? 16 : insets.top;
  const [trainingTapeVisible, setTrainingTapeVisible] = useState(false);
  const [brewBankVisible, setBrewBankVisible] = useState(false);
  const [bankEntryBusy, setBankEntryBusy] = useState(false);
  const [brewCelebrationVisible, setBrewCelebrationVisible] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const {
    quotesViewed,
    isUnlocked: brewBankUnlocked,
    brewTokens,
    soundEnabled,
    hapticsEnabled,
    justUnlocked,
    incrementQuoteViewed,
    resolveBet,
    setSoundEnabled,
    setHapticsEnabled,
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
    buyBankKey,
    activateBankKey,
    unlockQuickRevive,
    buyQuickReviveBottle,
    redeemQuickReviveBottle,
    unlockDaiquiri,
    buyDaiquiriBottle,
    redeemDaiquiriBottle,
    unlockStaminUp,
    buyStaminUpBottle,
    redeemStaminUpBottle,
    unlockSmartPro,
    buySmartProBottle,
    redeemSmartProBottle,
    unlockNeonGucciPhrases,
    setNeonGucciPhrasesActive,
    clearJustUnlocked,
  } = useAmericanMode().brew;
  const isWeekend = [0, 6].includes(new Date().getDay());
  const hasActiveBankAccess = hasBrewBankAccess(bankAccessExpiresAt, countdownNow);
  const bankAccessRemaining = formatBrewBankAccessRemaining(bankAccessExpiresAt, countdownNow);

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

  const handleQuoteViewed = useCallback((quoteViewId: string) => {
    return incrementQuoteViewed(quoteViewId);
  }, [incrementQuoteViewed]);

  useEffect(() => {
    if (!justUnlocked) return;
    if (!BREW_BANK_ENABLED) {
      clearJustUnlocked();
      return;
    }
    setTrainingTapeVisible(false);
    setBrewCelebrationVisible(true);
    clearJustUnlocked();
  }, [clearJustUnlocked, justUnlocked]);

  const handleOpenBank = async () => {
    if (bankEntryBusy || !BREW_BANK_ENABLED || !brewBankUnlocked) return;

    const day = new Date(countdownNow).getDay();
    if (canEnterBrewBank(day, bankAccessExpiresAt, countdownNow)) {
      setBrewBankVisible(true);
      return;
    }

    if (isWeekend || bankKeys <= 0) {
      setTrainingTapeVisible(true);
      return;
    }

    setBankEntryBusy(true);
    const redeemed = await activateBankKey(countdownNow);
    setBankEntryBusy(false);
    if (redeemed) setBrewBankVisible(true);
  };

  const handleHeaderLongPress = () => {
    setTrainingTapeVisible(true);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <AmericanSteelBackground>
        <View style={[gradeModalStyles.root, { backgroundColor: colors.background }]}>
          <View style={[gradeModalStyles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={gradeModalStyles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close trade grade history"
            >
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </TouchableOpacity>
            <View style={gradeModalStyles.headerCopy}>
              <Pressable
                onLongPress={handleHeaderLongPress}
                delayLongPress={800}
                accessibilityLabel="Trade grade history"
              >
                <Text style={[gradeModalStyles.title, { color: colors.heading, fontFamily: 'Inter_700Bold' }]}>
                  TRADE GRADE HISTORY
                </Text>
              </Pressable>
              <Text style={[gradeModalStyles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Completed trades · tap a dot for details
              </Text>
            </View>
          </View>

          <ScrollView
            style={gradeModalStyles.scroll}
            contentContainerStyle={[gradeModalStyles.content, { paddingBottom: Math.max(insets.bottom, 18) + 20 }]}
            showsVerticalScrollIndicator={false}
          >
            {BREW_BANK_ENABLED && brewBankUnlocked && (isWeekend || bankKeys > 0 || hasActiveBankAccess) && (
              <Pressable
                onPress={() => { void handleOpenBank(); }}
                disabled={bankEntryBusy}
                style={[gradeModalStyles.bankShortcut, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}
                accessibilityRole="button"
                accessibilityLabel="Open Central Bank"
                testID="central-bank-shortcut"
              >
                <View style={[gradeModalStyles.bankShortcutIcon, { backgroundColor: colors.steelShadow }]}>
                  <Feather name="key" size={16} color={colors.gold} />
                </View>
                <View style={gradeModalStyles.bankShortcutCopy}>
                  <Text style={[gradeModalStyles.bankShortcutTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    CENTRAL BANK
                  </Text>
                  <Text style={[gradeModalStyles.bankShortcutStatus, { color: hasActiveBankAccess || isWeekend ? colors.gold : colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                    {hasActiveBankAccess && bankAccessExpiresAt && bankAccessRemaining
                      ? `ACCESS ACTIVE · ${bankAccessRemaining.toUpperCase()} · OPEN UNTIL ${new Date(bankAccessExpiresAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase()}`
                      : isWeekend
                        ? 'OPEN THIS WEEKEND · NO KEY NEEDED'
                        : bankKeys > 0
                          ? 'WEEKDAY ENTRY · REDEEM KEY TO ENTER'
                          : 'WEEKDAY ACCESS · USE A BANK KEY'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
              </Pressable>
            )}
            <View style={[gradeModalStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={gradeModalStyles.chartHeading}>
                <Text style={[gradeModalStyles.chartTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  ARE YOUR TRADES IMPROVING?
                </Text>
              </View>
              <GradeHistoryChart points={points} width={chartWidth} height={chartHeight} colors={colors} />
            </View>
          </ScrollView>
          <TrainingTapeModal
            visible={trainingTapeVisible}
            colors={colors}
            onClose={() => setTrainingTapeVisible(false)}
            onQuoteViewed={BREW_BANK_ENABLED ? handleQuoteViewed : undefined}
          />
          {BREW_BANK_ENABLED && (
            <>
              <BrewTokenBank
                visible={brewBankVisible}
                colors={colors}
                tokens={brewTokens}
                quotesViewed={quotesViewed}
                soundEnabled={soundEnabled}
                hapticsEnabled={hapticsEnabled}
                bankKeys={bankKeys}
                bankAccessExpiresAt={bankAccessExpiresAt}
                quickReviveUnlocked={quickReviveUnlocked}
                quickReviveBottles={quickReviveBottles}
                quickReviveArmed={quickReviveArmed}
                daiquiriUnlocked={daiquiriUnlocked}
                daiquiriBottles={daiquiriBottles}
                daiquiriArmed={daiquiriArmed}
                staminUpUnlocked={staminUpUnlocked}
                staminUpBottles={staminUpBottles}
                staminUpArmed={staminUpArmed}
                smartProUnlocked={smartProUnlocked}
                smartProBottles={smartProBottles}
                smartProSaleExpiresAt={smartProSaleExpiresAt}
                darkBrewTokens={darkBrewTokens}
                neonGucciPhrasesUnlocked={neonGucciPhrasesUnlocked}
                neonGucciPhrasesActive={neonGucciPhrasesActive}
                activityLog={activityLog}
                onClose={() => setBrewBankVisible(false)}
                onResolveBet={resolveBet}
                onSoundEnabledChange={setSoundEnabled}
                onHapticsEnabledChange={setHapticsEnabled}
                onBuyBankKey={buyBankKey}
                onActivateBankKey={activateBankKey}
                onUnlockQuickRevive={unlockQuickRevive}
                onBuyQuickReviveBottle={buyQuickReviveBottle}
                onRedeemQuickRevive={redeemQuickReviveBottle}
                onUnlockDaiquiri={unlockDaiquiri}
                onBuyDaiquiriBottle={buyDaiquiriBottle}
                onRedeemDaiquiri={redeemDaiquiriBottle}
                onUnlockStaminUp={unlockStaminUp}
                onBuyStaminUpBottle={buyStaminUpBottle}
                onRedeemStaminUp={redeemStaminUpBottle}
                onUnlockSmartPro={unlockSmartPro}
                onBuySmartProBottle={buySmartProBottle}
                onRedeemSmartPro={redeemSmartProBottle}
                onUnlockNeonGucciPhrases={unlockNeonGucciPhrases}
                onSetNeonGucciPhrasesActive={setNeonGucciPhrasesActive}
              />
              <BrewTokenUnlockCelebration
                visible={brewCelebrationVisible}
                colors={colors}
                soundEnabled={soundEnabled}
                hapticsEnabled={hapticsEnabled}
                onSoundEnabledChange={setSoundEnabled}
                onHapticsEnabledChange={setHapticsEnabled}
                onDismiss={() => setBrewCelebrationVisible(false)}
              />
            </>
          )}
        </View>
      </AmericanSteelBackground>
    </Modal>
  );
}

const gradeModalStyles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  closeBtn: { padding: 7 },
  headerCopy: { flex: 1 },
  title: { fontSize: 16, letterSpacing: 1.1 },
  subtitle: { fontSize: 11, marginTop: 3 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 10 },
  chartHeading: { paddingHorizontal: 4, paddingBottom: 10 },
  chartTitle: { fontSize: 12, letterSpacing: 0.7 },
  chartHint: { fontSize: 10, marginTop: 3 },
  bankShortcut: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 12, gap: 10 },
  bankShortcutIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bankShortcutCopy: { flex: 1, gap: 3 },
  bankShortcutTitle: { fontSize: 11, letterSpacing: 1 },
  bankShortcutStatus: { fontSize: 10, letterSpacing: 0.2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isUnlocked } = useAmericanMode();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [portfolioTab, setPortfolioTab] = useState<PortfolioTab>('positions');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // History tab filter & sort
  const [filterSymbol, setFilterSymbol] = useState('');
  const [sortOrder, setSortOrder] = useState<'date' | 'symbol'>('date');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [gradeHistoryVisible, setGradeHistoryVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Trade | null>(null);
  const [defaultType, setDefaultType] = useState<'buy' | 'sell' | 'dividend'>('buy');
  const [defaultSymbol, setDefaultSymbol] = useState<string | undefined>(undefined);
  const [celebration, setCelebration] = useState<TradeGrade | null>(null);
  const [tradeFeedback, setTradeFeedback] = useState<TradeGrade | null>(null);
  const { apiFetch } = useApi();
  const tradesRef = useRef<Trade[]>([]);
  const feedbackEventRef = useRef<string | null>(null);

  const topPad = Platform.OS === 'web' ? 16 : insets.top;

  // Seed from local cache immediately so trades are visible before the API responds,
  // and survive offline/signed-out launches.
  useEffect(() => {
    let cancelled = false;
    readTradesCache().then(cached => {
      if (!cancelled && cached.length > 0) {
        setTrades(cached);
        tradesRef.current = cached;
      }
    });
    apiFetch<Trade[]>('/api/user/trades')
      .then(data => {
        if (cancelled) return;
        setTrades(data);
        tradesRef.current = data;
        void writeTradesCache(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiFetch]);

  const saveTrades = useCallback(async (next: Trade[]) => {
    const prev = tradesRef.current;
    tradesRef.current = next;
    setTrades(next);
    void writeTradesCache(next);
    const nextIds = new Set(next.map(t => t.id));
    const deleted = prev.filter(t => !nextIds.has(t.id));
    const upserted = next.filter(t => {
      const old = prev.find(p => p.id === t.id);
      return !old || JSON.stringify(old) !== JSON.stringify(t);
    });
    await Promise.all([
      ...deleted.map(t => apiFetch(`/api/user/trades/${t.id}`, { method: 'DELETE' }).catch(() => {})),
      ...upserted.map(t => apiFetch('/api/user/trades', { method: 'POST', body: JSON.stringify(t) }).catch(() => {})),
    ]);
  }, [apiFetch]);

  const fetchAllQuotes = useCallback(async (tradeList: Trade[]) => {
    const symbols = [...new Set(tradeList.map(t => t.symbol))];
    if (!symbols.length) return;
    setLoadingQuotes(true);
    const results = await Promise.all(symbols.map(sym => fetchQuote(sym).catch(() => null)));
    const map: Record<string, Quote | null> = {};
    symbols.forEach((sym, i) => { map[sym] = results[i] ?? null; });
    setQuotes(map);
    setLoadingQuotes(false);
  }, []);

  useEffect(() => { if (trades.length) fetchAllQuotes(trades); }, [trades.length]);

  const onRefresh = async () => { setRefreshing(true); await fetchAllQuotes(trades); setRefreshing(false); };

  const allPositions = computePositions(trades, quotes);
  const openPositions = allPositions.filter(p => p.netShares !== 0);
  const { closedTrades, unmatchedSells } = computeTradeReconciliation(trades, quotes);
  const gradeHistoryPoints = useMemo<GradeHistoryPoint[]>(() => (
    trades
      .filter(trade => trade.type === 'sell')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .flatMap(sellTrade => {
        const closed = closedTrades.find(item => item.sellId === sellTrade.id);
        const gradeInfo = computeSellGrade(sellTrade, closed ?? null);
        const gradeIndex = gradeInfo ? GRADE_ORDER.indexOf(gradeInfo.grade as typeof GRADE_ORDER[number]) : -1;
        if (!closed || !gradeInfo || gradeIndex < 0) return [];
        return [{
          id: sellTrade.id,
          symbol: sellTrade.symbol,
          date: sellTrade.date,
          grade: gradeInfo.grade,
          gradeIndex,
          shares: sellTrade.shares,
          sellPrice: sellTrade.pricePerShare,
          grossPnL: closed.gross,
          fee: closed.fee,
          netPnL: closed.net,
          returnPct: gradeInfo.returnPct,
          holdDays: gradeInfo.holdDays,
        }];
      })
  ), [closedTrades, trades]);

  // Derived list for the History tab: symbol filter (partial match) + date range then sort.
  const filteredTrades = useMemo(() => {
    let result = [...trades];
    const q = filterSymbol.trim().toUpperCase();
    if (q) result = result.filter((t) => t.symbol.toUpperCase().includes(q));
    const from = dateFrom.trim();
    const to = dateTo.trim();
    // trade.date may be a full ISO timestamp; slice to YYYY-MM-DD for comparison
    // so same-day trades are correctly included in both bounds.
    if (from) result = result.filter((t) => t.date.slice(0, 10) >= from);
    if (to) result = result.filter((t) => t.date.slice(0, 10) <= to);
    if (sortOrder === 'symbol') {
      result.sort((a, b) => {
        const sym = a.symbol.localeCompare(b.symbol);
        if (sym !== 0) return sym;
        // Within the same symbol: newest first
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    } else {
      // Default: newest first
      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return result;
  }, [trades, filterSymbol, sortOrder, dateFrom, dateTo]);

  function handleReset() {
    Alert.alert('Reset Portfolio', 'Permanently delete ALL trades, dividends, positions, and history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Everything', style: 'destructive', onPress: async () => {
        const toDelete = [...trades];
        setTrades([]); setQuotes({}); tradesRef.current = [];
        void clearTradesCache();
        await Promise.all(toDelete.map(t => apiFetch(`/api/user/trades/${t.id}`, { method: 'DELETE' }).catch(() => {})));
      } },
    ]);
  }

  function handleSave(data: Omit<Trade, 'id' | 'date'>) {
    if (data.type === 'sell') {
      const avail = availableToSell(data.symbol, trades, editTarget?.id ?? undefined);
      if (avail <= 0) { Alert.alert('No Position', `You don't have any shares of ${data.symbol} to sell.`); return; }
      if (data.shares > avail) { Alert.alert('Too Many Shares', `You only hold ${fmtNum(avail, 2)} shares of ${data.symbol}.`); return; }
    }

    if (editTarget) {
      saveTrades(trades.map(t => t.id === editTarget.id ? { ...t, ...data } : t));
    } else {
      const newTrade: Trade = { id: uid(), date: new Date().toISOString(), ...data };
      const nextTrades = [...trades, newTrade];
      saveTrades(nextTrades);

      // Only a newly-created sell produces feedback. Editing old trades must
      // never replay a popup just because the portfolio rendered again.
      if (data.type === 'sell') {
        const closed = computeClosedTrades(nextTrades, quotes)
          .find(item => item.sellId === newTrade.id) ?? null;
        const grade = computeSellGrade(newTrade, closed);
        if (grade && feedbackEventRef.current !== newTrade.id) {
          feedbackEventRef.current = newTrade.id;
          if (grade.celebrate) {
            setCelebration(grade);
          } else {
            setTimeout(() => setTradeFeedback(grade), 250);
          }
        }
      }
    }
    setModalVisible(false);
    setEditTarget(null);
  }

  function openAdd(type: 'buy' | 'sell' | 'dividend' = 'buy', symbol?: string) {
    setEditTarget(null); setDefaultType(type); setDefaultSymbol(symbol); setModalVisible(true);
  }

  function handleEdit(trade: Trade) {
    setEditTarget(trade); setDefaultType(trade.type); setDefaultSymbol(trade.symbol); setModalVisible(true);
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Trade', 'Remove this trade?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveTrades(trades.filter(t => t.id !== id)) },
    ]);
  }

  const isEmpty = trades.length === 0;

  return (
    <AmericanSteelBackground>
      {/* Header */}
      <View style={[mainStyles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
        <View style={mainStyles.headerRow}>
          {isUnlocked ? (
            <TouchableOpacity
              onPress={() => setGradeHistoryVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open trade grade history"
              style={mainStyles.titleButton}
            >
              <Text style={[mainStyles.title, { color: colors.heading, fontFamily: 'Inter_700Bold' }]}>PORTFOLIO</Text>
              <Feather name="bar-chart-2" size={13} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <Text style={[mainStyles.title, { color: colors.heading, fontFamily: 'Inter_700Bold' }]}>PORTFOLIO</Text>
          )}
          <View style={mainStyles.headerRight}>
            <TouchableOpacity style={mainStyles.iconBtn} onPress={onRefresh} disabled={loadingQuotes || isEmpty} activeOpacity={0.7}>
              {loadingQuotes ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="refresh-cw" size={16} color={isEmpty ? colors.mutedForeground : colors.primary} />}
            </TouchableOpacity>
            <TouchableOpacity style={[mainStyles.addBtn, { backgroundColor: colors.primary }]} onPress={() => openAdd('buy')} activeOpacity={0.8}>
              <Feather name="plus" size={15} color={colors.primaryForeground} />
              <Text style={[mainStyles.addBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>ADD TRADE</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!isEmpty && (
          <View style={[mainStyles.tabRow, { borderBottomColor: colors.border }]}>
            {(['positions', 'trades'] as PortfolioTab[]).map(tab => (
              <TouchableOpacity key={tab}
                style={[mainStyles.tabBtn, portfolioTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => setPortfolioTab(tab)} activeOpacity={0.7}
              >
                <Text style={[mainStyles.tabLabel, {
                  color: portfolioTab === tab ? colors.primary : colors.mutedForeground,
                  fontFamily: portfolioTab === tab ? 'Inter_700Bold' : 'Inter_400Regular',
                }]}>
                  {tab === 'positions'
                    ? `POSITIONS (${openPositions.length})`
                    : (filterSymbol || dateFrom || dateTo)
                      ? `HISTORY (${filteredTrades.length}/${trades.length})`
                      : `HISTORY (${trades.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Content */}
      {isEmpty ? (
        <View style={mainStyles.emptyWrap}>
          <Feather name="briefcase" size={40} color="rgba(192,192,192,0.18)" />
          <Text style={[mainStyles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>No trades yet</Text>
          <Text style={[mainStyles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Add a BUY trade to start tracking your real portfolio.</Text>
          <TouchableOpacity style={[mainStyles.emptyBtn, { borderColor: colors.primary }]} onPress={() => openAdd('buy')} activeOpacity={0.75}>
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={[mainStyles.emptyBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>ADD TRADE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[mainStyles.list, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <SummaryCard positions={allPositions} trades={trades} closedTrades={closedTrades} unmatchedSells={unmatchedSells} onReset={handleReset} onAddDividend={() => openAdd('dividend')} colors={colors} />

          {portfolioTab === 'positions' ? (
            openPositions.length === 0 ? (
              <View style={mainStyles.closedNotice}>
                <Feather name="check-circle" size={28} color={colors.buyColor} />
                <Text style={[mainStyles.closedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>All positions closed</Text>
                <Text style={[mainStyles.closedSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Realized P&L shown above. Switch to History to review trades.</Text>
              </View>
            ) : (
              openPositions.map(pos => (
                <PositionRow key={pos.symbol} position={pos}
                  onSell={() => openAdd('sell', pos.symbol)}
                  onBuyMore={() => openAdd('buy', pos.symbol)}
                  colors={colors} />
              ))
            )
          ) : (
            <>
              <PortfolioFilterBar
                trades={trades}
                filterSymbol={filterSymbol}
                setFilterSymbol={setFilterSymbol}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                colors={colors}
              />
              {filteredTrades.length === 0 ? (
                <View style={mainStyles.closedNotice}>
                  <Feather name="search" size={28} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
                  <Text style={[mainStyles.closedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    No matching trades
                  </Text>
                  <Text style={[mainStyles.closedSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    No trades match the active filters. Try adjusting the ticker or date range.
                  </Text>
                </View>
              ) : (
                filteredTrades.map(trade => {
                  const closed = trade.type === 'sell' ? closedTrades.find(c => c.sellId === trade.id) ?? null : null;
                  const gradeInfo = trade.type === 'sell' ? computeSellGrade(trade, closed) : null;
                  return (
                    <TradeCard key={trade.id} trade={trade}
                      quote={quotes[trade.symbol]}
                      gradeInfo={gradeInfo}
                      closed={closed}
                      expanded={expandedId === trade.id}
                      onToggleExpand={() => setExpandedId(prev => prev === trade.id ? null : trade.id)}
                      onEdit={() => handleEdit(trade)}
                      onDelete={() => handleDelete(trade.id)}
                      colors={colors} />
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}

      <BottomTabBar />

      <TradeModal
        visible={modalVisible} initial={editTarget}
        defaultType={defaultType} defaultSymbol={defaultSymbol}
        allTrades={trades} onSave={handleSave}
        onClose={() => { setModalVisible(false); setEditTarget(null); }}
        colors={colors} />

      {isUnlocked && (
        <GradeHistoryModal
          visible={gradeHistoryVisible}
          points={gradeHistoryPoints}
          colors={colors}
          onClose={() => setGradeHistoryVisible(false)}
        />
      )}

      {/* Celebration overlay */}
      {celebration && (
        <CelebrationBoundary onError={() => setCelebration(null)}>
          <CelebrationOverlay gradeInfo={celebration} onDismiss={() => setCelebration(null)} />
        </CelebrationBoundary>
      )}
      {tradeFeedback && (
        <TradeFeedbackPopup
          gradeInfo={tradeFeedback}
          bottomInset={insets.bottom}
          onDismiss={() => setTradeFeedback(null)}
        />
      )}
    </AmericanSteelBackground>
  );
}

const mainStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 0, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
  title: { fontSize: 18, letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
  addBtnText: { fontSize: 11, letterSpacing: 0.5 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 10, letterSpacing: 0.8 },
  list: { paddingHorizontal: 14, paddingTop: 12 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, marginTop: 10 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9, marginTop: 6 },
  emptyBtnText: { fontSize: 13, letterSpacing: 0.5 },
  closedNotice: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  closedTitle: { fontSize: 16, marginTop: 4 },
  closedSub: { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
});
