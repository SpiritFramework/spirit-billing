import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  LifeBuoy,
  Package,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
import { api, ApiError, money, statusBadge } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';

type Person = {
  username: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
};

type OverviewStats = {
  generatedAt?: string;
  users: number;
  linkedUsers: number;
  newClients30d?: number;
  services: {
    total: number;
    active: number;
    pending: number;
    suspended: number;
    renewalsDueSoon?: number;
  };
  invoices: {
    unpaid: number;
    unpaidCents: number;
    overdue?: number;
    dueSoon?: number;
  };
  products: { total: number; active: number };
  tickets?: { open: number; awaiting: number; answered: number; hot: number };
  revenuePaidCents: number;
  revenueThisMonthCents?: number;
  revenueLastMonthCents?: number;
  paidThisMonthCount?: number;
  revenueByMonth: Array<{ label: string; revenueCents: number }>;
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    creditAppliedCents?: number;
    currency: string;
    dueAt?: string;
    paidAt?: string | null;
    createdAt: string;
    user: Person;
    service: { name: string } | null;
  }>;
  overdueInvoices?: Array<{
    id: string;
    number: string;
    totalCents: number;
    currency: string;
    dueAt: string;
    user: Person;
    service: { name: string } | null;
  }>;
  recentServices: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    nextDueAt?: string | null;
    panelServerId: string | null;
    user: { username: string };
    product: {
      name: string;
      category?: {
        name: string;
        color: string;
        icon: string;
        logoUrl: string | null;
      } | null;
    };
  }>;
  recentTickets?: Array<{
    id: string;
    number: string;
    subject: string;
    status: string;
    priority: string;
    updatedAt: string;
    user: Person;
    category: { name: string; color?: string; icon?: string } | null;
  }>;
  recentLogs?: Array<{
    id: string;
    level: string;
    category: string;
    action: string;
    message: string;
    createdAt: string;
  }>;
};

type QueueItem = {
  id: string;
  tone: 'bad' | 'warn' | 'info';
  kind: string;
  title: string;
  detail: string;
  meta: string;
  to: string;
};

type FeedItem = {
  id: string;
  kind: 'invoice' | 'ticket' | 'service' | 'log';
  title: string;
  detail: string;
  meta: string;
  at: number;
  to?: string;
  tone?: string;
};

function displayName(user: Person) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || user.username;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function formatUpdated(value: string) {
  const date = new Date(value);
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(value);
}

function daysOverdue(dueAt: string) {
  return Math.max(1, Math.round((Date.now() - new Date(dueAt).getTime()) / (24 * 60 * 60 * 1000)));
}

function isOverdue(invoice: { status: string; dueAt?: string }) {
  return invoice.status === 'unpaid' && Boolean(invoice.dueAt) && new Date(invoice.dueAt!).getTime() < Date.now();
}

function ticketStatusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export function AdminOverview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  async function load(soft = false) {
    setError('');
    if (soft) setRefreshing(true);
    try {
      setStats(await api<OverviewStats>('/admin/stats'));
    } catch (err) {
      setStats(null);
      setError(err instanceof ApiError ? err.message : 'Could not load overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const tickets = stats?.tickets ?? { open: 0, awaiting: 0, answered: 0, hot: 0 };
  const overdue = stats?.invoices.overdue ?? 0;
  const dueSoon = stats?.invoices.dueSoon ?? 0;
  const renewalsDueSoon = stats?.services.renewalsDueSoon ?? 0;
  const monthPaid = stats?.revenueThisMonthCents ?? stats?.revenueByMonth.at(-1)?.revenueCents ?? 0;
  const prevMonth = stats?.revenueLastMonthCents ?? stats?.revenueByMonth.at(-2)?.revenueCents ?? 0;
  const monthDelta =
    monthPaid > 0 && prevMonth > 0 ? Math.round(((monthPaid - prevMonth) / prevMonth) * 100) : null;
  const maxRevenue = Math.max(...(stats?.revenueByMonth.map((month) => month.revenueCents) ?? [0]), 1);
  const activeRate = stats?.services.total
    ? Math.round((stats.services.active / stats.services.total) * 100)
    : 0;
  const linkRate = stats?.users ? Math.round((stats.linkedUsers / stats.users) * 100) : 0;
  const pressure =
    overdue * 3 +
    (stats?.invoices.unpaid ?? 0) +
    tickets.open * 2 +
    tickets.awaiting +
    (stats?.services.suspended ?? 0) * 3 +
    (stats?.services.pending ?? 0);

  const queue = useMemo(() => {
    if (!stats) return [] as QueueItem[];
    const items: QueueItem[] = [];
    const seenInvoices = new Set<string>();

    for (const invoice of stats.overdueInvoices ?? []) {
      seenInvoices.add(invoice.id);
      items.push({
        id: `overdue-${invoice.id}`,
        tone: 'bad',
        kind: 'Collect',
        title: invoice.number,
        detail: `${displayName(invoice.user)}${invoice.service ? ` · ${invoice.service.name}` : ''}`,
        meta: `${money(invoice.totalCents, invoice.currency)} · ${daysOverdue(invoice.dueAt)}d overdue`,
        to: `/admin/invoices/${invoice.id}`,
      });
    }

    for (const invoice of stats.recentInvoices.filter((row) => row.status === 'unpaid')) {
      if (seenInvoices.has(invoice.id)) continue;
      seenInvoices.add(invoice.id);
      const overdueInvoice = isOverdue(invoice);
      items.push({
        id: `unpaid-${invoice.id}`,
        tone: overdueInvoice ? 'bad' : 'warn',
        kind: 'Collect',
        title: invoice.number,
        detail: `${displayName(invoice.user)}${invoice.service ? ` · ${invoice.service.name}` : ''}`,
        meta: overdueInvoice
          ? `${money(invoice.totalCents, invoice.currency)} · ${daysOverdue(invoice.dueAt!)}d overdue`
          : `${money(invoice.totalCents, invoice.currency)} · due ${formatShortDate(invoice.dueAt || invoice.createdAt)}`,
        to: `/admin/invoices/${invoice.id}`,
      });
    }

    for (const ticket of (stats.recentTickets ?? []).filter((row) => row.status === 'open').slice(0, 4)) {
      items.push({
        id: `ticket-${ticket.id}`,
        tone: ticket.priority === 'urgent' || ticket.priority === 'high' ? 'bad' : 'warn',
        kind: 'Reply',
        title: ticket.number,
        detail: `${ticket.subject} · ${displayName(ticket.user)}`,
        meta: `${ticket.priority} · ${formatUpdated(ticket.updatedAt)}`,
        to: `/admin/tickets/${ticket.id}`,
      });
    }

    for (const service of stats.recentServices.filter((row) => row.status === 'suspended').slice(0, 3)) {
      items.push({
        id: `susp-${service.id}`,
        tone: 'bad',
        kind: 'Fleet',
        title: service.name,
        detail: `@${service.user.username} · ${service.product.name}`,
        meta: 'Suspended',
        to: `/admin/services/${service.id}`,
      });
    }

    for (const service of stats.recentServices.filter((row) => row.status === 'pending_payment').slice(0, 3)) {
      items.push({
        id: `pend-${service.id}`,
        tone: 'warn',
        kind: 'Provision',
        title: service.name,
        detail: `@${service.user.username} · ${service.product.name}`,
        meta: 'Pending payment',
        to: `/admin/services/${service.id}`,
      });
    }

    return items.slice(0, 8);
  }, [stats]);

  const feed = useMemo(() => {
    if (!stats) return [] as FeedItem[];
    const items: FeedItem[] = [];

    for (const invoice of stats.recentInvoices) {
      items.push({
        id: `inv-${invoice.id}`,
        kind: 'invoice',
        title: invoice.number,
        detail: `${displayName(invoice.user)}${invoice.service ? ` · ${invoice.service.name}` : ''}`,
        meta: `${money(invoice.totalCents, invoice.currency)} · ${
          isOverdue(invoice) ? 'overdue' : invoice.status
        }`,
        at: new Date(invoice.paidAt || invoice.createdAt).getTime(),
        to: `/admin/invoices/${invoice.id}`,
        tone: isOverdue(invoice) ? 'is-warn' : invoice.status === 'paid' ? 'is-ok' : '',
      });
    }

    for (const ticket of stats.recentTickets ?? []) {
      items.push({
        id: `tkt-${ticket.id}`,
        kind: 'ticket',
        title: ticket.number,
        detail: `${ticket.subject} · ${displayName(ticket.user)}`,
        meta: `${ticketStatusLabel(ticket.status)} · ${ticket.priority}`,
        at: new Date(ticket.updatedAt).getTime(),
        to: `/admin/tickets/${ticket.id}`,
        tone:
          ticket.status === 'open' || ticket.priority === 'urgent' || ticket.priority === 'high'
            ? 'is-warn'
            : '',
      });
    }

    for (const service of stats.recentServices) {
      items.push({
        id: `svc-${service.id}`,
        kind: 'service',
        title: service.name,
        detail: `@${service.user.username} · ${service.product.name}`,
        meta: service.status.replaceAll('_', ' '),
        at: new Date(service.createdAt).getTime(),
        to: `/admin/services/${service.id}`,
        tone: service.status === 'suspended' ? 'is-warn' : service.status === 'active' ? 'is-ok' : '',
      });
    }

    for (const log of stats.recentLogs ?? []) {
      items.push({
        id: `log-${log.id}`,
        kind: 'log',
        title: log.action.replaceAll('_', ' '),
        detail: log.message,
        meta: `${log.category} · ${log.level}`,
        at: new Date(log.createdAt).getTime(),
        to: '/admin/logs',
        tone: log.level === 'error' || log.level === 'warn' ? 'is-warn' : '',
      });
    }

    return items.sort((a, b) => b.at - a.at).slice(0, 10);
  }, [stats]);

  const clock = new Date(nowTick).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (loading && !stats) {
    return (
      <div className="ops-user ops-dash">
        <div className="ops-user__loading">
          <RefreshCw size={18} aria-hidden />
          Loading command center…
        </div>
      </div>
    );
  }

  return (
    <div className="ops-user ops-dash">
      {error ? <div className="ops-user__alert is-error">{error}</div> : null}

      <section className="ops-dash__hero">
        <div className="ops-dash__hero-main">
          <div className="ops-dash__hero-copy">
            <span>Overview</span>
            <h1>{stats ? money(stats.revenuePaidCents) : '—'}</h1>
            <p>
              Settled revenue across all paid invoices
              {monthPaid > 0 ? (
                <>
                  {' '}
                  · <strong>{money(monthPaid)}</strong> this month
                  {monthDelta != null ? (
                    <em className={monthDelta >= 0 ? 'is-up' : 'is-down'}>
                      {monthDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {monthDelta > 0 ? '+' : ''}
                      {monthDelta}%
                    </em>
                  ) : null}
                </>
              ) : (
                ' · nothing paid this month yet'
              )}
            </p>
          </div>

          <div className="ops-dash__hero-actions">
            <span className="ops-dash__live" title="Local time">
              <i /> {clock}
            </span>
            <Link to="/admin/products/new" className="ops-user__btn is-primary">
              <Plus size={14} /> New product
            </Link>
            <button
              type="button"
              className="ops-user__btn is-ghost"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw size={14} className={refreshing ? 'ops-dash__spin' : undefined} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="ops-dash__pulses" aria-label="Operational pulse">
          <Link
            to="/admin/invoices"
            className={`ops-dash__pulse${overdue || stats?.invoices.unpaid ? ' is-warn' : ''}`}
          >
            <span className="ops-dash__pulse-icon" aria-hidden>
              <FileText size={16} />
            </span>
            <span>
              <small>Collect</small>
              <strong>{stats ? money(stats.invoices.unpaidCents) : '—'}</strong>
              <em>
                {stats?.invoices.unpaid ?? 0} unpaid
                {overdue ? ` · ${overdue} overdue` : dueSoon ? ` · ${dueSoon} due soon` : ''}
              </em>
            </span>
          </Link>

          <Link
            to="/admin/services"
            className={`ops-dash__pulse${stats?.services.suspended ? ' is-warn' : ' is-ok'}`}
          >
            <span className="ops-dash__pulse-icon" aria-hidden>
              <Server size={16} />
            </span>
            <span>
              <small>Fleet</small>
              <strong>
                {stats?.services.active ?? 0}
                <i>/{stats?.services.total ?? 0}</i>
              </strong>
              <em>
                {activeRate}% active
                {renewalsDueSoon ? ` · ${renewalsDueSoon} renewing` : ''}
              </em>
            </span>
          </Link>

          <Link to="/admin/tickets" className={`ops-dash__pulse${tickets.hot ? ' is-warn' : ' is-ok'}`}>
            <span className="ops-dash__pulse-icon" aria-hidden>
              <Ticket size={16} />
            </span>
            <span>
              <small>Inbox</small>
              <strong>{tickets.open}</strong>
              <em>
                {tickets.awaiting} awaiting · {tickets.answered} answered
              </em>
            </span>
          </Link>

          <Link to="/admin/users" className="ops-dash__pulse">
            <span className="ops-dash__pulse-icon" aria-hidden>
              <Users size={16} />
            </span>
            <span>
              <small>Clients</small>
              <strong>{stats?.users ?? 0}</strong>
              <em>
                {linkRate}% panel-linked
                {(stats?.newClients30d ?? 0) > 0 ? ` · +${stats?.newClients30d} / 30d` : ''}
              </em>
            </span>
          </Link>
        </div>
      </section>

      <div className="ops-dash__board">
        <section className="ops-user__panel ops-dash__queue-panel">
          <header className="ops-dash__section-head">
            <span className="ops-user__panel-icon is-warn" aria-hidden>
              <AlertTriangle size={15} />
            </span>
            <div>
              <span>Priority</span>
              <h2>Needs action</h2>
            </div>
            <em className={`ops-dash__pressure${pressure ? ' is-hot' : ''}`}>
              {pressure ? `${queue.length} in queue` : 'Clear'}
            </em>
          </header>

          {queue.length ? (
            <div className="ops-dash__queue">
              {queue.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`ops-dash__queue-item is-${item.tone}`}
                  onClick={() => navigate(item.to)}
                >
                  <em>{item.kind}</em>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <b>{item.meta}</b>
                  <ChevronRight size={15} aria-hidden />
                </button>
              ))}
            </div>
          ) : (
            <div className="ops-dash__clear">
              <CheckCircle2 size={18} aria-hidden />
              <div>
                <strong>Nothing urgent</strong>
                <span>No overdue invoices, open tickets, or suspended services.</span>
              </div>
            </div>
          )}
        </section>

        <section className="ops-user__panel ops-dash__vitals-panel">
          <header className="ops-dash__section-head">
            <span className="ops-user__panel-icon" aria-hidden>
              <Activity size={15} />
            </span>
            <div>
              <span>Vitals</span>
              <h2>Platform pulse</h2>
            </div>
          </header>

          <div className="ops-dash__vitals">
            <div>
              <small>Panel link</small>
              <strong>{linkRate}%</strong>
              <span>
                {stats?.linkedUsers ?? 0}/{stats?.users ?? 0} clients
              </span>
              <i style={{ width: `${linkRate}%` }} />
            </div>
            <div>
              <small>Fleet health</small>
              <strong>{activeRate}%</strong>
              <span>
                {stats?.services.suspended ?? 0} suspended · {stats?.services.pending ?? 0} pending
              </span>
              <i className="is-ok" style={{ width: `${activeRate}%` }} />
            </div>
            <div>
              <small>Catalog</small>
              <strong>{stats?.products.active ?? 0}</strong>
              <span>{stats?.products.total ?? 0} total plans</span>
              <i
                className="is-mark"
                style={{
                  width: `${
                    stats?.products.total
                      ? Math.round(((stats.products.active || 0) / stats.products.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <div>
              <small>Renewals · 7d</small>
              <strong>{renewalsDueSoon}</strong>
              <span>{dueSoon} invoices due soon</span>
              <i className={renewalsDueSoon || dueSoon ? 'is-warn' : ''} style={{ width: renewalsDueSoon || dueSoon ? '72%' : '12%' }} />
            </div>
            <div>
              <small>Paid this month</small>
              <strong>{stats?.paidThisMonthCount ?? 0}</strong>
              <span>{monthPaid ? money(monthPaid) : '£0 settled'}</span>
              <i className="is-ok" style={{ width: monthPaid ? '88%' : '8%' }} />
            </div>
            <div>
              <small>New clients · 30d</small>
              <strong>{stats?.newClients30d ?? 0}</strong>
              <span>Directory growth</span>
              <i className="is-mark" style={{ width: stats?.newClients30d ? '64%' : '8%' }} />
            </div>
          </div>
        </section>
      </div>

      <div className="ops-inv__desk ops-dash__desk">
        <div className="ops-inv__main">
          <section className="ops-user__panel ops-dash__chart-panel">
            <header className="ops-dash__section-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <CircleDollarSign size={15} />
              </span>
              <div>
                <span>Performance</span>
                <h2>Revenue trend</h2>
              </div>
              <div className="ops-dash__chart-legend">
                <span>
                  <small>This month</small>
                  <strong>{money(monthPaid)}</strong>
                </span>
                <span>
                  <small>Last month</small>
                  <strong>{money(prevMonth)}</strong>
                </span>
              </div>
            </header>

            <div className="ops-dash__chart" aria-label="Revenue by month">
              {(stats?.revenueByMonth ?? Array.from({ length: 6 }, () => null)).map((month, index) => {
                const cents = month?.revenueCents ?? 0;
                const height = Math.max(8, (cents / maxRevenue) * 100);
                const isCurrent = index === (stats?.revenueByMonth.length ?? 6) - 1;
                return (
                  <div
                    key={month?.label ?? index}
                    className={`ops-dash__bar${cents <= 0 ? ' is-empty' : ''}${isCurrent ? ' is-current' : ''}`}
                  >
                    <strong>{cents > 0 ? money(cents) : '£0'}</strong>
                    <span className="ops-dash__bar-track" aria-hidden>
                      <i style={{ height: `${height}%` }} />
                    </span>
                    <small>{month?.label ?? '—'}</small>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="ops-user__panel">
            <header className="ops-dash__section-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <Activity size={15} />
              </span>
              <div>
                <span>Stream</span>
                <h2>Live activity</h2>
              </div>
              <Link to="/admin/logs" className="ops-dash__panel-link">
                Logs <ArrowRight size={13} />
              </Link>
            </header>

            <div className="ops-dash__feed" aria-label="Live activity">
              {feed.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`ops-dash__feed-item ${item.tone || ''}`}
                  onClick={() => item.to && navigate(item.to)}
                  disabled={!item.to}
                >
                  <span className={`ops-dash__feed-mark is-${item.kind}`} aria-hidden>
                    {item.kind === 'invoice' ? (
                      <FileText size={13} />
                    ) : item.kind === 'ticket' ? (
                      <LifeBuoy size={13} />
                    ) : item.kind === 'service' ? (
                      <Server size={13} />
                    ) : (
                      <Activity size={13} />
                    )}
                  </span>
                  <span className="ops-dash__feed-copy">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="ops-dash__feed-meta">
                    <strong>{item.meta}</strong>
                    <small>{formatUpdated(new Date(item.at).toISOString())}</small>
                  </span>
                  {item.to ? <ChevronRight size={14} aria-hidden /> : <span />}
                </button>
              ))}
              {!feed.length ? (
                <div className="ops-dash__empty">
                  <strong>No recent activity</strong>
                  <span>Billing events and ticket updates will show here.</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="ops-inv__aside">
          <section className="ops-user__panel">
            <header className="ops-dash__section-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <Server size={15} />
              </span>
              <div>
                <span>Fleet</span>
                <h2>Composition</h2>
              </div>
            </header>

            <div className="ops-dash__stack" aria-hidden>
              {(stats?.services.active ?? 0) > 0 ? (
                <i className="is-ok" style={{ flex: stats?.services.active }} />
              ) : null}
              {(stats?.services.pending ?? 0) > 0 ? (
                <i className="is-warn" style={{ flex: stats?.services.pending }} />
              ) : null}
              {(stats?.services.suspended ?? 0) > 0 ? (
                <i className="is-bad" style={{ flex: stats?.services.suspended }} />
              ) : null}
              {!stats?.services.total ? <i className="is-empty" style={{ flex: 1 }} /> : null}
            </div>

            <div className="ops-dash__health-rows">
              <span>
                <i className="is-ok" /> Active <strong>{stats?.services.active ?? 0}</strong>
              </span>
              <span>
                <i className="is-warn" /> Pending <strong>{stats?.services.pending ?? 0}</strong>
              </span>
              <span>
                <i className="is-bad" /> Suspended <strong>{stats?.services.suspended ?? 0}</strong>
              </span>
            </div>

            <Link to="/admin/services" className="ops-user__btn is-ghost ops-dash__full-btn">
              Open fleet <ArrowRight size={13} />
            </Link>
          </section>

          <section className="ops-user__panel">
            <header className="ops-dash__section-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <Clock3 size={15} />
              </span>
              <div>
                <span>Calendar</span>
                <h2>Coming due</h2>
              </div>
            </header>
            <dl className="ops-user__facts">
              <div>
                <dt>Invoices · 7d</dt>
                <dd>{dueSoon}</dd>
              </div>
              <div>
                <dt>Renewals · 7d</dt>
                <dd>{renewalsDueSoon}</dd>
              </div>
              <div>
                <dt>Overdue</dt>
                <dd>{overdue}</dd>
              </div>
              <div>
                <dt>Unpaid value</dt>
                <dd>{stats ? money(stats.invoices.unpaidCents) : '—'}</dd>
              </div>
            </dl>
            <Link to="/admin/invoices" className="ops-user__btn is-ghost ops-dash__full-btn">
              Open ledger <ArrowRight size={13} />
            </Link>
          </section>

          <section className="ops-user__panel">
            <header className="ops-dash__section-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <Server size={15} />
              </span>
              <div>
                <span>Provisioning</span>
                <h2>Newest services</h2>
              </div>
            </header>
            <div className="ops-dash__side-list">
              {stats?.recentServices.slice(0, 4).map((service) => (
                <Link key={service.id} to={`/admin/services/${service.id}`} className="ops-inv__person is-link">
                  {service.product.category ? (
                    <CategoryMark
                      color={service.product.category.color || '#38bdf8'}
                      icon={service.product.category.icon || 'server'}
                      logoUrl={service.product.category.logoUrl}
                      size={30}
                      className="ops-services__mark"
                    />
                  ) : (
                    <span className="ops-dash__row-icon" aria-hidden>
                      <Server size={14} />
                    </span>
                  )}
                  <div>
                    <strong>{service.name}</strong>
                    <small>
                      @{service.user.username} · {formatUpdated(service.createdAt)}
                    </small>
                  </div>
                  <em className={`ops-svc__status-badge ${statusBadge(service.status)}`}>
                    {service.status.replaceAll('_', ' ')}
                  </em>
                </Link>
              ))}
              {stats && !stats.recentServices.length ? (
                <div className="ops-dash__empty">
                  <strong>No services yet</strong>
                  <span>New orders land here after checkout.</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="ops-user__panel">
            <header className="ops-dash__section-head">
              <span className="ops-user__panel-icon" aria-hidden>
                <Settings size={15} />
              </span>
              <div>
                <span>Launch</span>
                <h2>Quick ops</h2>
              </div>
            </header>
            <div className="ops-dash__launch">
              <Link to="/admin/products/new">
                <Plus size={15} />
                <strong>Product</strong>
              </Link>
              <Link to="/admin/users">
                <Users size={15} />
                <strong>Users</strong>
              </Link>
              <Link to="/admin/tickets">
                <Ticket size={15} />
                <strong>Tickets</strong>
              </Link>
              <Link to="/admin/products">
                <Package size={15} />
                <strong>Catalog</strong>
              </Link>
              <Link to="/admin/invoices">
                <FileText size={15} />
                <strong>Ledger</strong>
              </Link>
              <Link to="/admin/settings">
                <Settings size={15} />
                <strong>Settings</strong>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
