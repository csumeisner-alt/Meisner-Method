const SEAL_MAX_SIZE = 304;
const SEAL_MIN_SIZE = 96;
const SEAL_WIDTH_RATIO = 0.78;
const COPY_HEIGHT_BUDGET = 140;
const BUTTON_HEIGHT_AND_GAP = 72;
const VERTICAL_PADDING = 18;
const RING_BOTTOM_GAP = 22;
const CONTENT_CLEARANCE = 24;

export function getAchievementSealLayout(
  width: number,
  height: number,
  topInset: number,
  bottomInset: number,
  fontScale = 1,
) {
  const textScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const verticalPadding = Math.max(8, VERTICAL_PADDING / textScale);
  const ringBottomGap = Math.max(12, RING_BOTTOM_GAP / textScale);
  const contentClearance = Math.max(12, CONTENT_CLEARANCE / textScale);
  const copyHeightBudget = COPY_HEIGHT_BUDGET * textScale;
  const buttonHeightAndGap = BUTTON_HEIGHT_AND_GAP + Math.min(32, (textScale - 1) * 22);
  const ringHeightBudget = height
    - topInset
    - bottomInset
    - verticalPadding * 2
    - ringBottomGap
    - copyHeightBudget
    - buttonHeightAndGap
    - contentClearance;
  const ringSize = Math.max(
    SEAL_MIN_SIZE,
    Math.min(width * SEAL_WIDTH_RATIO, SEAL_MAX_SIZE, ringHeightBudget),
  );

  return {
    ringSize,
    buttonWidth: Math.min(Math.max(width - 44, 0), 360),
    copyWidth: Math.min(Math.max(width - 44, 0), 360),
    verticalPadding,
    ringBottomGap,
    contentClearance,
    copyHeightBudget,
    buttonHeightAndGap,
    contentHeight: topInset
      + bottomInset
      + verticalPadding * 2
      + ringSize
      + ringBottomGap
      + copyHeightBudget
      + buttonHeightAndGap,
  };
}
