export const SETTINGS_PANEL_MAX_WIDTH = 360;
export const SETTINGS_PANEL_WIDTH_RATIO = 0.88;
export const SETTINGS_BOTTOM_NAV_HEIGHT = 66;
export const SETTINGS_BOTTOM_NAV_GAP = 20;
export const SETTINGS_WEB_BOTTOM_INSET = 34;

export function getSettingsPanelWidth(windowWidth: number) {
  return Math.min(SETTINGS_PANEL_MAX_WIDTH, windowWidth * SETTINGS_PANEL_WIDTH_RATIO);
}

export function getSettingsScrollBottomPadding(bottomInset: number, isWeb: boolean) {
  const safeAreaInset = isWeb ? SETTINGS_WEB_BOTTOM_INSET : bottomInset;
  return SETTINGS_BOTTOM_NAV_HEIGHT + safeAreaInset + SETTINGS_BOTTOM_NAV_GAP;
}
