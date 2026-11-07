export type ThemeMode = 'light' | 'dark' | 'system';
export type UiRadius = 'sharp' | 'soft' | 'rounded';
export type UiDensity = 'comfortable' | 'compact';
export type SidebarStyle = 'solid' | 'transparent' | 'glass' | 'frosted' | 'rail';
export type NavbarStyle = 'solid' | 'glass' | 'frosted' | 'float' | 'line';

export const SIDEBAR_STYLE_OPTIONS: {
  id: SidebarStyle;
  label: string;
  blurb: string;
}[] = [
  { id: 'solid', label: 'Solid', blurb: 'Opaque surface, no blur' },
  { id: 'glass', label: 'Glass', blurb: 'Soft translucent gradient' },
  { id: 'frosted', label: 'Frosted', blurb: 'Heavy blur over the page' },
  { id: 'transparent', label: 'Transparent', blurb: 'Very light wash' },
  { id: 'rail', label: 'Accent rail', blurb: 'Solid with accent edge' },
];

export const NAVBAR_STYLE_OPTIONS: {
  id: NavbarStyle;
  label: string;
  blurb: string;
}[] = [
  { id: 'solid', label: 'Solid', blurb: 'Opaque top bar' },
  { id: 'glass', label: 'Glass', blurb: 'Translucent blur bar' },
  { id: 'frosted', label: 'Frosted', blurb: 'Heavy frosted strip' },
  { id: 'float', label: 'Float', blurb: 'Inset elevated pill bar' },
  { id: 'line', label: 'Line', blurb: 'Minimal with accent rule' },
];

export function isSidebarStyle(value: unknown): value is SidebarStyle {
  return SIDEBAR_STYLE_OPTIONS.some((o) => o.id === value);
}

export function isNavbarStyle(value: unknown): value is NavbarStyle {
  return NAVBAR_STYLE_OPTIONS.some((o) => o.id === value);
}

export function normalizeSidebarStyle(value: unknown): SidebarStyle {
  return isSidebarStyle(value) ? value : 'solid';
}

export function normalizeNavbarStyle(value: unknown): NavbarStyle {
  return isNavbarStyle(value) ? value : 'glass';
}

export type SurfaceTokens = {
  bg: string;
  'bg-elevated': string;
  surface: string;
  'surface-hover': string;
  'surface-muted': string;
  border: string;
  'border-strong': string;
};

/** Spirit-Panel surface presets (Theme look). */
export const SURFACE_PRESETS = {
  midnight: {
    label: 'Midnight',
    blurb: 'Deep blue-black tones',
    accent: '#3b82f6',
    dark: {
      bg: '#050810',
      'bg-elevated': '#0a101c',
      surface: '#0f1628',
      'surface-hover': '#161f34',
      'surface-muted': '#0c1220',
      border: '#1e2a42',
      'border-strong': '#2a3854',
    },
    light: {
      bg: '#eef2fb',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#e8edf8',
      'surface-muted': '#e3e9f6',
      border: '#c8d2e8',
      'border-strong': '#aeb9d0',
    },
  },
  ocean: {
    label: 'Ocean',
    blurb: 'Cool teal undertones',
    accent: '#06b6d4',
    dark: {
      bg: '#061018',
      'bg-elevated': '#0a1820',
      surface: '#0f222c',
      'surface-hover': '#152c38',
      'surface-muted': '#0c1a22',
      border: '#1a3340',
      'border-strong': '#254656',
    },
    light: {
      bg: '#eef8fb',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#e4f4f8',
      'surface-muted': '#dff0f5',
      border: '#b8dce8',
      'border-strong': '#9ec8d8',
    },
  },
  forest: {
    label: 'Forest',
    blurb: 'Muted green warmth',
    accent: '#22c55e',
    dark: {
      bg: '#060f0a',
      'bg-elevated': '#0a1610',
      surface: '#101f16',
      'surface-hover': '#162a1e',
      'surface-muted': '#0c1812',
      border: '#1a3324',
      'border-strong': '#254632',
    },
    light: {
      bg: '#eef8f2',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#e4f4ea',
      'surface-muted': '#dff0e6',
      border: '#b8dcc8',
      'border-strong': '#9ec8ae',
    },
  },
  sunset: {
    label: 'Sunset',
    blurb: 'Warm amber glow',
    accent: '#f97316',
    dark: {
      bg: '#100a08',
      'bg-elevated': '#18100c',
      surface: '#221610',
      'surface-hover': '#2e1e16',
      'surface-muted': '#1a120e',
      border: '#3d2a20',
      'border-strong': '#52382a',
    },
    light: {
      bg: '#fbf4ee',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f8ece2',
      'surface-muted': '#f5e8dc',
      border: '#e8cfc0',
      'border-strong': '#d8b8a4',
    },
  },
  rose: {
    label: 'Rose',
    blurb: 'Soft magenta tint',
    accent: '#ec4899',
    dark: {
      bg: '#100810',
      'bg-elevated': '#180c18',
      surface: '#221422',
      'surface-hover': '#2e1c2e',
      'surface-muted': '#1a101a',
      border: '#3d2838',
      'border-strong': '#52344a',
    },
    light: {
      bg: '#fbf0f6',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f8e6f0',
      'surface-muted': '#f5e0ec',
      border: '#e8c0d4',
      'border-strong': '#d8a4be',
    },
  },
  mono: {
    label: 'Mono',
    blurb: 'Neutral grayscale focus',
    accent: '#a3a3a3',
    dark: {
      bg: '#0a0a0a',
      'bg-elevated': '#111111',
      surface: '#181818',
      'surface-hover': '#222222',
      'surface-muted': '#141414',
      border: '#2e2e2e',
      'border-strong': '#3d3d3d',
    },
    light: {
      bg: '#f4f4f4',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#ececec',
      'surface-muted': '#e8e8e8',
      border: '#d4d4d4',
      'border-strong': '#bdbdbd',
    },
  },
  lavender: {
    label: 'Lavender',
    blurb: 'Soft purple haze',
    accent: '#a78bfa',
    dark: {
      bg: '#0c0a14',
      'bg-elevated': '#12101c',
      surface: '#1a1628',
      'surface-hover': '#241e36',
      'surface-muted': '#141020',
      border: '#322a48',
      'border-strong': '#443660',
    },
    light: {
      bg: '#f5f2fc',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#ede8fa',
      'surface-muted': '#e8e2f8',
      border: '#cfc0ec',
      'border-strong': '#b8a4dc',
    },
  },
  crimson: {
    label: 'Crimson',
    blurb: 'Bold red depth',
    accent: '#ef4444',
    dark: {
      bg: '#100808',
      'bg-elevated': '#180c0c',
      surface: '#221010',
      'surface-hover': '#2e1616',
      'surface-muted': '#1a0c0c',
      border: '#402020',
      'border-strong': '#562a2a',
    },
    light: {
      bg: '#fbf2f2',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f8e8e8',
      'surface-muted': '#f5e0e0',
      border: '#e8c0c0',
      'border-strong': '#d8a0a0',
    },
  },
  arctic: {
    label: 'Arctic',
    blurb: 'Icy blue-white frost',
    accent: '#38bdf8',
    dark: {
      bg: '#080c12',
      'bg-elevated': '#0c121a',
      surface: '#101a24',
      'surface-hover': '#162230',
      'surface-muted': '#0c161e',
      border: '#1e3040',
      'border-strong': '#284056',
    },
    light: {
      bg: '#f0f8ff',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#e6f2fc',
      'surface-muted': '#dceef8',
      border: '#b8d4ec',
      'border-strong': '#9ec0dc',
    },
  },
  neon: {
    label: 'Neon',
    blurb: 'Electric cyber violet',
    accent: '#d946ef',
    dark: {
      bg: '#0a0612',
      'bg-elevated': '#100a1a',
      surface: '#160e24',
      'surface-hover': '#1e1430',
      'surface-muted': '#12081c',
      border: '#2a1844',
      'border-strong': '#3a2058',
    },
    light: {
      bg: '#faf5ff',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f3e8ff',
      'surface-muted': '#ede0fc',
      border: '#d8b8f0',
      'border-strong': '#c098e0',
    },
  },
  copper: {
    label: 'Copper',
    blurb: 'Warm bronze metallic',
    accent: '#d97706',
    dark: {
      bg: '#0e0a06',
      'bg-elevated': '#161008',
      surface: '#201810',
      'surface-hover': '#2a2018',
      'surface-muted': '#18120c',
      border: '#3a2e20',
      'border-strong': '#4e3e2a',
    },
    light: {
      bg: '#faf6f0',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f5ece0',
      'surface-muted': '#f0e6d8',
      border: '#dcc8b0',
      'border-strong': '#c8b094',
    },
  },
  slate: {
    label: 'Slate',
    blurb: 'Cool stone gray',
    accent: '#64748b',
    dark: {
      bg: '#0c0e12',
      'bg-elevated': '#12151a',
      surface: '#181c24',
      'surface-hover': '#202630',
      'surface-muted': '#141820',
      border: '#2a303c',
      'border-strong': '#384050',
    },
    light: {
      bg: '#f1f5f9',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#e8edf4',
      'surface-muted': '#e2e8f0',
      border: '#cbd5e1',
      'border-strong': '#b0bec8',
    },
  },
  grape: {
    label: 'Grape',
    blurb: 'Rich plum depth',
    accent: '#9333ea',
    dark: {
      bg: '#0c0810',
      'bg-elevated': '#140c18',
      surface: '#1c1024',
      'surface-hover': '#261630',
      'surface-muted': '#140a1a',
      border: '#362048',
      'border-strong': '#482a60',
    },
    light: {
      bg: '#f8f2fc',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f0e6fa',
      'surface-muted': '#eadef8',
      border: '#d0b8e8',
      'border-strong': '#b89cd8',
    },
  },
  mint: {
    label: 'Mint',
    blurb: 'Fresh aqua green',
    accent: '#2dd4bf',
    dark: {
      bg: '#061210',
      'bg-elevated': '#0a1a16',
      surface: '#0e221e',
      'surface-hover': '#142e28',
      'surface-muted': '#081814',
      border: '#1a3832',
      'border-strong': '#244a42',
    },
    light: {
      bg: '#f0fdfa',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#e4faf6',
      'surface-muted': '#d8f5f0',
      border: '#a8e8dc',
      'border-strong': '#88d8c8',
    },
  },
  sand: {
    label: 'Sand',
    blurb: 'Desert tan warmth',
    accent: '#ca8a04',
    dark: {
      bg: '#100e08',
      'bg-elevated': '#18140c',
      surface: '#221c12',
      'surface-hover': '#2e2618',
      'surface-muted': '#1a160e',
      border: '#3a3220',
      'border-strong': '#4e442c',
    },
    light: {
      bg: '#faf8f2',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f5f0e4',
      'surface-muted': '#f0eadc',
      border: '#dcd0b8',
      'border-strong': '#c8b89c',
    },
  },
  void: {
    label: 'Void',
    blurb: 'Pure deep black',
    accent: '#6366f1',
    dark: {
      bg: '#030304',
      'bg-elevated': '#08080a',
      surface: '#0e0e12',
      'surface-hover': '#16161c',
      'surface-muted': '#060608',
      border: '#1c1c24',
      'border-strong': '#282830',
    },
    light: {
      bg: '#fafafa',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#f0f0f0',
      'surface-muted': '#ececec',
      border: '#d8d8d8',
      'border-strong': '#c0c0c0',
    },
  },
  cherry: {
    label: 'Cherry',
    blurb: 'Deep ruby red',
    accent: '#e11d48',
    dark: {
      bg: '#0e0608',
      'bg-elevated': '#160a0e',
      surface: '#200e14',
      'surface-hover': '#2a141c',
      'surface-muted': '#18080c',
      border: '#3a1824',
      'border-strong': '#4e2030',
    },
    light: {
      bg: '#fdf2f4',
      'bg-elevated': '#ffffff',
      surface: '#ffffff',
      'surface-hover': '#fce8ec',
      'surface-muted': '#fae0e6',
      border: '#e8b8c4',
      'border-strong': '#d898a8',
    },
  },
} as const;

export type NamedThemePreset = keyof typeof SURFACE_PRESETS;
export type ThemePreset = NamedThemePreset | 'custom';

/** @deprecated use SURFACE_PRESETS — kept for older imports */
export const THEME_PRESETS = SURFACE_PRESETS;

export const THEME_PRESET_IDS: ThemePreset[] = [
  ...(Object.keys(SURFACE_PRESETS) as NamedThemePreset[]),
  'custom',
];

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === 'string' && (THEME_PRESET_IDS as string[]).includes(value);
}

/** Spirit-Panel curated accent pairs (Colors). */
export const ACCENT_PAIRS = [
  { id: 'spirit', label: 'Spirit', blurb: 'Indigo into violet', primary: '#6366f1', secondary: '#8b5cf6' },
  { id: 'ocean', label: 'Ocean breeze', blurb: 'Cyan into blue', primary: '#06b6d4', secondary: '#3b82f6' },
  { id: 'sunset', label: 'Sunset blaze', blurb: 'Orange into red', primary: '#f97316', secondary: '#ef4444' },
  { id: 'forest', label: 'Forest glow', blurb: 'Green into teal', primary: '#22c55e', secondary: '#14b8a6' },
  { id: 'rose', label: 'Rose gold', blurb: 'Pink into rose', primary: '#ec4899', secondary: '#f43f5e' },
  { id: 'lavender', label: 'Lavender dream', blurb: 'Soft violet pair', primary: '#a78bfa', secondary: '#c084fc' },
  { id: 'neon', label: 'Neon pulse', blurb: 'Magenta into violet', primary: '#d946ef', secondary: '#8b5cf6' },
  { id: 'arctic', label: 'Arctic frost', blurb: 'Sky into indigo', primary: '#38bdf8', secondary: '#6366f1' },
  { id: 'copper', label: 'Copper heat', blurb: 'Amber into orange', primary: '#d97706', secondary: '#ea580c' },
  { id: 'mint', label: 'Mint fresh', blurb: 'Teal into cyan', primary: '#2dd4bf', secondary: '#06b6d4' },
  { id: 'grape', label: 'Royal grape', blurb: 'Purple into indigo', primary: '#9333ea', secondary: '#6366f1' },
  { id: 'crimson', label: 'Crimson fire', blurb: 'Red into orange', primary: '#ef4444', secondary: '#f97316' },
  { id: 'gold', label: 'Golden hour', blurb: 'Gold into orange', primary: '#eab308', secondary: '#f97316' },
  { id: 'slate', label: 'Slate pro', blurb: 'Cool gray pair', primary: '#64748b', secondary: '#475569' },
  { id: 'cherry', label: 'Cherry pop', blurb: 'Ruby into pink', primary: '#e11d48', secondary: '#ec4899' },
  { id: 'emerald', label: 'Emerald city', blurb: 'Emerald depth', primary: '#10b981', secondary: '#059669' },
] as const;

export type AccentPairId = (typeof ACCENT_PAIRS)[number]['id'];

export const THEME_MODE_OPTIONS: {
  id: ThemeMode;
  label: string;
  blurb: string;
}[] = [
  { id: 'light', label: 'Light', blurb: 'Bright surfaces, soft borders' },
  { id: 'dark', label: 'Dark', blurb: 'Deep shell, luminous accents' },
  { id: 'system', label: 'System', blurb: 'Follow the OS preference' },
];

export const RADIUS_TOKENS: Record<UiRadius, Record<string, string>> = {
  sharp: {
    '--radius-sm': '0.25rem',
    '--radius-md': '0.35rem',
    '--radius-lg': '0.45rem',
    '--radius-xl': '0.55rem',
    '--radius-2xl': '0.7rem',
    '--radius': '0.35rem',
  },
  soft: {
    '--radius-sm': '0.5rem',
    '--radius-md': '0.75rem',
    '--radius-lg': '1rem',
    '--radius-xl': '1.25rem',
    '--radius-2xl': '1.5rem',
    '--radius': '0.75rem',
  },
  rounded: {
    '--radius-sm': '0.7rem',
    '--radius-md': '1rem',
    '--radius-lg': '1.35rem',
    '--radius-xl': '1.65rem',
    '--radius-2xl': '2rem',
    '--radius': '1rem',
  },
};

export const DENSITY_TOKENS: Record<UiDensity, Record<string, string>> = {
  comfortable: {
    '--density-pad': '1rem',
    '--density-gap': '0.85rem',
    '--density-control': '2.6rem',
    '--density-nav': '2.35rem',
  },
  compact: {
    '--density-pad': '0.65rem',
    '--density-gap': '0.5rem',
    '--density-control': '2.15rem',
    '--density-nav': '2rem',
  },
};

export const SIDEBAR_SURFACES: Record<SidebarStyle, string> = {
  solid: 'color-mix(in srgb, var(--surface) 96%, transparent)',
  transparent: 'color-mix(in srgb, var(--surface) 35%, transparent)',
  glass:
    'linear-gradient(180deg, color-mix(in srgb, var(--surface) 72%, transparent), color-mix(in srgb, var(--bg) 55%, transparent))',
  frosted: 'color-mix(in srgb, var(--surface) 78%, transparent)',
  rail: 'color-mix(in srgb, var(--surface) 94%, transparent)',
};

export const SURFACE_TOKEN_KEYS = [
  'bg',
  'bg-elevated',
  'surface',
  'surface-hover',
  'surface-muted',
  'border',
  'border-strong',
] as const;

export function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function applySurfacePreset(preset: ThemePreset, mode: 'light' | 'dark') {
  const root = document.documentElement;
  if (preset === 'custom' || !(preset in SURFACE_PRESETS)) {
    for (const key of SURFACE_TOKEN_KEYS) {
      root.style.removeProperty(`--${key}`);
    }
    root.style.removeProperty('--body-wash-top');
    root.style.removeProperty('--body-wash-bottom');
    return;
  }
  const tokens = SURFACE_PRESETS[preset][mode];
  for (const key of SURFACE_TOKEN_KEYS) {
    root.style.setProperty(`--${key}`, tokens[key]);
  }
  root.style.setProperty('--body-wash-top', tokens['bg-elevated']);
  root.style.setProperty('--body-wash-bottom', tokens.bg);
}

/** Optional accent fill when picking a surface (can be overridden in Colors). */
export function accentsForSurface(preset: NamedThemePreset): { accent: string; secondary: string } {
  const accent = SURFACE_PRESETS[preset].accent;
  const pair = ACCENT_PAIRS.find((p) => p.primary.toLowerCase() === accent.toLowerCase());
  return { accent, secondary: pair?.secondary ?? accent };
}

export function matchAccentPair(accent: string, secondary: string): AccentPairId | 'custom' {
  const a = accent.trim().toLowerCase();
  const s = secondary.trim().toLowerCase();
  const hit = ACCENT_PAIRS.find(
    (p) => p.primary.toLowerCase() === a && p.secondary.toLowerCase() === s,
  );
  return hit?.id ?? 'custom';
}

/** @deprecated surface presets no longer drive accent resolution */
export function colorsForPreset(
  _preset: ThemePreset,
  accent: string,
  secondary: string,
): { accent: string; secondary: string } {
  return { accent, secondary };
}

/** @deprecated use matchAccentPair */
export function matchThemePreset(accent: string, secondary: string): ThemePreset {
  return matchAccentPair(accent, secondary) === 'custom' ? 'custom' : 'custom';
}

export function presetWash(accent: string, secondary: string): string {
  return [
    `radial-gradient(120% 100% at 8% 0%, ${accent}cc 0%, transparent 52%)`,
    `radial-gradient(100% 90% at 100% 100%, ${secondary}b3 0%, transparent 48%)`,
    `linear-gradient(155deg, ${accent} 0%, color-mix(in srgb, ${accent} 42%, ${secondary}) 46%, ${secondary} 100%)`,
  ].join(', ');
}

export function surfaceWash(preset: NamedThemePreset, mode: 'light' | 'dark' = 'dark'): string {
  const p = SURFACE_PRESETS[preset];
  const tokens = p[mode];
  return `linear-gradient(145deg, ${tokens.bg} 0%, ${tokens.surface} 48%, ${p.accent} 100%)`;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(clean.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
