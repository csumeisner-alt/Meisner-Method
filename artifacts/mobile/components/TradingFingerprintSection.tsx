import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { TRADING_FINGERPRINT_NEUTRAL_FALLBACK } from '@/lib/eventArenaTradingFingerprintObservation';
import type { SavedTradingFingerprintObservation } from '@/lib/eventArenaTradingFingerprintObservation';

type Props = {
  eventId: string;
  observation?: SavedTradingFingerprintObservation;
};

export function TradingFingerprintSection({ eventId, observation }: Props) {
  const headline = observation?.headline ?? 'Still developing';
  const supportingSentence = observation?.supportingSentence ?? TRADING_FINGERPRINT_NEUTRAL_FALLBACK;

  return (
    <View
      testID={`trading-fingerprint-${eventId}`}
      accessibilityLabel={`Your Trading Fingerprint. ${headline}. ${supportingSentence}`}
      style={{
        marginTop: 16,
        padding: 13,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(205, 170, 91, 0.42)',
        backgroundColor: '#171A1F',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Feather name="activity" size={13} color="#D8B867" />
        <Text
          allowFontScaling
          style={{
            color: '#D8B867',
            fontFamily: 'Inter_700Bold',
            fontSize: 9,
            letterSpacing: 1.25,
          }}
        >
          YOUR TRADING FINGERPRINT
        </Text>
      </View>
      <Text
        allowFontScaling
        style={{
          color: '#F5F0E3',
          fontFamily: 'Inter_700Bold',
          fontSize: 14,
          lineHeight: 19,
          marginTop: 8,
        }}
      >
        {headline}
      </Text>
      <Text
        allowFontScaling
        style={{
          color: '#C7C1B4',
          fontFamily: 'Inter_400Regular',
          fontSize: 10,
          lineHeight: 15,
          marginTop: 4,
        }}
      >
        {supportingSentence}
      </Text>
    </View>
  );
}
