import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReduceMotionPreference } from '@/hooks/useReduceMotion';
import {
  findPreparedLightningRoundInvitationWindow,
  type PaperChallengeEnrollment,
  type PaperChallengeWindow,
} from '@/lib/paperChallenge';
import { getInstallationId } from '@/lib/installation';
import {
  formatLightningRoundInvitationCountdown,
  getLightningRoundInvitationAction,
  getLightningRoundInvitationPhase,
  getLightningRoundInvitationRevealMode,
  markLightningRoundInvitationSeen,
  shouldShowLightningRoundInvitationAction,
  shouldRenderLightningRoundInvitationButton,
  shouldShowLightningRoundInvitationCountdown,
} from '@/lib/lightningRoundInvitation';
import { getEventArenaHeaderColumnWidth } from '@/lib/eventArenaHeaderLayout';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const T = {
  navy: '#07132e',
  navyDeep: '#040a1a',
  blue: '#328cff',
  gold: '#f2c14e',
  goldBright: '#ffe39a',
  text: '#f4f7fc',
  muted: '#a9bbd8',
};

type Props = {
  alias: string;
  enrolledEvent: PaperChallengeEnrollment | null;
  enrollmentReady: boolean;
  now: number;
  onOpen: () => void;
};

async function fetchPreparedEvents(): Promise<unknown[]> {
  const response = await fetch(`${BASE_URL}/api/event-arena/lightning-round/prepare`, { method: 'POST' });
  if (!response.ok) throw new Error('The prepared Lightning Round schedule could not be loaded.');
  const payload = await response.json() as { events?: unknown; available?: boolean };
  if (!Array.isArray(payload.events)) throw new Error('The prepared Lightning Round schedule was invalid.');
  if (payload.available === false && payload.events.length !== 0) {
    throw new Error('The prepared Lightning Round schedule was invalid.');
  }
  return payload.events;
}

export function LightningRoundInvitation({ alias, enrolledEvent, enrollmentReady, now, onOpen }: Props) {
  const { width } = useWindowDimensions();
  const headerColumnWidth = getEventArenaHeaderColumnWidth(width);
  const motion = useReduceMotionPreference();
  const [preparedEvents, setPreparedEvents] = useState<unknown[] | null>(null);
  const [revealedEventId, setRevealedEventId] = useState<string | null>(null);
  const [seenEventId, setSeenEventId] = useState<string | null>(null);
  const activeEventIdRef = useRef<string | null>(null);
  const checkedEventIdRef = useRef<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void fetchPreparedEvents().then((events) => {
      if (cancelled) return;
      setPreparedEvents(events);
    }).catch(() => {
      if (cancelled) return;
      setPreparedEvents(null);
    });
    return () => { cancelled = true; };
  }, []);

  const schedule = useMemo(() => {
    if (!preparedEvents) return null;
    try {
      return findPreparedLightningRoundInvitationWindow(preparedEvents, now);
    } catch {
      return null;
    }
  }, [now, preparedEvents]);
  const phase = getLightningRoundInvitationPhase(schedule, now);

  useEffect(() => {
    const eventId = enrollmentReady && phase ? schedule?.id ?? null : null;
    activeEventIdRef.current = eventId;
    if (!eventId || !motion.ready || checkedEventIdRef.current === eventId) return;
    checkedEventIdRef.current = eventId;
    void (async () => {
      try {
        const userId = await getInstallationId();
        const alreadySeen = await markLightningRoundInvitationSeen(
          AsyncStorage,
          userId,
          eventId,
          now,
        );
        if (activeEventIdRef.current !== eventId) return;
        setSeenEventId(alreadySeen ? eventId : null);
        const revealMode = getLightningRoundInvitationRevealMode(alreadySeen, motion.reduceMotion);
        if (activeEventIdRef.current !== eventId) return;
        if (revealMode === 'reveal') setRevealedEventId(eventId);
      } catch {
        // A storage error must not block access to the existing Lightning Round screen.
        if (activeEventIdRef.current === eventId) setSeenEventId(eventId);
      }
    })();
  }, [enrollmentReady, motion.ready, motion.reduceMotion, now, phase, schedule?.id]);

  const isRevealing = phase !== null && revealedEventId === schedule?.id && seenEventId !== schedule?.id;
  useEffect(() => {
    if (!isRevealing) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 2_200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (finished && schedule?.id) {
        setSeenEventId(schedule.id);
        setRevealedEventId(null);
      }
    });
    return () => animation.stop();
  }, [isRevealing, progress, schedule?.id]);

  if (!shouldRenderLightningRoundInvitationButton(enrollmentReady, phase, schedule !== null) || !phase || !schedule) {
    return <Alias alias={alias} width={width} />;
  }

  const showCountdown = shouldShowLightningRoundInvitationCountdown(width);
  const showAction = shouldShowLightningRoundInvitationAction(width);
  const isEnrolled = enrolledEvent?.eventId === schedule.id;
  const action = getLightningRoundInvitationAction(isEnrolled, phase);
  const countdown = formatLightningRoundInvitationCountdown(schedule, phase, now);
  const sweepX = progress.interpolate({ inputRange: [0, 0.18, 0.62, 1], outputRange: [-190, -120, 380, 380] });
  const sweepOpacity = progress.interpolate({ inputRange: [0, 0.12, 0.28, 0.55, 1], outputRange: [0, 0, 0.8, 0.18, 0] });
  const borderOpacity = progress.interpolate({ inputRange: [0, 0.12, 0.38, 0.7, 1], outputRange: [0, 0, 1, 0.42, 0] });
  const boltGlowOpacity = progress.interpolate({ inputRange: [0, 0.2, 0.42, 0.72, 1], outputRange: [0.08, 0.15, 0.95, 0.55, 0.14] });
  const scale = progress.interpolate({ inputRange: [0, 0.18, 0.75, 1], outputRange: [0.96, 1.035, 1.015, 1] });
  const actionOpacity = isRevealing
    ? progress.interpolate({ inputRange: [0, 0.53, 0.76, 1], outputRange: [0, 0, 1, 1] })
    : 1;
  const dimOpacity = isRevealing
    ? progress.interpolate({ inputRange: [0, 0.12, 0.4, 0.85, 1], outputRange: [0, 0.1, 0.08, 0.02, 0] })
    : 0;

  return (
    <View style={[styles.headerActions, { width: headerColumnWidth }]} testID="lightning-round-invitation-row">
      <Animated.View pointerEvents="none" style={[styles.headerDim, { opacity: dimOpacity }]} />
      <Alias alias={alias} width={width} />
      <Animated.View style={{ width: '100%', minWidth: 0, transform: [{ scale }] }}>
        <TouchableOpacity
          testID="open-lightning-round"
          accessibilityRole="button"
          accessibilityLabel={`${action} Lightning Round, 24-hour championship`}
          accessibilityHint="Opens the existing Lightning Round experience"
          onPress={onOpen}
          activeOpacity={0.88}
          style={styles.button}
        >
          <View style={styles.boltWrap}>
            <Animated.View pointerEvents="none" style={[styles.boltGlow, { opacity: boltGlowOpacity }]} />
            <Feather name="zap" size={19} color={T.gold} />
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={styles.title}>LIGHTNING ROUND</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.subtitle}>24-HOUR CHAMPIONSHIP</Text>
            {showCountdown ? <Text numberOfLines={1} style={styles.countdown}>{countdown}</Text> : null}
          </View>
          {showAction ? (
            <Animated.View style={[styles.action, { opacity: actionOpacity }]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.actionText}>{action}</Text>
              <Feather name="arrow-up-right" size={12} color={T.goldBright} />
            </Animated.View>
          ) : null}
          {isRevealing ? (
            <>
              <Animated.View pointerEvents="none" style={[styles.energySweep, { opacity: sweepOpacity, transform: [{ translateX: sweepX }, { rotate: '14deg' }] }]} />
              <Animated.View pointerEvents="none" style={[styles.borderPulse, { opacity: borderOpacity }]} />
            </>
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function Alias({ alias, width }: { alias: string; width: number }) {
  const maxWidth = Math.max(54, Math.min(116, width * 0.2));
  return (
    <Text
      testID="event-arena-header-alias"
      accessibilityLabel={alias ? `Competition alias ${alias}` : 'Meisner Method'}
      numberOfLines={1}
      ellipsizeMode="tail"
      style={{ maxWidth, minWidth: 0, flexShrink: 0, color: T.goldBright, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.45, textAlign: 'right' }}
    >
      {alias || 'MEISNER'}
    </Text>
  );
}

const styles = {
  headerActions: {
    position: 'relative' as const,
    flexShrink: 0,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: 4,
  },
  headerDim: {
    position: 'absolute' as const,
    left: -16,
    right: -16,
    top: 0,
    bottom: 0,
    backgroundColor: '#020714',
  },
  button: {
    minHeight: 50,
    minWidth: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    overflow: 'hidden' as const,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: T.blue,
    backgroundColor: T.navy,
    shadowColor: T.blue,
    shadowOpacity: 0.42,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  boltWrap: {
    position: 'relative' as const,
    width: 23,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  boltGlow: {
    position: 'absolute' as const,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.gold,
    shadowColor: T.gold,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 3,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center' as const,
  },
  title: {
    color: T.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.72,
  },
  subtitle: {
    color: T.muted,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 7,
    letterSpacing: 0.65,
    marginTop: 2,
  },
  countdown: {
    color: '#82bdff',
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    letterSpacing: 0.45,
    marginTop: 2,
  },
  action: {
    minHeight: 34,
    minWidth: 44,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(50,140,255,0.16)',
  },
  actionText: {
    color: T.goldBright,
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.45,
  },
  energySweep: {
    position: 'absolute' as const,
    top: -10,
    bottom: -10,
    width: 60,
    backgroundColor: 'rgba(143,206,255,0.68)',
    shadowColor: '#8fcfff',
    shadowOpacity: 0.9,
    shadowRadius: 20,
  },
  borderPulse: {
    ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const),
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#a9d9ff',
  },
};
