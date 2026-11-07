import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  ReceiptText,
  Search,
  Server,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';

type UpgradeProduct = {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  currency: string;
  cycle: string;
  memoryMb?: number;
  diskMb?: number;
  cpuPercent?: number;
};

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
    product?: { id?: string; name: string; cycle: string; priceCents: number; currency: string };
  } | null;
  paymentInstructions?: string;
  companyName?: string;
  tagline?: string;
  invoiceFooter?: string;
  supportEmail?: string;
  supportUrl?: string;
};

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'cancelled'>('all');

  useEffect(() => {
    void api<Invoice[]>('/client/invoices')
      .then(setInvoices)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load invoices'))
      .finally(() => setLoading(false));
  }, []);

  const visibleInvoices = invoices.filter((invoice) => {
    const matchesFilter = filter === 'all' || invoice.status === filter;
    const matchesQuery = `${invoice.number} ${invoice.description} ${invoice.service?.name ?? ''} ${invoice.upgradeToProduct?.name ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesFilter && matchesQuery;
  });
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === 'unpaid');
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const outstandingCents = unpaidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const paidCents = paidInvoices.reduce((total, invoice) => total + invoice.totalCents, 0);

  return (
    <div className="client-invoices">
      <header className="client-invoices__header">
        <div><span>Billing history</span><h1>Invoices</h1><p>Review charges, track payments, and manage outstanding balances.</p></div>
        <div><ReceiptText size={17} /><span><strong>{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</strong><small>{paidInvoices.length} successfully paid</small></span></div>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <section className="client-invoices-metrics">
        <article><span className="is-blue"><FileText size={16} /></span><div><small>All invoices</small><strong>{invoices.length}</strong><p>Complete billing history</p></div></article>
        <article className={unpaidInvoices.length ? 'has-warning' : ''}><span className="is-amber"><Clock3 size={16} /></span><div><small>Awaiting payment</small><strong>{unpaidInvoices.length}</strong><p>{money(outstandingCents)} outstanding</p></div></article>
        <article><span className="is-green"><CheckCircle2 size={16} /></span><div><small>Paid invoices</small><strong>{paidInvoices.length}</strong><p>{money(paidCents)} processed</p></div></article>
      </section>

      <section className="client-invoices-panel">
        <header>
          <div><span>Invoice library</span><h2>Your billing records</h2></div>
          <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoices or services…" /></label>
          <div>
            {(['all', 'unpaid', 'paid', 'cancelled'] as const).map((option) => (
              <button key={option} type="button" className={filter === option ? 'is-active' : ''} onClick={() => setFilter(option)}>
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </header>

        <div className="client-invoices-list">
          {visibleInvoices.map((invoice) => {
            const overdue = invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
            return (
              <Link key={invoice.id} to={`/invoices/${invoice.id}`} className="client-invoice-row">
                <span className={`client-invoice-row__icon is-${invoice.status}`}><FileText size={16} /></span>
                <span className="client-invoice-row__identity">
                  <small>{invoice.number}</small>
                  <strong>{invoice.service?.name || invoice.description || 'Hosting invoice'}</strong>
                  <em>
                    {invoice.isUpgrade && invoice.upgradeToProduct
                      ? `Upgrade to ${invoice.upgradeToProduct.name}`
                      : invoice.description}
                  </em>
                </span>
                <span className="client-invoice-row__date">
                  <CalendarDays size={13} />
                  <span><small>{invoice.status === 'paid' ? 'Paid' : overdue ? 'Overdue' : 'Due date'}</small><strong>{new Date(invoice.paidAt || invoice.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
                </span>
                <span className={statusBadge(invoice.status)}>{overdue ? 'overdue' : invoice.status}</span>
                <span className="client-invoice-row__amount"><strong>{money(invoice.totalCents, invoice.currency)}</strong><small>{invoice.currency}</small></span>
                <ChevronRight size={15} />
              </Link>
            );
          })}
          {!loading && !visibleInvoices.length && (
            <div className="client-invoices-empty">
              <ReceiptText size={28} />
              <h3>{invoices.length ? 'No matching invoices' : 'No invoices yet'}</h3>
              <p>{invoices.length ? 'Try another search or status filter.' : 'Invoices will appear here after you place a hosting order.'}</p>
              {!invoices.length && <Link to="/game-hosting">Browse hosting <ArrowRight size={13} /></Link>}
            </div>
          )}
          {loading && <div className="client-invoices-empty"><ReceiptText size={28} /><h3>Loading invoices…</h3></div>}
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
      <div className="ds-stack">
        <Link to="/invoices" style={{ color: 'var(--accent-hover)' }}>
          ← Back to invoices
        </Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }
  if (!invoice) return <div className="ds-muted">Loading…</div>;

  const creditBalance = user?.creditBalanceCents ?? 0;
  const canPayCredits = invoice.status === 'unpaid' && invoice.totalCents > 0 && creditBalance > 0;
  const creditToApply = Math.min(creditBalance, invoice.totalCents);
  const remainingAfterCredit = Math.max(0, invoice.totalCents - creditToApply);
  const willFullyPay = canPayCredits && remainingAfterCredit === 0;
  const subtotalCents =
    invoice.subtotalCents ??
    invoice.totalCents + (invoice.discountCents ?? 0) + (invoice.creditAppliedCents ?? 0);
  const isOverdue = invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
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
  const currentPlan = invoice.service?.product?.name;

  return (
    <div className="invoice-detail-v2">
      <Link to="/invoices" className="invoice-detail-v2__back"><ArrowLeft size={14} /> All invoices</Link>

      <header className="invoice-detail-v2__header">
        <div>
          <span>{isUpgrade ? 'Plan upgrade' : 'Invoice details'}</span>
          <h1>{invoice.number}</h1>
          <p>
            {isUpgrade && upgrade
              ? `Upgrading ${invoice.service?.name || 'service'} to ${upgrade.name}`
              : `Issued by ${invoice.companyName || 'SpiritHost'}`}
          </p>
        </div>
        <span className={`invoice-detail-v2__status is-${isOverdue ? 'overdue' : invoice.status}`}>
          {invoice.status === 'paid' ? <CheckCircle2 size={15} /> : isOverdue ? <AlertCircle size={15} /> : <Clock3 size={15} />}
          <span><strong>{isOverdue ? 'Payment overdue' : invoice.status === 'paid' ? 'Payment received' : invoice.status}</strong><small>{invoice.status === 'paid' && invoice.paidAt ? `Paid ${new Date(invoice.paidAt).toLocaleDateString()}` : `Due ${new Date(invoice.dueAt).toLocaleDateString()}`}</small></span>
        </span>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <div className="invoice-detail-v2-layout">
        <main className="invoice-document">
          <header>
            <div><span className="invoice-document__logo"><ReceiptText size={20} /></span><span><strong>{invoice.companyName || 'SpiritHost'}</strong><small>{invoice.tagline || 'Hosting & infrastructure'}</small></span></div>
            <div><small>Invoice</small><strong>{invoice.number}</strong></div>
          </header>

          <section className="invoice-document__meta">
            <div><small>Issued</small><strong>{new Date(invoice.createdAt || invoice.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
            <div><small>Payment due</small><strong>{new Date(invoice.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
            <div><small>Currency</small><strong>{invoice.currency}</strong></div>
            <div><small>Status</small><span className={statusBadge(invoice.status)}>{isOverdue ? 'overdue' : invoice.status}</span></div>
          </section>

          {isUpgrade && upgrade && (
            <section className="invoice-upgrade-banner">
              <TrendingUp size={16} />
              <div>
                <strong>Plan upgrade</strong>
                <p>
                  {currentPlan || 'Current plan'}
                  {' → '}
                  <em>{upgrade.name}</em>
                  {typeof upgrade.memoryMb === 'number' && typeof upgrade.cpuPercent === 'number' && typeof upgrade.diskMb === 'number' && (
                    <> · {Math.round(upgrade.memoryMb / 1024)} GB RAM · {upgrade.cpuPercent}% CPU · {Math.round(upgrade.diskMb / 1024)} GB disk</>
                  )}
                </p>
              </div>
            </section>
          )}

          <section className="invoice-document__items">
            <header><span>Description</span><span>Billing</span><span>Amount</span></header>
            <article>
              <span className="invoice-document__item-icon">{isUpgrade ? <TrendingUp size={15} /> : <Server size={15} />}</span>
              <div>
                <strong>
                  {isUpgrade && upgrade
                    ? `Upgrade to ${upgrade.name}`
                    : invoice.service?.name || 'Hosting service'}
                </strong>
                <small>
                  {isUpgrade && upgrade
                    ? `${invoice.service?.name || 'Service'}${currentPlan ? ` · from ${currentPlan}` : ''} · ${upgrade.cycle}`
                    : invoice.description || invoice.service?.product?.name || 'Managed game hosting'}
                </small>
              </div>
              <span>{isUpgrade ? 'Upgrade' : invoice.service?.product?.cycle || 'One-time'}</span>
              <strong>{money(subtotalCents, invoice.currency)}</strong>
            </article>
          </section>

          <section className="invoice-document__totals">
            <div><span>Subtotal</span><strong>{money(subtotalCents, invoice.currency)}</strong></div>
            {(invoice.discountCents ?? 0) > 0 && <div className="is-saving"><span>Coupon discount {invoice.couponCode && <em>{invoice.couponCode}</em>}</span><strong>−{money(invoice.discountCents!, invoice.currency)}</strong></div>}
            {(invoice.creditAppliedCents ?? 0) > 0 && <div className="is-saving"><span>Account credits applied</span><strong>−{money(invoice.creditAppliedCents!, invoice.currency)}</strong></div>}
            <div className="invoice-document__total"><span>{invoice.status === 'paid' ? 'Invoice total' : 'Amount due'}</span><strong>{money(invoice.totalCents, invoice.currency)}</strong></div>
          </section>

          <footer>
            <ShieldCheck size={14} />
            <span>
              <strong>{invoice.companyName || 'SpiritHost'} billing</strong>
              <small>{footerNote}</small>
              {supportHref && (
                <small>
                  <a href={supportHref} {...(supportHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    Contact support
                  </a>
                </small>
              )}
            </span>
          </footer>
        </main>

        <aside className="invoice-detail-v2-sidebar">
          <section className="invoice-balance-card">
            <span>{invoice.status === 'paid' ? 'Amount paid' : 'Outstanding balance'}</span>
            <strong>{money(invoice.totalCents, invoice.currency)}</strong>
            <small>{invoice.status === 'paid' ? 'No further action is required.' : isOverdue ? 'This invoice is now overdue.' : `Due by ${new Date(invoice.dueAt).toLocaleDateString()}`}</small>
            {invoice.service && <Link to={`/services/${invoice.service.id}`}><Server size={13} /> View service <ArrowRight size={13} /></Link>}
          </section>

          {invoice.status === 'unpaid' && (
            <>
              <section className="invoice-credit-card">
                <header><span><WalletCards size={15} /></span><div><strong>Pay with credits</strong><small>{money(creditBalance, invoice.currency)} available</small></div></header>
                <div><span style={{ width: `${invoice.totalCents ? Math.min(100, (creditToApply / invoice.totalCents) * 100) : 0}%` }} /></div>
                <p>
                  {canPayCredits
                    ? `${money(creditToApply, invoice.currency)} will be applied${remainingAfterCredit ? `, leaving ${money(remainingAfterCredit, invoice.currency)} due` : isUpgrade ? ` and upgrade to ${upgrade?.name}` : ' and fully cover this invoice'}.`
                    : 'You do not currently have credits available for this invoice.'}
                </p>
                <button type="button" disabled={!canPayCredits || paying} onClick={() => setPayConfirmOpen(true)}>
                  {paying ? 'Applying credits…' : willFullyPay ? (isUpgrade ? 'Pay & upgrade' : 'Pay & provision') : 'Apply account credits'} <ArrowRight size={13} />
                </button>
              </section>

              <section className="invoice-payment-card">
                <header><span><CircleDollarSign size={15} /></span><div><strong>Manual payment</strong><small>Payment instructions</small></div></header>
                <p>{invoice.paymentInstructions || 'Contact support for payment instructions.'}</p>
                <div><AlertCircle size={13} /><span>Use <strong>{invoice.number}</strong> as your payment reference.</span></div>
                {supportHref && (
                  <p style={{ marginTop: '0.65rem' }}>
                    <a href={supportHref} {...(supportHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                      Need help? Contact support
                    </a>
                  </p>
                )}
              </section>

              {invoice.canCancelUpgrade && (
                <section className="invoice-cancel-upgrade-card">
                  <header>
                    <X size={15} />
                    <div>
                      <strong>Cancel this upgrade</strong>
                      <small>Keep your current plan. Applied credits on this invoice are refunded.</small>
                    </div>
                  </header>
                  <button type="button" disabled={cancelling} onClick={() => setCancelOpen(true)}>
                    Cancel upgrade invoice
                  </button>
                </section>
              )}

              <section className="invoice-next-step">
                <Clock3 size={14} />
                <span>
                  <strong>What happens next?</strong>
                  <small>
                    {isUpgrade
                      ? 'Once paid, your plan upgrades and Spirit-Panel resources update automatically.'
                      : 'Once payment is confirmed, your invoice is marked paid and the server provisions automatically.'}
                  </small>
                </span>
              </section>
            </>
          )}

          {invoice.status === 'paid' && (
            <section className="invoice-paid-card">
              <span><CheckCircle2 size={22} /></span>
              <h3>{isUpgrade ? 'Upgrade complete' : 'Payment complete'}</h3>
              <p>
                {isUpgrade && upgrade
                  ? `Your service is now on ${upgrade.name}.`
                  : 'Your service should be active and ready to manage in Spirit-Panel.'}
              </p>
              {invoice.service && <Link to={`/services/${invoice.service.id}`}>Manage service <ArrowRight size={13} /></Link>}
            </section>
          )}

          {invoice.status === 'cancelled' && (
            <section className="invoice-cancelled-card"><X size={18} /><span><strong>Invoice cancelled</strong><small>No payment is required for this invoice.</small></span></section>
          )}
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
