import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  HardDrive,
  Layers3,
  Link2,
  MemoryStick,
  Package,
  PauseCircle,
  PlayCircle,
  Puzzle,
  Receipt,
  Save,
  Server,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ThemedSelect } from '../../components/ThemedSelect';

type AdminServiceDetail = {
  id: string;
  name: string;
  status: string;
  panelServerId: string | null;
  memoryMb: number | null;
  diskMb: number | null;
  cpuPercent: number | null;
  backupLimit: number | null;
  databaseLimit: number | null;
  allocationLimit: number | null;
  subdomainAccess?: boolean;
  fivemMarketplaceAccess?: boolean;
  minecraftPluginsAccess?: boolean;
  priceCents: number | null;
  currency: string | null;
  cycle: string | null;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  panelWebUrl: string;
  panelEggId?: string | null;
  panelEggName?: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    creditBalanceCents: number;
  };
  product: {
    id: string;
    name: string;
    description: string;
    cycle: string;
    priceCents: number;
    currency: string;
    memoryMb: number;
    diskMb: number;
    cpuPercent: number;
    backupLimit: number;
    databaseLimit: number;
    allocationLimit: number;
    category: {
      id: string;
      name: string;
      color: string;
      icon: string;
      logoUrl: string | null;
    } | null;
  };
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
    description: string;
    dueAt: string;
    paidAt: string | null;
    createdAt: string;
    upgradeToProductId: string | null;
  }>;
};

type ServiceEditForm = {
  name: string;
  priceCents: number;
  currency: string;
  cycle: 'monthly' | 'quarterly' | 'yearly';
  nextDueAt: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupLimit: number;
  databaseLimit: number;
  allocationLimit: number;
  subdomainAccess: boolean;
  fivemMarketplaceAccess: boolean;
  minecraftPluginsAccess: boolean;
};

const currencyOptions = ['GBP', 'USD', 'EUR', 'CAD', 'AUD'].map((value) => ({ value, label: value }));
const cycleOptions = [
  { value: 'monthly', label: 'Monthly', description: 'Bills every month' },
  { value: 'quarterly', label: 'Every 3 months', description: 'Bills once per quarter' },
  { value: 'yearly', label: 'Yearly', description: 'Bills once per year' },
];

function toDateInputValue(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function displayName(user: AdminServiceDetail['user']) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
}

function formatResourceMb(value: number) {
  return value <= 0 ? 'Unlimited' : `${Math.round(value / 1024)} GB`;
}

function dueRelative(iso: string | null) {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'in 1 day';
  return `in ${days}d`;
}

function invoiceKind(inv: AdminServiceDetail['invoices'][number]) {
  if (inv.upgradeToProductId) return 'Upgrade';
  const desc = (inv.description || '').toLowerCase();
  if (desc.includes('renew')) return 'Renewal';
  if (desc.includes('upgrade')) return 'Upgrade';
  return 'Invoice';
}

function buildEditForm(service: AdminServiceDetail): ServiceEditForm {
  return {
    name: service.name,
    priceCents: service.priceCents ?? service.product.priceCents,
    currency: service.currency ?? service.product.currency,
    cycle: (service.cycle ?? service.product.cycle) as ServiceEditForm['cycle'],
    nextDueAt: toDateInputValue(service.nextDueAt),
    memoryMb: service.memoryMb ?? service.product.memoryMb,
    diskMb: service.diskMb ?? service.product.diskMb,
    cpuPercent: service.cpuPercent ?? service.product.cpuPercent,
    backupLimit: service.backupLimit ?? service.product.backupLimit,
    databaseLimit: service.databaseLimit ?? service.product.databaseLimit,
    allocationLimit: service.allocationLimit ?? service.product.allocationLimit,
    subdomainAccess: Boolean(service.subdomainAccess),
    fivemMarketplaceAccess: Boolean(service.fivemMarketplaceAccess),
    minecraftPluginsAccess: Boolean(service.minecraftPluginsAccess),
  };
}

export function AdminServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const fullAdmin = isFullAdmin(currentUser?.role);
  const [service, setService] = useState<AdminServiceDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'invoices' | 'settings'>('overview');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'unpaid' | 'paid' | 'cancelled'>('all');
  const [editForm, setEditForm] = useState<ServiceEditForm | null>(null);
  const [copied, setCopied] = useState<'service' | 'panel' | null>(null);

  async function copyText(value: string, key: 'service' | 'panel') {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
  }

  async function load() {
    if (!id) return;
    setError('');
    try {
      const data = await api<AdminServiceDetail>(`/admin/services/${id}`);
      setService(data);
      setEditForm(buildEditForm(data));
    } catch (err) {
      setService(null);
      setEditForm(null);
      setError(err instanceof ApiError ? err.message : 'Service not found');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function saveService(event?: FormEvent) {
    event?.preventDefault();
    if (!service || !editForm) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { nextDueAt, ...rest } = editForm;
      await api(`/admin/services/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...rest,
          ...(nextDueAt.trim()
            ? { nextDueAt: nextDueAt.trim() }
            : rest.priceCents > 0
              ? {}
              : { nextDueAt: null }),
        }),
      });
      setMessage(
        service.panelServerId
          ? `${editForm.name} was updated in billing and Spirit-Panel.`
          : `${editForm.name} was updated and will use these limits when provisioned.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update server');
    } finally {
      setBusy(false);
    }
  }

  async function createRenewal(dueImmediately = false) {
    if (!service) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ invoice: { id: string; number: string } }>(
        `/admin/services/${service.id}/create-renewal`,
        {
          method: 'POST',
          body: JSON.stringify({ dueImmediately }),
        },
      );
      setMessage(
        dueImmediately
          ? `Created ${result.invoice.number} due yesterday — use Run overdue enforcement to test suspend/terminate.`
          : `Created renewal invoice ${result.invoice.number}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create renewal');
    } finally {
      setBusy(false);
    }
  }

  async function setSuspended(suspend: boolean) {
    if (!service) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/services/${service.id}/${suspend ? 'suspend' : 'unsuspend'}`, {
        method: 'POST',
        body: '{}',
      });
      setMessage(suspend ? 'Service suspended.' : 'Service unsuspended.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update service status');
    } finally {
      setBusy(false);
    }
  }

  async function deleteService() {
    if (!service) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/services/${service.id}`, { method: 'DELETE' });
      navigate('/admin/services', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete service');
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  if (error && !service) {
    return (
      <div className="ops-user ops-svc">
        <Link to="/admin/services" className="ops-user__back">
          <ArrowLeft size={14} /> Fleet
        </Link>
        <div className="ops-user__alert is-error">{error}</div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="ops-user ops-svc">
        <div className="ops-user__loading">
          <Activity size={18} aria-hidden />
          Loading service…
        </div>
      </div>
    );
  }

  const category = service.product.category;
  const memory = service.memoryMb ?? service.product.memoryMb;
  const disk = service.diskMb ?? service.product.diskMb;
  const cpu = service.cpuPercent ?? service.product.cpuPercent;
  const backups = service.backupLimit ?? service.product.backupLimit;
  const databases = service.databaseLimit ?? service.product.databaseLimit;
  const allocations = service.allocationLimit ?? service.product.allocationLimit;
  const price = service.priceCents ?? service.product.priceCents;
  const currency = service.currency ?? service.product.currency;
  const cycle = service.cycle ?? service.product.cycle;
  const panelHref = service.panelServerId ? safeExternalHref(service.panelWebUrl) : null;
  const canSuspend = service.status === 'active' && Boolean(service.panelServerId);
  const canUnsuspend = service.status === 'suspended' && Boolean(service.panelServerId);
  const planName =
    service.product.name === 'Custom' && service.panelEggName
      ? `Custom · ${service.panelEggName}`
      : service.product.name;
  const unpaidInvoices = service.invoices.filter((inv) => inv.status === 'unpaid');
  const unpaidCount = unpaidInvoices.length;
  const unpaidCents = unpaidInvoices.reduce((sum, inv) => sum + inv.totalCents, 0);
  const nextDueLabel = dueRelative(service.nextDueAt);
  const recentInvoices = service.invoices.slice(0, 4);
  const baselineForm = buildEditForm(service);
  const isDirty = Boolean(editForm && JSON.stringify(editForm) !== JSON.stringify(baselineForm));

  return (
    <div className="ops-user ops-svc ops-server">
      <Link to="/admin/services" className="ops-user__back">
        <ArrowLeft size={14} /> Fleet
      </Link>

      {error ? <div className="ops-user__alert is-error">{error}</div> : null}
      {message ? <div className="ops-user__alert is-info">{message}</div> : null}

      <section className="ops-server__stage">
      <header className="ops-user__mast">
        <div className="ops-user__identity">
          <span
            className={`ops-svc__mark-wrap ${
              service.status === 'active'
                ? 'is-ok'
                : service.status === 'suspended' || service.status === 'cancelled'
                  ? 'is-bad'
                  : 'is-warn'
            }`}
          >
            <CategoryMark
              icon={category?.icon || 'server'}
              logoUrl={category?.logoUrl}
              color={category?.color || '#38bdf8'}
              size={52}
              className="ops-svc__mark"
            />
          </span>
          <div className="ops-user__identity-copy">
            <span>{category?.name || 'Service'}</span>
            <h1>{service.name}</h1>
            <p>
              {planName}
              <span aria-hidden="true"> · </span>
              Created{' '}
              {new Date(service.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
            <div className="ops-user__badges">
              <span className={`ops-svc__status-badge ${statusBadge(service.status)}`}>
                {statusLabel(service.status)}
              </span>
              <span className={`ops-users__panel ${service.panelServerId ? 'is-yes' : 'is-no'}`}>
                {service.panelServerId ? <Check size={12} aria-hidden /> : <Link2 size={12} aria-hidden />}
                {service.panelServerId ? 'Panel linked' : 'Not provisioned'}
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
          {fullAdmin && service.status !== 'cancelled' && price > 0 ? (
            <button type="button" className="ops-user__btn" disabled={busy} onClick={() => void createRenewal(false)}>
              <Receipt size={14} /> Renewal
            </button>
          ) : null}
          {canSuspend ? (
            <button type="button" className="ops-user__btn is-danger" disabled={busy} onClick={() => void setSuspended(true)}>
              <PauseCircle size={14} /> Suspend
            </button>
          ) : null}
          {canUnsuspend ? (
            <button type="button" className="ops-user__btn is-ok" disabled={busy} onClick={() => void setSuspended(false)}>
              <PlayCircle size={14} /> Unsuspend
            </button>
          ) : null}
          {fullAdmin && service.status !== 'cancelled' ? (
            <button type="button" className="ops-user__btn is-ghost" disabled={busy} onClick={() => setTab('settings')}>
              <SlidersHorizontal size={14} /> Configure
            </button>
          ) : null}
        </div>
      </header>

      <div className="ops-server__rail" aria-label="Service metrics">
        <button type="button" className={tab === 'settings' ? 'is-on' : ''} disabled={!fullAdmin || service.status === 'cancelled'} onClick={() => setTab('settings')}>
          <CircleDollarSign size={15} aria-hidden />
          <small>Price</small>
          <strong>{money(price, currency)}</strong>
          <em>/{cycle}</em>
        </button>
        <button type="button" className={nextDueLabel?.includes('overdue') ? 'is-warn' : ''} disabled={!fullAdmin || service.status === 'cancelled'} onClick={() => setTab('settings')}>
          <CalendarDays size={15} aria-hidden />
          <small>Next due</small>
          <strong>
            {service.nextDueAt
              ? new Date(service.nextDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })
              : '—'}
          </strong>
          <em>{nextDueLabel || 'not scheduled'}</em>
        </button>
        <div className={service.panelServerId ? 'is-ok' : 'is-warn'}>
          <Link2 size={15} aria-hidden />
          <small>Panel</small>
          <strong>{service.panelServerId ? 'Linked' : 'Missing'}</strong>
          <em>{service.panelServerId ? 'Spirit-Panel' : 'not provisioned'}</em>
        </div>
        <button type="button" className={`${tab === 'invoices' ? 'is-on' : ''} ${unpaidCount ? 'is-warn' : ''}`.trim()} onClick={() => setTab('invoices')}>
          <FileText size={15} aria-hidden />
          <small>Unpaid</small>
          <strong>{unpaidCount}</strong>
          <em>{unpaidCount ? money(unpaidCents, currency) : 'clear'}</em>
        </button>
      </div>

      <div className="ops-user__tabs" role="tablist" aria-label="Service sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={tab === 'overview' ? 'is-on' : ''}
          onClick={() => setTab('overview')}
        >
          <Server size={14} /> Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'invoices'}
          className={tab === 'invoices' ? 'is-on' : ''}
          onClick={() => setTab('invoices')}
        >
          <FileText size={14} /> Invoices <em>{service.invoices.length}</em>
        </button>
        {fullAdmin && service.status !== 'cancelled' ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'settings'}
            className={tab === 'settings' ? 'is-on' : ''}
            onClick={() => setTab('settings')}
          >
            <SlidersHorizontal size={14} /> Settings
          </button>
        ) : null}
      </div>
      </section>

      {tab === 'overview' ? (
        <div className="ops-server__desk">
          <section className="ops-server__card">
            <header>
              <span>Owner</span>
              <h2>Client</h2>
            </header>
            <div className="ops-server__rows">
              <div>
                <span>Name</span>
                <strong>{displayName(service.user)}</strong>
              </div>
              <div>
                <span>Username</span>
                <strong>@{service.user.username}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{service.user.email}</strong>
              </div>
              <div>
                <span>Credits</span>
                <strong>{money(service.user.creditBalanceCents, 'GBP')}</strong>
              </div>
            </div>
            <div className="ops-server__card-actions">
              <Link to={`/admin/users/${service.user.id}`} className="ops-user__btn">
                <UserRound size={14} /> Open account
              </Link>
            </div>
          </section>

          <section className="ops-server__card">
            <header>
              <span>Spirit-Panel</span>
              <h2>{service.panelServerId ? 'Linked server' : 'Not provisioned'}</h2>
            </header>
            {service.panelServerId ? (
              <>
                <div className="ops-server__rows">
                  <div>
                    <span>Server ID</span>
                    <strong className="ops-server__copy">
                      {service.panelServerId}
                      <button type="button" aria-label="Copy panel server ID" onClick={() => void copyText(service.panelServerId!, 'panel')}>
                        {copied === 'panel' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </strong>
                  </div>
                  <div>
                    <span>Access</span>
                    <strong>Ready</strong>
                  </div>
                </div>
                {panelHref ? (
                  <div className="ops-server__card-actions">
                    <a href={panelHref} target="_blank" rel="noopener noreferrer" className="ops-user__btn">
                      <ExternalLink size={14} /> Open Spirit-Panel
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="ops-server__state is-warn">
                <strong>Waiting on provision</strong>
                Panel access appears after the first successful provisioning for this service.
              </p>
            )}
          </section>

          <section className="ops-server__card is-wide">
            <header>
              <span>Plan</span>
              <h2>Billing</h2>
            </header>
            <div className="ops-server__rows is-grid">
              <div>
                <span>Plan</span>
                <strong>{planName}</strong>
              </div>
              <div>
                <span>Recurring</span>
                <strong>
                  {money(price, currency)} / {cycle}
                </strong>
              </div>
              <div>
                <span>Next renewal</span>
                <strong>
                  {service.nextDueAt
                    ? new Date(service.nextDueAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Not scheduled'}
                </strong>
              </div>
              {service.panelEggName ? (
                <div>
                  <span>Panel egg</span>
                  <strong>{service.panelEggName}</strong>
                </div>
              ) : null}
              <div>
                <span>Service ID</span>
                <strong className="ops-server__copy">
                  {service.id}
                  <button type="button" aria-label="Copy service ID" onClick={() => void copyText(service.id, 'service')}>
                    {copied === 'service' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </strong>
              </div>
            </div>
          </section>

          <section className="ops-server__card is-wide">
            <header>
              <span>Capacity</span>
              <h2>Resources</h2>
            </header>
            <div className="ops-server__specs" aria-label="Server resources">
              <div>
                <MemoryStick size={14} aria-hidden />
                <span>Memory</span>
                <strong>{formatResourceMb(memory)}</strong>
              </div>
              <div>
                <Cpu size={14} aria-hidden />
                <span>CPU</span>
                <strong>{cpu <= 0 ? 'Unlimited' : `${cpu}%`}</strong>
              </div>
              <div>
                <HardDrive size={14} aria-hidden />
                <span>Disk</span>
                <strong>{formatResourceMb(disk)}</strong>
              </div>
              <div>
                <Archive size={14} aria-hidden />
                <span>Backups</span>
                <strong>{backups <= 0 ? 'Off' : backups}</strong>
              </div>
              <div>
                <Database size={14} aria-hidden />
                <span>Databases</span>
                <strong>{databases <= 0 ? 'Off' : databases}</strong>
              </div>
              <div>
                <Layers3 size={14} aria-hidden />
                <span>Ports</span>
                <strong>{allocations <= 0 ? 'Off' : allocations}</strong>
              </div>
            </div>
            <div className="ops-svc__features">
              <span className={service.subdomainAccess ? 'is-on' : 'is-off'}>
                <Globe2 size={13} /> Subdomain
              </span>
              <span className={service.fivemMarketplaceAccess ? 'is-on' : 'is-off'}>
                <Package size={13} /> FiveM market
              </span>
              <span className={service.minecraftPluginsAccess ? 'is-on' : 'is-off'}>
                <Puzzle size={13} /> MC plugins
              </span>
            </div>
          </section>

          <section className="ops-server__card is-wide">
            <header>
              <span>Billing</span>
              <h2>Recent invoices</h2>
              <button type="button" className="ops-user__btn is-ghost" onClick={() => setTab('invoices')}>
                View all <em>{service.invoices.length}</em>
              </button>
            </header>
            {recentInvoices.length ? (
              <div className="ops-svc__recent">
                {recentInvoices.map((inv) => {
                  const overdue =
                    inv.status === 'unpaid' && inv.dueAt ? new Date(inv.dueAt).getTime() < Date.now() : false;
                  const kind = invoiceKind(inv);
                  return (
                    <Link
                      key={inv.id}
                      to={`/admin/invoices/${inv.id}`}
                      className={`ops-svc__recent-row${overdue ? ' is-overdue' : ''}`}
                    >
                      <CategoryMark
                        icon={category?.icon || 'server'}
                        logoUrl={category?.logoUrl}
                        color={category?.color || '#38bdf8'}
                        size={28}
                        className="ops-user__table-service-mark"
                      />
                      <span className="ops-svc__recent-copy">
                        <strong className="is-mono">{inv.number}</strong>
                        <em>
                          {kind}
                          <span aria-hidden> · </span>
                          {inv.description?.trim() || service.name}
                        </em>
                      </span>
                      <span className="ops-user__table-status">
                        <em className={`${statusBadge(inv.status)}${overdue ? ' is-overdue' : ''}`}>
                          {overdue ? 'overdue' : inv.status}
                        </em>
                      </span>
                      <strong className="ops-svc__recent-amount">{money(inv.totalCents, inv.currency)}</strong>
                      <ChevronRight size={14} aria-hidden />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="ops-svc__empty">
                <FileText size={18} aria-hidden />
                <strong>No invoices yet</strong>
                <span>Renewals and upgrades for this service will show up here.</span>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'invoices' ? (
        <div className="ops-server__sheet">
          <header className="ops-server__sheet-head">
            <span>Ledger</span>
            <h2>Invoices</h2>
            <em>{unpaidCount ? `${unpaidCount} unpaid` : 'Clear'}</em>
          </header>
        <div className="ops-svc__invoices">
          <div className="ops-svc__invoice-bar">
            <div className="ops-svc__invoice-filters" role="group" aria-label="Invoice status">
              {(
                [
                  ['all', 'All', service.invoices.length],
                  ['unpaid', 'Unpaid', service.invoices.filter((inv) => inv.status === 'unpaid').length],
                  ['paid', 'Paid', service.invoices.filter((inv) => inv.status === 'paid').length],
                  ['cancelled', 'Cancelled', service.invoices.filter((inv) => inv.status === 'cancelled').length],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={invoiceFilter === value ? 'is-on' : ''}
                  onClick={() => setInvoiceFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
            <div className="ops-svc__invoice-summary">
              <span>
                Unpaid{' '}
                <strong>
                  {money(
                    service.invoices
                      .filter((inv) => inv.status === 'unpaid')
                      .reduce((sum, inv) => sum + inv.totalCents, 0),
                    currency,
                  )}
                </strong>
              </span>
            </div>
          </div>

          <section className="ops-user__table" aria-label="Service invoices">
            <div className="ops-user__table-head ops-svc__invoice-head" aria-hidden>
              <span>Invoice</span>
              <span>Kind</span>
              <span>Status</span>
              <span className="is-end">Total</span>
              <span className="is-end">Due</span>
              <span className="is-end">Paid</span>
              <span aria-hidden />
              <span />
            </div>
            {service.invoices
              .filter((inv) => invoiceFilter === 'all' || inv.status === invoiceFilter)
              .map((inv) => {
                const overdue =
                  inv.status === 'unpaid' && inv.dueAt ? new Date(inv.dueAt).getTime() < Date.now() : false;
                const statusText = overdue ? 'overdue' : inv.status;
                const kind = invoiceKind(inv);
                const subject = inv.upgradeToProductId
                  ? 'Plan upgrade'
                  : inv.description?.trim() || service.name;
                return (
                  <Link
                    key={inv.id}
                    to={`/admin/invoices/${inv.id}`}
                    className={`ops-user__table-row ops-svc__invoice-row${overdue ? ' is-overdue' : ''}`}
                  >
                    <span className="ops-user__table-invoice">
                      <CategoryMark
                        icon={category?.icon || 'server'}
                        logoUrl={category?.logoUrl}
                        color={category?.color || '#38bdf8'}
                        size={30}
                        className="ops-user__table-service-mark"
                      />
                      <span className="ops-user__table-invoice-copy">
                        <strong className="is-mono">{inv.number}</strong>
                        <em>{subject}</em>
                      </span>
                    </span>
                    <span className={`ops-svc__invoice-kind is-${kind.toLowerCase()}`}>{kind}</span>
                    <span className="ops-user__table-status">
                      <em className={`${statusBadge(inv.status)}${overdue ? ' is-overdue' : ''}`}>{statusText}</em>
                    </span>
                    <span className="is-mono is-end ops-user__table-amount">
                      {money(inv.totalCents, inv.currency)}
                    </span>
                    <span className={`is-mono is-end ops-user__table-date${overdue ? ' is-warn' : ''}`}>
                      {inv.dueAt
                        ? new Date(inv.dueAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit',
                          })
                        : '—'}
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
            {!service.invoices.length ? (
              <div className="ops-user__empty-inline">No invoices linked to this service.</div>
            ) : null}
            {service.invoices.length > 0 &&
            !service.invoices.some((inv) => invoiceFilter === 'all' || inv.status === invoiceFilter) ? (
              <div className="ops-user__empty-inline">No {invoiceFilter} invoices.</div>
            ) : null}
          </section>
        </div>
        </div>
      ) : null}

      {tab === 'settings' && fullAdmin && editForm && service.status !== 'cancelled' ? (
        <div className="ops-server__settings">
          {isDirty ? (
            <div className="ops-svc__dirty-bar" role="status">
              <div>
                <strong>Unsaved changes</strong>
                <span>Save to apply billing{service.panelServerId ? ' and panel' : ''} updates.</span>
              </div>
              <div className="ops-svc__action-row">
                <button
                  type="button"
                  className="ops-user__btn is-ghost"
                  disabled={busy}
                  onClick={() => setEditForm(buildEditForm(service))}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="ops-user__btn is-primary"
                  disabled={busy || !editForm.name.trim()}
                  onClick={() => void saveService()}
                >
                  <Save size={14} /> {busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : null}

          <form className="ops-server__settings-form" onSubmit={(event) => void saveService(event)}>
            <div className="ops-server__desk">
            <section className="ops-server__card">
              <header>
                <span>Identity</span>
                <h2>Server name</h2>
              </header>
              <label className="ops-user__field">
                <span>Display name</span>
                <input
                  value={editForm.name}
                  maxLength={64}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </label>
              <p className="ops-user__hint">Shown to the client and in Spirit-Panel. Max 64 characters.</p>
            </section>

            <section className="ops-server__card">
              <header>
                <span>Billing</span>
                <h2>Price</h2>
              </header>
              <div className="ops-svc__edit-grid ops-svc__edit-grid--2">
                <label className="ops-user__field">
                  <span>Recurring price</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.priceCents / 100}
                    onChange={(event) =>
                      setEditForm({ ...editForm, priceCents: Math.round(Number(event.target.value) * 100) })
                    }
                  />
                </label>
                <label className="ops-user__field">
                  <span>Currency</span>
                  <ThemedSelect
                    value={editForm.currency}
                    options={currencyOptions}
                    ariaLabel="Service currency"
                    onChange={(value) => setEditForm({ ...editForm, currency: value })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Billing interval</span>
                  <ThemedSelect
                    value={editForm.cycle}
                    options={cycleOptions}
                    ariaLabel="Service billing interval"
                    onChange={(value) => setEditForm({ ...editForm, cycle: value as ServiceEditForm['cycle'] })}
                  />
                </label>
                <label className="ops-user__field">
                  <span>Next renewal</span>
                  <input
                    type="date"
                    value={editForm.nextDueAt}
                    onChange={(event) => setEditForm({ ...editForm, nextDueAt: event.target.value })}
                  />
                </label>
              </div>
              <p className="ops-user__hint">
                Product baseline {money(service.product.priceCents, service.product.currency)} / {service.product.cycle}.
                Clear date + £0 unschedules renewals.
              </p>
            </section>
            </div>

            <section className="ops-server__card is-wide">
              <header>
                <span>Capacity</span>
                <h2>Limits</h2>
              </header>
              <p className="ops-server__note">
                {service.panelServerId
                  ? 'Spirit-Panel and Wings must accept new limits before billing saves them.'
                  : 'These limits are used when this service is provisioned.'}
              </p>
              <div className="ops-svc__resource-edit">
                <label className="ops-svc__resource-field">
                  <span>
                    <MemoryStick size={14} /> Memory
                    <em>{formatResourceMb(editForm.memoryMb)}</em>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.memoryMb}
                    onChange={(event) => setEditForm({ ...editForm, memoryMb: Number(event.target.value) })}
                  />
                  <div className="ops-svc__presets">
                    {[1024, 2048, 4096, 8192].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={editForm.memoryMb === value ? 'is-on' : ''}
                        onClick={() => setEditForm({ ...editForm, memoryMb: value })}
                      >
                        {value / 1024} GB
                      </button>
                    ))}
                    <button type="button" onClick={() => setEditForm({ ...editForm, memoryMb: 0 })}>
                      Unlimited
                    </button>
                  </div>
                </label>

                <label className="ops-svc__resource-field">
                  <span>
                    <Cpu size={14} /> CPU
                    <em>{editForm.cpuPercent <= 0 ? 'Unlimited' : `${editForm.cpuPercent}%`}</em>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.cpuPercent}
                    onChange={(event) => setEditForm({ ...editForm, cpuPercent: Number(event.target.value) })}
                  />
                  <div className="ops-svc__presets">
                    {[100, 200, 400].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={editForm.cpuPercent === value ? 'is-on' : ''}
                        onClick={() => setEditForm({ ...editForm, cpuPercent: value })}
                      >
                        {value}%
                      </button>
                    ))}
                    <button type="button" onClick={() => setEditForm({ ...editForm, cpuPercent: 0 })}>
                      Unlimited
                    </button>
                  </div>
                </label>

                <label className="ops-svc__resource-field">
                  <span>
                    <HardDrive size={14} /> Disk
                    <em>{formatResourceMb(editForm.diskMb)}</em>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.diskMb}
                    onChange={(event) => setEditForm({ ...editForm, diskMb: Number(event.target.value) })}
                  />
                  <div className="ops-svc__presets">
                    {[10240, 20480, 51200, 102400].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={editForm.diskMb === value ? 'is-on' : ''}
                        onClick={() => setEditForm({ ...editForm, diskMb: value })}
                      >
                        {Math.round(value / 1024)} GB
                      </button>
                    ))}
                  </div>
                </label>

                <label className="ops-svc__resource-field">
                  <span>
                    <Archive size={14} /> Backups
                    <em>{editForm.backupLimit <= 0 ? 'Off' : `${editForm.backupLimit} slots`}</em>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.backupLimit}
                    onChange={(event) => setEditForm({ ...editForm, backupLimit: Number(event.target.value) })}
                  />
                </label>

                <label className="ops-svc__resource-field">
                  <span>
                    <Database size={14} /> Databases
                    <em>{editForm.databaseLimit <= 0 ? 'Off' : `${editForm.databaseLimit} slots`}</em>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.databaseLimit}
                    onChange={(event) => setEditForm({ ...editForm, databaseLimit: Number(event.target.value) })}
                  />
                </label>

                <label className="ops-svc__resource-field">
                  <span>
                    <Layers3 size={14} /> Allocations
                    <em>{editForm.allocationLimit <= 0 ? 'Off' : `${editForm.allocationLimit} ports`}</em>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.allocationLimit}
                    onChange={(event) => setEditForm({ ...editForm, allocationLimit: Number(event.target.value) })}
                  />
                </label>
              </div>
              <p className="ops-user__hint">
                Product defaults {formatResourceMb(service.product.memoryMb)} / {service.product.cpuPercent}% /{' '}
                {formatResourceMb(service.product.diskMb)}. 0 = unlimited or disabled.
              </p>
            </section>

            <section className="ops-server__card is-wide">
              <header>
                <span>Access</span>
                <h2>Client features</h2>
              </header>
              <div className="ops-svc__checks ops-svc__checks--grid">
                <label className={`ops-svc__check${editForm.subdomainAccess ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={editForm.subdomainAccess}
                    onChange={(event) => setEditForm({ ...editForm, subdomainAccess: event.target.checked })}
                  />
                  <span>
                    <strong>
                      <Globe2 size={14} /> Subdomain manager
                    </strong>
                    <small>Let the client create a hostname for this server.</small>
                  </span>
                </label>
                <label className={`ops-svc__check${editForm.fivemMarketplaceAccess ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={editForm.fivemMarketplaceAccess}
                    onChange={(event) =>
                      setEditForm({ ...editForm, fivemMarketplaceAccess: event.target.checked })
                    }
                  />
                  <span>
                    <strong>
                      <Package size={14} /> FiveM marketplace
                    </strong>
                    <small>One-click marketplace resource installs.</small>
                  </span>
                </label>
                <label className={`ops-svc__check${editForm.minecraftPluginsAccess ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={editForm.minecraftPluginsAccess}
                    onChange={(event) =>
                      setEditForm({ ...editForm, minecraftPluginsAccess: event.target.checked })
                    }
                  />
                  <span>
                    <strong>
                      <Puzzle size={14} /> Minecraft plugins
                    </strong>
                    <small>One-click Minecraft plugin installs.</small>
                  </span>
                </label>
              </div>
            </section>

          </form>

          <div className="ops-server__desk">
            <section className="ops-server__card">
              <header>
                <span>Lifecycle</span>
                <h2>Billing jobs</h2>
              </header>
              <p className="ops-server__note">Create renewals or overdue invoices for enforcement tests.</p>
              <div className="ops-server__card-actions">
                <button
                  type="button"
                  className="ops-user__btn"
                  disabled={busy || price <= 0}
                  onClick={() => void createRenewal(false)}
                >
                  <Receipt size={14} /> Create renewal
                </button>
                <button
                  type="button"
                  className="ops-user__btn is-ghost"
                  disabled={busy || price <= 0}
                  onClick={() => void createRenewal(true)}
                >
                  <CalendarDays size={14} /> Test overdue
                </button>
              </div>
            </section>
            <section className="ops-server__card">
              <header>
                <span>Lifecycle</span>
                <h2>Server power</h2>
              </header>
              <p className="ops-server__note">
                {service.panelServerId
                  ? 'Suspend or resume the linked Spirit-Panel server.'
                  : 'Available after this service is provisioned on Spirit-Panel.'}
              </p>
              <div className="ops-server__card-actions">
                {canSuspend ? (
                  <button
                    type="button"
                    className="ops-user__btn is-danger"
                    disabled={busy}
                    onClick={() => void setSuspended(true)}
                  >
                    <PauseCircle size={14} /> Suspend
                  </button>
                ) : null}
                {canUnsuspend ? (
                  <button
                    type="button"
                    className="ops-user__btn is-ok"
                    disabled={busy}
                    onClick={() => void setSuspended(false)}
                  >
                    <PlayCircle size={14} /> Unsuspend
                  </button>
                ) : null}
                {!canSuspend && !canUnsuspend && service.panelServerId ? (
                  <span className="ops-server__note">No power actions in the current state.</span>
                ) : null}
              </div>
            </section>
          </div>

          <section className="ops-server__danger">
            <div>
              <strong>Delete this service</strong>
              <span>Removes it from billing and deletes the linked Spirit-Panel server.</span>
            </div>
            <button type="button" className="ops-user__btn is-danger" disabled={busy} onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} /> Delete service
            </button>
          </section>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteOpen}
        title={`Delete ${service.name}?`}
        description="This permanently removes the service from billing and deletes its linked server from Spirit-Panel."
        confirmLabel="Delete service"
        busyLabel="Deleting…"
        tone="danger"
        actionIcon="delete"
        requireText={service.name}
        busy={busy}
        consequences={[
          'The panel server and files will be permanently deleted.',
          'The service will be removed from the client account.',
          'Unpaid invoices for this service will be cancelled with credit refunds.',
        ]}
        onCancel={() => !busy && setDeleteOpen(false)}
        onConfirm={() => void deleteService()}
      />
    </div>
  );
}
