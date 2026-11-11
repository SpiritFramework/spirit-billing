import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Link2,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { CategoryMark } from '../../lib/icons';

type AdminService = {
  id: string;
  name: string;
  status: string;
  panelServerId: string | null;
  priceCents: number | null;
  currency: string | null;
  cycle: string | null;
  nextDueAt: string | null;
  createdAt: string;
  panelEggName?: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
  product: {
    id: string;
    name: string;
    cycle: string;
    priceCents: number;
    currency: string;
    category: {
      id: string;
      name: string;
      color: string;
      icon: string;
      logoUrl: string | null;
    } | null;
  };
};

type ServicesPayload = {
  services: AdminService[];
  panelWebUrl: string;
};

type SyncResult = {
  importedCount: number;
  skippedCount: number;
  backfilledCount: number;
  updatedCount: number;
  usersCreatedCount?: number;
  usersLinkedCount?: number;
  usersCreated?: Array<{
    email: string;
    username: string;
    temporaryPassword: string;
  }>;
  skipped: Array<{
    panelServerId: string;
    name: string;
    reason: string;
    email?: string | null;
  }>;
};

type StatusFilter = 'all' | 'active' | 'pending_payment' | 'suspended' | 'cancelled';
type PanelFilter = 'all' | 'linked' | 'unlinked';

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function displayName(service: AdminService) {
  const full = [service.user.firstName, service.user.lastName].filter(Boolean).join(' ').trim();
  return full || service.user.username;
}

function planLabel(service: AdminService) {
  if (service.product.name === 'Custom') {
    return service.panelEggName ? `Custom · ${service.panelEggName}` : 'Custom plan';
  }
  return service.product.name;
}

export function AdminServices() {
  const { user: currentUser } = useAuth();
  const fullAdmin = isFullAdmin(currentUser?.role);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedServiceId = searchParams.get('service');
  const [services, setServices] = useState<AdminService[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [panelFilter, setPanelFilter] = useState<PanelFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (requestedServiceId) {
      navigate(`/admin/services/${requestedServiceId}`, { replace: true });
    }
  }, [requestedServiceId, navigate]);

  async function load() {
    setError('');
    try {
      const data = await api<ServicesPayload>('/admin/services');
      setServices(data.services);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load services');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (requestedServiceId) return;
    void load();
  }, [requestedServiceId]);

  async function syncFromPanel() {
    const createMissingUsers = window.confirm(
      'Sync servers from Spirit-Panel?\n\nOK = also create Billing accounts for panel owners that are missing (recommended if Panel was live before Billing).\nCancel = abort.',
    );
    if (!createMissingUsers) return;
    const currentPassword = window.prompt('Enter your admin password to sync from Spirit-Panel:');
    if (!currentPassword) return;

    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const result = await api<SyncResult>('/admin/services/sync-from-panel', {
        method: 'POST',
        body: JSON.stringify({ createMissingUsers: true, currentPassword }),
      });
      const parts: string[] = [];
      if ((result.usersCreatedCount ?? 0) > 0) {
        const creds = (result.usersCreated ?? [])
          .filter((u) => u.temporaryPassword)
          .map((u) => `${u.email} / ${u.username} → ${u.temporaryPassword}`)
          .join('\n');
        parts.push(
          `Created ${result.usersCreatedCount} billing client account${result.usersCreatedCount === 1 ? '' : 's'} with temporary passwords (panel passwords unchanged). Copy them now:\n${creds}`,
        );
      }
      if ((result.usersLinkedCount ?? 0) > 0) {
        parts.push(
          `Linked ${result.usersLinkedCount} existing billing user${result.usersLinkedCount === 1 ? '' : 's'} to panel.`,
        );
      }
      if (result.importedCount > 0) {
        parts.push(
          `Imported ${result.importedCount} Custom service${result.importedCount === 1 ? '' : 's'} at £0/month (renewals not scheduled until you set a price).`,
        );
      }
      if (result.updatedCount > 0) {
        parts.push(
          `Updated egg/category on ${result.updatedCount} existing Custom service${result.updatedCount === 1 ? '' : 's'}.`,
        );
      }
      if (result.backfilledCount > 0) {
        parts.push(
          `Linked ${result.backfilledCount} existing service${result.backfilledCount === 1 ? '' : 's'} to panel.`,
        );
      }
      const noUser = result.skipped.filter((s) => s.reason === 'no_billing_user').length;
      if (noUser > 0) {
        parts.push(`Skipped ${noUser} with no matching billing user.`);
      }
      const failed = result.skipped.filter((s) => s.reason === 'import_failed').length;
      if (failed > 0) {
        parts.push(`${failed} failed to import.`);
      }
      setMessage(
        parts.length ? parts.join(' ') : 'All panel servers are already linked — nothing new to import.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sync from Spirit-Panel');
    } finally {
      setSyncing(false);
    }
  }

  async function runRenewals() {
    setJobBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        created: Array<{ number: string }>;
        skipped: Array<{ name: string; reason: string }>;
        scanned: number;
      }>('/admin/services/run-renewals', { method: 'POST', body: '{}' });
      setMessage(
        `Renewals: scanned ${result.scanned}, created ${result.created.length} invoice${result.created.length === 1 ? '' : 's'}${
          result.skipped.length ? `, skipped ${result.skipped.length}` : ''
        }.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run renewals');
    } finally {
      setJobBusy(false);
    }
  }

  async function runOverdue() {
    setJobBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        suspended: Array<{ number: string }>;
        terminated: Array<{ number: string }>;
        failed: Array<{ reason: string }>;
        scanned: number;
        suspendDays: number;
        terminateDays: number;
      }>('/admin/services/run-overdue-suspensions', { method: 'POST', body: '{}' });
      setMessage(
        `Overdue enforcement (suspend ${result.suspendDays}d / terminate ${result.terminateDays}d): scanned ${result.scanned}, suspended ${result.suspended.length}, terminated ${result.terminated.length}${
          result.failed.length ? `, failed ${result.failed.length}` : ''
        }.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run overdue enforcement');
    } finally {
      setJobBusy(false);
    }
  }

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const service of services) {
      const category = service.product.category;
      if (!category) continue;
      const existing = map.get(category.id);
      if (existing) existing.count += 1;
      else map.set(category.id, { id: category.id, name: category.name, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [services]);

  const stats = useMemo(
    () => ({
      total: services.length,
      active: services.filter((s) => s.status === 'active').length,
      pending: services.filter((s) => s.status === 'pending_payment').length,
      suspended: services.filter((s) => s.status === 'suspended').length,
      cancelled: services.filter((s) => s.status === 'cancelled').length,
      linked: services.filter((s) => Boolean(s.panelServerId)).length,
      unlinked: services.filter((s) => !s.panelServerId).length,
    }),
    [services],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((service) => {
      if (statusFilter !== 'all' && service.status !== statusFilter) return false;
      if (panelFilter === 'linked' && !service.panelServerId) return false;
      if (panelFilter === 'unlinked' && service.panelServerId) return false;
      if (categoryFilter !== 'all' && service.product.category?.id !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        service.name,
        service.product.name,
        service.panelEggName,
        service.product.category?.name,
        service.user.username,
        service.user.email,
        service.user.firstName,
        service.user.lastName,
        service.panelServerId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [services, query, statusFilter, panelFilter, categoryFilter]);

  const coverage = stats.total ? Math.round((stats.linked / stats.total) * 100) : 0;
  const jobsBusy = loading || syncing || jobBusy;
  const filtersActive =
    statusFilter !== 'all' ||
    panelFilter !== 'all' ||
    categoryFilter !== 'all' ||
    Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter !== 'all') parts.push(statusLabel(statusFilter));
    if (panelFilter === 'linked') parts.push('Linked');
    if (panelFilter === 'unlinked') parts.push('Not linked');
    if (categoryFilter !== 'all') {
      parts.push(categories.find((c) => c.id === categoryFilter)?.name || 'Category');
    }
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [statusFilter, panelFilter, categoryFilter, query, categories]);

  function clearFilters() {
    setStatusFilter('all');
    setPanelFilter('all');
    setCategoryFilter('all');
    setQuery('');
  }

  if (requestedServiceId) {
    return <div className="ds-muted">Opening service…</div>;
  }

  return (
    <div className="ops-users ops-services">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Fleet</span>
          <h1>Services</h1>
          <p>Servers, renewals, panel linkage, and billing state across every account.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive ? ' is-active' : ''}`}
            onClick={clearFilters}
            title="Show all services"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Server size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Fleet</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              statusFilter === 'active' && panelFilter === 'all' && categoryFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => {
              setStatusFilter('active');
              setPanelFilter('all');
              setCategoryFilter('all');
              setQuery('');
            }}
            title="Show active services"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CheckCircle2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Active</small>
              <strong>{stats.active}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.suspended ? ' is-warn' : ''}${
              statusFilter === 'suspended' && panelFilter === 'all' && categoryFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => {
              setStatusFilter('suspended');
              setPanelFilter('all');
              setCategoryFilter('all');
              setQuery('');
            }}
            title="Show suspended services"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <PauseCircle size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Suspended</small>
              <strong>{stats.suspended}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${
              panelFilter === (coverage < 100 ? 'unlinked' : 'linked') &&
              statusFilter === 'all' &&
              categoryFilter === 'all' &&
              !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => {
              setStatusFilter('all');
              setCategoryFilter('all');
              setQuery('');
              setPanelFilter(coverage < 100 ? 'unlinked' : 'linked');
            }}
            title={coverage < 100 ? 'Show services missing panel link' : 'Show panel-linked services'}
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <Link2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Panel</small>
              <strong>{coverage}%</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}
      {message ? <div className="ds-alert ds-alert--success" style={{ whiteSpace: 'pre-wrap' }}>{message}</div> : null}

      <div className="ops-users__shell">
        <aside className="ops-users__rail" aria-label="Service filters">
          <div className="ops-users__rail-block">
            <span>Status</span>
            <div>
              {(
                [
                  ['all', 'Any status', stats.total],
                  ['active', 'Active', stats.active],
                  ['pending_payment', 'Pending', stats.pending],
                  ['suspended', 'Suspended', stats.suspended],
                  ['cancelled', 'Cancelled', stats.cancelled],
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

          {categories.length ? (
            <div className="ops-users__rail-block">
              <span>Game</span>
              <div>
                <button
                  type="button"
                  className={categoryFilter === 'all' ? 'is-on' : ''}
                  onClick={() => setCategoryFilter('all')}
                >
                  All games
                  <em>{stats.total}</em>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={categoryFilter === category.id ? 'is-on' : ''}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    {category.name}
                    <em>{category.count}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command ops-services__command">
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
                placeholder="Filter by service, client, plan, game, or panel ID"
                aria-label="Search services"
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

            <div className="ops-services__jobs" role="group" aria-label="Fleet jobs">
              {fullAdmin ? (
                <>
                  <button type="button" disabled={jobsBusy} onClick={() => void runRenewals()}>
                    <CalendarDays size={14} /> Renewals
                  </button>
                  <button type="button" disabled={jobsBusy} onClick={() => void runOverdue()}>
                    <PauseCircle size={14} /> Overdue
                  </button>
                  <button
                    type="button"
                    disabled={jobsBusy}
                    onClick={() => void syncFromPanel()}
                    title="Import panel servers and create missing billing clients"
                  >
                    <Link2 size={14} /> {syncing ? 'Syncing…' : 'Sync panel'}
                  </button>
                  <Link className="ops-services__create" to="/admin/services/new">
                    <Plus size={14} /> New
                  </Link>
                </>
              ) : null}
              <button type="button" disabled={jobsBusy} onClick={() => void load()}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

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

          <section className="ops-users__table" aria-label="Services">
            <div className="ops-users__head ops-services__head" aria-hidden>
              <span>Service</span>
              <span>Client</span>
              <span>Plan</span>
              <span>Status</span>
              <span className="is-end">Price</span>
              <span>Panel</span>
              <span className="is-end">Next due</span>
              <span />
            </div>

            {filtered.map((service) => {
              const category = service.product.category;
              const priceCents = service.priceCents ?? service.product.priceCents;
              const currency = service.currency ?? service.product.currency;
              const cycle = service.cycle ?? service.product.cycle;
              return (
                <button
                  type="button"
                  key={service.id}
                  className="ops-users__row ops-services__row"
                  onClick={() => navigate(`/admin/services/${service.id}`)}
                >
                  <span className="ops-services__who">
                    <CategoryMark
                      icon={category?.icon || 'server'}
                      logoUrl={category?.logoUrl}
                      color={category?.color || '#38bdf8'}
                      size={30}
                      className="ops-services__mark"
                    />
                    <span>
                      <strong>{service.name}</strong>
                      <small>{category?.name || service.panelEggName || 'Uncategorized'}</small>
                    </span>
                  </span>

                  <span className="ops-services__client">
                    <strong>{displayName(service)}</strong>
                    <small>@{service.user.username}</small>
                  </span>

                  <span className="ops-services__plan" title={planLabel(service)}>
                    {planLabel(service)}
                  </span>

                  <span className="ops-services__status">
                    <em className={statusBadge(service.status)}>{statusLabel(service.status)}</em>
                  </span>

                  <span className="ops-services__price is-end">
                    {money(priceCents, currency)}
                    <small>/{cycle}</small>
                  </span>

                  <span className={`ops-users__panel ${service.panelServerId ? 'is-yes' : 'is-no'}`}>
                    {service.panelServerId ? <Check size={12} aria-hidden /> : <Server size={12} aria-hidden />}
                    {service.panelServerId ? 'Linked' : 'Missing'}
                  </span>

                  <span className="ops-services__due is-end">
                    {service.nextDueAt
                      ? new Date(service.nextDueAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })
                      : '—'}
                  </span>

                  <ChevronRight size={15} aria-hidden />
                </button>
              );
            })}

            {!loading && !filtered.length ? (
              <div className="ops-users__empty">
                <Server size={20} aria-hidden />
                <strong>{services.length ? 'No matching services' : 'No services yet'}</strong>
                <span>
                  {services.length
                    ? 'Try another search or filter.'
                    : 'Services appear after checkout, or sync existing Spirit-Panel servers.'}
                </span>
                {filtersActive ? (
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <div className="ops-users__empty">
                <RefreshCw size={20} aria-hidden />
                <strong>Loading fleet…</strong>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
