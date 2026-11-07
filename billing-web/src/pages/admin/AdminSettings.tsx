import { FormEvent, useEffect, useState } from 'react';
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
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api, ApiError, safeExternalHref } from '../../lib/api';
import { useBranding } from '../../context/BrandingContext';
import { ThemedSelect } from '../../components/ThemedSelect';

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
  invoicePrefix: string;
  defaultCurrency: string;
  invoiceDueDays: number;
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
  invoicePrefix: 'INV',
  defaultCurrency: 'GBP',
  invoiceDueDays: 7,
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
      invoiceDueDays: data.invoiceDueDays || 7,
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
  const liveLogo = form.logoUrl.trim();
  const showLogoPreview = Boolean(liveLogo && /^https?:\/\//i.test(liveLogo) && !logoBroken);
  const previewAccent = /^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : 'var(--accent)';
  const previewSecondary = /^#[0-9a-fA-F]{6}$/.test(form.secondaryColor)
    ? form.secondaryColor
    : 'var(--accent-secondary)';
  const sampleInvoice = `${(form.invoicePrefix || 'INV').toUpperCase()}-${new Date().getFullYear()}-00001`;
  const panelHref = safeExternalHref(form.panelWebUrl);

  if (loading) {
    return <div className="ds-muted">Loading settings…</div>;
  }

  return (
    <div className="settings-v2">
      <header className="settings-v2__header">
        <div>
          <span>Platform configuration</span>
          <h1>Settings</h1>
          <p>Brand the client area, configure billing defaults, manage maintenance, and keep Spirit-Panel linked.</p>
        </div>
        <div className="settings-v2__summary">
          <Settings2 size={16} />
          <span>
            <strong>{form.maintenanceMode ? 'Maintenance on' : panelVerified ? 'Panel verified' : linkReady ? 'Panel configured' : 'Setup incomplete'}</strong>
            <small>{form.companyName || 'Spirit Host'} · {form.defaultCurrency}</small>
          </span>
        </div>
      </header>

      <section className="settings-v2-metrics">
        <article>
          <span className="is-blue"><Palette size={16} /></span>
          <div>
            <small>Brand</small>
            <strong>{form.companyName || 'Unset'}</strong>
            <p>{form.tagline || 'Billing'} subtitle</p>
          </div>
        </article>
        <article>
          <span className="is-green"><ReceiptText size={16} /></span>
          <div>
            <small>Invoices</small>
            <strong>{form.invoicePrefix}</strong>
            <p>Due in {form.invoiceDueDays} day{form.invoiceDueDays === 1 ? '' : 's'}</p>
          </div>
        </article>
        <article>
          <span className={form.maintenanceMode ? 'is-amber' : 'is-green'}><ShieldCheck size={16} /></span>
          <div>
            <small>Security</small>
            <strong>{form.maintenanceMode ? 'Maintenance' : form.turnstileEnabled ? 'Turnstile on' : 'Open'}</strong>
            <p>{form.turnstileEnabled ? 'Bot protection active' : 'Captcha optional'}</p>
          </div>
        </article>
        <article>
          <span className={panelVerified ? 'is-green' : linkReady ? 'is-amber' : 'is-red'}><PlugZap size={16} /></span>
          <div>
            <small>Panel link</small>
            <strong>{panelVerified ? 'Verified' : linkReady ? 'Configured' : 'Needs setup'}</strong>
            <p>
              {panelVerified
                ? `${testResult!.latencyMs}ms · ${testResult!.brandingName || 'Spirit-Panel'}`
                : form.panelKeyConfigured
                  ? `${form.panelKeyMasked} · test to verify`
                  : 'API key missing'}
            </p>
          </div>
        </article>
      </section>

      <nav className="settings-v2-tabs" aria-label="Settings sections">
        {([
          ['brand', 'Brand', <Palette size={14} key="b" />],
          ['billing', 'Billing', <ReceiptText size={14} key="i" />],
          ['security', 'Security', <ShieldCheck size={14} key="s" />],
          ['panel', 'Spirit-Panel', <Link2 size={14} key="p" />],
        ] as const).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            className={tab === value ? 'is-active' : ''}
            onClick={() => {
              setTab(value);
              setError('');
              setMessage('');
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      {tab === 'brand' && (
        <div className="settings-v2-layout">
          <form className="settings-v2-card" onSubmit={saveBrand}>
            <header>
              <div>
                <span>Identity</span>
                <h2>Brand & appearance</h2>
                <p>Control how Spirit Billing looks across the client area and browser chrome.</p>
              </div>
              <Sparkles size={17} />
            </header>

            <div className="settings-v2-fields">
              <label>
                <span>Company name</span>
                <input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>Sidebar subtitle</span>
                <input
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  placeholder="Billing"
                  required
                />
              </label>
              <label>
                <span>Logo URL</span>
                <input
                  type="url"
                  placeholder="https://cdn.example.com/logo.png"
                  value={form.logoUrl}
                  onChange={(e) => {
                    setLogoBroken(false);
                    setForm({ ...form, logoUrl: e.target.value });
                  }}
                />
                <small>Public image URL. Leave blank for the default mark.</small>
              </label>
              <label>
                <span>Favicon URL</span>
                <input
                  type="url"
                  placeholder="https://cdn.example.com/favicon.ico"
                  value={form.faviconUrl}
                  onChange={(e) => setForm({ ...form, faviconUrl: e.target.value })}
                />
                <small>Browser tab icon. Leave blank to keep the current favicon.</small>
              </label>
              <label>
                <span>Accent color</span>
                <div className="settings-v2-color">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : '#6366f1'}
                    onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                    aria-label="Accent color picker"
                  />
                  <input
                    value={form.accentColor}
                    onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                    placeholder="#6366f1"
                  />
                </div>
                <small>Optional billing override. Leave blank to inherit from Spirit-Panel.</small>
              </label>
              <label>
                <span>Secondary color</span>
                <div className="settings-v2-color">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.secondaryColor) ? form.secondaryColor : '#22d3ee'}
                    onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    aria-label="Secondary color picker"
                  />
                  <input
                    value={form.secondaryColor}
                    onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    placeholder="#22d3ee"
                  />
                </div>
              </label>
              <label>
                <span>Support email</span>
                <input
                  type="email"
                  placeholder="support@spirithost.local"
                  value={form.supportEmail}
                  onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                />
              </label>
              <label>
                <span>Support URL</span>
                <input
                  type="url"
                  placeholder="https://spirithost.local/support"
                  value={form.supportUrl}
                  onChange={(e) => setForm({ ...form, supportUrl: e.target.value })}
                />
              </label>
              <label>
                <span>Terms of service URL</span>
                <input
                  type="url"
                  placeholder="https://spirithost.local/terms"
                  value={form.termsUrl}
                  onChange={(e) => setForm({ ...form, termsUrl: e.target.value })}
                />
              </label>
              <label>
                <span>Privacy policy URL</span>
                <input
                  type="url"
                  placeholder="https://spirithost.local/privacy"
                  value={form.privacyUrl}
                  onChange={(e) => setForm({ ...form, privacyUrl: e.target.value })}
                />
              </label>
            </div>

            <label className="settings-v2-textarea">
              <span>Announcement banner</span>
              <textarea
                rows={3}
                maxLength={280}
                value={form.announcementBanner}
                onChange={(e) => setForm({ ...form, announcementBanner: e.target.value })}
                placeholder="Optional notice shown at the top of the client area (max 280 characters)."
              />
              <small>Leave blank to hide. Shown to signed-in clients under the top bar.</small>
            </label>

            <footer>
              <button type="submit" disabled={saving}>
                <Save size={14} /> {saving ? 'Saving…' : 'Save brand settings'}
              </button>
            </footer>
          </form>

          <aside className="settings-v2-preview">
            <header>
              <span>Live preview</span>
              <small>Sidebar brand</small>
            </header>
            <div
              className="settings-v2-preview__brand"
              style={{ ['--preview-accent' as string]: previewAccent, ['--preview-secondary' as string]: previewSecondary }}
            >
              {showLogoPreview ? (
                <img src={liveLogo} alt="" onError={() => setLogoBroken(true)} />
              ) : (
                <div className="settings-v2-preview__mark" />
              )}
              <div>
                <strong>{form.companyName || 'Company'}</strong>
                <small>{form.tagline || 'Billing'}</small>
              </div>
            </div>
            <div className="settings-v2-preview__swatches">
              <span style={{ background: previewAccent }} />
              <span style={{ background: previewSecondary }} />
              <div>
                <strong>Theme accents</strong>
                <small>Buttons, links, and highlights</small>
              </div>
            </div>
            {(form.supportEmail || form.supportUrl) && (
              <div className="settings-v2-preview__support">
                <ShieldCheck size={14} />
                <span>
                  <strong>Support</strong>
                  <small>{form.supportEmail || form.supportUrl}</small>
                </span>
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === 'billing' && (
        <div className="settings-v2-layout">
          <form className="settings-v2-card" onSubmit={saveBilling}>
            <header>
              <div>
                <span>Commerce</span>
                <h2>Billing defaults</h2>
                <p>Invoice numbering, payment window, currency, and manual payment instructions.</p>
              </div>
              <ReceiptText size={17} />
            </header>

            <div className="settings-v2-fields settings-v2-fields--3">
              <label>
                <span>Invoice prefix</span>
                <input
                  value={form.invoicePrefix}
                  onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value.toUpperCase() })}
                  maxLength={12}
                  required
                />
                <small>Letters and numbers only. Example: {sampleInvoice}</small>
              </label>
              <label>
                <span>Default currency</span>
                <ThemedSelect
                  ariaLabel="Default currency"
                  value={form.defaultCurrency}
                  onChange={(defaultCurrency) => setForm({ ...form, defaultCurrency })}
                  options={CURRENCY_OPTIONS}
                />
              </label>
              <label>
                <span>Invoice due days</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={form.invoiceDueDays}
                  onChange={(e) => setForm({ ...form, invoiceDueDays: Number(e.target.value) || 1 })}
                  required
                />
                <small>Days the client has to pay after an invoice is created (checkout and renewals).</small>
              </label>
              <label>
                <span>Suspend after (days past due)</span>
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
                <small>Unpaid renewal invoices suspend the running server after this many days past due.</small>
              </label>
              <label>
                <span>Terminate after (days past due)</span>
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
                <small>
                  Then permanently delete the panel server and cancel the service. Must be ≥ suspend days
                  (default 14). New checkout orders are never provisioned until paid.
                </small>
              </label>
            </div>

            <label className="settings-v2-textarea">
              <span>Manual payment instructions</span>
              <textarea
                rows={7}
                value={form.paymentInstructions}
                onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
                required
              />
              <small>Shown on unpaid invoices in the client area.</small>
            </label>

            <label className="settings-v2-textarea">
              <span>Invoice footer note</span>
              <textarea
                rows={3}
                maxLength={500}
                value={form.invoiceFooter}
                onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })}
                placeholder="Keep this invoice for your records. Quote the invoice number when contacting support."
              />
              <small>Appears at the bottom of invoice documents. Leave blank for the default note.</small>
            </label>

            <footer>
              <button type="submit" disabled={saving}>
                <Save size={14} /> {saving ? 'Saving…' : 'Save billing settings'}
              </button>
            </footer>
          </form>

          <aside className="settings-v2-preview">
            <header>
              <span>Invoice sample</span>
              <small>Next number format</small>
            </header>
            <div className="settings-v2-preview__invoice">
              <small>Invoice</small>
              <strong>{sampleInvoice}</strong>
              <p>Due in {form.invoiceDueDays} day{form.invoiceDueDays === 1 ? '' : 's'} · {form.defaultCurrency}</p>
            </div>
            <div className="settings-v2-preview__payment">
              <Globe2 size={14} />
              <span>
                <strong>Payment copy</strong>
                <small>{form.paymentInstructions.slice(0, 120) || 'No instructions yet'}{form.paymentInstructions.length > 120 ? '…' : ''}</small>
              </span>
            </div>
          </aside>
        </div>
      )}

      {tab === 'panel' && (
        <div className="settings-v2-layout">
          <form className="settings-v2-card" onSubmit={savePanel}>
            <header>
              <div>
                <span>Integration</span>
                <h2>Spirit-Panel linking</h2>
                <p>Connect billing to your game panel for account sync and provisioning.</p>
              </div>
              <span className={panelVerified ? 'is-ready' : form.panelKeyConfigured ? 'is-warn' : 'is-warn'}>
                {panelVerified ? 'Verified' : form.panelKeyConfigured ? 'Configured' : 'Key missing'}
              </span>
            </header>

            <ol className="settings-v2-steps">
              <li>Create an Application API key in Panel Admin with <code>users.write</code> and server scopes.</li>
              <li>Set the Panel API URL and the web URL clients open.</li>
              <li>Paste the key, save, then run <strong>Test connection</strong> — Configured is not the same as Verified.</li>
            </ol>

            <div className="settings-v2-fields">
              <label>
                <span>Panel API URL</span>
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
                <small>Base URL of panel-api (no trailing slash).</small>
              </label>
              <label>
                <span>Panel web URL</span>
                <input
                  type="url"
                  placeholder="https://panel.spirithost.co.uk"
                  value={form.panelWebUrl}
                  onChange={(e) => setForm({ ...form, panelWebUrl: e.target.value })}
                  required
                />
                <small>Used for “Open game panel” in the client area.</small>
              </label>
            </div>

            <label className={`coupon-v2-toggle ${form.panelAllowPrivateUrls ? 'is-active' : ''}`} style={{ margin: '0 .85rem .85rem' }}>
              <span><ShieldCheck size={15} /></span>
              <span>
                <strong>Allow private panel URLs</strong>
                <small>
                  Permit localhost / RFC1918 API hosts in production (lab installs). Prefer a public HTTPS URL when possible.
                </small>
              </span>
              <input
                type="checkbox"
                checked={form.panelAllowPrivateUrls}
                onChange={(e) => {
                  setTestResult(null);
                  setForm({ ...form, panelAllowPrivateUrls: e.target.checked });
                }}
              />
            </label>

            <label className="settings-v2-textarea">
              <span>Application API key</span>
              <div className="settings-v2-key">
                <KeyRound size={15} />
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
              <small>
                {form.panelKeyConfigured
                  ? `Saved key: ${form.panelKeyMasked}. Leave blank to keep the current key.`
                  : 'Paste a new Application API key — it is stored encrypted in the database.'}
              </small>
            </label>

            <footer className="settings-v2-footer-row">
              <button type="submit" disabled={saving}>
                <Save size={14} /> {saving ? 'Saving…' : 'Save panel link'}
              </button>
              <button type="button" disabled={testing} onClick={() => void testConnection()}>
                <PlugZap size={14} /> {testing ? 'Testing…' : 'Test connection'}
              </button>
              {form.panelKeyConfigured && (
                <button type="button" disabled={clearingKey || saving} onClick={() => void clearPanelKey()}>
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
              <div className={`settings-v2-test ${testResult.ok ? 'is-ok' : 'is-bad'}`}>
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

          <aside className="settings-v2-preview">
            <header>
              <span>Link health</span>
              <small>Configured vs verified</small>
            </header>
            <div className={`settings-v2-preview__status ${panelVerified ? 'is-ready' : ''}`}>
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
            <div className="settings-v2-preview__rows">
              <div><span>API</span><strong>{form.panelApiUrl || 'Not set'}</strong></div>
              <div><span>Web</span><strong>{form.panelWebUrl || 'Not set'}</strong></div>
              <div><span>Key</span><strong>{form.panelKeyConfigured ? form.panelKeyMasked : 'Missing'}</strong></div>
              <div><span>Private URLs</span><strong>{form.panelAllowPrivateUrls ? 'Allowed' : 'Blocked'}</strong></div>
              <div><span>Last test</span><strong>{testResult ? (testResult.ok ? 'Passed' : 'Failed') : 'Not run'}</strong></div>
            </div>
          </aside>
        </div>
      )}

      {tab === 'security' && (
        <div className="settings-v2-layout">
          <form className="settings-v2-card" onSubmit={saveSecurity}>
            <header>
              <div>
                <span>Access control</span>
                <h2>Security & maintenance</h2>
                <p>Lock the client area during maintenance and protect login with Cloudflare Turnstile.</p>
              </div>
              <ShieldCheck size={17} />
            </header>

            <label className={`coupon-v2-toggle ${form.maintenanceMode ? 'is-active' : ''}`}>
              <span><CircleAlert size={15} /></span>
              <span>
                <strong>Maintenance mode</strong>
                <small>Clients cannot log in or use the billing area. Admins can still sign in.</small>
              </span>
              <input
                type="checkbox"
                checked={form.maintenanceMode}
                onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
              />
            </label>

            <label className="settings-v2-textarea" style={{ marginTop: '0.85rem' }}>
              <span>Maintenance message</span>
              <textarea
                rows={3}
                value={form.maintenanceMessage}
                onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
                placeholder="Billing is temporarily down for maintenance. Please check back soon."
              />
            </label>

            <label className={`coupon-v2-toggle ${form.registrationEnabled ? 'is-active' : ''}`} style={{ marginTop: '1rem' }}>
              <span><Globe2 size={15} /></span>
              <span>
                <strong>User registration</strong>
                <small>Show the signup option and allow new client accounts to be created.</small>
              </span>
              <input
                type="checkbox"
                checked={form.registrationEnabled}
                onChange={(e) => setForm({ ...form, registrationEnabled: e.target.checked })}
              />
            </label>

            <label className={`coupon-v2-toggle ${form.ticketsEnabled ? 'is-active' : ''}`} style={{ marginTop: '1rem' }}>
              <span><ShieldCheck size={15} /></span>
              <span>
                <strong>Support tickets</strong>
                <small>Allow clients to open tickets, upload screenshots, and chat with staff.</small>
              </span>
              <input
                type="checkbox"
                checked={form.ticketsEnabled}
                onChange={(e) => setForm({ ...form, ticketsEnabled: e.target.checked })}
              />
            </label>

            <label className={`coupon-v2-toggle ${form.turnstileEnabled ? 'is-active' : ''}`} style={{ marginTop: '1rem' }}>
              <span><ShieldCheck size={15} /></span>
              <span>
                <strong>Cloudflare Turnstile</strong>
                <small>Require a bot check on login and registration when enabled.</small>
              </span>
              <input
                type="checkbox"
                checked={form.turnstileEnabled}
                onChange={(e) => setForm({ ...form, turnstileEnabled: e.target.checked })}
              />
            </label>

            <div className="settings-v2-fields" style={{ marginTop: '0.85rem' }}>
              <label>
                <span>Turnstile site key</span>
                <input
                  value={form.turnstileSiteKey}
                  onChange={(e) => setForm({ ...form, turnstileSiteKey: e.target.value })}
                  placeholder="0x4AAAAAAA…"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>Turnstile secret key</span>
                <div className="settings-v2-key">
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
                  <button type="button" onClick={() => setShowTurnstileSecret((v) => !v)} aria-label="Toggle secret visibility">
                    {showTurnstileSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>
            </div>

            <p className="ds-muted" style={{ margin: '0.75rem 0 0', fontSize: '0.72rem' }}>
              Leave the secret blank to keep the existing key. Create keys in the Cloudflare Turnstile dashboard,
              then enable the toggle once both site and secret keys are set.
            </p>

            <footer className="settings-v2-footer-row">
              <button className="ds-btn ds-btn--primary" type="submit" disabled={saving}>
                <Save size={15} /> {saving ? 'Saving…' : 'Save security'}
              </button>
            </footer>
          </form>

          <aside className="settings-v2-preview">
            <header>
              <div>
                <span>Live status</span>
                <h2>Security overview</h2>
              </div>
              <Globe2 size={16} />
            </header>
            <div className={`settings-v2-preview__status ${form.maintenanceMode ? '' : 'is-ready'}`}>
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
            <div className="settings-v2-preview__rows">
              <div><span>Maintenance</span><strong>{form.maintenanceMode ? 'On' : 'Off'}</strong></div>
              <div><span>Registration</span><strong>{form.registrationEnabled ? 'Enabled' : 'Disabled'}</strong></div>
              <div><span>Tickets</span><strong>{form.ticketsEnabled ? 'Enabled' : 'Disabled'}</strong></div>
              <div><span>Turnstile</span><strong>{form.turnstileEnabled ? 'Enabled' : 'Off'}</strong></div>
              <div><span>Site key</span><strong>{form.turnstileSiteKey ? 'Set' : 'Missing'}</strong></div>
              <div><span>Secret</span><strong>{form.turnstileSecretConfigured ? form.turnstileSecretMasked || 'Configured' : 'Missing'}</strong></div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
