import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
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
  tone: 'bad' | 'today' | 'warn' | 'info';
  kind: string;
  title: string;
  detail: string;
  amount: string;
  note: string;
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
  count?: number;
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

function isSameDay(value: string, now = Date.now()) {
  const date = new Date(value);
  const today = new Date(now);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function duePhrase(dueAt?: string) {
  if (!dueAt) return 'Open';
  if (isSameDay(dueAt)) return 'Due today';
  if (new Date(dueAt).getTime() < Date.now()) return `${daysOverdue(dueAt)}d overdue`;
  return `Due ${formatShortDate(dueAt)}`;
}

function dueTone(phrase: string): QueueItem['tone'] {
  if (phrase.includes('overdue')) return 'bad';
  if (phrase === 'Due today') return 'today';
  return 'warn';
}

function logPreview(message: string) {
  if (/prisma\.|[A-Za-z]:\\|randomBy|invocation/i.test(message)) {
    if (/session\.create/i.test(message)) return 'Could not open a login session.';
    if (/session/i.test(message)) return 'Session call failed.';
    return 'A database call failed. Open Logs for the record.';
  }
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Logged event';
  return cleaned.length > 88 ? `${cleaned.slice(0, 85)}…` : cleaned;
}

function isOverdue(invoice: { status: string; dueAt?: string }) {
  return invoice.status === 'unpaid' && Boolean(invoice.dueAt) && new Date(invoice.dueAt!).getTime() < Date.now();
}

function ticketStatusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function RevenueRibbon({
  months,
  selected,
  onSelect,
}: {
  months: Array<{ label: string; revenueCents: number }>;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const width = 640;
  const height = 128;
  const pad = { left: 10, right: 10, top: 14, bottom: 6 };
  const max = Math.max(1, ...months.map((row) => row.revenueCents));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const points = months.map((row, index) => {
    const x = pad.left + (months.length <= 1 ? innerW / 2 : (index / (months.length - 1)) * innerW);
    const y = pad.top + innerH - (row.revenueCents / max) * innerH;
    return { x, y, index };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const base = pad.top + innerH;
  const area = points.length ? `${points[0].x},${base} ${line} ${points[points.length - 1].x},${base}` : '';
  const active = points[Math.min(selected, Math.max(0, points.length - 1))];

  return (
    <div className="ops-home__plot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Settled revenue by month">
        {[0.5, 1].map((step) => {
          const y = pad.top + innerH * (1 - step);
          return <line key={step} className="ops-home__gridline" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />;
        })}
        {area ? <polygon className="ops-home__area" points={area} /> : null}
        {line ? <polyline className="ops-home__line" points={line} /> : null}
        {active ? <line className="ops-home__guide" x1={active.x} x2={active.x} y1={pad.top} y2={base} /> : null}
        {points.map((point) => (
          <circle
            key={point.index}
            className={point.index === (active?.index ?? -1) ? 'is-on' : ''}
            cx={point.x}
            cy={point.y}
            r={point.index === (active?.index ?? -1) ? 5 : 3.2}
            onClick={() => onSelect(point.index)}
          />
        ))}
      </svg>
      <div className="ops-home__months" role="tablist" aria-label="Months">
        {months.map((row, index) => (
          <button
            key={`${row.label}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === (active?.index ?? -1)}
            className={index === (active?.index ?? -1) ? 'is-on' : ''}
            onClick={() => onSelect(index)}
          >
            {row.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminOverview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [ribbonMonth, setRibbonMonth] = useState(0);

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

  useEffect(() => {
    if (!stats?.revenueByMonth.length) return;
    setRibbonMonth(stats.revenueByMonth.length - 1);
  }, [stats?.generatedAt, stats?.revenueByMonth.length]);

  const tickets = stats?.tickets ?? { open: 0, awaiting: 0, answered: 0, hot: 0 };
  const overdue = stats?.invoices.overdue ?? 0;
  const dueSoon = stats?.invoices.dueSoon ?? 0;
  const renewalsDueSoon = stats?.services.renewalsDueSoon ?? 0;
  const monthPaid = stats?.revenueThisMonthCents ?? stats?.revenueByMonth.at(-1)?.revenueCents ?? 0;
  const prevMonth = stats?.revenueLastMonthCents ?? stats?.revenueByMonth.at(-2)?.revenueCents ?? 0;
  const monthDelta =
    prevMonth > 0 ? Math.round(((monthPaid - prevMonth) / prevMonth) * 100) : monthPaid > 0 ? 100 : 0;
  const activeRate = stats?.services.total
    ? Math.round((stats.services.active / stats.services.total) * 100)
    : 0;
  const linkRate = stats?.users ? Math.round((stats.linkedUsers / stats.users) * 100) : 0;

  const queue = useMemo(() => {
    if (!stats) return [] as QueueItem[];
    const items: QueueItem[] = [];
    const seenInvoices = new Set<string>();

    for (const invoice of stats.overdueInvoices ?? []) {
      seenInvoices.add(invoice.id);
      const note = duePhrase(invoice.dueAt);
      items.push({
        id: `overdue-${invoice.id}`,
        tone: dueTone(note),
        kind: 'Collect',
        title: invoice.number,
        detail: `${displayName(invoice.user)}${invoice.service ? ` · ${invoice.service.name}` : ''}`,
        amount: money(invoice.totalCents, invoice.currency),
        note,
        to: `/admin/invoices/${invoice.id}`,
      });
    }

    for (const invoice of stats.recentInvoices.filter((row) => row.status === 'unpaid')) {
      if (seenInvoices.has(invoice.id)) continue;
      seenInvoices.add(invoice.id);
      const note = duePhrase(invoice.dueAt || invoice.createdAt);
      items.push({
        id: `unpaid-${invoice.id}`,
        tone: dueTone(note),
        kind: 'Collect',
        title: invoice.number,
        detail: `${displayName(invoice.user)}${invoice.service ? ` · ${invoice.service.name}` : ''}`,
        amount: money(invoice.totalCents, invoice.currency),
        note,
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
        amount: ticket.priority,
        note: formatUpdated(ticket.updatedAt),
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
        amount: 'Suspended',
        note: formatUpdated(service.createdAt),
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
        amount: 'Pending',
        note: formatUpdated(service.createdAt),
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
        detail: logPreview(log.message),
        meta: `${log.category} · ${log.level}`,
        at: new Date(log.createdAt).getTime(),
        to: '/admin/logs',
        tone: log.level === 'error' || log.level === 'warn' ? 'is-warn' : '',
      });
    }

    const business = items
      .filter((item) => item.kind !== 'log')
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
    const grouped = new Map<string, FeedItem>();
    for (const log of items.filter((item) => item.kind === 'log').sort((a, b) => b.at - a.at)) {
      const key = `${log.title}|${log.meta}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count = (existing.count ?? 1) + 1;
        continue;
      }
      grouped.set(key, { ...log, count: 1 });
    }
    return [...business, ...[...grouped.values()].slice(0, 3)];
  }, [stats]);

  const clock = new Date(nowTick).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const dueToday = queue.filter((item) => item.note === 'Due today').length;
  const months = stats?.revenueByMonth ?? [];
  const picked = months[Math.min(ribbonMonth, Math.max(0, months.length - 1))];
  const fleetMix = [
    { label: 'Active', value: stats?.services.active ?? 0, tone: 'ok' },
    { label: 'Pending', value: stats?.services.pending ?? 0, tone: 'warn' },
    { label: 'Suspended', value: stats?.services.suspended ?? 0, tone: 'bad' },
  ].filter((row) => row.value > 0);
  const briefing = queue.length
    ? `${queue.length} ${queue.length === 1 ? 'item needs' : 'items need'} a look. ${
        stats?.services.suspended ? 'Fleet has suspended services.' : 'Fleet is up.'
      }`
    : 'Nothing waiting. Invoices, tickets, and the fleet are clear.';

  if (loading && !stats) {
    return (
      <div className="ops-user ops-home">
        <div className="ops-user__loading">
          <RefreshCw size={18} aria-hidden />
          Loading overview…
        </div>
      </div>
    );
  }

  return (
    <div className="ops-user ops-home">
      {error ? <div className="ops-user__alert is-error">{error}</div> : null}

      <header className="ops-home__mast">
        <div>
          <span>Command</span>
          <h1>Overview</h1>
          <p>{briefing}</p>
        </div>
        <div className="ops-home__mast-actions">
          <span className="ops-dash__live" title="Local time">
            <i /> {clock}
          </span>
          <Link to="/admin/analytics" className="ops-user__btn is-ghost">
            <BarChart3 size={14} /> Analytics
          </Link>
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
      </header>

      <section className="ops-home__stage">
        <div className="ops-home__stage-top">
          <div className="ops-home__figure">
            <span>To collect</span>
            <strong>{stats ? money(stats.invoices.unpaidCents) : '—'}</strong>
            <p>
              <b>{stats?.invoices.unpaid ?? 0} open</b>
              {overdue ? <em className="is-down">{overdue} overdue</em> : null}
              {dueToday ? <em className="is-today">{dueToday} due today</em> : null}
              {dueSoon && dueSoon !== (stats?.invoices.unpaid ?? 0) ? <span>{dueSoon} due this week</span> : null}
            </p>
          </div>
          <div className="ops-home__chips">
            <article className={monthDelta < 0 ? 'is-warn' : 'is-ok'}>
              <span>This month</span>
              <strong>{money(monthPaid)}</strong>
              <em>
                {monthDelta > 0 ? '+' : ''}
                {monthDelta}% vs last
              </em>
            </article>
            <article>
              <span>All-time</span>
              <strong>{stats ? money(stats.revenuePaidCents) : '—'}</strong>
              <em>{stats?.paidThisMonthCount ?? 0} paid this month</em>
            </article>
            <Link to="/admin/services" className={stats?.services.suspended ? 'is-warn' : 'is-ok'}>
              <span>Fleet</span>
              <strong>
                {stats?.services.active ?? 0}
                <i>/{stats?.services.total ?? 0}</i>
              </strong>
              <em>
                {activeRate}% active
                {renewalsDueSoon ? ` · ${renewalsDueSoon} renewing` : ''}
              </em>
            </Link>
            <Link to="/admin/tickets" className={tickets.hot ? 'is-warn' : 'is-ok'}>
              <span>Inbox</span>
              <strong>{tickets.open}</strong>
              <em>
                {tickets.awaiting} awaiting · {tickets.answered} answered
              </em>
            </Link>
          </div>
        </div>
        <div className="ops-home__toolbar">
          <span>Settled</span>
          {picked ? (
            <strong>
              {picked.label}
              <b>{money(picked.revenueCents)}</b>
            </strong>
          ) : (
            <strong>No months yet</strong>
          )}
          <Link to="/admin/analytics">
            Full analytics <ArrowRight size={13} />
          </Link>
        </div>
        {months.length ? (
          <RevenueRibbon months={months} selected={ribbonMonth} onSelect={setRibbonMonth} />
        ) : (
          <p className="ops-home__quiet">Revenue trend appears after the first paid invoice.</p>
        )}
      </section>

      <div className="ops-home__work">
        <section className="ops-user__panel ops-home__card">
          <header>
            <span>Priority</span>
            <h2>Needs action</h2>
            <em className={queue.length ? 'is-hot' : ''}>{queue.length ? `${queue.length} open` : 'Clear'}</em>
          </header>
          {queue.length ? (
            <div className="ops-home__queue">
              {queue.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`ops-home__row is-${item.tone}`}
                  onClick={() => navigate(item.to)}
                >
                  <em>{item.kind}</em>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <b>
                    {item.amount}
                    <small>{item.note}</small>
                  </b>
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

        <div className="ops-home__side">
          <section className="ops-user__panel ops-home__card">
            <header>
              <span>Floor</span>
              <h2>Fleet and calendar</h2>
              <Link to="/admin/services">
                Fleet <ArrowRight size={13} />
              </Link>
            </header>
            <div className="ops-home__mix" aria-hidden>
              {fleetMix.length ? (
                fleetMix.map((row) => <i key={row.label} className={`is-${row.tone}`} style={{ flex: row.value }} />)
              ) : (
                <i className="is-empty" style={{ flex: 1 }} />
              )}
            </div>
            <div className="ops-home__mix-rows">
              {(fleetMix.length ? fleetMix : [{ label: 'Active', value: 0, tone: 'ok' }]).map((row) => (
                <span key={row.label}>
                  <i className={`is-${row.tone}`} />
                  {row.label}
                  <strong>{row.value}</strong>
                </span>
              ))}
            </div>
            <dl className="ops-home__facts">
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
                <dt>Clients</dt>
                <dd>{linkRate}% linked</dd>
              </div>
            </dl>
            <p className="ops-home__note">
              {stats?.products.active ?? 0}/{stats?.products.total ?? 0} products live
              {(stats?.newClients30d ?? 0) > 0 ? ` · +${stats?.newClients30d} clients / 30d` : ''}
            </p>
          </section>

          <section className="ops-user__panel ops-home__card">
            <header>
              <span>Provisioning</span>
              <h2>Newest services</h2>
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

          <nav className="ops-home__jump" aria-label="Quick ops">
            <Link to="/admin/users">
              <Users size={14} /> Users
            </Link>
            <Link to="/admin/invoices">
              <FileText size={14} /> Ledger
            </Link>
            <Link to="/admin/tickets">
              <Ticket size={14} /> Tickets
            </Link>
            <Link to="/admin/products">
              <Package size={14} /> Catalog
            </Link>
            <Link to="/admin/settings">
              <Settings size={14} /> Settings
            </Link>
          </nav>
        </div>
      </div>

      <section className="ops-user__panel ops-home__card">
        <header>
          <span>Stream</span>
          <h2>Recent activity</h2>
          <Link to="/admin/logs">
            Logs <ArrowRight size={13} />
          </Link>
        </header>
        <div className="ops-home__feed" aria-label="Recent activity">
          {feed.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`ops-home__feed-item ${item.tone || ''}`}
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
                <strong>
                  {item.title}
                  {item.count && item.count > 1 ? <i> ×{item.count}</i> : null}
                </strong>
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
  );
}
