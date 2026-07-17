const defaultPalette = {
  text: '#e8e8e8',
  tint: '#c0c0c0',
  background: '#000000',
  foreground: '#e8e8e8',
  card: '#0f0f0f',
  cardForeground: '#e8e8e8',
  primary: '#c0c0c0',
  primaryForeground: '#000000',
  secondary: '#1a1a1a',
  secondaryForeground: '#e8e8e8',
  muted: '#141414',
  mutedForeground: '#888888',
  accent: '#2a2a2a',
  accentForeground: '#e8e8e8',
  destructive: '#ff3b3b',
  destructiveForeground: '#000000',
  border: '#484848',
  input: '#1a1a1a',
  // Finance-specific
  buyColor: '#00e5a0',
  sellColor: '#ff3b3b',
  holdColor: '#c0c0c0',
  buyBg: '#001a12',
  sellBg: '#1a0000',
  holdBg: '#141414',
};

const americanPalette = {
  text: '#FFFFFF',
  tint: '#B22234',
  background: '#0A0A2E',
  foreground: '#FFFFFF',
  card: '#1B1B4B',
  cardForeground: '#FFFFFF',
  primary: '#B22234',
  primaryForeground: '#FFFFFF',
  secondary: '#13134A',
  secondaryForeground: '#FFFFFF',
  muted: '#12123A',
  mutedForeground: '#9999CC',
  accent: '#3C3B6E',
  accentForeground: '#FFFFFF',
  destructive: '#FF3B3B',
  destructiveForeground: '#FFFFFF',
  border: '#3C3B6E',
  input: '#13134A',
  // Finance-specific (patriotic remix)
  buyColor: '#00E5A0',
  sellColor: '#FF3B3B',
  holdColor: '#B22234',
  buyBg: '#001A12',
  sellBg: '#2A0000',
  holdBg: '#12123A',
};

const colors = {
  light: defaultPalette,
  dark: defaultPalette,
  american: americanPalette,
  radius: 16,
};

export type ColorScheme = typeof defaultPalette;

export default colors;
