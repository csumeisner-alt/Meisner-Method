import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import {
  PAPER_CHALLENGE_STORAGE_KEY,
  type PaperChallengeStore,
  type PaperChallengeSummary,
} from '@/lib/paperChallenge';

type Props = { visible: boolean };

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : '−'}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatEventDate(startMs: number, endMs: number) {
  const start = new Date(startMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(endMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start}–${end}`;
}

export function PaperChallengeHistory({ visible }: Props) {
  const colors = useColors();
  const [store, setStore] = useState<PaperChallengeStore>({ enrollment: null, history: [] });

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    AsyncStorage.getItem(PAPER_CHALLENGE_STORAGE_KEY).then((raw) => {
      if (!raw) {
        if (!cancelled) setStore({ enrollment: null, history: [] });
        return;
      }
      const parsed = JSON.parse(raw) as PaperChallengeStore;
      if (!cancelled) setStore({
        enrollment: parsed.enrollment ?? null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      });
    }).catch(() => {
      if (!cancelled) setStore({ enrollment: null, history: [] });
    });
    return () => { cancelled = true; };
  }, [visible]);

  return (
    <View testID="settings-paper-events" style={{ marginBottom: 20 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
        Paper trading events
      </Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3, marginBottom: 9 }}>
        Past weekly results · saved on this device
      </Text>
      {store.enrollment && Date.now() >= store.enrollment.eventEndAtMs && (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 8 }}>
          Your last event has ended. Open Paper Trading to calculate and save its final summary.
        </Text>
      )}
      {store.history.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 8 }}>
          Completed event summaries will appear here.
        </Text>
      ) : store.history.slice(0, 12).map((event) => (
        <View
          key={event.eventId}
          style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 11 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
              {formatEventDate(event.eventStartAtMs, event.eventEndAtMs)} · {event.accountName}
            </Text>
            <Text style={{ color: event.netProfit >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
              {formatCurrency(event.netProfit)}
            </Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }}>
            {event.returnPercent >= 0 ? '+' : ''}{event.returnPercent.toFixed(2)}% · {event.buyCount ?? 0} buys / {event.sellCount ?? 0} sells · realized {formatCurrency(event.realizedPnL)}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
            Finalized {new Date(event.completedAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} using the latest available quotes
          </Text>
          {(event.symbolsTraded ?? []).length > 0 && (
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>
              Traded: {(event.symbolsTraded ?? []).join(', ')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
