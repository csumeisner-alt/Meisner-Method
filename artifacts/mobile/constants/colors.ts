const colors = {
  light: {
    text: '#0d1b2a',
    tint: '#1a6bff',
    background: '#f2f5ff',
    foreground: '#0d1b2a',
    card: '#ffffff',
    cardForeground: '#0d1b2a',
    primary: '#1a6bff',
    primaryForeground: '#ffffff',
    secondary: '#e8edf8',
    secondaryForeground: '#0d1b2a',
    muted: '#eef1fb',
    mutedForeground: '#5a6a85',
    accent: '#eef1fb',
    accentForeground: '#0d1b2a',
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',
    border: '#d0d9ec',
    input: '#d0d9ec',
    // Finance-specific
    buyColor: '#00b386',
    sellColor: '#e53e3e',
    holdColor: '#d97706',
    buyBg: '#e6fff8',
    sellBg: '#fff0f0',
    holdBg: '#fff8e6',
  },
  dark: {
    text: '#e2eaf8',
    tint: '#5ba3ff',
    background: '#060d1a',
    foreground: '#e2eaf8',
    card: '#0c1829',
    cardForeground: '#e2eaf8',
    primary: '#5ba3ff',
    primaryForeground: '#060d1a',
    secondary: '#0e1e36',
    secondaryForeground: '#e2eaf8',
    muted: '#0e1e36',
    mutedForeground: '#7a96b8',
    accent: '#0e1e36',
    accentForeground: '#e2eaf8',
    destructive: '#f05252',
    destructiveForeground: '#ffffff',
    border: '#152540',
    input: '#152540',
    // Finance-specific
    buyColor: '#00d4aa',
    sellColor: '#ff5252',
    holdColor: '#f5a623',
    buyBg: '#00201a',
    sellBg: '#200808',
    holdBg: '#201400',
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
