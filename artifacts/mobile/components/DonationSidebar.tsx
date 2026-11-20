import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  useWindowDimensions,
  Linking,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useColors } from '@/hooks/useColors';
import type { AlertData } from '@/hooks/useWatchlist';
import { formatCommodityQuotePrice, getCommodityContractSpec } from '@/lib/heatMapInstrumentDisplay';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useAchievements } from '@/contexts/AchievementsContext';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { Confetti } from '@/components/Confetti';
import { getSettingsPanelWidth, getSettingsScrollBottomPadding } from '@/lib/settingsPanelLayout';
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

// Archived for a possible future paid-app launch. Keep the donation UI and
// handlers in this component, but do not expose them in the current app.
const DONATION_FEATURE_ENABLED = false;

const PRESETS = [2.4, 5, 10];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

// How long the celebratory thank-you lingers before gently fading out.
const CELEBRATION_MS = 3200;

const VENMO_BLUE = '#3D95CE';
const CASHAPP_GREEN = '#00D632';

interface Props {
  visible: boolean;
  onClose: () => void;
  alerts: AlertData[];
  watchlistSymbols: string[];
  onAddAlert: (symbol: string) => void;
  onEditAlert: (alert: AlertData) => void;
  onSetAlertPaused: (id: string, paused: boolean) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
}

const ALERTS_COLLAPSED_KEY = '@stocksense/alerts_collapsed';
const formatManagedAlertPrice = (symbol: string, price: number) => getCommodityContractSpec(symbol)
  ? formatCommodityQuotePrice(symbol, price)
  : `$${price.toFixed(2)}`;

function AlertManagementSection({
  alerts,
  watchlistSymbols,
  onAddAlert,
  onEditAlert,
  onSetAlertPaused,
  onDeleteAlert,
}: Pick<Props, 'alerts' | 'watchlistSymbols' | 'onAddAlert' | 'onEditAlert' | 'onSetAlertPaused' | 'onDeleteAlert'>) {
  const colors = useColors();
  const [collapsed, setCollapsed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ALERTS_COLLAPSED_KEY).then((value) => {
      if (!cancelled && value === '1') setCollapsed(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      AsyncStorage.setItem(ALERTS_COLLAPSED_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  };

  const grouped = alerts.reduce<Record<string, AlertData[]>>((result, alert) => {
    (result[alert.symbol] ??= []).push(alert);
    return result;
  }, {});
  const symbols = [...new Set([...watchlistSymbols, ...Object.keys(grouped)])];

  return (
    <View testID="settings-price-alerts" style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
            Price alerts
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 }}>
            {alerts.length} saved · manage targets by ticker
          </Text>
        </View>
        <TouchableOpacity
          testID="toggle-alerts-collapsed"
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand all price alerts' : 'Collapse all price alerts'}
          accessibilityState={{ expanded: !collapsed }}
          onPress={toggleCollapsed}
          style={{ paddingVertical: 8, paddingHorizontal: 10 }}
        >
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
            {collapsed ? 'Expand all' : 'Collapse all'}
          </Text>
        </TouchableOpacity>
      </View>
      {!collapsed && (
        symbols.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 8 }}>
            Add a ticker to your watchlist to set its first alert.
          </Text>
        ) : symbols.map((symbol) => (
          <View key={symbol} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14, flex: 1 }}>
                {symbol}
              </Text>
              <TouchableOpacity
                testID={`add-alert-${symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`Add price alert for ${symbol}`}
                onPress={() => onAddAlert(symbol)}
                style={{ paddingVertical: 6, paddingHorizontal: 8 }}
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  + Add alert
                </Text>
              </TouchableOpacity>
            </View>
            {(grouped[symbol] ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingBottom: 5 }}>
                No alerts set
              </Text>
            ) : (grouped[symbol] ?? []).map((alert) => (
              <View
                key={alert.id}
                testID={`managed-alert-${alert.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: alert.firedAt ? colors.mutedForeground : colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
                    {alert.direction === 'above' ? 'Above' : 'Below'} {formatManagedAlertPrice(symbol, alert.targetPrice)} · {alert.paused ? (alert.firedAt ? 'Paused · Fired' : 'Paused') : alert.firedAt ? 'Fired' : 'Active'}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`toggle-alert-paused-${alert.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${alert.paused ? 'Resume' : 'Pause'} ${symbol} alert ${alert.direction} ${alert.targetPrice}`}
                  onPress={() => {
                    setActionError(null);
                    void onSetAlertPaused(alert.id, !alert.paused)
                      .catch(() => setActionError('Could not update this alert. Please try again.'));
                  }}
                  style={{ padding: 7 }}
                >
                  <Feather name={alert.paused ? 'play' : 'pause'} size={15} color={alert.paused ? colors.primary : colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${symbol} alert ${alert.direction} ${alert.targetPrice}`}
                  onPress={() => onEditAlert(alert)}
                  style={{ padding: 7 }}
                >
                  <Feather name="edit-2" size={15} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${symbol} alert ${alert.direction} ${alert.targetPrice}`}
                  onPress={() => {
                    setActionError(null);
                    void onDeleteAlert(alert.id).catch(() => setActionError('Could not remove this alert. Please try again.'));
                  }}
                  style={{ padding: 7 }}
                >
                  <Feather name="trash-2" size={15} color={colors.sellColor} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))
      )}
      {actionError && (
        <Text accessibilityRole="alert" style={{ color: colors.sellColor, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>
          {actionError}
        </Text>
      )}
    </View>
  );
}

function NeonGucciUnlockCelebration({
  animation,
  onDismiss,
  onActivate,
}: {
  animation: Animated.Value;
  onDismiss: () => void;
  onActivate: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const brandReveal = useRef(new Animated.Value(0)).current;
  const activationReveal = useRef(new Animated.Value(0)).current;
  const [activationReady, setActivationReady] = useState(false);
  const player = useVideoPlayer(
    require('../assets/celebration/neon-gucci-unlock.mp4'),
    (videoPlayer) => {
      videoPlayer.loop = false;
      videoPlayer.muted = false;
      videoPlayer.audioMixingMode = 'doNotMix';
      videoPlayer.showNowPlayingNotification = false;
    },
  );

  useEffect(() => {
    const subscription = player.addListener('playToEnd', onDismiss);
    player.play();
    return () => {
      subscription.remove();
      player.pause();
    };
  }, [onDismiss, player]);

  useEffect(() => {
    if (reduceMotion) {
      brandReveal.setValue(1);
      activationReveal.setValue(1);
      setActivationReady(true);
      return;
    }

    setActivationReady(false);
    brandReveal.setValue(0);
    activationReveal.setValue(0);
    const brandSequence = Animated.sequence([
      Animated.delay(160),
      Animated.timing(brandReveal, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]);
    brandSequence.start();
    const activationTimer = setTimeout(() => {
      setActivationReady(true);
      Animated.timing(activationReveal, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start();
    }, 920);
    return () => {
      clearTimeout(activationTimer);
      brandSequence.stop();
      activationReveal.stopAnimation();
    };
  }, [activationReveal, brandReveal, reduceMotion]);

  return (
    <Animated.View style={[styles.neonCelebrationOverlay, { opacity: animation }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="contain"
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        showsTimecodes={false}
        surfaceType="textureView"
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(10,9,12,0.28)', 'rgba(10,9,12,0.04)', 'rgba(10,9,12,0.76)']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Confetti
          width={width}
          height={height}
          count={22}
          duration={1900}
          colors={['#D7B66D', '#9AE9D1', '#63DCE6']}
          reducedMotion={reduceMotion}
        />
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close Neon Gucci celebration"
        style={[styles.neonCelebrationClose, { top: insets.top + 12 }]}
      >
        <Feather name="x" size={20} color="#fff8de" />
      </Pressable>
      <View style={[styles.neonCelebrationContent, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.neonCelebrationEyebrow}>A REWARD, WELL EARNED</Text>
        <Animated.Text
          accessibilityLabel="GG"
          style={[
            styles.neonCelebrationMark,
            {
              opacity: brandReveal,
              transform: [
                {
                  scale: brandReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.72, 1],
                  }),
                },
                {
                  translateY: brandReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          GG
        </Animated.Text>
        <Text style={styles.neonCelebrationTitle}>HYBRID NEON GUCCI</Text>
        <Text style={styles.neonCelebrationSubtitle}>Your new look is unlocked.</Text>
        <Animated.View
          pointerEvents={activationReady ? 'auto' : 'none'}
          accessibilityElementsHidden={!activationReady}
          importantForAccessibility={activationReady ? 'auto' : 'no-hide-descendants'}
          style={{
            opacity: activationReveal,
            transform: [
              {
                translateY: activationReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <Pressable
            onPress={onActivate}
            disabled={!activationReady}
            accessibilityRole="button"
            accessibilityLabel="Activate Hybrid Neon Gucci"
            accessibilityState={{ disabled: !activationReady }}
            style={styles.neonActivateButton}
          >
            <Text style={styles.neonActivateText}>ACTIVATE NEON GUCCI</Text>
            <Feather name="arrow-up-right" size={16} color="#181715" />
          </Pressable>
        </Animated.View>
        <Text style={styles.neonDismissHint}>THE REVEAL CLOSES WHEN THE VIDEO ENDS</Text>
      </View>
    </Animated.View>
  );
}

export function DonationSidebar({
  visible,
  onClose,
  alerts,
  watchlistSymbols,
  onAddAlert,
  onEditAlert,
  onSetAlertPaused,
  onDeleteAlert,
}: Props) {
  const colors = useColors();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const panelWidth = getSettingsPanelWidth(screenWidth);
  const { earnedIds, openGallery } = useAchievements();
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
    : `NEXT MILESTONE · ${NEON_GUCCI_UNLOCK_COST.toLocaleString()} TOKENS`;

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
  const dismissNeonCelebration = useCallback(() => setNeonCelebrating(false), []);
  const activateNeonGucci = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNeonGucciActive(true);
    setNeonCelebrating(false);
  }, [setNeonGucciActive]);

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
    outputRange: [panelWidth, 0],
  });

  // Keep the panel itself below the system status bar. The header retains the
  // same visual position with a small internal top pad, while the notification
  // area remains outside the Settings surface.
  const panelTopInset = Platform.OS === 'web' ? 0 : insets.top;
  const topPad = Platform.OS === 'web' ? 24 : 12;
  const bottomScrollPadding = getSettingsScrollBottomPadding(insets.bottom, Platform.OS === 'web');

  return (
    <Modal transparent visible={rendered} onRequestClose={onClose} animationType="none">
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          testID="settings-panel"
          style={[
            styles.panel,
            {
              width: panelWidth,
              marginTop: panelTopInset,
              height: Platform.OS === 'web' ? '100%' : screenHeight - panelTopInset,
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
            testID="settings-scroll-view"
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: bottomScrollPadding }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AlertManagementSection
              alerts={alerts}
              watchlistSymbols={watchlistSymbols}
              onAddAlert={onAddAlert}
              onEditAlert={onEditAlert}
              onSetAlertPaused={onSetAlertPaused}
              onDeleteAlert={onDeleteAlert}
            />
            {DONATION_FEATURE_ENABLED && (
              <>
                {/* Archived donation flow — re-enable only if donations return. */}
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
              </>
            )}

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
            <TouchableOpacity
              style={[styles.notifRow, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}
              onPress={() => {
                onClose();
                setTimeout(openGallery, 240);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Achievements, ${earnedIds.length} of ${ACHIEVEMENTS.length} earned`}
            >
              <Feather name="award" size={20} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.notifTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  Achievements
                </Text>
                <Text style={[styles.notifSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {earnedIds.length} of {ACHIEVEMENTS.length} earned · View collection
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View testID="settings-bottom-divider" style={[styles.divider, { backgroundColor: colors.border }]} />

          </ScrollView>

          {neonCelebrating && (
            <NeonGucciUnlockCelebration
              animation={neonCelebAnim}
              onDismiss={dismissNeonCelebration}
              onActivate={activateNeonGucci}
            />
          )}

          {/* Celebratory thank-you shown when the user returns from a tip */}
          {celebrating && (
            <Animated.View
              pointerEvents="none"
              style={[styles.celebOverlay, { opacity: celebAnim }]}
            >
              <Confetti width={panelWidth} height={screenHeight} />
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
  neonCelebrationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#100e10',
    overflow: 'hidden',
    zIndex: 20,
  },
  neonCelebrationClose: {
    position: 'absolute',
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,9,12,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(215,182,109,0.72)',
    zIndex: 2,
  },
  neonCelebrationContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
  },
  neonCelebrationEyebrow: {
    color: '#d7b66d',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 13,
    textShadowColor: '#287f77',
    textShadowRadius: 8,
  },
  neonCelebrationMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    backgroundColor: '#d7b66d',
    color: '#181715',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -2,
    marginBottom: 12,
    shadowColor: '#8cf3cf',
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 10,
  },
  neonCelebrationTitle: {
    color: '#f0d89e',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.3,
    textAlign: 'center',
    textShadowColor: '#46cfc8',
    textShadowRadius: 8,
  },
  neonCelebrationSubtitle: {
    color: '#fff8de',
    fontSize: 14,
    marginTop: 7,
    marginBottom: 22,
    textAlign: 'center',
  },
  neonActivateButton: {
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#d7b66d',
    backgroundColor: '#a5e8d1',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#63dce6',
    shadowOpacity: 0.38,
    shadowRadius: 13,
    elevation: 8,
  },
  neonActivateText: {
    color: '#181715',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  neonDismissHint: {
    color: 'rgba(255,248,222,0.68)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 16,
  },
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
