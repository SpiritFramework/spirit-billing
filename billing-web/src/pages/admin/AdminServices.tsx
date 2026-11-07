import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Clock3,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Server,
  UserRound,
} from 'lucide-react';
import { api, ApiError, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { CategoryMark } from '../../lib/icons';

type AdminService = {
  id: string;
  name: string;
  status: string;
  panelServerId: string | null;
  nextDueAt: string | null;
  createdAt: string;
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
    category: {
      id: string;
      name: string;
      color: string;
      icon: string;
      logoUrl: string | null;
    } | null;
  };
  panelEggName?: string | null;
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

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function displayName(service: AdminService) {
  const full = [service.user.firstName, service.user.lastName].filter(Boolean).join(' ');
  return full || service.user.username;
}

export function AdminServices() {
  const { user: currentUser } = useAuth();
  const fullAdmin = isFullAdmin(currentUser?.role);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedServiceId = searchParams.get('service');
  const [services, setServices] = useState<AdminService[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'pending_payment' | 'suspended' | 'cancelled'>('all');
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

    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const result = await api<SyncResult>('/admin/services/sync-from-panel', {
        method: 'POST',
        body: JSON.stringify({ createMissingUsers: true }),
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
        parts.push(`Linked ${result.usersLinkedCount} existing billing user${result.usersLinkedCount === 1 ? '' : 's'} to panel.`);
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
        parts.length
          ? parts.join(' ')
          : 'All panel servers are already linked — nothing new to import.',
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

  const visibleServices = services.filter((service) => {
    const category = service.product.category?.name ?? '';
    const haystack = `${service.name} ${service.product.name} ${category} ${service.user.username} ${service.user.email} ${service.panelServerId ?? ''}`.toLowerCase();
    return (filter === 'all' || service.status === filter) && haystack.includes(query.trim().toLowerCase());
  });
  const activeCount = services.filter((service) => service.status === 'active').length;
  const pendingCount = services.filter((service) => service.status === 'pending_payment').length;
  const suspendedCount = services.filter((service) => service.status === 'suspended').length;
  const connectedCount = services.filter((service) => Boolean(service.panelServerId)).length;

  if (requestedServiceId) {
    return <div className="ds-muted">Opening service…</div>;
  }

  return (
    <div className="admin-services-v2">
      <header className="admin-services-v2__header">
        <div>
          <span>Infrastructure operations</span>
          <h1>Services</h1>
          <p>Browse client servers and open a service for billing, panel, and access controls.</p>
        </div>
        <div className="admin-services-v2__actions">
          <div className="admin-services-v2__jobs" role="group" aria-label="Billing jobs">
            {fullAdmin && (
            <>
            <button type="button" disabled={loading || syncing || jobBusy} onClick={() => void runRenewals()}>
              <CalendarDays size={14} /> Run renewals
            </button>
            <button type="button" disabled={loading || syncing || jobBusy} onClick={() => void runOverdue()}>
              <PauseCircle size={14} /> Overdue enforcement
            </button>
            <button
              type="button"
              disabled={loading || syncing || jobBusy}
              onClick={() => void syncFromPanel()}
              title="Import panel servers and create missing billing clients"
            >
              <Server size={14} /> {syncing ? 'Syncing…' : 'Sync panel'}
            </button>
            </>
            )}
            <button type="button" disabled={loading || syncing || jobBusy} onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {fullAdmin && (
          <Link className="admin-services-v2__create" to="/admin/services/new">
            <Plus size={15} /> New custom server
          </Link>
          )}
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <section className="admin-services-metrics">
        <article><span className="is-blue"><Server size={17} /></span><div><small>Total services</small><strong>{services.length}</strong><p>Across all clients</p></div></article>
        <article><span className="is-green"><Activity size={17} /></span><div><small>Active</small><strong>{activeCount}</strong><p>Running normally</p></div></article>
        <article><span className="is-amber"><Clock3 size={17} /></span><div><small>Pending payment</small><strong>{pendingCount}</strong><p>Awaiting provisioning</p></div></article>
        <article><span className="is-red"><PauseCircle size={17} /></span><div><small>Suspended</small><strong>{suspendedCount}</strong><p>{connectedCount} linked to panel</p></div></article>
      </section>

      <section className="admin-services-toolbar">
        <div><span>Service directory</span><h2>All infrastructure</h2></div>
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service, client, plan, or panel ID…" /></label>
        <div>
          {([
            ['all', 'All'],
            ['active', 'Active'],
            ['pending_payment', 'Pending'],
            ['suspended', 'Suspended'],
            ['cancelled', 'Cancelled'],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </section>

      <div className="admin-services-layout">
        <main className="admin-services-list">
          {visibleServices.map((service) => {
            const category = service.product.category;
            return (
              <button
                type="button"
                key={service.id}
                className="admin-service-row"
                onClick={() => navigate(`/admin/services/${service.id}`)}
                style={category?.color ? { ['--service-color' as string]: category.color } : undefined}
              >
                <CategoryMark icon={category?.icon} logoUrl={category?.logoUrl} color={category?.color} size={40} />
                <span className="admin-service-row__identity">
                  <small>{category?.name || service.panelEggName || service.product.name}</small>
                  <strong>{service.name}</strong>
                  <em>
                    {service.product.name === 'Custom'
                      ? service.panelEggName
                        ? `Custom · ${service.panelEggName}`
                        : 'Custom plan'
                      : service.product.name}
                  </em>
                </span>
                <span className="admin-service-row__client">
                  <UserRound size={13} />
                  <span><small>Client</small><strong>{displayName(service)}</strong><em>{service.user.email}</em></span>
                </span>
                <span className="admin-service-row__renewal">
                  <CalendarDays size={13} />
                  <span><small>Next renewal</small><strong>{service.nextDueAt ? new Date(service.nextDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled'}</strong></span>
                </span>
                <span className={statusBadge(service.status)}>{statusLabel(service.status)}</span>
                <ChevronRight size={15} />
              </button>
            );
          })}

          {!loading && !visibleServices.length && (
            <div className="admin-services-empty">
              <Server size={28} />
              <h3>{services.length ? 'No matching services' : 'No services yet'}</h3>
              <p>
                {services.length
                  ? 'Try another search or status filter.'
                  : 'Client services will appear here after checkout, or sync existing Spirit-Panel servers.'}
              </p>
            </div>
          )}
          {loading && <div className="admin-services-empty"><RefreshCw size={28} /><h3>Loading services…</h3></div>}
        </main>
      </div>
    </div>
  );
}


