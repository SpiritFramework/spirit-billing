import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Copy,
  Cpu,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  Github,
  Globe2,
  Info,
  KeyRound,
  LayoutDashboard,
  Link2,
  Palette,
  PlugZap,
  ReceiptText,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Workflow,
} from 'lucide-react';
import { api, ApiError, safeExternalHref } from '../../lib/api';
import { useBranding } from '../../context/BrandingContext';
import { ThemedSelect } from '../../components/ThemedSelect';
import {
  BrandingStudio,
  BRAND_SECTIONS,
  type BrandInspectorSection,
} from './BrandingStudio';
import {
  normalizeAuthAtmosphere,
  normalizeNavLayout,
  normalizeShellAtmosphere,
  type AuthAtmosphere,
  type NavLayout,
  type ShellAtmosphere,
} from '../../lib/layout-atmosphere';
import {
  isThemePreset,
  normalizeNavbarStyle,
  normalizeSidebarStyle,
  type NavbarStyle,
  type SidebarStyle,
  type ThemeMode,
  type ThemePreset,
  type UiDensity,
  type UiRadius,
} from '../../lib/theme-presets';

type SettingsForm = {
  companyName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  accentColor: string;
  secondaryColor: string;
  paymentInstructions: string;
  supportEmail: string;
  supportUrl: string;
  termsUrl: string;
  privacyUrl: string;
  invoiceFooter: string;
  announcementBanner: string;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  uiRadius: UiRadius;
  uiDensity: UiDensity;
  sidebarStyle: SidebarStyle;
  navbarStyle: NavbarStyle;
  authAtmosphere: AuthAtmosphere;
  clientAtmosphere: ShellAtmosphere;
  adminAtmosphere: ShellAtmosphere;
  clientNavLayout: NavLayout;
  adminNavLayout: NavLayout;
  invoicePrefix: string;
  defaultCurrency: string;
  invoiceDueDays: number;
  serviceRefundWindowDays: number;
  overdueSuspendDays: number;
  overdueTerminateDays: number;
  panelApiUrl: string;
  panelWebUrl: string;
  panelKeyConfigured: boolean;
  panelKeyMasked: string;
  panelAllowPrivateUrls: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationEnabled: boolean;
  ticketsEnabled: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretConfigured: boolean;
  turnstileSecretMasked: string;
};

type Tab = 'brand' | 'billing' | 'panel' | 'security' | 'about';

type AboutPayload = {
  product: string;
  tagline: string;
  blurb: string;
  version: string;
  installerVersion: string;
  updateAvailable: boolean;
  latestRelease: {
    tag: string;
    name: string | null;
    url: string;
    publishedAt: string | null;
  } | null;
  runtime: {
    node: string;
    platform: string;
    env: string;
    uptime: string;
    uptimeSeconds: number;
  };
  stack: { id: string; label: string; detail: string }[];
  capabilities: { id: string; label: string; detail: string }[];
  links: {
    repo: string;
    releases: string;
    changelog: string;
    installDocs: string;
    installer: string;
    panel: string;
  };
  channels: { id: string; label: string; hint: string; command: string }[];
  updateHint: string;
  license: string;
  builtBy: string;
};

const ABOUT_CAP_ICONS: Record<string, typeof Boxes> = {
  storefront: CreditCard,
  client: LayoutDashboard,
  admin: Boxes,
  provision: Workflow,
  brand: Sparkles,
  security: ShieldCheck,
};

const CURRENCY_OPTIONS = [
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
];

const emptyForm: SettingsForm = {
  companyName: '',
  tagline: 'Billing',
  logoUrl: '',
  faviconUrl: '',
  accentColor: '',
  secondaryColor: '',
  paymentInstructions: '',
  supportEmail: '',
  supportUrl: '',
  termsUrl: '',
  privacyUrl: '',
  invoiceFooter: '',
  announcementBanner: '',
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
  invoicePrefix: 'INV',
  defaultCurrency: 'GBP',
  invoiceDueDays: 7,
  serviceRefundWindowDays: 3,
  overdueSuspendDays: 3,
  overdueTerminateDays: 14,
  panelApiUrl: '',
  panelWebUrl: '',
  panelKeyConfigured: false,
  panelKeyMasked: '',
  panelAllowPrivateUrls: false,
  maintenanceMode: false,
  maintenanceMessage: 'Billing is temporarily down for maintenance. Please check back soon.',
  registrationEnabled: true,
  ticketsEnabled: true,
  turnstileEnabled: false,
  turnstileSiteKey: '',
  turnstileSecretConfigured: false,
  turnstileSecretMasked: '',
};

function Field({
  label,
  hint,
  children,
  wide,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
  required?: boolean;
}) {
  return (
    <label className={`ops-user__field${wide ? ' ops-settings__full' : ''}`}>
      <span>
        {label}
        {required ? <em>Required</em> : null}
      </span>
      {children}
      {hint ? <small className="ops-settings__hint">{hint}</small> : null}
    </label>
  );
}

function Switch({
  checked,
  onChange,
  title,
  description,
  icon,
  tone,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: 'warn';
}) {
  return (
    <button
      type="button"
      className={`ops-settings__toggle${checked ? ' is-on' : ''}${tone === 'warn' && checked ? ' is-warn' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span aria-hidden>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <i>
        <span />
      </i>
    </button>
  );
}

function parseTab(value: string | null): Tab {
  if (
    value === 'billing'
    || value === 'panel'
    || value === 'security'
    || value === 'brand'
    || value === 'about'
  ) {
    return value;
  }
  return 'brand';
}

function hostLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.host || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').split('/')[0] || trimmed;
  }
}

export function AdminSettings() {
  const { refreshBranding } = useBranding();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [turnstileSecretDraft, setTurnstileSecretDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showTurnstileSecret, setShowTurnstileSecret] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    usersFound?: number;
    brandingName?: string | null;
    error?: string;
    panelApiUrl: string;
  } | null>(null);
  const [clearingKey, setClearingKey] = useState(false);
  const [brandSection, setBrandSection] = useState<BrandInspectorSection>('theme');
  const [about, setAbout] = useState<AboutPayload | null>(null);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutError, setAboutError] = useState('');
  const [copiedHint, setCopiedHint] = useState('');

  function setTab(next: Tab) {
    setSearchParams(next === 'brand' ? {} : { tab: next }, { replace: true });
    setError('');
    setMessage('');
  }

  function normalizeForm(data: Partial<SettingsForm>): SettingsForm {
    return {
      ...emptyForm,
      ...data,
      tagline: data.tagline || 'Billing',
      logoUrl: data.logoUrl || '',
      faviconUrl: data.faviconUrl || '',
      accentColor: data.accentColor || '',
      secondaryColor: data.secondaryColor || '',
      supportEmail: data.supportEmail || '',
      supportUrl: data.supportUrl || '',
      termsUrl: data.termsUrl || '',
      privacyUrl: data.privacyUrl || '',
      invoiceFooter: data.invoiceFooter || '',
      announcementBanner: data.announcementBanner || '',
      themeMode:
        data.themeMode === 'light' || data.themeMode === 'dark' || data.themeMode === 'system'
          ? data.themeMode
          : 'dark',
      themePreset: isThemePreset(data.themePreset) ? data.themePreset : 'custom',
      uiRadius:
        data.uiRadius === 'sharp' || data.uiRadius === 'soft' || data.uiRadius === 'rounded'
          ? data.uiRadius
          : 'soft',
      uiDensity:
        data.uiDensity === 'comfortable' || data.uiDensity === 'compact'
          ? data.uiDensity
          : 'comfortable',
      sidebarStyle: normalizeSidebarStyle(data.sidebarStyle),
      navbarStyle: normalizeNavbarStyle(data.navbarStyle),
      authAtmosphere: normalizeAuthAtmosphere(data.authAtmosphere),
      clientAtmosphere: normalizeShellAtmosphere(data.clientAtmosphere),
      adminAtmosphere: normalizeShellAtmosphere(data.adminAtmosphere),
      clientNavLayout: normalizeNavLayout(data.clientNavLayout),
      adminNavLayout: normalizeNavLayout(data.adminNavLayout),
      invoiceDueDays: data.invoiceDueDays || 7,
      serviceRefundWindowDays:
        data.serviceRefundWindowDays === 0 || data.serviceRefundWindowDays
          ? Number(data.serviceRefundWindowDays)
          : 3,
      overdueSuspendDays:
        data.overdueSuspendDays === 0 || data.overdueSuspendDays
          ? Number(data.overdueSuspendDays)
          : 3,
      overdueTerminateDays:
        data.overdueTerminateDays === 0 || data.overdueTerminateDays
          ? Number(data.overdueTerminateDays)
          : 14,
      panelAllowPrivateUrls: Boolean(data.panelAllowPrivateUrls),
      maintenanceMode: Boolean(data.maintenanceMode),
      maintenanceMessage:
        data.maintenanceMessage
        || 'Billing is temporarily down for maintenance. Please check back soon.',
      registrationEnabled: data.registrationEnabled !== false,
      ticketsEnabled: data.ticketsEnabled !== false,
      turnstileEnabled: Boolean(data.turnstileEnabled),
      turnstileSiteKey: data.turnstileSiteKey || '',
      turnstileSecretConfigured: Boolean(data.turnstileSecretConfigured),
      turnstileSecretMasked: data.turnstileSecretMasked || '',
      panelKeyConfigured: Boolean(data.panelKeyConfigured),
      panelKeyMasked: data.panelKeyMasked || '',
    };
  }

  useEffect(() => {
    void api<SettingsForm>('/admin/settings')
      .then((data) => {
        setForm(normalizeForm(data));
        setLogoBroken(false);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load settings'))
      .finally(() => setLoading(false));
  }, []);

  async function loadAbout() {
    setAboutLoading(true);
    setAboutError('');
    try {
      setAbout(await api<AboutPayload>('/admin/about'));
    } catch (err) {
      setAboutError(err instanceof ApiError ? err.message : 'Could not load about info');
    } finally {
      setAboutLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== 'about' || about) return;
    void loadAbout();
    // Load once per visit until Refresh replaces `about`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function applyForm(data: SettingsForm) {
    setForm(normalizeForm(data));
  }

  async function saveBrand(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api<SettingsForm>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: form.companyName,
          tagline: form.tagline,
          logoUrl: form.logoUrl,
          faviconUrl: form.faviconUrl,
          accentColor: form.accentColor,
          secondaryColor: form.secondaryColor,
          supportEmail: form.supportEmail,
          supportUrl: form.supportUrl,
          termsUrl: form.termsUrl,
          privacyUrl: form.privacyUrl,
          announcementBanner: form.announcementBanner,
          themeMode: form.themeMode,
          themePreset: form.themePreset,
          uiRadius: form.uiRadius,
          uiDensity: form.uiDensity,
          sidebarStyle: form.sidebarStyle,
          navbarStyle: form.navbarStyle,
          authAtmosphere: form.authAtmosphere,
          clientAtmosphere: form.clientAtmosphere,
          adminAtmosphere: form.adminAtmosphere,
          clientNavLayout: form.clientNavLayout,
          adminNavLayout: form.adminNavLayout,
        }),
      });
      applyForm(data);
      setLogoBroken(false);
      await refreshBranding();
      setMessage('Brand settings saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save brand settings');
    } finally {
      setSaving(false);
    }
  }

  async function saveBilling(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api<SettingsForm>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          invoicePrefix: form.invoicePrefix,
          defaultCurrency: form.defaultCurrency,
          invoiceDueDays: Number(form.invoiceDueDays),
          serviceRefundWindowDays: Number(form.serviceRefundWindowDays),
          overdueSuspendDays: Number(form.overdueSuspendDays),
          overdueTerminateDays: Number(form.overdueTerminateDays),
          paymentInstructions: form.paymentInstructions,
          invoiceFooter: form.invoiceFooter,
        }),
      });
      applyForm(data);
      await refreshBranding();
      setMessage('Billing settings saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save billing settings');
    } finally {
      setSaving(false);
    }
  }

  async function savePanel(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setTestResult(null);
    try {
      const data = await api<SettingsForm>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          panelApiUrl: form.panelApiUrl,
          panelWebUrl: form.panelWebUrl,
          panelAllowPrivateUrls: form.panelAllowPrivateUrls,
          ...(apiKeyDraft.trim() ? { panelApplicationApiKey: apiKeyDraft.trim() } : {}),
        }),
      });
      applyForm(data);
      setApiKeyDraft('');
      setMessage('Spirit-Panel link settings saved. Run Test connection to verify.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save panel settings');
    } finally {
      setSaving(false);
    }
  }

  async function clearPanelKey() {
    if (!form.panelKeyConfigured) return;
    if (!window.confirm('Clear the saved Application API key? Provisioning will stop until you paste a new key.')) {
      return;
    }
    setClearingKey(true);
    setError('');
    setMessage('');
    setTestResult(null);
    try {
      const data = await api<SettingsForm>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ clearPanelKey: true }),
      });
      applyForm(data);
      setApiKeyDraft('');
      setMessage('Application API key cleared.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not clear panel key');
    } finally {
      setClearingKey(false);
    }
  }

  async function saveSecurity(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api<SettingsForm>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          maintenanceMode: form.maintenanceMode,
          maintenanceMessage: form.maintenanceMessage,
          registrationEnabled: form.registrationEnabled,
          ticketsEnabled: form.ticketsEnabled,
          turnstileEnabled: form.turnstileEnabled,
          turnstileSiteKey: form.turnstileSiteKey,
          ...(turnstileSecretDraft.trim()
            ? { turnstileSecretKey: turnstileSecretDraft.trim() }
            : {}),
        }),
      });
      applyForm(data);
      setTurnstileSecretDraft('');
      await refreshBranding();
      setMessage('Security settings saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save security settings');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError('');
    setMessage('');
    setTestResult(null);
    try {
      const result = await api<{
        ok: boolean;
        latencyMs: number;
        usersFound?: number;
        brandingName?: string | null;
        error?: string;
        panelApiUrl: string;
      }>('/admin/panel/test', {
        method: 'POST',
        body: JSON.stringify({
          panelApiUrl: form.panelApiUrl || undefined,
          panelAllowPrivateUrls: form.panelAllowPrivateUrls || undefined,
          ...(apiKeyDraft.trim() ? { panelApplicationApiKey: apiKeyDraft.trim() } : {}),
        }),
      });
      setTestResult(result);
      if (result.ok && (apiKeyDraft.trim() || !form.panelKeyConfigured)) {
        setMessage('Connection OK with the values above. Click Save panel link to persist them.');
      } else if (result.ok) {
        setMessage('Spirit-Panel connection verified.');
      }
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        error: err instanceof ApiError ? err.message : 'Connection test failed',
        panelApiUrl: form.panelApiUrl,
      });
    } finally {
      setTesting(false);
    }
  }

  const linkReady = Boolean(form.panelApiUrl && form.panelWebUrl && form.panelKeyConfigured);
  const panelVerified = Boolean(testResult?.ok);
  const sampleInvoice = `${(form.invoicePrefix || 'INV').toUpperCase()}-${new Date().getFullYear()}-00001`;
  const panelHref = safeExternalHref(form.panelWebUrl);

  const sections = useMemo(
    () =>
      [
        {
          id: 'brand' as const,
          label: 'Brand',
          hint: 'Theme look & colors',
          icon: Palette,
          status: form.companyName ? 'Ready' : 'Needed',
        },
        {
          id: 'billing' as const,
          label: 'Billing',
          hint: `${form.invoicePrefix || 'INV'} · ${form.defaultCurrency}`,
          icon: ReceiptText,
          status: `${form.invoiceDueDays}d due`,
        },
        {
          id: 'security' as const,
          label: 'Security',
          hint: form.maintenanceMode ? 'Maintenance' : form.turnstileEnabled ? 'Turnstile' : 'Access',
          icon: ShieldCheck,
          status: form.maintenanceMode ? 'Locked' : 'Open',
        },
        {
          id: 'panel' as const,
          label: 'Panel',
          hint: panelVerified ? 'Verified' : linkReady ? 'Configured' : 'Needs setup',
          icon: Link2,
          status: panelVerified ? 'Live' : linkReady ? 'Saved' : 'Setup',
        },
        {
          id: 'about' as const,
          label: 'About',
          hint: 'Version & updates',
          icon: Info,
          status: about?.updateAvailable ? 'Update' : about?.version ? `v${about.version}` : 'Info',
        },
      ] as const,
    [form, linkReady, panelVerified, about],
  );

  if (loading) {
    return (
      <div className="ops-users ops-settings">
        <div className="ops-users__empty">
          <RefreshCw size={22} />
          <h3>Loading settings…</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="ops-users ops-settings">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Platform</span>
          <h1>Settings</h1>
          <p>Brand, billing defaults, access control, Spirit-Panel link, and product info.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${form.maintenanceMode ? ' is-warn is-active' : ' is-ok'}`}
            onClick={() => setTab('security')}
            title="Maintenance mode"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CircleAlert size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Access</small>
              <strong>{form.maintenanceMode ? 'Maintenance' : 'Open'}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${panelVerified ? ' is-ok' : linkReady ? '' : ' is-warn'}${
              tab === 'panel' ? ' is-active' : ''
            }`}
            onClick={() => setTab('panel')}
            title="Panel link"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Link2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Panel</small>
              <strong>{panelVerified ? 'Verified' : linkReady ? 'Saved' : 'Setup'}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${form.registrationEnabled ? ' is-ok' : ' is-warn'}`}
            onClick={() => setTab('security')}
            title="Registration"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Globe2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Signup</small>
              <strong>{form.registrationEnabled ? 'On' : 'Off'}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${form.ticketsEnabled ? '' : ' is-warn'}`}
            onClick={() => setTab('security')}
            title="Support tickets"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Ticket size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Tickets</small>
              <strong>{form.ticketsEnabled ? 'On' : 'Off'}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}
      {message ? <div className="ds-alert ds-alert--success">{message}</div> : null}

      <div className={`ops-users__shell ops-settings__shell${tab === 'brand' ? ' is-brand' : ''}`}>
        <aside className="ops-users__rail" aria-label="Settings sections">
          <div className="ops-users__rail-block">
            <span>Sections</span>
            <div className="ops-settings__rail-nav">
              {sections.map((section) => {
                const Icon = section.icon;
                const on = tab === section.id;
                return (
                  <div key={section.id} className={`ops-settings__rail-group${on ? ' is-on' : ''}`}>
                    <button
                      type="button"
                      className={`ops-settings__rail-btn${on ? ' is-on' : ''}`}
                      onClick={() => setTab(section.id)}
                    >
                      <span>
                        <Icon size={13} aria-hidden />
                        {section.label}
                      </span>
                      <em>{section.status}</em>
                    </button>
                    {section.id === 'brand' && on ? (
                      <div className="ops-settings__rail-subs" role="group" aria-label="Brand sections">
                        {BRAND_SECTIONS.map((item) => {
                          const SubIcon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`ops-settings__rail-sub${brandSection === item.id ? ' is-on' : ''}`}
                              onClick={() => setBrandSection(item.id)}
                            >
                              <SubIcon size={12} aria-hidden />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {tab === 'brand' ? (
            <div className="ops-users__rail-block">
              <span>Brand</span>
              <div className="ops-settings__rail-brand">
                <strong>{form.companyName || 'Your brand'}</strong>
                <small>
                  {form.tagline || 'Billing'} · {form.themeMode} · {form.themePreset}
                </small>
              </div>
            </div>
          ) : tab === 'panel' ? (
            <div className="ops-users__rail-block">
              <span>Link tip</span>
              <div className="ops-settings__rail-brand">
                <strong>{panelVerified ? 'Live' : linkReady ? 'Saved' : 'Setup'}</strong>
                <small>
                  {panelVerified
                    ? 'Provisioning can sync to Spirit-Panel.'
                    : 'Save endpoints + key, then Probe. Configured is not verified.'}
                </small>
              </div>
            </div>
          ) : tab === 'about' ? (
            <div className="ops-users__rail-block">
              <span>Product</span>
              <div className="ops-settings__rail-brand">
                <strong>Spirit-Billing</strong>
                <small>
                  {about?.updateAvailable
                    ? `Update available · ${about.latestRelease?.tag}`
                    : about?.version
                      ? `v${about.version} · ${about.runtime?.env || 'runtime'}`
                      : 'Client billing & storefront'}
                </small>
              </div>
            </div>
          ) : (
            <div className="ops-users__rail-block">
              <span>Snapshot</span>
              <div className="ops-settings__rail-facts">
                <div>
                  <span>Brand</span>
                  <strong>{form.companyName || '—'}</strong>
                </div>
                <div>
                  <span>Currency</span>
                  <strong>{form.defaultCurrency}</strong>
                </div>
                <div>
                  <span>Invoice</span>
                  <strong>{form.invoicePrefix}</strong>
                </div>
                <div>
                  <span>Theme</span>
                  <strong>{form.themeMode}</strong>
                </div>
              </div>
            </div>
          )}
        </aside>

        <div className="ops-users__main ops-settings__main">
          {tab === 'brand' ? (
            <BrandingStudio
              embedded
              section={brandSection}
              onSectionChange={setBrandSection}
              form={{
                companyName: form.companyName,
                tagline: form.tagline,
                logoUrl: form.logoUrl,
                faviconUrl: form.faviconUrl,
                accentColor: form.accentColor,
                secondaryColor: form.secondaryColor,
                supportEmail: form.supportEmail,
                supportUrl: form.supportUrl,
                termsUrl: form.termsUrl,
                privacyUrl: form.privacyUrl,
                announcementBanner: form.announcementBanner,
                themeMode: form.themeMode,
                themePreset: form.themePreset,
                uiRadius: form.uiRadius,
                uiDensity: form.uiDensity,
                sidebarStyle: form.sidebarStyle,
                navbarStyle: form.navbarStyle,
                authAtmosphere: form.authAtmosphere,
                clientAtmosphere: form.clientAtmosphere,
                adminAtmosphere: form.adminAtmosphere,
                clientNavLayout: form.clientNavLayout,
                adminNavLayout: form.adminNavLayout,
              }}
              setForm={(next) => setForm({ ...form, ...next })}
              saving={saving}
              onSave={saveBrand}
              logoBroken={logoBroken}
              setLogoBroken={setLogoBroken}
              onError={setError}
              onMessage={setMessage}
            />
          ) : null}

          {tab === 'billing' ? (
            <div className="ops-settings__desk">
              <form className="ops-settings__form" onSubmit={(event) => void saveBilling(event)}>
                <header className="ops-settings__desk-head">
                  <div>
                    <h2>Billing defaults</h2>
                    <p>Invoice numbering, payment window, and overdue enforcement.</p>
                  </div>
                  <button type="submit" className="ops-user__btn is-primary" disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving…' : 'Save billing'}
                  </button>
                </header>

                <section className="ops-user__panel ops-settings__sheet">
                  <div className="ops-settings__block">
                    <header>
                      <h3>Invoices</h3>
                      <p>Prefix, currency, and payment timing.</p>
                    </header>
                    <div className="ops-settings__fields is-3">
                      <Field label="Invoice prefix" hint={`Example: ${sampleInvoice}`} required>
                        <input
                          value={form.invoicePrefix}
                          onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value.toUpperCase() })}
                          maxLength={12}
                          required
                        />
                      </Field>
                      <Field label="Default currency" required>
                        <ThemedSelect
                          ariaLabel="Default currency"
                          value={form.defaultCurrency}
                          onChange={(defaultCurrency) => setForm({ ...form, defaultCurrency })}
                          options={CURRENCY_OPTIONS}
                        />
                      </Field>
                      <Field label="Invoice due days" hint="Days to pay after an invoice is created." required>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={form.invoiceDueDays}
                          onChange={(e) => setForm({ ...form, invoiceDueDays: Number(e.target.value) || 1 })}
                          required
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="ops-settings__block">
                    <header>
                      <h3>Lifecycle</h3>
                      <p>Refunds, suspend, and terminate windows.</p>
                    </header>
                    <div className="ops-settings__fields is-3">
                      <Field
                        label="Delete refund window"
                        hint="Prorated credit refund within this many days of purchase. 0 disables refunds."
                        required
                      >
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={form.serviceRefundWindowDays}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              serviceRefundWindowDays: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          required
                        />
                      </Field>
                      <Field label="Suspend after (days past due)" hint="Unpaid renewals suspend after this many days." required>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={form.overdueSuspendDays}
                          onChange={(e) => {
                            const overdueSuspendDays = Math.max(0, Number(e.target.value) || 0);
                            setForm({
                              ...form,
                              overdueSuspendDays,
                              overdueTerminateDays: Math.max(form.overdueTerminateDays, overdueSuspendDays),
                            });
                          }}
                          required
                        />
                      </Field>
                      <Field
                        label="Terminate after (days past due)"
                        hint="Then delete the panel server and cancel the service. Must be ≥ suspend days."
                        required
                      >
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={form.overdueTerminateDays}
                          onChange={(e) => {
                            const overdueTerminateDays = Math.max(0, Number(e.target.value) || 0);
                            setForm({
                              ...form,
                              overdueTerminateDays: Math.max(overdueTerminateDays, form.overdueSuspendDays),
                            });
                          }}
                          required
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="ops-settings__block">
                    <header>
                      <h3>Copy</h3>
                      <p>Shown on invoices and payment screens.</p>
                    </header>
                    <div className="ops-settings__fields">
                      <Field label="Manual payment instructions" hint="Shown on unpaid invoices." wide required>
                        <textarea
                          rows={6}
                          value={form.paymentInstructions}
                          onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
                          required
                        />
                      </Field>
                      <Field label="Invoice footer note" hint="Leave blank for the default note." wide>
                        <textarea
                          rows={3}
                          maxLength={500}
                          value={form.invoiceFooter}
                          onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })}
                          placeholder="Keep this invoice for your records. Quote the invoice number when contacting support."
                        />
                      </Field>
                    </div>
                  </div>
                </section>
              </form>

              <aside className="ops-settings__aside">
                <section className="ops-user__panel">
                  <header>
                    <span className="ops-user__panel-icon" aria-hidden>
                      <ReceiptText size={14} />
                    </span>
                    <div>
                      <h2>Invoice sample</h2>
                      <p>How the next number will look.</p>
                    </div>
                  </header>
                  <div className="ops-settings__preview">
                    <small>Next format</small>
                    <h3>{sampleInvoice}</h3>
                    <p>
                      Due in {form.invoiceDueDays} day{form.invoiceDueDays === 1 ? '' : 's'} · {form.defaultCurrency}
                    </p>
                    <div>
                      <span>Refund ≤{form.serviceRefundWindowDays}d</span>
                      <strong>
                        Suspend {form.overdueSuspendDays}d · Kill {form.overdueTerminateDays}d
                      </strong>
                    </div>
                  </div>
                  <p className="ops-settings__note">
                    {form.paymentInstructions.slice(0, 160) || 'No payment instructions yet'}
                    {form.paymentInstructions.length > 160 ? '…' : ''}
                  </p>
                </section>
              </aside>
            </div>
          ) : null}

          {tab === 'panel' ? (
            <form
              className={`ops-plink${
                panelVerified ? ' is-live' : linkReady ? ' is-armed' : ' is-setup'
              }${testResult && !testResult.ok ? ' is-fail' : ''}`}
              onSubmit={(event) => void savePanel(event)}
            >
              <header className="ops-plink__hero">
                <div className="ops-plink__hero-top">
                  <div className="ops-plink__signal">
                    <span className="ops-plink__pulse" aria-hidden>
                      <Server size={18} />
                    </span>
                    <div>
                      <span>Spirit-Panel link</span>
                      <h2>
                        {panelVerified
                          ? 'Verified and ready'
                          : testResult && !testResult.ok
                            ? 'Probe failed'
                            : linkReady
                              ? 'Configured — probe to verify'
                              : 'Wire-up incomplete'}
                      </h2>
                      <p>
                        {panelVerified
                          ? [
                              testResult?.brandingName || null,
                              testResult ? `${testResult.latencyMs}ms` : null,
                              typeof testResult?.usersFound === 'number'
                                ? `${testResult.usersFound} panel users`
                                : null,
                              apiKeyDraft.trim() ? 'draft values — save to persist' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Accounts and servers can sync to Spirit-Panel.'
                          : testResult && !testResult.ok
                            ? testResult.error || 'Connection failed'
                            : linkReady
                              ? 'URLs and key are saved. Run a probe before relying on provisioning.'
                              : 'API URL, web URL, and an Application key are required for sync and provisioning.'}
                      </p>
                    </div>
                  </div>
                  <div className="ops-plink__actions">
                    {panelHref ? (
                      <a className="ops-user__btn is-ghost" href={panelHref} target="_blank" rel="noopener noreferrer">
                        Open panel <ExternalLink size={13} />
                      </a>
                    ) : null}
                    <button
                      type="submit"
                      className={`ops-user__btn${linkReady && !panelVerified && !apiKeyDraft.trim() ? ' is-ghost' : ' is-primary'}`}
                      disabled={saving}
                    >
                      <Save size={14} /> {saving ? 'Saving…' : 'Save link'}
                    </button>
                    <button
                      type="button"
                      className={`ops-user__btn${linkReady && !panelVerified && !apiKeyDraft.trim() ? ' is-primary' : ' is-ghost'}`}
                      disabled={testing}
                      onClick={() => void testConnection()}
                    >
                      <PlugZap size={14} /> {testing ? 'Probing…' : 'Probe'}
                    </button>
                  </div>
                </div>

                <div className="ops-plink__checks" aria-label="Link readiness">
                  <div className={form.panelApiUrl.trim() ? 'is-ok' : 'is-bad'}>
                    <small>API</small>
                    <strong>{hostLabel(form.panelApiUrl) || 'Missing'}</strong>
                  </div>
                  <div className={form.panelWebUrl.trim() ? 'is-ok' : 'is-bad'}>
                    <small>Web</small>
                    <strong>{hostLabel(form.panelWebUrl) || 'Missing'}</strong>
                  </div>
                  <div className={form.panelKeyConfigured || apiKeyDraft.trim() ? 'is-ok' : 'is-bad'}>
                    <small>Key</small>
                    <strong>
                      {apiKeyDraft.trim()
                        ? 'Draft'
                        : form.panelKeyConfigured
                          ? form.panelKeyMasked || 'Saved'
                          : 'Missing'}
                    </strong>
                  </div>
                  <div className={form.panelAllowPrivateUrls ? 'is-warn' : 'is-ok'}>
                    <small>Private</small>
                    <strong>{form.panelAllowPrivateUrls ? 'Allowed' : 'Blocked'}</strong>
                  </div>
                  <div
                    className={
                      panelVerified ? 'is-ok' : testResult && !testResult.ok ? 'is-bad' : 'is-idle'
                    }
                  >
                    <small>Probe</small>
                    <strong>
                      {panelVerified
                        ? `${testResult?.latencyMs ?? '—'}ms`
                        : testResult && !testResult.ok
                          ? 'Failed'
                          : 'Not run'}
                    </strong>
                  </div>
                </div>
              </header>

              <div className="ops-plink__board">
                <section className="ops-plink__col">
                  <header className="ops-plink__col-head">
                    <Globe2 size={14} aria-hidden />
                    <div>
                      <h3>Endpoints</h3>
                      <p>panel-api base URL and the web URL clients open.</p>
                    </div>
                  </header>
                  <div className="ops-plink__fields">
                    <Field label="Panel API URL" hint="No trailing slash." required>
                      <input
                        type="url"
                        placeholder="https://panel.example.com"
                        value={form.panelApiUrl}
                        onChange={(e) => {
                          setTestResult(null);
                          setForm({ ...form, panelApiUrl: e.target.value });
                        }}
                        required
                      />
                    </Field>
                    <Field label="Panel web URL" hint="“Open game panel” destination." required>
                      <input
                        type="url"
                        placeholder="https://panel.example.com"
                        value={form.panelWebUrl}
                        onChange={(e) => setForm({ ...form, panelWebUrl: e.target.value })}
                        required
                      />
                    </Field>
                  </div>

                  <div className="ops-plink__lab-row">
                    <div>
                      <strong>Allow private panel URLs</strong>
                      <p>Localhost / RFC1918 hosts in production (lab installs).</p>
                    </div>
                    <button
                      type="button"
                      className={`ops-plink__lab${form.panelAllowPrivateUrls ? ' is-on' : ''}`}
                      onClick={() => {
                        setTestResult(null);
                        setForm({ ...form, panelAllowPrivateUrls: !form.panelAllowPrivateUrls });
                      }}
                      aria-pressed={form.panelAllowPrivateUrls}
                      aria-label="Allow private panel URLs"
                    >
                      <i>
                        <span />
                      </i>
                    </button>
                  </div>
                </section>

                <section className="ops-plink__col ops-plink__col--vault">
                  <header className="ops-plink__col-head">
                    <KeyRound size={14} aria-hidden />
                    <div>
                      <h3>Application key</h3>
                      <p>Encrypted at rest · users.write + server scopes.</p>
                    </div>
                  </header>

                  <div className={`ops-plink__key-pill${form.panelKeyConfigured ? ' is-set' : ''}`}>
                    {form.panelKeyConfigured ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
                    <span>
                      {form.panelKeyConfigured
                        ? `On file · ${form.panelKeyMasked || 'masked'}`
                        : 'No key saved'}
                    </span>
                  </div>

                  <div className="ops-settings__secret ops-plink__secret">
                    <KeyRound size={15} aria-hidden />
                    <input
                      type={showKey ? 'text' : 'password'}
                      placeholder={
                        form.panelKeyConfigured
                          ? 'Leave blank to keep the current key'
                          : 'sp_identifier.secret'
                      }
                      value={apiKeyDraft}
                      onChange={(e) => {
                        setTestResult(null);
                        setApiKeyDraft(e.target.value);
                      }}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  {form.panelKeyConfigured ? (
                    <button
                      type="button"
                      className="ops-user__btn is-ghost ops-plink__clear"
                      disabled={clearingKey || saving}
                      onClick={() => void clearPanelKey()}
                    >
                      <Trash2 size={14} /> {clearingKey ? 'Clearing…' : 'Clear saved key'}
                    </button>
                  ) : (
                    <p className="ops-plink__hint">Paste a new Application API key from Panel Admin.</p>
                  )}
                </section>
              </div>

              {testResult ? (
                <div className={`ops-plink__probe${testResult.ok ? ' is-ok' : ' is-bad'}`} role="status">
                  {testResult.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                  <div>
                    <strong>{testResult.ok ? 'Probe passed' : 'Probe failed'}</strong>
                    <p>
                      {testResult.ok
                        ? [
                            `${testResult.latencyMs}ms`,
                            typeof testResult.usersFound === 'number'
                              ? `${testResult.usersFound} panel users`
                              : null,
                            testResult.brandingName || null,
                            testResult.panelApiUrl || null,
                            apiKeyDraft.trim() ? 'using draft values — save to persist' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : testResult.error}
                    </p>
                  </div>
                </div>
              ) : null}
            </form>
          ) : null}

          {tab === 'security' ? (
            <div className="ops-settings__desk">
              <form className="ops-settings__form" onSubmit={(event) => void saveSecurity(event)}>
                <header className="ops-settings__desk-head">
                  <div>
                    <h2>Security & access</h2>
                    <p>Maintenance, registration, tickets, and Turnstile.</p>
                  </div>
                  <button type="submit" className="ops-user__btn is-primary" disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving…' : 'Save security'}
                  </button>
                </header>

                <section className="ops-user__panel ops-settings__sheet">
                  <div className="ops-settings__block">
                    <header>
                      <h3>Access gates</h3>
                      <p>Who can reach the client area.</p>
                    </header>
                    <div className="ops-settings__toggles">
                      <Switch
                        checked={form.maintenanceMode}
                        onChange={(maintenanceMode) => setForm({ ...form, maintenanceMode })}
                        icon={<CircleAlert size={15} />}
                        title="Maintenance mode"
                        description="Clients cannot log in or use billing. Admins can still sign in."
                        tone="warn"
                      />
                      <Field label="Maintenance message" wide>
                        <textarea
                          rows={3}
                          value={form.maintenanceMessage}
                          onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
                          placeholder="Billing is temporarily down for maintenance. Please check back soon."
                        />
                      </Field>
                      <Switch
                        checked={form.registrationEnabled}
                        onChange={(registrationEnabled) => setForm({ ...form, registrationEnabled })}
                        icon={<Globe2 size={15} />}
                        title="User registration"
                        description="Show signup and allow new client accounts."
                      />
                      <Switch
                        checked={form.ticketsEnabled}
                        onChange={(ticketsEnabled) => setForm({ ...form, ticketsEnabled })}
                        icon={<Ticket size={15} />}
                        title="Support tickets"
                        description="Allow clients to open tickets and chat with staff."
                      />
                      <Switch
                        checked={form.turnstileEnabled}
                        onChange={(turnstileEnabled) => setForm({ ...form, turnstileEnabled })}
                        icon={<ShieldCheck size={15} />}
                        title="Cloudflare Turnstile"
                        description="Require a bot check on login and registration."
                      />
                    </div>
                  </div>

                  <div className="ops-settings__block">
                    <header>
                      <h3>Turnstile keys</h3>
                      <p>Site key is public; secret stays encrypted.</p>
                    </header>
                    <div className="ops-settings__fields">
                      <Field label="Turnstile site key">
                        <input
                          value={form.turnstileSiteKey}
                          onChange={(e) => setForm({ ...form, turnstileSiteKey: e.target.value })}
                          placeholder="0x4AAAAAAA…"
                          autoComplete="off"
                        />
                      </Field>
                      <Field label="Turnstile secret key" hint="Leave blank to keep the existing key.">
                        <div className="ops-settings__secret">
                          <input
                            type={showTurnstileSecret ? 'text' : 'password'}
                            value={turnstileSecretDraft}
                            onChange={(e) => setTurnstileSecretDraft(e.target.value)}
                            placeholder={
                              form.turnstileSecretConfigured
                                ? form.turnstileSecretMasked || 'Secret configured — leave blank to keep'
                                : 'Paste secret key'
                            }
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTurnstileSecret((v) => !v)}
                            aria-label="Toggle secret visibility"
                          >
                            {showTurnstileSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </Field>
                    </div>
                  </div>
                </section>
              </form>

              <aside className="ops-settings__aside">
                <section className="ops-user__panel">
                  <header>
                    <span className="ops-user__panel-icon" aria-hidden>
                      <ShieldCheck size={14} />
                    </span>
                    <div>
                      <h2>Access overview</h2>
                      <p>Current gate state.</p>
                    </div>
                  </header>
                  <div className={`ops-settings__health${!form.maintenanceMode ? ' is-ok' : ' is-warn'}`}>
                    <i />
                    <div>
                      <strong>{form.maintenanceMode ? 'Maintenance active' : 'Client access open'}</strong>
                      <small>
                        {form.maintenanceMode
                          ? 'Only administrators can authenticate.'
                          : 'Clients can register and sign in normally.'}
                      </small>
                    </div>
                  </div>
                  <dl className="ops-settings__facts">
                    <div>
                      <dt>Maintenance</dt>
                      <dd>{form.maintenanceMode ? 'On' : 'Off'}</dd>
                    </div>
                    <div>
                      <dt>Registration</dt>
                      <dd>{form.registrationEnabled ? 'Enabled' : 'Disabled'}</dd>
                    </div>
                    <div>
                      <dt>Tickets</dt>
                      <dd>{form.ticketsEnabled ? 'Enabled' : 'Disabled'}</dd>
                    </div>
                    <div>
                      <dt>Turnstile</dt>
                      <dd>{form.turnstileEnabled ? 'Enabled' : 'Off'}</dd>
                    </div>
                    <div>
                      <dt>Site key</dt>
                      <dd>{form.turnstileSiteKey ? 'Set' : 'Missing'}</dd>
                    </div>
                    <div>
                      <dt>Secret</dt>
                      <dd>{form.turnstileSecretConfigured ? form.turnstileSecretMasked || 'Configured' : 'Missing'}</dd>
                    </div>
                  </dl>
                </section>
              </aside>
            </div>
          ) : null}

          {tab === 'about' ? (
            <div
              className={`ops-about${
                about?.updateAvailable ? ' is-update' : about ? ' is-current' : ''
              }`}
            >
              <header className="ops-about__hero">
                <div className="ops-about__hero-top">
                  <div className="ops-about__signal">
                    <span className="ops-about__pulse" aria-hidden>
                      <Info size={18} />
                    </span>
                    <div>
                      <span>About · {about?.builtBy || 'SpiritFramework'}</span>
                      <h2>{about?.product || 'Spirit-Billing'}</h2>
                      <p>{about?.blurb || about?.tagline || 'Client billing & storefront for game hosting.'}</p>
                    </div>
                  </div>
                  <div className="ops-about__actions">
                    {about ? (
                      <span className={`ops-about__ver${about.updateAvailable ? ' is-warn' : ' is-ok'}`}>
                        v{about.version}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="ops-user__btn is-ghost"
                      disabled={aboutLoading}
                      onClick={() => void loadAbout()}
                    >
                      <RefreshCw size={14} /> {aboutLoading ? 'Checking…' : 'Refresh'}
                    </button>
                    {about?.links.repo ? (
                      <a
                        className="ops-user__btn is-primary"
                        href={about.links.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Github size={14} /> GitHub <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </div>
                {about ? (
                  <div className="ops-about__checks" aria-label="Version status">
                    <div className="is-ok">
                      <small>Installed</small>
                      <strong>v{about.version}</strong>
                    </div>
                    <div className={about.updateAvailable ? 'is-warn' : about.latestRelease ? 'is-ok' : 'is-idle'}>
                      <small>Latest release</small>
                      <strong>
                        {about.latestRelease?.tag
                          ? about.latestRelease.tag.startsWith('v')
                            ? about.latestRelease.tag
                            : `v${about.latestRelease.tag}`
                          : 'No release yet'}
                      </strong>
                    </div>
                    <div className={about.updateAvailable ? 'is-warn' : 'is-ok'}>
                      <small>Status</small>
                      <strong>{about.updateAvailable ? 'Update available' : 'Up to date'}</strong>
                    </div>
                    <div className="is-ok">
                      <small>Installer</small>
                      <strong>v{about.installerVersion}</strong>
                    </div>
                    <div className="is-idle">
                      <small>API uptime</small>
                      <strong>{about.runtime.uptime}</strong>
                    </div>
                  </div>
                ) : null}
              </header>

              {aboutError ? <div className="ds-alert ds-alert--error">{aboutError}</div> : null}

              {aboutLoading && !about ? (
                <div className="ops-users__empty">
                  <RefreshCw size={22} />
                  <h3>Loading product info…</h3>
                </div>
              ) : null}

              {about ? (
                <>
                  {about.updateAvailable && about.latestRelease ? (
                    <div className="ops-about__update-banner">
                      <CircleAlert size={15} aria-hidden />
                      <div>
                        <strong>
                          {about.latestRelease.name || about.latestRelease.tag} is available
                        </strong>
                        <small>
                          {about.latestRelease.publishedAt
                            ? `Published ${new Date(about.latestRelease.publishedAt).toLocaleDateString()}`
                            : 'Newer tagged release on GitHub'}
                          {' · '}
                          you are on v{about.version}
                        </small>
                      </div>
                      <a
                        className="ops-user__btn is-ghost"
                        href={about.latestRelease.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Release notes <ExternalLink size={12} />
                      </a>
                    </div>
                  ) : null}

                  <section className="ops-about__sheet" aria-label="Capabilities">
                    <header className="ops-about__sheet-head">
                      <div>
                        <h3>What you get</h3>
                        <p>Core surfaces in this billing install.</p>
                      </div>
                    </header>
                    <div className="ops-about__caps">
                      {about.capabilities.map((cap) => {
                        const Icon = ABOUT_CAP_ICONS[cap.id] || Boxes;
                        return (
                          <article key={cap.id} className="ops-about__cap">
                            <span aria-hidden>
                              <Icon size={15} />
                            </span>
                            <div>
                              <strong>{cap.label}</strong>
                              <small>{cap.detail}</small>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <div className="ops-about__board">
                    <section className="ops-about__col">
                      <header className="ops-about__col-head">
                        <BookOpen size={14} aria-hidden />
                        <div>
                          <h3>Product</h3>
                          <p>{about.tagline}</p>
                        </div>
                      </header>
                      <p className="ops-about__copy">
                        Billing and Panel are separate apps. This install is the storefront + admin
                        desk; game servers live in Spirit-Panel and sync over the Application API.
                      </p>
                      <div className="ops-about__links">
                        <a href={about.links.repo} target="_blank" rel="noopener noreferrer">
                          <Github size={14} /> Repository <ExternalLink size={12} />
                        </a>
                        <a href={about.links.releases} target="_blank" rel="noopener noreferrer">
                          Releases <ExternalLink size={12} />
                        </a>
                        <a href={about.links.changelog} target="_blank" rel="noopener noreferrer">
                          Changelog <ExternalLink size={12} />
                        </a>
                        <a href={about.links.installDocs} target="_blank" rel="noopener noreferrer">
                          Install docs <ExternalLink size={12} />
                        </a>
                        <a href={about.links.panel} target="_blank" rel="noopener noreferrer">
                          <Server size={14} /> Spirit-Panel <ExternalLink size={12} />
                        </a>
                      </div>
                    </section>

                    <section className="ops-about__col">
                      <header className="ops-about__col-head">
                        <Cpu size={14} aria-hidden />
                        <div>
                          <h3>Runtime</h3>
                          <p>Live details from this API process.</p>
                        </div>
                      </header>
                      <dl className="ops-about__facts">
                        <div>
                          <dt>Node</dt>
                          <dd>{about.runtime.node}</dd>
                        </div>
                        <div>
                          <dt>Platform</dt>
                          <dd>{about.runtime.platform}</dd>
                        </div>
                        <div>
                          <dt>Environment</dt>
                          <dd>{about.runtime.env}</dd>
                        </div>
                        <div>
                          <dt>Uptime</dt>
                          <dd>{about.runtime.uptime}</dd>
                        </div>
                        <div>
                          <dt>Installer</dt>
                          <dd>v{about.installerVersion}</dd>
                        </div>
                        <div>
                          <dt>License</dt>
                          <dd>{about.license}</dd>
                        </div>
                      </dl>
                      <div className="ops-about__stack">
                        {about.stack.map((item) => (
                          <div key={item.id}>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="ops-about__update">
                    <header className="ops-about__col-head">
                      <RefreshCw size={14} aria-hidden />
                      <div>
                        <h3>Update from GitHub</h3>
                        <p>
                          Run on the billing host. Prefer the menu, or a channel command with{' '}
                          <code>-y</code>.
                        </p>
                      </div>
                    </header>
                    <div className="ops-about__channels">
                      {about.channels.map((channel) => {
                        const preferred =
                          (about.updateAvailable && channel.id === 'release')
                          || (!about.updateAvailable && !about.latestRelease && channel.id === 'dev')
                          || (about.latestRelease && !about.updateAvailable && channel.id === 'menu');
                        return (
                          <div
                            key={channel.id}
                            className={`ops-about__cmd${preferred ? ' is-preferred' : ''}`}
                          >
                            <div className="ops-about__cmd-head">
                              <div>
                                <strong>{channel.label}</strong>
                                <small>{channel.hint}</small>
                              </div>
                              {preferred ? <em>Recommended</em> : null}
                              <button
                                type="button"
                                className="ops-user__btn is-ghost"
                                onClick={() => {
                                  void navigator.clipboard.writeText(channel.command).then(() => {
                                    setCopiedHint(channel.id);
                                    window.setTimeout(() => setCopiedHint(''), 1600);
                                  });
                                }}
                              >
                                <Copy size={14} /> {copiedHint === channel.id ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <code>{channel.command}</code>
                          </div>
                        );
                      })}
                    </div>
                    <footer className="ops-about__foot">
                      <span>
                        <strong>release</strong> = GitHub Releases · <strong>dev</strong> ={' '}
                        <code>main</code>
                      </span>
                      <span>Built by {about.builtBy}</span>
                    </footer>
                  </section>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
