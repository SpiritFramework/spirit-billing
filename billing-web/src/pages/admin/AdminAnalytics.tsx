import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LifeBuoy,
  Package,
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

function MixBar({
  segments,
}: {
  segments: Array<{ key: string; label: string; value: number; tone: string }>;
}) {
  const total = Math.max(1, segments.reduce((sum, item) => sum + item.value, 0));
  return (
    <div className="ops-analytics__compose">
      <div className="ops-analytics__compose-track" aria-hidden>
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span
              key={segment.key}
              className={segment.tone}
              style={{ width: `${Math.max(2, (segment.value / total) * 100)}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          ) : null,
        )}
      </div>
      <ul>
        {segments.map((segment) => (
          <li key={segment.key}>
            <i className={segment.tone} />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
            <em>{Math.round((segment.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
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

  const chartValues = useMemo(() => {
    if (chartMode === 'clients') return series.map((row) => row.newClients);
    if (chartMode === 'services') return series.map((row) => row.servicesCreated);
    return series.map((row) => row.revenueCents);
  }, [series, chartMode]);

  const maxChart = Math.max(1, ...chartValues);
  const maxDaily = Math.max(1, ...(data?.daily.map((row) => row.revenueCents) ?? [1]));
  const maxCategory = Math.max(1, ...(data?.revenueByCategory.map((row) => row.revenueCents) ?? [1]));
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

  return (
    <div className="ops-users ops-analytics">
      <section className="ops-analytics__hero">
        <div className="ops-analytics__hero-main">
          <div className="ops-analytics__hero-copy">
            <span>Intelligence</span>
            <h1>{money(kpis?.revenueAllTimeCents ?? 0, currency)}</h1>
            <p>
              Settled all-time
              {kpis ? (
                <>
                  {' '}
                  · <strong>{money(kpis.revenueThisMonthCents, currency)}</strong> this month
                  <em className={pctTone(kpis.revenueMomPct)}>
                    {kpis.revenueMomPct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {kpis.revenueMomPct > 0 ? '+' : ''}
                    {kpis.revenueMomPct}%
                  </em>
                </>
              ) : null}
            </p>
          </div>
          <div className="ops-analytics__hero-actions">
            <span className="ops-analytics__live">
              <i /> {formatGenerated(data?.generatedAt)}
            </span>
            <Link to="/admin" className="ops-user__btn is-ghost">
              Overview
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

        <div className="ops-analytics__pulses" aria-label="Analytics pulse">
          <article className={`ops-analytics__pulse${(kpis?.revenueWowPct ?? 0) >= 0 ? ' is-ok' : ' is-warn'}`}>
            <span>Week</span>
            <strong>{money(kpis?.revenueThisWeekCents ?? 0, currency)}</strong>
            <em className={pctTone(kpis?.revenueWowPct ?? 0)}>
              {(kpis?.revenueWowPct ?? 0) > 0 ? '+' : ''}
              {kpis?.revenueWowPct ?? 0}% WoW
            </em>
          </article>
          <article className="ops-analytics__pulse">
            <span>Collection</span>
            <strong>{kpis?.collectionRate ?? 0}%</strong>
            <em>paid vs open invoices</em>
          </article>
          <article className="ops-analytics__pulse">
            <span>ARPU</span>
            <strong>{money(kpis?.arpuCents ?? 0, currency)}</strong>
            <em>this month / active</em>
          </article>
          <article className={`ops-analytics__pulse${pressure ? ' is-warn' : ' is-ok'}`}>
            <span>Pressure</span>
            <strong>{pressure}</strong>
            <em>overdue + suspended + open</em>
          </article>
        </div>
      </section>

      {error ? <div className="ds-alert ds-alert--error">{error}</div> : null}

      {(kpis?.overdueCount || data?.services.suspended || kpis?.renewalsDueSoon) ? (
        <div className="ops-analytics__attention" role="status">
          {kpis?.overdueCount ? (
            <Link to="/admin/invoices" className="is-bad">
              <AlertTriangle size={14} />
              <strong>{kpis.overdueCount} overdue</strong>
              <span>{money(kpis.unpaidCents, currency)} unpaid open</span>
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

      <section className="ops-analytics__kpis" aria-label="Key metrics">
        {(
          [
            {
              label: 'Paid this month',
              value: String(kpis?.paidThisMonthCount ?? 0),
              hint: `${kpis?.paidAllTimeCount ?? 0} settled all-time`,
              icon: CreditCard,
            },
            {
              label: 'Clients',
              value: String(kpis?.clients ?? 0),
              hint: `+${kpis?.newClients30d ?? 0} / 30d · ${kpis?.panelLinkRate ?? 0}% linked`,
              icon: Users,
            },
            {
              label: 'Active fleet',
              value: String(kpis?.activeServices ?? 0),
              hint: `${data?.services.total ?? 0} total services`,
              icon: Server,
            },
            {
              label: 'Avg days to pay',
              value: String(kpis?.avgDaysToPay ?? 0),
              hint: 'Paid invoices · last 90 days',
              icon: Clock3,
            },
            {
              label: 'Collectable',
              value: money(kpis?.unpaidCents ?? 0, currency),
              hint: `${kpis?.unpaidCount ?? 0} unpaid · ${kpis?.overdueCount ?? 0} overdue`,
              icon: CircleDollarSign,
              warn: Boolean(kpis?.unpaidCount),
              to: '/admin/invoices',
            },
            {
              label: 'Credits out',
              value: money(kpis?.creditOutstandingCents ?? 0, currency),
              hint: `${kpis?.creditHolders ?? 0} holders`,
              icon: Wallet,
            },
          ] as const
        ).map((card) => {
          const Icon = card.icon;
          const body = (
            <>
              <span className="ops-analytics__kpi-icon" aria-hidden>
                <Icon size={14} />
              </span>
              <small>{card.label}</small>
              <strong className={'warn' in card && card.warn ? 'is-down' : undefined}>{card.value}</strong>
              <em>{card.hint}</em>
            </>
          );
          return 'to' in card && card.to ? (
            <Link key={card.label} to={card.to} className="ops-analytics__kpi">
              {body}
            </Link>
          ) : (
            <article key={card.label} className="ops-analytics__kpi">
              {body}
            </article>
          );
        })}
      </section>

      <div className="ops-analytics__board">
        <section className="ops-user__panel ops-analytics__panel ops-analytics__panel--chart">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <BarChart3 size={14} />
            </span>
            <div>
              <h2>Trend desk</h2>
              <p>Revenue, signups, and new services over time.</p>
            </div>
            <div className="ops-analytics__toggles">
              <div className="ops-analytics__seg" role="group" aria-label="Metric">
                {(
                  [
                    ['revenue', 'Revenue'],
                    ['clients', 'Clients'],
                    ['services', 'Services'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={chartMode === value ? 'is-on' : ''}
                    onClick={() => setChartMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="ops-analytics__seg" role="group" aria-label="Range">
                <button type="button" className={range === '6m' ? 'is-on' : ''} onClick={() => setRange('6m')}>
                  6m
                </button>
                <button type="button" className={range === '12m' ? 'is-on' : ''} onClick={() => setRange('12m')}>
                  12m
                </button>
              </div>
            </div>
          </header>

          <div
            className={`ops-analytics__chart is-${chartMode}`}
            aria-label="Trend chart"
            style={{ gridTemplateColumns: `repeat(${Math.max(series.length, 1)}, minmax(0, 1fr))` }}
          >
            {series.map((row, index) => {
              const raw =
                chartMode === 'clients'
                  ? row.newClients
                  : chartMode === 'services'
                    ? row.servicesCreated
                    : row.revenueCents;
              const height = Math.max(raw > 0 ? 8 : 3, Math.round((raw / maxChart) * 100));
              const isCurrent = index === series.length - 1;
              return (
                <div
                  key={`${row.label}-${index}`}
                  className={`ops-analytics__bar${isCurrent ? ' is-current' : ''}${raw <= 0 ? ' is-empty' : ''}`}
                  title={
                    chartMode === 'revenue'
                      ? `${row.label}: ${money(row.revenueCents, currency)} · ${row.paidCount} paid`
                      : `${row.label}: ${raw}`
                  }
                >
                  <span className="ops-analytics__bar-value">
                    {chartMode === 'revenue'
                      ? raw > 0
                        ? money(raw, currency)
                        : '—'
                      : raw || '—'}
                  </span>
                  <span className="ops-analytics__bar-track" aria-hidden>
                    <i style={{ height: `${height}%` }} />
                  </span>
                  <strong>{row.label}</strong>
                  <small>
                    {chartMode === 'revenue'
                      ? `${row.paidCount} paid`
                      : chartMode === 'clients'
                        ? 'new'
                        : 'created'}
                  </small>
                </div>
              );
            })}
          </div>

          <div className="ops-analytics__spark" aria-label="Last 14 days revenue">
            <div className="ops-analytics__spark-head">
              <span>Last 14 days</span>
              <strong>
                {money(
                  (data?.daily ?? []).reduce((sum, row) => sum + row.revenueCents, 0),
                  currency,
                )}
              </strong>
            </div>
            <div className="ops-analytics__spark-bars">
              {(data?.daily ?? []).map((row) => (
                <span
                  key={row.label}
                  title={`${row.label}: ${money(row.revenueCents, currency)}`}
                  style={{
                    height: `${Math.max(row.revenueCents > 0 ? 12 : 4, Math.round((row.revenueCents / maxDaily) * 100))}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="ops-analytics__side">
          <section className="ops-user__panel ops-analytics__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <Activity size={14} />
              </span>
              <div>
                <h2>Health snapshot</h2>
                <p>Collection, panel link, and ops noise.</p>
              </div>
            </header>
            <div className="ops-analytics__gauges">
              {(
                [
                  ['Collection', kpis?.collectionRate ?? 0, '%'],
                  ['Panel linked', kpis?.panelLinkRate ?? 0, '%'],
                  ['Fleet active', data?.services.total ? Math.round(((data.services.active || 0) / data.services.total) * 1000) / 10 : 0, '%'],
                ] as const
              ).map(([label, value, suffix]) => (
                <div key={label} className="ops-analytics__gauge">
                  <div className="ops-analytics__gauge-ring" style={{ ['--p' as string]: `${Math.min(100, value)}` }}>
                    <strong>
                      {value}
                      <small>{suffix}</small>
                    </strong>
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="ops-analytics__facts is-tight">
              <div>
                <span>Log noise 30d</span>
                <strong>
                  {data?.logs.warn ?? 0} warn · {data?.logs.error ?? 0} err
                </strong>
              </div>
              <div>
                <span>Products live</span>
                <strong>
                  {data?.products.active ?? 0}/{data?.products.total ?? 0}
                </strong>
              </div>
            </div>
          </section>

          <section className="ops-user__panel ops-analytics__panel">
            <header>
              <span className="ops-user__panel-icon" aria-hidden>
                <CreditCard size={14} />
              </span>
              <div>
                <h2>Invoice mix</h2>
                <p>Paid, open, and cancelled volume.</p>
              </div>
            </header>
            <MixBar
              segments={[
                { key: 'paid', label: 'Paid', value: data?.invoices.paid ?? 0, tone: 'is-ok' },
                { key: 'unpaid', label: 'Unpaid', value: data?.invoices.unpaid ?? 0, tone: 'is-warn' },
                {
                  key: 'cancelled',
                  label: 'Cancelled',
                  value: data?.invoices.cancelled ?? 0,
                  tone: 'is-mute',
                },
              ]}
            />
            <div className="ops-analytics__facts is-tight">
              <div>
                <span>Paid value</span>
                <strong>{money(data?.invoices.paidCents ?? 0, currency)}</strong>
              </div>
              <div>
                <span>Open value</span>
                <strong className={(data?.invoices.unpaid ?? 0) > 0 ? 'is-down' : undefined}>
                  {money(data?.invoices.unpaidCents ?? 0, currency)}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="ops-analytics__grid is-three">
        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <Package size={14} />
            </span>
            <div>
              <h2>Revenue by category</h2>
              <p>Share of settled money · 12 months.</p>
            </div>
          </header>
          {(data?.revenueByCategory.length ?? 0) > 0 ? (
            <>
              <div className="ops-analytics__compose-track is-thick" aria-hidden>
                {(data?.revenueByCategory ?? []).map((row) => (
                  <span
                    key={row.id}
                    style={{
                      width: `${Math.max(3, (row.revenueCents / categoryTotal) * 100)}%`,
                      background: row.color,
                    }}
                    title={`${row.name}: ${money(row.revenueCents, currency)}`}
                  />
                ))}
              </div>
              <div className="ops-analytics__stack">
                {(data?.revenueByCategory ?? []).map((row) => (
                  <div key={row.id} className="ops-analytics__stack-row">
                    <CategoryMark icon={row.icon} color={row.color} size={28} className="ops-services__mark" />
                    <div>
                      <strong>{row.name}</strong>
                      <small>
                        {row.paidCount} paid · {Math.round((row.revenueCents / categoryTotal) * 100)}%
                      </small>
                      <i aria-hidden>
                        <span
                          style={{
                            width: `${Math.max(6, Math.round((row.revenueCents / maxCategory) * 100))}%`,
                            background: row.color,
                          }}
                        />
                      </i>
                    </div>
                    <em>{money(row.revenueCents, currency)}</em>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="ops-analytics__empty-copy">No settled category revenue yet.</p>
          )}
        </section>

        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <Server size={14} />
            </span>
            <div>
              <h2>Fleet mix</h2>
              <p>{data?.services.total ?? 0} services across statuses.</p>
            </div>
          </header>
          <MixBar
            segments={[
              { key: 'active', label: 'Active', value: data?.services.active ?? 0, tone: 'is-ok' },
              {
                key: 'pending',
                label: 'Pending',
                value: data?.services.pending_payment ?? 0,
                tone: 'is-warn',
              },
              {
                key: 'suspended',
                label: 'Suspended',
                value: data?.services.suspended ?? 0,
                tone: 'is-bad',
              },
              {
                key: 'cancelled',
                label: 'Cancelled',
                value: data?.services.cancelled ?? 0,
                tone: 'is-mute',
              },
            ]}
          />
          <div className="ops-analytics__mini-links">
            <Link to="/admin/services">Open fleet</Link>
            <span>{kpis?.renewalsDueSoon ?? 0} renewals ≤7d</span>
          </div>
        </section>

        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <LifeBuoy size={14} />
            </span>
            <div>
              <h2>Support load</h2>
              <p>Ticket volume by status.</p>
            </div>
          </header>
          <MixBar
            segments={[
              { key: 'open', label: 'Open', value: data?.tickets.open ?? 0, tone: 'is-warn' },
              {
                key: 'awaiting',
                label: 'Awaiting',
                value: data?.tickets.awaiting ?? 0,
                tone: 'is-info',
              },
              {
                key: 'answered',
                label: 'Answered',
                value: data?.tickets.answered ?? 0,
                tone: 'is-ok',
              },
              {
                key: 'closed',
                label: 'Closed',
                value: data?.tickets.closed ?? 0,
                tone: 'is-mute',
              },
            ]}
          />
          <div className="ops-analytics__mini-links">
            <Link to="/admin/tickets">Open inbox</Link>
            <span>
              {(data?.tickets.open ?? 0) + (data?.tickets.awaiting ?? 0)} needing staff
            </span>
          </div>
        </section>
      </div>

      <div className="ops-analytics__grid">
        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <Package size={14} />
            </span>
            <div>
              <h2>Top products</h2>
              <p>Highest settled revenue · 12 months.</p>
            </div>
          </header>
          <div className="ops-analytics__rank">
            {(data?.topProducts ?? []).map((row, index) => (
              <div key={row.id} className="ops-analytics__rank-row">
                <em>{index + 1}</em>
                <CategoryMark icon={row.icon} color={row.color} size={28} className="ops-services__mark" />
                <div>
                  <strong>{row.name}</strong>
                  <small>
                    {row.categoryName} · {row.paidCount} paid
                  </small>
                  <i aria-hidden>
                    <span
                      style={{
                        width: `${Math.max(6, Math.round((row.revenueCents / maxProduct) * 100))}%`,
                        background: row.color,
                      }}
                    />
                  </i>
                </div>
                <b>{money(row.revenueCents, currency)}</b>
              </div>
            ))}
            {!data?.topProducts.length ? (
              <p className="ops-analytics__empty-copy">No product revenue yet.</p>
            ) : null}
          </div>
          <div className="ops-analytics__mini-links">
            <Link to="/admin/products">Catalog</Link>
          </div>
        </section>

        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon is-danger" aria-hidden>
              <AlertTriangle size={14} />
            </span>
            <div>
              <h2>Overdue queue</h2>
              <p>Oldest unpaid invoices past due.</p>
            </div>
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
              <p className="ops-analytics__empty-copy">No overdue invoices. Nice.</p>
            ) : null}
          </div>
          <div className="ops-analytics__mini-links">
            <Link to="/admin/invoices">Invoice ledger</Link>
            <span>{kpis?.overdueCount ?? 0} overdue total</span>
          </div>
        </section>
      </div>

      <div className="ops-analytics__grid">
        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <TicketPercent size={14} />
            </span>
            <div>
              <h2>Promotions</h2>
              <p>Coupon activity in the last 30 days.</p>
            </div>
          </header>
          <div className="ops-analytics__facts">
            <div>
              <span>Active codes</span>
              <strong>{data?.coupons.active ?? 0}</strong>
            </div>
            <div>
              <span>Redemptions</span>
              <strong>{data?.coupons.redemptions30d ?? 0}</strong>
            </div>
            <div>
              <span>Discounts given</span>
              <strong>{money(data?.coupons.discountCents30d ?? 0, currency)}</strong>
            </div>
            <div>
              <span>Credit issued</span>
              <strong>{money(data?.coupons.creditCents30d ?? 0, currency)}</strong>
            </div>
          </div>
          <div className="ops-analytics__mini-links">
            <Link to="/admin/coupons">Manage coupons</Link>
          </div>
        </section>

        <section className="ops-user__panel ops-analytics__panel">
          <header>
            <span className="ops-user__panel-icon" aria-hidden>
              <Wallet size={14} />
            </span>
            <div>
              <h2>Money parked</h2>
              <p>Credits outstanding vs open receivables.</p>
            </div>
          </header>
          <div className="ops-analytics__facts">
            <div>
              <span>Client credits</span>
              <strong>{money(kpis?.creditOutstandingCents ?? 0, currency)}</strong>
            </div>
            <div>
              <span>Holders</span>
              <strong>{kpis?.creditHolders ?? 0}</strong>
            </div>
            <div>
              <span>Avg / holder</span>
              <strong>
                {money(
                  (kpis?.creditHolders ?? 0) > 0
                    ? Math.round((kpis?.creditOutstandingCents ?? 0) / (kpis?.creditHolders ?? 1))
                    : 0,
                  currency,
                )}
              </strong>
            </div>
            <div>
              <span>Cancelled value</span>
              <strong>{money(kpis?.cancelledCents ?? 0, currency)}</strong>
            </div>
          </div>
          <div className="ops-analytics__mini-links">
            <Link to="/admin/users">Clients</Link>
            <Link to="/admin/logs">Logs</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
