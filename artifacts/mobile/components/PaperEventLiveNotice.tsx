import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { INITIAL_BALANCE } from '@/lib/paperMath';
import {
  getPaperEventLiveNoticeDismissalKey,
  isDismissiblePaperEventLiveNotice,
  loadPaperEventLiveNoticeDismissal,
  ONE_STOCK_CHALLENGE_REJECTION_MESSAGE,
  ONE_STOCK_CHALLENGE_RULE_COPY,
  persistPaperEventLiveNoticeDismissal,
  type PaperChallengeEnrollment,
} from '@/lib/paperChallenge';

type Props = {
  enrollment: PaperChallengeEnrollment;
  hasCurrentEventEnrollment: boolean;
  isEventAccountActive: boolean;
  lightningEntryFailure: string;
  onSwitchToPaperEventAccount: () => void;
};

export function PaperEventLiveNotice({
  enrollment,
  hasCurrentEventEnrollment,
  isEventAccountActive,
  lightningEntryFailure,
  onSwitchToPaperEventAccount,
}: Props) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const motion = useRef(new Animated.Value(1)).current;
  const dismissalKey = isDismissiblePaperEventLiveNotice(enrollment.eventType)
    ? getPaperEventLiveNoticeDismissalKey(enrollment.accountId, enrollment.eventId)
    : null;
  const showNotice = dismissalKey === null
    || (loadedKey === dismissalKey && dismissedKey !== dismissalKey);

  useEffect(() => {
    let cancelled = false;
    motion.stopAnimation();
    motion.setValue(1);
    setDismissing(false);
    if (!dismissalKey) {
      setLoadedKey(null);
      return () => { cancelled = true; };
    }

    setLoadedKey(null);
    void loadPaperEventLiveNoticeDismissal(AsyncStorage, dismissalKey)
      .then((dismissed) => {
        if (cancelled) return;
        setDismissedKey(dismissed ? dismissalKey : null);
        setLoadedKey(dismissalKey);
      })
      .catch(() => {
        if (cancelled) return;
        setDismissedKey(null);
        setLoadedKey(dismissalKey);
      });
    return () => { cancelled = true; };
  }, [dismissalKey, motion]);

  const dismissNotice = () => {
    if (!dismissalKey || dismissing) return;
    setDismissing(true);
    const persistDismissal = async () => {
      try {
        await persistPaperEventLiveNoticeDismissal(AsyncStorage, dismissalKey);
        setDismissedKey(dismissalKey);
      } catch {
        motion.setValue(1);
        Alert.alert('Could not dismiss notice', 'The Event Arena notice is unchanged. Please try again.');
      } finally {
        setDismissing(false);
      }
    };
    if (reduceMotion) {
      void persistDismissal();
      return;
    }
    Animated.timing(motion, {
      toValue: 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) void persistDismissal();
      else setDismissing(false);
    });
  };

  if (!showNotice) return null;

  return (
    <Animated.View
      testID="paper-event-live-banner"
      accessibilityLiveRegion="polite"
      style={[
        {
          marginHorizontal: 16,
          marginTop: 10,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: colors.card,
        },
        dismissalKey
          ? {
              opacity: motion,
              transform: [{
                translateY: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-4, 0],
                }),
              }],
            }
          : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Feather name="award" size={14} color={colors.primary} />
        <Text style={[{
          color: colors.primary,
          fontFamily: 'Inter_700Bold',
          fontSize: 11,
          letterSpacing: 0.7,
        }, dismissalKey ? { flex: 1 } : null]}>
          {enrollment.eventType === 'lightning-round'
            ? 'LIGHTNING ROUND IS LIVE'
            : enrollment.eventType === 'penny-stock-mayhem'
              ? 'PENNY STOCK MAYHEM IS LIVE'
              : enrollment.eventType === 'one-stock-challenge'
                ? 'THE ONE-STOCK CHALLENGE IS LIVE' : 'EVENT ARENA IS LIVE'}
        </Text>
        {dismissalKey && (
          <TouchableOpacity
            testID="dismiss-paper-event-live-banner"
            accessibilityRole="button"
            accessibilityLabel="Dismiss Event Arena live notice"
            accessibilityHint="Hides this notice for this Event Arena account and event"
            disabled={dismissing}
            onPress={dismissNotice}
            hitSlop={8}
            style={{ width: 44, height: 44, marginVertical: -15, marginRight: -8, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17, marginTop: 7 }}>
        {enrollment.eventType === 'lightning-round'
          ? 'LIGHTNING ROUND · SHARED EVENT ARENA ACCOUNT'
          : enrollment.eventType === 'penny-stock-mayhem'
            ? 'PENNY STOCK MAYHEM · $100,000 STARTING CAPITAL · STOCKS & ETFs UNDER $20'
            : enrollment.eventType === 'one-stock-challenge'
              ? 'THE ONE-STOCK CHALLENGE · $100,000 STARTING CAPITAL'
          : enrollment.eventType === 'green-bull-championship'
            ? 'GREEN BULL CHAMPIONSHIP · $500,000 STARTING CAPITAL'
            : enrollment.eventType === 'bear-market-mayhem'
              ? `BEAR MARKET MAYHEM · $${(enrollment.startingBalance ?? INITIAL_BALANCE).toLocaleString('en-US', { maximumFractionDigits: 0 })} STARTING CAPITAL`
              : `EVENT ARENA · $${(enrollment.startingBalance ?? INITIAL_BALANCE).toLocaleString('en-US', { maximumFractionDigits: 0 })} STARTING CAPITAL`}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }}>
        {enrollment.eventType === 'lightning-round'
          ? 'Your shared Event Arena account was reset to $100,000 before this round. Only this round’s tagged trades count toward its score; completed Lightning results remain saved. The round closes 24 hours after it opens.'
          : enrollment.eventType === 'one-stock-challenge'
            ? ONE_STOCK_CHALLENGE_RULE_COPY
            : `Trade only in your separate ${enrollment.eventType === 'penny-stock-mayhem' ? 'Penny Stock Mayhem' : 'Event Arena'} account. This paper championship closes Friday at 4:00 p.m. ET.`}
      </Text>
      {enrollment.eventType === 'penny-stock-mayhem' && (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }}>
          Long buys require a verified stock or ETF, a quote below $20, and a final fill below $20. Sells and reductions are unrestricted. Existing short-selling rules are unchanged.
        </Text>
      )}
      {enrollment.eventType === 'one-stock-challenge' && (
        <Text
          testID="one-stock-live-reminder"
          accessibilityLabel={ONE_STOCK_CHALLENGE_REJECTION_MESSAGE}
          style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 11, lineHeight: 16, marginTop: 6 }}
        >
          ONE PARTICIPANT. ONE STOCK. ONE OPEN POSITION. Close your current position before selecting a different stock or ETF.
        </Text>
      )}
      {enrollment.eventType === 'lightning-round' && lightningEntryFailure ? (
        <Text
          testID="lightning-round-entry-failure"
          accessibilityRole="alert"
          style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 15, marginTop: 8 }}
        >
          NOT ENTERED — {lightningEntryFailure}
        </Text>
      ) : null}
      {hasCurrentEventEnrollment && !isEventAccountActive && (
        <TouchableOpacity
          testID="switch-to-paper-event-account"
          accessibilityRole="button"
          onPress={onSwitchToPaperEventAccount}
          style={{ alignSelf: 'flex-start', marginTop: 9, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
            CHOOSE EVENT PORTFOLIO
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
