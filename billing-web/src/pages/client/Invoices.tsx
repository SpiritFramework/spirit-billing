import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Cpu,
  Database,
  FileText,
  Gamepad2,
  HardDrive,
  Layers3,
  MemoryStick,
  ReceiptText,
  Search,
  Server,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';
import { api, ApiError, money } from '../../lib/api';
import { formatCpuPercent, formatDiskMb, formatMemoryMb } from '../../lib/resources';
import { useAuth } from '../../context/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';

type InvoiceProduct = {
  id: string;
  name: string;
  description?: string;
  features?: string[];
  priceCents: number;
  currency: string;
  cycle: string;
  memoryMb?: number;
  diskMb?: number;
  cpuPercent?: number;
  backupLimit?: number;
  databaseLimit?: number;
  allocationLimit?: number;
};

type UpgradeProduct = InvoiceProduct;

type Invoice = {
  id: string;
  number: string;
  status: string;
  subtotalCents?: number;
  discountCents?: number;
  creditAppliedCents?: number;
  totalCents: number;
  currency: string;
  description: string;
  couponCode?: string | null;
  createdAt?: string;
  dueAt: string;
  paidAt: string | null;
  upgradeToProductId?: string | null;
  isUpgrade?: boolean;
  canCancelUpgrade?: boolean;
  upgradeToProduct?: UpgradeProduct | null;
  service?: {
    id: string;
    name: string;
    status: string;
    memoryMb?: number | null;
    diskMb?: number | null;
    cpuPercent?: number | null;
    backupLimit?: number | null;
    databaseLimit?: number | null;
    allocationLimit?: number | null;
    priceCents?: number | null;
    currency?: string | null;
    cycle?: string | null;
    nextDueAt?: string | null;
    product?: InvoiceProduct | null;
  } | null;
  paymentInstructions?: string;
  companyName?: string;
  tagline?: string;
  invoiceFooter?: string;
  supportEmail?: string;
  supportUrl?: string;
};

type InvoiceFilter = 'all' | 'unpaid' | 'paid' | 'cancelled';

function isOverdueInvoice(invoice: Invoice) {
  return invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
}

function invoiceKindLabel(invoice: Invoice) {
  if (invoice.isUpgrade && invoice.upgradeToProduct) {
    return `Upgrade · ${invoice.upgradeToProduct.name}`;
  }
  const raw = (invoice.description || '').replace(/\s*[—-]\s*.*$/, '').replace(/\s*\(Demo seed\)\s*/gi, '').trim();
  if (!raw) return null;
  if (/renewal/i.test(raw)) return 'Renewal';
  if (/upgrade/i.test(raw)) return 'Upgrade';
  if (/setup|initial/i.test(raw)) return 'Setup';
  if (/addon|add-on|reserved/i.test(raw)) return 'Addon';
  if (/delete|workflow/i.test(raw)) return 'Admin';
  return raw.length > 28 ? `${raw.slice(0, 26)}…` : raw;
}

function invoiceStatusRank(invoice: Invoice) {
  if (isOverdueInvoice(invoice)) return 0;
  if (invoice.status === 'unpaid') return 1;
  if (invoice.status === 'paid') return 2;
  return 3;
}

function sortInvoices(a: Invoice, b: Invoice) {
  const rank = invoiceStatusRank(a) - invoiceStatusRank(b);
  if (rank !== 0) return rank;
  const aTime = new Date(a.paidAt || a.dueAt || a.createdAt || 0).getTime();
  const bTime = new Date(b.paidAt || b.dueAt || b.createdAt || 0).getTime();
  // Unpaid: soonest due first. Paid/cancelled: most recent first.
  if (a.status === 'unpaid') return aTime - bTime;
  return bTime - aTime;
}

function invoiceRowIcon(invoice: Invoice, overdue: boolean) {
  if (invoice.status === 'paid') return CheckCircle2;
  if (invoice.status === 'cancelled') return X;
  if (overdue) return AlertCircle;
  return Clock3;
}

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InvoiceFilter>('all');

  useEffect(() => {
    void api<Invoice[]>('/client/invoices')
      .then(setInvoices)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load invoices'))
      .finally(() => setLoading(false));
  }, []);

  const unpaidInvoices = invoices.filter((invoice) => invoice.status === 'unpaid');
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const cancelledInvoices = invoices.filter((invoice) => invoice.status === 'cancelled');
  const outstandingCents = unpaidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const paidCents = paidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const currency = unpaidInvoices[0]?.currency || paidInvoices[0]?.currency || invoices[0]?.currency || 'GBP';
  const filterCounts: Record<InvoiceFilter, number> = {
    all: invoices.length,
    unpaid: unpaidInvoices.length,
    paid: paidInvoices.length,
    cancelled: cancelledInvoices.length,
  };
  const nextUnpaid = [...unpaidInvoices].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  )[0];
  const visibleInvoices = invoices
    .filter((invoice) => {
      const matchesFilter = filter === 'all' || invoice.status === filter;
      const matchesQuery = `${invoice.number} ${invoice.description} ${invoice.service?.name ?? ''} ${invoice.upgradeToProduct?.name ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      return matchesFilter && matchesQuery;
    })
    .sort(sortInvoices);

  return (
    <div className="client-invoices">
      <header className="client-invoices__intro">
        <div className="client-invoices__intro-copy">
          <p>Billing</p>
          <h1>Invoices</h1>
          <span>Review charges, track payments, and clear outstanding balances.</span>
        </div>
        <div className="client-invoices__intro-actions">
          {nextUnpaid ? (
            <Link
              className="client-home__btn client-home__btn--primary client-home__btn--cta"
              to={`/invoices/${nextUnpaid.id}`}
            >
              <span className="client-home__btn-icon" aria-hidden>
                <WalletCards size={15} />
              </span>
              <span>Pay {money(nextUnpaid.totalCents, nextUnpaid.currency)}</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </Link>
          ) : (
            <Link className="client-home__btn client-home__btn--ghost client-home__btn--cta" to="/game-hosting">
              <span className="client-home__btn-icon" aria-hidden>
                <Gamepad2 size={15} />
              </span>
              <span>Browse hosting</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </Link>
          )}
        </div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <div className="client-invoices__pulse" aria-label="Invoice snapshot">
        <button
          type="button"
          className={`client-invoices__pulse-item${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="client-invoices__pulse-copy">
            <small>Total</small>
            <strong>{loading ? '—' : invoices.length}</strong>
            <span>All invoices</span>
          </span>
          <span className="client-invoices__pulse-icon is-total" aria-hidden>
            <FileText size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-invoices__pulse-item${filter === 'unpaid' ? ' is-active' : ''}`}
          onClick={() => setFilter('unpaid')}
        >
          <span className="client-invoices__pulse-copy">
            <small>Unpaid</small>
            <strong className={unpaidInvoices.length > 0 ? 'is-warn' : undefined}>
              {loading ? '—' : unpaidInvoices.length}
            </strong>
            <span>{loading ? 'Outstanding' : money(outstandingCents, currency)}</span>
          </span>
          <span className="client-invoices__pulse-icon is-due" aria-hidden>
            <Clock3 size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-invoices__pulse-item${filter === 'paid' ? ' is-active' : ''}`}
          onClick={() => setFilter('paid')}
        >
          <span className="client-invoices__pulse-copy">
            <small>Paid</small>
            <strong className="is-ok">{loading ? '—' : paidInvoices.length}</strong>
            <span>{loading ? 'Processed' : money(paidCents, currency)}</span>
          </span>
          <span className="client-invoices__pulse-icon is-paid" aria-hidden>
            <CheckCircle2 size={17} />
          </span>
        </button>
        <button
          type="button"
          className={`client-invoices__pulse-item${filter === 'cancelled' ? ' is-active' : ''}`}
          onClick={() => setFilter('cancelled')}
        >
          <span className="client-invoices__pulse-copy">
            <small>Cancelled</small>
            <strong>{loading ? '—' : cancelledInvoices.length}</strong>
            <span>Closed records</span>
          </span>
          <span className="client-invoices__pulse-icon is-cancelled" aria-hidden>
            <X size={17} />
          </span>
        </button>
      </div>

      <section className="client-invoices__panel">
        <div className="client-invoices__panel-head">
          <div className="client-invoices__panel-copy">
            <h2>Billing records</h2>
            <p>
              {loading
                ? 'Loading invoices…'
                : query.trim() || filter !== 'all'
                  ? `${visibleInvoices.length} match${visibleInvoices.length === 1 ? '' : 'es'}`
                  : `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <label className="client-invoices__search">
            <Search size={15} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search number, service, or description…"
              aria-label="Search invoices"
            />
          </label>
        </div>

        <div className="client-invoices__filters" role="group" aria-label="Filter by status">
          {([
            ['all', 'All'],
            ['unpaid', 'Unpaid'],
            ['paid', 'Paid'],
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

        {!loading && unpaidInvoices.length > 0 && filter === 'all' && !query.trim() && (
          <div className="client-invoices__attention">
            <span className="client-invoices__attention-copy">
              <Clock3 size={15} aria-hidden />
              <span>
                <strong>{money(outstandingCents, currency)} outstanding</strong>
                <small>
                  {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length === 1 ? '' : 's'}
                  {nextUnpaid
                    ? ` · next due ${new Date(nextUnpaid.dueAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}`
                    : ''}
                </small>
              </span>
            </span>
            <div className="client-invoices__attention-actions">
              <button type="button" className="client-home__btn client-home__btn--ghost client-home__btn--sm" onClick={() => setFilter('unpaid')}>
                Show unpaid
              </button>
              {nextUnpaid && (
                <Link className="client-home__btn client-home__btn--primary client-home__btn--sm" to={`/invoices/${nextUnpaid.id}`}>
                  Pay now
                  <ArrowRight size={13} />
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="client-invoices__list">
          {visibleInvoices.map((invoice) => {
            const overdue = isOverdueInvoice(invoice);
            const statusKey = overdue ? 'overdue' : invoice.status;
            const statusLabel =
              statusKey === 'overdue'
                ? 'Overdue'
                : statusKey === 'unpaid'
                  ? 'Unpaid'
                  : statusKey === 'paid'
                    ? 'Paid'
                    : statusKey === 'cancelled'
                      ? 'Cancelled'
                      : statusKey.replaceAll('_', ' ');
            const kind = invoiceKindLabel(invoice);
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
            const RowIcon = invoiceRowIcon(invoice, overdue);
            return (
              <Link
                key={invoice.id}
                to={`/invoices/${invoice.id}`}
                className={`client-invoices__row is-${statusKey}`}
              >
                <span className="client-invoices__row-mark" aria-hidden>
                  <RowIcon size={16} />
                </span>
                <span className="client-invoices__row-body">
                  <span className="client-invoices__row-main">
                    <span className="client-invoices__row-title">
                      <strong>{invoice.number}</strong>
                    </span>
                    <span className="client-invoices__row-meta">
                      <span className={`client-invoices__status is-${statusKey}`}>{statusLabel}</span>
                      <span className="client-invoices__row-meta-item">
                        {invoice.service?.name || 'Hosting'}
                      </span>
                      {kind ? <span className="client-invoices__row-meta-item">{kind}</span> : null}
                    </span>
                  </span>
                  <span className="client-invoices__row-rail">
                    <span className="client-invoices__row-date">
                      <small>{dateLabel}</small>
                      <strong>{dateValue}</strong>
                    </span>
                    <span className="client-invoices__row-amount">
                      <strong>{money(invoice.totalCents, invoice.currency)}</strong>
                    </span>
                    <span className="client-invoices__row-go" aria-hidden>
                      <ArrowRight size={14} strokeWidth={2} />
                    </span>
                  </span>
                </span>
              </Link>
            );
          })}

          {!loading && !visibleInvoices.length && (
            <div className="client-invoices__empty">
              <span aria-hidden>
                <ReceiptText size={20} />
              </span>
              <strong>{invoices.length ? 'No matching invoices' : 'No invoices yet'}</strong>
              <p>
                {invoices.length
                  ? 'Try another search or status filter.'
                  : 'Invoices appear here after you place a hosting order.'}
              </p>
              {invoices.length ? (
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
                  <span>Browse hosting</span>
                  <ArrowRight size={13} className="client-home__btn-arrow" />
                </Link>
              )}
            </div>
          )}

          {loading && (
            <div className="client-invoices__empty">
              <span aria-hidden>
                <ReceiptText size={20} />
              </span>
              <strong>Loading invoices…</strong>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    if (!id) return;
    setError('');
    try {
      setInvoice(await api<Invoice>(`/client/invoices/${id}`));
    } catch (err) {
      setInvoice(null);
      setError(err instanceof Error ? err.message : 'Invoice not found');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function payWithCredits() {
    if (!id || !invoice) return;
    setPaying(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{
        invoice: Invoice;
        creditAppliedCents: number;
        provisioned: boolean;
        provisionError?: string;
      }>(`/client/invoices/${id}/pay-with-credits`, { method: 'POST', body: '{}' });
      setInvoice(result.invoice);
      await refresh();
      if (result.provisioned) {
        setMessage(
          invoice.isUpgrade
            ? `Paid with credits — plan upgraded to ${invoice.upgradeToProduct?.name || 'the new plan'}.`
            : 'Paid with credits — server was provisioned.',
        );
      } else if (result.provisionError) {
        setError(result.provisionError);
      } else {
        setMessage(`Applied ${money(result.creditAppliedCents, invoice.currency)} in credits.`);
      }
      setPayConfirmOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not apply credits');
    } finally {
      setPaying(false);
    }
  }

  async function cancelUpgradeInvoice() {
    if (!id || !invoice) return;
    setCancelling(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<Invoice>(`/client/invoices/${id}/cancel`, { method: 'POST', body: '{}' });
      setInvoice({ ...invoice, ...updated, canCancelUpgrade: false, status: 'cancelled' });
      setMessage('Upgrade invoice cancelled. You can request a different plan anytime.');
      setCancelOpen(false);
      await refresh();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this upgrade invoice');
    } finally {
      setCancelling(false);
    }
  }

  if (error && !invoice) {
    return (
      <div className="client-invoice-detail">
        <Link to="/invoices" className="client-invoice-detail__back">
          <ArrowLeft size={14} /> All invoices
        </Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="client-invoice-detail">
        <div className="client-invoice-detail__loading">Loading invoice…</div>
      </div>
    );
  }

  const creditBalance = user?.creditBalanceCents ?? 0;
  const canPayCredits = invoice.status === 'unpaid' && invoice.totalCents > 0 && creditBalance > 0;
  const creditToApply = Math.min(creditBalance, invoice.totalCents);
  const remainingAfterCredit = Math.max(0, invoice.totalCents - creditToApply);
  const willFullyPay = canPayCredits && remainingAfterCredit === 0;
  const creditCoverPercent = invoice.totalCents
    ? Math.min(100, (creditToApply / invoice.totalCents) * 100)
    : 0;
  const subtotalCents =
    invoice.subtotalCents ??
    invoice.totalCents + (invoice.discountCents ?? 0) + (invoice.creditAppliedCents ?? 0);
  const isOverdue = isOverdueInvoice(invoice);
  const statusKey = isOverdue ? 'overdue' : invoice.status;
  const statusLabel =
    statusKey === 'overdue'
      ? 'Overdue'
      : statusKey === 'unpaid'
        ? 'Unpaid'
        : statusKey === 'paid'
          ? 'Paid'
          : statusKey === 'cancelled'
            ? 'Cancelled'
            : statusKey.replaceAll('_', ' ');
  const footerNote =
    invoice.invoiceFooter?.trim()
    || `Keep this invoice for your records. Quote ${invoice.number} when contacting support.`;
  const supportHref = invoice.supportUrl && /^https?:\/\//i.test(invoice.supportUrl)
    ? invoice.supportUrl
    : invoice.supportEmail
      ? `mailto:${invoice.supportEmail}`
      : undefined;
  const isUpgrade = Boolean(invoice.isUpgrade && invoice.upgradeToProduct);
  const upgrade = invoice.upgradeToProduct;
  const currentPlan = invoice.service?.product;
  const featuredProduct = isUpgrade && upgrade ? upgrade : currentPlan;
  const planMemory = isUpgrade
    ? upgrade?.memoryMb
    : invoice.service?.memoryMb ?? currentPlan?.memoryMb;
  const planDisk = isUpgrade
    ? upgrade?.diskMb
    : invoice.service?.diskMb ?? currentPlan?.diskMb;
  const planCpu = isUpgrade
    ? upgrade?.cpuPercent
    : invoice.service?.cpuPercent ?? currentPlan?.cpuPercent;
  const planBackups = isUpgrade
    ? upgrade?.backupLimit
    : invoice.service?.backupLimit ?? currentPlan?.backupLimit;
  const planDatabases = isUpgrade
    ? upgrade?.databaseLimit
    : invoice.service?.databaseLimit ?? currentPlan?.databaseLimit;
  const planPorts = isUpgrade
    ? upgrade?.allocationLimit
    : invoice.service?.allocationLimit ?? currentPlan?.allocationLimit;
  const planFeatures = Array.isArray(featuredProduct?.features)
    ? featuredProduct.features.filter(Boolean).slice(0, 8)
    : [];
  const planDescription = (featuredProduct?.description || '').trim();
  const planCycle = featuredProduct?.cycle || invoice.service?.cycle || 'monthly';
  const kind = invoiceKindLabel(invoice);
  const issuedLabel = new Date(invoice.createdAt || invoice.dueAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const dueLabel = new Date(invoice.dueAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const paidLabel = invoice.paidAt
    ? new Date(invoice.paidAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const itemTitle =
    isUpgrade && upgrade
      ? `Upgrade to ${upgrade.name}`
      : invoice.service?.name || featuredProduct?.name || 'Hosting service';
  const itemDetail =
    isUpgrade && upgrade
      ? `${invoice.service?.name || 'Service'}${currentPlan?.name ? ` · from ${currentPlan.name}` : ''} · ${upgrade.cycle}`
      : invoice.description || featuredProduct?.name || 'Managed game hosting';
  const itemBilling = isUpgrade ? 'Upgrade' : planCycle || 'One-time';
  const hasResources =
    typeof planMemory === 'number' ||
    typeof planCpu === 'number' ||
    typeof planDisk === 'number' ||
    typeof planBackups === 'number' ||
    typeof planDatabases === 'number' ||
    typeof planPorts === 'number';

  return (
    <div className={`client-invoice-detail is-${statusKey}`}>
      <Link to="/invoices" className="client-invoice-detail__back">
        <ArrowLeft size={14} /> All invoices
      </Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <header className="client-invoice-detail__intro">
        <div className="client-invoice-detail__intro-main">
          <span className={`client-invoice-detail__mark is-${statusKey}`} aria-hidden>
            {invoice.status === 'paid' ? (
              <CheckCircle2 size={20} />
            ) : invoice.status === 'cancelled' ? (
              <X size={20} />
            ) : isOverdue ? (
              <AlertCircle size={20} />
            ) : (
              <ReceiptText size={20} />
            )}
          </span>
          <div className="client-invoice-detail__intro-copy">
            <p>{isUpgrade ? 'Plan upgrade' : 'Invoice'}</p>
            <h1>{invoice.number}</h1>
            <span className="client-invoice-detail__intro-meta">
              <span className={`client-invoice-detail__status is-${statusKey}`}>{statusLabel}</span>
              {invoice.service?.name ? (
                <span className="client-invoice-detail__chip">{invoice.service.name}</span>
              ) : null}
              {kind ? <span className="client-invoice-detail__chip">{kind}</span> : null}
              <span className="client-invoice-detail__meta-text">
                {invoice.companyName || 'SpiritHost'}
              </span>
            </span>
          </div>
        </div>
        <div className="client-invoice-detail__intro-actions">
          {invoice.status === 'unpaid' && canPayCredits ? (
            <button
              type="button"
              className="client-home__btn client-home__btn--primary client-home__btn--cta"
              disabled={paying}
              onClick={() => setPayConfirmOpen(true)}
            >
              <span className="client-home__btn-icon" aria-hidden>
                <WalletCards size={15} />
              </span>
              <span>
                {willFullyPay
                  ? isUpgrade
                    ? 'Pay & upgrade'
                    : 'Pay with credits'
                  : `Apply ${money(creditToApply, invoice.currency)}`}
              </span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </button>
          ) : null}
          {invoice.service ? (
            <Link
              className="client-home__btn client-home__btn--ghost client-home__btn--cta"
              to={`/services/${invoice.service.id}`}
            >
              <span className="client-home__btn-icon" aria-hidden>
                <Server size={15} />
              </span>
              <span>View service</span>
              <ArrowRight size={14} className="client-home__btn-arrow" />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="client-invoice-detail__pulse" aria-label="Invoice snapshot">
        <div className="client-invoice-detail__pulse-item">
          <span className="client-invoice-detail__pulse-copy">
            <small>{invoice.status === 'paid' ? 'Paid' : 'Amount due'}</small>
            <strong className={invoice.status === 'unpaid' ? 'is-warn' : invoice.status === 'paid' ? 'is-ok' : undefined}>
              {money(invoice.totalCents, invoice.currency)}
            </strong>
            <span>{invoice.currency}</span>
          </span>
          <span className="client-invoice-detail__pulse-icon is-amount" aria-hidden>
            <CircleDollarSign size={17} />
          </span>
        </div>
        <div className="client-invoice-detail__pulse-item">
          <span className="client-invoice-detail__pulse-copy">
            <small>{invoice.status === 'paid' ? 'Paid on' : isOverdue ? 'Was due' : 'Due on'}</small>
            <strong>{invoice.status === 'paid' && paidLabel ? paidLabel : dueLabel}</strong>
            <span>Issued {issuedLabel}</span>
          </span>
          <span className={`client-invoice-detail__pulse-icon is-date is-${statusKey}`} aria-hidden>
            <Clock3 size={17} />
          </span>
        </div>
        <div className="client-invoice-detail__pulse-item">
          <span className="client-invoice-detail__pulse-copy">
            <small>Status</small>
            <strong className={statusKey === 'paid' ? 'is-ok' : statusKey === 'unpaid' || statusKey === 'overdue' ? 'is-warn' : undefined}>
              {statusLabel}
            </strong>
            <span>{isUpgrade ? 'Plan upgrade' : 'Hosting invoice'}</span>
          </span>
          <span className={`client-invoice-detail__pulse-icon is-status is-${statusKey}`} aria-hidden>
            {invoice.status === 'paid' ? <CheckCircle2 size={17} /> : invoice.status === 'cancelled' ? <X size={17} /> : <FileText size={17} />}
          </span>
        </div>
        <div className="client-invoice-detail__pulse-item">
          <span className="client-invoice-detail__pulse-copy">
            <small>Credits</small>
            <strong>{money(creditBalance, invoice.currency)}</strong>
            <span>{canPayCredits ? 'Ready to apply' : 'Available balance'}</span>
          </span>
          <span className="client-invoice-detail__pulse-icon is-credits" aria-hidden>
            <WalletCards size={17} />
          </span>
        </div>
      </div>

      <div className="client-invoice-detail__layout">
        <div className="client-invoice-detail__primary">
          {isUpgrade && upgrade ? (
            <section className="client-invoice-detail__panel client-invoice-detail__upgrade">
              <span aria-hidden>
                <TrendingUp size={16} />
              </span>
              <div>
                <strong>Plan upgrade</strong>
                <p>
                  {currentPlan?.name || 'Current plan'}
                  {' → '}
                  <em>{upgrade.name}</em>
                  {typeof upgrade.memoryMb === 'number' &&
                  typeof upgrade.cpuPercent === 'number' &&
                  typeof upgrade.diskMb === 'number' ? (
                    <>
                      {' '}
                      · {formatMemoryMb(upgrade.memoryMb)} · {formatCpuPercent(upgrade.cpuPercent)} ·{' '}
                      {formatDiskMb(upgrade.diskMb)}
                    </>
                  ) : null}
                </p>
              </div>
            </section>
          ) : null}

          <section className="client-invoice-detail__panel">
            <div className="client-invoice-detail__panel-head">
              <div>
                <h2>What you&apos;re getting</h2>
                <p>
                  {isUpgrade
                    ? 'Resources and plan details after this upgrade.'
                    : 'Plan details covered by this invoice.'}
                </p>
              </div>
            </div>

            <div className="client-invoice-detail__items">
              <div className="client-invoice-detail__item">
                <span className="client-invoice-detail__item-mark" aria-hidden>
                  {isUpgrade ? <TrendingUp size={15} /> : <Server size={15} />}
                </span>
                <span className="client-invoice-detail__item-main">
                  <strong>{itemTitle}</strong>
                  <small>{itemDetail}</small>
                </span>
                <span className="client-invoice-detail__item-cycle">{itemBilling}</span>
                <strong className="client-invoice-detail__item-amount">
                  {money(subtotalCents, invoice.currency)}
                </strong>
              </div>
            </div>

            {(featuredProduct || hasResources || planDescription || planFeatures.length > 0) && (
              <div className="client-invoice-detail__getting">
                <div className="client-invoice-detail__getting-head">
                  <div>
                    <small>{isUpgrade ? 'Upgrading to' : 'Plan'}</small>
                    <strong>{featuredProduct?.name || invoice.service?.name || 'Hosting plan'}</strong>
                  </div>
                  <span>
                    {money(
                      featuredProduct?.priceCents ?? invoice.totalCents,
                      featuredProduct?.currency || invoice.currency,
                    )}
                    <em> / {planCycle}</em>
                  </span>
                </div>

                {planDescription ? (
                  <p className="client-invoice-detail__getting-copy">{planDescription}</p>
                ) : null}

                {hasResources ? (
                  <div className="client-invoice-detail__resource-rail" aria-label="Plan resources">
                    {typeof planMemory === 'number' ? (
                      <span>
                        <MemoryStick size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{formatMemoryMb(planMemory)}</em>
                          <small>RAM</small>
                        </span>
                      </span>
                    ) : null}
                    {typeof planCpu === 'number' ? (
                      <span>
                        <Cpu size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{formatCpuPercent(planCpu)}</em>
                          <small>CPU</small>
                        </span>
                      </span>
                    ) : null}
                    {typeof planDisk === 'number' ? (
                      <span>
                        <HardDrive size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{formatDiskMb(planDisk)}</em>
                          <small>Disk</small>
                        </span>
                      </span>
                    ) : null}
                    {typeof planBackups === 'number' ? (
                      <span>
                        <Archive size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{planBackups <= 0 ? 'Off' : planBackups}</em>
                          <small>Backups</small>
                        </span>
                      </span>
                    ) : null}
                    {typeof planDatabases === 'number' ? (
                      <span>
                        <Database size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{planDatabases <= 0 ? 'Off' : planDatabases}</em>
                          <small>Databases</small>
                        </span>
                      </span>
                    ) : null}
                    {typeof planPorts === 'number' ? (
                      <span>
                        <Layers3 size={14} strokeWidth={1.75} aria-hidden />
                        <span>
                          <em>{planPorts <= 0 ? 'Off' : planPorts}</em>
                          <small>Ports</small>
                        </span>
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {planFeatures.length > 0 ? (
                  <ul className="client-invoice-detail__features">
                    {planFeatures.map((feature) => (
                      <li key={feature}>
                        <CheckCircle2 size={13} aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}

            <div className="client-invoice-detail__totals">
              <div>
                <span>Subtotal</span>
                <strong>{money(subtotalCents, invoice.currency)}</strong>
              </div>
              {(invoice.discountCents ?? 0) > 0 ? (
                <div className="is-saving">
                  <span>
                    Coupon discount
                    {invoice.couponCode ? <em> {invoice.couponCode}</em> : null}
                  </span>
                  <strong>−{money(invoice.discountCents!, invoice.currency)}</strong>
                </div>
              ) : null}
              {(invoice.creditAppliedCents ?? 0) > 0 ? (
                <div className="is-saving">
                  <span>Account credits applied</span>
                  <strong>−{money(invoice.creditAppliedCents!, invoice.currency)}</strong>
                </div>
              ) : null}
              <div className="is-total">
                <span>{invoice.status === 'paid' ? 'Invoice total' : 'Amount due'}</span>
                <strong>{money(invoice.totalCents, invoice.currency)}</strong>
              </div>
            </div>
          </section>

          <section className="client-invoice-detail__panel client-invoice-detail__note">
            <ShieldCheck size={16} />
            <div>
              <strong>{invoice.companyName || 'SpiritHost'} billing</strong>
              <p>{footerNote}</p>
              {supportHref ? (
                <a
                  href={supportHref}
                  {...(supportHref.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  Contact support
                </a>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="client-invoice-detail__aside">
          <section className="client-invoice-detail__side">
            <div className="client-invoice-detail__side-head">
              <span className={`client-invoice-detail__status is-${statusKey}`}>{statusLabel}</span>
              <div>
                <small>{invoice.status === 'paid' ? 'Amount paid' : 'Outstanding'}</small>
                <strong>{money(invoice.totalCents, invoice.currency)}</strong>
              </div>
            </div>
            <p className="client-invoice-detail__side-note">
              {invoice.status === 'paid'
                ? 'No further action is required.'
                : invoice.status === 'cancelled'
                  ? 'No payment is required for this invoice.'
                  : isOverdue
                    ? 'This invoice is overdue.'
                    : `Due by ${dueLabel}.`}
            </p>
            {invoice.service ? (
              <Link
                className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                to={`/services/${invoice.service.id}`}
              >
                View service <ArrowRight size={13} />
              </Link>
            ) : null}
          </section>

          {invoice.status === 'unpaid' ? (
            <>
              <section className="client-invoice-detail__side">
                <div className="client-invoice-detail__side-head">
                  <WalletCards size={16} />
                  <div>
                    <small>Pay with credits</small>
                    <strong>{money(creditBalance, invoice.currency)} available</strong>
                  </div>
                </div>
                <div className="client-invoice-detail__credit-bar" aria-hidden>
                  <span style={{ width: `${creditCoverPercent}%` }} />
                </div>
                <p className="client-invoice-detail__side-note">
                  {canPayCredits
                    ? `${money(creditToApply, invoice.currency)} will be applied${
                        remainingAfterCredit
                          ? `, leaving ${money(remainingAfterCredit, invoice.currency)} due`
                          : isUpgrade
                            ? ` and upgrade to ${upgrade?.name}`
                            : ' and fully cover this invoice'
                      }.`
                    : 'You do not currently have credits available for this invoice.'}
                </p>
                <button
                  type="button"
                  className="client-home__btn client-home__btn--primary client-home__btn--sm"
                  disabled={!canPayCredits || paying}
                  onClick={() => setPayConfirmOpen(true)}
                >
                  {paying
                    ? 'Applying credits…'
                    : willFullyPay
                      ? isUpgrade
                        ? 'Pay & upgrade'
                        : 'Pay & provision'
                      : 'Apply account credits'}
                  <ArrowRight size={13} />
                </button>
              </section>

              <section className="client-invoice-detail__side">
                <div className="client-invoice-detail__side-head">
                  <CircleDollarSign size={16} />
                  <div>
                    <small>Manual payment</small>
                    <strong>Payment instructions</strong>
                  </div>
                </div>
                <p className="client-invoice-detail__side-note">
                  {invoice.paymentInstructions || 'Contact support for payment instructions.'}
                </p>
                <div className="client-invoice-detail__reference">
                  <AlertCircle size={13} />
                  <span>
                    Use <strong>{invoice.number}</strong> as your payment reference.
                  </span>
                </div>
                {supportHref ? (
                  <a
                    className="client-home__btn client-home__btn--text"
                    href={supportHref}
                    {...(supportHref.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    Contact support <ArrowRight size={13} />
                  </a>
                ) : null}
              </section>

              {invoice.canCancelUpgrade ? (
                <section className="client-invoice-detail__side is-danger">
                  <div className="client-invoice-detail__side-head">
                    <X size={16} />
                    <div>
                      <small>Cancel upgrade</small>
                      <strong>Keep your current plan</strong>
                    </div>
                  </div>
                  <p className="client-invoice-detail__side-note">
                    Applied credits on this invoice are refunded if you cancel.
                  </p>
                  <button
                    type="button"
                    className="client-invoice-detail__danger-btn"
                    disabled={cancelling}
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel upgrade invoice
                  </button>
                </section>
              ) : null}

              <section className="client-invoice-detail__side is-help">
                <div className="client-invoice-detail__side-head">
                  <Clock3 size={16} />
                  <div>
                    <small>Next step</small>
                    <strong>After payment</strong>
                  </div>
                </div>
                <p className="client-invoice-detail__side-note">
                  {isUpgrade
                    ? 'Once paid, your plan upgrades and Spirit-Panel resources update automatically.'
                    : 'Once payment is confirmed, this invoice is marked paid and the server provisions automatically.'}
                </p>
              </section>
            </>
          ) : null}

          {invoice.status === 'paid' ? (
            <section className="client-invoice-detail__side is-success">
              <div className="client-invoice-detail__side-head">
                <CheckCircle2 size={16} />
                <div>
                  <small>Complete</small>
                  <strong>{isUpgrade ? 'Upgrade complete' : 'Payment received'}</strong>
                </div>
              </div>
              <p className="client-invoice-detail__side-note">
                {isUpgrade && upgrade
                  ? `Your service is now on ${upgrade.name}.`
                  : 'Your service should be active and ready to manage in Spirit-Panel.'}
              </p>
              {invoice.service ? (
                <Link
                  className="client-home__btn client-home__btn--ghost client-home__btn--sm"
                  to={`/services/${invoice.service.id}`}
                >
                  Manage service <ArrowRight size={13} />
                </Link>
              ) : null}
            </section>
          ) : null}

          {invoice.status === 'cancelled' ? (
            <section className="client-invoice-detail__side is-muted">
              <div className="client-invoice-detail__side-head">
                <X size={16} />
                <div>
                  <small>Closed</small>
                  <strong>Invoice cancelled</strong>
                </div>
              </div>
              <p className="client-invoice-detail__side-note">
                No payment is required for this invoice.
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      <ConfirmModal
        open={payConfirmOpen}
        title={
          willFullyPay
            ? isUpgrade
              ? `Pay & upgrade to ${upgrade?.name}?`
              : `Pay & provision ${invoice.number}?`
            : `Apply credits to ${invoice.number}?`
        }
        description={
          willFullyPay
            ? isUpgrade
              ? `This uses ${money(creditToApply, invoice.currency)} from your balance and upgrades ${invoice.service?.name || 'your service'} to ${upgrade?.name}.`
              : `This uses ${money(creditToApply, invoice.currency)} from your balance and provisions or restores the linked server.`
            : `This applies ${money(creditToApply, invoice.currency)} toward the invoice. ${money(remainingAfterCredit, invoice.currency)} will still be due.`
        }
        confirmLabel={
          willFullyPay
            ? isUpgrade
              ? 'Confirm pay & upgrade'
              : 'Confirm pay & provision'
            : `Apply ${money(creditToApply, invoice.currency)}`
        }
        busyLabel={willFullyPay ? (isUpgrade ? 'Upgrading…' : 'Provisioning…') : 'Applying…'}
        eyebrow={willFullyPay ? 'Payment confirmation' : 'Account credits'}
        tone="warning"
        actionIcon="confirm"
        busy={paying}
        consequences={
          willFullyPay
            ? isUpgrade
              ? [
                  `${money(creditToApply, invoice.currency)} will be deducted from your credit balance.`,
                  `Plan changes to ${upgrade?.name}.`,
                  'Spirit-Panel resources update to the new plan limits.',
                ]
              : [
                  `${money(creditToApply, invoice.currency)} will be deducted from your credit balance.`,
                  'The invoice will be marked paid.',
                  'The linked server will be provisioned or restored.',
                ]
            : [
                `${money(creditToApply, invoice.currency)} will be deducted from your credit balance.`,
                `${money(remainingAfterCredit, invoice.currency)} will remain unpaid on this invoice.`,
              ]
        }
        onCancel={() => !paying && setPayConfirmOpen(false)}
        onConfirm={() => void payWithCredits()}
      />

      <ConfirmModal
        open={cancelOpen}
        title={`Cancel upgrade invoice ${invoice.number}?`}
        description={
          upgrade
            ? `This cancels the upgrade to ${upgrade.name}. Your current plan stays unchanged.`
            : 'This cancels the unpaid upgrade invoice. Your current plan stays unchanged.'
        }
        confirmLabel="Cancel upgrade"
        busyLabel="Cancelling…"
        eyebrow="Cancel upgrade"
        tone="danger"
        actionIcon="cancel"
        busy={cancelling}
        consequences={[
          'The upgrade invoice will be cancelled.',
          'Any credits applied to this invoice will be refunded.',
          'Your current plan and server resources stay as they are.',
        ]}
        onCancel={() => !cancelling && setCancelOpen(false)}
        onConfirm={() => void cancelUpgradeInvoice()}
      />
    </div>
  );
}
