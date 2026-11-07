const AUTH_ATMOSPHERES = [
  'stage',
  'blueprint',
  'beacon',
  'ember',
  'halo',
  'night',
  'skyline',
  'plain',
] as const;

export type AuthAtmosphere = (typeof AUTH_ATMOSPHERES)[number];

const AUTH_ALIASES: Record<string, AuthAtmosphere> = {
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

export const AUTH_ATMOSPHERE_ENUM = AUTH_ATMOSPHERES;

export function normalizeAuthAtmosphereSetting(value: unknown): AuthAtmosphere {
  if (typeof value === 'string' && (AUTH_ATMOSPHERES as readonly string[]).includes(value)) {
    return value as AuthAtmosphere;
  }
  if (typeof value === 'string' && value in AUTH_ALIASES) {
    return AUTH_ALIASES[value]!;
  }
  return 'stage';
}

const SHELL_ATMOSPHERES = [
  'gradient',
  'aurora',
  'waves',
  'orbs',
  'stars',
  'mesh',
  'shimmer',
  'bokeh',
  'prism',
  'grid',
  'subtle',
  'none',
] as const;

export type ShellAtmosphere = (typeof SHELL_ATMOSPHERES)[number];

export const SHELL_ATMOSPHERE_ENUM = SHELL_ATMOSPHERES;

export function normalizeShellAtmosphereSetting(
  value: unknown,
  fallback: ShellAtmosphere = 'gradient',
): ShellAtmosphere {
  if (typeof value === 'string' && (SHELL_ATMOSPHERES as readonly string[]).includes(value)) {
    return value as ShellAtmosphere;
  }
  return fallback;
}

/** Resolve client/admin shell bg, falling back to legacy `panel_atmosphere`. */
export async function resolveShellAtmosphereSetting(
  getSetting: (key: string, fallback?: string) => Promise<string>,
  key: 'client_atmosphere' | 'admin_atmosphere',
): Promise<ShellAtmosphere> {
  const raw = await getSetting(key, '');
  if (raw) return normalizeShellAtmosphereSetting(raw);
  const legacy = await getSetting('panel_atmosphere', 'gradient');
  return normalizeShellAtmosphereSetting(legacy);
}

export const NAV_LAYOUT_ENUM = ['sidebar', 'navbar'] as const;
export type NavLayout = (typeof NAV_LAYOUT_ENUM)[number];

export function normalizeNavLayoutSetting(value: unknown): NavLayout {
  return value === 'navbar' ? 'navbar' : 'sidebar';
}

export const SIDEBAR_STYLE_ENUM = ['solid', 'transparent', 'glass', 'frosted', 'rail'] as const;
export type SidebarStyleSetting = (typeof SIDEBAR_STYLE_ENUM)[number];

export const NAVBAR_STYLE_ENUM = ['solid', 'glass', 'frosted', 'float', 'line'] as const;
export type NavbarStyleSetting = (typeof NAVBAR_STYLE_ENUM)[number];

export function normalizeSidebarStyleSetting(value: unknown): SidebarStyleSetting {
  return (SIDEBAR_STYLE_ENUM as readonly string[]).includes(value as string)
    ? (value as SidebarStyleSetting)
    : 'solid';
}

export function normalizeNavbarStyleSetting(value: unknown): NavbarStyleSetting {
  return (NAVBAR_STYLE_ENUM as readonly string[]).includes(value as string)
    ? (value as NavbarStyleSetting)
    : 'glass';
}
