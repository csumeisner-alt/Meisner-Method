const colors = {
  light: {
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
    border: '#2a2a2a',
    input: '#1a1a1a',
    // Finance-specific
    buyColor: '#00e5a0',
    sellColor: '#ff3b3b',
    holdColor: '#c0c0c0',
    buyBg: '#001a12',
    sellBg: '#1a0000',
    holdBg: '#141414',
  },
  dark: {
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
    border: '#2a2a2a',
    input: '#1a1a1a',
    // Finance-specific
    buyColor: '#00e5a0',
    sellColor: '#ff3b3b',
    holdColor: '#c0c0c0',
    buyBg: '#001a12',
    sellBg: '#1a0000',
    holdBg: '#141414',
  },
  radius: 16,
} as const;

export type ColorScheme = typeof colors.light & {
  buyColor: string;
  sellColor: string;
  holdColor: string;
  buyBg: string;
  sellBg: string;
  holdBg: string;
};

export default colors;
