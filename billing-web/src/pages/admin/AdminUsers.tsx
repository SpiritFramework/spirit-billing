import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserRound,
  Users,
  UserX,
  WalletCards,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ThemedSelect } from '../../components/ThemedSelect';

type AdminUserListItem = {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
  panelUserId: string | null;
  creditBalanceCents: number;
  enabled: boolean;
  createdAt: string;
  _count: { services: number; invoices: number };
};

type AdminUserDetail = AdminUserListItem & {
  updatedAt: string;
  panelWebUrl: string;
  panelLinked: boolean;
  panelStatus?: 'linked' | 'missing' | 'unreachable';
  stats: {
    services: number;
    activeServices: number;
    invoices: number;
    unpaidInvoices: number;
    paidInvoices: number;
  };
  services: Array<{
    id: string;
    name: string;
    status: string;
    panelServerId: string | null;
    priceCents: number | null;
    currency: string | null;
    cycle: string | null;
    nextDueAt: string | null;
    createdAt: string;
    product: { id: string; name: string; cycle: string; priceCents: number; currency: string };
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    serviceId: string | null;
  }>;
  creditLedgers: Array<{
    id: string;
    amountCents: number;
    balanceAfterCents: number;
    reason: string;
    note: string | null;
    invoiceId: string | null;
    createdAt: string;
  }>;
};

function displayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
}) {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.username;
}

function initials(u: {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
}) {
  const a = (u.firstName || u.username || '?').slice(0, 1);
  const b = (u.lastName || '').slice(0, 1);
  return (a + b).toUpperCase();
}

function Avatar({
  user,
  size = '2.5rem',
}: {
  user: { avatarUrl?: string | null; firstName?: string | null; lastName?: string | null; username: string };
  size?: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = user.avatarUrl?.trim();
  const ok = Boolean(url && /^https?:\/\//i.test(url) && !broken);

  if (ok) {
    return (
      <img
        src={url!}
        alt=""
        className="admin-user-avatar"
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className="admin-user-avatar admin-user-avatar--fallback" style={{ width: size, height: size }} aria-hidden>
      {initials(user)}
    </div>
  );
}

export function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'staff' | 'client'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<AdminUserListItem[]>('/admin/users')
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      const hay = [u.username, u.email, u.firstName, u.lastName, u.panelUserId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, query, roleFilter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((u) => u.role === 'admin').length,
      staff: users.filter((u) => u.role === 'staff').length,
      clients: users.filter((u) => u.role === 'client').length,
      linked: users.filter((u) => Boolean(u.panelUserId)).length,
      disabled: users.filter((u) => !u.enabled).length,
    }),
    [users],
  );

  return (
    <div className="au-v2">
      <header className="au-v2__header">
        <div><span>User management</span><h1>Users</h1><p>Manage client access, panel links, billing activity, and account security.</p></div>
        <div className="au-v2__health"><UserCheck size={16} /><span><strong>{stats.linked} linked</strong><small>{stats.total ? Math.round((stats.linked / stats.total) * 100) : 0}% panel coverage</small></span></div>
      </header>

      <section className="au-v2-metrics">
        <div><span><Users size={16} /></span><p>All users<small>{stats.clients} client accounts</small></p><strong>{stats.total}</strong></div>
        <div><span><Shield size={16} /></span><p>Administrators<small>Elevated access</small></p><strong>{stats.admins}</strong></div>
        <div><span><UserCheck size={16} /></span><p>Panel linked<small>Ready to provision</small></p><strong>{stats.linked}</strong></div>
        <div className={stats.disabled ? 'has-warning' : ''}><span><UserX size={16} /></span><p>Disabled<small>Access suspended</small></p><strong>{stats.disabled}</strong></div>
      </section>

      <section className="au-v2-toolbar">
        <label><Search size={15} /><input placeholder="Search name, email, username, or panel ID…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div>
          {([
            ['all', 'All'],
            ['client', 'Clients'],
            ['staff', 'Staff'],
            ['admin', 'Admins'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={roleFilter === value ? 'is-active' : ''}
              onClick={() => setRoleFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="au-v2-list">
        <header><span>User</span><span>Access</span><span>Panel</span><span>Activity</span><span>Joined</span><span /></header>
        {filtered.map((user) => (
          <button type="button" key={user.id} className="au-v2-row" onClick={() => navigate(`/admin/users/${user.id}`)}>
            <span className="au-v2-row__identity"><Avatar user={user} size="2.3rem" /><span><strong>{displayName(user)}</strong><small>@{user.username} · {user.email}</small></span></span>
            <span className="au-v2-row__access"><i className={user.enabled ? 'is-active' : ''} /> <span><strong>{user.enabled ? 'Active' : 'Disabled'}</strong><small>{user.role === 'admin' ? 'Administrator' : user.role === 'staff' ? 'Staff' : 'Client'}</small></span></span>
            <span className={`au-v2-row__panel ${user.panelUserId ? 'is-linked' : ''}`}>{user.panelUserId ? <Check size={13} /> : <Ban size={13} />}{user.panelUserId ? 'Linked' : 'Not linked'}</span>
            <span className="au-v2-row__activity"><span><Server size={12} /> {user._count.services}</span><span><FileText size={12} /> {user._count.invoices}</span></span>
            <span className="au-v2-row__date">{new Date(user.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <ChevronRight size={15} />
          </button>
        ))}
        {!loading && !filtered.length && <div className="au-v2-empty"><Search size={22} /><strong>No users found</strong><span>Try another search or filter.</span></div>}
        {loading && <div className="au-v2-empty"><Activity size={22} /><strong>Loading users…</strong></div>}
      </section>
    </div>
  );
}

export function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const fullAdmin = isFullAdmin(currentUser?.role);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'overview' | 'services' | 'invoices'>('overview');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [relinkPassword, setRelinkPassword] = useState('');
  const [relinkConfirm, setRelinkConfirm] = useState('');
  const [relinkBusy, setRelinkBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  async function load() {
    if (!id) return;
    try {
      setUser(await api<AdminUserDetail>(`/admin/users/${id}`));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load user');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function patchUser(body: { enabled?: boolean; role?: 'admin' | 'staff' | 'client' }) {
    if (!id) return;
    if (body.role && !window.confirm(`Change this user's role to ${body.role}?`)) return;
    if (body.enabled === false && !window.confirm('Disable this account? They will be signed out.')) return;
    if (body.enabled === true && !window.confirm('Re-enable this account?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
      setMessage('User updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function copyPanelId() {
    if (!user?.panelUserId) return;
    await navigator.clipboard.writeText(user.panelUserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function adjustCredits(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const pounds = Number(creditAmount);
    if (!Number.isFinite(pounds) || pounds === 0) {
      setError('Enter a non-zero credit amount in pounds (use negative to remove).');
      return;
    }
    const amountCents = Math.round(pounds * 100);
    if (!window.confirm(`${amountCents > 0 ? 'Add' : 'Remove'} ${money(Math.abs(amountCents), 'GBP')} credits?`)) {
      return;
    }
    setCreditBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}/credits`, {
        method: 'POST',
        body: JSON.stringify({ amountCents, note: creditNote.trim() || undefined }),
      });
      setCreditAmount('');
      setCreditNote('');
      await load();
      setMessage('Credit balance updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Credit adjust failed');
    } finally {
      setCreditBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!id || !user) return;
    if (password.length < 16) {
      setError('Password must be at least 16 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Password confirmation does not match.');
      return;
    }
    if (!window.confirm(`Change ${user.username}'s password and sign them out everywhere?`)) return;

    setPasswordBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        updated: true;
        panelLinkCleared?: boolean;
        panelPasswordSkipped?: boolean;
        warning?: string;
      }>(`/admin/users/${id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setPasswordConfirm('');
      await load();
      if (result.warning) {
        setMessage(result.warning);
      } else if (result.panelLinkCleared) {
        setMessage('Billing password updated. The Spirit-Panel link was cleared because that panel account no longer exists.');
      } else if (result.panelPasswordSkipped) {
        setMessage('Billing password updated. Spirit-Panel password was not changed (elevated Panel account).');
      } else {
        setMessage(user.panelLinked ? 'Password updated in billing and Spirit-Panel.' : 'Billing password updated.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Password update failed');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function relinkPanel(e: FormEvent) {
    e.preventDefault();
    if (!id || !user) return;
    if (relinkPassword.length < 16) {
      setError('Password must be at least 16 characters.');
      return;
    }
    if (relinkPassword !== relinkConfirm) {
      setError('Password confirmation does not match.');
      return;
    }
    if (!window.confirm(`Create or link a Spirit-Panel account for ${user.username}? This also updates their billing password.`)) {
      return;
    }

    setRelinkBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        panelLinked?: boolean;
        panelPasswordSkipped?: boolean;
        warning?: string;
      }>(`/admin/users/${id}/relink-panel`, {
        method: 'POST',
        body: JSON.stringify({ password: relinkPassword }),
      });
      setRelinkPassword('');
      setRelinkConfirm('');
      await load();
      setMessage(
        result.warning ||
          (result.panelPasswordSkipped
            ? 'Spirit-Panel linked. Billing password updated; Panel password unchanged (elevated account).'
            : 'Spirit-Panel account linked. Password was synced to billing and the panel.'),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not relink Spirit-Panel');
    } finally {
      setRelinkBusy(false);
    }
  }

  async function deleteUser() {
    if (!id || !user) return;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      navigate('/admin/users', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'User deletion failed');
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  }

  if (error && !user) {
    return (
      <div className="ds-stack">
        <Link to="/admin/users" className="ds-back"><ArrowLeft size={14} /> Back to users</Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }

  if (!user) return <div className="ds-muted">Loading user…</div>;

  const name = displayName(user);

  return (
    <div className="aud-v2">
      <Link to="/admin/users" className="aud-v2__back"><ArrowLeft size={14} /> User directory</Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--info">{message}</div>}

      <section className="aud-v2-hero">
        <Avatar user={user} size="4.25rem" />
        <div className="aud-v2-hero__identity">
          <span>Customer account</span>
          <h1>{name}</h1>
          <p>@{user.username} <i /> {user.email}</p>
          <div>
            <span className={user.role === 'admin' || user.role === 'staff' ? 'is-admin' : ''}><Shield size={11} /> {user.role === 'admin' ? 'Admin' : user.role === 'staff' ? 'Staff' : 'Client'}</span>
            <span className={user.enabled ? 'is-active' : 'is-disabled'}><i /> {user.enabled ? 'Active' : 'Disabled'}</span>
            <span className={user.panelLinked ? 'is-linked' : 'is-missing'}><Server size={11} /> {user.panelLinked ? 'Panel linked' : 'Panel missing'}</span>
          </div>
        </div>
        <div className="aud-v2-hero__actions">
          {user.panelLinked && safeExternalHref(user.panelWebUrl) && (
            <a href={safeExternalHref(user.panelWebUrl)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> Open panel
            </a>
          )}
          {fullAdmin && (
          <button
            className={user.enabled ? 'is-disable' : 'is-enable'}
            type="button"
            disabled={saving}
            onClick={() => void patchUser({ enabled: !user.enabled })}
          >
            {user.enabled ? 'Disable account' : 'Enable account'}
          </button>
          )}
        </div>
      </section>

      <section className="aud-v2-metrics">
        <div><span><WalletCards size={15} /></span><p>Credit balance<small>Available to spend</small></p><strong>{money(user.creditBalanceCents ?? 0, 'GBP')}</strong></div>
        <div><span><Server size={15} /></span><p>Services<small>{user.stats.activeServices} currently active</small></p><strong>{user.stats.services}</strong></div>
        <div><span><FileText size={15} /></span><p>Invoices<small>{user.stats.paidInvoices} paid</small></p><strong>{user.stats.invoices}</strong></div>
        <div className={user.stats.unpaidInvoices ? 'has-warning' : ''}><span><CircleDollarSign size={15} /></span><p>Unpaid invoices<small>Awaiting payment</small></p><strong>{user.stats.unpaidInvoices}</strong></div>
      </section>

      <div className="aud-v2-tabs" role="tablist">
        <button type="button" className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>
          <UserRound size={14} /> Overview
        </button>
        <button type="button" className={tab === 'services' ? 'is-active' : ''} onClick={() => setTab('services')}>
          <Server size={14} /> Services <span>{user.services.length}</span>
        </button>
        <button type="button" className={tab === 'invoices' ? 'is-active' : ''} onClick={() => setTab('invoices')}>
          <FileText size={14} /> Invoices <span>{user.invoices.length}</span>
        </button>
      </div>

      {tab === 'overview' && (
        <div className="aud-v2-overview">
          <div className="aud-v2-card aud-v2-account">
            <div>
              <span className="aud-v2-card__icon"><UserRound size={15} /></span>
              <div><h3>Account details</h3><p>Identity and permissions for this user.</p></div>
            </div>
            <div className="aud-v2-details">
              <div className="pf-link-row">
                <div>
                  <div className="ds-faint" style={{ fontSize: '0.72rem' }}>Full name</div>
                  <strong>{name}</strong>
                </div>
              </div>
              <div className="pf-link-row">
                <div>
                  <div className="ds-faint" style={{ fontSize: '0.72rem' }}>Username</div>
                  <strong>@{user.username}</strong>
                </div>
              </div>
              <div className="pf-link-row">
                <div>
                  <div className="ds-faint" style={{ fontSize: '0.72rem' }}>Email</div>
                  <strong style={{ wordBreak: 'break-all' }}>{user.email}</strong>
                </div>
              </div>
              <div className="pf-link-row">
                <div>
                  <div className="ds-faint" style={{ fontSize: '0.72rem' }}>User ID</div>
                  <span className="pf-mono">{user.id}</span>
                </div>
              </div>
            </div>
            <label className="aud-v2-role">
              <span>Account role</span>
              {fullAdmin ? (
              <ThemedSelect
                ariaLabel="Account role"
                value={user.role}
                disabled={saving}
                onChange={(role) => void patchUser({ role: role as 'admin' | 'staff' | 'client' })}
                options={[
                  { value: 'client', label: 'Client', description: 'Standard billing and hosting access' },
                  { value: 'staff', label: 'Staff', description: 'Light admin: tickets, suspend, read-only settings' },
                  { value: 'admin', label: 'Administrator', description: 'Full billing administration access' },
                ]}
              />
              ) : (
                <strong>{user.role === 'admin' ? 'Administrator' : user.role === 'staff' ? 'Staff' : 'Client'}</strong>
              )}
            </label>
          </div>

          {fullAdmin && (
          <div className="aud-v2-card aud-v2-password">
            <div>
              <span className="aud-v2-card__icon"><KeyRound size={15} /></span>
              <div><h3>Change password</h3><p>Updates billing and the linked panel, then signs the user out.</p></div>
            </div>
            <form onSubmit={(event) => void changePassword(event)}>
              <label><span>New password</span><input type="password" autoComplete="new-password" minLength={16} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 16 characters" required /></label>
              <label><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={16} maxLength={200} value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Repeat new password" required /></label>
              <button type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'} <KeyRound size={13} /></button>
            </form>
          </div>
          )}

          {fullAdmin && (
          <div className="aud-v2-card aud-v2-credits">
            <div className="aud-v2-credits__head">
              <span className="aud-v2-card__icon"><WalletCards size={15} /></span>
              <div>
                <h3>Account credits</h3>
                <p>Wallet balance used for invoices, upgrades, and refunds.</p>
              </div>
            </div>

            <div className="aud-v2-credits__balance">
              <div>
                <small>Available balance</small>
                <strong>{money(user.creditBalanceCents ?? 0, 'GBP')}</strong>
              </div>
              <div>
                <small>Admin adjustments</small>
                <strong>{user.creditLedgers?.length ?? 0}</strong>
              </div>
              <div>
                <small>Last movement</small>
                <strong>
                  {user.creditLedgers?.[0]
                    ? new Date(user.creditLedgers[0].createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })
                    : '—'}
                </strong>
              </div>
            </div>

            <form className="aud-v2-credits__form" onSubmit={(e) => void adjustCredits(e)}>
              <div className="aud-v2-credits__quick">
                {[10, 25, 50, -10].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    disabled={creditBusy}
                    onClick={() => setCreditAmount(String(amount))}
                  >
                    {amount > 0 ? `+£${amount}` : `−£${Math.abs(amount)}`}
                  </button>
                ))}
              </div>
              <div className="aud-v2-credits__fields">
                <label>
                  <span>Amount (£)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder="10.00 or -5.00"
                    required
                  />
                </label>
                <label>
                  <span>Note</span>
                  <input
                    value={creditNote}
                    onChange={(e) => setCreditNote(e.target.value)}
                    placeholder="Reason for this adjustment"
                    maxLength={500}
                  />
                </label>
              </div>
              <button type="submit" disabled={creditBusy}>
                <WalletCards size={14} /> {creditBusy ? 'Saving…' : 'Apply credit adjustment'}
              </button>
            </form>

            <div className="aud-v2-credits__ledger">
              <header>
                <span>Admin credit adjustments</span>
                <small>Adds and removals from this panel only</small>
              </header>
              {(user.creditLedgers?.length ?? 0) > 0 ? (
                <ul>
                  {user.creditLedgers.map((row) => (
                    <li key={row.id}>
                      <span className={`aud-v2-credits__delta ${row.amountCents >= 0 ? 'is-credit' : 'is-debit'}`}>
                        {row.amountCents >= 0 ? '+' : ''}
                        {money(row.amountCents, 'GBP')}
                      </span>
                      <span>
                        <strong>{row.amountCents >= 0 ? 'Credit added' : 'Credit removed'}</strong>
                        <small>
                          {row.note || 'No note'}
                          {' · '}
                          {new Date(row.createdAt).toLocaleString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </small>
                      </span>
                      <em>Bal {money(row.balanceAfterCents, 'GBP')}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="aud-v2-credits__empty">
                  <WalletCards size={18} />
                  <span>No admin credit adjustments yet for this account.</span>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="aud-v2-card aud-v2-panel">
            <div>
              <span className="aud-v2-card__icon"><Server size={15} /></span>
              <div><h3>Spirit-Panel link</h3><p>Verified live against the game panel. Stale IDs are cleared automatically.</p></div>
            </div>
            <div className="pf-link-row">
              <div style={{ minWidth: 0 }}>
                <div className="ds-faint" style={{ fontSize: '0.72rem' }}>Panel user ID</div>
                <div className="pf-mono">{user.panelUserId || 'Not linked'}</div>
              </div>
              {user.panelUserId && (
                <button className="ds-btn ds-btn--ghost ds-btn--sm" type="button" onClick={() => void copyPanelId()}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <div className="pf-link-row">
              <div>
                <div className="ds-faint" style={{ fontSize: '0.72rem' }}>Status</div>
                <span className={user.panelLinked ? 'ds-badge ds-badge--success' : 'ds-badge ds-badge--warning'}>
                  {user.panelLinked
                    ? 'Connected'
                    : user.panelStatus === 'unreachable'
                      ? 'Panel unreachable'
                      : 'Not connected'}
                </span>
              </div>
              <Shield size={16} style={{ color: 'var(--muted)' }} />
            </div>
            {user.panelLinked && safeExternalHref(user.panelWebUrl) && (
              <a className="ds-btn ds-btn--ghost" href={safeExternalHref(user.panelWebUrl)} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'start' }}>
                <ExternalLink size={14} /> Open game panel
              </a>
            )}
            {fullAdmin && (!user.panelLinked || user.panelStatus === 'unreachable') && (
              <form className="ds-stack" onSubmit={(event) => void relinkPanel(event)} style={{ marginTop: '0.35rem' }}>
                <p className="ds-faint" style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.45 }}>
                  Recreate or attach a Spirit-Panel account for this user. Provide a password that meets panel policy (16+ characters).
                </p>
                <label>
                  <span>Panel password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={16}
                    maxLength={200}
                    value={relinkPassword}
                    onChange={(event) => setRelinkPassword(event.target.value)}
                    placeholder="At least 16 characters"
                    required
                  />
                </label>
                <label>
                  <span>Confirm password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={16}
                    maxLength={200}
                    value={relinkConfirm}
                    onChange={(event) => setRelinkConfirm(event.target.value)}
                    placeholder="Repeat password"
                    required
                  />
                </label>
                <button type="submit" className="ds-btn ds-btn--primary" disabled={relinkBusy}>
                  <Link2 size={13} /> {relinkBusy ? 'Linking…' : 'Relink Spirit-Panel'}
                </button>
              </form>
            )}
          </div>

          {fullAdmin && (
          <div className="aud-v2-card aud-v2-danger">
            <div>
              <span className="aud-v2-card__icon"><Trash2 size={15} /></span>
              <div><h3>Delete user</h3><p>Permanently removes billing data and their linked panel account.</p></div>
            </div>
            <div className="aud-v2-danger__body">
              <span><strong>This action cannot be undone.</strong><small>Panel users that still own servers must have those services removed first.</small></span>
              <button type="button" disabled={deleting} onClick={() => setDeleteModalOpen(true)}><Trash2 size={13} /> Delete user</button>
            </div>
          </div>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div className="ds-table-wrap aud-v2-table">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Price</th>
                <th>Panel server</th>
                <th>Next due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {user.services.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.product.name}</td>
                  <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                  <td>{money(s.priceCents ?? s.product.priceCents, s.currency ?? s.product.currency)} / {s.cycle ?? s.product.cycle}</td>
                  <td className="ds-muted">{s.panelServerId ?? '—'}</td>
                  <td className="ds-muted">
                    {s.nextDueAt ? new Date(s.nextDueAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <Link to={`/admin/services/${s.id}`} className="ds-btn ds-btn--secondary ds-btn--sm">
                      <SlidersHorizontal size={12} /> Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!user.services.length && (
                <tr>
                  <td colSpan={7} className="ds-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                    No services for this user.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="ds-table-wrap aud-v2-table">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {user.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Link to={`/admin/invoices/${inv.id}`} style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>
                      {inv.number}
                    </Link>
                  </td>
                  <td><span className={statusBadge(inv.status)}>{inv.status}</span></td>
                  <td>{money(inv.totalCents, inv.currency)}</td>
                  <td className="ds-muted">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="ds-muted">
                    {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {!user.invoices.length && (
                <tr>
                  <td colSpan={5} className="ds-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                    No invoices for this user.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={deleteModalOpen}
        title={`Delete ${name}?`}
        description="This permanently removes the billing account and its linked Spirit-Panel account."
        confirmLabel="Delete user"
        busy={deleting}
        requireText={user.username}
        consequences={[
          'Billing history, credits, and account access will be removed.',
          'The linked Spirit-Panel user will also be deleted.',
          'Users that still own panel servers must have those services removed first.',
        ]}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => void deleteUser()}
      />
    </div>
  );
}
