import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { PortfolioLineChart } from '@/components/PaperCharts';
import type { PaperChallengeEnrollment, PaperChallengeWindow } from '@/lib/paperChallenge';
import type {
  EventArenaCountdown,
  EventArenaParticipation,
  EventArenaPerformance,
} from '@/lib/eventArenaHome';

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
  onOpenTrades: () => void;
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
  onOpenTrades,
}: EventArenaOverviewProps) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, Math.min(windowWidth - 32, 560));
  const livePhase = nowMs < event.startAtMs ? 'upcoming' : nowMs <= event.endAtMs ? 'active' : 'ended';
  const joined = participation === 'joined' && enrollment?.eventId === event.id;
  const isUpcoming = livePhase === 'upcoming';
  const canWithdraw = joined && isUpcoming && enrollment?.startEquity == null;
  const copy = statusCopy(participation, livePhase);
  const accent = '#b8955a';
  const positive = (performance?.profitLoss ?? 0) >= 0;
  const countdownMode = livePhase === 'upcoming' ? 'starts' : livePhase === 'active' ? 'ends' : 'ended';
  const countdownLabel = countdownMode === 'starts' ? 'STARTS IN' : countdownMode === 'ends' ? 'TIME REMAINING' : 'EVENT CLOSED';
  const countdownValue = countdownMode === 'ended'
    ? 'Closed'
    : `${countdown.days}d  ${String(countdown.hours).padStart(2, '0')}h  ${String(countdown.minutes).padStart(2, '0')}m  ${String(countdown.seconds).padStart(2, '0')}s`;
  const eventName = `Week of ${new Date(event.startAtMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const eventTitle = `Week of ${new Date(event.startAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
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
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, { color: valueColor ?? ink }]}>{value}</Text>
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
          <View style={styles.brandMark}><Feather name="activity" size={15} color={accent} /></View>
          <Text style={[styles.eyebrow, { color: muted }]}>MEISNER METHOD  /  EVENT ARENA</Text>
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

        <View style={[styles.heroCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.heroTop}>
            <View style={[styles.liveDot, { backgroundColor: livePhase === 'active' ? '#4da987' : accent }]} />
            <Text style={[styles.phaseLabel, { color: muted }]}>{livePhase.toUpperCase()} EVENT</Text>
            <Text style={[styles.eventId, { color: muted }]}>ID {event.id}</Text>
          </View>
          <Text accessibilityLabel={`Event Arena ${eventName}`} style={[styles.title, { color: ink }]}>{eventTitle}</Text>
          <Text style={[styles.subtitle, { color: muted }]}>{copy.title}. {copy.detail}</Text>

          <View style={[styles.countdownPanel, { backgroundColor: colors.background, borderColor: border }]}>
            <View style={styles.countdownHead}>
              <Text style={[styles.smallLabel, { color: muted }]}>{countdownLabel}</Text>
              <Feather name={countdownMode === 'ended' ? 'check-circle' : 'clock'} size={14} color={accent} />
            </View>
            <Text accessibilityLabel={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds`} style={[styles.countdownValue, { color: ink }]}>{countdownValue}</Text>
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
              <View style={styles.accountHeadline}>
                <View>
                  <Text style={[styles.smallLabel, { color: muted }]}>ACCOUNT EQUITY</Text>
                  <Text style={[styles.equityValue, { color: ink }]}>{money(performance?.equity)}</Text>
                </View>
                <View style={[styles.returnPill, { backgroundColor: positive ? 'rgba(77,169,135,0.13)' : 'rgba(188,104,99,0.13)' }]}>
                  <Text style={{ color: positive ? '#4da987' : '#bc6863', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{signedPercent(performance?.returnPercent)}</Text>
                </View>
              </View>
              <View style={styles.metricGrid}>
                <Metric label="START BALANCE" value={money(performance?.startingBalance ?? enrollment?.startEquity ?? 100_000)} />
                <Metric label="NET P/L" value={signedMoney(performance?.profitLoss)} valueColor={performance?.profitLoss == null ? ink : positive ? '#4da987' : '#bc6863'} />
                <Metric label="BUYING POWER" value={money(performance?.buyingPower)} />
                <Metric label="EVENT RANK" value={rank == null ? '—' : `#${rank}`} />
                <Metric label="COMPLETED TRADES" value={performance ? String(performance.completedTradeCount) : '—'} />
                <Metric label="EVENT ACCOUNT" value={performance?.account?.name ?? enrollment?.accountName ?? 'Ready'} />
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
            <View style={[styles.chartCard, { backgroundColor: surface, borderColor: border }]}>
              <View style={styles.chartLegend}>
                <View style={[styles.legendLine, { backgroundColor: accent }]} />
                <Text style={[styles.legendText, { color: muted }]}>Event equity</Text>
                <View style={[styles.legendDashed, { borderColor: muted }]} />
                <Text style={[styles.legendText, { color: muted }]}>Start balance · {money(performance?.startingBalance ?? enrollment?.startEquity ?? 100_000)}</Text>
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
                  height={184}
                  referenceLine={{
                    value: performance?.startingBalance ?? enrollment?.startEquity ?? 100_000,
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
  topline: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  brandMark: { width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(184,149,90,0.12)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.05 },
  iconButton: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, padding: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  phaseLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1 },
  eventId: { marginLeft: 'auto', fontFamily: 'Inter_500Medium', fontSize: 10 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 27, lineHeight: 32, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, maxWidth: 430 },
  countdownPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, marginTop: 15 },
  countdownHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.85 },
  countdownValue: { fontFamily: 'Inter_600SemiBold', fontSize: 21, letterSpacing: -0.5, marginTop: 7 },
  dateRow: { flexDirection: 'row', alignItems: 'stretch', marginTop: 14, marginBottom: 14 },
  dateItem: { flex: 1, gap: 7 },
  dateDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 13 },
  dateValue: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
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
  accountCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16 },
  accountHeadline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  equityValue: { fontFamily: 'Inter_600SemiBold', fontSize: 29, letterSpacing: -0.8, marginTop: 5 },
  returnPill: { minHeight: 32, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', minHeight: 70, paddingVertical: 12, paddingRight: 9, borderTopWidth: StyleSheet.hairlineWidth },
  metricLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.65 },
  metricValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 7 },
  tradeLink: { height: 48, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 14, overflow: 'hidden' },
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
  loadingRow: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  timeNote: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 13 },
  stickyActionWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  stickyActionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, paddingHorizontal: 16 },
});
