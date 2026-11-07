/** Login / register atmospheres — variants of the auth stage (wash, grid, skyline). */
export const AUTH_ATMOSPHERE_OPTIONS = [
  { id: 'stage', label: 'Stage', blurb: 'Datacenter skyline with grid and beam' },
  { id: 'blueprint', label: 'Blueprint', blurb: 'Technical grid plan, quiet towers' },
  { id: 'beacon', label: 'Beacon', blurb: 'Bright accent scanline over the racks' },
  { id: 'ember', label: 'Ember', blurb: 'Warm accent blooms and lit towers' },
  { id: 'halo', label: 'Halo', blurb: 'Soft overhead glow, quiet floor' },
  { id: 'night', label: 'Night', blurb: 'Deep void with signal stars' },
  { id: 'skyline', label: 'Skyline', blurb: 'Tall racks in atmospheric haze' },
  { id: 'plain', label: 'Plain', blurb: 'Clean wash with soft vignette' },
] as const;

/** Client / admin chrome layout. */
export const NAV_LAYOUT_OPTIONS = [
  { id: 'sidebar', label: 'Sidebar', blurb: 'Left rail with sections' },
  { id: 'navbar', label: 'Navbar', blurb: 'Top bar with horizontal links' },
] as const;

export type NavLayout = (typeof NAV_LAYOUT_OPTIONS)[number]['id'];

export function isNavLayout(value: unknown): value is NavLayout {
  return value === 'sidebar' || value === 'navbar';
}

export function normalizeNavLayout(value: unknown): NavLayout {
  return isNavLayout(value) ? value : 'sidebar';
}

/** Shared shell backgrounds for client area and admin. */
export const SHELL_ATMOSPHERE_OPTIONS = [
  { id: 'gradient', label: 'Gradient glow', blurb: 'Accent radials (default)' },
  { id: 'aurora', label: 'Aurora', blurb: 'Soft shifting color bands' },
  { id: 'waves', label: 'Waves', blurb: 'Gentle flowing motion' },
  { id: 'orbs', label: 'Orbs', blurb: 'Slow ambient glow drift' },
  { id: 'stars', label: 'Stars', blurb: 'Subtle star particles' },
  { id: 'mesh', label: 'Mesh', blurb: 'Blurred color mesh' },
  { id: 'shimmer', label: 'Shimmer', blurb: 'Diagonal light sweep' },
  { id: 'bokeh', label: 'Bokeh', blurb: 'Soft defocused light pools' },
  { id: 'prism', label: 'Prism', blurb: 'Diagonal spectral bands' },
  { id: 'grid', label: 'Grid', blurb: 'Faint geometric pattern' },
  { id: 'subtle', label: 'Subtle', blurb: 'Very light accent wash' },
  { id: 'none', label: 'None', blurb: 'Solid background only' },
] as const;

export type AuthAtmosphere = (typeof AUTH_ATMOSPHERE_OPTIONS)[number]['id'];
export type ShellAtmosphere = (typeof SHELL_ATMOSPHERE_OPTIONS)[number]['id'];

/** @deprecated Use ShellAtmosphere */
export type PanelAtmosphere = ShellAtmosphere;

/** Map legacy Spirit-Panel login ids + older billing defaults onto the new set. */
const AUTH_ATMOSPHERE_ALIASES: Record<string, AuthAtmosphere> = {
  gradient: 'stage',
  orbs: 'halo',
  mesh: 'ember',
  aurora: 'halo',
  waves: 'ember',
  stars: 'night',
  beams: 'beacon',
  ripple: 'beacon',
  prism: 'blueprint',
  spotlight: 'beacon',
  grid: 'blueprint',
  minimal: 'plain',
};

export function isAuthAtmosphere(value: unknown): value is AuthAtmosphere {
  return typeof value === 'string' && AUTH_ATMOSPHERE_OPTIONS.some((o) => o.id === value);
}

export function normalizeAuthAtmosphere(value: unknown): AuthAtmosphere {
  if (isAuthAtmosphere(value)) return value;
  if (typeof value === 'string' && value in AUTH_ATMOSPHERE_ALIASES) {
    return AUTH_ATMOSPHERE_ALIASES[value]!;
  }
  return 'stage';
}

export function isShellAtmosphere(value: unknown): value is ShellAtmosphere {
  return typeof value === 'string' && SHELL_ATMOSPHERE_OPTIONS.some((o) => o.id === value);
}

export function normalizeShellAtmosphere(value: unknown, fallback: ShellAtmosphere = 'gradient'): ShellAtmosphere {
  return isShellAtmosphere(value) ? value : fallback;
}

/** @deprecated Use isShellAtmosphere */
export const isPanelAtmosphere = isShellAtmosphere;
