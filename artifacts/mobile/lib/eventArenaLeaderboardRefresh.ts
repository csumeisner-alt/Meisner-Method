export function canRefreshEventArenaLeaderboard({
  visible,
  appIsActive,
  installationIdReady,
}: {
  visible: boolean;
  appIsActive: boolean;
  installationIdReady: boolean;
}): boolean {
  return visible && appIsActive && installationIdReady;
}

export function resolveSelectedLeaderboardEntry<T extends { participantToken: string }>(
  entries: readonly T[],
  selectedEntry: T | null,
): T | null {
  return selectedEntry
    ? entries.find((entry) => entry.participantToken === selectedEntry.participantToken) ?? selectedEntry
    : null;
}
