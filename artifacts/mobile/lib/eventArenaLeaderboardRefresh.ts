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

export function getSelectedLeaderboardEntryForEvent<T>(
  eventId: string,
  selection: { eventId: string; entry: T } | null,
): T | null {
  return selection?.eventId === eventId ? selection.entry : null;
}

export function resolveSelectedLeaderboardEntry<T extends { participantToken: string }>(
  entries: readonly T[],
  selectedEntry: T | null,
): T | null {
  return selectedEntry
    ? entries.find((entry) => entry.participantToken === selectedEntry.participantToken) ?? selectedEntry
    : null;
}

export function isSelectedLeaderboardEntryMissing<T extends { participantToken: string }>(
  entries: readonly T[],
  selectedEntry: T | null,
  hasFreshResponse: boolean,
): boolean {
  return Boolean(
    selectedEntry
    && hasFreshResponse
    && !entries.some((entry) => entry.participantToken === selectedEntry.participantToken),
  );
}
