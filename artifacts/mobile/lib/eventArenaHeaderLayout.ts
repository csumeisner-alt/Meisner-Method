export function getEventArenaHeaderColumnWidth(screenWidth: number): number {
  return Math.min(screenWidth < 360 ? 150 : 208, screenWidth * 0.44);
}
