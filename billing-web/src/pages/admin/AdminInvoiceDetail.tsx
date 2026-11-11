import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Cpu,
  FileText,
  HardDrive,
  MemoryStick,
  Receipt,
  Server,
  ShieldCheck,
  Tag,
  Trash2,
  TrendingUp,
  UserRound,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
import { CategoryMark } from '../../lib/icons';
import { ConfirmModal } from '../../components/ConfirmModal';

type InvoiceStatus = 'unpaid' | 'paid' | 'cancelled';

type AdminInvoiceDetail = {
  id: string;
  number: string;
  status: InvoiceStatus;
  subtotalCents: number;
  discountCents: number;
  creditAppliedCents: number;
  totalCents: number;
  currency: string;
  description: string;
  couponCode: string | null;
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
  isUpgrade?: boolean;
  companyName?: string;
  paymentInstructions?: string;
  upgradeToProduct?: {
    id: string;
    name: string;
    priceCents: number;
    currency: string;
    cycle: string;
    memoryMb: number;
    diskMb: number;
    cpuPercent: number;
  } | null;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl?: string | null;
    creditBalanceCents: number;
  };
  paidBy: { id: string; username: string } | null;
  service: {
    id: string;
    name: string;
    status: string;
    panelServerId: string | null;
    panelEggName?: string | null;
    memoryMb?: number | null;
    diskMb?: number | null;
    cpuPercent?: number | null;
    priceCents?: number | null;
    currency?: string | null;
    cycle?: string | null;
    nextDueAt?: string | null;
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
      category: {
        id: string;
        name: string;
        color: string;
        icon: string;
        logoUrl: string | null;
      } | null;
    };
  } | null;
};

function displayName(user: AdminInvoiceDetail['user']) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
}

function initials(user: AdminInvoiceDetail['user']) {
  const a = (user.firstName || user.username || '?').slice(0, 1);
  const b = (user.lastName || '').slice(0, 1);
  return (a + b).toUpperCase();
}

function ClientAvatar({ user, size = '2.15rem' }: { user: AdminInvoiceDetail['user']; size?: string }) {
  const [broken, setBroken] = useState(false);
  const url = user.avatarUrl?.trim();
  const ok = Boolean(url && /^(https?:\/\/|\/)/i.test(url) && !broken);

  if (ok) {
    return (
      <img
        src={url!}
        alt=""
        className="admin-user-avatar ops-inv__avatar-img"
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span className="ops-inv__avatar" style={{ width: size, height: size }} aria-hidden>
      {initials(user)}
    </span>
  );
}

function invoiceKind(invoice: AdminInvoiceDetail) {
  if (invoice.isUpgrade || invoice.upgradeToProduct) return 'Upgrade';
  const desc = (invoice.description || '').toLowerCase();
  if (desc.includes('renew')) return 'Renewal';
  if (desc.includes('resource')) return 'Resource';
  if (desc.includes('upgrade')) return 'Upgrade';
  return 'Invoice';
}

function chargeTitle(invoice: AdminInvoiceDetail, kind: string) {
  if ((invoice.isUpgrade || invoice.upgradeToProduct) && invoice.upgradeToProduct) {
    return `Upgrade to ${invoice.upgradeToProduct.name}`;
  }
  if (invoice.description?.trim()) return invoice.description.trim();
  if (kind === 'Renewal' && invoice.service) return `Renewal · ${invoice.service.name}`;
  return invoice.service?.name || 'Hosting charge';
}

function chargeSummary(invoice: AdminInvoiceDetail, kind: string) {
  const service = invoice.service;
  if (!service) return 'Standalone billing charge with no linked service.';
  const plan = service.product.name;
  const game = service.product.category?.name || service.panelEggName || 'Uncategorized';
  if (kind === 'Upgrade' && invoice.upgradeToProduct) {
    return `${service.name} · ${game} · from ${plan} to ${invoice.upgradeToProduct.name}`;
  }
  if (kind === 'Renewal') {
    return `${service.name} · ${game} · ${plan} (${service.cycle || service.product.cycle})`;
  }
  if (kind === 'Resource') {
    return `${service.name} · ${game} · resource change on ${plan}`;
  }
  return `${service.name} · ${game} · ${plan}`;
}

function formatDate(value: string, withTime = false) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function formatMb(value: number) {
  if (value <= 0) return 'Unlimited';
  if (value >= 1024) return `${Math.round(value / 1024)} GB`;
  return `${value} MB`;
}

function dueRelative(dueAt: string, status: InvoiceStatus) {
  if (status !== 'unpaid') return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days}d`;
}

export function AdminInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const fullAdmin = isFullAdmin(currentUser?.role);
  const [invoice, setInvoice] = useState<AdminInvoiceDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function load() {
    if (!id) return;
    setError('');
    try {
      setInvoice(await api<AdminInvoiceDetail>(`/admin/invoices/${id}`));
    } catch (err) {
      setInvoice(null);
      setError(err instanceof ApiError ? err.message : 'Invoice not found');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function markPaid() {
    if (!invoice) return;
    const currentPassword = window.prompt('Enter your admin password to mark this invoice paid:');
    if (!currentPassword) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ panelServerId: string | null }>(
        `/admin/invoices/${invoice.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: 'paid', currentPassword }) },
      );
      setMessage(
        result.panelServerId
          ? invoice.isUpgrade
            ? `${invoice.number} paid and the plan was upgraded.`
            : `${invoice.number} paid and the server was provisioned.`
          : `${invoice.number} marked paid.`,
      );
      setPayOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark invoice paid');
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvoice() {
    if (!invoice) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/invoices/${invoice.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      setMessage(`${invoice.number} cancelled.`);
      setCancelOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel invoice');
    } finally {
      setBusy(false);
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/invoices/${invoice.id}`, { method: 'DELETE' });
      navigate('/admin/invoices', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete invoice');
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function copyNumber() {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy invoice number');
    }
  }

  if (error && !invoice) {
    return (
      <div className="ops-user ops-inv">
        <Link to="/admin/invoices" className="ops-user__back">
          <ArrowLeft size={14} /> Ledger
        </Link>
        <div className="ops-user__alert is-error">{error}</div>
      </div>
    );
  }

  if (!invoice) return <div className="ds-muted">Loading…</div>;

  const overdue = invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
  const kind = invoiceKind(invoice);
  const isUpgrade = Boolean(invoice.isUpgrade && invoice.upgradeToProduct);
  const upgrade = invoice.upgradeToProduct;
  const category = invoice.service?.product.category;
  const dueHint = dueRelative(invoice.dueAt, invoice.status);
  const settledCents = invoice.totalCents + (invoice.creditAppliedCents || 0);
  const statusLabel = overdue ? 'overdue' : invoice.status;
  const title = chargeTitle(invoice, kind);
  const summary = chargeSummary(invoice, kind);
  const planCycle = invoice.service?.cycle || invoice.service?.product.cycle || null;
  const planPriceCents = invoice.service?.priceCents ?? invoice.service?.product.priceCents ?? null;
  const planCurrency = invoice.service?.currency || invoice.service?.product.currency || invoice.currency;
  const memoryMb = invoice.service?.memoryMb ?? invoice.service?.product.memoryMb ?? null;
  const diskMb = invoice.service?.diskMb ?? invoice.service?.product.diskMb ?? null;
  const cpuPercent = invoice.service?.cpuPercent ?? invoice.service?.product.cpuPercent ?? null;

  return (
    <div className="ops-user ops-inv">
      <Link to="/admin/invoices" className="ops-user__back">
        <ArrowLeft size={14} /> Ledger
      </Link>

      {error ? <div className="ops-user__alert is-error">{error}</div> : null}
      {message ? <div className="ops-user__alert is-info">{message}</div> : null}

      <header className="ops-user__mast">
        <div className="ops-user__identity">
          <span
            className={`ops-svc__mark-wrap ${
              invoice.status === 'paid' ? 'is-ok' : overdue || invoice.status === 'cancelled' ? 'is-bad' : 'is-warn'
            }`}
          >
            {invoice.service ? (
              <CategoryMark
                icon={category?.icon || 'server'}
                logoUrl={category?.logoUrl}
                color={category?.color || '#38bdf8'}
                size={52}
                className="ops-svc__mark"
              />
            ) : (
              <span className="ops-inv__mark-fallback" aria-hidden>
                <Receipt size={22} />
              </span>
            )}
          </span>
          <div className="ops-user__identity-copy">
            <span>{kind}</span>
            <h1>{invoice.number}</h1>
            <p>
              {title}
              <span aria-hidden="true"> · </span>
              {displayName(invoice.user)}
            </p>
            <div className="ops-user__badges">
              <span className={`ops-svc__status-badge ${statusBadge(statusLabel)}`}>
                {statusLabel.replaceAll('_', ' ')}
              </span>
              <span className={`ops-inv__kind-pill is-${kind.toLowerCase()}`}>{kind}</span>
              {invoice.couponCode ? (
                <span className="ops-inv__kind-pill is-coupon">
                  <Tag size={11} /> {invoice.couponCode}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ops-user__actions">
          <button type="button" className="ops-user__btn is-ghost" disabled={busy} onClick={() => void copyNumber()}>
            <Copy size={14} /> {copied ? 'Copied' : 'Copy #'}
          </button>
          {invoice.status === 'paid' ? (
            <span className="ops-inv__complete">
              <ShieldCheck size={14} aria-hidden /> Paid
            </span>
          ) : null}
          {invoice.status === 'cancelled' ? (
            <span className="ops-inv__voided">
              <XCircle size={14} aria-hidden /> Cancelled
            </span>
          ) : null}
        </div>
      </header>

      {invoice.status === 'unpaid' ? (
        <div className="ops-svc__attention" role="status">
          <div className={`ops-svc__attention-item ops-inv__attention ${overdue ? 'is-bad' : 'is-warn'}`}>
            {overdue ? <Clock3 size={15} aria-hidden /> : <CircleDollarSign size={15} aria-hidden />}
            <div>
              <strong>
                {overdue ? 'Overdue balance' : 'Awaiting payment'} · {money(invoice.totalCents, invoice.currency)}
              </strong>
              <span>
                {overdue
                  ? `Due ${formatShortDate(invoice.dueAt)}${dueHint ? ` · ${dueHint}` : ''}. Collect or cancel before enforcement.`
                  : isUpgrade
                    ? 'Paying this invoice upgrades the linked service plan and applies new limits.'
                    : invoice.service
                      ? 'Paying this invoice can provision or restore the linked Spirit-Panel server.'
                      : 'No linked service — mark paid only confirms the balance.'}
              </span>
            </div>
            <div className="ops-inv__attention-actions">
              {fullAdmin ? (
                <button type="button" className="ops-user__btn is-ok" disabled={busy} onClick={() => setPayOpen(true)}>
                  <CheckCircle2 size={14} /> {isUpgrade ? 'Pay & upgrade' : 'Mark paid'}
                </button>
              ) : null}
              <button type="button" className="ops-user__btn is-ghost" disabled={busy} onClick={() => setCancelOpen(true)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="ops-user__metrics" aria-label="Invoice metrics">
        <div className={`ops-users__chip ops-user__metric${invoice.status === 'unpaid' ? ' is-warn' : ''}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            <CircleDollarSign size={15} />
          </span>
          <div>
            <small>{invoice.status === 'unpaid' ? 'Amount due' : 'Total'}</small>
            <strong className="ops-svc__metric-stack">
              <span>{money(invoice.totalCents, invoice.currency)}</span>
              {invoice.discountCents > 0 || invoice.creditAppliedCents > 0 ? (
                <em>
                  {invoice.discountCents > 0 ? `−${money(invoice.discountCents, invoice.currency)} disc` : null}
                  {invoice.discountCents > 0 && invoice.creditAppliedCents > 0 ? ' · ' : null}
                  {invoice.creditAppliedCents > 0
                    ? `−${money(invoice.creditAppliedCents, invoice.currency)} credit`
                    : null}
                </em>
              ) : (
                <em>{invoice.currency}</em>
              )}
            </strong>
          </div>
        </div>
        <div
          className={`ops-users__chip ops-user__metric${
            overdue ? ' is-warn' : invoice.status === 'paid' ? ' is-ok' : ''
          }`}
        >
          <span className="ops-user__metric-icon" aria-hidden>
            {invoice.status === 'paid' ? (
              <CheckCircle2 size={15} />
            ) : overdue ? (
              <Clock3 size={15} />
            ) : (
              <FileText size={15} />
            )}
          </span>
          <div>
            <small>Status</small>
            <strong>{statusLabel}</strong>
          </div>
        </div>
        <div className={`ops-users__chip ops-user__metric${overdue ? ' is-warn' : ''}`}>
          <span className="ops-user__metric-icon" aria-hidden>
            <CalendarDays size={15} />
          </span>
          <div>
            <small>{invoice.status === 'paid' ? 'Paid' : 'Due'}</small>
            <strong className="ops-svc__metric-stack">
              <span>
                {invoice.status === 'paid' && invoice.paidAt
                  ? formatShortDate(invoice.paidAt)
                  : formatShortDate(invoice.dueAt)}
              </span>
              {dueHint ? <em>{dueHint}</em> : invoice.status === 'paid' && invoice.paidBy ? (
                <em>@{invoice.paidBy.username}</em>
              ) : null}
            </strong>
          </div>
        </div>
        <div className="ops-users__chip ops-user__metric">
          <span className="ops-user__metric-icon" aria-hidden>
            {isUpgrade ? <TrendingUp size={15} /> : <Receipt size={15} />}
          </span>
          <div>
            <small>Kind</small>
            <strong className="ops-svc__metric-stack">
              <span>{kind}</span>
              <em>{invoice.companyName || 'SpiritHost'}</em>
            </strong>
          </div>
        </div>
      </section>

      <div className="ops-inv__desk">
        <div className="ops-inv__main">
          <section className="ops-user__panel">
            <header className="ops-inv__doc-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <Receipt size={15} />
              </span>
              <div>
                <span>Document</span>
                <h2>Charge details</h2>
              </div>
            </header>
            <div className="ops-inv__doc-meta ops-inv__doc-meta--row">
              <span>
                <small>Number</small>
                <strong>{invoice.number}</strong>
              </span>
              <span>
                <small>Issued</small>
                <strong>{formatShortDate(invoice.createdAt)}</strong>
              </span>
              <span>
                <small>Due</small>
                <strong>{formatShortDate(invoice.dueAt)}</strong>
              </span>
              <span>
                <small>Currency</small>
                <strong>{invoice.currency}</strong>
              </span>
            </div>

            <div className={`ops-inv__purpose is-${kind.toLowerCase()}`}>
              <div className="ops-inv__purpose-top">
                {invoice.service ? (
                  <CategoryMark
                    icon={category?.icon || 'server'}
                    logoUrl={category?.logoUrl}
                    color={category?.color || '#38bdf8'}
                    size={42}
                    className="ops-services__mark"
                  />
                ) : (
                  <span className="ops-inv__line-icon" aria-hidden>
                    <Receipt size={16} />
                  </span>
                )}
                <div>
                  <span className={`ops-inv__kind-pill is-${kind.toLowerCase()}`}>{kind}</span>
                  <strong>{title}</strong>
                  <small>{summary}</small>
                </div>
              </div>

              <div className="ops-inv__purpose-grid">
                <Link to={`/admin/users/${invoice.user.id}`} className="ops-inv__purpose-cell is-link">
                  <small>Billed to</small>
                  <strong>{displayName(invoice.user)}</strong>
                  <em>@{invoice.user.username}</em>
                </Link>
                {invoice.service ? (
                  <Link to={`/admin/services/${invoice.service.id}`} className="ops-inv__purpose-cell is-link">
                    <small>Service</small>
                    <strong>{invoice.service.name}</strong>
                    <em>
                      {category?.name || 'Uncategorized'} · {invoice.service.status.replaceAll('_', ' ')}
                    </em>
                  </Link>
                ) : (
                  <div className="ops-inv__purpose-cell">
                    <small>Service</small>
                    <strong>Unlinked</strong>
                    <em>No fleet server</em>
                  </div>
                )}
                <div className="ops-inv__purpose-cell">
                  <small>Plan</small>
                  <strong>{invoice.service?.product.name || '—'}</strong>
                  <em>
                    {planPriceCents != null
                      ? `${money(planPriceCents, planCurrency)}${planCycle ? `/${planCycle}` : ''}`
                      : 'Custom'}
                  </em>
                </div>
                <div className="ops-inv__purpose-cell">
                  <small>Coverage</small>
                  <strong>
                    {formatShortDate(invoice.createdAt)} → {formatShortDate(invoice.dueAt)}
                  </strong>
                  <em>{dueHint || (invoice.status === 'paid' ? 'Settled' : 'Billing window')}</em>
                </div>
              </div>

              {memoryMb != null || cpuPercent != null || diskMb != null ? (
                <div className="ops-inv__purpose-specs">
                  {memoryMb != null ? (
                    <span>
                      <MemoryStick size={12} /> {formatMb(memoryMb)}
                    </span>
                  ) : null}
                  {cpuPercent != null ? (
                    <span>
                      <Cpu size={12} /> {cpuPercent <= 0 ? 'Unlimited CPU' : `${cpuPercent}% CPU`}
                    </span>
                  ) : null}
                  {diskMb != null ? (
                    <span>
                      <HardDrive size={12} /> {formatMb(diskMb)} disk
                    </span>
                  ) : null}
                  {invoice.service?.nextDueAt ? (
                    <span>
                      <CalendarDays size={12} /> Next renewal {formatShortDate(invoice.service.nextDueAt)}
                    </span>
                  ) : null}
                  {invoice.service?.panelServerId ? (
                    <span>
                      <Server size={12} /> Panel linked
                    </span>
                  ) : invoice.service ? (
                    <span>
                      <Server size={12} /> Not provisioned
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isUpgrade && upgrade ? (
              <div className="ops-inv__compare">
                <article>
                  <small>Current</small>
                  <strong>{invoice.service?.product.name || 'Current plan'}</strong>
                  <em>
                    {money(
                      invoice.service?.product.priceCents || 0,
                      invoice.service?.product.currency || invoice.currency,
                    )}
                    /{invoice.service?.product.cycle || 'monthly'}
                  </em>
                </article>
                <span className="ops-inv__compare-arrow" aria-hidden>
                  <ArrowRight size={16} />
                </span>
                <article className="is-next">
                  <small>Upgrade to</small>
                  <strong>{upgrade.name}</strong>
                  <div className="ops-inv__compare-specs">
                    <span>
                      <MemoryStick size={12} /> {formatMb(upgrade.memoryMb)}
                    </span>
                    <span>
                      <Cpu size={12} /> {upgrade.cpuPercent <= 0 ? '∞' : `${upgrade.cpuPercent}%`}
                    </span>
                    <span>
                      <HardDrive size={12} /> {formatMb(upgrade.diskMb)}
                    </span>
                  </div>
                  <em>
                    {money(upgrade.priceCents, upgrade.currency)}/{upgrade.cycle}
                  </em>
                </article>
              </div>
            ) : null}

            <div className="ops-inv__lines">
              <div className="ops-inv__lines-head" aria-hidden>
                <span>Description</span>
                <span>Type</span>
                <span className="is-end">Amount</span>
              </div>
              <article className="ops-inv__line">
                <span className="ops-inv__line-icon" aria-hidden>
                  {isUpgrade || kind === 'Upgrade' ? <TrendingUp size={14} /> : <Server size={14} />}
                </span>
                <div>
                  <strong>{title}</strong>
                  <small>
                    {invoice.service
                      ? `${invoice.service.name} · ${invoice.service.product.name}`
                      : invoice.description || 'Billing line item'}
                  </small>
                </div>
                <span className="ops-inv__line-type">
                  {kind === 'Invoice' ? planCycle || 'One-time' : kind}
                </span>
                <strong className="is-end">{money(invoice.subtotalCents, invoice.currency)}</strong>
              </article>
            </div>

            <div className="ops-inv__settle">
              <div className="ops-inv__totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{money(invoice.subtotalCents, invoice.currency)}</strong>
                </div>
                {invoice.discountCents > 0 ? (
                  <div className="is-saving">
                    <span>
                      Discount
                      {invoice.couponCode ? <em>{invoice.couponCode}</em> : null}
                    </span>
                    <strong>−{money(invoice.discountCents, invoice.currency)}</strong>
                  </div>
                ) : null}
                {invoice.creditAppliedCents > 0 ? (
                  <div className="is-saving">
                    <span>Credits applied</span>
                    <strong>−{money(invoice.creditAppliedCents, invoice.currency)}</strong>
                  </div>
                ) : null}
                <div className="is-total">
                  <span>
                    {invoice.status === 'unpaid' ? 'Amount due' : 'Invoice total'}
                    {invoice.status === 'unpaid' && dueHint ? <em>{dueHint}</em> : null}
                  </span>
                  <strong>{money(invoice.totalCents, invoice.currency)}</strong>
                </div>
                {invoice.status === 'paid' && invoice.creditAppliedCents > 0 ? (
                  <div>
                    <span>Settled value</span>
                    <strong>{money(settledCents, invoice.currency)}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            {invoice.status === 'unpaid' && invoice.paymentInstructions ? (
              <div className="ops-inv__pay-note">
                <CircleDollarSign size={14} aria-hidden />
                <div>
                  <strong>Payment instructions</strong>
                  <span>{invoice.paymentInstructions}</span>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="ops-inv__aside">
          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <UserRound size={15} />
              </span>
              <div>
                <span>Account</span>
                <h2>Client</h2>
              </div>
            </header>
            <Link
              to={`/admin/users/${invoice.user.id}`}
              className="ops-inv__person is-link"
              title={`Open ${displayName(invoice.user)}`}
            >
              <ClientAvatar user={invoice.user} size="2.35rem" />
              <div>
                <strong>{displayName(invoice.user)}</strong>
                <small>@{invoice.user.username}</small>
              </div>
              <ChevronRight size={15} aria-hidden />
            </Link>
            <dl className="ops-user__facts">
              <div>
                <dt>Email</dt>
                <dd className="is-wrap">{invoice.user.email}</dd>
              </div>
              <div>
                <dt>Credits</dt>
                <dd>
                  <span className="ops-inv__credit">
                    <WalletCards size={12} /> {money(invoice.user.creditBalanceCents, 'GBP')}
                  </span>
                </dd>
              </div>
              {invoice.paidBy ? (
                <div>
                  <dt>Confirmed by</dt>
                  <dd>@{invoice.paidBy.username}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Server size={15} />
              </span>
              <div>
                <span>Fleet</span>
                <h2>{invoice.service ? 'Service' : 'Unlinked'}</h2>
              </div>
            </header>
            {invoice.service ? (
              <>
                <Link
                  to={`/admin/services/${invoice.service.id}`}
                  className="ops-inv__person is-link"
                  title={`Open ${invoice.service.name}`}
                >
                  <CategoryMark
                    icon={category?.icon || 'server'}
                    logoUrl={category?.logoUrl}
                    color={category?.color || '#38bdf8'}
                    size={34}
                    className="ops-services__mark"
                  />
                  <div>
                    <strong>{invoice.service.name}</strong>
                    <small>
                      {category?.name || 'Uncategorized'} · {invoice.service.product.name}
                    </small>
                  </div>
                  <ChevronRight size={15} aria-hidden />
                </Link>
                <dl className="ops-user__facts">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <em className={`ops-svc__status-badge ${statusBadge(invoice.service.status)}`}>
                        {invoice.service.status.replaceAll('_', ' ')}
                      </em>
                    </dd>
                  </div>
                  <div>
                    <dt>Panel</dt>
                    <dd>{invoice.service.panelServerId ? 'Linked' : 'Missing'}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="ops-inv__empty">
                <strong>No linked service</strong>
                <span>Standalone billing charge with no fleet server.</span>
              </div>
            )}
          </section>

          <section className="ops-user__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <CalendarDays size={15} />
              </span>
              <div>
                <span>Timing</span>
                <h2>Lifecycle</h2>
              </div>
            </header>
            <ol className="ops-inv__timeline">
              <li className="is-done">
                <span>Issued</span>
                <strong>{formatDate(invoice.createdAt)}</strong>
              </li>
              <li className={invoice.status !== 'unpaid' || overdue ? 'is-done' : 'is-current'}>
                <span>{overdue ? 'Overdue' : 'Due'}</span>
                <strong>
                  {formatDate(invoice.dueAt)}
                  {dueHint ? <em> · {dueHint}</em> : null}
                </strong>
              </li>
              <li className={invoice.status === 'paid' ? 'is-done' : invoice.status === 'cancelled' ? 'is-cancelled' : ''}>
                <span>{invoice.status === 'cancelled' ? 'Cancelled' : 'Paid'}</span>
                <strong>
                  {invoice.status === 'paid' && invoice.paidAt
                    ? formatDate(invoice.paidAt, true)
                    : invoice.status === 'cancelled'
                      ? 'Voided'
                      : 'Pending'}
                </strong>
              </li>
            </ol>
            {invoice.status === 'paid' ? (
              <div className="ops-inv__complete">
                <ShieldCheck size={14} aria-hidden /> Payment confirmed
              </div>
            ) : null}
          </section>

          {fullAdmin ? (
            <section className="ops-user__panel ops-user__panel--danger">
              <header>
                <span className="ops-user__panel-icon" aria-hidden>
                  <Trash2 size={15} />
                </span>
                <div>
                  <span>Danger</span>
                  <h2>Delete invoice</h2>
                </div>
              </header>
              <p className="ops-user__hint">
                Removes this invoice from the ledger. Unpaid invoices refund applied credits first.
              </p>
              <button
                type="button"
                className="ops-user__btn is-danger"
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} /> Delete invoice
              </button>
            </section>
          ) : null}
        </aside>
      </div>

      <ConfirmModal
        open={payOpen}
        title={isUpgrade ? `Pay & upgrade ${invoice.number}?` : `Mark ${invoice.number} paid?`}
        description={
          isUpgrade
            ? `This confirms payment and upgrades ${invoice.service?.name || 'the service'} to ${upgrade?.name}.`
            : invoice.service
              ? 'This confirms payment and provisions or restores the linked server in Spirit-Panel.'
              : 'This marks the invoice paid without provisioning.'
        }
        confirmLabel={isUpgrade ? 'Confirm pay & upgrade' : 'Confirm pay & provision'}
        busyLabel={isUpgrade ? 'Upgrading…' : 'Provisioning…'}
        eyebrow="Payment confirmation"
        tone="warning"
        actionIcon="confirm"
        requireText={invoice.number}
        busy={busy}
        consequences={
          isUpgrade
            ? [
                'The invoice will be marked paid.',
                `Plan upgrades to ${upgrade?.name}.`,
                'Panel resources will be updated.',
              ]
            : [
                'The invoice will be marked paid.',
                invoice.service
                  ? 'The linked server will be provisioned or restored.'
                  : 'No server will be provisioned.',
              ]
        }
        onCancel={() => !busy && setPayOpen(false)}
        onConfirm={() => void markPaid()}
      />

      <ConfirmModal
        open={cancelOpen}
        title={`Cancel ${invoice.number}?`}
        description="This cancels the unpaid invoice and refunds any applied credits."
        confirmLabel="Cancel invoice"
        busyLabel="Cancelling…"
        tone="danger"
        actionIcon="cancel"
        busy={busy}
        consequences={[
          'The invoice will no longer accept payment.',
          'Applied credits will be refunded.',
          'Active services are left as-is.',
        ]}
        onCancel={() => !busy && setCancelOpen(false)}
        onConfirm={() => void cancelInvoice()}
      />

      <ConfirmModal
        open={deleteOpen}
        title={`Delete ${invoice.number} permanently?`}
        description="This removes the invoice from the ledger. Unpaid invoices refund applied credits first."
        confirmLabel="Delete invoice"
        busyLabel="Deleting…"
        tone="danger"
        actionIcon="delete"
        requireText={invoice.number}
        busy={busy}
        consequences={[
          'The invoice record is permanently removed.',
          'Unpaid invoices refund any credits that were applied.',
          'Linked services are not deleted.',
        ]}
        onCancel={() => !busy && setDeleteOpen(false)}
        onConfirm={() => void deleteInvoice()}
      />
    </div>
  );
}
