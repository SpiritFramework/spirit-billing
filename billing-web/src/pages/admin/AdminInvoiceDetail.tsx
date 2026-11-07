import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  ReceiptText,
  Server,
  ShieldCheck,
  Tag,
  Trash2,
  TrendingUp,
  UserRound,
  XCircle,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { isFullAdmin } from '../../lib/roles';
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
    creditBalanceCents: number;
  };
  paidBy: { id: string; username: string } | null;
  service: {
    id: string;
    name: string;
    status: string;
    panelServerId: string | null;
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
  } | null;
};

function displayName(user: AdminInvoiceDetail['user']) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
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
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ panelServerId: string | null }>(
        `/admin/invoices/${invoice.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) },
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

  if (error && !invoice) {
    return (
      <div className="aid-v2">
        <Link to="/admin/invoices" className="aid-v2__back"><ArrowLeft size={14} /> All invoices</Link>
        <div className="ds-alert ds-alert--error">{error}</div>
      </div>
    );
  }
  if (!invoice) return <div className="ds-muted">Loading…</div>;

  const isOverdue = invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
  const isUpgrade = Boolean(invoice.isUpgrade && invoice.upgradeToProduct);
  const upgrade = invoice.upgradeToProduct;

  return (
    <div className="aid-v2">
      <Link to="/admin/invoices" className="aid-v2__back"><ArrowLeft size={14} /> All invoices</Link>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}
      {message && <div className="ds-alert ds-alert--success">{message}</div>}

      <header className="aid-v2__header">
        <div>
          <span>{isUpgrade ? 'Plan upgrade invoice' : 'Invoice detail'}</span>
          <h1>{invoice.number}</h1>
          <p>
            {isUpgrade && upgrade
              ? `Upgrade to ${upgrade.name} · ${displayName(invoice.user)}`
              : `${invoice.companyName || 'SpiritHost'} · ${displayName(invoice.user)}`}
          </p>
        </div>
        <span className={`aid-v2__status is-${isOverdue ? 'overdue' : invoice.status}`}>
          {invoice.status === 'paid' ? <CheckCircle2 size={15} /> : isOverdue ? <Clock3 size={15} /> : invoice.status === 'cancelled' ? <XCircle size={15} /> : <FileText size={15} />}
          <span>
            <strong>{isOverdue ? 'Overdue' : invoice.status}</strong>
            <small>
              {invoice.status === 'paid' && invoice.paidAt
                ? `Paid ${new Date(invoice.paidAt).toLocaleString()}`
                : `Due ${new Date(invoice.dueAt).toLocaleDateString()}`}
            </small>
          </span>
        </span>
      </header>

      <div className="aid-v2-layout">
        <main className="aid-v2-document">
          <header>
            <div>
              <span className="aid-v2-document__logo"><ReceiptText size={18} /></span>
              <span>
                <strong>{invoice.companyName || 'SpiritHost'}</strong>
                <small>{isUpgrade ? 'Plan upgrade' : 'Hosting invoice'}</small>
              </span>
            </div>
            <div>
              <small>Invoice</small>
              <strong>{invoice.number}</strong>
            </div>
          </header>

          {isUpgrade && upgrade && (
            <section className="aid-v2-upgrade">
              <TrendingUp size={15} />
              <div>
                <strong>Upgrading to {upgrade.name}</strong>
                <p>
                  From {invoice.service?.product.name || 'current plan'}
                  {' · '}
                  {upgrade.memoryMb <= 0 ? 'Unlimited RAM' : `${Math.round(upgrade.memoryMb / 1024)} GB`}
                  {' · '}
                  {upgrade.cpuPercent <= 0 ? 'Unlimited CPU' : `${upgrade.cpuPercent}% CPU`}
                  {' · '}
                  {upgrade.diskMb <= 0 ? 'Unlimited disk' : `${Math.round(upgrade.diskMb / 1024)} GB disk`}
                </p>
              </div>
            </section>
          )}

          <section className="aid-v2-document__meta">
            <div><small>Issued</small><strong>{new Date(invoice.createdAt).toLocaleDateString()}</strong></div>
            <div><small>Due</small><strong>{new Date(invoice.dueAt).toLocaleDateString()}</strong></div>
            <div><small>Currency</small><strong>{invoice.currency}</strong></div>
            <div><small>Status</small><span className={statusBadge(invoice.status)}>{isOverdue ? 'overdue' : invoice.status}</span></div>
          </section>

          <section className="aid-v2-document__items">
            <header><span>Description</span><span>Type</span><span>Amount</span></header>
            <article>
              <span className="aid-v2-document__item-icon">
                {isUpgrade ? <TrendingUp size={14} /> : <Server size={14} />}
              </span>
              <div>
                <strong>
                  {isUpgrade && upgrade
                    ? `Upgrade to ${upgrade.name}`
                    : invoice.service?.name || invoice.description || 'Hosting charge'}
                </strong>
                <small>{invoice.description || invoice.service?.product.name || 'Billing line item'}</small>
              </div>
              <span>{isUpgrade ? 'Upgrade' : invoice.service?.product.cycle || 'One-time'}</span>
              <strong>{money(invoice.subtotalCents, invoice.currency)}</strong>
            </article>
          </section>

          <section className="aid-v2-document__totals">
            <div><span>Subtotal</span><strong>{money(invoice.subtotalCents, invoice.currency)}</strong></div>
            {invoice.discountCents > 0 && (
              <div className="is-saving">
                <span><Tag size={11} /> Discount {invoice.couponCode && <em>{invoice.couponCode}</em>}</span>
                <strong>−{money(invoice.discountCents, invoice.currency)}</strong>
              </div>
            )}
            {invoice.creditAppliedCents > 0 && (
              <div className="is-saving">
                <span>Credits applied</span>
                <strong>−{money(invoice.creditAppliedCents, invoice.currency)}</strong>
              </div>
            )}
            <div className="is-total">
              <span>{invoice.status === 'unpaid' ? 'Amount due' : 'Invoice total'}</span>
              <strong>{money(invoice.totalCents, invoice.currency)}</strong>
            </div>
          </section>

          {invoice.status === 'unpaid' && invoice.paymentInstructions && (
            <footer>
              <CircleDollarSign size={14} />
              <span>
                <strong>Payment instructions</strong>
                <small>{invoice.paymentInstructions}</small>
              </span>
            </footer>
          )}
        </main>

        <aside className="aid-v2-sidebar">
          <section className="aid-v2-side">
            <header>
              <UserRound size={15} />
              <div>
                <small>Billed to</small>
                <strong>{displayName(invoice.user)}</strong>
              </div>
            </header>
            <div><span>Email</span><strong>{invoice.user.email}</strong></div>
            <div><span>Credits</span><strong>{money(invoice.user.creditBalanceCents, 'GBP')}</strong></div>
            {invoice.paidBy && <div><span>Confirmed by</span><strong>@{invoice.paidBy.username}</strong></div>}
            <Link to={`/admin/users/${invoice.user.id}`}>Open client <ChevronRight size={13} /></Link>
          </section>

          {invoice.service && (
            <section className="aid-v2-side">
              <header>
                <Server size={15} />
                <div>
                  <small>Linked service</small>
                  <strong>{invoice.service.name}</strong>
                </div>
              </header>
              <div><span>Plan</span><strong>{invoice.service.product.name}</strong></div>
              <div><span>Status</span><strong>{invoice.service.status.replaceAll('_', ' ')}</strong></div>
              <Link to={`/admin/services/${invoice.service.id}`}>Open service <ChevronRight size={13} /></Link>
            </section>
          )}

          <section className="aid-v2-actions">
            {invoice.status === 'unpaid' && (
              <>
                {fullAdmin && (
                <button type="button" className="is-paid" disabled={busy} onClick={() => setPayOpen(true)}>
                  <CheckCircle2 size={14} />
                  {isUpgrade ? 'Pay & upgrade' : 'Mark paid & provision'}
                </button>
                )}
                <button type="button" className="is-cancel" disabled={busy} onClick={() => setCancelOpen(true)}>
                  <XCircle size={14} /> Cancel invoice
                </button>
              </>
            )}
            {invoice.status === 'paid' && (
              <span className="is-complete"><ShieldCheck size={14} /> Payment confirmed</span>
            )}
            {fullAdmin && (
            <button type="button" className="is-danger" disabled={busy} onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} /> Delete invoice
            </button>
            )}
          </section>
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
