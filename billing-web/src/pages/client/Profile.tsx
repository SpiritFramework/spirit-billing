import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  FileCheck2,
  KeyRound,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  PanelsTopLeft,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  UserRound,
} from 'lucide-react';
import { api, ApiError, safeExternalHref, statusBadge } from '../../lib/api';
import { useAuth, useLogout, type User } from '../../context/AuthContext';
import { CategoryMark } from '../../lib/icons';

type Overview = {
  user: User & { updatedAt?: string };
  panelWebUrl: string;
  panelLinked: boolean;
  panelStatus?: 'linked' | 'missing' | 'unreachable';
  stats: { services: number; activeServices?: number; unpaidInvoices: number; paidInvoices: number };
  recentServices: Array<{
    id: string;
    name: string;
    status: string;
    panelServerId: string | null;
    product: {
      name: string;
      category?: {
        id: string;
        name: string;
        color: string;
        icon: string;
        logoUrl?: string | null;
      } | null;
    };
  }>;
};

type Tab = 'account' | 'security' | 'oauth' | 'panel';

const TABS: Array<{ id: Tab; label: string; hint: string; icon: typeof UserRound }> = [
  { id: 'account', label: 'Account', hint: 'Identity & photo', icon: UserRound },
  { id: 'security', label: 'Security', hint: 'Password & access', icon: LockKeyhole },
  { id: 'oauth', label: 'OAuth', hint: 'Linked providers', icon: Link2 },
  { id: 'panel', label: 'Game Panel', hint: 'Connection & sync', icon: PanelsTopLeft },
];

const OAUTH_PROVIDERS = [
  {
    id: 'discord',
    name: 'Discord',
    detail: 'Sign in and verify with your Discord account.',
    color: '#5865F2',
  },
] as const;

function initials(user: User | null) {
  if (!user) return '?';
  const a = (user.firstName || user.username || '?').slice(0, 1);
  const b = (user.lastName || '').slice(0, 1);
  return (a + b).toUpperCase();
}

function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

const strengthLabel = ['Too short', 'Weak', 'Okay', 'Strong', 'Excellent'];
const strengthColor = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#4ade80'];

export function ProfilePage() {
  const { user, setUser, panelWebUrl } = useAuth();
  const panelHref = safeExternalHref(panelWebUrl);
  const signOut = useLogout();
  const [tab, setTab] = useState<Tab>('account');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [accountForm, setAccountForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    username: user?.username ?? '',
    avatarUrl: user?.avatarUrl ?? '',
    currentPassword: '',
  });
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [securityForm, setSecurityForm] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });
  const [accountMsg, setAccountMsg] = useState('');
  const [accountErr, setAccountErr] = useState('');
  const [securityMsg, setSecurityMsg] = useState('');
  const [securityErr, setSecurityErr] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [copied, setCopied] = useState(false);

  const score = useMemo(() => passwordScore(securityForm.password), [securityForm.password]);

  useEffect(() => {
    void api<Overview>('/auth/profile/overview').then((data) => {
      setOverview(data);
      setAccountForm({
        firstName: data.user.firstName ?? '',
        lastName: data.user.lastName ?? '',
        email: data.user.email,
        username: data.user.username,
        avatarUrl: data.user.avatarUrl ?? '',
        currentPassword: '',
      });
      setAvatarBroken(false);
      setUser(data.user);
    });
  }, [setUser]);

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    setSavingAccount(true);
    setAccountErr('');
    setAccountMsg('');
    const trimmedAvatar = accountForm.avatarUrl.trim();
    if (trimmedAvatar && !/^https?:\/\/.+/i.test(trimmedAvatar)) {
      setAccountErr('Avatar URL must start with http:// or https://');
      setSavingAccount(false);
      return;
    }
    const identityChanged =
      accountForm.email.toLowerCase() !== (user?.email ?? '').toLowerCase() ||
      accountForm.username !== (user?.username ?? '');
    if (identityChanged && !accountForm.currentPassword) {
      setAccountErr('Enter your current password to change email or username.');
      setSavingAccount(false);
      return;
    }
    try {
      const data = await api<{ user: User }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: accountForm.firstName,
          lastName: accountForm.lastName,
          email: accountForm.email,
          username: accountForm.username,
          avatarUrl: trimmedAvatar || null,
          ...(identityChanged ? { currentPassword: accountForm.currentPassword } : {}),
        }),
      });
      setUser(data.user);
      setAccountForm((f) => ({ ...f, avatarUrl: data.user.avatarUrl ?? '', currentPassword: '' }));
      setAccountMsg('Account details saved and synced to Spirit-Panel.');
      setOverview((o) => (o ? { ...o, user: { ...o.user, ...data.user } } : o));
    } catch (err) {
      setAccountErr(err instanceof ApiError ? err.message : 'Could not save account');
    } finally {
      setSavingAccount(false);
    }
  }

  async function clearAvatar() {
    setAccountForm((f) => ({ ...f, avatarUrl: '' }));
    setSavingAccount(true);
    setAccountErr('');
    setAccountMsg('');
    try {
      const data = await api<{ user: User }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: null }),
      });
      setUser(data.user);
      setAccountMsg('Profile photo removed.');
      setOverview((o) => (o ? { ...o, user: { ...o.user, ...data.user } } : o));
    } catch (err) {
      setAccountErr(err instanceof ApiError ? err.message : 'Could not remove photo');
    } finally {
      setSavingAccount(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setSecurityErr('');
    setSecurityMsg('');
    if (securityForm.password !== securityForm.confirmPassword) {
      setSecurityErr('New passwords do not match.');
      return;
    }
    if (securityForm.password.length < 16 || !/[A-Za-z]/.test(securityForm.password) || !/[0-9]/.test(securityForm.password)) {
      setSecurityErr('Password must be at least 16 characters and include a letter and a number.');
      return;
    }
    setSavingSecurity(true);
    try {
      const data = await api<{ user: User; warning?: string; panelPasswordSkipped?: boolean }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          password: securityForm.password,
          currentPassword: securityForm.currentPassword,
        }),
      });
      setUser(data.user);
      setSecurityForm({ currentPassword: '', password: '', confirmPassword: '' });
      setSecurityMsg(
        data.warning ||
          (data.panelPasswordSkipped
            ? 'Billing password updated. Spirit-Panel password was not changed (elevated Panel account).'
            : 'Password updated on billing and Spirit-Panel.'),
      );
    } catch (err) {
      setSecurityErr(err instanceof ApiError ? err.message : 'Could not update password');
    } finally {
      setSavingSecurity(false);
    }
  }

  async function copyPanelId() {
    if (!user?.panelUserId) return;
    await navigator.clipboard.writeText(user.panelUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Account';
  const liveAvatar = accountForm.avatarUrl.trim() || user?.avatarUrl || '';
  const showAvatar = Boolean(liveAvatar && /^https?:\/\//i.test(liveAvatar) && !avatarBroken);
  const panelLinked = overview?.panelLinked === true;
  const panelWarn = overview != null && !panelLinked;
  const roleLabel =
    user?.role === 'admin' ? 'Administrator' : user?.role === 'staff' ? 'Staff' : 'Client';
  const identityChanged =
    accountForm.email.toLowerCase() !== (user?.email ?? '').toLowerCase() ||
    accountForm.username !== (user?.username ?? '');

  return (
    <div className="client-profile">
      <header className="client-profile__intro">
        <div className="client-profile__intro-identity">
          <div className="client-profile__avatar" aria-hidden>
            {showAvatar ? (
              <img src={liveAvatar} alt="" onError={() => setAvatarBroken(true)} />
            ) : (
              initials(user)
            )}
            <span className="client-profile__avatar-dot" />
          </div>
          <div className="client-profile__intro-copy">
            <p>Your account</p>
            <h1>{displayName}</h1>
            <div className="client-profile__intro-meta">
              <span>@{user?.username || '—'}</span>
              <span aria-hidden>·</span>
              <span>{user?.email || '—'}</span>
              <span className="client-profile__chip">
                <ShieldCheck size={12} /> {roleLabel}
              </span>
              <span className={`client-profile__chip ${panelLinked ? 'is-ok' : panelWarn ? 'is-warn' : ''}`}>
                <Link2 size={12} /> {panelLinked ? 'Panel linked' : overview ? 'Panel not linked' : 'Checking…'}
              </span>
            </div>
          </div>
        </div>
        <div className="client-profile__intro-actions">
          {panelHref && panelLinked && (overview?.stats.activeServices ?? 0) > 0 && (
            <a
              className="client-home__btn client-home__btn--ghost client-home__btn--cta"
              href={panelHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="client-home__btn-icon" aria-hidden>
                <PanelsTopLeft size={14} />
              </span>
              <span>Open panel</span>
              <ArrowUpRight size={14} className="client-home__btn-arrow" />
            </a>
          )}
          <button
            className="client-home__btn client-home__btn--ghost client-home__btn--sm"
            type="button"
            onClick={() => void signOut()}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <div className="client-profile__pulse" aria-label="Account snapshot">
        <Link to="/services" className="client-profile__pulse-item">
          <span className="client-profile__pulse-copy">
            <small>Services</small>
            <strong>{overview ? overview.stats.services : '—'}</strong>
            <span>{overview ? `${overview.stats.activeServices ?? 0} active` : 'Loading'}</span>
          </span>
          <span className="client-profile__pulse-icon is-services" aria-hidden>
            <Server size={17} />
          </span>
        </Link>
        <Link to="/invoices" className="client-profile__pulse-item">
          <span className="client-profile__pulse-copy">
            <small>Open invoices</small>
            <strong className={(overview?.stats.unpaidInvoices ?? 0) > 0 ? 'is-warn' : undefined}>
              {overview ? overview.stats.unpaidInvoices : '—'}
            </strong>
            <span>Needs attention</span>
          </span>
          <span className="client-profile__pulse-icon is-due" aria-hidden>
            <FileCheck2 size={17} />
          </span>
        </Link>
        <div className="client-profile__pulse-item">
          <span className="client-profile__pulse-copy">
            <small>Paid invoices</small>
            <strong>{overview ? overview.stats.paidInvoices : '—'}</strong>
            <span>Billing history</span>
          </span>
          <span className="client-profile__pulse-icon is-paid" aria-hidden>
            <CheckCircle2 size={17} />
          </span>
        </div>
        <div className="client-profile__pulse-item">
          <span className="client-profile__pulse-copy">
            <small>Member since</small>
            <strong>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                : '—'}
            </strong>
            <span>
              {overview == null
                ? 'Checking panel'
                : panelLinked
                  ? 'Panel connected'
                  : overview.panelStatus === 'unreachable'
                    ? 'Panel unreachable'
                    : 'Panel not linked'}
            </span>
          </span>
          <span
            className={`client-profile__pulse-icon is-panel${panelWarn ? ' is-warn' : panelLinked ? ' is-ok' : ''}`}
            aria-hidden
          >
            <CalendarDays size={17} />
          </span>
        </div>
      </div>

      <nav className="client-profile__tabs" aria-label="Profile sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'is-active' : undefined}
              onClick={() => setTab(item.id)}
            >
              <Icon size={16} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          );
        })}
      </nav>

      {tab === 'account' && (
        <div className="client-profile__layout">
          <div className="client-profile__stack">
            <section className="client-profile__block">
              <div className="client-profile__block-head">
                <div>
                  <h2>Personal details</h2>
                  <p>Name, email, and username used across billing and Spirit-Panel.</p>
                </div>
              </div>

              <form className="client-profile__form" onSubmit={saveAccount}>
                {accountErr && <div className="ds-alert ds-alert--error">{accountErr}</div>}
                {accountMsg && <div className="ds-alert ds-alert--success">{accountMsg}</div>}

                <div className="client-profile__form-grid">
                  <label className="ds-field">
                    <span className="ds-label">First name</span>
                    <input
                      className="ds-input"
                      value={accountForm.firstName}
                      onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })}
                      required
                    />
                  </label>
                  <label className="ds-field">
                    <span className="ds-label">Last name</span>
                    <input
                      className="ds-input"
                      value={accountForm.lastName}
                      onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })}
                      required
                    />
                  </label>
                  <label className="ds-field">
                    <span className="ds-label">Email address</span>
                    <div className="client-profile__input-icon">
                      <Mail size={15} />
                      <input
                        className="ds-input"
                        type="email"
                        value={accountForm.email}
                        onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                        required
                      />
                    </div>
                  </label>
                  <label className="ds-field">
                    <span className="ds-label">Username</span>
                    <div className="client-profile__input-icon">
                      <UserIcon size={15} />
                      <input
                        className="ds-input"
                        value={accountForm.username}
                        onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                        required
                      />
                    </div>
                  </label>
                </div>

                {identityChanged && (
                  <label className="ds-field">
                    <span className="ds-label">Confirm with current password</span>
                    <input
                      className="ds-input"
                      type="password"
                      value={accountForm.currentPassword}
                      onChange={(e) => setAccountForm({ ...accountForm, currentPassword: e.target.value })}
                      autoComplete="current-password"
                      required
                    />
                    <span className="ds-faint" style={{ fontSize: '0.75rem' }}>
                      Required because you changed your email or username.
                    </span>
                  </label>
                )}

                <div className="client-profile__footer">
                  <span>Identity changes sync to Spirit-Panel when linked.</span>
                  <button
                    className="client-home__btn client-home__btn--primary client-home__btn--cta client-home__btn--sm"
                    disabled={savingAccount}
                    type="submit"
                  >
                    <span className="client-home__btn-icon" aria-hidden>
                      <Save size={14} />
                    </span>
                    <span>{savingAccount ? 'Saving…' : 'Save details'}</span>
                    <ArrowRight size={13} className="client-home__btn-arrow" />
                  </button>
                </div>
              </form>
            </section>
          </div>

          <aside className="client-profile__aside">
            <section className="client-profile__block client-profile__block--photo">
              <div className="client-profile__block-head">
                <div>
                  <h2>Profile photo</h2>
                  <p>Shown across your account.</p>
                </div>
              </div>
              <div className="client-profile__photo">
                <div className="client-profile__photo-preview" aria-hidden>
                  {showAvatar ? (
                    <img src={liveAvatar} alt="" onError={() => setAvatarBroken(true)} />
                  ) : (
                    initials(user)
                  )}
                </div>
                <label className="ds-field">
                  <span className="ds-label">Direct image URL</span>
                  <input
                    className="ds-input"
                    type="url"
                    placeholder="https://example.com/avatar.png"
                    value={accountForm.avatarUrl}
                    onChange={(e) => {
                      setAvatarBroken(false);
                      setAccountForm({ ...accountForm, avatarUrl: e.target.value });
                    }}
                  />
                </label>
                <button
                  className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                  type="button"
                  disabled={savingAccount || (!accountForm.avatarUrl && !user?.avatarUrl)}
                  onClick={() => void clearAvatar()}
                >
                  <Trash2 size={13} /> Remove photo
                </button>
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === 'security' && (
        <div className="client-profile__layout">
          <div className="client-profile__stack">
            <section className="client-profile__block">
              <div className="client-profile__block-head">
                <div>
                  <h2>Password</h2>
                  <p>Updates billing; Panel syncs when the Application API allows it.</p>
                </div>
              </div>

              <form className="client-profile__form" onSubmit={savePassword}>
                {securityErr && <div className="ds-alert ds-alert--error">{securityErr}</div>}
                {securityMsg && <div className="ds-alert ds-alert--success">{securityMsg}</div>}

                <label className="ds-field">
                  <span className="ds-label">Current password</span>
                  <input
                    className="ds-input"
                    type="password"
                    value={securityForm.currentPassword}
                    onChange={(e) => setSecurityForm({ ...securityForm, currentPassword: e.target.value })}
                    autoComplete="current-password"
                    required
                  />
                </label>

                <div className="client-profile__form-grid">
                  <label className="ds-field">
                    <span className="ds-label">New password</span>
                    <input
                      className="ds-input"
                      type="password"
                      value={securityForm.password}
                      onChange={(e) => setSecurityForm({ ...securityForm, password: e.target.value })}
                      autoComplete="new-password"
                      minLength={16}
                      required
                    />
                  </label>
                  <label className="ds-field">
                    <span className="ds-label">Confirm new password</span>
                    <input
                      className="ds-input"
                      type="password"
                      value={securityForm.confirmPassword}
                      onChange={(e) => setSecurityForm({ ...securityForm, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </div>

                {securityForm.password ? (
                  <div className="client-profile__strength">
                    <div>
                      <span style={{ width: `${(score / 4) * 100}%`, background: strengthColor[score] }} />
                    </div>
                    <strong style={{ color: strengthColor[score] }}>{strengthLabel[score]}</strong>
                    <small>Use at least 16 characters with letters and numbers.</small>
                  </div>
                ) : null}

                <div className="client-profile__footer">
                  <span>Elevated Panel admins must change Panel passwords in the panel itself.</span>
                  <button
                    className="client-home__btn client-home__btn--primary client-home__btn--cta client-home__btn--sm"
                    disabled={savingSecurity}
                    type="submit"
                  >
                    <span className="client-home__btn-icon" aria-hidden>
                      <KeyRound size={14} />
                    </span>
                    <span>{savingSecurity ? 'Updating…' : 'Update password'}</span>
                    <ArrowRight size={13} className="client-home__btn-arrow" />
                  </button>
                </div>
              </form>
            </section>
          </div>

          <aside className="client-profile__aside">
            <section className="client-profile__block">
              <div className="client-profile__block-head">
                <div>
                  <h2>Security tips</h2>
                  <p>Keep your account safe.</p>
                </div>
              </div>
              <div className="client-profile__tips">
                {[
                  'Use a unique password you do not reuse',
                  'Mix letters, numbers, and symbols',
                  'Sign out when using a shared device',
                  'Never share your password with support',
                ].map((tip) => (
                  <div key={tip}>
                    <CheckCircle2 size={15} />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === 'oauth' && (
        <div className="client-profile__layout client-profile__layout--single">
          <section className="client-profile__block">
            <div className="client-profile__block-head">
              <div>
                <h2>Linked providers</h2>
                <p>Connect social accounts for sign-in. OAuth linking is coming soon.</p>
              </div>
            </div>

            <div className="client-profile__oauth-list">
              {OAUTH_PROVIDERS.map((provider) => (
                <article
                  key={provider.id}
                  className="client-profile__oauth-row"
                  style={{ ['--oauth-color' as string]: provider.color }}
                >
                  <span className="client-profile__oauth-mark" aria-hidden>
                    <Link2 size={18} />
                  </span>
                  <span className="client-profile__oauth-copy">
                    <strong>{provider.name}</strong>
                    <small>{provider.detail}</small>
                  </span>
                  <span className="client-profile__chip">Not connected</span>
                  <button
                    className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                    type="button"
                    disabled
                    title="OAuth linking is not available yet"
                  >
                    Connect
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'panel' && (
        <div className="client-profile__stack">
          <div className="client-profile__layout">
            <div className="client-profile__stack">
              <section className="client-profile__block client-profile__block--panel">
                <div className="client-profile__block-head">
                  <div>
                    <h2>Spirit-Panel</h2>
                    <p>Connection used for provisioning and sync.</p>
                  </div>
                  {panelHref && panelLinked ? (
                    <a
                      className="client-home__btn client-home__btn--ghost client-home__btn--cta client-home__btn--sm"
                      href={panelHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="client-home__btn-icon" aria-hidden>
                        <PanelsTopLeft size={14} />
                      </span>
                      <span>Launch</span>
                      <ArrowUpRight size={13} className="client-home__btn-arrow" />
                    </a>
                  ) : null}
                </div>

                <div
                  className={`client-profile__panel-card ${
                    panelLinked ? 'is-ok' : panelWarn ? 'is-warn' : ''
                  }`}
                >
                  <span className="client-profile__panel-icon" aria-hidden>
                    {panelLinked ? <CheckCircle2 size={18} /> : <Link2 size={18} />}
                  </span>
                  <div className="client-profile__panel-copy">
                    <div className="client-profile__panel-title">
                      <strong>
                        {overview == null
                          ? 'Checking…'
                          : panelLinked
                            ? 'Connected and ready'
                            : overview.panelStatus === 'unreachable'
                              ? 'Panel unreachable'
                              : 'Connection required'}
                      </strong>
                      <span className={`client-profile__chip ${panelLinked ? 'is-ok' : panelWarn ? 'is-warn' : ''}`}>
                        {panelLinked ? 'Linked' : overview?.panelStatus === 'unreachable' ? 'Down' : 'Not linked'}
                      </span>
                    </div>
                    <p>
                      {panelLinked
                        ? 'Identity, password, and provisioned services stay aligned with your game panel.'
                        : 'Your billing account is not linked to a panel user. Contact support before ordering hosting.'}
                    </p>
                  </div>

                  <div className="client-profile__panel-meta">
                    <span>Panel user ID</span>
                    <div>
                      <code>{user?.panelUserId || 'Not available'}</code>
                      <button
                        className="client-profile__copy"
                        type="button"
                        disabled={!user?.panelUserId}
                        onClick={() => void copyPanelId()}
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="client-profile__aside">
              <section className="client-profile__block client-profile__block--sync">
                <div className="client-profile__block-head">
                  <div>
                    <h2>Automatic sync</h2>
                    <p>What billing keeps aligned with Spirit-Panel.</p>
                  </div>
                  <span className={`client-profile__chip ${panelLinked ? 'is-ok' : 'is-warn'}`}>
                    {panelLinked ? 'Live' : 'Paused'}
                  </span>
                </div>
                <div className={`client-profile__sync ${panelLinked ? 'is-on' : 'is-off'}`}>
                  {[
                    ['Identity', 'Name, email, and username'],
                    ['Profile photo', 'Your avatar URL'],
                    ['Security', 'Password changes'],
                    ['Hosting', 'Server ownership after payment'],
                  ].map(([title, detail]) => (
                    <div key={title} className="client-profile__sync-row">
                      <span className="client-profile__sync-icon" aria-hidden>
                        {panelLinked ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
                      </span>
                      <span className="client-profile__sync-copy">
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </span>
                      <em>{panelLinked ? 'Synced' : 'Paused'}</em>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>

          <section className="client-profile__block client-profile__block--services">
            <div className="client-profile__block-head">
              <div>
                <h2>Your services</h2>
                <p>Newest services on this account — active, pending, suspended, or cancelled.</p>
              </div>
              <Link className="client-home__btn client-home__btn--text" to="/services">
                View all <ArrowRight size={14} />
              </Link>
            </div>

            {(overview?.recentServices ?? []).length > 0 ? (
              <div className="client-profile__service-list">
                {overview!.recentServices.map((service) => (
                  <Link
                    key={service.id}
                    to={`/services/${service.id}`}
                    className={`client-profile__service is-${service.status}`}
                    style={{ ['--service-color' as string]: service.product.category?.color || 'var(--accent)' }}
                  >
                    <CategoryMark
                      icon={service.product.category?.icon}
                      logoUrl={service.product.category?.logoUrl}
                      color={service.product.category?.color}
                      size={36}
                      className="client-profile__service-mark"
                    />
                    <span className="client-profile__service-main">
                      <strong>{service.name}</strong>
                      <small>
                        {service.product.category?.name || service.product.name}
                        {service.panelServerId ? (
                          <>
                            <span aria-hidden>·</span>
                            Panel linked
                          </>
                        ) : null}
                      </small>
                    </span>
                    <span className={`client-profile__service-status ${statusBadge(service.status)}`}>
                      <span className="client-profile__service-dot" aria-hidden />
                      {service.status.replaceAll('_', ' ')}
                    </span>
                    <span className="client-profile__service-go" aria-hidden>
                      <ArrowRight size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="client-profile__empty">
                <span>No services yet</span>
                <Link to="/game-hosting">Browse hosting plans</Link>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
