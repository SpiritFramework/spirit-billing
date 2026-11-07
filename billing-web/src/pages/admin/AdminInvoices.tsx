import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  ReceiptText,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';

type InvoiceStatus = 'unpaid' | 'paid' | 'cancelled';

type AdminInvoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  totalCents: number;
  creditAppliedCents?: number;
  currency: string;
  description: string;
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
  service: {
    id: string;
    name: string;
    status: string;
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
  } | null;
  isUpgrade?: boolean;
  upgradeToProduct?: {
    id: string;
    name: string;
  } | null;
};

function displayName(invoice: AdminInvoice) {
  return [invoice.user.firstName, invoice.user.lastName].filter(Boolean).join(' ') || invoice.user.username;
}

function isOverdue(invoice: AdminInvoice) {
  return invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
}

/** Settled invoice value: remaining total + credits used. */
function invoiceSettledCents(invoice: AdminInvoice) {
  return invoice.totalCents + (invoice.creditAppliedCents ?? 0);
}

export function AdminInvoices() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invoiceFromQuery = searchParams.get('invoice');
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (invoiceFromQuery) {
      navigate(`/admin/invoices/${invoiceFromQuery}`, { replace: true });
    }
  }, [invoiceFromQuery, navigate]);

  async function load() {
    setError('');
    try {
      setInvoices(await api<AdminInvoice[]>('/admin/invoices'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (invoiceFromQuery) return;
    void load();
  }, [invoiceFromQuery]);

  const visibleInvoices = invoices.filter((invoice) => {
    const haystack = `${invoice.number} ${invoice.description} ${invoice.user.username} ${invoice.user.email} ${invoice.service?.name ?? ''} ${invoice.service?.product.name ?? ''}`.toLowerCase();
    return (filter === 'all' || invoice.status === filter) && haystack.includes(query.trim().toLowerCase());
  });
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === 'unpaid');
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const overdueCount = invoices.filter(isOverdue).length;
  const outstandingCents = unpaidInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const paidCents = paidInvoices.reduce((sum, invoice) => sum + invoiceSettledCents(invoice), 0);

  if (invoiceFromQuery) {
    return <div className="ds-muted">Opening invoice…</div>;
  }

  return (
    <div className="admin-invoices-v2">
      <header className="admin-invoices-v2__header">
        <div>
          <span>Revenue operations</span>
          <h1>Invoices</h1>
          <p>Review balances and open an invoice for payment, upgrades, and provisioning.</p>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh invoices
        </button>
      </header>

      {error && <div className="ds-alert ds-alert--error">{error}</div>}

      <section className="admin-invoices-metrics">
        <article><span className="is-blue"><ReceiptText size={17} /></span><div><small>Total invoices</small><strong>{invoices.length}</strong><p>Complete billing ledger</p></div></article>
        <article><span className="is-amber"><Clock3 size={17} /></span><div><small>Outstanding</small><strong>{money(outstandingCents)}</strong><p>{unpaidInvoices.length} awaiting payment</p></div></article>
        <article><span className="is-red"><AlertCircle size={17} /></span><div><small>Overdue</small><strong>{overdueCount}</strong><p>Past their due date</p></div></article>
        <article><span className="is-green"><CircleDollarSign size={17} /></span><div><small>Paid value</small><strong>{money(paidCents)}</strong><p>{paidInvoices.length} completed</p></div></article>
      </section>

      <section className="admin-invoices-toolbar">
        <div><span>Billing ledger</span><h2>All invoices</h2></div>
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, client, service, or plan…" /></label>
        <div>
          {([
            ['all', 'All'],
            ['unpaid', 'Unpaid'],
            ['paid', 'Paid'],
            ['cancelled', 'Cancelled'],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </section>

      <div className="admin-invoices-layout">
        <main className="admin-invoices-list">
          {visibleInvoices.map((invoice) => {
            const overdue = isOverdue(invoice);
            const category = invoice.service?.product.category;
            return (
              <button
                type="button"
                key={invoice.id}
                className="admin-invoice-row"
                onClick={() => navigate(`/admin/invoices/${invoice.id}`)}
                style={category?.color ? { ['--invoice-color' as string]: category.color } : undefined}
              >
                {invoice.service ? (
                  <CategoryMark icon={category?.icon} logoUrl={category?.logoUrl} color={category?.color} size={40} />
                ) : (
                  <span className="admin-invoice-row__icon"><FileText size={16} /></span>
                )}
                <span className="admin-invoice-row__identity">
                  <small>{invoice.number}</small>
                  <strong>{invoice.service?.name || invoice.description || 'Billing invoice'}</strong>
                  <em>
                    {invoice.isUpgrade && invoice.upgradeToProduct
                      ? `Upgrade → ${invoice.upgradeToProduct.name}`
                      : invoice.service?.product.name || 'Manual invoice'}
                  </em>
                </span>
                <span className="admin-invoice-row__client">
                  <UserRound size={13} />
                  <span><small>Client</small><strong>{displayName(invoice)}</strong><em>{invoice.user.email}</em></span>
                </span>
                <span className="admin-invoice-row__date">
                  <CalendarDays size={13} />
                  <span><small>{invoice.status === 'paid' ? 'Paid' : overdue ? 'Overdue' : 'Due date'}</small><strong>{new Date(invoice.paidAt || invoice.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
                </span>
                <span className={statusBadge(invoice.status)}>{overdue ? 'overdue' : invoice.status}</span>
                <span className="admin-invoice-row__amount">
                  <strong>
                    {money(
                      invoice.status === 'paid' ? invoiceSettledCents(invoice) : invoice.totalCents,
                      invoice.currency,
                    )}
                  </strong>
                  <small>
                    {invoice.status === 'paid' && (invoice.creditAppliedCents ?? 0) > 0
                      ? 'settled'
                      : invoice.currency}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}

          {!loading && !visibleInvoices.length && (
            <div className="admin-invoices-empty">
              <ReceiptText size={28} />
              <h3>{invoices.length ? 'No matching invoices' : 'No invoices yet'}</h3>
              <p>{invoices.length ? 'Try another search or status filter.' : 'Client invoices will appear here after checkout.'}</p>
            </div>
          )}
          {loading && <div className="admin-invoices-empty"><RefreshCw size={28} /><h3>Loading invoices…</h3></div>}
        </main>
      </div>
    </div>
  );
}
