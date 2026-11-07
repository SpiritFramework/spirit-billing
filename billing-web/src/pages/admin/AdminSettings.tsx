import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  ExternalLink,
  Globe2,
  KeyRound,
  Link2,
  Palette,
  PlugZap,
  ReceiptText,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError, safeExternalHref } from '../../lib/api';
import { useBranding } from '../../context/BrandingContext';
import { ThemedSelect } from '../../components/ThemedSelect';
import { BrandingStudio } from './BrandingStudio';
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

type Tab = 'brand' | 'billing' | 'panel' | 'security';

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
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`settings-stage-field${wide ? ' is-wide' : ''}`}>
      <span className="settings-stage-field__label">{label}</span>
      {children}
      {hint ? <small className="settings-stage-field__hint">{hint}</small> : null}
    </label>
  );
}

function Switch({
  checked,
  onChange,
  title,
  description,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <label className={`settings-stage-switch${checked ? ' is-on' : ''}`}>
      <span className="settings-stage-switch__icon" aria-hidden>
        {icon}
      </span>
      <span className="settings-stage-switch__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i aria-hidden />
    </label>
  );
}

export function AdminSettings() {
  const { refreshBranding } = useBranding();
  const [tab, setTab] = useState<Tab>('brand');
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

  const sections: { id: Tab; label: string; hint: string; icon: ReactNode }[] = [
    { id: 'brand', label: 'Brand', hint: 'Theme look & colors', icon: <Palette size={15} /> },
    { id: 'billing', label: 'Billing', hint: `${form.invoicePrefix} · ${form.defaultCurrency}`, icon: <ReceiptText size={15} /> },
    {
      id: 'security',
      label: 'Security',
      hint: form.maintenanceMode ? 'Maintenance' : form.turnstileEnabled ? 'Turnstile' : 'Access',
      icon: <ShieldCheck size={15} />,
    },
    {
      id: 'panel',
      label: 'Panel',
      hint: panelVerified ? 'Verified' : linkReady ? 'Configured' : 'Needs setup',
      icon: <Link2 size={15} />,
    },
  ];

  if (loading) {
    return <div className="ds-muted">Loading settings…</div>;
  }

  return (
    <div className="settings-stage">
      <header className="settings-stage__intro">
        <div>
          <h1>Settings</h1>
          <p>Configure brand, billing defaults, access control, and the Spirit-Panel connection.</p>
        </div>
        <p className={`settings-stage__pulse${form.maintenanceMode ? ' is-warn' : panelVerified ? ' is-ok' : ''}`}>
          {form.maintenanceMode
            ? 'Maintenance on'
            : panelVerified
              ? 'Panel verified'
              : linkReady
                ? 'Panel configured'
                : 'Setup incomplete'}
        </p>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <nav className="settings-stage__tabs" aria-label="Settings sections">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={tab === section.id ? 'is-active' : ''}
            onClick={() => {
              setTab(section.id);
              setError('');
              setMessage('');
            }}
          >
            <span aria-hidden>{section.icon}</span>
            <span>
              <strong>{section.label}</strong>
              <small>{section.hint}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="settings-stage__shell">
        {tab === 'brand' ? (
          <BrandingStudio
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
        ) : (
        <div className="settings-stage__workspace">
          {tab === 'billing' && (
            <>
              <form className="settings-stage-form" onSubmit={saveBilling}>
                <header className="settings-stage-form__head">
                  <h2>Billing defaults</h2>
                  <p>Invoice numbering, payment window, and manual payment copy.</p>
                </header>

                <div className="settings-stage-grid is-3">
                  <Field label="Invoice prefix" hint={`Example: ${sampleInvoice}`}>
                    <input
                      value={form.invoicePrefix}
                      onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value.toUpperCase() })}
                      maxLength={12}
                      required
                    />
                  </Field>
                  <Field label="Default currency">
                    <ThemedSelect
                      ariaLabel="Default currency"
                      value={form.defaultCurrency}
                      onChange={(defaultCurrency) => setForm({ ...form, defaultCurrency })}
                      options={CURRENCY_OPTIONS}
                    />
                  </Field>
                  <Field label="Invoice due days" hint="Days to pay after an invoice is created.">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={form.invoiceDueDays}
                      onChange={(e) => setForm({ ...form, invoiceDueDays: Number(e.target.value) || 1 })}
                      required
                    />
                  </Field>
                  <Field
                    label="Service delete refund window"
                    hint="Clients can get a prorated credit refund when deleting within this many days of purchase. After that they can still delete, with no refund. Set 0 to disable refunds."
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
                  <Field label="Suspend after (days past due)" hint="Unpaid renewals suspend the server after this many days.">
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
                    wide
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
                  <Field label="Manual payment instructions" hint="Shown on unpaid invoices." wide>
                    <textarea
                      rows={7}
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

                <footer className="settings-stage-form__foot">
                  <button type="submit" disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving…' : 'Save billing'}
                  </button>
                </footer>
              </form>

              <aside className="settings-stage-context">
                <p className="settings-stage-context__label">Invoice sample</p>
                <div className="settings-stage-invoice">
                  <small>Next format</small>
                  <strong>{sampleInvoice}</strong>
                  <p>
                    Due in {form.invoiceDueDays} day{form.invoiceDueDays === 1 ? '' : 's'} · {form.defaultCurrency}
                  </p>
                </div>
                <p className="settings-stage-context__note">
                  {form.paymentInstructions.slice(0, 140) || 'No payment instructions yet'}
                  {form.paymentInstructions.length > 140 ? '…' : ''}
                </p>
              </aside>
            </>
          )}

          {tab === 'panel' && (
            <>
              <form className="settings-stage-form" onSubmit={savePanel}>
                <header className="settings-stage-form__head">
                  <h2>Spirit-Panel link</h2>
                  <p>Connect billing for account sync and provisioning.</p>
                </header>

                <ol className="settings-stage-steps">
                  <li>Create an Application API key in Panel Admin with <code>users.write</code> and server scopes.</li>
                  <li>Set the Panel API URL and the web URL clients open.</li>
                  <li>Paste the key, save, then run <strong>Test connection</strong> — configured is not verified.</li>
                </ol>

                <div className="settings-stage-grid">
                  <Field label="Panel API URL" hint="Base URL of panel-api (no trailing slash).">
                    <input
                      type="url"
                      placeholder="https://panel.spirithost.co.uk"
                      value={form.panelApiUrl}
                      onChange={(e) => {
                        setTestResult(null);
                        setForm({ ...form, panelApiUrl: e.target.value });
                      }}
                      required
                    />
                  </Field>
                  <Field label="Panel web URL" hint="Used for “Open game panel” in the client area.">
                    <input
                      type="url"
                      placeholder="https://panel.spirithost.co.uk"
                      value={form.panelWebUrl}
                      onChange={(e) => setForm({ ...form, panelWebUrl: e.target.value })}
                      required
                    />
                  </Field>
                  <Field
                    label="Application API key"
                    hint={
                      form.panelKeyConfigured
                        ? `Saved key: ${form.panelKeyMasked}. Leave blank to keep the current key.`
                        : 'Paste a new Application API key — stored encrypted in the database.'
                    }
                    wide
                  >
                    <div className="settings-stage-secret">
                      <KeyRound size={15} aria-hidden />
                      <input
                        type={showKey ? 'text' : 'password'}
                        placeholder={form.panelKeyMasked || 'sp_identifier.secret'}
                        value={apiKeyDraft}
                        onChange={(e) => {
                          setTestResult(null);
                          setApiKeyDraft(e.target.value);
                        }}
                        autoComplete="off"
                      />
                      <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide key' : 'Show key'}>
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                </div>

                <Switch
                  checked={form.panelAllowPrivateUrls}
                  onChange={(panelAllowPrivateUrls) => {
                    setTestResult(null);
                    setForm({ ...form, panelAllowPrivateUrls });
                  }}
                  icon={<ShieldCheck size={15} />}
                  title="Allow private panel URLs"
                  description="Permit localhost / RFC1918 API hosts in production (lab installs)."
                />

                <footer className="settings-stage-form__foot is-row">
                  <button type="submit" disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving…' : 'Save panel link'}
                  </button>
                  <button type="button" className="is-ghost" disabled={testing} onClick={() => void testConnection()}>
                    <PlugZap size={14} /> {testing ? 'Testing…' : 'Test connection'}
                  </button>
                  {form.panelKeyConfigured && (
                    <button type="button" className="is-ghost" disabled={clearingKey || saving} onClick={() => void clearPanelKey()}>
                      <KeyRound size={14} /> {clearingKey ? 'Clearing…' : 'Clear key'}
                    </button>
                  )}
                  {panelHref && (
                    <a href={panelHref} target="_blank" rel="noopener noreferrer">
                      Open panel <ExternalLink size={13} />
                    </a>
                  )}
                </footer>

                {testResult && (
                  <div className={`settings-stage-test${testResult.ok ? ' is-ok' : ' is-bad'}`}>
                    {testResult.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                    <span>
                      {testResult.ok ? (
                        <>
                          <strong>Verified</strong>
                          {' · '}
                          {testResult.latencyMs}ms
                          {typeof testResult.usersFound === 'number' ? ` · ${testResult.usersFound} panel users` : ''}
                          {testResult.brandingName ? ` · ${testResult.brandingName}` : ''}
                          {apiKeyDraft.trim() ? ' · draft values — save to persist' : ''}
                        </>
                      ) : (
                        <>
                          <strong>Connection failed</strong>
                          {' · '}
                          {testResult.error}
                        </>
                      )}
                    </span>
                  </div>
                )}
              </form>

              <aside className="settings-stage-context">
                <p className="settings-stage-context__label">Link health</p>
                <div className={`settings-stage-health${panelVerified ? ' is-ok' : ''}`}>
                  <i />
                  <div>
                    <strong>
                      {panelVerified
                        ? 'Verified and ready'
                        : linkReady
                          ? 'Configured — not verified yet'
                          : 'Setup still needed'}
                    </strong>
                    <small>
                      {panelVerified
                        ? 'Accounts and servers can sync to Spirit-Panel.'
                        : linkReady
                          ? 'URLs and key are saved. Run Test connection before relying on provisioning.'
                          : 'API URL, web URL, and an Application key are all required.'}
                    </small>
                  </div>
                </div>
                <dl className="settings-stage-facts">
                  <div><dt>API</dt><dd>{form.panelApiUrl || 'Not set'}</dd></div>
                  <div><dt>Web</dt><dd>{form.panelWebUrl || 'Not set'}</dd></div>
                  <div><dt>Key</dt><dd>{form.panelKeyConfigured ? form.panelKeyMasked : 'Missing'}</dd></div>
                  <div><dt>Private URLs</dt><dd>{form.panelAllowPrivateUrls ? 'Allowed' : 'Blocked'}</dd></div>
                  <div><dt>Last test</dt><dd>{testResult ? (testResult.ok ? 'Passed' : 'Failed') : 'Not run'}</dd></div>
                </dl>
              </aside>
            </>
          )}

          {tab === 'security' && (
            <>
              <form className="settings-stage-form" onSubmit={saveSecurity}>
                <header className="settings-stage-form__head">
                  <h2>Security & access</h2>
                  <p>Maintenance, registration, tickets, and Turnstile.</p>
                </header>

                <div className="settings-stage-switches">
                  <Switch
                    checked={form.maintenanceMode}
                    onChange={(maintenanceMode) => setForm({ ...form, maintenanceMode })}
                    icon={<CircleAlert size={15} />}
                    title="Maintenance mode"
                    description="Clients cannot log in or use billing. Admins can still sign in."
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
                    icon={<ShieldCheck size={15} />}
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

                <div className="settings-stage-grid">
                  <Field label="Turnstile site key">
                    <input
                      value={form.turnstileSiteKey}
                      onChange={(e) => setForm({ ...form, turnstileSiteKey: e.target.value })}
                      placeholder="0x4AAAAAAA…"
                      autoComplete="off"
                    />
                  </Field>
                  <Field
                    label="Turnstile secret key"
                    hint="Leave blank to keep the existing key."
                  >
                    <div className="settings-stage-secret">
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

                <footer className="settings-stage-form__foot">
                  <button type="submit" disabled={saving}>
                    <Save size={14} /> {saving ? 'Saving…' : 'Save security'}
                  </button>
                </footer>
              </form>

              <aside className="settings-stage-context">
                <p className="settings-stage-context__label">Access overview</p>
                <div className={`settings-stage-health${!form.maintenanceMode ? ' is-ok' : ''}`}>
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
                <dl className="settings-stage-facts">
                  <div><dt>Maintenance</dt><dd>{form.maintenanceMode ? 'On' : 'Off'}</dd></div>
                  <div><dt>Registration</dt><dd>{form.registrationEnabled ? 'Enabled' : 'Disabled'}</dd></div>
                  <div><dt>Tickets</dt><dd>{form.ticketsEnabled ? 'Enabled' : 'Disabled'}</dd></div>
                  <div><dt>Turnstile</dt><dd>{form.turnstileEnabled ? 'Enabled' : 'Off'}</dd></div>
                  <div><dt>Site key</dt><dd>{form.turnstileSiteKey ? 'Set' : 'Missing'}</dd></div>
                  <div><dt>Secret</dt><dd>{form.turnstileSecretConfigured ? form.turnstileSecretMasked || 'Configured' : 'Missing'}</dd></div>
                </dl>
              </aside>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
