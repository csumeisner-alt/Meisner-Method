export const router = {
  back() {
    document.documentElement.dataset.lightningBackCount = String(
      Number(document.documentElement.dataset.lightningBackCount ?? 0) + 1,
    );
  },
  push() {},
  replace() {},
};

export function useLocalSearchParams() {
  return { tab: 'past' };
}
