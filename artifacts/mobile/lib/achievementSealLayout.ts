const SEAL_MAX_SIZE = 304;
const SEAL_MIN_SIZE = 144;
const SEAL_WIDTH_RATIO = 0.78;
const VERTICAL_PADDING = 18;
const RING_BOTTOM_GAP = 22;
const COPY_HEIGHT_BUDGET = 140;
const BUTTON_HEIGHT_AND_GAP = 72;
const CONTENT_CLEARANCE = 24;

export function getAchievementSealLayout(
  width: number,
  height: number,
  topInset: number,
  bottomInset: number,
) {
  const ringHeightBudget = height
    - topInset
    - bottomInset
    - VERTICAL_PADDING * 2
    - RING_BOTTOM_GAP
    - COPY_HEIGHT_BUDGET
    - BUTTON_HEIGHT_AND_GAP
    - CONTENT_CLEARANCE;
  const ringSize = Math.max(
    SEAL_MIN_SIZE,
    Math.min(width * SEAL_WIDTH_RATIO, SEAL_MAX_SIZE, ringHeightBudget),
  );

  return {
    ringSize,
    buttonWidth: Math.min(Math.max(width - 44, 0), 360),
    copyWidth: Math.min(Math.max(width - 44, 0), 360),
    contentHeight: topInset
      + bottomInset
      + VERTICAL_PADDING * 2
      + ringSize
      + RING_BOTTOM_GAP
      + COPY_HEIGHT_BUDGET
      + BUTTON_HEIGHT_AND_GAP,
  };
}
