import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetEventArenaLeaderboardQueryKey,
  useGetEventArenaLeaderboard,
} from '@workspace/api-client-react';
import type { PaperChallengeEnrollment, PaperChallengeSummary } from '@/lib/paperChallenge';
import {
  formatPaperEventCountdown,
  getPaperEventDashboardPhase,
  getPaperEventDashboardProgress,
  getPaperEventDashboardRank,
} from '@/lib/paperEventDashboard';
import { getInstallationId } from '@/lib/installation';

type Props = {
  eventId: string;
  startAtMs: number;
  endAtMs: number;
  enrollment: PaperChallengeEnrollment | null;
  summary: PaperChallengeSummary | null;
  equity: number;
  buyingPower: number;
  onViewLeaderboard: () => void;
};

const GOLD = '#e7c66a';
const MUTED = '#b4b0a6';
const GREEN = '#63d7a0';
const RED = '#ff7777';

const money = (value: number) =>
  `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const safeMoney = (value: number) => Number.isFinite(value) ? money(value) : '—';
const signedMoney = (value: number) => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
const signedPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

function eventDateRange(startAtMs: number, endAtMs: number) {
  const start = new Date(startAtMs);
  const end = new Date(endAtMs);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Event dates unavailable';
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

export function PaperEventArenaDashboard({
  eventId,
  startAtMs,
  endAtMs,
  enrollment,
  summary,
  equity,
  buyingPower,
  onViewLeaderboard,
}: Props) {
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [installationIdReady, setInstallationIdReady] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    void getInstallationId()
      .then((id) => { if (mounted) setInstallationId(id); })
      .catch(() => { if (mounted) setInstallationId(null); })
      .finally(() => { if (mounted) setInstallationIdReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const leaderboard = useGetEventArenaLeaderboard(eventId, {
    request: installationId
      ? { headers: { 'X-Event-Arena-Installation-Id': installationId } }
      : undefined,
    query: {
      enabled: !!eventId && installationId !== null,
      queryKey: [...getGetEventArenaLeaderboardQueryKey(eventId), installationId ?? 'anonymous'],
      staleTime: 60_000,
      refetchInterval: 120_000,
      refetchOnWindowFocus: false,
    },
  });
  const entries = leaderboard.data?.entries ?? [];
  const ownEntry = entries.filter((entry) => entry.isCurrentUser);
  const phase = getPaperEventDashboardPhase(startAtMs, endAtMs, now);
  const progress = getPaperEventDashboardProgress(startAtMs, endAtMs, now);
  const rank = phase === 'ended' && summary?.finalRank != null
    ? summary.finalRank
    : enrollment?.leaderboardOptedIn && ownEntry.length === 1
      ? ownEntry[0].rank
      : null;
  const rankTreatment = getPaperEventDashboardRank(rank);
  const rawStartingEquity = summary?.startEquity ?? enrollment?.startEquity ?? null;
  const startingEquity = rawStartingEquity !== null
    && Number.isFinite(rawStartingEquity)
    && rawStartingEquity > 0
    ? rawStartingEquity
    : null;
  const rawDisplayedEquity = phase === 'ended' && summary ? summary.endEquity : equity;
  const displayedEquity = Number.isFinite(rawDisplayedEquity) ? rawDisplayedEquity : null;
  const rawCompetitionPnL = phase === 'upcoming' || phase === 'unavailable' || startingEquity == null || displayedEquity == null
    ? null
    : phase === 'ended' && summary
      ? summary.netProfit
      : displayedEquity - startingEquity;
  const competitionPnL = rawCompetitionPnL !== null && Number.isFinite(rawCompetitionPnL)
    ? rawCompetitionPnL
    : null;
  const rawCompetitionReturn = phase === 'upcoming' || phase === 'unavailable' || startingEquity == null
    ? null
    : phase === 'ended' && summary
      ? summary.returnPercent
      : startingEquity > 0
        ? (competitionPnL == null ? Number.NaN : (competitionPnL / startingEquity) * 100)
        : null;
  const competitionReturn = rawCompetitionReturn !== null && Number.isFinite(rawCompetitionReturn)
    ? rawCompetitionReturn
    : null;
  const phaseLabel = phase === 'upcoming'
    ? 'UPCOMING'
    : phase === 'active'
      ? 'LIVE NOW'
      : phase === 'ended'
        ? 'COMPLETE'
        : 'SCHEDULE UNAVAILABLE';
  const statusColor = phase === 'active' ? GREEN : GOLD;
  const rankText = rankTreatment?.label
    ?? (enrollment?.leaderboardOptedIn
      ? leaderboard.data
        ? 'NOT RANKED'
        : leaderboard.isError || (installationIdReady && !installationId)
          ? 'UNAVAILABLE'
          : 'LOADING RANK'
      : 'NOT RANKED');
  const rankColor = rankTreatment?.medal === 'GOLD'
    ? '#ffe08a'
    : rankTreatment?.medal === 'SILVER'
      ? '#d8dde5'
      : rankTreatment?.medal === 'BRONZE'
        ? '#e3a06d'
        : GOLD;
  const pnlColor = competitionPnL == null ? MUTED : competitionPnL >= 0 ? GREEN : RED;
  const returnColor = competitionReturn == null ? MUTED : competitionReturn >= 0 ? GREEN : RED;
  const eventName = eventId
    ? `EVENT ARENA · ${eventDateRange(startAtMs, endAtMs)}`
    : 'EVENT ARENA';

  const metric = (
    label: string,
    value: string,
    color = '#f5f1e7',
    testID?: string,
    accessibilityLabel?: string,
  ) => (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        minWidth: 0,
        padding: 9,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(231,198,106,0.18)',
        backgroundColor: 'rgba(255,255,255,0.035)',
      }}
    >
      <Text allowFontScaling style={{ color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.7 }}>
        {label}
      </Text>
      <Text
        testID={testID ? `${testID}-value` : undefined}
        allowFontScaling
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{ color, fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 }}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View testID="paper-event-championship-dashboard" accessibilityLabel="Event Arena championship account summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Feather name="award" size={15} color={GOLD} />
        <Text style={{ flex: 1, minWidth: 0, color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>
          CHAMPIONSHIP ACCOUNT
        </Text>
        <View
          testID="paper-event-account-status"
          style={{
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: `${statusColor}70`,
            backgroundColor: `${statusColor}15`,
          }}
        >
          <Text accessibilityLiveRegion="polite" style={{ color: statusColor, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 }}>
            {phaseLabel}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityLabel={eventName} numberOfLines={2} style={{ color: '#e9e1ce', fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 }}>
            {eventName}
          </Text>
        </View>
      </View>

      <Text
        testID="paper-event-account-equity"
        accessibilityLabel={`Event account equity ${displayedEquity == null ? 'unavailable' : money(displayedEquity)}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{ color: '#fff8e8', fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7, marginTop: 8 }}
      >
        {displayedEquity == null ? '—' : money(displayedEquity)}
      </Text>
      <Text style={{ color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1, marginTop: 1 }}>
        {phase === 'ended' && summary ? 'FINAL ACCOUNT EQUITY' : 'CURRENT ACCOUNT EQUITY'}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
        {metric(
          'COMPETITION P/L',
          competitionPnL == null ? '—' : signedMoney(competitionPnL),
          pnlColor,
          'paper-event-competition-pnl',
          competitionPnL == null
            ? 'Competition profit or loss unavailable until the event starts and its actual starting equity is saved'
            : `Competition profit or loss ${signedMoney(competitionPnL)}`,
        )}
        {metric(
          'COMPETITION RETURN',
          competitionReturn == null ? '—' : signedPercent(competitionReturn),
          returnColor,
          'paper-event-competition-return',
          competitionReturn == null ? 'Competition return unavailable' : `Competition return ${signedPercent(competitionReturn)}`,
        )}
        {metric('BUYING POWER', safeMoney(buyingPower), '#f5f1e7', 'paper-event-buying-power')}
        {metric(
          'LEADERBOARD',
          rankText,
          rankColor,
          'paper-event-account-rank',
          rankTreatment
            ? `${rankTreatment.label}${rankTreatment.medal ? `, ${rankTreatment.medal.toLowerCase()} medal` : ''}`
            : `Leaderboard ranking ${rankText.toLowerCase()}`,
        )}
      </View>

      <View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: 'rgba(231,198,106,0.08)' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, minWidth: 0, color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.7 }}>
            {phase === 'upcoming' ? 'TIME UNTIL START' : phase === 'active' ? 'TIME REMAINING' : 'EVENT STATUS'}
          </Text>
          <Text testID="paper-event-account-countdown" accessibilityRole="text" accessibilityLiveRegion="polite" style={{ color: '#fff0c5', fontFamily: 'Inter_700Bold', fontSize: 11 }}>
            {formatPaperEventCountdown(startAtMs, endAtMs, now)}
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Event schedule progress"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}
          style={{ height: 5, marginTop: 8, overflow: 'hidden', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' }}
        >
          <View
            testID="paper-event-account-progress"
            style={{ width: `${progress}%`, height: '100%', borderRadius: 4, backgroundColor: statusColor }}
          />
        </View>
        {Array.isArray(leaderboard.data?.entries) && (
          <Text
            testID="paper-event-account-participant-count"
            accessibilityRole="text"
            style={{ color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 7 }}
          >
            {entries.length} {entries.length === 1 ? 'participant' : 'participants'}
          </Text>
        )}
      </View>

      <TouchableOpacity
        testID="paper-event-view-leaderboard"
        accessibilityRole="button"
        accessibilityLabel="View Event Arena leaderboard"
        onPress={onViewLeaderboard}
        activeOpacity={0.8}
        style={{
          minHeight: 40,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          marginTop: 9,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: 'rgba(231,198,106,0.52)',
          backgroundColor: 'rgba(231,198,106,0.12)',
        }}
      >
        <Feather name="bar-chart-2" size={14} color={GOLD} />
        <Text style={{ color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>
          VIEW LEADERBOARD
        </Text>
      </TouchableOpacity>
    </View>
  );
}
