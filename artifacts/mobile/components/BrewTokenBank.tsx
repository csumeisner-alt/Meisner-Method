import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { ColorScheme } from '@/constants/colors';
import {
  BREW_BANK_KEY_PRICE,
  BREW_TOKEN_WIN_PROBABILITY,
  formatBrewBankAccessRemaining,
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

type Props = {
  visible: boolean;
  colors: ColorScheme;
  tokens: number;
  quotesViewed: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  bankKeys: number;
  bankAccessExpiresAt: number | null;
  onClose: () => void;
  onResolveBet: (bet: number, won: boolean) => Promise<void>;
  onSoundEnabledChange: (value: boolean) => Promise<void>;
  onHapticsEnabledChange: (value: boolean) => Promise<void>;
  onBuyBankKey: () => Promise<boolean>;
  onActivateBankKey: () => Promise<boolean>;
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

const MACHINE_STATUS_LINES = [
  'RUNNING THE NUMBERS',
  'CONSULTING THE RESERVE',
  'CHECKING THE VAULT',
  'PRICING YOUR CONFIDENCE',
] as const;

export function BrewTokenBank({
  visible,
  colors,
  tokens,
  quotesViewed,
  soundEnabled,
  hapticsEnabled,
  bankKeys,
  bankAccessExpiresAt,
  onClose,
  onResolveBet,
  onSoundEnabledChange,
  onHapticsEnabledChange,
  onBuyBankKey,
  onActivateBankKey,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedBet, setSelectedBet] = useState(1);
  const [result, setResult] = useState<{ won: boolean; bet: number } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [displayedTokens, setDisplayedTokens] = useState(tokens);
  const [lossVoicePlaying, setLossVoicePlaying] = useState(false);
  const [protectedVoicePlaying, setProtectedVoicePlaying] = useState(false);
  const [machineStatusIndex, setMachineStatusIndex] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState<string | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const balanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const machineStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lossVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const machineSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedTokensRef = useRef(tokens);
  const lossPlayerRef = useRef<AudioPlayerHandle | null>(null);
  const machinePlayerRef = useRef<AudioPlayerHandle | null>(null);
  const winPlayerRef = useRef<AudioPlayerHandle | null>(null);
  const activeLossPhraseRef = useRef<LossPhrase | null>(null);
  const coinProgress = useSharedValue(0);
  const vaultPulse = useSharedValue(0);
  const resultProgress = useSharedValue(0);

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

  const stopMachineStatus = () => {
    if (machineStatusTimerRef.current) clearInterval(machineStatusTimerRef.current);
    machineStatusTimerRef.current = null;
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    stopMachineStatus();
    stopLossVoice(true);
    stopMachineSound();
    stopWinSound();
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

  const bet = Math.min(Math.max(selectedBet, 1), Math.max(tokens, 1));
  const canPlay = tokens > 0 && !resolving && !protectedVoicePlaying;
  const bankAccessActive = hasBrewBankAccess(bankAccessExpiresAt, countdownNow);
  const canActivateKey = isWeekday(new Date().getDay()) && bankKeys > 0 && !bankAccessActive && !resolving;

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
    onClose();
  };

  const handleBet = () => {
    if (!canPlay) return;
    const won = Math.random() < BREW_TOKEN_WIN_PROBABILITY;
    setResult(null);
    setResolving(true);
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
      void onResolveBet(bet, won).finally(() => {
        stopMachineStatus();
        if (won) void playWinSound();
        if (hapticsEnabled) {
          Haptics.notificationAsync(
            won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
          ).catch(() => {});
        }
        setResult({ won, bet });
        setResolving(false);
        resultProgress.value = withSpring(1, { damping: 13, stiffness: 180 });
        vaultPulse.value = withSequence(
          withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }),
        );
        if (!won) void playLossVoice();
      });
    }, 650);
  };

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
            <Animated.View style={[styles.coinStage, coinAnimatedStyle]}>
              <BrewCoin colors={colors} size={76} />
            </Animated.View>
            <Text style={[styles.vaultLabel, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>BREW TOKEN RESERVE</Text>
            <Text style={[styles.balance, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{displayedTokens}</Text>
            <Text style={[styles.balanceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {displayedTokens === 1 ? 'TOKEN AVAILABLE' : 'TOKENS AVAILABLE'}
            </Text>
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
                    Activate on a weekday for 12 hours inside the Central Bank.
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
                    {bankAccessActive ? 'ACCESS ACTIVE' : 'ACTIVATE KEY'}
                  </Text>
                </Pressable>
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

          <View style={[styles.payoutPreview, { backgroundColor: colors.steelShadow, borderColor: colors.border }]}>
            <Text style={[styles.payoutHeading, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
              PAYOUT PREVIEW
            </Text>
            <View style={styles.payoutColumns}>
              <View style={styles.payoutColumn}>
                <Text style={[styles.payoutLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>WIN</Text>
                <Text style={[styles.payoutValue, { color: colors.buyColor, fontFamily: 'Inter_700Bold' }]}>+{bet}</Text>
                <Text style={[styles.payoutUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {bet === 1 ? 'TOKEN' : 'TOKENS'}
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
                <Text style={[styles.payoutValue, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>55%</Text>
                <Text style={[styles.payoutUnit, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>TO WIN</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.rules, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Win returns your deposit plus an equal payout. Lose only the tokens deposited.
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
                  ? `+${result.bet} ${result.bet === 1 ? 'TOKEN' : 'TOKENS'} · NEW BALANCE ${tokens}`
                  : `−${result.bet} ${result.bet === 1 ? 'TOKEN' : 'TOKENS'} · NEW BALANCE ${tokens}`}
              </Text>
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
  coinStage: { marginBottom: 5 },
  vaultLabel: { fontSize: 9, letterSpacing: 1.3 },
  balance: { fontSize: 35, lineHeight: 40, marginTop: 2 },
  balanceLabel: { fontSize: 9, letterSpacing: 1.1 },
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
  shopMessage: { fontSize: 9, letterSpacing: 0.7, textAlign: 'center', marginTop: 10 },
  sectionLabel: { fontSize: 9, letterSpacing: 1 },
  betValue: { fontSize: 18, marginTop: 3 },
  stepper: { flexDirection: 'row', gap: 7 },
  stepButton: { width: 36, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  payoutPreview: { borderWidth: 1, borderRadius: 9, marginTop: 13, paddingVertical: 10, paddingHorizontal: 12 },
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