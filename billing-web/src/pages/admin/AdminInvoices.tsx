import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';

type InvoiceStatus = 'unpaid' | 'paid' | 'cancelled';
type StatusFilter = 'all' | InvoiceStatus;
type AttentionFilter = 'all' | 'overdue' | 'due_soon';
type KindFilter = 'all' | 'renewal' | 'upgrade' | 'resource' | 'invoice';

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

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

function displayName(invoice: AdminInvoice) {
  return [invoice.user.firstName, invoice.user.lastName].filter(Boolean).join(' ') || invoice.user.username;
}

function isOverdue(invoice: AdminInvoice) {
  return invoice.status === 'unpaid' && new Date(invoice.dueAt).getTime() < Date.now();
}

function isDueSoon(invoice: AdminInvoice) {
  if (invoice.status !== 'unpaid' || isOverdue(invoice)) return false;
  const due = new Date(invoice.dueAt).getTime();
  return due - Date.now() <= DUE_SOON_MS;
}

function invoiceSettledCents(invoice: AdminInvoice) {
  return invoice.totalCents + (invoice.creditAppliedCents ?? 0);
}

function invoiceKind(invoice: AdminInvoice): Exclude<KindFilter, 'all'> {
  if (invoice.isUpgrade || invoice.upgradeToProduct) return 'upgrade';
  const desc = (invoice.description || '').toLowerCase();
  if (desc.includes('renew')) return 'renewal';
  if (desc.includes('resource')) return 'resource';
  if (desc.includes('upgrade')) return 'upgrade';
  return 'invoice';
}

function kindLabel(kind: Exclude<KindFilter, 'all'>) {
  if (kind === 'renewal') return 'Renewal';
  if (kind === 'upgrade') return 'Upgrade';
  if (kind === 'resource') return 'Resource';
  return 'Invoice';
}

function invoiceTitle(invoice: AdminInvoice) {
  if (invoice.isUpgrade && invoice.upgradeToProduct) {
    return invoice.service?.name || invoice.upgradeToProduct.name;
  }
  return invoice.service?.name || invoice.description || 'Billing invoice';
}

function invoiceSubtitle(invoice: AdminInvoice) {
  if (invoice.isUpgrade && invoice.upgradeToProduct) {
    return `Upgrade → ${invoice.upgradeToProduct.name}`;
  }
  return invoice.service?.product.name || invoice.description || 'Manual invoice';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function dueLabel(invoice: AdminInvoice) {
  if (invoice.status === 'paid') return invoice.paidAt ? `Paid ${formatDate(invoice.paidAt)}` : 'Paid';
  if (isOverdue(invoice)) return `Overdue ${formatDate(invoice.dueAt)}`;
  if (isDueSoon(invoice)) return `Due ${formatDate(invoice.dueAt)}`;
  return `Due ${formatDate(invoice.dueAt)}`;
}

export function AdminInvoices() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invoiceFromQuery = searchParams.get('invoice');
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
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

  const stats = useMemo(() => {
    const unpaid = invoices.filter((invoice) => invoice.status === 'unpaid');
    const paid = invoices.filter((invoice) => invoice.status === 'paid');
    const cancelled = invoices.filter((invoice) => invoice.status === 'cancelled');
    const overdue = invoices.filter(isOverdue);
    const dueSoon = invoices.filter(isDueSoon);
    return {
      total: invoices.length,
      unpaid: unpaid.length,
      paid: paid.length,
      cancelled: cancelled.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      renewal: invoices.filter((invoice) => invoiceKind(invoice) === 'renewal').length,
      upgrade: invoices.filter((invoice) => invoiceKind(invoice) === 'upgrade').length,
      resource: invoices.filter((invoice) => invoiceKind(invoice) === 'resource').length,
      plain: invoices.filter((invoice) => invoiceKind(invoice) === 'invoice').length,
      outstandingCents: unpaid.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      paidCents: paid.reduce((sum, invoice) => sum + invoiceSettledCents(invoice), 0),
      outstandingCurrency: unpaid[0]?.currency || paid[0]?.currency || 'GBP',
      paidCurrency: paid[0]?.currency || unpaid[0]?.currency || 'GBP',
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter !== 'all' && invoice.status !== statusFilter) return false;
      if (attentionFilter === 'overdue' && !isOverdue(invoice)) return false;
      if (attentionFilter === 'due_soon' && !isDueSoon(invoice)) return false;
      if (kindFilter !== 'all' && invoiceKind(invoice) !== kindFilter) return false;
      if (!q) return true;
      const hay = [
        invoice.number,
        invoice.description,
        invoice.user.username,
        invoice.user.email,
        invoice.user.firstName,
        invoice.user.lastName,
        invoice.service?.name,
        invoice.service?.product.name,
        invoice.service?.product.category?.name,
        invoice.upgradeToProduct?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [invoices, query, statusFilter, attentionFilter, kindFilter]);

  const filtersActive =
    statusFilter !== 'all' ||
    attentionFilter !== 'all' ||
    kindFilter !== 'all' ||
    Boolean(query.trim());

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter !== 'all') parts.push(statusFilter);
    if (attentionFilter === 'overdue') parts.push('Overdue');
    if (attentionFilter === 'due_soon') parts.push('Due soon');
    if (kindFilter !== 'all') parts.push(kindLabel(kindFilter));
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts;
  }, [statusFilter, attentionFilter, kindFilter, query]);

  function clearFilters() {
    setStatusFilter('all');
    setAttentionFilter('all');
    setKindFilter('all');
    setQuery('');
  }

  function setChipFilter(next: {
    status?: StatusFilter;
    attention?: AttentionFilter;
  }) {
    setStatusFilter(next.status ?? 'all');
    setAttentionFilter(next.attention ?? 'all');
    setKindFilter('all');
    setQuery('');
  }

  if (invoiceFromQuery) {
    return <div className="ds-muted">Opening invoice…</div>;
  }

  return (
    <div className="ops-users ops-invoices">
      <header className="ops-users__mast">
        <div className="ops-users__mast-copy">
          <span>Ledger</span>
          <h1>Invoices</h1>
          <p>Balances, renewals, upgrades, and overdue collection across every account.</p>
        </div>
        <div className="ops-users__mast-meta">
          <button
            type="button"
            className={`ops-users__chip${!filtersActive ? ' is-active' : ''}`}
            onClick={clearFilters}
            title="Show all invoices"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <FileText size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Ledger</small>
              <strong>{stats.total}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${
              statusFilter === 'unpaid' && attentionFilter === 'all' && kindFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ status: 'unpaid' })}
            title="Show unpaid invoices"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CircleDollarSign size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Unpaid</small>
              <strong>{money(stats.outstandingCents, stats.outstandingCurrency)}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip${stats.overdue ? ' is-warn' : ''}${
              attentionFilter === 'overdue' && statusFilter === 'all' && kindFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ attention: 'overdue' })}
            title="Show overdue invoices"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <AlertTriangle size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Overdue</small>
              <strong>{stats.overdue}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`ops-users__chip is-ok${
              statusFilter === 'paid' && attentionFilter === 'all' && kindFilter === 'all' && !query.trim()
                ? ' is-active'
                : ''
            }`}
            onClick={() => setChipFilter({ status: 'paid' })}
            title="Show paid invoices"
          >
            <span className="ops-users__chip-icon" aria-hidden>
              <CheckCircle2 size={14} />
            </span>
            <span className="ops-users__chip-copy">
              <small>Paid</small>
              <strong>{money(stats.paidCents, stats.paidCurrency)}</strong>
            </span>
          </button>
        </div>
      </header>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      <div className="ops-users__shell">
        <aside className="ops-users__rail" aria-label="Invoice filters">
          <div className="ops-users__rail-block">
            <span>Status</span>
            <div>
              {(
                [
                  ['all', 'Any status', stats.total],
                  ['unpaid', 'Unpaid', stats.unpaid],
                  ['paid', 'Paid', stats.paid],
                  ['cancelled', 'Cancelled', stats.cancelled],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? 'is-on' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Attention</span>
            <div>
              {(
                [
                  ['all', 'Any timing', stats.total],
                  ['overdue', 'Overdue', stats.overdue],
                  ['due_soon', 'Due soon', stats.dueSoon],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={attentionFilter === value ? 'is-on' : ''}
                  onClick={() => setAttentionFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-users__rail-block">
            <span>Kind</span>
            <div>
              {(
                [
                  ['all', 'Any kind', stats.total],
                  ['renewal', 'Renewal', stats.renewal],
                  ['upgrade', 'Upgrade', stats.upgrade],
                  ['resource', 'Resource', stats.resource],
                  ['invoice', 'Invoice', stats.plain],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={kindFilter === value ? 'is-on' : ''}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="ops-users__main">
          <div className="ops-users__command ops-invoices__command">
            <label className="ops-users__search">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setQuery('');
                  }
                }}
                placeholder="Filter by invoice, client, service, or plan"
                aria-label="Search invoices"
              />
              {query ? (
                <button
                  type="button"
                  className="ops-users__search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>

            <div className="ops-services__jobs" role="group" aria-label="Ledger actions">
              <button type="button" disabled={loading} onClick={() => void load()}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="ops-users__command-meta">
              <span>
                Showing <strong>{filtered.length}</strong> / {stats.total}
              </span>
              {filtersActive ? (
                <>
                  <span className="ops-users__filter-summary">{filterSummary.join(' · ')}</span>
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <section className="ops-users__table" aria-label="Invoices">
            <div className="ops-users__head ops-invoices__head" aria-hidden>
              <span>Invoice</span>
              <span>Client</span>
              <span>Kind</span>
              <span>Status</span>
              <span className="is-end">Amount</span>
              <span className="is-end">Timing</span>
              <span />
            </div>

            {filtered.map((invoice) => {
              const category = invoice.service?.product.category;
              const kind = invoiceKind(invoice);
              const overdue = isOverdue(invoice);
              const dueSoon = isDueSoon(invoice);
              const amountCents =
                invoice.status === 'paid' ? invoiceSettledCents(invoice) : invoice.totalCents;

              return (
                <button
                  type="button"
                  key={invoice.id}
                  className={`ops-users__row ops-invoices__row${overdue ? ' is-overdue' : ''}${
                    dueSoon ? ' is-due-soon' : ''
                  }`}
                  onClick={() => navigate(`/admin/invoices/${invoice.id}`)}
                >
                  <span className="ops-invoices__who">
                    {invoice.service ? (
                      <CategoryMark
                        icon={category?.icon || 'server'}
                        logoUrl={category?.logoUrl}
                        color={category?.color || '#38bdf8'}
                        size={30}
                        className="ops-services__mark"
                      />
                    ) : (
                      <span className="ops-invoices__mark-fallback" aria-hidden>
                        <FileText size={15} />
                      </span>
                    )}
                    <span>
                      <strong>{invoice.number}</strong>
                      <small>
                        {invoiceTitle(invoice)}
                        {invoice.service?.product.category?.name
                          ? ` · ${invoice.service.product.category.name}`
                          : ''}
                      </small>
                      <em>{invoiceSubtitle(invoice)}</em>
                    </span>
                  </span>

                  <span className="ops-services__client">
                    <strong>{displayName(invoice)}</strong>
                    <small>@{invoice.user.username}</small>
                  </span>

                  <span className={`ops-invoices__kind is-${kind}`}>{kindLabel(kind)}</span>

                  <span className="ops-services__status">
                    <em className={statusBadge(overdue ? 'overdue' : invoice.status)}>
                      {overdue ? 'overdue' : invoice.status}
                    </em>
                  </span>

                  <span className="ops-invoices__amount is-end">
                    {money(amountCents, invoice.currency)}
                    {(invoice.creditAppliedCents ?? 0) > 0 && invoice.status === 'paid' ? (
                      <small>settled</small>
                    ) : (
                      <small>{invoice.currency}</small>
                    )}
                  </span>

                  <span
                    className={`ops-invoices__timing is-end${overdue ? ' is-overdue' : ''}${
                      dueSoon ? ' is-due-soon' : ''
                    }`}
                  >
                    {dueLabel(invoice)}
                  </span>

                  <ChevronRight size={15} aria-hidden />
                </button>
              );
            })}

            {!loading && !filtered.length ? (
              <div className="ops-users__empty">
                <FileText size={20} aria-hidden />
                <strong>{invoices.length ? 'No matching invoices' : 'No invoices yet'}</strong>
                <span>
                  {invoices.length
                    ? 'Try another search or filter.'
                    : 'Client invoices appear here after checkout and renewals.'}
                </span>
                {filtersActive ? (
                  <button type="button" className="ops-users__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <div className="ops-users__empty">
                <RefreshCw size={20} aria-hidden />
                <strong>Loading ledger…</strong>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
