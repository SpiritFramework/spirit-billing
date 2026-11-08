import { FormEvent, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Check,
  Gamepad2,
  ImagePlus,
  LayoutGrid,
  Monitor,
  Moon,
  Navigation,
  Palette,
  Pipette,
  Save,
  Server,
  Shuffle,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react';
import { api, ApiError, isBrandAssetUrl } from '../../lib/api';
import {
  AUTH_ATMOSPHERE_OPTIONS,
  NAV_LAYOUT_OPTIONS,
  SHELL_ATMOSPHERE_OPTIONS,
  type AuthAtmosphere,
  type NavLayout,
  type ShellAtmosphere,
} from '../../lib/layout-atmosphere';
import {
  ACCENT_PAIRS,
  accentsForSurface,
  contrastRatio,
  DENSITY_TOKENS,
  matchAccentPair,
  NAVBAR_STYLE_OPTIONS,
  presetWash,
  RADIUS_TOKENS,
  resolveThemeMode,
  SIDEBAR_STYLE_OPTIONS,
  SIDEBAR_SURFACES,
  SURFACE_PRESETS,
  surfaceWash,
  THEME_MODE_OPTIONS,
  type NamedThemePreset,
  type NavbarStyle,
  type SidebarStyle,
  type ThemeMode,
  type ThemePreset,
  type UiDensity,
  type UiRadius,
} from '../../lib/theme-presets';

export type BrandStudioForm = {
  companyName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  accentColor: string;
  secondaryColor: string;
  supportEmail: string;
  supportUrl: string;
  termsUrl: string;
  privacyUrl: string;
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
};

type PreviewMode = 'atmosphere' | 'navigation' | 'servers';
export type BrandInspectorSection = 'theme' | 'colors' | 'identity' | 'layout' | 'assets';
type LayoutPane = 'navigation' | 'atmosphere';
type ShellPreview = 'client' | 'admin';

type Props = {
  form: BrandStudioForm;
  setForm: (next: BrandStudioForm) => void;
  saving: boolean;
  onSave: (e: FormEvent) => void;
  logoBroken: boolean;
  setLogoBroken: (broken: boolean) => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
  /** Hide mast + rail when Settings owns navigation. */
  embedded?: boolean;
  section?: BrandInspectorSection;
  onSectionChange?: (section: BrandInspectorSection) => void;
};

export const BRAND_SECTIONS: {
  id: BrandInspectorSection;
  label: string;
  hint: string;
  lede: string;
  icon: typeof Moon;
}[] = [
  {
    id: 'theme',
    label: 'Theme look',
    hint: 'Surfaces',
    lede: 'Surface presets for the whole panel. Accents are optional.',
    icon: Moon,
  },

  {
    id: 'colors',
    label: 'Colors',
    hint: 'Accents',
    lede: 'Accent and secondary colors used across buttons, links, and glows.',
    icon: Palette,
  },
  {
    id: 'identity',
    label: 'Identity',
    hint: 'Name & links',
    lede: 'Company name, support links, and client-facing notice copy.',
    icon: Sparkles,
  },
  {
    id: 'layout',
    label: 'Layout',
    hint: 'Nav & atmosphere',
    lede: 'Navigation chrome and animated login / panel backgrounds.',
    icon: LayoutGrid,
  },
  {
    id: 'assets',
    label: 'Assets',
    hint: 'Logo & favicon',
    lede: 'Upload or link the logo and favicon used in billing.',
    icon: ImagePlus,
  },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="brand-deck-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ChoiceRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="brand-deck-choice" role="group" aria-label={label}>
      <div className="brand-deck-choice__head">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="brand-deck-choice__row">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={value === opt.id ? 'is-active' : ''}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavLayoutPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: NavLayout;
  onChange: (next: NavLayout) => void;
}) {
  return (
    <div className="brand-deck-block brand-nav-picker">
      <div className="brand-deck-block__head">
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <div className="brand-nav-picker__grid" role="group" aria-label={label}>
        {NAV_LAYOUT_OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`brand-nav-card${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
            >
              <span className={`brand-nav-card__stage is-${opt.id}`} aria-hidden>
                {opt.id === 'sidebar' ? (
                  <>
                    <i className="brand-nav-card__rail">
                      <em />
                      <em />
                      <em className="is-on" />
                      <em />
                    </i>
                    <i className="brand-nav-card__pane">
                      <b />
                      <b />
                      <b />
                    </i>
                  </>
                ) : (
                  <>
                    <i className="brand-nav-card__bar">
                      <em className="is-mark" />
                      <em className="is-on" />
                      <em />
                      <em />
                      <em className="is-chip" />
                    </i>
                    <i className="brand-nav-card__pane is-wide">
                      <b />
                      <b />
                    </i>
                  </>
                )}
              </span>
              <span className="brand-nav-card__meta">
                <strong>{opt.label}</strong>
                <small>{opt.blurb}</small>
              </span>
              {active ? (
                <span className="brand-nav-card__check" aria-hidden>
                  <Check size={11} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChromeThemePicker({
  kind,
  label,
  hint,
  value,
  onChange,
}: {
  kind: 'sidebar' | 'navbar';
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const options = kind === 'sidebar' ? SIDEBAR_STYLE_OPTIONS : NAVBAR_STYLE_OPTIONS;
  return (
    <div className="brand-deck-block brand-chrome-picker">
      <div className="brand-deck-block__head">
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <div className="brand-chrome-picker__grid" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`brand-chrome-card${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
            >
              <span className={`brand-chrome-card__stage is-${kind} is-${opt.id}`} aria-hidden>
                {kind === 'sidebar' ? (
                  <>
                    <i className="brand-chrome-card__rail" />
                    <i className="brand-chrome-card__body">
                      <em />
                      <em />
                    </i>
                  </>
                ) : (
                  <>
                    <i className="brand-chrome-card__bar" />
                    <i className="brand-chrome-card__body is-wide">
                      <em />
                    </i>
                  </>
                )}
              </span>
              <span className="brand-chrome-card__meta">
                <strong>{opt.label}</strong>
                <small>{opt.blurb}</small>
              </span>
              {active ? (
                <span className="brand-chrome-card__check" aria-hidden>
                  <Check size={11} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SurfaceTile({
  id,
  active,
  mode,
  onSelect,
}: {
  id: NamedThemePreset;
  active: boolean;
  mode: 'light' | 'dark';
  onSelect: () => void;
}) {
  const preset = SURFACE_PRESETS[id];
  const tokens = preset[mode];
  return (
    <button
      type="button"
      className={`brand-deck-preset is-surface${active ? ' is-active' : ''}`}
      aria-pressed={active}
      title={preset.blurb}
      onClick={onSelect}
    >
      <span className="brand-deck-preset__stage" style={{ background: surfaceWash(id, mode) }} aria-hidden>
        <span className="brand-deck-preset__swatches">
          <i style={{ background: tokens.bg }} />
          <i style={{ background: tokens.surface }} />
          <i style={{ background: preset.accent }} />
        </span>
      </span>
      <span className="brand-deck-preset__meta">
        <strong>{preset.label}</strong>
        <small>{preset.blurb}</small>
      </span>
      {active ? (
        <span className="brand-deck-preset__check" aria-hidden>
          <Check size={11} />
        </span>
      ) : null}
    </button>
  );
}

function AccentTile({
  label,
  primary,
  secondary,
  active,
  onSelect,
}: {
  label: string;
  primary: string;
  secondary: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`brand-colors-pair${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="brand-colors-pair__wash" aria-hidden>
        <i style={{ background: primary }} />
        <i style={{ background: secondary }} />
      </span>
      <span className="brand-colors-pair__foot">
        <strong>{label}</strong>
        {active ? <Check size={13} /> : null}
      </span>
    </button>
  );
}

export function BrandingStudio({
  form,
  setForm,
  saving,
  onSave,
  logoBroken,
  setLogoBroken,
  onError,
  onMessage,
  embedded = false,
  section: controlledSection,
  onSectionChange,
}: Props) {
  const [preview, setPreview] = useState<PreviewMode>('atmosphere');
  const [internalSection, setInternalSection] = useState<BrandInspectorSection>('theme');
  const section = controlledSection ?? internalSection;
  const setSection = onSectionChange ?? setInternalSection;
  const [layoutPane, setLayoutPane] = useState<LayoutPane>('navigation');
  const [shellPreview, setShellPreview] = useState<ShellPreview>('client');
  const [uploading, setUploading] = useState<'logo' | 'favicon' | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const previewAccent = /^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : '#6366f1';
  const previewSecondary = /^#[0-9a-fA-F]{6}$/.test(form.secondaryColor)
    ? form.secondaryColor
    : '#8b5cf6';
  const showLogo = isBrandAssetUrl(form.logoUrl) && !logoBroken;
  const previewTheme = resolveThemeMode(form.themeMode);
  const radiusTokens = RADIUS_TOKENS[form.uiRadius];
  const densityTokens = DENSITY_TOKENS[form.uiDensity];
  const activeAccentPair = matchAccentPair(previewAccent, previewSecondary);
  const presetLabel =
    form.themePreset === 'custom'
      ? 'Custom surface'
      : SURFACE_PRESETS[form.themePreset]?.label ?? form.themePreset;
  const modeLabel =
    form.themeMode === 'system'
      ? `System → ${previewTheme}`
      : previewTheme === 'light'
        ? 'Light'
        : 'Dark';
  const activeSection = BRAND_SECTIONS.find((s) => s.id === section) ?? BRAND_SECTIONS[0];

  function patch(partial: Partial<BrandStudioForm>) {
    setForm({ ...form, ...partial });
  }

  function applySurface(preset: ThemePreset) {
    if (preset === 'custom') {
      patch({ themePreset: 'custom' });
      return;
    }
    const accents = accentsForSurface(preset);
    patch({
      themePreset: preset,
      accentColor: accents.accent,
      secondaryColor: accents.secondary,
    });
  }

  function applyAccentPair(primary: string, secondary: string) {
    patch({ accentColor: primary, secondaryColor: secondary });
  }

  function setManualColor(key: 'accentColor' | 'secondaryColor', value: string) {
    patch({ [key]: value });
  }

  async function uploadAsset(kind: 'logo' | 'favicon', file: File) {
    setUploading(kind);
    onError('');
    onMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);
      const uploaded = await api<{ url: string; kind: string }>(
        `/admin/settings/branding-upload?kind=${kind}`,
        { method: 'POST', body },
      );
      if (kind === 'logo') {
        setLogoBroken(false);
        patch({ logoUrl: uploaded.url });
      } else {
        patch({ faviconUrl: uploaded.url });
      }
      onMessage(`${kind === 'logo' ? 'Logo' : 'Favicon'} uploaded — save brand to apply.`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  return (
    <form
      className={`brand-deck${embedded ? ' is-embedded' : ''}`}
      onSubmit={onSave}
      style={{
        ['--preview-accent' as string]: previewAccent,
        ['--preview-secondary' as string]: previewSecondary,
        ['--preview-sidebar' as string]: SIDEBAR_SURFACES[form.sidebarStyle],
        ...radiusTokens,
        ...densityTokens,
      }}
      data-preview-theme={previewTheme}
    >
      {!embedded ? (
        <header className="brand-deck__mast">
          <div className="brand-deck__identity">
            <div className="brand-deck__mark" aria-hidden>
              {showLogo ? (
                <img src={form.logoUrl} alt="" onError={() => setLogoBroken(true)} />
              ) : (
                <Gamepad2 size={18} />
              )}
            </div>
            <div>
              <span>Brand studio</span>
              <h2>{form.companyName || 'Your brand'}</h2>
              <p>
                {form.tagline || 'Billing'} · {modeLabel} · {presetLabel}
              </p>
            </div>
          </div>
          <div className="brand-deck__mast-actions">
            <span
              className="brand-deck__chip"
              style={{ background: presetWash(previewAccent, previewSecondary) }}
              title={`${previewAccent} / ${previewSecondary}`}
            />
            <button type="submit" className="brand-deck__save" disabled={saving || Boolean(uploading)}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save brand'}
            </button>
          </div>
        </header>
      ) : null}

      <div className="brand-deck__body">
        {!embedded ? (
          <nav className="brand-deck__rail" aria-label="Brand sections">
            {BRAND_SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={section === item.id ? 'is-active' : ''}
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={15} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </button>
              );
            })}
          </nav>
        ) : null}

        <section className="brand-deck__editor" aria-labelledby="brand-deck-editor-title">
          <header className="brand-deck__editor-head">
            <div>
              <h3 id="brand-deck-editor-title">{activeSection.label}</h3>
              <p>{activeSection.lede}</p>
            </div>
            {embedded ? (
              <button type="submit" className="brand-deck__save" disabled={saving || Boolean(uploading)}>
                <Save size={15} /> {saving ? 'Saving…' : 'Save brand'}
              </button>
            ) : null}
          </header>

          {section === 'theme' && (
            <div className="brand-deck-panel">
              <div className="brand-deck-block">
                <div className="brand-deck-block__head">
                  <span>Panel surface</span>
                  <small>Light, dark, or follow the OS</small>
                </div>
                <div className="brand-deck-modes" role="group" aria-label="Panel surface">
                  {THEME_MODE_OPTIONS.map((opt) => {
                    const Icon = opt.id === 'light' ? Sun : opt.id === 'dark' ? Moon : Monitor;
                    const active = form.themeMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`brand-deck-mode${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => patch({ themeMode: opt.id })}
                      >
                        <span className={`brand-deck-mode__preview is-${opt.id}`} aria-hidden>
                          <i />
                          <em style={{ background: previewAccent }} />
                        </span>
                        <span className="brand-deck-mode__copy">
                          <Icon size={14} />
                          <strong>{opt.label}</strong>
                          <small>{opt.blurb}</small>
                        </span>
                        {active ? <Check size={13} className="brand-deck-mode__check" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="brand-deck-block">
                <div className="brand-deck-block__head">
                  <span>Surface presets</span>
                  <small>Panel chrome tones — may seed accents (override in Colors)</small>
                </div>
                <div className="brand-deck-presets" role="group" aria-label="Surface presets">
                  {(Object.keys(SURFACE_PRESETS) as NamedThemePreset[]).map((id) => (
                    <SurfaceTile
                      key={id}
                      id={id}
                      mode={previewTheme}
                      active={form.themePreset === id}
                      onSelect={() => applySurface(id)}
                    />
                  ))}
                  <button
                    type="button"
                    className={`brand-deck-preset is-surface${form.themePreset === 'custom' ? ' is-active' : ''}`}
                    aria-pressed={form.themePreset === 'custom'}
                    onClick={() => applySurface('custom')}
                  >
                    <span
                      className="brand-deck-preset__stage"
                      style={{ background: presetWash(previewAccent, previewSecondary) }}
                      aria-hidden
                    />
                    <span className="brand-deck-preset__meta">
                      <strong>Custom</strong>
                      <small>Keep default surfaces</small>
                    </span>
                    {form.themePreset === 'custom' ? (
                      <span className="brand-deck-preset__check" aria-hidden>
                        <Check size={11} />
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'colors' && (
            <div className="brand-deck-panel brand-colors">
              <div className="brand-colors-hero">
                <div
                  className="brand-colors-hero__wash"
                  style={{
                    background: `linear-gradient(135deg, ${previewAccent}, ${previewSecondary})`,
                  }}
                >
                  <div className="brand-colors-hero__veil" aria-hidden />
                  <div className="brand-colors-hero__copy">
                    <span>Live gradient</span>
                    <strong>Primary → Secondary</strong>
                  </div>
                  <div className="brand-colors-hero__samples">
                    <em style={{ background: previewAccent }}>Button</em>
                    <em className="is-ghost">Link</em>
                  </div>
                </div>
                <div className="brand-colors-hero__readout">
                  <div>
                    <span>Primary</span>
                    <code>{previewAccent}</code>
                  </div>
                  <div>
                    <span>Secondary</span>
                    <code>{previewSecondary}</code>
                  </div>
                </div>
              </div>

              <div className="brand-colors-toolbar">
                <p>
                  <Pipette size={13} />
                  {(() => {
                    const contrast = contrastRatio(previewAccent, '#ffffff');
                    const label =
                      contrast >= 4.5
                        ? 'Good contrast on buttons'
                        : contrast >= 3
                          ? 'Acceptable contrast'
                          : 'Low contrast — may be hard to read';
                    return (
                      <>
                        {label}
                        <span>({contrast.toFixed(1)}:1)</span>
                      </>
                    );
                  })()}
                </p>
                <button
                  type="button"
                  className="brand-colors-random"
                  onClick={() => {
                    const pick = ACCENT_PAIRS[Math.floor(Math.random() * ACCENT_PAIRS.length)]!;
                    applyAccentPair(pick.primary, pick.secondary);
                  }}
                >
                  <Shuffle size={13} /> Random palette
                </button>
              </div>

              <div className="brand-deck-block">
                <div className="brand-deck-block__head">
                  <span>Curated palettes</span>
                  <small>One-click accent pairs from Spirit-Panel</small>
                </div>
                <div className="brand-colors-pairs" role="group" aria-label="Accent pairs">
                  {ACCENT_PAIRS.map((pair) => (
                    <AccentTile
                      key={pair.id}
                      label={pair.label}
                      primary={pair.primary}
                      secondary={pair.secondary}
                      active={activeAccentPair === pair.id}
                      onSelect={() => applyAccentPair(pair.primary, pair.secondary)}
                    />
                  ))}
                </div>
              </div>

              <div className="brand-deck-grid">
                <Field label="Primary accent" hint="Buttons, links, and highlights">
                  <div className="brand-deck-color">
                    <input
                      type="color"
                      value={previewAccent}
                      onChange={(e) => setManualColor('accentColor', e.target.value)}
                      aria-label="Accent color picker"
                    />
                    <input
                      value={form.accentColor}
                      onChange={(e) => setManualColor('accentColor', e.target.value)}
                      placeholder="#6366f1"
                    />
                  </div>
                </Field>
                <Field label="Secondary accent" hint="Gradients, glows, and soft fills">
                  <div className="brand-deck-color">
                    <input
                      type="color"
                      value={previewSecondary}
                      onChange={(e) => setManualColor('secondaryColor', e.target.value)}
                      aria-label="Secondary color picker"
                    />
                    <input
                      value={form.secondaryColor}
                      onChange={(e) => setManualColor('secondaryColor', e.target.value)}
                      placeholder="#8b5cf6"
                    />
                  </div>
                </Field>
              </div>
            </div>
          )}

          {section === 'identity' && (
            <div className="brand-deck-panel">
              <div className="brand-deck-grid">
                <Field label="Company name">
                  <input
                    value={form.companyName}
                    onChange={(e) => patch({ companyName: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Sidebar subtitle">
                  <input
                    value={form.tagline}
                    onChange={(e) => patch({ tagline: e.target.value })}
                    placeholder="Billing"
                    required
                  />
                </Field>
                <Field label="Support email">
                  <input
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => patch({ supportEmail: e.target.value })}
                    placeholder="support@example.com"
                  />
                </Field>
                <Field label="Support URL">
                  <input
                    type="url"
                    value={form.supportUrl}
                    onChange={(e) => patch({ supportUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Terms of service">
                  <input
                    type="url"
                    value={form.termsUrl}
                    onChange={(e) => patch({ termsUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Privacy policy">
                  <input
                    type="url"
                    value={form.privacyUrl}
                    onChange={(e) => patch({ privacyUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Announcement banner" hint="Leave blank to hide in the client area.">
                <textarea
                  rows={3}
                  maxLength={280}
                  value={form.announcementBanner}
                  onChange={(e) => patch({ announcementBanner: e.target.value })}
                  placeholder="Optional notice shown to clients"
                />
              </Field>
            </div>
          )}

          {section === 'layout' && (
            <div className="brand-deck-panel">
              <div className="brand-deck-subtabs" role="tablist" aria-label="Layout settings">
                <button
                  type="button"
                  role="tab"
                  aria-selected={layoutPane === 'navigation'}
                  className={layoutPane === 'navigation' ? 'is-active' : ''}
                  onClick={() => {
                    setLayoutPane('navigation');
                    setPreview('navigation');
                  }}
                >
                  <Navigation size={13} /> Navigation
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={layoutPane === 'atmosphere'}
                  className={layoutPane === 'atmosphere' ? 'is-active' : ''}
                  onClick={() => {
                    setLayoutPane('atmosphere');
                    setPreview('atmosphere');
                  }}
                >
                  <Sparkles size={13} /> Atmosphere
                </button>
              </div>

              {layoutPane === 'navigation' && (
                <>
                  <NavLayoutPicker
                    label="Client navigation"
                    hint="How the client area chrome is arranged"
                    value={form.clientNavLayout}
                    onChange={(clientNavLayout) => {
                      patch({ clientNavLayout });
                      setShellPreview('client');
                      setPreview('navigation');
                    }}
                  />
                  <NavLayoutPicker
                    label="Admin navigation"
                    hint="How the admin panel chrome is arranged"
                    value={form.adminNavLayout}
                    onChange={(adminNavLayout) => {
                      patch({ adminNavLayout });
                      setShellPreview('admin');
                      setPreview('navigation');
                    }}
                  />
                  <ChoiceRow
                    label="Corner radius"
                    hint="Controls cards, inputs, and buttons"
                    value={form.uiRadius}
                    options={[
                      { id: 'sharp', label: 'Sharp' },
                      { id: 'soft', label: 'Soft' },
                      { id: 'rounded', label: 'Rounded' },
                    ]}
                    onChange={(uiRadius) => patch({ uiRadius })}
                  />
                  <ChoiceRow
                    label="Density"
                    hint="Spacing in nav and controls"
                    value={form.uiDensity}
                    options={[
                      { id: 'comfortable', label: 'Comfortable' },
                      { id: 'compact', label: 'Compact' },
                    ]}
                    onChange={(uiDensity) => patch({ uiDensity })}
                  />
                  <ChromeThemePicker
                    kind="sidebar"
                    label="Sidebar theme"
                    hint="Surface finish for left-rail navigation"
                    value={form.sidebarStyle}
                    onChange={(sidebarStyle) => {
                      patch({ sidebarStyle: sidebarStyle as SidebarStyle });
                      setPreview('navigation');
                    }}
                  />
                  <ChromeThemePicker
                    kind="navbar"
                    label="Navbar theme"
                    hint="Surface finish for top-bar navigation"
                    value={form.navbarStyle}
                    onChange={(navbarStyle) => {
                      patch({ navbarStyle: navbarStyle as NavbarStyle });
                      setPreview('navigation');
                    }}
                  />
                </>
              )}

              {layoutPane === 'atmosphere' && (
                <>
                  <div className="brand-deck-block">
                    <div className="brand-deck-block__head">
                      <span>Login background</span>
                      <small>Animated backdrop on sign-in and register</small>
                    </div>
                    <div className="brand-atmos-grid" role="group" aria-label="Login backgrounds">
                      {AUTH_ATMOSPHERE_OPTIONS.map((opt) => {
                        const active = form.authAtmosphere === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={`brand-atmos-card${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => {
                              patch({ authAtmosphere: opt.id });
                              setPreview('atmosphere');
                            }}
                          >
                            <span
                              className={`brand-atmos-preview login-preview login-preview--${opt.id}`}
                              style={{ '--preview-gradient': previewAccent } as CSSProperties}
                              aria-hidden
                            />
                            <span className="brand-atmos-card__meta">
                              <strong>{opt.label}</strong>
                              <small>{opt.blurb}</small>
                            </span>
                            {active ? (
                              <span className="brand-atmos-card__check" aria-hidden>
                                <Check size={11} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="brand-deck-block">
                    <div className="brand-deck-block__head">
                      <span>Client area background</span>
                      <small>Ambient wash behind the client dashboard</small>
                    </div>
                    <div className="brand-atmos-grid" role="group" aria-label="Client area backgrounds">
                      {SHELL_ATMOSPHERE_OPTIONS.map((opt) => {
                        const active = form.clientAtmosphere === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={`brand-atmos-card${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => {
                              patch({ clientAtmosphere: opt.id });
                              setShellPreview('client');
                              setPreview('navigation');
                            }}
                          >
                            <span
                              className={`brand-atmos-preview panel-preview panel-preview--${opt.id}`}
                              style={
                                {
                                  '--preview-accent-glow': previewAccent,
                                  '--preview-secondary-glow': previewSecondary,
                                } as CSSProperties
                              }
                              aria-hidden
                            />
                            <span className="brand-atmos-card__meta">
                              <strong>{opt.label}</strong>
                              <small>{opt.blurb}</small>
                            </span>
                            {active ? (
                              <span className="brand-atmos-card__check" aria-hidden>
                                <Check size={11} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="brand-deck-block">
                    <div className="brand-deck-block__head">
                      <span>Admin background</span>
                      <small>Ambient wash behind the admin panel</small>
                    </div>
                    <div className="brand-atmos-grid" role="group" aria-label="Admin backgrounds">
                      {SHELL_ATMOSPHERE_OPTIONS.map((opt) => {
                        const active = form.adminAtmosphere === opt.id;
                        return (
                          <button
                            key={`admin-${opt.id}`}
                            type="button"
                            className={`brand-atmos-card${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => {
                              patch({ adminAtmosphere: opt.id });
                              setShellPreview('admin');
                              setPreview('navigation');
                            }}
                          >
                            <span
                              className={`brand-atmos-preview panel-preview panel-preview--${opt.id}`}
                              style={
                                {
                                  '--preview-accent-glow': previewAccent,
                                  '--preview-secondary-glow': previewSecondary,
                                } as CSSProperties
                              }
                              aria-hidden
                            />
                            <span className="brand-atmos-card__meta">
                              <strong>{opt.label}</strong>
                              <small>{opt.blurb}</small>
                            </span>
                            {active ? (
                              <span className="brand-atmos-card__check" aria-hidden>
                                <Check size={11} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {section === 'assets' && (
            <div className="brand-deck-panel">
              <div className="brand-deck-assets">
                <div className="brand-deck-asset">
                  <div className="brand-deck-asset__preview">
                    {showLogo ? (
                      <img src={form.logoUrl} alt="" onError={() => setLogoBroken(true)} />
                    ) : (
                      <ImagePlus size={22} />
                    )}
                  </div>
                  <div className="brand-deck-asset__body">
                    <button
                      type="button"
                      disabled={uploading === 'logo'}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload size={14} /> {uploading === 'logo' ? 'Uploading…' : 'Upload logo'}
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void uploadAsset('logo', file);
                      }}
                    />
                    <Field label="Logo URL" hint="http(s) or /uploads/branding/…">
                      <input
                        type="text"
                        placeholder="https://… or /uploads/branding/…"
                        value={form.logoUrl}
                        onChange={(e) => {
                          setLogoBroken(false);
                          patch({ logoUrl: e.target.value });
                        }}
                      />
                    </Field>
                  </div>
                </div>

                <div className="brand-deck-asset is-favicon">
                  <div className="brand-deck-asset__body">
                    <button
                      type="button"
                      disabled={uploading === 'favicon'}
                      onClick={() => faviconInputRef.current?.click()}
                    >
                      <Upload size={14} />{' '}
                      {uploading === 'favicon' ? 'Uploading…' : 'Upload favicon'}
                    </button>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void uploadAsset('favicon', file);
                      }}
                    />
                    <Field label="Favicon URL">
                      <input
                        type="text"
                        placeholder="https://… or /uploads/branding/…"
                        value={form.faviconUrl}
                        onChange={(e) => patch({ faviconUrl: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="brand-deck__preview" aria-label="Live brand preview">
          <header className="brand-deck__preview-bar">
            <div>
              <span>Live preview</span>
              <strong>
                {preview === 'atmosphere'
                  ? 'Atmosphere'
                  : preview === 'navigation'
                    ? 'Navigation'
                    : 'Server cards'}
              </strong>
            </div>
            <div className="brand-deck__surfaces" role="tablist" aria-label="Preview surface">
              {(
                [
                  ['atmosphere', <Sparkles size={13} key="a" />],
                  ['navigation', <Navigation size={13} key="n" />],
                  ['servers', <Server size={13} key="s" />],
                ] as const
              ).map(([id, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-label={id}
                  aria-selected={preview === id}
                  className={preview === id ? 'is-active' : ''}
                  onClick={() => setPreview(id)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </header>

          <div className="brand-deck__stage">
            {preview === 'atmosphere' && (
              <div
                className={`brand-deck-mock brand-deck-mock--atmosphere is-${previewTheme}`}
                data-auth-bg={form.authAtmosphere}
              >
                <div
                  className={`brand-deck-mock__atmos login-preview login-preview--${form.authAtmosphere}`}
                  style={{ '--preview-gradient': previewAccent } as CSSProperties}
                  aria-hidden
                />
                <div className="brand-deck-mock__glow" aria-hidden />
                <div className="brand-deck-mock__copy">
                  {showLogo ? (
                    <img src={form.logoUrl} alt="" onError={() => setLogoBroken(true)} />
                  ) : (
                    <span aria-hidden>
                      <Gamepad2 size={18} />
                    </span>
                  )}
                  <strong>
                    {form.companyName || 'Company'}
                    <sup>™</sup>
                  </strong>
                  <p>
                    {AUTH_ATMOSPHERE_OPTIONS.find((o) => o.id === form.authAtmosphere)?.label || 'Stage'} ·{' '}
                    {modeLabel}
                  </p>
                  <button type="button" className="brand-deck-mock__cta">
                    Continue
                  </button>
                </div>
              </div>
            )}

            {preview === 'navigation' && (() => {
              const navLayout =
                shellPreview === 'admin' ? form.adminNavLayout : form.clientNavLayout;
              const atmosphere =
                shellPreview === 'admin' ? form.adminAtmosphere : form.clientAtmosphere;
              const isNavbar = navLayout === 'navbar';
              return (
                <div
                  className={`brand-deck-mock brand-deck-mock--nav panel-bg-root panel-bg-${atmosphere}${
                    isNavbar ? ' is-navbar' : ''
                  }`}
                  data-sidebar={form.sidebarStyle}
                  data-navbar={form.navbarStyle}
                >
                  {isNavbar ? (
                    <header className={`brand-deck-mock__navbar is-${form.navbarStyle}`}>
                      <strong>{form.companyName || 'Company'}</strong>
                      <nav>
                        <button type="button" className="is-active">
                          Dashboard
                        </button>
                        <button type="button">Services</button>
                        <button type="button">Invoices</button>
                      </nav>
                    </header>
                  ) : (
                    <aside className={`is-${form.sidebarStyle}`}>
                      <div className="brand-deck-mock__brand">
                        {showLogo ? (
                          <img src={form.logoUrl} alt="" onError={() => setLogoBroken(true)} />
                        ) : (
                          <span aria-hidden>
                            <Gamepad2 size={14} />
                          </span>
                        )}
                        <div>
                          <strong>{form.companyName || 'Company'}</strong>
                          <small>{form.tagline || 'Billing'}</small>
                        </div>
                      </div>
                      <nav>
                        <button type="button" className="is-active">
                          Dashboard
                        </button>
                        <button type="button">Services</button>
                        <button type="button">Invoices</button>
                      </nav>
                    </aside>
                  )}
                  <main>
                    <span>
                      {NAV_LAYOUT_OPTIONS.find((o) => o.id === navLayout)?.label || 'Sidebar'} ·{' '}
                      {isNavbar
                        ? NAVBAR_STYLE_OPTIONS.find((o) => o.id === form.navbarStyle)?.label
                        : SIDEBAR_STYLE_OPTIONS.find((o) => o.id === form.sidebarStyle)?.label}
                    </span>
                    <strong>{shellPreview === 'admin' ? 'Admin panel' : 'Client area'}</strong>
                  </main>
                </div>
              );
            })()}

            {preview === 'servers' && (
              <div className="brand-deck-mock brand-deck-mock--servers">
                {['Survival SMP', 'Proxy Edge'].map((name, i) => (
                  <article key={name}>
                    <div>
                      <strong>{name}</strong>
                      <em className={i === 1 ? 'is-warn' : ''}>{i === 1 ? 'Pending' : 'Active'}</em>
                    </div>
                    <small>4 GB · {form.uiRadius}</small>
                    <button type="button">Manage</button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}
