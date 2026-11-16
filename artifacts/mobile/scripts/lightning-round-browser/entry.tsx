import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, TouchableOpacity, View } from 'react-native';
import { LightningRoundScreen } from '../../components/LightningRoundScreen';
import { PaperChallengeHistory } from '../../components/PaperChallengeHistory';
import { getLightningRoundWindow, LIGHTNING_ROUND_STARTING_BALANCE } from '../../lib/paperChallenge';

const window = getLightningRoundWindow(Date.now());

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    events: [{
      eventId: window.id,
      startAtMs: window.startAtMs,
      endAtMs: window.endAtMs,
      artworkId: 'lightning-round-arena',
      eventType: 'lightning-round',
      startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
      rankingDirection: 'highest-return',
    }],
  }),
}) as Response;

function SignedInHistoryFixture() {
  const [view, setView] = useState<'lightning' | 'events'>('lightning');

  return (
    <View style={{ flex: 1, height: '100%', backgroundColor: '#101010' }}>
      <View style={{ flexDirection: 'row', padding: 8, gap: 8 }}>
        <TouchableOpacity testID="fixture-open-lightning-round" onPress={() => setView('lightning')}>
          <Text style={{ color: '#fff' }}>Lightning Round</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="fixture-open-event-history" onPress={() => setView('events')}>
          <Text style={{ color: '#fff' }}>Event history</Text>
        </TouchableOpacity>
      </View>
      <Text testID="fixture-signed-in-state" style={{ color: '#aaa' }}>Signed-in device history</Text>
      {view === 'lightning'
        ? <LightningRoundScreen />
        : <PaperChallengeHistory visible onCloseSettings={() => setView('lightning')} />}
    </View>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Lightning Round test root was not found.');
createRoot(root).render(<SignedInHistoryFixture />);
