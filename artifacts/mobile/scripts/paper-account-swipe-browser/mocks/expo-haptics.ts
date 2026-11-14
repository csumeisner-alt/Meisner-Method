export const ImpactFeedbackStyle = { Light: 'light' };

export async function impactAsync() {
  const testWindow = globalThis as typeof globalThis & { __paperHapticCount?: number };
  testWindow.__paperHapticCount = (testWindow.__paperHapticCount ?? 0) + 1;
}
