import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Cpu,
  ExternalLink,
  FileText,
  Gamepad2,
  HardDrive,
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
  ownedLongEnough: boolean;
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
  };
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
      <div className="ds-stack client-service-detail">
        <Link to="/services" className="service-detail-v2__back"><ArrowLeft size={14} /> Back to services</Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }
  if (!service) return <div className="ds-muted">Loading…</div>;

  const panelHref = safeExternalHref(service.panelWebUrl);
  const limits = serviceLimits(service);
  const billing = serviceBilling(service);
  const paidInvoices = service.invoices.filter((invoice) => invoice.status === 'paid');
  const latestInvoice = service.invoices[0];
  const totalPaid = paidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const isActive = service.status === 'active';
  const category = service.product.category;
  const deletion = service.deletion;
  const canDelete = deletion?.deletable !== false && service.status !== 'cancelled';

  return (
    <div className="service-detail-v2">
      <Link to="/services" className="service-detail-v2__back"><ArrowLeft size={14} /> All services</Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <section
        className={`service-detail-hero is-${service.status}`}
        style={category?.color ? { ['--service-color' as string]: category.color } : undefined}
      >
        <div className="service-detail-hero__glow" />
        <CategoryMark
          icon={category?.icon}
          logoUrl={category?.logoUrl}
          color={category?.color}
          size={68}
          className="service-detail-hero__mark"
        />
        <div className="service-detail-hero__identity">
          <span>{category?.name || service.product.name}</span>
          <h1>{service.name}</h1>
          <p><span className={statusBadge(service.status)}>{serviceStatus(service.status)}</span><i /> Created {new Date(service.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="service-detail-hero__actions">
          {isActive && panelHref ? (
            <a href={panelHref} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open game panel</a>
          ) : (
            <span><Clock3 size={15} /> {service.status === 'pending_payment' ? 'Waiting for payment' : 'Panel access unavailable'}</span>
          )}
        </div>
      </section>

      <section className="service-detail-metrics">
        <article><span><ShieldCheck size={16} /></span><div><small>Service status</small><strong>{isActive ? 'Online & managed' : serviceStatus(service.status)}</strong></div></article>
        <article><span><CalendarDays size={16} /></span><div><small>Next renewal</small><strong>{service.nextDueAt ? new Date(service.nextDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled'}</strong></div></article>
        <article><span><CircleDollarSign size={16} /></span><div><small>Plan price</small><strong>{money(billing.priceCents, billing.currency)} / {billing.cycle}</strong></div></article>
        <article><span><FileText size={16} /></span><div><small>Billing history</small><strong>{service.invoices.length} invoice{service.invoices.length === 1 ? '' : 's'}</strong></div></article>
      </section>

      <div className="service-detail-layout">
        <main>
          <section className="service-detail-card service-detail-overview">
            <header><div><span>Configuration</span><h2>Server resources</h2><p>The resources included with your current hosting plan.</p></div><Server size={18} /></header>
            <div className="service-resource-grid">
              <article><span className="is-purple"><MemoryStick size={18} /></span><div><small>Memory</small><strong>{formatMemoryMb(limits.memoryMb)}</strong><p>Allocated RAM</p></div></article>
              <article><span className="is-blue"><Cpu size={18} /></span><div><small>Processor</small><strong>{formatCpuPercent(limits.cpuPercent)}</strong><p>CPU allocation</p></div></article>
              <article><span className="is-green"><HardDrive size={18} /></span><div><small>Storage</small><strong>{formatDiskMb(limits.diskMb)}</strong><p>Fast disk space</p></div></article>
            </div>
            {service.product.description && <p className="service-detail-overview__description">{service.product.description}</p>}
          </section>

          {(isActive || service.status === 'suspended') && (
            <section className="service-detail-card service-upgrade-card">
              <header>
                <div>
                  <span>Plan upgrades</span>
                  <h2>Move to a larger plan</h2>
                  <p>Same game egg, more resources. You pay the prorated difference until your next renewal.</p>
                </div>
                <TrendingUp size={18} />
              </header>
              {upgradeLoading && <p className="ds-muted">Loading upgrade options…</p>}
              {!upgradeLoading && !upgradeOptions.length && (
                <div className="service-billing-history__empty">
                  <TrendingUp size={22} />
                  <span>
                    <strong>No upgrades available</strong>
                    <small>There are no higher plans with the same panel egg right now.</small>
                  </span>
                </div>
              )}
              <div className="service-upgrade-list">
                {upgradeOptions.map((option) => (
                  <article key={option.id}>
                    <div>
                      <strong>{option.name}</strong>
                      <small>
                        {option.memoryMb <= 0 ? 'Unlimited RAM' : `${Math.round(option.memoryMb / 1024)} GB RAM`}
                        {' · '}
                        {option.cpuPercent <= 0 ? 'Unlimited CPU' : `${option.cpuPercent}% CPU`}
                        {' · '}
                        {option.diskMb <= 0 ? 'Unlimited disk' : `${Math.round(option.diskMb / 1024)} GB disk`}
                      </small>
                      <em>
                        {option.prorated
                          ? `Prorated upgrade charge ${money(option.chargeCents, option.currency)} (full delta ${money(option.fullDeltaCents, option.currency)} / ${option.cycle})`
                          : `Upgrade charge ${money(option.chargeCents, option.currency)}`}
                      </em>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(upgradeBusy)}
                      onClick={() => void requestUpgrade(option)}
                    >
                      {upgradeBusy === option.id ? 'Creating…' : 'Upgrade'} <ArrowRight size={13} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="service-detail-card service-billing-history">
            <header><div><span>Billing</span><h2>Invoice history</h2><p>Payments and renewals attached to this service.</p></div><Link to="/invoices">All invoices <ArrowRight size={13} /></Link></header>
            <div>
              {service.invoices.map((invoice) => (
                <Link to={`/invoices/${invoice.id}`} key={invoice.id}>
                  <span className={`service-billing-history__icon is-${invoice.status}`}><FileText size={15} /></span>
                  <span><small>{invoice.number}</small><strong>{invoice.status === 'paid' && invoice.paidAt ? `Paid ${new Date(invoice.paidAt).toLocaleDateString()}` : `Due ${new Date(invoice.dueAt).toLocaleDateString()}`}</strong></span>
                  <span className={statusBadge(invoice.status)}>{invoice.status}</span>
                  <strong>{money(invoice.totalCents, invoice.currency)}</strong>
                  <ChevronRight size={14} />
                </Link>
              ))}
              {!service.invoices.length && <div className="service-billing-history__empty"><FileText size={22} /><span><strong>No invoices yet</strong><small>Billing records will appear here.</small></span></div>}
            </div>
          </section>
        </main>

        <aside>
          <section className="service-panel-card">
            <header><span className={isActive ? 'is-online' : ''}><i /></span><div><small>Spirit-Panel connection</small><strong>{isActive && service.panelServerId ? 'Server connected' : 'Awaiting connection'}</strong></div></header>
            <div><small>Panel server ID</small><strong>{service.panelServerId || 'Assigned after provisioning'}</strong></div>
            {isActive && panelHref ? <a href={panelHref} target="_blank" rel="noopener noreferrer">Manage server <ExternalLink size={13} /></a> : <span>Panel access becomes available when your service is active.</span>}
          </section>

          <section className="service-plan-card">
            <header>
              <CategoryMark
                icon={category?.icon}
                logoUrl={category?.logoUrl}
                color={category?.color}
                size={34}
              />
              <span>
                <small>{category?.name || 'Current plan'}</small>
                <strong>{service.product.name}</strong>
              </span>
            </header>
            <div><span>Billing cycle</span><strong>{cycleLabel(billing.cycle)}</strong></div>
            <div><span>Recurring price</span><strong>{money(billing.priceCents, billing.currency)}</strong></div>
            <div><span>Total paid</span><strong>{money(totalPaid, billing.currency)}</strong></div>
            {latestInvoice && <Link to={`/invoices/${latestInvoice.id}`}>View latest invoice <ArrowRight size={13} /></Link>}
          </section>

          {canDelete && (
            <section className="service-danger-card">
              <header>
                <Trash2 size={16} />
                <div>
                  <strong>Delete this server</strong>
                  <p>
                    {deletion?.refundEligible && deletion.refundCents > 0
                      ? `Owned ${deletion.ageDays} days. Estimated credit refund: ${money(deletion.refundCents, billing.currency)} for the unused period.`
                      : deletion?.ownedLongEnough
                        ? 'No unused period remains, so no credit refund will be issued.'
                        : `Servers deleted within the first ${deletion?.minAgeDays ?? 3} days are not eligible for a credit refund.`}
                  </p>
                </div>
              </header>
              <button type="button" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} /> Delete server
              </button>
            </section>
          )}

          <section className="service-help-card">
            <CheckCircle2 size={17} />
            <div><strong>Need help with this server?</strong><p>Quote the service name when contacting the SpiritHost support team.</p></div>
          </section>
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
            : deletion?.ownedLongEnough
              ? 'No credit refund — there is no remaining unused period.'
              : `No credit refund — ownership is under ${deletion?.minAgeDays ?? 3} days.`,
        ].filter(Boolean) as string[]}
        onCancel={() => !deleting && setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
