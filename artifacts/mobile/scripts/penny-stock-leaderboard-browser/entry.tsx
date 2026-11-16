import React from 'react';
import { createRoot } from 'react-dom/client';
import { PaperChallengeLeaderboard } from '../../components/PaperChallengeLeaderboard';

const now = Date.now();
const event = {
  id: 'fixture-penny-stock-mayhem',
  startAtMs: now - 60 * 60 * 1000,
  endAtMs: now + 12 * 60 * 60 * 1000,
  phase: 'active' as const,
  artworkId: 'penny-stock-mayhem' as const,
  eventType: 'penny-stock-mayhem' as const,
  startingBalance: 100_000,
  rankingDirection: 'highest-return' as const,
  purchaseLimit: 20,
};

createRoot(document.getElementById('root')!).render(
  <PaperChallengeLeaderboard
    event={event}
    enrollment={null}
    onEnrollmentChange={() => {}}
    embedded
  />,
);
