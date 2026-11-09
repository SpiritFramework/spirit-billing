import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Gamepad2,
  HardDrive,
  Layers3,
  MemoryStick,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { formatCpuPercent, formatDiskMb, formatMemoryMb } from '../../lib/resources';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';

type ServiceCategory = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  logoUrl?: string | null;
};

type Service = {
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
  priceCents: number | null;
  currency: string | null;
  cycle: string | null;
  nextDueAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    description?: string;
    cycle: string;
    priceCents: number;
    currency: string;
    memoryMb?: number;
    diskMb?: number;
    cpuPercent?: number;
    backupLimit?: number;
    databaseLimit?: number;
    allocationLimit?: number;
    category?: ServiceCategory | null;
  };
};

type ServiceInvoice = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  currency: string;
  dueAt: string;
  paidAt?: string | null;
  createdAt: string;
};

type DeletionPreview = {
  deletable: boolean;
  withinRefundWindow?: boolean;
  ownedLongEnough?: boolean;
  refundEligible: boolean;
  refundCents: number;
  minAgeDays: number;
  ageDays: number;
};

type UpgradeOption = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  cycle: string;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  fullDeltaCents: number;
  chargeCents: number;
  prorated: boolean;
};

function serviceStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function cycleLabel(cycle: string) {
  return cycle === 'yearly' ? 'Yearly' : cycle === 'quarterly' ? 'Every 3 months' : 'Monthly';
}

function serviceLimits(service: Service) {
  return {
    memoryMb: service.memoryMb ?? service.product.memoryMb,
    diskMb: service.diskMb ?? service.product.diskMb,
    cpuPercent: service.cpuPercent ?? service.product.cpuPercent,
    backupLimit: service.backupLimit ?? service.product.backupLimit ?? 0,
    databaseLimit: service.databaseLimit ?? service.product.databaseLimit ?? 0,
    allocationLimit: service.allocationLimit ?? service.product.allocationLimit ?? 0,
  };
}

function formatSlotLimit(value: number | null | undefined) {
  if (value == null || value <= 0) return 'Off';
  return String(value);
}

function panelServerHref(panelWebUrl: string | null | undefined, panelServerId: string | null | undefined) {
  const base = safeExternalHref(panelWebUrl);
  if (!base) return undefined;
  const id = panelServerId?.trim();
  if (!id || /[^a-zA-Z0-9_-]/.test(id)) return base;
  const url = new URL(base);
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}/servers/${id}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function serviceBilling(service: Service) {
  return {
    priceCents: service.priceCents ?? service.product.priceCents,
    currency: service.currency ?? service.product.currency,
    cycle: service.cycle ?? service.product.cycle,
  };
}

type ServiceFilter = 'all' | 'active' | 'pending_payment' | 'suspended' | 'cancelled';

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ServiceFilter>('all');

  useEffect(() => {
    void api<Service[]>('/client/services')
      .then(setServices)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your services'))
      .finally(() => setLoading(false));
  }, []);

  const visibleServices = services.filter((service) => {
    const matchesFilter = filter === 'all' || service.status === filter;
    const matchesQuery = `${service.name} ${service.product.name} ${service.product.category?.name ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesFilter && matchesQuery;
  });
  const activeCount = services.filter((service) => service.status === 'active').length;
  const pendingCount = services.filter((service) => service.status === 'pending_payment').length;
  const attentionCount = services.filter((service) => service.status === 'suspended').length;
  const cancelledCount = services.filter((service) => service.status === 'cancelled').length;
  const filterCounts: Record<ServiceFilter, number> = {
    all: services.length,
    active: activeCount,
    pending_payment: pendingCount,
    suspended: attentionCount,
    cancelled: cancelledCount,
  };

  return (
    <div className="client-services">
      <header className="client-services__intro">
        <div className="client-services__intro-copy">
          <p>Hosting</p>
          <h1>Your services</h1>
          <span>Manage servers, renewals, and plan resources on your account.</span>
        </div>
        <div className="client-services__intro-actions">
          <Link className="client-home__btn client-home__btn--primary client-home__btn--cta" to="/game-hosting">
            <span className="client-home__btn-icon" aria-hidden>
              <Gamepad2 size={15} />
            </span>
            <span>Browse hosting</span>
            <ArrowRight size={14} className="client-home__btn-arrow" />
          </Link>
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <div className="client-services__pulse" aria-label="Service snapshot">
        <button
          type="button"
          className={`client-services__pulse-item${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="client-services__pulse-copy">
            <small>Total</small>
            <strong>{loading ? '—' : services.length}</strong>
            <span>On your account</span>
          </span>
          <span className="client-services__pulse-icon is-total" aria-hidden>
            <Server size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-services__pulse-item${filter === 'active' ? ' is-active' : ''}`}
          onClick={() => setFilter('active')}
        >
          <span className="client-services__pulse-copy">
            <small>Active</small>
            <strong className="is-ok">{loading ? '—' : activeCount}</strong>
            <span>Ready to manage</span>
          </span>
          <span className="client-services__pulse-icon is-active" aria-hidden>
            <Activity size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-services__pulse-item${filter === 'pending_payment' ? ' is-active' : ''}`}
          onClick={() => setFilter('pending_payment')}
        >
          <span className="client-services__pulse-copy">
            <small>Pending</small>
            <strong className={pendingCount > 0 ? 'is-warn' : undefined}>{loading ? '—' : pendingCount}</strong>
            <span>Awaiting payment</span>
          </span>
          <span className="client-services__pulse-icon is-pending" aria-hidden>
            <Clock3 size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-services__pulse-item${filter === 'suspended' ? ' is-active' : ''}`}
          onClick={() => setFilter('suspended')}
        >
          <span className="client-services__pulse-copy">
            <small>Attention</small>
            <strong className={attentionCount > 0 ? 'is-danger' : undefined}>{loading ? '—' : attentionCount}</strong>
            <span>Suspended</span>
          </span>
          <span className="client-services__pulse-icon is-attention" aria-hidden>
            <AlertCircle size={17} />
          </span>
        </button>
      </div>

      <section className="client-services__block">
        <div className="client-services__panel">
          <div className="client-services__panel-head">
            <div className="client-services__panel-copy">
              <h2>Servers</h2>
              <p>
                {loading
                  ? 'Loading your servers…'
                  : query.trim() || filter !== 'all'
                    ? `${visibleServices.length} match${visibleServices.length === 1 ? '' : 'es'}`
                    : `${services.length} service${services.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <label className="client-services__search">
              <Search size={15} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, game, or plan…"
                aria-label="Search services"
              />
            </label>
          </div>

          <div className="client-services__filters" role="group" aria-label="Filter by status">
            {([
              ['all', 'All'],
              ['active', 'Active'],
              ['pending_payment', 'Pending'],
              ['suspended', 'Suspended'],
              ['cancelled', 'Cancelled'],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? 'is-active' : undefined}
                onClick={() => setFilter(value)}
              >
                {label}
                <em>{loading ? '—' : filterCounts[value]}</em>
              </button>
            ))}
          </div>

          <div className="client-services__list">
            {visibleServices.map((service) => {
              const category = service.product.category;
              const limits = serviceLimits(service);
              const billing = serviceBilling(service);
              const memory = limits.memoryMb ?? 0;
              const disk = limits.diskMb ?? 0;
              const cpu = limits.cpuPercent ?? 0;
              return (
                <Link
                  key={service.id}
                  to={`/services/${service.id}`}
                  className={`client-home__service is-${service.status}`}
                  style={{ ['--service-color' as string]: category?.color || 'var(--accent)' }}
                >
                  <CategoryMark
                    icon={category?.icon}
                    logoUrl={category?.logoUrl}
                    color={category?.color}
                    size={42}
                    className="client-home__service-mark"
                  />
                  <span className="client-home__service-body">
                    <span className="client-home__service-main">
                      <span className="client-home__service-title">
                        <strong>{service.name}</strong>
                      </span>
                      <span className="client-home__service-meta">
                        <span className={`client-home__service-meta-item is-status ${statusBadge(service.status)}`}>
                          <span className="client-home__service-status-dot" aria-hidden />
                          {serviceStatus(service.status)}
                        </span>
                        <span className="client-home__service-meta-item">
                          {category?.name || 'Hosting'}
                        </span>
                        <span className="client-home__service-meta-item">
                          {service.product.name}
                        </span>
                        {service.nextDueAt ? (
                          <span className="client-home__service-meta-item is-renew">
                            Renews{' '}
                            {new Date(service.nextDueAt).toLocaleDateString(undefined, {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span className="client-home__service-rail">
                      <span className="client-home__service-specs" aria-label="Resources">
                        <span>
                          <MemoryStick size={13} strokeWidth={1.75} aria-hidden />
                          <span>
                            <em>{formatMemoryMb(memory)}</em>
                            <small>RAM</small>
                          </span>
                        </span>
                        <span>
                          <Cpu size={13} strokeWidth={1.75} aria-hidden />
                          <span>
                            <em>{formatCpuPercent(cpu)}</em>
                            <small>CPU</small>
                          </span>
                        </span>
                        <span>
                          <HardDrive size={13} strokeWidth={1.75} aria-hidden />
                          <span>
                            <em>{formatDiskMb(disk)}</em>
                            <small>Disk</small>
                          </span>
                        </span>
                      </span>
                      <span className="client-home__service-aside">
                        <strong>
                          {billing.priceCents > 0 ? money(billing.priceCents, billing.currency) : 'Included'}
                        </strong>
                        <small>{billing.cycle}</small>
                      </span>
                      <span className="client-home__service-go" aria-hidden>
                        <ArrowRight size={14} strokeWidth={2} />
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}

            {!loading && !visibleServices.length && (
              <div className="client-services__empty">
                <span aria-hidden>
                  <Server size={20} />
                </span>
                <strong>{services.length ? 'No matching services' : 'No services yet'}</strong>
                <p>
                  {services.length
                    ? 'Try another search or status filter.'
                    : 'Pick a game and launch your first managed server.'}
                </p>
                {services.length ? (
                  <button
                    type="button"
                    className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link className="client-home__btn client-home__btn--primary client-home__btn--cta client-home__btn--sm" to="/game-hosting">
                    <span className="client-home__btn-icon" aria-hidden>
                      <Gamepad2 size={14} />
                    </span>
                    <span>Browse plans</span>
                    <ArrowRight size={13} className="client-home__btn-arrow" />
                  </Link>
                )}
              </div>
            )}

            {loading && (
              <div className="client-services__empty">
                <span aria-hidden>
                  <Server size={20} />
                </span>
                <strong>Loading services…</strong>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ServiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [service, setService] = useState<(Service & {
    panelWebUrl: string;
    invoices: ServiceInvoice[];
    deletion?: DeletionPreview;
  }) | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadService() {
    if (!id) return;
    const data = await api<NonNullable<typeof service>>(`/client/services/${id}`);
    setService(data);
    return data;
  }

  useEffect(() => {
    if (!id) return;
    setError('');
    void loadService()
      .catch((err) => {
        setService(null);
        setError(err instanceof ApiError ? err.message : 'Service not found');
      });
  }, [id]);

  useEffect(() => {
    if (!service || (service.status !== 'active' && service.status !== 'suspended')) {
      setUpgradeOptions([]);
      return;
    }
    setUpgradeLoading(true);
    void api<{ options: UpgradeOption[] }>(`/client/services/${service.id}/upgrade-options`)
      .then((data) => setUpgradeOptions(data.options))
      .catch(() => setUpgradeOptions([]))
      .finally(() => setUpgradeLoading(false));
  }, [service?.id, service?.status, service?.product.id]);

  async function requestUpgrade(option: UpgradeOption) {
    if (!service) return;
    setUpgradeBusy(option.id);
    setError('');
    setMessage('');
    try {
      const result = await api<{ invoice: { id: string; number: string; totalCents: number } }>(
        `/client/services/${service.id}/upgrade`,
        { method: 'POST', body: JSON.stringify({ productId: option.id }) },
      );
      setMessage(`Upgrade invoice ${result.invoice.number} created for ${money(result.invoice.totalCents, option.currency)}.`);
      navigate(`/invoices/${result.invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create upgrade invoice');
    } finally {
      setUpgradeBusy('');
    }
  }

  async function confirmDelete() {
    if (!service) return;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await api<{ refundCents: number }>(`/client/services/${service.id}`, {
        method: 'DELETE',
      });
      await refresh();
      setDeleteOpen(false);
      navigate('/services', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this server');
      setDeleting(false);
    }
  }

  if (error && !service) {
    return (
      <div className="client-service-detail">
        <Link to="/services" className="client-service-detail__back">
          <ArrowLeft size={14} /> All services
        </Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="client-service-detail">
        <div className="client-service-detail__loading">Loading service…</div>
      </div>
    );
  }

  const panelHref = safeExternalHref(service.panelWebUrl);
  const manageHref = panelServerHref(service.panelWebUrl, service.panelServerId);
  const limits = serviceLimits(service);
  const billing = serviceBilling(service);
  const paidInvoices = service.invoices.filter((invoice) => invoice.status === 'paid');
  const unpaidInvoices = [...service.invoices]
    .filter((invoice) => invoice.status === 'unpaid')
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const outstandingCents = unpaidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const nextUnpaid = unpaidInvoices[0];
  const latestInvoice = service.invoices[0];
  const totalPaid = paidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const isActive = service.status === 'active';
  const category = service.product.category;
  const deletion = service.deletion;
  const canDelete = deletion?.deletable !== false && service.status !== 'cancelled';
  const canUpgrade = isActive || service.status === 'suspended';
  const hasUpgradeOptions = upgradeOptions.length > 0;
  const statusKey = service.status;
  const panelReady = Boolean(isActive && panelHref);
  const panelConnected = Boolean(panelReady && service.panelServerId);
  const createdLabel = new Date(service.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const renewalLabel = service.nextDueAt
    ? new Date(service.nextDueAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not scheduled';
  const sortedInvoices = [...service.invoices].sort((a, b) => {
    const rank = (invoice: ServiceInvoice) => {
      if (invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now()) return 0;
      if (invoice.status === 'unpaid') return 1;
      if (invoice.status === 'paid') return 2;
      return 3;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const aTime = new Date(a.paidAt || a.dueAt || a.createdAt).getTime();
    const bTime = new Date(b.paidAt || b.dueAt || b.createdAt).getTime();
    return a.status === 'unpaid' ? aTime - bTime : bTime - aTime;
  });
  const visibleInvoices = sortedInvoices.slice(0, 6);
  const hiddenInvoiceCount = Math.max(0, sortedInvoices.length - visibleInvoices.length);

  return (
    <div
      className={`client-service-detail is-${statusKey}`}
      style={{ ['--service-color' as string]: category?.color || 'var(--accent)' }}
    >
      <Link to="/services" className="client-service-detail__back">
        <ArrowLeft size={14} /> All services
      </Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <header className="client-service-detail__intro">
        <div className="client-service-detail__intro-main">
          <CategoryMark
            icon={category?.icon}
            logoUrl={category?.logoUrl}
            color={category?.color}
            size={52}
            className="client-service-detail__mark"
          />
          <div className="client-service-detail__intro-copy">
            <p>{category?.name || 'Hosting'}</p>
            <h1>{service.name}</h1>
            <span className="client-service-detail__intro-meta">
              <span className={`client-service-detail__status is-${statusKey}`}>
                {serviceStatus(service.status)}
              </span>
              <span className="client-service-detail__chip">{service.product.name}</span>
              <span className="client-service-detail__meta-text">Created {createdLabel}</span>
            </span>
          </div>
        </div>
        <div className="client-service-detail__intro-actions">
          {panelReady ? (
            <a
              className="client-home__btn client-home__btn--primary client-home__btn--cta"
              href={panelHref!}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="client-home__btn-icon" aria-hidden>
                <ExternalLink size={15} />
              </span>
              <span>Open game panel</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </a>
          ) : (
            <span className="client-home__btn client-home__btn--ghost client-home__btn--cta is-disabled">
              <span className="client-home__btn-icon" aria-hidden>
                <Clock3 size={15} />
              </span>
              <span>
                {service.status === 'pending_payment' ? 'Waiting for payment' : 'Panel unavailable'}
              </span>
            </span>
          )}
          {nextUnpaid && (
            <Link
              className="client-home__btn client-home__btn--ghost client-home__btn--cta"
              to={`/invoices/${nextUnpaid.id}`}
            >
              <span className="client-home__btn-icon" aria-hidden>
                <FileText size={15} />
              </span>
              <span>Pay {money(nextUnpaid.totalCents, nextUnpaid.currency)}</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </Link>
          )}
        </div>
      </header>

      <div className="client-service-detail__pulse" aria-label="Service snapshot">
        <div className="client-service-detail__pulse-item">
          <span className="client-service-detail__pulse-copy">
            <small>Status</small>
            <strong className={isActive ? 'is-ok' : statusKey === 'suspended' ? 'is-danger' : undefined}>
              {isActive ? 'Active' : serviceStatus(service.status)}
            </strong>
            <span>{isActive ? 'Online & managed' : 'Account state'}</span>
          </span>
          <span className={`client-service-detail__pulse-icon is-status is-${statusKey}`} aria-hidden>
            {isActive ? <CheckCircle2 size={17} /> : statusKey === 'suspended' ? <AlertCircle size={17} /> : <Activity size={17} />}
          </span>
        </div>
        <div className="client-service-detail__pulse-item">
          <span className="client-service-detail__pulse-copy">
            <small>Next renewal</small>
            <strong>{renewalLabel}</strong>
            <span>{cycleLabel(billing.cycle)} billing</span>
          </span>
          <span className="client-service-detail__pulse-icon is-renewal" aria-hidden>
            <CalendarDays size={17} />
          </span>
        </div>
        <div className="client-service-detail__pulse-item">
          <span className="client-service-detail__pulse-copy">
            <small>Plan price</small>
            <strong>{money(billing.priceCents, billing.currency)}</strong>
            <span>{service.product.name}</span>
          </span>
          <span className="client-service-detail__pulse-icon is-plan" aria-hidden>
            <CircleDollarSign size={17} />
          </span>
        </div>
        <div className="client-service-detail__pulse-item">
          <span className="client-service-detail__pulse-copy">
            <small>Invoices</small>
            <strong className={unpaidInvoices.length ? 'is-warn' : undefined}>
              {service.invoices.length}
            </strong>
            <span>
              {unpaidInvoices.length
                ? `${unpaidInvoices.length} unpaid · ${money(outstandingCents, billing.currency)}`
                : `${money(totalPaid, billing.currency)} paid`}
            </span>
          </span>
          <span className="client-service-detail__pulse-icon is-billing" aria-hidden>
            <FileText size={17} />
          </span>
        </div>
      </div>

      {nextUnpaid && (
        <div className="client-service-detail__attention">
          <span className="client-service-detail__attention-copy">
            <Clock3 size={15} aria-hidden />
            <span>
              <strong>{money(outstandingCents, billing.currency)} outstanding</strong>
              <small>
                {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length === 1 ? '' : 's'}
                {' · '}
                next due{' '}
                {new Date(nextUnpaid.dueAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </small>
            </span>
          </span>
          <Link className="client-home__btn client-home__btn--primary client-home__btn--sm" to={`/invoices/${nextUnpaid.id}`}>
            Pay now
            <ArrowRight size={13} />
          </Link>
        </div>
      )}

      <div className="client-service-detail__layout">
        <div className="client-service-detail__primary">
          <section className="client-service-detail__panel">
            <div className="client-service-detail__panel-head">
              <div>
                <h2>Resources</h2>
                <p>Included with {service.product.name}.</p>
              </div>
            </div>
            <div className="client-service-detail__resource-rail" aria-label="Server resources">
              <span>
                <MemoryStick size={14} strokeWidth={1.75} aria-hidden />
                <span>
                  <em>{formatMemoryMb(limits.memoryMb)}</em>
                  <small>RAM</small>
                </span>
              </span>
              <span>
                <Cpu size={14} strokeWidth={1.75} aria-hidden />
                <span>
                  <em>{formatCpuPercent(limits.cpuPercent)}</em>
                  <small>CPU</small>
                </span>
              </span>
              <span>
                <HardDrive size={14} strokeWidth={1.75} aria-hidden />
                <span>
                  <em>{formatDiskMb(limits.diskMb)}</em>
                  <small>Disk</small>
                </span>
              </span>
              <span>
                <Archive size={14} strokeWidth={1.75} aria-hidden />
                <span>
                  <em>{formatSlotLimit(limits.backupLimit)}</em>
                  <small>Backups</small>
                </span>
              </span>
              <span>
                <Database size={14} strokeWidth={1.75} aria-hidden />
                <span>
                  <em>{formatSlotLimit(limits.databaseLimit)}</em>
                  <small>Databases</small>
                </span>
              </span>
              <span>
                <Layers3 size={14} strokeWidth={1.75} aria-hidden />
                <span>
                  <em>{formatSlotLimit(limits.allocationLimit)}</em>
                  <small>Ports</small>
                </span>
              </span>
            </div>
            {canUpgrade && !upgradeLoading && !hasUpgradeOptions && (
              <p className="client-service-detail__upgrade-note">
                <TrendingUp size={14} aria-hidden />
                No larger plans available for this egg right now.
              </p>
            )}
          </section>

          {canUpgrade && (upgradeLoading || hasUpgradeOptions) && (
            <section className="client-service-detail__panel">
              <div className="client-service-detail__panel-head">
                <div>
                  <h2>Upgrades</h2>
                  <p>Same game egg, more resources. Charged as a prorated difference.</p>
                </div>
              </div>
              {upgradeLoading && (
                <div className="client-service-detail__empty is-compact">
                  <strong>Loading upgrade options…</strong>
                </div>
              )}
              {!upgradeLoading && hasUpgradeOptions && (
                <div className="client-service-detail__upgrade-list">
                  {upgradeOptions.map((option) => (
                    <div key={option.id} className="client-service-detail__upgrade">
                      <div className="client-service-detail__upgrade-copy">
                        <strong>{option.name}</strong>
                        <span>
                          {option.memoryMb <= 0 ? 'Unlimited RAM' : formatMemoryMb(option.memoryMb)}
                          {' · '}
                          {option.cpuPercent <= 0 ? 'Unlimited CPU' : formatCpuPercent(option.cpuPercent)}
                          {' · '}
                          {option.diskMb <= 0 ? 'Unlimited disk' : formatDiskMb(option.diskMb)}
                        </span>
                        <small>
                          {option.prorated
                            ? `Prorated ${money(option.chargeCents, option.currency)} · full delta ${money(option.fullDeltaCents, option.currency)} / ${option.cycle}`
                            : `Upgrade charge ${money(option.chargeCents, option.currency)}`}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="client-home__btn client-home__btn--primary client-home__btn--sm"
                        disabled={Boolean(upgradeBusy)}
                        onClick={() => void requestUpgrade(option)}
                      >
                        {upgradeBusy === option.id ? 'Creating…' : 'Upgrade'}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="client-service-detail__panel">
            <div className="client-service-detail__panel-head">
              <div>
                <h2>Billing history</h2>
                <p>
                  {service.invoices.length
                    ? `${service.invoices.length} invoice${service.invoices.length === 1 ? '' : 's'} for this service`
                    : 'No invoices yet'}
                </p>
              </div>
              <Link className="client-home__btn client-home__btn--text" to="/invoices">
                All invoices <ArrowRight size={14} />
              </Link>
            </div>
            <div className="client-service-detail__invoice-list">
              {visibleInvoices.map((invoice) => {
                const overdue =
                  invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
                const invoiceStatus = overdue ? 'overdue' : invoice.status;
                const statusLabel =
                  invoiceStatus === 'overdue'
                    ? 'Overdue'
                    : invoiceStatus === 'unpaid'
                      ? 'Unpaid'
                      : invoiceStatus === 'paid'
                        ? 'Paid'
                        : invoiceStatus === 'cancelled'
                          ? 'Cancelled'
                          : invoiceStatus;
                const dateLabel =
                  invoice.status === 'paid'
                    ? 'Paid on'
                    : invoice.status === 'cancelled'
                      ? 'Closed on'
                      : overdue
                        ? 'Was due'
                        : 'Due on';
                const dateValue = new Date(
                  invoice.status === 'paid' ? invoice.paidAt || invoice.dueAt : invoice.dueAt,
                ).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className={`client-service-detail__invoice is-${invoiceStatus}`}
                  >
                    <span className="client-service-detail__invoice-mark" aria-hidden>
                      <FileText size={15} />
                    </span>
                    <span className="client-service-detail__invoice-main">
                      <strong>{invoice.number}</strong>
                      <span>
                        <em className={`client-service-detail__status is-${invoiceStatus}`}>
                          {statusLabel}
                        </em>
                        <span>
                          {dateLabel} {dateValue}
                        </span>
                      </span>
                    </span>
                    <strong className="client-service-detail__invoice-amount">
                      {money(invoice.totalCents, invoice.currency)}
                    </strong>
                    <span className="client-service-detail__invoice-go" aria-hidden>
                      <ArrowRight size={14} />
                    </span>
                  </Link>
                );
              })}
              {!service.invoices.length && (
                <div className="client-service-detail__empty">
                  <span aria-hidden><FileText size={18} /></span>
                  <strong>No invoices yet</strong>
                  <p>Billing records for this service will show up here.</p>
                </div>
              )}
            </div>
            {hiddenInvoiceCount > 0 && (
              <Link className="client-service-detail__more" to="/invoices">
                View {hiddenInvoiceCount} more invoice{hiddenInvoiceCount === 1 ? '' : 's'}
                <ArrowRight size={13} />
              </Link>
            )}
          </section>
        </div>

        <aside className="client-service-detail__aside">
          <section className="client-service-detail__side">
            <div className="client-service-detail__side-head">
              <span className={`client-service-detail__panel-dot${panelReady ? ' is-online' : ''}`} aria-hidden />
              <div>
                <small>Game panel</small>
                <strong>
                  {panelConnected ? 'Connected' : panelReady ? 'Ready to open' : 'Awaiting connection'}
                </strong>
              </div>
            </div>
            <div className="client-service-detail__side-row">
              <span>Server ID</span>
              <strong>{service.panelServerId || 'Pending assignment'}</strong>
            </div>
            {panelReady && manageHref ? (
              <a
                className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                href={manageHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Manage server <ExternalLink size={13} />
              </a>
            ) : (
              <p className="client-service-detail__side-note">
                Panel access becomes available when this service is active.
              </p>
            )}
          </section>

          <section className="client-service-detail__side">
            <div className="client-service-detail__side-head">
              <CategoryMark
                icon={category?.icon}
                logoUrl={category?.logoUrl}
                color={category?.color}
                size={32}
              />
              <div>
                <small>{category?.name || 'Current plan'}</small>
                <strong>{service.product.name}</strong>
              </div>
            </div>
            {service.product.description ? (
              <p className="client-service-detail__side-note">{service.product.description}</p>
            ) : null}
            <div className="client-service-detail__side-row">
              <span>Billing cycle</span>
              <strong>{cycleLabel(billing.cycle)}</strong>
            </div>
            <div className="client-service-detail__side-row">
              <span>Recurring price</span>
              <strong>{money(billing.priceCents, billing.currency)}</strong>
            </div>
            <div className="client-service-detail__side-row">
              <span>Total paid</span>
              <strong>{money(totalPaid, billing.currency)}</strong>
            </div>
            {latestInvoice && (
              <Link className="client-home__btn client-home__btn--text" to={`/invoices/${latestInvoice.id}`}>
                Latest invoice <ArrowRight size={13} />
              </Link>
            )}
          </section>

          <section className="client-service-detail__side is-help">
            <div className="client-service-detail__side-head">
              <ShieldCheck size={16} />
              <div>
                <small>Support</small>
                <strong>Need help?</strong>
              </div>
            </div>
            <p className="client-service-detail__side-note">
              Quote <em>{service.name}</em> when contacting support.
            </p>
            <Link className="client-home__btn client-home__btn--ghost client-home__btn--sm" to="/support">
              Open support <ArrowRight size={13} />
            </Link>
          </section>

          {canDelete && (
            <section className="client-service-detail__side is-danger">
              <div className="client-service-detail__side-head">
                <Trash2 size={16} />
                <div>
                  <small>Danger zone</small>
                  <strong>Delete this server</strong>
                </div>
              </div>
              <p className="client-service-detail__side-note">
                {deletion?.refundEligible && deletion.refundCents > 0
                  ? `Within the ${deletion.minAgeDays}-day refund window (owned ${deletion.ageDays} day${deletion.ageDays === 1 ? '' : 's'}). Estimated credit refund: ${money(deletion.refundCents, billing.currency)}.`
                  : (deletion?.withinRefundWindow ?? deletion?.ownedLongEnough)
                    ? `Within the ${deletion?.minAgeDays ?? 3}-day refund window, but no unused billing period remains to credit.`
                    : `You can still delete this server. Refunds are only available within the first ${deletion?.minAgeDays ?? 3} day${(deletion?.minAgeDays ?? 3) === 1 ? '' : 's'} after purchase.`}
              </p>
              <button
                type="button"
                className="client-service-detail__danger-btn"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} /> Delete server
              </button>
            </section>
          )}
        </aside>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title={`Delete ${service.name}?`}
        description="This permanently deletes your server from Spirit-Panel and removes it from billing."
        confirmLabel="Delete server"
        busyLabel="Deleting…"
        eyebrow="Permanent deletion"
        tone="danger"
        actionIcon="delete"
        requireText={service.name}
        busy={deleting}
        consequences={[
          'The panel server and its files will be permanently deleted.',
          'Unpaid invoices for this service are cancelled (applied credits refunded).',
          deletion?.refundEligible && deletion.refundCents > 0
            ? `About ${money(deletion.refundCents, billing.currency)} will be credited for the unused billing period.`
            : (deletion?.withinRefundWindow ?? deletion?.ownedLongEnough)
              ? 'No credit refund — there is no remaining unused period.'
              : `No credit refund — this service is past the ${deletion?.minAgeDays ?? 3}-day refund window.`,
        ].filter(Boolean) as string[]}
        onCancel={() => !deleting && setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
