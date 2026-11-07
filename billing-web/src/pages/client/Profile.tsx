import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  UserRound,
  Wifi,
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

type Tab = 'account' | 'security' | 'panel';

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

  return (
    <div className="profile-v2">
      <section className="profile-cover">
        <div className="profile-cover__pattern" />
        <div className="profile-cover__identity">
          <div className="profile-cover__avatar-wrap">
            {showAvatar ? (
              <img
                src={liveAvatar}
                alt=""
                className="profile-cover__avatar"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <div className="profile-cover__avatar" aria-hidden>{initials(user)}</div>
            )}
            <span className="profile-cover__online" title="Account active" />
          </div>
          <div className="profile-cover__copy">
            <span className="profile-cover__eyebrow">Your profile</span>
            <h1>{displayName}</h1>
            <p>@{user?.username} <span /> {user?.email}</p>
            <div className="profile-cover__badges">
              <span><ShieldCheck size={13} /> {user?.role === 'admin' ? 'Administrator' : user?.role === 'staff' ? 'Staff' : 'Verified client'}</span>
              <span className={overview?.panelLinked ? 'is-connected' : 'is-warning'}>
                <Wifi size={13} /> {overview?.panelLinked ? 'Panel connected' : 'Panel not linked'}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-cover__actions">
          {panelHref && overview?.panelLinked && (overview.stats.activeServices ?? 0) > 0 && (
            <a className="ds-btn ds-btn--primary" href={panelHref} target="_blank" rel="noopener noreferrer">
              Open game panel <ExternalLink size={15} />
            </a>
          )}
          <button className="ds-btn ds-btn--ghost" type="button" onClick={() => void signOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </section>

      <section className="profile-summary">
        <div>
          <span className="profile-summary__icon is-purple"><Server size={18} /></span>
          <span><small>Services</small><strong>{overview?.stats.services ?? '—'}</strong></span>
        </div>
        <div>
          <span className="profile-summary__icon is-green"><FileCheck2 size={18} /></span>
          <span><small>Paid invoices</small><strong>{overview?.stats.paidInvoices ?? '—'}</strong></span>
        </div>
        <div>
          <span className="profile-summary__icon is-amber"><Activity size={18} /></span>
          <span><small>Open invoices</small><strong>{overview?.stats.unpaidInvoices ?? '—'}</strong></span>
        </div>
        <div>
          <span className="profile-summary__icon is-blue"><CalendarDays size={18} /></span>
          <span>
            <small>Member since</small>
            <strong>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                : '—'}
            </strong>
          </span>
        </div>
      </section>

      <nav className="profile-tabs" aria-label="Profile sections">
        <button type="button" className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
          <UserRound size={16} /><span>Account</span><small>Identity & contact</small>
        </button>
        <button type="button" className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>
          <KeyRound size={16} /><span>Security</span><small>Password & access</small>
        </button>
        <button type="button" className={tab === 'panel' ? 'active' : ''} onClick={() => setTab('panel')}>
          <Link2 size={16} /><span>Game panel</span><small>Connection & sync</small>
        </button>
      </nav>

      {tab === 'account' && (
        <div className="profile-content-grid">
          <form className="profile-card profile-form" onSubmit={saveAccount}>
            <header className="profile-card__header">
              <span className="profile-card__icon"><UserIcon size={18} /></span>
              <div>
                <h2>Personal information</h2>
                <p>Update the details used across billing and your game panel.</p>
              </div>
            </header>
            {accountErr && <div className="ds-alert ds-alert--error">{accountErr}</div>}
            {accountMsg && <div className="ds-alert ds-alert--success">{accountMsg}</div>}

            <div className="profile-form__grid">
              <label className="ds-field">
                <span className="ds-label">First name</span>
                <input className="ds-input" value={accountForm.firstName} onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })} required />
              </label>
              <label className="ds-field">
                <span className="ds-label">Last name</span>
                <input className="ds-input" value={accountForm.lastName} onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })} required />
              </label>
              <label className="ds-field">
                <span className="ds-label">Email address</span>
                <div className="profile-input-icon">
                  <Mail size={15} />
                  <input className="ds-input" type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} required />
                </div>
              </label>
              <label className="ds-field">
                <span className="ds-label">Username</span>
                <div className="profile-input-icon">
                  <UserIcon size={15} />
                  <input className="ds-input" value={accountForm.username} onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })} required />
                </div>
              </label>
            </div>

            {(accountForm.email.toLowerCase() !== (user?.email ?? '').toLowerCase() ||
              accountForm.username !== (user?.username ?? '')) && (
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

            <footer className="profile-card__footer">
              <span>Changes to identity details sync to Spirit-Panel.</span>
              <button className="ds-btn ds-btn--primary" disabled={savingAccount} type="submit">
                <Save size={15} /> {savingAccount ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </form>

          <aside className="profile-side-stack">
            <section className="profile-card profile-photo-card">
              <header className="profile-card__header">
                <span className="profile-card__icon"><Camera size={18} /></span>
                <div><h2>Profile photo</h2><p>Shown across your account.</p></div>
              </header>
              <div className="profile-photo-card__preview">
                {showAvatar ? (
                  <img src={liveAvatar} alt="" onError={() => setAvatarBroken(true)} />
                ) : (
                  <span>{initials(user)}</span>
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
                className="ds-btn ds-btn--ghost ds-btn--sm"
                type="button"
                disabled={savingAccount || (!accountForm.avatarUrl && !user?.avatarUrl)}
                onClick={() => void clearAvatar()}
              >
                <Trash2 size={14} /> Remove photo
              </button>
            </section>

            <section className="profile-card profile-services-card">
              <header className="profile-card__header">
                <span className="profile-card__icon"><Server size={18} /></span>
                <div><h2>Recent services</h2><p>Your latest hosting.</p></div>
              </header>
              {(overview?.recentServices ?? []).map((service) => (
                <Link key={service.id} to={`/services/${service.id}`} className="profile-service-row">
                  <CategoryMark
                    icon={service.product.category?.icon}
                    logoUrl={service.product.category?.logoUrl}
                    color={service.product.category?.color}
                    size={32}
                    className="profile-service-row__mark"
                  />
                  <span>
                    <strong>{service.name}</strong>
                    <small>{service.product.category?.name || service.product.name}</small>
                  </span>
                  <span className={statusBadge(service.status)}>{service.status.replace('_', ' ')}</span>
                </Link>
              ))}
              {!overview?.recentServices?.length && (
                <div className="profile-card__empty">
                  <Server size={20} /><span>No services yet</span>
                  <Link to="/game-hosting">Browse plans</Link>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

      {tab === 'security' && (
        <div className="profile-content-grid">
          <form className="profile-card profile-form" onSubmit={savePassword}>
            <header className="profile-card__header">
              <span className="profile-card__icon"><LockKeyhole size={18} /></span>
              <div>
                <h2>Change your password</h2>
                <p>Updates billing; Panel is synced when the Application API allows it (not for elevated Panel admins).</p>
              </div>
            </header>
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
            <div className="profile-form__grid">
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
            {securityForm.password && (
              <div className="profile-strength">
                <div><span style={{ width: `${(score / 4) * 100}%`, background: strengthColor[score] }} /></div>
                <strong style={{ color: strengthColor[score] }}>{strengthLabel[score]}</strong>
                <small>Use at least 16 characters with letters and numbers.</small>
              </div>
            )}
            <footer className="profile-card__footer">
              <span>Normal client Panel accounts stay in sync; Panel admins must change Panel password in the panel.</span>
              <button className="ds-btn ds-btn--primary" disabled={savingSecurity} type="submit">
                <KeyRound size={15} /> {savingSecurity ? 'Updating…' : 'Update password'}
              </button>
            </footer>
          </form>

          <aside className="profile-side-stack">
            <section className="profile-security-score">
              <span><ShieldCheck size={23} /></span>
              <small>Account protection</small>
              <strong>Protected</strong>
              <p>Your session is secured and sensitive changes require your current password.</p>
            </section>
            <section className="profile-card profile-tips">
              <header className="profile-card__header">
                <span className="profile-card__icon"><ShieldCheck size={18} /></span>
                <div><h2>Security checklist</h2><p>Keep your account safe.</p></div>
              </header>
              {[
                'Use a unique password you do not reuse',
                'Mix letters, numbers, and symbols',
                'Sign out when using a shared device',
                'Never share your password with support',
              ].map((tip) => (
                <div key={tip}><CheckCircle2 size={15} /><span>{tip}</span></div>
              ))}
            </section>
          </aside>
        </div>
      )}

      {tab === 'panel' && (
        <div className="profile-panel-grid">
          <section className={`profile-panel-connection ${overview?.panelLinked ? 'is-connected' : 'is-missing'}`}>
            <div className="profile-panel-connection__icon">
              {overview?.panelLinked ? <Wifi size={28} /> : <Link2 size={28} />}
            </div>
            <span>Spirit-Panel connection</span>
            <h2>{overview?.panelLinked ? 'Connected and ready' : 'Connection required'}</h2>
            <p>
              {overview?.panelLinked
                ? 'Your identity, password, and provisioned services stay connected to your game panel.'
                : 'Your billing account is not linked to a panel user. Contact support before ordering hosting.'}
            </p>
            {overview?.panelLinked && panelHref && (
              <a className="ds-btn ds-btn--primary" href={panelHref} target="_blank" rel="noopener noreferrer">
                Launch game panel <ExternalLink size={15} />
              </a>
            )}
          </section>

          <section className="profile-card profile-panel-details">
            <header className="profile-card__header">
              <span className="profile-card__icon"><Link2 size={18} /></span>
              <div><h2>Connection details</h2><p>Used securely during provisioning.</p></div>
            </header>
            <div className="profile-panel-details__row">
              <span>Connection status</span>
              <strong className={overview?.panelLinked ? 'is-good' : 'is-warning'}>
                {overview?.panelLinked ? 'Connected' : 'Not linked'}
              </strong>
            </div>
            <div className="profile-panel-details__row">
              <span>Panel user ID</span>
              <div>
                <code>{user?.panelUserId || 'Not available'}</code>
                <button type="button" disabled={!user?.panelUserId} onClick={() => void copyPanelId()}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </section>

          <section className="profile-card profile-sync-card">
            <header className="profile-card__header">
              <span className="profile-card__icon"><Activity size={18} /></span>
              <div><h2>Automatic sync</h2><p>What billing keeps aligned.</p></div>
            </header>
            {[
              ['Identity', 'Name, email, and username'],
              ['Profile photo', 'Your avatar URL'],
              ['Security', 'Password changes'],
              ['Hosting', 'Server ownership after payment'],
            ].map(([title, detail]) => (
              <div className="profile-sync-row" key={title}>
                {overview?.panelLinked ? <CheckCircle2 size={16} /> : <Link2 size={16} />}
                <span><strong>{title}</strong><small>{detail}</small></span>
                <em>{overview?.panelLinked ? 'Synced' : 'Paused'}</em>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
