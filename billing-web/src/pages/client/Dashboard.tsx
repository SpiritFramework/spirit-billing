import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CirclePoundSterling,
  Clock3,
  CreditCard,
  Cpu,
  Gamepad2,
  Gift,
  HardDrive,
  MemoryStick,
  Receipt,
  Server,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { api, ApiError, money, safeExternalHref, statusBadge } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { CategoryMark } from '../../lib/icons';

type DashboardData = {
  totalServices: number;
  activeServices: number;
  pendingServices: number;
  unpaidInvoices: number;
  unpaidBalanceCents: number;
  paidInvoices: number;
  creditBalanceCents: number;
  memberSince: string;
  panelLinked: boolean;
  panelStatus?: 'linked' | 'missing' | 'unreachable';
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    currency: string;
    dueAt: string;
    createdAt: string;
    service: { name: string } | null;
  }>;
  recentServices: Array<{
    id: string;
    name: string;
    status: string;
    nextDueAt: string | null;
    panelServerId: string | null;
    panelEggName?: string | null;
    memoryMb: number | null;
    diskMb: number | null;
    cpuPercent: number | null;
    priceCents: number | null;
    currency: string | null;
    cycle: string | null;
    product: {
      name: string;
      cycle: string;
      priceCents: number;
      currency: string;
      memoryMb: number;
      diskMb: number;
      cpuPercent: number;
      category?: {
        id: string;
        name: string;
        color: string;
        icon: string;
        logoUrl?: string | null;
      } | null;
    };
  }>;
};

function formatRam(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${mb} MB`;
}

function formatDisk(mb: number) {
  if (mb <= 0) return 'Unlimited';
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${mb} MB`;
}

function planLabel(service: DashboardData['recentServices'][number]) {
  if (service.product.name === 'Custom' && service.panelEggName) {
    return `Custom · ${service.panelEggName}`;
  }
  return service.product.name;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const { user, panelWebUrl, refresh } = useAuth();
  const { companyName } = useBranding();
  const panelHref = safeExternalHref(panelWebUrl);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [redeemErr, setRedeemErr] = useState('');

  async function load() {
    try {
      setData(await api<DashboardData>('/client/dashboard'));
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load your dashboard');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function redeemCoupon(e: FormEvent) {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setRedeemBusy(true);
    setRedeemErr('');
    setRedeemMsg('');
    try {
      const result = await api<{ creditBonusCents: number; creditBalanceCents: number; code: string }>(
        '/client/coupons/redeem',
        {
          method: 'POST',
          body: JSON.stringify({ code: couponCode.trim() }),
        },
      );
      setCouponCode('');
      setRedeemMsg(`${money(result.creditBonusCents, 'GBP')} was added to your balance.`);
      await refresh();
      await load();
    } catch (err) {
      setRedeemErr(err instanceof ApiError ? err.message : 'Could not redeem coupon');
    } finally {
      setRedeemBusy(false);
    }
  }

  const firstName = user?.firstName || user?.username || 'there';
  const creditBalance = data?.creditBalanceCents ?? user?.creditBalanceCents ?? 0;

  return (
    <div className="dashboard-v2">
      {loadError && <div className="ds-alert ds-alert--error">{loadError}</div>}

      <section className="dashboard-hero">
        <div className="dashboard-hero__glow" />
        <div className="dashboard-hero__content">
          <span className="dashboard-hero__kicker">
            <Sparkles size={14} /> Client dashboard
          </span>
          <h1>{greeting()}, {firstName}.</h1>
          <p>
            Everything you need to run your {companyName} services, payments, and account from one place.
          </p>
          <div className="dashboard-hero__actions">
            <Link className="ds-btn ds-btn--primary" to="/game-hosting">
              <Gamepad2 size={16} /> Explore game hosting
            </Link>
            {panelHref && (data?.activeServices ?? 0) > 0 && (
              <a className="ds-btn ds-btn--ghost" href={panelHref} target="_blank" rel="noopener noreferrer">
                Open game panel <ArrowUpRight size={15} />
              </a>
            )}
          </div>
        </div>
        <div className="dashboard-hero__account">
          <span>Account status</span>
          <strong className={data && data.panelLinked !== true ? 'is-warning' : ''}>
            {data == null ? <CheckCircle2 size={16} /> : data.panelLinked === true ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            {data == null ? 'Checking…' : data.panelLinked === true ? 'All systems ready' : 'Action required'}
          </strong>
          <small>
            {data == null
              ? 'Checking panel connection'
              : data.panelLinked === true
                ? 'Billing and panel connected'
                : data.panelStatus === 'unreachable'
                  ? 'Spirit-Panel is unreachable'
                  : 'Panel link needs attention'}
          </small>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Account overview">
        <Link to="/services" className="dashboard-metric">
          <span className="dashboard-metric__icon is-purple"><Server size={19} /></span>
          <span className="dashboard-metric__copy">
            <small>Active services</small>
            <strong>{data?.activeServices ?? '—'}</strong>
            <em>{data?.totalServices ?? 0} total service{data?.totalServices === 1 ? '' : 's'}</em>
          </span>
          <ArrowUpRight size={15} className="dashboard-metric__arrow" />
        </Link>
        <Link to="/invoices" className="dashboard-metric">
          <span className="dashboard-metric__icon is-amber"><Receipt size={19} /></span>
          <span className="dashboard-metric__copy">
            <small>Amount due</small>
            <strong>{money(data?.unpaidBalanceCents ?? 0, 'GBP')}</strong>
            <em>{data?.unpaidInvoices ?? 0} unpaid invoice{data?.unpaidInvoices === 1 ? '' : 's'}</em>
          </span>
          <ArrowUpRight size={15} className="dashboard-metric__arrow" />
        </Link>
        <div className="dashboard-metric">
          <span className="dashboard-metric__icon is-green"><WalletCards size={19} /></span>
          <span className="dashboard-metric__copy">
            <small>Available credit</small>
            <strong>{money(creditBalance, 'GBP')}</strong>
            <em>Applied automatically at checkout</em>
          </span>
        </div>
        <div className="dashboard-metric">
          <span className="dashboard-metric__icon is-blue"><CheckCircle2 size={19} /></span>
          <span className="dashboard-metric__copy">
            <small>Paid invoices</small>
            <strong>{data?.paidInvoices ?? '—'}</strong>
            <em>{data?.pendingServices ?? 0} awaiting payment</em>
          </span>
        </div>
      </section>

      <div className="dashboard-content-grid">
        <section className="dashboard-panel dashboard-services">
          <div className="dashboard-panel__header">
            <div>
              <span className="dashboard-panel__eyebrow">Infrastructure</span>
              <h2>Your services</h2>
            </div>
            <Link to="/services">View all <ArrowRight size={14} /></Link>
          </div>

          {data && data.totalServices > 0 && (
            <div className="dashboard-services__stats" aria-label="Service summary">
              <span><i className="is-live" /> {data.activeServices} active</span>
              {data.pendingServices > 0 && <span><i className="is-pending" /> {data.pendingServices} pending</span>}
              <span>{data.totalServices} total</span>
            </div>
          )}

          <div className="dashboard-service-list">
            {(data?.recentServices ?? []).map((service) => {
              const category = service.product.category;
              const memory = service.memoryMb ?? service.product.memoryMb;
              const disk = service.diskMb ?? service.product.diskMb;
              const cpu = service.cpuPercent ?? service.product.cpuPercent;
              const cycle = service.cycle ?? service.product.cycle;
              const price = service.priceCents ?? service.product.priceCents;
              const currency = service.currency ?? service.product.currency;
              const accent = category?.color || 'var(--accent)';
              return (
                <Link
                  key={service.id}
                  to={`/services/${service.id}`}
                  className={`dashboard-service is-${service.status}`}
                  style={{ ['--service-color' as string]: accent }}
                >
                  <span className="dashboard-service__accent" />
                  <CategoryMark
                    icon={category?.icon}
                    logoUrl={category?.logoUrl}
                    color={category?.color}
                    size={44}
                    className="dashboard-service__mark"
                  />
                  <span className="dashboard-service__main">
                    <small>{category?.name || service.panelEggName || 'Hosting'}</small>
                    <strong>{service.name}</strong>
                    <em>{planLabel(service)}</em>
                  </span>
                  <span className="dashboard-service__specs" aria-label="Resources">
                    <span><MemoryStick size={12} /> {formatRam(memory)}</span>
                    <span><Cpu size={12} /> {cpu <= 0 ? 'Unlimited' : `${cpu}%`}</span>
                    <span><HardDrive size={12} /> {formatDisk(disk)}</span>
                  </span>
                  <span className="dashboard-service__meta">
                    <span className={statusBadge(service.status)}>{service.status.replaceAll('_', ' ')}</span>
                    <small>
                      {service.nextDueAt
                        ? `Renews ${new Date(service.nextDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                        : price > 0
                          ? `${money(price, currency)} / ${cycle}`
                          : cycle}
                    </small>
                    <small className={service.panelServerId ? 'is-linked' : 'is-unlinked'}>
                      <ShieldCheck size={11} />
                      {service.panelServerId ? 'Panel linked' : 'Not provisioned'}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              );
            })}
            {data && !data.recentServices.length && (
              <div className="dashboard-empty">
                <span><Server size={24} /></span>
                <div>
                  <strong>No hosting services yet</strong>
                  <p>Choose a game and launch your first server in a few clicks.</p>
                </div>
                <Link className="ds-btn ds-btn--primary ds-btn--sm" to="/game-hosting">
                  Browse plans
                </Link>
              </div>
            )}
            {!data && <div className="dashboard-loading">Loading your services…</div>}
          </div>
        </section>

        <aside className="dashboard-side-stack">
          <section className="dashboard-credit-card">
            <div className="dashboard-credit-card__top">
              <span><CirclePoundSterling size={18} /> Account credit</span>
              <Gift size={18} />
            </div>
            <strong>{money(creditBalance, 'GBP')}</strong>
            <small>Available to spend</small>
            <form onSubmit={(e) => void redeemCoupon(e)}>
              <label htmlFor="dashboard-coupon">Have a credit code?</label>
              <div>
                <input
                  id="dashboard-coupon"
                  value={couponCode}
                  placeholder="ENTER CODE"
                  maxLength={64}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
                <button type="submit" disabled={redeemBusy || !couponCode.trim()}>
                  {redeemBusy ? '…' : 'Redeem'}
                </button>
              </div>
            </form>
            {redeemMsg && <p className="dashboard-credit-card__success">{redeemMsg}</p>}
            {redeemErr && <p className="dashboard-credit-card__error">{redeemErr}</p>}
          </section>

          <section className="dashboard-panel dashboard-account">
            <div className="dashboard-panel__header">
              <div>
                <span className="dashboard-panel__eyebrow">Account</span>
                <h2>At a glance</h2>
              </div>
            </div>
            <div className="dashboard-account__row">
              <span><CalendarDays size={15} /> Member since</span>
              <strong>
                {data?.memberSince
                  ? new Date(data.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                  : '—'}
              </strong>
            </div>
            <div className="dashboard-account__row">
              <span><Server size={15} /> Panel link</span>
              <strong className={data?.panelLinked === true ? 'is-good' : 'is-warning'}>
                {data == null ? 'Checking…' : data.panelLinked === true ? 'Connected' : data.panelStatus === 'unreachable' ? 'Unreachable' : 'Needs attention'}
              </strong>
            </div>
            <Link to="/profile" className="dashboard-account__link">
              Manage account <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>

      <section className="dashboard-panel dashboard-invoices">
        <div className="dashboard-panel__header">
          <div>
            <span className="dashboard-panel__eyebrow">Billing activity</span>
            <h2>Recent invoices</h2>
          </div>
          <Link to="/invoices">View all <ArrowRight size={14} /></Link>
        </div>
        <div className="dashboard-invoice-list">
          {(data?.recentInvoices ?? []).map((invoice) => (
            <Link key={invoice.id} to={`/invoices/${invoice.id}`} className="dashboard-invoice">
              <span className="dashboard-invoice__icon"><CreditCard size={17} /></span>
              <span className="dashboard-invoice__name">
                <strong>{invoice.number}</strong>
                <small>{invoice.service?.name || 'Hosting invoice'}</small>
              </span>
              <span className="dashboard-invoice__date">
                <Clock3 size={13} />
                {new Date(invoice.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className={statusBadge(invoice.status)}>{invoice.status}</span>
              <strong className="dashboard-invoice__amount">{money(invoice.totalCents, invoice.currency)}</strong>
              <ArrowRight size={15} />
            </Link>
          ))}
          {data && !data.recentInvoices.length && (
            <div className="dashboard-empty dashboard-empty--invoice">
              <span><Receipt size={24} /></span>
              <div>
                <strong>No billing activity</strong>
                <p>Your invoices and payment history will appear here.</p>
              </div>
            </div>
          )}
          {!data && <div className="dashboard-loading">Loading billing activity…</div>}
        </div>
      </section>
    </div>
  );
}
