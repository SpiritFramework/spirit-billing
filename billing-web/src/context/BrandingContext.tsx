import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';

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
  maintenanceMode: false,
  maintenanceMessage: 'Billing is temporarily down for maintenance. Please check back soon.',
  registrationEnabled: true,
  ticketsEnabled: true,
  turnstileEnabled: false,
  turnstileSiteKey: '',
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

function applyDocumentBranding(data: Branding) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(data.accentColor) ? data.accentColor : defaults.accentColor;
  const secondary = /^#[0-9a-fA-F]{6}$/.test(data.secondaryColor)
    ? data.secondaryColor
    : defaults.secondaryColor;

  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-hover', accent);
  document.documentElement.style.setProperty(
    '--accent-muted',
    `color-mix(in srgb, ${accent} 15%, transparent)`,
  );
  document.documentElement.style.setProperty(
    '--accent-glow',
    `color-mix(in srgb, ${accent} 35%, transparent)`,
  );
  document.documentElement.style.setProperty('--accent-secondary', secondary);
  document.title = `${data.companyName} ${data.tagline}`.trim();

  const href = data.faviconUrl?.trim();
  if (href && /^https?:\/\//i.test(href)) {
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
