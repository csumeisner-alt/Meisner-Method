import React from 'react';
import { Text, View } from 'react-native';

export function BottomTabBar() {
  return <View testID="test-bottom-tab-bar" />;
}

export function PaperChallengeLeaderboard() {
  return <View testID="test-paper-challenge-leaderboard" />;
}

export async function submitPaperChallengeScoreNow() {
  return { ok: true };
}

export function PaperEventShareCard({ event }: { event: { eventId: string } }) {
  return <Text testID={`test-paper-event-share-card-${event.eventId}`}>{event.eventId}</Text>;
}

export function PaperChallengeMilestoneBadges() {
  return <View />;
}

export function EventArenaReminderControls() {
  return <View testID="test-event-arena-reminder-controls" />;
}

export function PortfolioLineChart() {
  return <View testID="test-portfolio-line-chart" />;
}
