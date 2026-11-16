import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { PortfolioLineChart } from '@/components/PaperCharts';
import type { PaperChallengeEnrollment, PaperChallengeWindow } from '@/lib/paperChallenge';
import type {
  EventArenaCountdown,
  EventArenaParticipation,
  EventArenaPerformance,
} from '@/lib/eventArenaHome';
import {
  isMountainChampionshipTransferLocked,
  LEGACY_PAPER_CHALLENGE_ARTWORK_ID,
} from '@/lib/paperChallenge';

export type EventArenaOverviewProps = {
  event: PaperChallengeWindow;
  nowMs: number;
  enrollment: PaperChallengeEnrollment | null;
  participation: EventArenaParticipation;
  countdown: EventArenaCountdown;
  performance: EventArenaPerformance | null;
  rank: number | null;
  loading: boolean;
  saving: boolean;
  onJoin: () => void;
  onWithdraw: () => void;
  onRefresh: () => void;
  onOpenNotifications: () => void;
  unreadCashNotifications: number;
  cashTransfersLocked?: boolean;
  onOpenTrades: () => void;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
};

const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const signedMoney = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : `${value > 0 ? '+' : ''}${money(value)}`;

const signedPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function statusCopy(participation: EventArenaParticipation, phase: PaperChallengeWindow['phase']) {
  if (participation === 'joined' && phase === 'upcoming') return { title: 'You’re registered', detail: 'Your separate event account opens at the scheduled start.' };
  if (participation === 'joined' && phase === 'ended') return { title: 'Your event has ended', detail: 'Open Paper Trading to save your final event results.' };
  if (participation === 'joined') return { title: 'You’re in this event', detail: 'Your event account is separate from every other paper portfolio.' };
  if (participation === 'finish-previous') return { title: 'Finish your current event', detail: 'Open Paper Trading to finish it before entering this event.' };
  if (participation === 'results-pending') return { title: 'Results are being finalized', detail: 'Open Paper Trading to complete your previous event.' };
  if (participation === 'event-ended' || phase === 'ended') return { title: 'This event has ended', detail: 'The next scheduled event will be available soon.' };
  if (phase === 'upcoming') return { title: 'Entry is open', detail: 'Join now. Your event-only account begins when the window opens.' };
  return { title: 'Entry is open', detail: 'Join the live event with a fresh, isolated paper account.' };
}

export function EventArenaOverview({
  event,
  nowMs,
  enrollment,
  participation,
  countdown,
  performance,
  rank,
  loading,
  saving,
  onJoin,
  onWithdraw,
  onRefresh,
  onOpenNotifications,
  unreadCashNotifications,
  cashTransfersLocked,
  onOpenTrades,
  notificationsEnabled,
  onNotificationsChange,
}: EventArenaOverviewProps) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const statusPulse = useRef(new Animated.Value(0)).current;
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, Math.min(windowWidth - 32, 560));
  const livePhase = nowMs < event.startAtMs ? 'upcoming' : nowMs <= event.endAtMs ? 'active' : 'ended';
  const shouldAnimateStatus = livePhase === 'active' && !reduceMotion;
  useEffect(() => {
    statusPulse.stopAnimation();
    statusPulse.setValue(0);
    if (!shouldAnimateStatus) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulse, {
          toValue: 1,
          duration: 1_600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(statusPulse, {
          toValue: 0,
          duration: 1_600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [shouldAnimateStatus, statusPulse]);
  const joined = participation === 'joined' && enrollment?.eventId === event.id;
  const mountainTransferLockActive = cashTransfersLocked ?? isMountainChampionshipTransferLocked(
    event.eventType,
    event.id,
    event.endAtMs,
    nowMs,
  );
  const isUpcoming = livePhase === 'upcoming';
  const canWithdraw = joined && isUpcoming && enrollment?.startEquity == null;
  const copy = statusCopy(participation, livePhase);
  const isBearMarketMayhem = event.eventType === 'bear-market-mayhem'
    || event.rankingDirection === 'lowest-return';
  const isPennyStockMayhem = event.eventType === 'penny-stock-mayhem';
  const accent = isBearMarketMayhem ? '#E24550' : '#b8955a';
  const positive = (performance?.profitLoss ?? 0) >= 0;
  const countdownMode = livePhase === 'upcoming' ? 'starts' : livePhase === 'active' ? 'ends' : 'ended';
  const countdownLabel = countdownMode === 'starts' ? 'STARTS IN' : countdownMode === 'ends' ? 'TIME REMAINING' : 'EVENT CLOSED';
  const eventName = `Week of ${new Date(event.startAtMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const eventTitle = `Week of ${new Date(event.startAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const championshipName = event.eventType === 'green-bull-championship'
    ? 'GREEN BULL CHAMPIONSHIP'
    : isBearMarketMayhem ? 'BEAR MARKET MAYHEM'
      : event.eventType === 'penny-stock-mayhem' ? 'PENNY STOCK MAYHEM'
        : event.eventType === 'mountain-championship' ? 'MOUNTAIN CHAMPIONSHIP' : 'EVENT ARENA CHAMPIONSHIP';
  const startingCapital = event.startingBalance ?? enrollment?.startingBalance ?? 100_000;
  const stickyAction = joined && !isUpcoming
    ? {
        kind: livePhase === 'ended' ? 'finish' as const : 'trade' as const,
        label: livePhase === 'ended' ? 'Finish event results' : 'Trade event account',
        accessibilityLabel: livePhase === 'ended'
          ? 'Open Paper Trading to finish event results'
          : 'Open Paper Trading to trade in Event Arena',
        onPress: onOpenTrades,
      }
    : participation === 'eligible' && livePhase !== 'ended'
      ? {
          kind: 'join' as const,
          label: saving ? 'Joining…' : 'Join Event Arena',
          accessibilityLabel: 'Join Event Arena',
          onPress: onJoin,
        }
      : participation === 'finish-previous' || participation === 'results-pending'
        ? {
            kind: 'finish' as const,
            label: 'Open Paper Trading',
            accessibilityLabel: 'Open Paper Trading to finish the previous event',
            onPress: onOpenTrades,
          }
        : null;

  const surface = colors.card ?? colors.background;
  const border = colors.border ?? 'rgba(120,128,135,0.25)';
  const ink = colors.text;
  const muted = colors.mutedForeground ?? colors.text;
  const chartPoints = joined && performance ? performance.chartPoints : [];

  const Metric = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
    <View style={[styles.metric, { borderColor: border }]}>
      <Text style={[styles.metricLabel, { color: muted }]}>{label}</Text>
      <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.metricValue, { color: valueColor ?? ink }]}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
        showsVerticalScrollIndicator={false}
        testID="event-arena-overview"
      >
      <View style={{ width: contentWidth }}>
        <View style={styles.topline}>
          <View style={styles.brandMark}>
            {isPennyStockMayhem
              ? <Image source={require('../assets/images/mm-mark-foreground.png')} style={{ width: 26, height: 26 }} resizeMode="contain" />
              : <Feather name="activity" size={15} color={accent} />}
          </View>
          <Text style={[styles.eyebrow, { color: muted }]}>
            {isPennyStockMayhem ? 'MEISNER METHOD  /  EVENT ARENA' : `MEISNER METHOD  /  ${championshipName}`}
          </Text>
          {joined && (livePhase === 'active' || mountainTransferLockActive) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mountainTransferLockActive
                ? 'Open Mountain Championship cash transfer notice'
                : unreadCashNotifications > 0
                ? `Open cash notifications, ${unreadCashNotifications} unread`
                : 'Open cash notifications'}
              testID="event-arena-cash-notifications"
              onPress={onOpenNotifications}
              style={({ pressed }) => [styles.iconButton, { borderColor: border, opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name={mountainTransferLockActive ? 'lock' : 'bell'} size={16} color={ink} />
              {unreadCashNotifications > 0 ? (
                <View testID="event-arena-cash-notification-badge" style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadCashNotifications > 9 ? '9+' : unreadCashNotifications}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh event overview"
            testID="event-arena-refresh"
            onPress={onRefresh}
            disabled={loading}
            style={({ pressed }) => [styles.iconButton, { borderColor: border, opacity: pressed || loading ? 0.65 : 1 }]}
          >
            {loading ? <ActivityIndicator size="small" color={accent} /> : <Feather name="rotate-cw" size={16} color={ink} />}
          </Pressable>
        </View>

        {isPennyStockMayhem && (
          <ImageBackground
            testID="event-arena-penny-stock-artwork"
            source={require('../assets/event-arena-penny-stock-mayhem-clean.jpg')}
            resizeMode="cover"
            imageStyle={{ borderRadius: 18 }}
            style={{ width: '100%', aspectRatio: 16 / 9, minHeight: 180, overflow: 'hidden', borderRadius: 18, justifyContent: 'flex-end', marginBottom: 14, backgroundColor: '#07100C' }}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(3,8,7,0.08)', 'rgba(3,8,7,0.16)', 'rgba(3,8,7,0.82)']}
              locations={[0, 0.48, 1]}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View style={{ paddingHorizontal: 16, paddingBottom: 15, paddingTop: 28 }}>
              <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 0.75, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 9 }}>
                PENNY STOCK MAYHEM
              </Text>
              <Text style={{ color: '#C9F995', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 7 }}>
                STOCKS &amp; ETFs UNDER $20
              </Text>
              <Text testID="event-arena-starting-capital" style={{ color: '#F3D77E', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.95, marginTop: 8, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 7 }}>
                {money(startingCapital)} STARTING CAPITAL
              </Text>
            </View>
          </ImageBackground>
        )}

        <View style={[styles.heroCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.heroTop}>
            <Animated.View
              testID="event-arena-phase-dot"
              style={[
                styles.liveDot,
                { backgroundColor: livePhase === 'active' ? '#4da987' : accent },
                shouldAnimateStatus && {
                  opacity: statusPulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }),
                  transform: [{ scale: statusPulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                },
              ]}
            />
            <Animated.Text
              testID="event-arena-phase-label"
              style={[
                styles.phaseLabel,
                { color: muted },
                shouldAnimateStatus && {
                  opacity: statusPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
                },
              ]}
            >
              {livePhase.toUpperCase()} EVENT
            </Animated.Text>
            <Text style={[styles.eventId, { color: muted }]}>ID {event.id}</Text>
          </View>
          {isPennyStockMayhem && (
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 8 }}>
              Long buys require a verified stock or ETF and both the latest quote and final fill below $20.00. Selling or reducing long positions remains unrestricted; existing short rules are unchanged.
            </Text>
          )}
          {!isPennyStockMayhem && (
            <Text accessibilityLabel={`Event Arena ${eventName}`} style={[styles.title, { color: ink }]}>{eventTitle}</Text>
          )}
          {!isPennyStockMayhem && <View testID="event-arena-starting-capital" style={[styles.capitalBand, { backgroundColor: 'rgba(184,149,90,0.11)', borderColor: 'rgba(184,149,90,0.28)' }]}>
            <View style={[styles.capitalMark, { backgroundColor: accent }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.capitalLabel, { color: muted }]}>FRESH EVENT ACCOUNT</Text>
              <Text style={[styles.capitalValue, { color: accent }]}>{money(startingCapital)}</Text>
            </View>
            <Text style={[styles.capitalSuffix, { color: muted }]}>STARTING CAPITAL</Text>
          </View>}
          {isBearMarketMayhem && (
            <Text testID="event-arena-bear-objective" style={{ color: '#E24550', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8, marginTop: 7 }}>
              THE BIGGEST LOSER WINS · LOWEST RETURN RANKS FIRST
            </Text>
          )}
          <Text style={[styles.subtitle, { color: muted }]}>{copy.title}. {copy.detail}</Text>

          <View style={[styles.countdownPanel, { backgroundColor: colors.background, borderColor: border }]}>
            <View style={styles.countdownHead}>
              <Text style={[styles.smallLabel, { color: muted }]}>{countdownLabel}</Text>
              <Feather name={countdownMode === 'ended' ? 'check-circle' : 'clock'} size={14} color={accent} />
            </View>
            {countdownMode === 'ended' ? (
              <Text style={[styles.closedCountdown, { color: muted }]}>Event closed</Text>
            ) : (
              <View
                accessibilityLabel={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds`}
                style={styles.countdownUnits}
              >
                {[
                  { label: 'DAYS', value: countdown.days },
                  { label: 'HOURS', value: countdown.hours },
                  { label: 'MINUTES', value: countdown.minutes },
                  { label: 'SECONDS', value: countdown.seconds },
                ].map((unit) => (
                  <View
                    key={unit.label}
                    style={[
                      styles.countdownUnit,
                      { borderColor: border },
                      unit.label !== 'SECONDS' && styles.countdownUnitDivider,
                    ]}
                  >
                    <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.countdownNumber, { color: ink }]}>{String(unit.value).padStart(2, '0')}</Text>
                    <Text style={[styles.countdownUnitLabel, { color: muted }]}>{unit.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <Text style={[styles.smallLabel, { color: muted }]}>OPENS</Text>
              <Text style={[styles.dateValue, { color: ink }]}>{formatDate(event.startAtMs)}</Text>
            </View>
            <View style={[styles.dateDivider, { backgroundColor: border }]} />
            <View style={styles.dateItem}>
              <Text style={[styles.smallLabel, { color: muted }]}>CLOSES</Text>
              <Text style={[styles.dateValue, { color: ink }]}>{formatDate(event.endAtMs)}</Text>
            </View>
          </View>

          {joined ? (
            <View style={styles.actionsRow}>
              {!isUpcoming ? (
                stickyAction ? null : <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={livePhase === 'ended' ? 'Open Paper Trading to finish event results' : 'Open Paper Trading to trade in Event Arena'}
                  testID="event-arena-open-trades"
                  onPress={onOpenTrades}
                  style={({ pressed }) => [styles.primaryButton, { backgroundColor: accent, opacity: pressed ? 0.84 : 1 }]}
                >
                  <Feather name={livePhase === 'ended' ? 'check-circle' : 'trending-up'} size={16} color="#171714" />
                  <Text style={styles.primaryButtonText}>{livePhase === 'ended' ? 'Finish event results' : 'Trade event account'}</Text>
                </Pressable>
              ) : (
                <Text style={[styles.secondaryButtonText, { flex: 1, color: muted, paddingVertical: 10 }]}>Trading opens at the scheduled start.</Text>
              )}
              {canWithdraw ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Withdraw from upcoming event"
                  testID="event-arena-withdraw"
                  onPress={onWithdraw}
                  disabled={saving}
                  style={({ pressed }) => [styles.secondaryButton, { borderColor: border, opacity: pressed || saving ? 0.55 : 1 }]}
                >
                  <Text style={[styles.secondaryButtonText, { color: ink }]}>{saving ? 'Working…' : 'Withdraw'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : participation === 'eligible' && livePhase !== 'ended' ? (
            stickyAction ? null : <Pressable
              accessibilityRole="button"
              accessibilityLabel="Join Event Arena"
              testID="event-arena-join"
              onPress={onJoin}
              disabled={saving || loading}
              style={({ pressed }) => [styles.primaryButton, styles.fullButton, { backgroundColor: accent, opacity: pressed || saving || loading ? 0.62 : 1 }]}
            >
              {saving ? <ActivityIndicator size="small" color="#171714" /> : <Feather name="arrow-up-right" size={17} color="#171714" />}
              <Text style={styles.primaryButtonText}>{saving ? 'Joining…' : 'Join Event Arena'}</Text>
            </Pressable>
          ) : participation === 'finish-previous' || participation === 'results-pending' ? (
            stickyAction ? null : <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Paper Trading to finish the previous event"
              testID="event-arena-finish-previous"
              onPress={onOpenTrades}
              style={({ pressed }) => [styles.primaryButton, styles.fullButton, { backgroundColor: accent, opacity: pressed ? 0.84 : 1 }]}
            >
              <Feather name="arrow-up-right" size={16} color="#171714" />
              <Text style={styles.primaryButtonText}>Open Paper Trading</Text>
            </Pressable>
          ) : null}
        </View>

        {joined ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: ink }]}>Your event account</Text>
              <View style={styles.isolationTag}><Feather name="lock" size={11} color={accent} /><Text style={[styles.isolationText, { color: accent }]}>ISOLATED</Text></View>
            </View>
            <View style={[styles.accountCard, { backgroundColor: surface, borderColor: border }]}>
              <View style={styles.accountNameRow}>
                <Text style={[styles.accountNameLabel, { color: muted }]}>ACCOUNT NAME</Text>
                <Text
                  testID="event-arena-account-name"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[styles.accountName, { color: ink }]}
                >
                  {performance?.account?.name ?? enrollment?.accountName ?? 'Ready'}
                </Text>
              </View>
              <View style={styles.accountHeadline}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.smallLabel, { color: muted }]}>ACCOUNT EQUITY</Text>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.equityValue, { color: ink }]}>{money(performance?.equity)}</Text>
                </View>
                <View style={[styles.returnPill, { backgroundColor: positive ? 'rgba(77,169,135,0.13)' : 'rgba(188,104,99,0.13)' }]}>
                  <Text style={{ color: positive ? '#4da987' : '#bc6863', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{signedPercent(performance?.returnPercent)}</Text>
                </View>
              </View>
              <View style={styles.metricGrid}>
                <Metric label="STARTING BALANCE" value={money(performance?.startingBalance ?? startingCapital)} />
                <Metric label="AVAILABLE CASH" value={money(performance?.account?.cash)} />
                <Metric label="BUYING POWER" value={money(performance?.buyingPower)} />
                <Metric label="NET P/L" value={signedMoney(performance?.profitLoss)} valueColor={performance?.profitLoss == null ? ink : positive ? '#4da987' : '#bc6863'} />
                <Metric label="EVENT RANK" value={rank == null ? '—' : `#${rank}`} />
                <Metric label="COMPLETED TRADES" value={performance ? String(performance.completedTradeCount) : '—'} />
              </View>
              {!performance?.account && (
                <Text style={[styles.emptyText, { color: muted, textAlign: 'left', marginTop: 8 }]}>
                  Your separate event account will be ready when the event opens. Starting balance is shown above until then.
                </Text>
              )}
              {!!performance?.account && performance.equity == null && (
                <Text style={[styles.emptyText, { color: muted, textAlign: 'left', marginTop: 8 }]}>
                  Equity is unavailable until every held position has a valid current quote.
                </Text>
              )}
              {!isUpcoming && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open event trades"
                  testID="event-arena-open-trades-secondary"
                  onPress={onOpenTrades}
                  style={({ pressed }) => [styles.tradeLink, { borderTopColor: border, opacity: pressed ? 0.65 : 1 }]}
                >
                  <Text style={[styles.tradeLinkText, { color: accent }]}>Open event trading</Text>
                  <Feather name="arrow-right" size={15} color={accent} />
                </Pressable>
              )}
            </View>

            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: ink }]}>Equity history</Text>
              <Text style={[styles.sectionAside, { color: muted }]}>EVENT ACCOUNT ONLY</Text>
            </View>
            <View style={[styles.chartCard, { backgroundColor: 'rgba(184,149,90,0.07)', borderColor: 'rgba(184,149,90,0.25)' }]}>
              <View style={styles.chartLegend}>
                <View style={[styles.legendLine, { backgroundColor: accent }]} />
                <Text style={[styles.legendText, { color: muted }]}>Event equity</Text>
                <View style={[styles.legendDashed, { borderColor: muted }]} />
                <Text style={[styles.legendText, { color: muted }]}>Start balance · {money(performance?.startingBalance ?? startingCapital)}</Text>
              </View>
              {chartPoints.length < 2 ? (
                <View style={styles.emptyChart}>
                  <Feather name="bar-chart-2" size={22} color={accent} />
                  <Text style={[styles.emptyTitle, { color: ink }]}>Not enough history yet</Text>
                  <Text style={[styles.emptyText, { color: muted }]}>Two or more recorded event-account snapshots are needed to draw a meaningful chart.</Text>
                </View>
              ) : (
                <PortfolioLineChart
                  points={chartPoints}
                  width={contentWidth - 34}
                  height={232}
                  referenceLine={{
                    value: performance?.startingBalance ?? startingCapital,
                    label: 'START',
                    color: 'rgba(184,149,90,0.78)',
                  }}
                />
              )}
            </View>
          </>
        ) : (
          <View style={[styles.noteCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.noteIcon, { backgroundColor: 'rgba(184,149,90,0.12)' }]}><Feather name="shield" size={17} color={accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.noteTitle, { color: ink }]}>Your competition stays personal</Text>
              <Text style={[styles.noteText, { color: muted }]}>Each entry uses a dedicated paper account. Your other strategies and balances stay untouched.</Text>
            </View>
          </View>
        )}

        <View style={[styles.notificationsCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={[styles.notificationsIcon, { backgroundColor: 'rgba(184,149,90,0.12)' }]}>
            <Feather name="bell" size={16} color={accent} />
          </View>
          <View style={styles.notificationsCopy}>
            <Text style={[styles.notificationsTitle, { color: ink }]}>Event notifications</Text>
            <Text style={[styles.notificationsDetail, { color: muted }]}>Up to three reminders per event</Text>
          </View>
          <Switch
            testID="paper-event-notifications-toggle"
            accessibilityLabel="Event notifications"
            value={notificationsEnabled}
            onValueChange={onNotificationsChange}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>

        {loading ? (
          <View style={styles.loadingRow} accessibilityRole="progressbar" accessibilityLabel="Loading event overview">
            <ActivityIndicator size="small" color={accent} />
            <Text style={[styles.loadingText, { color: muted }]}>Updating event data</Text>
          </View>
        ) : null}
        <Text style={[styles.timeNote, { color: muted }]}>Schedule shown in your local time · Countdown based on {new Date(nowMs).toLocaleTimeString()}</Text>
      </View>
      </ScrollView>
      {stickyAction ? (
        <View style={[styles.stickyActionWrap, { backgroundColor: colors.background, borderTopColor: border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stickyAction.accessibilityLabel}
            testID="event-arena-sticky-action"
            onPress={stickyAction.onPress}
            disabled={stickyAction.kind === 'join' && (saving || loading)}
            style={({ pressed }) => [
              styles.stickyActionButton,
              {
                backgroundColor: accent,
                opacity: pressed || (stickyAction.kind === 'join' && (saving || loading)) ? 0.64 : 1,
              },
            ]}
          >
            {saving && stickyAction.kind === 'join'
              ? <ActivityIndicator size="small" color="#171714" />
              : stickyAction.kind === 'trade'
                ? <Feather name="trending-up" size={16} color="#171714" />
                : stickyAction.kind === 'finish'
                  ? <Feather name="check-circle" size={16} color="#171714" />
                  : <Feather name="arrow-up-right" size={17} color="#171714" />}
            <Text style={styles.primaryButtonText}>{stickyAction.label}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  brandMark: { width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(184,149,90,0.12)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { flex: 1, minWidth: 0, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.75 },
  iconButton: { width: 40, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  notificationBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#bc6863' },
  notificationBadgeText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 8 },
  heroCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  phaseLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1 },
  eventId: { marginLeft: 'auto', fontFamily: 'Inter_500Medium', fontSize: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 35, letterSpacing: -1.1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, maxWidth: 430 },
  capitalBand: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10, marginTop: 10, alignSelf: 'flex-start', maxWidth: '100%' },
  capitalMark: { width: 3, height: 34, borderRadius: 2 },
  capitalLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.85 },
  capitalValue: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.3, marginTop: 2 },
  capitalSuffix: { flexShrink: 1, maxWidth: 86, textAlign: 'right', fontFamily: 'Inter_600SemiBold', fontSize: 8, lineHeight: 12, letterSpacing: 0.5 },
  countdownPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 12, marginTop: 15 },
  countdownHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.85 },
  countdownUnits: { flexDirection: 'row', gap: 6, marginTop: 10 },
  countdownUnit: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  countdownUnitDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  countdownNumber: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.8 },
  countdownUnitLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 7, letterSpacing: 0.55, marginTop: 3 },
  closedCountdown: { fontFamily: 'Inter_600SemiBold', fontSize: 20, marginTop: 11 },
  dateRow: { flexDirection: 'row', alignItems: 'stretch', marginTop: 14, marginBottom: 14 },
  dateItem: { flex: 1, minWidth: 0, gap: 7 },
  dateDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 10 },
  dateValue: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17, flexShrink: 1 },
  actionsRow: { flexDirection: 'row', gap: 9 },
  primaryButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  fullButton: { width: '100%' },
  primaryButtonText: { color: '#171714', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  secondaryButton: { minHeight: 48, minWidth: 100, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 11 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, letterSpacing: -0.3 },
  sectionAside: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.75 },
  isolationTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 25, borderRadius: 8, backgroundColor: 'rgba(184,149,90,0.1)' },
  isolationText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.7 },
  accountCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 12 },
  accountNameRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  accountNameLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.55 },
  accountName: { flex: 1, minWidth: 0, textAlign: 'right', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  accountHeadline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  equityValue: { fontFamily: 'Inter_600SemiBold', fontSize: 27, letterSpacing: -0.8, marginTop: 3 },
  returnPill: { minHeight: 30, paddingHorizontal: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', minWidth: 0, minHeight: 58, paddingVertical: 8, paddingRight: 8, borderTopWidth: StyleSheet.hairlineWidth },
  metricLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.55 },
  metricValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 4, flexShrink: 1 },
  tradeLink: { height: 48, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 15, overflow: 'hidden', backgroundColor: 'rgba(184,149,90,0.035)' },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, paddingHorizontal: 5, marginBottom: 8 },
  legendLine: { width: 14, height: 2 },
  legendDashed: { width: 14, borderTopWidth: 1, borderStyle: 'dashed', marginLeft: 5 },
  legendText: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  emptyChart: { minHeight: 168, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 310 },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, marginTop: 17 },
  noteIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  noteTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 5 },
  noteText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
  notificationsCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingLeft: 12, paddingRight: 8, marginTop: 23 },
  notificationsIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  notificationsCopy: { flex: 1, minWidth: 0 },
  notificationsTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  notificationsDetail: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  loadingRow: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  timeNote: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 13 },
  stickyActionWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  stickyActionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, paddingHorizontal: 16 },
});
