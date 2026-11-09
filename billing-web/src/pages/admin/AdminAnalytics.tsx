import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  RefreshCw,
  Server,
  TicketPercent,
  Users,
  Wallet,
} from 'lucide-react';
import { api, ApiError, money } from '../../lib/api';
import { CategoryMark } from '../../lib/icons';
import { useBranding } from '../../context/BrandingContext';

type AnalyticsPayload = {
  generatedAt: string;
  kpis: {
    revenueAllTimeCents: number;
    paidAllTimeCount: number;
    revenueThisMonthCents: number;
    revenueLastMonthCents: number;
    revenueMomPct: number;
    revenueThisWeekCents: number;
    revenuePriorWeekCents: number;
    revenueWowPct: number;
    paidThisMonthCount: number;
    unpaidCount: number;
    unpaidCents: number;
    overdueCount: number;
    cancelledCount: number;
    cancelledCents: number;
    clients: number;
    linkedClients: number;
    newClients30d: number;
    activeServices: number;
    renewalsDueSoon: number;
    arpuCents: number;
    panelLinkRate: number;
    creditOutstandingCents: number;
    creditHolders: number;
    collectionRate: number;
    avgDaysToPay: number;
  };
  series: Array<{
    label: string;
    revenueCents: number;
    paidCount: number;
    newClients: number;
    servicesCreated: number;
  }>;
  daily: Array<{ label: string; revenueCents: number; paidCount: number }>;
  services: {
    total: number;
    active: number;
    pending_payment: number;
    suspended: number;
    cancelled: number;
  };
  revenueByCategory: Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    revenueCents: number;
    paidCount: number;
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    categoryName: string;
    revenueCents: number;
    paidCount: number;
  }>;
  invoices: {
    paid: number;
    unpaid: number;
    cancelled: number;
    paidCents: number;
    unpaidCents: number;
    cancelledCents: number;
  };
  overdueInvoices: Array<{
    id: string;
    number: string;
    totalCents: number;
    currency: string;
    dueAt: string;
    user: { username: string; firstName?: string | null; lastName?: string | null };
    service: { name: string } | null;
  }>;
  tickets: {
    open: number;
    awaiting: number;
    answered: number;
    closed: number;
  };
  coupons: {
    active: number;
    redemptions30d: number;
    discountCents30d: number;
    creditCents30d: number;
  };
  products: { total: number; active: number };
  logs: { info: number; warn: number; error: number; total: number };
};

type Range = '6m' | '12m';

function pctTone(value: number) {
  if (value > 0) return 'is-up';
  if (value < 0) return 'is-down';
  return 'is-flat';
}

function formatGenerated(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function displayName(user: { username: string; firstName?: string | null; lastName?: string | null }) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return full || user.username;
}

function daysOverdue(dueAt: string) {
  return Math.max(1, Math.round((Date.now() - new Date(dueAt).getTime()) / (24 * 60 * 60 * 1000)));
}

function chartValue(
  row: AnalyticsPayload['series'][number],
  mode: 'revenue' | 'clients' | 'services',
) {
  if (mode === 'clients') return row.newClients;
  if (mode === 'services') return row.servicesCreated;
  return row.revenueCents;
}

function TrendChart({
  series,
  mode,
  currency,
  selected,
  onSelect,
}: {
  series: AnalyticsPayload['series'];
  mode: 'revenue' | 'clients' | 'services';
  currency: string;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const width = 720;
  const height = 248;
  const pad = { left: 12, right: 12, top: 18, bottom: 28 };
  const values = series.map((row) => chartValue(row, mode));
  const max = Math.max(1, ...values);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const points = values.map((value, index) => {
    const x =
      pad.left + (series.length <= 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
    const y = pad.top + innerH - (value / max) * innerH;
    return { x, y, value, index };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const base = pad.top + innerH;
  const area = points.length
    ? `${points[0].x},${base} ${line} ${points[points.length - 1].x},${base}`
    : '';
  const active = points[selected] ?? points[points.length - 1];
  const peak = points.reduce(
    (best, point) => (point.value > best.value ? point : best),
    points[0] ?? { x: 0, y: 0, value: 0, index: -1 },
  );

  return (
    <div className={`ops-analytics__plot is-${mode}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
        {[0.25, 0.5, 0.75, 1].map((step) => {
          const y = pad.top + innerH * (1 - step);
          return (
            <line
              key={step}
              className="ops-analytics__gridline"
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
            />
          );
        })}
        {area ? <polygon className="ops-analytics__area" points={area} /> : null}
        {line ? <polyline className="ops-analytics__line" points={line} /> : null}
        {active ? (
          <line
            className="ops-analytics__guide"
            x1={active.x}
            x2={active.x}
            y1={pad.top}
            y2={base}
          />
        ) : null}
        {points.map((point) => (
          <g key={point.index}>
            <circle
              className={`ops-analytics__dot${point.index === selected ? ' is-on' : ''}${
                peak && point.index === peak.index && point.value > 0 ? ' is-peak' : ''
              }`}
              cx={point.x}
              cy={point.y}
              r={point.index === selected ? 6.5 : 4}
              onClick={() => onSelect(point.index)}
            />
            <text className="ops-analytics__xlabel" x={point.x} y={height - 8} textAnchor="middle">
              {series[point.index]?.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="ops-analytics__months" role="tablist" aria-label="Months">
        {series.map((row, index) => (
          <button
            key={`${row.label}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === selected}
            className={index === selected ? 'is-on' : ''}
            onClick={() => onSelect(index)}
          >
            {row.label}
          </button>
        ))}
      </div>
      {series[selected] ? (
        <div className="ops-analytics__readout">
          <div>
            <span>{series[selected].label}</span>
            <strong>
              {mode === 'revenue'
                ? money(series[selected].revenueCents, currency)
                : chartValue(series[selected], mode)}
            </strong>
          </div>
          <div>
            <span>Paid invoices</span>
            <strong>{series[selected].paidCount}</strong>
          </div>
          <div>
            <span>New clients</span>
            <strong>{series[selected].newClients}</strong>
          </div>
          <div>
            <span>Services created</span>
            <strong>{series[selected].servicesCreated}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Sparkline({
  daily,
  currency,
  maxDaily,
}: {
  daily: AnalyticsPayload['daily'];
  currency: string;
  maxDaily: number;
}) {
  const width = 420;
  const height = 64;
  const pad = 6;
  const points = daily.map((row, index) => {
    const x = pad + (daily.length <= 1 ? (width - pad * 2) / 2 : (index / (daily.length - 1)) * (width - pad * 2));
    const y = height - pad - (row.revenueCents / maxDaily) * (height - pad * 2);
    return `${x},${y}`;
  });
  const total = daily.reduce((sum, row) => sum + row.revenueCents, 0);
  return (
    <div className="ops-analytics__spark" aria-label="Last 14 days revenue">
      <div className="ops-analytics__spark-head">
        <span>Last 14 days</span>
        <strong>{money(total, currency)}</strong>
      </div>
      {total <= 0 ? <p>No settled revenue in this window.</p> : null}
      {total > 0 ? (
      <svg viewBox={`0 0 ${width} ${height}`} className="ops-analytics__spark-svg">
        <polyline points={points.join(' ')} />
        {daily.map((row, index) => {
          const x = pad + (daily.length <= 1 ? (width - pad * 2) / 2 : (index / (daily.length - 1)) * (width - pad * 2));
          const y = height - pad - (row.revenueCents / maxDaily) * (height - pad * 2);
          return <circle key={row.label} cx={x} cy={y} r={2.4}>
            <title>{`${row.label}: ${money(row.revenueCents, currency)}`}</title>
          </circle>;
        })}
      </svg>
      ) : null}
    </div>
  );
}

function ShareRing({
  segments,
  center,
  caption,
  hideEmpty = false,
  hideList = false,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string; display?: string }>;
  center: string;
  caption: string;
  hideEmpty?: boolean;
  hideList?: boolean;
}) {
  const total = Math.max(0, segments.reduce((sum, item) => sum + item.value, 0));
  let cursor = 0;
  const stops = segments
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = cursor;
      const span = total > 0 ? (item.value / total) * 100 : 0;
      cursor += span;
      return `${item.color} ${start}% ${cursor}%`;
    });
  return (
    <div className="ops-intel__ring">
      <div
        className="ops-intel__ring-dial"
        style={{
          background: stops.length
            ? `conic-gradient(${stops.join(', ')})`
            : 'conic-gradient(color-mix(in srgb, var(--ops-line) 80%, transparent) 0 100%)',
        }}
      >
        <div>
          <strong>{center}</strong>
          <small>{caption}</small>
        </div>
      </div>
      {hideList ? null : (
      <ul>
        {segments.filter((item) => !hideEmpty || item.value > 0).map((item) => (
          <li key={item.key} className={item.value > 0 ? '' : 'is-zero'}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <b>{item.display ?? item.value}</b>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

export function AdminAnalytics() {
  const branding = useBranding();
  const currency = branding.currency || 'GBP';
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('12m');
  const [chartMode, setChartMode] = useState<'revenue' | 'clients' | 'services'>('revenue');
  const [selectedMonth, setSelectedMonth] = useState(11);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setData(await api<AnalyticsPayload>('/admin/analytics'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const series = useMemo(() => {
    const rows = data?.series ?? [];
    return range === '6m' ? rows.slice(-6) : rows;
  }, [data, range]);

  useEffect(() => {
    setSelectedMonth(Math.max(0, series.length - 1));
  }, [range, series.length]);

  const maxDaily = Math.max(1, ...(data?.daily.map((row) => row.revenueCents) ?? [1]));
  const maxProduct = Math.max(1, ...(data?.topProducts.map((row) => row.revenueCents) ?? [1]));
  const categoryTotal = Math.max(
    1,
    (data?.revenueByCategory ?? []).reduce((sum, row) => sum + row.revenueCents, 0),
  );

  const kpis = data?.kpis;
  const pressure =
    (kpis?.overdueCount ?? 0) + (data?.services.suspended ?? 0) + (data?.tickets.open ?? 0);

  if (loading && !data) {
    return (
      <div className="ops-users ops-analytics">
        <div className="ops-users__empty">
          <RefreshCw size={22} />
          <h3>Loading analytics…</h3>
        </div>
      </div>
    );
  }

  const fleetActiveRate = data?.services.total
    ? Math.round(((data.services.active || 0) / data.services.total) * 1000) / 10
    : 0;

  return (
    <div className="ops-users ops-analytics ops-intel">
      <header className="ops-intel__mast">
        <div>
          <span>Intelligence</span>
          <h1>Analytics</h1>
          <p>Money, fleet, and support in one desk. Pick a month on the chart to inspect it.</p>
        </div>
        <div className="ops-intel__mast-actions">
          <span className="ops-analytics__live">
            <i /> {formatGenerated(data?.generatedAt) || '—'}
          </span>
          <Link to="/admin" className="ops-user__btn is-ghost">Overview</Link>
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

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      <section className="ops-intel__stage">
        <div className="ops-intel__stage-top">
          <div className="ops-intel__figure">
            <span>Settled all-time</span>
            <strong>{money(kpis?.revenueAllTimeCents ?? 0, currency)}</strong>
            <p>
              <b>{money(kpis?.revenueThisMonthCents ?? 0, currency)}</b> this month
              <em className={pctTone(kpis?.revenueMomPct ?? 0)}>
                {(kpis?.revenueMomPct ?? 0) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {(kpis?.revenueMomPct ?? 0) > 0 ? '+' : ''}
                {kpis?.revenueMomPct ?? 0}%
              </em>
            </p>
          </div>
          <div className="ops-intel__chips">
            <article className={(kpis?.revenueWowPct ?? 0) >= 0 ? 'is-ok' : 'is-warn'}>
              <span>This week</span>
              <strong>{money(kpis?.revenueThisWeekCents ?? 0, currency)}</strong>
              <em>{(kpis?.revenueWowPct ?? 0) > 0 ? '+' : ''}{kpis?.revenueWowPct ?? 0}% WoW</em>
            </article>
            <article>
              <span>Collection</span>
              <strong>{kpis?.collectionRate ?? 0}%</strong>
              <em>paid vs open</em>
            </article>
            <article>
              <span>ARPU</span>
              <strong>{money(kpis?.arpuCents ?? 0, currency)}</strong>
              <em>month / active</em>
            </article>
            <article className={pressure ? 'is-warn' : 'is-ok'}>
              <span>Pressure</span>
              <strong>{pressure}</strong>
              <em>items to watch</em>
            </article>
          </div>
        </div>
        <div className="ops-intel__toolbar">
          <span>Trend</span>
          <div className="ops-analytics__toggles">
            <div className="ops-analytics__seg" role="group" aria-label="Metric">
              {(['revenue', 'clients', 'services'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={chartMode === value ? 'is-on' : ''}
                  onClick={() => setChartMode(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <div className="ops-analytics__seg" role="group" aria-label="Range">
              <button type="button" className={range === '6m' ? 'is-on' : ''} onClick={() => setRange('6m')}>6m</button>
              <button type="button" className={range === '12m' ? 'is-on' : ''} onClick={() => setRange('12m')}>12m</button>
            </div>
          </div>
        </div>
        <TrendChart
          series={series}
          mode={chartMode}
          currency={currency}
          selected={Math.min(selectedMonth, Math.max(0, series.length - 1))}
          onSelect={setSelectedMonth}
        />
        <Sparkline daily={data?.daily ?? []} currency={currency} maxDaily={maxDaily} />
      </section>

      <section className="ops-intel__rail" aria-label="Key metrics">
        {(
          [
            { label: 'Paid this month', value: String(kpis?.paidThisMonthCount ?? 0), hint: `${kpis?.paidAllTimeCount ?? 0} all-time`, icon: CreditCard },
            { label: 'Clients', value: String(kpis?.clients ?? 0), hint: `+${kpis?.newClients30d ?? 0} / 30d`, icon: Users },
            { label: 'Active fleet', value: String(kpis?.activeServices ?? 0), hint: `${data?.services.total ?? 0} total`, icon: Server },
            { label: 'Days to pay', value: String(kpis?.avgDaysToPay ?? 0), hint: 'last 90 days', icon: Clock3 },
            { label: 'Collectable', value: money(kpis?.unpaidCents ?? 0, currency), hint: `${kpis?.overdueCount ?? 0} overdue`, icon: CircleDollarSign, to: '/admin/invoices', warn: Boolean(kpis?.unpaidCount) },
            { label: 'Credits out', value: money(kpis?.creditOutstandingCents ?? 0, currency), hint: `${kpis?.creditHolders ?? 0} holders`, icon: Wallet },
          ] as const
        ).map((card) => {
          const Icon = card.icon;
          const body = (
            <>
              <Icon size={14} />
              <span>{card.label}</span>
              <strong className={'warn' in card && card.warn ? 'is-down' : undefined}>{card.value}</strong>
              <em>{card.hint}</em>
            </>
          );
          return 'to' in card && card.to ? (
            <Link key={card.label} to={card.to}>{body}</Link>
          ) : (
            <article key={card.label}>{body}</article>
          );
        })}
      </section>

      {(kpis?.overdueCount || data?.services.suspended || kpis?.renewalsDueSoon) ? (
        <div className="ops-analytics__attention" role="status">
          {kpis?.overdueCount ? (
            <Link to="/admin/invoices" className="is-bad">
              <AlertTriangle size={14} />
              <strong>{kpis.overdueCount} overdue</strong>
              <span>{money(kpis.unpaidCents, currency)} still open</span>
            </Link>
          ) : null}
          {data?.services.suspended ? (
            <Link to="/admin/services" className="is-warn">
              <Server size={14} />
              <strong>{data.services.suspended} suspended</strong>
              <span>Fleet needs attention</span>
            </Link>
          ) : null}
          {kpis?.renewalsDueSoon ? (
            <Link to="/admin/services" className="is-info">
              <Clock3 size={14} />
              <strong>{kpis.renewalsDueSoon} renewals</strong>
              <span>Due in the next 7 days</span>
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="ops-intel__atlas">
        <article className="ops-user__panel ops-intel__card">
          <header>
            <span>Catalog</span>
            <h2>Where the money landed</h2>
          </header>
          {(data?.revenueByCategory.length ?? 0) > 0 ? (
            <div className="ops-intel__split">
            <ShareRing
              center={money(categoryTotal, currency)}
              caption="settled"
              hideEmpty
              hideList
              segments={(data?.revenueByCategory ?? []).map((row) => ({
                key: row.id,
                label: row.name,
                value: row.revenueCents,
                color: row.color,
                display: money(row.revenueCents, currency),
              }))}
            />
            <div className="ops-intel__cats">
            {(data?.revenueByCategory ?? []).filter((row) => row.revenueCents > 0).slice(0, 5).map((row) => (
              <div key={row.id}>
                <CategoryMark icon={row.icon} color={row.color} size={26} className="ops-services__mark" />
                <span>
                  <strong>{row.name}</strong>
                  <small>{Math.round((row.revenueCents / categoryTotal) * 100)}% · {row.paidCount} paid</small>
                </span>
                <b>{money(row.revenueCents, currency)}</b>
              </div>
            ))}
            </div>
            </div>
          ) : (
            <p className="ops-analytics__empty-copy">No settled category revenue yet.</p>
          )}
        </article>

        <article className="ops-user__panel ops-intel__card">
          <header>
            <span>Fleet</span>
            <h2>Service mix</h2>
          </header>
          <ShareRing
            center={String(data?.services.total ?? 0)}
            caption="services"
            hideEmpty
            segments={[
              { key: 'active', label: 'Active', value: data?.services.active ?? 0, color: '#34d399' },
              { key: 'pending', label: 'Pending', value: data?.services.pending_payment ?? 0, color: '#fbbf24' },
              { key: 'suspended', label: 'Suspended', value: data?.services.suspended ?? 0, color: '#f87171' },
              { key: 'cancelled', label: 'Cancelled', value: data?.services.cancelled ?? 0, color: '#64748b' },
            ]}
          />
          <div className="ops-analytics__mini-links">
            <Link to="/admin/services">Open fleet</Link>
            <span>{fleetActiveRate}% active · {kpis?.renewalsDueSoon ?? 0} renewals ≤7d</span>
          </div>
        </article>

        <article className="ops-user__panel ops-intel__card">
          <header>
            <span>Support</span>
            <h2>Ticket load</h2>
          </header>
          <ShareRing
            center={String((data?.tickets.open ?? 0) + (data?.tickets.awaiting ?? 0))}
            caption="open now"
            hideEmpty
            segments={[
              { key: 'open', label: 'Open', value: data?.tickets.open ?? 0, color: '#fbbf24' },
              { key: 'awaiting', label: 'Awaiting', value: data?.tickets.awaiting ?? 0, color: '#38bdf8' },
              { key: 'answered', label: 'Answered', value: data?.tickets.answered ?? 0, color: '#34d399' },
              { key: 'closed', label: 'Closed', value: data?.tickets.closed ?? 0, color: '#94a3b8' },
            ]}
          />
          <div className="ops-analytics__mini-links">
            <Link to="/admin/tickets">Open inbox</Link>
            <span>{data?.logs.error ?? 0} errors · {data?.logs.warn ?? 0} warns / 30d</span>
          </div>
        </article>
      </section>

      <section className="ops-intel__lower">
        <article className="ops-user__panel ops-intel__card">
          <header>
            <span>Leaders</span>
            <h2>Top products</h2>
            <Link to="/admin/products">Catalog</Link>
          </header>
          <div className="ops-analytics__rank">
            {(data?.topProducts ?? []).map((row, index) => (
              <div key={row.id} className="ops-analytics__rank-row">
                <em>{index + 1}</em>
                <CategoryMark icon={row.icon} color={row.color} size={28} className="ops-services__mark" />
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.categoryName} · {row.paidCount} paid</small>
                  <i aria-hidden>
                    <span style={{ width: `${Math.max(6, Math.round((row.revenueCents / maxProduct) * 100))}%`, background: row.color }} />
                  </i>
                </div>
                <b>{money(row.revenueCents, currency)}</b>
              </div>
            ))}
            {!data?.topProducts.length ? <p className="ops-analytics__empty-copy">No product revenue yet.</p> : null}
          </div>
        </article>

        <article className="ops-user__panel ops-intel__card">
          <header>
            <span>Collect</span>
            <h2>Overdue queue</h2>
            <Link to="/admin/invoices">Ledger</Link>
          </header>
          <div className="ops-analytics__queue">
            {(data?.overdueInvoices ?? []).map((invoice) => (
              <Link key={invoice.id} to={`/admin/invoices/${invoice.id}`} className="ops-analytics__queue-row">
                <div>
                  <strong>{invoice.number}</strong>
                  <small>
                    {displayName(invoice.user)}
                    {invoice.service ? ` · ${invoice.service.name}` : ''}
                  </small>
                </div>
                <span>
                  <b>{money(invoice.totalCents, invoice.currency || currency)}</b>
                  <em>{daysOverdue(invoice.dueAt)}d late</em>
                </span>
              </Link>
            ))}
            {!data?.overdueInvoices.length ? (
              <p className="ops-analytics__empty-copy">Nothing past due.</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="ops-intel__band">
        <div>
          <TicketPercent size={15} />
          <div>
            <span>Promotions · 30d</span>
            <strong>{data?.coupons.redemptions30d ?? 0} redemptions</strong>
          </div>
          <em>{data?.coupons.active ?? 0} live codes · {money(data?.coupons.discountCents30d ?? 0, currency)} discounted</em>
          <Link to="/admin/coupons">Coupons</Link>
        </div>
        <div>
          <Wallet size={15} />
          <div>
            <span>Money parked</span>
            <strong>{money(kpis?.creditOutstandingCents ?? 0, currency)}</strong>
          </div>
          <em>
            {kpis?.creditHolders ?? 0} holders · {money(kpis?.cancelledCents ?? 0, currency)} cancelled
          </em>
          <Link to="/admin/users">Clients</Link>
        </div>
        <div>
          <Activity size={15} />
          <div>
            <span>Health</span>
            <strong>{kpis?.panelLinkRate ?? 0}% linked</strong>
          </div>
          <em>
            {kpis?.collectionRate ?? 0}% collected · {data?.products.active ?? 0}/{data?.products.total ?? 0} products live
          </em>
          <Link to="/admin/logs">Logs</Link>
        </div>
      </section>
    </div>
  );
}
