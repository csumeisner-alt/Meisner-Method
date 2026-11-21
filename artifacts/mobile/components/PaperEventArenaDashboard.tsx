import React, { useEffect, useState } from 'react';
import { ImageBackground, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGetEventArenaLeaderboardQueryKey,
  useGetEventArenaLeaderboard,
} from '@workspace/api-client-react';
import type { PaperChallengeEnrollment, PaperChallengeSummary, PaperChallengeWindow } from '@/lib/paperChallenge';
import {
  formatPaperEventCountdown,
  getLightningRoundCardPromotionPhase,
  getPaperEventDashboardPhase,
  getPaperEventDashboardProgress,
  getPaperEventDashboardRank,
  getPaperEventDashboardRankText,
} from '@/lib/paperEventDashboard';
import { getInstallationId } from '@/lib/installation';
import { getEventArenaParticipantId } from '@/lib/eventArenaDeviceSync';
import { EVENT_ARENA_ARTWORK_SOURCES } from '@/lib/eventArenaArtwork';

type Props = {
  eventId: string;
  startAtMs: number;
  endAtMs: number;
  eventType?: 'event-arena' | 'green-bull-championship' | 'bear-market-mayhem' | 'penny-stock-mayhem' | 'mountain-championship' | 'one-stock-challenge' | 'lightning-round';
  enrollment: PaperChallengeEnrollment | null;
  summary: PaperChallengeSummary | null;
  equity: number;
  buyingPower: number;
  onViewLeaderboard: () => void;
  lightningRoundPromotionWindow?: Pick<PaperChallengeWindow, 'startAtMs' | 'endAtMs'> | null;
  isLightningRoundEnrolled?: boolean;
  onOpenLightningRound?: () => void;
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

export function PaperEventArenaDashboard({
  eventId,
  startAtMs,
  endAtMs,
  eventType = 'event-arena',
  enrollment,
  summary,
  equity,
  buyingPower,
  onViewLeaderboard,
  lightningRoundPromotionWindow = null,
  isLightningRoundEnrolled = false,
  onOpenLightningRound,
}: Props) {
  const { fontScale } = useWindowDimensions();
  // Keep four small metric tiles on a normal phone; wrap them only when the
  // user has enlarged system text enough to need more room.
  const compactMetrics = fontScale >= 1.3;
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [installationIdReady, setInstallationIdReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [rankTimedOut, setRankTimedOut] = useState(false);
  const [rankRetryVersion, setRankRetryVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    void getEventArenaParticipantId(AsyncStorage, getInstallationId)
      .then((id) => { if (mounted) setInstallationId(id); })
      .catch(() => { if (mounted) setInstallationId(null); })
      .finally(() => { if (mounted) setInstallationIdReady(true); });
    return () => { mounted = false; };
  }, [rankRetryVersion]);

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
  const lightningPromotionPhase = getLightningRoundCardPromotionPhase(lightningRoundPromotionWindow, now);
  const progress = getPaperEventDashboardProgress(startAtMs, endAtMs, now);
  const rank = phase === 'upcoming'
    ? null
    : phase === 'ended' && summary?.finalRank != null
    ? summary.finalRank
    : enrollment?.leaderboardOptedIn && ownEntry.length === 1
      ? ownEntry[0].rank
      : null;
  const rankTreatment = getPaperEventDashboardRank(rank);
  useEffect(() => {
    setRankTimedOut(false);
    if (
      !enrollment?.leaderboardOptedIn
      || phase === 'upcoming'
      || leaderboard.data
      || leaderboard.isError
      || !leaderboard.isPending
    ) return;
    const timer = setTimeout(() => setRankTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [
    enrollment?.leaderboardOptedIn,
    eventId,
    installationId,
    installationIdReady,
    leaderboard.data,
    leaderboard.isError,
    leaderboard.isPending,
    phase,
    rankRetryVersion,
  ]);
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
  const statusColor = phase === 'active' ? GREEN : GOLD;
  const rankText = getPaperEventDashboardRankText({
    phase,
    optedIn: enrollment?.leaderboardOptedIn ?? false,
    rank,
    hasResponse: Boolean(leaderboard.data),
    unavailable: leaderboard.isError
      || rankTimedOut
      || (installationIdReady && !installationId)
      || (!leaderboard.isPending && !leaderboard.data),
  });
  const rankColor = rankTreatment?.medal === 'GOLD'
    ? '#ffe08a'
    : rankTreatment?.medal === 'SILVER'
      ? '#d8dde5'
      : rankTreatment?.medal === 'BRONZE'
        ? '#e3a06d'
        : GOLD;
  const pnlColor = competitionPnL == null ? MUTED : competitionPnL >= 0 ? GREEN : RED;
  const returnColor = competitionReturn == null ? MUTED : competitionReturn >= 0 ? GREEN : RED;
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
        flexShrink: 1,
        flexBasis: compactMetrics ? '46%' : '22%',
        minWidth: 0,
        paddingHorizontal: 5,
        paddingVertical: compactMetrics ? 4 : 2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(231,198,106,0.18)',
        backgroundColor: 'rgba(255,255,255,0.035)',
      }}
    >
      <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit style={{ color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 7, letterSpacing: 0.25 }}>
        {label}
      </Text>
      <Text
        testID={testID ? `${testID}-value` : undefined}
        allowFontScaling
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        style={{ color, fontFamily: 'Inter_700Bold', fontSize: compactMetrics ? 11 : 10, marginTop: 0 }}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View
      testID="paper-event-championship-dashboard"
      accessibilityLabel={lightningPromotionPhase
        ? 'Lightning Round championship promotion'
        : `${eventType === 'lightning-round' ? 'Lightning Round' : eventType === 'mountain-championship' ? 'Mountain Championship' : 'Event Arena'} championship account summary`}
    >
      {lightningPromotionPhase ? (
        <View
          testID="paper-lightning-round-promotion"
          style={{
            minHeight: 150,
            justifyContent: 'space-between',
            overflow: 'hidden',
            padding: 11,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: 'rgba(112,218,255,0.75)',
            backgroundColor: '#05234f',
          }}
        >
          <ImageBackground
            source={EVENT_ARENA_ARTWORK_SOURCES['lightning-round-arena']}
            imageStyle={{ borderRadius: 10 }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(2,15,43,0.48)',
            }}
          />
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="zap" size={16} color="#9be8ff" />
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ flex: 1, color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: 0.55 }}
              >
                LIGHTNING ROUND CHAMPIONSHIP
              </Text>
            </View>
            <Text
              testID="paper-lightning-round-promotion-countdown"
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              style={{ color: '#d9f6ff', fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 8 }}
            >
              {formatPaperEventCountdown(lightningRoundPromotionWindow!.startAtMs, lightningRoundPromotionWindow!.endAtMs, now)}
            </Text>
            <Text style={{ color: '#aeeaff', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.55, marginTop: 5 }}>
              $100,000 STARTING CAPITAL
            </Text>
          </View>
          <TouchableOpacity
            testID="paper-open-lightning-round-promotion"
            accessibilityRole="button"
            accessibilityLabel={isLightningRoundEnrolled ? 'View Lightning Round event' : 'Join Lightning Round event'}
            onPress={onOpenLightningRound}
            activeOpacity={0.82}
            style={{
              minHeight: 34,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingHorizontal: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(198,243,255,0.95)',
              backgroundColor: 'rgba(10,121,190,0.82)',
            }}
          >
            <Feather name={isLightningRoundEnrolled ? 'eye' : 'arrow-right-circle'} size={13} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.65 }}>
              {isLightningRoundEnrolled ? 'VIEW EVENT' : 'JOIN EVENT'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
      <>
      {eventType === 'lightning-round' && (
        <Text testID="paper-lightning-round-rules" style={{ color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 7, letterSpacing: 0.35, marginTop: 4 }}>
          $100,000 START · 24 HOURS · HIGHEST RETURN WINS
        </Text>
      )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.55 }}>
              {phase === 'ended' && summary ? 'FINAL EQUITY' : 'ACCOUNT EQUITY'}
            </Text>
            <Text
              testID="paper-event-account-equity"
              accessibilityLabel={`Event account equity ${displayedEquity == null ? 'unavailable' : money(displayedEquity)}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ color: '#fff8e8', fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 24, letterSpacing: -0.65 }}
            >
              {displayedEquity == null ? '—' : money(displayedEquity)}
            </Text>
          </View>
          <View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: '26%', height: 1, marginBottom: 5, borderRadius: 1, backgroundColor: 'rgba(231,198,106,0.36)' }}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
        {metric(
          'COMP P/L',
          competitionPnL == null ? '—' : signedMoney(competitionPnL),
          pnlColor,
          'paper-event-competition-pnl',
          competitionPnL == null
            ? 'Competition profit or loss unavailable until the event starts and its actual starting equity is saved'
            : `Competition profit or loss ${signedMoney(competitionPnL)}`,
        )}
        {metric(
          'RETURN',
          competitionReturn == null ? '—' : signedPercent(competitionReturn),
          returnColor,
          'paper-event-competition-return',
          competitionReturn == null ? 'Competition return unavailable' : `Competition return ${signedPercent(competitionReturn)}`,
        )}
        {metric('BUYING POWER', safeMoney(buyingPower), '#f5f1e7', 'paper-event-buying-power')}
        {metric(
          'RANK',
          rankText,
          rankColor,
          'paper-event-account-rank',
          rankTreatment
            ? `${rankTreatment.label}${rankTreatment.medal ? `, ${rankTreatment.medal.toLowerCase()} medal` : ''}`
            : `Leaderboard ranking ${rankText.toLowerCase()}`,
        )}
      </View>
      {rankText === 'UNAVAILABLE' && (
        <TouchableOpacity
          testID="paper-event-rank-retry"
          accessibilityRole="button"
          accessibilityLabel="Retry Event Arena rank"
          onPress={() => {
            setRankTimedOut(false);
            setRankRetryVersion((version) => version + 1);
            if (installationId) void leaderboard.refetch();
          }}
          style={{ alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 5 }}
        >
          <Text style={{ color: GOLD, fontFamily: 'Inter_600SemiBold', fontSize: 9 }}>
            RETRY RANK
          </Text>
        </TouchableOpacity>
      )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
            <Text
              testID="paper-event-account-countdown"
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ flex: 1, color: '#fff0c5', fontFamily: 'Inter_700Bold', fontSize: 9 }}
            >
              {formatPaperEventCountdown(startAtMs, endAtMs, now)}
            </Text>
            {Array.isArray(leaderboard.data?.entries) && (
              <Text
                testID="paper-event-account-participant-count"
                accessibilityRole="text"
                style={{ flexShrink: 0, color: MUTED, fontFamily: 'Inter_500Medium', fontSize: 8 }}
              >
                {entries.length} {entries.length === 1 ? 'participant' : 'participants'}
              </Text>
            )}
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Event schedule progress"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}
            style={{ height: 3, overflow: 'hidden', borderRadius: 2, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' }}
          >
            <View
              testID="paper-event-account-progress"
              style={{ width: `${progress}%`, height: '100%', borderRadius: 2, backgroundColor: statusColor }}
            />
          </View>
        </View>
        <LeaderboardButton onPress={onViewLeaderboard} />
      </View>
      </>
      )}
    </View>
  );
}

function LeaderboardButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      testID="paper-event-view-leaderboard"
      accessibilityRole="button"
      accessibilityLabel="View Event Arena leaderboard"
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={8}
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        borderWidth: 1,
        borderColor: 'rgba(231,198,106,0.52)',
        backgroundColor: 'rgba(231,198,106,0.12)',
      }}
    >
      <Feather name="bar-chart-2" size={16} color={GOLD} />
    </TouchableOpacity>
  );
}
