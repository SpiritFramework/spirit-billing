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
  ShieldOff,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
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
    product: {
      id: string;
      name: string;
      cycle: string;
      priceCents: number;
      currency: string;
      category?: {
        id: string;
        name: string;
        color: string;
        icon: string;
        logoUrl: string | null;
      } | null;
    };
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
    description: string | null;
    createdAt: string;
    dueAt: string | null;
    paidAt: string | null;
    serviceId: string | null;
    service: {
      id: string;
      name: string;
      product: {
        id: string;
        name: string;
        category?: {
          id: string;
          name: string;
          color: string;
          icon: string;
          logoUrl: string | null;
        } | null;
      };
    } | null;
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

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin';
  if (role === 'staff') return 'Staff';
  return 'Client';
}

function roleSummary(role: string) {
  if (role === 'admin') return 'Full billing administration';
  if (role === 'staff') return 'Tickets, suspend, and read-only settings';
  return 'Standard billing and hosting access';
}

export function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'staff' | 'client'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [panelFilter, setPanelFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<AdminUserListItem[]>('/admin/users')
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((u) => u.role === 'admin').length,
      staff: users.filter((u) => u.role === 'staff').length,
      clients: users.filter((u) => u.role === 'client').length,
      linked: users.filter((u) => Boolean(u.panelUserId)).length,
      unlinked: users.filter((u) => !u.panelUserId).length,
      active: users.filter((u) => u.enabled).length,
      disabled: users.filter((u) => !u.enabled).length,
    }),
    [users],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => {
        if (roleFilter !== 'all' && u.role !== roleFilter) return false;
        if (statusFilter === 'active' && !u.enabled) return false;
        if (statusFilter === 'disabled' && u.enabled) return false;
        if (panelFilter === 'linked' && !u.panelUserId) return false;
        if (panelFilter === 'unlinked' && u.panelUserId) return false;
        if (!q) return true;
        const hay = [u.username, u.email, u.firstName, u.lastName, u.panelUserId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [users, query, roleFilter, statusFilter, panelFilter]);

  const coverage = stats.total ? Math.round((stats.linked / stats.total) * 100) : 0;
  const filtersActive =
    roleFilter !== 'all' || statusFilter !== 'all' || panelFilter !== 'all' || Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (roleFilter !== 'all') parts.push(roleLabel(roleFilter));
    if (statusFilter === 'active') parts.push('Active');
    if (statusFilter === 'disabled') parts.push('Disabled');
    if (panelFilter === 'linked') parts.push('Linked');
    if (panelFilter === 'unlinked') parts.push('Not linked');
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [roleFilter, statusFilter, panelFilter, query]);

  function clearFilters() {
    setRoleFilter('all');
    setStatusFilter('all');
    setPanelFilter('all');
    setQuery('');
  }

  function onAccountsChip() {
    clearFilters();
  }

  function onPanelChip() {
    setRoleFilter('all');
    setStatusFilter('all');
    setQuery('');
    setPanelFilter(coverage < 100 ? 'unlinked' : 'linked');
  }

  function onDisabledChip() {
    setRoleFilter('all');
    setPanelFilter('all');
    setQuery('');
    setStatusFilter('disabled');
  }

  return (
    <div className="ops-users">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Directory</span>
          <h1>Users</h1>
          <p>Account access, panel linkage, credits, and billing activity in one ops view.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive ? ' is-active' : ''}`}
            onClick={onAccountsChip}
            title="Show all accounts"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <UserRound size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Accounts</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${
              panelFilter === (coverage < 100 ? 'unlinked' : 'linked') &&
              roleFilter === 'all' &&
              statusFilter === 'all' &&
              !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={onPanelChip}
            title={coverage < 100 ? 'Show accounts missing panel link' : 'Show panel-linked accounts'}
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Link2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Panel</small>
              <strong>{coverage}%</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.disabled ? ' is-warn' : ''}${
              statusFilter === 'disabled' && roleFilter === 'all' && panelFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={onDisabledChip}
            title="Show disabled accounts"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Ban size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Disabled</small>
              <strong>{stats.disabled}</strong>
            </span>
          </button>
        </div>
      </header>

      <div className="ops-users__shell">
        <aside className="ops-users__rail" aria-label="User filters">
          <div className="ops-users__rail-block">
            <span>Role</span>
            <div>
              {(
                [
                  ['all', 'All roles', stats.total],
                  ['client', 'Clients', stats.clients],
                  ['staff', 'Staff', stats.staff],
                  ['admin', 'Admins', stats.admins],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={roleFilter === value ? 'is-on' : ''}
                  onClick={() => setRoleFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Status</span>
            <div>
              {(
                [
                  ['all', 'Any status', stats.total],
                  ['active', 'Active', stats.active],
                  ['disabled', 'Disabled', stats.disabled],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? 'is-on' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Panel</span>
            <div>
              {(
                [
                  ['all', 'Any link', stats.total],
                  ['linked', 'Linked', stats.linked],
                  ['unlinked', 'Not linked', stats.unlinked],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={panelFilter === value ? 'is-on' : ''}
                  onClick={() => setPanelFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command">
            <label className="ops-users__search">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setQuery('');
                  }
                }}
                placeholder="Filter by name, email, username, or panel ID"
                aria-label="Search users"
              />
              {query ? (
                <button
                  type="button"
                  className="ops-users__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>
            <div className="ops-users__command-meta">
              <span>
                Showing <strong>{filtered.length}</strong> / {stats.total}
              </span>
              {filtersActive ? (
                <>
                  <span className="ops-users__filter-summary">{filterSummary.join(' · ')}</span>
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <section className="ops-users__table" aria-label="Users">
            <div className="ops-users__head" aria-hidden>
              <span>Account</span>
              <span>Role</span>
              <span>Panel</span>
              <span>Credits</span>
              <span>Activity</span>
              <span>Joined</span>
              <span />
            </div>

            {filtered.map((user) => (
              <button
                type="button"
                key={user.id}
                className="ops-users__row"
                onClick={() => navigate(`/admin/users/${user.id}`)}
              >
                <span className="ops-users__who">
                  <span
                    className={`ops-users__avatar-wrap ${user.enabled ? 'is-on' : 'is-off'}`}
                    title={user.enabled ? 'Active' : 'Disabled'}
                  >
                    <Avatar user={user} size="2.35rem" />
                  </span>
                  <span>
                    <strong>{displayName(user)}</strong>
                    <small>
                      @{user.username}
                      <span aria-hidden="true"> · </span>
                      {user.email}
                    </small>
                  </span>
                </span>

                <span
                  className={`ops-users__role${
                    user.role === 'admin' ? ' is-admin' : user.role === 'staff' ? ' is-staff' : ' is-client'
                  }`}
                >
                  <Shield size={12} aria-hidden />
                  {roleLabel(user.role)}
                </span>

                <span className={`ops-users__panel ${user.panelUserId ? 'is-yes' : 'is-no'}`}>
                  {user.panelUserId ? <Check size={12} aria-hidden /> : <Ban size={12} aria-hidden />}
                  {user.panelUserId ? 'Linked' : 'Missing'}
                </span>

                <span className="ops-users__credit">{money(user.creditBalanceCents ?? 0, 'GBP')}</span>

                <span className="ops-users__activity">
                  <span title="Services">
                    <Server size={12} aria-hidden />
                    <strong>{user._count.services}</strong>
                  </span>
                  <span title="Invoices">
                    <FileText size={12} aria-hidden />
                    <strong>{user._count.invoices}</strong>
                  </span>
                </span>

                <span className="ops-users__date">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: '2-digit',
                  })}
                </span>

                <ChevronRight size={14} aria-hidden />
              </button>
            ))}

            {!loading && !filtered.length && (
              <div className="ops-users__empty">
                <Search size={20} aria-hidden />
                <strong>No matching accounts</strong>
                <span>Adjust filters or clear the search query.</span>
                {filtersActive ? (
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            )}

            {loading && (
              <div className="ops-users__empty">
                <Activity size={20} aria-hidden />
                <strong>Loading directory…</strong>
              </div>
            )}
          </section>
        </div>
      </div>
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'services' | 'invoices'>('overview');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordStepUp, setPasswordStepUp] = useState('');
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
    let currentPassword: string | undefined;
    if (body.role) {
      const entered = window.prompt('Enter your admin password to confirm this role change:');
      if (!entered) return;
      currentPassword = entered;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...body, ...(currentPassword ? { currentPassword } : {}) }),
      });
      await load();
      setMessage('User updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
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
    if (!passwordStepUp.trim()) {
      setError('Enter your current admin password to confirm.');
      return;
    }
    if (user.role === 'admin' && user.id !== currentUser?.id) {
      setError('Cannot reset another administrator’s password.');
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
        body: JSON.stringify({ password, currentPassword: passwordStepUp }),
      });
      setPassword('');
      setPasswordConfirm('');
      setPasswordStepUp('');
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
      <div className="ops-user">
        <Link to="/admin/users" className="ops-user__back">
          <ArrowLeft size={14} /> Directory
        </Link>
        <div className="ops-user__alert is-error">{error}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ops-user">
        <div className="ops-user__loading">
          <Activity size={18} aria-hidden />
          Loading account…
        </div>
      </div>
    );
  }

  const name = displayName(user);
  const panelHref = user.panelLinked ? safeExternalHref(user.panelWebUrl) : null;
  const panelLabel = user.panelLinked
    ? 'Connected'
    : user.panelStatus === 'unreachable'
      ? 'Unreachable'
      : 'Not linked';

  return (
    <div className="ops-user ops-account">
      <Link to="/admin/users" className="ops-user__back">
        <ArrowLeft size={14} /> Directory
      </Link>

      {error ? <div className="ops-user__alert is-error">{error}</div> : null}
      {message ? <div className="ops-user__alert is-info">{message}</div> : null}

      <section className="ops-account__stage">
      <header className="ops-user__mast">
        <div className="ops-user__identity">
          <span className={`ops-user__avatar-wrap ${user.enabled ? 'is-on' : 'is-off'}`}>
            <Avatar user={user} size="3.25rem" />
          </span>
          <div className="ops-user__identity-copy">
            <span>Account</span>
            <h1>{name}</h1>
            <p>
              @{user.username}
              <span aria-hidden="true"> · </span>
              {user.email}
            </p>
            <div className="ops-user__badges">
              <span
                className={`ops-users__role${
                  user.role === 'admin' ? ' is-admin' : user.role === 'staff' ? ' is-staff' : ' is-client'
                }`}
              >
                <Shield size={12} aria-hidden />
                {roleLabel(user.role)}
              </span>
              <span className={`ops-user__state ${user.enabled ? 'is-on' : 'is-off'}`}>
                <i aria-hidden />
                {user.enabled ? 'Active' : 'Disabled'}
              </span>
              <span className={`ops-users__panel ${user.panelLinked ? 'is-yes' : 'is-no'}`}>
                {user.panelLinked ? <Check size={12} aria-hidden /> : <Ban size={12} aria-hidden />}
                {panelLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="ops-user__actions">
          {panelHref ? (
            <a href={panelHref} target="_blank" rel="noopener noreferrer" className="ops-user__btn">
              <ExternalLink size={14} /> Open panel
            </a>
          ) : null}
          {fullAdmin ? (
            <button
              type="button"
              className={`ops-user__btn ${user.enabled ? 'is-danger' : 'is-ok'}`}
              disabled={saving}
              onClick={() => void patchUser({ enabled: !user.enabled })}
            >
              {user.enabled ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
              {user.enabled ? 'Disable' : 'Enable'}
            </button>
          ) : null}
        </div>
      </header>

      <div className="ops-account__rail" aria-label="Account metrics">
        <button
          type="button"
          onClick={() => {
            setTab('overview');
            window.requestAnimationFrame(() => {
              document.getElementById('ops-account-wallet')?.scrollIntoView({ block: 'nearest' });
            });
          }}
        >
          <WalletCards size={14} />
          <span>Credits</span>
          <strong>{money(user.creditBalanceCents ?? 0, 'GBP')}</strong>
          <em>on account</em>
        </button>
        <button type="button" className={tab === 'services' ? 'is-on' : ''} onClick={() => setTab('services')}>
          <Server size={14} />
          <span>Services</span>
          <strong>{user.stats.services}</strong>
          <em>{user.stats.activeServices} active</em>
        </button>
        <button type="button" className={tab === 'invoices' ? 'is-on' : ''} onClick={() => setTab('invoices')}>
          <FileText size={14} />
          <span>Invoices</span>
          <strong>{user.stats.invoices}</strong>
          <em>{user.stats.paidInvoices} paid</em>
        </button>
        <button
          type="button"
          className={user.stats.unpaidInvoices ? 'is-warn' : ''}
          onClick={() => setTab('invoices')}
        >
          <CircleDollarSign size={14} />
          <span>Unpaid</span>
          <strong>{user.stats.unpaidInvoices}</strong>
          <em>{user.stats.unpaidInvoices ? 'needs collecting' : 'clear'}</em>
        </button>
      </div>
      <div className="ops-user__tabs" role="tablist" aria-label="Account sections">
        <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'is-on' : ''} onClick={() => setTab('overview')}>
          <UserRound size={14} /> Overview
        </button>
        <button type="button" role="tab" aria-selected={tab === 'services'} className={tab === 'services' ? 'is-on' : ''} onClick={() => setTab('services')}>
          <Server size={14} /> Services <em>{user.services.length}</em>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'invoices'} className={tab === 'invoices' ? 'is-on' : ''} onClick={() => setTab('invoices')}>
          <FileText size={14} /> Invoices <em>{user.invoices.length}</em>
        </button>
      </div>
      </section>

      {tab === 'overview' ? (
        <div className="ops-account__desk">
          <section className="ops-account__card">
            <header>
              <span>Profile</span>
              <h2>Role and record</h2>
            </header>
            <dl className="ops-account__rows">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd className="ops-account__id">
                  <code title={user.id}>{user.id}</code>
                  <button type="button" className="ops-user__icon-btn" onClick={() => void copyValue('user', user.id)} title="Copy user ID">
                    {copiedKey === 'user' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </dd>
              </div>
              <div className="is-role">
                <dt>Role</dt>
                <dd>
                  <div className="ops-account__role">
                    <strong>{roleLabel(user.role)}</strong>
                    <small>{roleSummary(user.role)}</small>
                  </div>
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
                  ) : null}
                </dd>
              </div>
            </dl>
          </section>

          <section className="ops-account__card">
            <header>
              <span>Panel</span>
              <h2>Spirit-Panel</h2>
              <em className={user.panelLinked ? 'is-ok' : 'is-warn'}>{panelLabel}</em>
            </header>
            <div className={`ops-account__panel-state${user.panelLinked ? ' is-ok' : ''}`}>
              <strong>
                {user.panelLinked
                  ? 'Connected to the game panel'
                  : user.panelStatus === 'unreachable'
                    ? 'Panel did not answer'
                    : 'No panel account yet'}
              </strong>
              <p>
                {user.panelLinked
                  ? 'Servers for this client provision through the linked panel user.'
                  : 'Link a panel account before provisioning servers for this client.'}
              </p>
              {user.panelUserId ? (
                <div className="ops-account__id">
                  <code title={user.panelUserId}>{user.panelUserId}</code>
                  <button type="button" className="ops-user__icon-btn" onClick={() => void copyValue('panel', user.panelUserId!)} title="Copy panel ID">
                    {copiedKey === 'panel' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              ) : null}
            </div>
            {panelHref || (fullAdmin && (!user.panelLinked || user.panelStatus === 'unreachable') && !linkOpen) ? (
            <div className="ops-account__form-actions">
              {panelHref ? (
                <a href={panelHref} target="_blank" rel="noopener noreferrer" className="ops-user__btn is-ghost">
                  <ExternalLink size={14} /> Open game panel
                </a>
              ) : null}
              {fullAdmin && (!user.panelLinked || user.panelStatus === 'unreachable') && !linkOpen ? (
                <button type="button" className="ops-user__btn is-primary" onClick={() => setLinkOpen(true)}>
                  <Link2 size={14} /> Link Spirit-Panel
                </button>
              ) : null}
            </div>
            ) : null}
            {fullAdmin && linkOpen && (!user.panelLinked || user.panelStatus === 'unreachable') ? (
              <form className="ops-user__form" onSubmit={(event) => void relinkPanel(event)}>
                <p>This also sets the billing password. Use at least 16 characters.</p>
                <label className="ops-user__field">
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
                <label className="ops-user__field">
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
                <div className="ops-account__form-actions">
                  <button type="submit" className="ops-user__btn is-primary" disabled={relinkBusy}>
                    <Link2 size={14} /> {relinkBusy ? 'Linking…' : 'Create link'}
                  </button>
                  <button type="button" className="ops-user__btn is-ghost" onClick={() => setLinkOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          {fullAdmin ? (
            <section className="ops-account__card">
              <header>
                <span>Access</span>
                <h2>Password</h2>
              </header>
              {user.role === 'admin' && user.id !== currentUser?.id ? (
                <div className="ops-account__panel-state">
                  <strong>Locked for other administrators</strong>
                  <p>Another admin’s password stays with that account. You can still change a client or staff password here.</p>
                </div>
              ) : (
                <form className="ops-account__pass" onSubmit={(event) => void changePassword(event)}>
                  <div className="ops-account__pass-block">
                    <strong>Confirm it is you</strong>
                    <label className="ops-user__field">
                      <span>Your admin password</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        maxLength={200}
                        value={passwordStepUp}
                        onChange={(event) => setPasswordStepUp(event.target.value)}
                        placeholder="Current password"
                        required
                      />
                    </label>
                  </div>
                  <div className="ops-account__pass-block">
                    <strong>New password for {user.username}</strong>
                    <p>Updates billing and the linked panel, then signs them out everywhere.</p>
                    <label className="ops-user__field">
                      <span>New password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={16}
                        maxLength={200}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="At least 16 characters"
                        required
                      />
                    </label>
                    <label className="ops-user__field">
                      <span>Confirm password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={16}
                        maxLength={200}
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value)}
                        placeholder="Repeat new password"
                        required
                      />
                    </label>
                  </div>
                  <button type="submit" className="ops-user__btn is-primary" disabled={passwordBusy}>
                    <KeyRound size={14} /> {passwordBusy ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              )}
            </section>
          ) : null}

          {fullAdmin ? (
            <section className="ops-account__card" id="ops-account-wallet">
              <header>
                <span>Wallet</span>
                <h2>Credits</h2>
              </header>
              <div className="ops-account__balance">
                <div>
                  <span>Available</span>
                  <strong>{money(user.creditBalanceCents ?? 0, 'GBP')}</strong>
                </div>
                <em>
                  {user.creditLedgers?.length ?? 0} adjustments
                  {user.creditLedgers?.[0]
                    ? ` · last ${new Date(user.creditLedgers[0].createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}`
                    : ''}
                </em>
              </div>
              <form className="ops-account__credit" onSubmit={(event) => void adjustCredits(event)}>
                <div className="ops-user__quick" role="group" aria-label="Quick amounts">
                  {[10, 25, 50, -10].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={creditAmount === String(amount) ? 'is-on' : ''}
                      disabled={creditBusy}
                      onClick={() => setCreditAmount(String(amount))}
                    >
                      {amount > 0 ? `+£${amount}` : `−£${Math.abs(amount)}`}
                    </button>
                  ))}
                </div>
                <label className="ops-user__field">
                  <span>Amount (£)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={creditAmount}
                    onChange={(event) => setCreditAmount(event.target.value)}
                    placeholder="10.00 or -5.00"
                    required
                  />
                </label>
                <label className="ops-user__field">
                  <span>Note</span>
                  <input
                    value={creditNote}
                    onChange={(event) => setCreditNote(event.target.value)}
                    placeholder="Reason for this adjustment"
                    maxLength={500}
                  />
                </label>
                <button type="submit" className="ops-user__btn is-primary" disabled={creditBusy}>
                  <WalletCards size={14} /> {creditBusy ? 'Saving…' : 'Apply adjustment'}
                </button>
              </form>
              <div className="ops-user__ledger">
                <header>
                  <span>Ledger</span>
                  <small>Admin adjustments only</small>
                </header>
                {(user.creditLedgers?.length ?? 0) > 0 ? (
                  <ul>
                    {user.creditLedgers.map((row) => (
                      <li key={row.id}>
                        <strong className={row.amountCents >= 0 ? 'is-credit' : 'is-debit'}>
                          {row.amountCents >= 0 ? '+' : ''}
                          {money(row.amountCents, 'GBP')}
                        </strong>
                        <span>
                          <em>{row.note || 'No note'}</em>
                          <small>
                            {new Date(row.createdAt).toLocaleString(undefined, {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </span>
                        <b>Bal {money(row.balanceAfterCents, 'GBP')}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="ops-user__empty-inline">No admin credit adjustments yet.</div>
                )}
              </div>
            </section>
          ) : null}

          {fullAdmin ? (
            <section className="ops-account__danger">
              <div>
                <span>Danger</span>
                <strong>Delete this account</strong>
                <p>Removes billing data and the linked panel user. Servers they still own have to be removed first.</p>
              </div>
              <button type="button" className="ops-user__btn is-danger" disabled={deleting} onClick={() => setDeleteModalOpen(true)}>
                <Trash2 size={14} /> Delete user
              </button>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === 'services' ? (
        <section className="ops-account__sheet" aria-label="Services">
          <header>
            <span>Fleet</span>
            <h2>Services</h2>
            <em>{user.stats.activeServices} active</em>
          </header>
          <div className="ops-user__table">
          <div className="ops-user__table-head ops-user__table-head--services" aria-hidden>
            <span>Service</span>
            <span>Plan</span>
            <span>Status</span>
            <span className="is-end">Price</span>
            <span>Panel</span>
            <span className="is-end">Next due</span>
            <span />
          </div>
          {user.services.map((s) => {
            const category = s.product.category;
            return (
            <Link key={s.id} to={`/admin/services/${s.id}`} className="ops-user__table-row ops-user__table-row--services">
              <span className="ops-user__table-service">
                <CategoryMark
                  icon={category?.icon || 'server'}
                  logoUrl={category?.logoUrl}
                  color={category?.color || '#38bdf8'}
                  size={30}
                  className="ops-user__table-service-mark"
                />
                <strong>{s.name}</strong>
              </span>
              <span className="ops-user__table-plan">{s.product.name}</span>
              <span className="ops-user__table-status">
                <em className={statusBadge(s.status)}>{s.status}</em>
              </span>
              <span className="is-mono is-end">
                {money(s.priceCents ?? s.product.priceCents, s.currency ?? s.product.currency)}
                <small>/{s.cycle ?? s.product.cycle}</small>
              </span>
              <span className="is-mono ops-user__table-panel-id" title={s.panelServerId || undefined}>
                {s.panelServerId ?? '—'}
              </span>
              <span className="is-mono is-end">
                {s.nextDueAt
                  ? new Date(s.nextDueAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })
                  : '—'}
              </span>
              <ChevronRight size={15} aria-hidden />
            </Link>
            );
          })}
          {!user.services.length ? (
            <div className="ops-user__empty-inline">No services for this account.</div>
          ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'invoices' ? (
        <section className="ops-account__sheet" aria-label="Invoices">
          <header>
            <span>Ledger</span>
            <h2>Invoices</h2>
            <em>{user.stats.unpaidInvoices ? `${user.stats.unpaidInvoices} unpaid` : 'Clear'}</em>
          </header>
          <div className="ops-user__table">
          <div className="ops-user__table-head ops-user__table-head--invoices" aria-hidden>
            <span>Invoice</span>
            <span>Status</span>
            <span className="is-end">Total</span>
            <span className="is-end">Created</span>
            <span className="is-end">Paid</span>
            <span aria-hidden />
            <span />
          </div>
          {user.invoices.map((inv) => {
            const category = inv.service?.product.category;
            const overdue =
              inv.status === 'unpaid' && inv.dueAt ? new Date(inv.dueAt).getTime() < Date.now() : false;
            const statusLabel = overdue ? 'overdue' : inv.status;
            const subject = inv.service?.name || inv.description || 'Manual invoice';
            return (
              <Link
                key={inv.id}
                to={`/admin/invoices/${inv.id}`}
                className={`ops-user__table-row ops-user__table-row--invoices${overdue ? ' is-overdue' : ''}`}
              >
                <span className="ops-user__table-invoice">
                  {inv.service ? (
                    <CategoryMark
                      icon={category?.icon || 'server'}
                      logoUrl={category?.logoUrl}
                      color={category?.color || '#38bdf8'}
                      size={30}
                      className="ops-user__table-service-mark"
                    />
                  ) : (
                    <span
                      className={`ops-user__table-invoice-mark is-${overdue ? 'danger' : inv.status === 'paid' ? 'ok' : inv.status === 'unpaid' || inv.status === 'pending_payment' ? 'warn' : 'neutral'}`}
                      aria-hidden
                    >
                      <FileText size={14} />
                    </span>
                  )}
                  <span className="ops-user__table-invoice-copy">
                    <strong className="is-mono">{inv.number}</strong>
                    <em>{subject}</em>
                  </span>
                </span>
                <span className="ops-user__table-status">
                  <em className={`${statusBadge(inv.status)}${overdue ? ' is-overdue' : ''}`}>{statusLabel}</em>
                </span>
                <span className="is-mono is-end ops-user__table-amount">
                  {money(inv.totalCents, inv.currency)}
                </span>
                <span className="is-mono is-end ops-user__table-date">
                  {new Date(inv.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: '2-digit',
                  })}
                </span>
                <span className="is-mono is-end ops-user__table-date">
                  {inv.paidAt
                    ? new Date(inv.paidAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })
                    : '—'}
                </span>
                <span aria-hidden />
                <ChevronRight size={15} aria-hidden />
              </Link>
            );
          })}
          {!user.invoices.length ? (
            <div className="ops-user__empty-inline">No invoices for this account.</div>
          ) : null}
          </div>
        </section>
      ) : null}

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
