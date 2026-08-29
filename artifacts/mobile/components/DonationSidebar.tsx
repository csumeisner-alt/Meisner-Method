import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Dimensions,
  Linking,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { Confetti } from '@/components/Confetti';
import {
  useAmericanMode,
  AMERICAN_MODE_THRESHOLD,
  NEON_GUCCI_UNLOCK_COST,
} from '@/contexts/AmericanModeContext';

// Creator's PUBLIC payment handles. These only ever build outbound payment
// links — the app never touches logins, balances, or account data.
const VENMO_HANDLE = 'SpinCycle1';
const CASHAPP_CASHTAG = 'Spincycle01';
const DONATION_NOTE = 'Keeping Meisner Method ad-free! 🎉 Thank you!';

const PRESETS = [2.4, 5, 10];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const PANEL_WIDTH = Math.min(360, SCREEN_WIDTH * 0.88);

// How long the celebratory thank-you lingers before gently fading out.
const CELEBRATION_MS = 3200;

const VENMO_BLUE = '#3D95CE';
const CASHAPP_GREEN = '#00D632';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DonationSidebar({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    factsRead,
    isUnlocked,
    isActive,
    setAmericanModeActive,
    neonGucciActive,
    neonGucciUnlocked,
    setNeonGucciActive,
    brew,
  } = useAmericanMode();
  const neonProgress = Math.min(brew.darkBrewTokens / NEON_GUCCI_UNLOCK_COST, 1);
  const neonProgressPercent = Math.round(neonProgress * 100);
  const neonNextMilestone = neonGucciUnlocked
    ? 'UNLOCKED · READY TO ACTIVATE'
    : brew.darkBrewTokens < 1000
      ? 'NEXT MILESTONE · 1,000 TOKENS'
      : brew.darkBrewTokens < NEON_GUCCI_UNLOCK_COST
        ? 'NEXT MILESTONE · 10,000 TOKENS'
        : 'UNLOCKED · READY TO ACTIVATE';

  const toggleAmericanMode = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAmericanModeActive(value);
  };

  const toggleNeonGucciMode = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNeonGucciActive(value);
  };

  const [rendered, setRendered] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  const [selected, setSelected] = useState<number>(2.4);
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  // Celebration: shown when the user returns to the app after tapping a tip
  // button. There is no payment webhook, so this is a best-effort "you came
  // back" cue — not a confirmed-payment signal.
  const [celebrating, setCelebrating] = useState(false);
  const [neonCelebrating, setNeonCelebrating] = useState(false);
  const celebAnim = useRef(new Animated.Value(0)).current;
  const neonCelebAnim = useRef(new Animated.Value(0)).current;
  const tipAttemptedRef = useRef(false);
  const celebTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neonCelebTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveAmount = isCustom ? parseFloat(customText) || 0 : selected;
  const isValid = effectiveAmount >= MIN_AMOUNT && effectiveAmount <= MAX_AMOUNT;
  const amountStr = effectiveAmount.toFixed(2);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Fire the thank-you the moment the user returns to Meisner Method, but only if
  // they actually tapped a tip button before leaving.
  useEffect(() => {
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active' && tipAttemptedRef.current) {
        tipAttemptedRef.current = false;
        triggerCelebration();
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => {
      sub.remove();
      if (celebTimer.current) clearTimeout(celebTimer.current);
      if (neonCelebTimer.current) clearTimeout(neonCelebTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!brew.neonGucciJustUnlocked) return;
    setNeonCelebrating(true);
    neonCelebAnim.setValue(0);
    Animated.spring(neonCelebAnim, {
      toValue: 1,
      friction: 7,
      tension: 55,
      useNativeDriver: true,
    }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    neonCelebTimer.current = setTimeout(() => setNeonCelebrating(false), 4_800);
    brew.clearNeonGucciJustUnlocked();
  }, [brew.clearNeonGucciJustUnlocked, brew.neonGucciJustUnlocked, neonCelebAnim]);

  const triggerCelebration = () => {
    if (celebTimer.current) clearTimeout(celebTimer.current);
    setCelebrating(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    celebAnim.setValue(0);
    Animated.timing(celebAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
    celebTimer.current = setTimeout(() => {
      Animated.timing(celebAnim, {
        toValue: 0,
        duration: 440,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setCelebrating(false);
      });
    }, CELEBRATION_MS);
  };

  const pickPreset = (value: number) => {
    Haptics.selectionAsync();
    setSelected(value);
    setIsCustom(false);
    setCustomText('');
  };

  const onCustomChange = (text: string) => {
    // Keep digits + a single decimal point, max 2 decimals.
    let cleaned = text.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, '');
      const [whole, dec] = cleaned.split('.');
      cleaned = whole + '.' + (dec ?? '').slice(0, 2);
    }
    setCustomText(cleaned);
    setIsCustom(true);
  };

  const openPayment = async (appUrl: string, webUrl: string) => {
    if (!isValid) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await Linking.openURL(appUrl);
      // Arm the thank-you: it fires when the user comes back to Meisner Method.
      tipAttemptedRef.current = true;
    } catch {
      try {
        await Linking.openURL(webUrl);
        tipAttemptedRef.current = true;
      } catch {
        // Nothing we can do if neither opens.
      }
    }
  };

  const donateVenmo = () => {
    const note = encodeURIComponent(DONATION_NOTE);
    const appUrl = `venmo://paycharge?txn=pay&recipients=${VENMO_HANDLE}&amount=${amountStr}&note=${note}`;
    const webUrl = `https://venmo.com/u/${VENMO_HANDLE}`;
    openPayment(appUrl, webUrl);
  };

  const donateCashApp = () => {
    // cash.app universal link opens the app if installed, otherwise the browser.
    const url = `https://cash.app/$${CASHAPP_CASHTAG}/${amountStr}`;
    openPayment(url, url);
  };

  if (!rendered) return null;

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.72],
  });
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [PANEL_WIDTH, 0],
  });

  // Keep the panel itself below the system status bar. The header retains the
  // same visual position with a small internal top pad, while the notification
  // area remains outside the Settings surface.
  const panelTopInset = Platform.OS === 'web' ? 0 : insets.top;
  const topPad = Platform.OS === 'web' ? 24 : 12;
  const botPad = (Platform.OS === 'web' ? 24 : insets.bottom) + 20;

  return (
    <Modal transparent visible={rendered} onRequestClose={onClose} animationType="none">
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: PANEL_WIDTH,
              marginTop: panelTopInset,
              height: Platform.OS === 'web' ? '100%' : SCREEN_HEIGHT - panelTopInset,
              backgroundColor: colors.background,
              borderLeftColor: colors.border,
              transform: [{ translateX }],
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.panelHeader, { paddingTop: topPad, borderBottomColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              Settings
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: botPad }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Donation hero */}
            <LinearGradient
              colors={['#7C3AED', '#DB2777', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroEmoji}>🎉</Text>
              <Text style={[styles.heroTitle, { fontFamily: 'Inter_700Bold' }]}>
                Keep it 100% ad-free!
              </Text>
              <Text style={[styles.heroBody, { fontFamily: 'Inter_500Medium' }]}>
                No banners. No pop-ups. No selling your data. Just clean market
                intelligence. A tiny tip helps The Creator keep it that way —
                and keeps the ads out for good. 🙌
              </Text>
            </LinearGradient>

            {/* Amount selector */}
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              PICK YOUR TIP
            </Text>
            <View style={styles.presetRow}>
              {PRESETS.map((value) => {
                const active = !isCustom && selected === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => pickPreset(value)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        {
                          color: active ? colors.primaryForeground : colors.foreground,
                          fontFamily: 'Inter_700Bold',
                        },
                      ]}
                    >
                      ${value.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom amount */}
            <View
              style={[
                styles.customRow,
                {
                  backgroundColor: colors.card,
                  borderColor: isCustom ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.dollar, { color: colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                $
              </Text>
              <TextInput
                style={[styles.customInput, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}
                placeholder="Custom amount"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={customText}
                onChangeText={onCustomChange}
                onFocus={() => setIsCustom(true)}
                returnKeyType="done"
              />
            </View>
            {isCustom && customText.length > 0 && !isValid && (
              <Text style={[styles.hint, { color: colors.destructive, fontFamily: 'Inter_400Regular' }]}>
                Enter an amount between ${MIN_AMOUNT.toFixed(2)} and ${MAX_AMOUNT.toLocaleString()}.
              </Text>
            )}

            {/* Donate buttons */}
            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: VENMO_BLUE, opacity: isValid ? 1 : 0.45 }]}
              onPress={donateVenmo}
              disabled={!isValid}
              activeOpacity={0.85}
            >
              <Feather name="send" size={18} color="#fff" />
              <Text style={[styles.payText, { fontFamily: 'Inter_700Bold' }]}>
                Tip ${isValid ? amountStr : '—'} on Venmo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: CASHAPP_GREEN, opacity: isValid ? 1 : 0.45 }]}
              onPress={donateCashApp}
              disabled={!isValid}
              activeOpacity={0.85}
            >
              <Feather name="dollar-sign" size={18} color="#fff" />
              <Text style={[styles.payText, { fontFamily: 'Inter_700Bold' }]}>
                Tip ${isValid ? amountStr : '—'} on Cash App
              </Text>
            </TouchableOpacity>

            <Text style={[styles.thanks, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              💜 Every tip goes straight to The Creator and keeps this app ad-free.
              You're the best.
            </Text>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Patriot Mode unlock */}
            <View
              style={[
                styles.notifRow,
                {
                  backgroundColor: isUnlocked ? '#1B1B4B' : colors.card,
                  borderColor: isUnlocked ? '#B22234' : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: 22 }}>🇺🇸</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.notifTitle, { color: isUnlocked ? '#FFFFFF' : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  Patriot Mode
                </Text>
                <Text style={[styles.notifSub, { color: isUnlocked ? '#9999CC' : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {isUnlocked
                    ? (isActive ? 'Active — Red, White & Blue 🦅' : 'Unlocked! Toggle to activate')
                    : `${Math.min(factsRead, AMERICAN_MODE_THRESHOLD)} / ${AMERICAN_MODE_THRESHOLD} facts to unlock 🦅`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: isActive, disabled: !isUnlocked }}
                accessibilityLabel="Toggle Patriot Mode"
                disabled={!isUnlocked}
                hitSlop={8}
                onPress={() => toggleAmericanMode(!isActive)}
                style={[
                  styles.patriotToggle,
                  {
                    backgroundColor: isActive ? '#B22234' : colors.muted,
                    opacity: isUnlocked ? 1 : 0.6,
                  },
                ]}
              >
                <View
                  style={[
                    styles.patriotToggleThumb,
                    { alignSelf: isActive ? 'flex-end' : 'flex-start' },
                  ]}
                />
              </Pressable>
            </View>
            {brew.darkBrewTokens > 0 && (
              <View
                style={[
                  styles.neonThemeCard,
                  {
                    backgroundColor: neonGucciActive ? '#271e1a' : colors.card,
                    borderColor: neonGucciUnlocked ? '#8cf3cf' : colors.border,
                    opacity: neonGucciUnlocked ? 1 : 0.68,
                  },
                ]}
              >
                <View style={styles.neonThemeTop}>
                  <Text style={styles.neonThemeMark}>GG</Text>
                  <View style={{ flex: 1 }}>
                     <View style={styles.neonTitleRow}>
                       <Text style={[styles.notifTitle, { color: neonGucciUnlocked ? '#ffe1a0' : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                         Hybrid Neon Gucci
                       </Text>
                       <View style={[styles.neonStatusPill, { backgroundColor: neonGucciUnlocked ? '#8cf3cf' : '#5b554d' }]}>
                         <Text style={[styles.neonStatusPillText, { color: neonGucciUnlocked ? '#14231e' : '#e8dbc5' }]}>
                           {neonGucciUnlocked ? 'UNLOCKED' : 'REVEALED'}
                         </Text>
                       </View>
                     </View>
                    <Text style={[styles.notifSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      {neonGucciUnlocked
                         ? (neonGucciActive ? 'Active — mint, gold & electric cyan' : 'Unlocked — toggle to activate')
                         : `Reveal complete · ${brew.darkBrewTokens.toLocaleString()} / ${NEON_GUCCI_UNLOCK_COST.toLocaleString()} Dark Brew Tokens to unlock`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: neonGucciActive, disabled: !neonGucciUnlocked }}
                    accessibilityLabel="Toggle Hybrid Neon Gucci theme"
                    disabled={!neonGucciUnlocked}
                    hitSlop={8}
                    onPress={() => toggleNeonGucciMode(!neonGucciActive)}
                    style={[
                      styles.patriotToggle,
                      {
                        backgroundColor: neonGucciActive ? '#8cf3cf' : colors.muted,
                        opacity: neonGucciUnlocked ? 1 : 0.55,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.patriotToggleThumb,
                        {
                          alignSelf: neonGucciActive ? 'flex-end' : 'flex-start',
                          backgroundColor: neonGucciActive ? '#14231e' : '#fff',
                        },
                      ]}
                    />
                  </Pressable>
                </View>
                <View style={[styles.neonProgressTrack, { backgroundColor: colors.muted }]}>
                  <LinearGradient
                    colors={['#117a55', '#8cf3cf', '#efc86e']}
                    style={[styles.neonProgressFill, { width: `${neonProgress * 100}%` }]}
                  />
                </View>
                <View style={styles.neonProgressMeta}>
                  <Text style={[styles.neonProgressPercent, { color: neonGucciUnlocked ? '#8cf3cf' : '#ffe1a0', fontFamily: 'Inter_700Bold' }]}>
                    {neonProgressPercent}% TO UNLOCK
                  </Text>
                  <Text style={[styles.neonProgressMilestone, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                    {neonNextMilestone}
                  </Text>
                </View>
                {!neonGucciUnlocked && (
                  <Text style={[styles.neonLockedCopy, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Keep earning Dark Brew Tokens to reveal the third theme.
                  </Text>
                )}
              </View>
            )}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

          </ScrollView>

          {neonCelebrating && (
            <Animated.View
              style={[
                styles.celebOverlay,
                {
                  backgroundColor: 'rgba(20,14,15,0.62)',
                  opacity: neonCelebAnim,
                },
              ]}
            >
              <Confetti width={PANEL_WIDTH} height={SCREEN_HEIGHT} />
              <Animated.View
                style={[
                  styles.neonUnlockCard,
                  {
                    transform: [{
                      scale: neonCelebAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.72, 1],
                      }),
                    }],
                  },
                ]}
              >
                <Text style={styles.neonUnlockMark}>GG</Text>
                <Text style={styles.neonUnlockTitle}>THE REVEAL IS COMPLETE</Text>
                <Text style={styles.neonUnlockBody}>
                  Hybrid Neon Gucci is unlocked at 10,000 Dark Brew Tokens.
                </Text>
                <Text style={styles.neonUnlockHint}>TOGGLE IT ON FROM THIS CARD</Text>
              </Animated.View>
            </Animated.View>
          )}

          {/* Celebratory thank-you shown when the user returns from a tip */}
          {celebrating && (
            <Animated.View
              pointerEvents="none"
              style={[styles.celebOverlay, { opacity: celebAnim }]}
            >
              <Confetti width={PANEL_WIDTH} height={SCREEN_HEIGHT} />
              <Animated.View
                style={[
                  styles.celebCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    transform: [
                      {
                        scale: celebAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={styles.celebEmoji}>🎉</Text>
                <Text style={[styles.celebTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  Thank you!
                </Text>
                <Text style={[styles.celebBody, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  You're keeping Meisner Method 100% ad-free. 💜
                </Text>
              </Animated.View>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  panel: {
    height: '100%',
    borderLeftWidth: 1,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  panelTitle: { fontSize: 18, letterSpacing: 0.4 },
  closeBtn: { padding: 4 },
  hero: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  heroEmoji: { fontSize: 34, marginBottom: 6 },
  heroTitle: { color: '#fff', fontSize: 21, lineHeight: 27, marginBottom: 8 },
  heroBody: { color: 'rgba(255,255,255,0.94)', fontSize: 13.5, lineHeight: 20 },
  label: { fontSize: 11, letterSpacing: 1.2, marginBottom: 10 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  presetChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetText: { fontSize: 15 },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  dollar: { fontSize: 16, marginRight: 6 },
  customInput: { flex: 1, fontSize: 16, height: '100%' },
  hint: { fontSize: 12, marginTop: 6 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 54,
    borderRadius: 14,
    marginTop: 16,
  },
  payText: { color: '#fff', fontSize: 15.5 },
  thanks: { fontSize: 12.5, lineHeight: 19, marginTop: 18, textAlign: 'center' },
  divider: { height: 1, marginVertical: 24 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notifTitle: { fontSize: 14 },
  notifSub: { fontSize: 12, marginTop: 2 },
  patriotToggle: {
    width: 42,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  patriotToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  neonThemeCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 12,
  },
  neonThemeTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  neonTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  neonStatusPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  neonStatusPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  neonThemeMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    backgroundColor: '#8cf3cf',
    color: '#14231e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: -1,
  },
  neonProgressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  neonProgressFill: { height: 5, borderRadius: 3 },
  neonLockedCopy: { fontSize: 10, marginTop: 7 },
  neonProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 7 },
  neonProgressPercent: { fontSize: 9, letterSpacing: 0.6 },
  neonProgressMilestone: { fontSize: 9, textAlign: 'right' },
  neonUnlockCard: { alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#8cf3cf', backgroundColor: '#271e1a', paddingVertical: 26, paddingHorizontal: 22, shadowColor: '#55ecff', shadowOpacity: 0.5, shadowRadius: 22, elevation: 10 },
  neonUnlockMark: { color: '#14231e', backgroundColor: '#8cf3cf', borderRadius: 34, width: 68, height: 68, textAlign: 'center', textAlignVertical: 'center', fontSize: 23, fontWeight: '900', letterSpacing: -2, marginBottom: 14 },
  neonUnlockTitle: { color: '#ffe1a0', fontSize: 16, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  neonUnlockBody: { color: '#f5eadb', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 9 },
  neonUnlockHint: { color: '#8cf3cf', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginTop: 15, textAlign: 'center' },
  celebOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  celebCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  celebEmoji: { fontSize: 48, marginBottom: 10 },
  celebTitle: { fontSize: 24, marginBottom: 8 },
  celebBody: { fontSize: 14.5, lineHeight: 21, textAlign: 'center' },
});
