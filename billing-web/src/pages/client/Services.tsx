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
  HardDrive,
  MemoryStick,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
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

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'pending_payment' | 'suspended'>('all');

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

  return (
    <div className="client-services-v2">
      <header className="client-services-v2__header">
        <div>
          <span>Hosting infrastructure</span>
          <h1>Your services</h1>
          <p>Monitor every server, review renewals, and jump directly into your game panel.</p>
        </div>
        <Link to="/game-hosting"><Sparkles size={14} /> Deploy another server</Link>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <section className="client-services-metrics">
        <article><span className="is-blue"><Server size={17} /></span><div><small>Total services</small><strong>{services.length}</strong><p>Across your account</p></div></article>
        <article><span className="is-green"><Activity size={17} /></span><div><small>Active now</small><strong>{activeCount}</strong><p>Ready to manage</p></div></article>
        <article><span className="is-amber"><Clock3 size={17} /></span><div><small>Awaiting payment</small><strong>{pendingCount}</strong><p>Provisioning pending</p></div></article>
        <article><span className="is-red"><AlertCircle size={17} /></span><div><small>Needs attention</small><strong>{attentionCount}</strong><p>Suspended services</p></div></article>
      </section>

      <section className="client-services-catalogue">
        <header>
          <div><span>Service library</span><h2>Your infrastructure</h2></div>
          <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services or plans…" /></label>
          <div>
            {([
              ['all', 'All'],
              ['active', 'Active'],
              ['pending_payment', 'Pending'],
              ['suspended', 'Suspended'],
            ] as const).map(([value, label]) => (
              <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </header>

        <div className="client-service-grid">
          {visibleServices.map((service) => {
            const category = service.product.category;
            const limits = serviceLimits(service);
            const billing = serviceBilling(service);
            return (
            <Link
              to={`/services/${service.id}`}
              className={`client-service-card is-${service.status}`}
              key={service.id}
              style={category?.color ? { ['--service-color' as string]: category.color } : undefined}
            >
              <header>
                <CategoryMark
                  icon={category?.icon}
                  logoUrl={category?.logoUrl}
                  color={category?.color}
                  size={42}
                  className="client-service-card__mark"
                />
                <div>
                  <small>{category?.name || service.product.name}</small>
                  <h3>{service.name}</h3>
                </div>
                <span className={statusBadge(service.status)}>{serviceStatus(service.status)}</span>
              </header>
              <p>{service.product.description || 'Managed game server hosted on SpiritHost infrastructure.'}</p>
              <div className="client-service-card__resources">
                <span><MemoryStick size={13} /><small>Memory</small><strong>{formatMemoryMb(limits.memoryMb)}</strong></span>
                <span><Cpu size={13} /><small>CPU</small><strong>{formatCpuPercent(limits.cpuPercent)}</strong></span>
                <span><HardDrive size={13} /><small>Storage</small><strong>{formatDiskMb(limits.diskMb)}</strong></span>
              </div>
              <footer>
                <span><small>Renewal</small><strong>{service.nextDueAt ? new Date(service.nextDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled'}</strong></span>
                <span><small>Plan cost</small><strong>{money(billing.priceCents, billing.currency)} <em>/ {cycleLabel(billing.cycle).toLowerCase()}</em></strong></span>
                <i>View service <ChevronRight size={13} /></i>
              </footer>
            </Link>
            );
          })}

          {!loading && !visibleServices.length && (
            <div className="client-services-empty">
              <span><Server size={30} /></span>
              <h3>{services.length ? 'No matching services' : 'Your next server starts here'}</h3>
              <p>{services.length ? 'Try another search or status filter.' : 'Choose a game and deploy a managed server in just a few steps.'}</p>
              {!services.length && <Link to="/game-hosting">Explore game hosting <ArrowRight size={14} /></Link>}
            </div>
          )}
          {loading && <div className="client-services-empty"><span><Server size={30} /></span><h3>Loading your services…</h3></div>}
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
