import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, TouchableOpacity, View } from 'react-native';
import { PaperEventLiveNotice } from '../../components/PaperEventLiveNotice';

function EventNoticeFixture() {
  const [accountId, setAccountId] = useState('paper-event:account-a');
  const [eventId, setEventId] = useState('2026-11-16');
  const now = Date.now();
  const enrollment = {
    accountId,
    eventId,
    eventType: eventId === '2026-11-16' ? 'one-stock-challenge' as const : 'event-arena' as const,
    accountName: eventId === '2026-11-16' ? 'One-Stock Challenge' : 'Event Arena',
    startingBalance: 100_000,
    startEquity: 100_000,
    eventStartAtMs: now - 60_000,
    eventEndAtMs: now + 60_000,
    joinedAtMs: now - 60_000,
  };

  return (
    <View style={{ flex: 1, minHeight: '100%', backgroundColor: '#101010' }}>
      <Text testID="paper-event-notice-fixture-ready" style={{ color: '#fff' }}>
        {accountId} · {eventId}
      </Text>
      <View style={{ flexDirection: 'row', padding: 8, gap: 8 }}>
        <TouchableOpacity testID="select-account-a" onPress={() => setAccountId('paper-event:account-a')}>
          <Text style={{ color: '#fff' }}>Account A</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="select-account-b" onPress={() => setAccountId('paper-event:account-b')}>
          <Text style={{ color: '#fff' }}>Account B</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="select-event-1" onPress={() => setEventId('2026-11-16')}>
          <Text style={{ color: '#fff' }}>Event 1</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="select-event-2" onPress={() => setEventId('2026-11-23')}>
          <Text style={{ color: '#fff' }}>Event 2</Text>
        </TouchableOpacity>
      </View>
      <PaperEventLiveNotice
        enrollment={enrollment}
        hasCurrentEventEnrollment={false}
        isEventAccountActive
        lightningEntryFailure=""
        onSwitchToPaperEventAccount={() => {}}
      />
    </View>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Paper Event Arena notice test root was not found.');
createRoot(root).render(<EventNoticeFixture />);
