export const getGetEventArenaLeaderboardQueryKey = (eventId: string) =>
  [`/api/event-arena/${eventId}/leaderboard`] as const;

type MockLeaderboardResult = {
  data: { entries: { rank: number; isCurrentUser: boolean }[] } | undefined;
  isError: boolean;
}

const testWindow = globalThis as typeof globalThis & {
  __paperLeaderboardResult?: MockLeaderboardResult;
  __setPaperLeaderboard?: (result: MockLeaderboardResult) => void;
};
testWindow.__paperLeaderboardResult = {
  data: {
    entries: [
      { rank: 1, isCurrentUser: true },
      { rank: 2, isCurrentUser: false },
    ],
  },
  isError: false,
};
testWindow.__setPaperLeaderboard = (result) => { testWindow.__paperLeaderboardResult = result; };

export function useGetEventArenaLeaderboard() {
  return testWindow.__paperLeaderboardResult!;
}
