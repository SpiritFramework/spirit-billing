import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, isBrandAssetUrl } from '../lib/api';
import {
  normalizeAuthAtmosphere,
  normalizeNavLayout,
  normalizeShellAtmosphere,
  type AuthAtmosphere,
  type NavLayout,
  type ShellAtmosphere,
} from '../lib/layout-atmosphere';
import {
  applySurfacePreset,
  DENSITY_TOKENS,
  RADIUS_TOKENS,
  isThemePreset,
  normalizeNavbarStyle,
  normalizeSidebarStyle,
  resolveThemeMode,
  type NavbarStyle,
  type SidebarStyle,
  type ThemeMode,
  type ThemePreset,
  type UiDensity,
  type UiRadius,
} from '../lib/theme-presets';

export type Branding = {
  companyName: string;
  tagline: string;
  accentColor: string;
  secondaryColor: string;
  panelName: string;
  panelWebUrl: string;
  paymentInstructions: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  currency?: string;
  supportEmail?: string;
  supportUrl?: string;
  termsUrl?: string;
  privacyUrl?: string;
  invoiceFooter?: string;
  announcementBanner?: string;
  themeMode?: ThemeMode;
  themePreset?: ThemePreset;
  uiRadius?: UiRadius;
  uiDensity?: UiDensity;
  sidebarStyle?: SidebarStyle;
  navbarStyle?: NavbarStyle;
  authAtmosphere?: AuthAtmosphere;
  clientAtmosphere?: ShellAtmosphere;
  adminAtmosphere?: ShellAtmosphere;
  clientNavLayout?: NavLayout;
  adminNavLayout?: NavLayout;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  registrationEnabled?: boolean;
  ticketsEnabled?: boolean;
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
};

type BrandingContextValue = Branding & {
  refreshBranding: () => Promise<void>;
};

const defaults: Branding = {
  companyName: 'Spirit Host',
  tagline: 'Billing',
  accentColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  panelName: 'Spirit-Panel',
  panelWebUrl: 'http://localhost:5173',
  paymentInstructions: '',
  logoUrl: null,
  faviconUrl: null,
  themeMode: 'dark',
  themePreset: 'custom',
  uiRadius: 'soft',
  uiDensity: 'comfortable',
  sidebarStyle: 'solid',
  navbarStyle: 'glass',
  authAtmosphere: 'stage',
  clientAtmosphere: 'gradient',
  adminAtmosphere: 'gradient',
  clientNavLayout: 'sidebar',
  adminNavLayout: 'sidebar',
  maintenanceMode: false,
  maintenanceMessage: 'Billing is temporarily down for maintenance. Please check back soon.',
  registrationEnabled: true,
  ticketsEnabled: true,
  turnstileEnabled: false,
  turnstileSiteKey: '',
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

function normalizeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
}

function normalizePreset(value: unknown): ThemePreset {
  return isThemePreset(value) ? value : 'custom';
}

function normalizeRadius(value: unknown): UiRadius {
  return value === 'sharp' || value === 'soft' || value === 'rounded' ? value : 'soft';
}

function normalizeDensity(value: unknown): UiDensity {
  return value === 'comfortable' || value === 'compact' ? value : 'comfortable';
}

export function applyDocumentBranding(data: Branding) {
  const root = document.documentElement;
  const mode = normalizeMode(data.themeMode);
  const preset = normalizePreset(data.themePreset);
  const radius = normalizeRadius(data.uiRadius);
  const density = normalizeDensity(data.uiDensity);
  const sidebar = normalizeSidebarStyle(data.sidebarStyle);
  const navbar = normalizeNavbarStyle(data.navbarStyle);
  const authAtmosphere = normalizeAuthAtmosphere(data.authAtmosphere);
  const clientAtmosphere = normalizeShellAtmosphere(data.clientAtmosphere);
  const adminAtmosphere = normalizeShellAtmosphere(data.adminAtmosphere);
  const clientNavLayout = normalizeNavLayout(data.clientNavLayout);
  const adminNavLayout = normalizeNavLayout(data.adminNavLayout);

  const resolved = resolveThemeMode(mode);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-density', density);
  root.setAttribute('data-sidebar', sidebar);
  root.setAttribute('data-navbar', navbar);
  root.setAttribute('data-radius', radius);
  root.setAttribute('data-auth-bg', authAtmosphere);
  root.setAttribute('data-client-bg', clientAtmosphere);
  root.setAttribute('data-admin-bg', adminAtmosphere);
  root.setAttribute('data-client-nav', clientNavLayout);
  root.setAttribute('data-admin-nav', adminNavLayout);

  const accent = /^#[0-9a-fA-F]{6}$/.test(data.accentColor)
    ? data.accentColor
    : defaults.accentColor;
  const secondary = /^#[0-9a-fA-F]{6}$/.test(data.secondaryColor)
    ? data.secondaryColor
    : defaults.secondaryColor;

  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-hover', accent);
  root.style.setProperty('--accent-muted', `color-mix(in srgb, ${accent} 15%, transparent)`);
  root.style.setProperty('--accent-glow', `color-mix(in srgb, ${accent} 35%, transparent)`);
  root.style.setProperty('--accent-secondary', secondary);
  root.style.setProperty('--accent-secondary-glow', `color-mix(in srgb, ${secondary} 30%, transparent)`);

  applySurfacePreset(preset, resolved);

  for (const [key, value] of Object.entries(RADIUS_TOKENS[radius])) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(DENSITY_TOKENS[density])) {
    root.style.setProperty(key, value);
  }

  document.title = `${data.companyName} ${data.tagline}`.trim();

  const href = data.faviconUrl?.trim();
  if (href && isBrandAssetUrl(href)) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(defaults);

  async function refreshBranding() {
    try {
      const data = await api<Partial<Branding> & { companyName: string }>('/auth/branding');
      const next: Branding = {
        ...defaults,
        ...data,
        tagline: data.tagline?.trim() || 'Billing',
        logoUrl: data.logoUrl || null,
        faviconUrl: data.faviconUrl || null,
        supportEmail: data.supportEmail?.trim() || '',
        supportUrl: data.supportUrl?.trim() || '',
        termsUrl: data.termsUrl?.trim() || '',
        privacyUrl: data.privacyUrl?.trim() || '',
        invoiceFooter: data.invoiceFooter?.trim() || '',
        announcementBanner: data.announcementBanner?.trim() || '',
        themeMode: normalizeMode(data.themeMode),
        themePreset: normalizePreset(data.themePreset),
        uiRadius: normalizeRadius(data.uiRadius),
        uiDensity: normalizeDensity(data.uiDensity),
        sidebarStyle: normalizeSidebarStyle(data.sidebarStyle),
        navbarStyle: normalizeNavbarStyle(data.navbarStyle),
        authAtmosphere: normalizeAuthAtmosphere(data.authAtmosphere),
        clientAtmosphere: normalizeShellAtmosphere(
          data.clientAtmosphere ?? (data as { panelAtmosphere?: unknown }).panelAtmosphere,
        ),
        adminAtmosphere: normalizeShellAtmosphere(
          data.adminAtmosphere ?? (data as { panelAtmosphere?: unknown }).panelAtmosphere,
        ),
        clientNavLayout: normalizeNavLayout(data.clientNavLayout),
        adminNavLayout: normalizeNavLayout(data.adminNavLayout),
        maintenanceMode: Boolean(data.maintenanceMode),
        maintenanceMessage:
          data.maintenanceMessage?.trim() || defaults.maintenanceMessage,
        registrationEnabled: data.registrationEnabled !== false,
        turnstileEnabled: Boolean(data.turnstileEnabled),
        turnstileSiteKey: data.turnstileSiteKey?.trim() || '',
      };
      setBranding(next);
      applyDocumentBranding(next);
    } catch {
      /* keep defaults offline */
    }
  }

  useEffect(() => {
    void refreshBranding();
  }, []);

  useEffect(() => {
    if (branding.themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyDocumentBranding(branding);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [branding]);

  return (
    <BrandingContext.Provider value={{ ...branding, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding outside provider');
  return ctx;
}
